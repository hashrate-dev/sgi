import {
  effectiveResendFromEmail,
  normalizeResendApiKey,
  RESEND_DEFAULT_ONBOARDING_FROM,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";

/**
 * Avisos por email (Resend) al pasar a `orden_lista`:
 * - `notifyMarketplaceOrderEmail` / `notifyMarketplaceOrderGeneradaEmail`: solo si el cliente envía
 *   `confirmGenerarOrden: true` en `POST /marketplace/quote-sync` con `event: submit_ticket` (botón «Generar orden»).
 *   Los `sync` del carrito (cambios de ítems con orden ya creada) no llevan ese flag → sin correos Resend.
 * En desarrollo, si falta la API key, el texto se registra en consola (MARKETPLACE_EMAIL_DEV_CONSOLE=0 para silenciar).
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_TO = "sales@hashrate.space";
const DEFAULT_SUBJECT_PREFIX = "[Marketplace]";
const DEFAULT_PANEL_URL = "https://app.hashrate.space/cotizaciones-marketplace";

let warnedMissingEnv = false;
let warnedOnboardingExternalTo = false;
let loggedResendDeliveryHint = false;

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

function resendErrorDetail(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { message?: string; error?: string };
    return String(j.message || j.error || bodyText);
  } catch {
    return bodyText;
  }
}

function resend403UnverifiedFromDomain(detail: string): boolean {
  const d = detail.toLowerCase();
  return (
    d.includes("not verified") ||
    d.includes("verify your domain") ||
    d.includes("domain is not verified") ||
    d.includes("unauthorized domain")
  );
}

async function resendPostEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ res: Response; bodyText: string }> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  const bodyText = await res.text();
  return { res, bodyText };
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
  // eslint-disable-next-line no-console
  console.log(`[email] aviso marketplace (handler) orden=${String(p.orderNumber || "?").slice(0, 24)} ticket=${String(p.ticketCode || "?").slice(0, 16)}`);
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
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

  if (!apiKey || resendApiKeyLooksInvalid(apiKey)) {
    const devConsole =
      process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin envío Resend) aviso marketplace → destino sería ${to}\n${subject}\n${text}${
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
          ? "[email] Aviso marketplace omitido: RESEND_API_KEY inválida (no uses token Vercel ni re_vcp_…)."
          : "[email] Aviso marketplace omitido: falta RESEND_API_KEY."
      );
    }
    return;
  }

  const toLower = to.toLowerCase();
  const isResendTestInbox = toLower.endsWith("@resend.dev");
  if (from === RESEND_DEFAULT_ONBOARDING_FROM && !isResendTestInbox && !warnedOnboardingExternalTo) {
    warnedOnboardingExternalTo = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[email] Enviando desde remitente de prueba (${from}) hacia ${to}. Resend a menudo no entrega a buzones externos en este modo. Si no llega: probá MARKETPLACE_NOTIFY_EMAIL_TO=delivered@resend.dev, el email de tu cuenta Resend, o verificá dominio y RESEND_FROM_EMAIL.`
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[email] Enviando aviso marketplace a ${to} (desde ${from})…`);

  let sendFrom = from;
  let { res, bodyText } = await resendPostEmail({
    apiKey,
    from: sendFrom,
    to,
    subject,
    text,
    html,
  });

  if (!res.ok && res.status === 403 && sendFrom !== RESEND_DEFAULT_ONBOARDING_FROM) {
    const detail403 = resendErrorDetail(bodyText);
    if (resend403UnverifiedFromDomain(detail403)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[email] Resend rechazó el remitente (${sendFrom}): dominio no verificado. Reintentando con ${RESEND_DEFAULT_ONBOARDING_FROM}. Verificá tu dominio en https://resend.com/domains (p. ej. mail.hashrate.space) y usá From con ese dominio o comentá RESEND_FROM_EMAIL en .env.resend.local hasta entonces.`
      );
      sendFrom = RESEND_DEFAULT_ONBOARDING_FROM;
      const second = await resendPostEmail({
        apiKey,
        from: sendFrom,
        to,
        subject,
        text,
        html,
      });
      res = second.res;
      bodyText = second.bodyText;
      if (sendFrom === RESEND_DEFAULT_ONBOARDING_FROM && !isResendTestInbox && !warnedOnboardingExternalTo) {
        warnedOnboardingExternalTo = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[email] Enviando desde remitente de prueba (${sendFrom}) hacia ${to}. Resend a menudo no entrega a buzones externos en este modo. Si no llega: probá MARKETPLACE_NOTIFY_EMAIL_TO=delivered@resend.dev, el email de tu cuenta Resend, o verificá dominio y RESEND_FROM_EMAIL.`
        );
      }
    }
  }

  if (!res.ok) {
    const detail = resendErrorDetail(bodyText);
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }

  try {
    const j = JSON.parse(bodyText) as { id?: string };
    // eslint-disable-next-line no-console
    console.log(`[email] Aviso de orden marketplace enviado a ${to}${j.id ? ` (id: ${j.id})` : ""}`);
    if (!loggedResendDeliveryHint) {
      loggedResendDeliveryHint = true;
      // eslint-disable-next-line no-console
      console.log(
        `[email] Entrega: el log anterior es la respuesta OK de Resend, no garantiza que ${to} lo tenga en la bandeja. Revisá spam, filtros de Google/Microsoft, y en https://resend.com/emails el estado (delivered / bounced). Sin dominio verificado, desde onboarding@resend.dev a menudo no llega a buzones externos.`
      );
    }
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[email] Aviso de orden marketplace enviado a ${to}`);
  }
}

/** Resend: cliente en ABIERTA (`enviado_consulta`) confirmó «Generar orden» → `orden_lista`. */
export async function notifyMarketplaceOrderGeneradaEmail(p: MarketplaceOrderEmailPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[email] ORDEN GENERADA (Resend) orden=${String(p.orderNumber || "?").slice(0, 24)} ticket=${String(p.ticketCode || "?").slice(0, 16)}`
  );
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const from = effectiveResendFromEmail();
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || DEFAULT_TO).trim();
  const subjectPrefix = (process.env.MARKETPLACE_NOTIFY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();
  const panelUrl = (process.env.MARKETPLACE_QUOTES_PANEL_URL || DEFAULT_PANEL_URL).trim();

  const order = clip(p.orderNumber || "—", 64);
  const ticket = clip(p.ticketCode || "—", 64);
  const contact = clip(p.contactEmail || "—", 200);
  const subtotal = clip(moneyUsd(p.subtotalUsd), 64);
  const panelLink = panelUrl || DEFAULT_PANEL_URL;
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
        <a href="${panelLink}" target="_blank" rel="noreferrer">Abrir panel de cotizaciones marketplace</a>
      </p>
    </div>
  `.trim();

  if (!apiKey || resendApiKeyLooksInvalid(apiKey)) {
    const devConsole =
      process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin envío Resend) ORDEN GENERADA → destino sería ${to}\n${subject}\n${text}${
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
          ? "[email] ORDEN GENERADA omitida: RESEND_API_KEY inválida (no uses token Vercel ni re_vcp_…)."
          : "[email] ORDEN GENERADA omitida: falta RESEND_API_KEY."
      );
    }
    return;
  }

  const toLower = to.toLowerCase();
  const isResendTestInbox = toLower.endsWith("@resend.dev");
  if (from === RESEND_DEFAULT_ONBOARDING_FROM && !isResendTestInbox && !warnedOnboardingExternalTo) {
    warnedOnboardingExternalTo = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[email] Enviando desde remitente de prueba (${from}) hacia ${to}. Resend a menudo no entrega a buzones externos en este modo. Si no llega: probá MARKETPLACE_NOTIFY_EMAIL_TO=delivered@resend.dev, el email de tu cuenta Resend, o verificá dominio y RESEND_FROM_EMAIL.`
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[email] Enviando ORDEN GENERADA (Resend) a ${to} (desde ${from})…`);

  let sendFrom = from;
  let { res, bodyText } = await resendPostEmail({
    apiKey,
    from: sendFrom,
    to,
    subject,
    text,
    html,
  });

  if (!res.ok && res.status === 403 && sendFrom !== RESEND_DEFAULT_ONBOARDING_FROM) {
    const detail403 = resendErrorDetail(bodyText);
    if (resend403UnverifiedFromDomain(detail403)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[email] Resend rechazó el remitente (${sendFrom}): dominio no verificado. Reintentando con ${RESEND_DEFAULT_ONBOARDING_FROM}. Verificá tu dominio en https://resend.com/domains (p. ej. mail.hashrate.space) y usá From con ese dominio o comentá RESEND_FROM_EMAIL en .env.resend.local hasta entonces.`
      );
      sendFrom = RESEND_DEFAULT_ONBOARDING_FROM;
      const second = await resendPostEmail({
        apiKey,
        from: sendFrom,
        to,
        subject,
        text,
        html,
      });
      res = second.res;
      bodyText = second.bodyText;
      if (sendFrom === RESEND_DEFAULT_ONBOARDING_FROM && !isResendTestInbox && !warnedOnboardingExternalTo) {
        warnedOnboardingExternalTo = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[email] Enviando desde remitente de prueba (${sendFrom}) hacia ${to}. Resend a menudo no entrega a buzones externos en este modo. Si no llega: probá MARKETPLACE_NOTIFY_EMAIL_TO=delivered@resend.dev, el email de tu cuenta Resend, o verificá dominio y RESEND_FROM_EMAIL.`
        );
      }
    }
  }

  if (!res.ok) {
    const detail = resendErrorDetail(bodyText);
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }

  try {
    const j = JSON.parse(bodyText) as { id?: string };
    // eslint-disable-next-line no-console
    console.log(`[email] ORDEN GENERADA enviada a ${to}${j.id ? ` (id: ${j.id})` : ""}`);
    if (!loggedResendDeliveryHint) {
      loggedResendDeliveryHint = true;
      // eslint-disable-next-line no-console
      console.log(
        `[email] Entrega: el log anterior es la respuesta OK de Resend, no garantiza que ${to} lo tenga en la bandeja. Revisá spam, filtros de Google/Microsoft, y en https://resend.com/emails el estado (delivered / bounced). Sin dominio verificado, desde onboarding@resend.dev a menudo no llega a buzones externos.`
      );
    }
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[email] ORDEN GENERADA enviada a ${to}`);
  }
}

