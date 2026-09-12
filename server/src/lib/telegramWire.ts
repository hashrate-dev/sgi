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

export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el servidor");
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) throw new Error("Chat ID de Telegram inválido");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text: clip(text, 3900),
      disable_web_page_preview: true,
    }),
  });
  const bodyText = await res.text();
  let ok = res.ok;
  let description = bodyText;
  try {
    const j = JSON.parse(bodyText) as { ok?: boolean; description?: string };
    ok = Boolean(j.ok);
    if (j.description) description = j.description;
  } catch {
    /* keep */
  }
  if (!ok) throw new Error(`Telegram API: ${clip(description, 280)}`);
  // eslint-disable-next-line no-console
  console.log(`[telegram] mensaje OK → ${chat}`);
}

export type CryptoWireTelegramResult = {
  sent: boolean;
  reason?: string;
};

export async function notifyCryptoWireTelegram(
  chatId: string,
  items: CryptoWireNewsItem[]
): Promise<CryptoWireTelegramResult> {
  const list = items.filter((x) => String(x.title ?? "").trim());
  if (!list.length) return { sent: false, reason: "sin_items" };
  const chat = normalizeTelegramChatId(chatId);
  if (!chat) return { sent: false, reason: "chat_invalido" };
  if (!botToken()) return { sent: false, reason: "faltan_credenciales" };
  await sendTelegramText(chat, formatCryptoWireTelegramDigest(list));
  return { sent: true };
}

/** Últimos chats privados que le escribieron al bot (para autocompletar Chat ID). */
export async function listRecentTelegramPrivateChats(limit = 8): Promise<
  Array<{ chatId: string; name: string; username?: string }>
> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en el servidor");
  const url = `https://api.telegram.org/bot${token}/getUpdates?limit=50`;
  const res = await fetch(url);
  const bodyText = await res.text();
  const j = JSON.parse(bodyText) as {
    ok?: boolean;
    description?: string;
    result?: Array<{
      message?: {
        chat?: { id?: number; type?: string; first_name?: string; last_name?: string; username?: string; title?: string };
      };
    }>;
  };
  if (!j.ok) throw new Error(j.description || "getUpdates falló");
  const byId = new Map<string, { chatId: string; name: string; username?: string }>();
  for (const u of j.result ?? []) {
    const chat = u.message?.chat;
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
