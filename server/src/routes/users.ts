import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  ensureTiendaOnlineClientForUser,
  removeTiendaOnlineClientForUser,
  type TiendaSeqTx,
} from "../lib/tiendaOnlineClientCode.js";

type Tx = { prepare: (sql: string) => { run: (...params: unknown[]) => Promise<unknown> } };

function isMissingTableOrColumnMessage(msg: string): boolean {
  return /no such table|no such column|does not exist|unknown column|relation .* does not exist/i.test(msg);
}

/** Quita filas / referencias hacia `users.id` antes del DELETE (evita 500 por FK en SQLite/Postgres). */
async function deleteUserCascade(userId: number): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    await tx.prepare("DELETE FROM user_activity WHERE user_id = ?").run(userId);
    try {
      await tx.prepare("DELETE FROM equipos_asic_audit WHERE user_id = ?").run(userId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    try {
      await tx.prepare("UPDATE emitted_documents SET emitted_by = NULL WHERE emitted_by = ?").run(userId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    try {
      await tx.prepare("UPDATE emitted_garantias SET emitted_by = NULL WHERE emitted_by = ?").run(userId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    try {
      await tx.prepare("UPDATE marketplace_quote_tickets SET user_id = NULL WHERE user_id = ?").run(userId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    try {
      await tx.prepare("DELETE FROM clients WHERE user_id = ?").run(userId);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    try {
      await tx.prepare("DELETE FROM clients WHERE code = ?").run(`WEB-${userId}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isMissingTableOrColumnMessage(m)) throw e;
    }
    await tx.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
}

export const usersRouter = Router();

const CreateUserSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  role: z.enum(["admin_a", "admin_b", "operador", "lector", "cliente"]),
  usuario: z.string().max(100).trim().optional()
});

const UpdateUserSchema = z.object({
  email: z.string().email().max(200).optional(),
  password: z.string().min(6).max(100).optional(),
  role: z.enum(["admin_a", "admin_b", "operador", "lector", "cliente"]).optional(),
  usuario: z.string().max(100).trim().optional()
});

const UpdateMyPasswordSchema = z.object({ password: z.string().min(6).max(100) });

/** Listar usuarios (solo admin) - devuelve id, email, role, created_at, usuario (sin password) */
usersRouter.get("/users", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const rows = (await db.prepare("SELECT id, username, email, role, created_at, usuario FROM users ORDER BY created_at DESC").all()) as Array<{
    id: number;
    username: string;
    email: string | null;
    role: string;
    created_at: string;
    usuario: string | null;
  }>;
  const users = rows.map((r) => ({
    id: r.id,
    email: r.email ?? r.username,
    role: r.role,
    created_at: r.created_at,
    usuario: r.usuario ?? undefined
  }));
  res.json({ users });
});

/**
 * Asegura una ficha en `clients` (código A9… / WEB-) por cada usuario con rol `cliente`.
 * Repara datos viejos (usuario cliente sin fila tienda) y alinea correo/usuario.
 */
usersRouter.post("/users/sync-tienda-online-clients", requireAuth, requireRole("admin_a", "admin_b"), async (_req, res) => {
  try {
    const rows = (await db
      .prepare("SELECT id, email, username, usuario FROM users WHERE role = 'cliente'")
      .all()) as Array<{ id: number; email: string | null; username: string; usuario: string | null }>;
    for (const r of rows) {
      const emailNorm = (r.email ?? r.username).trim().toLowerCase();
      await db.transaction(async (tx: TiendaSeqTx) => {
        await ensureTiendaOnlineClientForUser(tx, {
          userId: r.id,
          email: emailNorm,
          usuario: r.usuario?.trim() || null,
        });
      });
    }
    res.json({ ok: true, synced: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[users] sync-tienda-online-clients", e);
    res.status(500).json({ error: { message: env.NODE_ENV === "development" ? msg : "No se pudo sincronizar." } });
  }
});

/** Crear usuario (solo admin) */
usersRouter.post("/users", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const { email, password, role, usuario } = parsed.data;
  if (role === "admin_a" && req.user!.role !== "admin_a") {
    return res.status(403).json({ error: { message: "Solo AdministradorA puede crear cuentas con rol AdministradorA" } });
  }
  const emailNorm = email.trim().toLowerCase();
  const hash = bcrypt.hashSync(password, 10);
  const usuarioVal = usuario?.trim() || null;
  try {
    if (role === "cliente") {
      await db.transaction(async (tx: TiendaSeqTx) => {
        const ins = await tx
          .prepare("INSERT INTO users (username, email, password_hash, role, usuario) VALUES (?, ?, ?, ?, ?)")
          .run(emailNorm, emailNorm, hash, role, usuarioVal);
        let uid = ins.lastInsertRowid as number | null;
        if (uid == null || !Number.isFinite(Number(uid))) {
          const r = (await tx.prepare("SELECT id FROM users WHERE email = ?").get(emailNorm)) as { id: number } | undefined;
          uid = r?.id ?? null;
        }
        if (uid == null || !Number.isFinite(Number(uid))) {
          throw new Error("No se obtuvo el id de usuario tras el alta.");
        }
        await ensureTiendaOnlineClientForUser(tx, { userId: Number(uid), email: emailNorm, usuario: usuarioVal });
      });
    } else {
      await db.prepare("INSERT INTO users (username, email, password_hash, role, usuario) VALUES (?, ?, ?, ?, ?)").run(emailNorm, emailNorm, hash, role, usuarioVal);
    }
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code && String(err.code).includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: { message: "Ya existe un usuario con ese correo" } });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (String(msg).toLowerCase().includes("unique") || String((err as { code?: string })?.code ?? "").includes("23505")) {
      return res.status(409).json({ error: { message: "Ya existe un usuario con ese correo" } });
    }
    throw e;
  }
  const row = (await db.prepare("SELECT id, email, role, created_at, usuario FROM users WHERE email = ?").get(emailNorm)) as { id: number; email: string; role: string; created_at: string; usuario: string | null };
  res.status(201).json({ user: { id: row.id, email: row.email, role: row.role, created_at: row.created_at, usuario: row.usuario ?? undefined } });
});

/** Cambiar mi propia contraseña (Operador, Lector o cualquier admin). Cualquier usuario autenticado puede usar esta ruta. */
usersRouter.put("/users/me", requireAuth, async (req, res) => {
  const parsed = UpdateMyPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "La contraseña debe tener entre 6 y 100 caracteres", details: parsed.error.flatten() } });
  }
  const hash = bcrypt.hashSync(parsed.data.password, 10);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user!.id);
  const row = (await db.prepare("SELECT id, username, email, role, created_at, usuario FROM users WHERE id = ?").get(req.user!.id)) as { id: number; username: string; email: string | null; role: string; created_at: string; usuario: string | null };
  res.json({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at, usuario: row.usuario ?? undefined } });
});

/** Actualizar usuario (solo admin). AdminA y AdminB pueden cambiar contraseña de cualquier usuario (Operador, Lector, o la propia). No puede quitarse su propio rol admin. */
usersRouter.put("/users/:id", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "ID inválido" } });
  }
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos", details: parsed.error.flatten() } });
  }
  const existing = (await db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(id)) as { id: number; email: string; role: string } | undefined;
  if (!existing) {
    return res.status(404).json({ error: { message: "Usuario no encontrado" } });
  }
  if (parsed.data.role === "admin_a" && req.user!.role !== "admin_a") {
    return res.status(403).json({ error: { message: "Solo AdministradorA puede asignar el rol AdministradorA" } });
  }
  /** Cuentas tienda online: el rol Cliente no se puede cambiar por API. */
  if (existing.role === "cliente") {
    if (parsed.data.role !== undefined && parsed.data.role !== "cliente") {
      return res.status(403).json({
        error: { message: "No se puede cambiar el rol de cuentas de la tienda online (siempre Cliente)." },
      });
    }
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  if (parsed.data.email !== undefined) {
    const emailNorm = parsed.data.email.trim().toLowerCase();
    updates.push("email = ?", "username = ?");
    values.push(emailNorm, emailNorm);
  }
  if (parsed.data.password !== undefined) {
    updates.push("password_hash = ?");
    values.push(bcrypt.hashSync(parsed.data.password, 10));
  }
  if (parsed.data.role !== undefined && existing.role !== "cliente") {
    const isAdminRole = (r: string) => r === "admin_a" || r === "admin_b";
    if (req.user!.id === id && isAdminRole(existing.role) && !isAdminRole(parsed.data.role)) {
      return res.status(400).json({ error: { message: "No puede quitarse su propio rol de administrador" } });
    }
    updates.push("role = ?");
    values.push(parsed.data.role);
  }
  if (parsed.data.usuario !== undefined) {
    updates.push("usuario = ?");
    values.push(parsed.data.usuario.trim() || null);
  }
  if (updates.length === 0) {
    const row = (await db.prepare("SELECT id, username, email, role, created_at, usuario FROM users WHERE id = ?").get(id)) as { id: number; username: string; email: string | null; role: string; created_at: string; usuario: string | null };
    return res.json({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at, usuario: row.usuario ?? undefined } });
  }
  values.push(id);
  await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const row = (await db.prepare("SELECT id, username, email, role, created_at, usuario FROM users WHERE id = ?").get(id)) as { id: number; username: string; email: string | null; role: string; created_at: string; usuario: string | null };

  try {
    if (row.role === "cliente") {
      const emailNorm = (row.email ?? row.username).trim().toLowerCase();
      await db.transaction(async (tx: TiendaSeqTx) => {
        await ensureTiendaOnlineClientForUser(tx, {
          userId: id,
          email: emailNorm,
          usuario: row.usuario?.trim() || null,
        });
      });
    } else {
      await removeTiendaOnlineClientForUser(db, id);
    }
  } catch (e) {
    console.error("[users] PUT /users/:id sync tienda client (usuario ya guardado)", id, e);
  }

  res.json({ user: { id: row.id, email: row.email ?? row.username, role: row.role, created_at: row.created_at, usuario: row.usuario ?? undefined } });
});

/** Listar actividad de usuarios (solo admin): entradas/salidas, horarios, tiempo conectado, IP */
usersRouter.get("/users/activity", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 500);
  const rows = (await db
    .prepare(
      `SELECT a.id, a.user_id, a.event, a.created_at, a.ip_address, a.user_agent, a.duration_seconds,
              u.email, u.username
       FROM user_activity a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .all(limit)) as Array<{
    id: number;
    user_id: number;
    event: string;
    created_at: string;
    ip_address: string | null;
    user_agent: string | null;
    duration_seconds: number | null;
    email: string | null;
    username: string;
  }>;
  const activity = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    user_email: r.email ?? r.username,
    event: r.event,
    created_at: r.created_at,
    ip_address: r.ip_address ?? undefined,
    user_agent: r.user_agent ?? undefined,
    duration_seconds: r.duration_seconds ?? undefined
  }));
  res.json({ activity });
});

/**
 * Auditoría de equipos ASIC / tienda online (solo admin): precios, publicación, imágenes, importaciones.
 * Quién (correo + usuario en BD) y qué se modificó.
 */
usersRouter.get("/users/equipos-asic-audit", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
  try {
    const rows = (await db
      .prepare(
        `SELECT a.id, a.created_at, a.user_id, a.user_email, a.user_usuario, a.equipo_id, a.codigo_producto, a.action, a.summary, a.details_json
         FROM equipos_asic_audit a
         ORDER BY a.created_at DESC
         LIMIT ?`
      )
      .all(limit)) as Array<{
      id: number;
      created_at: string;
      user_id: number;
      user_email: string;
      user_usuario: string | null;
      equipo_id: string | null;
      codigo_producto: string | null;
      action: string;
      summary: string;
      details_json: string | null;
    }>;
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        user_id: r.user_id,
        user_email: r.user_email,
        user_usuario: r.user_usuario ?? undefined,
        equipo_id: r.equipo_id ?? undefined,
        codigo_producto: r.codigo_producto ?? undefined,
        action: r.action,
        summary: r.summary,
        details_json: r.details_json ?? undefined,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table") || msg.toLowerCase().includes("equipos_asic_audit")) {
      return res.json({ entries: [] });
    }
    res.status(500).json({ error: { message: msg } });
  }
});

/** Eliminar usuario (solo admin). Solo AdministradorA puede eliminar cuentas con rol AdministradorA o AdministradorB. */
usersRouter.delete("/users/:id", requireAuth, requireRole("admin_a", "admin_b"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { message: "ID inválido" } });
  }
  if (req.user!.id === id) {
    return res.status(400).json({ error: { message: "No puede eliminarse a sí mismo" } });
  }
  const target = (await db.prepare("SELECT id, role FROM users WHERE id = ?").get(id)) as { id: number; role: string } | undefined;
  if (!target) {
    return res.status(404).json({ error: { message: "Usuario no encontrado" } });
  }
  if ((target.role === "admin_a" || target.role === "admin_b") && req.user!.role !== "admin_a") {
    return res.status(403).json({ error: { message: "Solo AdministradorA puede eliminar cuentas de administrador" } });
  }
  try {
    await deleteUserCascade(id);
    res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[users] DELETE /users/:id", id, e);
    return res.status(500).json({
      error: {
        message: env.NODE_ENV === "development" ? msg : "No se pudo eliminar el usuario (posibles datos vinculados). Contactá soporte o revisá el log del servidor.",
      },
    });
  }
});
