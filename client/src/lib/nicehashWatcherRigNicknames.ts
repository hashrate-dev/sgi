export function getNiceHashWatcherNicknamesStorageKey(watcherId: string): string {
  const id = watcherId.trim().toLowerCase();
  return `nhWatcherRigNicknames:v1:${id}`;
}

/** Texto por defecto bajo el nombre del ASIC (sustituye el tipo «UNMANAGED» de NiceHash). */
export const NH_WATCHER_DEFAULT_RIG_NICKNAME = "HASHRATE";

const MAX_LEN = 48;

export function nhWatcherRigStorageKey(rig: { rigId?: string; name?: string }, listIndex: number): string {
  const id = typeof rig.rigId === "string" ? rig.rigId.trim() : "";
  if (id) return `id:${id}`;
  const name = typeof rig.name === "string" ? rig.name.trim() : "";
  if (name) return `name:${name}`;
  return `idx:${listIndex}`;
}

export function loadNiceHashWatcherRigNicknames(watcherId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getNiceHashWatcherNicknamesStorageKey(watcherId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      const t = v.trim().slice(0, MAX_LEN);
      if (t && t !== NH_WATCHER_DEFAULT_RIG_NICKNAME) out[k] = t;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveNiceHashWatcherRigNicknames(watcherId: string, map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      const t = v.trim().slice(0, MAX_LEN);
      if (t && t !== NH_WATCHER_DEFAULT_RIG_NICKNAME) cleaned[k] = t;
    }
    const key = getNiceHashWatcherNicknamesStorageKey(watcherId);
    if (Object.keys(cleaned).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(cleaned));
  } catch {
    /* quota / private mode */
  }
}

export function nhWatcherNicknameMaxLength(): number {
  return MAX_LEN;
}
