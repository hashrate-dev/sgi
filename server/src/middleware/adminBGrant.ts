import type { Request, Response, NextFunction } from "express";
import { adminBHasGrant, type AdminBPermissionKey } from "../lib/adminBPermissions.js";

/** Restricciones para `admin_b` y `operador` según `admin_b_grants_json`. */
export function requireAdminBGrant(permission: AdminBPermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    if (u.role !== "admin_b" && u.role !== "operador") {
      next();
      return;
    }
    if (adminBHasGrant(u.admin_b_grants ?? null, permission)) {
      next();
      return;
    }
    const rolLabel = u.role === "operador" ? "Operador" : "AdministradorB";
    res.status(403).json({
      error: {
        message: `Tu cuenta de ${rolLabel} no tiene este permiso. Pedilo a AdministradorA (Usuarios → Permisos).`,
      },
    });
  };
}
