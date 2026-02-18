/**
 * Handler dedicado para GET /api/users/activity (Root Directory = client).
 * Evita problemas de routing en Vercel cuando el catch-all no matchea bien.
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import { env } from "../../server/dist/config/env.js";

const ADMIN_ROLES = ["admin_a", "admin_b"];

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
    const row = await db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(userId);
    if (!row) {
      res.status(401).end(JSON.stringify({ error: { message: "Usuario no encontrado" } }));
      return;
    }

    const role = row.role;
    if (!ADMIN_ROLES.includes(role)) {
      res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para ver actividad" } }));
      return;
    }

    const raw = req.url ?? "";
    const limitParam = raw.includes("?")
      ? new URL(raw.startsWith("http") ? raw : "http://x" + (raw.startsWith("/") ? raw : "/" + raw)).searchParams.get("limit")
      : null;
    const limit = Math.min(Math.max(1, Number(limitParam) || 100), 500);

    const rows = await db
      .prepare(
        `SELECT a.id, a.user_id, a.event, a.created_at, a.ip_address, a.user_agent, a.duration_seconds,
                u.email, u.username
         FROM user_activity a
         JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT ?`
      )
      .all(limit);

    const activity = (rows || []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_email: r.email ?? r.username,
      event: r.event,
      created_at: r.created_at,
      ip_address: r.ip_address ?? undefined,
      user_agent: r.user_agent ?? undefined,
      duration_seconds: r.duration_seconds ?? undefined
    }));

    res.status(200).end(JSON.stringify({ activity }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("jwt") || msg.includes("expired") || msg.includes("invalid")) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido o expirado" } }));
      return;
    }
    res.status(500).end(JSON.stringify({ error: { message: msg } }));
  }
}
