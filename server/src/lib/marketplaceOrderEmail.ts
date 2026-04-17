import { effectiveResendFromEmail } from "../config/resendFrom.js";

/**
 * Aviso por email (Resend) cuando una orden marketplace pasa de borrador a enviada.
 * En desarrollo, si falta la API key, el mismo texto se registra en consola
 * (desactivar con MARKETPLACE_EMAIL_DEV_CONSOLE=0). En producción sin credenciales, no envía.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_TO = "sales@hashrate.space";
const DEFAULT_SUBJECT_PREFIX = "[Marketplace]";
const DEFAULT_PANEL_URL = "https://app.hashrate.space/cotizaciones-marketplace";

let warnedMissingEnv = false;

export type MarketplaceOrderEmailPayload = {
  orderNumber: string;
  ticketCode: string;
  contactEmail: string;
  subtotalUsd: number;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function moneyUsd(v: number): string {
  return `${Number(v || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

/**
 * Envía un email transaccional por Resend.
 * Requiere:
 * - RESEND_API_KEY
 * - RESEND_FROM_EMAIL opcional (si falta y hay key, se usa onboarding@resend.dev)
 * Opcionales:
 * - MARKETPLACE_NOTIFY_EMAIL_TO (default sales@hashrate.space)
 * - MARKETPLACE_NOTIFY_SUBJECT_PREFIX (default [Marketplace])
 * - MARKETPLACE_QUOTES_PANEL_URL (default https://app.hashrate.space/cotizaciones-marketplace)
 */
export async function notifyMarketplaceOrderEmail(p: MarketplaceOrderEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = effectiveResendFromEmail();
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || DEFAULT_TO).trim();
  const subjectPrefix = (process.env.MARKETPLACE_NOTIFY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();
  const panelUrl = (process.env.MARKETPLACE_QUOTES_PANEL_URL || DEFAULT_PANEL_URL).trim();

  const order = clip(p.orderNumber || "—", 64);
  const ticket = clip(p.ticketCode || "—", 64);
  const contact = clip(p.contactEmail || "—", 200);
  const subtotal = clip(moneyUsd(p.subtotalUsd), 64);
  const panelLink = panelUrl || DEFAULT_PANEL_URL;
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
        <a href="${panelLink}" target="_blank" rel="noreferrer">Abrir panel de cotizaciones marketplace</a>
      </p>
    </div>
  `.trim();

  if (!apiKey) {
    const devConsole =
      process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin Resend) aviso marketplace → destino sería ${to}\n${subject}\n${text}`
      );
      return;
    }
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      // eslint-disable-next-line no-console
      console.warn("[email] Aviso marketplace omitido: falta RESEND_API_KEY.");
    }
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    let detail = bodyText;
    try {
      const j = JSON.parse(bodyText) as { message?: string; error?: string };
      detail = String(j.message || j.error || bodyText);
    } catch {
      /* keep raw text */
    }
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }

  try {
    const j = JSON.parse(bodyText) as { id?: string };
    // eslint-disable-next-line no-console
    console.log(`[email] Aviso de orden marketplace enviado a ${to}${j.id ? ` (id: ${j.id})` : ""}`);
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[email] Aviso de orden marketplace enviado a ${to}`);
  }
}

