/**
 * Telegram Bot API: avisos del Wire cripto (texto libre).
 * https://core.telegram.org/bots/api#sendmessage
 */

export type CryptoWireNewsItem = {
  title: string;
  sourceName?: string;
  url?: string;
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

function wireSalaUrl(): string {
  const base = (process.env.APP_PUBLIC_URL || "https://hashrate.space").replace(/\/$/, "");
  return `${base}/gestion-administrativa/noticias`;
}

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
  const lines = head.map((it, i) => {
    const src = String(it.sourceName ?? "").trim();
    const title = clip(it.title, 160);
    return `${i + 1}) ${title}${src ? ` (${clip(src, 40)})` : ""}`;
  });
  if (extra > 0) lines.push(`+${extra} más en la sala de redacción`);
  return [
    `📡 Wire cripto HRS · ${list.length} nueva${list.length === 1 ? "" : "s"}`,
    "",
    ...lines,
    "",
    wireSalaUrl(),
  ].join("\n");
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
  body?: Record<string, unknown>
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el servidor");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
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

export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");
  const j = await telegramFetchJson("sendMessage", {
    chat_id: chatIdForApi(chat),
    text: clip(text, 3900),
    disable_web_page_preview: true,
  });
  if (!j.ok) throw new Error(`Telegram API: ${clip(j.description || "error", 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] mensaje OK → ${chat}`);
}

export type CryptoWireTelegramResult = {
  sent: boolean;
  reason?: string;
  chatId?: string;
};

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
  items: CryptoWireNewsItem[]
): Promise<CryptoWireTelegramResult> {
  const list = items.filter((x) => String(x.title ?? "").trim());
  if (!list.length) return { sent: false, reason: "sin_items" };
  let chat = normalizeTelegramChatId(chatId);
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  const digest = formatCryptoWireTelegramDigest(list);

  const trySend = async (id: string) => {
    await sendTelegramText(id, digest);
  };

  if (chat) {
    try {
      await trySend(chat);
      return { sent: true, chatId: chat };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isTelegramChatMissingError(msg)) throw e;
    }
  }

  const discovered = await listRecentTelegramPrivateChats(10);
  const fallback = discovered[0]?.chatId;
  if (fallback) {
    await trySend(fallback);
    return { sent: true, chatId: fallback };
  }

  const ident = await getTelegramBotIdentity().catch(() => null);
  const raw = chat ? "chat not found" : "chat_invalido";
  throw new Error(explainTelegramSendFailure(raw, ident?.username || getTelegramBotStatus().botUsernameHint));
}
