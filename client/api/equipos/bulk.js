/**
 * Handler dedicado para POST /api/equipos/bulk (Root Directory = client).
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
  if (req.method !== "POST") {
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

    if (!CAN_EDIT_ROLES.includes(row.role)) {
      res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para importar equipos" } }));
      return;
    }

    const body = parseBody(req);
    const rows = Array.isArray(body) ? body : (body?.items ?? body?.rows ?? []);
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).end(JSON.stringify({ error: { message: "Se requiere un array de equipos" } }));
      return;
    }

    const used = new Set(
      (await db.prepare("SELECT numero_serie FROM equipos_asic WHERE numero_serie IS NOT NULL").all()).map((r) => r.numero_serie)
    );
    let nextNum = 1;
    let inserted = 0;

    for (const r of rows) {
      const fechaIngreso = r.fechaIngreso ?? r.fecha_ingreso ?? new Date().toISOString().slice(0, 10);
      const marcaEquipo = (r.marcaEquipo ?? r.marca_equipo ?? "").trim();
      const modelo = (r.modelo ?? "").trim();
      const procesador = (r.procesador ?? "").trim();
      const precioUSD = Math.max(0, Number(r.precioUSD ?? r.precio_usd ?? 0) || 0);
      const observaciones = r.observaciones ?? null;
      const fromRow = (r.numeroSerie ?? r.numero_serie ?? "").trim();

      if (!marcaEquipo && !modelo && !procesador) continue;

      inserted++;
      const id = `equipo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let ns;
      if (fromRow && !used.has(fromRow)) {
        ns = fromRow;
        used.add(ns);
      } else {
        while (used.has(`M${String(nextNum).padStart(3, "0")}`)) nextNum++;
        ns = `M${String(nextNum).padStart(3, "0")}`;
        nextNum++;
        used.add(ns);
      }

      await db
        .prepare(
          `INSERT INTO equipos_asic (id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, ns, fechaIngreso, marcaEquipo || "—", modelo || "—", procesador || "—", precioUSD, observaciones);
    }

    res.status(201).end(JSON.stringify({ ok: true, inserted }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("jwt") || msg.includes("expired") || msg.includes("invalid")) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido o expirado" } }));
      return;
    }
    res.status(500).end(JSON.stringify({ error: { message: msg } }));
  }
}
