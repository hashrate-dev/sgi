import type { Request, Response, NextFunction } from "express";
import { adminBHasGrant, type AdminBPermissionKey } from "../lib/adminBPermissions.js";

/** Solo restricciones para rol `admin_b`. `admin_a`, `operador` y `lector` no se ven afectados. */
export function requireAdminBGrant(permission: AdminBPermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    if (u.role !== "admin_b") {
      next();
      return;
    }
    if (adminBHasGrant(u.admin_b_grants ?? null, permission)) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        message:
          "Tu cuenta de AdministradorB no tiene este permiso. Pedilo a AdministradorA (Usuarios → Permisos).",
      },
    });
  };
}
