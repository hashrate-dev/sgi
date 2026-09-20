function clip(s: unknown, max: number): string {
  const t = String(s ?? "")
    .trim()
    .replace(/\u0000/g, "");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Español, inglés y cierre de firma, en ese orden (el cierre queda al final del Telegram). */
export function composeBilingualOpsCuerpo(es: string, en: string, cierre?: string): string {
  const left = String(es || "").replace(/\r\n/g, "\n").trim();
  const right = String(en || "").replace(/\r\n/g, "\n").trim();
  const sign = String(cierre || "").replace(/\r\n/g, "\n").trim();
  const parts: string[] = [];
  if (left) parts.push(left);
  if (right && right !== left) parts.push(`────────\n\n${right}`);
  const core = parts.join("\n\n");
  if (!sign) return core;
  if (!core) return sign;
  return `${core}\n\n${sign}`;
}

/** Misma plantilla HTML que envía el backend a Telegram. */
export function formatOpsFarmTelegramHtml(opts: {
  title: string;
  body: string;
  categoryLabel?: string;
  headerLine?: string;
}): string {
  const title = escapeTelegramHtml(clip(opts.title.replace(/\s+/g, " "), 180));
  const body = escapeTelegramHtml(clip(opts.body.replace(/\r\n/g, "\n"), 3800));
  const cat = opts.categoryLabel ? escapeTelegramHtml(opts.categoryLabel) : "";
  const header = escapeTelegramHtml(
    clip(String(opts.headerLine || "Comunicación granja HRS").replace(/^\s*⚡\s*/u, "").replace(/\s+/g, " "), 80)
  );
  const lines = [`⚡ <b>${header}</b>`];
  if (cat) lines.push(`<i>${cat}</i>`);
  lines.push("", `<b>${title}</b>`);
  if (body) lines.push("", body);
  return lines.join("\n");
}

export function telegramHtmlToPreviewMarkup(html: string): string {
  return html.replace(/\n/g, "<br/>");
}
