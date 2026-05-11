const STORAGE_KEY = "hrs_monitor_asic_notas_summary_v1";

export type MonitorNotasSummaryMap = Record<string, { total: number; unread: number }>;

export function loadMonitorNotasSummaryCache(): MonitorNotasSummaryMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || !("summary" in p)) return {};
    const summary = (p as { summary?: unknown }).summary;
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
    const out: MonitorNotasSummaryMap = {};
    for (const [k, v] of Object.entries(summary as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const total = Number(o.total);
      const unread = Number(o.unread);
      if (Number.isFinite(total) && Number.isFinite(unread)) out[k] = { total, unread };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMonitorNotasSummaryCache(summary: MonitorNotasSummaryMap): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), summary }));
  } catch {
    //
  }
}

/** Solo entradas cuyo equipo sigue en el listado local (evita fantasmas si borraste filas). */
export function filterSummaryCacheToRowIds(
  summary: MonitorNotasSummaryMap,
  equipoIds: Iterable<string>
): MonitorNotasSummaryMap {
  const allowed = new Set(equipoIds);
  const out: MonitorNotasSummaryMap = {};
  for (const [k, v] of Object.entries(summary)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}
