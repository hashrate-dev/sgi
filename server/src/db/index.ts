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
          await ensureSupabaseInvoiceMarginColumn(pool);
          await ensureSupabaseHostingMarginSettings(pool);
          await ensureSupabaseHostingBillingServices(pool);
          await ensureSupabaseMarketplacePresenceCity(pool);
          await ensureSupabaseHostingBillingAgent(pool);
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

async function ensureSupabaseInvoiceMarginColumn(pool: Pool) {
  try {
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS margin_usd REAL`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseInvoiceMarginColumn:", msg);
  }
}

async function ensureSupabaseMarketplacePresenceCity(pool: Pool) {
  try {
    await pool.query(`ALTER TABLE marketplace_presence ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE marketplace_presence_history ADD COLUMN IF NOT EXISTS city TEXT`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseMarketplacePresenceCity:", msg);
  }
}

async function ensureSupabaseHostingBillingAgent(pool: Pool) {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      usd_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 0.078,
      due_date_days INTEGER NOT NULL DEFAULT 6,
      include_4pct INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT ''
    )`);
    await pool.query(`INSERT INTO hosting_billing_agent_settings (id, usd_per_kwh, due_date_days, include_4pct, updated_at)
      VALUES (1, 0.078, 6, 1, '')
      ON CONFLICT (id) DO NOTHING`);
    await pool.query(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_clients (
      client_id INTEGER PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 1,
      usd_per_kwh DOUBLE PRECISION,
      notes TEXT NOT NULL DEFAULT '',
      include_4pct INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    )`);
    await pool.query(
      `ALTER TABLE hosting_billing_agent_clients ADD COLUMN IF NOT EXISTS include_4pct INTEGER NOT NULL DEFAULT 0`
    );
    await pool.query(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_units (
      id BIGSERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      service_key TEXT NOT NULL DEFAULT 'A',
      service_name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      watts DOUBLE PRECISION NOT NULL DEFAULT 0,
      discount DOUBLE PRECISION NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      garantia_id INTEGER
    )`);
    await pool.query(`ALTER TABLE hosting_billing_agent_units ADD COLUMN IF NOT EXISTS garantia_id INTEGER`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hba_units_client ON hosting_billing_agent_units(client_id, sort_order, id)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_drafts (
      id BIGSERIAL PRIMARY KEY,
      service_month TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      client_name TEXT NOT NULL DEFAULT '',
      days_in_month INTEGER NOT NULL DEFAULT 30,
      usd_per_kwh DOUBLE PRECISION NOT NULL DEFAULT 0.078,
      status TEXT NOT NULL DEFAULT 'draft',
      warning TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '[]',
      subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
      discounts DOUBLE PRECISION NOT NULL DEFAULT 0,
      total DOUBLE PRECISION NOT NULL DEFAULT 0,
      invoice_id INTEGER,
      invoice_number TEXT,
      authorized_at TEXT,
      authorized_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      UNIQUE (client_id, service_month)
    )`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseHostingBillingAgent:", msg);
  }
}

async function ensureSupabaseHostingBillingServices(pool: Pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosting_billing_services (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(18, 4) NOT NULL DEFAULT 0,
        builtin SMALLINT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ''
      )
    `);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseHostingBillingServices:", msg);
  }
}

async function ensureSupabaseHostingMarginSettings(pool: Pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hosting_margin_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        supplier_numbers_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT ''
      )
    `);
    await pool.query(`
      INSERT INTO hosting_margin_settings (id, supplier_numbers_json, updated_at, updated_by)
      VALUES (1, '["P002","P003"]', '', '')
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] ensureSupabaseHostingMarginSettings:", msg);
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
  try {
    const { migrateAsicInvoiceSource } = await import("../lib/migrateAsicInvoiceSource.js");
    await migrateAsicInvoiceSource();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn("[DB] migrateAsicInvoiceSource:", msg);
  }
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
