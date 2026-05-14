import { memo, useId, useMemo } from "react";

const W = 128;
const H = 36;
const PAD = 4;
/** Etiquetas Mín/Máx dentro del gráfico (izquierda); Últ a la derecha. */
const LABEL_INSET_X = 3;

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

function mergeLevelRows(stats: { min: number; max: number; last: number }, scale: SparkScale): { v: number; yLine: number; labelY: number; kinds: LevelKind[] }[] {
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

/** Catmull-Rom → cúbicas; `k=1/6` es el estándar (curva suave entre puntos). */
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
  const area =
    `M ${pts[0].x.toFixed(2)} ${baseY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}${curve} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} Z`;

  return { d: { line, area }, hasArea: n >= 2, scale };
}

function guideRowSvgTitle(kinds: LevelKind[]): string {
  const has = (k: LevelKind) => kinds.includes(k);
  const parts: string[] = [];
  if (has("max")) parts.push("Máximo");
  if (has("last")) parts.push("Último");
  if (has("min")) parts.push("Mínimo");
  return parts.join(" · ");
}

/** Prefijo visible corto (misma prioridad visual que las guías al combinar niveles). */
function kindPrefixShort(kinds: LevelKind[]): string {
  const has = (k: LevelKind) => kinds.includes(k);
  const parts: string[] = [];
  if (has("max")) parts.push("Máx");
  if (has("last")) parts.push("Últ");
  if (has("min")) parts.push("Mín");
  return parts.length ? `${parts.join("/")} ` : "";
}

/** Sparkline: fondo oscuro suave, rejilla ligera, curva esmeralda, guías neutras y tipografía sans clara. */
function NiceHashRigHashSparklineInner({ values, title, formatHashrate }: NiceHashRigHashSparklineProps) {
  const gid = useId().replace(/:/g, "");
  const gradId = `nhRigSparkFill-${gid}`;
  const layout = useMemo(() => buildSparkLayout(values), [values]);
  const { d, hasArea, scale } = layout;
  const stats = useMemo(() => sparkStatsFromValues(values), [values]);
  const statsTitle =
    stats && formatHashrate
      ? `Último registro: ${formatHashrate(stats.last)} · Mín. en gráfica: ${formatHashrate(stats.min)} · Máx.: ${formatHashrate(stats.max)}`
      : undefined;
  const combinedTitle = [title, statsTitle].filter(Boolean).join(" — ");

  const guideRows = useMemo(() => {
    if (!formatHashrate || !stats || !scale) return null;
    return mergeLevelRows(stats, scale);
  }, [formatHashrate, stats, scale]);

  if (values.length === 0) {
    return (
      <div className="nh-watcher-rig-spark nh-watcher-rig-spark--empty" title={title ?? "Sin historial aún (~1 min entre muestras)"} aria-hidden>
        <svg viewBox={`0 0 ${W} ${H}`} className="nh-watcher-rig-spark__svg" preserveAspectRatio="none">
          <rect x="0" y="0" width={W} height={H} rx="6" className="nh-watcher-rig-spark__bg" />
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="5.5" className="nh-watcher-rig-spark__frame" fill="none" />
        </svg>
      </div>
    );
  }

  const innerSvg = (
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
        ? guideRows.map(({ v, yLine }, idx) => {
            const x1 = PAD;
            const x2 = PAD + scale.plotW;
            return (
              <line
                key={`${idx}-${v}`}
                x1={x1}
                y1={yLine}
                x2={x2}
                y2={yLine}
                className="nh-watcher-rig-spark__guide"
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        : null}
      {hasArea ? <path d={d.area} fill={`url(#${gradId})`} className="nh-watcher-rig-spark__fill" /> : null}
      <path d={d.line} fill="none" className="nh-watcher-rig-spark__line" vectorEffect="non-scaling-stroke" />
      {guideRows && formatHashrate
        ? guideRows.map(({ v, labelY, kinds }, idx) => {
            const ultDerecha = kinds.includes("last");
            const pre = kindPrefixShort(kinds);
            return (
              <text
                key={`t-${idx}-${v}`}
                x={ultDerecha ? W - PAD - LABEL_INSET_X : PAD + LABEL_INSET_X}
                y={labelY}
                className="nh-watcher-rig-spark__guide-label"
                textAnchor={ultDerecha ? "end" : "start"}
                dominantBaseline="middle"
              >
                <title>{guideRowSvgTitle(kinds)}</title>
                {pre ? <tspan className="nh-watcher-rig-spark__lbl-pre">{pre}</tspan> : null}
                <tspan className="nh-watcher-rig-spark__lbl-val">{formatHashrate(v)}</tspan>
              </text>
            );
          })
        : null}
    </svg>
  );

  if (!formatHashrate || !stats) {
    return (
      <div
        className="nh-watcher-rig-spark"
        title={combinedTitle || title || "Tendencia hashrate (~1 min entre muestras; historial por usuario en servidor)"}
      >
        {innerSvg}
      </div>
    );
  }

  return (
    <div className="nh-watcher-rig-spark" title={combinedTitle}>
      {innerSvg}
    </div>
  );
}

export const NiceHashRigHashSparkline = memo(NiceHashRigHashSparklineInner, (prev, next) => {
  return prev.values === next.values && prev.formatHashrate === next.formatHashrate;
});
