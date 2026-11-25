const NH_HOST = "https://api2.nicehash.com";
const NH_USER_AGENT = "HashrateSGI-MonitorEquiposAsic/1.0";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 4 * 60 * 1000;
const ALGO_CACHE_MS = 6 * 60 * 60 * 1000;

export type NhSpeedPoint = { t: number; v: number };

type AlgoCache = { at: number; byEnum: Map<string, number> };
type PointCache = { at: number; points: NhSpeedPoint[] };

let algoCache: AlgoCache | null = null;
const pointCache = new Map<string, PointCache>();

async function algorithmOrderByEnum(): Promise<Map<string, number>> {
  if (algoCache && Date.now() - algoCache.at < ALGO_CACHE_MS) return algoCache.byEnum;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(`${NH_HOST}/main/api/v2/mining/algorithms`, {
      headers: { Accept: "application/json", "User-Agent": NH_USER_AGENT },
      signal: ac.signal,
    });
    if (!r.ok) return algoCache?.byEnum ?? new Map();
    const body = (await r.json()) as { miningAlgorithms?: unknown[] };
    const list = Array.isArray(body.miningAlgorithms) ? body.miningAlgorithms : [];
    const byEnum = new Map<string, number>();
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as { algorithm?: unknown; order?: unknown };
      const name = typeof o.algorithm === "string" ? o.algorithm.trim().toUpperCase() : "";
      const order = typeof o.order === "number" ? o.order : Number(o.order);
      if (!name || !Number.isInteger(order) || order < 0 || order > 10000) continue;
      byEnum.set(name, order);
    }
    if (byEnum.size > 0) algoCache = { at: Date.now(), byEnum };
    return byEnum;
  } catch {
    return algoCache?.byEnum ?? new Map();
  } finally {
    clearTimeout(tid);
  }
}

function parseSpeedStream(body: unknown, cutoff: number): NhSpeedPoint[] {
  if (!body || typeof body !== "object") return [];
  const o = body as { columns?: unknown; data?: unknown };
  const cols = Array.isArray(o.columns) ? o.columns.map((c) => String(c)) : [];
  const rows = Array.isArray(o.data) ? o.data : [];
  const timeIdx = Math.max(0, cols.indexOf("time"));
  const speedIdx = cols.includes("speed_accepted") ? cols.indexOf("speed_accepted") : 2;
  const out: NhSpeedPoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const t = Number(row[timeIdx]);
    const v = Number(row[speedIdx]);
    if (!Number.isFinite(t) || t < cutoff || !Number.isFinite(v) || v < 0 || v > 1e12) continue;
    out.push({ t, v });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function fetchStream(url: string, cutoff: number): Promise<NhSpeedPoint[]> {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": NH_USER_AGENT },
      signal: ac.signal,
    });
    if (!r.ok) return [];
    return parseSpeedStream(await r.json(), cutoff);
  } catch {
    return [];
  } finally {
    clearTimeout(tid);
  }
}

function remember(key: string, points: NhSpeedPoint[]): void {
  pointCache.set(key, { at: Date.now(), points });
  if (pointCache.size <= 500) return;
  const oldest = [...pointCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
  for (const [k] of oldest) pointCache.delete(k);
}

/**
 * Historial público de NiceHash (velocidad aceptada, ~5 min) desde `sinceMs`.
 * Una serie por equipo. No incluye saldos.
 */
export async function fetchNhRigSpeedHistory(
  watcherId: string,
  rigs: { rigId: string; algorithm: string }[],
  sinceMs: number
): Promise<{ rigId: string; points: NhSpeedPoint[] }[]> {
  const orders = await algorithmOrderByEnum();
  const after = Number.isFinite(sinceMs) ? sinceMs : Date.now() - WINDOW_MS;
  const jobs: { rigId: string; order: number }[] = [];
  const seen = new Set<string>();
  for (const rig of rigs) {
    const rigId = rig.rigId.trim();
    const algo = rig.algorithm.trim().toUpperCase();
    if (!rigId || !algo || seen.has(rigId)) continue;
    const order = orders.get(algo);
    if (order == null) continue;
    seen.add(rigId);
    jobs.push({ rigId, order });
  }

  const results: { rigId: string; points: NhSpeedPoint[] }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      if (!job) continue;
      const key = `${watcherId}|${job.rigId}|${job.order}|${Math.floor(after / 3_600_000)}`;
      const hit = pointCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        results.push({ rigId: job.rigId, points: hit.points });
        continue;
      }
      const url =
        `${NH_HOST}/main/api/v2/mining/external/${encodeURIComponent(watcherId)}` +
        `/rig/stats/algo?rigId=${encodeURIComponent(job.rigId)}&algorithm=${job.order}&afterTimestamp=${after}`;
      const points = await fetchStream(url, after);
      remember(key, points);
      results.push({ rigId: job.rigId, points });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, Math.max(1, jobs.length)) }, () => worker()));
  return results;
}
