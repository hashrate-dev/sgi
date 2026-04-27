import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const asicCostosRouter = Router();
let asicCostosSchemaEnsured = false;

async function ensureAsicCostosSchema(): Promise<void> {
  if (asicCostosSchemaEnsured) return;

  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_costos_equipos (
          id BIGSERIAL PRIMARY KEY,
          created_at TEXT NOT NULL,
          marca TEXT NOT NULL,
          modelo TEXT NOT NULL,
          procesador TEXT NOT NULL,
          precio_origen DOUBLE PRECISION NOT NULL DEFAULT 0,
          monto_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          coeficiente DOUBLE PRECISION NOT NULL DEFAULT 0,
          proveedor_py DOUBLE PRECISION NOT NULL DEFAULT 0,
          margen_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
          total_nacionalizado DOUBLE PRECISION NOT NULL DEFAULT 0,
          precio_venta DOUBLE PRECISION NOT NULL DEFAULT 0,
          pct_margen DOUBLE PRECISION NOT NULL DEFAULT 0
        )`
      )
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_asic_costos_equipos_created ON asic_costos_equipos(created_at DESC, id DESC)")
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asic_costos_equipos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          marca TEXT NOT NULL,
          modelo TEXT NOT NULL,
          procesador TEXT NOT NULL,
          precio_origen REAL NOT NULL DEFAULT 0,
          monto_usd REAL NOT NULL DEFAULT 0,
          coeficiente REAL NOT NULL DEFAULT 0,
          proveedor_py REAL NOT NULL DEFAULT 0,
          margen_usd REAL NOT NULL DEFAULT 0,
          total_nacionalizado REAL NOT NULL DEFAULT 0,
          precio_venta REAL NOT NULL DEFAULT 0,
          pct_margen REAL NOT NULL DEFAULT 0
        )`
      )
      .run();
    await db
      .prepare("CREATE INDEX IF NOT EXISTS idx_asic_costos_equipos_created ON asic_costos_equipos(created_at DESC, id DESC)")
      .run();
  }

  asicCostosSchemaEnsured = true;
}

const AsicCostoPayloadSchema = z.object({
  marca: z.string().trim().max(120).optional(),
  modelo: z.string().trim().max(120).optional(),
  procesador: z.string().trim().max(120).optional(),
  precioOrigen: z.coerce.number().min(0),
  montoUsd: z.coerce.number().min(0),
  coeficiente: z.coerce.number().min(0),
  proveedorPy: z.coerce.number().min(0),
  margenUsd: z.coerce.number().min(0),
  totalNacionalizado: z.coerce.number().min(0),
  precioVenta: z.coerce.number().min(0),
  pctMargen: z.coerce.number().min(0),
});

type AsicCostoRow = {
  id: number;
  created_at: string;
  marca: string;
  modelo: string;
  procesador: string;
  precio_origen: number;
  monto_usd: number;
  coeficiente: number;
  proveedor_py: number;
  margen_usd: number;
  total_nacionalizado: number;
  precio_venta: number;
  pct_margen: number;
};

function mapAsicCostoRow(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    createdAt: String(r.created_at ?? ""),
    marca: String(r.marca ?? ""),
    modelo: String(r.modelo ?? ""),
    procesador: String(r.procesador ?? ""),
    precioOrigen: Number(r.precio_origen ?? 0),
    montoUsd: Number(r.monto_usd ?? 0),
    coeficiente: Number(r.coeficiente ?? 0),
    proveedorPy: Number(r.proveedor_py ?? 0),
    margenUsd: Number(r.margen_usd ?? 0),
    totalNacionalizado: Number(r.total_nacionalizado ?? 0),
    precioVenta: Number(r.precio_venta ?? 0),
    pctMargen: Number(r.pct_margen ?? 0),
  };
}

asicCostosRouter.get(
  "/asic/costos-equipos",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  async (_req, res) => {
    await ensureAsicCostosSchema();
    const rows = (await db
      .prepare(
        `SELECT id, created_at, marca, modelo, procesador, precio_origen, monto_usd, coeficiente, proveedor_py,
                margen_usd, total_nacionalizado, precio_venta, pct_margen
         FROM asic_costos_equipos
         ORDER BY created_at DESC, id DESC`
      )
      .all()) as AsicCostoRow[];
    res.json({ items: rows.map((x) => mapAsicCostoRow(x as unknown as Record<string, unknown>)) });
  }
);

asicCostosRouter.post(
  "/asic/costos-equipos",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensureAsicCostosSchema();
    const parsed = AsicCostoPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para registrar costo ASIC." } });
    }
    const d = parsed.data;
    const createdAt = new Date().toISOString();

    const result = await db
      .prepare(
        `INSERT INTO asic_costos_equipos (
          created_at, marca, modelo, procesador, precio_origen, monto_usd, coeficiente, proveedor_py,
          margen_usd, total_nacionalizado, precio_venta, pct_margen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createdAt,
        d.marca?.trim() || "",
        d.modelo?.trim() || "",
        d.procesador?.trim() || "",
        d.precioOrigen,
        d.montoUsd,
        d.coeficiente,
        d.proveedorPy,
        d.margenUsd,
        d.totalNacionalizado,
        d.precioVenta,
        d.pctMargen
      );

    const insertedId = Number(result.lastInsertRowid ?? 0);
    const inserted = (await db
      .prepare(
        `SELECT id, created_at, marca, modelo, procesador, precio_origen, monto_usd, coeficiente, proveedor_py,
                margen_usd, total_nacionalizado, precio_venta, pct_margen
         FROM asic_costos_equipos
         WHERE id = ?`
      )
      .get(insertedId)) as AsicCostoRow | undefined;

    res.status(201).json({
      ok: true,
      item: inserted ? mapAsicCostoRow(inserted as unknown as Record<string, unknown>) : null,
    });
  }
);

