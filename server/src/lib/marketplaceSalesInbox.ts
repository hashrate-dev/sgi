import { normalizeEmailRecipients } from "./smtpDeliver.js";

const DEFAULT_SALES_INBOX = "sales@hashrate.space";

/** Buzón principal de ventas/operaciones (contacto, consultas, órdenes). */
export function resolveMarketplaceSalesInbox(): string {
  const contact = String(process.env.MARKETPLACE_CONTACT_EMAIL_TO || "").trim();
  const notify = String(process.env.MARKETPLACE_NOTIFY_EMAIL_TO || "").trim();
  return contact || notify || DEFAULT_SALES_INBOX;
}

/** Destinatarios finales (principal + CC/relay opcionales). */
export function resolveMarketplaceSalesRecipients(): string[] {
  const primary = resolveMarketplaceSalesInbox();
  const extras = String(process.env.MARKETPLACE_SALES_EMAIL_CC || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const relay = String(
    process.env.MARKETPLACE_SALES_EMAIL_RELAY || process.env.PASSWORD_RESET_RESEND_RELAY_TO || ""
  ).trim();

  const out: string[] = [];
  const add = (email: string) => {
    const merged = normalizeEmailRecipients([...out, email]);
    out.length = 0;
    out.push(...merged);
  };

  add(primary);
  for (const e of extras) add(e);
  if (relay) add(relay);

  return out.length > 0 ? out : [DEFAULT_SALES_INBOX];
}
