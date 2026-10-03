import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const hostingMarginRouter = Router();

export const DEFAULT_HOSTING_MARGIN_SUPPLIERS = ["P002", "P003"] as const;

const SUPPLIER_CODE_RE = /^P\d{3,}$/i;
const MAX_SUPPLIERS = 40;

let schemaEnsured = false;

function normalizeSupplierCode(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!SUPPLIER_CODE_RE.test(s)) return null;
  return s;
}

function parseSupplierNumbersJson(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [...DEFAULT_HOSTING_MARGIN_SUPPLIERS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_HOSTING_MARGIN_SUPPLIERS];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const code = normalizeSupplierCode(item);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(code);
      if (out.length >= MAX_SUPPLIERS) break;
    }
    return out;
  } catch {
    return [...DEFAULT_HOSTING_MARGIN_SUPPLIERS];
  }
}

async function ensureHostingMarginSchema(): Promise<void> {
  if (schemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS hosting_margin_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        supplier_numbers_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT ''
      )`
    )
    .run();
  const row = (await db.prepare("SELECT id FROM hosting_margin_settings WHERE id = 1").get()) as { id?: number } | undefined;
  if (!row) {
    await db
      .prepare(
        `INSERT INTO hosting_margin_settings (id, supplier_numbers_json, updated_at, updated_by)
         VALUES (1, ?, ?, '')`
      )
      .run(JSON.stringify([...DEFAULT_HOSTING_MARGIN_SUPPLIERS]), new Date().toISOString());
  }
  schemaEnsured = true;
}

type ProveedorRow = { supplier_number?: string; suppliernumber?: string; supplier_name?: string; suppliername?: string };

async function listProveedoresHrs(): Promise<Array<{ number: string; name: string }>> {
  try {
    const rows = (await db
      .prepare("SELECT supplier_number, supplier_name FROM proveedores_hrs ORDER BY supplier_number ASC")
      .all()) as ProveedorRow[];
    const out: Array<{ number: string; name: string }> = [];
    const seen = new Set<string>();
    for (const raw of rows) {
      const r = rowKeysToLowercase(raw as Record<string, unknown>) as ProveedorRow;
      const number = normalizeSupplierCode(r.supplier_number ?? r.suppliernumber);
      if (!number || seen.has(number)) continue;
      seen.add(number);
      const name = String(r.supplier_name ?? r.suppliername ?? "").trim();
      out.push({ number, name });
    }
    return out;
  } catch {
    return [];
  }
}

type GastoRow = {
  id?: number;
  fecha?: string;
  proveedor_id?: number;
  proveedorid?: number;
  supplier_number?: string;
  suppliernumber?: string;
  supplier_name?: string;
  suppliername?: string;
  descripcion?: string;
  mes_servicio?: string;
  messervicio?: string;
  presupuesto_mes?: string;
  presupuestomes?: string;
  moneda?: string;
  monto?: number | string;
};

async function listGastosForSuppliers(codes: string[]): Promise<
  Array<{
    id: number;
    fecha: string;
    proveedorId: number;
    supplierNumber: string;
    supplierName: string;
    descripcion: string;
    mesServicio: string;
    presupuestoMes: string;
    moneda: string;
    monto: number;
  }>
> {
  if (codes.length === 0) return [];
  try {
    const placeholders = codes.map(() => "?").join(", ");
    const rows = (await db
      .prepare(
        `SELECT id, fecha, proveedor_id, supplier_number, supplier_name, descripcion,
                mes_servicio, presupuesto_mes, moneda, monto
         FROM contabilidad_gastos
         WHERE UPPER(TRIM(supplier_number)) IN (${placeholders})`
      )
      .all(...codes)) as GastoRow[];
    return rows.map((raw) => {
      const r = rowKeysToLowercase(raw as Record<string, unknown>) as GastoRow;
      const monto = Number(r.monto);
      return {
        id: Number(r.id) || 0,
        fecha: String(r.fecha ?? ""),
        proveedorId: Number(r.proveedor_id ?? r.proveedorid) || 0,
        supplierNumber: normalizeSupplierCode(r.supplier_number ?? r.suppliernumber) ?? "",
        supplierName: String(r.supplier_name ?? r.suppliername ?? "").trim(),
        descripcion: String(r.descripcion ?? "").trim(),
        mesServicio: String(r.mes_servicio ?? r.messervicio ?? "").trim(),
        presupuestoMes: String(r.presupuesto_mes ?? r.presupuestomes ?? "").trim(),
        moneda: String(r.moneda ?? "USD").trim() || "USD",
        monto: Number.isFinite(monto) ? monto : 0,
      };
    });
  } catch {
    return [];
  }
}

async function readSettings(): Promise<{ supplierNumbers: string[]; updatedAt: string; updatedBy: string }> {
  await ensureHostingMarginSchema();
  const row = (await db
    .prepare("SELECT supplier_numbers_json, updated_at, updated_by FROM hosting_margin_settings WHERE id = 1")
    .get()) as
    | {
        supplier_numbers_json?: string;
        suppliernumbersjson?: string;
        updated_at?: string;
        updatedat?: string;
        updated_by?: string;
        updatedby?: string;
      }
    | undefined;
  const r = row ? (rowKeysToLowercase(row as Record<string, unknown>) as typeof row) : undefined;
  return {
    supplierNumbers: parseSupplierNumbersJson(r?.supplier_numbers_json ?? r?.suppliernumbersjson),
    updatedAt: String(r?.updated_at ?? r?.updatedat ?? ""),
    updatedBy: String(r?.updated_by ?? r?.updatedby ?? ""),
  };
}

hostingMarginRouter.get(
  "/hosting/margin-settings",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    try {
      const settings = await readSettings();
      const proveedores = await listProveedoresHrs();
      const gastos = await listGastosForSuppliers(settings.supplierNumbers);
      res.json({
        supplierNumbers: settings.supplierNumbers,
        updatedAt: settings.updatedAt,
        updatedBy: settings.updatedBy,
        proveedores,
        gastos,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg || "No se pudo cargar la configuración de margen de hosting." } });
    }
  }
);

const PutSchema = z.object({
  supplierNumbers: z.array(z.string().max(20)).max(MAX_SUPPLIERS),
});

hostingMarginRouter.put(
  "/hosting/margin-settings",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    try {
      const parsed = PutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: "Lista de proveedores inválida." } });
        return;
      }
      const supplierNumbers: string[] = [];
      const seen = new Set<string>();
      for (const raw of parsed.data.supplierNumbers) {
        const code = normalizeSupplierCode(raw);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        supplierNumbers.push(code);
      }
      await ensureHostingMarginSchema();
      const updatedBy = String(req.user?.email || req.user?.username || "").trim();
      await db
        .prepare(
          `UPDATE hosting_margin_settings
           SET supplier_numbers_json = ?, updated_at = ?, updated_by = ?
           WHERE id = 1`
        )
        .run(JSON.stringify(supplierNumbers), new Date().toISOString(), updatedBy);
      const settings = await readSettings();
      const proveedores = await listProveedoresHrs();
      const gastos = await listGastosForSuppliers(settings.supplierNumbers);
      res.json({
        ok: true,
        supplierNumbers: settings.supplierNumbers,
        updatedAt: settings.updatedAt,
        updatedBy: settings.updatedBy,
        proveedores,
        gastos,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg || "No se pudo guardar la configuración." } });
    }
  }
);
