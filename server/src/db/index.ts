/**
 * Punto de entrada único de la BD: si SUPABASE_DATABASE_URL está definida usa PostgreSQL (Supabase),
 * si no usa SQLite (server/data.db). Tras iniciar el servidor hay que llamar initDb() antes de createApp().
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { env } from "../config/env.js";

let _db: Awaited<ReturnType<typeof loadDb>>;
export let dbType: "supabase" | "sqlite" = "sqlite";

/** En Vercel el pool + DDL del esquema pueden tardar más que en local; 15s provocaba timeout falso. */
const SUPABASE_INIT_TIMEOUT_MS = process.env.VERCEL ? 60_000 : 20_000;

async function loadDb() {
  if (env.SUPABASE_DATABASE_URL) {
    try {
      const { db, pool } = await import("./supabase-pg.js");
      await Promise.race([
        (async () => {
          /* Primero comprobar conexión (credenciales / pooler); luego DDL idempotente. */
          await pool.query("SELECT 1");
          try {
            await runSupabaseSchema(pool);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // eslint-disable-next-line no-console
            console.warn("[DB] runSupabaseSchema con advertencias (se sigue si la BD ya existe):", msg);
          }
          /* Columnas nuevas (p.ej. lector_grants_json): garantizar aunque el split SQL del archivo fallara en algo previo */
          await ensureSupabaseCriticalUserColumns(pool);
          await ensureSupabaseClientsEmailIsNotUnique(pool);
          await pool.query("SELECT 1");
        })(),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`timeout ${SUPABASE_INIT_TIMEOUT_MS}ms conectando a Supabase`)), SUPABASE_INIT_TIMEOUT_MS)
        ),
      ]);
      dbType = "supabase";
      // eslint-disable-next-line no-console
      console.log("[DB] Conectado a Supabase (PostgreSQL) - localhost usa la misma BD que Vercel");
      return db;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (process.env.VERCEL) {
        throw new Error(`Supabase no disponible en Vercel: ${msg}. Verificá SUPABASE_DATABASE_URL en Environment Variables.`);
      }
      // eslint-disable-next-line no-console
      console.warn("[DB] Supabase no disponible:", msg, "- usando SQLite local");
    }
  }
  dbType = "sqlite";
  const { createAsyncSqlite } = await import("./sqlite-async.js");
  // eslint-disable-next-line no-console
  console.log("[DB] Usando SQLite local (data.db) - NO conectado a Supabase. Agregá SUPABASE_DATABASE_URL en server/.env");
  return createAsyncSqlite();
}

async function ensureSupabaseCriticalUserColumns(pool: Pool) {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_b_grants_json TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lector_grants_json TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseCriticalUserColumns:", msg);
  }
}

async function ensureSupabaseClientsEmailIsNotUnique(pool: Pool) {
  try {
    await pool.query(`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_email_key`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] drop clients_email_key constraint:", msg);
  }
  try {
    await pool.query(`DROP INDEX IF EXISTS clients_email_key`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] drop clients_email_key index:", msg);
  }
}

async function runSupabaseSchema(pool: Pool) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(dir, "schema-supabase.sql"); // server/src/db/schema-supabase.sql
  if (!fs.existsSync(schemaPath)) return;
  const sql = fs.readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already exists") && !msg.includes("duplicate")) console.error("Schema statement error:", msg);
    }
  }
}

export async function initDb() {
  _db = await loadDb();
  return _db;
}

export function getDb() {
  if (!_db) throw new Error("DB no inicializada. Llamá initDb() al arrancar el servidor.");
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof getDb>];
  },
});
