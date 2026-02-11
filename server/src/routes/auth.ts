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

const ADMIN_EMAIL = "jv@hashrate.space";
const ADMIN_PASSWORD = "admin123";

/** Asegurar que el administrador jv@hashrate.space exista (crear si no existe) */
function ensureDefaultUser(): void {
  let exists = false;
  try {
    const byUser = db.prepare("SELECT id FROM users WHERE username = ?").get(ADMIN_EMAIL);
    if (byUser) {
      exists = true;
    } else {
      try {
        const byEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
        exists = !!byEmail;
      } catch {
        // columna email no existe
      }
    }
  } catch {
    // ignore
  }
  if (!exists) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    try {
      db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)").run(ADMIN_EMAIL, ADMIN_EMAIL, hash, "admin");
    } catch {
      db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(ADMIN_EMAIL, hash, "admin");
    }
  }
  try {
    db.prepare("UPDATE users SET email = username WHERE email IS NULL OR email = ''").run();
  } catch {
    // columna email puede no existir en BD muy antigua
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
    return res.json({ token, user });
  } catch (e) {
    console.error("login sign error:", e);
    return res.status(500).json({ error: { message: "Error al generar la sesión." } });
  }
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export { authRouter, ensureDefaultUser };
