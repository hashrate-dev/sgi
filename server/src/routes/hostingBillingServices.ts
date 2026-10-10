import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const hostingBillingServicesRouter = Router();

const RESERVED = new Set(["A", "B", "C", "D", "E"]);
const RESERVED_NAMES = new Set(
  [
    "servicio alojamiento y mantenimiento l7",
    "servicio alojamiento y mantenimiento l9",
    "servicio alojamiento y mantenimiento s21",
    "servicio alojamiento y mantenimiento z15",
    "4% gastos operativos transferencia",
  ]
);

const CreateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  price: z.coerce.number().min(0).max(999999),
});

let schemaEnsured = false;

async function ensureHostingBillingServicesSchema(): Promise<void> {
  if (schemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS hosting_billing_services (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ''
      )`
    )
    .run();
  schemaEnsured = true;
}

type Row = { code?: string; name?: string; price?: number | string; builtin?: number | boolean };

function mapRow(raw: Record<string, unknown>): { code: string; name: string; price: number; builtin: boolean } | null {
  const r = rowKeysToLowercase(raw) as Row;
  const code = String(r.code ?? "").trim().toUpperCase();
  const name = String(r.name ?? "").trim();
  if (!code || !name) return null;
  const price = Number(r.price);
  const builtin = r.builtin === true || r.builtin === 1 || r.builtin === "1";
  return { code, name, price: Number.isFinite(price) ? price : 0, builtin: Boolean(builtin) };
}

async function nextCustomCode(): Promise<string> {
  const rows = (await db.prepare("SELECT code FROM hosting_billing_services").all()) as Record<string, unknown>[];
  const used = new Set(
    rows
      .map((raw) => String(rowKeysToLowercase(raw).code ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  for (const r of RESERVED) used.add(r);
  for (let n = 1; n <= 999; n++) {
    const code = `H${String(n).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  throw new Error("No hay códigos libres para un ítem nuevo.");
}

hostingBillingServicesRouter.get(
  "/hosting/billing-services",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    try {
      await ensureHostingBillingServicesSchema();
      const rows = (await db
        .prepare("SELECT code, name, price, builtin FROM hosting_billing_services ORDER BY code ASC")
        .all()) as Record<string, unknown>[];
      const items = rows.map(mapRow).filter((x): x is NonNullable<typeof x> => x != null && !x.builtin);
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg || "No se pudo cargar el catálogo de ítems." } });
    }
  }
);

hostingBillingServicesRouter.post(
  "/hosting/billing-services",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    try {
      await ensureHostingBillingServicesSchema();
      const parsed = CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { message: "Indicá un nombre de servicio válido (mín. 3 caracteres)." } });
      }
      const name = parsed.data.name.trim();
      const price = parsed.data.price;
      if (RESERVED_NAMES.has(name.toLowerCase())) {
        return res.status(409).json({ error: { message: "Ese servicio ya existe en el catálogo fijo." } });
      }
      const dup = (await db.prepare("SELECT code FROM hosting_billing_services WHERE LOWER(TRIM(name)) = LOWER(?)").get(name)) as
        | Record<string, unknown>
        | undefined;
      if (dup) {
        return res.status(409).json({ error: { message: "Ya existe un ítem con ese nombre." } });
      }
      const code = await nextCustomCode();
      await db
        .prepare(
          `INSERT INTO hosting_billing_services (code, name, price, builtin, created_at)
           VALUES (?, ?, ?, 0, ?)`
        )
        .run(code, name, price, new Date().toISOString());
      res.status(201).json({ ok: true, item: { code, name, price, builtin: false } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg || "No se pudo guardar el ítem." } });
    }
  }
);
