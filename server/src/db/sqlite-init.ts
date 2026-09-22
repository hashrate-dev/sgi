import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

export function initSqlite(): Database.Database {
  const sqlitePath = path.isAbsolute(env.SQLITE_PATH)
    ? env.SQLITE_PATH
    : path.join(process.cwd(), env.SQLITE_PATH);
  const db = new Database(sqlitePath);

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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  requested_ip TEXT,
  requested_user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_user_created ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_created ON password_reset_tokens(email, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Factura', 'Recibo', 'Nota de Crédito')),
  last_number INTEGER NOT NULL DEFAULT 1000
);
INSERT OR IGNORE INTO invoice_sequences (type, last_number) VALUES ('Factura', 1000), ('Recibo', 1000), ('Nota de Crédito', 1000);
`);

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

  ["phone", "email", "address", "city", "email2", "name2", "phone2", "address2", "city2", "usuario", "documento_identidad", "country"].forEach((col) => {
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
  try {
    db.exec("ALTER TABLE users ADD COLUMN usuario TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN admin_b_grants_json TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN lector_grants_json TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

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

  db.exec(`
CREATE TABLE IF NOT EXISTS emitted_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('hosting', 'asic')),
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER,
  FOREIGN KEY (emitted_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_source_at ON emitted_documents(source, emitted_at);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS emitted_garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER,
  FOREIGN KEY (emitted_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_garantias_at ON emitted_garantias(emitted_at);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS items_garantia_ande (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  marketplace_equipo_id TEXT,
  fecha_ingreso TEXT NOT NULL,
  observaciones TEXT,
  precio_garantia REAL
);
`);

  try {
    db.exec("ALTER TABLE items_garantia_ande ADD COLUMN precio_garantia REAL");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE items_garantia_ande ADD COLUMN marketplace_equipo_id TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS items_garantia_ande_precio_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  precio_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items_garantia_ande(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gar_ande_precio_hist_item ON items_garantia_ande_precio_historial(item_id, recorded_at);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS marketplace_presence (
  visitor_id TEXT PRIMARY KEY,
  viewer_type TEXT NOT NULL DEFAULT 'anon' CHECK (viewer_type IN ('anon', 'cliente', 'staff')),
  country_code TEXT,
  country_name TEXT,
  client_ip TEXT,
  user_email TEXT,
  current_path TEXT,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marketplace_presence_seen ON marketplace_presence(last_seen_at DESC);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS marketplace_presence_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  viewer_type TEXT NOT NULL,
  country_code TEXT,
  country_name TEXT,
  client_ip TEXT,
  user_email TEXT,
  current_path TEXT,
  locale TEXT,
  timezone TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mp_presence_hist_recorded ON marketplace_presence_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_presence_hist_visitor ON marketplace_presence_history(visitor_id, recorded_at DESC);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS hosting_fx_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  operation_date TEXT NOT NULL,
  operation_amount REAL NOT NULL DEFAULT 0,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('usdt_to_usd', 'usd_to_usdt')),
  hrs_commission_pct REAL NOT NULL DEFAULT 0,
  bank_fee_amount REAL NOT NULL DEFAULT 0,
  delivery_method TEXT NOT NULL DEFAULT 'usd_to_bank' CHECK (delivery_method IN ('usd_to_bank', 'usdt_to_hrs_binance')),
  client_total_payment REAL NOT NULL DEFAULT 0,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency TEXT NOT NULL,
  bank_branch TEXT NOT NULL,
  account_holder_name TEXT NOT NULL DEFAULT '',
  ticket_code TEXT,
  usdt_side TEXT NOT NULL CHECK (usdt_side IN ('buy_usdt', 'sell_usdt')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_hosting_fx_op_date ON hosting_fx_operations(operation_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_hosting_fx_client ON hosting_fx_operations(client_id, operation_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_fx_ticket_code_unique ON hosting_fx_operations(ticket_code);
`);
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN operation_amount REAL NOT NULL DEFAULT 0");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN bank_fee_amount REAL NOT NULL DEFAULT 0");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'usd_to_bank'");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN account_holder_name TEXT NOT NULL DEFAULT ''");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN ticket_code TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE hosting_fx_operations ADD COLUMN compra_flow_hosting_commission INTEGER NOT NULL DEFAULT 0");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_fx_ticket_code_unique ON hosting_fx_operations(ticket_code)");
  db.exec(`CREATE TABLE IF NOT EXISTS hosting_fx_ticket_seq (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_num INTEGER NOT NULL
  )`);
  db.prepare("INSERT OR IGNORE INTO hosting_fx_ticket_seq (id, next_num) VALUES (1, 100)").run();

  db.exec(`
CREATE TABLE IF NOT EXISTS garantias_ande_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  procesador TEXT NOT NULL DEFAULT '',
  numero_serie TEXT NOT NULL DEFAULT '',
  nombre_equipo TEXT NOT NULL DEFAULT '',
  monto_usd REAL NOT NULL DEFAULT 0,
  fecha_inicio TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_garantias_ande_clientes_fecha ON garantias_ande_clientes(fecha_inicio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_garantias_ande_clientes_client ON garantias_ande_clientes(client_id, fecha_inicio DESC);
`);
  try {
    db.exec("ALTER TABLE garantias_ande_clientes ADD COLUMN numero_serie TEXT NOT NULL DEFAULT ''");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE garantias_ande_clientes ADD COLUMN nombre_equipo TEXT NOT NULL DEFAULT ''");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE garantias_ande_clientes ADD COLUMN monto_cliente_usd REAL NOT NULL DEFAULT 0");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS valores_garantias_asic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  procesador TEXT NOT NULL DEFAULT '',
  consumo_w REAL NOT NULL DEFAULT 0,
  monto_usd REAL NOT NULL DEFAULT 0,
  monto_cliente_usd REAL NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_fecha ON valores_garantias_asic(fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_maq ON valores_garantias_asic(marca, modelo, procesador);
CREATE TABLE IF NOT EXISTS valores_garantias_asic_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  valor_id INTEGER NOT NULL,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  procesador TEXT NOT NULL DEFAULT '',
  consumo_w REAL NOT NULL DEFAULT 0,
  monto_usd REAL NOT NULL DEFAULT 0,
  monto_cliente_usd REAL NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (valor_id) REFERENCES valores_garantias_asic(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_valores_garantias_asic_hist_fecha ON valores_garantias_asic_historial(fecha DESC, id DESC);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS sgi_crypto_noticias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL DEFAULT '',
  topics_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_published ON sgi_crypto_noticias(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_fetched ON sgi_crypto_noticias(fetched_at DESC);
`);

  db.exec(`
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'general',
  image_url TEXT NOT NULL DEFAULT '',
  telegram_sent INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sgi_ops_comunicacion_created ON sgi_ops_comunicacion(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_tg (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  chat_id TEXT NOT NULL DEFAULT '',
  extra_chat_ids TEXT NOT NULL DEFAULT '[]',
  bot_token TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO sgi_ops_comunicacion_tg (id, enabled, chat_id, extra_chat_ids) VALUES (1, 0, '', '[]');
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_titulos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL UNIQUE,
  cuerpo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  cuerpo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_cortes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  corte_date TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  start_announced TEXT NOT NULL,
  end_announced TEXT NOT NULL,
  start_actual TEXT NOT NULL,
  end_actual TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  confirmed_by_email TEXT NOT NULL DEFAULT '',
  adjustment_note TEXT NOT NULL DEFAULT '',
  source_message_id INTEGER,
  corte_no INTEGER NOT NULL DEFAULT 0,
  etapa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sgi_ops_com_cortes_date ON sgi_ops_comunicacion_cortes(corte_date DESC, id DESC);
CREATE TABLE IF NOT EXISTS sgi_ops_comunicacion_corte_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_num INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sgi_ops_comunicacion_corte_seq (id, next_num) VALUES (1, 0);
`);
  try {
    db.exec(`ALTER TABLE sgi_ops_comunicacion ADD COLUMN scheduled_at TEXT`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  for (const col of [
    "bot_token TEXT NOT NULL DEFAULT ''",
    "telegram_header TEXT NOT NULL DEFAULT ''",
    "telegram_cierre TEXT NOT NULL DEFAULT ''",
    "categories_json TEXT NOT NULL DEFAULT ''",
  ] as const) {
    try {
      db.exec(`ALTER TABLE sgi_ops_comunicacion_tg ADD COLUMN ${col}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }
  try {
    db.exec(`ALTER TABLE sgi_ops_comunicacion_titulos ADD COLUMN cuerpo TEXT NOT NULL DEFAULT ''`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  for (const col of [
    "title_es TEXT",
    "title_pt TEXT",
    "summary_es TEXT",
    "summary_pt TEXT",
    "image_url TEXT NOT NULL DEFAULT ''",
  ] as const) {
    try {
      db.exec(`ALTER TABLE sgi_crypto_noticias ADD COLUMN ${col}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS sgi_crypto_noticias_medios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '["cripto"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sgi_crypto_noticias_medios_enabled ON sgi_crypto_noticias_medios(enabled, id);
`);

  db.exec(`CREATE TABLE IF NOT EXISTS tienda_online_client_seq (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_code_num INTEGER NOT NULL
  )`);
  db.prepare("INSERT OR IGNORE INTO tienda_online_client_seq (id, next_code_num) VALUES (1, 90001)").run();
  try {
    db.exec("ALTER TABLE clients ADD COLUMN user_id INTEGER");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    db.exec("ALTER TABLE clients ADD COLUMN tienda_marketplace_etiqueta TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS commercial_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  seq_year INTEGER NOT NULL,
  seq_num INTEGER NOT NULL,
  number_suffix TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  po_number TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  incoterms TEXT NOT NULL DEFAULT '',
  origin_country TEXT NOT NULL DEFAULT '',
  destination_country TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  seller_address TEXT NOT NULL DEFAULT '',
  seller_city TEXT NOT NULL DEFAULT '',
  seller_country TEXT NOT NULL DEFAULT '',
  seller_tax_id TEXT NOT NULL DEFAULT '',
  seller_email TEXT NOT NULL DEFAULT '',
  seller_phone TEXT NOT NULL DEFAULT '',
  seller_web TEXT NOT NULL DEFAULT '',
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_address TEXT NOT NULL DEFAULT '',
  buyer_city TEXT NOT NULL DEFAULT '',
  buyer_country TEXT NOT NULL DEFAULT '',
  buyer_tax_id TEXT NOT NULL DEFAULT '',
  buyer_email TEXT NOT NULL DEFAULT '',
  buyer_phone TEXT NOT NULL DEFAULT '',
  goods_status TEXT NOT NULL DEFAULT '',
  shipment_purpose TEXT NOT NULL DEFAULT '',
  goods_origin_country TEXT NOT NULL DEFAULT '',
  show_hashrate_logo INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  bank_details TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  tax_label TEXT NOT NULL DEFAULT '',
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_invoices_year_seq ON commercial_invoices(seq_year, seq_num);
CREATE TABLE IF NOT EXISTS commercial_invoice_seq (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS commercial_invoice_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tax_id TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS commercial_invoice_senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tax_id TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS commercial_invoice_countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

  return db;
}
