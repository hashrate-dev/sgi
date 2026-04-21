import { db, getDb } from "../db.js";

export const CORP_BEST_SELLING_EQUIPO_IDS_KV_KEY = "corp_best_selling_asic_ids";
export const CORP_INTERESTING_EQUIPO_IDS_KV_KEY = "corp_interesting_asic_ids";
export const MARKETPLACE_HIDE_PRICES_FOR_GUESTS_KV_KEY = "marketplace_hide_prices_for_guests";

const MAX_BEST_SELLING = 4;
const MAX_INTERESTING = 4;

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

/** JSON array de IDs en orden, sin duplicados, hasta `max` elementos. */
export function parseOrderedEquipoIdsJson(raw: string | null | undefined, max: number): string[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of j) {
      if (typeof x !== "string") continue;
      const id = x.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function parseCorpBestSellingIdsJson(raw: string | null | undefined): string[] {
  return parseOrderedEquipoIdsJson(raw, MAX_BEST_SELLING);
}

export function parseCorpInterestingIdsJson(raw: string | null | undefined): string[] {
  return parseOrderedEquipoIdsJson(raw, MAX_INTERESTING);
}

async function readKvIds(key: string, max: number): Promise<string[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(key)) as
    | { value: string }
    | undefined;
  return parseOrderedEquipoIdsJson(row?.value, max);
}

async function writeKvIds(key: string, ids: string[], max: number): Promise<void> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const x of ids) {
    const id = String(x ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= max) break;
  }
  const json = JSON.stringify(unique);
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO marketplace_site_kv (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value
         RETURNING key`
      )
      .get(key, json);
  } else {
    await db.prepare("INSERT OR REPLACE INTO marketplace_site_kv (key, value) VALUES (?, ?)").run(key, json);
  }
}

export async function readCorpBestSellingEquipoIds(): Promise<string[]> {
  return readKvIds(CORP_BEST_SELLING_EQUIPO_IDS_KV_KEY, MAX_BEST_SELLING);
}

export async function writeCorpBestSellingEquipoIds(ids: string[]): Promise<void> {
  return writeKvIds(CORP_BEST_SELLING_EQUIPO_IDS_KV_KEY, ids, MAX_BEST_SELLING);
}

export async function readCorpInterestingEquipoIds(): Promise<string[]> {
  return readKvIds(CORP_INTERESTING_EQUIPO_IDS_KV_KEY, MAX_INTERESTING);
}

export async function writeCorpInterestingEquipoIds(ids: string[]): Promise<void> {
  return writeKvIds(CORP_INTERESTING_EQUIPO_IDS_KV_KEY, ids, MAX_INTERESTING);
}

function parseKvBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

export async function readMarketplaceHidePricesForGuests(): Promise<boolean> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(MARKETPLACE_HIDE_PRICES_FOR_GUESTS_KV_KEY)) as
    | { value?: string | null }
    | undefined;
  return parseKvBoolean(row?.value, true);
}

export async function writeMarketplaceHidePricesForGuests(enabled: boolean): Promise<void> {
  const value = enabled ? "1" : "0";
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO marketplace_site_kv (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value
         RETURNING key`
      )
      .get(MARKETPLACE_HIDE_PRICES_FOR_GUESTS_KV_KEY, value);
    return;
  }
  await db
    .prepare("INSERT OR REPLACE INTO marketplace_site_kv (key, value) VALUES (?, ?)")
    .run(MARKETPLACE_HIDE_PRICES_FOR_GUESTS_KV_KEY, value);
}
