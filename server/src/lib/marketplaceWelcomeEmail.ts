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

/** Mismo logo que el mail de recuperación de contraseña (adjunto inline; Gmail no muestra data: URI). */
const WELCOME_EMAIL_LOGO_CID = "hrs-welcome-logo";
const WELCOME_EMAIL_LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

function welcomeEmailLogoPngBuffer(): Buffer | null {
  const serverRoot = path.resolve(WELCOME_EMAIL_LIB_DIR, "../..");
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

function welcomeEmailLogoImgHtml(): string {
  if (welcomeEmailLogoPngBuffer()) {
    return `<img src="cid:${WELCOME_EMAIL_LOGO_CID}" alt="Hashrate Space" width="200" height="44" style="display:block;height:44px;width:auto;max-width:200px;border:0" />`;
  }
  return `<img src="https://hashrate.space/images/wp-uploads/hashrate-LOGO.png" alt="Hashrate Space" style="height:44px;width:auto;display:block" />`;
}

function welcomeEmailLogoResendAttachments():
  | { filename: string; content: string; content_id: string; content_type: string }[]
  | undefined {
  const buf = welcomeEmailLogoPngBuffer();
  if (!buf) return undefined;
  return [
    {
      filename: "hashrate-logo.png",
      content: buf.toString("base64"),
      content_id: WELCOME_EMAIL_LOGO_CID,
      content_type: "image/png",
    },
  ];
}

export type MarketplaceWelcomeLang = "es" | "en" | "pt";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remitente preferido para bienvenida de registro (subdominio mail verificado en Resend). */
export function marketplaceWelcomeFromCandidates(): string[] {
  const preferred = (process.env.MARKETPLACE_WELCOME_FROM_EMAIL || LEGACY_RESEND_FROM_MAIL).trim();
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  add(preferred);
  for (const c of resendFromCandidates()) add(c);
  add(LEGACY_RESEND_FROM_MAIL);
  add(DEFAULT_RESEND_FROM);
  return out;
}

export function parseMarketplaceWelcomeLang(
  req: Request | undefined,
  bodyLang?: MarketplaceWelcomeLang
): MarketplaceWelcomeLang {
  if (bodyLang === "en" || bodyLang === "pt" || bodyLang === "es") return bodyLang;
  const hdr = String(req?.headers["x-marketplace-lang"] || req?.headers["accept-language"] || "").toLowerCase();
  if (hdr.startsWith("en") || hdr.includes("en-")) return "en";
  if (hdr.startsWith("pt") || hdr.includes("pt-")) return "pt";
  return "es";
}

function welcomeEmailCopy(
  lang: MarketplaceWelcomeLang,
  displayName: string
): {
  subject: string;
  headline: string;
  lead: string;
  detail: string;
  ctaShop: string;
  ctaLogin: string;
  accountLabel: string;
  security: string;
  plainText: string;
} {
  const name = displayName.trim();
  const greeting = name ? (lang === "en" ? `Hi ${name},` : lang === "pt" ? `Olá ${name},` : `Hola ${name},`) : "";

  if (lang === "en") {
    return {
      subject: "Your account was created successfully - Hashrate Space",
      headline: "Welcome to Hashrate Space",
      lead: greeting
        ? `${greeting} your client account was created successfully.`
        : "Your client account was created successfully.",
      detail:
        "You can sign in with your email and password to browse the ASIC catalog, build quote lists, and track your orders.",
      ctaShop: "Browse equipment",
      ctaLogin: "Sign in",
      accountLabel: "Account:",
      security: "If you did not create this account, contact us immediately at sales@hashrate.space.",
      plainText: greeting
        ? `${greeting}\n\nYour client account was created successfully.\n\n`
        : "Your client account was created successfully.\n\n",
    };
  }
  if (lang === "pt") {
    return {
      subject: "Sua conta foi criada com sucesso - Hashrate Space",
      headline: "Bem-vindo à Hashrate Space",
      lead: greeting
        ? `${greeting} sua conta de cliente foi criada com sucesso.`
        : "Sua conta de cliente foi criada com sucesso.",
      detail:
        "Você pode entrar com seu e-mail e senha para ver o catálogo ASIC, montar listas de orçamento e acompanhar seus pedidos.",
      ctaShop: "Ver equipamentos",
      ctaLogin: "Entrar",
      accountLabel: "Conta:",
      security: "Se você não criou esta conta, entre em contato conosco imediatamente em sales@hashrate.space.",
      plainText: greeting
        ? `${greeting}\n\nSua conta de cliente foi criada com sucesso.\n\n`
        : "Sua conta de cliente foi criada com sucesso.\n\n",
    };
  }
  return {
    subject: "Tu cuenta fue creada con éxito - Hashrate Space",
    headline: "Bienvenido a Hashrate Space",
    lead: greeting
      ? `${greeting} tu cuenta de cliente fue creada con éxito.`
      : "Tu cuenta de cliente fue creada con éxito.",
    detail:
      "Podés iniciar sesión con tu correo y contraseña para ver el catálogo ASIC, armar listas de cotización y seguir tus pedidos.",
    ctaShop: "Ver equipos",
    ctaLogin: "Iniciar sesión",
    accountLabel: "Cuenta:",
    security: "Si no creaste esta cuenta, escribinos de inmediato a sales@hashrate.space.",
    plainText: greeting ? `${greeting}\n\nTu cuenta de cliente fue creada con éxito.\n\n` : "Tu cuenta de cliente fue creada con éxito.\n\n",
  };
}

function buildWelcomeEmailHtml(args: {
  copy: ReturnType<typeof welcomeEmailCopy>;
  shopUrl: string;
  loginUrl: string;
  email: string;
}): string {
  const { copy, shopUrl, loginUrl, email } = args;
  return `
    <div style="margin:0;padding:24px;background:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#000000">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:16px;overflow:hidden">
        <div style="padding:24px 28px 14px;background:#ffffff">
          ${welcomeEmailLogoImgHtml()}
        </div>
        <div style="padding:8px 28px 26px">
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:#000000">${escapeHtml(copy.headline)}</h1>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#000000">${escapeHtml(copy.lead)}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#000000">${escapeHtml(copy.detail)}</p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#000000">
            <strong>${escapeHtml(copy.accountLabel)}</strong> ${escapeHtml(email)}
          </p>
          <div style="margin:0 0 20px">
            <a
              href="${shopUrl}"
              style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:13px 20px;border-radius:10px;margin-right:10px"
            >${escapeHtml(copy.ctaShop)}</a>
            <a
              href="${loginUrl}"
              style="display:inline-block;background:#ffffff;color:#16a34a;text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:12px 18px;border-radius:10px;border:2px solid #16a34a"
            >${escapeHtml(copy.ctaLogin)}</a>
          </div>
          <hr style="border:none;border-top:1px solid #d1d5db;margin:24px 0 16px" />
          <p style="margin:0;font-size:13px;line-height:1.5;color:#000000">${escapeHtml(copy.security)}</p>
        </div>
      </div>
    </div>
  `.trim();
}

export async function sendMarketplaceWelcomeEmail(args: {
  to: string;
  email: string;
  displayName: string;
  lang: MarketplaceWelcomeLang;
  siteOrigin: string;
}): Promise<{ simulated: boolean; fromUsed?: string }> {
  const to = args.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("Destinatario de bienvenida inválido.");
  }

  const origin = args.siteOrigin.replace(/\/+$/, "") || "https://hashrate.space";
  const shopUrl = `${origin}/equipment`;
  const loginUrl = `${origin}/acceso`;

  const copy = welcomeEmailCopy(args.lang, args.displayName);
  const text = `${copy.plainText}${copy.detail}\n\nCuenta: ${args.email}\nTienda: ${shopUrl}\nIniciar sesión: ${loginUrl}\n\n${copy.security}`;
  const html = buildWelcomeEmailHtml({
    copy,
    shopUrl,
    loginUrl,
    email: args.email.trim(),
  });

  const result = await deliverResendEmailWithFromFallback({
    to,
    subject: copy.subject,
    text,
    html,
    devLogTag: "marketplace-welcome",
    fromCandidates: marketplaceWelcomeFromCandidates(),
    attachments: welcomeEmailLogoResendAttachments(),
  });

  return { simulated: result.simulated, fromUsed: result.fromUsed };
}
