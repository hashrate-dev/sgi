/** Última respuesta de workers Luxor mostrada en el monitor (solo navegador). */

const STORAGE_KEY = "hrs_luxor_monitor_snapshot_v1";

export type LuxorSnapshotWorker = {
  subaccount_name: string;
  name: string;
  status: string;
  hashrate: number | null;
  efficiency: number | null;
  last_share_time: string | null;
  firmware: string | null;
  id: string | null;
  /** BTC, LTC_DOGE, … */
  currency_type?: string | null;
};

export type LuxorMonitorSnapshot = {
  workers: LuxorSnapshotWorker[];
  skippedSubaccounts: Array<{ subaccount: string; reason: string; currencyType?: string }>;
  updatedAt: string;
  /** Metadatos última sync (p. ej. se usó el listado oficial de Luxor). */
  luxorSubaccountSync?: "intersection" | "luxor_all" | "local_only";
  luxorDirectorySample?: string[];
  luxorDirectoryListingFailed?: boolean;
};

export function loadLuxorMonitorSnapshot(): LuxorMonitorSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LuxorMonitorSnapshot>;
    if (!Array.isArray(o.workers) || typeof o.updatedAt !== "string") return null;
    return {
      workers: o.workers as LuxorSnapshotWorker[],
      skippedSubaccounts: Array.isArray(o.skippedSubaccounts) ? o.skippedSubaccounts : [],
      updatedAt: o.updatedAt,
      luxorSubaccountSync: o.luxorSubaccountSync,
      luxorDirectorySample: Array.isArray(o.luxorDirectorySample) ? o.luxorDirectorySample : undefined,
      luxorDirectoryListingFailed: typeof o.luxorDirectoryListingFailed === "boolean" ? o.luxorDirectoryListingFailed : undefined,
    };
  } catch {
    return null;
  }
}

export function saveLuxorMonitorSnapshot(s: LuxorMonitorSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
