import { deliverResendEmailWithFromFallback } from "./resendDeliver.js";
import { resolveMarketplaceSalesRecipients } from "./marketplaceSalesInbox.js";
import { isSmtpDeliverConfigured, sendSmtpDeliverEmail } from "./smtpDeliver.js";

export type MarketplaceSalesEmailDeliverResult = {
  simulated: boolean;
  resendId?: string;
  fromUsed?: string;
  via: ("smtp" | "resend")[];
};

function smtpFirstForSales(): boolean {
  const raw = String(process.env.MARKETPLACE_SALES_SMTP_FIRST ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return isSmtpDeliverConfigured();
}

/**
 * Entrega a ventas: SMTP (Workspace) cuando está configurado + Resend como respaldo/principal.
 * Éxito si al menos un canal envía; en producción falla si todo queda simulado o sin envío.
 */
export async function deliverMarketplaceSalesEmail(args: {
  to?: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  devLogTag: string;
}): Promise<MarketplaceSalesEmailDeliverResult> {
  const recipients = normalizeRecipientsArg(args.to);
  const via: ("smtp" | "resend")[] = [];
  let simulated = true;
  let resendId: string | undefined;
  let fromUsed: string | undefined;
  const errors: string[] = [];

  const trySmtp = async () => {
    if (!isSmtpDeliverConfigured()) return;
    try {
      await sendSmtpDeliverEmail({
        to: recipients,
        subject: args.subject,
        text: args.text,
        html: args.html,
        replyTo: args.replyTo,
      });
      via.push("smtp");
      simulated = false;
      // eslint-disable-next-line no-console
      console.log(`[email] ${args.devLogTag} enviado por SMTP → ${recipients.join(", ")}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`SMTP: ${msg}`);
      // eslint-disable-next-line no-console
      console.warn(`[email] ${args.devLogTag} SMTP falló: ${msg}`);
    }
  };

  const tryResend = async () => {
    try {
      const r = await deliverResendEmailWithFromFallback({
        to: recipients,
        replyTo: args.replyTo,
        subject: args.subject,
        text: args.text,
        html: args.html,
        devLogTag: args.devLogTag,
      });
      via.push("resend");
      if (!r.simulated) simulated = false;
      resendId = r.resendId;
      fromUsed = r.fromUsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Resend: ${msg}`);
      // eslint-disable-next-line no-console
      console.warn(`[email] ${args.devLogTag} Resend falló: ${msg}`);
    }
  };

  if (smtpFirstForSales()) {
    await trySmtp();
  }
  await tryResend();
  if (!via.includes("smtp") && isSmtpDeliverConfigured() && !smtpFirstForSales()) {
    await trySmtp();
  }

  if (via.length === 0) {
    const resendUnverified = errors.some(
      (e) => e.includes("not verified") || e.includes("rechazó el remitente") || e.includes("Resend rechazó")
    );
    const smtpHint = isSmtpDeliverConfigured()
      ? ""
      : " Configurá SMTP de Google Workspace en Vercel (PASSWORD_RESET_SMTP_*) o verificá mail.hashrate.space en https://resend.com/domains — ver docs/MARKETPLACE_EMAIL_VERCEL.md.";
    if (process.env.NODE_ENV === "production") {
      if (resendUnverified && !isSmtpDeliverConfigured()) {
        throw new Error(
          "No se pudo enviar el correo a sales@hashrate.space: el dominio de envío no está verificado en Resend." +
            " Verificá mail.hashrate.space en https://resend.com/domains y actualizá RESEND_FROM_EMAIL en Vercel, o activá SMTP (Workspace)." +
            smtpHint
        );
      }
      throw new Error(
        errors.length > 0
          ? `No se pudo enviar el correo a ventas. ${errors.join(" | ")}${smtpHint}`
          : `No se pudo enviar el correo a ventas (Resend/SMTP no configurados).${smtpHint}`
      );
    }
    throw new Error(errors.length > 0 ? errors.join(" | ") : "El envío de correo no está configurado.");
  }

  if (process.env.NODE_ENV === "production" && simulated) {
    throw new Error(
      "El servidor no pudo entregar el correo a ventas (modo simulado). Configurá RESEND_API_KEY y RESEND_FROM_EMAIL verificados, o SMTP de Workspace."
    );
  }

  return { simulated, resendId, fromUsed, via };
}

function normalizeRecipientsArg(to: string | string[] | undefined): string[] {
  if (to == null) return resolveMarketplaceSalesRecipients();
  const arr = Array.isArray(to) ? to : [to];
  const out: string[] = [];
  for (const raw of arr) {
    const t = String(raw ?? "").trim();
    if (!t || !t.includes("@")) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.length > 0 ? out : resolveMarketplaceSalesRecipients();
}
