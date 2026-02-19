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

async function loadDb() {
  if (env.SUPABASE_DATABASE_URL) {
    try {
      const { db, pool } = await import("./supabase-pg.js");
      await Promise.race([
        (async () => {
          await runSupabaseSchema(pool);
          await pool.query("SELECT 1");
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))
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
