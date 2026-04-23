import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { rebuildReciboSettlementByNumber } from "../lib/rebuildReciboSettlement.js";
import { requireRole } from "../middleware/auth.js";

const isPg = () => (getDb() as { isPostgres?: boolean }).isPostgres === true;
const clientNameCol = () => (isPg() ? '"clientName"' : "clientName");

export const invoicesRouter = Router();

const LineItemSchema = z.object({
  service: z.string().min(1).max(200),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
  discount: z.number().min(0)
});

const InvoiceCreateSchema = z.object({
  number: z.string().min(1).max(50).optional(), /* ignorado: el servidor genera el número */
  type: z.enum(["Factura", "Recibo", "Nota de Crédito"]),
  clientName: z.string().min(1).max(200),
  date: z.string().min(1).max(50),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  subtotal: z.number(), /* permitir negativos para Recibos vinculados a factura */
  discounts: z.number(),
  total: z.number(),
  items: z.array(LineItemSchema).default([]),
  relatedInvoiceId: z.string().optional(),
  relatedInvoiceNumber: z.string().optional(),
  paymentDate: z.string().optional(),
  emissionTime: z.string().optional(),
  dueDate: z.string().optional(),
  source: z.enum(["hosting", "asic"]).optional()
});

const TYPE_PREFIX: Record<string, string> = {
  "Factura": "F",
  "Recibo": "RC",
  "Nota de Crédito": "N"
};

const padDigits = 6;
const MAX_NUM = 999999;
const MIN_NUM = 1001;

function parseInvoiceNum(numStr: string, prefix: string): number | null {
  if (!numStr || !numStr.startsWith(prefix)) return null;
  const rest = numStr.slice(prefix.length).replace(/^0+/, "") || "0";
  const n = parseInt(rest, 10);
  return Number.isFinite(n) && n >= MIN_NUM && n <= MAX_NUM ? n : null;
}

/** Obtiene el siguiente número válido: max(secuencia, max_en_db) + 1. Nunca repite números existentes. */
async function getNextNumber(tx: { prepare: (s: string) => { get: (...p: unknown[]) => Promise<unknown>; all: (...p: unknown[]) => Promise<unknown[]>; run: (...p: unknown[]) => Promise<{ changes: number; lastInsertRowid: number | null }> } }, type: string, consume: boolean): Promise<string> {
  const prefix = TYPE_PREFIX[type] ?? "F";
  const formatNumber = (n: number) => `${prefix}${String(Math.min(MAX_NUM, Math.max(MIN_NUM, n))).padStart(padDigits, "0")}`;
  const sanitizeNext = (n: number) => (n > MAX_NUM ? MIN_NUM : n);

  const seqRow = (await tx.prepare("SELECT last_number FROM invoice_sequences WHERE type = ?").get(type)) as { last_number: number } | undefined;
  const seqVal = seqRow?.last_number ?? 1000;

  const rows = (await tx.prepare("SELECT number FROM invoices WHERE type = ?").all(type)) as { number: string }[];
  const nums = (Array.isArray(rows) ? rows : [])
    .map((r) => parseInvoiceNum(String(r?.number ?? ""), prefix))
    .filter((n): n is number => n != null);
  const maxInDb = nums.length > 0 ? Math.max(...nums) : 0;

  const base = Math.max(seqVal, maxInDb, MIN_NUM - 1);
  const nextNum = sanitizeNext(base + 1);

  if (consume) {
    await tx.prepare("UPDATE invoice_sequences SET last_number = ? WHERE type = ?").run(nextNum, type);
  }
  return formatNumber(nextNum);
}

/** GET /invoices/next-number?type=Factura|Recibo|Nota de Crédito&peek=1 — devuelve el siguiente número. Si peek=1 no incrementa la secuencia. */
invoicesRouter.get("/invoices/next-number", requireRole("admin_a", "admin_b", "operador"), async (req, res) => {
  const q = z.object({
    type: z.enum(["Factura", "Recibo", "Nota de Crédito"]),
    peek: z.union([z.string(), z.undefined()]).optional()
  }).safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "Query inválida: type debe ser Factura, Recibo o Nota de Crédito" } });
  }
  const type = q.data.type;
  const peek = q.data.peek === "1" || q.data.peek === "true";

  try {
    const number = await getNextNumber(db as never, type, !peek);
    return res.json({ number });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    return res.status(500).json({ error: { message: msg || "Secuencia no configurada" } });
  }
});

const sourceCol = () => (isPg() ? "COALESCE(source, 'hosting')" : "COALESCE(source, 'hosting')");

invoicesRouter.get("/invoices", async (req, res) => {
  const q = z
    .object({
      client: z.string().optional(),
      type: z.enum(["Factura", "Recibo", "Nota de Crédito"]).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      source: z.enum(["hosting", "asic"]).optional()
    })
    .safeParse(req.query);

  if (!q.success) {
    return res.status(400).json({ error: { message: "Invalid query" } });
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q.data.client) {
    clauses.push(`LOWER(${clientNameCol()}) LIKE ?`);
    params.push(`%${q.data.client.toLowerCase()}%`);
  }
  if (q.data.type) {
    clauses.push("type = ?");
    params.push(q.data.type);
  }
  if (q.data.month) {
    clauses.push("month = ?");
    params.push(q.data.month);
  }
  if (q.data.source) {
    clauses.push(`(${sourceCol()} = ?)`);
    params.push(q.data.source);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT id, number, type, ${clientNameCol()} as clientName, date, month, subtotal, discounts, total,
              related_invoice_id as relatedInvoiceId, related_invoice_number as relatedInvoiceNumber,
              payment_date as paymentDate, emission_time as emissionTime, due_date as dueDate,
              ${sourceCol()} as source
       FROM invoices ${where} ORDER BY id DESC`
    )
    .all(...params);

  /* PostgreSQL devuelve alias en minúsculas; normalizar a camelCase para el cliente */
  const invoices = (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    number: r.number,
    type: r.type,
    clientName: r.clientName ?? r.clientname,
    date: r.date,
    month: r.month,
    subtotal: r.subtotal,
    discounts: r.discounts,
    total: r.total,
    relatedInvoiceId: r.relatedInvoiceId ?? r.relatedinvoiceid,
    relatedInvoiceNumber: r.relatedInvoiceNumber ?? r.relatedinvoicenumber,
    paymentDate: r.paymentDate ?? r.paymentdate,
    emissionTime: r.emissionTime ?? r.emissiontime ?? r.emission_time,
    dueDate: r.dueDate ?? r.duedate,
    source: r.source
  }));

  res.json({ invoices });
});

/** GET /invoices/:id — devuelve una factura con sus ítems (para cargar detalle en recibo/NC). */
invoicesRouter.get("/invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "Invalid id" } });
  }
  const row = await db.prepare(
    `SELECT id, number, type, ${clientNameCol()} as clientName, date, month, subtotal, discounts, total,
            related_invoice_id as relatedInvoiceId, related_invoice_number as relatedInvoiceNumber,
            payment_date as paymentDate, emission_time as emissionTime, due_date as dueDate,
            ${sourceCol()} as source
     FROM invoices WHERE id = ?`
  ).get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return res.status(404).json({ error: { message: "Invoice not found" } });
  }
  const itemRows = await db.prepare(
    "SELECT service, month, quantity, price, discount FROM invoice_items WHERE invoice_id = ? ORDER BY id"
  ).all(id) as Array<{ service: string; month: string; quantity: number; price: number; discount: number }>;
  const items = (Array.isArray(itemRows) ? itemRows : []).map((r) => ({
    service: r.service,
    month: r.month,
    quantity: r.quantity,
    price: r.price,
    discount: r.discount
  }));
  const invoice = {
    id: row.id,
    number: row.number,
    type: row.type,
    clientName: row.clientName ?? row.clientname,
    date: row.date,
    month: row.month,
    subtotal: row.subtotal,
    discounts: row.discounts,
    total: row.total,
    relatedInvoiceId: row.relatedInvoiceId ?? row.relatedinvoiceid,
    relatedInvoiceNumber: row.relatedInvoiceNumber ?? row.relatedinvoicenumber,
    paymentDate: row.paymentDate ?? row.paymentdate,
    emissionTime: row.emissionTime ?? row.emissiontime ?? row.emission_time,
    dueDate: row.dueDate ?? row.duedate,
    source: row.source,
    items
  };
  res.json({ invoice });
});

invoicesRouter.post("/invoices", requireRole("admin_a", "admin_b", "operador"), async (req, res) => {
  const parsed = InvoiceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    const msg = details.fieldErrors && Object.keys(details.fieldErrors).length > 0
      ? Object.entries(details.fieldErrors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("; ")
      : "Invalid body";
    return res
      .status(400)
      .json({ error: { message: msg, details: parsed.error.flatten() } });
  }

  const inv = parsed.data;
  const sourceVal = inv.source ?? "hosting";
  const subtotalDb = inv.type === "Recibo" || inv.type === "Nota de Crédito" ? -Math.abs(inv.subtotal) : inv.subtotal;
  const discountsDb = inv.type === "Recibo" || inv.type === "Nota de Crédito" ? -Math.abs(inv.discounts) : inv.discounts;
  const totalDb = inv.type === "Recibo" || inv.type === "Nota de Crédito" ? -Math.abs(inv.total) : inv.total;

  try {
    const created = await db.transaction(async (tx) => {
      const numberToUse = await getNextNumber(tx as never, inv.type, true);

      const info = await tx.prepare(`
        INSERT INTO invoices (number, type, ${clientNameCol()}, date, month, subtotal, discounts, total,
                              related_invoice_id, related_invoice_number, payment_date, emission_time, due_date, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        numberToUse,
        inv.type,
        inv.clientName,
        inv.date,
        inv.month,
        subtotalDb,
        discountsDb,
        totalDb,
        inv.relatedInvoiceId || null,
        inv.relatedInvoiceNumber || null,
        inv.paymentDate || null,
        inv.emissionTime || null,
        inv.dueDate || null,
        sourceVal
      );
      const invoiceId = info.lastInsertRowid as number;
      const insertItem = tx.prepare(`
        INSERT INTO invoice_items (invoice_id, service, month, quantity, price, discount)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const item of inv.items) {
        await insertItem.run(invoiceId, item.service, item.month, item.quantity, item.price, item.discount);
      }
      const createdRow = await tx.prepare(
        `SELECT id, number, type, ${clientNameCol()} as clientName, date, month, subtotal, discounts, total,
                related_invoice_id as relatedInvoiceId, related_invoice_number as relatedInvoiceNumber,
                payment_date as paymentDate, emission_time as emissionTime, due_date as dueDate
         FROM invoices WHERE id = ?`
      ).get(invoiceId);
      return createdRow;
    });
    res.status(201).json({ invoice: created });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code?.includes("SQLITE_CONSTRAINT") || err?.code === "23505") {
      return res.status(409).json({ error: { message: "Invoice number already exists" } });
    }
    const msg = err?.message ?? (e instanceof Error ? e.message : String(e ?? "Error al guardar"));
    return res.status(500).json({ error: { message: msg } });
  }
});

/** DELETE /invoices/all?source=hosting|asic — borrar todas las facturas (solo admin_a, mismo permiso que "Borrar Todo" en Historial) */
invoicesRouter.delete("/invoices/all", requireRole("admin_a"), async (req, res) => {
  const q = z.object({ source: z.enum(["hosting", "asic"]).optional() }).safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "Query inválida: source opcional (hosting|asic)" } });
  }
  const source = q.data.source;
  if (source) {
    const info = await db.prepare(`DELETE FROM invoices WHERE ${sourceCol()} = ?`).run(source);
    return res.json({ ok: true, deleted: info.changes ?? 0 });
  }
  const info = await db.prepare("DELETE FROM invoices").run();
  return res.json({ ok: true, deleted: info.changes ?? 0 });
});

invoicesRouter.delete("/invoices/:id", requireRole("admin_a", "admin_b"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "Invalid id" } });
  }
  const info = await db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
  if (info.changes === 0) {
    return res.status(404).json({ error: { message: "Invoice not found" } });
  }
  res.json({ ok: true });
});

/** POST /invoices/rebuild-recibo-settlement — reescribe ítems de un recibo al formato liquidación (admin). */
invoicesRouter.post("/invoices/rebuild-recibo-settlement", requireRole("admin_a", "admin_b"), async (req, res) => {
  const parsed = z
    .object({
      number: z.string().min(1).max(50),
      source: z.enum(["hosting", "asic"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Body inválido: se requiere { number: string, source?: 'hosting'|'asic' }" } });
  }
  try {
    const result = await rebuildReciboSettlementByNumber(getDb, parsed.data.number, {
      source: parsed.data.source ?? "hosting",
    });
    if (!result.ok) {
      return res.status(400).json({ error: { message: result.error } });
    }
    return res.json({ ok: true, id: result.id, number: result.number, itemCount: result.itemCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: { message: msg } });
  }
});
