/**
 * WhatsApp Cloud API (Meta): avisos transaccionales con plantilla aprobada.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

const DEFAULT_GRAPH_VERSION = "v21.0";

let warnedMissingEnv = false;

function clip(s: unknown, max: number): string {
  const t = String(s ?? "")
    .trim()
    .replace(/\u0000/g, "");
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

  const subtotalNum = Number.isFinite(Number(p.subtotalUsd)) ? Number(p.subtotalUsd) : 0;
  const subtotalStr = `${subtotalNum.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

  const parameters = [
    clip(p.orderNumber, 64),
    clip(p.ticketCode, 32),
    clip(p.contactEmail ?? "—", 128),
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

export type CryptoWireNewsItem = {
  title: string;
  sourceName?: string;
  url?: string;
};

export type WhatsAppCloudStatus = {
  tokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  defaultNotifyTo: string;
  callMeBotKeyConfigured: boolean;
  newsTemplateName: string;
  newsTemplateLang: string;
  /** Token + phone number ID listos (falta destino y/o plantilla). */
  cloudReady: boolean;
};

export function getWhatsAppCloudStatus(): WhatsAppCloudStatus {
  const tokenConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim());
  const phoneNumberIdConfigured = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const defaultNotifyTo = (process.env.WHATSAPP_NOTIFY_TO || "").replace(/\D/g, "");
  const callMeBotKeyConfigured = Boolean(process.env.WHATSAPP_CALLMEBOT_APIKEY?.trim());
  const newsTemplateName = (process.env.WHATSAPP_NEWS_TEMPLATE_NAME || "nueva_noticia_wire").trim();
  const newsTemplateLang = (process.env.WHATSAPP_NEWS_TEMPLATE_LANG || process.env.WHATSAPP_TEMPLATE_LANG || "es").trim();
  return {
    tokenConfigured,
    phoneNumberIdConfigured,
    defaultNotifyTo,
    callMeBotKeyConfigured,
    newsTemplateName,
    newsTemplateLang,
    cloudReady: tokenConfigured && phoneNumberIdConfigured,
  };
}

function normalizeWhatsAppDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function wireSalaUrl(): string {
  const base = (process.env.APP_PUBLIC_URL || "https://hashrate.space").replace(/\/$/, "");
  return `${base}/gestion-administrativa/noticias`;
}

/** Texto plano del digest (CallMeBot / prueba). */
export function formatCryptoWireWhatsAppDigest(items: CryptoWireNewsItem[], opts?: { maxItems?: number }): string {
  const maxItems = Math.max(1, Math.min(12, opts?.maxItems ?? 5));
  const list = items.filter((x) => String(x.title ?? "").trim());
  const head = list.slice(0, maxItems);
  const extra = Math.max(0, list.length - head.length);
  const lines = head.map((it, i) => {
    const src = String(it.sourceName ?? "").trim();
    const title = clip(it.title, 140);
    return `${i + 1}) ${title}${src ? ` (${clip(src, 40)})` : ""}`;
  });
  if (extra > 0) lines.push(`+${extra} más en la sala de redacción`);
  return [
    `Wire cripto HRS · ${list.length} nueva${list.length === 1 ? "" : "s"}`,
    "",
    ...lines,
    "",
    wireSalaUrl(),
  ].join("\n");
}

/**
 * CallMeBot: texto libre al celular (ideal para alertas personales sin plantilla Meta).
 * Requiere apikey de https://www.callmebot.com/blog/free-api-whatsapp-messages/
 */
export async function sendWhatsAppViaCallMeBot(toDigits: string, text: string): Promise<void> {
  const apikey = process.env.WHATSAPP_CALLMEBOT_APIKEY?.trim();
  if (!apikey) throw new Error("Falta WHATSAPP_CALLMEBOT_APIKEY");
  const to = normalizeWhatsAppDigits(toDigits);
  if (to.length < 8) throw new Error("Número WhatsApp inválido");
  const body = clip(text, 3500);
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(to)}` +
    `&text=${encodeURIComponent(body)}` +
    `&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url, { method: "GET" });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`CallMeBot HTTP ${res.status}: ${clip(bodyText, 240)}`);
  }
  if (/api.?key|invalid|error|denied/i.test(bodyText) && !/message\s+queued|success|sent/i.test(bodyText)) {
    // CallMeBot a veces responde 200 con texto de error.
    if (/invalid|wrong|denied|not allowed/i.test(bodyText)) {
      throw new Error(`CallMeBot: ${clip(bodyText, 240)}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[whatsapp] CallMeBot OK → ${to} (${body.length} chars)`);
}

/**
 * Plantilla Meta para el wire. Cuerpo con exactamente 3 variables:
 *   {{1}} cantidad, {{2}} listado corto, {{3}} URL sala de redacción
 * Nombre default: nueva_noticia_wire (WHATSAPP_NEWS_TEMPLATE_NAME).
 */
export async function sendCryptoWireWhatsAppTemplate(
  toDigits: string,
  items: CryptoWireNewsItem[]
): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = (process.env.WHATSAPP_NEWS_TEMPLATE_NAME || "nueva_noticia_wire").trim();
  const languageCode = (
    process.env.WHATSAPP_NEWS_TEMPLATE_LANG ||
    process.env.WHATSAPP_TEMPLATE_LANG ||
    "es"
  ).trim();
  const graphVersion = (process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION).trim();

  if (!token || !phoneNumberId) {
    throw new Error("Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
  }
  const to = normalizeWhatsAppDigits(toDigits);
  if (to.length < 8) throw new Error("Número WhatsApp inválido");

  const list = items.filter((x) => String(x.title ?? "").trim());
  if (!list.length) return;

  const maxItems = 5;
  const head = list.slice(0, maxItems);
  const extra = Math.max(0, list.length - head.length);
  const listTxt = clip(
    head
      .map((it, i) => {
        const src = String(it.sourceName ?? "").trim();
        return `${i + 1}) ${clip(it.title, 100)}${src ? ` · ${clip(src, 28)}` : ""}`;
      })
      .concat(extra > 0 ? [`+${extra} más`] : [])
      .join(" | "),
    900
  );

  const parameters = [clip(String(list.length), 16), listTxt, clip(wireSalaUrl(), 200)].map((text) => ({
    type: "text" as const,
    text,
  }));

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
        components: [{ type: "body", parameters }],
      },
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    let detail = bodyText;
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* keep */
    }
    throw new Error(`WhatsApp API ${res.status}: ${detail}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[whatsapp] Wire plantilla "${templateName}" → ${to} (${list.length} noticias)`);
}

export type CryptoWireNotifyResult = {
  sent: boolean;
  via: "callmebot" | "meta_template" | "skipped";
  reason?: string;
};

/**
 * Prefiere CallMeBot (texto libre). Si no hay apikey, usa plantilla Meta Cloud.
 */
export async function notifyCryptoWireWhatsApp(
  toDigits: string,
  items: CryptoWireNewsItem[]
): Promise<CryptoWireNotifyResult> {
  const list = items.filter((x) => String(x.title ?? "").trim());
  if (!list.length) return { sent: false, via: "skipped", reason: "sin_items" };
  const to = normalizeWhatsAppDigits(toDigits);
  if (to.length < 8) return { sent: false, via: "skipped", reason: "telefono_invalido" };

  const status = getWhatsAppCloudStatus();
  if (status.callMeBotKeyConfigured) {
    await sendWhatsAppViaCallMeBot(to, formatCryptoWireWhatsAppDigest(list));
    return { sent: true, via: "callmebot" };
  }
  if (status.cloudReady) {
    await sendCryptoWireWhatsAppTemplate(to, list);
    return { sent: true, via: "meta_template" };
  }
  return {
    sent: false,
    via: "skipped",
    reason: "faltan_credenciales",
  };
}
