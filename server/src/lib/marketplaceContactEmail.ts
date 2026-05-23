import {
  effectiveResendFromEmail,
  effectiveResendFromEmailOrDefault,
  normalizeResendApiKey,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";
import { CANONICAL_PUBLIC_ORIGIN } from "./publicAppOrigin.js";

const RESEND_API_URL = "https://api.resend.com/emails";
/** Buzón fijo de ventas/operaciones: todas las consultas del marketplace van acá. */
const MARKETPLACE_SALES_INBOX = "sales@hashrate.space";
const DEFAULT_SUBJECT_PREFIX = "[Hashrate Space]";

function marketplaceSalesInbox(): string {
  return MARKETPLACE_SALES_INBOX;
}

let warnedMissingEnv = false;

export type MarketplaceContactEmailPayload = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  phone: string;
  message: string;
  siteOrigin?: string;
};

export type MarketplaceAsicInquiryEmailPayload = {
  visitorEmail: string;
  visitorName?: string;
  subject: string;
  message: string;
  /** `cart`: consulta desde el carrito de cotización (texto genérico al cliente). */
  source?: "asic" | "cart";
  siteOrigin?: string;
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

function isResendTestingRecipientRestriction(status: number, bodyText: string): boolean {
  if (status !== 403 && status !== 422) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes("only send testing") ||
    t.includes("testing emails") ||
    t.includes("send emails to other recipients") ||
    t.includes("you can only send testing emails") ||
    (t.includes("recipient") && t.includes("testing"))
  );
}

function parseResendSandboxInboxFrom403(bodyText: string): string | null {
  try {
    const j = JSON.parse(bodyText) as { message?: string };
    const msg = String(j.message || "");
    const m = msg.match(/\(\s*([^\s)]+@[^)\s]+)\s*\)/);
    if (m?.[1]) return m[1].trim().toLowerCase();
  } catch {
    /* ignore */
  }
  return null;
}

function resendFromCandidates(): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t || out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };
  add(effectiveResendFromEmail());
  add("Hashrate Space <noreply@mail.hashrate.space>");
  if (out.length === 0) add(effectiveResendFromEmailOrDefault());
  return out;
}

async function resendPostEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ res: Response; bodyText: string }> {
  const payload: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  };
  if (opts.replyTo?.trim()) payload.reply_to = opts.replyTo.trim();
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  return { res, bodyText };
}

async function resendDeliverWithFromFallback(args: {
  apiKey: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  devLogTag: string;
}): Promise<{ simulated: boolean; resendId?: string }> {
  const { apiKey, to, replyTo, subject, text, html, devLogTag } = args;
  const fromCandidates = resendFromCandidates();
  if (fromCandidates.length === 0) {
    throw new Error("Definí RESEND_FROM_EMAIL con un remitente verificado (ej. noreply@mail.hashrate.space).");
  }

  let lastRes!: Response;
  let lastBody = "";
  let sendFrom = fromCandidates[0]!;

  for (let i = 0; i < fromCandidates.length; i++) {
    sendFrom = fromCandidates[i]!;
    const attempt = await resendPostEmail({ apiKey, from: sendFrom, to, replyTo, subject, text, html });
    lastRes = attempt.res;
    lastBody = attempt.bodyText;
    if (lastRes.ok) break;
    if (lastRes.status === 401) break;
    const detail = resendErrorDetail(lastBody);
    if (lastRes.status === 403 && resend403UnverifiedFromDomain(detail) && i < fromCandidates.length - 1) {
      continue;
    }
    break;
  }

  if (!lastRes.ok && lastRes.status === 403) {
    const detail403 = resendErrorDetail(lastBody);
    if (isResendTestingRecipientRestriction(lastRes.status, lastBody)) {
      const sandboxInbox = parseResendSandboxInboxFrom403(lastBody);
      throw new Error(
        `Resend está en modo prueba: solo permite enviar a ${sandboxInbox ?? "el buzón de la cuenta Resend"}. ` +
          `Verificá el dominio mail.hashrate.space en Resend o usá una API key de producción.`
      );
    }
    if (resend403UnverifiedFromDomain(detail403)) {
      throw new Error(
        `Resend rechazó el remitente (${sendFrom}). Usá RESEND_FROM_EMAIL con @mail.hashrate.space verificado.`
      );
    }
  }

  if (!lastRes.ok) {
    const detail = resendErrorDetail(lastBody);
    throw new Error(`Resend API ${lastRes.status}: ${detail}`);
  }

  let resendId: string | undefined;
  try {
    const j = JSON.parse(lastBody) as { id?: string };
    resendId = j.id;
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(`[email] ${devLogTag} enviado a ${to}${resendId ? ` (id: ${resendId})` : ""} desde ${sendFrom}`);
  return { simulated: false, resendId };
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
          : `[email] ${devLogTag} omitido: falta RESEND_API_KEY en Vercel/Render.`
      );
    }
    throw new Error("El envío de correo no está configurado en el servidor (RESEND_API_KEY).");
  }

  // eslint-disable-next-line no-console
  console.log(`[email] Enviando ${devLogTag} a ${to}…`);
  return resendDeliverWithFromFallback({ apiKey, to, replyTo, subject, text, html, devLogTag });
}

/**
 * Envía el formulario «Contacto» del marketplace por Resend (servidor).
 */
export async function sendMarketplaceContactEmail(p: MarketplaceContactEmailPayload): Promise<{ simulated: boolean }> {
  const to = marketplaceSalesInbox();
  const subjectPrefix = (process.env.MARKETPLACE_CONTACT_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();
  const siteOrigin = (p.siteOrigin || CANONICAL_PUBLIC_ORIGIN).trim();

  const first = clip(p.firstName || "—", 120);
  const last = clip(p.lastName || "—", 120);
  const email = clip(p.email || "—", 254);
  const subj = clip(p.subject || "—", 200);
  const phone = clip(p.phone || "—", 50);
  const message = clip(p.message || "—", 2000);

  const subject = `${subjectPrefix} Contacto: ${subj}`.trim();

  const text = [
    "Mensaje desde el formulario de contacto del marketplace.",
    `Sitio: ${siteOrigin}`,
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
      <p style="margin:0 0 12px"><strong>Sitio:</strong> <a href="${escapeHtml(siteOrigin)}">${escapeHtml(siteOrigin)}</a></p>
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
 * Consulta por correo desde ficha ASIC o carrito.
 */
export async function sendMarketplaceAsicInquiryEmail(p: MarketplaceAsicInquiryEmailPayload): Promise<{
  simulated: boolean;
}> {
  const to = marketplaceSalesInbox();
  const subjectPrefix = (process.env.MARKETPLACE_INQUIRY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();
  const siteOrigin = (p.siteOrigin || CANONICAL_PUBLIC_ORIGIN).trim();

  const email = clip(p.visitorEmail || "—", 254);
  const name = clip(p.visitorName || "—", 120);
  const subjectLine = clip(p.subject || "—", 250);
  const message = clip(p.message || "—", 4000);
  const fromCart = p.source === "cart";

  const subject = `${subjectPrefix} ${fromCart ? "Consulta carrito" : "Consulta ASIC"}: ${subjectLine}`.trim();

  const text = [
    fromCart
      ? "Consulta por correo desde el carrito de cotización (marketplace)."
      : "Consulta por correo desde la ficha de producto ASIC (marketplace).",
    `Sitio: ${siteOrigin}`,
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
      <p style="margin:0 0 12px"><strong>Sitio:</strong> <a href="${escapeHtml(siteOrigin)}">${escapeHtml(siteOrigin)}</a></p>
      <ul style="margin:0 0 14px 18px;padding:0">
        <li><strong>Correo:</strong> ${escapeHtml(email)}</li>
        <li><strong>Nombre:</strong> ${escapeHtml(name)}</li>
        <li><strong>Asunto:</strong> ${escapeHtml(subjectLine)}</li>
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
