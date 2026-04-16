import type { Request, Response } from "express";
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  marketplaceImageUploadUsesMemory,
  uploadMarketplaceImageMw,
} from "../middleware/marketplaceImageUpload.js";
import {
  estimateYieldWhatToMineForEquipo,
  explainInferAlgoFailure,
  resolveMarketplaceAlgoForPersist,
} from "../lib/whattomineYield.js";
import {
  appendPrecioHistorial,
  initialPrecioHistorialJson,
  parsePrecioHistorialJson,
  syntheticFirstEntryFromFechaIngreso,
} from "../lib/precioHistorialAsic.js";
import { codigoProductoVitrina } from "../lib/marketplaceProductCode.js";
import { isAdminABRole, logEquipoAsicAudit } from "../lib/equipoAsicAudit.js";
import { mimeForSniffedFormat, sniffImageFormat } from "../lib/marketplaceImageSniff.js";
import { resolveVitrinaListingKind } from "../lib/asicVitrinaMapper.js";
import { mpVisibleFromDbValue } from "../lib/mpVisible.js";
import {
  readCorpBestSellingEquipoIds,
  readCorpInterestingEquipoIds,
  writeCorpBestSellingEquipoIds,
  writeCorpInterestingEquipoIds,
} from "../lib/marketplaceCorpBestSellingKv.js";

export const equiposRouter = Router();

const requireCanEdit = requireRole("admin_a", "admin_b", "operador");
const requireAdminsEquipo = requireRole("admin_a", "admin_b");

const CorpBestSellingBodySchema = z.object({
  ids: z.array(z.string().min(1).max(220)).max(4),
});

const CorpInterestingBodySchema = z.object({
  ids: z.array(z.string().min(1).max(220)).max(4),
});

/**
 * Imagen vitrina: ruta corta (`/images/marketplace-uploads/...`) o data URL en serverless
 * (ver `marketplaceImageUpload.ts`, hasta ~4 MB binario en memoria → base64 acotado al máx. del campo).
 */
const MARKETPLACE_IMAGE_SRC_MAX_LEN = 6_000_000;
/** Galería JSON puede incluir varias URLs / data URLs. */
const MARKETPLACE_GALLERY_JSON_MAX_LEN = 12_000_000;

const HashratePartSchema = z.object({
  sharePct: z.number().int().min(1).max(100),
  warrantyPct: z.number().int().min(0).max(100),
  setupUsd: z.number().int().min(0).max(999999),
});

const EquipoBodySchema = z
  .object({
    /** En POST se ignora (se asigna en servidor). En PUT se ignora (no se puede cambiar). */
    fechaIngreso: z.string().optional().default(""),
    marcaEquipo: z.string().min(1, "Marca requerida"),
    modelo: z.string().min(1, "Modelo requerido"),
    procesador: z.string().min(1, "Procesador requerido"),
    precioUSD: z.number().int().min(0).max(999999).default(0),
    observaciones: z.string().optional(),
    numeroSerie: z.string().optional(),
    marketplaceVisible: z.boolean().optional().default(false),
    marketplaceAlgo: z.enum(["sha256", "scrypt"]).optional().nullable(),
    marketplaceHashrateDisplay: z.string().max(200).optional().nullable(),
    marketplaceImageSrc: z.string().max(MARKETPLACE_IMAGE_SRC_MAX_LEN).optional().nullable(),
    marketplaceGalleryJson: z.string().max(MARKETPLACE_GALLERY_JSON_MAX_LEN).optional().nullable(),
    marketplaceDetailRowsJson: z.string().max(32000).optional().nullable(),
    marketplaceYieldJson: z.string().max(8000).optional().nullable(),
    marketplaceSortOrder: z.number().int().min(0).max(999999).optional().default(0),
    marketplaceHashrateSellEnabled: z.boolean().optional().default(false),
    marketplaceHashrateParts: z.array(HashratePartSchema).max(12).optional().nullable(),
    /**
     * Texto comercial en vitrina cuando no hay precio USD (ej. «SOLICITA PRECIO»).
     * Si `precioUSD` > 0, se ignora y no se persiste.
     */
    marketplacePriceLabel: z.string().max(120).optional().nullable(),
    /** ISO o datetime enviado por el cliente al registrar cambio de precio (opcional → ahora). */
    precioActualizadoEn: z.string().max(50).optional().nullable(),
    /** Historial completo al crear (p. ej. varios precios antes del primer guardado). */
    precioHistorialJson: z.string().max(32000).optional().nullable(),
    /**
     * NULL/omitido = automático (heurística por marca/modelo en vitrina).
     * Forzar minero o infraestructura (modal sin rendimiento/hosting para infra).
     */
    marketplaceListingKind: z.union([z.literal("miner"), z.literal("infrastructure")]).nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.marketplaceHashrateSellEnabled) {
      const parts = Array.isArray(d.marketplaceHashrateParts) ? d.marketplaceHashrateParts : [];
      if (parts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Definí al menos una parte de hashrate para habilitar esta modalidad.",
          path: ["marketplaceHashrateParts"],
        });
      }
    }
    if (!d.marketplaceVisible) return;
    const precio = Math.round(Number(d.precioUSD) || 0);
    const label = (d.marketplacePriceLabel ?? "").trim();
    if (precio > 0) return;
    if (label.length > 0) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Para publicar sin precio fijo: completá un texto comercial (ej. «SOLICITA PRECIO») o indicá precio USD mayor a 0.",
      path: ["marketplacePriceLabel"],
    });
  });

type EquipoRow = {
  id: string;
  numero_serie: string | null;
  fecha_ingreso: string;
  marca_equipo: string;
  modelo: string;
  procesador: string;
  precio_usd: number;
  observaciones: string | null;
  mp_visible?: number | boolean | null;
  mp_algo?: string | null;
  mp_hashrate_display?: string | null;
  mp_image_src?: string | null;
  mp_gallery_json?: string | null;
  mp_detail_rows_json?: string | null;
  mp_yield_json?: string | null;
  mp_sort_order?: number | null;
  mp_hashrate_sell_enabled?: number | boolean | null;
  mp_hashrate_parts_json?: string | null;
  mp_price_label?: string | null;
  mp_listing_kind?: string | null;
  precio_historial_json?: string | null;
};

function mpListingKindPersistValue(raw: string | null | undefined): "miner" | "infrastructure" | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "miner" || s === "infrastructure") return s;
  return null;
}

function mpVisibleToInt(visible: boolean): number {
  return visible ? 1 : 0;
}

function rowMpVisible(r: EquipoRow): boolean {
  return mpVisibleFromDbValue(r.mp_visible);
}

function rowToItem(r: EquipoRow) {
  let marketplaceHashrateParts: Array<{ sharePct: number; warrantyPct: number; setupUsd: number }> | null = null;
  if (r.mp_hashrate_parts_json?.trim()) {
    try {
      const raw = JSON.parse(r.mp_hashrate_parts_json);
      if (Array.isArray(raw)) {
        marketplaceHashrateParts = raw
          .map((x) => HashratePartSchema.safeParse(x))
          .filter((x) => x.success)
          .map((x) => ({
            ...x.data,
            // Regla vigente: la garantía prorratea con el mismo % de hashrate.
            warrantyPct: x.data.sharePct,
          }))
          .sort((a, b) => b.sharePct - a.sharePct);
      }
    } catch {
      marketplaceHashrateParts = null;
    }
  }
  return {
    id: r.id,
    numeroSerie: r.numero_serie ?? undefined,
    fechaIngreso: r.fecha_ingreso,
    marcaEquipo: r.marca_equipo,
    modelo: r.modelo,
    procesador: r.procesador,
    precioUSD: Number(r.precio_usd) || 0,
    observaciones: r.observaciones ?? undefined,
    marketplaceVisible: rowMpVisible(r),
    marketplaceAlgo: (r.mp_algo ?? null) as "sha256" | "scrypt" | null,
    marketplaceHashrateDisplay: r.mp_hashrate_display ?? null,
    marketplaceImageSrc: r.mp_image_src ?? null,
    marketplaceGalleryJson: r.mp_gallery_json ?? null,
    marketplaceDetailRowsJson: r.mp_detail_rows_json ?? null,
    marketplaceYieldJson: r.mp_yield_json ?? null,
    marketplaceSortOrder: Number(r.mp_sort_order) || 0,
    marketplaceHashrateSellEnabled: mpVisibleFromDbValue(r.mp_hashrate_sell_enabled),
    marketplaceHashrateParts: marketplaceHashrateParts?.length ? marketplaceHashrateParts : null,
    marketplacePriceLabel: r.mp_price_label?.trim() ? r.mp_price_label.trim() : null,
    marketplaceListingKind: mpListingKindPersistValue(r.mp_listing_kind),
    precioHistorial: parsePrecioHistorialJson(r.precio_historial_json ?? null),
  };
}

function isoParaRegistroPrecio(input: string | null | undefined): string {
  if (!input?.trim()) return new Date().toISOString();
  const d = new Date(input.trim());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function mpPayloadFromBody(d: z.infer<typeof EquipoBodySchema>) {
  const vis = d.marketplaceVisible === true;
  const sort = Math.max(0, Math.min(999999, Number(d.marketplaceSortOrder) || 0));
  const precio = Math.round(Number(d.precioUSD) || 0);
  const labelTrim = (d.marketplacePriceLabel ?? "").trim().slice(0, 120);
  /** Con precio > 0 la vitrina muestra USD; el label solo aplica si precio es 0. */
  const mp_price_label = vis && precio <= 0 ? (labelTrim || null) : null;
  const lk = d.marketplaceListingKind;
  const mp_listing_kind =
    vis && (lk === "miner" || lk === "infrastructure") ? lk : null;
  const shareEnabled = d.marketplaceHashrateSellEnabled === true;
  const shareParts = shareEnabled && Array.isArray(d.marketplaceHashrateParts) ? d.marketplaceHashrateParts : [];
  const normalizedShareParts = shareParts
    .map((x) => HashratePartSchema.safeParse(x))
    .filter((x) => x.success)
    .map((x) => ({
      ...x.data,
      // No confiamos en payload cliente: garantía siempre = % hashrate.
      warrantyPct: x.data.sharePct,
    }))
    .sort((a, b) => b.sharePct - a.sharePct);
  const uniqByPct = new Map<number, z.infer<typeof HashratePartSchema>>();
  for (const it of normalizedShareParts) uniqByPct.set(it.sharePct, it);
  const dedupShareParts = Array.from(uniqByPct.values());
  return {
    mp_visible: mpVisibleToInt(vis),
    mp_algo: vis ? resolveMarketplaceAlgoForPersist(d) : null,
    mp_hashrate_display: null,
    mp_image_src: vis ? (d.marketplaceImageSrc?.trim() || null) : null,
    mp_gallery_json: vis ? (d.marketplaceGalleryJson?.trim() || null) : null,
    mp_detail_rows_json: vis ? (d.marketplaceDetailRowsJson?.trim() || null) : null,
    mp_yield_json: null,
    mp_sort_order: vis ? sort : 0,
    mp_hashrate_sell_enabled: shareEnabled ? mpVisibleToInt(true) : mpVisibleToInt(false),
    mp_hashrate_parts_json:
      shareEnabled && dedupShareParts.length > 0 ? JSON.stringify(dedupShareParts) : null,
    mp_price_label,
    mp_listing_kind,
  };
}

/** Mantiene columnas de tienda sin cambios (Operador al editar equipo). */
function mpPayloadFromExistingRow(r: EquipoRow) {
  return {
    mp_visible: mpVisibleToInt(rowMpVisible(r)),
    mp_algo: (r.mp_algo ?? null) as "sha256" | "scrypt" | null,
    mp_hashrate_display: r.mp_hashrate_display ?? null,
    mp_image_src: r.mp_image_src ?? null,
    mp_gallery_json: r.mp_gallery_json ?? null,
    mp_detail_rows_json: r.mp_detail_rows_json ?? null,
    mp_yield_json: r.mp_yield_json ?? null,
    mp_sort_order: Number(r.mp_sort_order) || 0,
    mp_hashrate_sell_enabled: mpVisibleToInt(mpVisibleFromDbValue(r.mp_hashrate_sell_enabled)),
    mp_hashrate_parts_json: r.mp_hashrate_parts_json ?? null,
    mp_price_label: r.mp_price_label?.trim() ? r.mp_price_label.trim() : null,
    mp_listing_kind: mpListingKindPersistValue(r.mp_listing_kind),
  };
}

/** Siguiente número de serie M001, M002, ... sin repetir */
async function nextNumeroSerie(): Promise<string> {
  const d = getDb() as { isPostgres?: boolean };
  const patternSql = d.isPostgres ? "numero_serie ~ '^M[0-9]{3}$'" : "numero_serie GLOB 'M[0-9][0-9][0-9]'";
  const rows = (await db.prepare(`SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL AND ${patternSql}`).all()) as { numero_serie: string }[];
  const nums = rows.map((r) => parseInt(r.numero_serie.slice(1), 10)).filter((n) => n >= 1 && n <= 999);
  const next = nums.length === 0 ? 1 : Math.min(999, Math.max(...nums) + 1);
  return `M${String(next).padStart(3, "0")}`;
}

/** Listado completo de columnas para mapear fila → vitrina / gestión. */
export const EQUIPOS_ASIC_SELECT = `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones,
  mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_sort_order,
  mp_hashrate_sell_enabled, mp_hashrate_parts_json,
  mp_price_label, mp_listing_kind, precio_historial_json
  FROM equipos_asic`;

const EQUIPOS_SELECT = EQUIPOS_ASIC_SELECT;

/** GET /equipos — listar todos */
equiposRouter.get("/equipos", requireAuth, async (_req, res: Response) => {
  try {
    const rows = (await db.prepare(`${EQUIPOS_SELECT} ORDER BY marca_equipo ASC, modelo ASC, numero_serie ASC`).all()) as EquipoRow[];
    res.json({ items: rows.map(rowToItem) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** GET /equipos/marketplace-corp-best-selling — ids guardados para home corporativa (hasta 4). */
equiposRouter.get("/equipos/marketplace-corp-best-selling", requireAuth, async (_req, res: Response) => {
  try {
    const ids = await readCorpBestSellingEquipoIds();
    res.json({ ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /equipos/marketplace-corp-best-selling — guardar destacados home (solo admin A/B). */
equiposRouter.put("/equipos/marketplace-corp-best-selling", requireAuth, requireAdminsEquipo, async (req, res: Response) => {
  const parsed = CorpBestSellingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const incoming = parsed.data.ids.map((x) => String(x ?? "").trim()).filter(Boolean);
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const id of incoming) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniq.push(id);
      if (uniq.length >= 4) break;
    }
    if (uniq.length === 0) {
      await writeCorpBestSellingEquipoIds([]);
      return res.json({ ok: true, ids: [] });
    }
    const ph = uniq.map(() => "?").join(", ");
    const found = (await db.prepare(`SELECT id FROM equipos_asic WHERE id IN (${ph})`).all(...uniq)) as { id: string }[];
    const foundSet = new Set(found.map((r) => String(r.id)));
    const missing = uniq.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      return res.status(400).json({
        error: { message: `ID no encontrado en equipos ASIC: ${missing.join(", ")}` },
      });
    }
    await writeCorpBestSellingEquipoIds(uniq);
    res.json({ ok: true, ids: uniq });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** GET /equipos/marketplace-corp-interesting — ids «Otros Productos Interesantes» (hasta 4). */
equiposRouter.get("/equipos/marketplace-corp-interesting", requireAuth, async (_req, res: Response) => {
  try {
    const ids = await readCorpInterestingEquipoIds();
    res.json({ ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /equipos/marketplace-corp-interesting — guardar sección home (solo admin A/B). */
equiposRouter.put("/equipos/marketplace-corp-interesting", requireAuth, requireAdminsEquipo, async (req, res: Response) => {
  const parsed = CorpInterestingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  try {
    const incoming = parsed.data.ids.map((x) => String(x ?? "").trim()).filter(Boolean);
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const id of incoming) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniq.push(id);
      if (uniq.length >= 4) break;
    }
    if (uniq.length === 0) {
      await writeCorpInterestingEquipoIds([]);
      return res.json({ ok: true, ids: [] });
    }
    const ph = uniq.map(() => "?").join(", ");
    const found = (await db.prepare(`SELECT id FROM equipos_asic WHERE id IN (${ph})`).all(...uniq)) as { id: string }[];
    const foundSet = new Set(found.map((r) => String(r.id)));
    const missing = uniq.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      return res.status(400).json({
        error: { message: `ID no encontrado en equipos ASIC: ${missing.join(", ")}` },
      });
    }
    await writeCorpInterestingEquipoIds(uniq);
    res.json({ ok: true, ids: uniq });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/**
 * GET /equipos/:id/whattomine-yield — rendimiento estimado (WhatToMine, electricidad 0,078 USD/kWh).
 */
equiposRouter.get("/equipos/:id/whattomine-yield", requireAuth, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const row = (await db.prepare(`${EQUIPOS_SELECT} WHERE id = ?`).get(id)) as EquipoRow | undefined;
    if (!row) return res.status(404).json({ error: { message: "Equipo no encontrado" } });
    if (
      resolveVitrinaListingKind({
        mp_listing_kind: row.mp_listing_kind ?? null,
        marca_equipo: row.marca_equipo,
        modelo: row.modelo,
      }) !== "miner"
    ) {
      return res.json({
        ok: true,
        yield: null,
        hint: "Este listado no es un minero ASIC; no aplica rendimiento estimado.",
      });
    }
    const payload = {
      mp_algo: row.mp_algo ?? null,
      procesador: row.procesador ?? "",
      mp_detail_rows_json: row.mp_detail_rows_json ?? null,
    };
    const hintFail = explainInferAlgoFailure(payload);
    const y = await estimateYieldWhatToMineForEquipo(payload);
    if (!y) {
      return res.json({
        ok: true,
        yield: null,
        hint: hintFail || "No se pudo obtener datos de WhatToMine. Probá de nuevo en unos segundos.",
      });
    }
    res.json({ ok: true, yield: y });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** POST /equipos — crear */
equiposRouter.post("/equipos", requireAuth, requireCanEdit, async (req, res: Response) => {
  const parsed = EquipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const admin = isAdminABRole(req.user!.role);
  if (!admin && (parsed.data.precioUSD > 0 || parsed.data.marketplaceVisible)) {
    return res.status(403).json({
      error: {
        message:
          "Solo AdministradorA o AdministradorB pueden crear equipos con precio en USD o publicados en la tienda online.",
      },
    });
  }
  const { marcaEquipo, modelo, procesador, precioUSD, observaciones } = parsed.data;
  const fechaIngresoServidor = new Date().toISOString();
  const mp = mpPayloadFromBody(parsed.data);
  const precioWhen = isoParaRegistroPrecio(parsed.data.precioActualizadoEn);
  const id = `equipo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let numeroSerie = await nextNumeroSerie();
  const codeVitrina = codigoProductoVitrina(modelo.trim(), procesador.trim(), mp.mp_visible === 1);
  if (codeVitrina) numeroSerie = codeVitrina;
  try {
    const rawHist = parsed.data.precioHistorialJson?.trim();
    let historialInicial: string;
    if (rawHist) {
      const entries = parsePrecioHistorialJson(rawHist);
      historialInicial = entries.length > 0 ? JSON.stringify(entries) : initialPrecioHistorialJson(precioUSD, precioWhen);
    } else {
      historialInicial = initialPrecioHistorialJson(precioUSD, precioWhen);
    }
    await db
      .prepare(
        `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones,
          mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_sort_order, mp_hashrate_sell_enabled, mp_hashrate_parts_json,
          mp_price_label, mp_listing_kind, precio_historial_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        numeroSerie,
        fechaIngresoServidor,
        marcaEquipo.trim(),
        modelo.trim(),
        procesador.trim(),
        precioUSD,
        observaciones ?? null,
        mp.mp_visible,
        mp.mp_algo,
        mp.mp_hashrate_display,
        mp.mp_image_src,
        mp.mp_gallery_json,
        mp.mp_detail_rows_json,
        mp.mp_yield_json,
        mp.mp_sort_order,
        mp.mp_hashrate_sell_enabled,
        mp.mp_hashrate_parts_json,
        mp.mp_price_label ?? null,
        mp.mp_listing_kind ?? null,
        historialInicial
      );
    await logEquipoAsicAudit({
      user: req.user!,
      equipoId: id,
      codigoProducto: numeroSerie,
      action: "create",
      summary: `Alta: ${marcaEquipo.trim()} ${modelo.trim()} · código ${numeroSerie} · USD ${precioUSD}${parsed.data.marketplaceVisible ? " · tienda online" : ""}`,
      details: {
        precioUSD,
        marketplaceVisible: parsed.data.marketplaceVisible,
        marcaEquipo: marcaEquipo.trim(),
        modelo: modelo.trim(),
      },
    });
    res.status(201).json({ ok: true, id, numeroSerie, fechaIngreso: fechaIngresoServidor });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/**
 * POST /equipos/marketplace-image — subir imagen para vitrina (multipart field "file").
 * En dev/monorepo: guarda en public/images/marketplace-uploads y devuelve `/images/marketplace-uploads/...`.
 * En Vercel (FS de solo lectura): devuelve `data:image/...;base64,...` para persistir en mp_image_src / galería.
 */
equiposRouter.post(
  "/equipos/marketplace-image",
  requireAuth,
  requireAdminsEquipo,
  (req: Request, res: Response, next) => {
    uploadMarketplaceImageMw(req, res, (err: unknown) => {
      if (err) {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
        let msg = err instanceof Error ? err.message : "Error al subir la imagen";
        if (code === "LIMIT_FILE_SIZE") {
          msg = marketplaceImageUploadUsesMemory()
            ? "La imagen es demasiado grande para el modo alojado (máx. ~4 MB). Redimensioná o comprimí el archivo."
            : "La imagen supera el tamaño máximo permitido (8 MB).";
        }
        return res.status(400).json({ error: { message: msg } });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: "Archivo requerido (campo file)" } });
    }
    let buf: Buffer;
    if (marketplaceImageUploadUsesMemory()) {
      const b = file.buffer;
      if (!b?.length) {
        return res.status(400).json({ error: { message: "Archivo vacío" } });
      }
      buf = b;
    } else {
      const p = (file as Express.Multer.File & { path?: string }).path;
      if (!p) {
        return res.status(400).json({ error: { message: "Archivo no guardado" } });
      }
      try {
        buf = fs.readFileSync(p);
      } catch {
        return res.status(400).json({ error: { message: "No se pudo leer el archivo" } });
      }
    }
    const fmt = sniffImageFormat(buf);
    if (!fmt) {
      if (!marketplaceImageUploadUsesMemory()) {
        const p = (file as Express.Multer.File & { path?: string }).path;
        if (p) {
          try {
            fs.unlinkSync(p);
          } catch {
            /* ignore */
          }
        }
      }
      return res.status(400).json({ error: { message: "Solo imágenes (JPEG, PNG, WebP, GIF)." } });
    }
    const verifiedMime = mimeForSniffedFormat(fmt);
    if (marketplaceImageUploadUsesMemory()) {
      const url = `data:${verifiedMime};base64,${buf.toString("base64")}`;
      void logEquipoAsicAudit({
        user: req.user!,
        equipoId: null,
        codigoProducto: null,
        action: "marketplace_image",
        summary: "Imagen cargada para tienda online (inline, serverless)",
        details: { urlPrefix: url.slice(0, 48), bytes: buf.length },
      });
      return res.status(201).json({ url });
    }
    if (!file.filename) {
      return res.status(400).json({ error: { message: "Archivo requerido (campo file)" } });
    }
    const url = `/images/marketplace-uploads/${file.filename}`;
    void logEquipoAsicAudit({
      user: req.user!,
      equipoId: null,
      codigoProducto: null,
      action: "marketplace_image",
      summary: `Imagen cargada para tienda online: ${file.filename}`,
      details: { url },
    });
    res.status(201).json({ url });
  }
);

/** PUT /equipos/:id — actualizar */
equiposRouter.put("/equipos/:id", requireAuth, requireCanEdit, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = EquipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { marcaEquipo, modelo, procesador, precioUSD, observaciones } = parsed.data;
  const admin = isAdminABRole(req.user!.role);
  try {
    const existing = (await db.prepare(`${EQUIPOS_SELECT} WHERE id = ?`).get(id)) as EquipoRow | undefined;
    if (!existing) return res.status(404).json({ error: { message: "Equipo no encontrado" } });
    if (!admin && rowMpVisible(existing)) {
      if (
        marcaEquipo.trim() !== String(existing.marca_equipo ?? "").trim() ||
        modelo.trim() !== String(existing.modelo ?? "").trim() ||
        procesador.trim() !== String(existing.procesador ?? "").trim()
      ) {
        return res.status(403).json({
          error: {
            message:
              "Solo AdministradorA o AdministradorB pueden modificar la ficha técnica de un equipo publicado en la tienda.",
          },
        });
      }
    }
    let mp = mpPayloadFromBody(parsed.data);
    if (!admin) {
      if (Math.round(Number(existing.precio_usd) || 0) !== precioUSD) {
        return res.status(403).json({
          error: { message: "Solo AdministradorA o AdministradorB pueden modificar el precio del equipo." },
        });
      }
      mp = mpPayloadFromExistingRow(existing) as typeof mp;
    }
    const fechaIngresoInmutable = existing.fecha_ingreso;

    const oldPrecio = Math.round(Number(existing.precio_usd) || 0);
    let historialJson = existing.precio_historial_json ?? null;
    if (oldPrecio !== precioUSD) {
      const precioWhen = isoParaRegistroPrecio(parsed.data.precioActualizadoEn);
      let entries = parsePrecioHistorialJson(historialJson);
      if (entries.length === 0) {
        entries = [syntheticFirstEntryFromFechaIngreso(fechaIngresoInmutable, oldPrecio)];
      }
      entries = appendPrecioHistorial(entries, precioUSD, precioWhen);
      historialJson = JSON.stringify(entries);
    }

    let numeroSerie: string | null = existing.numero_serie;
    const codeVitrina = codigoProductoVitrina(modelo.trim(), procesador.trim(), mp.mp_visible === 1);
    if (codeVitrina) numeroSerie = codeVitrina;

    const result = await db
      .prepare(
        `UPDATE equipos_asic SET fecha_ingreso = ?, marca_equipo = ?, modelo = ?, procesador = ?, precio_usd = ?, observaciones = ?,
          numero_serie = ?, mp_visible = ?, mp_algo = ?, mp_hashrate_display = ?, mp_image_src = ?, mp_gallery_json = ?, mp_detail_rows_json = ?, mp_yield_json = ?, mp_sort_order = ?,
          mp_hashrate_sell_enabled = ?, mp_hashrate_parts_json = ?, mp_price_label = ?, mp_listing_kind = ?, precio_historial_json = ?
          WHERE id = ?`
      )
      .run(
        fechaIngresoInmutable,
        marcaEquipo.trim(),
        modelo.trim(),
        procesador.trim(),
        precioUSD,
        observaciones ?? null,
        numeroSerie,
        mp.mp_visible,
        mp.mp_algo,
        mp.mp_hashrate_display,
        mp.mp_image_src,
        mp.mp_gallery_json,
        mp.mp_detail_rows_json,
        mp.mp_yield_json,
        mp.mp_sort_order,
        mp.mp_hashrate_sell_enabled,
        mp.mp_hashrate_parts_json,
        mp.mp_price_label ?? null,
        mp.mp_listing_kind ?? null,
        historialJson,
        id
      );
    if (result.changes === 0) return res.status(404).json({ error: { message: "Equipo no encontrado" } });

    const changes: Record<string, unknown> = {};
    if (existing.marca_equipo !== marcaEquipo.trim()) changes.marca = { antes: existing.marca_equipo, despues: marcaEquipo.trim() };
    if (existing.modelo !== modelo.trim()) changes.modelo = { antes: existing.modelo, despues: modelo.trim() };
    if (existing.procesador !== procesador.trim()) changes.procesador = { antes: existing.procesador, despues: procesador.trim() };
    if (oldPrecio !== precioUSD) changes.precioUSD = { antes: oldPrecio, despues: precioUSD };
    if (mpVisibleToInt(rowMpVisible(existing)) !== mp.mp_visible) changes.tiendaVisible = { antes: rowMpVisible(existing), despues: mp.mp_visible === 1 };
    if (String(existing.observaciones ?? "") !== String(observaciones ?? "")) changes.observaciones = true;
    const snap = (r: EquipoRow) => ({
      mp_algo: r.mp_algo ?? null,
      mp_image: r.mp_image_src ?? null,
      mp_gallery_len: (r.mp_gallery_json ?? "").length,
      mp_detail_len: (r.mp_detail_rows_json ?? "").length,
      mp_sort: Number(r.mp_sort_order) || 0,
      mp_hashrate_sell_enabled: mpVisibleFromDbValue(r.mp_hashrate_sell_enabled),
      mp_hashrate_parts_json: (r.mp_hashrate_parts_json ?? "").trim() || null,
      mp_price_label: (r.mp_price_label ?? "").trim() || null,
      mp_listing_kind: mpListingKindPersistValue(r.mp_listing_kind),
    });
    const bef = snap(existing);
    const aft = {
      mp_algo: mp.mp_algo ?? null,
      mp_image: mp.mp_image_src ?? null,
      mp_gallery_len: (mp.mp_gallery_json ?? "").length,
      mp_detail_len: (mp.mp_detail_rows_json ?? "").length,
      mp_sort: mp.mp_sort_order,
      mp_hashrate_sell_enabled: mp.mp_hashrate_sell_enabled === 1,
      mp_hashrate_parts_json: (mp.mp_hashrate_parts_json ?? "").trim() || null,
      mp_price_label: (mp.mp_price_label ?? "").trim() || null,
      mp_listing_kind: mpListingKindPersistValue(mp.mp_listing_kind),
    };
    if (JSON.stringify(bef) !== JSON.stringify(aft)) changes.marketplace = { antes: bef, despues: aft };

    await logEquipoAsicAudit({
      user: req.user!,
      equipoId: id,
      codigoProducto: numeroSerie,
      action: "update",
      summary: `Modificación: ${marcaEquipo.trim()} ${modelo.trim()} · ${numeroSerie ?? id}${oldPrecio !== precioUSD ? ` · precio ${oldPrecio}→${precioUSD} USD` : ""}`,
      details: Object.keys(changes).length ? changes : { sinCambiosRelevantes: true },
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /equipos/:id — eliminar uno */
equiposRouter.delete("/equipos/:id", requireAuth, requireCanEdit, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const prev = (await db.prepare(`${EQUIPOS_SELECT} WHERE id = ?`).get(id)) as EquipoRow | undefined;
    const result = await db.prepare("DELETE FROM equipos_asic WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Equipo no encontrado" } });
    if (prev) {
      await logEquipoAsicAudit({
        user: req.user!,
        equipoId: id,
        codigoProducto: prev.numero_serie ?? null,
        action: "delete",
        summary: `Baja: ${prev.marca_equipo} ${prev.modelo} · ${prev.numero_serie ?? id} · USD ${Number(prev.precio_usd) || 0}`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

const BulkRowSchema = z.object({
  fechaIngreso: z.string().min(1, "Fecha ingreso requerida"),
  marcaEquipo: z.string().min(1, "Marca requerida"),
  modelo: z.string().min(1, "Modelo requerido"),
  procesador: z.string().min(1, "Procesador requerido"),
  precioUSD: z.number().int().min(0).max(999999).default(0),
  observaciones: z.string().optional(),
  numeroSerie: z.string().optional(),
});

/** POST /equipos/bulk — importar varios equipos */
equiposRouter.post("/equipos/bulk", requireAuth, requireAdminsEquipo, async (req, res: Response) => {
  const parsed = z.array(BulkRowSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const rows = parsed.data;
  const used = new Set(
    ((await db.prepare("SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL").all()) as { numero_serie: string }[]).map((r) => r.numero_serie)
  );
  let nextNum = 1;
  for (const row of rows) {
    const { fechaIngreso, marcaEquipo, modelo, procesador, precioUSD = 0, observaciones, numeroSerie: fromRow } = row;
    const id = `equipo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let ns: string;
    if (fromRow && fromRow.trim() && !used.has(fromRow.trim())) {
      ns = fromRow.trim();
      used.add(ns);
    } else {
      while (used.has(`M${String(nextNum).padStart(3, "0")}`)) nextNum++;
      ns = `M${String(nextNum).padStart(3, "0")}`;
      nextNum++;
      used.add(ns);
    }
    const historialInicial = initialPrecioHistorialJson(precioUSD);
    await db
      .prepare(
        `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones,
          mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_sort_order, mp_hashrate_sell_enabled, mp_hashrate_parts_json,
          mp_price_label, mp_listing_kind, precio_historial_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, ?)`
      )
      .run(id, ns, fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), precioUSD, observaciones ?? null, historialInicial);
  }
  await logEquipoAsicAudit({
    user: req.user!,
    equipoId: null,
    codigoProducto: null,
    action: "bulk_import",
    summary: `Importación masiva (Excel): ${rows.length} fila(s)`,
    details: { filas: rows.length },
  });
  res.status(201).json({ ok: true, inserted: rows.length });
});

/** DELETE /equipos — eliminar todos */
equiposRouter.delete("/equipos", requireAuth, requireRole("admin_a", "admin_b"), async (req, res: Response) => {
  try {
    await db.prepare("DELETE FROM equipos_asic").run();
    await logEquipoAsicAudit({
      user: req.user!,
      equipoId: null,
      codigoProducto: null,
      action: "delete_all",
      summary: "Eliminación de todos los equipos ASIC (inventario completo)",
    });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
