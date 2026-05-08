import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const proveedoresHrsRouter = Router();

const CreateProveedorSchema = z.object({
  supplierName: z.string().min(1).max(300).trim(),
  country: z.string().min(1).max(120).trim(),
  ruc: z.string().min(1).max(120).trim(),
  rubro: z.string().min(1).max(200).trim(),
  contactFirstName: z.string().min(1).max(120).trim(),
  contactLastName: z.string().min(1).max(120).trim(),
});

let schemaEnsured = false;
let rubroColumnEnsured = false;

async function ensureProveedoresRubroColumn(): Promise<void> {
  if (rubroColumnEnsured) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  try {
    if (isPg) {
      await db
        .prepare(`ALTER TABLE proveedores_hrs ADD COLUMN IF NOT EXISTS rubro TEXT NOT NULL DEFAULT ''`)
        .run();
    } else {
      await db.prepare(`ALTER TABLE proveedores_hrs ADD COLUMN rubro TEXT NOT NULL DEFAULT ''`).run();
    }
  } catch (e: unknown) {
    if (!isPg) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column") || msg.toLowerCase().includes("duplicate column name")) {
        rubroColumnEnsured = true;
        return;
      }
    }
    throw e;
  }
  rubroColumnEnsured = true;
}

function formatSupplierCode(n: number): string {
  const k = Math.max(1, Math.trunc(n));
  return `P${String(k).padStart(3, "0")}`;
}

async function syncProveedoresHrsSeqFromDb(): Promise<void> {
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  const row = isPg
    ? ((await db
        .prepare(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(supplier_number FROM 2) AS BIGINT)), 0) AS m FROM proveedores_hrs WHERE supplier_number ~ '^P[0-9]+$'`
        )
        .get()) as { m?: unknown } | undefined)
    : ((await db
        .prepare(
          `SELECT COALESCE(MAX(CAST(SUBSTR(supplier_number, 2) AS INTEGER)), 0) AS m FROM proveedores_hrs WHERE supplier_number GLOB 'P[0-9]*' AND LENGTH(TRIM(supplier_number)) >= 4`
        )
        .get()) as { m?: unknown } | undefined);
  const m = Number(row?.m ?? 0);
  if (!Number.isFinite(m) || m < 1) return;
  await db
    .prepare("UPDATE proveedores_hrs_seq SET next_num = CASE WHEN next_num < ? THEN ? ELSE next_num END WHERE id = 1")
    .run(m, m);
}

/** Expuesto para otras rutas (p. ej. contabilidad) que FK a `proveedores_hrs`. */
export async function ensureProveedoresHrsSchema(): Promise<void> {
  if (!schemaEnsured) {
    const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
    if (!isPg) {
      /* SQLite: tablas creadas en sqlite-async al abrir data.db; solo alinear secuencia. */
      await syncProveedoresHrsSeqFromDb();
    } else {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS proveedores_hrs_seq (id INTEGER PRIMARY KEY CHECK (id = 1), next_num BIGINT NOT NULL DEFAULT 0)`
        )
        .run();
      await db
        .prepare(`INSERT INTO proveedores_hrs_seq (id, next_num) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`)
        .run();
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS proveedores_hrs (
          id SERIAL PRIMARY KEY,
          supplier_number TEXT NOT NULL UNIQUE,
          supplier_name TEXT NOT NULL,
          country TEXT NOT NULL DEFAULT '',
          ruc TEXT NOT NULL DEFAULT '',
          rubro TEXT NOT NULL DEFAULT '',
          contact_first_name TEXT NOT NULL,
          contact_last_name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
        )
        .run();
      await db
        .prepare(`CREATE INDEX IF NOT EXISTS idx_proveedores_hrs_created ON proveedores_hrs(created_at DESC)`)
        .run();
      await syncProveedoresHrsSeqFromDb();
    }
    schemaEnsured = true;
  }
  await ensureProveedoresRubroColumn();
}

type ProveedorDbRow = {
  id: number;
  supplier_number: string;
  supplier_name: string;
  country: string;
  ruc: string;
  rubro: string;
  contact_first_name: string;
  contact_last_name: string;
  created_at: string | Date;
};

function mapProveedor(raw: ProveedorDbRow & { rubro?: string }) {
  return {
    id: Number(raw.id),
    supplierNumber: String(raw.supplier_number ?? ""),
    supplierName: String(raw.supplier_name ?? ""),
    country: String(raw.country ?? ""),
    ruc: String(raw.ruc ?? ""),
    rubro: String(raw.rubro ?? ""),
    contactFirstName: String(raw.contact_first_name ?? ""),
    contactLastName: String(raw.contact_last_name ?? ""),
    createdAt:
      typeof raw.created_at === "string" ? raw.created_at : raw.created_at instanceof Date ? raw.created_at.toISOString() : "",
  };
}

proveedoresHrsRouter.get(
  "/proveedores-hrs",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_proveedores"),
  async (_req, res) => {
    await ensureProveedoresHrsSchema();
    const rows = (await db
      .prepare(
        `SELECT id, supplier_number, supplier_name, country, ruc, rubro, contact_first_name, contact_last_name, created_at
         FROM proveedores_hrs ORDER BY supplier_number ASC, id ASC`
      )
      .all()) as ProveedorDbRow[];
    res.json({ items: rows.map(mapProveedor) });
  }
);

proveedoresHrsRouter.post(
  "/proveedores-hrs",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_proveedores"),
  async (req, res) => {
    await ensureProveedoresHrsSchema();
    const parsed = CreateProveedorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para registrar el proveedor." } });
    }
    const d = parsed.data;
    const countryVal = (d.country ?? "").trim();
    const rucVal = (d.ruc ?? "").trim();
    const rubroVal = (d.rubro ?? "").trim();

    try {
      const created = await db.transaction(async (tx) => {
        await tx.prepare("UPDATE proveedores_hrs_seq SET next_num = next_num + 1 WHERE id = 1").run();
        const seq = (await tx.prepare("SELECT next_num FROM proveedores_hrs_seq WHERE id = 1").get()) as { next_num?: unknown } | undefined;
        const n = Number(seq?.next_num ?? 0);
        if (!Number.isFinite(n) || n < 1) throw new Error("Secuencia de proveedores no disponible.");

        const supplierNumber = formatSupplierCode(n);

        await tx
          .prepare(
            `INSERT INTO proveedores_hrs (supplier_number, supplier_name, country, ruc, rubro, contact_first_name, contact_last_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(supplierNumber, d.supplierName, countryVal, rucVal, rubroVal, d.contactFirstName, d.contactLastName);

        const row = (await tx
          .prepare(
            `SELECT id, supplier_number, supplier_name, country, ruc, rubro, contact_first_name, contact_last_name, created_at
             FROM proveedores_hrs WHERE supplier_number = ?`
          )
          .get(supplierNumber)) as ProveedorDbRow | undefined;
        return row ? mapProveedor(row) : null;
      });

      if (!created) return res.status(500).json({ error: { message: "No se pudo leer el proveedor creado." } });
      res.status(201).json({ ok: true, item: created });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code && String(err.code).includes("23505")) {
        return res.status(409).json({ error: { message: "Conflicto al asignar número de proveedor. Reintentá." } });
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("SQLITE_CONSTRAINT") || msg.includes("UNIQUE constraint")) {
        return res.status(409).json({ error: { message: "Ya existe ese número de proveedor. Reintentá." } });
      }
      console.error("[proveedores-hrs] POST", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo guardar el proveedor." },
      });
    }
  }
);

proveedoresHrsRouter.put(
  "/proveedores-hrs/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_proveedores"),
  async (req, res) => {
    await ensureProveedoresHrsSchema();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de proveedor inválido." } });
    }
    const parsed = CreateProveedorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para actualizar el proveedor." } });
    }
    const d = parsed.data;
    try {
      const result = await db
        .prepare(
          `UPDATE proveedores_hrs SET supplier_name = ?, country = ?, ruc = ?, rubro = ?, contact_first_name = ?, contact_last_name = ?
           WHERE id = ?`
        )
        .run(d.supplierName, d.country.trim(), d.ruc.trim(), d.rubro.trim(), d.contactFirstName, d.contactLastName, id);
      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Proveedor no encontrado." } });
      }
      const row = (await db
        .prepare(
          `SELECT id, supplier_number, supplier_name, country, ruc, rubro, contact_first_name, contact_last_name, created_at
           FROM proveedores_hrs WHERE id = ?`
        )
        .get(id)) as ProveedorDbRow | undefined;
      if (!row) return res.status(404).json({ error: { message: "Proveedor no encontrado." } });
      res.json({ ok: true, item: mapProveedor(row) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[proveedores-hrs] PUT", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo actualizar el proveedor." },
      });
    }
  }
);

proveedoresHrsRouter.delete(
  "/proveedores-hrs/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("finanzas_proveedores"),
  async (req, res) => {
    await ensureProveedoresHrsSchema();
    const id = Number(typeof req.params.id === "string" ? req.params.id : "");
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: { message: "ID de proveedor inválido." } });
    }
    try {
      const result = await db.prepare(`DELETE FROM proveedores_hrs WHERE id = ?`).run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Proveedor no encontrado." } });
      }
      res.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[proveedores-hrs] DELETE", e);
      res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? msg : "No se pudo eliminar el proveedor." },
      });
    }
  }
);
