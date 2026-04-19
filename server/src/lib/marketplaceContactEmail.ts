import {
  effectiveResendFromEmail,
  normalizeResendApiKey,
  RESEND_DEFAULT_ONBOARDING_FROM,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_CONTACT_TO = "sales@hashrate.space";
const DEFAULT_SUBJECT_PREFIX = "[Marketplace contact]";

let warnedMissingEnv = false;
let warnedOnboardingExternalTo = false;

export type MarketplaceContactEmailPayload = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  phone: string;
  message: string;
};

export type MarketplaceAsicInquiryEmailPayload = {
  visitorEmail: string;
  visitorName?: string;
  subject: string;
  message: string;
  /** `cart`: consulta desde el carrito de cotización (texto genérico al cliente). */
  source?: "asic" | "cart";
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  replyTo: string;
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
      reply_to: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  const bodyText = await res.text();
  return { res, bodyText };
}

async function deliverMarketplaceResendEmail(args: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  devLogTag: string;
}): Promise<{ simulated: boolean }> {
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const fromInitial = effectiveResendFromEmail();
  const { to, replyTo, subject, text, html, devLogTag } = args;

  const devConsole =
    process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
  if (!apiKey || resendApiKeyLooksInvalid(apiKey)) {
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin envío Resend) ${devLogTag} → destino sería ${to}\nreply_to: ${replyTo}\n${subject}\n${text}`
      );
      return { simulated: true };
    }
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      // eslint-disable-next-line no-console
      console.warn(
        apiKey && resendApiKeyLooksInvalid(apiKey)
          ? `[email] ${devLogTag} omitido: RESEND_API_KEY inválida.`
          : `[email] ${devLogTag} omitido: falta RESEND_API_KEY.`
      );
    }
    throw new Error("El envío de correo no está configurado en el servidor (RESEND_API_KEY).");
  }

  let from = fromInitial || RESEND_DEFAULT_ONBOARDING_FROM;
  if (!from) from = RESEND_DEFAULT_ONBOARDING_FROM;

  const toLower = to.toLowerCase();
  const isResendTestInbox = toLower.endsWith("@resend.dev");
  if (from === RESEND_DEFAULT_ONBOARDING_FROM && !isResendTestInbox && !warnedOnboardingExternalTo) {
    warnedOnboardingExternalTo = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[email] ${devLogTag}: remitente de prueba (${from}) hacia ${to}. Si no llega, verificá dominio en Resend o usá un buzón @resend.dev para pruebas.`
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[email] Enviando ${devLogTag} a ${to} (desde ${from})…`);

  let sendFrom = from;
  let { res, bodyText } = await resendPostEmail({
    apiKey,
    from: sendFrom,
    to,
    replyTo,
    subject,
    text,
    html,
  });

  if (!res.ok && res.status === 403 && sendFrom !== RESEND_DEFAULT_ONBOARDING_FROM) {
    const detail403 = resendErrorDetail(bodyText);
    if (resend403UnverifiedFromDomain(detail403)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[email] Resend rechazó el remitente (${sendFrom}). Reintentando con ${RESEND_DEFAULT_ONBOARDING_FROM}.`
      );
      sendFrom = RESEND_DEFAULT_ONBOARDING_FROM;
      const second = await resendPostEmail({
        apiKey,
        from: sendFrom,
        to,
        replyTo,
        subject,
        text,
        html,
      });
      res = second.res;
      bodyText = second.bodyText;
    }
  }

  if (!res.ok) {
    const detail = resendErrorDetail(bodyText);
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }

  return { simulated: false };
}

/**
 * Envía el formulario «Contacto» del marketplace por Resend (servidor).
 * Sin SMTP.js en el navegador: la clave queda solo en el backend.
 */
export async function sendMarketplaceContactEmail(p: MarketplaceContactEmailPayload): Promise<{ simulated: boolean }> {
  const to = (
    process.env.MARKETPLACE_CONTACT_EMAIL_TO ||
    process.env.MARKETPLACE_NOTIFY_EMAIL_TO ||
    DEFAULT_CONTACT_TO
  ).trim();
  const subjectPrefix = (process.env.MARKETPLACE_CONTACT_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();

  const first = clip(p.firstName || "—", 120);
  const last = clip(p.lastName || "—", 120);
  const email = clip(p.email || "—", 254);
  const subj = clip(p.subject || "—", 200);
  const phone = clip(p.phone || "—", 50);
  const message = clip(p.message || "—", 2000);

  const subject = `${subjectPrefix || DEFAULT_SUBJECT_PREFIX} ${subj}`.trim();

  const text = [
    "Mensaje desde el formulario de contacto del marketplace.",
    "",
    `Nombre: ${first}`,
    `Apellido: ${last}`,
    `Correo: ${email}`,
    `Teléfono: ${phone}`,
    "",
    message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">Contacto marketplace</h2>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><strong>Nombre:</strong> ${escapeHtml(first)}</li>
        <li><strong>Apellido:</strong> ${escapeHtml(last)}</li>
        <li><strong>Correo:</strong> ${escapeHtml(email)}</li>
        <li><strong>Teléfono:</strong> ${escapeHtml(phone)}</li>
        <li><strong>Asunto:</strong> ${escapeHtml(subj)}</li>
      </ul>
      <p style="margin:0;font-weight:700">Mensaje</p>
      <pre style="margin:8px 0 0;font-family:inherit;white-space:pre-wrap">${escapeHtml(message)}</pre>
    </div>
  `.trim();

  return deliverMarketplaceResendEmail({
    to,
    replyTo: email,
    subject,
    text,
    html,
    devLogTag: "contacto marketplace",
  });
}

/**
 * Consulta por correo desde la ficha ASIC.
 * Destino por defecto = mismo buzón que contacto/notificaciones (`sales@…`), compatible con Resend en modo prueba
 * (sin dominio verificado no podés enviar a buzones arbitrarios p. ej. dl@).
 * Para usar otro buzón (p. ej. dl@hashrate.space): verificá el dominio en resend.com/domains y definí `MARKETPLACE_ASIC_INQUIRY_EMAIL_TO`.
 */
export async function sendMarketplaceAsicInquiryEmail(p: MarketplaceAsicInquiryEmailPayload): Promise<{
  simulated: boolean;
}> {
  const to = (
    process.env.MARKETPLACE_ASIC_INQUIRY_EMAIL_TO ||
    process.env.MARKETPLACE_CONTACT_EMAIL_TO ||
    process.env.MARKETPLACE_NOTIFY_EMAIL_TO ||
    DEFAULT_CONTACT_TO
  ).trim();
  const email = clip(p.visitorEmail || "—", 254);
  const name = clip(p.visitorName || "—", 120);
  const subject = clip(p.subject || "—", 250);
  const message = clip(p.message || "—", 4000);
  const fromCart = p.source === "cart";

  const text = [
    fromCart
      ? "Consulta por correo desde el carrito de cotización (marketplace)."
      : "Consulta por correo desde la ficha de producto ASIC (marketplace).",
    "",
    `Correo del visitante: ${email}`,
    `Nombre (opcional): ${name}`,
    "",
    message,
  ].join("\n");

  const heading = fromCart ? "Consulta — carrito (marketplace)" : "Consulta ASIC — marketplace";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><strong>Correo:</strong> ${escapeHtml(email)}</li>
        <li><strong>Nombre:</strong> ${escapeHtml(name)}</li>
        <li><strong>Asunto:</strong> ${escapeHtml(subject)}</li>
      </ul>
      <p style="margin:0;font-weight:700">Mensaje</p>
      <pre style="margin:8px 0 0;font-family:inherit;white-space:pre-wrap">${escapeHtml(message)}</pre>
    </div>
  `.trim();

  return deliverMarketplaceResendEmail({
    to,
    replyTo: email,
    subject,
    text,
    html,
    devLogTag: fromCart ? "consulta carrito marketplace" : "consulta ASIC marketplace",
  });
}
