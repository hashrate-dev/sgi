import { randomUUID } from "crypto";
import { db, getDb } from "../db.js";

export const CORP_OFFICIAL_PARTNERS_KV_KEY = "corp_official_partners_json";
export const MAX_CORP_OFFICIAL_PARTNERS = 24;
const MAX_IMAGE_URL_LEN = 2_800_000;

export type CorpOfficialPartnerRecord = {
  id: string;
  name: string;
  href: string;
  imageUrl: string;
  enabled: boolean;
};

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

export function defaultCorpOfficialPartners(): CorpOfficialPartnerRecord[] {
  return [
    {
      id: "nicehash",
      name: "NiceHash",
      href: "https://www.nicehash.com/",
      imageUrl: "/images/nicehash-logo-cropped.jpg",
      enabled: true,
    },
    {
      id: "viabtc",
      name: "ViaBTC",
      href: "https://www.viabtc.com/",
      imageUrl: "/images/via-btc-logo-cropped.png",
      enabled: true,
    },
    {
      id: "ocean",
      name: "Ocean Pool",
      href: "https://ocean.xyz/",
      imageUrl: "/images/ocean-pool-logo-bw.jpg",
      enabled: true,
    },
    {
      id: "luxor",
      name: "Luxor",
      href: "https://www.luxor.tech/",
      imageUrl: "/images/wp-uploads/Luxor-logo.png",
      enabled: true,
    },
  ];
}

function normalizePartner(raw: unknown): CorpOfficialPartnerRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  const href = String(o.href ?? "").trim();
  const imageUrl = String(o.imageUrl ?? "").trim();
  if (!id || !name || !imageUrl) return null;
  if (imageUrl.length > MAX_IMAGE_URL_LEN) return null;
  const enabled = o.enabled !== false;
  return {
    id,
    name: name.slice(0, 120),
    href: href.slice(0, 500),
    imageUrl,
    enabled,
  };
}

export function parseCorpOfficialPartnersJson(raw: string | null | undefined): CorpOfficialPartnerRecord[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: CorpOfficialPartnerRecord[] = [];
    const seen = new Set<string>();
    for (const item of j) {
      const p = normalizePartner(item);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
      if (out.length >= MAX_CORP_OFFICIAL_PARTNERS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function sanitizeCorpOfficialPartnersInput(list: unknown): CorpOfficialPartnerRecord[] {
  if (!Array.isArray(list)) return [];
  const out: CorpOfficialPartnerRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const p = normalizePartner(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= MAX_CORP_OFFICIAL_PARTNERS) break;
  }
  return out;
}

export function newCorpOfficialPartnerId(): string {
  return randomUUID();
}

async function writeKvPartners(partners: CorpOfficialPartnerRecord[]): Promise<void> {
  const json = JSON.stringify(partners);
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO marketplace_site_kv (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value
         RETURNING key`
      )
      .get(CORP_OFFICIAL_PARTNERS_KV_KEY, json);
    return;
  }
  await db.prepare("INSERT OR REPLACE INTO marketplace_site_kv (key, value) VALUES (?, ?)").run(CORP_OFFICIAL_PARTNERS_KV_KEY, json);
}

/** Partners habilitados para la home pública (si KV vacío, persiste defaults una vez). */
export async function readCorpOfficialPartnersPublic(): Promise<CorpOfficialPartnerRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_OFFICIAL_PARTNERS_KV_KEY)) as
    | { value: string }
    | undefined;
  let list = parseCorpOfficialPartnersJson(row?.value);
  if (list.length === 0) {
    list = defaultCorpOfficialPartners();
    await writeKvPartners(list);
  }
  return list.filter((p) => p.enabled);
}

export async function readCorpOfficialPartnersAdmin(): Promise<CorpOfficialPartnerRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_OFFICIAL_PARTNERS_KV_KEY)) as
    | { value: string }
    | undefined;
  let list = parseCorpOfficialPartnersJson(row?.value);
  if (list.length === 0) {
    list = defaultCorpOfficialPartners();
    await writeKvPartners(list);
  }
  return list;
}

export async function writeCorpOfficialPartners(partners: CorpOfficialPartnerRecord[]): Promise<CorpOfficialPartnerRecord[]> {
  const sanitized = sanitizeCorpOfficialPartnersInput(partners);
  await writeKvPartners(sanitized);
  return sanitized;
}
