/**
 * Códigos de cliente tienda online: A90001, A90002, …
 * Secuencia monotónica en `tienda_online_client_seq`: no se reutiliza un número aunque se borre el usuario.
 */

/** Resultado de `prepare(...).run(...)` en SQLite async / Supabase pooler. */
export type TiendaSeqRunResult = { changes: number; lastInsertRowid: number | null };

export type TiendaSeqTx = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => Promise<unknown>;
    run: (...params: unknown[]) => Promise<TiendaSeqRunResult>;
  };
};

/** Misma regla que en el cliente: `WEB-*` (histórico) o `A9` + sólo dígitos. */
export function isTiendaOnlineClientCode(code: string): boolean {
  const c = (code ?? "").trim().toUpperCase();
  return c.startsWith("WEB-") || /^A9\d+$/.test(c);
}

type DbPrepare = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => Promise<unknown>;
    run: (...params: unknown[]) => Promise<TiendaSeqRunResult>;
  };
};

/**
 * Crea fila en `clients` con código A9… si el usuario no tiene ninguna vinculada por `user_id`.
 * Si ya tiene una ficha tienda, actualiza email/usuario para mantener consistencia con `users`.
 */
export async function ensureTiendaOnlineClientForUser(
  tx: TiendaSeqTx,
  opts: { userId: number; email: string; usuario: string | null }
): Promise<void> {
  const emailNorm = opts.email.trim().toLowerCase();
  const usuarioVal = opts.usuario?.trim() || emailNorm;
  const existing = (await tx.prepare("SELECT id, code FROM clients WHERE user_id = ?").get(opts.userId)) as
    | { id: number; code: string }
    | undefined;
  if (existing) {
    if (isTiendaOnlineClientCode(existing.code)) {
      await tx.prepare("UPDATE clients SET email = ?, usuario = ? WHERE id = ?").run(emailNorm, usuarioVal, existing.id);
    }
    return;
  }
  const code = await allocateNextTiendaOnlineClientCode(tx);
  await tx
    .prepare(
      `INSERT INTO clients (code, name, name2, phone, phone2, email, email2, address, address2, city, city2, usuario, documento_identidad, country, user_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL, ?, ?, ?, ?)`
    )
    .run(code, "Cliente", "", "", null, emailNorm, "—", "—", usuarioVal, "—", "—", opts.userId);
}

/** Quita la ficha tienda (A9… / WEB-) asociada al usuario si pasa a otro rol. */
export async function removeTiendaOnlineClientForUser(dbLike: DbPrepare, userId: number): Promise<void> {
  const row = (await dbLike.prepare("SELECT id, code FROM clients WHERE user_id = ?").get(userId)) as
    | { id: number; code: string }
    | undefined;
  if (row && isTiendaOnlineClientCode(row.code)) {
    await dbLike.prepare("DELETE FROM clients WHERE id = ?").run(row.id);
  }
}

/** Primer número asignado será 90001 → código `A90001`. */
const SEQ_INITIAL_NEXT = 90001;

/**
 * Dentro de una transacción: lee el próximo número, reserva el siguiente y devuelve el código `A{num}`.
 */
export async function allocateNextTiendaOnlineClientCode(tx: TiendaSeqTx): Promise<string> {
  await tx
    .prepare(
      "INSERT INTO tienda_online_client_seq (id, next_code_num) VALUES (1, ?) ON CONFLICT (id) DO NOTHING"
    )
    .run(SEQ_INITIAL_NEXT);

  const row = (await tx.prepare("SELECT next_code_num FROM tienda_online_client_seq WHERE id = 1").get()) as
    | { next_code_num: number }
    | undefined;

  if (row == null || typeof row.next_code_num !== "number" || !Number.isFinite(row.next_code_num)) {
    throw new Error("tienda_online_client_seq no inicializada o corrupta");
  }

  const num = row.next_code_num;
  await tx.prepare("UPDATE tienda_online_client_seq SET next_code_num = next_code_num + 1 WHERE id = 1").run();
  return `A${num}`;
}
