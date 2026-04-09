-- Ejecutá este SQL en Supabase: SQL Editor > New query > Pegar y Run
-- Crea todas las tablas necesarias para la app de facturación

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name2 TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT UNIQUE,
  email2 TEXT,
  address TEXT,
  address2 TEXT,
  city TEXT,
  city2 TEXT,
  usuario TEXT
);

-- Secuencias para facturas/recibos/notas de crédito
CREATE TABLE IF NOT EXISTS invoice_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Factura', 'Recibo', 'Nota de Crédito')),
  last_number BIGINT NOT NULL DEFAULT 1000
);
INSERT INTO invoice_sequences (type, last_number) VALUES ('Factura', 1000), ('Recibo', 1000), ('Nota de Crédito', 1000)
ON CONFLICT (type) DO NOTHING;

-- Facturas / Recibos / Notas de crédito (clientName igual que SQLite)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discounts REAL NOT NULL,
  total REAL NOT NULL,
  related_invoice_id BIGINT,
  related_invoice_number TEXT,
  payment_date TEXT,
  emission_time TEXT,
  due_date TEXT
);

-- Ítems de factura
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  month TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  discount REAL NOT NULL
);

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario TEXT
);

-- Actividad de login/logout
CREATE TABLE IF NOT EXISTS user_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  event TEXT NOT NULL CHECK (event IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  duration_seconds REAL
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity(user_id, created_at);

-- Documentos emitidos (hosting / asic)
CREATE TABLE IF NOT EXISTS emitted_documents (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('hosting', 'asic')),
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by BIGINT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_source_at ON emitted_documents(source, emitted_at);

-- Garantías ANDE: recibos emitidos
CREATE TABLE IF NOT EXISTS emitted_garantias (
  id BIGSERIAL PRIMARY KEY,
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by BIGINT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_garantias_at ON emitted_garantias(emitted_at);

-- Garantías ANDE: ítems
CREATE TABLE IF NOT EXISTS items_garantia_ande (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  fecha_ingreso TEXT NOT NULL,
  observaciones TEXT,
  precio_garantia DOUBLE PRECISION
);

ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS precio_garantia DOUBLE PRECISION;

-- Habilitar RLS (opcional): si querés que solo el backend acceda, usá la service_role key y no definas políticas.
-- Por defecto con service_role el backend bypassa RLS.
