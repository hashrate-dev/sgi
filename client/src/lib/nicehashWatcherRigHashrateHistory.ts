/** Muestra cada 1 minuto; máx. puntos ≈ 7 días (10080 × 1 min). */
export const NH_WATCHER_HASH_SAMPLE_MS = 60 * 1000;
export const NH_WATCHER_HASH_MAX_POINTS = 60 * 24 * 7;

export type NhRigHashPoint = { t: number; v: number };

type Point = NhRigHashPoint;

export function getNiceHashRigHashrateHistoryStorageKey(watcherId: string): string {
  return `nhWatcherRigHashHistory:v2:${watcherId.trim().toLowerCase()}`;
}

function storageKey(watcherId: string): string {
  return getNiceHashRigHashrateHistoryStorageKey(watcherId);
}

/**
 * Marca temporal alineada al minuto (misma clave que en servidor) para deduplicar
 * y coincidir con el intervalo ~1 min del sparkline.
 */
export function sampleTimeBucketMs(epochMs: number): number {
  return Math.floor(epochMs / NH_WATCHER_HASH_SAMPLE_MS) * NH_WATCHER_HASH_SAMPLE_MS;
}

function parseStore(raw: string | null): Record<string, Point[]> {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: Record<string, Point[]> = {};
    for (const [k, arr] of Object.entries(p as Record<string, unknown>)) {
      if (!Array.isArray(arr)) continue;
      const pts: Point[] = [];
      for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        const o = it as Record<string, unknown>;
        const t = typeof o.t === "number" ? o.t : Number(o.t);
        const v = typeof o.v === "number" ? o.v : Number(o.v);
        if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
        pts.push({ t, v });
      }
      pts.sort((a, b) => a.t - b.t);
      out[k] = pts.slice(-NH_WATCHER_HASH_MAX_POINTS);
    }
    return out;
  } catch {
    return {};
  }
}

function loadAll(watcherId: string): Record<string, Point[]> {
  if (typeof window === "undefined") return {};
  try {
    return parseStore(window.localStorage.getItem(storageKey(watcherId)));
  } catch {
    return {};
  }
}

/** Serie completa (t + v) por ASIC; útil para fusionar con el servidor. */
export function loadNiceHashRigHashratePointsMap(watcherId: string): Record<string, NhRigHashPoint[]> {
  const wid = watcherId.trim().toLowerCase();
  const all = loadAll(wid);
  const out: Record<string, NhRigHashPoint[]> = {};
  for (const [k, pts] of Object.entries(all)) {
    if (!pts?.length) continue;
    out[k] = pts.map((p) => ({ t: p.t, v: p.v }));
  }
  return out;
}

function capSeries(pts: Point[]): Point[] {
  if (pts.length <= NH_WATCHER_HASH_MAX_POINTS) return pts;
  return pts.slice(-NH_WATCHER_HASH_MAX_POINTS);
}

/** Une local + servidor por `t` (misma `t` → gana el servidor), ordena y recorta al máximo de la gráfica. */
export function mergeNiceHashRigHashratePointMaps(
  local: Record<string, NhRigHashPoint[]>,
  remote: Record<string, NhRigHashPoint[]>
): Record<string, Point[]> {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: Record<string, Point[]> = {};
  for (const k of keys) {
    const a = local[k] ?? [];
    const b = remote[k] ?? [];
    const byT = new Map<number, number>();
    for (const p of a) {
      if (Number.isFinite(p.t) && Number.isFinite(p.v)) byT.set(p.t, p.v);
    }
    for (const p of b) {
      if (Number.isFinite(p.t) && Number.isFinite(p.v)) byT.set(p.t, p.v);
    }
    const merged = [...byT.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([t, v]) => ({ t, v }));
    out[k] = capSeries(merged);
  }
  return out;
}

/** Reemplaza el almacén local con el mapa ya fusionado (p. ej. tras sync con BD). */
export function replaceNiceHashRigHashrateHistoryMap(watcherId: string, data: Record<string, NhRigHashPoint[]>): void {
  const wid = watcherId.trim().toLowerCase();
  if (!wid || typeof window === "undefined") return;
  const trimmed: Record<string, Point[]> = {};
  for (const [k, pts] of Object.entries(data)) {
    const key = k.trim();
    if (!key || !pts?.length) continue;
    const arr = pts
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .map((p) => ({ t: p.t, v: p.v }))
      .sort((a, b) => a.t - b.t);
    trimmed[key] = capSeries(arr);
  }
  saveAll(wid, trimmed);
}

function saveAll(watcherId: string, data: Record<string, Point[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(watcherId), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/**
 * Registra un punto de hashrate a lo sumo una vez por minuto de reloj (bucket `t`),
 * alineado con la BD y el sparkline ~1 min.
 * `value` = speedAccepted numérico del API (misma escala que en pantalla).
 */
export function appendNiceHashRigHashrateSample(
  watcherId: string,
  rigKey: string,
  value: number | null | undefined,
  nowMs: number
): { added: boolean; rigKey?: string; t?: number; v?: number } {
  if (typeof window === "undefined") return { added: false };
  if (value == null || !Number.isFinite(value) || value < 0) return { added: false };
  const wid = watcherId.trim().toLowerCase();
  const key = rigKey.trim();
  if (!wid || !key) return { added: false };

  const bucketT = sampleTimeBucketMs(nowMs);
  const all = loadAll(wid);
  const arr = [...(all[key] ?? [])];
  const last = arr[arr.length - 1];
  if (last) {
    const lastBucket = sampleTimeBucketMs(last.t);
    if (bucketT <= lastBucket) return { added: false };
  }

  arr.push({ t: bucketT, v: value });
  while (arr.length > NH_WATCHER_HASH_MAX_POINTS) arr.shift();
  all[key] = arr;
  saveAll(wid, all);
  return { added: true, rigKey: key, t: bucketT, v: value };
}

/** Todas las series (solo `v`) por clave de ASIC, para hidratar estado al cargar / recargar. */
export function loadNiceHashRigHashrateSeriesMap(watcherId: string): Record<string, number[]> {
  const wid = watcherId.trim().toLowerCase();
  const all = loadAll(wid);
  const out: Record<string, number[]> = {};
  for (const [k, pts] of Object.entries(all)) {
    if (!pts?.length) continue;
    out[k] = pts.map((p) => p.v);
  }
  return out;
}

/** Valores ordenados en el tiempo (solo `v`) para el sparkline. */
export function loadNiceHashRigHashrateSeries(watcherId: string, rigKey: string): number[] {
  const pts = loadAll(watcherId.trim().toLowerCase())[rigKey.trim()];
  if (!pts?.length) return [];
  return pts.map((p) => p.v);
}

/** Claves reservadas: suma aceptada TH/s y MH/s del toolbar (no son ASIC). */
export const NH_WATCHER_TOOLBAR_TH_KEY = "__nhToolbarSumTh";
export const NH_WATCHER_TOOLBAR_MH_KEY = "__nhToolbarSumMh";

/** Registra un punto por tipo (TH y MH) si el total > 0 y pasó ≥1 min desde el último de esa serie. */
export function appendWatcherToolbarSpeedSamplesReturn(
  watcherId: string,
  sumTh: number,
  sumMh: number,
  nowMs: number
): Array<{ rigKey: string; t: number; v: number }> {
  const wid = watcherId.trim().toLowerCase();
  if (!wid) return [];
  const out: Array<{ rigKey: string; t: number; v: number }> = [];
  if (typeof sumTh === "number" && Number.isFinite(sumTh) && sumTh > 0) {
    const r = appendNiceHashRigHashrateSample(wid, NH_WATCHER_TOOLBAR_TH_KEY, sumTh, nowMs);
    if (r.added && r.rigKey != null && r.t != null && r.v != null) {
      out.push({ rigKey: r.rigKey, t: r.t, v: r.v });
    }
  }
  if (typeof sumMh === "number" && Number.isFinite(sumMh) && sumMh > 0) {
    const r = appendNiceHashRigHashrateSample(wid, NH_WATCHER_TOOLBAR_MH_KEY, sumMh, nowMs);
    if (r.added && r.rigKey != null && r.t != null && r.v != null) {
      out.push({ rigKey: r.rigKey, t: r.t, v: r.v });
    }
  }
  return out;
}

export function appendWatcherToolbarSpeedSamples(
  watcherId: string,
  sumTh: number,
  sumMh: number,
  nowMs: number
): void {
  void appendWatcherToolbarSpeedSamplesReturn(watcherId, sumTh, sumMh, nowMs);
}

export function loadNiceHashToolbarThSeries(watcherId: string): number[] {
  return loadNiceHashRigHashrateSeries(watcherId, NH_WATCHER_TOOLBAR_TH_KEY);
}

export function loadNiceHashToolbarMhSeries(watcherId: string): number[] {
  return loadNiceHashRigHashrateSeries(watcherId, NH_WATCHER_TOOLBAR_MH_KEY);
}
