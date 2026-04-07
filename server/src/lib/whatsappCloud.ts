/**
 * WhatsApp Cloud API (Meta): avisos transaccionales con plantilla aprobada.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

const DEFAULT_GRAPH_VERSION = "v21.0";

let warnedMissingEnv = false;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type MarketplaceOrderWhatsAppPayload = {
  orderNumber: string;
  ticketCode: string;
  contactEmail: string;
  subtotalUsd: number;
};

/**
 * Envía plantilla a WHATSAPP_NOTIFY_TO usando el número de negocio (PHONE_NUMBER_ID).
 * Requiere plantilla aprobada en Meta con 4 variables de cuerpo, en este orden:
 *   {{1}} orden, {{2}} ticket, {{3}} email cliente, {{4}} total (texto)
 * Si faltan env vars, no hace nada (sin error).
 */
export async function notifyMarketplaceOrderWhatsApp(p: MarketplaceOrderWhatsAppPayload): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const rawTo = process.env.WHATSAPP_NOTIFY_TO?.trim();
  const templateName = (process.env.WHATSAPP_TEMPLATE_NAME || "nueva_orden_marketplace").trim();
  const languageCode = (process.env.WHATSAPP_TEMPLATE_LANG || "es").trim();
  const graphVersion = (process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION).trim();

  if (!token || !phoneNumberId || !rawTo) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp] Aviso de orden omitido: faltan WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_NOTIFY_TO (el mensaje en el arranque del servidor indica si están configurados)."
      );
    }
    return;
  }

  const to = rawTo.replace(/\D/g, "");
  if (to.length < 8) {
    console.warn("[whatsapp] WHATSAPP_NOTIFY_TO inválido (solo dígitos, ej. 595991907308)");
    return;
  }

  const subtotalStr = `${p.subtotalUsd.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

  const parameters = [
    clip(p.orderNumber, 64),
    clip(p.ticketCode, 32),
    clip(p.contactEmail || "—", 128),
    clip(subtotalStr, 64),
  ].map((text) => ({ type: "text" as const, text }));

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters,
          },
        ],
      },
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    let detail = bodyText;
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string; code?: number; error_subcode?: number } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* keep raw */
    }
    throw new Error(`WhatsApp API ${res.status}: ${detail}`);
  }

  try {
    const j = JSON.parse(bodyText) as { messages?: { id?: string }[] };
    const wamid = j.messages?.[0]?.id;
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] Mensaje de plantilla "${templateName}" enviado a ${to}${wamid ? ` (wamid: ${wamid})` : ""}`);
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] Respuesta OK de WhatsApp para ${to} (orden ${p.orderNumber})`);
  }
}
