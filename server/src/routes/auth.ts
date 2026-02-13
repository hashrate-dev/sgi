import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthUser } from "../middleware/auth.js";

const authRouter = Router();
const JWT_SECRET = env.JWT_SECRET;
const LoginSchema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1) });

const DEFAULT_USERS: Array<{ email: string; password: string; role: "admin_a" | "admin_b" | "operador" | "lector" }> = [
  { email: "jv@hashrate.space", password: "admin123", role: "admin_a" },
  { email: "fb@hashrate.space", password: "123456", role: "admin_b" },
];

/** Asegurar que los usuarios por defecto existan (crear si no existen). Contraseñas fijas en código: jv@hashrate.space = admin123, fb@hashrate.space = 123456. Luego: Operador y Lector pueden cambiar su propia contraseña desde Inicio > Cambiar contraseña; cualquier Administrador (A o B) puede cambiar la contraseña de Operador, Lector o de otro admin desde Gestión de usuarios. */
function ensureDefaultUser(): void {
  for (const { email, password, role } of DEFAULT_USERS) {
    let existing: { id: number } | undefined;
    try {
      existing = db.prepare("SELECT id FROM users WHERE username = ?").get(email) as { id: number } | undefined;
      if (!existing) {
        try {
          existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
        } catch {
          /* columna email no existe */
        }
      }
    } catch {
      /* ignore */
    }
    const hash = bcrypt.hashSync(password, 10);
    if (!existing) {
      try {
        db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)").run(email, email, hash, role);
      } catch {
        db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(email, hash, role);
      }
    } else if (email === "jv@hashrate.space" || email === "fb@hashrate.space") {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, existing.id);
    }
  }
  try {
    db.prepare("UPDATE users SET email = username WHERE email IS NULL OR email = ''").run();
  } catch {
    /* columna email puede no existir en BD muy antigua */
  }
}

authRouter.post("/auth/login", (req, res) => {
  try {
    ensureDefaultUser();
  } catch (e) {
    console.error("ensureDefaultUser:", e);
    return res.status(500).json({ error: { message: "Error al inicializar sesión. Revisá que la base de datos esté accesible." } });
  }
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Usuario y contraseña requeridos" } });
  }
  const { username, password } = parsed.data;
  const loginName = username.trim();
  let row: { id: number; username: string; email?: string | null; password_hash: string; role: string } | undefined;
  try {
    row = db.prepare("SELECT id, username, email, password_hash, role FROM users WHERE username = ? OR email = ?").get(loginName, loginName) as typeof row;
  } catch (e) {
    try {
      row = db.prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?").get(loginName) as typeof row;
    } catch (e2) {
      console.error("login db error:", e2);
      return res.status(500).json({ error: { message: "Error al consultar usuario. Revisá la base de datos." } });
    }
  }
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: { message: "Usuario o contraseña incorrectos" } });
  }
  try {
    const user: AuthUser = { id: row.id, username: row.username, email: row.email ?? row.username, role: row.role as AuthUser["role"] };
    const token = jwt.sign({ sub: row.username, userId: row.id }, JWT_SECRET, { expiresIn: "7d" });
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const userAgent = (req.headers["user-agent"] as string) || "";
    try {
      db.prepare("INSERT INTO user_activity (user_id, event, ip_address, user_agent) VALUES (?, 'login', ?, ?)").run(row.id, ip, userAgent);
    } catch (e) {
      console.error("user_activity login insert:", e);
    }
    return res.json({ token, user });
  } catch (e) {
    console.error("login sign error:", e);
    return res.status(500).json({ error: { message: "Error al generar la sesión." } });
  }
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** Verificar contraseña del usuario actual autenticado */
authRouter.post("/auth/verify-password", requireAuth, (req, res) => {
  const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Contraseña requerida" } });
  }
  const userId = req.user!.id;
  let row: { password_hash: string } | undefined;
  try {
    row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as typeof row;
  } catch (e) {
    console.error("verify-password db error:", e);
    return res.status(500).json({ error: { message: "Error al consultar usuario" } });
  }
  if (!row || !bcrypt.compareSync(parsed.data.password, row.password_hash)) {
    return res.status(401).json({ error: { message: "Contraseña incorrecta" } });
  }
  res.json({ valid: true });
});

/** Cerrar sesión (registra evento de salida y tiempo conectado) */
authRouter.post("/auth/logout", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const userAgent = (req.headers["user-agent"] as string) || "";
  try {
    const now = new Date();
    let durationSec: number | null = null;
    const lastLogin = db.prepare(
      "SELECT id, created_at FROM user_activity WHERE user_id = ? AND event = 'login' AND duration_seconds IS NULL ORDER BY created_at DESC LIMIT 1"
    ).get(userId) as { id: number; created_at: string } | undefined;
    if (lastLogin) {
      const loginAt = new Date(lastLogin.created_at).getTime();
      durationSec = Math.round((now.getTime() - loginAt) / 1000);
      db.prepare("UPDATE user_activity SET duration_seconds = ? WHERE id = ?").run(durationSec, lastLogin.id);
    }
    db.prepare(
      "INSERT INTO user_activity (user_id, event, ip_address, user_agent, duration_seconds) VALUES (?, 'logout', ?, ?, ?)"
    ).run(userId, ip, userAgent, durationSec);
  } catch (e) {
    console.error("user_activity logout:", e);
  }
  res.status(204).send();
});

export { authRouter, ensureDefaultUser };
