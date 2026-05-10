import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const reparacionTiposRouter = Router();

const requireCanEdit = [requireRole("admin_a", "admin_b", "operador"), requireModuleGrant("setups")];

const ReparacionTipoBodySchema = z.object({
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

async function ensureReparacionTiposTable(): Promise<void> {
  if (tableEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS reparacion_tipos (
        id TEXT PRIMARY KEY,
        codigo TEXT UNIQUE,
        nombre TEXT NOT NULL,
        precio_usd INTEGER NOT NULL DEFAULT 0
      )`
    )
    .run();
  tableEnsured = true;
}

async function nextCodigoReparacion(): Promise<string> {
  const d = getDb() as { isPostgres?: boolean };
  const patternSql = d.isPostgres ? "codigo ~ '^R[0-9]{2}$'" : "codigo GLOB 'R[0-9][0-9]'";
  const rows = (await db.prepare(`SELECT codigo FROM reparacion_tipos WHERE codigo IS NOT NULL AND ${patternSql}`).all()) as {
    codigo: string;
  }[];
  const nums = rows.map((r) => parseInt(r.codigo.slice(1), 10)).filter((n) => n >= 1 && n <= 99);
  const next = nums.length === 0 ? 1 : Math.min(99, Math.max(...nums) + 1);
  return `R${String(next).padStart(2, "0")}`;
}

async function backfillCodigos(): Promise<void> {
  const rows = (await db
    .prepare("SELECT id FROM reparacion_tipos WHERE codigo IS NULL OR codigo = '' ORDER BY id")
    .all()) as { id: string }[];
  if (rows.length === 0) return;
  const used = new Set(
    (
      (await db.prepare("SELECT codigo FROM reparacion_tipos WHERE codigo IS NOT NULL AND codigo != ''").all()) as {
        codigo: string;
      }[]
    ).map((r) => r.codigo)
  );
  let n = 1;
  const updateStmt = db.prepare("UPDATE reparacion_tipos SET codigo = ? WHERE id = ?");
  for (const row of rows) {
    while (used.has(`R${String(n).padStart(2, "0")}`)) n++;
    if (n > 99) break;
    const codigo = `R${String(n).padStart(2, "0")}`;
    used.add(codigo);
    await updateStmt.run(codigo, row.id);
    n++;
  }
}

reparacionTiposRouter.get(
  "/reparacion-tipos",
  requireAuth,
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("setups"),
  async (_req, res: Response) => {
    try {
      await ensureReparacionTiposTable();
      await backfillCodigos();
      const rows = (await db
        .prepare('SELECT id, codigo, nombre, precio_usd AS "precioUSD" FROM reparacion_tipos ORDER BY codigo ASC, nombre ASC')
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

reparacionTiposRouter.post("/reparacion-tipos", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureReparacionTiposTable();
  const parsed = ReparacionTipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const codigo = await nextCodigoReparacion();
  try {
    await db.prepare("INSERT INTO reparacion_tipos (id, codigo, nombre, precio_usd) VALUES (?, ?, ?, ?)").run(id, codigo, nombre.trim(), precioUSD);
    res.status(201).json({ ok: true, id, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

reparacionTiposRouter.put("/reparacion-tipos/:id", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureReparacionTiposTable();
  const id = (typeof req.params.id === "string" ? req.params.id : "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = ReparacionTipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  try {
    const result = await db.prepare("UPDATE reparacion_tipos SET nombre = ?, precio_usd = ? WHERE id = ?").run(nombre.trim(), precioUSD, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Tipo de reparación no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

reparacionTiposRouter.delete("/reparacion-tipos/:id", requireAuth, ...requireCanEdit, async (req, res: Response) => {
  await ensureReparacionTiposTable();
  const id = (typeof req.params.id === "string" ? req.params.id : "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const result = await db.prepare("DELETE FROM reparacion_tipos WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Tipo de reparación no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
