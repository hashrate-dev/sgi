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

/** Misma plantilla HTML que envía el backend a Telegram. */
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
  if (body) lines.push("", body);
  return lines.join("\n");
}

export function telegramHtmlToPreviewMarkup(html: string): string {
  return html.replace(/\n/g, "<br/>");
}
