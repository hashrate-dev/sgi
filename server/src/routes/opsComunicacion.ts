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

type CategoryId = (typeof CATEGORIES)[number]["id"];

function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Operaciones";
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
  schemaEnsured = true;
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

type TgSettings = { enabled: boolean; chatId: string; chatIds: string[] };

async function loadTgSettings(): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const row = (await db
    .prepare("SELECT enabled, chat_id, extra_chat_ids FROM sgi_ops_comunicacion_tg WHERE id = 1")
    .get()) as { enabled?: number | boolean; chat_id?: string; extra_chat_ids?: string } | undefined;
  const enabled = row?.enabled === true || Number(row?.enabled) === 1;
  const chatId = normalizeTelegramChatId(String(row?.chat_id ?? ""));
  const extra = parseExtraChatIds(row?.extra_chat_ids);
  const chatIds = uniqueChatIds([chatId, ...extra]);
  return { enabled, chatId, chatIds };
}

async function saveTgSettings(input: { enabled: boolean; chatId: string }): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  await db
    .prepare(`UPDATE sgi_ops_comunicacion_tg SET enabled = ?, chat_id = ?, updated_at = ${ts} WHERE id = 1`)
    .run(input.enabled ? 1 : 0, input.chatId);
  return loadTgSettings();
}

function telegramPayload(settings: TgSettings) {
  const bot = getOpsTelegramBotStatus();
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

function mapItem(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    titulo: String(r.titulo ?? ""),
    cuerpo: String(r.cuerpo ?? ""),
    categoria: String(r.categoria ?? "general"),
    categoriaLabel: categoryLabel(String(r.categoria ?? "general")),
    imageUrl: String(r.image_url ?? ""),
    telegramSent: r.telegram_sent === true || Number(r.telegram_sent) === 1,
    sentAt: r.sent_at == null ? "" : String(r.sent_at),
    createdByEmail: String(r.created_by_email ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

async function deliverToTelegram(titulo: string, cuerpo: string, categoria: string, imageUrl: string, dest: string[]) {
  const token = opsComunicacionBotToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN (o TELEGRAM_OPS_BOT_TOKEN) en el servidor.");
  const html = formatOpsFarmTelegramHtml({
    title: titulo,
    body: cuerpo,
    categoryLabel: categoryLabel(categoria),
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
    throw new Error(explainTelegramSendFailure(lastError || "No se pudo enviar", ident?.username || getOpsTelegramBotStatus().botUsernameHint));
  }
  return sent;
}

const readMw = [requireRole("admin_a", "admin_b", "operador", "lector"), requireModuleGrant("comunicacion")] as const;
const writeMw = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("comunicacion")] as const;

const CreateSchema = z.object({
  titulo: z.string().trim().min(3).max(180),
  cuerpo: z.string().trim().max(3200).optional().default(""),
  categoria: z.enum(["general", "energia", "mantenimiento", "hashrate", "clima", "logistica"]).optional(),
  imageUrl: z.string().trim().max(500).optional().default(""),
  sendNow: z.boolean().optional(),
});

const TgSchema = z.object({
  enabled: z.boolean(),
  chatId: z.string().optional().nullable(),
});

opsComunicacionRouter.get("/ops-comunicacion", ...readMw, async (_req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const rows = (await db
      .prepare(
        `SELECT id, titulo, cuerpo, categoria, image_url, telegram_sent, sent_at, created_by_email, created_at
         FROM sgi_ops_comunicacion ORDER BY created_at DESC, id DESC LIMIT 200`
      )
      .all()) as Record<string, unknown>[];
    res.json({ items: rows.map((x) => mapItem(x)), categories: CATEGORIES });
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
    const item = row ? mapItem(row) : null;
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
    const item = mapItem(row);
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
    const saved = await saveTgSettings({ enabled: parsed.data.enabled, chatId });
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
      if (chatId) settings = await saveTgSettings({ enabled, chatId });
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
    const token = opsComunicacionBotToken();
    if (!token) {
      return res.status(400).json({
        error: { message: "Falta TELEGRAM_BOT_TOKEN (o TELEGRAM_OPS_BOT_TOKEN) en el servidor." },
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
