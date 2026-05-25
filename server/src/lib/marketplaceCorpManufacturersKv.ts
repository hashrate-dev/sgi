import { randomUUID } from "crypto";
import { db, getDb } from "../db.js";

export const CORP_INDUSTRY_MANUFACTURERS_KV_KEY = "corp_industry_manufacturers_json";
export const MAX_CORP_INDUSTRY_MANUFACTURERS = 24;
const MAX_IMAGE_URL_LEN = 2_800_000;
const MAX_SLUG_LEN = 40;

export type CorpIndustryManufacturerRecord = {
  id: string;
  name: string;
  href: string;
  imageUrl: string;
  enabled: boolean;
  /** Clase CSS opcional: `market-corp-clients__item--{slug}` (bitmain, canaan, …). */
  slug: string;
};

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

export function slugFromManufacturerName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || "marca").slice(0, MAX_SLUG_LEN);
}

export function defaultCorpIndustryManufacturers(): CorpIndustryManufacturerRecord[] {
  return [
    {
      id: "bitmain",
      name: "Bitmain",
      href: "",
      imageUrl: "/images/wp-uploads/bitmain.png",
      enabled: true,
      slug: "bitmain",
    },
    {
      id: "canaan",
      name: "Canaan",
      href: "",
      imageUrl: "/images/wp-uploads/canaan-logo.png",
      enabled: true,
      slug: "canaan",
    },
    {
      id: "microbt",
      name: "MicroBT",
      href: "",
      imageUrl: "/images/wp-uploads/microbt-logo.png",
      enabled: true,
      slug: "microbt",
    },
    {
      id: "innosilicon",
      name: "Innosilicon",
      href: "",
      imageUrl: "/images/wp-uploads/logo-inosili.png",
      enabled: true,
      slug: "innosilicon",
    },
    {
      id: "iceriver",
      name: "IceRiver",
      href: "",
      imageUrl: "/images/wp-uploads/iceriver-logo.webp",
      enabled: true,
      slug: "iceriver",
    },
    {
      id: "elphapex",
      name: "Elphapex",
      href: "",
      imageUrl: "/images/wp-uploads/elphapex-logo.png",
      enabled: true,
      slug: "elphapex",
    },
  ];
}

function normalizeSlug(raw: unknown, fallbackName: string): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || slugFromManufacturerName(fallbackName)).slice(0, MAX_SLUG_LEN);
}

function normalizeManufacturer(raw: unknown): CorpIndustryManufacturerRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  const href = String(o.href ?? "").trim();
  const imageUrl = String(o.imageUrl ?? "").trim();
  if (!id || !name || !imageUrl) return null;
  if (imageUrl.length > MAX_IMAGE_URL_LEN) return null;
  const enabled = o.enabled !== false;
  const slug = normalizeSlug(o.slug, name);
  return {
    id,
    name: name.slice(0, 120),
    href: href.slice(0, 500),
    imageUrl,
    enabled,
    slug,
  };
}

export function parseCorpIndustryManufacturersJson(raw: string | null | undefined): CorpIndustryManufacturerRecord[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: CorpIndustryManufacturerRecord[] = [];
    const seen = new Set<string>();
    for (const item of j) {
      const p = normalizeManufacturer(item);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length >= MAX_CORP_INDUSTRY_MANUFACTURERS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function sanitizeCorpIndustryManufacturersInput(list: unknown): CorpIndustryManufacturerRecord[] {
  if (!Array.isArray(list)) return [];
  const out: CorpIndustryManufacturerRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const p = normalizeManufacturer(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= MAX_CORP_INDUSTRY_MANUFACTURERS) break;
  }
  return out;
}

export function newCorpIndustryManufacturerId(): string {
  return randomUUID();
}

async function writeKvManufacturers(manufacturers: CorpIndustryManufacturerRecord[]): Promise<void> {
  const json = JSON.stringify(manufacturers);
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO marketplace_site_kv (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value
         RETURNING key`
      )
      .get(CORP_INDUSTRY_MANUFACTURERS_KV_KEY, json);
    return;
  }
  await db
    .prepare("INSERT OR REPLACE INTO marketplace_site_kv (key, value) VALUES (?, ?)")
    .run(CORP_INDUSTRY_MANUFACTURERS_KV_KEY, json);
}

export async function readCorpIndustryManufacturersPublic(): Promise<CorpIndustryManufacturerRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_INDUSTRY_MANUFACTURERS_KV_KEY)) as
    | { value: string }
    | undefined;
  let list = parseCorpIndustryManufacturersJson(row?.value);
  if (list.length === 0) {
    list = defaultCorpIndustryManufacturers();
    await writeKvManufacturers(list);
  }
  return list.filter((p) => p.enabled);
}

export async function readCorpIndustryManufacturersAdmin(): Promise<CorpIndustryManufacturerRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_INDUSTRY_MANUFACTURERS_KV_KEY)) as
    | { value: string }
    | undefined;
  let list = parseCorpIndustryManufacturersJson(row?.value);
  if (list.length === 0) {
    list = defaultCorpIndustryManufacturers();
    await writeKvManufacturers(list);
  }
  return list;
}

export async function writeCorpIndustryManufacturers(
  manufacturers: CorpIndustryManufacturerRecord[]
): Promise<CorpIndustryManufacturerRecord[]> {
  const sanitized = sanitizeCorpIndustryManufacturersInput(manufacturers);
  await writeKvManufacturers(sanitized);
  return sanitized;
}
