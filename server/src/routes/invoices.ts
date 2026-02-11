import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

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
  type: z.enum(["Factura", "Recibo"]),
  clientName: z.string().min(1).max(200),
  date: z.string().min(1).max(50),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  subtotal: z.number().min(0),
  discounts: z.number().min(0),
  total: z.number().min(0),
  items: z.array(LineItemSchema).default([])
});

invoicesRouter.get("/invoices", (req, res) => {
  const q = z
    .object({
      client: z.string().optional(),
      type: z.enum(["Factura", "Recibo"]).optional(),
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
      `SELECT id, number, type, clientName, date, month, subtotal, discounts, total
       FROM invoices ${where} ORDER BY id DESC`
    )
    .all(...params);

  res.json({ invoices });
});

invoicesRouter.post("/invoices", (req, res) => {
  const parsed = InvoiceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Invalid body", details: parsed.error.flatten() } });
  }

  const inv = parsed.data;
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (number, type, clientName, date, month, subtotal, discounts, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      inv.total
    );
    const invoiceId = info.lastInsertRowid as number;
    for (const item of inv.items) {
      insertItem.run(invoiceId, item.service, item.month, item.quantity, item.price, item.discount);
    }
    const created = db
      .prepare(
        "SELECT id, number, type, clientName, date, month, subtotal, discounts, total FROM invoices WHERE id = ?"
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

invoicesRouter.delete("/invoices/:id", (req, res) => {
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
