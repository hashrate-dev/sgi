/**
 * Handler dedicado para GET, POST, DELETE /api/equipos (Root Directory = client).
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import { env } from "../../server/dist/config/env.js";

const CAN_EDIT_ROLES = ["admin_a", "admin_b", "operador"];
const ADMIN_ROLES = ["admin_a", "admin_b"];

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
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
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

    if (req.method === "GET") {
      const rows = await db
        .prepare(
          `SELECT id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones FROM equipos_asic ORDER BY numero_serie ASC, marca_equipo ASC`
        )
        .all();
      const items = (rows || []).map((r) => ({
        id: r.id,
        numeroSerie: r.numero_serie ?? undefined,
        fechaIngreso: r.fecha_ingreso,
        marcaEquipo: r.marca_equipo,
        modelo: r.modelo,
        procesador: r.procesador,
        precioUSD: r.precio_usd ?? 0,
        observaciones: r.observaciones ?? undefined,
      }));
      res.status(200).end(JSON.stringify({ items }));
      return;
    }

    if (req.method === "DELETE") {
      if (!ADMIN_ROLES.includes(row.role)) {
        res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para eliminar todos" } }));
        return;
      }
      await db.prepare("DELETE FROM equipos_asic").run();
      res.status(200).end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST") {
      if (!CAN_EDIT_ROLES.includes(row.role)) {
        res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para crear equipos" } }));
        return;
      }
      const body = parseBody(req);
      const { fechaIngreso, marcaEquipo, modelo, procesador, precioUSD = 0, observaciones } = body;
      if (!fechaIngreso || !marcaEquipo?.trim() || !modelo?.trim() || !procesador?.trim()) {
        res.status(400).end(JSON.stringify({ error: { message: "Faltan campos: fechaIngreso, marcaEquipo, modelo, procesador" } }));
        return;
      }
      const id = `equipo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const used = new Set(
        (await db.prepare("SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL").all()).map((r) => r.numero_serie)
      );
      let n = 1;
      while (used.has(`M${String(n).padStart(3, "0")}`)) n++;
      const numeroSerie = `M${String(n).padStart(3, "0")}`;
      await db
        .prepare(
          `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, numeroSerie, fechaIngreso, marcaEquipo.trim(), modelo.trim(), procesador.trim(), Math.max(0, Number(precioUSD) || 0), observaciones ?? null);
      res.status(201).end(JSON.stringify({ ok: true, id, numeroSerie }));
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
