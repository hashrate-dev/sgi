import { db } from "../db.js";

function looksLikeEmail(s: string): boolean {
  return s.includes("@");
}

/**
 * Tras marcar la orden marketplace como `instalado`, etiqueta la ficha tienda (`clients`) como VENTA
 * para el usuario / email de la orden.
 */
export async function markClientsVentaMarketplaceAfterInstalado(ticketId: number): Promise<void> {
  if (!Number.isFinite(ticketId) || ticketId <= 0) return;
  const row = (await db
    .prepare(
      `SELECT t.user_id, t.contact_email, u.email AS u_email, u.username AS u_username
       FROM marketplace_quote_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = ?`
    )
    .get(ticketId)) as
    | {
        user_id: unknown;
        contact_email: string | null;
        u_email: string | null;
        u_username: string | null;
      }
    | undefined;
  if (!row) return;

  const ce = row.contact_email != null && String(row.contact_email).trim() !== "" ? String(row.contact_email).trim() : null;
  const ujeRaw = row.u_email != null && String(row.u_email).trim() !== "" ? String(row.u_email).trim() : null;
  const uju = row.u_username != null && String(row.u_username).trim() !== "" ? String(row.u_username).trim() : null;
  const uje = ujeRaw ?? (uju && looksLikeEmail(uju) ? uju : null);
  const emailNorm =
    ce && looksLikeEmail(ce)
      ? ce.toLowerCase()
      : uje && looksLikeEmail(uje)
        ? uje.toLowerCase()
        : null;

  const rawUid = row.user_id;
  const uid = rawUid == null || rawUid === "" ? null : Number(rawUid as number | string);
  const hasUid = uid != null && Number.isFinite(uid);

  try {
    if (hasUid) {
      await db.prepare("UPDATE clients SET tienda_marketplace_etiqueta = ? WHERE user_id = ?").run("VENTA", uid);
    } else if (emailNorm) {
      await db
        .prepare("UPDATE clients SET tienda_marketplace_etiqueta = ? WHERE LOWER(TRIM(email)) = ?")
        .run("VENTA", emailNorm);
    }
  } catch (e) {
    console.error("[marketplace-venta] mark clients VENTA failed", e);
  }
}
