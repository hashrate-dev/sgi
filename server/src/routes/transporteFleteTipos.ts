import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const transporteFleteTiposRouter = Router();

const requireCanEdit = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("setups")];

const TransporteFleteTipoBodySchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  precioUSD: z.coerce.number().int().min(0).max(99999),
});

type Row = {
  id: string;
  codigo: string | null;
  nombre: string;
  precioUSD?: number;
  preciousd?: number;
  precio_usd?: number;
};

let tableEnsured = false;

async function ensureTransporteFleteTiposTable(): Promise<void> {
  if (tableEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS transporte_flete_tipos (
        id TEXT PRIMARY KEY,
        codigo TEXT UNIQUE,
        nombre TEXT NOT NULL,
        precio_usd INTEGER NOT NULL DEFAULT 0
      )`
    )
    .run();
  tableEnsured = true;
}

async function nextCodigoFlete(): Promise<string> {
  const d = getDb() as { isPostgres?: boolean };
  const patternSql = d.isPostgres ? "codigo ~ '^F[0-9]{2}$'" : "codigo GLOB 'F[0-9][0-9]'";
  const rows = (await db.prepare(`SELECT codigo FROM transporte_flete_tipos WHERE codigo IS NOT NULL AND ${patternSql}`).all()) as {
    codigo: string;
  }[];
  const nums = rows.map((r) => parseInt(r.codigo.slice(1), 10)).filter((n) => n >= 1 && n <= 99);
  const next = nums.length === 0 ? 1 : Math.min(99, Math.max(...nums) + 1);
  return `F${String(next).padStart(2, "0")}`;
}

async function backfillCodigos(): Promise<void> {
  const rows = (await db
    .prepare("SELECT id FROM transporte_flete_tipos WHERE codigo IS NULL OR codigo = '' ORDER BY id")
    .all()) as { id: string }[];
  if (rows.length === 0) return;
  const used = new Set(
    (
      (await db.prepare("SELECT codigo FROM transporte_flete_tipos WHERE codigo IS NOT NULL AND codigo != ''").all()) as {
        codigo: string;
      }[]
    ).map((r) => r.codigo)
  );
  let n = 1;
  const updateStmt = db.prepare("UPDATE transporte_flete_tipos SET codigo = ? WHERE id = ?");
  for (const row of rows) {
    while (used.has(`F${String(n).padStart(2, "0")}`)) n++;
    if (n > 99) break;
    const codigo = `F${String(n).padStart(2, "0")}`;
    used.add(codigo);
    await updateStmt.run(codigo, row.id);
    n++;
  }
}

transporteFleteTiposRouter.get(
  "/transporte-flete-tipos",
  requireAuth,
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("setups"),
  async (_req, res: Response) => {
    try {
      await ensureTransporteFleteTiposTable();
      await backfillCodigos();
      const rows = (await db
        .prepare('SELECT id, codigo, nombre, precio_usd AS "precioUSD" FROM transporte_flete_tipos ORDER BY codigo ASC, nombre ASC')
        .all()) as Row[];
      const items = rows.map((r) => {
        const raw = r.precioUSD ?? r.preciousd ?? r.precio_usd;
        const num = typeof raw === "number" ? raw : Number(raw);
        const precioUSD = Number.isFinite(num) ? Math.round(num) : 0;
        return {
          id: r.id,
          codigo: r.codigo ?? "",
          nombre: r.nombre,
          precioUSD,
        };
      });
      res.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { message: msg } });
    }
  }
);

transporteFleteTiposRouter.post("/transporte-flete-tipos", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureTransporteFleteTiposTable();
  const parsed = TransporteFleteTipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  const id = `tflete_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const codigo = await nextCodigoFlete();
  try {
    await db.prepare("INSERT INTO transporte_flete_tipos (id, codigo, nombre, precio_usd) VALUES (?, ?, ?, ?)").run(id, codigo, nombre.trim(), precioUSD);
    res.status(201).json({ ok: true, id, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

transporteFleteTiposRouter.put("/transporte-flete-tipos/:id", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureTransporteFleteTiposTable();
  const id = (typeof req.params.id === "string" ? req.params.id : "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = TransporteFleteTipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  try {
    const result = await db.prepare("UPDATE transporte_flete_tipos SET nombre = ?, precio_usd = ? WHERE id = ?").run(nombre.trim(), precioUSD, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Ítem de transporte/flete no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

transporteFleteTiposRouter.delete("/transporte-flete-tipos/:id", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureTransporteFleteTiposTable();
  const id = (typeof req.params.id === "string" ? req.params.id : "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const result = await db.prepare("DELETE FROM transporte_flete_tipos WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Ítem de transporte/flete no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
