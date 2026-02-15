import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const garantiasRouter = Router();

const MS_15_DAYS = 15 * 24 * 60 * 60 * 1000;

const authGarantias =
  env.NODE_ENV === "development"
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : requireAuth;
const requireCanPostGarantias =
  env.NODE_ENV === "development"
    ? (_req: unknown, _res: unknown, next: () => void) => next()
    : requireRole("admin_a", "admin_b", "operador");

const AddEmittedGarantiaSchema = z.object({
  invoice: z.record(z.string(), z.unknown()),
  emittedAt: z.string(),
});

const ItemGarantiaSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  marca: z.string(),
  modelo: z.string(),
  fechaIngreso: z.string(),
  observaciones: z.string().optional(),
});

function paramStr(p: unknown): string {
  return (typeof p === "string" ? p : "").trim();
}

/** GET /garantias/emitted — últimos 15 días */
garantiasRouter.get("/garantias/emitted", authGarantias, async (_req, res) => {
  const cutoff = new Date(Date.now() - MS_15_DAYS).toISOString();
  const rows = (await db
    .prepare(
      `SELECT invoice_json, emitted_at FROM emitted_garantias
       WHERE emitted_at >= ?
       ORDER BY emitted_at ASC`
    )
    .all(cutoff)) as { invoice_json: string; emitted_at: string }[];

  const items = rows.map((r) => ({
    invoice: JSON.parse(r.invoice_json) as Record<string, unknown>,
    emittedAt: r.emitted_at,
  }));

  res.json({ items });
});

/** POST /garantias/emitted — registrar recibo de garantía emitido */
garantiasRouter.post("/garantias/emitted", authGarantias, requireCanPostGarantias, async (req, res) => {
  const parsed = AddEmittedGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
  }
  const { invoice, emittedAt } = parsed.data;
  const userId = req.user?.id ?? null;

  try {
    const invoiceJson =
      typeof invoice === "object" && invoice !== null ? JSON.stringify(invoice) : String(invoice);
    await db.prepare(
      `INSERT INTO emitted_garantias (invoice_json, emitted_at, emitted_by) VALUES (?, ?, ?)`
    ).run(invoiceJson, String(emittedAt), userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: { message: `Error al guardar: ${msg}` } });
  }

  res.status(201).json({ ok: true });
});

/** DELETE /garantias/emitted/:invoiceNumber — borrar un recibo por número */
garantiasRouter.delete(
  "/garantias/emitted/:invoiceNumber",
  requireAuth,
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    const invoiceNumber = paramStr(req.params.invoiceNumber);
    if (!invoiceNumber) {
      return res.status(400).json({ error: { message: "Número de recibo requerido" } });
    }
    const rows = (await db.prepare("SELECT id, invoice_json FROM emitted_garantias").all()) as {
      id: number;
      invoice_json: string;
    }[];
    let deleted = 0;
    for (const row of rows) {
      try {
        const inv = JSON.parse(row.invoice_json) as { number?: string };
        if (inv?.number === invoiceNumber) {
          await db.prepare("DELETE FROM emitted_garantias WHERE id = ?").run(row.id);
          deleted++;
        }
      } catch {
        /* ignore malformed json */
      }
    }
    res.json({ ok: true, deleted });
  }
);

/** DELETE /garantias/emitted — borrar todos los recibos de garantía (solo admin_a) */
garantiasRouter.delete("/garantias/emitted", requireAuth, requireRole("admin_a"), async (_req, res) => {
  const result = await db.prepare("DELETE FROM emitted_garantias").run();
  res.json({ ok: true, deleted: result.changes });
});

/** GET /garantias/items — listar ítems de garantía ANDE */
garantiasRouter.get("/garantias/items", authGarantias, async (_req, res) => {
  const rows = (await db
    .prepare(
      `SELECT id, codigo, marca, modelo, fecha_ingreso, observaciones FROM items_garantia_ande ORDER BY codigo`
    )
    .all()) as { id: string; codigo: string; marca: string; modelo: string; fecha_ingreso: string; observaciones: string | null }[];

  const items = rows.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    marca: r.marca,
    modelo: r.modelo,
    fechaIngreso: r.fecha_ingreso,
    observaciones: r.observaciones ?? undefined,
  }));

  res.json({ items });
});

/** POST /garantias/items — crear ítem */
garantiasRouter.post("/garantias/items", authGarantias, requireCanPostGarantias, async (req, res) => {
  const parsed = ItemGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
  }
  const { id, codigo, marca, modelo, fechaIngreso, observaciones } = parsed.data;

  try {
    await db.prepare(
      `INSERT INTO items_garantia_ande (id, codigo, marca, modelo, fecha_ingreso, observaciones)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, codigo, marca, modelo, fechaIngreso, observaciones ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE constraint") || msg.includes("23505")) {
      return res.status(409).json({ error: { message: "Ya existe un ítem con ese id" } });
    }
    return res.status(500).json({ error: { message: `Error al crear: ${msg}` } });
  }

  res.status(201).json({ ok: true });
});

/** PUT /garantias/items/:id — actualizar ítem */
garantiasRouter.put(
  "/garantias/items/:id",
  authGarantias,
  requireCanPostGarantias,
  async (req, res) => {
    const id = paramStr(req.params.id);
    if (!id) return res.status(400).json({ error: { message: "id requerido" } });
    const parsed = ItemGarantiaSchema.partial().omit({ id: true }).safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
    }
    const body = parsed.data as Record<string, string | undefined>;
    const codigo = body.codigo;
    const marca = body.marca;
    const modelo = body.modelo;
    const fechaIngreso = body.fechaIngreso;
    const observaciones = body.observaciones;

    try {
      const result = await db.prepare(`
        UPDATE items_garantia_ande
        SET codigo = COALESCE(?, codigo),
            marca = COALESCE(?, marca),
            modelo = COALESCE(?, modelo),
            fecha_ingreso = COALESCE(?, fecha_ingreso),
            observaciones = ?
        WHERE id = ?
      `).run(
        codigo ?? null,
        marca ?? null,
        modelo ?? null,
        fechaIngreso ?? null,
        observaciones ?? null,
        id
      );
      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Ítem no encontrado" } });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: `Error al actualizar: ${msg}` } });
    }

    res.json({ ok: true });
  }
);

/** DELETE /garantias/items — borrar todos los ítems (solo admin_a) */
garantiasRouter.delete("/garantias/items", authGarantias, requireAuth, requireRole("admin_a"), async (_req, res) => {
  const result = await db.prepare("DELETE FROM items_garantia_ande").run();
  res.json({ ok: true, deleted: result.changes });
});

/** DELETE /garantias/items/:id — borrar ítem */
garantiasRouter.delete(
  "/garantias/items/:id",
  authGarantias,
  requireCanPostGarantias,
  async (req, res) => {
    const id = paramStr(req.params.id);
    if (!id) return res.status(400).json({ error: { message: "id requerido" } });
    const result = await db.prepare("DELETE FROM items_garantia_ande WHERE id = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: { message: "Ítem no encontrado" } });
    }
    res.json({ ok: true });
  }
);
