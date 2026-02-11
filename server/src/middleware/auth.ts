import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../db.js";

export type UserRole = "admin" | "operador" | "lector";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
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
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; userId: number };
    const row = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(payload.userId) as
      | { id: number; username: string; email: string | null; role: string }
      | undefined;
    if (!row) {
      res.status(401).json({ error: { message: "Usuario no encontrado" } });
      return;
    }
    req.user = { id: row.id, username: row.username, email: row.email ?? row.username, role: row.role as UserRole };
    next();
  } catch {
    res.status(401).json({ error: { message: "Token inválido o expirado" } });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    if (roles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: { message: "Sin permiso para esta acción" } });
  };
}
