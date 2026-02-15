/**
 * Adaptador PostgreSQL (Supabase) que imita la interfaz de better-sqlite3
 * para poder usar la misma lógica en las rutas con await.
 */
import pg from "pg";
import type { QueryResult } from "pg";
import { env } from "../config/env.js";

const pool = new pg.Pool({
  connectionString: env.SUPABASE_DATABASE_URL ?? undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  // Supabase suele requerir SSL; allow fallback si no tenés certificados
  ssl: env.SUPABASE_DATABASE_URL?.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
});

/** Convierte placeholders ? a $1, $2, ... */
function convertPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => {
    n++;
    return `$${n}`;
  });
}

/** Para INSERT sin RETURNING, añadimos RETURNING id para obtener lastInsertRowId */
function ensureReturningId(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith("INSERT")) return sql;
  if (/RETURNING\s+/i.test(trimmed)) return sql;
  return `${sql} RETURNING id`;
}

export type PgRunResult = { changes: number; lastInsertRowid: number | null };

function createStatement(sql: string) {
  const converted = convertPlaceholders(sql);
  return {
    get: (...params: unknown[]) =>
      pool.query(converted, params).then((r: QueryResult) => r.rows[0] ?? undefined),
    all: (...params: unknown[]) =>
      pool.query(converted, params).then((r: QueryResult) => r.rows),
    run: (...params: unknown[]) => {
      const sqlWithReturn = ensureReturningId(sql);
      const conv = convertPlaceholders(sqlWithReturn);
      return pool.query(conv, params).then((r: QueryResult) => {
        const id = (r.rows[0] as { id?: unknown } | undefined)?.id;
        const n = id != null ? Number(id) : NaN;
        return {
          changes: r.rowCount ?? 0,
          lastInsertRowid: Number.isFinite(n) ? n : null,
        } as PgRunResult;
      });
    },
  };
}

export const db = {
  prepare: (sql: string) => createStatement(sql),
  exec: (_sql: string) => Promise.resolve(), // no-op para migraciones que ya corrieron en Supabase
  transaction: async <T>(fn: (tx: { prepare: (s: string) => ReturnType<typeof createStatement> }) => Promise<T> | T): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txDb = {
        prepare: (sql: string) => ({
          get: (...params: unknown[]) =>
            client.query(convertPlaceholders(sql), params).then((r: QueryResult) => r.rows[0] ?? undefined),
          all: (...params: unknown[]) =>
            client.query(convertPlaceholders(sql), params).then((r: QueryResult) => r.rows),
          run: (...params: unknown[]) => {
            const sqlWithReturn = ensureReturningId(sql);
            return client
              .query(convertPlaceholders(sqlWithReturn), params)
              .then((r: QueryResult) => {
                const id = (r.rows[0] as { id?: unknown } | undefined)?.id;
                const n = id != null ? Number(id) : NaN;
                return { changes: r.rowCount ?? 0, lastInsertRowid: Number.isFinite(n) ? n : null };
              });
          },
        }),
      };
      const result = await Promise.resolve(fn(txDb as never));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
