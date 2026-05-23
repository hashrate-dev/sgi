import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type {
  Chart as ChartJs,
  ChartConfiguration,
  ChartDataset,
  ChartEvent,
  ChartOptions,
  LegendElement,
  LegendItem,
  Plugin,
} from "chart.js";
import { getNiceHashWatcherRigHashHistory, postNiceHashWatcherRigHashHistorySamples, type NiceHashExternalRigs2Payload, type NhWatcherRigHashSample } from "../lib/api";
import {
  aggregateRigHashPointsByBucketMs,
  loadNiceHashRigHashratePointsMap,
  NH_WATCHER_CHART_LIVE_MS,
  NH_WATCHER_CHART_RESOLUTION_OPTIONS,
  NH_WATCHER_HASH_SAMPLE_MS,
  type NhRigHashPoint,
} from "../lib/nicehashWatcherRigHashrateHistory";
import { nhWatcherRigStorageKey } from "../lib/nicehashWatcherRigNicknames";
import {
  loadWatcherSlotRows,
  watcherAccountLabelForSlot,
  type NhWatcherSlotRow,
} from "../lib/nicehashWatcherSlots";
import { nhAcceptedSpeedLooksLikeTh, nhRigSpeedAcceptedFromStats } from "../lib/nhSpeedAccepted";
import { HASHRATE_SPACE_LOGO } from "../lib/marketplaceWpAssets.js";
import "./nicehashFleetHashrateModal.css";

export type FleetHashRigRow = {
  slotIndex: number;
  watcherId: string;
  rigIndex: number;
  rig: NonNullable<NiceHashExternalRigs2Payload["miningRigs"]>[number];
  /** Nickname de cuenta (MARIRI, VALKYRIA…); el modal puede recalcularlo si falta. */
  accountLabel?: string;
};

const MAX_AXIS_POINTS = 4320;

/** LIVE: refresco de curvas con `speedAccepted` del payload actual (no espera al bucket de 1 min). */
const LIVE_POLL_MS = 5000;
const LIVE_RETAIN_MS = 40 * 60 * 1000;
const LIVE_SEED_BUCKETS = 90;
const LIVE_MAX_POINTS_PER_RIG = 480;

const HASHRATE_LOGO_LOCAL = "/images/LOGO-HASHRATE.png";
const HASHRATE_LOGO_CDN = HASHRATE_SPACE_LOGO;
const HASHRATE_LOGO_LOCAL_ALT = "/images/HASHRATELOGO2.png";

/** CDN primero (suele ir con alpha); locales como respaldo (a veces vienen con fondo blanco). */
const HASHRATE_LOGO_SOURCES: readonly string[] = [HASHRATE_LOGO_CDN, HASHRATE_LOGO_LOCAL, HASHRATE_LOGO_LOCAL_ALT];

const CHART_COLORS = [
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#93c5fd",
  "#f87171",
  "#c084fc",
  "#4ade80",
  "#38bdf8",
  "#fcd34d",
  "#e879f9",
  "#facc15",
  "#818cf8",
];

type FleetMiningHeaderStats = { total: number; nTh: number; nMh: number; sumTh: number; sumMh: number };

function computeFleetMiningHeaderStats(rows: FleetHashRigRow[]): FleetMiningHeaderStats {
  let nTh = 0;
  let nMh = 0;
  let sumTh = 0;
  let sumMh = 0;
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const sp = nhRigSpeedAcceptedFromStats(row.rig.stats as unknown[]) ?? 0;
    const v = Number.isFinite(sp) && sp >= 0 ? sp : 0;
    if (nhAcceptedSpeedLooksLikeTh(v)) {
      nTh += 1;
      sumTh += v;
    } else {
      nMh += 1;
      sumMh += v;
    }
  }
  return { total: nTh + nMh, nTh, nMh, sumTh, sumMh };
}

/** Rigs con estado distinto de MINING (offline, detenido, etc.). */
function countFleetRigsNotMining(rows: FleetHashRigRow[]): number {
  let n = 0;
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") n += 1;
  }
  return n;
}

function fmtHashrateEs(n: number, maxFrac = 2): string {
  return n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
}

function rigDisplayLabel(row: FleetHashRigRow, slotRows: NhWatcherSlotRow[]): string {
  const base = (row.rig.name ?? row.rig.rigId ?? "ASIC").trim() || "ASIC";
  const account =
    (row.accountLabel ?? "").trim() || watcherAccountLabelForSlot(slotRows, row.slotIndex, row.watcherId);
  return account ? `${account} - ${base}` : base;
}

function pointsToMap(pts: NhRigHashPoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of pts) {
    if (Number.isFinite(p.t) && Number.isFinite(p.v)) m.set(p.t, p.v);
  }
  return m;
}

function formatAxisLabel(t: number): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-UY", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatAxisLabelForChart(t: number, resolutionMs: number): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  if (resolutionMs === NH_WATCHER_CHART_LIVE_MS) {
    return d.toLocaleString("es-UY", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return formatAxisLabel(t);
}

/** Título del gráfico (tono monitorización / operaciones). */
function nhFleetHashChartTitle(axisUnit: "TH/s" | "MH/s", resolutionLabel: string): string {
  const cadencia =
    resolutionLabel === "LIVE"
      ? "serie en vivo (LIVE)"
      : resolutionLabel === "1 min"
        ? "resolución 1 min"
        : `agregado ${resolutionLabel}`;
  return `Hashrate aceptado · ${axisUnit} · MINING · ${cadencia}`;
}

function nhFleetHashChartEmptyHint(axisUnit: "TH/s" | "MH/s", resolutionLabel: string): string {
  const modo = resolutionLabel === "LIVE" ? "LIVE" : resolutionLabel;
  return `Sin serie ${axisUnit} (${modo}) para la flota en MINING.`;
}

type SplitRow = FleetHashRigRow & { label: string; map: Map<number, number>; isTh: boolean };

function buildSplitRows(rows: FleetHashRigRow[], slotRows: NhWatcherSlotRow[], resolutionMs: number): SplitRow[] {
  const out: SplitRow[] = [];
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const wid = row.watcherId.trim().toLowerCase();
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const rawPts = loadNiceHashRigHashratePointsMap(wid)[rk] ?? [];
    const pts = aggregateRigHashPointsByBucketMs(rawPts, resolutionMs);
    const sp = nhRigSpeedAcceptedFromStats(row.rig.stats as unknown[]);
    const isTh = nhAcceptedSpeedLooksLikeTh(sp ?? 0);
    out.push({
      ...row,
      label: rigDisplayLabel(row, slotRows),
      map: pointsToMap(pts),
      isTh,
    });
  }
  return out;
}

function seedLiveSeriesFromHistory(rows: FleetHashRigRow[]): Record<string, NhRigHashPoint[]> {
  const liveMap: Record<string, NhRigHashPoint[]> = {};
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const wid = row.watcherId.trim().toLowerCase();
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const rawPts = loadNiceHashRigHashratePointsMap(wid)[rk] ?? [];
    const oneMin = aggregateRigHashPointsByBucketMs(rawPts, NH_WATCHER_HASH_SAMPLE_MS);
    liveMap[rk] = oneMin.slice(-LIVE_SEED_BUCKETS);
  }
  return liveMap;
}

function appendLiveSamples(
  liveMap: Record<string, NhRigHashPoint[]>,
  rows: FleetHashRigRow[],
  nowMs: number
): Record<string, NhRigHashPoint[]> {
  const cutoff = nowMs - LIVE_RETAIN_MS;
  const next: Record<string, NhRigHashPoint[]> = {};
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const base = liveMap[rk] ?? [];
    const parsed = nhRigSpeedAcceptedFromStats(row.rig.stats as unknown[]);
    const v = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const arr = [...base, { t: nowMs, v }].filter((p) => p.t >= cutoff);
    next[rk] = arr.length > LIVE_MAX_POINTS_PER_RIG ? arr.slice(-LIVE_MAX_POINTS_PER_RIG) : arr;
  }
  return next;
}

const LIVE_POST_CHUNK = 380;

function collectLiveSamplesForDb(rows: FleetHashRigRow[], nowMs: number): Map<string, NhWatcherRigHashSample[]> {
  const byWid = new Map<string, NhWatcherRigHashSample[]>();
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const wid = row.watcherId.trim().toLowerCase();
    if (!wid) continue;
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const parsed = nhRigSpeedAcceptedFromStats(row.rig.stats as unknown[]);
    const v = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const arr = byWid.get(wid) ?? [];
    arr.push({ rigKey: rk, t: Math.floor(nowMs), v });
    byWid.set(wid, arr);
  }
  return byWid;
}

/** Persiste en BD el hashrate actual (modo `live`: UPSERT del bucket de 1 min por rig). */
function postLiveSamplesToServer(rows: FleetHashRigRow[], nowMs: number): void {
  const byWid = collectLiveSamplesForDb(rows, nowMs);
  for (const [wid, samples] of byWid) {
    if (samples.length === 0) continue;
    for (let i = 0; i < samples.length; i += LIVE_POST_CHUNK) {
      void postNiceHashWatcherRigHashHistorySamples(wid, samples.slice(i, i + LIVE_POST_CHUNK), { live: true }).catch(
        () => {}
      );
    }
  }
}

function buildSplitRowsLive(
  rows: FleetHashRigRow[],
  slotRows: NhWatcherSlotRow[],
  liveByKey: Record<string, NhRigHashPoint[]>
): SplitRow[] {
  const out: SplitRow[] = [];
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const pts = liveByKey[rk] ?? [];
    const sp = nhRigSpeedAcceptedFromStats(row.rig.stats as unknown[]);
    const isTh = nhAcceptedSpeedLooksLikeTh(sp ?? 0);
    out.push({
      ...row,
      label: rigDisplayLabel(row, slotRows),
      map: pointsToMap(pts),
      isTh,
    });
  }
  return out;
}

function unionAxisTs(rows: SplitRow[], filterTh: boolean): number[] {
  const s = new Set<number>();
  for (const row of rows) {
    if (row.isTh !== filterTh) continue;
    for (const t of row.map.keys()) s.add(t);
  }
  return [...s].sort((a, b) => a - b).slice(-MAX_AXIS_POINTS);
}

function buildDatasets(rows: SplitRow[], filterTh: boolean, axis: number[]): ChartDataset<"line">[] {
  const slice = rows.filter((r) => r.isTh === filterTh && r.map.size > 0);
  return slice.map((row, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return {
      label: row.label,
      data: axis.map((t) => {
        const v = row.map.get(t);
        return v != null && Number.isFinite(v) ? v : null;
      }),
      borderColor: color,
      backgroundColor: `${color}18`,
      tension: 0.22,
      spanGaps: false,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      fill: false,
    };
  });
}

/** Círculo parpadeante en el último punto visible de cada serie (solo modo LIVE). */
const nhFleetHashLiveLastPointPlugin: Plugin<"line"> = {
  id: "nhFleetHashLiveLastPoint",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins as Record<string, { enabled?: boolean } | undefined> | undefined;
    const cfg = opts?.nhFleetHashLiveLastPoint;
    if (!cfg?.enabled) return;

    const ctx = chart.ctx;
    const pulse = 0.38 + 0.62 * (0.5 + 0.5 * Math.sin((Date.now() / 420) * Math.PI * 2));

    for (let di = 0; di < chart.data.datasets.length; di++) {
      const meta = chart.getDatasetMeta(di);
      if (!meta || meta.hidden || meta.type !== "line") continue;
      const ds = chart.data.datasets[di];
      const br = ds.borderColor;
      const border =
        typeof br === "string"
          ? br
          : Array.isArray(br) && typeof br[0] === "string"
            ? br[0]
            : "#34d399";

      const pts = meta.data;
      if (!pts?.length) continue;

      for (let i = pts.length - 1; i >= 0; i--) {
        const el = pts[i] as { x?: number; y?: number; skip?: boolean } | undefined;
        if (!el || el.skip || typeof el.x !== "number" || typeof el.y !== "number") continue;
        const raw = ds.data[i];
        if (raw == null || !Number.isFinite(Number(raw))) continue;

        const { x, y } = el;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = border;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  },
};

/** Clic en leyenda: solo esa serie; segundo clic en la misma → todas visibles. */
function nhFleetHashLegendSoloFocusHandler(_evt: ChartEvent, legendItem: LegendItem, legend: LegendElement<"line">): void {
  const chart = legend.chart;
  const idx = legendItem.datasetIndex;
  if (idx == null || idx < 0 || !chart.data.datasets.length) return;

  const onlyThisVisible = chart.data.datasets.every((_, i) => {
    const hidden = chart.getDatasetMeta(i).hidden;
    return i === idx ? !hidden : Boolean(hidden);
  });

  for (let i = 0; i < chart.data.datasets.length; i++) {
    chart.getDatasetMeta(i).hidden = onlyThisVisible ? false : i !== idx;
  }
  chart.update();
}

function nhFleetHashLegendPointerHover(evt: ChartEvent, item: LegendItem | null): void {
  const target = evt.native?.target;
  if (target instanceof HTMLElement) {
    target.style.cursor = item ? "pointer" : "default";
  }
}

function makeChartConfig(
  title: string,
  yUnit: string,
  labels: string[],
  datasets: ChartDataset<"line">[],
  yFormat: (n: number) => string,
  opts?: { live?: boolean }
): ChartConfiguration<"line"> {
  const live = Boolean(opts?.live);
  const plugins: ChartOptions<"line">["plugins"] = {
    title: {
      display: true,
      text: title,
      color: "#f8fafc",
      font: { size: 13, weight: "bold" as const },
      padding: { top: 8, bottom: 12 },
    },
    legend: {
      display: true,
      position: "bottom",
      onClick: nhFleetHashLegendSoloFocusHandler,
      onHover: nhFleetHashLegendPointerHover,
      labels: {
        color: "#c9d1d9",
        boxWidth: 12,
        padding: 10,
        font: { size: 10 },
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: "#161b22",
      titleColor: "#f0f6fc",
      bodyColor: "#c9d1d9",
      borderColor: "rgba(52, 211, 153, 0.35)",
      borderWidth: 1,
      callbacks: {
        label(ctx) {
          const raw = ctx.parsed.y;
          if (raw == null || !Number.isFinite(raw)) return `${ctx.dataset.label}: —`;
          return `${ctx.dataset.label}: ${yFormat(raw)}`;
        },
      },
    },
    nhFleetHashLiveLastPoint: live ? { enabled: true } : { enabled: false },
  } as ChartOptions<"line">["plugins"];

  return {
    type: "line",
    plugins: live ? [nhFleetHashLiveLastPointPlugin] : [],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: live ? { duration: 0 } : { duration: 280 },
      interaction: { mode: "index", intersect: false },
      plugins,
      scales: {
        x: {
          ticks: {
            color: "#8b949e",
            maxTicksLimit: live ? 20 : 14,
            maxRotation: 45,
          },
          grid: { color: "rgba(148, 163, 184, 0.1)" },
        },
        y: {
          title: { display: true, text: yUnit, color: "#8b949e", font: { size: 11 } },
          ticks: {
            color: "#8b949e",
            callback(v) {
              const n = typeof v === "number" ? v : Number(v);
              return Number.isFinite(n) ? yFormat(n) : "";
            },
          },
          grid: { color: "rgba(148, 163, 184, 0.12)" },
        },
      },
    },
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  rows: FleetHashRigRow[];
  slotRows: NhWatcherSlotRow[];
};

export function NiceHashFleetHashrateModal({ open, onClose, rows, slotRows }: Props) {
  const fleetHeaderStats = useMemo(() => computeFleetMiningHeaderStats(rows), [rows]);
  const fleetOfflineCount = useMemo(() => countFleetRigsNotMining(rows), [rows]);
  const fleetKpiHasAny = fleetHeaderStats.total > 0 || fleetOfflineCount > 0;

  const canvasThRef = useRef<HTMLCanvasElement>(null);
  const canvasMhRef = useRef<HTMLCanvasElement>(null);
  const chartThRef = useRef<ChartJs | null>(null);
  const chartMhRef = useRef<ChartJs | null>(null);
  const [hashrateLogoIx, setHashrateLogoIx] = useState(0);
  const hashrateLogoSrc = HASHRATE_LOGO_SOURCES[hashrateLogoIx] ?? HASHRATE_LOGO_SOURCES[0];
  const hashrateLogoMatKnockout = hashrateLogoIx > 0;
  const [chartResolutionMs, setChartResolutionMs] = useState(NH_WATCHER_HASH_SAMPLE_MS);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const liveSeriesRef = useRef<Record<string, NhRigHashPoint[]>>({});
  const [liveTick, setLiveTick] = useState(0);

  const chartBucketLabel = useMemo(
    () => NH_WATCHER_CHART_RESOLUTION_OPTIONS.find((o) => o.ms === chartResolutionMs)?.label ?? "1 min",
    [chartResolutionMs]
  );

  const watcherIdsKey = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (String(r.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
      s.add(r.watcherId.trim().toLowerCase());
    }
    return [...s].sort().join(",");
  }, [rows]);

  /** Nicknames de cuenta al abrir el modal (localStorage fresco). */
  const slotRowsForLabels = useMemo(() => {
    if (!open) return slotRows;
    return loadWatcherSlotRows();
  }, [open, slotRows]);

  const splitRows = useMemo(() => {
    if (!open) return [];
    if (chartResolutionMs === NH_WATCHER_CHART_LIVE_MS) {
      return buildSplitRowsLive(rows, slotRowsForLabels, liveSeriesRef.current);
    }
    return buildSplitRows(rows, slotRowsForLabels, chartResolutionMs);
  }, [open, rows, slotRowsForLabels, chartResolutionMs, liveTick]);

  const axisTh = useMemo(() => unionAxisTs(splitRows, true), [splitRows]);
  const axisMh = useMemo(() => unionAxisTs(splitRows, false), [splitRows]);

  const labelsTh = useMemo(
    () => axisTh.map((t) => formatAxisLabelForChart(t, chartResolutionMs)),
    [axisTh, chartResolutionMs]
  );
  const labelsMh = useMemo(
    () => axisMh.map((t) => formatAxisLabelForChart(t, chartResolutionMs)),
    [axisMh, chartResolutionMs]
  );

  const dsTh = useMemo(() => buildDatasets(splitRows, true, axisTh), [splitRows, axisTh]);
  const dsMh = useMemo(() => buildDatasets(splitRows, false, axisMh), [splitRows, axisMh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setChartResolutionMs(NH_WATCHER_HASH_SAMPLE_MS);
  }, [open]);

  /** Materializa agregados en BD (15 / 30 / 60 min) a partir de las muestras 1 min del servidor. LIVE no usa este GET. */
  useEffect(() => {
    if (!open || chartResolutionMs === NH_WATCHER_HASH_SAMPLE_MS || chartResolutionMs === NH_WATCHER_CHART_LIVE_MS)
      return;
    const ids = watcherIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    void (async () => {
      await Promise.all(
        ids.map(async (wid) => {
          try {
            await getNiceHashWatcherRigHashHistory(wid, { resolutionMs: chartResolutionMs });
          } catch {
            /* sin sesión o red */
          }
        })
      );
    })();
  }, [open, chartResolutionMs, watcherIdsKey]);

  /** LIVE: semilla desde historial 1 min + muestra `speedAccepted` cada LIVE_POLL_MS. */
  useEffect(() => {
    if (!open || chartResolutionMs !== NH_WATCHER_CHART_LIVE_MS) return;
    liveSeriesRef.current = seedLiveSeriesFromHistory(rowsRef.current);
    liveSeriesRef.current = appendLiveSamples(liveSeriesRef.current, rowsRef.current, Date.now());
    postLiveSamplesToServer(rowsRef.current, Date.now());
    setLiveTick((x) => x + 1);
    const id = window.setInterval(() => {
      const t = Date.now();
      liveSeriesRef.current = appendLiveSamples(liveSeriesRef.current, rowsRef.current, t);
      postLiveSamplesToServer(rowsRef.current, t);
      setLiveTick((x) => x + 1);
    }, LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, chartResolutionMs]);

  useEffect(() => {
    if (!open) {
      chartThRef.current?.destroy();
      chartThRef.current = null;
      return;
    }
    const canvas = canvasThRef.current;
    if (!canvas || axisTh.length === 0 || dsTh.length === 0) {
      chartThRef.current?.destroy();
      chartThRef.current = null;
      return;
    }
    chartThRef.current?.destroy();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const live = chartResolutionMs === NH_WATCHER_CHART_LIVE_MS;
    chartThRef.current = new Chart(
      ctx,
      makeChartConfig(
        nhFleetHashChartTitle("TH/s", chartBucketLabel),
        "TH/s",
        labelsTh,
        dsTh,
        (n) => `${n.toFixed(2)} TH/s`,
        { live }
      )
    );
    const ro = new ResizeObserver(() => chartThRef.current?.resize());
    ro.observe(canvas.parentElement ?? canvas);
    return () => {
      ro.disconnect();
      chartThRef.current?.destroy();
      chartThRef.current = null;
    };
  }, [open, axisTh, labelsTh, dsTh, chartBucketLabel, chartResolutionMs]);

  useEffect(() => {
    if (!open) {
      chartMhRef.current?.destroy();
      chartMhRef.current = null;
      return;
    }
    const canvas = canvasMhRef.current;
    if (!canvas || axisMh.length === 0 || dsMh.length === 0) {
      chartMhRef.current?.destroy();
      chartMhRef.current = null;
      return;
    }
    chartMhRef.current?.destroy();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const live = chartResolutionMs === NH_WATCHER_CHART_LIVE_MS;
    chartMhRef.current = new Chart(
      ctx,
      makeChartConfig(
        nhFleetHashChartTitle("MH/s", chartBucketLabel),
        "MH/s",
        labelsMh,
        dsMh,
        (n) => `${n.toFixed(2)} MH/s`,
        { live }
      )
    );
    const ro = new ResizeObserver(() => chartMhRef.current?.resize());
    ro.observe(canvas.parentElement ?? canvas);
    return () => {
      ro.disconnect();
      chartMhRef.current?.destroy();
      chartMhRef.current = null;
    };
  }, [open, axisMh, labelsMh, dsMh, chartBucketLabel, chartResolutionMs]);

  /** LIVE: redibuja para que el plugin del último punto parpadee sin reconstruir el chart. */
  useEffect(() => {
    if (!open || chartResolutionMs !== NH_WATCHER_CHART_LIVE_MS) return;
    const id = window.setInterval(() => {
      chartThRef.current?.draw();
      chartMhRef.current?.draw();
    }, 450);
    return () => window.clearInterval(id);
  }, [open, chartResolutionMs]);

  if (!open) return null;

  return (
    <div
      className="nh-fleet-hash-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Monitor de hashrate por equipo"
    >
      <button type="button" className="nh-fleet-hash-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="nh-fleet-hash-dialog nh-fleet-hash-dialog--pro">
        <header className="nh-fleet-hash-header nh-fleet-hash-header--pro">
          <div className="nh-fleet-hash-header__brand">
            <a
              href="https://hashrate.space/"
              target="_blank"
              rel="noopener noreferrer"
              className="nh-fleet-hash-brand-link"
              aria-label="Hashrate Space (abre en nueva pestaña)"
              title="hashrate.space"
            >
              <span
                className={`nh-fleet-hash-brand-chip${hashrateLogoMatKnockout ? " nh-fleet-hash-brand-chip--mat" : ""}`}
              >
                <img
                  src={hashrateLogoSrc}
                  alt="HASHRATE"
                  className="nh-fleet-hash-brand-logo"
                  width={240}
                  height={62}
                  decoding="async"
                  onError={() =>
                    setHashrateLogoIx((i) => (i < HASHRATE_LOGO_SOURCES.length - 1 ? i + 1 : i))
                  }
                />
              </span>
            </a>
            <div className="nh-fleet-hash-header__text">
              <div className="nh-fleet-hash-kpi-wrap" role="status" aria-live="polite">
                {fleetKpiHasAny ? (
                  <div className="nh-fleet-hash-kpi-grid nh-fleet-hash-kpi-grid--pro" role="list">
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--th" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-hdd-network nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">Total ASICs</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SHA-256</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.nTh}</p>
                      </div>
                    </article>
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--th-rate" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-speedometer2 nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">Hashrate total</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SHA-256</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value nh-fleet-hash-kpi-tile__value--split tabular-nums">
                          <span className="nh-fleet-hash-kpi-tile__value-main">{fmtHashrateEs(fleetHeaderStats.sumTh)}</span>
                          <span className="nh-fleet-hash-kpi-tile__unit">TH/s</span>
                        </p>
                      </div>
                    </article>
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--mh" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-lightning-charge nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">Total ASICs</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">Scrypt</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.nMh}</p>
                      </div>
                    </article>
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--mh-rate" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-graph-up nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">Hashrate total</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">Scrypt</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value nh-fleet-hash-kpi-tile__value--split tabular-nums">
                          <span className="nh-fleet-hash-kpi-tile__value-main">{fmtHashrateEs(fleetHeaderStats.sumMh)}</span>
                          <span className="nh-fleet-hash-kpi-tile__unit">MH/s</span>
                        </p>
                      </div>
                    </article>
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--active" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-check-circle nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">ASICs</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">Activos</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.total}</p>
                      </div>
                    </article>
                    <article className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--pro nh-fleet-hash-kpi-tile--offline" role="listitem">
                      <header className="nh-fleet-hash-kpi-tile__head">
                        <span className="nh-fleet-hash-kpi-tile__icon-wrap" aria-hidden>
                          <i className="bi bi-exclamation-circle nh-fleet-hash-kpi-tile__icon" />
                        </span>
                        <div className="nh-fleet-hash-kpi-tile__label-wrap">
                          <span className="nh-fleet-hash-kpi-tile__label-line">ASICs</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">Offline</span>
                        </div>
                      </header>
                      <div className="nh-fleet-hash-kpi-tile__body">
                        <p className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetOfflineCount}</p>
                      </div>
                    </article>
                  </div>
                ) : (
                  <div className="nh-fleet-hash-kpi-empty">
                    Ningún ASIC en MINING ni fuera de MINING para la selección actual.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="nh-fleet-hash-header__actions">
            <div
              className="nh-fleet-hash-resolution-bar nh-fleet-hash-resolution-bar--header nh-fleet-hash-resolution-bar--pro"
              role="toolbar"
              aria-label="Temporalidad del gráfico"
            >
              <div className="nh-fleet-hash-resolution-bar__btns">
                {NH_WATCHER_CHART_RESOLUTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    className={`nh-fleet-hash-resolution-btn${opt.ms === chartResolutionMs ? " nh-fleet-hash-resolution-btn--active" : ""}`}
                    onClick={() => setChartResolutionMs(opt.ms)}
                    aria-pressed={opt.ms === chartResolutionMs}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="nh-fleet-hash-close nh-fleet-hash-close--pro" onClick={onClose}>
              <i className="bi bi-x-lg me-1" aria-hidden />
              Cerrar
            </button>
          </div>
        </header>

        <div className="nh-fleet-hash-body nh-fleet-hash-body--pro">
          <section className="nh-fleet-hash-panel nh-fleet-hash-panel--pro nh-fleet-hash-panel--th" aria-label="Gráfico TH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisTh.length === 0 || dsTh.length === 0 ? (
                <div className="nh-fleet-hash-empty">
                  {nhFleetHashChartEmptyHint("TH/s", chartBucketLabel)}
                </div>
              ) : (
                <canvas ref={canvasThRef} />
              )}
            </div>
          </section>
          <section className="nh-fleet-hash-panel nh-fleet-hash-panel--pro nh-fleet-hash-panel--mh" aria-label="Gráfico MH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisMh.length === 0 || dsMh.length === 0 ? (
                <div className="nh-fleet-hash-empty">
                  {nhFleetHashChartEmptyHint("MH/s", chartBucketLabel)}
                </div>
              ) : (
                <canvas ref={canvasMhRef} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
