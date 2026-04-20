/**
 * Wrapper async sobre better-sqlite3 para usar la misma interfaz que supabase-pg (Promises).
 * Así las rutas pueden usar siempre await db.prepare().get() tanto con SQLite como con Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

// data.db: si cwd es la raíz del proyecto -> server/data.db; si cwd es server -> data.db
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sqlitePath = path.isAbsolute(env.SQLITE_PATH)
  ? env.SQLITE_PATH
  : path.basename(process.cwd()) === "server"
    ? path.join(process.cwd(), env.SQLITE_PATH)
    : path.join(process.cwd(), "server", env.SQLITE_PATH);

const sqliteDir = path.dirname(sqlitePath);
if (!fs.existsSync(sqliteDir)) fs.mkdirSync(sqliteDir, { recursive: true });

type RunResult = { changes: number; lastInsertRowid: number | null };

function createStatement(native: Database.Database, sql: string) {
  const stmt = native.prepare(sql);
  return {
    get: (...params: unknown[]) => Promise.resolve(stmt.get(...params) as unknown),
    all: (...params: unknown[]) => Promise.resolve(stmt.all(...params) as unknown[]),
    run: (...params: unknown[]) =>
      Promise.resolve(
        ((): RunResult => {
          const info = stmt.run(...params) as { changes: number; lastInsertRowid: number };
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid ?? null };
        })()
      ),
  };
}

export function createAsyncSqlite() {
  const native = new Database(sqlitePath);

  native.exec(`
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
  role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector', 'cliente')),
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

CREATE TABLE IF NOT EXISTS tienda_online_client_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_code_num INTEGER NOT NULL
);
INSERT OR IGNORE INTO tienda_online_client_seq (id, next_code_num) VALUES (1, 90001);

CREATE TABLE IF NOT EXISTS emitted_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('hosting', 'asic')),
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER,
  FOREIGN KEY (emitted_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_emitted_source_at ON emitted_documents(source, emitted_at);

CREATE TABLE IF NOT EXISTS garantia_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Recibo', 'Recibo Devolución')),
  last_number INTEGER NOT NULL DEFAULT 100
);
INSERT OR IGNORE INTO garantia_sequences (type, last_number) VALUES ('Recibo', 100), ('Recibo Devolución', 200);

CREATE TABLE IF NOT EXISTS emitted_garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_json TEXT NOT NULL,
  emitted_at TEXT NOT NULL,
  emitted_by INTEGER,
  FOREIGN KEY (emitted_by) REFERENCES users(id)
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
  precio_garantia REAL
);

CREATE TABLE IF NOT EXISTS items_garantia_ande_precio_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  precio_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items_garantia_ande(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gar_ande_precio_hist_item ON items_garantia_ande_precio_historial(item_id, recorded_at);

CREATE TABLE IF NOT EXISTS setups (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS marketplace_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_usd REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_quote_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  order_number TEXT UNIQUE,
  ticket_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'pendiente', 'orden_lista', 'enviado_consulta', 'en_contacto_equipo', 'en_gestion', 'pagada', 'en_viaje', 'instalado', 'cerrado', 'descartado')),
  items_json TEXT NOT NULL,
  subtotal_usd REAL NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  unit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_contact_channel TEXT,
  contacted_at TEXT,
  notes_admin TEXT,
  ip_address TEXT,
  user_agent TEXT,
  user_id INTEGER,
  contact_email TEXT,
  discard_by_email TEXT,
  reactivated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
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
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marketplace_presence_seen ON marketplace_presence(last_seen_at DESC);

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

CREATE TABLE IF NOT EXISTS marketplace_site_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO marketplace_site_kv (key, value) VALUES ('corp_best_selling_asic_ids', '[]');
INSERT OR IGNORE INTO marketplace_site_kv (key, value) VALUES ('corp_interesting_asic_ids', '[]');

CREATE TABLE IF NOT EXISTS equipos_asic_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  user_usuario TEXT,
  equipo_id TEXT,
  codigo_producto TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_equipos_asic_audit_created ON equipos_asic_audit(created_at DESC);
`);

  const mpc = native.prepare("SELECT COUNT(*) as c FROM marketplace_products").get() as { c: number } | undefined;
  if (mpc && Number(mpc.c) === 0) {
    const ins = native.prepare(
      "INSERT INTO marketplace_products (name, description, category, price_usd, image_url, stock, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const seeds: Array<[string, string, string, number, string | null, number, number]> = [
      ["Rack 19\" 1U", "Chasis estándar para montaje en datacenter.", "Infraestructura", 95, null, 12, 1],
      ["PDU 8 salidas", "Unidad de distribución de energía para rack.", "Infraestructura", 120, null, 8, 2],
      ["Cable patch CAT6 2 m", "Cable de red categoría 6.", "Cabling", 8.5, null, 100, 3],
      ["Ventilador rack 120 mm", "Refrigeración auxiliar para gabinete.", "Cooling", 35, null, 20, 4],
      ["Bandeja fija 1U", "Bandeja para equipos ligeros en rack.", "Infraestructura", 45, null, 15, 5],
      ["Filtro de aire rack", "Repuesto de filtro para entrada de aire.", "Cooling", 22, null, 40, 6],
      ["Licencia gestión remota (1 año)", "Acceso remoto seguro a equipos.", "Software", 299, null, 50, 7],
      ["Kit mantenimiento preventivo", "Inspección y limpieza programada (referencia).", "Servicios", 150, null, 999, 8],
    ];
    for (const row of seeds) {
      ins.run(row[0], row[1], row[2], row[3], row[4], row[5], row[6]);
    }
  }

  const hasLegacyAdmin = native.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
  if (hasLegacyAdmin) {
    native.exec(`DROP TABLE IF EXISTS users_new;`);
    native.exec(`PRAGMA foreign_keys = OFF;`);
    try {
      native.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector', 'cliente')),
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
      native.exec(`PRAGMA foreign_keys = ON;`);
    }
  }

  ["phone", "email", "address", "city", "email2", "name2", "phone2", "address2", "city2", "usuario", "documento_identidad", "country"].forEach((col) => {
    try {
      native.exec(`ALTER TABLE clients ADD COLUMN ${col} TEXT`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  });

  try {
    native.exec("ALTER TABLE users ADD COLUMN email TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE users ADD COLUMN usuario TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  try {
    native.exec("ALTER TABLE invoices ADD COLUMN related_invoice_id INTEGER");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE invoices ADD COLUMN related_invoice_number TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE invoices ADD COLUMN payment_date TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE invoices ADD COLUMN emission_time TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE invoices ADD COLUMN due_date TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE invoices ADD COLUMN source TEXT DEFAULT 'hosting'");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE setups ADD COLUMN codigo TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  const equiposMpCols = [
    "mp_visible INTEGER NOT NULL DEFAULT 0",
    "mp_algo TEXT",
    "mp_hashrate_display TEXT",
    "mp_image_src TEXT",
    "mp_gallery_json TEXT",
    "mp_detail_rows_json TEXT",
    "mp_yield_json TEXT",
    "mp_sort_order INTEGER NOT NULL DEFAULT 0",
    "mp_hashrate_sell_enabled INTEGER NOT NULL DEFAULT 0",
    "mp_hashrate_parts_json TEXT",
    "precio_historial_json TEXT",
    "mp_price_label TEXT",
    "mp_listing_kind TEXT",
  ];
  for (const colDef of equiposMpCols) {
    try {
      native.exec(`ALTER TABLE equipos_asic ADD COLUMN ${colDef}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  for (const colDef of [
    "user_id INTEGER",
    "contact_email TEXT",
    "discard_by_email TEXT",
    "reactivated_at TEXT",
    "items_history_json TEXT",
  ]) {
    try {
      native.exec(`ALTER TABLE marketplace_quote_tickets ADD COLUMN ${colDef}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  for (const colDef of ["country_code TEXT", "country_name TEXT", "client_ip TEXT", "user_email TEXT"]) {
    try {
      native.exec(`ALTER TABLE marketplace_presence ADD COLUMN ${colDef}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  native.exec(`
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

  native.exec(`CREATE TABLE IF NOT EXISTS marketplace_site_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  native
    .prepare("INSERT OR IGNORE INTO marketplace_site_kv (key, value) VALUES (?, ?)")
    .run("corp_best_selling_asic_ids", "[]");
  native
    .prepare("INSERT OR IGNORE INTO marketplace_site_kv (key, value) VALUES (?, ?)")
    .run("corp_interesting_asic_ids", "[]");

  native.exec(`CREATE TABLE IF NOT EXISTS tienda_online_client_seq (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_code_num INTEGER NOT NULL
  )`);
  native.prepare("INSERT OR IGNORE INTO tienda_online_client_seq (id, next_code_num) VALUES (1, 90001)").run();
  try {
    native.exec("ALTER TABLE clients ADD COLUMN user_id INTEGER");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE clients ADD COLUMN tienda_marketplace_etiqueta TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  try {
    native.exec("ALTER TABLE items_garantia_ande ADD COLUMN precio_garantia REAL");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }
  try {
    native.exec("ALTER TABLE items_garantia_ande ADD COLUMN marketplace_equipo_id TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  const usersSqlRow = native.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
  if (usersSqlRow?.sql && !usersSqlRow.sql.includes("'cliente'")) {
    native.exec("PRAGMA foreign_keys=OFF");
    native.exec("BEGIN");
    try {
      native.exec(`CREATE TABLE users__role_cliente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin_a', 'admin_b', 'operador', 'lector', 'cliente')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        usuario TEXT
      )`);
      native.exec(
        `INSERT INTO users__role_cliente (id, username, email, password_hash, role, created_at, usuario)
         SELECT id, username, email, password_hash, role, created_at, usuario FROM users`
      );
      native.exec("DROP TABLE users");
      native.exec("ALTER TABLE users__role_cliente RENAME TO users");
      native.exec("COMMIT");
    } catch (e) {
      try {
        native.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      native.exec("PRAGMA foreign_keys=ON");
    }
  }

  /** Embudo operativo: nuevos estados + migración respondido → en_contacto_equipo. */
  {
    const mqRow = native.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='marketplace_quote_tickets'").get() as
      | { sql: string }
      | undefined;
    if (mqRow?.sql && !mqRow.sql.includes("'en_contacto_equipo'")) {
      native.exec("PRAGMA foreign_keys=OFF");
      native.exec("BEGIN");
      try {
        native.exec(`CREATE TABLE marketplace_quote_tickets__flow (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          order_number TEXT UNIQUE,
          ticket_code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','orden_lista','enviado_consulta','en_contacto_equipo','en_gestion','pagada','en_viaje','instalado','cerrado','descartado')),
          items_json TEXT NOT NULL,
          subtotal_usd REAL NOT NULL DEFAULT 0,
          line_count INTEGER NOT NULL DEFAULT 0,
          unit_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_contact_channel TEXT,
          contacted_at TEXT,
          notes_admin TEXT,
          ip_address TEXT,
          user_agent TEXT,
          user_id INTEGER,
          contact_email TEXT,
          discard_by_email TEXT,
          reactivated_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        native.exec(`
          INSERT INTO marketplace_quote_tickets__flow (
            id, session_id, order_number, ticket_code, status,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          )
          SELECT id, session_id, order_number, ticket_code,
            CASE WHEN status = 'respondido' THEN 'en_contacto_equipo' ELSE status END,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          FROM marketplace_quote_tickets
        `);
        native.exec("DROP TABLE marketplace_quote_tickets");
        native.exec("ALTER TABLE marketplace_quote_tickets__flow RENAME TO marketplace_quote_tickets");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_status_updated ON marketplace_quote_tickets(status, updated_at DESC)");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_created ON marketplace_quote_tickets(created_at DESC)");
        native.exec("COMMIT");
      } catch (e) {
        try {
          native.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        native.exec("PRAGMA foreign_keys=ON");
      }
    }
  }

  /** Migra tablas antiguas cuyo CHECK de `status` no incluye `orden_lista`. */
  {
    const mqRow = native.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='marketplace_quote_tickets'").get() as
      | { sql: string }
      | undefined;
    if (mqRow?.sql && !mqRow.sql.includes("'orden_lista'")) {
      native.exec("PRAGMA foreign_keys=OFF");
      native.exec("BEGIN");
      try {
        native.exec(`CREATE TABLE marketplace_quote_tickets__orden_lista (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          order_number TEXT UNIQUE,
          ticket_code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','orden_lista','enviado_consulta','en_contacto_equipo','en_gestion','pagada','en_viaje','instalado','cerrado','descartado')),
          items_json TEXT NOT NULL,
          subtotal_usd REAL NOT NULL DEFAULT 0,
          line_count INTEGER NOT NULL DEFAULT 0,
          unit_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_contact_channel TEXT,
          contacted_at TEXT,
          notes_admin TEXT,
          ip_address TEXT,
          user_agent TEXT,
          user_id INTEGER,
          contact_email TEXT,
          discard_by_email TEXT,
          reactivated_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        native.exec(`
          INSERT INTO marketplace_quote_tickets__orden_lista (
            id, session_id, order_number, ticket_code, status,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          )
          SELECT id, session_id, order_number, ticket_code, status,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          FROM marketplace_quote_tickets
        `);
        native.exec("DROP TABLE marketplace_quote_tickets");
        native.exec("ALTER TABLE marketplace_quote_tickets__orden_lista RENAME TO marketplace_quote_tickets");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_status_updated ON marketplace_quote_tickets(status, updated_at DESC)");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_created ON marketplace_quote_tickets(created_at DESC)");
        native.exec("COMMIT");
      } catch (e) {
        try {
          native.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        native.exec("PRAGMA foreign_keys=ON");
      }
    }
  }

  /** Estado `pendiente`: CHECK en BD + migración de `orden_lista` (carrito sin «Generar orden») a `pendiente`. */
  {
    const mqRow = native.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='marketplace_quote_tickets'").get() as
      | { sql: string }
      | undefined;
    if (mqRow?.sql && !mqRow.sql.includes("'pendiente'")) {
      native.exec("PRAGMA foreign_keys=OFF");
      native.exec("BEGIN");
      try {
        native.exec(`CREATE TABLE marketplace_quote_tickets__pendiente (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          order_number TEXT UNIQUE,
          ticket_code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','pendiente','orden_lista','enviado_consulta','en_contacto_equipo','en_gestion','pagada','en_viaje','instalado','cerrado','descartado')),
          items_json TEXT NOT NULL,
          subtotal_usd REAL NOT NULL DEFAULT 0,
          line_count INTEGER NOT NULL DEFAULT 0,
          unit_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_contact_channel TEXT,
          contacted_at TEXT,
          notes_admin TEXT,
          ip_address TEXT,
          user_agent TEXT,
          user_id INTEGER,
          contact_email TEXT,
          discard_by_email TEXT,
          reactivated_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        native.exec(`
          INSERT INTO marketplace_quote_tickets__pendiente (
            id, session_id, order_number, ticket_code, status,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          )
          SELECT id, session_id, order_number, ticket_code, status,
            items_json, subtotal_usd, line_count, unit_count,
            created_at, updated_at, last_contact_channel, contacted_at, notes_admin,
            ip_address, user_agent, user_id, contact_email, discard_by_email, reactivated_at
          FROM marketplace_quote_tickets
        `);
        native.exec(
          "UPDATE marketplace_quote_tickets__pendiente SET status = 'pendiente' WHERE status = 'orden_lista'"
        );
        native.exec("DROP TABLE marketplace_quote_tickets");
        native.exec("ALTER TABLE marketplace_quote_tickets__pendiente RENAME TO marketplace_quote_tickets");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_status_updated ON marketplace_quote_tickets(status, updated_at DESC)");
        native.exec("CREATE INDEX IF NOT EXISTS idx_mq_quote_created ON marketplace_quote_tickets(created_at DESC)");
        native.exec("COMMIT");
      } catch (e) {
        try {
          native.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        native.exec("PRAGMA foreign_keys=ON");
      }
    }
  }

  try {
    native.exec("ALTER TABLE marketplace_quote_tickets ADD COLUMN items_history_json TEXT");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  const txWrap = {
    prepare: (sql: string) => createStatement(native, sql),
  };

  return {
    isPostgres: false,
    prepare: (sql: string) => createStatement(native, sql),
    exec: (sql: string) => {
      native.exec(sql);
      return Promise.resolve();
    },
    transaction: async <T>(fn: (tx: typeof txWrap) => Promise<T> | T): Promise<T> => {
      native.exec("BEGIN");
      try {
        const result = await fn(txWrap);
        native.exec("COMMIT");
        return result;
      } catch (e) {
        native.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
