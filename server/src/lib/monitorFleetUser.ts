import { db } from "../db.js";

let cached: { at: number; id: number } | null = null;

/** Un solo usuario de la base para el archivo del monitor. Lo ven Administrador A y Administrador B. */
export async function monitorFleetUserId(fallback = 0): Promise<number> {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000 && cached.id > 0) return cached.id;
  const row = (await db
    .prepare(
      `SELECT id FROM users WHERE role IN ('admin_a', 'admin_b')
       ORDER BY CASE role WHEN 'admin_a' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`
    )
    .get()) as { id?: unknown } | undefined;
  const id = Number(row?.id);
  const chosen = Number.isFinite(id) && id > 0 ? id : fallback;
  if (chosen > 0) cached = { at: Date.now(), id: chosen };
  return chosen;
}
