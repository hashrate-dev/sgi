import { CANONICAL_PUBLIC_ORIGIN } from "./publicAppOrigin.js";
import { deliverMarketplaceSalesEmail } from "./marketplaceSalesEmailDeliver.js";
import { resolveMarketplaceSalesInbox } from "./marketplaceSalesInbox.js";

const DEFAULT_SUBJECT_PREFIX = "[Hashrate Space]";

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
  orderNumber?: string;
  ticketCode?: string;
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

/**
 * Envía el formulario «Contacto» del marketplace por Resend (servidor).
 */
export async function sendMarketplaceContactEmail(p: MarketplaceContactEmailPayload): Promise<{ simulated: boolean }> {
  const to = resolveMarketplaceSalesInbox();
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

  const r = await deliverMarketplaceSalesEmail({
    to,
    replyTo: email,
    subject,
    text,
    html,
    devLogTag: "contacto marketplace",
  });
  return { simulated: r.simulated };
}

/**
 * Consulta por correo desde ficha ASIC o carrito.
 */
export async function sendMarketplaceAsicInquiryEmail(p: MarketplaceAsicInquiryEmailPayload): Promise<{
  simulated: boolean;
  via: ("smtp" | "resend")[];
}> {
  const to = resolveMarketplaceSalesInbox();
  const subjectPrefix = (process.env.MARKETPLACE_INQUIRY_SUBJECT_PREFIX || DEFAULT_SUBJECT_PREFIX).trim();
  const siteOrigin = (p.siteOrigin || CANONICAL_PUBLIC_ORIGIN).trim();

  const email = clip(p.visitorEmail || "—", 254);
  const name = clip(p.visitorName || "—", 120);
  const subjectLine = clip(p.subject || "—", 250);
  const message = clip(p.message || "—", 4000);
  const fromCart = p.source === "cart";
  const orderNumber = clip(p.orderNumber || "", 40);
  const ticketCode = clip(p.ticketCode || "", 40);
  const ticketRef =
    orderNumber && ticketCode
      ? `${orderNumber} · ${ticketCode}`
      : orderNumber || ticketCode || "";

  const subject = `${subjectPrefix} ${fromCart ? "Consulta carrito" : "Consulta ASIC"}: ${subjectLine}`.trim();

  const text = [
    fromCart
      ? "Consulta por correo desde el carrito de cotización (marketplace)."
      : "Consulta por correo desde la ficha de producto ASIC (marketplace).",
    `Sitio: ${siteOrigin}`,
    ...(ticketRef ? [`Orden / ticket: ${ticketRef}`] : []),
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
        ${ticketRef ? `<li><strong>Orden / ticket:</strong> ${escapeHtml(ticketRef)}</li>` : ""}
        <li><strong>Correo:</strong> ${escapeHtml(email)}</li>
        <li><strong>Nombre:</strong> ${escapeHtml(name)}</li>
        <li><strong>Asunto:</strong> ${escapeHtml(subjectLine)}</li>
      </ul>
      <p style="margin:0;font-weight:700">Mensaje</p>
      <pre style="margin:8px 0 0;font-family:inherit;white-space:pre-wrap">${escapeHtml(message)}</pre>
    </div>
  `.trim();

  const r = await deliverMarketplaceSalesEmail({
    to,
    replyTo: email,
    subject,
    text,
    html,
    devLogTag: fromCart ? "consulta carrito marketplace" : "consulta ASIC marketplace",
  });
  return { simulated: r.simulated, via: r.via };
}
