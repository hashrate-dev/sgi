import { useEffect, useId, useMemo, useRef } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartJs, ChartConfiguration } from "chart.js";
import type { NiceHashExternalRigs2Payload } from "../lib/api";
import { loadNiceHashRigHashratePointsMap, type NhRigHashPoint } from "../lib/nicehashWatcherRigHashrateHistory";
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

function buildSplitRows(rows: FleetHashRigRow[], slotRows: NhWatcherSlotRow[], isTotal: boolean): SplitRow[] {
  const out: SplitRow[] = [];
  for (const row of rows) {
    if (String(row.rig.minerStatus ?? "").trim().toUpperCase() !== "MINING") continue;
    const wid = row.watcherId.trim().toLowerCase();
    const rk = nhWatcherRigStorageKey(row.rig, row.rigIndex);
    const pts = loadNiceHashRigHashratePointsMap(wid)[rk] ?? [];
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
  miningCount: number;
};

export function NiceHashFleetHashrateModal({ open, onClose, rows, slotRows, isTotal, miningCount }: Props) {
  const titleId = useId();
  const canvasThRef = useRef<HTMLCanvasElement>(null);
  const canvasMhRef = useRef<HTMLCanvasElement>(null);
  const chartThRef = useRef<ChartJs | null>(null);
  const chartMhRef = useRef<ChartJs | null>(null);

  const splitRows = useMemo(() => (open ? buildSplitRows(rows, slotRows, isTotal) : []), [open, rows, slotRows, isTotal]);

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
        "Hashrate aceptado · TH/s (una línea por ASIC en MINING)",
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
  }, [open, axisTh, labelsTh, dsTh]);

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
        "Hashrate aceptado · MH/s (una línea por ASIC en MINING)",
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
  }, [open, axisMh, labelsMh, dsMh]);

  if (!open) return null;

  return (
    <div className="nh-fleet-hash-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="nh-fleet-hash-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="nh-fleet-hash-dialog">
        <header className="nh-fleet-hash-header">
          <div className="nh-fleet-hash-header__text">
            <h2 id={titleId} className="nh-fleet-hash-title">
              Monitor de hashrate por equipo
            </h2>
            <p className="nh-fleet-hash-sub">
              Resolución ~1 min entre puntos · {miningCount} ASICs en MINING en esta vista · historial en este navegador
              (sincronizado con servidor cuando aplica)
            </p>
          </div>
          <button type="button" className="nh-fleet-hash-close btn btn-outline-light btn-sm rounded-pill" onClick={onClose}>
            <i className="bi bi-x-lg me-1" aria-hidden />
            Cerrar
          </button>
        </header>

        <div className="nh-fleet-hash-body">
          <section className="nh-fleet-hash-panel" aria-label="Gráfico TH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisTh.length === 0 || dsTh.length === 0 ? (
                <div className="nh-fleet-hash-empty">No hay historial TH/s (~1 min) para ASICs en MINING aún.</div>
              ) : (
                <canvas ref={canvasThRef} />
              )}
            </div>
          </section>
          <section className="nh-fleet-hash-panel" aria-label="Gráfico MH por equipo">
            <div className="nh-fleet-hash-canvas-wrap">
              {axisMh.length === 0 || dsMh.length === 0 ? (
                <div className="nh-fleet-hash-empty">No hay historial MH/s (~1 min) para ASICs en MINING aún.</div>
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
