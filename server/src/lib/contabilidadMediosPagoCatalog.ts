import type { AuthUser } from "../middleware/auth.js";
import { db } from "../db.js";

/** Único usuario autorizado a editar el catálogo de medios de pago (pedido explícito). */
export const MEDIOS_PAGO_CATALOG_ADMIN_EMAIL = "jv@hashrate.space";

export const CONTABILIDAD_MEDIOS_PAGO_SEED = [
  "USD BANCO SANTANDER UY",
  "USD BANCO INTERFISA",
  "USD BANCO BROU UY",
  "USD ITAU UY",
  "USD BANCO ITAU UY",
  "USD BANCO ITAU PY",
  "USD BBVA UY",
  "USD SCOTIABANK UY",
  "USD UENO BANK PY",
  "USDT BINANCE",
  "USDC BINANCE",
  "USD EFECTIVO",
  "PESOS URUGUAYOS EFECTIVO",
  "PESOS URUGUAYOS SCOTIABANK UY",
  "PESOS ARGENTINOS EFECTIVO",
  "REALES BRASIL EFECTIVO",
  "GS EFECTIVO",
  "GS UENO BANK PY",
] as const;

export type ContabilidadMedioPagoClase = "FIAT" | "CRIPTO";

export type ContabilidadMedioPagoRow = {
  id: number;
  codigo: string;
  logoUrl: string;
  clase: ContabilidadMedioPagoClase;
  sortOrder: number;
  activo: boolean;
};

let schemaEnsured = false;

export function isMediosPagoCatalogAdmin(user: AuthUser | undefined | null): boolean {
  if (!user) return false;
  const email = String(user.email ?? "").trim().toLowerCase();
  const username = String(user.username ?? "").trim().toLowerCase();
  const target = MEDIOS_PAGO_CATALOG_ADMIN_EMAIL.toLowerCase();
  return email === target || username === target;
}

export function inferMedioPagoClase(codigo: string): ContabilidadMedioPagoClase {
  const t = String(codigo ?? "")
    .trim()
    .toUpperCase();
  if (/\bUSDT\b|\bUSDC\b|\bBINANCE\b|\bCRIPTO\b|\bCRYPTO\b|\bBTC\b|\bETH\b/.test(t)) {
    return "CRIPTO";
  }
  return "FIAT";
}

function normalizeClase(raw: unknown, codigoFallback: string): ContabilidadMedioPagoClase {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "CRIPTO" || t === "CRYPTO") return "CRIPTO";
  if (t === "FIAT") return "FIAT";
  return inferMedioPagoClase(codigoFallback);
}

function mapRow(raw: Record<string, unknown>): ContabilidadMedioPagoRow {
  const codigo = String(raw.codigo ?? "").trim();
  return {
    id: Number(raw.id ?? 0),
    codigo,
    logoUrl: String(raw.logo_url ?? "").trim(),
    clase: normalizeClase(raw.clase, codigo),
    sortOrder: Number(raw.sort_order ?? 0),
    activo: Number(raw.activo ?? 1) !== 0,
  };
}

export async function ensureContabilidadMediosPagoSchema(): Promise<void> {
  if (schemaEnsured) return;

  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS contabilidad_medios_pago (
          id BIGSERIAL PRIMARY KEY,
          codigo TEXT NOT NULL,
          logo_url TEXT NOT NULL DEFAULT '',
          clase TEXT NOT NULL DEFAULT 'FIAT',
          sort_order INTEGER NOT NULL DEFAULT 0,
          activo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_contabilidad_medios_pago_codigo
         ON contabilidad_medios_pago (LOWER(codigo))`
      )
      .run();
    try {
      await db.prepare(`ALTER TABLE contabilidad_medios_pago ADD COLUMN IF NOT EXISTS clase TEXT NOT NULL DEFAULT 'FIAT'`).run();
    } catch {
      /* ignore */
    }
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS contabilidad_medios_pago (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT NOT NULL,
          logo_url TEXT NOT NULL DEFAULT '',
          clase TEXT NOT NULL DEFAULT 'FIAT',
          sort_order INTEGER NOT NULL DEFAULT 0,
          activo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_contabilidad_medios_pago_codigo
         ON contabilidad_medios_pago (codigo COLLATE NOCASE)`
      )
      .run();
    try {
      await db.prepare(`ALTER TABLE contabilidad_medios_pago ADD COLUMN clase TEXT NOT NULL DEFAULT 'FIAT'`).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  await seedContabilidadMediosPagoIfEmpty();
  await backfillMedioPagoClaseFromCodigo();
  schemaEnsured = true;
}

async function backfillMedioPagoClaseFromCodigo(): Promise<void> {
  const anyCripto = (await db
    .prepare(`SELECT id FROM contabilidad_medios_pago WHERE UPPER(TRIM(clase)) = 'CRIPTO' LIMIT 1`)
    .get()) as { id?: number } | undefined;
  if (anyCripto?.id) return;

  const rows = (await db.prepare(`SELECT id, codigo FROM contabilidad_medios_pago`).all()) as Array<{
    id?: number;
    codigo?: string;
  }>;
  for (const row of rows) {
    const id = Number(row.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (inferMedioPagoClase(String(row.codigo ?? "")) !== "CRIPTO") continue;
    await db.prepare(`UPDATE contabilidad_medios_pago SET clase = 'CRIPTO' WHERE id = ?`).run(id);
  }
}

async function seedContabilidadMediosPagoIfEmpty(): Promise<void> {
  const countRow = (await db.prepare("SELECT COUNT(*) AS c FROM contabilidad_medios_pago").get()) as
    | { c?: number | string }
    | undefined;
  const count = Number(countRow?.c ?? 0);
  if (Number.isFinite(count) && count > 0) return;

  const now = new Date().toISOString();
  const insert = await db.prepare(
    `INSERT INTO contabilidad_medios_pago (codigo, logo_url, clase, sort_order, activo, created_at, updated_at)
     VALUES (?, '', ?, ?, 1, ?, ?)`
  );
  let order = 0;
  for (const codigo of CONTABILIDAD_MEDIOS_PAGO_SEED) {
    await insert.run(codigo, inferMedioPagoClase(codigo), order++, now, now);
  }
}

export async function listContabilidadMediosPago(opts?: { includeInactive?: boolean }): Promise<ContabilidadMedioPagoRow[]> {
  await ensureContabilidadMediosPagoSchema();
  const includeInactive = Boolean(opts?.includeInactive);
  const rows = (await db
    .prepare(
      includeInactive
        ? `SELECT id, codigo, logo_url, clase, sort_order, activo
           FROM contabilidad_medios_pago
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, codigo, logo_url, clase, sort_order, activo
           FROM contabilidad_medios_pago
           WHERE activo = 1
           ORDER BY sort_order ASC, id ASC`
    )
    .all()) as Record<string, unknown>[];
  return rows.map(mapRow).filter((r) => r.codigo);
}

export async function contabilidadMedioPagoExists(codigo: string): Promise<boolean> {
  await ensureContabilidadMediosPagoSchema();
  const t = String(codigo ?? "").trim();
  if (!t) return false;
  const row = (await db
    .prepare(
      `SELECT id FROM contabilidad_medios_pago
       WHERE activo = 1 AND LOWER(codigo) = LOWER(?)
       LIMIT 1`
    )
    .get(t)) as { id?: number } | undefined;
  return Boolean(row?.id);
}

export async function getContabilidadMedioPagoById(id: number): Promise<ContabilidadMedioPagoRow | null> {
  await ensureContabilidadMediosPagoSchema();
  const row = (await db
    .prepare(`SELECT id, codigo, logo_url, clase, sort_order, activo FROM contabilidad_medios_pago WHERE id = ?`)
    .get(id)) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function createContabilidadMedioPago(
  codigo: string,
  clase?: ContabilidadMedioPagoClase
): Promise<ContabilidadMedioPagoRow> {
  await ensureContabilidadMediosPagoSchema();
  const code = String(codigo ?? "").trim().toUpperCase();
  if (!code) throw new Error("CODIGO_VACIO");
  if (code.length > 80) throw new Error("CODIGO_LARGO");

  const existing = (await db
    .prepare(`SELECT id FROM contabilidad_medios_pago WHERE LOWER(codigo) = LOWER(?) LIMIT 1`)
    .get(code)) as { id?: number } | undefined;
  if (existing?.id) throw new Error("CODIGO_DUPLICADO");

  const maxRow = (await db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM contabilidad_medios_pago`).get()) as
    | { m?: number }
    | undefined;
  const sortOrder = Number(maxRow?.m ?? -1) + 1;
  const now = new Date().toISOString();
  const claseVal = clase === "CRIPTO" || clase === "FIAT" ? clase : inferMedioPagoClase(code);

  const result = await db
    .prepare(
      `INSERT INTO contabilidad_medios_pago (codigo, logo_url, clase, sort_order, activo, created_at, updated_at)
       VALUES (?, '', ?, ?, 1, ?, ?)`
    )
    .run(code, claseVal, sortOrder, now, now);

  const insertedId = Number(result.lastInsertRowid ?? 0);
  const inserted = await getContabilidadMedioPagoById(insertedId);
  if (!inserted) throw new Error("INSERT_FAIL");
  return inserted;
}

export async function updateContabilidadMedioPago(
  id: number,
  patch: { codigo?: string; clase?: ContabilidadMedioPagoClase }
): Promise<ContabilidadMedioPagoRow> {
  await ensureContabilidadMediosPagoSchema();
  const existing = await getContabilidadMedioPagoById(id);
  if (!existing) throw new Error("NO_ENCONTRADO");

  let nextCodigo = existing.codigo;
  if (patch.codigo != null) {
    const code = String(patch.codigo ?? "").trim().toUpperCase();
    if (!code) throw new Error("CODIGO_VACIO");
    if (code.length > 80) throw new Error("CODIGO_LARGO");
    const conflict = (await db
      .prepare(`SELECT id FROM contabilidad_medios_pago WHERE LOWER(codigo) = LOWER(?) AND id <> ? LIMIT 1`)
      .get(code, id)) as { id?: number } | undefined;
    if (conflict?.id) throw new Error("CODIGO_DUPLICADO");
    nextCodigo = code;
  }

  let nextClase = existing.clase;
  if (patch.clase === "FIAT" || patch.clase === "CRIPTO") {
    nextClase = patch.clase;
  }

  if (nextCodigo === existing.codigo && nextClase === existing.clase) {
    return existing;
  }

  const now = new Date().toISOString();
  const oldCode = existing.codigo;
  await db
    .prepare(`UPDATE contabilidad_medios_pago SET codigo = ?, clase = ?, updated_at = ? WHERE id = ?`)
    .run(nextCodigo, nextClase, now, id);

  if (oldCode !== nextCodigo) {
    try {
      await db.prepare(`UPDATE contabilidad_gastos SET medio_pago = ? WHERE medio_pago = ?`).run(nextCodigo, oldCode);
    } catch {
      /* tabla puede no existir en tests aislados */
    }
  }

  const updated = await getContabilidadMedioPagoById(id);
  if (!updated) throw new Error("UPDATE_FAIL");
  return updated;
}

/** @deprecated Prefer updateContabilidadMedioPago */
export async function updateContabilidadMedioPagoCodigo(
  id: number,
  nuevoCodigo: string
): Promise<ContabilidadMedioPagoRow> {
  return updateContabilidadMedioPago(id, { codigo: nuevoCodigo });
}

export async function updateContabilidadMedioPagoLogo(id: number, logoUrl: string): Promise<ContabilidadMedioPagoRow> {
  await ensureContabilidadMediosPagoSchema();
  const existing = await getContabilidadMedioPagoById(id);
  if (!existing) throw new Error("NO_ENCONTRADO");
  const url = String(logoUrl ?? "").trim();
  if (!url) throw new Error("LOGO_VACIO");
  if (url.length > 2_000_000) throw new Error("LOGO_GRANDE");

  const now = new Date().toISOString();
  await db.prepare(`UPDATE contabilidad_medios_pago SET logo_url = ?, updated_at = ? WHERE id = ?`).run(url, now, id);
  const updated = await getContabilidadMedioPagoById(id);
  if (!updated) throw new Error("UPDATE_FAIL");
  return updated;
}

/** Soft-delete: marca inactivo (deja de listarse; gastos históricos conservan el texto). */
export async function deactivateContabilidadMedioPago(id: number): Promise<void> {
  await ensureContabilidadMediosPagoSchema();
  const existing = await getContabilidadMedioPagoById(id);
  if (!existing) throw new Error("NO_ENCONTRADO");
  const now = new Date().toISOString();
  await db.prepare(`UPDATE contabilidad_medios_pago SET activo = 0, updated_at = ? WHERE id = ?`).run(now, id);
}
