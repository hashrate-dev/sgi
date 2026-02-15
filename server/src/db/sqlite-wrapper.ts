import type Database from "better-sqlite3";

type TxLike = {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => Promise<unknown>;
    all: (...params: unknown[]) => Promise<unknown[]>;
    run: (...params: unknown[]) => Promise<{ changes: number; lastInsertRowid: number }>;
  };
};

function makePrepare(sqliteDb: Database.Database) {
  return (sql: string) => {
    const stmt = sqliteDb.prepare(sql);
    return {
      get: (...params: unknown[]) => Promise.resolve(stmt.get(...params)),
      all: (...params: unknown[]) => Promise.resolve(stmt.all(...params) as unknown[]),
      run: (...params: unknown[]) =>
        Promise.resolve(stmt.run(...params) as { changes: number; lastInsertRowid: number }),
    };
  };
}

/**
 * Envuelve el SQLite db para que prepare().get/all/run devuelvan Promises,
 * así las rutas pueden usar await tanto con SQLite como con Supabase.
 */
export function wrapSqlite(sqliteDb: Database.Database): {
  prepare: (sql: string) => ReturnType<ReturnType<typeof makePrepare>>;
  exec: (sql: string) => void;
  transaction: <T>(fn: (tx: TxLike) => T | Promise<T>) => Promise<T>;
} {
  const prepare = makePrepare(sqliteDb);
  return {
    prepare,
    exec: (sql: string) => sqliteDb.exec(sql),
    transaction: (fn) =>
      Promise.resolve(
        sqliteDb.transaction(() => fn({ prepare: makePrepare(sqliteDb) } as TxLike))()
      ),
  };
}
