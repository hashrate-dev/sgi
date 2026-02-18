/**
 * Handler dedicado para GET y POST /api/garantias/items.
 * Evita problemas de routing en Vercel cuando el catch-all no matchea bien.
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import { env } from "../../server/dist/config/env.js";

const CAN_POST_ROLES = ["admin_a", "admin_b", "operador"];

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).end(JSON.stringify({ error: { message: "Método no permitido" } }));
    return;
  }

  const authHeader = req.headers?.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).end(JSON.stringify({ error: { message: "Token requerido" } }));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const userId = payload?.userId;
    if (!userId) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido" } }));
      return;
    }

    await initDb();
    const db = getDb();
    const row = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
    if (!row) {
      res.status(401).end(JSON.stringify({ error: { message: "Usuario no encontrado" } }));
      return;
    }

    if (req.method === "POST") {
      if (!CAN_POST_ROLES.includes(row.role)) {
        res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para crear ítems" } }));
        return;
      }
      const body = parseBody(req);
      const { id, codigo, marca, modelo, fechaIngreso, observaciones } = body;
      if (!id || !codigo || !marca || !modelo || !fechaIngreso) {
        res.status(400).end(JSON.stringify({ error: { message: "Faltan campos requeridos: id, codigo, marca, modelo, fechaIngreso" } }));
        return;
      }
      try {
        await db
          .prepare(
            `INSERT INTO items_garantia_ande (id, codigo, marca, modelo, fecha_ingreso, observaciones)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, codigo, marca, modelo, fechaIngreso, observaciones ?? null);
        res.status(201).end(JSON.stringify({ ok: true }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE constraint") || msg.includes("23505")) {
          res.status(409).end(JSON.stringify({ error: { message: "Ya existe un ítem con ese id" } }));
          return;
        }
        res.status(500).end(JSON.stringify({ error: { message: `Error al crear: ${msg}` } }));
        return;
      }
      return;
    }

    const rows = await db
      .prepare(
        `SELECT id, codigo, marca, modelo, fecha_ingreso, observaciones FROM items_garantia_ande ORDER BY codigo`
      )
      .all();

    const items = (rows || []).map((r) => ({
      id: r.id,
      codigo: r.codigo,
      marca: r.marca,
      modelo: r.modelo,
      fechaIngreso: r.fecha_ingreso,
      observaciones: r.observaciones ?? undefined,
    }));

    res.status(200).end(JSON.stringify({ items }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("jwt") || msg.includes("expired") || msg.includes("invalid")) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido o expirado" } }));
      return;
    }
    if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("items_garantia_ande")) {
      res.status(500).end(
        JSON.stringify({
          error: {
            message:
              "La tabla items_garantia_ande no existe en Supabase. Ejecutá el schema en SQL Editor (server/src/db/schema-supabase.sql líneas 98-106).",
          },
        })
      );
      return;
    }
    res.status(500).end(JSON.stringify({ error: { message: msg } }));
  }
}
