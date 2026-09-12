import { looksLikeEnglish } from "./cryptoNoticiasTranslate.js";

export type CryptoWireNewsItem = {
  title: string;
  summary?: string;
  sourceName?: string;
  url?: string;
  imageUrl?: string;
  /** Link pasa por Google Translate (EN → ES); en el traductor se puede ver el original. */
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

function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function articleLink(raw?: string): string {
  const url = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/hashrate\.space\/gestion-administrativa\/noticias/i.test(url)) return "";
  return url;
}

/**
 * Noticia en inglés → abre el medio vía Google Translate (español),
 * con la barra para volver al texto original. Si ya está en español, link directo.
 */
export function wireArticleOpenUrl(
  articleUrl: string,
  originalTitle: string,
  originalSummary = ""
): { url: string; readTranslated: boolean } {
  const url = articleLink(articleUrl);
  if (!url) return { url: "", readTranslated: false };
  if (/translate\.google\./i.test(url) || /translatetheweb\.com/i.test(url)) {
    return { url, readTranslated: true };
  }
  const english = looksLikeEnglish(originalTitle) || looksLikeEnglish(originalSummary);
  if (!english) return { url, readTranslated: false };
  const wrapped = `https://translate.google.com/translate?hl=es&sl=en&tl=es&u=${encodeURIComponent(url)}`;
  return { url: wrapped, readTranslated: true };
}

export type CryptoWireTelegramResult = {
  sent: boolean;
  reason?: string;
  chatId?: string;
};

export function getTelegramBotStatus(): TelegramBotStatus {
  return {
    tokenConfigured: Boolean(botToken()),
    defaultChatId: String(process.env.TELEGRAM_CHAT_ID || "").trim(),
    botUsernameHint: String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, ""),
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
    return [`${i + 1}) ${title}${src ? ` (${clip(src, 40)})` : ""}`, url].filter(Boolean).join("\n");
  });
  if (extra > 0) blocks.push(`+${extra} más`);
  return [`📡 Wire cripto HRS · ${list.length} nueva${list.length === 1 ? "" : "s"}`, "", ...blocks].join("\n");
}

/** Caption / cuerpo de una noticia: foto arriba (sendPhoto), título, descripción y link al artículo. */
export function formatCryptoWireArticleHtml(item: CryptoWireNewsItem): string {
  const url = articleLink(item.url);
  const readLabel = item.readTranslated ? "Leer en español:" : "Leer la noticia:";
  const footer = url ? `\n\n${readLabel}\n${escapeTelegramHtml(url)}` : "";
  const src = clip(String(item.sourceName ?? "").trim(), 60);
  const title = escapeTelegramHtml(clip(String(item.title ?? "").replace(/\s+/g, " ").trim(), 220));
  const head = `<b>${title}</b>${src ? `\n<i>${escapeTelegramHtml(src)}</i>` : ""}`;
  const budget = Math.max(0, 1024 - head.length - footer.length - 2);
  const summary = clip(String(item.summary ?? "").replace(/\s+/g, " ").trim(), budget);
  const mid = summary ? `\n\n${escapeTelegramHtml(summary)}` : "";
  return `${head}${mid}${footer}`;
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
  timeoutMs = 12_000
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const token = botToken();
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

export async function getTelegramBotIdentity(): Promise<{ username: string; id: string; name: string } | null> {
  const j = await telegramFetchJson("getMe");
  if (!j.ok || !j.result || typeof j.result !== "object") return null;
  const r = j.result as { id?: number; username?: string; first_name?: string };
  return {
    id: String(r.id ?? ""),
    username: String(r.username ?? "").replace(/^@/, ""),
    name: String(r.first_name ?? r.username ?? "bot"),
  };
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
  opts?: { html?: boolean; disablePreview?: boolean }
): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const j = await telegramFetchJson("sendMessage", {
    chat_id: chatIdForApi(chat),
    text: clip(text, 3900),
    disable_web_page_preview: opts?.disablePreview !== false,
    ...(opts?.html ? { parse_mode: "HTML" } : {}),
  });
  if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] mensaje OK → ${chat}`);
}

export async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const photo = String(photoUrl || "").trim();
  if (!/^https?:\/\//i.test(photo)) throw new Error("URL de imagen inválida");
  const j = await telegramFetchJson(
    "sendPhoto",
    {
      chat_id: chatIdForApi(chat),
      photo,
      caption: clip(caption, 1024),
      parse_mode: "HTML",
    },
    20_000
  );
  if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] foto OK → ${chat}`);
}

export async function notifyCryptoWireTelegramArticle(
  chatId: string,
  item: CryptoWireNewsItem
): Promise<CryptoWireTelegramResult> {
  const title = String(item.title ?? "").trim();
  if (!title) return { sent: false, reason: "sin_items" };
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) return { sent: false, reason: "chat_invalido" };
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  const caption = formatCryptoWireArticleHtml({ ...item, title });
  const photo = String(item.imageUrl ?? "").trim();
  if (/^https?:\/\//i.test(photo)) {
    try {
      await sendTelegramPhoto(chat, photo, caption);
      return { sent: true, chatId: chat };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[telegram] sendPhoto falló, envío texto", e instanceof Error ? e.message : e);
    }
  }
  await sendTelegramText(chat, caption, { html: true, disablePreview: !articleLink(item.url) });
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

export async function listRecentTelegramPrivateChats(limit = 8): Promise<
  Array<{ chatId: string; name: string; username?: string }>
> {
  await telegramFetchJson("deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
  const j = await telegramFetchJson("getUpdates?limit=50");
  if (!j.ok) throw new Error(j.description || "getUpdates falló");
  const rows = Array.isArray(j.result) ? (j.result as Record<string, unknown>[]) : [];
  const byId = new Map<string, { chatId: string; name: string; username?: string }>();
  for (const u of rows) {
    const chat = pickChatFromUpdate(u);
    if (!chat?.id) continue;
    if (chat.type !== "private" && chat.type !== "group" && chat.type !== "supergroup") continue;
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
  return [...byId.values()].slice(-Math.max(1, Math.min(20, limit))).reverse();
}

export async function notifyCryptoWireTelegram(
  chatId: string,
  items: CryptoWireNewsItem[],
  opts?: { discover?: boolean }
): Promise<CryptoWireTelegramResult> {
  const list = items.filter((x) => String(x.title ?? "").trim());
  if (!list.length) return { sent: false, reason: "sin_items" };
  const chat = normalizeTelegramChatId(chatId);
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  const digest = formatCryptoWireTelegramDigest(list);
  const discover = opts?.discover !== false;

  if (chat) {
    try {
      await sendTelegramText(chat, digest);
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
    await sendTelegramText(fallback, digest);
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
