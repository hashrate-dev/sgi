import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  CRYPTO_NOTICIAS_FEEDS,
  CRYPTO_TOPIC_LABELS,
  fetchOgImage,
  harvestCryptoNoticiasDrafts,
  isAcceptableArticleImage,
  isBlockedNewsSource,
  resolvePublisherUrl,
  type CryptoNoticiaTopic,
  type HarvestFeed,
} from "../lib/cryptoNoticiasBot.js";
import { buildMarketSentimentReport } from "../lib/cryptoNoticiasSentiment.js";
import { fetchLiveCoinQuotes } from "../lib/cryptoNoticiasLivePrices.js";
import {
  mapPool,
  needsNewsTranslation,
  looksLikeEnglish,
  translateNewsText,
  type NewsTranslateLang,
} from "../lib/cryptoNoticiasTranslate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import {
  explainTelegramSendFailure,
  getTelegramBotIdentity,
  getTelegramBotStatus,
  listRecentTelegramPrivateChats,
  normalizeTelegramChatId,
  notifyCryptoWireTelegram,
  notifyCryptoWireTelegramArticleMany,
  notifyCryptoWireTelegramMany,
  wireArticleOpenUrl,
  type CryptoWireNewsItem,
} from "../lib/telegramWire.js";

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
  imageUrl: string;
  topics: CryptoNoticiaTopic[];
  publishedAt: string;
  fetchedAt: string;
  telegramSent?: boolean;
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
          image_url TEXT NOT NULL DEFAULT '',
          UNIQUE (url)
        )`
      )
      .run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS title_es TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS title_pt TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS summary_es TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS summary_pt TEXT").run();
    await db.prepare("ALTER TABLE sgi_crypto_noticias ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''").run();
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
          summary_pt TEXT,
          image_url TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
    for (const col of ["title_es TEXT", "title_pt TEXT", "summary_es TEXT", "summary_pt TEXT", "image_url TEXT NOT NULL DEFAULT ''"] as const) {
      try {
        await db.prepare(`ALTER TABLE sgi_crypto_noticias ADD COLUMN ${col}`).run();
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
  try {
    await ensureTelegramSettingsSchema();
  } catch (e) {
    console.warn("[crypto-noticias] telegram schema", e instanceof Error ? e.message : e);
  }
  await purgeBlockedNewsSources();
  await purgeJunkNewsImages();
  schemaEnsured = true;
}

/** Elimina del historial fuentes bloqueadas (p. ej. Moomoo). */
async function purgeBlockedNewsSources(): Promise<void> {
  try {
    if (db.isPostgres) {
      await db
        .prepare(
          `DELETE FROM sgi_crypto_noticias
           WHERE source_name ILIKE '%moomoo%'
              OR url ILIKE '%moomoo.com%'`
        )
        .run();
    } else {
      await db
        .prepare(
          `DELETE FROM sgi_crypto_noticias
           WHERE LOWER(source_name) LIKE '%moomoo%'
              OR LOWER(url) LIKE '%moomoo.com%'`
        )
        .run();
    }
  } catch (e) {
    console.error("[crypto-noticias] purge-blocked", e instanceof Error ? e.message : e);
  }
}

/**
 * Limpia image_url basura: Google/gstatic/googleusercontent y la misma URL
 * repetida en muchas noticias (placeholders idénticos).
 */
async function purgeJunkNewsImages(): Promise<void> {
  try {
    if (db.isPostgres) {
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias
           SET image_url = ''
           WHERE image_url <> ''
             AND (
               image_url ILIKE '%google.%'
               OR image_url ILIKE '%gstatic.com%'
               OR image_url ILIKE '%googleusercontent.com%'
               OR image_url ILIKE '%ggpht.com%'
               OR image_url ILIKE '%news.google%'
               OR image_url ILIKE '%microlink.io%/screenshot%'
             )`
        )
        .run();
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias n
           SET image_url = ''
           FROM (
             SELECT image_url
             FROM sgi_crypto_noticias
             WHERE image_url <> ''
             GROUP BY image_url
             HAVING COUNT(*) >= 4
           ) d
           WHERE n.image_url = d.image_url`
        )
        .run();
    } else {
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias
           SET image_url = ''
           WHERE image_url <> ''
             AND (
               LOWER(image_url) LIKE '%google.%'
               OR LOWER(image_url) LIKE '%gstatic.com%'
               OR LOWER(image_url) LIKE '%googleusercontent.com%'
               OR LOWER(image_url) LIKE '%ggpht.com%'
               OR LOWER(image_url) LIKE '%news.google%'
               OR LOWER(image_url) LIKE '%microlink.io%/screenshot%'
             )`
        )
        .run();
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias
           SET image_url = ''
           WHERE image_url IN (
             SELECT image_url
             FROM sgi_crypto_noticias
             WHERE image_url <> ''
             GROUP BY image_url
             HAVING COUNT(*) >= 4
           )`
        )
        .run();
    }
  } catch (e) {
    console.error("[crypto-noticias] purge-junk-images", e instanceof Error ? e.message : e);
  }
}

async function ensureTelegramSettingsSchema(): Promise<void> {
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_tg (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          chat_id TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_tg (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          chat_id TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  const row = (await db.prepare("SELECT chat_id FROM sgi_crypto_noticias_tg LIMIT 1").get()) as
    | { chat_id?: string }
    | undefined;
  if (row == null) {
    await db
      .prepare("INSERT INTO sgi_crypto_noticias_tg (id, enabled, chat_id) VALUES (1, 0, '') ON CONFLICT (id) DO NOTHING")
      .run();
  }
  if (db.isPostgres) {
    await db.prepare("ALTER TABLE sgi_crypto_noticias_tg ADD COLUMN IF NOT EXISTS extra_chat_ids TEXT NOT NULL DEFAULT '[]'").run();
  } else {
    try {
      await db.prepare("ALTER TABLE sgi_crypto_noticias_tg ADD COLUMN extra_chat_ids TEXT NOT NULL DEFAULT '[]'").run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(msg)) throw e;
    }
  }
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_tg_sent (
          noticia_id BIGINT PRIMARY KEY,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_tg_sent (
          noticia_id INTEGER PRIMARY KEY,
          sent_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
}

async function loadManualTelegramSentIds(ids: number[]): Promise<Set<number>> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  if (!uniq.length) return new Set();
  try {
    await ensureTelegramSettingsSchema();
    const placeholders = uniq.map(() => "?").join(",");
    const rows = (await db
      .prepare(`SELECT noticia_id FROM sgi_crypto_noticias_tg_sent WHERE noticia_id IN (${placeholders})`)
      .all(...uniq)) as Array<{ noticia_id?: number }>;
    return new Set(rows.map((r) => Number(r.noticia_id)).filter((n) => Number.isFinite(n) && n > 0));
  } catch (e) {
    console.warn("[crypto-noticias] telegram-sent lookup", e instanceof Error ? e.message : e);
    return new Set();
  }
}

async function claimManualTelegramSend(id: number): Promise<boolean> {
  await ensureTelegramSettingsSchema();
  try {
    const info = await db
      .prepare(
        "INSERT INTO sgi_crypto_noticias_tg_sent (noticia_id) VALUES (?) ON CONFLICT (noticia_id) DO NOTHING"
      )
      .run(id);
    return Number((info as { changes?: number })?.changes ?? 0) > 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate|primary key/i.test(msg)) return false;
    throw e;
  }
}

async function unclaimManualTelegramSend(id: number): Promise<void> {
  await ensureTelegramSettingsSchema();
  await db.prepare("DELETE FROM sgi_crypto_noticias_tg_sent WHERE noticia_id = ?").run(id);
}

type WireTgSettings = {
  enabled: boolean;
  chatId: string;
  chatIds: string[];
};

function uniqueTelegramChatIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const id = normalizeTelegramChatId(String(x ?? "")).slice(0, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

function parseExtraChatIds(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) return uniqueTelegramChatIds(j);
  } catch {
    /* comma list */
  }
  return uniqueTelegramChatIds(s.split(/[,\n;]+/));
}

async function loadWireTgSettings(): Promise<WireTgSettings> {
  await ensureTelegramSettingsSchema();
  const row = (await db.prepare("SELECT enabled, chat_id, extra_chat_ids FROM sgi_crypto_noticias_tg WHERE id = 1").get()) as
    | { enabled?: number | boolean; chat_id?: string; extra_chat_ids?: string }
    | undefined;
  const enabled = row?.enabled === true || Number(row?.enabled) === 1;
  const fromDb = uniqueTelegramChatIds([row?.chat_id, ...parseExtraChatIds(row?.extra_chat_ids)]);
  const fallback = uniqueTelegramChatIds([process.env.TELEGRAM_CHAT_ID]);
  const chatIds = fromDb.length ? fromDb : fallback;
  return { enabled, chatId: chatIds[0] || "", chatIds };
}

async function saveWireTgSettings(next: { enabled: boolean; chatId?: string; chatIds?: string[] }): Promise<WireTgSettings> {
  await ensureTelegramSettingsSchema();
  const current = await loadWireTgSettings();
  const chatIds =
    next.chatIds != null
      ? uniqueTelegramChatIds([...(next.chatIds ?? []), next.chatId ?? ""])
      : uniqueTelegramChatIds([next.chatId ?? current.chatId, ...current.chatIds]);
  const primary = chatIds[0] || "";
  const extra = JSON.stringify(chatIds.slice(1));
  await db
    .prepare(
      `UPDATE sgi_crypto_noticias_tg
       SET enabled = ?, chat_id = ?, extra_chat_ids = ?,
           updated_at = ${db.isPostgres ? "NOW()" : "datetime('now')"}
       WHERE id = 1`
    )
    .run(next.enabled ? 1 : 0, primary, extra);
  return loadWireTgSettings();
}

async function maybeNotifyWireTelegram(items: CryptoWireNewsItem[]): Promise<void> {
  if (!items.length) return;
  try {
    const settings = await loadWireTgSettings();
    if (!settings.enabled) return;
    if (!settings.chatIds.length) {
      console.warn("[crypto-noticias] Telegram wire activo pero sin chat_id");
      return;
    }
    const result = await notifyCryptoWireTelegramMany(settings.chatIds, items);
    if (result.sent === 0) {
      console.warn(`[crypto-noticias] Telegram wire omitido: ${result.lastError || "unknown"}`);
    }
  } catch (e) {
    console.error("[crypto-noticias] Telegram wire", e instanceof Error ? e.message : e);
  }
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
    imageUrl: (() => {
      const img = String(r.image_url ?? "").trim();
      return img && isAcceptableArticleImage(img) ? img : "";
    })(),
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
  if (lang === "es") {
    const titleOut =
      row.titleEs && !looksLikeEnglish(row.titleEs) ? row.titleEs : row.titleEs || row.title;
    const summaryOut =
      row.summaryEs && !looksLikeEnglish(row.summaryEs)
        ? row.summaryEs
        : row.summaryEs || row.summary;
    const okTitle = Boolean(row.titleEs) && !looksLikeEnglish(row.titleEs);
    return {
      id: row.id,
      title: okTitle ? row.titleEs : titleOut,
      summary: row.summaryEs && !looksLikeEnglish(row.summaryEs) ? row.summaryEs : summaryOut,
      url: row.url,
      sourceName: row.sourceName,
      imageUrl: row.imageUrl,
      topics: row.topics,
      publishedAt: row.publishedAt,
      fetchedAt: row.fetchedAt,
      lang,
      translated: okTitle,
      telegramSent: Boolean(row.telegramSent),
    };
  }
  const title = lang === "pt" ? row.titlePt || row.title : row.title;
  const summary = lang === "pt" ? row.summaryPt || row.summary : row.summary;
  return {
    id: row.id,
    title,
    summary,
    url: row.url,
    sourceName: row.sourceName,
    imageUrl: row.imageUrl,
    topics: row.topics,
    publishedAt: row.publishedAt,
    fetchedAt: row.fetchedAt,
    lang,
    translated: lang === "en" ? false : Boolean(row.titlePt),
    telegramSent: Boolean(row.telegramSent),
  };
}

async function ensureTranslations(
  rows: NewsRowMapped[],
  lang: NewsTranslateLang,
  opts?: { deadlineMs?: number; maxItems?: number; concurrency?: number }
): Promise<NewsRowMapped[]> {
  const missing = rows.filter((r) => {
    if (lang === "es") {
      return (
        needsNewsTranslation(r.title, r.titleEs, "es") ||
        (Boolean(r.summary) && needsNewsTranslation(r.summary, r.summaryEs, "es"))
      );
    }
    return (
      needsNewsTranslation(r.title, r.titlePt, "pt") ||
      (Boolean(r.summary) && needsNewsTranslation(r.summary, r.summaryPt, "pt"))
    );
  });
  if (missing.length === 0) return rows;

  const deadlineMs = opts?.deadlineMs ?? (lang === "es" ? 14_000 : 8_000);
  const maxItems = opts?.maxItems ?? (lang === "es" ? Math.min(rows.length, 36) : 12);
  const concurrency = opts?.concurrency ?? (lang === "es" ? 4 : 2);
  const deadline = Date.now() + deadlineMs;
  const budget = missing.slice(0, maxItems);
  await mapPool(budget, concurrency, async (row) => {
    if (Date.now() > deadline) return row;
    const needTitle =
      lang === "es"
        ? needsNewsTranslation(row.title, row.titleEs, "es")
        : needsNewsTranslation(row.title, row.titlePt, "pt");
    const needSummary =
      lang === "es"
        ? Boolean(row.summary) && needsNewsTranslation(row.summary, row.summaryEs, "es")
        : Boolean(row.summary) && needsNewsTranslation(row.summary, row.summaryPt, "pt");

    const titleT = needTitle ? await translateNewsText(row.title, lang) : lang === "es" ? row.titleEs : row.titlePt;
    if (Date.now() < deadline) await sleepSoft();
    const summaryT =
      needSummary && Date.now() < deadline
        ? await translateNewsText(row.summary, lang)
        : lang === "es"
          ? row.summaryEs
          : row.summaryPt;

    if (lang === "es") {
      const finalTitle =
        titleT && !looksLikeEnglish(titleT)
          ? titleT
          : row.titleEs && !looksLikeEnglish(row.titleEs)
            ? row.titleEs
            : "";
      const finalSummary =
        summaryT && !looksLikeEnglish(summaryT)
          ? summaryT
          : row.summaryEs && !looksLikeEnglish(row.summaryEs)
            ? row.summaryEs
            : "";
      if (finalTitle) {
        await db
          .prepare(
            "UPDATE sgi_crypto_noticias SET title_es = ?, summary_es = COALESCE(NULLIF(?, ''), summary_es) WHERE id = ?"
          )
          .run(finalTitle, finalSummary || "", row.id);
        row.titleEs = finalTitle;
        if (finalSummary) row.summaryEs = finalSummary;
      } else if (finalSummary) {
        await db
          .prepare("UPDATE sgi_crypto_noticias SET summary_es = ? WHERE id = ?")
          .run(finalSummary, row.id);
        row.summaryEs = finalSummary;
      }
    } else if (titleT) {
      await db
        .prepare("UPDATE sgi_crypto_noticias SET title_pt = ?, summary_pt = COALESCE(NULLIF(?, ''), summary_pt) WHERE id = ?")
        .run(titleT, summaryT || "", row.id);
      row.titlePt = titleT;
      if (summaryT) row.summaryPt = summaryT;
    }
    return row;
  });

  return rows;
}

function sleepSoft(): Promise<void> {
  return new Promise((r) => setTimeout(r, 90));
}

let imageBackfillRunning = false;

/** Completa image_url con la imagen principal del artículo (og:image) para la página visible. */
async function ensureImagesForRows(rows: NewsRowMapped[]): Promise<NewsRowMapped[]> {
  const missing = rows.filter((r) => !r.imageUrl && r.url);
  if (missing.length === 0) return rows;

  // Más presupuesto: casi todas las tarjetas visibles deberían salir con foto.
  const deadline = Date.now() + 11_000;
  const budget = missing.slice(0, 36);
  await mapPool(budget, 5, async (row) => {
    if (Date.now() > deadline) return row;
    const img = await fetchOgImage(row.url);
    if (!img || !isAcceptableArticleImage(img)) return row;
    try {
      await db
        .prepare(
          `UPDATE sgi_crypto_noticias
           SET image_url = ?
           WHERE id = ?`
        )
        .run(img, row.id);
      row.imageUrl = img;
    } catch (e) {
      console.error("[crypto-noticias] image-save", e instanceof Error ? e.message : e);
    }
    return row;
  });
  return rows;
}

async function backfillRecentImages(limit = 40): Promise<void> {
  if (imageBackfillRunning) return;
  imageBackfillRunning = true;
  try {
    await ensureCryptoNoticiasSchema();
    const rows = (await db
      .prepare(
        `SELECT id, title, summary, url, source_name, topics_json, published_at, fetched_at,
                title_es, title_pt, summary_es, summary_pt, image_url
         FROM sgi_crypto_noticias
         WHERE image_url IS NULL OR image_url = ''
         ORDER BY published_at DESC, id DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(60, limit)))) as Record<string, unknown>[];
    await ensureImagesForRows(rows.map((r) => mapRow(r)));
  } finally {
    imageBackfillRunning = false;
  }
}

async function runIngest(): Promise<{ inserted: number; scanned: number; feedErrors: number }> {
  await ensureCryptoNoticiasSchema();
  const feeds = await loadEnabledHarvestFeeds();
  // Refresh rápido: RSS + insert. Imágenes en segundo plano.
  const { drafts, feedErrors } = await harvestCryptoNoticiasDrafts(feeds, {
    enrichImages: false,
  });
  let inserted = 0;
  const insertedForWa: CryptoWireNewsItem[] = [];
  for (const d of drafts) {
    if (isBlockedNewsSource(d.sourceName, d.url)) continue;
    try {
      const info = await db
        .prepare(
          `INSERT INTO sgi_crypto_noticias (title, summary, url, source_name, topics_json, published_at, fetched_at, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ${db.isPostgres ? "NOW()" : "datetime('now')"}, ?)
           ON CONFLICT (url) DO NOTHING`
        )
        .run(d.title, d.summary, d.url, d.sourceName, JSON.stringify(d.topics), d.publishedAt, d.imageUrl || "");
      const changes = Number((info as { changes?: number })?.changes ?? 0);
      if (changes > 0) {
        inserted += 1;
        insertedForWa.push({
          title: d.title,
          sourceName: d.sourceName,
          ...wireArticleOpenUrl(d.url, d.title, d.summary),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) {
        console.error("[crypto-noticias] insert", msg);
      }
    }
  }
  lastIngestAtMs = Date.now();

  void purgeBlockedNewsSources().catch(() => undefined);
  void purgeJunkNewsImages().catch(() => undefined);

  // Rellena imágenes de lo más reciente sin foto (incluye históricas sin image_url).
  void backfillRecentImages(40).catch((e) =>
    console.error("[crypto-noticias] image-backfill", e instanceof Error ? e.message : e)
  );

  void warmRecentTranslations(24).catch((e) =>
    console.error("[crypto-noticias] warm-translate", e instanceof Error ? e.message : e)
  );

  if (insertedForWa.length > 0) {
    void maybeNotifyWireTelegram(insertedForWa);
  }

  return { inserted, scanned: drafts.length, feedErrors: feedErrors.length };
}

let translateWarmRunning = false;

async function warmRecentTranslations(limit: number, langs: NewsTranslateLang[] = ["es", "pt"]): Promise<void> {
  if (translateWarmRunning) return;
  translateWarmRunning = true;
  try {
    await ensureCryptoNoticiasSchema();
    const rows = (await db
      .prepare(
        `SELECT id, title, summary, url, source_name, topics_json, published_at, fetched_at,
                title_es, title_pt, summary_es, summary_pt, image_url
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(120, limit)))) as Record<string, unknown>[];
    const mapped = rows.map((r) => mapRow(r));
    for (const tl of langs) {
      await ensureTranslations(mapped, tl);
    }
  } finally {
    translateWarmRunning = false;
  }
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

/** Precios en vivo BTC / DOGE / LTC / ZEC + sparkline 1m. */
cryptoNoticiasRouter.get("/crypto-noticias/live-prices", ...readMw, async (_req, res, next) => {
  try {
    const items = await fetchLiveCoinQuotes();
    res.json({ items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[crypto-noticias] live-prices", e instanceof Error ? e.message : e);
    res.status(200).json({
      items: [],
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "precios no disponibles",
    });
  }
});

/** KPI de sentimiento del mercado según el wire (corto / mediano / largo). */
cryptoNoticiasRouter.get("/crypto-noticias/sentiment", ...readMw, async (req, res, next) => {
  try {
    await ensureCryptoNoticiasSchema();
    const topic = String(req.query.topic ?? "").trim().toLowerCase();
    // Rápido: solo columnas necesarias + tope menor.
    const rows = (await db
      .prepare(
        `SELECT id, title, summary, topics_json, published_at, title_es, summary_es
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT 400`
      )
      .all()) as Record<string, unknown>[];

    let items = rows.map((r) => {
      const m = mapRow({
        ...r,
        url: "",
        source_name: "",
        title_pt: "",
        summary_pt: "",
        image_url: "",
        fetched_at: "",
      });
      return m;
    });
    if (topic && TOPIC_SET.has(topic)) {
      items = items.filter((x) => x.topics.includes(topic as CryptoNoticiaTopic));
    }

    // Instantáneo: el lexicón funciona en EN/ES. Sin traducir aquí (eso enlentecía todo).
    const report = buildMarketSentimentReport(
      items.map((x) => ({
        id: x.id,
        title: x.title,
        summary: x.summary,
        titleEs: x.titleEs,
        summaryEs: x.summaryEs,
        topics: x.topics,
        publishedAt: x.publishedAt,
      }))
    );

    res.json(report);

    // Traduce drivers en background para la próxima visita (no bloquea).
    void (async () => {
      const ids = [...report.drivers.bullish, ...report.drivers.bearish].map((d) => d.id);
      const subset = items.filter((x) => ids.includes(x.id));
      if (subset.length) await ensureTranslations(subset, "es", { deadlineMs: 8_000, maxItems: 8, concurrency: 3 });
    })().catch(() => undefined);
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
                title_es, title_pt, summary_es, summary_pt, image_url
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT 400`
      )
      .all()) as Record<string, unknown>[];

    let items = rows.map((r) => mapRow(r)).filter((x) => !isBlockedNewsSource(x.sourceName, x.url));
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

    // Filtro liviano en memoria (sin DELETE/UPDATE pesados en el request).
    for (const it of items) {
      if (it.imageUrl && !isAcceptableArticleImage(it.imageUrl)) it.imageUrl = "";
    }
    const sentIds = await loadManualTelegramSentIds(items.map((x) => x.id));
    for (const it of items) {
      it.telegramSent = sentIds.has(it.id);
    }

    // Burst corto de traducción (≤2s) para lo visible; el resto en background.
    if (lang === "es" || lang === "pt") {
      await ensureTranslations(items, lang, {
        deadlineMs: 2_000,
        maxItems: 8,
        concurrency: 4,
      });
    }

    res.json({
      items: items.map((r) => presentItem(r, lang)),
      total,
      offset,
      limit,
      lang,
      lastIngestAt: lastIngestAtMs ? new Date(lastIngestAtMs).toISOString() : null,
    });

    // Completa ES + fotos fuera del camino crítico.
    if (lang === "es" || lang === "pt") {
      void ensureTranslations(items, lang, { deadlineMs: 12_000, maxItems: 36, concurrency: 3 }).catch(
        () => undefined
      );
      void warmRecentTranslations(40, lang === "es" ? ["es"] : ["pt"]).catch(() => undefined);
    }
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

const tgSettingsSchema = z.object({
  enabled: z.boolean(),
  chatId: z.string().max(64).optional().nullable(),
});

function telegramSettingsPayload(settings: { enabled: boolean; chatId: string }) {
  const bot = getTelegramBotStatus();
  return {
    enabled: settings.enabled,
    chatId: settings.chatId,
    tokenConfigured: bot.tokenConfigured,
    botUsername: bot.botUsernameHint || null,
    defaultChatId: bot.defaultChatId || null,
    readyToSend: settings.enabled && Boolean(settings.chatId) && bot.tokenConfigured,
  };
}

cryptoNoticiasRouter.get("/crypto-noticias/telegram", ...readMw, async (_req, res, next) => {
  try {
    const settings = await loadWireTgSettings();
    res.json(telegramSettingsPayload(settings));
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.put("/crypto-noticias/telegram", ...writeMw, async (req, res, next) => {
  try {
    const parsed = tgSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    const chatId = normalizeTelegramChatId(parsed.data.chatId != null ? String(parsed.data.chatId) : "");
    if (parsed.data.enabled && !chatId) {
      return res.status(400).json({
        error: {
          message:
            "Indicá el Chat ID de Telegram (número que te da el bot tras /start, o usá «Detectar chats»).",
        },
      });
    }
    const saved = await saveWireTgSettings({
      enabled: parsed.data.enabled,
      chatId,
    });
    res.json({ ok: true, ...telegramSettingsPayload(saved) });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/telegram", ...writeMw, async (req, res, next) => {
  try {
    const parsed = tgSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    const chatId = normalizeTelegramChatId(parsed.data.chatId != null ? String(parsed.data.chatId) : "");
    if (parsed.data.enabled && !chatId) {
      return res.status(400).json({
        error: {
          message: "Indicá el Chat ID de Telegram (número, ej. 1022374559).",
        },
      });
    }
    const saved = await saveWireTgSettings({
      enabled: parsed.data.enabled,
      chatId,
    });
    res.json({ ok: true, ...telegramSettingsPayload(saved) });
  } catch (e) {
    next(e);
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/telegram/test", ...writeMw, async (req, res, next) => {
  try {
    const parsed = tgSettingsSchema.safeParse(req.body ?? {});
    let settings = await loadWireTgSettings();
    if (parsed.success) {
      const chatId = normalizeTelegramChatId(parsed.data.chatId != null ? String(parsed.data.chatId) : settings.chatId);
      const enabled = parsed.data.enabled ?? true;
      if (chatId) {
        settings = await saveWireTgSettings({ enabled, chatId });
      }
    }
    if (!settings.chatId) {
      return res.status(400).json({
        error: { message: "Guardá primero un Chat ID de Telegram." },
      });
    }
    const result = await notifyCryptoWireTelegram(settings.chatId, [
      {
        title: "Prueba Wire HRS — si ves esto, el aviso de noticias por Telegram ya funciona",
        sourceName: "SGI Hashrate",
      },
    ]);
    if (!result.sent) {
      const hint =
        result.reason === "faltan_credenciales"
          ? "Falta TELEGRAM_BOT_TOKEN en el servidor (Vercel → Environment Variables)."
          : result.reason || "No se pudo enviar";
      return res.status(400).json({ error: { message: hint } });
    }
    if (result.chatId && result.chatId !== settings.chatId) {
      settings = await saveWireTgSettings({ enabled: true, chatId: result.chatId });
    }
    res.json({ ok: true, via: "telegram", ...telegramSettingsPayload(settings) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ident = await getTelegramBotIdentity().catch(() => null);
    res.status(502).json({
      error: { message: explainTelegramSendFailure(msg, ident?.username || getTelegramBotStatus().botUsernameHint) },
    });
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/telegram/send-item", ...writeMw, async (req, res, next) => {
  try {
    const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Indicá la noticia a enviar." } });
    }
    const settings = await loadWireTgSettings();
    const dest = settings.chatIds?.length ? settings.chatIds : settings.chatId ? [settings.chatId] : [];
    if (!settings.enabled || dest.length === 0) {
      return res.status(400).json({
        error: { message: "Activá Telegram y guardá el Chat ID en el engranaje de medios." },
      });
    }
    await ensureCryptoNoticiasSchema();
    const row = (await db
      .prepare(
        `SELECT title, title_es, summary, summary_es, source_name, url, image_url
         FROM sgi_crypto_noticias
         WHERE id = ?`
      )
      .get(parsed.data.id)) as
      | {
          title?: string;
          title_es?: string;
          summary?: string;
          summary_es?: string;
          source_name?: string;
          url?: string;
          image_url?: string;
        }
      | undefined;
    if (!row) {
      return res.status(404).json({ error: { message: "No encontré esa noticia." } });
    }
    const claimed = await claimManualTelegramSend(parsed.data.id);
    if (!claimed) {
      return res.status(409).json({ error: { message: "Esta noticia ya se envió a Telegram." } });
    }
    const originalTitle = String(row.title || "").trim();
    const originalSummary = String(row.summary || "").trim();
    const title = String(row.title_es || row.title || "").trim();
    const url = String(row.url || "").trim();
    if (!title) {
      await unclaimManualTelegramSend(parsed.data.id);
      return res.status(400).json({ error: { message: "Esa noticia no tiene título." } });
    }
    let publisher = url;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 16_000);
      try {
        const resolved = await resolvePublisherUrl(url, ac.signal);
        if (resolved) publisher = resolved;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* seguimos con la URL guardada */
    }
    let imageUrl = String(row.image_url || "").trim();
    if (!isAcceptableArticleImage(imageUrl)) imageUrl = "";
    try {
      const og = await fetchOgImage(publisher);
      if (og && isAcceptableArticleImage(og)) {
        imageUrl = og;
        await db.prepare("UPDATE sgi_crypto_noticias SET image_url = ? WHERE id = ?").run(og, parsed.data.id);
      }
    } catch {
      /* si no hay foto del medio, se envía sin imagen */
    }
    const open = wireArticleOpenUrl(publisher, originalTitle, originalSummary);
    try {
      const result = await notifyCryptoWireTelegramArticleMany(dest, {
        title,
        summary: String(row.summary_es || row.summary || "").trim(),
        sourceName: String(row.source_name || "").trim(),
        url: open.url,
        publisherUrl: open.publisherUrl,
        translateUrl: open.translateUrl,
        imageUrl,
        readTranslated: open.readTranslated,
      });
      res.json({ ok: true, via: "telegram", sentTo: result.sent, ...telegramSettingsPayload(settings) });
    } catch (sendErr) {
      await unclaimManualTelegramSend(parsed.data.id);
      throw sendErr;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ident = await getTelegramBotIdentity().catch(() => null);
    res.status(502).json({
      error: { message: explainTelegramSendFailure(msg, ident?.username || getTelegramBotStatus().botUsernameHint) },
    });
  }
});

cryptoNoticiasRouter.post("/crypto-noticias/telegram/send-latest", ...writeMw, async (_req, res, next) => {
  try {
    const settings = await loadWireTgSettings();
    if (!settings.enabled || !settings.chatId) {
      return res.status(400).json({
        error: { message: "Activá Telegram, guardá el Chat ID y después enviá las últimas." },
      });
    }
    await ensureCryptoNoticiasSchema();
    const rows = (await db
      .prepare(
        `SELECT title, title_es, summary, source_name, url
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT 5`
      )
      .all()) as Array<{ title?: string; title_es?: string; summary?: string; source_name?: string; url?: string }>;
    const items = (
      await Promise.all(
        rows.map(async (r) => {
          const originalTitle = String(r.title || "").trim();
          let target = String(r.url || "").trim();
          try {
            const resolved = await resolvePublisherUrl(target);
            if (resolved) target = resolved;
          } catch {
            /* keep target */
          }
          const open = wireArticleOpenUrl(target, originalTitle, String(r.summary || ""));
          return {
            title: String(r.title_es || r.title || "").trim(),
            sourceName: String(r.source_name || "").trim(),
            url: open.url,
            publisherUrl: open.publisherUrl,
            translateUrl: open.translateUrl,
            readTranslated: open.readTranslated,
          };
        })
      )
    )
      .filter((x) => x.title);
    if (!items.length) {
      return res.status(400).json({
        error: { message: "No hay noticias en el historial todavía. Tocá «Actualizar bot ahora»." },
      });
    }
    const result = await notifyCryptoWireTelegram(settings.chatId, items);
    if (!result.sent) {
      return res.status(400).json({ error: { message: result.reason || "No se pudo enviar" } });
    }
    res.json({ ok: true, via: "telegram", sent: items.length, ...telegramSettingsPayload(settings) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ident = await getTelegramBotIdentity().catch(() => null);
    res.status(502).json({
      error: { message: explainTelegramSendFailure(msg, ident?.username || getTelegramBotStatus().botUsernameHint) },
    });
  }
});

cryptoNoticiasRouter.get("/crypto-noticias/telegram/chats", ...writeMw, async (_req, res, next) => {
  try {
    if (!getTelegramBotStatus().tokenConfigured) {
      return res.status(400).json({
        error: { message: "Falta TELEGRAM_BOT_TOKEN en el servidor." },
      });
    }
    const chats = await listRecentTelegramPrivateChats(10);
    res.json({
      ok: true,
      chats,
      hint:
        chats.length === 0
          ? "Abrí el bot en Telegram, tocá Start / enviá cualquier mensaje, y volvé a detectar."
          : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: { message: msg } });
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
