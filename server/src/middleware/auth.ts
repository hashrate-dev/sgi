import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../db.js";

export type UserRole = "admin_a" | "admin_b" | "operador" | "lector";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  usuario?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: { message: "Token requerido" } });
    return;
  }
  (async () => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; userId: number };
      const row = (await db.prepare("SELECT id, username, email, role, usuario FROM users WHERE id = ?").get(payload.userId)) as
        | { id: number; username: string; email: string | null; role: string; usuario?: string | null }
        | undefined;
      if (!row) {
        res.status(401).json({ error: { message: "Usuario no encontrado" } });
        return;
      }
      req.user = { id: row.id, username: row.username, email: row.email ?? row.username, role: row.role as UserRole, usuario: row.usuario ?? undefined };
      next();
    } catch (e) {
      if (res.headersSent) return;
      res.status(401).json({ error: { message: "Token inválido o expirado" } });
    }
  })();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    const userRole = (req.user.role ?? "").toLowerCase().trim();
    const allowed = roles.some((r) => r.toLowerCase() === userRole);
    if (allowed) {
      next();
      return;
    }
    res.status(403).json({ error: { message: "Sin permiso para esta acción" } });
  };
}
