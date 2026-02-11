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
  role TEXT NOT NULL CHECK (role IN ('admin', 'operador', 'lector')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

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
