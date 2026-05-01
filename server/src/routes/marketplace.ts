import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, getDb } from "../db.js";
import { env } from "../config/env.js";
import {
  mapEquipoRowToVitrina,
  mapEquipoRowToVitrinaWithAlgoFallback,
  type EquipoAsicVitrinaRow,
} from "../lib/asicVitrinaMapper.js";
import {
  readCorpBestSellingEquipoIds,
  readCorpInterestingEquipoIds,
  readMarketplaceHidePricesForGuests,
} from "../lib/marketplaceCorpBestSellingKv.js";
import { EQUIPOS_ASIC_SELECT } from "./equipos.js";
import {
  detectZecEquihashYieldItem,
  estimateAllYields,
  fetchNetworkMiningSnapshot,
  type AsicYieldItem,
} from "../lib/miningYieldEstimate.js";
import { estimateYieldFromCustomWhatToMine, fetchZecWhatToMineYieldForItem } from "../lib/whattomineYield.js";
import { getAuthTokenFromRequest } from "../lib/authSessionCookie.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { marketplacePublicPostRateLimit } from "../middleware/authRateLimit.js";
import { resolveSetupCompraHashrateUsd, resolveSetupEquipoCompletoUsd } from "../lib/marketplaceSetupHashratePrice.js";
import { loadGarantiaQuoteRows } from "../lib/marketplaceGarantiaQuote.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { mpVisibleFromDbValue } from "../lib/mpVisible.js";
import { sendMarketplaceAsicInquiryEmail, sendMarketplaceContactEmail } from "../lib/marketplaceContactEmail.js";

export const marketplaceRouter = Router();

const canManage = requireRole("admin_a", "admin_b", "operador");
const adminAB = requireRole("admin_a", "admin_b");
const MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS = 90_000;
/** Evita duplicar filas cuando el cliente envía dos heartbeats seguidos (locale/IP) con el mismo estado. */
const MARKETPLACE_PRESENCE_HISTORY_DEDUPE_MS = 15_000;
const IP_COUNTRY_CACHE_TTL_MS = 60 * 60 * 1000;
const ipCountryCache = new Map<string, { countryCode: string; countryName: string; expiresAt: number }>();

const emptyToUndef = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
const MarketplacePresenceHeartbeatSchema = z.object({
  visitorId: z.string().min(8).max(120).trim(),
  viewerType: z.enum(["anon", "cliente", "staff"]).optional(),
  userEmail: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  countryCode: z.preprocess(emptyToUndef, z.string().trim().min(2).max(2).optional()),
  countryName: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  clientIp: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  locale: z.preprocess(emptyToUndef, z.string().trim().max(20).optional()),
  timezone: z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  currentPath: z.string().max(200).trim().optional(),
});

const MarketplaceContactPublicSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  lastName: z.string().min(1).max(120).trim(),
  email: z.string().email().max(254).trim(),
  subject: z.string().min(1).max(200).trim(),
  phone: z.string().min(1).max(50).trim(),
  message: z.string().min(1).max(2000).trim(),
});

const MarketplaceAsicInquiryPublicSchema = z.object({
  email: z.string().email().max(254).trim(),
  name: z.string().max(120).trim().optional(),
  subject: z.string().min(1).max(250).trim(),
  message: z.string().min(1).max(4000).trim(),
  source: z.enum(["asic", "cart"]).optional(),
});

const ProductCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
  category: z.string().max(100).trim().optional().nullable(),
  priceUsd: z.number().min(0).max(99999999),
  imageUrl: z
    .union([z.string().max(500), z.literal(""), z.null()])
    .optional()
    .transform((s) => (s == null || s === "" || (typeof s === "string" && s.trim() === "") ? null : String(s).trim()))
    .refine((s) => s === null || /^https?:\/\//i.test(s), { message: "URL de imagen inválida (usá http:// o https://)" }),
  stock: z.number().int().min(0).max(999999999),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const ProductUpdateSchema = ProductCreateSchema.partial().extend({
  name: z.string().min(1).max(200).trim().optional(),
});

type Row = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price_usd: number;
  image_url: string | null;
  stock: number;
  is_active: number | boolean;
  sort_order: number;
  created_at: string;
};

function hashFast(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function visitorFingerprintFromRequest(req: Request): string {
  const fwd = String(req.headers["x-forwarded-for"] ?? "");
  const ip = (fwd.split(",")[0] || req.ip || "").trim();
  const ua = String(req.headers["user-agent"] ?? "").trim().slice(0, 220);
  const lang = String(req.headers["accept-language"] ?? "").trim().slice(0, 80);
  const raw = `${ip}|${ua}|${lang}`;
  return `fp-${hashFast(raw || "unknown")}`;
}

function extractClientIp(req: Request): string {
  const fwd = String(req.headers["x-forwarded-for"] ?? "");
  const first = (fwd.split(",")[0] || req.ip || "").trim();
  if (!first) return "";
  return first.startsWith("::ffff:") ? first.slice(7) : first;
}

function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const l = ip.toLowerCase();
  if (l === "::1") return true;
  if (l.startsWith("fc") || l.startsWith("fd")) return true;
  if (l.startsWith("fe80:")) return true;
  return false;
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (ip.includes(".")) return !isPrivateIpv4(ip);
  if (ip.includes(":")) return !isPrivateIpv6(ip);
  return false;
}

function selectBestPresenceIp(req: Request, clientIpRaw?: string): string {
  const clientIp = String(clientIpRaw || "").trim();
  if (isPublicIp(clientIp)) return clientIp;
  const reqIp = extractClientIp(req);
  if (isPublicIp(reqIp)) return reqIp;
  return "";
}

async function resolveAuthSnapshot(req: Request): Promise<{ viewerType: "anon" | "cliente" | "staff"; email: string }> {
  const token = getAuthTokenFromRequest(req)?.trim() ?? "";
  if (!token) return { viewerType: "anon", email: "" };
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId?: number; sub?: string };
    const userId = Number(payload?.userId);
    if (!Number.isFinite(userId) || userId <= 0) return { viewerType: "anon", email: "" };
    const row = (await db.prepare("SELECT email, username, role FROM users WHERE id = ?").get(userId)) as
      | { email?: string | null; username?: string | null; role?: string | null }
      | undefined;
    if (!row) return { viewerType: "anon", email: "" };
    const role = String(row.role || "").toLowerCase().trim();
    const viewerType = role === "cliente" ? "cliente" : "staff";
    const email = String(row.email || row.username || "").trim().toLowerCase().slice(0, 200);
    return { viewerType, email };
  } catch {
    return { viewerType: "anon", email: "" };
  }
}

function withMarketplacePriceVisibility<T extends { priceUsd: number; priceDisplayLabel?: string }>(
  products: T[],
  canViewPrices: boolean
): T[] {
  if (canViewPrices) return products;
  return products.map((p) => ({ ...p, priceUsd: 0, priceDisplayLabel: "SOLICITAR PRECIO" }));
}

function normalizeCountryCode(raw: unknown): string {
  const cc = String(raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return cc;
}

function shouldUseClientCountryFallback(countryCode: string): boolean {
  const cc = normalizeCountryCode(countryCode);
  return cc === "" || cc === "UN" || cc === "LO";
}

function isUsableCountryCode(countryCode: string): boolean {
  const cc = normalizeCountryCode(countryCode);
  return cc !== "" && cc !== "UN" && cc !== "LO";
}

function isUnknownCountryName(name: string): boolean {
  const n = String(name || "").trim().toLowerCase();
  return n === "" || n === "desconocido" || n === "unknown";
}

function countryNameFromCode(cc: string): string {
  const code = normalizeCountryCode(cc);
  if (!code) return "";
  try {
    // Node 18+ soporta Intl.DisplayNames
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

function countryCodeFromLocale(localeRaw: string): string {
  const m = String(localeRaw || "").match(/[-_]([A-Za-z]{2})$/);
  return normalizeCountryCode(m?.[1] ?? "");
}

function countryCodeFromTimezone(tzRaw: string): string {
  const tz = String(tzRaw || "").trim();
  const tzNorm = tz.toLowerCase();
  // Regla explícita solicitada por negocio:
  // timezone America/Montevideo => Uruguay (UY)
  if (tzNorm === "america/montevideo") return "UY";
  const map: Record<string, string> = {
    "America/Asuncion": "PY",
    "America/Montevideo": "UY",
    "America/Argentina/Buenos_Aires": "AR",
    "America/Sao_Paulo": "BR",
    "America/Santiago": "CL",
    "America/Lima": "PE",
    "America/Bogota": "CO",
    "America/La_Paz": "BO",
    "America/Mexico_City": "MX",
    "America/New_York": "US",
    "Europe/Madrid": "ES",
    "Europe/Lisbon": "PT",
  };
  const direct = map[tz];
  if (direct) return normalizeCountryCode(direct);
  const byNorm = Object.entries(map).find(([k]) => k.toLowerCase() === tzNorm)?.[1] ?? "";
  return normalizeCountryCode(byNorm);
}

function detectCountryFromHeaders(req: Request): { countryCode: string; countryName: string } {
  const countryCode =
    normalizeCountryCode(req.headers["x-vercel-ip-country"]) ||
    normalizeCountryCode(req.headers["cf-ipcountry"]) ||
    normalizeCountryCode(req.headers["cloudfront-viewer-country"]) ||
    normalizeCountryCode(req.headers["x-country-code"]);
  return {
    countryCode,
    countryName: countryCode || "Desconocido",
  };
}

async function resolveCountryFromIp(req: Request): Promise<{ countryCode: string; countryName: string }> {
  const byHeader = detectCountryFromHeaders(req);
  if (byHeader.countryCode) return byHeader;

  const ip = extractClientIp(req);
  if (!ip || !isPublicIp(ip)) {
    return { countryCode: "LO", countryName: "Red local" };
  }

  const now = Date.now();
  const cached = ipCountryCache.get(ip);
  if (cached && cached.expiresAt > now) {
    return { countryCode: cached.countryCode, countryName: cached.countryName };
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1800);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code`, {
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { success?: boolean; country?: string; country_code?: string };
    const cc = normalizeCountryCode(data?.country_code);
    const countryName = String(data?.country || cc || "Desconocido").slice(0, 80);
    const out = { countryCode: cc || "UN", countryName };
    ipCountryCache.set(ip, { ...out, expiresAt: now + IP_COUNTRY_CACHE_TTL_MS });
    return out;
  } catch {
    const out = { countryCode: "UN", countryName: "Desconocido" };
    ipCountryCache.set(ip, { ...out, expiresAt: now + 5 * 60 * 1000 });
    return out;
  }
}

async function resolveCountryFromIpValue(ipRaw: string): Promise<{ countryCode: string; countryName: string }> {
  const ip = String(ipRaw || "").trim();
  if (!ip || !isPublicIp(ip)) return { countryCode: "UN", countryName: "Desconocido" };

  const now = Date.now();
  const cached = ipCountryCache.get(ip);
  if (cached && cached.expiresAt > now) {
    return { countryCode: cached.countryCode, countryName: cached.countryName };
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1800);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code`, {
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { success?: boolean; country?: string; country_code?: string };
    const cc = normalizeCountryCode(data?.country_code);
    const countryName = String(data?.country || cc || "Desconocido").slice(0, 80);
    const out = { countryCode: cc || "UN", countryName };
    ipCountryCache.set(ip, { ...out, expiresAt: now + IP_COUNTRY_CACHE_TTL_MS });
    return out;
  } catch {
    return { countryCode: "UN", countryName: "Desconocido" };
  }
}

async function touchMarketplacePresence(req: Request, fallbackPath: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS * 4).toISOString();
  const currentPath = String(req.originalUrl || fallbackPath).slice(0, 200);
  const auth = await resolveAuthSnapshot(req);
  const viewerType = auth.viewerType;
  const visitorId = visitorFingerprintFromRequest(req);
  const clientIp = selectBestPresenceIp(req);
  const userEmail = auth.email;
  const ipCountry = await resolveCountryFromIp(req);
  const fallbackCode = "UN";
  const countryCode = shouldUseClientCountryFallback(ipCountry.countryCode) ? fallbackCode : ipCountry.countryCode;
  const countryName = shouldUseClientCountryFallback(ipCountry.countryCode)
    ? "Desconocido"
    : ipCountry.countryName;
  const upsertSql =
    `INSERT INTO marketplace_presence (visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(visitor_id)
     DO UPDATE SET viewer_type = excluded.viewer_type, country_code = excluded.country_code, country_name = excluded.country_name, client_ip = excluded.client_ip, user_email = excluded.user_email, current_path = excluded.current_path, last_seen_at = excluded.last_seen_at`;
  if (isPg()) {
    await db
      .prepare(`${upsertSql} RETURNING visitor_id as id`)
      .get(visitorId, viewerType, countryCode, countryName, clientIp, userEmail, currentPath, nowIso);
  } else {
    await db.prepare(upsertSql).run(visitorId, viewerType, countryCode, countryName, clientIp, userEmail, currentPath, nowIso);
  }
  await db.prepare("DELETE FROM marketplace_presence WHERE last_seen_at < ?").run(cutoffIso);
}

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

type MarketplacePresenceHistorySnapshot = {
  visitorId: string;
  viewerType: string;
  countryCode: string;
  countryName: string;
  clientIp: string;
  userEmail: string;
  currentPath: string;
  locale: string;
  timezone: string;
};

function presenceHistorySignature(s: MarketplacePresenceHistorySnapshot): string {
  return JSON.stringify([
    s.viewerType,
    s.countryCode,
    s.countryName,
    s.clientIp,
    s.userEmail,
    s.currentPath,
    s.locale,
    s.timezone,
  ]);
}

async function maybeRecordMarketplacePresenceHistory(
  snap: MarketplacePresenceHistorySnapshot,
  recordedAtIso: string
): Promise<void> {
  try {
    const lastRaw = (await db
      .prepare(
        `SELECT visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, locale, timezone, recorded_at
         FROM marketplace_presence_history WHERE visitor_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(snap.visitorId)) as Record<string, unknown> | undefined;
    if (lastRaw) {
      const lr = rowKeysToLowercase(lastRaw) as Record<string, string>;
      const prev: MarketplacePresenceHistorySnapshot = {
        visitorId: snap.visitorId,
        viewerType: String(lr.viewer_type || ""),
        countryCode: normalizeCountryCode(lr.country_code),
        countryName: String(lr.country_name || "").trim(),
        clientIp: String(lr.client_ip || "").trim(),
        userEmail: String(lr.user_email || "").trim().toLowerCase(),
        currentPath: String(lr.current_path || "").trim(),
        locale: String(lr.locale || "").trim(),
        timezone: String(lr.timezone || "").trim(),
      };
      const lastMs = new Date(String(lr.recorded_at || "")).getTime();
      if (
        presenceHistorySignature(prev) === presenceHistorySignature(snap) &&
        Number.isFinite(lastMs) &&
        Date.now() - lastMs < MARKETPLACE_PRESENCE_HISTORY_DEDUPE_MS
      ) {
        return;
      }
    }
    await db
      .prepare(
        `INSERT INTO marketplace_presence_history (visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, locale, timezone, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snap.visitorId.slice(0, 120),
        snap.viewerType,
        snap.countryCode.slice(0, 2),
        snap.countryName.slice(0, 80),
        snap.clientIp.slice(0, 80),
        snap.userEmail.slice(0, 200),
        snap.currentPath.slice(0, 200),
        snap.locale.slice(0, 20),
        snap.timezone.slice(0, 60),
        recordedAtIso
      );
  } catch {
    /* historial no debe romper el heartbeat */
  }
}

function equipoDbRowToVitrinaInput(raw: Record<string, unknown>): EquipoAsicVitrinaRow | null {
  const r = rowKeysToLowercase(raw);
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    marca_equipo: String(r.marca_equipo ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    precio_usd: Math.max(0, Math.round(Number(r.precio_usd) || 0)),
    mp_algo: typeof r.mp_algo === "string" && r.mp_algo.trim() ? r.mp_algo.trim() : null,
    mp_hashrate_display: typeof r.mp_hashrate_display === "string" ? r.mp_hashrate_display : null,
    mp_image_src: typeof r.mp_image_src === "string" ? r.mp_image_src : null,
    mp_gallery_json: typeof r.mp_gallery_json === "string" ? r.mp_gallery_json : null,
    mp_detail_rows_json: typeof r.mp_detail_rows_json === "string" ? r.mp_detail_rows_json : null,
    mp_yield_json: typeof r.mp_yield_json === "string" ? r.mp_yield_json : null,
    mp_hashrate_sell_enabled: r.mp_hashrate_sell_enabled as number | boolean | null,
    mp_hashrate_parts_json: typeof r.mp_hashrate_parts_json === "string" ? r.mp_hashrate_parts_json : null,
    mp_price_label: typeof r.mp_price_label === "string" ? r.mp_price_label : null,
    mp_listing_kind: typeof r.mp_listing_kind === "string" ? r.mp_listing_kind : null,
  };
}

type CorpHomeVitrinaProduct = NonNullable<ReturnType<typeof mapEquipoRowToVitrinaWithAlgoFallback>>;

async function corpHomeVitrinaProductsByEquipoIds(ids: string[]): Promise<CorpHomeVitrinaProduct[]> {
  const products: CorpHomeVitrinaProduct[] = [];
  for (const id of ids) {
    const raw = (await db.prepare(`${EQUIPOS_ASIC_SELECT} WHERE id = ?`).get(id)) as Record<string, unknown> | undefined;
    if (!raw) continue;
    const row = equipoDbRowToVitrinaInput(raw);
    if (!row) continue;
    const p = mapEquipoRowToVitrinaWithAlgoFallback(row);
    if (p) products.push(p);
  }
  return products;
}

function rowToProduct(r: Row) {
  const active = typeof r.is_active === "boolean" ? r.is_active : Number(r.is_active) === 1;
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    priceUsd: Number(r.price_usd) || 0,
    imageUrl: r.image_url ?? null,
    stock: Number(r.stock) || 0,
    isActive: active,
    sortOrder: Number(r.sort_order) || 0,
    createdAt: r.created_at,
  };
}

/** Conteo de navegantes activos del marketplace (cliente/invitado/staff). */
marketplaceRouter.post("/marketplace/presence/heartbeat", marketplacePublicPostRateLimit, async (req: Request, res: Response) => {
  const parsed = MarketplacePresenceHeartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS * 4).toISOString();
    const currentPath = (parsed.data.currentPath || "/marketplace").slice(0, 200);
    const auth = await resolveAuthSnapshot(req);
    const viewerType = auth.viewerType !== "anon" ? auth.viewerType : parsed.data.viewerType ?? "anon";
    const clientIp = selectBestPresenceIp(req, parsed.data.clientIp);
    const userEmail = (auth.email || String(parsed.data.userEmail || "").trim().toLowerCase()).slice(0, 200);
    const ipCountry = await resolveCountryFromIp(req);
    const clientIpCountry =
      shouldUseClientCountryFallback(ipCountry.countryCode) && clientIp
        ? await resolveCountryFromIpValue(clientIp)
        : { countryCode: "", countryName: "" };
    const clientCountryCode = normalizeCountryCode(parsed.data.countryCode);
    const clientCountryName = String(parsed.data.countryName || "").trim().slice(0, 80);
    const localeCode = countryCodeFromLocale(parsed.data.locale || "");
    const timezoneCode = countryCodeFromTimezone(parsed.data.timezone || "");
    const hintCode =
      (isUsableCountryCode(timezoneCode) ? timezoneCode : "") ||
      (isUsableCountryCode(clientIpCountry.countryCode) ? normalizeCountryCode(clientIpCountry.countryCode) : "") ||
      (isUsableCountryCode(clientCountryCode) ? clientCountryCode : "") ||
      (isUsableCountryCode(localeCode) ? localeCode : "") ||
      "PY";
    const countryCode = shouldUseClientCountryFallback(ipCountry.countryCode) ? hintCode : ipCountry.countryCode;
    const countryName =
      shouldUseClientCountryFallback(ipCountry.countryCode)
        ? (!isUnknownCountryName(clientIpCountry.countryName) ? clientIpCountry.countryName : "") ||
          (!isUnknownCountryName(clientCountryName) ? clientCountryName : "") ||
          countryNameFromCode(hintCode) ||
          hintCode
        : ipCountry.countryName.slice(0, 80);
    const upsertSql =
      `INSERT INTO marketplace_presence (visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(visitor_id)
       DO UPDATE SET viewer_type = excluded.viewer_type, country_code = excluded.country_code, country_name = excluded.country_name, client_ip = excluded.client_ip, user_email = excluded.user_email, current_path = excluded.current_path, last_seen_at = excluded.last_seen_at`;
    if (isPg()) {
      await db
        .prepare(`${upsertSql} RETURNING visitor_id as id`)
        .get(parsed.data.visitorId, viewerType, countryCode, countryName, clientIp, userEmail, currentPath, nowIso);
    } else {
      await db.prepare(upsertSql).run(parsed.data.visitorId, viewerType, countryCode, countryName, clientIp, userEmail, currentPath, nowIso);
    }
    await db.prepare("DELETE FROM marketplace_presence WHERE last_seen_at < ?").run(cutoffIso);
    const visitorKey = String(parsed.data.visitorId || "").trim();
    if (visitorKey.length >= 8) {
      await maybeRecordMarketplacePresenceHistory(
        {
          visitorId: visitorKey,
          viewerType,
          countryCode: normalizeCountryCode(countryCode),
          countryName: String(countryName || "").trim().slice(0, 80),
          clientIp: String(clientIp || "").trim().slice(0, 80),
          userEmail,
          currentPath,
          locale: String(parsed.data.locale || "").trim().slice(0, 20),
          timezone: String(parsed.data.timezone || "").trim().slice(0, 60),
        },
        nowIso
      );
    }
    res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[marketplace] POST /marketplace/presence/heartbeat", msg);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Formulario público «Contacto» (sin mailto): envía por Resend en el servidor. */
marketplaceRouter.post("/marketplace/contact", marketplacePublicPostRateLimit, async (req: Request, res: Response) => {
  const parsed = MarketplaceContactPublicSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const { simulated } = await sendMarketplaceContactEmail({
      firstName: parsed.data.name,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      subject: parsed.data.subject,
      phone: parsed.data.phone,
      message: parsed.data.message,
    });
    res.json({ ok: true as const, simulated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: { message: msg } });
  }
});

/** Consulta por correo desde ficha ASIC o desde carrito (`source: cart`, sin mailto). */
marketplaceRouter.post("/marketplace/asic-inquiry", marketplacePublicPostRateLimit, async (req: Request, res: Response) => {
  const parsed = MarketplaceAsicInquiryPublicSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const { simulated } = await sendMarketplaceAsicInquiryEmail({
      visitorEmail: parsed.data.email,
      visitorName: parsed.data.name,
      subject: parsed.data.subject,
      message: parsed.data.message,
      source: parsed.data.source,
    });
    res.json({ ok: true as const, simulated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: { message: msg } });
  }
});

/** Vista interna: cuántas personas están navegando el marketplace ahora mismo. */
marketplaceRouter.get("/marketplace/presence-stats", requireAuth, adminAB, async (_req: Request, res: Response) => {
  try {
    const cutoffIso = new Date(Date.now() - MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS).toISOString();
    const rows = (await db
      .prepare("SELECT viewer_type, COUNT(*) as c FROM marketplace_presence WHERE last_seen_at >= ? GROUP BY viewer_type")
      .all(cutoffIso)) as Array<{ viewer_type: string; c: number }>;
    const byViewerType: Record<string, number> = {};
    let onlineTotal = 0;
    for (const r of rows) {
      const key = String(r.viewer_type || "anon");
      const n = Number(r.c) || 0;
      byViewerType[key] = n;
      onlineTotal += n;
    }
    res.json({
      onlineTotal,
      byViewerType,
      windowSeconds: Math.floor(MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS / 1000),
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Vista interna detallada: sesiones activas del marketplace en tiempo real. */
marketplaceRouter.get("/marketplace/presence-live", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const cutoffIso = new Date(Date.now() - MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS).toISOString();
    const rows = (await db
      .prepare(
        "SELECT visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, last_seen_at FROM marketplace_presence WHERE last_seen_at >= ? ORDER BY last_seen_at DESC LIMIT 120"
      )
      .all(cutoffIso)) as Array<{
      visitor_id: string;
      viewer_type: string;
      country_code: string | null;
      country_name: string | null;
      client_ip: string | null;
      user_email: string | null;
      current_path: string | null;
      last_seen_at: string;
    }>;
    const liveFallbackCode = "UN";
    const hydratedRows = await Promise.all(
      rows.map(async (r) => {
        const cc = normalizeCountryCode(r.country_code);
        const cn = String(r.country_name || "").trim();
        if (isUsableCountryCode(cc) && !isUnknownCountryName(cn)) return r;
        const fromIp = await resolveCountryFromIpValue(String(r.client_ip || ""));
        if (isUsableCountryCode(fromIp.countryCode)) {
          return {
            ...r,
            country_code: fromIp.countryCode,
            country_name: fromIp.countryName,
          };
        }
        return {
          ...r,
          country_code: liveFallbackCode,
          country_name: "Desconocido",
        };
      })
    );
    const countries: Record<
      string,
      { countryCode: string; countryName: string; count: number; loggedCount: number; anonCount: number }
    > = {};
    for (const r of hydratedRows) {
      const cc = normalizeCountryCode(r.country_code) || "UN";
      const nm = String(r.country_name || cc || "Desconocido");
      const vt = String(r.viewer_type || "").toLowerCase().trim();
      const isLogged = vt === "cliente" || vt === "staff";
      const prev = countries[cc];
      if (prev) {
        prev.count += 1;
        if (isLogged) prev.loggedCount += 1;
        else prev.anonCount += 1;
      } else {
        countries[cc] = {
          countryCode: cc,
          countryName: nm,
          count: 1,
          loggedCount: isLogged ? 1 : 0,
          anonCount: isLogged ? 0 : 1,
        };
      }
    }
    res.json({
      rows: hydratedRows.map((r) => ({
        visitorId: r.visitor_id,
        viewerType: r.viewer_type,
        countryCode: normalizeCountryCode(r.country_code) || "UN",
        countryName: String(r.country_name || normalizeCountryCode(r.country_code) || "Desconocido"),
        clientIp: String(r.client_ip || "").trim(),
        userEmail: String(r.user_email || "").trim(),
        currentPath: r.current_path ?? "/marketplace",
        lastSeenAt: r.last_seen_at,
      })),
      countries: Object.values(countries).sort((a, b) => b.count - a.count),
      windowSeconds: Math.floor(MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS / 1000),
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Historial de heartbeats del marketplace (staff / cliente / invitado), persistido en BD. */
marketplaceRouter.get("/marketplace/presence-history", requireAuth, adminAB, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const qRaw = String(req.query.q || "")
      .trim()
      .toLowerCase()
      .replace(/[%_\\]/g, "")
      .slice(0, 120);
    const pat = qRaw ? `%${qRaw}%` : "";
    const vtRaw = String(req.query.viewerType || "")
      .trim()
      .toLowerCase();
    const viewerFilter =
      vtRaw === "anon" || vtRaw === "cliente" || vtRaw === "staff" ? vtRaw : "";
    const whereParts: string[] = [];
    const whereParams: unknown[] = [];
    if (qRaw) {
      whereParts.push(
        `(LOWER(visitor_id) LIKE ? OR LOWER(COALESCE(user_email,'')) LIKE ? OR LOWER(COALESCE(current_path,'')) LIKE ? OR LOWER(COALESCE(client_ip,'')) LIKE ? OR LOWER(COALESCE(country_name,'')) LIKE ? OR LOWER(COALESCE(country_code,'')) LIKE ?)`
      );
      whereParams.push(pat, pat, pat, pat, pat, pat);
    }
    if (viewerFilter) {
      whereParts.push(`LOWER(TRIM(viewer_type)) = ?`);
      whereParams.push(viewerFilter);
    }
    const where = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
    const countRow = (await db
      .prepare(`SELECT COUNT(*) as c FROM marketplace_presence_history${where}`)
      .get(...whereParams)) as { c: number } | undefined;
    const total = Number(countRow?.c) || 0;
    const rowsRaw = (await db
      .prepare(
        `SELECT id, visitor_id, viewer_type, country_code, country_name, client_ip, user_email, current_path, locale, timezone, recorded_at
         FROM marketplace_presence_history${where} ORDER BY recorded_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(...whereParams, limit, offset)) as Array<Record<string, unknown>>;
    const rows = rowsRaw.map((raw) => {
      const r = rowKeysToLowercase(raw) as Record<string, string | number | null | undefined>;
      return {
        id: Number(r.id) || 0,
        visitorId: String(r.visitor_id || ""),
        viewerType: String(r.viewer_type || ""),
        countryCode: normalizeCountryCode(r.country_code) || "UN",
        countryName: String(r.country_name || "").trim() || "Desconocido",
        clientIp: String(r.client_ip || "").trim(),
        userEmail: String(r.user_email || "").trim(),
        currentPath: String(r.current_path || "").trim() || "/marketplace",
        locale: String(r.locale || "").trim(),
        timezone: String(r.timezone || "").trim(),
        recordedAt: String(r.recorded_at || ""),
      };
    });
    res.json({ rows, total, limit, offset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/**
 * GET /marketplace/setup-quote-prices — S02 (equipo completo) + S03 (fracción hashrate).
 * Público: carrito sin JWT.
 */
marketplaceRouter.get("/marketplace/setup-quote-prices", async (req: Request, res: Response) => {
  const FALLBACK = 50;
  let setupEquipoCompletoUsd = FALLBACK;
  let setupCompraHashrateUsd = FALLBACK;
  try {
    await touchMarketplacePresence(req, "/marketplace/setup-quote-prices");
    [setupEquipoCompletoUsd, setupCompraHashrateUsd] = await Promise.all([
      resolveSetupEquipoCompletoUsd(),
      resolveSetupCompraHashrateUsd(),
    ]);
  } catch (e) {
    console.error("[marketplace] setup-quote-prices (usando fallback):", e);
  }
  try {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json({ setupEquipoCompletoUsd, setupCompraHashrateUsd });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[marketplace] setup-quote-prices response:", e);
    res.status(500).json({ error: { message: msg } });
  }
});

/**
 * GET /marketplace/setup-compra-hashrate-usd — solo S03 (compatibilidad).
 * Público: carrito invitado y vitrina sin JWT.
 */
marketplaceRouter.get("/marketplace/setup-compra-hashrate-usd", async (req: Request, res: Response) => {
  try {
    await touchMarketplacePresence(req, "/marketplace/setup-compra-hashrate-usd");
    const precioUSD = await resolveSetupCompraHashrateUsd();
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json({ precioUSD });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/**
 * GET /marketplace/garantia-quote-prices — ítems con precio desde `items_garantia_ande` (misma fuente que /equipos-asic/items-garantia).
 * Público: el carrito de cotización empareja por código o marca+modelo (ej. Antminer Z15).
 */
marketplaceRouter.get("/marketplace/garantia-quote-prices", async (req: Request, res: Response) => {
  try {
    await touchMarketplacePresence(req, "/marketplace/garantia-quote-prices");
    const raw = await loadGarantiaQuoteRows();
    const items = raw
      .filter((x) => Number.isFinite(x.precioGarantia) && x.precioGarantia >= 0)
      .map((x) => ({
        codigo: x.codigo,
        marca: x.marca,
        modelo: x.modelo,
        ...(x.marketplaceEquipoId ? { marketplaceEquipoId: x.marketplaceEquipoId } : {}),
        precioGarantia: Math.round(x.precioGarantia),
      }));
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[marketplace] garantia-quote-prices:", e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** Filtro vitrina: entero 0/1 o boolean en Postgres — evita COALESCE(mp_visible,0) con tipos boolean. */
function sqlMarketplaceVisible(): string {
  return "(COALESCE(CAST(mp_visible AS INTEGER), 0) = 1)";
}

/**
 * GET /marketplace/corp-best-selling — hasta 4 equipos elegidos en /marketplacedashboard para la home corporativa.
 * Público (sin token). Orden = orden guardado en `marketplace_site_kv`.
 */
marketplaceRouter.get("/marketplace/corp-best-selling", async (req: Request, res: Response) => {
  try {
    await touchMarketplacePresence(req, "/marketplace/corp-best-selling");
    const auth = await resolveAuthSnapshot(req);
    const hidePricesForGuests = await readMarketplaceHidePricesForGuests();
    const canViewPrices = auth.viewerType !== "anon" || !hidePricesForGuests;
    const ids = await readCorpBestSellingEquipoIds();
    const products = await corpHomeVitrinaProductsByEquipoIds(ids);
    const visibleProducts = withMarketplacePriceVisibility(products, canViewPrices);
    const cacheControl = hidePricesForGuests
      ? auth.viewerType === "anon"
        ? "public, max-age=30, stale-while-revalidate=60"
        : "private, no-store"
      : "public, max-age=30, stale-while-revalidate=60";
    res.set("Cache-Control", cacheControl);
    res.json({ products: visibleProducts, hidePricesForGuests });
  } catch (e) {
    console.error("[marketplace] corp-best-selling:", e);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ products: [], hidePricesForGuests: true });
  }
});

/**
 * GET /marketplace/corp-interesting — hasta 4 equipos para «Otros Productos Interesantes» en /marketplace/home.
 * Público. Orden = orden guardado en `marketplace_site_kv`.
 */
marketplaceRouter.get("/marketplace/corp-interesting", async (req: Request, res: Response) => {
  try {
    await touchMarketplacePresence(req, "/marketplace/corp-interesting");
    const auth = await resolveAuthSnapshot(req);
    const hidePricesForGuests = await readMarketplaceHidePricesForGuests();
    const canViewPrices = auth.viewerType !== "anon" || !hidePricesForGuests;
    const ids = await readCorpInterestingEquipoIds();
    const products = await corpHomeVitrinaProductsByEquipoIds(ids);
    const visibleProducts = withMarketplacePriceVisibility(products, canViewPrices);
    const cacheControl = hidePricesForGuests
      ? auth.viewerType === "anon"
        ? "public, max-age=30, stale-while-revalidate=60"
        : "private, no-store"
      : "public, max-age=30, stale-while-revalidate=60";
    res.set("Cache-Control", cacheControl);
    res.json({ products: visibleProducts, hidePricesForGuests });
  } catch (e) {
    console.error("[marketplace] corp-interesting:", e);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ products: [], hidePricesForGuests: true });
  }
});

/** GET /marketplace/asic-vitrina — catálogo ASIC para /marketplace (sin token). Origen: equipos_asic con mp_visible. */
marketplaceRouter.get("/marketplace/asic-vitrina", async (req: Request, res: Response) => {
  try {
    const auth = await resolveAuthSnapshot(req);
    const hidePricesForGuests = await readMarketplaceHidePricesForGuests();
    const canViewPrices = auth.viewerType !== "anon" || !hidePricesForGuests;
    // No bloquear la respuesta del catálogo por telemetría/presencia.
    void touchMarketplacePresence(req, "/marketplace/asic-vitrina").catch((err) => {
      console.warn("[marketplace] asic-vitrina presence:", err);
    });
    const clause = sqlMarketplaceVisible();
    const sql = `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_hashrate_sell_enabled, mp_hashrate_parts_json, mp_price_label, mp_listing_kind
      FROM equipos_asic WHERE ${clause} ORDER BY marca_equipo ASC, modelo ASC, procesador ASC`;
    let raw: Record<string, unknown>[];
    try {
      raw = (await db.prepare(sql).all()) as Record<string, unknown>[];
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.toLowerCase().includes("mp_hashrate_sell_enabled") || m.toLowerCase().includes("mp_hashrate_parts_json")) {
        const legacySql = `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_price_label, mp_listing_kind
          FROM equipos_asic WHERE ${clause} ORDER BY marca_equipo ASC, modelo ASC, procesador ASC`;
        raw = (await db.prepare(legacySql).all()) as Record<string, unknown>[];
      } else {
        throw e;
      }
    }
    const rows = raw
      .map((r) => rowKeysToLowercase(r) as Record<string, unknown>)
      .filter((r) => mpVisibleFromDbValue(r.mp_visible))
      .map((r) => {
        const { mp_visible: _drop, ...rest } = r;
        return rest as EquipoAsicVitrinaRow;
      });
    const products = rows.map(mapEquipoRowToVitrina).filter((p): p is NonNullable<typeof p> => p != null);
    const visibleProducts = withMarketplacePriceVisibility(products, canViewPrices);
    const cacheControl = hidePricesForGuests
      ? auth.viewerType === "anon"
        ? "public, max-age=45, stale-while-revalidate=120"
        : "private, no-store"
      : "public, max-age=45, stale-while-revalidate=120";
    res.set("Cache-Control", cacheControl);
    res.json({ products: visibleProducts, hidePricesForGuests });
  } catch (e) {
    console.error("[marketplace] asic-vitrina:", e);
    /* Evitar 500 en el cliente: catálogo vacío hasta corregir BD/migraciones. */
    res.set("Cache-Control", "no-store");
    res.status(200).json({ products: [], hidePricesForGuests: true });
  }
});

const AsicYieldRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        algo: z.enum(["sha256", "scrypt"]),
        hashrate: z.string().min(1).max(200),
        detailRows: z.array(z.object({ icon: z.string(), text: z.string() })).optional(),
      })
    )
    .min(1)
    .max(48),
});

function parseCustomYieldConfig(raw: string | null | undefined): {
  url: string;
  powerW: number;
  electricityUsdPerKwh: number;
} | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const parseUrlDefaults = (url: string, fallbackPower = 2600, fallbackCost = 0.078) => {
    try {
      const u = new URL(url);
      const powerQ = Math.max(1, Math.round(Number(u.searchParams.get("p")) || 0)) || fallbackPower;
      const costQ = Number(u.searchParams.get("cost"));
      const electricityQ = Number.isFinite(costQ) && costQ >= 0 ? costQ : fallbackCost;
      return { url, powerW: powerQ, electricityUsdPerKwh: electricityQ };
    } catch {
      return null;
    }
  };
  if (/^https?:\/\//i.test(t)) return parseUrlDefaults(t);
  try {
    const parsed = JSON.parse(t) as {
      type?: unknown;
      url?: unknown;
      powerW?: unknown;
      electricityUsdPerKwh?: unknown;
      power?: unknown;
      cost?: unknown;
    };
    const url = String(parsed.url ?? "").trim();
    if (!url) return null;
    const isCustom = String(parsed.type ?? "") === "wtm_custom" || parsed.type == null;
    if (!isCustom) return null;
    const powerW = Math.max(1, Math.round(Number(parsed.powerW) || 0));
    const electricityUsdPerKwhRaw =
      Number.isFinite(Number(parsed.electricityUsdPerKwh))
        ? Number(parsed.electricityUsdPerKwh)
        : Number(parsed.cost);
    const fallback = parseUrlDefaults(url);
    if (!fallback) return null;
    return {
      url,
      powerW: Number.isFinite(powerW) && powerW > 0 ? powerW : fallback.powerW,
      electricityUsdPerKwh:
        Number.isFinite(electricityUsdPerKwhRaw) && electricityUsdPerKwhRaw >= 0
          ? electricityUsdPerKwhRaw
          : fallback.electricityUsdPerKwh,
    };
  } catch {
    return null;
  }
}

/**
 * POST /marketplace/asic-yields — estimación de rendimiento en vivo (sin token).
 * Usa difficulty/emisiones de red públicas + CoinGecko; merge LTC+DOGE calibrado vs WhatToMine.
 */
marketplaceRouter.post("/marketplace/asic-yields", marketplacePublicPostRateLimit, async (req: Request, res: Response) => {
  try {
    // El cálculo de yields en vivo no debe esperar telemetría.
    void touchMarketplacePresence(req, "/marketplace/asic-yields").catch((err) => {
      console.warn("[marketplace] asic-yields presence:", err);
    });
    const parsed = AsicYieldRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
    }
    const items = parsed.data.items as AsicYieldItem[];
    const ids = Array.from(new Set(items.map((x) => String(x.id ?? "").trim()).filter(Boolean)));
    const customById = new Map<string, { url: string; powerW: number; electricityUsdPerKwh: number }>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(", ");
      const rows = (await db
        .prepare(`SELECT id, mp_yield_json FROM equipos_asic WHERE id IN (${ph})`)
        .all(...ids)) as Array<{ id: string; mp_yield_json: string | null }>;
      for (const r of rows) {
        const cfg = parseCustomYieldConfig(r.mp_yield_json);
        if (cfg) customById.set(String(r.id), cfg);
      }
    }
    const customItems = items.filter((it) => customById.has(String(it.id)));
    const nonCustomItemsBase = items.filter((it) => !customById.has(String(it.id)));
    const snap = await fetchNetworkMiningSnapshot();
    const fallbackFromCustom: AsicYieldItem[] = [];
    const customYieldRows: Array<{ id: string; line1: string; line2: string; note: string }> = [];
    for (const it of customItems) {
      const cfg = customById.get(String(it.id));
      if (!cfg) {
        fallbackFromCustom.push(it);
        continue;
      }
      const y = await estimateYieldFromCustomWhatToMine(cfg);
      if (!y) {
        fallbackFromCustom.push(it);
        continue;
      }
      customYieldRows.push({ id: String(it.id), line1: y.line1, line2: y.line2, note: y.note });
    }
    const nonCustomItems = [...nonCustomItemsBase, ...fallbackFromCustom];
    const zecItems = nonCustomItems.filter(detectZecEquihashYieldItem);
    const otherItems = nonCustomItems.filter((it) => !detectZecEquihashYieldItem(it));
    let yields: ReturnType<typeof estimateAllYields> = [];
    try {
      const zecYields = await Promise.all(zecItems.map((it) => fetchZecWhatToMineYieldForItem(it)));
      yields = [
        ...customYieldRows,
        ...zecYields.filter((y): y is NonNullable<(typeof zecYields)[number]> => y != null),
        ...estimateAllYields(otherItems, snap),
      ];
    } catch (estErr) {
      console.error("[marketplace] asic-yields estimate:", estErr);
    }
    const networkOk = snap != null || yields.length > 0;
    res.json({ ok: true, yields, networkOk });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[marketplace] asic-yields:", e);
    /* No devolver 500: la vitrina puede seguir sin estimación en vivo (red/API caída). */
    res.status(200).json({ ok: true, yields: [], networkOk: false, warning: msg });
  }
});

/** GET /catalog — vitrina pública para la página Marketplace (array JSON, sin token). */
marketplaceRouter.get("/catalog", async (req: Request, res: Response) => {
  try {
    await touchMarketplacePresence(req, "/catalog");
    const activeClause = isPg() ? "is_active = true" : "is_active = 1";
    const sql = `SELECT name, description, category, price_usd, image_url FROM marketplace_products WHERE ${activeClause} ORDER BY sort_order ASC, name ASC`;
    const rows = (await db.prepare(sql).all()) as Array<{
      name: string;
      description: string | null;
      category: string | null;
      price_usd: number;
      image_url: string | null;
    }>;
    const lang = typeof req.query.lang === "string" ? req.query.lang : "es";
    void lang;
    const out = rows.map((r) => ({
      name: r.name,
      description: r.description ?? "",
      algo: (r.category && String(r.category).trim()) || "general",
      image: r.image_url,
      priceUsd: Number(r.price_usd) || 0,
    }));
    res.json(out);
  } catch {
    res.json([]);
  }
});

/** GET /marketplace/products — catálogo (solo activos por defecto; staff ve todos con ?all=1) */
marketplaceRouter.get("/marketplace/products", requireAuth, async (req, res: Response) => {
  try {
    const showAll = req.query.all === "1" && ["admin_a", "admin_b", "operador"].includes((req.user?.role ?? "").toLowerCase().trim());
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    let sql =
      "SELECT id, name, description, category, price_usd, image_url, stock, is_active, sort_order, created_at FROM marketplace_products WHERE 1=1";
    const params: unknown[] = [];
    if (!showAll) {
      sql += isPg() ? " AND is_active = true" : " AND is_active = 1";
    }
    if (category) {
      sql += " AND LOWER(TRIM(COALESCE(category, ''))) = LOWER(?)";
      params.push(category);
    }
    sql += " ORDER BY sort_order ASC, name ASC";

    const rows = (await db.prepare(sql).all(...params)) as Row[];
    let list = rows.map(rowToProduct);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    }
    res.json({ products: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** POST /marketplace/products */
marketplaceRouter.post("/marketplace/products", requireAuth, canManage, async (req, res: Response) => {
  const parsed = ProductCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const imageUrl = d.imageUrl ?? null;
  const isActiveVal = d.isActive !== false ? (isPg() ? true : 1) : (isPg() ? false : 0);
  const sortOrder = d.sortOrder ?? 0;
  try {
    const result = await db
      .prepare(
        "INSERT INTO marketplace_products (name, description, category, price_usd, image_url, stock, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        d.name,
        d.description ?? null,
        d.category ?? null,
        d.priceUsd,
        imageUrl,
        d.stock,
        isActiveVal,
        sortOrder
      );
    const id = result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null;
    res.status(201).json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /marketplace/products/:id */
marketplaceRouter.put("/marketplace/products/:id", requireAuth, canManage, async (req, res: Response) => {
  const idParam = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });

  const parsed = ProductUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const current = (await db.prepare("SELECT * FROM marketplace_products WHERE id = ?").get(id)) as Row | undefined;
  if (!current) return res.status(404).json({ error: { message: "Producto no encontrado" } });

  const name = d.name ?? current.name;
  const description = d.description !== undefined ? d.description : current.description;
  const category = d.category !== undefined ? d.category : current.category;
  const priceUsd = d.priceUsd !== undefined ? d.priceUsd : Number(current.price_usd);
  let imageUrl: string | null;
  if (d.imageUrl !== undefined) {
    imageUrl = d.imageUrl ?? null;
  } else {
    imageUrl = current.image_url;
  }
  const stock = d.stock !== undefined ? d.stock : Number(current.stock);
  let isActive: number | boolean;
  if (d.isActive !== undefined) {
    isActive = isPg() ? d.isActive : d.isActive ? 1 : 0;
  } else {
    const cur = typeof current.is_active === "boolean" ? current.is_active : Number(current.is_active) === 1;
    isActive = isPg() ? cur : cur ? 1 : 0;
  }
  const sortOrder = d.sortOrder !== undefined ? d.sortOrder : Number(current.sort_order);

  try {
    const result = await db
      .prepare(
        "UPDATE marketplace_products SET name = ?, description = ?, category = ?, price_usd = ?, image_url = ?, stock = ?, is_active = ?, sort_order = ? WHERE id = ?"
      )
      .run(name, description, category, priceUsd, imageUrl, stock, isActive, sortOrder, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Producto no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /marketplace/products/:id */
marketplaceRouter.delete("/marketplace/products/:id", requireAuth, canManage, async (req, res: Response) => {
  const idParam = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "ID inválido" } });
  try {
    const result = await db.prepare("DELETE FROM marketplace_products WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Producto no encontrado" } });
    res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
