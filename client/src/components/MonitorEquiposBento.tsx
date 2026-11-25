import { useMemo, useState } from "react";

export type MonitorEquiposSpeed = {
  key: string;
  label: string;
  value: string;
  unit: string;
  series: number[];
  delta: string | null;
  deltaUp: boolean;
  stats: { label: string; value: string }[];
};

export type MonitorEquiposBentoProps = {
  titleBefore: string;
  titleGrad: string;
  lead: string;
  syncedAt: string | null;
  speeds: MonitorEquiposSpeed[];
  earnBtc: string;
  earnUsd: string;
  earnDelta: string | null;
  earnGrid: { label: string; value: string }[];
  healthOn: number;
  healthTotal: number;
  healthNote: string;
  cells: { key: string; color: string; title: string }[];
  slices: { label: string; value: number; color: string }[];
  walletAmt: string;
  walletNote: string;
  walletPct: number;
  payouts: { label: string; when: string; color: string }[];
  heat: { label: string; hours: number[] }[];
  heatTitle?: string;
  heatLabels?: string[];
  speedNote?: string;
  onOpenSpeed?: () => void;
};

function smooth(pts: [number, number][]): string {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const c = (x0 + x1) / 2;
    d += ` C${c},${y0} ${c},${y1} ${x1},${y1}`;
  }
  return d;
}

function LiveChart({ series, color }: { series: number[]; color: string }) {
  const d = useMemo(() => {
    if (series.length < 2) return null;
    const W = 800;
    const H = 220;
    const mx = Math.max(...series) * 1.12 || 1;
    const pts = series.map((v, i) => [ (i / (series.length - 1)) * W, H - (v / mx) * H ] as [number, number]);
    return { W, H, path: smooth(pts), last: pts[pts.length - 1] };
  }, [series]);
  if (!d) return <div className="meq-usd">Todavía no hay historial de velocidad en esta sesión.</div>;
  return (
    <div className="meq-chart" aria-hidden>
      <svg viewBox={`0 0 ${d.W} ${d.H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="meqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.4" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d.path} L${d.W},${d.H} L0,${d.H}Z`} fill="url(#meqFill)" />
        <path d={d.path} fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx={d.last[0]} cy={d.last[1]} r="5" fill={color} />
      </svg>
    </div>
  );
}

export function MonitorEquiposBento(props: MonitorEquiposBentoProps) {
  const [algo, setAlgo] = useState(0);
  const speed = props.speeds[algo] ?? props.speeds[0];
  const tot = props.slices.reduce((s, x) => s + x.value, 0) || 1;
  const C = 2 * Math.PI * 40;
  let off = 0;
  const ring = props.healthTotal > 0 ? 97.4 * (1 - props.healthOn / props.healthTotal) : 97.4;

  return (
    <section>
      <div className="head">
        <div>
          <h1>
            {props.titleBefore} <span className="grad">{props.titleGrad}</span>
          </h1>
          <p className="lead">{props.lead}</p>
        </div>
        <span className="livepill">
          <span className="dot" />
          En vivo{props.syncedAt ? ` · ${props.syncedAt}` : ""}
        </span>
      </div>

      <div className="meq-bento">
        <article className="meq-card meq-s8" onClick={props.onOpenSpeed} role={props.onOpenSpeed ? "button" : undefined}>
          <div className="meq-h">
            <div className="meq-t">Velocidad aceptada</div>
            {props.speeds.length > 1 ? (
              <div className="meq-seg">
                {props.speeds.map((s, i) => (
                  <button key={s.key} type="button" className={i === algo ? "on" : ""} onClick={(e) => { e.stopPropagation(); setAlgo(i); }}>
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {speed ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div className="meq-big">
                  {speed.value}
                  <small>{speed.unit}</small>
                </div>
                {speed.delta ? <span className={`meq-delta ${speed.deltaUp ? "up" : "down"}`}>{speed.delta}</span> : null}
              </div>
              <div className="meq-stats">
                {speed.stats.map((s) => (
                  <div key={s.label}>
                    <label>{s.label}</label>
                    <b>{s.value}</b>
                  </div>
                ))}
              </div>
              <LiveChart series={speed.series} color={algo === 0 ? "#2ee6a6" : "#a78bfa"} />
              {props.speedNote ? <p className="meq-usd">{props.speedNote}</p> : null}
            </>
          ) : (
            <p className="meq-usd">Sin velocidad reportada.</p>
          )}
        </article>

        <article className="meq-card meq-s4">
          <div className="meq-h">
            <div className="meq-t">Generado hoy</div>
            {props.earnDelta ? <span className="meq-delta up">{props.earnDelta}</span> : null}
          </div>
          <div className="meq-btc">
            {props.earnBtc}
            <small>BTC</small>
          </div>
          <div className="meq-usd">{props.earnUsd}</div>
          <div className="meq-grid">
            {props.earnGrid.map((g) => (
              <div className="meq-mini" key={g.label}>
                <label>{g.label}</label>
                <b>{g.value}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="meq-card meq-s4">
          <div className="meq-h">
            <div className="meq-t">Salud de la flota</div>
          </div>
          <div className="meq-health">
            <div className="meq-ring">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2ee6a6" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset={ring} />
              </svg>
              <b>
                {props.healthOn}/{props.healthTotal}
              </b>
            </div>
            <p>
              <strong>{props.healthOn === props.healthTotal && props.healthTotal > 0 ? "Todo minando" : "Equipos en marcha"}</strong>
              {props.healthNote}
            </p>
          </div>
          <div className="meq-matrix">
            {props.cells.map((c) => (
              <div key={c.key} className="meq-cell" style={{ ["--c" as string]: c.color }} title={c.title} />
            ))}
          </div>
        </article>

        <article className="meq-card meq-s4">
          <div className="meq-h">
            <div className="meq-t">Velocidad por cuenta</div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <svg viewBox="0 0 100 100" width="130" height="130" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="12" />
              {props.slices.map((s) => {
                const len = (s.value / tot) * C;
                const el = (
                  <circle key={s.label} cx="50" cy="50" r="40" fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${Math.max(0, len - 1.2)} ${C}`} strokeDashoffset={-off}>
                    <title>{s.label}</title>
                  </circle>
                );
                off += len;
                return el;
              })}
            </svg>
          </div>
          <div className="meq-legend">
            {props.slices.slice(0, 6).map((s) => (
              <div key={s.label}>
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                <b>{((s.value / tot) * 100).toFixed(1)}%</b>
              </div>
            ))}
          </div>
        </article>

        <article className="meq-card meq-s4">
          <div className="meq-h">
            <div className="meq-t">Para retirar</div>
          </div>
          <div className="meq-amt">
            {props.walletAmt}
            <small>BTC</small>
          </div>
          <div className="meq-progress">
            <div style={{ ["--p" as string]: `${Math.max(0, Math.min(100, props.walletPct))}%` }} />
          </div>
          <div className="meq-note">
            <span>{props.walletNote}</span>
            <span>mín. 0.0001</span>
          </div>
          <div className="meq-pay">
            {props.payouts.map((p) => (
              <div key={p.label + p.when}>
                <i style={{ background: p.color }} />
                <span>{p.label}</span>
                <small>{p.when}</small>
              </div>
            ))}
          </div>
        </article>

        {props.heat.length > 0 ? (
          <article className="meq-card meq-s12">
            <div className="meq-h">
              <div className="meq-t">{props.heatTitle ?? "Hashrate 24 h · velocidad aceptada de cada equipo"}</div>
            </div>
            <div className="meq-heat">
              <span />
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ textAlign: "center", color: "var(--dim)" }}>
                  {(props.heatLabels?.[i] ?? (i % 4 === 0 ? String(i) : ""))}
                </span>
              ))}
              {props.heat.slice(0, 40).map((row, rowIndex) => (
                <span key={`${row.label}-${rowIndex}`} style={{ display: "contents" }}>
                  <span className="lbl">{row.label}</span>
                  {Array.from({ length: 24 }, (_, i) => {
                    const v = row.hours[i] ?? 0;
                    return <span key={i} className={`meq-hc${v < 0.15 ? " bad" : ""}`} style={{ ["--v" as string]: String(v) }} />;
                  })}
                </span>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
