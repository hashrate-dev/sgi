import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ensureItemsGarantiaAndePrecioColumn } from "../lib/ensureItemsGarantiaAndePrecio.js";
import {
  ensureItemsGarantiaAndePrecioHistorial,
  pricesDiffer,
} from "../lib/ensureItemsGarantiaAndePrecioHistorial.js";

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
  preserveNumber: z.boolean().optional() /* true = import histórico, usa número del cliente */
});

const GARANTIA_PREFIX: Record<string, string> = { Recibo: "R", "Recibo Devolución": "RD" };
const GARANTIA_DIGITS = 4;
const GARANTIA_START: Record<string, number> = { Recibo: 100, "Recibo Devolución": 200 };

/** Obtiene el siguiente número de garantía: max(secuencia, max_en_emitted) + 1. Atómico en transacción. */
async function getNextGarantiaNumber(
  tx: { prepare: (s: string) => { get: (...p: unknown[]) => Promise<unknown>; all: (...p: unknown[]) => Promise<unknown[]>; run: (...p: unknown[]) => Promise<{ changes: number }> } },
  type: "Recibo" | "Recibo Devolución",
  consume: boolean
): Promise<string> {
  const prefix = GARANTIA_PREFIX[type] ?? "R";
  const startNum = GARANTIA_START[type] ?? 100;
  const formatNum = (n: number) => `${prefix}${String(n).padStart(GARANTIA_DIGITS, "0")}`;

  const seqRow = (await tx.prepare("SELECT last_number FROM garantia_sequences WHERE type = ?").get(type)) as { last_number: number } | undefined;
  const seqVal = seqRow?.last_number ?? startNum;

  const rows = (await tx.prepare("SELECT invoice_json FROM emitted_garantias").all()) as { invoice_json: string }[];
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{1,${GARANTIA_DIGITS}})$`, "i");
  const nums = (Array.isArray(rows) ? rows : [])
    .map((r) => {
      try {
        const inv = JSON.parse(r.invoice_json) as { number?: string };
        const m = inv?.number?.match(regex);
        return m ? parseInt(m[1]!, 10) : 0;
      } catch {
        return 0;
      }
    })
    .filter((n) => Number.isFinite(n) && n >= startNum);
  const maxInDb = nums.length > 0 ? Math.max(...nums) : 0;

  const base = Math.max(seqVal, maxInDb, startNum - 1);
  const nextNum = base + 1;

  if (consume) {
    await tx.prepare("UPDATE garantia_sequences SET last_number = ? WHERE type = ?").run(nextNum, type);
  }
  return formatNum(nextNum);
}

const ItemGarantiaSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  marca: z.string(),
  modelo: z.string(),
  fechaIngreso: z.string(),
  observaciones: z.string().optional(),
  /** Precio de la garantía (USD u otra moneda de referencia del negocio). */
  precioGarantia: z.number().finite().optional().nullable(),
});

function paramStr(p: unknown): string {
  return (typeof p === "string" ? p : "").trim();
}

/** GET /garantias/next-number?type=Recibo|Recibo Devolución&peek=1 — siguiente número. peek=1 no consume. */
garantiasRouter.get("/garantias/next-number", authGarantias, requireCanPostGarantias, async (req, res) => {
  const q = z
    .object({
      type: z.enum(["Recibo", "Recibo Devolución"]),
      peek: z.union([z.string(), z.undefined()]).optional()
    })
    .safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "Query inválida: type debe ser Recibo o Recibo Devolución" } });
  }
  const peek = q.data.peek === "1" || q.data.peek === "true";
  try {
    const number = await getNextGarantiaNumber(db as never, q.data.type, !peek);
    return res.json({ number });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    return res.status(500).json({ error: { message: msg || "Secuencia no configurada" } });
  }
});

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

/** POST /garantias/emitted — registrar recibo de garantía emitido. El servidor asigna el número (evita duplicados). preserveNumber=true para import histórico. */
garantiasRouter.post("/garantias/emitted", authGarantias, requireCanPostGarantias, async (req, res) => {
  const parsed = AddEmittedGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
  }
  const { invoice, emittedAt, preserveNumber } = parsed.data;
  const userId = req.user?.id ?? null;
  const tipo = (typeof invoice === "object" && invoice !== null && (invoice as { type?: string }).type) as "Recibo" | "Recibo Devolución" | undefined;
  const type = tipo === "Recibo" || tipo === "Recibo Devolución" ? tipo : "Recibo";

  try {
    const result = await db.transaction(async (tx) => {
      let number: string;
      if (preserveNumber && typeof invoice === "object" && invoice !== null && typeof (invoice as { number?: string }).number === "string") {
        number = (invoice as { number: string }).number;
        const prefix = GARANTIA_PREFIX[type] ?? "R";
        const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{1,${GARANTIA_DIGITS}})$`, "i");
        const m = number.match(regex);
        if (m) {
          const n = parseInt(m[1]!, 10);
          await tx.prepare("UPDATE garantia_sequences SET last_number = CASE WHEN last_number < ? THEN ? ELSE last_number END WHERE type = ?").run(n, n, type);
        }
      } else {
        number = await getNextGarantiaNumber(tx as never, type, true);
      }
      const invWithNumber = typeof invoice === "object" && invoice !== null ? { ...invoice, number } : { number, type };
      const invoiceJson = JSON.stringify(invWithNumber);
      await tx.prepare(
        `INSERT INTO emitted_garantias (invoice_json, emitted_at, emitted_by) VALUES (?, ?, ?)`
      ).run(invoiceJson, String(emittedAt), userId);
      return { number };
    });
    res.status(201).json({ ok: true, number: result.number });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: { message: `Error al guardar: ${msg}` } });
  }
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
  await ensureItemsGarantiaAndePrecioColumn();
  await ensureItemsGarantiaAndePrecioHistorial();

  type Row = {
    id: string;
    codigo: string;
    marca: string;
    modelo: string;
    fecha_ingreso: string;
    observaciones: string | null;
    precio_garantia?: number | null;
  };

  let rows: Row[];
  try {
    rows = (await db
      .prepare(
        `SELECT id, codigo, marca, modelo, fecha_ingreso, observaciones, precio_garantia FROM items_garantia_ande ORDER BY codigo`
      )
      .all()) as Row[];
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (
      m.toLowerCase().includes("precio_garantia") ||
      m.includes("no such column") ||
      m.includes("42703") /* PostgreSQL undefined_column */
    ) {
      rows = (await db
        .prepare(
          `SELECT id, codigo, marca, modelo, fecha_ingreso, observaciones FROM items_garantia_ande ORDER BY codigo`
        )
        .all()) as Row[];
    } else {
      // eslint-disable-next-line no-console
      console.error("[GET /garantias/items]", e);
      return res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? m : "Error al listar ítems de garantía" },
      });
    }
  }

  const items = rows.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    marca: r.marca,
    modelo: r.modelo,
    fechaIngreso: r.fecha_ingreso,
    observaciones: r.observaciones ?? undefined,
    precioGarantia:
      r.precio_garantia != null && Number.isFinite(Number(r.precio_garantia)) ? Number(r.precio_garantia) : undefined,
  }));

  res.json({ items });
});

/** GET /garantias/items/:id/precio-historial — historial de cambios de precio (USD) */
garantiasRouter.get("/garantias/items/:id/precio-historial", authGarantias, async (req, res) => {
  await ensureItemsGarantiaAndePrecioColumn();
  await ensureItemsGarantiaAndePrecioHistorial();
  const id = paramStr(req.params.id);
  if (!id) return res.status(400).json({ error: { message: "id requerido" } });

  const exists = (await db.prepare("SELECT 1 AS ok FROM items_garantia_ande WHERE id = ?").get(id)) as { ok: number } | undefined;
  if (!exists) {
    return res.status(404).json({ error: { message: "Ítem no encontrado" } });
  }

  type HRow = { precio_usd: number; recorded_at: string };
  let rows: HRow[];
  try {
    rows = (await db
      .prepare(
        `SELECT precio_usd, recorded_at FROM items_garantia_ande_precio_historial
         WHERE item_id = ? ORDER BY recorded_at ASC`
      )
      .all(id)) as HRow[];
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("no such table") || m.includes("42P01")) {
      rows = [];
    } else {
      // eslint-disable-next-line no-console
      console.error("[GET /garantias/items/:id/precio-historial]", e);
      return res.status(500).json({
        error: { message: env.NODE_ENV === "development" ? m : "Error al leer historial" },
      });
    }
  }

  const entries = rows.map((r) => ({
    precioUsd: Number(r.precio_usd),
    actualizadoEn:
      typeof r.recorded_at === "string"
        ? r.recorded_at
        : r.recorded_at != null
          ? String(r.recorded_at)
          : new Date().toISOString(),
  }));

  res.json({ entries });
});

/** POST /garantias/items — crear ítem */
garantiasRouter.post("/garantias/items", authGarantias, requireCanPostGarantias, async (req, res) => {
  await ensureItemsGarantiaAndePrecioColumn();
  await ensureItemsGarantiaAndePrecioHistorial();
  const parsed = ItemGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
  }
  const { id, codigo, marca, modelo, fechaIngreso, observaciones, precioGarantia } = parsed.data;
  const precioSql =
    precioGarantia != null && Number.isFinite(Number(precioGarantia)) ? Number(precioGarantia) : null;

  try {
    await db.prepare(
      `INSERT INTO items_garantia_ande (id, codigo, marca, modelo, fecha_ingreso, observaciones, precio_garantia)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, codigo, marca, modelo, fechaIngreso, observaciones ?? null, precioSql);
    if (precioSql != null) {
      const ts = new Date().toISOString();
      try {
        await db
          .prepare(
            `INSERT INTO items_garantia_ande_precio_historial (item_id, precio_usd, recorded_at) VALUES (?, ?, ?)`
          )
          .run(id, precioSql, ts);
      } catch (he) {
        const hm = he instanceof Error ? he.message : String(he);
        // eslint-disable-next-line no-console
        console.warn("[POST /garantias/items] historial precio:", hm);
      }
    }
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
    await ensureItemsGarantiaAndePrecioColumn();
    await ensureItemsGarantiaAndePrecioHistorial();
    const id = paramStr(req.params.id);
    if (!id) return res.status(400).json({ error: { message: "id requerido" } });
    const parsed = ItemGarantiaSchema.partial().omit({ id: true }).safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { message: "Body inválido", details: parsed.error.flatten() } });
    }
    const patch = parsed.data;
    const codigo = patch.codigo;
    const marca = patch.marca;
    const modelo = patch.modelo;
    const fechaIngreso = patch.fechaIngreso;
    const observaciones = patch.observaciones;
    const precioProvided = Object.prototype.hasOwnProperty.call(patch, "precioGarantia");
    const precioPatch = patch.precioGarantia;
    const precioSql =
      precioPatch != null && Number.isFinite(Number(precioPatch)) ? Number(precioPatch) : null;

    const setClauses = [
      "codigo = COALESCE(?, codigo)",
      "marca = COALESCE(?, marca)",
      "modelo = COALESCE(?, modelo)",
      "fecha_ingreso = COALESCE(?, fecha_ingreso)",
      "observaciones = ?",
    ];
    const runParams: unknown[] = [codigo ?? null, marca ?? null, modelo ?? null, fechaIngreso ?? null, observaciones ?? null];
    if (precioProvided) {
      setClauses.push("precio_garantia = ?");
      runParams.push(precioSql);
    }
    runParams.push(id);

    type PrevRow = { precio_garantia: number | null };
    let prev: PrevRow | undefined;
    try {
      prev = (await db.prepare("SELECT precio_garantia FROM items_garantia_ande WHERE id = ?").get(id)) as PrevRow | undefined;
      if (!prev) {
        return res.status(404).json({ error: { message: "Ítem no encontrado" } });
      }
      const result = await db
        .prepare(`UPDATE items_garantia_ande SET ${setClauses.join(", ")} WHERE id = ?`)
        .run(...runParams);
      if (result.changes === 0) {
        return res.status(404).json({ error: { message: "Ítem no encontrado" } });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: `Error al actualizar: ${msg}` } });
    }

    if (precioProvided && precioSql != null) {
      const oldP =
        prev?.precio_garantia != null && Number.isFinite(Number(prev.precio_garantia))
          ? Number(prev.precio_garantia)
          : null;
      if (pricesDiffer(oldP, precioSql)) {
        const ts = new Date().toISOString();
        try {
          await db
            .prepare(
              `INSERT INTO items_garantia_ande_precio_historial (item_id, precio_usd, recorded_at) VALUES (?, ?, ?)`
            )
            .run(id, precioSql, ts);
        } catch (he) {
          const hm = he instanceof Error ? he.message : String(he);
          // eslint-disable-next-line no-console
          console.warn("[PUT /garantias/items] historial precio:", hm);
        }
      }
    }

    res.json({ ok: true });
  }
);

/** DELETE /garantias/items — borrar todos los ítems (solo admin_a) */
garantiasRouter.delete("/garantias/items", authGarantias, requireAuth, requireRole("admin_a"), async (_req, res) => {
  await ensureItemsGarantiaAndePrecioHistorial();
  try {
    await db.prepare("DELETE FROM items_garantia_ande_precio_historial").run();
  } catch {
    /* tabla puede no existir en BD muy vieja */
  }
  const result = await db.prepare("DELETE FROM items_garantia_ande").run();
  res.json({ ok: true, deleted: result.changes });
});

/** DELETE /garantias/items/:id — borrar ítem */
garantiasRouter.delete(
  "/garantias/items/:id",
  authGarantias,
  requireCanPostGarantias,
  async (req, res) => {
    await ensureItemsGarantiaAndePrecioHistorial();
    const id = paramStr(req.params.id);
    if (!id) return res.status(400).json({ error: { message: "id requerido" } });
    try {
      await db.prepare("DELETE FROM items_garantia_ande_precio_historial WHERE item_id = ?").run(id);
    } catch {
      /* sin tabla */
    }
    const result = await db.prepare("DELETE FROM items_garantia_ande WHERE id = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: { message: "Ítem no encontrado" } });
    }
    res.json({ ok: true });
  }
);
