import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import {
  explainTelegramSendFailure,
  composeBilingualOpsCuerpo,
  formatOpsFarmTelegramHtml,
  getOpsTelegramBotStatus,
  getTelegramBotIdentity,
  getTelegramPrivateUserLabel,
  listRecentTelegramPrivateChats,
  normalizeTelegramChatId,
  opsComunicacionBotToken,
  sendTelegramPhoto,
  sendTelegramText,
} from "../lib/telegramWire.js";
import { translateEsToEn } from "../lib/cryptoNoticiasTranslate.js";
import {
  durationHours,
  etapasForWindows,
  formatCorteId,
  labelEtapa,
  looksLikeCorte,
  normalizeOpsTime,
  parseFechaIsoFromCuerpo,
  parseHorarioWindows,
} from "../lib/opsCorteControl.js";

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

type OpsRecipient = { chatId: string; name: string; username?: string; poolUser?: string };

type TgSettings = {
  enabled: boolean;
  chatId: string;
  chatIds: string[];
  recipients: OpsRecipient[];
  botToken: string;
};

const MAX_OPS_RECIPIENTS = 250;

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
  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_cortes (
          id BIGSERIAL PRIMARY KEY,
          corte_date TEXT NOT NULL,
          motivo TEXT NOT NULL DEFAULT '',
          start_announced TEXT NOT NULL,
          end_announced TEXT NOT NULL,
          start_actual TEXT NOT NULL,
          end_actual TEXT NOT NULL,
          confirmed INTEGER NOT NULL DEFAULT 0,
          confirmed_at TIMESTAMPTZ,
          confirmed_by_email TEXT NOT NULL DEFAULT '',
          adjustment_note TEXT NOT NULL DEFAULT '',
          source_message_id BIGINT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_cortes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          corte_date TEXT NOT NULL,
          motivo TEXT NOT NULL DEFAULT '',
          start_announced TEXT NOT NULL,
          end_announced TEXT NOT NULL,
          start_actual TEXT NOT NULL,
          end_actual TEXT NOT NULL,
          confirmed INTEGER NOT NULL DEFAULT 0,
          confirmed_at TEXT,
          confirmed_by_email TEXT NOT NULL DEFAULT '',
          adjustment_note TEXT NOT NULL DEFAULT '',
          source_message_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_sgi_ops_com_cortes_date ON sgi_ops_comunicacion_cortes(corte_date DESC, id DESC)")
    .run();
  if (db.isPostgres) {
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_cortes ADD COLUMN IF NOT EXISTS corte_no INTEGER NOT NULL DEFAULT 0").run();
    await db.prepare("ALTER TABLE sgi_ops_comunicacion_cortes ADD COLUMN IF NOT EXISTS etapa INTEGER NOT NULL DEFAULT 1").run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_corte_seq (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          next_num INTEGER NOT NULL DEFAULT 0
        )`
      )
      .run();
    await db.prepare("INSERT INTO sgi_ops_comunicacion_corte_seq (id, next_num) VALUES (1, 0) ON CONFLICT (id) DO NOTHING").run();
  } else {
    try {
      await db.prepare("ALTER TABLE sgi_ops_comunicacion_cortes ADD COLUMN corte_no INTEGER NOT NULL DEFAULT 0").run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(msg)) throw e;
    }
    try {
      await db.prepare("ALTER TABLE sgi_ops_comunicacion_cortes ADD COLUMN etapa INTEGER NOT NULL DEFAULT 1").run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(msg)) throw e;
    }
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_corte_seq (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          next_num INTEGER NOT NULL DEFAULT 0
        )`
      )
      .run();
    await db.prepare("INSERT OR IGNORE INTO sgi_ops_comunicacion_corte_seq (id, next_num) VALUES (1, 0)").run();
  }
  await seedOpsComunicacionCatalog();
  schemaEnsured = true;
}

const CORTE_PROGRAMADO_NOMBRE = "Corte Programado";
const CORTE_PROGRAMADO_CUERPO = `Estimados clientes,

Por alta demanda energética y restricciones informadas por ANDE, hoy {{FECHA}} se realizará una reducción temporal del suministro eléctrico en 23 kV, limitándose al 10% de la potencia reservada.

{{HORARIOS}}

Esta medida es ajena a Hashrate Space y responde a disposiciones del proveedor eléctrico.
Quedamos a disposición ante cualquier consulta.

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
      await db
        .prepare(
          `UPDATE sgi_ops_comunicacion_titulos
           SET is_builtin = 1,
               cuerpo = CASE
                 WHEN TRIM(COALESCE(cuerpo, '')) = ''
                   OR cuerpo LIKE '%Debido a la alta demanda energética%'
                   OR cuerpo LIKE '%Agradecemos su comprensión%'
                 THEN ?
                 ELSE cuerpo
               END
           WHERE id = ?`
        )
        .run(CORTE_PROGRAMADO_CUERPO, id);
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
      await db
        .prepare(
          `UPDATE sgi_ops_comunicacion_mensajes
           SET is_builtin = 1,
               cuerpo = CASE
                 WHEN TRIM(COALESCE(cuerpo, '')) = ''
                   OR cuerpo LIKE '%Debido a la alta demanda energética%'
                   OR cuerpo LIKE '%Agradecemos su comprensión%'
                 THEN ?
                 ELSE cuerpo
               END
           WHERE id = ?`
        )
        .run(CORTE_PROGRAMADO_CUERPO, id);
    }
  }
}

function isOpsPrivateUserId(raw: string): boolean {
  return /^\d{5,20}$/.test(normalizeTelegramChatId(raw));
}

function recipientFromUnknown(x: unknown): OpsRecipient | null {
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const chatId = normalizeTelegramChatId(String(o.chatId ?? o.chat_id ?? o.id ?? ""));
    if (!isOpsPrivateUserId(chatId)) return null;
    const name =
      String(o.name ?? o.title ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || chatId;
    const username = String(o.username ?? "")
      .replace(/^@/, "")
      .trim()
      .slice(0, 32);
    const hasPoolKey = "poolUser" in o || "pool_user" in o;
    const poolUser = String(o.poolUser ?? o.pool_user ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const row: OpsRecipient = { chatId, name };
    if (username) row.username = username;
    if (hasPoolKey) row.poolUser = poolUser;
    else if (poolUser) row.poolUser = poolUser;
    return row;
  }
  const chatId = normalizeTelegramChatId(String(x ?? ""));
  if (!isOpsPrivateUserId(chatId)) return null;
  return { chatId, name: chatId };
}

function realRecipientName(name: string | undefined, chatId: string): string {
  const t = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t && t !== chatId) return t.slice(0, 80);
  if (chatId === "1022374559") return "JL";
  return "";
}

function mergeRecipients(...lists: OpsRecipient[][]): OpsRecipient[] {
  const byId = new Map<string, OpsRecipient>();
  for (const list of lists) {
    for (const r of list) {
      if (!r?.chatId || (byId.size >= MAX_OPS_RECIPIENTS && !byId.has(r.chatId))) continue;
      const prev = byId.get(r.chatId);
      if (!prev) {
        byId.set(r.chatId, r);
        continue;
      }
      const name = realRecipientName(r.name, r.chatId) || realRecipientName(prev.name, prev.chatId) || prev.name || r.name;
      const username = r.username || prev.username;
      const poolUser = String((r.poolUser !== undefined ? r.poolUser : prev.poolUser) || "")
        .trim()
        .slice(0, 80);
      const row: OpsRecipient = { chatId: r.chatId, name };
      if (username) row.username = username;
      if (poolUser) row.poolUser = poolUser;
      byId.set(r.chatId, row);
    }
  }
  return [...byId.values()].slice(0, MAX_OPS_RECIPIENTS);
}

function parseRecipients(rawExtra: unknown, primaryChatId?: string): OpsRecipient[] {
  const fromPrimary = recipientFromUnknown(primaryChatId);
  const s = String(rawExtra ?? "").trim();
  let extra: OpsRecipient[] = [];
  if (s) {
    try {
      const j = JSON.parse(s) as unknown;
      if (Array.isArray(j)) extra = j.map(recipientFromUnknown).filter((x): x is OpsRecipient => Boolean(x));
    } catch {
      extra = s
        .split(/[,\n;]+/)
        .map(recipientFromUnknown)
        .filter((x): x is OpsRecipient => Boolean(x));
    }
  }
  return mergeRecipients(fromPrimary ? [fromPrimary] : [], extra);
}

async function loadTgSettings(): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const row = (await db
    .prepare("SELECT enabled, chat_id, extra_chat_ids, bot_token FROM sgi_ops_comunicacion_tg WHERE id = 1")
    .get()) as Record<string, unknown> | undefined;
  const r = row ? rowKeysToLowercase(row) : {};
  const enabled = r.enabled === true || Number(r.enabled) === 1;
  const recipients = parseRecipients(r.extra_chat_ids, String(r.chat_id ?? ""));
  const chatIds = recipients.map((x) => x.chatId);
  const botToken = String(r.bot_token ?? "").trim();
  return { enabled, chatId: chatIds[0] || "", chatIds, recipients, botToken };
}

async function saveTgSettings(input: {
  enabled: boolean;
  recipients: OpsRecipient[];
  botToken?: string;
}): Promise<TgSettings> {
  await ensureOpsComunicacionSchema();
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  const recipients = mergeRecipients(input.recipients);
  const primary = recipients[0]?.chatId || "";
  const extraJson = JSON.stringify(recipients);
  const nextToken = input.botToken != null ? String(input.botToken).trim() : "";
  if (nextToken) {
    await db
      .prepare(
        `UPDATE sgi_ops_comunicacion_tg SET enabled = ?, chat_id = ?, extra_chat_ids = ?, bot_token = ?, updated_at = ${ts} WHERE id = 1`
      )
      .run(input.enabled ? 1 : 0, primary, extraJson, nextToken);
  } else {
    await db
      .prepare(
        `UPDATE sgi_ops_comunicacion_tg SET enabled = ?, chat_id = ?, extra_chat_ids = ?, updated_at = ${ts} WHERE id = 1`
      )
      .run(input.enabled ? 1 : 0, primary, extraJson);
  }
  return loadTgSettings();
}

function telegramPayload(settings: TgSettings) {
  const bot = getOpsTelegramBotStatus(settings.botToken);
  return {
    enabled: settings.enabled,
    chatId: settings.chatId,
    chatIds: settings.chatIds,
    recipients: settings.recipients,
    tokenConfigured: bot.tokenConfigured,
    botUsername: bot.botUsernameHint || null,
    defaultChatId: bot.defaultChatId || null,
    readyToSend: settings.enabled && settings.chatIds.length > 0 && bot.tokenConfigured,
  };
}

async function enrichRecipientNames(list: OpsRecipient[]): Promise<OpsRecipient[]> {
  const token = opsComunicacionBotToken((await loadTgSettings()).botToken);
  if (!token || !list.length) return list;
  const out: OpsRecipient[] = [];
  for (const r of list) {
    const needsName = !r.name || r.name === r.chatId;
    const needsUser = !r.username;
    if (!needsName && !needsUser) {
      out.push(r);
      continue;
    }
    const info = await getTelegramPrivateUserLabel(r.chatId, token).catch(() => null);
    if (!info) {
      out.push(r);
      continue;
    }
    const name = needsName ? info.name || r.name : r.name;
    const username = r.username || info.username;
    const next: OpsRecipient = { chatId: r.chatId, name };
    if (username) next.username = username;
    if (r.poolUser) next.poolUser = r.poolUser;
    out.push(next);
  }
  return out;
}

function mapItem(raw: Record<string, unknown>, cats?: OpsCategory[], corteNo = 0) {
  const r = rowKeysToLowercase(raw);
  const categoria = String(r.categoria ?? "general");
  const n = Number(corteNo) || 0;
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
    corteNo: n,
    corteId: formatCorteId(n),
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
  const cuerpoEn = await translateEsToEn(cuerpo);
  const html = formatOpsFarmTelegramHtml({
    title: titulo,
    body: composeBilingualOpsCuerpo(cuerpo, cuerpoEn),
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
  corteControl: z
    .object({
      fecha: z.string().trim().max(16).optional(),
      motivo: z.string().trim().max(180).optional(),
      windows: z
        .array(z.object({ from: z.string().trim().max(8), to: z.string().trim().max(8) }))
        .max(4)
        .optional(),
    })
    .optional(),
});

const CorteCreateSchema = z.object({
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().trim().min(3).max(180),
  from: z.string().trim().min(4).max(8),
  to: z.string().trim().min(4).max(8),
  etapa: z.number().int().min(1).max(3).optional(),
  note: z.string().trim().max(240).optional().default(""),
});

const CortePatchSchema = z.object({
  startActual: z.string().trim().min(4).max(8),
  endActual: z.string().trim().min(4).max(8),
  confirmed: z.boolean().optional(),
  adjustmentNote: z.string().trim().max(240).optional().default(""),
  motivo: z.string().trim().min(3).max(180).optional(),
});

function defaultCorteMotivo(titulo: string): string {
  if (/corte/i.test(titulo)) return "Reducción 23 kV ANDE · 10% potencia reservada";
  return String(titulo || "Corte operativo").slice(0, 180);
}

async function nextCorteNo(): Promise<number> {
  const maxRow = (await db.prepare("SELECT MAX(corte_no) AS m FROM sgi_ops_comunicacion_cortes").get()) as
    | Record<string, unknown>
    | undefined;
  const maxIssued = Number(rowKeysToLowercase(maxRow || {}).m ?? 0) || 0;
  const seq = (await db.prepare("SELECT next_num FROM sgi_ops_comunicacion_corte_seq WHERE id = 1").get()) as
    | Record<string, unknown>
    | undefined;
  let cursor = Number(rowKeysToLowercase(seq || {}).next_num ?? 0) || 0;
  if (maxIssued > cursor) cursor = maxIssued;
  const n = cursor + 1;
  await db.prepare("UPDATE sgi_ops_comunicacion_corte_seq SET next_num = ? WHERE id = 1").run(n);
  return n;
}

function mapCorteRow(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  const startAnnounced = normalizeOpsTime(String(r.start_announced ?? ""));
  const endAnnounced = normalizeOpsTime(String(r.end_announced ?? ""));
  const startActual = normalizeOpsTime(String(r.start_actual ?? startAnnounced));
  const endActual = normalizeOpsTime(String(r.end_actual ?? endAnnounced));
  const hoursAnnounced = durationHours(startAnnounced, endAnnounced);
  const hoursActual = durationHours(startActual, endActual);
  const corteNo = Number(r.corte_no ?? 0) || 0;
  const etapa = Number(r.etapa ?? 1) || 1;
  return {
    id: Number(r.id ?? 0),
    corteNo,
    corteId: formatCorteId(corteNo, etapa),
    fecha: String(r.corte_date ?? ""),
    motivo: String(r.motivo ?? ""),
    startAnnounced,
    endAnnounced,
    startActual,
    endActual,
    hoursAnnounced,
    hoursActual,
    deltaHours: hoursActual - hoursAnnounced,
    adjusted: startActual !== startAnnounced || endActual !== endAnnounced,
    confirmed: r.confirmed === true || Number(r.confirmed) === 1,
    confirmedAt: r.confirmed_at == null ? "" : String(r.confirmed_at),
    confirmedByEmail: String(r.confirmed_by_email ?? ""),
    adjustmentNote: String(r.adjustment_note ?? ""),
    sourceMessageId: r.source_message_id == null || r.source_message_id === "" ? null : Number(r.source_message_id),
    createdAt: String(r.created_at ?? ""),
    etapa,
    etapaLabel: labelEtapa(etapa),
  };
}

async function insertCorteWindow(input: {
  fecha: string;
  motivo: string;
  from: string;
  to: string;
  note?: string;
  sourceMessageId?: number | null;
  corteNo: number;
  etapa?: number;
}) {
  const from = normalizeOpsTime(input.from);
  const to = normalizeOpsTime(input.to);
  if (!from || !to) throw new Error("Horario inválido.");
  const etapa = input.etapa && input.etapa >= 1 ? Math.min(3, input.etapa) : 1;
  const ts = db.isPostgres ? "NOW()" : "datetime('now')";
  await db
    .prepare(
      `INSERT INTO sgi_ops_comunicacion_cortes
        (corte_date, motivo, start_announced, end_announced, start_actual, end_actual, confirmed, adjustment_note, source_message_id, corte_no, etapa, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ${ts})`
    )
    .run(input.fecha, input.motivo, from, to, from, to, input.note || "", input.sourceMessageId ?? null, input.corteNo, etapa);
}

async function ingestCortesFromMessage(opts: {
  messageId: number;
  titulo: string;
  cuerpo: string;
  control?: { fecha?: string; motivo?: string; windows?: Array<{ from: string; to: string }> };
}) {
  const hit = (await db
    .prepare("SELECT id FROM sgi_ops_comunicacion_cortes WHERE source_message_id = ? LIMIT 1")
    .get(opts.messageId)) as Record<string, unknown> | undefined;
  if (hit) return;
  const fromControl = (opts.control?.windows || [])
    .map((w) => ({ from: normalizeOpsTime(w.from), to: normalizeOpsTime(w.to) }))
    .filter((w) => w.from && w.to);
  const fromBody = parseHorarioWindows(opts.cuerpo);
  const windows = fromControl.length ? fromControl : fromBody;
  if (!windows.length) return;
  if (!looksLikeCorte(opts.titulo, opts.cuerpo) && !opts.control) return;
  const fecha = parseFechaIsoFromCuerpo(opts.cuerpo, opts.control?.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  const motivo = String(opts.control?.motivo || defaultCorteMotivo(opts.titulo)).slice(0, 180);
  const corteNo = await nextCorteNo();
  const staged = etapasForWindows(windows);
  for (const w of staged) {
    await insertCorteWindow({
      fecha,
      motivo,
      from: w.from,
      to: w.to,
      sourceMessageId: opts.messageId,
      corteNo,
      etapa: w.etapa,
    });
  }
}

async function listCortes() {
  const rows = (await db
    .prepare(
      `SELECT id, corte_no, etapa, corte_date, motivo, start_announced, end_announced, start_actual, end_actual,
              confirmed, confirmed_at, confirmed_by_email, adjustment_note, source_message_id, created_at
       FROM sgi_ops_comunicacion_cortes ORDER BY corte_no ASC, etapa ASC, start_actual ASC, id ASC LIMIT 400`
    )
    .all()) as Record<string, unknown>[];
  return rows.map(mapCorteRow).filter((x) => x.id > 0);
}

async function backfillCortesFromHistory() {
  const rows = (await db
    .prepare(`SELECT id, titulo, cuerpo FROM sgi_ops_comunicacion ORDER BY id DESC LIMIT 200`)
    .all()) as Record<string, unknown>[];
  for (const raw of rows) {
    const r = rowKeysToLowercase(raw);
    const id = Number(r.id ?? 0);
    if (id <= 0) continue;
    await ingestCortesFromMessage({
      messageId: id,
      titulo: String(r.titulo ?? ""),
      cuerpo: String(r.cuerpo ?? ""),
    });
  }
  await backfillCorteNumbers();
  await backfillEtapas();
}

async function backfillCorteNumbers() {
  const rows = (await db
    .prepare(
      `SELECT id, corte_no, source_message_id FROM sgi_ops_comunicacion_cortes ORDER BY id ASC`
    )
    .all()) as Record<string, unknown>[];
  const byMsg = new Map<number, number>();
  for (const raw of rows) {
    const r = rowKeysToLowercase(raw);
    const id = Number(r.id ?? 0);
    const existing = Number(r.corte_no ?? 0) || 0;
    const msgId = r.source_message_id == null || r.source_message_id === "" ? 0 : Number(r.source_message_id);
    if (existing > 0) {
      if (msgId > 0) byMsg.set(msgId, existing);
      continue;
    }
    let n = msgId > 0 ? byMsg.get(msgId) || 0 : 0;
    if (n <= 0) n = await nextCorteNo();
    if (msgId > 0) byMsg.set(msgId, n);
    await db.prepare("UPDATE sgi_ops_comunicacion_cortes SET corte_no = ? WHERE id = ?").run(n, id);
  }
}

async function backfillEtapas() {
  const rows = (await db
    .prepare(
      `SELECT id, corte_no, start_announced FROM sgi_ops_comunicacion_cortes ORDER BY corte_no ASC, start_announced ASC, id ASC`
    )
    .all()) as Record<string, unknown>[];
  const groups = new Map<number, Array<{ id: number; from: string; to: string }>>();
  for (const raw of rows) {
    const r = rowKeysToLowercase(raw);
    const no = Number(r.corte_no ?? 0) || 0;
    if (no <= 0) continue;
    const list = groups.get(no) || [];
    list.push({
      id: Number(r.id ?? 0),
      from: String(r.start_announced ?? ""),
      to: String(r.start_announced ?? ""),
    });
    groups.set(no, list);
  }
  for (const [, list] of groups) {
    const staged = etapasForWindows(list.map((x) => ({ from: x.from, to: x.to })));
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row) continue;
      const etapa = staged[i]?.etapa || i + 1;
      await db.prepare("UPDATE sgi_ops_comunicacion_cortes SET etapa = ? WHERE id = ?").run(etapa, row.id);
    }
  }
}

async function corteIdByMessageId(): Promise<Map<number, { corteNo: number; corteId: string }>> {
  const rows = (await db
    .prepare(
      `SELECT source_message_id, corte_no, etapa
       FROM sgi_ops_comunicacion_cortes
       WHERE source_message_id IS NOT NULL AND corte_no > 0
       ORDER BY etapa ASC, id ASC`
    )
    .all()) as Record<string, unknown>[];
  const grouped = new Map<number, Array<{ no: number; etapa: number }>>();
  for (const raw of rows) {
    const r = rowKeysToLowercase(raw);
    const mid = Number(r.source_message_id ?? 0);
    const n = Number(r.corte_no ?? 0) || 0;
    const etapa = Number(r.etapa ?? 1) || 1;
    if (mid <= 0 || n <= 0) continue;
    const list = grouped.get(mid) || [];
    list.push({ no: n, etapa });
    grouped.set(mid, list);
  }
  const map = new Map<number, { corteNo: number; corteId: string }>();
  for (const [mid, list] of grouped) {
    const ids = [...new Set(list.map((x) => formatCorteId(x.no, x.etapa)))];
    map.set(mid, { corteNo: list[0]?.no || 0, corteId: ids.join(" · ") });
  }
  return map;
}

const TgRecipientSchema = z.object({
  chatId: z.string().min(1).max(64),
  name: z.string().max(80).optional(),
  username: z.string().max(32).optional(),
  poolUser: z.string().max(80).optional(),
});

const TgSchema = z.object({
  enabled: z.boolean(),
  chatId: z.string().optional().nullable(),
  botToken: z.string().optional().nullable(),
  recipients: z.array(TgRecipientSchema).max(MAX_OPS_RECIPIENTS).optional(),
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

opsComunicacionRouter.post("/ops-comunicacion/translate", ...readMw, async (req, res, next) => {
  try {
    const text = String((req.body as { text?: unknown } | undefined)?.text ?? "").slice(0, 8000);
    const translated = await translateEsToEn(text);
    res.json({ ok: true, text: translated });
  } catch (e) {
    next(e);
  }
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
    const copy = await loadCopySettings();
    const titles = await listTitulos();
    const messages = await listMensajes();
    let settings = await loadTgSettings();
    try {
      const enriched = await enrichRecipientNames(settings.recipients);
      if (JSON.stringify(enriched) !== JSON.stringify(settings.recipients)) {
        settings = await saveTgSettings({ enabled: settings.enabled, recipients: enriched });
      } else {
        settings = { ...settings, recipients: enriched };
      }
    } catch {
      /* Telegram getChat no debe tumbar la página */
    }
    await backfillCortesFromHistory().catch(() => undefined);
    const corteIds = await corteIdByMessageId().catch(() => new Map<number, { corteNo: number; corteId: string }>());
    res.json({
      items: rows.map((x) => {
        const base = mapItem(x, copy.categories);
        const hit = corteIds.get(base.id);
        return { ...base, corteNo: hit?.corteNo || 0, corteId: hit?.corteId || "" };
      }),
      categories: copy.categories,
      telegramHeader: copy.telegramHeader,
      telegramRecipientCount: settings.chatIds.length,
      telegramRecipients: settings.recipients,
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
    if (item) {
      await ingestCortesFromMessage({
        messageId: item.id,
        titulo: item.titulo,
        cuerpo: item.cuerpo,
        control: data.corteControl,
      }).catch(() => undefined);
    }
    if (data.sendNow && item) {
      const settings = await loadTgSettings();
      const dest = settings.chatIds.length ? settings.chatIds : settings.chatId ? [settings.chatId] : [];
      if (!settings.enabled || dest.length === 0) {
        return res.status(400).json({
          error: {
            message: "El comunicado se guardó, pero Telegram no está listo. Activá el bot y agregá al menos un cliente (chat privado) en el engranaje.",
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

opsComunicacionRouter.get("/ops-comunicacion/cortes", ...readMw, async (_req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    await backfillCortesFromHistory().catch(() => undefined);
    const items = await listCortes();
    const hoursAnnounced = items.reduce((s, x) => s + x.hoursAnnounced, 0);
    const hoursActual = items.reduce((s, x) => s + x.hoursActual, 0);
    res.json({
      ok: true,
      items,
      totals: {
        ventanas: items.length,
        hoursAnnounced,
        hoursActual,
        deltaHours: hoursActual - hoursAnnounced,
      },
    });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.post("/ops-comunicacion/cortes", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const parsed = CorteCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Completá fecha, motivo e inicio/fin." } });
    }
    const sameDay = (await db
      .prepare(
        `SELECT corte_no, etapa FROM sgi_ops_comunicacion_cortes WHERE corte_date = ? AND corte_no > 0 ORDER BY etapa ASC, id ASC`
      )
      .all(parsed.data.fecha)) as Record<string, unknown>[];
    let corteNo = 0;
    let etapa = parsed.data.etapa || 0;
    const first = sameDay[0];
    if (first) {
      corteNo = Number(rowKeysToLowercase(first).corte_no ?? 0) || 0;
      const used = new Set(sameDay.map((x) => Number(rowKeysToLowercase(x).etapa ?? 1) || 1));
      if (!etapa) etapa = used.has(1) ? 2 : 1;
    } else {
      corteNo = await nextCorteNo();
      if (!etapa) {
        etapa = etapasForWindows([{ from: parsed.data.from, to: parsed.data.to }])[0]?.etapa || 1;
      }
    }
    await insertCorteWindow({
      fecha: parsed.data.fecha,
      motivo: parsed.data.motivo,
      from: parsed.data.from,
      to: parsed.data.to,
      note: parsed.data.note,
      corteNo,
      etapa,
    });
    const items = await listCortes();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.put("/ops-comunicacion/cortes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const parsed = CortePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Horario real inválido." } });
    }
    const startActual = normalizeOpsTime(parsed.data.startActual);
    const endActual = normalizeOpsTime(parsed.data.endActual);
    if (!startActual || !endActual) {
      return res.status(400).json({ error: { message: "Horario real inválido." } });
    }
    const current = (await db
      .prepare("SELECT id FROM sgi_ops_comunicacion_cortes WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
    if (!current) return res.status(404).json({ error: { message: "Ventana no encontrada." } });
    const confirmed = parsed.data.confirmed ? 1 : 0;
    const email = String(req.user?.email ?? "").trim();
    const ts = db.isPostgres ? "NOW()" : "datetime('now')";
    if (confirmed) {
      await db
        .prepare(
          `UPDATE sgi_ops_comunicacion_cortes
           SET start_actual = ?, end_actual = ?, confirmed = 1, confirmed_at = ${ts}, confirmed_by_email = ?,
               adjustment_note = ?, motivo = COALESCE(NULLIF(?, ''), motivo)
           WHERE id = ?`
        )
        .run(startActual, endActual, email, parsed.data.adjustmentNote || "", parsed.data.motivo || "", id);
    } else {
      await db
        .prepare(
          `UPDATE sgi_ops_comunicacion_cortes
           SET start_actual = ?, end_actual = ?, confirmed = 0, confirmed_at = NULL, confirmed_by_email = '',
               adjustment_note = ?, motivo = COALESCE(NULLIF(?, ''), motivo)
           WHERE id = ?`
        )
        .run(startActual, endActual, parsed.data.adjustmentNote || "", parsed.data.motivo || "", id);
    }
    const items = await listCortes();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

opsComunicacionRouter.delete("/ops-comunicacion/cortes/:id", ...writeMw, async (req, res, next) => {
  try {
    await ensureOpsComunicacionSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    await db.prepare("DELETE FROM sgi_ops_comunicacion_cortes WHERE id = ?").run(id);
    const items = await listCortes();
    res.json({ ok: true, items });
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
        error: { message: "Activá Telegram y agregá al menos un cliente (chat privado) en el engranaje de Comunicación." },
      });
    }
    const sentTo = await deliverToTelegram(item.titulo, item.cuerpo, item.categoria, item.imageUrl, dest);
    const sentTs = db.isPostgres ? "NOW()" : "datetime('now')";
    await db.prepare(`UPDATE sgi_ops_comunicacion SET telegram_sent = 1, sent_at = ${sentTs} WHERE id = ?`).run(id);
    await ingestCortesFromMessage({
      messageId: item.id,
      titulo: item.titulo,
      cuerpo: item.cuerpo,
    }).catch(() => undefined);
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
    let settings = await loadTgSettings();
    const enriched = await enrichRecipientNames(settings.recipients);
    if (JSON.stringify(enriched) !== JSON.stringify(settings.recipients)) {
      settings = await saveTgSettings({ enabled: settings.enabled, recipients: enriched });
    } else {
      settings = { ...settings, recipients: enriched };
    }
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
    const current = await loadTgSettings();
    const fromBody = (parsed.data.recipients ?? [])
      .map(recipientFromUnknown)
      .filter((x): x is OpsRecipient => Boolean(x));
    const fromChat = recipientFromUnknown(parsed.data.chatId);
    const recipients =
      parsed.data.recipients != null ? mergeRecipients(fromBody) : mergeRecipients(current.recipients, fromChat ? [fromChat] : []);
    if (parsed.data.enabled && recipients.length === 0) {
      return res.status(400).json({
        error: {
          message:
            "Agregá al menos un cliente: que le mande /start a @hashrate_operations_bot y usá «Detectar chats», o pegá su Chat ID (número positivo, chat privado).",
        },
      });
    }
    const saved = await saveTgSettings({
      enabled: parsed.data.enabled,
      recipients,
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
      const fromBody = (parsed.data.recipients ?? [])
        .map(recipientFromUnknown)
        .filter((x): x is OpsRecipient => Boolean(x));
      const fromChat = recipientFromUnknown(parsed.data.chatId);
      const recipients =
        parsed.data.recipients != null
          ? mergeRecipients(fromBody)
          : mergeRecipients(settings.recipients, fromChat ? [fromChat] : []);
      if (parsed.data.botToken || parsed.data.recipients != null || fromChat) {
        settings = await saveTgSettings({
          enabled: parsed.data.enabled ?? true,
          recipients,
          botToken: parsed.data.botToken ?? undefined,
        });
      }
    }
    if (!settings.chatIds.length) {
      return res.status(400).json({ error: { message: "Guardá primero al menos un cliente (chat privado) en la lista." } });
    }
    const sentTo = await deliverToTelegram(
      "Prueba Comunicación granja HRS",
      "Si ves esto, el bot de operaciones de la granja ya funciona.",
      "general",
      "",
      settings.chatIds
    );
    res.json({ ok: true, via: "telegram", sentTo, ...telegramPayload(settings) });
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
    const found = await listRecentTelegramPrivateChats(50, token, { privateOnly: true });
    const chats = found.filter((c) => isOpsPrivateUserId(c.chatId));
    const ident = await getTelegramBotIdentity(token).catch(() => null);
    res.json({
      chats,
      hint: chats.length
        ? undefined
        : ident?.username
          ? `Cada cliente tiene que abrir https://t.me/${ident.username} y mandar /start. Después volvé a detectar.`
          : "Cada cliente abre el bot, manda /start y volvés a detectar chats privados.",
    });
  } catch (e) {
    next(e);
  }
});
