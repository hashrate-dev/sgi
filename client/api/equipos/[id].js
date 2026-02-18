/**
 * Handler dedicado para PUT y DELETE /api/equipos/:id (Root Directory = client).
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import { env } from "../../server/dist/config/env.js";

const CAN_EDIT_ROLES = ["admin_a", "admin_b", "operador"];

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
  if (req.method !== "PUT" && req.method !== "DELETE") {
    res.status(405).end(JSON.stringify({ error: { message: "Método no permitido" } }));
    return;
  }

  const authHeader = req.headers?.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).end(JSON.stringify({ error: { message: "Token requerido" } }));
    return;
  }

  const id = (req.query?.id ?? "").trim();
  if (!id) {
    res.status(400).end(JSON.stringify({ error: { message: "ID requerido" } }));
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

    if (!CAN_EDIT_ROLES.includes(row.role)) {
      res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para esta acción" } }));
      return;
    }

    if (req.method === "DELETE") {
      const result = await db.prepare("DELETE FROM equipos_asic WHERE id = ?").run(id);
      if (result.changes === 0) {
        res.status(404).end(JSON.stringify({ error: { message: "Equipo no encontrado" } }));
        return;
      }
      res.status(200).end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "PUT") {
      const body = parseBody(req);
      const { fechaIngreso, marcaEquipo, modelo, procesador, precioUSD = 0, observaciones } = body;
      if (!fechaIngreso || !marcaEquipo?.trim() || !modelo?.trim() || !procesador?.trim()) {
        res.status(400).end(JSON.stringify({ error: { message: "Faltan campos: fechaIngreso, marcaEquipo, modelo, procesador" } }));
        return;
      }
      const result = await db
        .prepare(
          `UPDATE equipos_asic SET fecha_ingreso = ?, marca_equipo = ?, modelo = ?, procesador = ?, precio_usd = ?, observaciones = ? WHERE id = ?`
        )
        .run(fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), Math.max(0, Number(precioUSD) || 0), observaciones ?? null, id);
      if (result.changes === 0) {
        res.status(404).end(JSON.stringify({ error: { message: "Equipo no encontrado" } }));
        return;
      }
      res.status(200).end(JSON.stringify({ ok: true }));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("jwt") || msg.includes("expired") || msg.includes("invalid")) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido o expirado" } }));
      return;
    }
    res.status(500).end(JSON.stringify({ error: { message: msg } }));
  }
}
