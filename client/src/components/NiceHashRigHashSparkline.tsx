import { memo, useId, useMemo } from "react";
import { sanitizeRigHashSparklineValues } from "../lib/nicehashWatcherRigHashrateHistory";

const W = 128;
const H = 36;
const PAD = 4;

type SparkScale = {
  yAt: (v: number) => number;
  vmin: number;
  vmax: number;
  plotW: number;
  n: number;
};

type NiceHashRigHashSparklineProps = {
  values: number[];
  title?: string;
  /** Líneas guía min/máx/últ + etiquetas; misma escala que la curva. */
  formatHashrate?: (n: number) => string;
};

function sparkStatsFromValues(values: number[]): { last: number; min: number; max: number } | null {
  if (!values.length) return null;
  const last = values[values.length - 1]!;
  if (!Number.isFinite(last)) return null;
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return null;
  let min = finite[0]!;
  let max = finite[0]!;
  for (let i = 1; i < finite.length; i++) {
    const v = finite[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { last, min, max };
}

function computeSparkScale(values: number[]): SparkScale | null {
  const n = values.length;
  if (n === 0) return null;
  let vmin = Math.min(...values);
  let vmax = Math.max(...values);
  if (vmax > 0 && vmin === 0) {
    const positive = values.filter((v) => v > 0);
    if (positive.length >= 1) vmin = Math.min(...positive);
  }
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return null;
  if (vmin === vmax) {
    vmin -= Math.abs(vmin) * 0.06 + 0.01;
    vmax += Math.abs(vmax) * 0.06 + 0.01;
  }
  const innerH = H - PAD * 2;
  const plotW = W - PAD * 2;
  if (plotW <= 4) return null;
  const yAt = (v: number) => PAD + innerH - ((v - vmin) / (vmax - vmin)) * innerH;
  return { yAt, vmin, vmax, plotW, n };
}

type LevelKind = "min" | "max" | "last";

function mergeLevelRows(
  stats: { min: number; max: number; last: number },
  scale: SparkScale
): { v: number; yLine: number; labelY: number; kinds: LevelKind[] }[] {
  const eps = 1e-9 * (Math.abs(stats.max) + Math.abs(stats.min) + 1);
  const raw: { v: number; kind: LevelKind }[] = [
    { v: stats.max, kind: "max" },
    { v: stats.last, kind: "last" },
    { v: stats.min, kind: "min" },
  ];
  const rows: { v: number; yLine: number; labelY: number; kinds: LevelKind[] }[] = [];
  for (const { v, kind } of raw) {
    if (!Number.isFinite(v)) continue;
    const yLine = scale.yAt(v);
    const hit = rows.find((r) => Math.abs(r.v - v) < eps);
    if (hit) {
      if (!hit.kinds.includes(kind)) hit.kinds.push(kind);
    } else {
      rows.push({ v, yLine, labelY: yLine, kinds: [kind] });
    }
  }
  rows.sort((a, b) => a.yLine - b.yLine);
  const minGap = 4.5;
  let prevLabelY = -1e9;
  for (const r of rows) {
    let ly = r.yLine;
    if (ly - prevLabelY < minGap) ly = prevLabelY + minGap;
    if (ly > H - PAD - 2) ly = H - PAD - 2;
    r.labelY = ly;
    prevLabelY = ly;
  }
  return rows;
}

const SMOOTH_K = 1 / 6;

function catmullRomCurveThrough(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return "";
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) * SMOOTH_K;
    const c1y = p1.y + (p2.y - p0.y) * SMOOTH_K;
    const c2x = p2.x - (p3.x - p1.x) * SMOOTH_K;
    const c2y = p2.y - (p3.y - p1.y) * SMOOTH_K;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function buildSparkLayout(values: number[]): {
  d: { line: string; area: string };
  hasArea: boolean;
  scale: SparkScale | null;
} {
  const scale = computeSparkScale(values);
  if (!scale) return { d: { line: "", area: "" }, hasArea: false, scale: null };

  const { yAt, plotW, n } = scale;
  const xAt = (i: number) => (n === 1 ? PAD + plotW / 2 : PAD + (i / (n - 1)) * plotW);

  if (n === 1) {
    const y = yAt(values[0]!);
    const xm = PAD + plotW / 2;
    const line = `M ${(xm - 18).toFixed(2)} ${y.toFixed(2)} L ${(xm + 18).toFixed(2)} ${y.toFixed(2)}`;
    return { d: { line, area: "" }, hasArea: false, scale };
  }

  const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const baseY = PAD + (H - PAD * 2);
  const curve = catmullRomCurveThrough(pts);
  const line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}${curve}`;
  const area = `M ${pts[0].x.toFixed(2)} ${baseY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}${curve} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} Z`;

  return { d: { line, area }, hasArea: n >= 2, scale };
}

function guideRowTitle(kinds: LevelKind[]): string {
  const has = (k: LevelKind) => kinds.includes(k);
  const parts: string[] = [];
  if (has("max")) parts.push("Máximo");
  if (has("last")) parts.push("Último");
  if (has("min")) parts.push("Mínimo");
  return parts.join(" · ");
}

function kindPrefixShort(kinds: LevelKind[]): string {
  const has = (k: LevelKind) => kinds.includes(k);
  const parts: string[] = [];
  if (has("max")) parts.push("Máx");
  if (has("last")) parts.push("Últ");
  if (has("min")) parts.push("Mín");
  return parts.length ? `${parts.join("/")} ` : "";
}

/**
 * Sparkline a ancho completo del contenedor (preserveAspectRatio=none).
 * Etiquetas en HTML encima para que no se deformen al estirar el SVG.
 */
function NiceHashRigHashSparklineInner({ values, title, formatHashrate }: NiceHashRigHashSparklineProps) {
  const gid = useId().replace(/:/g, "");
  const gradId = `nhRigSparkFill-${gid}`;
  const plotValues = useMemo(() => sanitizeRigHashSparklineValues(values), [values]);
  const layout = useMemo(() => buildSparkLayout(plotValues), [plotValues]);
  const { d, hasArea, scale } = layout;
  const stats = useMemo(() => sparkStatsFromValues(plotValues), [plotValues]);
  const statsTitle =
    stats && formatHashrate
      ? `Último registro: ${formatHashrate(stats.last)} · Mín. en gráfica: ${formatHashrate(stats.min)} · Máx.: ${formatHashrate(stats.max)}`
      : undefined;
  const combinedTitle = [title, statsTitle].filter(Boolean).join(" — ");

  const guideRows = useMemo(() => {
    if (!formatHashrate || !stats || !scale) return null;
    return mergeLevelRows(stats, scale);
  }, [formatHashrate, stats, scale]);

  if (plotValues.length === 0) {
    return (
      <div className="nh-watcher-rig-spark nh-watcher-rig-spark--empty" title={title ?? "Sin historial aún (~1 min entre muestras)"} aria-hidden>
        <svg viewBox={`0 0 ${W} ${H}`} className="nh-watcher-rig-spark__svg" preserveAspectRatio="none">
          <rect x="0" y="0" width={W} height={H} rx="6" className="nh-watcher-rig-spark__bg" />
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="5.5" className="nh-watcher-rig-spark__frame" fill="none" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="nh-watcher-rig-spark"
      title={combinedTitle || title || "Tendencia hashrate (~1 min entre muestras; historial por usuario en servidor)"}
    >
      <div className="nh-watcher-rig-spark__canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="nh-watcher-rig-spark__svg" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.18" />
              <stop offset="72%" stopColor="#34d399" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} rx="6" className="nh-watcher-rig-spark__bg" />
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="5.5" className="nh-watcher-rig-spark__frame" fill="none" />
          {[1, 2, 3].map((i) => {
            const innerH = H - PAD * 2;
            const y = PAD + (innerH * i) / 4;
            return (
              <line
                key={`grid-${i}`}
                x1={PAD}
                y1={y}
                x2={W - PAD}
                y2={y}
                className="nh-watcher-rig-spark__grid"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {guideRows && scale
            ? guideRows.map(({ v, yLine }, idx) => (
                <line
                  key={`${idx}-${v}`}
                  x1={PAD}
                  y1={yLine}
                  x2={PAD + scale.plotW}
                  y2={yLine}
                  className="nh-watcher-rig-spark__guide"
                  vectorEffect="non-scaling-stroke"
                />
              ))
            : null}
          {hasArea ? <path d={d.area} fill={`url(#${gradId})`} className="nh-watcher-rig-spark__fill" /> : null}
          <path d={d.line} fill="none" className="nh-watcher-rig-spark__line" vectorEffect="non-scaling-stroke" />
        </svg>
        {guideRows && formatHashrate
          ? guideRows.map(({ v, labelY, kinds }, idx) => {
              const ultDerecha = kinds.includes("last");
              const topPct = (labelY / H) * 100;
              return (
                <span
                  key={`lbl-${idx}-${v}`}
                  className={`nh-watcher-rig-spark__html-label${ultDerecha ? " is-right" : " is-left"}`}
                  style={{ top: `${topPct}%` }}
                  title={guideRowTitle(kinds)}
                >
                  {kindPrefixShort(kinds)}
                  <strong>{formatHashrate(v)}</strong>
                </span>
              );
            })
          : null}
      </div>
    </div>
  );
}

export const NiceHashRigHashSparkline = memo(NiceHashRigHashSparklineInner, (prev, next) => {
  return prev.values === next.values && prev.formatHashrate === next.formatHashrate;
});
