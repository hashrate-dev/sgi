import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { mapEquipoRowToVitrina, type EquipoAsicVitrinaRow } from "../lib/asicVitrinaMapper.js";
import {
  estimateAllYields,
  fetchNetworkMiningSnapshot,
  type AsicYieldItem,
} from "../lib/miningYieldEstimate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { resolveSetupCompraHashrateUsd, resolveSetupEquipoCompletoUsd } from "../lib/marketplaceSetupHashratePrice.js";
import { loadGarantiaQuoteRows } from "../lib/marketplaceGarantiaQuote.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const marketplaceRouter = Router();

const canManage = requireRole("admin_a", "admin_b", "operador");
const adminAB = requireRole("admin_a", "admin_b");
const MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS = 90_000;

const MarketplacePresenceHeartbeatSchema = z.object({
  visitorId: z.string().min(8).max(120).trim(),
  viewerType: z.enum(["anon", "cliente", "staff"]).optional(),
  currentPath: z.string().max(200).trim().optional(),
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

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
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
marketplaceRouter.post("/marketplace/presence/heartbeat", async (req: Request, res: Response) => {
  const parsed = MarketplacePresenceHeartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - MARKETPLACE_PRESENCE_ONLINE_WINDOW_MS * 4).toISOString();
    const currentPath = (parsed.data.currentPath || "/marketplace").slice(0, 200);
    const viewerType = parsed.data.viewerType ?? "anon";
    await db
      .prepare(
        `INSERT INTO marketplace_presence (visitor_id, viewer_type, current_path, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(visitor_id)
         DO UPDATE SET viewer_type = excluded.viewer_type, current_path = excluded.current_path, last_seen_at = excluded.last_seen_at`
      )
      .run(parsed.data.visitorId, viewerType, currentPath, nowIso);
    await db.prepare("DELETE FROM marketplace_presence WHERE last_seen_at < ?").run(cutoffIso);
    res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
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

/**
 * GET /marketplace/setup-quote-prices — S02 (equipo completo) + S03 (fracción hashrate).
 * Público: carrito sin JWT.
 */
marketplaceRouter.get("/marketplace/setup-quote-prices", async (_req, res: Response) => {
  const FALLBACK = 50;
  let setupEquipoCompletoUsd = FALLBACK;
  let setupCompraHashrateUsd = FALLBACK;
  try {
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
marketplaceRouter.get("/marketplace/setup-compra-hashrate-usd", async (_req, res: Response) => {
  try {
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
marketplaceRouter.get("/marketplace/garantia-quote-prices", async (_req, res: Response) => {
  try {
    const raw = await loadGarantiaQuoteRows();
    const items = raw
      .filter((x) => Number.isFinite(x.precioGarantia) && x.precioGarantia >= 0)
      .map((x) => ({
        codigo: x.codigo,
        marca: x.marca,
        modelo: x.modelo,
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

/** GET /marketplace/asic-vitrina — catálogo ASIC para /marketplace (sin token). Origen: equipos_asic con mp_visible. */
marketplaceRouter.get("/marketplace/asic-vitrina", async (_req, res: Response) => {
  try {
    const clause = sqlMarketplaceVisible();
    const sql = `SELECT id, marca_equipo, modelo, procesador, precio_usd, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_price_label, mp_listing_kind
      FROM equipos_asic WHERE ${clause} ORDER BY marca_equipo ASC, modelo ASC, procesador ASC`;
    const raw = (await db.prepare(sql).all()) as Record<string, unknown>[];
    const rows = raw.map((r) => rowKeysToLowercase(r) as EquipoAsicVitrinaRow);
    const products = rows.map(mapEquipoRowToVitrina).filter((p): p is NonNullable<typeof p> => p != null);
    res.set("Cache-Control", "public, max-age=45, stale-while-revalidate=120");
    res.json({ products });
  } catch (e) {
    console.error("[marketplace] asic-vitrina:", e);
    /* Evitar 500 en el cliente: catálogo vacío hasta corregir BD/migraciones. */
    res.set("Cache-Control", "no-store");
    res.status(200).json({ products: [] });
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

/**
 * POST /marketplace/asic-yields — estimación de rendimiento en vivo (sin token).
 * Usa difficulty/emisiones de red públicas + CoinGecko; merge LTC+DOGE calibrado vs WhatToMine.
 */
marketplaceRouter.post("/marketplace/asic-yields", async (req, res: Response) => {
  try {
    const parsed = AsicYieldRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
    }
    const snap = await fetchNetworkMiningSnapshot();
    let yields: ReturnType<typeof estimateAllYields> = [];
    try {
      yields = estimateAllYields(parsed.data.items as AsicYieldItem[], snap);
    } catch (estErr) {
      console.error("[marketplace] asic-yields estimate:", estErr);
    }
    res.json({ ok: true, yields, networkOk: snap != null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[marketplace] asic-yields:", e);
    /* No devolver 500: la vitrina puede seguir sin estimación en vivo (red/API caída). */
    res.status(200).json({ ok: true, yields: [], networkOk: false, warning: msg });
  }
});

/** GET /catalog — vitrina pública para la página Marketplace (array JSON, sin token). */
marketplaceRouter.get("/catalog", async (req, res: Response) => {
  try {
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
