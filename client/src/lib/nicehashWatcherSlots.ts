import { NICEHASH_WATCHER_ID } from "./nicehashWatcherConfig";

export const NH_WATCHER_SLOT_COUNT = 16;

/** URL de ejemplo del watcher principal (slot 1 por defecto). */
export const NH_WATCHER_DEFAULT_MINER_URL = `https://www.nicehash.com/my/miner/${encodeURIComponent(NICEHASH_WATCHER_ID)}`;

const SLOTS_KEY_V2 = "nhWatcherLinkSlots:v2";
const SLOTS_KEY_V1 = "nhWatcherLinkSlots:v1";
const ACTIVE_SLOT_KEY = "nhWatcherActiveSlot:v1";

/** Máx. caracteres del nickname por slot (misma escala que apodos por ASIC). */
export const NH_WATCHER_SLOT_NICKNAME_MAX = 48;

export type NhWatcherSlotRow = {
  link: string;
  /** Nickname por defecto para todos los ASICs de este watcher (sobreescribible con el lápiz en cada equipo). */
  nickname: string;
  /**
   * Opcional: API key NiceHash de la **misma organización** que el watcher, con permiso de lectura de cartera,
   * para mostrar BTC/USD tipo «Total Assets» (`accounting/accounts2`). Se guarda solo en este navegador.
   */
  nhOrgId?: string;
  nhApiKey?: string;
  nhApiSecret?: string;
};

export function getWatcherSlotRowsStorageKey(): string {
  return SLOTS_KEY_V2;
}

/** @deprecated usar getWatcherSlotRowsStorageKey */
export function getWatcherLinkSlotsStorageKey(): string {
  return SLOTS_KEY_V2;
}

export function getWatcherActiveSlotStorageKey(): string {
  return ACTIVE_SLOT_KEY;
}

/** Extrae el UUID del watcher desde URL completa o texto con UUID. */
export function parseNiceHashWatcherUuid(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

export function niceHashMinerPageUrl(watcherUuid: string): string {
  const id = watcherUuid.trim().toLowerCase();
  return `https://www.nicehash.com/my/miner/${encodeURIComponent(id)}`;
}

function emptyRows(): NhWatcherSlotRow[] {
  return Array.from({ length: NH_WATCHER_SLOT_COUNT }, () => ({
    link: "",
    nickname: "",
    nhOrgId: "",
    nhApiKey: "",
    nhApiSecret: "",
  }));
}

function defaultRows(): NhWatcherSlotRow[] {
  const rows = emptyRows();
  rows[0] = { link: NH_WATCHER_DEFAULT_MINER_URL, nickname: "" };
  return rows;
}

function normalizeRowsArray(input: unknown): NhWatcherSlotRow[] {
  const out = emptyRows();
  if (!Array.isArray(input)) return out;
  for (let i = 0; i < NH_WATCHER_SLOT_COUNT && i < input.length; i++) {
    const item = input[i];
    if (typeof item === "string") {
      out[i] = { link: item.slice(0, 512), nickname: "" };
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const link = typeof o.link === "string" ? o.link : typeof o.url === "string" ? o.url : "";
      const nickname = typeof o.nickname === "string" ? o.nickname : "";
      const nhOrgId = typeof o.nhOrgId === "string" ? o.nhOrgId : "";
      const nhApiKey = typeof o.nhApiKey === "string" ? o.nhApiKey : "";
      const nhApiSecret = typeof o.nhApiSecret === "string" ? o.nhApiSecret : "";
      out[i] = {
        link: link.slice(0, 512),
        nickname: nickname.trim().slice(0, NH_WATCHER_SLOT_NICKNAME_MAX),
        nhOrgId: nhOrgId.trim().slice(0, 200),
        nhApiKey: nhApiKey.trim().slice(0, 400),
        nhApiSecret: nhApiSecret.trim().slice(0, 400),
      };
    }
  }
  return out;
}

function migrateV1StringArray(arr: unknown): NhWatcherSlotRow[] | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (typeof arr[0] !== "string") return null;
  return normalizeRowsArray(arr);
}

export function slotLinks(rows: NhWatcherSlotRow[]): string[] {
  return rows.map((r) => r.link);
}

/** Nickname del slot (vacío = el caller usa el default global tipo HASHRATE). */
export function watcherSlotNicknameTrimmed(rows: NhWatcherSlotRow[], slotIndex: number): string {
  const n = (rows[slotIndex]?.nickname ?? "").trim();
  return n.slice(0, NH_WATCHER_SLOT_NICKNAME_MAX);
}

/** Slot cuyo enlace watcher coincide con `watcherId` (si no hay match, devuelve `hint`). */
export function watcherSlotIndexForWatcherId(rows: NhWatcherSlotRow[], watcherId: string, hint = 0): number {
  const w = watcherId.trim().toLowerCase();
  if (!w) return hint;
  for (let i = 0; i < rows.length; i++) {
    const id = parseNiceHashWatcherUuid(rows[i]?.link ?? "");
    if (id && id.toLowerCase() === w) return i;
  }
  return hint;
}

/** Nickname de cuenta (slot) para un rig, resolviendo el slot por UUID del watcher si hace falta. */
export function watcherAccountLabelForSlot(rows: NhWatcherSlotRow[], slotIndex: number, watcherId?: string): string {
  const idx = watcherId != null ? watcherSlotIndexForWatcherId(rows, watcherId, slotIndex) : slotIndex;
  return watcherSlotNicknameTrimmed(rows, idx);
}

export function loadWatcherSlotRows(): NhWatcherSlotRow[] {
  if (typeof window === "undefined") return defaultRows();
  try {
    const rawV2 = window.localStorage.getItem(SLOTS_KEY_V2);
    if (rawV2 != null && rawV2 !== "") {
      const parsed = JSON.parse(rawV2) as unknown;
      return normalizeRowsArray(parsed);
    }
    const rawV1 = window.localStorage.getItem(SLOTS_KEY_V1);
    if (rawV1 != null && rawV1 !== "") {
      const parsed = JSON.parse(rawV1) as unknown;
      const migrated = migrateV1StringArray(parsed);
      if (migrated) {
        saveWatcherSlotRows(migrated);
        try {
          window.localStorage.removeItem(SLOTS_KEY_V1);
        } catch {
          /* */
        }
        return migrated;
      }
    }
    const init = defaultRows();
    saveWatcherSlotRows(init);
    return init;
  } catch {
    return defaultRows();
  }
}

/** Compat: solo enlaces (para lógica UUID existente). */
export function loadWatcherLinkSlots(): string[] {
  return slotLinks(loadWatcherSlotRows());
}

export function saveWatcherSlotRows(rows: NhWatcherSlotRow[]): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeRowsArray(rows);
    window.localStorage.setItem(SLOTS_KEY_V2, JSON.stringify(normalized));
  } catch {
    /* quota */
  }
}

/** @deprecated usar saveWatcherSlotRows */
export function saveWatcherLinkSlots(slots: string[]): void {
  const rows = normalizeRowsArray(slots.map((link) => ({ link, nickname: "" })));
  saveWatcherSlotRows(rows);
}

export function listConfiguredWatcherSlotIndices(rows: NhWatcherSlotRow[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (parseNiceHashWatcherUuid(rows[i]?.link ?? "")) out.push(i);
  }
  return out;
}

export function resolveWatcherIdAtSlot(rows: NhWatcherSlotRow[], slotIndex: number, fallbackId: string): string {
  const p = parseNiceHashWatcherUuid(rows[slotIndex]?.link ?? "");
  return p ?? fallbackId.trim().toLowerCase();
}

/** Variante que acepta solo array de links (legacy interno). */
export function resolveWatcherIdFromLinks(links: string[], slotIndex: number, fallbackId: string): string {
  const p = parseNiceHashWatcherUuid(links[slotIndex] ?? "");
  return p ?? fallbackId.trim().toLowerCase();
}

export function pickValidActiveSlotIndex(rows: NhWatcherSlotRow[], requested: number): number {
  if (requested >= 0 && requested < NH_WATCHER_SLOT_COUNT && parseNiceHashWatcherUuid(rows[requested]?.link ?? "")) {
    return requested;
  }
  const first = listConfiguredWatcherSlotIndices(rows)[0];
  return first ?? 0;
}

export function loadActiveWatcherSlotIndex(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n >= NH_WATCHER_SLOT_COUNT) return 0;
    return n;
  } catch {
    return 0;
  }
}

export function saveActiveWatcherSlotIndex(i: number): void {
  if (typeof window === "undefined") return;
  try {
    if (i < 0 || i >= NH_WATCHER_SLOT_COUNT) return;
    window.localStorage.setItem(ACTIVE_SLOT_KEY, String(i));
  } catch {
    /* */
  }
}

export function initialActiveSlotIndex(rows: NhWatcherSlotRow[]): number {
  return pickValidActiveSlotIndex(rows, loadActiveWatcherSlotIndex());
}
