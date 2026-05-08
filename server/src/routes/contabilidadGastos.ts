import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
/**
 * Importar el parser desde `lib/` evita `index.js` de pdf-parse, que en ESM/tsx ejecuta un bloque
 * de depuración (`readFileSync('./test/data/05-versions-space.pdf')`) y hace caer el API al arrancar.
 */
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { extractDraftFromFacturaText, type ProveedorLite } from "../lib/contabilidadFacturaPdfScan.js";
import { ensureProveedoresHrsSchema } from "./proveedoresHrs.js";

export const contabilidadGastosRouter = Router();

const contabilidadRoutesDir = path.dirname(fileURLToPath(import.meta.url));
/** PDFs adjuntos a gastos (no versionar en git si se usa carpeta local). */
const CONTABILIDAD_GASTOS_PDF_DIR = path.resolve(contabilidadRoutesDir, "..", "..", "data", "contabilidad-gastos-facturas");

function ensureContabilidadGastosPdfDir(): void {
  fs.mkdirSync(CONTABILIDAD_GASTOS_PDF_DIR, { recursive: true });
}

function contabilidadGastoPdfAbsPath(id: number): string {
  return path.join(CONTABILIDAD_GASTOS_PDF_DIR, `${id}.pdf`);
}

function unlinkContabilidadGastoPdf(id: number): void {
  try {
    const p = contabilidadGastoPdfAbsPath(id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

const uploadFacturaPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === "application/pdf" ||
      (typeof file.originalname === "string" && file.originalname.toLowerCase().endsWith(".pdf"));
    if (ok) cb(null, true);
    else cb(new Error("SOLO_PDF"));
  },
});

const MonedaGastoSchema = z.enum(["UYU", "USD", "PYG"]);

const MedioPagoGastoSchema = z.enum([
  "USD BANCO SANTANDER UY",
  "USD BANCO INTERFISA",
  "USDT BINANCE",
  "USDC BINANCE",
  "USD CONTADO",
  "PESOS URUGUAYOS CONTADO",
  "GS CONTADO",
]);

const YmSchema = z.string().regex(/^\d{4}-\d{2}$/);

const CreateContabilidadGastoSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    proveedorId: z.number().int().positive(),
    descripcion: z.string().min(1).max(4000).trim(),
    numeroFactura: z.string().max(120).optional(),
    observaciones: z.string().max(4000).optional(),
    mesServicio: YmSchema,
    presupuestoMes: YmSchema,
    medioPago: MedioPagoGastoSchema,
    moneda: MonedaGastoSchema,
    /** Monto en moneda de la operación (formulario). El servidor guarda además el equivalente en USD. */
    monto: z.number().positive().finite(),
    /**
     * UYU / PYG: obligatorio (pesos o guaraníes por USD). USD: ignorado / null.
     */
    tipoCambio: z.union([z.number().positive().finite(), z.null()]).optional(),
  })
  .refine(
    (d) => d.moneda === "USD" || (d.tipoCambio != null && Number.isFinite(d.tipoCambio) && d.tipoCambio > 0),
    { message: "Para pesos o guaraníes el tipo de cambio es obligatorio.", path: ["tipoCambio"] }
  );

let gastosSchemaEnsured = false;
let contabilidadFacturaColsEnsured = false;
let contabilidadTipoCambioEnsured = false;
let contabilidadMontoOriginalEnsured = false;
let contabilidadFacturaPdfAdjuntoEnsured = false;

async function ensureContabilidadFacturaPdfAdjuntoCol(): Promise<void> {
  if (contabilidadFacturaPdfAdjuntoEnsured) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS factura_pdf_adjunto SMALLINT NOT NULL DEFAULT 0`)
      .run();
  } else {
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN factura_pdf_adjunto INTEGER NOT NULL DEFAULT 0`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
  }
  contabilidadFacturaPdfAdjuntoEnsured = true;
}

async function ensureContabilidadTipoCambioCol(): Promise<void> {
  if (contabilidadTipoCambioEnsured) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(18, 6)`).run();
  } else {
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN tipo_cambio REAL`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
  }
  contabilidadTipoCambioEnsured = true;
}

/**
 * `monto` = importe en USD; `monto_original` = importe en moneda de la factura/operación.
 * Migración idempotente: filas con UYU/PYG y TC pasan monto a USD = original / TC.
 */
async function ensureContabilidadMontoOriginalCol(): Promise<void> {
  if (contabilidadMontoOriginalEnsured) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS monto_original NUMERIC(18, 4)`).run();
  } else {
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN monto_original REAL`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
  }
  await db
    .prepare(`UPDATE contabilidad_gastos SET monto_original = monto WHERE monto_original IS NULL`)
    .run();
  await db
    .prepare(
      `UPDATE contabilidad_gastos SET monto = monto_original / tipo_cambio
       WHERE moneda IN ('UYU', 'PYG') AND tipo_cambio IS NOT NULL AND tipo_cambio > 0 AND monto = monto_original`
    )
    .run();
  contabilidadMontoOriginalEnsured = true;
}

function computeStoredMontos(d: z.infer<typeof CreateContabilidadGastoSchema>): {
  montoUsd: number;
  montoOriginal: number;
  tipoCambioVal: number | null;
} {
  if (d.moneda === "USD") {
    return { montoUsd: d.monto, montoOriginal: d.monto, tipoCambioVal: null };
  }
  const tc = d.tipoCambio!;
  return { montoUsd: d.monto / tc, montoOriginal: d.monto, tipoCambioVal: tc };
}

async function ensureContabilidadFacturaObsCols(): Promise<void> {
  if (contabilidadFacturaColsEnsured) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS numero_factura TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS mes_servicio TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS presupuesto_mes TEXT NOT NULL DEFAULT ''`)
      .run();
    await db
      .prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN IF NOT EXISTS medio_pago TEXT NOT NULL DEFAULT ''`)
      .run();
  } else {
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN numero_factura TEXT NOT NULL DEFAULT ''`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN observaciones TEXT NOT NULL DEFAULT ''`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN mes_servicio TEXT NOT NULL DEFAULT ''`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN presupuesto_mes TEXT NOT NULL DEFAULT ''`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
    try {
      await db.prepare(`ALTER TABLE contabilidad_gastos ADD COLUMN medio_pago TEXT NOT NULL DEFAULT ''`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column") && !msg.toLowerCase().includes("duplicate column name")) throw e;
    }
  }
  contabilidadFacturaColsEnsured = true;
}

async function ensureContabilidadGastosSchema(): Promise<void> {
  if (gastosSchemaEnsured) return;
  await ensureProveedoresHrsSchema();
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (!isPg) {
    /* SQLite: tabla creada en sqlite-async junto al resto del esquema local. */
    gastosSchemaEnsured = true;
    return;
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS contabilidad_gastos (
        id SERIAL PRIMARY KEY,
        fecha DATE NOT NULL,
        proveedor_id INTEGER NOT NULL REFERENCES proveedores_hrs(id) ON DELETE RESTRICT,
        supplier_number TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        numero_factura TEXT NOT NULL DEFAULT '',
        descripcion TEXT NOT NULL,
        observaciones TEXT NOT NULL DEFAULT '',
        mes_servicio TEXT NOT NULL DEFAULT '',
        presupuesto_mes TEXT NOT NULL DEFAULT '',
        medio_pago TEXT NOT NULL DEFAULT '',
        moneda TEXT NOT NULL CHECK (moneda IN ('UYU', 'USD', 'PYG')),
        monto NUMERIC(18, 4) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_contabilidad_gastos_fecha ON contabilidad_gastos(fecha DESC)`)
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_contabilidad_gastos_prov ON contabilidad_gastos(proveedor_id)`)
    .run();
  gastosSchemaEnsured = true;
}

type GastoDbRow = {
  id: number;
  fecha: string;
  proveedor_id: number;
  supplier_number: string;
  supplier_name: string;
  numero_factura?: string;
  descripcion: string;
  observaciones?: string;
  mes_servicio?: string;
  presupuesto_mes?: string;
  medio_pago?: string;
  moneda: string;
  monto: number | string;
  monto_original?: number | string | null;
  tipo_cambio?: number | string | null;
  factura_pdf_adjunto?: number | boolean | string | null;
  created_at: string | Date;
};

function normalizeFecha(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return String(v ?? "")
    .trim()
    .slice(0, 10);
}

function mapGasto(raw: GastoDbRow) {
  const m = typeof raw.monto === "number" ? raw.monto : Number.parseFloat(String(raw.monto ?? 0));
  const rawMo = raw.monto_original;
  let montoOriginal = m;
  if (rawMo != null && rawMo !== "") {
    const o = typeof rawMo === "number" ? rawMo : Number.parseFloat(String(rawMo));
    if (Number.isFinite(o) && o > 0) montoOriginal = o;
  }
  const rawTc = raw.tipo_cambio;
  let tipoCambio: number | null = null;
  if (rawTc != null && rawTc !== "") {
    const t = typeof rawTc === "number" ? rawTc : Number.parseFloat(String(rawTc));
    if (Number.isFinite(t) && t > 0) tipoCambio = t;
  }
  const rawAdj = raw.factura_pdf_adjunto;
  const hasFacturaPdf =
    rawAdj === true ||
    rawAdj === 1 ||
    rawAdj === "1" ||
    (typeof rawAdj === "string" && rawAdj.toLowerCase() === "true");
  return {
    id: Number(raw.id),
    fecha: normalizeFecha(raw.fecha),
    proveedorId: Number(raw.proveedor_id),
    supplierNumber: String(raw.supplier_number ?? ""),
    supplierName: String(raw.supplier_name ?? ""),
    numeroFactura: String(raw.numero_factura ?? ""),
    descripcion: String(raw.descripcion ?? ""),
    observaciones: String(raw.observaciones ?? ""),
    mesServicio: String(raw.mes_servicio ?? "").slice(0, 7),
    presupuestoMes: String(raw.presupuesto_mes ?? "").slice(0, 7),
    medioPago: String(raw.medio_pago ?? "").slice(0, 80),
    moneda: String(raw.moneda ?? "") as "UYU" | "USD" | "PYG",
    /** Equivalente en USD (uso contable / listados en USD). */
    monto: Number.isFinite(m) ? m : 0,
    montoOriginal,
    tipoCambio,
    createdAt:
      typeof raw.created_at === "string" ? raw.created_at : raw.created_at instanceof Date ? raw.created_at.toISOString() : "",
    hasFacturaPdf,
  };
}

contabilidadGastosRouter.get(
  "/contabilidad/gastos",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_contabilidad"),
  async (_req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaObsCols();
    await ensureContabilidadTipoCambioCol();
    await ensureContabilidadMontoOriginalCol();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const rows = (await db
      .prepare(
        `SELECT id, fecha, proveedor_id, supplier_number, supplier_name, numero_factura, descripcion, observaciones, mes_servicio, presupuesto_mes, medio_pago, moneda, monto, monto_original, tipo_cambio, factura_pdf_adjunto, created_at
         FROM contabilidad_gastos ORDER BY fecha DESC, id DESC`
      )
      .all()) as GastoDbRow[];
    res.json({ items: rows.map(mapGasto) });
  }
);

contabilidadGastosRouter.post(
  "/contabilidad/gastos",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_contabilidad"),
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaObsCols();
    await ensureContabilidadTipoCambioCol();
    await ensureContabilidadMontoOriginalCol();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const parsed = CreateContabilidadGastoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para registrar el gasto." } });
    }
    const d = parsed.data;
    const stored = computeStoredMontos(d);
    try {
      const prov = (await db
        .prepare(`SELECT id, supplier_number, supplier_name FROM proveedores_hrs WHERE id = ?`)
        .get(d.proveedorId)) as { id?: unknown; supplier_number?: string; supplier_name?: string } | undefined;
      if (!prov || prov.id == null) {
        return res.status(400).json({ error: { message: "El proveedor seleccionado no existe en Proveedores HRS." } });
      }
      const supplierNumber = String(prov.supplier_number ?? "").trim();
      const supplierName = String(prov.supplier_name ?? "").trim();
      if (!supplierNumber) {
        return res.status(400).json({ error: { message: "Proveedor sin número válido." } });
      }

      const numeroFactura = String(d.numeroFactura ?? "")
        .trim()
        .slice(0, 120);
      const observaciones = String(d.observaciones ?? "")
        .trim()
        .slice(0, 4000);

      const mesServicio = String(d.mesServicio ?? "").slice(0, 7);
      const presupuestoMes = String(d.presupuestoMes ?? "").slice(0, 7);
      const medioPago = String(d.medioPago ?? "").slice(0, 80);

      const insertRun = await db
        .prepare(
          `INSERT INTO contabilidad_gastos (fecha, proveedor_id, supplier_number, supplier_name, numero_factura, descripcion, observaciones, mes_servicio, presupuesto_mes, medio_pago, moneda, monto, monto_original, tipo_cambio, factura_pdf_adjunto)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          d.fecha,
          d.proveedorId,
          supplierNumber,
          supplierName,
          numeroFactura,
          d.descripcion,
          observaciones,
          mesServicio,
          presupuestoMes,
          medioPago,
          d.moneda,
          stored.montoUsd,
          stored.montoOriginal,
          stored.tipoCambioVal
        );

      const newId = insertRun.lastInsertRowid;
      if (newId == null || !Number.isFinite(Number(newId))) {
        return res.status(500).json({ error: { message: "No se pudo obtener el id del gasto registrado." } });
      }

      const inserted = (await db
        .prepare(
          `SELECT id, fecha, proveedor_id, supplier_number, supplier_name, numero_factura, descripcion, observaciones, mes_servicio, presupuesto_mes, medio_pago, moneda, monto, monto_original, tipo_cambio, factura_pdf_adjunto, created_at
           FROM contabilidad_gastos WHERE id = ?`
        )
        .get(Number(newId))) as GastoDbRow | undefined;

      if (!inserted) {
        return res.status(500).json({ error: { message: "No se pudo leer el gasto registrado." } });
      }
      res.status(201).json({ ok: true, item: mapGasto(inserted) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos] POST", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo guardar el gasto." },
      });
    }
  }
);

contabilidadGastosRouter.put(
  "/contabilidad/gastos/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_contabilidad"),
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaObsCols();
    await ensureContabilidadTipoCambioCol();
    await ensureContabilidadMontoOriginalCol();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de gasto inválido." } });
    }
    const parsed = CreateContabilidadGastoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para actualizar el gasto." } });
    }
    const d = parsed.data;
    const stored = computeStoredMontos(d);
    try {
      const exists = (await db.prepare(`SELECT id FROM contabilidad_gastos WHERE id = ?`).get(id)) as { id?: number } | undefined;
      if (!exists?.id) {
        return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      }

      const prov = (await db
        .prepare(`SELECT id, supplier_number, supplier_name FROM proveedores_hrs WHERE id = ?`)
        .get(d.proveedorId)) as { id?: unknown; supplier_number?: string; supplier_name?: string } | undefined;
      if (!prov || prov.id == null) {
        return res.status(400).json({ error: { message: "El proveedor seleccionado no existe en Proveedores HRS." } });
      }
      const supplierNumber = String(prov.supplier_number ?? "").trim();
      const supplierName = String(prov.supplier_name ?? "").trim();
      if (!supplierNumber) {
        return res.status(400).json({ error: { message: "Proveedor sin número válido." } });
      }

      const numeroFactura = String(d.numeroFactura ?? "")
        .trim()
        .slice(0, 120);
      const observaciones = String(d.observaciones ?? "")
        .trim()
        .slice(0, 4000);
      const mesServicio = String(d.mesServicio ?? "").slice(0, 7);
      const presupuestoMes = String(d.presupuestoMes ?? "").slice(0, 7);
      const medioPago = String(d.medioPago ?? "").slice(0, 80);

      const result = await db
        .prepare(
          `UPDATE contabilidad_gastos SET
            fecha = ?, proveedor_id = ?, supplier_number = ?, supplier_name = ?, numero_factura = ?,
            descripcion = ?, observaciones = ?, mes_servicio = ?, presupuesto_mes = ?, medio_pago = ?, moneda = ?, monto = ?, monto_original = ?, tipo_cambio = ?
           WHERE id = ?`
        )
        .run(
          d.fecha,
          d.proveedorId,
          supplierNumber,
          supplierName,
          numeroFactura,
          d.descripcion,
          observaciones,
          mesServicio,
          presupuestoMes,
          medioPago,
          d.moneda,
          stored.montoUsd,
          stored.montoOriginal,
          stored.tipoCambioVal,
          id
        );

      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      }

      const row = (await db
        .prepare(
          `SELECT id, fecha, proveedor_id, supplier_number, supplier_name, numero_factura, descripcion, observaciones, mes_servicio, presupuesto_mes, medio_pago, moneda, monto, monto_original, tipo_cambio, factura_pdf_adjunto, created_at
           FROM contabilidad_gastos WHERE id = ?`
        )
        .get(id)) as GastoDbRow | undefined;
      if (!row) return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      res.json({ ok: true, item: mapGasto(row) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos] PUT", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo actualizar el gasto." },
      });
    }
  }
);

contabilidadGastosRouter.post(
  "/contabilidad/gastos/scan-factura-pdf",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_contabilidad"),
  (req, res, next) => {
    uploadFacturaPdf.single("pdf")(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: { message: "El PDF supera el límite de 8 MB." } });
          }
          return res.status(400).json({ error: { message: "No se pudo recibir el archivo." } });
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "SOLO_PDF") {
          return res.status(400).json({ error: { message: "Solo se aceptan archivos PDF." } });
        }
        return next(err);
      }
      const f = req.file;
      if (!f?.buffer?.length) {
        return res.status(400).json({ error: { message: "Enviá un PDF (campo de formulario «pdf»)." } });
      }
      next();
    });
  },
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureProveedoresHrsSchema();
    const buf = req.file?.buffer;
    if (!buf?.length) {
      return res.status(400).json({ error: { message: "Archivo vacío." } });
    }
    try {
      const parsed = await pdfParse(buf);
      const text = String(parsed.text ?? "");
      const provRows = (await db
        .prepare(`SELECT id, supplier_name, ruc FROM proveedores_hrs`)
        .all()) as Array<{ id?: unknown; supplier_name?: unknown; ruc?: unknown }>;
      const proveedores: ProveedorLite[] = (Array.isArray(provRows) ? provRows : []).map((r) => ({
        id: Number(r.id),
        supplierName: String(r.supplier_name ?? ""),
        ruc: String(r.ruc ?? ""),
      }));
      const { draft, detected, warnings, textLength, documentKind } = extractDraftFromFacturaText(text, proveedores);
      res.json({ ok: true as const, draft, detected, warnings, textLength, documentKind });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos/scan-factura-pdf]", e);
      if (env.NODE_ENV === "development") {
        return res.status(422).json({ error: { message: `No se pudo leer el PDF: ${msg}` } });
      }
      return res.status(422).json({ error: { message: "No se pudo extraer texto del PDF. Probá otro archivo o cargá los datos a mano." } });
    }
  }
);

contabilidadGastosRouter.get(
  "/contabilidad/gastos/:id/factura-pdf",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_contabilidad"),
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de gasto inválido." } });
    }
    try {
      const row = (await db
        .prepare(`SELECT id, factura_pdf_adjunto FROM contabilidad_gastos WHERE id = ?`)
        .get(id)) as { id?: unknown; factura_pdf_adjunto?: unknown } | undefined;
      if (!row?.id) {
        return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      }
      const adj = row.factura_pdf_adjunto;
      const has =
        adj === true || adj === 1 || adj === "1" || (typeof adj === "string" && adj.toLowerCase() === "true");
      if (!has) {
        return res.status(404).json({ error: { message: "Este gasto no tiene PDF adjunto." } });
      }
      const fp = contabilidadGastoPdfAbsPath(id);
      if (!fs.existsSync(fp)) {
        return res.status(404).json({ error: { message: "Archivo PDF no encontrado en el servidor." } });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="gasto-${id}.pdf"`);
      fs.createReadStream(fp).pipe(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos/:id/factura-pdf] GET", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo leer el PDF." },
      });
    }
  }
);

contabilidadGastosRouter.post(
  "/contabilidad/gastos/:id/factura-pdf",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_contabilidad"),
  (req, res, next) => {
    uploadFacturaPdf.single("pdf")(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: { message: "El PDF supera el límite de 8 MB." } });
          }
          return res.status(400).json({ error: { message: "No se pudo recibir el archivo." } });
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "SOLO_PDF") {
          return res.status(400).json({ error: { message: "Solo se aceptan archivos PDF." } });
        }
        return next(err);
      }
      const f = req.file;
      if (!f?.buffer?.length) {
        return res.status(400).json({ error: { message: "Enviá un PDF (campo «pdf»)." } });
      }
      next();
    });
  },
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de gasto inválido." } });
    }
    const buf = req.file?.buffer;
    if (!buf?.length) {
      return res.status(400).json({ error: { message: "Archivo vacío." } });
    }
    try {
      const exists = (await db.prepare(`SELECT id FROM contabilidad_gastos WHERE id = ?`).get(id)) as { id?: unknown } | undefined;
      if (!exists?.id) {
        return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      }
      ensureContabilidadGastosPdfDir();
      await fs.promises.writeFile(contabilidadGastoPdfAbsPath(id), buf);
      await db.prepare(`UPDATE contabilidad_gastos SET factura_pdf_adjunto = 1 WHERE id = ?`).run(id);
      res.json({ ok: true as const });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos/:id/factura-pdf] POST", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo guardar el PDF." },
      });
    }
  }
);

contabilidadGastosRouter.delete(
  "/contabilidad/gastos/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_contabilidad"),
  async (req, res) => {
    await ensureContabilidadGastosSchema();
    await ensureContabilidadFacturaObsCols();
    await ensureContabilidadTipoCambioCol();
    await ensureContabilidadMontoOriginalCol();
    await ensureContabilidadFacturaPdfAdjuntoCol();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de gasto inválido." } });
    }
    try {
      const result = await db.prepare(`DELETE FROM contabilidad_gastos WHERE id = ?`).run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Gasto no encontrado." } });
      }
      unlinkContabilidadGastoPdf(id);
      res.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[contabilidad/gastos] DELETE", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo eliminar el gasto." },
      });
    }
  }
);
