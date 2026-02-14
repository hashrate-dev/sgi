import path from "node:path";
import Database from "better-sqlite3";
import { env } from "./config/env.js";

const sqlitePath = path.isAbsolute(env.SQLITE_PATH)
  ? env.SQLITE_PATH
  : path.join(process.cwd(), env.SQLITE_PATH);
export const db = new Database(sqlitePath);

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  clientName TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discounts REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  service TEXT NOT NULL,
  month TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  discount REAL NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('login', 'logout')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  duration_seconds REAL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity(user_id, created_at);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Factura', 'Recibo', 'Nota de Crédito')),
  last_number INTEGER NOT NULL DEFAULT 1000
);
INSERT OR IGNORE INTO invoice_sequences (type, last_number) VALUES ('Factura', 1000), ('Recibo', 1000), ('Nota de Crédito', 1000);
`);

// Migrar roles antiguos admin -> admin_a (jv@hashrate.space) / admin_b (resto)
const hasLegacyAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
if (hasLegacyAdmin) {
  db.exec(`DROP TABLE IF EXISTS users_new;`);
  db.exec(`PRAGMA foreign_keys = OFF;`);
  try {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, username, email, password_hash, role, created_at)
      SELECT id, username, email, password_hash,
        CASE
          WHEN LOWER(TRIM(COALESCE(username, ''))) = 'jv@hashrate.space' OR LOWER(TRIM(COALESCE(email, ''))) = 'jv@hashrate.space' THEN 'admin_a'
          WHEN role = 'admin' THEN 'admin_b'
          ELSE role
        END,
        created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  } finally {
    db.exec(`PRAGMA foreign_keys = ON;`);
  }
}

["phone", "email", "address", "city", "email2", "name2", "phone2", "address2", "city2"].forEach((col) => {
  try {
    db.exec(`ALTER TABLE clients ADD COLUMN ${col} TEXT`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
});

try {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}

// Agregar campos de relación para recibos y notas de crédito
try {
  db.exec("ALTER TABLE invoices ADD COLUMN related_invoice_id INTEGER");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}

try {
  db.exec("ALTER TABLE invoices ADD COLUMN related_invoice_number TEXT");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}

try {
  db.exec("ALTER TABLE invoices ADD COLUMN payment_date TEXT");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}

try {
  db.exec("ALTER TABLE invoices ADD COLUMN emission_time TEXT");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}

try {
  db.exec("ALTER TABLE invoices ADD COLUMN due_date TEXT");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes("duplicate column")) throw e;
}
