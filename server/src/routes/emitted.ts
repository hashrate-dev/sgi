import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const emittedRouter = Router();

/** En desarrollo no exige auth (localhost sin login); en producción exige token */
const authEmitted = env.NODE_ENV === "development" ? (_req: Request, _res: Response, next: NextFunction) => next() : requireAuth;
/** En desarrollo cualquiera puede subir; en producción solo admin/operador */
const requireCanPostEmitted = env.NODE_ENV === "development" ? (_req: unknown, _res: unknown, next: () => void) => next() : requireRole("admin_a", "admin_b", "operador");

const MS_24H = 24 * 60 * 60 * 1000;
const MS_15_DAYS = 15 * 24 * 60 * 60 * 1000;

const AddEmittedSchema = z.object({
  source: z.enum(["hosting", "asic"]),
  invoice: z.record(z.string(), z.unknown()),
  emittedAt: z.string(),
});

/** GET /emitted?source=hosting|asic — últimos 20 días en ambos */
emittedRouter.get("/emitted", authEmitted, async (req, res) => {
  const q = z.object({ source: z.enum(["hosting", "asic"]) }).safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "source debe ser hosting o asic" } });
  }
  const cutoff = new Date(Date.now() - MS_15_DAYS).toISOString();
  const rows = (await db
    .prepare(
      `SELECT invoice_json, emitted_at FROM emitted_documents 
       WHERE source = ? AND emitted_at >= ? 
       ORDER BY emitted_at ASC`
    )
    .all(q.data.source, cutoff)) as { invoice_json: string; emitted_at: string }[];

  const items = rows.map((r) => ({
    invoice: JSON.parse(r.invoice_json) as Record<string, unknown>,
    emittedAt: r.emitted_at,
  }));

  res.json({ items });
});

/** POST /emitted — registrar documento emitido (en producción: admin/operador; en localhost: cualquier usuario logueado) */
emittedRouter.post("/emitted", authEmitted, requireCanPostEmitted, async (req, res) => {
  const parsed = AddEmittedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
  }
  const { source, invoice, emittedAt } = parsed.data;
  const userId = req.user?.id ?? null;

  try {
    const invoiceJson = typeof invoice === "object" && invoice !== null ? JSON.stringify(invoice) : String(invoice);
    await db.prepare(
      `INSERT INTO emitted_documents (source, invoice_json, emitted_at, emitted_by) VALUES (?, ?, ?, ?)`
    ).run(source, invoiceJson, String(emittedAt), userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: { message: `Error al guardar: ${msg}` } });
  }

  res.status(201).json({ ok: true });
});

/** DELETE /emitted/:source/:invoiceNumber — borrar un documento emitido (para que no siga en "Documentos emitidos" al borrarlo del historial) */
emittedRouter.delete("/emitted/:source/:invoiceNumber", requireAuth, requireRole("admin_a", "admin_b", "operador"), async (req, res) => {
  const source = z.enum(["hosting", "asic"]).safeParse(req.params.source);
  const invoiceNumber = (typeof req.params.invoiceNumber === "string" ? req.params.invoiceNumber : "").trim();
  if (!source.success || !invoiceNumber) {
    return res.status(400).json({ error: { message: "source (hosting|asic) y número de documento requeridos" } });
  }
  const rows = (await db.prepare("SELECT id, invoice_json FROM emitted_documents WHERE source = ?").all(source.data)) as { id: number; invoice_json: string }[];
  let deleted = 0;
  for (const row of rows) {
    try {
      const inv = JSON.parse(row.invoice_json) as { number?: string };
      if (inv?.number === invoiceNumber) {
        await db.prepare("DELETE FROM emitted_documents WHERE id = ?").run(row.id);
        deleted++;
      }
    } catch {
      /* ignore malformed json */
    }
  }
  res.json({ ok: true, deleted });
});

/** DELETE /emitted?source=hosting|asic — borrar todos los documentos emitidos de ese origen (solo admin_a, mismo permiso que "Eliminar todo" historial) */
emittedRouter.delete("/emitted", requireAuth, requireRole("admin_a"), async (req, res) => {
  const q = z.object({ source: z.enum(["hosting", "asic"]) }).safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "source debe ser hosting o asic" } });
  }
  const result = await db.prepare("DELETE FROM emitted_documents WHERE source = ?").run(q.data.source);
  res.json({ ok: true, deleted: result.changes });
});
