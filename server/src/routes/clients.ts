import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";

export const clientsRouter = Router();

const ClientCreateSchema = z.object({
  code: z.string().min(1).max(50).trim(),
  name: z.string().min(1).max(200).trim(),
  name2: z.string().max(200).trim().optional(),
  phone: z.string().max(50).trim().optional(),
  phone2: z.string().max(50).trim().optional(),
  email: z.string().max(200).trim().optional(),
  email2: z.string().max(200).trim().optional(),
  address: z.string().max(300).trim().optional(),
  address2: z.string().max(300).trim().optional(),
  city: z.string().max(100).trim().optional(),
  city2: z.string().max(100).trim().optional()
});

const ClientUpdateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  name: z.string().min(1).max(200).trim().optional(),
  name2: z.string().max(200).trim().optional(),
  phone: z.string().max(50).trim().optional(),
  phone2: z.string().max(50).trim().optional(),
  email: z.string().max(200).trim().optional(),
  email2: z.string().max(200).trim().optional(),
  address: z.string().max(300).trim().optional(),
  address2: z.string().max(300).trim().optional(),
  city: z.string().max(100).trim().optional(),
  city2: z.string().max(100).trim().optional()
});

const selectFields = "id, code, name, name2, phone, phone2, email, email2, address, address2, city, city2";

clientsRouter.get("/clients", (_req, res) => {
  const rows = db.prepare(`SELECT ${selectFields} FROM clients ORDER BY code ASC`).all();
  res.json({ clients: rows });
});

clientsRouter.post("/clients", requireRole("admin", "operador"), (req, res) => {
  const parsed = ClientCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: "Invalid body", details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const stmt = db.prepare(
    "INSERT INTO clients (code, name, name2, phone, phone2, email, email2, address, address2, city, city2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  try {
    const info = stmt.run(
      d.code,
      d.name,
      d.name2 ?? null,
      d.phone ?? null,
      d.phone2 ?? null,
      d.email ?? null,
      d.email2 ?? null,
      d.address ?? null,
      d.address2 ?? null,
      d.city ?? null,
      d.city2 ?? null
    );
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

clientsRouter.put("/clients/:id", requireRole("admin", "operador"), (req, res) => {
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
  if (d.name2 !== undefined) {
    updates.push("name2 = ?");
    values.push(d.name2);
  }
  if (d.phone !== undefined) {
    updates.push("phone = ?");
    values.push(d.phone);
  }
  if (d.phone2 !== undefined) {
    updates.push("phone2 = ?");
    values.push(d.phone2);
  }
  if (d.email !== undefined) {
    updates.push("email = ?");
    values.push(d.email);
  }
  if (d.email2 !== undefined) {
    updates.push("email2 = ?");
    values.push(d.email2);
  }
  if (d.address !== undefined) {
    updates.push("address = ?");
    values.push(d.address);
  }
  if (d.address2 !== undefined) {
    updates.push("address2 = ?");
    values.push(d.address2);
  }
  if (d.city !== undefined) {
    updates.push("city = ?");
    values.push(d.city);
  }
  if (d.city2 !== undefined) {
    updates.push("city2 = ?");
    values.push(d.city2);
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

clientsRouter.delete("/clients-all", requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM clients").run();
  res.status(204).send();
});

clientsRouter.delete("/clients/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "Invalid id" } });
  }
  const existing = db.prepare("SELECT id FROM clients WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: { message: "Cliente no encontrado" } });
  }
  db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  res.status(204).send();
});
