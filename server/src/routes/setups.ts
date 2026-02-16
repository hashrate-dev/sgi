import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const setupsRouter = Router();

const requireCanEdit =
  requireRole("admin_a", "admin_b", "operador");

const SetupBodySchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  precioUSD: z.number().int().min(0).max(99999),
});

type SetupRow = { id: string; codigo: string | null; nombre: string; precioUSD: number };

/** Siguiente código S01, S02, ... S99 (2 cifras), sin repetir */
function nextCodigoSetup(): string {
  const rows = db.prepare("SELECT codigo FROM setups WHERE codigo IS NOT NULL AND codigo GLOB 'S[0-9][0-9]'").all() as { codigo: string }[];
  const nums = rows.map((r) => parseInt(r.codigo.slice(1), 10)).filter((n) => n >= 1 && n <= 99);
  const next = nums.length === 0 ? 1 : Math.min(99, Math.max(...nums) + 1);
  return `S${String(next).padStart(2, "0")}`;
}

/** Backfill codigo para filas que no lo tienen */
function backfillCodigos(): void {
  const rows = db.prepare("SELECT id FROM setups WHERE codigo IS NULL OR codigo = '' ORDER BY id").all() as { id: string }[];
  if (rows.length === 0) return;
  const used = new Set(
    (db.prepare("SELECT codigo FROM setups WHERE codigo IS NOT NULL AND codigo != ''").all() as { codigo: string }[]).map((r) => r.codigo)
  );
  let n = 1;
  const updateStmt = db.prepare("UPDATE setups SET codigo = ? WHERE id = ?");
  for (const row of rows) {
    while (used.has(`S${String(n).padStart(2, "0")}`)) n++;
    if (n > 99) break;
    const codigo = `S${String(n).padStart(2, "0")}`;
    used.add(codigo);
    updateStmt.run(codigo, row.id);
    n++;
  }
}

/** GET /setups — listar todos */
setupsRouter.get("/setups", requireAuth, (_req, res: Response) => {
  try {
    backfillCodigos();
    const rows = db.prepare("SELECT id, codigo, nombre, precio_usd AS precioUSD FROM setups ORDER BY codigo ASC, nombre ASC").all() as SetupRow[];
    const items = rows.map((r) => ({
      id: r.id,
      codigo: r.codigo ?? "",
      nombre: r.nombre,
      precioUSD: r.precioUSD,
    }));
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** POST /setups — crear */
setupsRouter.post("/setups", requireAuth, requireCanEdit, (req, res: Response) => {
  const parsed = SetupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  const id = `setup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const codigo = nextCodigoSetup();
  try {
    db.prepare("INSERT INTO setups (id, codigo, nombre, precio_usd) VALUES (?, ?, ?, ?)").run(id, codigo, nombre.trim(), precioUSD);
    res.status(201).json({ ok: true, id, codigo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /setups/:id — actualizar */
setupsRouter.put("/setups/:id", requireAuth, requireCanEdit, (req, res: Response) => {
  const id = (req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = SetupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { nombre, precioUSD } = parsed.data;
  try {
    const result = db.prepare("UPDATE setups SET nombre = ?, precio_usd = ? WHERE id = ?").run(nombre.trim(), precioUSD, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Setup no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /setups/:id — eliminar uno */
setupsRouter.delete("/setups/:id", requireAuth, requireCanEdit, (req, res: Response) => {
  const id = (req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  try {
    const result = db.prepare("DELETE FROM setups WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Setup no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /setups — eliminar todos */
setupsRouter.delete("/setups", requireAuth, requireRole("admin_a", "admin_b"), (_req, res: Response) => {
  try {
    db.prepare("DELETE FROM setups").run();
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
