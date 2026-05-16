import { z } from "zod";

/** Mismo valor que `NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID` en el cliente (no es un enlace NiceHash). */
export const NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID = "00000000-0000-0000-0000-000000000001";

const nhWatcherUuid = z.string().uuid();

/** IDs válidos para `nh_watcher_rig_hash_samples` (UUID NiceHash o sentinel de toolbar TOTAL). */
export function normalizeNhWatcherStorageId(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID) return t;
  const p = nhWatcherUuid.safeParse(t);
  return p.success ? p.data.toLowerCase() : null;
}
