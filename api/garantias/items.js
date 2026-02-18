/**
 * Handler dedicado para GET /api/garantias/items.
 * Evita problemas de routing en Vercel cuando el catch-all no matchea bien.
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import { env } from "../../server/dist/config/env.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
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
