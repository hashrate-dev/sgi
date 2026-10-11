import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db, getDb } from "../db.js";
import {
  DEFAULT_DUE_DATE_DAYS,
  DEFAULT_USD_PER_KWH,
  addDaysPy,
  daysInYearMonth,
  formatPyDate,
  formatPyTime,
  isClosedMonth,
  kwhForMonth,
  lineTotals,
  monthSuffixLabel,
  parseYearMonth,
  previousClosedMonth,
  priceFromEnergy,
  bestGarantiaRow,
  resolveServiceWatts,
  roundUsd,
  scalePriceByDays,
  storedServiceDescription,
  ymdInAsuncion,
  type GarantiaConsumoRow,
  type HostingAgentLine,
} from "../lib/hostingBillingAgent.js";
import { normalizeInvoiceServiceStored } from "../lib/invoiceItemDescription.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const hostingBillingAgentRouter = Router();

const staffRead = [
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("facturacion"),
] as const;
const staffWrite = [
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("facturacion"),
] as const;

const HOSTING_ONLY =
  "NOT (UPPER(TRIM(COALESCE(code, ''))) LIKE 'A9%' OR UPPER(TRIM(COALESCE(code, ''))) LIKE 'WEB-%' OR UPPER(TRIM(COALESCE(code, ''))) LIKE 'FX%')";
const HOSTING_ONLY_C =
  "NOT (UPPER(TRIM(COALESCE(c.code, ''))) LIKE 'A9%' OR UPPER(TRIM(COALESCE(c.code, ''))) LIKE 'WEB-%' OR UPPER(TRIM(COALESCE(c.code, ''))) LIKE 'FX%')";

const BUILTIN_CATALOG: Record<string, { name: string; price: number }> = {
  A: { name: "Servicio alojamiento y mantenimiento L7", price: 100 },
  B: { name: "Servicio alojamiento y mantenimiento L9", price: 250 },
  C: { name: "Servicio alojamiento y mantenimiento S21", price: 500 },
  E: { name: "Servicio alojamiento y mantenimiento Z15", price: 0 },
  D: { name: "4% Gastos Operativos Transferencia", price: 0 },
};

const isPg = () => (getDb() as { isPostgres?: boolean }).isPostgres === true;
const clientNameCol = () => (isPg() ? '"clientName"' : "clientName");
const sourceCol = () => "COALESCE(source, 'hosting')";

let schemaEnsured = false;

async function ensureAgentSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pkUnits = isPg() ? "id BIGSERIAL PRIMARY KEY" : "id INTEGER PRIMARY KEY AUTOINCREMENT";
  const pkDrafts = isPg() ? "id BIGSERIAL PRIMARY KEY" : "id INTEGER PRIMARY KEY AUTOINCREMENT";
  await db.prepare(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    usd_per_kwh REAL NOT NULL DEFAULT 0.078,
    due_date_days INTEGER NOT NULL DEFAULT 6,
    include_4pct INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT ''
  )`).run();
  await db.prepare(
    `INSERT INTO hosting_billing_agent_settings (id, usd_per_kwh, due_date_days, include_4pct, updated_at)
     VALUES (1, 0.078, 6, 1, '')
     ON CONFLICT(id) DO NOTHING`
  ).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_clients (
    client_id INTEGER PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 1,
    usd_per_kwh REAL,
    notes TEXT NOT NULL DEFAULT '',
    include_4pct INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  )`).run();
  try {
    if (isPg()) {
      await db
        .prepare(
          `ALTER TABLE hosting_billing_agent_clients ADD COLUMN IF NOT EXISTS include_4pct INTEGER NOT NULL DEFAULT 0`
        )
        .run();
    } else {
      await db.prepare(`ALTER TABLE hosting_billing_agent_clients ADD COLUMN include_4pct INTEGER NOT NULL DEFAULT 0`).run();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/duplicate column|already exists/i.test(msg)) throw e;
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_units (
    ${pkUnits},
    client_id INTEGER NOT NULL,
    service_key TEXT NOT NULL DEFAULT 'A',
    service_name TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    watts REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_hba_units_client ON hosting_billing_agent_units(client_id, sort_order, id)"
  ).run();
  try {
    if (isPg()) {
      await db.prepare(`ALTER TABLE hosting_billing_agent_units ADD COLUMN IF NOT EXISTS garantia_id INTEGER`).run();
    } else {
      await db.prepare(`ALTER TABLE hosting_billing_agent_units ADD COLUMN garantia_id INTEGER`).run();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/duplicate column|already exists/i.test(msg)) throw e;
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS hosting_billing_agent_drafts (
    ${pkDrafts},
    service_month TEXT NOT NULL,
    client_id INTEGER NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    days_in_month INTEGER NOT NULL DEFAULT 30,
    usd_per_kwh REAL NOT NULL DEFAULT 0.078,
    status TEXT NOT NULL DEFAULT 'draft',
    warning TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    discounts REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    invoice_id INTEGER,
    invoice_number TEXT,
    authorized_at TEXT,
    authorized_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    UNIQUE (client_id, service_month)
  )`).run();
  schemaEnsured = true;
}

type Settings = { usdPerKwh: number; dueDateDays: number; include4pct: boolean };

async function loadSettings(): Promise<Settings> {
  await ensureAgentSchema();
  const raw = (await db.prepare("SELECT usd_per_kwh, due_date_days, include_4pct FROM hosting_billing_agent_settings WHERE id = 1").get()) as
    | Record<string, unknown>
    | undefined;
  const r = raw ? rowKeysToLowercase(raw) : {};
  const usd = Number(r.usd_per_kwh);
  const due = Number(r.due_date_days);
  const pct = r.include_4pct;
  return {
    usdPerKwh: Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_USD_PER_KWH,
    dueDateDays: due === 5 || due === 6 || due === 7 ? due : DEFAULT_DUE_DATE_DAYS,
    include4pct: pct === false || pct === 0 || String(pct) === "0" ? false : true,
  };
}

async function loadGarantiaConsumos(): Promise<GarantiaConsumoRow[]> {
  try {
    const rows = (await db
      .prepare(
        `SELECT id, marca, modelo, procesador, consumo_w, fecha FROM valores_garantias_asic WHERE consumo_w > 0`
      )
      .all()) as Record<string, unknown>[];
    return rows.map((raw) => {
      const r = rowKeysToLowercase(raw);
      return {
        id: Number(r.id) || 0,
        marca: String(r.marca || ""),
        modelo: String(r.modelo || ""),
        procesador: String(r.procesador || ""),
        consumoW: Number(r.consumo_w) || 0,
        fecha: String(r.fecha || ""),
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[hosting-billing-agent] valores_garantias_asic:", msg);
    return [];
  }
}

async function loadCatalog(): Promise<Record<string, { name: string; price: number }>> {
  const out: Record<string, { name: string; price: number }> = { ...BUILTIN_CATALOG };
  try {
    const rows = (await db.prepare("SELECT code, name, price FROM hosting_billing_services").all()) as Record<string, unknown>[];
    for (const raw of rows) {
      const r = rowKeysToLowercase(raw);
      const code = String(r.code ?? "").trim().toUpperCase();
      const name = String(r.name ?? "").trim();
      if (!code || !name || code === "D") continue;
      const price = Number(r.price);
      if (!out[code]) out[code] = { name, price: Number.isFinite(price) ? price : 0 };
    }
  } catch {
    /* catálogo extra opcional */
  }
  return out;
}

function dbFlagOn(v: unknown): boolean {
  return v === true || v === 1 || String(v) === "1";
}

function lastLinesHave4pct(lines: Array<{ service: string }>): boolean {
  return lines.some((l) => /4%\s*gastos operativos transferencia/i.test(l.service));
}

function matchServiceKey(serviceName: string, catalog: Record<string, { name: string; price: number }>): string {
  const n = String(serviceName ?? "").trim();
  if (!n) return "A";
  const exact = Object.keys(catalog).find((k) => catalog[k]!.name === n);
  if (exact) return exact;
  if (/4%\s*gastos operativos transferencia/i.test(n)) return "D";
  if (/Z15/i.test(n)) return "E";
  if (/S21/i.test(n)) return "C";
  if (/\bL9\b/i.test(n) || /L9/i.test(n)) return "B";
  if (/L7/i.test(n)) return "A";
  return "A";
}

type UnitRow = {
  id: number;
  clientId: number;
  serviceKey: string;
  serviceName: string;
  quantity: number;
  watts: number;
  discount: number;
  garantiaId: number | null;
};

function mapGarantiaOption(row: GarantiaConsumoRow, catalog: Record<string, { name: string; price: number }>) {
  const blob = `${row.marca} ${row.modelo} ${row.procesador}`;
  const serviceKey = matchServiceKey(blob, catalog);
  const cat = catalog[serviceKey];
  return {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    procesador: row.procesador,
    consumoW: row.consumoW,
    serviceKey,
    serviceName: cat?.name || `Servicio alojamiento y mantenimiento ${row.modelo}`.trim(),
    label: [row.marca, row.modelo, row.procesador].filter(Boolean).join(" · "),
  };
}

async function loadUnits(clientId: number): Promise<UnitRow[]> {
  const rows = (await db
    .prepare(
      `SELECT id, client_id, service_key, service_name, quantity, watts, discount, garantia_id
       FROM hosting_billing_agent_units WHERE client_id = ? ORDER BY sort_order, id`
    )
    .all(clientId)) as Record<string, unknown>[];
  return rows.map((raw) => {
    const r = rowKeysToLowercase(raw);
    const gid = Number(r.garantia_id);
    return {
      id: Number(r.id) || 0,
      clientId: Number(r.client_id) || clientId,
      serviceKey: String(r.service_key || "A").trim().toUpperCase() || "A",
      serviceName: String(r.service_name || "").trim(),
      quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
      watts: Math.max(0, Number(r.watts) || 0),
      discount: Math.max(0, Number(r.discount) || 0),
      garantiaId: Number.isFinite(gid) && gid > 0 ? gid : null,
    };
  });
}

type LastInvoiceLine = { service: string; month: string; quantity: number; price: number; discount: number };

async function lastHostingFacturaLines(clientName: string): Promise<{ month: string; lines: LastInvoiceLine[] } | null> {
  const inv = (await db
    .prepare(
      `SELECT id, month FROM invoices
       WHERE type = 'Factura' AND ${sourceCol()} = 'hosting' AND LOWER(TRIM(${clientNameCol()})) = LOWER(TRIM(?))
       ORDER BY month DESC, id DESC LIMIT 1`
    )
    .get(clientName)) as { id?: number; month?: string } | undefined;
  const id = Number(inv?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = (await db
    .prepare("SELECT service, month, quantity, price, discount FROM invoice_items WHERE invoice_id = ? ORDER BY id")
    .all(id)) as Record<string, unknown>[];
  const lines = rows.map((raw) => {
    const r = rowKeysToLowercase(raw);
    return {
      service: String(r.service || ""),
      month: String(r.month || inv?.month || ""),
      quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
      price: Number(r.price) || 0,
      discount: Number(r.discount) || 0,
    };
  });
  return { month: String(inv?.month || ""), lines };
}

async function existingFacturaForMonth(clientName: string, month: string): Promise<{ id: number; number: string } | null> {
  const row = (await db
    .prepare(
      `SELECT id, number FROM invoices
       WHERE type = 'Factura' AND ${sourceCol()} = 'hosting' AND month = ? AND LOWER(TRIM(${clientNameCol()})) = LOWER(TRIM(?))
       ORDER BY id DESC LIMIT 1`
    )
    .get(month, clientName)) as { id?: number; number?: string } | undefined;
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, number: String(row?.number || "") };
}

function buildLines(opts: {
  units: UnitRow[];
  catalog: Record<string, { name: string; price: number }>;
  month: string;
  days: number;
  usdPerKwh: number;
  include4pct: boolean;
  garantiaRows: GarantiaConsumoRow[];
  last?: { month: string; lines: LastInvoiceLine[] } | null;
}): { items: HostingAgentLine[]; warning: string } {
  const lastDays = opts.last?.month ? daysInYearMonth(opts.last.month) : 30;
  const lastLodging = (opts.last?.lines ?? []).filter((l) => !/4%\s*gastos operativos transferencia/i.test(l.service));
  const items: HostingAgentLine[] = [];
  let warning = "";

  const sources: UnitRow[] =
    opts.units.length > 0
      ? opts.units
      : lastLodging.map((l, idx) => {
          const key = matchServiceKey(l.service, opts.catalog);
          const cat = opts.catalog[key];
          const g = bestGarantiaRow(opts.garantiaRows, key, cat?.name || l.service);
          return {
            id: idx,
            clientId: 0,
            serviceKey: key,
            serviceName: cat?.name || l.service.replace(/\s*-\s*\d{2}-\d{4}\s*$/, "").trim(),
            quantity: l.quantity,
            watts: g?.consumoW || 0,
            discount: l.discount,
            garantiaId: g?.id ?? null,
          };
        });

  if (sources.length === 0) {
    return { items: [], warning: "Sin equipos cargados ni factura previa para armar el mes." };
  }

  for (const u of sources) {
    if (u.serviceKey === "D") continue;
    const cat = opts.catalog[u.serviceKey] ?? opts.catalog.A!;
    const name = u.serviceName || cat.name;
    const resolved = resolveServiceWatts(opts.garantiaRows, u.serviceKey, name, 0, u.garantiaId || 0);
    const watts = resolved.watts;
    if (resolved.source !== "garantia-asic") {
      warning =
        warning ||
        "Hay que elegir la máquina exacta de Valores de garantías ASIC (marca + modelo + procesador). Un mismo modelo puede tener varios W (por ejemplo S21 235 ths vs 270 ths, o Z15K).";
    }
    const lastMatch = lastLodging.find((l) => matchServiceKey(l.service, opts.catalog) === u.serviceKey);
    let price = 0;
    if (watts > 0) {
      price = priceFromEnergy(watts, opts.days, opts.usdPerKwh);
    } else if (lastMatch) {
      price = scalePriceByDays(lastMatch.price, lastDays, opts.days);
      warning = warning || "Algún equipo no tiene consumo (W); se prorateó el precio de la última factura por días del mes.";
    } else {
      price = scalePriceByDays(cat.price, 30, opts.days);
      warning = warning || "Algún equipo no tiene consumo (W); se usó el precio de catálogo prorateado por días.";
    }
    const discount = lastMatch && lastDays > 0 ? scalePriceByDays(u.discount || lastMatch.discount, lastDays, opts.days) : roundUsd(u.discount);
    items.push({
      serviceKey: u.serviceKey,
      serviceName: name,
      month: opts.month,
      quantity: u.quantity,
      price,
      discount,
      watts,
      kwhMonth: roundUsd(kwhForMonth(watts, opts.days) * u.quantity),
      daysInMonth: opts.days,
      usdPerKwh: opts.usdPerKwh,
      wattsSource: resolved.source,
      garantiaLabel: resolved.garantia
        ? [resolved.garantia.marca, resolved.garantia.modelo, resolved.garantia.procesador].filter(Boolean).join(" · ")
        : "",
    });
  }

  if (opts.include4pct) {
    const lodging = [...items];
    const with4: HostingAgentLine[] = [];
    for (const s of lodging) {
      with4.push(s);
      const base = roundUsd((s.price - (s.discount || 0)) * s.quantity);
      with4.push({
        serviceKey: "D",
        serviceName: BUILTIN_CATALOG.D!.name,
        month: opts.month,
        quantity: 1,
        price: roundUsd(base * 0.04),
        discount: 0,
        watts: 0,
        kwhMonth: 0,
        daysInMonth: opts.days,
        usdPerKwh: opts.usdPerKwh,
      });
    }
    return { items: with4, warning };
  }
  return { items, warning };
}

type DraftStatus = "draft" | "rejected" | "authorized" | "already_emitted";

function mapDraft(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  let items: HostingAgentLine[] = [];
  try {
    const parsed = JSON.parse(String(r.payload_json || "[]"));
    if (Array.isArray(parsed)) items = parsed as HostingAgentLine[];
  } catch {
    items = [];
  }
  return {
    id: Number(r.id) || 0,
    serviceMonth: String(r.service_month || ""),
    clientId: Number(r.client_id) || 0,
    clientName: String(r.client_name || ""),
    daysInMonth: Number(r.days_in_month) || 0,
    usdPerKwh: Number(r.usd_per_kwh) || DEFAULT_USD_PER_KWH,
    status: String(r.status || "draft") as DraftStatus,
    warning: String(r.warning || ""),
    items,
    subtotal: Number(r.subtotal) || 0,
    discounts: Number(r.discounts) || 0,
    total: Number(r.total) || 0,
    invoiceId: r.invoice_id == null || r.invoice_id === "" ? null : Number(r.invoice_id),
    invoiceNumber: String(r.invoice_number || "") || null,
    authorizedAt: String(r.authorized_at || "") || null,
    authorizedBy: String(r.authorized_by || ""),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
  };
}

async function listEnrolled() {
  const rows = (await db
    .prepare(
      `SELECT a.client_id, a.active, a.usd_per_kwh, a.notes, a.include_4pct, c.code, c.name, c.phone, c.email, c.address, c.city, c.name2
       FROM hosting_billing_agent_clients a
       JOIN clients c ON c.id = a.client_id
       WHERE ${HOSTING_ONLY_C}
       ORDER BY c.code ASC`
    )
    .all()) as Record<string, unknown>[];
  const garantiaRows = await loadGarantiaConsumos();
  const out = [];
  for (const raw of rows) {
    const r = rowKeysToLowercase(raw);
    const clientId = Number(r.client_id) || 0;
    const units = (await loadUnits(clientId)).map((u) => {
      const live = resolveServiceWatts(garantiaRows, u.serviceKey, u.serviceName, 0, u.garantiaId || 0);
      return {
        ...u,
        garantiaId: u.garantiaId || live.garantia?.id || null,
        watts: live.watts,
        garantiaLabel: live.garantia
          ? [live.garantia.marca, live.garantia.modelo, live.garantia.procesador].filter(Boolean).join(" · ")
          : "",
      };
    });
    out.push({
      clientId,
      active: !(r.active === 0 || r.active === false || String(r.active) === "0"),
      include4pct: dbFlagOn(r.include_4pct),
      usdPerKwh: r.usd_per_kwh == null || r.usd_per_kwh === "" ? null : Number(r.usd_per_kwh),
      notes: String(r.notes || ""),
      code: String(r.code || ""),
      name: String(r.name || ""),
      phone: String(r.phone || ""),
      email: String(r.email || ""),
      address: String(r.address || ""),
      city: String(r.city || ""),
      name2: String(r.name2 || ""),
      units,
    });
  }
  return out;
}

async function generateDraftsForMonth(month: string): Promise<{ created: number; refreshed: number; skipped: number; already: number }> {
  await ensureAgentSchema();
  if (!isClosedMonth(month)) {
    throw new Error("Solo se genera el mes anterior ya cerrado (facturación a mes vencido).");
  }
  const settings = await loadSettings();
  const catalog = await loadCatalog();
  const garantiaRows = await loadGarantiaConsumos();
  const days = daysInYearMonth(month);
  const enrolled = await listEnrolled();
  const nowIso = new Date().toISOString();
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  let already = 0;

  for (const c of enrolled) {
    if (!c.active) {
      skipped += 1;
      continue;
    }
    const existingDraft = (await db
      .prepare("SELECT * FROM hosting_billing_agent_drafts WHERE client_id = ? AND service_month = ?")
      .get(c.clientId, month)) as Record<string, unknown> | undefined;
    const st = String(existingDraft ? rowKeysToLowercase(existingDraft).status : "");
    if (st === "authorized" || st === "already_emitted") {
      skipped += 1;
      continue;
    }
    const found = await existingFacturaForMonth(c.name, month);
    const last = await lastHostingFacturaLines(c.name);
    const kwh = c.usdPerKwh != null && Number.isFinite(c.usdPerKwh) && (c.usdPerKwh as number) > 0 ? (c.usdPerKwh as number) : settings.usdPerKwh;
    const built = buildLines({
      units: c.units,
      catalog,
      month,
      days,
      usdPerKwh: kwh,
      include4pct: c.include4pct,
      garantiaRows,
      last,
    });
    const totals = lineTotals(built.items);
    const status: DraftStatus = found ? "already_emitted" : "draft";
    const payload = JSON.stringify(built.items);
    const warning = found
      ? `Ya hay factura ${found.number} de hosting para este cliente y mes. El agente no emite otra.`
      : built.warning;

    if (existingDraft) {
      await db
        .prepare(
          `UPDATE hosting_billing_agent_drafts SET client_name = ?, days_in_month = ?, usd_per_kwh = ?, status = ?, warning = ?,
           payload_json = ?, subtotal = ?, discounts = ?, total = ?, invoice_id = ?, invoice_number = ?, updated_at = ?
           WHERE client_id = ? AND service_month = ?`
        )
        .run(
          c.name,
          days,
          kwh,
          status,
          warning,
          payload,
          totals.subtotal,
          totals.discounts,
          totals.total,
          found?.id ?? null,
          found?.number ?? null,
          nowIso,
          c.clientId,
          month
        );
      if (found) already += 1;
      else refreshed += 1;
    } else {
      await db
        .prepare(
          `INSERT INTO hosting_billing_agent_drafts
           (service_month, client_id, client_name, days_in_month, usd_per_kwh, status, warning, payload_json, subtotal, discounts, total, invoice_id, invoice_number, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          month,
          c.clientId,
          c.name,
          days,
          kwh,
          status,
          warning,
          payload,
          totals.subtotal,
          totals.discounts,
          totals.total,
          found?.id ?? null,
          found?.number ?? null,
          nowIso,
          nowIso
        );
      if (found) already += 1;
      else created += 1;
    }
  }
  return { created, refreshed, skipped, already };
}

const TYPE_PREFIX: Record<string, string> = { Factura: "F", Recibo: "RC", "Nota de Crédito": "N" };
const padDigits = 6;
const MAX_NUM = 999999;
const MIN_NUM = 1001;

function parseInvoiceNum(numStr: string, prefix: string): number | null {
  if (!numStr || !numStr.startsWith(prefix)) return null;
  const rest = numStr.slice(prefix.length).replace(/^0+/, "") || "0";
  const n = parseInt(rest, 10);
  return Number.isFinite(n) && n >= MIN_NUM && n <= MAX_NUM ? n : null;
}

async function allocateInvoiceNumber(
  tx: {
    prepare: (s: string) => {
      get: (...p: unknown[]) => Promise<unknown>;
      all: (...p: unknown[]) => Promise<unknown[]>;
      run: (...p: unknown[]) => Promise<{ changes: number; lastInsertRowid: number | null }>;
    };
  },
  type: string
): Promise<string> {
  const prefix = TYPE_PREFIX[type] ?? "F";
  const formatNumber = (n: number) => `${prefix}${String(Math.min(MAX_NUM, Math.max(MIN_NUM, n))).padStart(padDigits, "0")}`;
  const seqRow = (await tx.prepare("SELECT last_number FROM invoice_sequences WHERE type = ?").get(type)) as { last_number: number } | undefined;
  const seqVal = seqRow?.last_number ?? 1000;
  const rows = (await tx.prepare("SELECT number FROM invoices WHERE type = ?").all(type)) as { number: string }[];
  const nums = (Array.isArray(rows) ? rows : [])
    .map((r) => parseInvoiceNum(String(r?.number ?? ""), prefix))
    .filter((n): n is number => n != null);
  const maxInDb = nums.length > 0 ? Math.max(...nums) : 0;
  const nextNum = Math.max(seqVal, maxInDb, MIN_NUM - 1) + 1;
  const use = nextNum > MAX_NUM ? MIN_NUM : nextNum;
  await tx.prepare("UPDATE invoice_sequences SET last_number = ? WHERE type = ?").run(use, type);
  return formatNumber(use);
}

hostingBillingAgentRouter.get("/hosting/billing-agent", ...staffRead, async (_req, res) => {
  try {
    await ensureAgentSchema();
    const settings = await loadSettings();
    const catalog = await loadCatalog();
    const garantiaRows = await loadGarantiaConsumos();
    const clients = await listEnrolled();
    const closed = previousClosedMonth();
    res.json({
      settings,
      catalog: Object.entries(catalog)
        .filter(([k]) => k !== "D")
        .map(([code, v]) => {
          const live = resolveServiceWatts(garantiaRows, code, v.name, 0);
          return {
            code,
            name: v.name,
            price: v.price,
            defaultWatts: live.watts,
            wattsFromGarantia: live.source === "garantia-asic",
          };
        }),
      garantias: garantiaRows
        .filter((r) => r.consumoW > 0)
        .map((r) => mapGarantiaOption(r, catalog))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
      clients,
      defaultClosedMonth: closed,
      daysInDefaultMonth: daysInYearMonth(closed),
      asOf: ymdInAsuncion(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/test-preview", ...staffRead, async (req, res) => {
  const parsed = z
    .object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      clientId: z.coerce.number().int().positive().optional(),
      usdPerKwh: z.coerce.number().min(0.001).max(5).optional(),
      include4pct: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { message: "Indicá un mes válido (YYYY-MM) para el testing." } });
  try {
    await ensureAgentSchema();
    const settings = await loadSettings();
    const catalog = await loadCatalog();
    const garantiaRows = await loadGarantiaConsumos();
    const month = parsed.data.month;
    const days = daysInYearMonth(month);
    const usdPerKwh = parsed.data.usdPerKwh ?? settings.usdPerKwh;
    const enrolled = await listEnrolled();

    type Target = {
      clientId: number;
      name: string;
      code: string;
      units: UnitRow[];
      enrolled: boolean;
      include4pct: boolean;
    };
    const targets: Target[] = [];
    if (parsed.data.clientId) {
      const enr = enrolled.find((c) => c.clientId === parsed.data.clientId);
      const c = (await db
        .prepare(`SELECT id, code, name FROM clients WHERE id = ? AND ${HOSTING_ONLY}`)
        .get(parsed.data.clientId)) as { id?: number; code?: string; name?: string } | undefined;
      if (!c?.id) return res.status(404).json({ error: { message: "Cliente de hosting no encontrado." } });
      const lastForFlag = enr ? null : await lastHostingFacturaLines(String(c.name || ""));
      targets.push({
        clientId: Number(c.id),
        name: String(c.name || ""),
        code: String(c.code || ""),
        units: enr?.units ?? [],
        enrolled: Boolean(enr),
        include4pct:
          parsed.data.include4pct ?? (enr ? enr.include4pct : lastLinesHave4pct(lastForFlag?.lines ?? [])),
      });
    } else {
      for (const c of enrolled.filter((x) => x.active)) {
        targets.push({
          clientId: c.clientId,
          name: c.name,
          code: c.code,
          units: c.units,
          enrolled: true,
          include4pct: parsed.data.include4pct ?? c.include4pct,
        });
      }
    }
    if (targets.length === 0) {
      return res.status(400).json({
        error: { message: "Elegí un cliente para el testing, o agregá clientes al agente." },
      });
    }

    const previews = [];
    for (const t of targets) {
      const last = await lastHostingFacturaLines(t.name);
      const found = await existingFacturaForMonth(t.name, month);
      const built = buildLines({
        units: t.units,
        catalog,
        month,
        days,
        usdPerKwh,
        include4pct: t.include4pct,
        garantiaRows,
        last,
      });
      const totals = lineTotals(built.items);
      const lodging = built.items.filter((i) => i.serviceKey !== "D");
      const garantiaOk = lodging.length > 0 && lodging.every((i) => i.wattsSource === "garantia-asic" && i.watts > 0);
      previews.push({
        clientId: t.clientId,
        clientCode: t.code,
        clientName: t.name,
        enrolled: t.enrolled,
        include4pct: t.include4pct,
        existingInvoiceNumber: found?.number ?? null,
        warning: found
          ? `Testing: ya existe ${found.number} para este mes (el agente no la duplicaría).`
          : built.warning,
        items: built.items,
        subtotal: totals.subtotal,
        discounts: totals.discounts,
        total: totals.total,
        kwhTotal: lodging.reduce((a, i) => a + (i.kwhMonth || 0), 0),
        checks: {
          daysInMonth: days,
          wattsFromGarantiaAsic: garantiaOk,
          hasItems: built.items.length > 0,
          totalPositive: totals.total > 0,
          wouldEmit: false,
        },
      });
    }

    res.json({
      testing: true,
      emitsInvoice: false,
      savesDraft: false,
      month,
      daysInMonth: days,
      usdPerKwh,
      garantiaRows: garantiaRows.length,
      formula: "kWh = (W / 1000) × 24 × días del mes × cantidad de equipos",
      previews,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.put("/hosting/billing-agent/settings", ...staffWrite, async (req, res) => {
  const parsed = z
    .object({
      usdPerKwh: z.coerce.number().min(0.001).max(5),
      dueDateDays: z.union([z.literal(5), z.literal(6), z.literal(7)]),
      include4pct: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Datos de configuración inválidos." } });
  try {
    await ensureAgentSchema();
    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE hosting_billing_agent_settings SET usd_per_kwh = ?, due_date_days = ?, updated_at = ? WHERE id = 1`)
      .run(parsed.data.usdPerKwh, parsed.data.dueDateDays, now);
    res.json({ ok: true, settings: await loadSettings() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/clients", ...staffWrite, async (req, res) => {
  const parsed = z
    .object({
      clientId: z.coerce.number().int().positive(),
      include4pct: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Cliente inválido." } });
  try {
    await ensureAgentSchema();
    const c = (await db
      .prepare(`SELECT id, name FROM clients WHERE id = ? AND ${HOSTING_ONLY}`)
      .get(parsed.data.clientId)) as { id?: number; name?: string } | undefined;
    if (!c?.id) return res.status(404).json({ error: { message: "Cliente de hosting no encontrado." } });
    const now = new Date().toISOString();
    const last = await lastHostingFacturaLines(String(c.name || ""));
    const include4pct = parsed.data.include4pct ?? lastLinesHave4pct(last?.lines ?? []);
    await db
      .prepare(
        `INSERT INTO hosting_billing_agent_clients (client_id, active, notes, include_4pct, updated_at)
         VALUES (?, 1, '', ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET active = 1, updated_at = excluded.updated_at`
      )
      .run(parsed.data.clientId, include4pct ? 1 : 0, now);
    const existingUnits = await loadUnits(parsed.data.clientId);
    if (existingUnits.length === 0 && last) {
      const catalog = await loadCatalog();
      const garantiaRows = await loadGarantiaConsumos();
      const lodging = last.lines.filter((l) => !/4%\s*gastos operativos transferencia/i.test(l.service));
      let order = 0;
      for (const l of lodging) {
        const key = matchServiceKey(l.service, catalog);
        const cat = catalog[key];
        const live = resolveServiceWatts(garantiaRows, key, cat?.name || l.service, 0);
        await db
          .prepare(
            `INSERT INTO hosting_billing_agent_units (client_id, service_key, service_name, quantity, watts, discount, sort_order, garantia_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(parsed.data.clientId, key, cat?.name || l.service, l.quantity, live.watts, l.discount, order, live.garantia?.id ?? null);
        order += 1;
      }
    }
    res.json({ ok: true, clients: await listEnrolled() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.patch("/hosting/billing-agent/clients/:clientId", ...staffWrite, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const parsed = z
    .object({
      active: z.boolean().optional(),
      include4pct: z.boolean().optional(),
      usdPerKwh: z.union([z.coerce.number().min(0.001).max(5), z.null()]).optional(),
      notes: z.string().max(400).optional(),
    })
    .safeParse(req.body);
  if (!Number.isFinite(clientId) || clientId <= 0 || !parsed.success) {
    return res.status(400).json({ error: { message: "Datos inválidos." } });
  }
  try {
    await ensureAgentSchema();
    const cur = (await db.prepare("SELECT client_id FROM hosting_billing_agent_clients WHERE client_id = ?").get(clientId)) as
      | { client_id?: number }
      | undefined;
    if (!cur?.client_id) return res.status(404).json({ error: { message: "El cliente no está en el agente." } });
    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];
    if (parsed.data.active != null) {
      fields.push("active = ?");
      values.push(parsed.data.active ? 1 : 0);
    }
    if (parsed.data.include4pct != null) {
      fields.push("include_4pct = ?");
      values.push(parsed.data.include4pct ? 1 : 0);
    }
    if (parsed.data.usdPerKwh !== undefined) {
      fields.push("usd_per_kwh = ?");
      values.push(parsed.data.usdPerKwh);
    }
    if (parsed.data.notes != null) {
      fields.push("notes = ?");
      values.push(parsed.data.notes);
    }
    values.push(clientId);
    await db.prepare(`UPDATE hosting_billing_agent_clients SET ${fields.join(", ")} WHERE client_id = ?`).run(...values);
    res.json({ ok: true, clients: await listEnrolled() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.delete("/hosting/billing-agent/clients/:clientId", ...staffWrite, async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId) || clientId <= 0) return res.status(400).json({ error: { message: "Cliente inválido." } });
  try {
    await ensureAgentSchema();
    await db.prepare("DELETE FROM hosting_billing_agent_units WHERE client_id = ?").run(clientId);
    await db.prepare("DELETE FROM hosting_billing_agent_clients WHERE client_id = ?").run(clientId);
    res.json({ ok: true, clients: await listEnrolled() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

const UnitBody = z.object({
  serviceKey: z.string().trim().min(1).max(12).optional(),
  garantiaId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().int().min(1).max(9999),
  watts: z.coerce.number().min(0).max(100000).optional(),
  discount: z.coerce.number().min(0).max(999999).optional(),
});

hostingBillingAgentRouter.put("/hosting/billing-agent/clients/:clientId/units", ...staffWrite, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const parsed = z.object({ units: z.array(UnitBody).max(80) }).safeParse(req.body);
  if (!Number.isFinite(clientId) || clientId <= 0 || !parsed.success) {
    return res.status(400).json({ error: { message: "Equipos inválidos." } });
  }
  try {
    await ensureAgentSchema();
    const enrolled = (await db.prepare("SELECT client_id FROM hosting_billing_agent_clients WHERE client_id = ?").get(clientId)) as
      | { client_id?: number }
      | undefined;
    if (!enrolled?.client_id) return res.status(404).json({ error: { message: "El cliente no está en el agente." } });
    const catalog = await loadCatalog();
    const garantiaRows = await loadGarantiaConsumos();
    await db.prepare("DELETE FROM hosting_billing_agent_units WHERE client_id = ?").run(clientId);
    let order = 0;
    for (const u of parsed.data.units) {
      const gRow = u.garantiaId ? garantiaRows.find((r) => r.id === u.garantiaId) : null;
      const mapped = gRow ? mapGarantiaOption(gRow, catalog) : null;
      const key = (mapped?.serviceKey || u.serviceKey || "A").toUpperCase();
      if (key === "D") continue;
      const cat = catalog[key];
      const name = mapped?.serviceName || cat?.name;
      if (!name) continue;
      const live = resolveServiceWatts(garantiaRows, key, name, 0, mapped?.id || 0);
      await db
        .prepare(
          `INSERT INTO hosting_billing_agent_units (client_id, service_key, service_name, quantity, watts, discount, sort_order, garantia_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(clientId, key, name, u.quantity, live.watts, u.discount ?? 0, order, mapped?.id ?? live.garantia?.id ?? null);
      order += 1;
    }
    res.json({ ok: true, clients: await listEnrolled() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/clients/:clientId/import-last-invoice", ...staffWrite, async (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isFinite(clientId) || clientId <= 0) return res.status(400).json({ error: { message: "Cliente inválido." } });
  try {
    await ensureAgentSchema();
    const c = (await db.prepare("SELECT id, name FROM clients WHERE id = ?").get(clientId)) as { id?: number; name?: string } | undefined;
    if (!c?.id) return res.status(404).json({ error: { message: "Cliente no encontrado." } });
    const last = await lastHostingFacturaLines(String(c.name || ""));
    if (!last || last.lines.length === 0) {
      return res.status(404).json({ error: { message: "Este cliente no tiene una factura de hosting previa." } });
    }
    const catalog = await loadCatalog();
    const garantiaRows = await loadGarantiaConsumos();
    await db.prepare("DELETE FROM hosting_billing_agent_units WHERE client_id = ?").run(clientId);
    const lodging = last.lines.filter((l) => !/4%\s*gastos operativos transferencia/i.test(l.service));
    let order = 0;
    for (const l of lodging) {
      const key = matchServiceKey(l.service, catalog);
      const cat = catalog[key];
      const live = resolveServiceWatts(garantiaRows, key, cat?.name || l.service, 0);
      await db
        .prepare(
          `INSERT INTO hosting_billing_agent_units (client_id, service_key, service_name, quantity, watts, discount, sort_order, garantia_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(clientId, key, cat?.name || l.service, l.quantity, live.watts, l.discount, order, live.garantia?.id ?? null);
      order += 1;
    }
    res.json({ ok: true, importedFromMonth: last.month, clients: await listEnrolled() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.get("/hosting/billing-agent/drafts", ...staffRead, async (req, res) => {
  try {
    await ensureAgentSchema();
    const q = String(req.query.month || "").trim();
    const month = parseYearMonth(q) ? q : previousClosedMonth();
    const rows = (await db
      .prepare(
        `SELECT * FROM hosting_billing_agent_drafts WHERE service_month = ? ORDER BY client_name ASC, id ASC`
      )
      .all(month)) as Record<string, unknown>[];
    res.json({
      month,
      daysInMonth: daysInYearMonth(month),
      monthLabel: monthSuffixLabel(month),
      closed: isClosedMonth(month),
      drafts: rows.map(mapDraft),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/generate", ...staffWrite, async (req, res) => {
  const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { message: "Mes inválido." } });
  try {
    const month = parsed.data.month && isClosedMonth(parsed.data.month) ? parsed.data.month : previousClosedMonth();
    const summary = await generateDraftsForMonth(month);
    const rows = (await db
      .prepare(`SELECT * FROM hosting_billing_agent_drafts WHERE service_month = ? ORDER BY client_name ASC, id ASC`)
      .all(month)) as Record<string, unknown>[];
    res.json({
      ok: true,
      month,
      daysInMonth: daysInYearMonth(month),
      summary,
      drafts: rows.map(mapDraft),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/drafts/:id/reject", ...staffWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: { message: "Borrador inválido." } });
  try {
    await ensureAgentSchema();
    const row = (await db.prepare("SELECT * FROM hosting_billing_agent_drafts WHERE id = ?").get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Borrador no encontrado." } });
    const d = mapDraft(row);
    if (d.status === "authorized") {
      return res.status(409).json({ error: { message: "Esa factura ya fue autorizada; no se puede rechazar." } });
    }
    await db
      .prepare("UPDATE hosting_billing_agent_drafts SET status = 'rejected', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    const fresh = (await db.prepare("SELECT * FROM hosting_billing_agent_drafts WHERE id = ?").get(id)) as Record<string, unknown>;
    res.json({ ok: true, draft: mapDraft(fresh) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

hostingBillingAgentRouter.post("/hosting/billing-agent/drafts/:id/authorize", ...staffWrite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: { message: "Borrador inválido." } });
  try {
    await ensureAgentSchema();
    const settings = await loadSettings();
    const row = (await db.prepare("SELECT * FROM hosting_billing_agent_drafts WHERE id = ?").get(id)) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: { message: "Borrador no encontrado." } });
    const draft = mapDraft(row);
    if (draft.status === "authorized") {
      return res.status(409).json({ error: { message: `Ya está autorizada como ${draft.invoiceNumber}.` } });
    }
    if (draft.status === "already_emitted") {
      return res.status(409).json({ error: { message: "Este mes ya tiene una factura de hosting emitida para ese cliente." } });
    }
    if (draft.status === "rejected") {
      return res.status(409).json({ error: { message: "El borrador está rechazado. Generá de nuevo el mes para revisarlo." } });
    }
    if (!draft.items.length || draft.total <= 0) {
      return res.status(400).json({ error: { message: "No hay ítems o el total es 0. Cargá equipos y volvé a generar." } });
    }
    const found = await existingFacturaForMonth(draft.clientName, draft.serviceMonth);
    if (found) {
      await db
        .prepare(
          `UPDATE hosting_billing_agent_drafts SET status = 'already_emitted', invoice_id = ?, invoice_number = ?, updated_at = ? WHERE id = ?`
        )
        .run(found.id, found.number, new Date().toISOString(), id);
      return res.status(409).json({ error: { message: `Ya existe ${found.number} para este cliente y mes.` } });
    }

    const now = new Date();
    const dateStr = formatPyDate(now);
    const emissionTime = formatPyTime(now);
    const dueDate = addDaysPy(now, settings.dueDateDays);
    const who = String(req.user?.email || req.user?.username || "").slice(0, 120);

    const created = await db.transaction(async (tx) => {
      const numberToUse = await allocateInvoiceNumber(tx as never, "Factura");
      const info = await tx
        .prepare(
          `INSERT INTO invoices (number, type, ${clientNameCol()}, date, month, subtotal, discounts, total,
                                related_invoice_id, related_invoice_number, payment_date, emission_time, due_date, source, document_context, margin_usd)
           VALUES (?, 'Factura', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'hosting', NULL, NULL)`
        )
        .run(
          numberToUse,
          draft.clientName,
          dateStr,
          draft.serviceMonth,
          draft.subtotal,
          draft.discounts,
          draft.total,
          emissionTime,
          dueDate
        );
      let invoiceId = Number(info.lastInsertRowid);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
        const byNumber = (await tx.prepare("SELECT id FROM invoices WHERE number = ?").get(numberToUse)) as { id?: number } | undefined;
        invoiceId = Number(byNumber?.id);
      }
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new Error("No se obtuvo el ID de la factura.");
      const insertItem = tx.prepare(
        "INSERT INTO invoice_items (invoice_id, service, month, quantity, price, discount) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const it of draft.items) {
        await insertItem.run(
          invoiceId,
          normalizeInvoiceServiceStored(storedServiceDescription(it.serviceName, it.month)),
          it.month,
          it.quantity,
          it.price,
          it.discount
        );
      }
      return { invoiceId, number: numberToUse, dateStr, emissionTime, dueDate };
    });

    const clientRow = (await db
      .prepare("SELECT name, name2, phone, email, address, city, phone2, email2, address2, city2 FROM clients WHERE id = ?")
      .get(draft.clientId)) as Record<string, unknown> | undefined;
    const cr = clientRow ? rowKeysToLowercase(clientRow) : {};
    const invoiceJson = {
      id: String(created.invoiceId),
      number: created.number,
      type: "Factura",
      clientName: draft.clientName,
      clientPhone: String(cr.phone || ""),
      clientEmail: String(cr.email || ""),
      clientAddress: String(cr.address || ""),
      clientCity: String(cr.city || ""),
      clientName2: String(cr.name2 || ""),
      clientPhone2: String(cr.phone2 || ""),
      clientEmail2: String(cr.email2 || ""),
      clientAddress2: String(cr.address2 || ""),
      clientCity2: String(cr.city2 || ""),
      date: created.dateStr,
      emissionTime: created.emissionTime,
      dueDate: created.dueDate,
      month: draft.serviceMonth,
      subtotal: draft.subtotal,
      discounts: draft.discounts,
      total: draft.total,
      items: draft.items.map((it) => ({
        serviceKey: it.serviceKey,
        serviceName: it.serviceName,
        month: it.month,
        quantity: it.quantity,
        price: it.price,
        discount: it.discount,
      })),
    };
    try {
      await db
        .prepare(`INSERT INTO emitted_documents (source, invoice_json, emitted_at, emitted_by) VALUES (?, ?, ?, ?)`)
        .run("hosting", JSON.stringify(invoiceJson), now.toISOString(), req.user?.id ?? null);
    } catch {
      /* emitted es auxiliar */
    }

    await db
      .prepare(
        `UPDATE hosting_billing_agent_drafts
         SET status = 'authorized', invoice_id = ?, invoice_number = ?, authorized_at = ?, authorized_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(created.invoiceId, created.number, now.toISOString(), who, now.toISOString(), id);

    const fresh = (await db.prepare("SELECT * FROM hosting_billing_agent_drafts WHERE id = ?").get(id)) as Record<string, unknown>;
    res.json({ ok: true, draft: mapDraft(fresh), invoice: invoiceJson });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: { message: msg } });
  }
});

export async function hostingBillingAgentCronHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = String(req.headers.authorization ?? "");
    const cronHeader = String(req.headers["x-vercel-cron"] ?? "").trim().toLowerCase();
    const ua = String(req.headers["user-agent"] ?? "").toLowerCase();
    const secret = String(process.env.CRON_SECRET ?? "").trim();
    const okBearer = Boolean(secret) && (auth === `Bearer ${secret}` || auth === `Bearer ${secret.trim()}`);
    const q = String((req.query as { secret?: unknown; token?: unknown } | undefined)?.secret ?? (req.query as { token?: unknown } | undefined)?.token ?? "");
    const okQuery = Boolean(secret) && q === secret;
    const okVercel = cronHeader === "1" || cronHeader === "true" || ua.includes("vercel-cron");
    if (!okBearer && !okQuery && !okVercel) {
      res.status(401).json({ error: { message: "No autorizado." } });
      return;
    }
    const { day } = ymdInAsuncion();
    if (day < 1 || day > 7) {
      res.json({ ok: true, skipped: true, reason: "Fuera de la ventana de mes vencido (días 1–7)." });
      return;
    }
    const month = previousClosedMonth();
    const summary = await generateDraftsForMonth(month);
    res.json({ ok: true, month, summary, authorized: false });
  } catch (e) {
    next(e);
  }
}
