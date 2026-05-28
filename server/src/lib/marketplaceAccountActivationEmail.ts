import type { Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RESEND_FROM,
  LEGACY_RESEND_FROM_MAIL,
  resendFromCandidates,
} from "../config/resendFrom.js";
import { deliverResendEmailWithFromFallback } from "./resendDeliver.js";
import type { MarketplaceWelcomeLang } from "./marketplaceWelcomeEmail.js";
import { parseMarketplaceWelcomeLang } from "./marketplaceWelcomeEmail.js";

const ACTIVATION_EMAIL_LOGO_CID = "hrs-activation-logo";
const ACTIVATION_EMAIL_LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

function activationEmailLogoPngBuffer(): Buffer | null {
  const serverRoot = path.resolve(ACTIVATION_EMAIL_LIB_DIR, "../..");
  const repoRoot = path.resolve(serverRoot, "..");
  const candidates = [
    path.join(serverRoot, "assets", "password-reset-logo.png"),
    path.join(process.cwd(), "server", "assets", "password-reset-logo.png"),
    path.join(repoRoot, "public", "images", "LOGO-HRS-PNG.png"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      if (buf.length >= 32) return buf;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

function activationEmailLogoImgHtml(): string {
  if (activationEmailLogoPngBuffer()) {
    return `<img src="cid:${ACTIVATION_EMAIL_LOGO_CID}" alt="Hashrate Space" width="200" height="44" style="display:block;height:44px;width:auto;max-width:200px;border:0" />`;
  }
  return `<img src="https://hashrate.space/images/wp-uploads/hashrate-LOGO.png" alt="Hashrate Space" style="height:44px;width:auto;display:block" />`;
}

function activationEmailLogoResendAttachments():
  | { filename: string; content: string; content_id: string; content_type: string }[]
  | undefined {
  const buf = activationEmailLogoPngBuffer();
  if (!buf) return undefined;
  return [
    {
      filename: "hashrate-logo.png",
      content: buf.toString("base64"),
      content_id: ACTIVATION_EMAIL_LOGO_CID,
      content_type: "image/png",
    },
  ];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activationEmailCopy(lang: MarketplaceWelcomeLang, displayName: string, ttlHours: number) {
  const name = displayName.trim();
  const greeting = name ? (lang === "en" ? `Hi ${name},` : lang === "pt" ? `Olá ${name},` : `Hola ${name},`) : "";

  if (lang === "en") {
    return {
      subject: "Activate your Hashrate Space account",
      headline: "Activate your account",
      lead: greeting
        ? `${greeting} thanks for signing up.`
        : "Thanks for signing up.",
      detail: "Click the button below to confirm your email and activate your client account.",
      cta: "Activate account",
      validity: `This link expires in ${ttlHours} hours.`,
      ignore: "If you did not create this account, you can ignore this email.",
      plainText: `${greeting}\n\nActivate your Hashrate Space account:\n`,
    };
  }
  if (lang === "pt") {
    return {
      subject: "Ative sua conta Hashrate Space",
      headline: "Ative sua conta",
      lead: greeting ? `${greeting} obrigado por se cadastrar.` : "Obrigado por se cadastrar.",
      detail: "Clique no botão abaixo para confirmar seu e-mail e ativar sua conta de cliente.",
      cta: "Ativar conta",
      validity: `Este link expira em ${ttlHours} horas.`,
      ignore: "Se você não criou esta conta, pode ignorar este e-mail.",
      plainText: `${greeting}\n\nAtive sua conta Hashrate Space:\n`,
    };
  }
  return {
    subject: "Activá tu cuenta de Hashrate Space",
    headline: "Activá tu cuenta",
    lead: greeting ? `${greeting} gracias por registrarte.` : "Gracias por registrarte.",
    detail: "Hacé clic en el botón para confirmar tu correo y activar tu cuenta de cliente.",
    cta: "Activar cuenta",
    validity: `Este enlace expira en ${ttlHours} horas.`,
    ignore: "Si no creaste esta cuenta, podés ignorar este correo.",
    plainText: `${greeting}\n\nActivá tu cuenta de Hashrate Space:\n`,
  };
}

export function marketplaceActivationFromCandidates(): string[] {
  const preferred = (process.env.MARKETPLACE_WELCOME_FROM_EMAIL || DEFAULT_RESEND_FROM).trim();
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  add(preferred);
  for (const c of resendFromCandidates()) add(c);
  add(DEFAULT_RESEND_FROM);
  add(LEGACY_RESEND_FROM_MAIL);
  return out;
}

export async function sendMarketplaceAccountActivationEmail(args: {
  to: string;
  displayName: string;
  activationUrl: string;
  lang: MarketplaceWelcomeLang;
  ttlHours: number;
  req?: Request;
}): Promise<{ simulated: boolean; fromUsed?: string }> {
  const to = args.to.trim().toLowerCase();
  const copy = activationEmailCopy(args.lang, args.displayName, args.ttlHours);
  const text = `${copy.plainText}${args.activationUrl}\n\n${copy.validity}\n\n${copy.ignore}`;
  const html = `
    <div style="margin:0;padding:24px;background:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#000000">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:16px;overflow:hidden">
        <div style="padding:24px 28px 14px;background:#ffffff">
          ${activationEmailLogoImgHtml()}
        </div>
        <div style="padding:8px 28px 26px">
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:#000000">${escapeHtml(copy.headline)}</h1>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#000000">${escapeHtml(copy.lead)}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#000000">${escapeHtml(copy.detail)}</p>
          <a
            href="${args.activationUrl}"
            style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:13px 20px;border-radius:10px"
          >${escapeHtml(copy.cta)}</a>
          <hr style="border:none;border-top:1px solid #d1d5db;margin:24px 0 16px" />
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#000000">${escapeHtml(copy.validity)}</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#000000">${escapeHtml(copy.ignore)}</p>
        </div>
      </div>
    </div>
  `.trim();

  const result = await deliverResendEmailWithFromFallback({
    to,
    subject: copy.subject,
    text,
    html,
    devLogTag: "marketplace-activation",
    fromCandidates: marketplaceActivationFromCandidates(),
    attachments: activationEmailLogoResendAttachments(),
  });

  return { simulated: result.simulated, fromUsed: result.fromUsed };
}

export { parseMarketplaceWelcomeLang };
