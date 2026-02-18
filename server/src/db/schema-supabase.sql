-- Ejecutar una vez en Supabase: SQL Editor → New query → pegar y Run
-- Proyecto: https://supabase.com/dashboard/project/cvzkjjzwnzwbopvsnqwi
-- Si ya tenés tablas: ejecutá solo el bloque garantia_sequences (líneas 82-87) para migrar.

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  name2 TEXT,
  phone2 TEXT,
  email2 TEXT,
  address2 TEXT,
  city2 TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_activity (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  event TEXT NOT NULL CHECK (event IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  duration_seconds REAL
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity(user_id, created_at);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Factura', 'Recibo', 'Nota de Crédito')),
  last_number INTEGER NOT NULL DEFAULT 1000
);
INSERT INTO invoice_sequences (type, last_number) VALUES ('Factura', 1000), ('Recibo', 1000), ('Nota de Crédito', 1000)
ON CONFLICT (type) DO NOTHING;

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discounts REAL NOT NULL,
  total REAL NOT NULL,
  related_invoice_id INTEGER,
  related_invoice_number TEXT,
  payment_date TEXT,
  emission_time TEXT,
  due_date TEXT,
  source TEXT NOT NULL DEFAULT 'hosting' CHECK (source IN ('hosting', 'asic'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  month TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  discount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS emitted_documents (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('hosting', 'asic')),
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_source_at ON emitted_documents(source, emitted_at);

CREATE TABLE IF NOT EXISTS garantia_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Recibo', 'Recibo Devolución')),
  last_number INTEGER NOT NULL DEFAULT 100
);
INSERT INTO garantia_sequences (type, last_number) VALUES ('Recibo', 100), ('Recibo Devolución', 200)
ON CONFLICT (type) DO NOTHING;

CREATE TABLE IF NOT EXISTS emitted_garantias (
  id SERIAL PRIMARY KEY,
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_garantias_at ON emitted_garantias(emitted_at);

CREATE TABLE IF NOT EXISTS items_garantia_ande (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  fecha_ingreso TEXT NOT NULL,
  observaciones TEXT
);

CREATE TABLE IF NOT EXISTS setups (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  precio_usd INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS equipos_asic (
  id TEXT PRIMARY KEY,
  numero_serie TEXT,
  fecha_ingreso TEXT NOT NULL,
  marca_equipo TEXT NOT NULL,
  modelo TEXT NOT NULL,
  procesador TEXT NOT NULL,
  precio_usd INTEGER NOT NULL DEFAULT 0,
  observaciones TEXT
);

-- Columnas extra que el app puede agregar si no existen (opcional)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS related_invoice_id INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'hosting';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS related_invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emission_time TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE setups ADD COLUMN IF NOT EXISTS codigo TEXT;
