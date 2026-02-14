import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";

export const invoicesRouter = Router();

const LineItemSchema = z.object({
  service: z.string().min(1).max(200),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
  discount: z.number().min(0)
});

const InvoiceCreateSchema = z.object({
  number: z.string().min(1).max(50),
  type: z.enum(["Factura", "Recibo", "Nota de Crédito"]),
  clientName: z.string().min(1).max(200),
  date: z.string().min(1).max(50),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  subtotal: z.number().min(0),
  discounts: z.number().min(0),
  total: z.number().min(0),
  items: z.array(LineItemSchema).default([]),
  relatedInvoiceId: z.string().optional(),
  relatedInvoiceNumber: z.string().optional(),
  paymentDate: z.string().optional(),
  emissionTime: z.string().optional(),
  dueDate: z.string().optional()
});

const TYPE_PREFIX: Record<string, string> = {
  "Factura": "FC",
  "Recibo": "RC",
  "Nota de Crédito": "NC"
};

/** GET /invoices/next-number?type=Factura|Recibo|Nota de Crédito — devuelve el siguiente número (ej. FC1001). */
invoicesRouter.get("/invoices/next-number", requireRole("admin_a", "admin_b", "operador"), (req, res) => {
  const q = z.object({ type: z.enum(["Factura", "Recibo", "Nota de Crédito"]) }).safeParse(req.query);
  if (!q.success) {
    return res.status(400).json({ error: { message: "Query inválida: type debe ser Factura, Recibo o Nota de Crédito" } });
  }
  const type = q.data.type;
  const prefix = TYPE_PREFIX[type];

  const getNext = db.transaction(() => {
    const row = db.prepare("SELECT last_number FROM invoice_sequences WHERE type = ?").get(type) as { last_number: number } | undefined;
    if (!row) return null;
    const nextNum = row.last_number + 1;
    db.prepare("UPDATE invoice_sequences SET last_number = ? WHERE type = ?").run(nextNum, type);
    return `${prefix}${nextNum}`;
  });

  const number = getNext();
  if (number === null) {
    return res.status(500).json({ error: { message: "Secuencia no configurada para este tipo" } });
  }
  res.json({ number });
});

invoicesRouter.get("/invoices", (req, res) => {
  const q = z
    .object({
      client: z.string().optional(),
      type: z.enum(["Factura", "Recibo", "Nota de Crédito"]).optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional()
    })
    .safeParse(req.query);

  if (!q.success) {
    return res.status(400).json({ error: { message: "Invalid query" } });
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q.data.client) {
    clauses.push("LOWER(clientName) LIKE ?");
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

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const invoices = db
    .prepare(
      `SELECT id, number, type, clientName, date, month, subtotal, discounts, total,
              related_invoice_id as relatedInvoiceId, related_invoice_number as relatedInvoiceNumber,
              payment_date as paymentDate, emission_time as emissionTime, due_date as dueDate
       FROM invoices ${where} ORDER BY id DESC`
    )
    .all(...params);

  res.json({ invoices });
});

invoicesRouter.post("/invoices", requireRole("admin_a", "admin_b", "operador"), (req, res) => {
  const parsed = InvoiceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Invalid body", details: parsed.error.flatten() } });
  }

  const inv = parsed.data;
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (number, type, clientName, date, month, subtotal, discounts, total, 
                          related_invoice_id, related_invoice_number, payment_date, emission_time, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, service, month, quantity, price, discount)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const info = insertInvoice.run(
      inv.number,
      inv.type,
      inv.clientName,
      inv.date,
      inv.month,
      inv.subtotal,
      inv.discounts,
      inv.total,
      inv.relatedInvoiceId || null,
      inv.relatedInvoiceNumber || null,
      inv.paymentDate || null,
      inv.emissionTime || null,
      inv.dueDate || null
    );
    const invoiceId = info.lastInsertRowid as number;
    for (const item of inv.items) {
      insertItem.run(invoiceId, item.service, item.month, item.quantity, item.price, item.discount);
    }
    const created = db
      .prepare(
        `SELECT id, number, type, clientName, date, month, subtotal, discounts, total,
                related_invoice_id as relatedInvoiceId, related_invoice_number as relatedInvoiceNumber,
                payment_date as paymentDate, emission_time as emissionTime, due_date as dueDate
         FROM invoices WHERE id = ?`
      )
      .get(invoiceId);
    return created;
  });

  try {
    const created = tx();
    res.status(201).json({ invoice: created });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code?.includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: { message: "Invoice number already exists" } });
    }
    throw e;
  }
});

invoicesRouter.delete("/invoices/:id", requireRole("admin_a", "admin_b"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "Invalid id" } });
  }
  const stmt = db.prepare("DELETE FROM invoices WHERE id = ?");
  const info = stmt.run(id);
  if (info.changes === 0) {
    return res.status(404).json({ error: { message: "Invoice not found" } });
  }
  res.json({ ok: true });
});
