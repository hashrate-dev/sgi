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
  city2 TEXT,
  usuario TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector', 'cliente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario TEXT
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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  requested_user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_user_created ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_created ON password_reset_tokens(email, created_at DESC);

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

CREATE TABLE IF NOT EXISTS hosting_fx_operations (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  operation_date TEXT NOT NULL,
  operation_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('usdt_to_usd', 'usd_to_usdt')),
  hrs_commission_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  bank_fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  delivery_method TEXT NOT NULL DEFAULT 'usd_to_bank' CHECK (delivery_method IN ('usd_to_bank', 'usdt_to_hrs_binance')),
  client_total_payment DOUBLE PRECISION NOT NULL DEFAULT 0,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency TEXT NOT NULL,
  bank_branch TEXT NOT NULL,
  account_holder_name TEXT NOT NULL DEFAULT '',
  ticket_code TEXT,
  usdt_side TEXT NOT NULL CHECK (usdt_side IN ('buy_usdt', 'sell_usdt')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hosting_fx_op_date ON hosting_fx_operations(operation_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_hosting_fx_client ON hosting_fx_operations(client_id, operation_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_fx_ticket_code_unique ON hosting_fx_operations(ticket_code);
ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS operation_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS bank_fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'usd_to_bank';
ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS account_holder_name TEXT NOT NULL DEFAULT '';
ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS ticket_code TEXT;
CREATE TABLE IF NOT EXISTS hosting_fx_ticket_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num BIGINT NOT NULL
);
INSERT INTO hosting_fx_ticket_seq (id, next_num) VALUES (1, 100)
ON CONFLICT (id) DO NOTHING;

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
  marketplace_equipo_id TEXT,
  fecha_ingreso TEXT NOT NULL,
  observaciones TEXT,
  precio_garantia DOUBLE PRECISION
);

ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS precio_garantia DOUBLE PRECISION;
ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS marketplace_equipo_id TEXT;

CREATE TABLE IF NOT EXISTS items_garantia_ande_precio_historial (
  id BIGSERIAL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items_garantia_ande(id) ON DELETE CASCADE,
  precio_usd DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gar_ande_precio_hist_item ON items_garantia_ande_precio_historial(item_id, recorded_at);

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
  observaciones TEXT,
  mp_visible INTEGER NOT NULL DEFAULT 0,
  mp_algo TEXT,
  mp_hashrate_display TEXT,
  mp_image_src TEXT,
  mp_gallery_json TEXT,
  mp_detail_rows_json TEXT,
  mp_yield_json TEXT,
  mp_sort_order INTEGER NOT NULL DEFAULT 0,
  mp_hashrate_sell_enabled INTEGER NOT NULL DEFAULT 0,
  mp_hashrate_parts_json TEXT,
  precio_historial_json TEXT,
  mp_price_label TEXT
);

ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS precio_historial_json TEXT;

ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_algo TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_hashrate_display TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_image_src TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_gallery_json TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_detail_rows_json TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_yield_json TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_hashrate_sell_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_hashrate_parts_json TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_price_label TEXT;
ALTER TABLE equipos_asic ADD COLUMN IF NOT EXISTS mp_listing_kind TEXT;

-- Auditoría: quién modificó equipos / precios / tienda (visible en Gestión de usuarios)
CREATE TABLE IF NOT EXISTS equipos_asic_audit (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_email TEXT NOT NULL,
  user_usuario TEXT,
  equipo_id TEXT,
  codigo_producto TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_equipos_asic_audit_created ON equipos_asic_audit(created_at DESC);

-- Columnas extra que el app puede agregar si no existen (opcional)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS usuario TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS usuario TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS related_invoice_id INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'hosting';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS related_invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emission_time TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE setups ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS documento_identidad TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT;

CREATE TABLE IF NOT EXISTS marketplace_products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_usd REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cotizaciones marketplace (carrito cliente → monitoreo admin A/B)
CREATE TABLE IF NOT EXISTS marketplace_quote_tickets (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  order_number TEXT UNIQUE,
  ticket_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'pendiente', 'orden_lista', 'enviado_consulta', 'en_contacto_equipo', 'en_gestion', 'pagada', 'en_viaje', 'instalado', 'cerrado', 'descartado')),
  items_json TEXT NOT NULL,
  subtotal_usd REAL NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  unit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_channel TEXT,
  contacted_at TIMESTAMPTZ,
  notes_admin TEXT,
  ip_address TEXT,
  user_agent TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_email TEXT,
  discard_by_email TEXT,
  reactivated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mq_quote_status_updated ON marketplace_quote_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mq_quote_created ON marketplace_quote_tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_presence (
  visitor_id TEXT PRIMARY KEY,
  viewer_type TEXT NOT NULL DEFAULT 'anon' CHECK (viewer_type IN ('anon', 'cliente', 'staff')),
  country_code TEXT,
  country_name TEXT,
  client_ip TEXT,
  user_email TEXT,
  current_path TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_presence_seen ON marketplace_presence(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_presence_history (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  viewer_type TEXT NOT NULL,
  country_code TEXT,
  country_name TEXT,
  client_ip TEXT,
  user_email TEXT,
  current_path TEXT,
  locale TEXT,
  timezone TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_presence_hist_recorded ON marketplace_presence_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_presence_hist_visitor ON marketplace_presence_history(visitor_id, recorded_at DESC);

ALTER TABLE marketplace_presence ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE marketplace_presence ADD COLUMN IF NOT EXISTS country_name TEXT;
ALTER TABLE marketplace_presence ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE marketplace_presence ADD COLUMN IF NOT EXISTS user_email TEXT;

INSERT INTO marketplace_products (name, description, category, price_usd, image_url, stock, sort_order)
SELECT * FROM (
  VALUES
    ('Rack 19" 1U', 'Chasis estándar para montaje en datacenter.', 'Infraestructura', 95::real, NULL::text, 12, 1),
    ('PDU 8 salidas', 'Unidad de distribución de energía para rack.', 'Infraestructura', 120::real, NULL::text, 8, 2),
    ('Cable patch CAT6 2 m', 'Cable de red categoría 6.', 'Cabling', 8.5::real, NULL::text, 100, 3),
    ('Ventilador rack 120 mm', 'Refrigeración auxiliar para gabinete.', 'Cooling', 35::real, NULL::text, 20, 4),
    ('Bandeja fija 1U', 'Bandeja para equipos ligeros en rack.', 'Infraestructura', 45::real, NULL::text, 15, 5),
    ('Filtro de aire rack', 'Repuesto de filtro para entrada de aire.', 'Cooling', 22::real, NULL::text, 40, 6),
    ('Licencia gestión remota (1 año)', 'Acceso remoto seguro a equipos.', 'Software', 299::real, NULL::text, 50, 7),
    ('Kit mantenimiento preventivo', 'Inspección y limpieza programada (referencia).', 'Servicios', 150::real, NULL::text, 999, 8)
) AS t(name, description, category, price_usd, image_url, stock, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM marketplace_products LIMIT 1);

-- Proyectos ya existentes: ampliar rol y columnas de tickets (idempotente si se ejecuta de nuevo)
ALTER TABLE marketplace_quote_tickets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE marketplace_quote_tickets ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE marketplace_quote_tickets ADD COLUMN IF NOT EXISTS discard_by_email TEXT;
ALTER TABLE marketplace_quote_tickets ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;
ALTER TABLE marketplace_quote_tickets ADD COLUMN IF NOT EXISTS items_history_json TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector', 'cliente'));

-- Códigos tienda online A90001+ (secuencia única; no se reutiliza al borrar usuario)
CREATE TABLE IF NOT EXISTS tienda_online_client_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_code_num INTEGER NOT NULL
);
INSERT INTO tienda_online_client_seq (id, next_code_num) VALUES (1, 90001) ON CONFLICT (id) DO NOTHING;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tienda_marketplace_etiqueta TEXT;

-- Config sitio marketplace (p. ej. equipos destacados en home corporativa)
CREATE TABLE IF NOT EXISTS marketplace_site_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO marketplace_site_kv (key, value) VALUES ('corp_best_selling_asic_ids', '[]')
ON CONFLICT (key) DO NOTHING;

INSERT INTO marketplace_site_kv (key, value) VALUES ('corp_interesting_asic_ids', '[]')
ON CONFLICT (key) DO NOTHING;

-- Marketplace tickets: embudo operativo (idempotente en despliegues sucesivos)
ALTER TABLE marketplace_quote_tickets DROP CONSTRAINT IF EXISTS marketplace_quote_tickets_status_check;
UPDATE marketplace_quote_tickets SET status = 'en_contacto_equipo' WHERE status = 'respondido';
UPDATE marketplace_quote_tickets SET status = 'pendiente' WHERE status = 'orden_lista';
ALTER TABLE marketplace_quote_tickets ADD CONSTRAINT marketplace_quote_tickets_status_check CHECK (status IN ('borrador', 'pendiente', 'orden_lista', 'enviado_consulta', 'en_contacto_equipo', 'en_gestion', 'pagada', 'en_viaje', 'instalado', 'cerrado', 'descartado'));
