import { db } from "../db.js";

export type TiendaClientPhones = {
  /** `clients.phone` (celular / WhatsApp en registro). */
  celular?: string;
  /** `clients.phone2` (teléfono fijo opcional). */
  telefono?: string;
};

/** Datos de contacto del cliente tienda ligado al usuario (`clients.user_id`). */
export async function getTiendaPhonesForUserId(userId: number): Promise<TiendaClientPhones> {
  try {
    const row = (await db
      .prepare("SELECT phone, phone2 FROM clients WHERE user_id = ? ORDER BY id DESC LIMIT 1")
      .get(userId)) as { phone: string | null; phone2: string | null } | undefined;
    const celular = row?.phone?.trim() || undefined;
    const telefono = row?.phone2?.trim() || undefined;
    return { celular, telefono };
  } catch {
    return {};
  }
}
