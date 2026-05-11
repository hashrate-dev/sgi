import {
  MONITOR_EQUIPOS_ASIC_ROWS,
  coerceMonitorPool,
  type MonitorEquipoAsicRow,
} from "../data/monitorEquiposAsicData";

const STORAGE_KEY = "hrs_monitor_equipos_asic_rows_v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newEquipoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function cloneDefaults(): MonitorEquipoAsicRow[] {
  return MONITOR_EQUIPOS_ASIC_ROWS.map((r) => ({ ...r }));
}

function normalizeLoadedRow(x: unknown): MonitorEquipoAsicRow | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  let equipoId = typeof o.equipoId === "string" ? o.equipoId.trim() : "";
  if (!UUID_RE.test(equipoId)) equipoId = newEquipoId();
  return {
    equipoId,
    usuario: String(o.usuario ?? ""),
    modelo: String(o.modelo ?? ""),
    potencia: String(o.potencia ?? ""),
    nombreAnt: String(o.nombreAnt ?? ""),
    nombreNuevo: String(o.nombreNuevo ?? ""),
    serial: String(o.serial ?? ""),
    pool: coerceMonitorPool(String(o.pool ?? "")),
    online: Boolean(o.online),
    luxorOnlineSync: typeof o.luxorOnlineSync === "boolean" ? o.luxorOnlineSync : true,
    rowLocked: typeof o.rowLocked === "boolean" ? o.rowLocked : false,
    comentario: typeof o.comentario === "string" ? o.comentario.slice(0, 4000) : "",
  };
}

export function loadMonitorEquiposAsicRows(): MonitorEquipoAsicRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return cloneDefaults();
    let migrated = false;
    const rows = parsed
      .map((item) => {
        const prevId =
          item && typeof item === "object" ? String((item as Record<string, unknown>).equipoId ?? "").trim() : "";
        const r = normalizeLoadedRow(item);
        if (!r) return null;
        if (!UUID_RE.test(prevId)) migrated = true;
        return r;
      })
      .filter((r): r is MonitorEquipoAsicRow => r != null);
    const out = rows.length > 0 ? rows : cloneDefaults();
    if (migrated) saveMonitorEquiposAsicRows(out);
    return out;
  } catch {
    return cloneDefaults();
  }
}

export function saveMonitorEquiposAsicRows(rows: MonitorEquipoAsicRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    //
  }
}

export function resetMonitorEquiposAsicRowsStorage(): MonitorEquipoAsicRow[] {
  const fresh = cloneDefaults();
  saveMonitorEquiposAsicRows(fresh);
  return fresh;
}
