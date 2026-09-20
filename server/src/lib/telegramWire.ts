import { stockPhotoForNewsTitle, telegramPhotoForTitle } from "./cryptoNoticiasBot.js";
import { toPublisherSpanishUrl } from "./newsPublisherSpanishUrl.js";

export type CryptoWireNewsItem = {
  title: string;
  summary?: string;
  sourceName?: string;
  url?: string;
  /** URL del medio (para preview / original). */
  publisherUrl?: string;
  /** Google Translate website sobre el medio. */
  translateUrl?: string;
  imageUrl?: string;
  readTranslated?: boolean;
};

export type TelegramBotStatus = {
  tokenConfigured: boolean;
  defaultChatId: string;
  botUsernameHint: string;
};

function clip(s: unknown, max: number): string {
  const t = String(s ?? "")
    .trim()
    .replace(/\u0000/g, "");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Evita que el bundler de Vercel reemplace `process.env.NOMBRE` en build (Secret = vacío). */
function runtimeEnv(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = env ? env[name] : undefined;
  return String(raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function botToken(explicit?: string): string {
  const t = String(explicit ?? "").trim();
  if (t) return t;
  return runtimeEnv("TELEGRAM_BOT_TOKEN");
}

/** Bot de Comunicación: token guardado, TELEGRAM_OPS_BOT_TOKEN, o el del wire. */
export function opsComunicacionBotToken(stored?: string): string {
  const fromStore = String(stored ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (fromStore) return fromStore;
  const ops = runtimeEnv("TELEGRAM_OPS_BOT_TOKEN");
  if (ops) return ops;
  return runtimeEnv("TELEGRAM_BOT_TOKEN");
}

export function getOpsTelegramBotStatus(storedToken?: string): TelegramBotStatus {
  return {
    tokenConfigured: Boolean(opsComunicacionBotToken(storedToken)),
    defaultChatId: runtimeEnv("TELEGRAM_OPS_CHAT_ID") || runtimeEnv("TELEGRAM_CHAT_ID"),
    botUsernameHint: (runtimeEnv("TELEGRAM_OPS_BOT_USERNAME") || runtimeEnv("TELEGRAM_BOT_USERNAME")).replace(/^@/, ""),
  };
}

function articleLink(raw?: string): string {
  const url = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/hashrate\.space\/gestion-administrativa\/noticias/i.test(url)) return "";
  return url;
}

/** Cualquier URL http de la noticia, incluido Google News si no hay medio. */
function newsOpenUrl(item: CryptoWireNewsItem): string {
  for (const raw of [item.publisherUrl, item.url, item.translateUrl]) {
    const url = articleLink(raw);
    if (!url) continue;
    const h = hostOfUrl(url);
    if (/(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$|(^|\.)ggpht\.com$/.test(h)) continue;
    if (/\.(jpe?g|png|webp|gif|svg)(?:$|\?)/i.test(url)) continue;
    return toPublisherSpanishUrl(url);
  }
  return "";
}

function hostOfUrl(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isGoogleNewsArticleUrl(raw: string): boolean {
  const h = hostOfUrl(raw);
  return h === "news.google.com" || h.endsWith(".news.google.com") || h.includes("news-google-com");
}

function isArticlePageUrl(raw: string): boolean {
  const url = articleLink(raw);
  if (!url) return false;
  const h = hostOfUrl(url);
  if (!h) return false;
  if (isGoogleNewsArticleUrl(url)) return false;
  if (/(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$|(^|\.)ggpht\.com$/.test(h)) return false;
  if (/\.(jpe?g|png|webp|gif|svg)(?:$|\?)/i.test(url)) return false;
  if (/=w(\d+)/i.test(url) && Number(url.match(/=w(\d+)/i)?.[1] || 0) < 200) return false;
  return true;
}

function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Abre el medio en su propio dominio vía *.translate.goog (barra ES / original). */
export function toTranslateGoogUrl(articleUrl: string, sl = "en", tl = "es"): string {
  let u: URL;
  try {
    u = new URL(articleUrl);
  } catch {
    return "";
  }
  if (u.hostname.endsWith(".translate.goog")) {
    u.searchParams.set("_x_tr_sl", sl);
    u.searchParams.set("_x_tr_tl", tl);
    u.searchParams.set("_x_tr_hl", tl);
    return u.toString();
  }
  const googHost = `${u.hostname.toLowerCase().replace(/\./g, "-")}.translate.goog`;
  const out = new URL(`${u.pathname}${u.search}${u.hash}`, `https://${googHost}`);
  out.searchParams.set("_x_tr_sl", sl);
  out.searchParams.set("_x_tr_tl", tl);
  out.searchParams.set("_x_tr_hl", tl);
  if (u.protocol === "http:") out.searchParams.set("_x_tr_sch", "http");
  return out.toString();
}

function innerUrlFromGoogleTranslate(raw: string): string {
  try {
    const u = new URL(raw);
    if (!/translate\.google\./i.test(u.hostname)) return "";
    return String(u.searchParams.get("u") || "").trim();
  } catch {
    return "";
  }
}

function decodeNewsText(s: string): string {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => {
      const c = Number(n);
      return Number.isFinite(c) && c > 0 ? String.fromCharCode(c) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Visor oficial de Google: traduce el HTML del medio (no el wrapper de Google News).
 * En la barra se puede volver al inglés.
 */
export function googleWebsiteTranslateUrl(publisherUrl: string): string {
  const u = articleLink(publisherUrl);
  if (!u || isGoogleNewsArticleUrl(u)) return "";
  return `https://translate.google.com/website?sl=en&tl=es&hl=es&u=${encodeURIComponent(u)}`;
}

export function wireArticleOpenUrl(
  articleUrl: string,
  _originalTitle?: string,
  _originalSummary = ""
): { url: string; readTranslated: boolean; publisherUrl: string; translateUrl: string } {
  let url = articleLink(articleUrl);
  if (!url) return { url: "", readTranslated: false, publisherUrl: "", translateUrl: "" };
  const inner = innerUrlFromGoogleTranslate(url);
  if (inner) url = inner;
  url = toPublisherSpanishUrl(url);
  return { url, readTranslated: false, publisherUrl: url, translateUrl: "" };
}

export type CryptoWireTelegramResult = {
  sent: boolean;
  reason?: string;
  chatId?: string;
};

export function getTelegramBotStatus(): TelegramBotStatus {
  return {
    tokenConfigured: Boolean(botToken()),
    defaultChatId: runtimeEnv("TELEGRAM_CHAT_ID"),
    botUsernameHint: runtimeEnv("TELEGRAM_BOT_USERNAME").replace(/^@/, ""),
  };
}

export function normalizeTelegramChatId(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  // @canal o @usuario público
  if (t.startsWith("@")) return t;
  // chat id numérico (puede ser negativo para grupos)
  if (/^-?\d+$/.test(t)) return t;
  // usuario sin @: lo tratamos como @user
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t)) return `@${t}`;
  return t.replace(/\s+/g, "");
}

export function formatOpsFarmTelegramHtml(opts: {
  title: string;
  body: string;
  categoryLabel?: string;
  headerLine?: string;
}): string {
  const title = escapeTelegramHtml(clip(opts.title.replace(/\s+/g, " "), 180));
  const body = escapeTelegramHtml(clip(opts.body.replace(/\r\n/g, "\n"), 3200));
  const cat = opts.categoryLabel ? escapeTelegramHtml(opts.categoryLabel) : "";
  const header = escapeTelegramHtml(
    clip(String(opts.headerLine || "Comunicación granja HRS").replace(/^\s*⚡\s*/u, "").replace(/\s+/g, " "), 80)
  );
  const lines = [`⚡ <b>${header}</b>`];
  if (cat) lines.push(`<i>${cat}</i>`);
  lines.push("", `<b>${title}</b>`);
  if (body) lines.push("", body.replace(/\n/g, "\n"));
  return lines.join("\n");
}

export function formatCryptoWireTelegramDigest(items: CryptoWireNewsItem[], opts?: { maxItems?: number }): string {
  const maxItems = Math.max(1, Math.min(12, opts?.maxItems ?? 5));
  const list = items.filter((x) => String(x.title ?? "").trim());
  const head = list.slice(0, maxItems);
  const extra = Math.max(0, list.length - head.length);
  const blocks = head.map((it, i) => {
    const src = String(it.sourceName ?? "").trim();
    const title = clip(it.title.replace(/\s+/g, " "), 160);
    const url = articleLink(it.url);
    return [`${i + 1}) ${title}${src ? ` (${clip(src, 40)})` : ""}`, url].filter(Boolean).join("\n");
  });
  if (extra > 0) blocks.push(`+${extra} más`);
  return [`📡 Wire cripto HRS · ${list.length} nueva${list.length === 1 ? "" : "s"}`, "", ...blocks].join("\n");
}

/** Foto + título completo + comentario + link para entrar. */
export function formatCryptoWireArticleCaption(item: CryptoWireNewsItem): string {
  const rawTitle = decodeNewsText(item.title).replace(/\s+/g, " ").trim();
  const title = escapeTelegramHtml(rawTitle);
  const openUrl = newsOpenUrl(item);
  const footer = openUrl ? `\n\n${escapeTelegramHtml(openUrl)}` : "";
  const head = `<b>${title}</b>`;
  const budget = Math.max(80, 1024 - head.length - footer.length - 2);
  const blurb = clip(decodeNewsText(item.summary || ""), budget);
  const mid = blurb ? `\n\n${escapeTelegramHtml(blurb)}` : "";
  const caption = `${head}${mid}${footer}`;
  return caption.length > 1024 ? caption.slice(0, 1024) : caption;
}

export function isTelegramChatMissingError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("chat not found") ||
    m.includes("can't initiate conversation") ||
    m.includes("bot was blocked") ||
    m.includes("user is deactivated") ||
    m.includes("forbidden")
  );
}

export async function telegramFetchJson(
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 12_000,
  tokenOverride?: string
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const token = botToken(tokenOverride);
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el servidor");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      signal: ac.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as { ok: boolean; description?: string; result?: unknown };
    } catch {
      return { ok: false, description: clip(text, 280) };
    }
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    throw new Error(aborted ? "Telegram no respondió a tiempo. Probá de nuevo en unos segundos." : String(e instanceof Error ? e.message : e));
  } finally {
    clearTimeout(timer);
  }
}

export async function getTelegramBotIdentity(
  tokenOverride?: string
): Promise<{ username: string; id: string; name: string } | null> {
  const j = await telegramFetchJson("getMe", undefined, 12_000, tokenOverride);
  if (!j.ok || !j.result || typeof j.result !== "object") return null;
  const r = j.result as { id?: number; username?: string; first_name?: string };
  return {
    id: String(r.id ?? ""),
    username: String(r.username ?? "").replace(/^@/, ""),
    name: String(r.first_name ?? r.username ?? "bot"),
  };
}

export async function getTelegramPrivateUserLabel(
  chatId: string,
  tokenOverride?: string
): Promise<{ name: string; username?: string } | null> {
  const chat = normalizeTelegramChatId(chatId);
  if (!/^\d{5,20}$/.test(chat)) return null;
  const j = await telegramFetchJson("getChat", { chat_id: chat }, 8_000, tokenOverride);
  if (!j.ok || !j.result || typeof j.result !== "object") return null;
  const r = j.result as { first_name?: string; last_name?: string; username?: string; title?: string };
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || String(r.title ?? "").trim() || String(r.username ?? "").trim();
  const username = String(r.username ?? "").replace(/^@/, "").trim();
  if (!name && !username) return null;
  return username ? { name: name || username, username } : { name: name || chat };
}

function chatIdForApi(chat: string): string | number {
  return /^-?\d+$/.test(chat) ? Number(chat) : chat;
}

export function explainTelegramSendFailure(raw: string, botUsername?: string): string {
  const user = botUsername ? `@${botUsername.replace(/^@/, "")}` : "tu bot";
  const link = botUsername ? `https://t.me/${botUsername.replace(/^@/, "")}` : "el enlace t.me que te dio BotFather";
  if (isTelegramChatMissingError(raw)) {
    return (
      `El bot ${user} todavía no tiene un chat abierto con vos. ` +
      `Abrí ${link} , tocá Start (o mandá /start) y después «Enviar prueba» otra vez. ` +
      `Tiene que ser ESE bot (el del token de Vercel), no el de Get ID.`
    );
  }
  return clip(raw, 280);
}

export async function sendTelegramText(
  chatId: string,
  text: string,
  opts?: { html?: boolean; disablePreview?: boolean; token?: string }
): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const j = await telegramFetchJson(
    "sendMessage",
    {
      chat_id: chatIdForApi(chat),
      text: clip(text, 3900),
      disable_web_page_preview: opts?.disablePreview !== false,
      ...(opts?.html ? { parse_mode: "HTML" } : {}),
    },
    12_000,
    opts?.token
  );
  if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] mensaje OK → ${chat}`);
}

export async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption: string,
  tokenOverride?: string
): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const photo = String(photoUrl || "").trim();
  if (!/^https?:\/\//i.test(photo)) throw new Error("URL de imagen inválida");
  const captionClipped = caption.length > 1024 ? `${caption.slice(0, 1023)}…` : caption;
  const uploaded = await uploadTelegramPhoto(chat, photo, captionClipped, tokenOverride);
  if (uploaded) return;
  const j = await telegramFetchJson(
    "sendPhoto",
    {
      chat_id: chatIdForApi(chat),
      photo,
      caption: captionClipped,
      parse_mode: "HTML",
    },
    20_000,
    tokenOverride
  );
  if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] foto OK → ${chat}`);
}

async function uploadTelegramPhoto(chat: string, photoUrl: string, caption: string, tokenOverride?: string): Promise<boolean> {
  const token = botToken(tokenOverride);
  if (!token) return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 14_000);
  try {
    const imgRes = await fetch(photoUrl, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!imgRes.ok) return false;
    const ct = (imgRes.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase() || "";
    if (ct.includes("svg") || (ct && !ct.startsWith("image/") && ct !== "application/octet-stream")) return false;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 120 || buf.length > 9_000_000) return false;
    const mime = ct.startsWith("image/") ? ct : "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
    const form = new FormData();
    form.append("chat_id", String(chatIdForApi(chat)));
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([new Uint8Array(buf)], { type: mime }), `noticia.${ext}`);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: ac.signal,
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!j.ok) return false;
    // eslint-disable-next-line no-console
    console.log(`[telegram] foto subida OK → ${chat}`);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramPhotoBuffer(chatId: string, png: Buffer, caption: string): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el servidor");
  const captionClipped = caption.length > 1024 ? `${caption.slice(0, 1023)}…` : caption;
  const form = new FormData();
  form.append("chat_id", String(chatIdForApi(chat)));
  form.append("caption", captionClipped);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "noticia.png");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: ac.signal,
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
    console.log(`[telegram] foto buffer OK → ${chat}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyCryptoWireTelegramArticle(
  chatId: string,
  item: CryptoWireNewsItem
): Promise<CryptoWireTelegramResult> {
  const title = decodeNewsText(item.title ?? "");
  if (!title) return { sent: false, reason: "sin_items" };
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) return { sent: false, reason: "chat_invalido" };
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  const caption = formatCryptoWireArticleCaption({ ...item, title });
  let photo = telegramPhotoForTitle(title, String(item.imageUrl ?? "").trim());
  if (!/^https?:\/\//i.test(photo)) {
    photo = stockPhotoForNewsTitle(title);
  }

  if (/^https?:\/\//i.test(photo)) {
    try {
      await sendTelegramPhoto(chat, photo, caption);
      return { sent: true, chatId: chat };
    } catch (e) {
      console.warn("[telegram] sendPhoto URL falló, reintento stock", e instanceof Error ? e.message : e);
    }
  }

  const fallback = stockPhotoForNewsTitle(title);
  await sendTelegramPhoto(chat, fallback, caption);
  return { sent: true, chatId: chat };
}

export async function notifyCryptoWireTelegramArticleMany(
  chatIds: string[],
  item: CryptoWireNewsItem
): Promise<{ sent: number; failed: number; lastError?: string }> {
  const ids = [...new Set(chatIds.map((x) => normalizeTelegramChatId(x)).filter(Boolean))];
  if (!ids.length) return { sent: 0, failed: 0, lastError: "sin_chats" };
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const id of ids) {
    try {
      const r = await notifyCryptoWireTelegramArticle(id, item);
      if (r.sent) sent += 1;
      else {
        failed += 1;
        lastError = r.reason;
      }
    } catch (e) {
      failed += 1;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (sent === 0 && lastError) throw new Error(lastError);
  return { sent, failed, lastError };
}

function pickChatFromUpdate(u: Record<string, unknown>): { id: number; type?: string; first_name?: string; last_name?: string; username?: string; title?: string } | null {
  const bags = [u.message, u.edited_message, u.my_chat_member, u.chat_member, u.channel_post];
  for (const b of bags) {
    if (!b || typeof b !== "object") continue;
    const chat = (b as { chat?: Record<string, unknown> }).chat;
    if (chat && typeof chat.id === "number") {
      return chat as { id: number; type?: string; first_name?: string; last_name?: string; username?: string; title?: string };
    }
  }
  return null;
}

export async function listRecentTelegramPrivateChats(
  limit = 8,
  tokenOverride?: string,
  opts?: { privateOnly?: boolean }
): Promise<
  Array<{ chatId: string; name: string; username?: string }>
> {
  await telegramFetchJson("deleteWebhook", { drop_pending_updates: false }, 12_000, tokenOverride).catch(() => undefined);
  const j = await telegramFetchJson("getUpdates?limit=100", undefined, 12_000, tokenOverride);
  if (!j.ok) throw new Error(j.description || "getUpdates falló");
  const rows = Array.isArray(j.result) ? (j.result as Record<string, unknown>[]) : [];
  const byId = new Map<string, { chatId: string; name: string; username?: string }>();
  for (const u of rows) {
    const chat = pickChatFromUpdate(u);
    if (!chat?.id) continue;
    if (opts?.privateOnly) {
      if (chat.type !== "private") continue;
    } else if (chat.type !== "private" && chat.type !== "group" && chat.type !== "supergroup") {
      continue;
    }
    const chatId = String(chat.id);
    const name =
      chat.type === "private"
        ? [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || chatId
        : chat.title || chatId;
    byId.set(chatId, {
      chatId,
      name,
      ...(chat.username ? { username: chat.username } : {}),
    });
  }
  return [...byId.values()].slice(-Math.max(1, Math.min(50, limit))).reverse();
}

export async function notifyCryptoWireTelegram(
  chatId: string,
  items: CryptoWireNewsItem[],
  opts?: { discover?: boolean }
): Promise<CryptoWireTelegramResult> {
  const list = items.filter((x) => String(x.title ?? "").trim()).slice(0, 6);
  if (!list.length) return { sent: false, reason: "sin_items" };
  const chat = normalizeTelegramChatId(chatId);
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  const discover = opts?.discover !== false;

  const sendCards = async (to: string) => {
    for (const item of list) {
      await notifyCryptoWireTelegramArticle(to, item);
    }
  };

  if (chat) {
    try {
      await sendCards(chat);
      return { sent: true, chatId: chat };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!discover || !isTelegramChatMissingError(msg)) throw e;
    }
  }

  if (!discover) return { sent: false, reason: "chat_invalido", chatId: chat || undefined };

  const discovered = await listRecentTelegramPrivateChats(10);
  const fallback = discovered[0]?.chatId;
  if (fallback) {
    await sendCards(fallback);
    return { sent: true, chatId: fallback };
  }

  const ident = await getTelegramBotIdentity().catch(() => null);
  const raw = chat ? "chat not found" : "chat_invalido";
  throw new Error(explainTelegramSendFailure(raw, ident?.username || getTelegramBotStatus().botUsernameHint));
}

export async function notifyCryptoWireTelegramMany(
  chatIds: string[],
  items: CryptoWireNewsItem[]
): Promise<{ sent: number; failed: number; lastError?: string }> {
  const ids = [...new Set(chatIds.map((x) => normalizeTelegramChatId(x)).filter(Boolean))];
  if (!ids.length) return { sent: 0, failed: 0, lastError: "sin_chats" };
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const id of ids) {
    try {
      const r = await notifyCryptoWireTelegram(id, items, { discover: false });
      if (r.sent) sent += 1;
      else {
        failed += 1;
        lastError = r.reason;
      }
    } catch (e) {
      failed += 1;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (sent === 0 && lastError) throw new Error(lastError);
  return { sent, failed, lastError };
}
