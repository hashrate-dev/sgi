import { randomUUID } from "crypto";
import { db, getDb } from "../db.js";

export const CORP_COMPANY_TEAM_KV_KEY = "corp_company_team_json";

export type CorpCompanyTeamMemberRecord = {
  id: string;
  role: string;
  name: string;
  imageUrl: string;
  linkedin?: string;
  bio: string[];
  enabled: boolean;
};

const MAX_CORP_COMPANY_TEAM_MEMBERS = 24;
const MAX_IMAGE_URL_LEN = 2_800_000;
const MAX_ROLE_LEN = 120;
const MAX_NAME_LEN = 140;
const MAX_LINKEDIN_LEN = 500;
const MAX_BIO_PARAS = 8;
const MAX_BIO_PARA_LEN = 2000;
const MAX_MEMBER_ID_LEN = 80;

function isPg(): boolean {
  return (getDb() as { isPostgres?: boolean }).isPostgres === true;
}

function normalizeMember(raw: unknown): CorpCompanyTeamMemberRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const role = String(o.role ?? "").trim();
  const name = String(o.name ?? "").trim();
  const imageUrl = String(o.imageUrl ?? "").trim();
  const linkedin = String(o.linkedin ?? "").trim();
  const enabled = o.enabled !== false;
  const bioRaw = o.bio;

  if (!id || id.length > MAX_MEMBER_ID_LEN) return null;
  if (!role || role.length > MAX_ROLE_LEN) return null;
  if (!name || name.length > MAX_NAME_LEN) return null;
  if (!imageUrl || imageUrl.length > MAX_IMAGE_URL_LEN) return null;
  if (linkedin && linkedin.length > MAX_LINKEDIN_LEN) return null;

  let bio: string[] = [];
  if (Array.isArray(bioRaw)) {
    const paras: string[] = [];
    for (const b of bioRaw) {
      const s = String(b ?? "").trim();
      if (!s) continue;
      paras.push(s.length > MAX_BIO_PARA_LEN ? s.slice(0, MAX_BIO_PARA_LEN) : s);
      if (paras.length >= MAX_BIO_PARAS) break;
    }
    bio = paras;
  }

  // Permitir bio vacía, porque a veces se guarda primero la foto y el rol.
  return {
    id: id.slice(0, MAX_MEMBER_ID_LEN),
    role: role.slice(0, MAX_ROLE_LEN),
    name: name.slice(0, MAX_NAME_LEN),
    imageUrl,
    linkedin: linkedin ? linkedin.slice(0, MAX_LINKEDIN_LEN) : undefined,
    bio,
    enabled,
  };
}

export function parseCorpCompanyTeamJson(raw: string | null | undefined): CorpCompanyTeamMemberRecord[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: CorpCompanyTeamMemberRecord[] = [];
    const seen = new Set<string>();
    for (const item of j) {
      const m = normalizeMember(item);
      if (!m) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
      if (out.length >= MAX_CORP_COMPANY_TEAM_MEMBERS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function sanitizeCorpCompanyTeamInput(list: unknown): CorpCompanyTeamMemberRecord[] {
  if (!Array.isArray(list)) return [];
  const out: CorpCompanyTeamMemberRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const m = normalizeMember(item);
    if (!m) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
    if (out.length >= MAX_CORP_COMPANY_TEAM_MEMBERS) break;
  }
  return out;
}

export function newCorpCompanyTeamMemberId(): string {
  return randomUUID();
}

async function writeKvTeam(members: CorpCompanyTeamMemberRecord[]): Promise<void> {
  const json = JSON.stringify(members);
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO marketplace_site_kv (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value
         RETURNING key`
      )
      .get(CORP_COMPANY_TEAM_KV_KEY, json);
    return;
  }
  await db.prepare("INSERT OR REPLACE INTO marketplace_site_kv (key, value) VALUES (?, ?)").run(CORP_COMPANY_TEAM_KV_KEY, json);
}

export async function readCorpCompanyTeamPublic(): Promise<CorpCompanyTeamMemberRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_COMPANY_TEAM_KV_KEY)) as
    | { value: string }
    | undefined;
  const list = parseCorpCompanyTeamJson(row?.value);
  return list.filter((m) => m.enabled);
}

export async function readCorpCompanyTeamAdmin(): Promise<CorpCompanyTeamMemberRecord[]> {
  const row = (await db.prepare("SELECT value FROM marketplace_site_kv WHERE key = ?").get(CORP_COMPANY_TEAM_KV_KEY)) as
    | { value: string }
    | undefined;
  return parseCorpCompanyTeamJson(row?.value);
}

export async function writeCorpCompanyTeamAdmin(members: CorpCompanyTeamMemberRecord[]): Promise<CorpCompanyTeamMemberRecord[]> {
  const sanitized = sanitizeCorpCompanyTeamInput(members);
  await writeKvTeam(sanitized);
  return sanitized;
}

