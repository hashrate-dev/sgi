import { Router } from "express";
import { z } from "zod";
import { db } from "../db";

export const clientsRouter = Router();

const ClientCreateSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  name: z.string().min(1).max(200).trim(),
  phone: z.string().max(50).trim().optional(),
  email: z.string().max(200).trim().optional(),
  address: z.string().max(300).trim().optional(),
  city: z.string().max(100).trim().optional()
});

const ClientUpdateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  name: z.string().min(1).max(200).trim().optional(),
  phone: z.string().max(50).trim().optional(),
  email: z.string().max(200).trim().optional(),
  address: z.string().max(300).trim().optional(),
  city: z.string().max(100).trim().optional()
});

const selectFields = "id, code, name, phone, email, address, city";

clientsRouter.get("/clients", (_req, res) => {
  const rows = db.prepare(`SELECT ${selectFields} FROM clients ORDER BY code ASC`).all();
  res.json({ clients: rows });
});

clientsRouter.post("/clients", (req, res) => {
  const parsed = ClientCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Invalid body", details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const stmt = db.prepare(
    "INSERT INTO clients (code, name, phone, email, address, city) VALUES (?, ?, ?, ?, ?, ?)"
  );
  try {
    const info = stmt.run(d.code, d.name, d.phone ?? null, d.email ?? null, d.address ?? null, d.city ?? null);
    const client = db.prepare(`SELECT ${selectFields} FROM clients WHERE id = ?`).get(info.lastInsertRowid as number);
    res.status(201).json({ client });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code && String(err.code).includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: { message: "Ya existe un cliente con ese código" } });
    }
    throw e;
  }
});

clientsRouter.put("/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "Invalid id" } });
  }
  const parsed = ClientUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Invalid body", details: parsed.error.flatten() } });
  }
  const existing = db.prepare("SELECT id FROM clients WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: { message: "Cliente no encontrado" } });
  }
  const d = parsed.data;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (d.code !== undefined) {
    updates.push("code = ?");
    values.push(d.code);
  }
  if (d.name !== undefined) {
    updates.push("name = ?");
    values.push(d.name);
  }
  if (d.phone !== undefined) {
    updates.push("phone = ?");
    values.push(d.phone);
  }
  if (d.email !== undefined) {
    updates.push("email = ?");
    values.push(d.email);
  }
  if (d.address !== undefined) {
    updates.push("address = ?");
    values.push(d.address);
  }
  if (d.city !== undefined) {
    updates.push("city = ?");
    values.push(d.city);
  }
  if (updates.length === 0) {
    const client = db.prepare(`SELECT ${selectFields} FROM clients WHERE id = ?`).get(id);
    return res.json({ client });
  }
  values.push(id);
  try {
    db.prepare(`UPDATE clients SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const client = db.prepare(`SELECT ${selectFields} FROM clients WHERE id = ?`).get(id);
    res.json({ client });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code && String(err.code).includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: { message: "Ya existe un cliente con ese código" } });
    }
    throw e;
  }
});
