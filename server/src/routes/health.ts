import { Router } from "express";
import { dbType } from "../db/index.js";
import {
  effectiveResendFromEmailOrDefault,
  normalizeResendApiKey,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";
import { resolveMarketplaceOrdersPanelUrl } from "../lib/publicAppOrigin.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/** Diagnóstico rápido de avisos por email (órdenes marketplace). No expone secretos. */
healthRouter.get("/email-config", (_req, res) => {
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const from = effectiveResendFromEmailOrDefault();
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || "sales@hashrate.space").trim();
  res.json({
    ok: Boolean(apiKey && from && !resendApiKeyLooksInvalid(apiKey)),
    resendApiKey: apiKey ? (resendApiKeyLooksInvalid(apiKey) ? "invalid" : "set") : "missing",
    resendFrom: from || "missing",
    notifyTo: to,
    ordersPanelUrl: resolveMarketplaceOrdersPanelUrl(),
    appPublicUrl: (process.env.APP_PUBLIC_URL || process.env.FRONTEND_ORIGIN || "").trim() || null,
  });
});

healthRouter.get("/db-info", (_req, res) => {
  res.json({ db: dbType, message: dbType === "supabase" ? "Conectado a Supabase (datos compartidos con Vercel)" : "Usando SQLite local. Configurá SUPABASE_DATABASE_URL en server/.env" });
});

