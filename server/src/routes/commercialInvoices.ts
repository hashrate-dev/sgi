import { Router } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { mpVisibleFromDbValue } from "../lib/mpVisible.js";

export const commercialInvoicesRouter = Router();

const isPg = (): boolean => (getDb() as { isPostgres?: boolean }).isPostgres === true;

let schemaReady = false;

const NUMBER_PREFIX = "IN";
const NUMBER_PAD = 5;
/** Primer documento: IN00101. El contador es global (no por año) y no se reutiliza. */
const FIRST_SEQ = 101;
const SEQ_SCOPE = 0;

function formatNumber(seq: number): string {
  return `${NUMBER_PREFIX}${String(Math.max(0, Math.trunc(seq))).padStart(NUMBER_PAD, "0")}`;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  if (isPg()) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoices (
          id SERIAL PRIMARY KEY,
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
          notes TEXT NOT NULL DEFAULT '',
          bank_details TEXT NOT NULL DEFAULT '',
          items_json TEXT NOT NULL DEFAULT '[]',
          subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
          tax_label TEXT NOT NULL DEFAULT '',
          tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          total DOUBLE PRECISION NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      )
      .run();
    await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_invoices_year_seq ON commercial_invoices(seq_year, seq_num)").run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_seq (
          year INTEGER PRIMARY KEY,
          last_number INTEGER NOT NULL
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoices (
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
          notes TEXT NOT NULL DEFAULT '',
          bank_details TEXT NOT NULL DEFAULT '',
          items_json TEXT NOT NULL DEFAULT '[]',
          subtotal REAL NOT NULL DEFAULT 0,
          tax_label TEXT NOT NULL DEFAULT '',
          tax_amount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
    await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_invoices_year_seq ON commercial_invoices(seq_year, seq_num)").run();
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_seq (
          year INTEGER PRIMARY KEY,
          last_number INTEGER NOT NULL
        )`
      )
      .run();
  }
  try {
    await db.prepare("ALTER TABLE commercial_invoices ADD COLUMN buyer_phone TEXT NOT NULL DEFAULT ''").run();
  } catch {
    /* ya existe */
  }
  try {
    await db.prepare("ALTER TABLE commercial_invoices ADD COLUMN goods_status TEXT NOT NULL DEFAULT ''").run();
  } catch {
    /* ya existe */
  }
  try {
    await db.prepare("ALTER TABLE commercial_invoices ADD COLUMN shipment_purpose TEXT NOT NULL DEFAULT ''").run();
  } catch {
    /* ya existe */
  }
  try {
    await db.prepare("ALTER TABLE commercial_invoices ADD COLUMN goods_origin_country TEXT NOT NULL DEFAULT ''").run();
  } catch {
    /* ya existe */
  }
  if (isPg()) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_recipients (
          id SERIAL PRIMARY KEY,
          user_number INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          tax_id TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_recipients (
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
        )`
      )
      .run();
  }
  try {
    const countRow = (await db.prepare("SELECT COUNT(*) AS c FROM commercial_invoice_recipients").get()) as { c?: number | string } | undefined;
    if (Number(countRow?.c ?? 0) === 0) {
      await db
        .prepare(
          `INSERT INTO commercial_invoice_recipients (user_number, name, tax_id, address, phone, email, country)
           VALUES (1, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "TENZER, KEN",
          "8595314-8",
          "555, Camacho Duré, Asunción, Central, Paraguay, 001520",
          "+595 993 382 224",
          "kentenzer@gmail.com",
          "Paraguay"
        );
    }
  } catch {
    /* seed opcional */
  }
  if (isPg()) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_senders (
          id SERIAL PRIMARY KEY,
          user_number INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          tax_id TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_senders (
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
        )`
      )
      .run();
  }
  try {
    const senderCount = (await db.prepare("SELECT COUNT(*) AS c FROM commercial_invoice_senders").get()) as { c?: number | string } | undefined;
    if (Number(senderCount?.c ?? 0) === 0) {
      await db
        .prepare(
          `INSERT INTO commercial_invoice_senders (user_number, name, tax_id, address, phone, email, country)
           VALUES (1, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "BUTLER, RETO",
          "609990",
          "Kra 1 # 6-70, Gachetá, Cundinamarca",
          "+57 310 261 5224",
          "reto@protonmail.com",
          "COLOMBIA"
        );
    }
  } catch {
    /* seed opcional */
  }
  if (isPg()) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_countries (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS commercial_invoice_countries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();
  }
  for (const countryName of ["COLOMBIA", "PARAGUAY"]) {
    try {
      if (isPg()) {
        await db.prepare("INSERT INTO commercial_invoice_countries (name) VALUES (?) ON CONFLICT (name) DO NOTHING").run(countryName);
      } else {
        await db.prepare("INSERT OR IGNORE INTO commercial_invoice_countries (name) VALUES (?)").run(countryName);
      }
    } catch {
      /* seed opcional */
    }
  }
  schemaReady = true;
}

const ItemSchema = z.object({
  description: z.string().min(1).max(800),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(32).default("un"),
  unitPrice: z.coerce.number().min(0),
  catalogKey: z.string().max(80).optional(),
  kind: z.enum(["goods", "shipping"]).optional(),
  serialNumber: z.string().max(400).optional(),
  shippingCarrier: z.string().max(80).optional(),
  shippingFrom: z.string().max(80).optional(),
  shippingTo: z.string().max(80).optional(),
});

const FieldsSchema = z.object({
  numberSuffix: z.string().max(60).trim().optional().default(""),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().max(40).trim().optional().default(""),
  currency: z.string().min(1).max(12).trim().default("USD"),
  poNumber: z.string().max(80).trim().optional().default(""),
  paymentTerms: z.string().max(160).trim().optional().default(""),
  paymentMethod: z.string().max(120).trim().optional().default(""),
  incoterms: z.string().max(80).trim().optional().default(""),
  originCountry: z.string().max(80).trim().optional().default(""),
  destinationCountry: z.string().max(80).trim().optional().default(""),
  sellerName: z.string().min(1).max(200).trim(),
  sellerAddress: z.string().max(500).trim().optional().default(""),
  sellerCity: z.string().max(120).trim().optional().default(""),
  sellerCountry: z.string().max(80).trim().optional().default(""),
  sellerTaxId: z.string().max(80).trim().optional().default(""),
  sellerEmail: z.string().max(160).trim().optional().default(""),
  sellerPhone: z.string().max(80).trim().optional().default(""),
  sellerWeb: z.string().max(160).trim().optional().default(""),
  buyerName: z.string().min(1).max(200).trim(),
  buyerAddress: z.string().max(500).trim().optional().default(""),
  buyerCity: z.string().max(120).trim().optional().default(""),
  buyerCountry: z.string().max(80).trim().optional().default(""),
  buyerTaxId: z.string().max(80).trim().optional().default(""),
  buyerEmail: z.string().max(160).trim().optional().default(""),
  buyerPhone: z.string().max(80).trim().optional().default(""),
  goodsStatus: z.string().max(120).trim().optional().default(""),
  shipmentPurpose: z.string().max(400).trim().optional().default(""),
  goodsOriginCountry: z.string().max(80).trim().optional().default(""),
  notes: z.string().max(4000).trim().optional().default(""),
  bankDetails: z.string().max(4000).trim().optional().default(""),
  taxLabel: z.string().max(80).trim().optional().default(""),
  taxAmount: z.coerce.number().min(0).optional().default(0),
  items: z.array(ItemSchema).min(1).max(80),
});

type Tx = {
  prepare: (s: string) => {
    get: (...p: unknown[]) => Promise<unknown>;
    all: (...p: unknown[]) => Promise<unknown[]>;
    run: (...p: unknown[]) => Promise<{ changes: number; lastInsertRowid: number | null }>;
  };
};

function yearFromDate(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
}

function lineAmount(it: { quantity: number; unitPrice: number }): number {
  return Math.round(Number(it.quantity) * Number(it.unitPrice) * 100) / 100;
}

function totals(items: Array<{ quantity: number; unitPrice: number }>, taxAmount: number) {
  const subtotal = Math.round(items.reduce((s, it) => s + lineAmount(it), 0) * 100) / 100;
  const tax = Number.isFinite(taxAmount) ? taxAmount : 0;
  return { subtotal, total: Math.round((subtotal + tax) * 100) / 100 };
}

async function peekOrAllocate(tx: Tx, consume: boolean): Promise<{ number: string; seqNum: number }> {
  await tx.prepare("INSERT INTO commercial_invoice_seq (year, last_number) VALUES (?, 0) ON CONFLICT (year) DO NOTHING").run(SEQ_SCOPE);
  const maxRow = (await tx.prepare("SELECT COALESCE(MAX(seq_num), 0) AS m FROM commercial_invoices").get()) as
    | { m?: number | string }
    | undefined;
  const seqRow = (await tx.prepare("SELECT last_number FROM commercial_invoice_seq WHERE year = ?").get(SEQ_SCOPE)) as
    | { last_number?: number | string }
    | undefined;
  let maxFromIn = 0;
  try {
    const numbered = (await tx.prepare("SELECT number FROM commercial_invoices WHERE number LIKE 'IN%'").all()) as Array<{ number?: string }>;
    for (const row of numbered) {
      const m = /^IN(\d+)$/i.exec(String(row.number ?? "").trim());
      if (m) maxFromIn = Math.max(maxFromIn, Number(m[1]));
    }
  } catch {
    /* ignore */
  }
  const next = Math.max(Number(seqRow?.last_number ?? 0), Number(maxRow?.m ?? 0), maxFromIn, FIRST_SEQ - 1) + 1;
  if (consume) {
    await tx.prepare("UPDATE commercial_invoice_seq SET last_number = ? WHERE year = ?").run(next, SEQ_SCOPE);
  }
  return { number: formatNumber(next), seqNum: next };
}

function mapParty(row: Record<string, unknown>) {
  const r = rowKeysToLowercase(row);
  const userNumber = Number(r.user_number ?? 0);
  return {
    id: Number(r.id),
    userNumber,
    userCode: formatUserCode(userNumber),
    name: String(r.name ?? ""),
    taxId: String(r.tax_id ?? ""),
    address: String(r.address ?? ""),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    country: String(r.country ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function mapRecipient(row: Record<string, unknown>) {
  return mapParty(row);
}

function formatUserCode(n: number): string {
  return `USR${String(Math.max(0, Math.trunc(n))).padStart(3, "0")}`;
}

function mapCountry(row: Record<string, unknown>) {
  const r = rowKeysToLowercase(row);
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

function normalizeCountryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function parseItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapRow(row: Record<string, unknown>) {
  const r = rowKeysToLowercase(row);
  const items = parseItems(r.items_json);
  return {
    id: Number(r.id),
    number: String(r.number ?? ""),
    seqYear: Number(r.seq_year),
    seqNum: Number(r.seq_num),
    numberSuffix: String(r.number_suffix ?? ""),
    invoiceDate: String(r.invoice_date ?? ""),
    dueDate: String(r.due_date ?? ""),
    currency: String(r.currency ?? "USD"),
    poNumber: String(r.po_number ?? ""),
    paymentTerms: String(r.payment_terms ?? ""),
    paymentMethod: String(r.payment_method ?? ""),
    incoterms: String(r.incoterms ?? ""),
    originCountry: String(r.origin_country ?? ""),
    destinationCountry: String(r.destination_country ?? ""),
    sellerName: String(r.seller_name ?? ""),
    sellerAddress: String(r.seller_address ?? ""),
    sellerCity: String(r.seller_city ?? ""),
    sellerCountry: String(r.seller_country ?? ""),
    sellerTaxId: String(r.seller_tax_id ?? ""),
    sellerEmail: String(r.seller_email ?? ""),
    sellerPhone: String(r.seller_phone ?? ""),
    sellerWeb: String(r.seller_web ?? ""),
    buyerName: String(r.buyer_name ?? ""),
    buyerAddress: String(r.buyer_address ?? ""),
    buyerCity: String(r.buyer_city ?? ""),
    buyerCountry: String(r.buyer_country ?? ""),
    buyerTaxId: String(r.buyer_tax_id ?? ""),
    buyerEmail: String(r.buyer_email ?? ""),
    buyerPhone: String(r.buyer_phone ?? ""),
    goodsStatus: String(r.goods_status ?? ""),
    shipmentPurpose: String(r.shipment_purpose ?? ""),
    goodsOriginCountry: String(r.goods_origin_country ?? ""),
    notes: String(r.notes ?? ""),
    bankDetails: String(r.bank_details ?? ""),
    items,
    subtotal: Number(r.subtotal ?? 0),
    taxLabel: String(r.tax_label ?? ""),
    taxAmount: Number(r.tax_amount ?? 0),
    total: Number(r.total ?? 0),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

const COLS = `id, number, seq_year, seq_num, number_suffix, invoice_date, due_date, currency, po_number, payment_terms,
  payment_method, incoterms, origin_country, destination_country,
  seller_name, seller_address, seller_city, seller_country, seller_tax_id, seller_email, seller_phone, seller_web,
  buyer_name, buyer_address, buyer_city, buyer_country, buyer_tax_id, buyer_email, buyer_phone,
  goods_status, shipment_purpose, goods_origin_country,
  notes, bank_details, items_json, subtotal, tax_label, tax_amount, total, created_at, updated_at`;

commercialInvoicesRouter.get(
  "/commercial-invoices/catalog",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    try {
      const eqRows = (await db
        .prepare(
          `SELECT id, numero_serie, marca_equipo, modelo, procesador, precio_usd, mp_visible
           FROM equipos_asic
           ORDER BY marca_equipo ASC, modelo ASC, numero_serie ASC`
        )
        .all()) as Array<Record<string, unknown>>;
      const equipos = (Array.isArray(eqRows) ? eqRows : []).map((raw) => {
        const r = rowKeysToLowercase(raw);
        return {
          id: String(r.id ?? ""),
          numeroSerie: r.numero_serie == null ? "" : String(r.numero_serie),
          marcaEquipo: String(r.marca_equipo ?? ""),
          modelo: String(r.modelo ?? ""),
          procesador: String(r.procesador ?? ""),
          precioUSD: Number(r.precio_usd ?? 0) || 0,
          marketplaceVisible: mpVisibleFromDbValue(r.mp_visible),
        };
      });
      let setups: Array<{ id: string; nombre: string; precioUSD: number; codigo: string }> = [];
      try {
        const stRows = (await db
          .prepare('SELECT id, codigo, nombre, precio_usd AS "precioUSD" FROM setups ORDER BY codigo ASC, nombre ASC')
          .all()) as Array<Record<string, unknown>>;
        setups = (Array.isArray(stRows) ? stRows : []).map((raw) => {
          const r = rowKeysToLowercase(raw);
          const n = Number(r.preciousd ?? r.precio_usd ?? 0);
          return {
            id: String(r.id ?? ""),
            codigo: r.codigo == null ? "" : String(r.codigo),
            nombre: String(r.nombre ?? ""),
            precioUSD: Number.isFinite(n) ? n : 0,
          };
        });
      } catch {
        setups = [];
      }
      return res.json({ equipos, setups });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "No se pudo cargar el catálogo ASIC" } });
    }
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices/recipients",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    await ensureSchema();
    try {
      const rows = (await db
        .prepare(
          `SELECT id, user_number, name, tax_id, address, phone, email, country, created_at, updated_at
           FROM commercial_invoice_recipients
           ORDER BY user_number ASC`
        )
        .all()) as Record<string, unknown>[];
      return res.json({ recipients: (Array.isArray(rows) ? rows : []).map((raw) => mapRecipient(raw)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "No se pudo cargar consignatarios" } });
    }
  }
);

const RecipientBody = z.object({
  name: z.string().min(1).max(200).trim(),
  taxId: z.string().max(80).trim().optional().default(""),
  address: z.string().max(500).trim().optional().default(""),
  phone: z.string().max(80).trim().optional().default(""),
  email: z.string().max(160).trim().optional().default(""),
  country: z.string().max(80).trim().optional().default(""),
});

commercialInvoicesRouter.post(
  "/commercial-invoices/recipients",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const parsed = RecipientBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Completá al menos el nombre del consignatario" } });
    }
    const body = parsed.data;
    try {
      const created = await db.transaction(async (tx) => {
        const maxRow = (await tx.prepare("SELECT COALESCE(MAX(user_number), 0) AS m FROM commercial_invoice_recipients").get()) as
          | { m?: number | string }
          | undefined;
        const next = Math.max(1, Number(maxRow?.m ?? 0) + 1);
        const returning = `INSERT INTO commercial_invoice_recipients (user_number, name, tax_id, address, phone, email, country)
          VALUES (?,?,?,?,?,?,?) RETURNING id, user_number, name, tax_id, address, phone, email, country, created_at, updated_at`;
        const row = (await tx.prepare(returning).get(next, body.name, body.taxId, body.address, body.phone, body.email, body.country)) as
          | Record<string, unknown>
          | undefined;
        if (!row) throw new Error("No se pudo guardar el consignatario");
        return mapRecipient(row);
      });
      return res.status(201).json({ recipient: created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "Error al guardar consignatario" } });
    }
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices/senders",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    await ensureSchema();
    try {
      const rows = (await db
        .prepare(
          `SELECT id, user_number, name, tax_id, address, phone, email, country, created_at, updated_at
           FROM commercial_invoice_senders
           ORDER BY user_number ASC`
        )
        .all()) as Record<string, unknown>[];
      return res.json({ senders: (Array.isArray(rows) ? rows : []).map((raw) => mapParty(raw)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "No se pudo cargar expedidores" } });
    }
  }
);

commercialInvoicesRouter.post(
  "/commercial-invoices/senders",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const parsed = RecipientBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Completá al menos el nombre del expedidor" } });
    }
    const body = parsed.data;
    try {
      const created = await db.transaction(async (tx) => {
        const maxRow = (await tx.prepare("SELECT COALESCE(MAX(user_number), 0) AS m FROM commercial_invoice_senders").get()) as
          | { m?: number | string }
          | undefined;
        const next = Math.max(1, Number(maxRow?.m ?? 0) + 1);
        const returning = `INSERT INTO commercial_invoice_senders (user_number, name, tax_id, address, phone, email, country)
          VALUES (?,?,?,?,?,?,?) RETURNING id, user_number, name, tax_id, address, phone, email, country, created_at, updated_at`;
        const row = (await tx.prepare(returning).get(next, body.name, body.taxId, body.address, body.phone, body.email, body.country)) as
          | Record<string, unknown>
          | undefined;
        if (!row) throw new Error("No se pudo guardar el expedidor");
        return mapParty(row);
      });
      return res.status(201).json({ sender: created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "Error al guardar expedidor" } });
    }
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices/countries",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    await ensureSchema();
    try {
      const rows = (await db
        .prepare(`SELECT id, name, created_at FROM commercial_invoice_countries ORDER BY name ASC`)
        .all()) as Record<string, unknown>[];
      return res.json({ countries: (Array.isArray(rows) ? rows : []).map((raw) => mapCountry(raw)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "No se pudo cargar los países" } });
    }
  }
);

const CountryBody = z.object({
  name: z.string().min(1).max(80).trim(),
});

commercialInvoicesRouter.post(
  "/commercial-invoices/countries",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const parsed = CountryBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Completá el nombre del país" } });
    }
    const name = normalizeCountryName(parsed.data.name);
    if (!name) {
      return res.status(400).json({ error: { message: "Completá el nombre del país" } });
    }
    try {
      const existing = (await db.prepare("SELECT id, name, created_at FROM commercial_invoice_countries WHERE name = ?").get(name)) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        return res.status(409).json({ error: { message: `${name} ya está en la lista. Elegilo en el selector.` } });
      }
      const returning = `INSERT INTO commercial_invoice_countries (name) VALUES (?) RETURNING id, name, created_at`;
      const row = (await db.prepare(returning).get(name)) as Record<string, unknown> | undefined;
      if (!row) throw new Error("No se pudo guardar el país");
      return res.status(201).json({ country: mapCountry(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "Error al guardar el país" } });
    }
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices/next-number",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    try {
      const { number, seqNum } = await peekOrAllocate(db as never, false);
      return res.json({ number, seqNum });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: { message: msg || "No se pudo calcular el número" } });
    }
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (_req, res) => {
    await ensureSchema();
    const rows = (await db.prepare(`SELECT ${COLS} FROM commercial_invoices ORDER BY seq_year DESC, seq_num DESC, id DESC`).all()) as Record<
      string,
      unknown
    >[];
    return res.json({ invoices: (Array.isArray(rows) ? rows : []).map((r) => mapRow(r)) });
  }
);

commercialInvoicesRouter.get(
  "/commercial-invoices/:id",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "Id inválido" } });
    const row = (await db.prepare(`SELECT ${COLS} FROM commercial_invoices WHERE id = ?`).get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Invoice no encontrada" } });
    return res.json({ invoice: mapRow(row) });
  }
);

commercialInvoicesRouter.post(
  "/commercial-invoices",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const parsed = FieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos incompletos", details: parsed.error.flatten() } });
    }
    const inv = parsed.data;
    const year = yearFromDate(inv.invoiceDate);
    const { subtotal, total } = totals(inv.items, inv.taxAmount);
    const itemsJson = JSON.stringify(inv.items);
    try {
      const created = await db.transaction(async (tx) => {
        const { number, seqNum } = await peekOrAllocate(tx as never, true);
        const returning = isPg()
          ? `INSERT INTO commercial_invoices (
              number, seq_year, seq_num, number_suffix, invoice_date, due_date, currency, po_number, payment_terms,
              payment_method, incoterms, origin_country, destination_country,
              seller_name, seller_address, seller_city, seller_country, seller_tax_id, seller_email, seller_phone, seller_web,
              buyer_name, buyer_address, buyer_city, buyer_country, buyer_tax_id, buyer_email, buyer_phone,
              goods_status, shipment_purpose, goods_origin_country,
              notes, bank_details, items_json, subtotal, tax_label, tax_amount, total
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING ${COLS}`
          : `INSERT INTO commercial_invoices (
              number, seq_year, seq_num, number_suffix, invoice_date, due_date, currency, po_number, payment_terms,
              payment_method, incoterms, origin_country, destination_country,
              seller_name, seller_address, seller_city, seller_country, seller_tax_id, seller_email, seller_phone, seller_web,
              buyer_name, buyer_address, buyer_city, buyer_country, buyer_tax_id, buyer_email, buyer_phone,
              goods_status, shipment_purpose, goods_origin_country,
              notes, bank_details, items_json, subtotal, tax_label, tax_amount, total
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING ${COLS}`;
        const row = (await tx.prepare(returning).get(
          number,
          year,
          seqNum,
          "",
          inv.invoiceDate,
          inv.dueDate || "",
          inv.currency,
          inv.poNumber,
          inv.paymentTerms,
          inv.paymentMethod,
          inv.incoterms,
          inv.originCountry,
          inv.destinationCountry,
          inv.sellerName,
          inv.sellerAddress,
          inv.sellerCity,
          inv.sellerCountry,
          inv.sellerTaxId,
          inv.sellerEmail,
          inv.sellerPhone,
          inv.sellerWeb,
          inv.buyerName,
          inv.buyerAddress,
          inv.buyerCity,
          inv.buyerCountry,
          inv.buyerTaxId,
          inv.buyerEmail,
          inv.buyerPhone,
          inv.goodsStatus,
          inv.shipmentPurpose,
          inv.goodsOriginCountry,
          inv.notes,
          inv.bankDetails,
          itemsJson,
          subtotal,
          inv.taxLabel || "",
          inv.taxAmount,
          total
        )) as Record<string, unknown> | undefined;
        if (!row) throw new Error("No se pudo guardar la invoice");
        return mapRow(row);
      });
      return res.status(201).json({ invoice: created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        return res.status(409).json({ error: { message: "El número de invoice ya existe. Reintentá." } });
      }
      return res.status(500).json({ error: { message: msg || "Error al guardar" } });
    }
  }
);

commercialInvoicesRouter.put(
  "/commercial-invoices/:id",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
  async (req, res) => {
    await ensureSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: { message: "Id inválido" } });
    const parsed = FieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos incompletos", details: parsed.error.flatten() } });
    }
    const inv = parsed.data;
    const { subtotal, total } = totals(inv.items, inv.taxAmount);
    const itemsJson = JSON.stringify(inv.items);
    const existing = (await db.prepare("SELECT id, number, seq_year, seq_num FROM commercial_invoices WHERE id = ?").get(id)) as
      | { id: number; number: string; seq_year: number; seq_num: number }
      | undefined;
    if (!existing) return res.status(404).json({ error: { message: "Invoice no encontrada" } });
    const number = String(existing.number);
    const updatedAtSql = isPg() ? "now()" : "datetime('now')";
    try {
      await db
        .prepare(
          `UPDATE commercial_invoices SET
            number = ?, number_suffix = ?, invoice_date = ?, due_date = ?, currency = ?, po_number = ?, payment_terms = ?,
            payment_method = ?, incoterms = ?, origin_country = ?, destination_country = ?,
            seller_name = ?, seller_address = ?, seller_city = ?, seller_country = ?, seller_tax_id = ?, seller_email = ?, seller_phone = ?, seller_web = ?,
            buyer_name = ?, buyer_address = ?, buyer_city = ?, buyer_country = ?, buyer_tax_id = ?, buyer_email = ?, buyer_phone = ?,
            goods_status = ?, shipment_purpose = ?, goods_origin_country = ?,
            notes = ?, bank_details = ?, items_json = ?, subtotal = ?, tax_label = ?, tax_amount = ?, total = ?,
            updated_at = ${updatedAtSql}
           WHERE id = ?`
        )
        .run(
          number,
          "",
          inv.invoiceDate,
          inv.dueDate || "",
          inv.currency,
          inv.poNumber,
          inv.paymentTerms,
          inv.paymentMethod,
          inv.incoterms,
          inv.originCountry,
          inv.destinationCountry,
          inv.sellerName,
          inv.sellerAddress,
          inv.sellerCity,
          inv.sellerCountry,
          inv.sellerTaxId,
          inv.sellerEmail,
          inv.sellerPhone,
          inv.sellerWeb,
          inv.buyerName,
          inv.buyerAddress,
          inv.buyerCity,
          inv.buyerCountry,
          inv.buyerTaxId,
          inv.buyerEmail,
          inv.buyerPhone,
          inv.goodsStatus,
          inv.shipmentPurpose,
          inv.goodsOriginCountry,
          inv.notes,
          inv.bankDetails,
          itemsJson,
          subtotal,
          inv.taxLabel || "",
          inv.taxAmount,
          total,
          id
        );
      const row = (await db.prepare(`SELECT ${COLS} FROM commercial_invoices WHERE id = ?`).get(id)) as Record<string, unknown>;
      return res.json({ invoice: mapRow(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        return res.status(409).json({ error: { message: "Ese sufijo deja un número que ya existe." } });
      }
      return res.status(500).json({ error: { message: msg || "Error al actualizar" } });
    }
  }
);
