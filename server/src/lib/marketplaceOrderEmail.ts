import {
  normalizeResendApiKey,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";
import {
  DEFAULT_MARKETPLACE_ORDERS_PANEL_URL,
  normalizeLegacyHashratePublicUrl,
  resolveMarketplaceOrdersPanelUrl,
} from "./publicAppOrigin.js";
import { deliverResendEmailWithFromFallback } from "./resendDeliver.js";

/**
 * Avisos por email (Resend) al pasar a `orden_lista`:
 * - `notifyMarketplaceOrderEmail` / `notifyMarketplaceOrderGeneradaEmail`: solo si el cliente envía
 *   `confirmGenerarOrden: true` en `POST /marketplace/quote-sync` con `event: submit_ticket` (botón «Generar orden»).
 *   Los `sync` del carrito (cambios de ítems con orden ya creada) no llevan ese flag → sin correos Resend.
 * En desarrollo, si falta la API key, el texto se registra en consola (MARKETPLACE_EMAIL_DEV_CONSOLE=0 para silenciar).
 */

const DEFAULT_TO = "sales@hashrate.space";
const DEFAULT_SUBJECT_PREFIX = "[Marketplace]";
const DEFAULT_PANEL_URL = DEFAULT_MARKETPLACE_ORDERS_PANEL_URL;

let warnedMissingEnv = false;
let loggedResendDeliveryHint = false;

export type MarketplaceOrderEmailPayload = {
  orderNumber: string;
  ticketCode: string;
  contactEmail: string;
  subtotalUsd: number;
  /** Si no se pasa, se usa `MARKETPLACE_QUOTES_PANEL_URL` o el origen del request (sin `app.hashrate.space`). */
  panelUrl?: string;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function moneyUsd(v: number): string {
  return `${Number(v || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function resolvePanelLink(p: MarketplaceOrderEmailPayload): string {
  const explicit = normalizeLegacyHashratePublicUrl(p.panelUrl || "");
  if (explicit) return explicit;
  const fromEnv = normalizeLegacyHashratePublicUrl(process.env.MARKETPLACE_QUOTES_PANEL_URL || "");
  if (fromEnv) return fromEnv;
  return resolveMarketplaceOrdersPanelUrl();
}

function logDeliveryHintOnce(to: string): void {
  if (loggedResendDeliveryHint) return;
  loggedResendDeliveryHint = true;
  // eslint-disable-next-line no-console
  console.log(
    `[email] Entrega: el log anterior es la respuesta OK de Resend, no garantiza que ${to} lo tenga en la bandeja. Revisá spam, filtros de Google/Microsoft, y en https://resend.com/emails el estado (delivered / bounced).`
  );
}

async function sendMarketplaceOrderResend(args: {
  devLogTag: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  if (!apiKey || resendApiKeyLooksInvalid(apiKey)) {
    const devConsole =
      process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin envío Resend) ${args.devLogTag} → destino sería ${args.to}\n${args.subject}\n${args.text}${
          apiKey && resendApiKeyLooksInvalid(apiKey)
            ? "\n\nMotivo: RESEND_API_KEY no es válida (ej. re_vcp_…). Usá solo la clave re_… de https://resend.com/api-keys"
            : ""
        }`
      );
      return;
    }
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      // eslint-disable-next-line no-console
      console.warn(
        apiKey && resendApiKeyLooksInvalid(apiKey)
          ? `[email] ${args.devLogTag} omitido: RESEND_API_KEY inválida.`
          : `[email] ${args.devLogTag} omitido: falta RESEND_API_KEY.`
      );
    }
    return;
  }

  await deliverResendEmailWithFromFallback({
    to: args.to,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.text,
    html: args.html,
    devLogTag: args.devLogTag,
  });
  logDeliveryHintOnce(args.to);
}

/**
 * Envía un email transaccional por Resend.
 */
export async function notifyMarketplaceOrderEmail(p: MarketplaceOrderEmailPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[email] aviso marketplace (handler) orden=${String(p.orderNumber || "?").slice(0, 24)} ticket=${String(p.ticketCode || "?").slice(0, 16)}`);
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || DEFAULT_TO).trim();
  const subjectPrefix = (process.env.MARKETPLACE_NOTIFY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();

  const order = clip(p.orderNumber || "—", 64);
  const ticket = clip(p.ticketCode || "—", 64);
  const contact = clip(p.contactEmail || "—", 200);
  const subtotal = clip(moneyUsd(p.subtotalUsd), 64);
  const panelLink = resolvePanelLink(p) || DEFAULT_PANEL_URL;
  const subject = `${subjectPrefix || DEFAULT_SUBJECT_PREFIX} Nueva orden ${order}`.trim();

  const text = [
    "Se generó una nueva orden en Marketplace.",
    "",
    `Orden: ${order}`,
    `Ticket: ${ticket}`,
    `Cliente: ${contact}`,
    `Subtotal: ${subtotal}`,
    "",
    `Panel: ${panelLink}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">Nueva orden en Marketplace</h2>
      <p style="margin:0 0 12px">Se generó una nueva orden desde el carrito.</p>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><strong>Orden:</strong> ${order}</li>
        <li><strong>Ticket:</strong> ${ticket}</li>
        <li><strong>Cliente:</strong> ${contact}</li>
        <li><strong>Subtotal:</strong> ${subtotal}</li>
      </ul>
      <p style="margin:0">
        <a href="${panelLink}" target="_blank" rel="noreferrer">Abrir login de Tienda Online Hashrate Space</a>
      </p>
    </div>
  `.trim();

  await sendMarketplaceOrderResend({
    devLogTag: "aviso marketplace",
    to,
    subject,
    text,
    html,
    replyTo: contact.includes("@") ? contact : undefined,
  });
}

/** Resend: cliente en ABIERTA (`enviado_consulta`) confirmó «Generar orden» → `orden_lista`. */
export async function notifyMarketplaceOrderGeneradaEmail(p: MarketplaceOrderEmailPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[email] ORDEN GENERADA (Resend) orden=${String(p.orderNumber || "?").slice(0, 24)} ticket=${String(p.ticketCode || "?").slice(0, 16)}`
  );
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || DEFAULT_TO).trim();
  const subjectPrefix = (process.env.MARKETPLACE_NOTIFY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();

  const order = clip(p.orderNumber || "—", 64);
  const ticket = clip(p.ticketCode || "—", 64);
  const contact = clip(p.contactEmail || "—", 200);
  const subtotal = clip(moneyUsd(p.subtotalUsd), 64);
  const panelLink = resolvePanelLink(p) || DEFAULT_PANEL_URL;
  const subject = `${subjectPrefix || DEFAULT_SUBJECT_PREFIX} ORDEN GENERADA ${order}`.trim();

  const text = [
    "ORDEN GENERADA: el cliente confirmó la generación de la orden desde el carrito (estado ABIERTA → orden lista).",
    "",
    `Orden: ${order}`,
    `Ticket: ${ticket}`,
    `Cliente: ${contact}`,
    `Subtotal: ${subtotal}`,
    "",
    `Panel: ${panelLink}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">ORDEN GENERADA</h2>
      <p style="margin:0 0 12px">El cliente pulsó «Generar orden» en el ticket de compra (paso desde consulta enviada / ABIERTA a orden lista).</p>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><strong>Orden:</strong> ${order}</li>
        <li><strong>Ticket:</strong> ${ticket}</li>
        <li><strong>Cliente:</strong> ${contact}</li>
        <li><strong>Subtotal:</strong> ${subtotal}</li>
      </ul>
      <p style="margin:0">
        <a href="${panelLink}" target="_blank" rel="noreferrer">Abrir login de Tienda Online de Hashrate Space
      </p>
    </div>
  `.trim();

  await sendMarketplaceOrderResend({
    devLogTag: "ORDEN GENERADA",
    to,
    subject,
    text,
    html,
    replyTo: contact.includes("@") ? contact : undefined,
  });
}
