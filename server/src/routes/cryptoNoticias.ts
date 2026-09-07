import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  CRYPTO_NOTICIAS_FEEDS,
  CRYPTO_TOPIC_LABELS,
  harvestCryptoNoticiasDrafts,
  type CryptoNoticiaTopic,
  type HarvestFeed,
} from "../lib/cryptoNoticiasBot.js";
import {
  mapPool,
  translateNewsText,
  type NewsTranslateLang,
} from "../lib/cryptoNoticiasTranslate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const cryptoNoticiasRouter = Router();

let schemaEnsured = false;
let ingestInFlight: Promise<{ inserted: number; scanned: number; feedErrors: number }> | null = null;
let lastIngestAtMs = 0;

const MIN_AUTO_INGEST_MS = 15 * 60 * 1000;
const TOPIC_SET = new Set<string>(Object.keys(CRYPTO_TOPIC_LABELS));

type NewsLang = "en" | NewsTranslateLang;

type NewsRowMapped = {
  id: number;
  title: string;
  summary: string;
  titleEs: string;
  titlePt: string;
  summaryEs: string;
  summaryPt: string;
  url: string;
  sourceName: string;
  topics: CryptoNoticiaTopic[];
  publishedAt: string;
  fetchedAt: string;
};

async function ensureCryptoNoticiasSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL,
          source_name TEXT NOT NULL DEFAULT '',
          topics_json TEXT NOT NULL DEFAULT '[]',
          published_at TIMESTAMPTZ NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          title_es TEXT,
          title_pt TEXT,
          summary_es TEXT,
          summary_pt TEXT,
          UNIQUE (url)
        )`
      )
      .run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS title_es TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS title_pt TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS summary_es TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS summary_pt TEXT").run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL UNIQUE,
          source_name TEXT NOT NULL DEFAULT '',
          topics_json TEXT NOT NULL DEFAULT '[]',
          published_at TEXT NOT NULL,
          fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
          title_es TEXT,
          title_pt TEXT,
          summary_es TEXT,
          summary_pt TEXT
        )`
      )
      .run();
    for (const col of ["title_es", "title_pt", "summary_es", "summary_pt"] as const) {
      try {
        await db.prepare(`ALTER TABLE sgi_crypto_noticias ADD COLUMN ${col} TEXT`).run();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate column/i.test(msg)) throw e;
      }
    }
  }
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_published ON sgi_crypto_noticias(published_at DESC)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_fetched ON sgi_crypto_noticias(fetched_at DESC)")
    .run();
  await ensureMediosSchema();
  schemaEnsured = true;
}

async function ensureMediosSchema(): Promise<void> {
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_medios (
          id BIGSERIAL PRIMARY KEY,
          feed_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          topics_json TEXT NOT NULL DEFAULT '["cripto"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_medios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          topics_json TEXT NOT NULL DEFAULT '["cripto"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_medios_enabled ON sgi_crypto_noticias_medios(enabled, id)")
    .run();

  for (const feed of CRYPTO_NOTICIAS_FEEDS) {
    const exists = (await db
      .prepare("SELECT id FROM sgi_crypto_noticias_medios WHERE feed_key = ?")
      .get(feed.id)) as { id?: number } | undefined;
    if (exists?.id) {
      // Mantener enabled/name del admin; sincronizar URL/temas del catálogo del bot.
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias_medios
           SET url = ?, topics_json = ?, is_builtin = 1,
               updated_at = ${db.isPostgres ? "NOW()" : "datetime('now')"}
           WHERE feed_key = ? AND is_builtin = 1`
        )
        .run(feed.url, JSON.stringify(feed.topics), feed.id);
      continue;
    }
    await db
      .prepare(
        `INSERT INTO sgi_crypto_noticias_medios (feed_key, name, url, topics_json, enabled, is_builtin)
         VALUES (?, ?, ?, ?, 1, 1)`
      )
      .run(feed.id, feed.name, feed.url, JSON.stringify(feed.topics));
  }
}

type MedioMapped = {
  id: number;
  feedKey: string;
  name: string;
  url: string;
  topics: CryptoNoticiaTopic[];
  enabled: boolean;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapMedio(raw: Record<string, unknown>): MedioMapped {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    feedKey: String(r.feed_key ?? ""),
    name: String(r.name ?? ""),
    url: String(r.url ?? ""),
    topics: parseTopics(r.topics_json),
    enabled: Number(r.enabled ?? 0) === 1,
    isBuiltin: Number(r.is_builtin ?? 0) === 1,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

async function listMedios(): Promise<MedioMapped[]> {
  const rows = (await db
    .prepare(
      `SELECT id, feed_key, name, url, topics_json, enabled, is_builtin, created_at, updated_at
       FROM sgi_crypto_noticias_medios
       ORDER BY is_builtin DESC, name ASC, id ASC`
    )
    .all()) as Record<string, unknown>[];
  return rows.map((r) => mapMedio(r));
}

async function loadEnabledHarvestFeeds(): Promise<HarvestFeed[]> {
  await ensureCryptoNoticiasSchema();
  const rows = (await db
    .prepare(
      `SELECT feed_key, url, topics_json
       FROM sgi_crypto_noticias_medios
       WHERE enabled = 1
       ORDER BY id ASC`
    )
    .all()) as Record<string, unknown>[];
  const feeds = rows
    .map((raw) => {
      const r = rowKeysToLowercase(raw);
      return {
        id: String(r.feed_key ?? "").trim(),
        url: String(r.url ?? "").trim(),
        topics: parseTopics(r.topics_json),
      } satisfies HarvestFeed;
    })
    .filter((f) => f.id && f.url);
  // Si el admin rechazó todos, no capturar (no caer al catálogo completo).
  return feeds;
}

function parseTopics(raw: unknown): CryptoNoticiaTopic[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x))
      .filter((x): x is CryptoNoticiaTopic => TOPIC_SET.has(x));
  } catch {
    return [];
  }
}

function mapRow(raw: Record<string, unknown>): NewsRowMapped {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    title: String(r.title ?? ""),
    summary: String(r.summary ?? ""),
    titleEs: String(r.title_es ?? "").trim(),
    titlePt: String(r.title_pt ?? "").trim(),
    summaryEs: String(r.summary_es ?? "").trim(),
    summaryPt: String(r.summary_pt ?? "").trim(),
    url: String(r.url ?? ""),
    sourceName: String(r.source_name ?? ""),
    topics: parseTopics(r.topics_json),
    publishedAt: String(r.published_at ?? ""),
    fetchedAt: String(r.fetched_at ?? ""),
  };
}

function parseLang(raw: unknown): NewsLang {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "pt" || v === "pt-br" || v === "por") return "pt";
  if (v === "en" || v === "eng") return "en";
  return "es";
}

function presentItem(row: NewsRowMapped, lang: NewsLang) {
  const title =
    lang === "es" ? row.titleEs || row.title : lang === "pt" ? row.titlePt || row.title : row.title;
  const summary =
    lang === "es"
      ? row.summaryEs || row.summary
      : lang === "pt"
        ? row.summaryPt || row.summary
        : row.summary;
  return {
    id: row.id,
    title,
    summary,
    url: row.url,
    sourceName: row.sourceName,
    topics: row.topics,
    publishedAt: row.publishedAt,
    fetchedAt: row.fetchedAt,
    lang,
    translated: lang === "en" ? false : lang === "es" ? Boolean(row.titleEs) : Boolean(row.titlePt),
  };
}

async function ensureTranslations(rows: NewsRowMapped[], lang: NewsTranslateLang): Promise<NewsRowMapped[]> {
  const missing = rows.filter((r) => {
    if (lang === "es") return !r.titleEs || (Boolean(r.summary) && !r.summaryEs);
    return !r.titlePt || (Boolean(r.summary) && !r.summaryPt);
  });
  if (missing.length === 0) return rows;

  await mapPool(missing, 2, async (row) => {
    const titleT = await translateNewsText(row.title, lang);
    await sleepSoft();
    const summaryT = row.summary ? await translateNewsText(row.summary, lang) : "";
    if (lang === "es") {
      await db
        .prepare("UPDATE sgi_crypto_noticias SET title_es = ?, summary_es = ? WHERE id = ?")
        .run(titleT, summaryT, row.id);
      row.titleEs = titleT;
      row.summaryEs = summaryT;
    } else {
      await db
        .prepare("UPDATE sgi_crypto_noticias SET title_pt = ?, summary_pt = ? WHERE id = ?")
        .run(titleT, summaryT, row.id);
      row.titlePt = titleT;
      row.summaryPt = summaryT;
    }
    return row;
  });

  return rows;
}

function sleepSoft(): Promise<void> {
  return new Promise((r) => setTimeout(r, 90));
}

async function runIngest(): Promise<{ inserted: number; scanned: number; feedErrors: number }> {
  await ensureCryptoNoticiasSchema();
  const feeds = await loadEnabledHarvestFeeds();
  const { drafts, feedErrors } = await harvestCryptoNoticiasDrafts(feeds);
  let inserted = 0;
  for (const d of drafts) {
    try {
      const info = await db
        .prepare(
          `INSERT INTO sgi_crypto_noticias (title, summary, url, source_name, topics_json, published_at, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ${db.isPostgres ? "NOW()" : "datetime('now')"})
           ON CONFLICT (url) DO NOTHING`
        )
        .run(d.title, d.summary, d.url, d.sourceName, JSON.stringify(d.topics), d.publishedAt);
      const changes = Number((info as { changes?: number })?.changes ?? 0);
      if (changes > 0) inserted += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) {
        console.error("[crypto-noticias] insert", msg);
      }
    }
  }
  lastIngestAtMs = Date.now();
  // Precalentar traducciones de las piezas más nuevas (no bloquea la respuesta del refresh).
  void warmRecentTranslations(60).catch((e) =>
    console.error("[crypto-noticias] warm-translate", e instanceof Error ? e.message : e)
  );
  return { inserted, scanned: drafts.length, feedErrors: feedErrors.length };
}

async function warmRecentTranslations(limit: number): Promise<void> {
  await ensureCryptoNoticiasSchema();
  const rows = (await db
    .prepare(
      `SELECT id, title, summary, url, source_name, topics_json, published_at, fetched_at,
              title_es, title_pt, summary_es, summary_pt
       FROM sgi_crypto_noticias
       ORDER BY published_at DESC, id DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(120, limit))) as Record<string, unknown>[];
  const mapped = rows.map((r) => mapRow(r));
  await ensureTranslations(mapped, "es");
  await ensureTranslations(mapped, "pt");
}

function kickIngest(): Promise<{ inserted: number; scanned: number; feedErrors: number }> {
  if (!ingestInFlight) {
    ingestInFlight = runIngest()
      .catch((e) => {
        console.error("[crypto-noticias] ingest", e);
        return { inserted: 0, scanned: 0, feedErrors: 1 };
      })
      .finally(() => {
        ingestInFlight = null;
      });
  }
  return ingestInFlight;
}

async function maybeAutoIngest(): Promise<void> {
  if (Date.now() - lastIngestAtMs < MIN_AUTO_INGEST_MS) return;
  const row = (await db
    .prepare("SELECT fetched_at FROM sgi_crypto_noticias ORDER BY fetched_at DESC LIMIT 1")
    .get()) as { fetched_at?: string } | undefined;
  const last = row?.fetched_at ? Date.parse(String(row.fetched_at)) : 0;
  if (Number.isFinite(last) && Date.now() - last < MIN_AUTO_INGEST_MS) {
    lastIngestAtMs = last;
    return;
  }
  await kickIngest();
}

const readMw = [
  requireAuth,
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("noticias"),
] as const;

const writeMw = [
  requireAuth,
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("noticias"),
] as const;

cryptoNoticiasRouter.get("/crypto-noticias/meta", ...readMw, async (_req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const countRow = (await db.prepare("SELECT COUNT(*) AS c FROM sgi_crypto_noticias").get()) as
      | { c?: number | string }
      | undefined;
    const lastRow = (await db
      .prepare("SELECT fetched_at FROM sgi_crypto_noticias ORDER BY fetched_at DESC LIMIT 1")
      .get()) as { fetched_at?: string } | undefined;
    res.json({
      total: Number(countRow?.c ?? 0),
      lastFetchedAt: lastRow?.fetched_at ? String(lastRow.fetched_at) : null,
      topics: Object.entries(CRYPTO_TOPIC_LABELS).map(([id, label]) => ({ id, label })),
      refreshIntervalMs: MIN_AUTO_INGEST_MS,
    });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.get("/crypto-noticias", ...readMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    void maybeAutoIngest().catch(() => undefined);

    const lang = parseLang(req.query.lang);
    const topic = String(req.query.topic ?? "").trim().toLowerCase();
    const q = String(req.query.q ?? "").trim().toLocaleLowerCase("es");
    const limit = Math.min(120, Math.max(1, Number(req.query.limit ?? 40) || 40));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);

    const rows = (await db
      .prepare(
        `SELECT id, title, summary, url, source_name, topics_json, published_at, fetched_at,
                title_es, title_pt, summary_es, summary_pt
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT 800`
      )
      .all()) as Record<string, unknown>[];

    let items = rows.map((r) => mapRow(r));
    if (topic && TOPIC_SET.has(topic)) {
      items = items.filter((x) => x.topics.includes(topic as CryptoNoticiaTopic));
    }
    if (q) {
      items = items.filter((x) => {
        const hay = `${x.title} ${x.summary} ${x.titleEs} ${x.titlePt} ${x.summaryEs} ${x.summaryPt} ${x.sourceName}`.toLocaleLowerCase(
          "es"
        );
        return hay.includes(q);
      });
    }
    const total = items.length;
    items = items.slice(offset, offset + limit);

    if (lang === "es" || lang === "pt") {
      await ensureTranslations(items, lang);
    }

    res.json({
      items: items.map((r) => presentItem(r, lang)),
      total,
      offset,
      limit,
      lang,
      lastIngestAt: lastIngestAtMs ? new Date(lastIngestAtMs).toISOString() : null,
    });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/refresh", ...writeMw, async (_req, res, next) => {
  try {
    const result = await kickIngest();
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

/** Cron Vercel (GET) / secreto (POST|GET): actualiza el wire sin sesión de usuario. */
async function cronIngestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = String(req.headers.authorization ?? "");
    const cronHeader = String(req.headers["x-vercel-cron"] ?? "");
    const secret = String(process.env.CRON_SECRET ?? "").trim();
    const okBearer = Boolean(secret) && auth === `Bearer ${secret}`;
    const okVercel = cronHeader === "1";
    if (!okBearer && !okVercel) {
      return res.status(401).json({ error: { message: "No autorizado." } });
    }
    const result = await kickIngest();
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
}

cryptoNoticiasRouter.get("/crypto-noticias/cron-ingest", cronIngestHandler);
cryptoNoticiasRouter.post("/crypto-noticias/cron-ingest", cronIngestHandler);

const medioCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  url: z.string().trim().url().max(2000),
  topics: z.array(z.string()).max(12).optional(),
  enabled: z.boolean().optional(),
});

const medioPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  url: z.string().trim().url().max(2000).optional(),
  topics: z.array(z.string()).max(12).optional(),
  enabled: z.boolean().optional(),
});

function normalizeMedioUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

cryptoNoticiasRouter.get("/crypto-noticias/medios", ...readMw, async (_req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const items = await listMedios();
    res.json({
      items,
      topics: Object.entries(CRYPTO_TOPIC_LABELS).map(([id, label]) => ({ id, label })),
    });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/medios", ...writeMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const parsed = medioCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos. Nombre y URL RSS (http/https) son obligatorios." } });
    }
    const url = normalizeMedioUrl(parsed.data.url);
    if (!url) {
      return res.status(400).json({ error: { message: "La URL del medio debe ser http o https." } });
    }
    const topics = parseTopics(parsed.data.topics ?? ["cripto"]);
    const topicsFinal = topics.length > 0 ? topics : (["cripto"] as CryptoNoticiaTopic[]);
    const feedKey = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const enabled = parsed.data.enabled === false ? 0 : 1;
    const info = await db
      .prepare(
        `INSERT INTO sgi_crypto_noticias_medios (feed_key, name, url, topics_json, enabled, is_builtin)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(feedKey, parsed.data.name.trim(), url, JSON.stringify(topicsFinal), enabled);
    const id = Number((info as { lastInsertRowid?: number | bigint })?.lastInsertRowid ?? 0);
    let row: MedioMapped | null = null;
    if (id > 0) {
      const found = (await db
        .prepare(
          `SELECT id, feed_key, name, url, topics_json, enabled, is_builtin, created_at, updated_at
           FROM sgi_crypto_noticias_medios WHERE id = ?`
        )
        .get(id)) as Record<string, unknown> | undefined;
      if (found) row = mapMedio(found);
    }
    if (!row) {
      const found = (await db
        .prepare(
          `SELECT id, feed_key, name, url, topics_json, enabled, is_builtin, created_at, updated_at
           FROM sgi_crypto_noticias_medios WHERE feed_key = ?`
        )
        .get(feedKey)) as Record<string, unknown> | undefined;
      if (found) row = mapMedio(found);
    }
    res.status(201).json({ ok: true, item: row });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.patch("/crypto-noticias/medios/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "ID inválido." } });
    }
    const existing = (await db
      .prepare(
        `SELECT id, feed_key, name, url, topics_json, enabled, is_builtin, created_at, updated_at
         FROM sgi_crypto_noticias_medios WHERE id = ?`
      )
      .get(id)) as Record<string, unknown> | undefined;
    if (!existing) {
      return res.status(404).json({ error: { message: "Medio no encontrado." } });
    }
    const cur = mapMedio(existing);
    const parsed = medioPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    const nextName = parsed.data.name?.trim() || cur.name;
    let nextUrl = cur.url;
    if (parsed.data.url != null) {
      const u = normalizeMedioUrl(parsed.data.url);
      if (!u) {
        return res.status(400).json({ error: { message: "La URL del medio debe ser http o https." } });
      }
      // Built-in: se puede renombrar/aceptar, pero la URL del catálogo se mantiene (salvo custom).
      if (!cur.isBuiltin) nextUrl = u;
    }
    const nextTopics =
      parsed.data.topics != null
        ? (() => {
            const t = parseTopics(parsed.data.topics);
            return t.length > 0 ? t : cur.topics;
          })()
        : cur.topics;
    const nextEnabled = parsed.data.enabled != null ? (parsed.data.enabled ? 1 : 0) : cur.enabled ? 1 : 0;

    await db
      .prepare(
        `UPDATE sgi_crypto_noticias_medios
         SET name = ?, url = ?, topics_json = ?, enabled = ?,
             updated_at = ${db.isPostgres ? "NOW()" : "datetime('now')"}
         WHERE id = ?`
      )
      .run(nextName, nextUrl, JSON.stringify(nextTopics), nextEnabled, id);

    const found = (await db
      .prepare(
        `SELECT id, feed_key, name, url, topics_json, enabled, is_builtin, created_at, updated_at
         FROM sgi_crypto_noticias_medios WHERE id = ?`
      )
      .get(id)) as Record<string, unknown> | undefined;
    res.json({ ok: true, item: found ? mapMedio(found) : null });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.delete("/crypto-noticias/medios/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "ID inválido." } });
    }
    const existing = (await db
      .prepare("SELECT id, is_builtin FROM sgi_crypto_noticias_medios WHERE id = ?")
      .get(id)) as { id?: number; is_builtin?: number } | undefined;
    if (!existing?.id) {
      return res.status(404).json({ error: { message: "Medio no encontrado." } });
    }
    if (Number(existing.is_builtin ?? 0) === 1) {
      return res.status(400).json({
        error: { message: "Los medios del bot no se eliminan: desactiválos si no querés que capturen." },
      });
    }
    await db.prepare("DELETE FROM sgi_crypto_noticias_medios WHERE id = ?").run(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const purgeSchema = z.object({
  olderThanDays: z.coerce.number().int().min(30).max(3650).optional(),
});

cryptoNoticiasRouter.delete("/crypto-noticias/older", ...writeMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const parsed = purgeSchema.safeParse(req.body ?? {});
    const days = parsed.success ? parsed.data.olderThanDays ?? 180 : 180;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const info = await db.prepare("DELETE FROM sgi_crypto_noticias WHERE published_at < ?").run(cutoff);
    res.json({ ok: true, deleted: Number((info as { changes?: number })?.changes ?? 0) });
  } catch (e) {
    next(e);
  }
});
