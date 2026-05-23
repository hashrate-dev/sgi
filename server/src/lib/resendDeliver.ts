import {
  normalizeResendApiKey,
  resendApiKeyLooksInvalid,
  resendFromCandidates,
} from "../config/resendFrom.js";

const RESEND_API_URL = "https://api.resend.com/emails";

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
    d.includes("unauthorized domain") ||
    d.includes("domain verification") ||
    d.includes("invalid from") ||
    d.includes("from address")
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

/**
 * Envía por Resend probando varios remitentes (`@hashrate.space` y `@mail.hashrate.space`).
 */
export async function deliverResendEmailWithFromFallback(args: {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  devLogTag: string;
}): Promise<{ simulated: boolean; resendId?: string; fromUsed?: string }> {
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const { to, replyTo, subject, text, html, devLogTag } = args;

  const devConsole =
    process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
  if (!apiKey || resendApiKeyLooksInvalid(apiKey)) {
    if (devConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `[email] (dev, sin envío Resend) ${devLogTag} → destino sería ${to}\nreply_to: ${replyTo ?? "—"}\n${subject}\n${text}`
      );
      return { simulated: true };
    }
    throw new Error("El envío de correo no está configurado en el servidor (RESEND_API_KEY).");
  }

  const fromCandidates = resendFromCandidates();
  if (fromCandidates.length === 0) {
    throw new Error("Definí RESEND_FROM_EMAIL con un remitente verificado en Resend.");
  }

  let lastRes!: Response;
  let lastBody = "";
  let sendFrom = fromCandidates[0]!;
  const attemptErrors: string[] = [];

  for (let i = 0; i < fromCandidates.length; i++) {
    sendFrom = fromCandidates[i]!;
    const attempt = await resendPostEmail({ apiKey, from: sendFrom, to, replyTo, subject, text, html });
    lastRes = attempt.res;
    lastBody = attempt.bodyText;
    if (lastRes.ok) break;
    attemptErrors.push(`${sendFrom} → ${lastRes.status}: ${resendErrorDetail(lastBody)}`);
    if (lastRes.status === 401) break;
    if (i < fromCandidates.length - 1) {
      if (isResendTestingRecipientRestriction(lastRes.status, lastBody)) break;
      // eslint-disable-next-line no-console
      console.warn(`[email] ${devLogTag}: remitente rechazado (${sendFrom}), probando siguiente…`);
      continue;
    }
    break;
  }

  if (!lastRes.ok && lastRes.status === 403) {
    if (isResendTestingRecipientRestriction(lastRes.status, lastBody)) {
      const sandboxInbox = parseResendSandboxInboxFrom403(lastBody);
      throw new Error(
        `Resend está en modo prueba: solo permite enviar a ${sandboxInbox ?? "el buzón de la cuenta Resend"}. ` +
          `Verificá el dominio en Resend o usá una API key de producción.`
      );
    }
    if (resend403UnverifiedFromDomain(resendErrorDetail(lastBody))) {
      throw new Error(
        `Resend rechazó el remitente. ${attemptErrors.join(" | ")}. ` +
          `Verificá el dominio en https://resend.com/domains y en Vercel usá RESEND_FROM_EMAIL=Hashrate Space <noreply@mail.hashrate.space> (o el que figure Verified).`
      );
    }
  }

  if (!lastRes.ok) {
    throw new Error(`Resend API ${lastRes.status}: ${resendErrorDetail(lastBody)}`);
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
  return { simulated: false, resendId, fromUsed: sendFrom };
}
