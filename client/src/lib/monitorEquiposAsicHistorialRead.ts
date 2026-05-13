const STORAGE_KEY = "hrs_monitor_asic_historial_last_read_v1";

export function loadHistorialLastReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveHistorialLastReadForEquipo(equipoId: string, lastReadIso: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = loadHistorialLastReadMap();
    map[equipoId] = lastReadIso;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

/** Al quitar una fila del monitor local, evita que quede basura de «última lectura» para un UUID que ya no existe. */
export function removeHistorialLastReadForEquipo(equipoId: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = loadHistorialLastReadMap();
    if (!(equipoId in map)) return;
    delete map[equipoId];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
