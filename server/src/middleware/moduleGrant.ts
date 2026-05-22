import type { Request, Response, NextFunction } from "express";
import { adminBHasGrant, type AdminBPermissionKey } from "../lib/adminBPermissions.js";
import { lectorHasGrant } from "../lib/lectorPermissions.js";

/**
 * Lista blanca de módulos para `admin_b` y `lector` sobre rutas compartidas.
 * `admin_a` pasa siempre; `admin_b` y `operador` según lista en `admin_b_grants_json`.
 */
export function requireModuleGrant(permission: AdminBPermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: { message: "No autenticado" } });
      return;
    }
    if (u.role === "admin_b" || u.role === "operador") {
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
      return;
    }
    if (u.role === "lector") {
      if (lectorHasGrant(u.lector_grants ?? null, permission)) {
        next();
        return;
      }
      res.status(403).json({
        error: {
          message:
            "Tu cuenta Lector no tiene acceso a este módulo. Pedilo a AdministradorA (Usuarios → Permisos Lector).",
        },
      });
      return;
    }
    next();
  };
}
