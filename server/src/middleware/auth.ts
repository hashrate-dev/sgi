import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getAuthTokenFromRequest } from "../lib/authSessionCookie.js";
import { getTiendaPhonesForUserId } from "../lib/tiendaClientContact.js";
import { parseAdminBGrantsJson } from "../lib/adminBPermissions.js";
import { parseLectorGrantsJson } from "../lib/lectorPermissions.js";
import { fetchUserRowForSessionById } from "../lib/dbUserColumnFallback.js";

export type UserRole = "admin_a" | "admin_b" | "operador" | "lector" | "cliente";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  usuario?: string;
  /**
   * Lista blanca de módulos para `admin_b`.
   * `null`/`undefined`: sin restricción explícita (acceso completo heredado).
   */
  admin_b_grants?: string[] | null;
  /** Lista blanca de módulos consultables para `lector`. `null`/`undefined`: acceso API amplio histórico. */
  lector_grants?: string[] | null;
  /** Celular del registro tienda (`clients.phone`). */
  celular?: string;
  /** Teléfono fijo opcional del registro (`clients.phone2`). */
  telefono?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: { message: "Token requerido" } });
    return;
  }
  (async () => {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; userId: number };
      const rowRaw = await fetchUserRowForSessionById(payload.userId);
      const row = rowRaw as
        | {
            id: number;
            username: string;
            email: string | null;
            role: string;
            usuario?: string | null;
            admin_b_grants_json?: string | null;
            lector_grants_json?: string | null;
          }
        | undefined;
      if (!row) {
        res.status(401).json({ error: { message: "Usuario no encontrado" } });
        return;
      }
      const { celular, telefono } = await getTiendaPhonesForUserId(row.id);
      const role = row.role as UserRole;
      const adminGrantsParsed = parseAdminBGrantsJson(row.admin_b_grants_json ?? null);
      const lectorGrantsParsed = parseLectorGrantsJson(row.lector_grants_json ?? null);
      req.user = {
        id: row.id,
        username: row.username,
        email: row.email ?? row.username,
        role,
        usuario: row.usuario ?? undefined,
        ...(role === "admin_b" ? { admin_b_grants: adminGrantsParsed } : {}),
        ...(role === "lector" ? { lector_grants: lectorGrantsParsed } : {}),
        celular,
        telefono,
      };
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
