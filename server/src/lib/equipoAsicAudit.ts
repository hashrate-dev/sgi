import { db } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

export type EquipoAsicAuditAction =
  | "create"
  | "update"
  | "delete"
  | "bulk_import"
  | "delete_all"
  | "marketplace_image";

/**
 * Registro de cambios en equipos ASIC (precio, tienda / marketplace) para trazabilidad en /usuarios.
 */
export async function logEquipoAsicAudit(params: {
  user: AuthUser;
  equipoId: string | null;
  codigoProducto: string | null;
  action: EquipoAsicAuditAction;
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const detailsJson =
    params.details && Object.keys(params.details).length > 0 ? JSON.stringify(params.details) : null;
  try {
    await db
      .prepare(
        `INSERT INTO equipos_asic_audit (user_id, user_email, user_usuario, equipo_id, codigo_producto, action, summary, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.user.id,
        params.user.email,
        params.user.usuario?.trim() || null,
        params.equipoId,
        params.codigoProducto?.trim() || null,
        params.action,
        params.summary,
        detailsJson
      );
  } catch (e) {
    console.error("[equipos_asic_audit] insert failed", e);
  }
}

export function isAdminABRole(role: string | undefined | null): boolean {
  const r = (role ?? "").toLowerCase().trim();
  return r === "admin_a" || r === "admin_b";
}
