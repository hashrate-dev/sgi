import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartJs, ChartConfiguration } from "chart.js";
import { getNiceHashWatcherRigHashHistory, type NiceHashExternalRigs2Payload } from "../lib/api";
import {
  aggregateRigHashPointsByBucketMs,
  loadNiceHashRigHashratePointsMap,
  NH_WATCHER_CHART_RESOLUTION_OPTIONS,
  NH_WATCHER_HASH_SAMPLE_MS,
  type NhRigHashPoint,
} from "../lib/nicehashWatcherRigHashrateHistory";
import { nhWatcherRigStorageKey } from "../lib/nicehashWatcherRigNicknames";
import type { NhWatcherSlotRow } from "../lib/nicehashWatcherSlots";
import "./nicehashFleetHashrateModal.css";

export type FleetHashRigRow = {
  slotIndex: number;
  watcherId: string;
  rigIndex: number;
  rig: NonNullable<NiceHashExternalRigs2Payload["miningRigs"]>[number];
};

const MAX_AXIS_POINTS = 4320;

const HASHRATE_LOGO_LOCAL = "/images/LOGO-HASHRATE.png";
const HASHRATE_LOGO_CDN = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";
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

function speedLooksLikeTh(speed: number): boolean {
  if (!Number.isFinite(speed) || speed <= 0) return true;
  if (speed < 1) return false;
  const intPart = Math.floor(Math.abs(speed));
  const intDigits = Math.floor(Math.log10(intPart)) + 1;
  return intDigits >= 3;
}

type FleetMiningHeaderStats = { total: number; nTh: number; nMh: number; sumTh: number; sumMh: number };

function computeFleetMiningHeaderStats(rows: FleetHashRigRow[]): FleetMiningHeaderStats {
  let nTh = 0;
  let nMh = 0;
  let sumTh = 0;
  let sumMh = 0;
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const sp = row.rig.stats?.[0]?.speedAccepted;
    const v = typeof sp === "number" && Number.isFinite(sp) && sp >= 0 ? sp : 0;
    if (speedLooksLikeTh(v)) {
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

function rigDisplayLabel(row: FleetHashRigRow, slotRows: NhWatcherSlotRow[], isTotal: boolean): string {
  const base = (row.rig.name ?? row.rig.rigId ?? "ASIC").trim() || "ASIC";
  if (!isTotal) return base;
  const nick = (slotRows[row.slotIndex]?.nickname ?? "").trim();
  const w = `W${row.slotIndex + 1}`;
  return nick ? `${w} ${nick} · ${base}` : `${w} · ${base}`;
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

type SplitRow = FleetHashRigRow & { label: string; map: Map<number, number>; isTh: boolean };

function buildSplitRows(
  rows: FleetHashRigRow[],
  slotRows: NhWatcherSlotRow[],
  isTotal: boolean,
  resolutionMs: number
): SplitRow[] {
  const out: SplitRow[] = [];
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const wid = row.watcherId.trim().toLowerCase();
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const rawPts = loadNiceHashRigHashratePointsMap(wid)[rk] ?? [];
    const pts = aggregateRigHashPointsByBucketMs(rawPts, resolutionMs);
    const sp = row.rig.stats?.[0]?.speedAccepted;
    const isTh = speedLooksLikeTh(typeof sp === "number" && Number.isFinite(sp) ? sp : 0);
    out.push({
      ...row,
      label: rigDisplayLabel(row, slotRows, isTotal),
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

function buildDatasets(rows: SplitRow[], filterTh: boolean, axis: number[]): ChartConfiguration["data"]["datasets"] {
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

function makeChartConfig(
  title: string,
  yUnit: string,
  labels: string[],
  datasets: ChartConfiguration["data"]["datasets"],
  yFormat: (n: number) => string
): ChartConfiguration {
  return {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 280 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        title: { display: true, text: title, color: "#f0f6fc", font: { size: 14, weight: 600 } },
        legend: {
          display: true,
          position: "bottom",
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
      },
      scales: {
        x: {
          ticks: { color: "#8b949e", maxTicksLimit: 14, maxRotation: 45 },
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
  isTotal: boolean;
};

export function NiceHashFleetHashrateModal({ open, onClose, rows, slotRows, isTotal }: Props) {
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

  const splitRows = useMemo(
    () => (open ? buildSplitRows(rows, slotRows, isTotal, chartResolutionMs) : []),
    [open, rows, slotRows, isTotal, chartResolutionMs]
  );

  const axisTh = useMemo(() => unionAxisTs(splitRows, true), [splitRows]);
  const axisMh = useMemo(() => unionAxisTs(splitRows, false), [splitRows]);

  const labelsTh = useMemo(() => axisTh.map(formatAxisLabel), [axisTh]);
  const labelsMh = useMemo(() => axisMh.map(formatAxisLabel), [axisMh]);

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

  /** Materializa agregados en BD (15 / 30 / 60 min) a partir de las muestras 1 min del servidor. */
  useEffect(() => {
    if (!open || chartResolutionMs === NH_WATCHER_HASH_SAMPLE_MS) return;
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
    chartThRef.current = new Chart(
      ctx,
      makeChartConfig(
        `Hashrate aceptado · TH/s (ASIC en MINING · intervalo ${chartBucketLabel})`,
        "TH/s",
        labelsTh,
        dsTh,
        (n) => `${n.toFixed(2)} TH/s`
      )
    );
    const ro = new ResizeObserver(() => chartThRef.current?.resize());
    ro.observe(canvas.parentElement ?? canvas);
    return () => {
      ro.disconnect();
      chartThRef.current?.destroy();
      chartThRef.current = null;
    };
  }, [open, axisTh, labelsTh, dsTh, chartBucketLabel]);

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
    chartMhRef.current = new Chart(
      ctx,
      makeChartConfig(
        `Hashrate aceptado · MH/s (ASIC en MINING · intervalo ${chartBucketLabel})`,
        "MH/s",
        labelsMh,
        dsMh,
        (n) => `${n.toFixed(2)} MH/s`
      )
    );
    const ro = new ResizeObserver(() => chartMhRef.current?.resize());
    ro.observe(canvas.parentElement ?? canvas);
    return () => {
      ro.disconnect();
      chartMhRef.current?.destroy();
      chartMhRef.current = null;
    };
  }, [open, axisMh, labelsMh, dsMh, chartBucketLabel]);

  if (!open) return null;

  return (
    <div
      className="nh-fleet-hash-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Monitor de hashrate por equipo"
    >
      <button type="button" className="nh-fleet-hash-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="nh-fleet-hash-dialog">
        <header className="nh-fleet-hash-header">
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
                  width={170}
                  height={44}
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
                  <div className="nh-fleet-hash-kpi-grid">
                    <div
                      className="nh-fleet-hash-kpi-group nh-fleet-hash-kpi-group--th"
                      aria-label="TOTAL ASIC SHA-256 y TH/s totales"
                    >
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--th">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">TOTAL ASICS</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SHA-256</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.nTh}</div>
                        </div>
                      </div>
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--th">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">TOTAL HASHRATE</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SHA-256</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">
                            {fmtHashrateEs(fleetHeaderStats.sumTh)}
                          </div>
                          <span className="nh-fleet-hash-kpi-tile__unit">TH/s</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="nh-fleet-hash-kpi-group nh-fleet-hash-kpi-group--mh"
                      aria-label="TOTAL ASICS SCRYPT y MH/s totales"
                    >
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--mh">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">TOTAL ASICS</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SCRYPT</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.nMh}</div>
                        </div>
                      </div>
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--mh">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">TOTAL HASHRATE</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">SCRYPT</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">
                            {fmtHashrateEs(fleetHeaderStats.sumMh)}
                          </div>
                          <span className="nh-fleet-hash-kpi-tile__unit">MH/s</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="nh-fleet-hash-kpi-group nh-fleet-hash-kpi-group--status"
                      aria-label="ASICs en MINING y fuera de MINING"
                    >
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--total">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">ASICS</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">ACTIVOS</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetHeaderStats.total}</div>
                        </div>
                      </div>
                      <div className="nh-fleet-hash-kpi-tile nh-fleet-hash-kpi-tile--offline">
                        <div className="nh-fleet-hash-kpi-tile__label nh-fleet-hash-kpi-tile__label--stack">
                          <span className="nh-fleet-hash-kpi-tile__label-line">ASICS</span>
                          <span className="nh-fleet-hash-kpi-tile__label-sub">OFFLINE</span>
                        </div>
                        <div className="nh-fleet-hash-kpi-tile__figure">
                          <div className="nh-fleet-hash-kpi-tile__value tabular-nums">{fleetOfflineCount}</div>
                        </div>
                      </div>
                    </div>
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
              className="nh-fleet-hash-resolution-bar nh-fleet-hash-resolution-bar--header"
              role="toolbar"
              aria-label="Temporalidad del gráfico"
            >
              <span className="nh-fleet-hash-resolution-bar__label">Temporalidad</span>
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
            <button type="button" className="nh-fleet-hash-close btn btn-outline-light btn-sm rounded-pill" onClick={onClose}>
              <i className="bi bi-x-lg me-1" aria-hidden />
              Cerrar
            </button>
          </div>
        </header>

        <div className="nh-fleet-hash-body">
          <section className="nh-fleet-hash-panel" aria-label="Gráfico TH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisTh.length === 0 || dsTh.length === 0 ? (
                <div className="nh-fleet-hash-empty">
                  No hay historial TH/s ({chartBucketLabel}) para ASICs en MINING aún.
                </div>
              ) : (
                <canvas ref={canvasThRef} />
              )}
            </div>
          </section>
          <section className="nh-fleet-hash-panel" aria-label="Gráfico MH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisMh.length === 0 || dsMh.length === 0 ? (
                <div className="nh-fleet-hash-empty">
                  No hay historial MH/s ({chartBucketLabel}) para ASICs en MINING aún.
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
