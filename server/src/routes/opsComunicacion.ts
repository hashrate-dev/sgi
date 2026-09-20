import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import {
  explainTelegramSendFailure,
  formatOpsFarmTelegramHtml,
  getOpsTelegramBotStatus,
  getTelegramBotIdentity,
  listRecentTelegramPrivateChats,
  normalizeTelegramChatId,
  opsComunicacionBotToken,
  sendTelegramPhoto,
  sendTelegramText,
} from "../lib/telegramWire.js";

export const opsComunicacionRouter = Router();

const CATEGORIES = [
  { id: "general", label: "Operaciones" },
  { id: "energia", label: "Energía / ANDE" },
  { id: "mantenimiento", label: "Mantenimiento" },
  { id: "hashrate", label: "Hashrate / flota" },
  { id: "clima", label: "Clima / sitio" },
  { id: "logistica", label: "Logística" },
] as const;

const DEFAULT_TG_HEADER = "Comunicación granja HRS";
const CATEGORY_ID_ENUM = ["general", "energia", "mantenimiento", "hashrate", "clima", "logistica"] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];
type OpsCategory = { id: CategoryId; label: string };
type CopySettings = { telegramHeader: string; categories: OpsCategory[] };

type TgSettings = {
  enabled: boolean;
  chatId: string;
  chatIds: string[];
  botToken: string;
};

function normalizeHeaderLine(raw: string): string {
  return String(raw ?? "")
    .replace(/^\s*⚡\s*/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function mergeCategoryLabels(rawJson: unknown): OpsCategory[] {
  let overlay: Array<{ id?: unknown; label?: unknown }> = [];
  const s = String(rawJson ?? "").trim();
  if (s) {
    try {
      const j = JSON.parse(s) as unknown;
      if (Array.isArray(j)) overlay = j as Array<{ id?: unknown; label?: unknown }>;
    } catch {
      overlay = [];
    }
  }
  return CATEGORIES.map((c) => {
    const hit = overlay.find((x) => String(x.id ?? "") === c.id);
    const label = String(hit?.label ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    return { id: c.id, label: label || c.label };
  });
}

function categoryLabel(id: string, cats?: OpsCategory[]): string {
  const list = cats && cats.length ? cats : [...CATEGORIES];
  return list.find((c) => c.id === id)?.label ?? "Operaciones";
}

async function loadCopySettings(): Promise<CopySettings> {
  await ensureOpsComunicacionSchema();
  const row = (await db
    .prepare("SELECT telegram_header, categories_json FROM sgi_ops_comunicacion_tg WHERE id = 1")
    .get()) as Record<string, unknown> | undefined;
  const r = row ? rowKeysToLowercase(row) : {};
  const telegramHeader = normalizeHeaderLine(String(r.telegram_header ?? "")) || DEFAULT_TG_HEADER;
  return { telegramHeader, categories: mergeCategoryLabels(r.categories_json) };
}

async function saveCopySettings(input: { telegramHeader: string; categories: OpsCategory[] }): Promise<CopySettings> {
  await ensureOpsComunicacionSchema();
  const header = normalizeHeaderLine(input.telegramHeader) || DEFAULT_TG_HEADER;
  const categories = mergeCategoryLabels(JSON.stringify(input.categories));
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  await db
    .prepare(
      `UPDATE sgi_ops_comunicacion_tg SET telegram_header = ?, categories_json = ?, updated_at = ${ts} WHERE id = 1`
    )
    .run(header, JSON.stringify(categories));
  return { telegramHeader: header, categories };
}

let schemaEnsured = false;

async function ensureOpsComunicacionSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion (
          id BIGSERIAL PRIMARY KEY,
          titulo TEXT NOT NULL,
          cuerpo TEXT NOT NULL DEFAULT '',
          categoria TEXT NOT NULL DEFAULT 'general',
          image_url TEXT NOT NULL DEFAULT '',
          telegram_sent INTEGER NOT NULL DEFAULT 0,
          sent_at TIMESTAMPTZ,
          created_by_email TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_tg (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          chat_id TEXT NOT NULL DEFAULT '',
          extra_chat_ids TEXT NOT NULL DEFAULT '[]',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db
      .prepare("INSERT INTO sgi_ops_comunicacion_tg (id, enabled, chat_id) VALUES (1, 0, '') ON CONFLICT (id) DO NOTHING")
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titulo TEXT NOT NULL,
          cuerpo TEXT NOT NULL DEFAULT '',
          categoria TEXT NOT NULL DEFAULT 'general',
          image_url TEXT NOT NULL DEFAULT '',
          telegram_sent INTEGER NOT NULL DEFAULT 0,
          sent_at TEXT,
          created_by_email TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_tg (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          chat_id TEXT NOT NULL DEFAULT '',
          extra_chat_ids TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    await db
      .prepare("INSERT OR IGNORE INTO sgi_ops_comunicacion_tg (id, enabled, chat_id, extra_chat_ids) VALUES (1, 0, '', '[]')")
      .run();
  }
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_sgi_ops_comunicacion_created ON sgi_ops_comunicacion(created_at DESC, id DESC)")
    .run();
  if (db.isPostgres) {
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN IF NOT EXISTS bot_token TEXT NOT NULL DEFAULT ''").run();
    await db
      .prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN IF NOT EXISTS telegram_header TEXT NOT NULL DEFAULT ''")
      .run();
    await db
      .prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN IF NOT EXISTS categories_json TEXT NOT NULL DEFAULT ''")
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_titulos (
          id BIGSERIAL PRIMARY KEY,
          titulo TEXT NOT NULL,
          cuerpo TEXT NOT NULL DEFAULT '',
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db
      .prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_sgi_ops_com_titulos_lower ON sgi_ops_comunicacion_titulos (LOWER(titulo))"
      )
      .run();
  } else {
    try {
      await db.prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN bot_token TEXT NOT NULL DEFAULT ''").run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(msg)) throw e;
    }
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_titulos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          titulo TEXT NOT NULL UNIQUE,
          cuerpo TEXT NOT NULL DEFAULT '',
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_mensajes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL UNIQUE,
          cuerpo TEXT NOT NULL,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    for (const sql of [
      "ALTER TABLE sgi_ops_comunicacion_titulos ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sgi_ops_comunicacion_titulos ADD COLUMN cuerpo TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE sgi_ops_comunicacion_mensajes ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN telegram_header TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN categories_json TEXT NOT NULL DEFAULT ''",
    ]) {
      try {
        await db.prepare(sql).run();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate column/i.test(msg)) throw e;
      }
    }
  }
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_mensajes (
          id BIGSERIAL PRIMARY KEY,
          nombre TEXT NOT NULL,
          cuerpo TEXT NOT NULL,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
    await db
      .prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_sgi_ops_com_mensajes_lower ON sgi_ops_comunicacion_mensajes (LOWER(nombre))"
      )
      .run();
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_titulos ADD COLUMN IF NOT EXISTS is_builtin INTEGER NOT NULL DEFAULT 0").run();
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_titulos ADD COLUMN IF NOT EXISTS cuerpo TEXT NOT NULL DEFAULT ''").run();
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_mensajes ADD COLUMN IF NOT EXISTS is_builtin INTEGER NOT NULL DEFAULT 0").run();
    await db
      .prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN IF NOT EXISTS telegram_header TEXT NOT NULL DEFAULT ''")
      .run();
    await db
      .prepare("ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN IF NOT EXISTS categories_json TEXT NOT NULL DEFAULT ''")
      .run();
  }
  await seedOpsComunicacionCatalog();
  schemaEnsured = true;
}

const CORTE_PROGRAMADO_NOMBRE = "Corte Programado";
const CORTE_PROGRAMADO_CUERPO = `Estimados clientes,

Debido a la alta demanda energética y a restricciones operativas
informadas por la empresa estatal proveedora de energía ANDE, les
comunicamos que hoy {{FECHA}} se realizará una reducción
temporal del suministro eléctrico en 23 kV, limitándose al 10% de la
potencia reservada, en los siguientes horarios:

{{HORARIOS}}

Esta medida es ajena a nuestra operación y responde a disposiciones del
proveedor eléctrico.
Agradecemos su comprensión y quedamos a disposición ante cualquier consulta.

Muchas gracias,
Equipo de Hashrate Space

--
Notificaciones
Hashrate Space - Clientes
https://www.hashrate.space`;

async function seedOpsComunicacionCatalog(): Promise<void> {
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  const titleHit = (await db
    .prepare("SELECT id FROM sgi_ops_comunicacion_titulos WHERE LOWER(titulo) = LOWER(?) LIMIT 1")
    .get(CORTE_PROGRAMADO_NOMBRE)) as Record<string, unknown> | undefined;
  if (!titleHit) {
    await db
      .prepare(`INSERT INTO sgi_ops_comunicacion_titulos (titulo, cuerpo, is_builtin, created_at) VALUES (?, ?, 1, ${ts})`)
      .run(CORTE_PROGRAMADO_NOMBRE, CORTE_PROGRAMADO_CUERPO);
  } else {
    const id = Number(rowKeysToLowercase(titleHit).id ?? 0);
    if (id > 0) {
      await db.prepare("UPDATE sgi_ops_comunicacion_titulos SET is_builtin = 1 WHERE id = ?").run(id);
    }
  }
  if (db.isPostgres) {
    await db
      .prepare(
        `UPDATE sgi_ops_comunicacion_titulos AS t
         SET cuerpo = m.cuerpo
         FROM sgi_ops_comunicacion_mensajes AS m
         WHERE LOWER(t.titulo) = LOWER(m.nombre)
           AND TRIM(COALESCE(t.cuerpo, '')) = ''
           AND TRIM(COALESCE(m.cuerpo, '')) <> ''`
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE sgi_ops_comunicacion_titulos
         SET cuerpo = (
           SELECT m.cuerpo FROM sgi_ops_comunicacion_mensajes m
           WHERE LOWER(m.nombre) = LOWER(sgi_ops_comunicacion_titulos.titulo) AND TRIM(m.cuerpo) <> ''
           LIMIT 1
         )
         WHERE TRIM(COALESCE(cuerpo, '')) = ''
           AND EXISTS (
             SELECT 1 FROM sgi_ops_comunicacion_mensajes m
             WHERE LOWER(m.nombre) = LOWER(sgi_ops_comunicacion_titulos.titulo) AND TRIM(m.cuerpo) <> ''
           )`
      )
      .run();
  }
  await db
    .prepare(
      `UPDATE sgi_ops_comunicacion_titulos SET cuerpo = ? WHERE is_builtin = 1 AND TRIM(COALESCE(cuerpo, '')) = ''`
    )
    .run(CORTE_PROGRAMADO_CUERPO);
  const msgHit = (await db
    .prepare("SELECT id FROM sgi_ops_comunicacion_mensajes WHERE LOWER(nombre) = LOWER(?) LIMIT 1")
    .get(CORTE_PROGRAMADO_NOMBRE)) as Record<string, unknown> | undefined;
  if (!msgHit) {
    await db
      .prepare(
        `INSERT INTO sgi_ops_comunicacion_mensajes (nombre, cuerpo, is_builtin, created_at) VALUES (?, ?, 1, ${ts})`
      )
      .run(CORTE_PROGRAMADO_NOMBRE, CORTE_PROGRAMADO_CUERPO);
  } else {
    const id = Number(rowKeysToLowercase(msgHit).id ?? 0);
    if (id > 0) {
      await db.prepare("UPDATE sgi_ops_comunicacion_mensajes SET is_builtin = 1 WHERE id = ?").run(id);
    }
  }
}

function uniqueChatIds(raw: unknown): string[] {
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
    if (Array.isArray(j)) return uniqueChatIds(j);
  } catch {
    /* comma */
  }
  return uniqueChatIds(s.split(/[,\n;]+/));
}

async function loadTgSettings(): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const row = (await db
    .prepare("SELECT enabled, chat_id, extra_chat_ids, bot_token FROM sgi_ops_comunicacion_tg WHERE id = 1")
    .get()) as Record<string, unknown> | undefined;
  const r = row ? rowKeysToLowercase(row) : {};
  const enabled = r.enabled === true || Number(r.enabled) === 1;
  const chatId = normalizeTelegramChatId(String(r.chat_id ?? ""));
  const extra = parseExtraChatIds(r.extra_chat_ids);
  const chatIds = uniqueChatIds([chatId, ...extra]);
  const botToken = String(r.bot_token ?? "").trim();
  return { enabled, chatId, chatIds, botToken };
}

async function saveTgSettings(input: { enabled: boolean; chatId: string; botToken?: string }): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  const nextToken = input.botToken != null ? String(input.botToken).trim() : "";
  if (nextToken) {
    await db
      .prepare(
        `UPDATE sgi_ops_comunicacion_tg SET enabled = ?, chat_id = ?, bot_token = ?, updated_at = ${ts} WHERE id = 1`
      )
      .run(input.enabled ? 1 : 0, input.chatId, nextToken);
  } else {
    await db
      .prepare(`UPDATE sgi_ops_comunicacion_tg SET enabled = ?, chat_id = ?, updated_at = ${ts} WHERE id = 1`)
      .run(input.enabled ? 1 : 0, input.chatId);
  }
  return loadTgSettings();
}

function telegramPayload(settings: TgSettings) {
  const bot = getOpsTelegramBotStatus(settings.botToken);
  return {
    enabled: settings.enabled,
    chatId: settings.chatId,
    chatIds: settings.chatIds,
    tokenConfigured: bot.tokenConfigured,
    botUsername: bot.botUsernameHint || null,
    defaultChatId: bot.defaultChatId || null,
    readyToSend: settings.enabled && Boolean(settings.chatId) && bot.tokenConfigured,
  };
}

function mapItem(raw: Record<string, unknown>, cats?: OpsCategory[]) {
  const r = rowKeysToLowercase(raw);
  const categoria = String(r.categoria ?? "general");
  return {
    id: Number(r.id ?? 0),
    titulo: String(r.titulo ?? ""),
    cuerpo: String(r.cuerpo ?? ""),
    categoria,
    categoriaLabel: categoryLabel(categoria, cats),
    imageUrl: String(r.image_url ?? ""),
    telegramSent: r.telegram_sent === true || Number(r.telegram_sent) === 1,
    sentAt: r.sent_at == null ? "" : String(r.sent_at),
    createdByEmail: String(r.created_by_email ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

async function deliverToTelegram(titulo: string, cuerpo: string, categoria: string, imageUrl: string, dest: string[]) {
  const settings = await loadTgSettings();
  const copy = await loadCopySettings();
  const token = opsComunicacionBotToken(settings.botToken);
  if (!token) {
    throw new Error(
      "Falta el token del bot. Pegalo en el engranaje de Comunicación y Guardar, o definí TELEGRAM_OPS_BOT_TOKEN en Vercel y hacé Redeploy."
    );
  }
  const html = formatOpsFarmTelegramHtml({
    title: titulo,
    body: cuerpo,
    categoryLabel: categoryLabel(categoria, copy.categories),
    headerLine: copy.telegramHeader,
  });
  let sent = 0;
  let lastError = "";
  for (const chat of dest) {
    try {
      const photo = String(imageUrl || "").trim();
      if (/^https?:\/\//i.test(photo)) {
        try {
          await sendTelegramPhoto(chat, photo, html, token);
          sent += 1;
          continue;
        } catch {
          /* fallback texto */
        }
      }
      await sendTelegramText(chat, html, { html: true, disablePreview: true, token });
      sent += 1;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (sent === 0) {
    const ident = await getTelegramBotIdentity(token).catch(() => null);
    throw new Error(explainTelegramSendFailure(lastError || "No se pudo enviar", ident?.username || getOpsTelegramBotStatus(settings.botToken).botUsernameHint));
  }
  return sent;
}

const readMw = [requireRole("admin_a", "admin_b", "operador", "lector"), requireModuleGrant("comunicacion")] as const;
const writeMw = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("comunicacion")] as const;

const CreateSchema = z.object({
  titulo: z.string().trim().min(3).max(180),
  cuerpo: z.string().trim().max(8000).optional().default(""),
  categoria: z.enum(["general", "energia", "mantenimiento", "hashrate", "clima", "logistica"]).optional(),
  imageUrl: z.string().trim().max(500).optional().default(""),
  sendNow: z.boolean().optional(),
});

const TgSchema = z.object({
  enabled: z.boolean(),
  chatId: z.string().optional().nullable(),
  botToken: z.string().optional().nullable(),
});

function mapTitulo(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    titulo: String(r.titulo ?? ""),
    cuerpo: String(r.cuerpo ?? ""),
    isBuiltin: r.is_builtin === true || Number(r.is_builtin) === 1,
  };
}

async function listTitulos(): Promise<Array<{ id: number; titulo: string; cuerpo: string; isBuiltin: boolean }>> {
  await ensureOpsComunicacionSchema();
  await seedOpsComunicacionCatalog();
  const rows = (await db
    .prepare("SELECT id, titulo, cuerpo, is_builtin FROM sgi_ops_comunicacion_titulos ORDER BY titulo ASC, id ASC")
    .all()) as Record<string, unknown>[];
  return rows.map(mapTitulo).filter((x) => x.id > 0 && x.titulo);
}

async function listMensajes(): Promise<Array<{ id: number; nombre: string; cuerpo: string; isBuiltin: boolean }>> {
  await ensureOpsComunicacionSchema();
  await seedOpsComunicacionCatalog();
  const rows = (await db
    .prepare("SELECT id, nombre, cuerpo, is_builtin FROM sgi_ops_comunicacion_mensajes ORDER BY nombre ASC, id ASC")
    .all()) as Record<string, unknown>[];
  return rows
    .map((raw) => {
      const r = rowKeysToLowercase(raw);
      return {
        id: Number(r.id ?? 0),
        nombre: String(r.nombre ?? ""),
        cuerpo: String(r.cuerpo ?? ""),
        isBuiltin: r.is_builtin === true || Number(r.is_builtin) === 1,
      };
    })
    .filter((x) => x.id > 0 && x.nombre);
}

opsComunicacionRouter.get("/ops-comunicacion", ...readMw, async (_req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const rows = (await db
      .prepare(
        `SELECT id, titulo, cuerpo, categoria, image_url, telegram_sent, sent_at, created_by_email, created_at
         FROM sgi_ops_comunicacion ORDER BY created_at DESC, id DESC LIMIT 200`
      )
      .all()) as Record<string, unknown>[];
    const copy = await loadCopySettings();
    const titles = await listTitulos();
    const messages = await listMensajes();
    res.json({
      items: rows.map((x) => mapItem(x, copy.categories)),
      categories: copy.categories,
      telegramHeader: copy.telegramHeader,
      titles,
      messages,
    });
  } catch (e) {
    next(e);
  }
});

const TituloSchema = z.object({
  titulo: z.string().trim().min(3).max(180),
});

opsComunicacionRouter.post("/ops-comunicacion/titulos", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const parsed = TituloSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "El título tiene que tener al menos 3 caracteres." } });
    }
    const titulo = parsed.data.titulo;
    const dup = (await db
      .prepare("SELECT id FROM sgi_ops_comunicacion_titulos WHERE LOWER(titulo) = LOWER(?) LIMIT 1")
      .get(titulo)) as Record<string, unknown> | undefined;
    if (dup) {
      return res.status(409).json({ error: { message: "Ese título ya está en la lista." } });
    }
    const ts = db.isPostgres ? "NOW()" : "datetime('now')";
    await db.prepare(`INSERT INTO sgi_ops_comunicacion_titulos (titulo, cuerpo, created_at) VALUES (?, '', ${ts})`).run(titulo);
    const titles = await listTitulos();
    const item = titles.find((x) => x.titulo.toLowerCase() === titulo.toLowerCase()) ?? null;
    res.json({ ok: true, item, titles });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.delete("/ops-comunicacion/titulos/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const row = (await db
      .prepare("SELECT is_builtin, titulo FROM sgi_ops_comunicacion_titulos WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
    const r = row ? rowKeysToLowercase(row) : {};
    if (r.is_builtin === true || Number(r.is_builtin) === 1 || String(r.titulo ?? "").toLowerCase() === CORTE_PROGRAMADO_NOMBRE.toLowerCase()) {
      return res.status(400).json({ error: { message: "Corte Programado es fijo y no se puede eliminar." } });
    }
    await db.prepare("DELETE FROM sgi_ops_comunicacion_titulos WHERE id = ?").run(id);
    res.json({ ok: true, titles: await listTitulos() });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.put("/ops-comunicacion/titulos/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    const parsed = z
      .object({
        titulo: z.string().trim().min(3).max(180).optional(),
        cuerpo: z.string().max(8000).optional(),
      })
      .safeParse(req.body ?? {});
    if (!Number.isFinite(id) || id <= 0 || !parsed.success || (parsed.data.titulo == null && parsed.data.cuerpo == null)) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    const locked = (await db
      .prepare("SELECT is_builtin, titulo FROM sgi_ops_comunicacion_titulos WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
    if (!locked) {
      return res.status(404).json({ error: { message: "Título no encontrado." } });
    }
    const lockedRow = rowKeysToLowercase(locked);
    const builtin = lockedRow.is_builtin === true || Number(lockedRow.is_builtin) === 1;
    const titulo = parsed.data.titulo;
    const cuerpo = parsed.data.cuerpo;
    if (builtin && titulo && titulo.toLowerCase() !== String(lockedRow.titulo ?? "").toLowerCase()) {
      return res.status(400).json({ error: { message: "El nombre de Corte Programado es fijo. Podés guardar el texto." } });
    }
    if (titulo && !builtin) {
      const dup = (await db
        .prepare("SELECT id FROM sgi_ops_comunicacion_titulos WHERE LOWER(titulo) = LOWER(?) AND id <> ? LIMIT 1")
        .get(titulo, id)) as Record<string, unknown> | undefined;
      if (dup) {
        return res.status(409).json({ error: { message: "Ese título ya está en la lista." } });
      }
    }
    if (titulo && cuerpo != null && !builtin) {
      await db.prepare("UPDATE sgi_ops_comunicacion_titulos SET titulo = ?, cuerpo = ? WHERE id = ?").run(titulo, cuerpo, id);
    } else if (titulo && !builtin) {
      await db.prepare("UPDATE sgi_ops_comunicacion_titulos SET titulo = ? WHERE id = ?").run(titulo, id);
    } else if (cuerpo != null) {
      await db.prepare("UPDATE sgi_ops_comunicacion_titulos SET cuerpo = ? WHERE id = ?").run(cuerpo, id);
    }
    const titles = await listTitulos();
    const item = titles.find((x) => x.id === id) ?? null;
    res.json({ ok: true, item, titles });
  } catch (e) {
    next(e);
  }
});

const MensajeSchema = z.object({
  nombre: z.string().trim().min(3).max(180),
  cuerpo: z.string().trim().min(8).max(8000),
});

opsComunicacionRouter.post("/ops-comunicacion/mensajes", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const parsed = MensajeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "El modelo necesita un nombre y un mensaje." } });
    }
    const { nombre, cuerpo } = parsed.data;
    const dup = (await db
      .prepare("SELECT id FROM sgi_ops_comunicacion_mensajes WHERE LOWER(nombre) = LOWER(?) LIMIT 1")
      .get(nombre)) as Record<string, unknown> | undefined;
    if (dup) {
      return res.status(409).json({ error: { message: "Ese modelo de mensaje ya está en la lista." } });
    }
    const ts = db.isPostgres ? "NOW()" : "datetime('now')";
    await db
      .prepare(`INSERT INTO sgi_ops_comunicacion_mensajes (nombre, cuerpo, created_at) VALUES (?, ?, ${ts})`)
      .run(nombre, cuerpo);
    const messages = await listMensajes();
    const item = messages.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase()) ?? null;
    res.json({ ok: true, item, messages });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.delete("/ops-comunicacion/mensajes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const row = (await db
      .prepare("SELECT is_builtin, nombre FROM sgi_ops_comunicacion_mensajes WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
    const r = row ? rowKeysToLowercase(row) : {};
    if (r.is_builtin === true || Number(r.is_builtin) === 1 || String(r.nombre ?? "").toLowerCase() === CORTE_PROGRAMADO_NOMBRE.toLowerCase()) {
      return res.status(400).json({ error: { message: "El modelo de Corte Programado es fijo y no se puede eliminar." } });
    }
    await db.prepare("DELETE FROM sgi_ops_comunicacion_mensajes WHERE id = ?").run(id);
    res.json({ ok: true, messages: await listMensajes() });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.put("/ops-comunicacion/mensajes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const parsed = z
      .object({
        nombre: z.string().trim().min(3).max(180).optional(),
        cuerpo: z.string().trim().min(8).max(8000).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success || (!parsed.data.nombre && !parsed.data.cuerpo)) {
      return res.status(400).json({ error: { message: "Indicá un nombre o un texto para el modelo." } });
    }
    const row = (await db
      .prepare("SELECT is_builtin, nombre FROM sgi_ops_comunicacion_mensajes WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
    if (!row) {
      return res.status(404).json({ error: { message: "Modelo no encontrado." } });
    }
    const r = rowKeysToLowercase(row);
    const locked =
      r.is_builtin === true ||
      Number(r.is_builtin) === 1 ||
      String(r.nombre ?? "").toLowerCase() === CORTE_PROGRAMADO_NOMBRE.toLowerCase();
    const nombre = parsed.data.nombre;
    const cuerpo = parsed.data.cuerpo;
    if (locked && nombre) {
      return res.status(400).json({ error: { message: "El nombre de Corte Programado es fijo. Podés guardar el texto del modelo." } });
    }
    if (nombre) {
      const dup = (await db
        .prepare("SELECT id FROM sgi_ops_comunicacion_mensajes WHERE LOWER(nombre) = LOWER(?) AND id <> ? LIMIT 1")
        .get(nombre, id)) as Record<string, unknown> | undefined;
      if (dup) {
        return res.status(409).json({ error: { message: "Ese modelo de mensaje ya está en la lista." } });
      }
      if (cuerpo) {
        await db.prepare("UPDATE sgi_ops_comunicacion_mensajes SET nombre = ?, cuerpo = ? WHERE id = ?").run(nombre, cuerpo, id);
      } else {
        await db.prepare("UPDATE sgi_ops_comunicacion_mensajes SET nombre = ? WHERE id = ?").run(nombre, id);
      }
    } else if (cuerpo) {
      await db.prepare("UPDATE sgi_ops_comunicacion_mensajes SET cuerpo = ? WHERE id = ?").run(cuerpo, id);
    }
    const messages = await listMensajes();
    const item = messages.find((x) => x.id === id) ?? null;
    res.json({ ok: true, item, messages });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const parsed = CreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Completá un título de al menos 3 caracteres." } });
    }
    const data = parsed.data;
    const categoria: CategoryId = data.categoria ?? "general";
    const imageUrl = data.imageUrl && /^https?:\/\//i.test(data.imageUrl) ? data.imageUrl : "";
    const email = String(req.user?.email ?? "").trim();
    const ts = db.isPostgres ? "NOW()" : "datetime('now')";
    await db
      .prepare(
        `INSERT INTO sgi_ops_comunicacion (titulo, cuerpo, categoria, image_url, telegram_sent, created_by_email, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ${ts})`
      )
      .run(data.titulo, data.cuerpo ?? "", categoria, imageUrl, email);

    const row = (await db
      .prepare(
        `SELECT id, titulo, cuerpo, categoria, image_url, telegram_sent, sent_at, created_by_email, created_at
         FROM sgi_ops_comunicacion ORDER BY id DESC LIMIT 1`
      )
      .get()) as Record<string, unknown> | undefined;
    const copy = await loadCopySettings();
    const item = row ? mapItem(row, copy.categories) : null;
    if (data.sendNow && item) {
      const settings = await loadTgSettings();
      const dest = settings.chatIds.length ? settings.chatIds : settings.chatId ? [settings.chatId] : [];
      if (!settings.enabled || dest.length === 0) {
        return res.status(400).json({
          error: {
            message: "El comunicado se guardó, pero Telegram no está listo. Activá el bot en el engranaje y guardá el Chat ID.",
          },
          item,
        });
      }
      const sentTo = await deliverToTelegram(item.titulo, item.cuerpo, item.categoria, item.imageUrl, dest);
      const sentTs = db.isPostgres ? "NOW()" : "datetime('now')";
      await db
        .prepare(`UPDATE sgi_ops_comunicacion SET telegram_sent = 1, sent_at = ${sentTs} WHERE id = ?`)
        .run(item.id);
      return res.json({
        ok: true,
        sentTo,
        item: { ...item, telegramSent: true, sentAt: new Date().toISOString() },
      });
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion/:id/send", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const row = (await db
      .prepare(
        `SELECT id, titulo, cuerpo, categoria, image_url, telegram_sent, sent_at, created_by_email, created_at
         FROM sgi_ops_comunicacion WHERE id = ?`
      )
      .get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Comunicado no encontrado." } });
    const copy = await loadCopySettings();
    const item = mapItem(row, copy.categories);
    if (item.telegramSent) {
      return res.status(409).json({ error: { message: "Este comunicado ya se envió a Telegram." } });
    }
    const settings = await loadTgSettings();
    const dest = settings.chatIds.length ? settings.chatIds : settings.chatId ? [settings.chatId] : [];
    if (!settings.enabled || dest.length === 0) {
      return res.status(400).json({
        error: { message: "Activá Telegram y guardá el Chat ID en el engranaje de Comunicación." },
      });
    }
    const sentTo = await deliverToTelegram(item.titulo, item.cuerpo, item.categoria, item.imageUrl, dest);
    const sentTs = db.isPostgres ? "NOW()" : "datetime('now')";
    await db.prepare(`UPDATE sgi_ops_comunicacion SET telegram_sent = 1, sent_at = ${sentTs} WHERE id = ?`).run(id);
    res.json({ ok: true, sentTo, item: { ...item, telegramSent: true } });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion/copy", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const parsed = z
      .object({
        telegramHeader: z.string().max(80),
        categories: z
          .array(
            z.object({
              id: z.enum(CATEGORY_ID_ENUM),
              label: z.string().trim().min(2).max(60),
            })
          )
          .min(1)
          .max(12),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { message: "El encabezado y el tipo tienen que tener texto (mínimo 2 caracteres el tipo)." },
      });
    }
    const copy = await saveCopySettings({
      telegramHeader: parsed.data.telegramHeader,
      categories: parsed.data.categories,
    });
    res.json({ ok: true, telegramHeader: copy.telegramHeader, categories: copy.categories });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.get("/ops-comunicacion/telegram", ...readMw, async (_req, res, next) => {
  try {
    const settings = await loadTgSettings();
    res.json(telegramPayload(settings));
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion/telegram", ...writeMw, async (req, res, next) => {
  try {
    const parsed = TgSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    const chatId = normalizeTelegramChatId(parsed.data.chatId != null ? String(parsed.data.chatId) : "");
    if (parsed.data.enabled && !chatId) {
      return res.status(400).json({
        error: {
          message: "Indicá el Chat ID de Telegram (número tras /start, o usá «Detectar chats»).",
        },
      });
    }
    const saved = await saveTgSettings({
      enabled: parsed.data.enabled,
      chatId,
      botToken: parsed.data.botToken ?? undefined,
    });
    res.json({ ok: true, ...telegramPayload(saved) });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion/telegram/test", ...writeMw, async (req, res, next) => {
  try {
    const parsed = TgSchema.partial().safeParse(req.body ?? {});
    let settings = await loadTgSettings();
    if (parsed.success) {
      const chatId = normalizeTelegramChatId(parsed.data.chatId != null ? String(parsed.data.chatId) : settings.chatId);
      const enabled = parsed.data.enabled ?? true;
      if (chatId || parsed.data.botToken) {
        settings = await saveTgSettings({
          enabled,
          chatId: chatId || settings.chatId,
          botToken: parsed.data.botToken ?? undefined,
        });
      }
    }
    if (!settings.chatId) {
      return res.status(400).json({ error: { message: "Guardá primero un Chat ID de Telegram." } });
    }
    await deliverToTelegram(
      "Prueba Comunicación granja HRS",
      "Si ves esto, el bot de operaciones de la granja ya funciona.",
      "general",
      "",
      settings.chatIds.length ? settings.chatIds : [settings.chatId]
    );
    res.json({ ok: true, via: "telegram", ...telegramPayload(settings) });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.get("/ops-comunicacion/telegram/chats", ...writeMw, async (_req, res, next) => {
  try {
    const settings = await loadTgSettings();
    const token = opsComunicacionBotToken(settings.botToken);
    if (!token) {
      return res.status(400).json({
        error: {
          message:
            "Falta el token del bot. Pegá el token de @BotFather en este formulario y tocá Guardar; o cargá TELEGRAM_OPS_BOT_TOKEN en Vercel y hacé Redeploy.",
        },
      });
    }
    const chats = await listRecentTelegramPrivateChats(10, token);
    const ident = await getTelegramBotIdentity(token).catch(() => null);
    res.json({
      chats,
      hint: chats.length
        ? undefined
        : ident?.username
          ? `Abrí https://t.me/${ident.username} , mandá /start y volvé a detectar.`
          : "Abrí el bot, mandale /start y volvé a detectar chats.",
    });
  } catch (e) {
    next(e);
  }
});
