import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const equiposRouter = Router();

const requireCanEdit = requireRole("admin_a", "admin_b", "operador");

const EquipoBodySchema = z.object({
  fechaIngreso: z.string().min(1, "Fecha ingreso requerida"),
  marcaEquipo: z.string().min(1, "Marca requerida"),
  modelo: z.string().min(1, "Modelo requerido"),
  procesador: z.string().min(1, "Procesador requerido"),
  precioUSD: z.number().int().min(0).max(999999).default(0),
  observaciones: z.string().optional(),
  numeroSerie: z.string().optional(),
});

/** Siguiente número de serie M001, M002, ... sin repetir */
async function nextNumeroSerie(): Promise<string> {
  const d = getDb() as { isPostgres?: boolean };
  const patternSql = d.isPostgres ? "numero_serie ~ '^M[0-9]{3}$'" : "numero_serie GLOB 'M[0-9][0-9][0-9]'";
  const rows = (await db.prepare(`SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL AND ${patternSql}`).all()) as { numero_serie: string }[];
  const nums = rows.map((r) => parseInt(r.numero_serie.slice(1), 10)).filter((n) => n >= 1 && n <= 999);
  const next = nums.length === 0 ? 1 : Math.min(999, Math.max(...nums) + 1);
  return `M${String(next).padStart(3, "0")}`;
}

/** GET /equipos — listar todos */
equiposRouter.get("/equipos", requireAuth, async (_req, res: Response) => {
  try {
    const rows = (await db
      .prepare(
        `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones FROM equipos_asic ORDER BY numero_serie ASC, marca_equipo ASC`
      )
      .all()) as { id: string; numero_serie: string | null; fecha_ingreso: string; marca_equipo: string; modelo: string; procesador: string; precio_usd: number; observaciones: string | null }[];
    const items = rows.map((r) => ({
      id: r.id,
      numeroSerie: r.numero_serie ?? undefined,
      fechaIngreso: r.fecha_ingreso,
      marcaEquipo: r.marca_equipo,
      modelo: r.modelo,
      procesador: r.procesador,
      precioUSD: r.precio_usd,
      observaciones: r.observaciones ?? undefined,
    }));
    res.json({ items });
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
  const { fechaIngreso, marcaEquipo, modelo, procesador, precioUSD, observaciones } = parsed.data;
  const id = `equipo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const numeroSerie = await nextNumeroSerie();
  try {
    await db
      .prepare(
        `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, numeroSerie, fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), precioUSD, observaciones ?? null);
    res.status(201).json({ ok: true, id, numeroSerie });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** PUT /equipos/:id — actualizar */
equiposRouter.put("/equipos/:id", requireAuth, requireCanEdit, async (req, res: Response) => {
  const id = (typeof req.params.id === "string" ? req.params.id : req.params.id?.[0] ?? "").trim();
  if (!id) return res.status(400).json({ error: { message: "ID requerido" } });
  const parsed = EquipoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { fechaIngreso, marcaEquipo, modelo, procesador, precioUSD, observaciones } = parsed.data;
  try {
    const result = await db
      .prepare(
        `UPDATE equipos_asic SET fecha_ingreso = ?, marca_equipo = ?, modelo = ?, procesador = ?, precio_usd = ?, observaciones = ? WHERE id = ?`
      )
      .run(fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), precioUSD, observaciones ?? null, id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Equipo no encontrado" } });
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
    const result = await db.prepare("DELETE FROM equipos_asic WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: { message: "Equipo no encontrado" } });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

/** POST /equipos/bulk — importar varios equipos */
equiposRouter.post("/equipos/bulk", requireAuth, requireCanEdit, async (req, res: Response) => {
  const parsed = z.array(EquipoBodySchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const rows = parsed.data;
  const used = new Set(
    ((await db.prepare("SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL").all()) as { numero_serie: string }[]).map(
      (r) => r.numero_serie
    )
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
    await db
      .prepare(
        `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, ns, fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), precioUSD, observaciones ?? null);
  }
  res.status(201).json({ ok: true, inserted: rows.length });
});

/** DELETE /equipos — eliminar todos */
equiposRouter.delete("/equipos", requireAuth, requireRole("admin_a", "admin_b"), async (_req, res: Response) => {
  try {
    await db.prepare("DELETE FROM equipos_asic").run();
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});
