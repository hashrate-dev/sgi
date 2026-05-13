/** UUID del enlace watcher NiceHash (`/my/miner/...`). Sobrescribible con `VITE_NICEHASH_WATCHER_ID`. */
export const NICEHASH_WATCHER_ID = (
  typeof import.meta.env.VITE_NICEHASH_WATCHER_ID === "string" ? import.meta.env.VITE_NICEHASH_WATCHER_ID : ""
)
  .trim()
  .toLowerCase() || "55b92a70-f1c2-4b68-aa19-66241cca90ff";

export const NICEHASH_WATCHER_PAGE_URL = `https://www.nicehash.com/my/miner/${encodeURIComponent(NICEHASH_WATCHER_ID)}`;

/**
 * UUID sintético (no es NiceHash): en servidor se guarda el historial TH/MH del toolbar en vista TOTAL
 * (`nh_watcher_rig_hash_samples` con `rig_key` __nhToolbarSumTh / __nhToolbarSumMh), por usuario.
 */
export const NH_WATCHER_FLEET_TOOLBAR_WATCHER_ID = "00000000-0000-0000-0000-000000000001";
