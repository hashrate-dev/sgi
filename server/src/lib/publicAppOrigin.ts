import type { Request } from "express";

/** Origen canónico del sitio público (apex). */
export const CANONICAL_PUBLIC_ORIGIN = "https://hashrate.space";

/** Panel SGI: órdenes marketplace (misma ruta en todos los despliegues). */
export const DEFAULT_MARKETPLACE_ORDERS_PANEL_URL = `${CANONICAL_PUBLIC_ORIGIN}/marketplace/orders`;

/**
 * Migra URLs guardadas con `app.hashrate.space` o `www` al apex actual.
 * Evita enlaces rotos en mails y variables de entorno desactualizadas tras el cambio de dominio.
 */
export function normalizeLegacyHashratePublicUrl(raw: string): string {
  let u = String(raw ?? "").trim();
  if (!u) return "";
  u = u.replace(/\/+$/, "");
  u = u.replace(/^https:\/\/app\.hashrate\.space/i, CANONICAL_PUBLIC_ORIGIN);
  u = u.replace(/^http:\/\/app\.hashrate\.space/i, CANONICAL_PUBLIC_ORIGIN);
  u = u.replace(/^https:\/\/www\.hashrate\.space/i, CANONICAL_PUBLIC_ORIGIN);
  u = u.replace(/^http:\/\/www\.hashrate\.space/i, CANONICAL_PUBLIC_ORIGIN);
  return u;
}

/** Normaliza variables de entorno relacionadas con el dominio público (idempotente). */
export function applyLegacyHashratePublicUrlEnv(): void {
  for (const key of ["APP_PUBLIC_URL", "FRONTEND_ORIGIN", "MARKETPLACE_QUOTES_PANEL_URL"] as const) {
    const v = process.env[key]?.trim();
    if (!v) continue;
    const n = normalizeLegacyHashratePublicUrl(v);
    if (n && n !== v) process.env[key] = n;
  }
  const cors = process.env.CORS_ORIGIN?.trim();
  if (cors && /app\.hashrate\.space/i.test(cors)) {
    const parts = cors
      .split(",")
      .map((p) => normalizeLegacyHashratePublicUrl(p.trim()))
      .filter(Boolean);
    const merged = new Set(parts);
    merged.add(CANONICAL_PUBLIC_ORIGIN);
    merged.add("https://www.hashrate.space");
    process.env.CORS_ORIGIN = [...merged].join(",");
  }
}

export function resolvePublicAppOrigin(req?: Request): string {
  const fromEnv = normalizeLegacyHashratePublicUrl(
    process.env.APP_PUBLIC_URL || process.env.FRONTEND_ORIGIN || ""
  );
  if (fromEnv) return fromEnv;

  if (req) {
    const origin = String(req.headers.origin || "").trim();
    if (/^https?:\/\//i.test(origin)) {
      return normalizeLegacyHashratePublicUrl(origin);
    }
    const proto = String(req.headers["x-forwarded-proto"] || "https")
      .split(",")[0]
      ?.trim() || "https";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      ?.trim();
    if (host) {
      if (/localhost|127\.0\.0\.1/i.test(host)) return `http://${host}`;
      if (/hashrate\.space/i.test(host) || /\.vercel\.app$/i.test(host)) {
        return normalizeLegacyHashratePublicUrl(`${proto}://${host}`);
      }
    }
  }

  return CANONICAL_PUBLIC_ORIGIN;
}

export function resolveMarketplaceOrdersPanelUrl(req?: Request): string {
  const fromEnv = normalizeLegacyHashratePublicUrl(process.env.MARKETPLACE_QUOTES_PANEL_URL || "");
  if (fromEnv) return fromEnv;
  return `${resolvePublicAppOrigin(req)}/marketplace/orders`;
}
