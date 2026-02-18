/**
 * Handler dedicado para DELETE y PUT /api/users/:id (Root Directory = client).
 * Incluye PUT /api/users/me para cambiar contraseña propia.
 */
import { initDb, getDb } from "../../server/dist/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../../server/dist/config/env.js";

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
  if (req.method !== "DELETE" && req.method !== "PUT") {
    res.status(405).end(JSON.stringify({ error: { message: "Método no permitido" } }));
    return;
  }

  const authHeader = req.headers?.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).end(JSON.stringify({ error: { message: "Token requerido" } }));
    return;
  }

  const idParam = (req.query?.id ?? "").trim();
  if (!idParam) {
    res.status(400).end(JSON.stringify({ error: { message: "ID requerido" } }));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const currentUserId = payload?.userId;
    if (!currentUserId) {
      res.status(401).end(JSON.stringify({ error: { message: "Token inválido" } }));
      return;
    }

    await initDb();
    const db = getDb();
    const currentUser = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(currentUserId);
    if (!currentUser) {
      res.status(401).end(JSON.stringify({ error: { message: "Usuario no encontrado" } }));
      return;
    }

    if (req.method === "DELETE") {
      if (!ADMIN_ROLES.includes(currentUser.role)) {
        res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para eliminar usuarios" } }));
        return;
      }
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        res.status(400).end(JSON.stringify({ error: { message: "ID inválido" } }));
        return;
      }
      if (currentUserId === id) {
        res.status(400).end(JSON.stringify({ error: { message: "No puede eliminarse a sí mismo" } }));
        return;
      }
      const target = await db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
      if (!target) {
        res.status(404).end(JSON.stringify({ error: { message: "Usuario no encontrado" } }));
        return;
      }
      if ((target.role === "admin_a" || target.role === "admin_b") && currentUser.role !== "admin_a") {
        res.status(403).end(JSON.stringify({ error: { message: "Solo AdministradorA puede eliminar cuentas de administrador" } }));
        return;
      }
      await db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.status(204).end();
      return;
    }

    if (req.method === "PUT") {
      const body = parseBody(req);

      if (idParam === "me") {
        const password = body.password;
        if (!password || typeof password !== "string" || password.length < 6 || password.length > 100) {
          res.status(400).end(JSON.stringify({ error: { message: "La contraseña debe tener entre 6 y 100 caracteres" } }));
          return;
        }
        const hash = bcrypt.hashSync(password, 10);
        await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, currentUserId);
        const row = await db.prepare("SELECT id, username, email, role, created_at FROM users WHERE id = ?").get(currentUserId);
        res.status(200).end(JSON.stringify({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at } }));
        return;
      }

      if (!ADMIN_ROLES.includes(currentUser.role)) {
        res.status(403).end(JSON.stringify({ error: { message: "Sin permiso para editar usuarios" } }));
        return;
      }
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        res.status(400).end(JSON.stringify({ error: { message: "ID inválido" } }));
        return;
      }
      const existing = await db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(id);
      if (!existing) {
        res.status(404).end(JSON.stringify({ error: { message: "Usuario no encontrado" } }));
        return;
      }
      const updates = [];
      const values = [];
      if (body.email !== undefined) {
        const emailNorm = String(body.email).trim().toLowerCase();
        if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
          res.status(400).end(JSON.stringify({ error: { message: "Email inválido" } }));
          return;
        }
        updates.push("email = ?", "username = ?");
        values.push(emailNorm, emailNorm);
      }
      if (body.password !== undefined) {
        const pwd = String(body.password);
        if (pwd.length < 6 || pwd.length > 100) {
          res.status(400).end(JSON.stringify({ error: { message: "La contraseña debe tener entre 6 y 100 caracteres" } }));
          return;
        }
        updates.push("password_hash = ?");
        values.push(bcrypt.hashSync(pwd, 10));
      }
      if (body.role !== undefined) {
        const validRoles = ["admin_a", "admin_b", "operador", "lector"];
        if (!validRoles.includes(body.role)) {
          res.status(400).end(JSON.stringify({ error: { message: "Rol inválido" } }));
          return;
        }
        if (body.role === "admin_a" && currentUser.role !== "admin_a") {
          res.status(403).end(JSON.stringify({ error: { message: "Solo AdministradorA puede asignar el rol AdministradorA" } }));
          return;
        }
        if (currentUserId === id && (existing.role === "admin_a" || existing.role === "admin_b") && !["admin_a", "admin_b"].includes(body.role)) {
          res.status(400).end(JSON.stringify({ error: { message: "No puede quitarse su propio rol de administrador" } }));
          return;
        }
        updates.push("role = ?");
        values.push(body.role);
      }
      if (updates.length === 0) {
        const row = await db.prepare("SELECT id, username, email, role, created_at FROM users WHERE id = ?").get(id);
        res.status(200).end(JSON.stringify({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at } }));
        return;
      }
      values.push(id);
      await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      const row = await db.prepare("SELECT id, username, email, role, created_at FROM users WHERE id = ?").get(id);
      res.status(200).end(JSON.stringify({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at } }));
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
