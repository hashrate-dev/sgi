import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import type { AsicCostoEquipoItem } from "../lib/api";
import { HASHRATE_SPACE_LOGO } from "../lib/marketplaceWpAssets.js";
import "./asicCotizadorEvolucionModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  registros: AsicCostoEquipoItem[];
  /** Si hay selección, prioriza esos equipos al abrir. */
  preferredIds?: number[];
};

type EquipoSeries = {
  key: string;
  label: string;
  marca: string;
  modelo: string;
  procesador: string;
  items: AsicCostoEquipoItem[];
};

function equipoKey(r: Pick<AsicCostoEquipoItem, "marca" | "modelo" | "procesador">): string {
  return [r.marca, r.modelo, r.procesador]
    .map((s) => String(s || "").trim().toLocaleLowerCase("es"))
    .join("|");
}

function equipoLabel(r: Pick<AsicCostoEquipoItem, "marca" | "modelo" | "procesador">): string {
  const parts = [r.marca, r.modelo, r.procesador].map((s) => String(s || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Equipo ASIC";
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n));
}

function formatSignedUsd(n: number): string {
  const core = formatUsd(Math.abs(n));
  if (n > 0) return `+${core}`;
  if (n < 0) return `−${core}`;
  return core;
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

function buildSeries(registros: AsicCostoEquipoItem[]): EquipoSeries[] {
  const map = new Map<string, EquipoSeries>();
  for (const r of registros) {
    const key = equipoKey(r);
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        label: equipoLabel(r),
        marca: r.marca || "",
        modelo: r.modelo || "",
        procesador: r.procesador || "",
        items: [],
      };
      map.set(key, s);
    }
    s.items.push(r);
  }
  for (const s of map.values()) {
    s.items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return [...map.values()].sort((a, b) => {
    const lastA = a.items[a.items.length - 1]?.createdAt || "";
    const lastB = b.items[b.items.length - 1]?.createdAt || "";
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });
}

function EvolucionChart({ items }: { items: AsicCostoEquipoItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;

    chartRef.current?.destroy();
    chartRef.current = null;

    const labels = items.map((r) => shortDate(r.createdAt));
    const precios = items.map((r) => Math.round(r.precioVenta));
    const margenes = items.map((r) => Math.round(r.margenUsd));
    const pcts = items.map((r) => (Number.isFinite(r.pctMargen) ? r.pctMargen : 0));

    const ctx = canvas.getContext("2d");
    let precioFill: CanvasGradient | string = "rgba(31, 143, 95, 0.14)";
    if (ctx) {
      const h = canvas.offsetHeight || 320;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(31, 143, 95, 0.42)");
      g.addColorStop(0.4, "rgba(31, 143, 95, 0.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      precioFill = g;
    }

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Precio final (USD)",
            data: precios,
            yAxisID: "y",
            borderColor: "#15724c",
            backgroundColor: precioFill,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            cubicInterpolationMode: "monotone",
            pointRadius: items.length === 1 ? 7 : 4,
            pointHoverRadius: 8,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#15724c",
            pointBorderWidth: 2,
            order: 1,
          },
          {
            label: "Margen (USD)",
            data: margenes,
            yAxisID: "y",
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            borderWidth: 2.5,
            borderDash: [6, 4],
            fill: false,
            tension: 0.3,
            pointRadius: items.length === 1 ? 6 : 3.5,
            pointHoverRadius: 7,
            pointBackgroundColor: "#2563eb",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            order: 2,
          },
          {
            label: "% Margen",
            data: pcts,
            yAxisID: "y1",
            borderColor: "#d97706",
            backgroundColor: "rgba(217, 119, 6, 0.12)",
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: items.length === 1 ? 5 : 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#d97706",
            pointBorderWidth: 2,
            order: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true,
              pointStyle: "circle",
              font: { size: 12, weight: 600 },
              color: "#334155",
              padding: 16,
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            titleFont: { size: 13, weight: "bold" },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label(ctx) {
                const v = Number(ctx.parsed.y);
                if (ctx.dataset.yAxisID === "y1") return ` ${ctx.dataset.label}: ${formatPct(v)}`;
                return ` ${ctx.dataset.label}: ${formatUsd(v)}`;
              },
              afterBody(itemsTip) {
                const i = itemsTip[0]?.dataIndex ?? -1;
                const row = i >= 0 ? items[i] : null;
                if (!row) return [];
                const obs = (row.observaciones || "").trim();
                const lines = [
                  `Costo origen: ${formatUsd(row.precioOrigen)}`,
                  `Total nac.: ${formatUsd(row.totalNacionalizado)}`,
                ];
                if (obs) lines.push(`Obs.: ${obs}`);
                return lines;
              },
            },
          },
        },
        scales: {
          y: {
            position: "left",
            beginAtZero: false,
            title: {
              display: true,
              text: "USD",
              color: "#64748b",
              font: { size: 11, weight: 600 },
            },
            ticks: {
              color: "#475569",
              font: { size: 11 },
              callback: (v) => (typeof v === "number" ? formatUsd(v) : String(v)),
            },
            grid: { color: "rgba(45, 93, 70, 0.1)" },
            border: { display: false },
          },
          y1: {
            position: "right",
            beginAtZero: true,
            title: {
              display: true,
              text: "% margen",
              color: "#b45309",
              font: { size: 11, weight: 600 },
            },
            ticks: {
              color: "#b45309",
              font: { size: 11 },
              callback: (v) => (typeof v === "number" ? `${v.toFixed(0)}%` : String(v)),
            },
            grid: { drawOnChartArea: false },
            border: { display: false },
          },
          x: {
            ticks: {
              maxRotation: 35,
              color: "#64748b",
              font: { size: 10 },
              autoSkip: true,
              maxTicksLimit: 10,
            },
            grid: { display: false },
            border: { color: "rgba(45, 93, 70, 0.12)" },
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [items]);

  return (
    <div className="asic-cot-evo-chart-wrap">
      <canvas ref={canvasRef} aria-label="Gráfico de evolución de precios y márgenes" />
    </div>
  );
}

export function AsicCotizadorEvolucionModal({ open, onClose, registros, preferredIds = [] }: Props) {
  const series = useMemo(() => buildSeries(registros), [registros]);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const initializedOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      initializedOpenRef.current = false;
      return;
    }
    if (initializedOpenRef.current) return;
    initializedOpenRef.current = true;
    const preferred = new Set(preferredIds);
    let initial = series[0]?.key || "";
    if (preferred.size > 0) {
      const hit = series.find((s) => s.items.some((it) => preferred.has(it.id)));
      if (hit) initial = hit.key;
    }
    setSelectedKey(initial);
    setQuery("");
  }, [open, series, preferredIds]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const filteredSeries = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    if (!q) return series;
    return series.filter((s) => s.label.toLocaleLowerCase("es").includes(q));
  }, [series, query]);

  const active = series.find((s) => s.key === selectedKey) ?? filteredSeries[0] ?? null;
  const items = active?.items ?? [];
  const first = items[0];
  const latest = items[items.length - 1];
  const prev = items.length >= 2 ? items[items.length - 2] : null;

  const deltaPrecio = latest && prev ? latest.precioVenta - prev.precioVenta : null;
  const deltaDesdeInicio = latest && first ? latest.precioVenta - first.precioVenta : null;
  const avgMargen =
    items.length > 0 ? Math.round(items.reduce((a, r) => a + r.margenUsd, 0) / items.length) : null;
  const avgPct =
    items.length > 0 ? items.reduce((a, r) => a + (Number.isFinite(r.pctMargen) ? r.pctMargen : 0), 0) / items.length : null;

  if (!open) return null;

  const modal = (
    <div className="asic-cot-evo-overlay" role="presentation" onClick={onClose}>
      <div
        className="asic-cot-evo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asic-cot-evo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asic-cot-evo-header">
          <div className="asic-cot-evo-header__brand">
            <img src={HASHRATE_SPACE_LOGO} alt="" className="asic-cot-evo-header__logo" />
            <div>
              <h2 id="asic-cot-evo-title" className="asic-cot-evo-header__title">
                Evolución de precios y márgenes
              </h2>
              <p className="asic-cot-evo-header__sub">
                Historial de cotizaciones registradas · {registros.length} registro(s) · {series.length} equipo(s)
              </p>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose} />
        </div>

        <div className="asic-cot-evo-body">
          <aside className="asic-cot-evo-sidebar">
            <label className="asic-cot-evo-sidebar__label" htmlFor="asic-cot-evo-search">
              Equipos cotizados
            </label>
            <input
              id="asic-cot-evo-search"
              type="search"
              className="form-control form-control-sm asic-cot-evo-sidebar__search"
              placeholder="Buscar marca, modelo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="asic-cot-evo-equipo-list" role="listbox" aria-label="Lista de equipos">
              {filteredSeries.length === 0 ? (
                <div className="asic-cot-evo-empty-side">Sin coincidencias.</div>
              ) : (
                filteredSeries.map((s) => {
                  const last = s.items[s.items.length - 1];
                  const activeRow = active?.key === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      role="option"
                      aria-selected={activeRow}
                      className={`asic-cot-evo-equipo${activeRow ? " is-active" : ""}`}
                      onClick={() => setSelectedKey(s.key)}
                    >
                      <span className="asic-cot-evo-equipo__name">{s.label}</span>
                      <span className="asic-cot-evo-equipo__meta">
                        <span>{s.items.length} cotiz.</span>
                        <span className="asic-cot-evo-equipo__price">{last ? formatUsd(last.precioVenta) : "—"}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="asic-cot-evo-main">
            {!active || items.length === 0 ? (
              <div className="asic-cot-evo-empty">
                Todavía no hay cotizaciones registradas para graficar.
              </div>
            ) : (
              <>
                <div className="asic-cot-evo-product">
                  <div>
                    <div className="asic-cot-evo-product__eyebrow">Equipo seleccionado</div>
                    <h3 className="asic-cot-evo-product__title">{active.label}</h3>
                  </div>
                  <div className="asic-cot-evo-product__badge">{items.length} presupuesto(s)</div>
                </div>

                <div className="asic-cot-evo-kpis">
                  <div className="asic-cot-evo-kpi">
                    <div className="asic-cot-evo-kpi__label">Precio final actual</div>
                    <div className="asic-cot-evo-kpi__value">{latest ? formatUsd(latest.precioVenta) : "—"}</div>
                    <div className="asic-cot-evo-kpi__hint">
                      {deltaPrecio == null
                        ? "Única cotización"
                        : `vs. anterior: ${formatSignedUsd(deltaPrecio)}`}
                    </div>
                  </div>
                  <div className="asic-cot-evo-kpi">
                    <div className="asic-cot-evo-kpi__label">Margen actual</div>
                    <div className="asic-cot-evo-kpi__value asic-cot-evo-kpi__value--blue">
                      {latest ? formatUsd(latest.margenUsd) : "—"}
                    </div>
                    <div className="asic-cot-evo-kpi__hint">
                      {latest ? `${formatPct(latest.pctMargen)} del PVP` : "—"}
                    </div>
                  </div>
                  <div className="asic-cot-evo-kpi">
                    <div className="asic-cot-evo-kpi__label">Δ desde 1.ª cotización</div>
                    <div
                      className={`asic-cot-evo-kpi__value${
                        deltaDesdeInicio == null
                          ? ""
                          : deltaDesdeInicio > 0
                            ? " asic-cot-evo-kpi__value--up"
                            : deltaDesdeInicio < 0
                              ? " asic-cot-evo-kpi__value--down"
                              : ""
                      }`}
                    >
                      {deltaDesdeInicio == null ? "—" : formatSignedUsd(deltaDesdeInicio)}
                    </div>
                    <div className="asic-cot-evo-kpi__hint">
                      {first ? `Desde ${shortDate(first.createdAt)}` : "—"}
                    </div>
                  </div>
                  <div className="asic-cot-evo-kpi">
                    <div className="asic-cot-evo-kpi__label">Promedio margen</div>
                    <div className="asic-cot-evo-kpi__value">
                      {avgMargen != null ? formatUsd(avgMargen) : "—"}
                    </div>
                    <div className="asic-cot-evo-kpi__hint">
                      {avgPct != null ? `Media ${formatPct(avgPct)}` : "—"}
                    </div>
                  </div>
                </div>

                <div className="asic-cot-evo-chart-card">
                  <div className="asic-cot-evo-chart-card__caption">
                    Evolución por presupuesto · precio final, margen USD y % margen
                  </div>
                  <EvolucionChart items={items} />
                </div>

                <div className="asic-cot-evo-table-wrap">
                  <table className="table table-sm align-middle mb-0 asic-cot-evo-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th className="text-end">Costo origen</th>
                        <th className="text-end">Total nac.</th>
                        <th className="text-end">Margen</th>
                        <th className="text-end">% Margen</th>
                        <th className="text-end">Precio final</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...items].reverse().map((r, idx) => (
                        <tr key={r.id}>
                          <td>{items.length - idx}</td>
                          <td>{shortDate(r.createdAt)}</td>
                          <td className="text-end">{formatUsd(r.precioOrigen)}</td>
                          <td className="text-end">{formatUsd(r.totalNacionalizado)}</td>
                          <td className="text-end fw-semibold text-primary">{formatUsd(r.margenUsd)}</td>
                          <td className="text-end">{formatPct(r.pctMargen)}</td>
                          <td className="text-end fw-bold">{formatUsd(r.precioVenta)}</td>
                          <td className="asic-cot-evo-table__obs" title={(r.observaciones || "").trim() || undefined}>
                            {(r.observaciones || "").trim() || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="asic-cot-evo-footer">
          <span className="text-muted small">Tip: si tenés filas seleccionadas, se abre el equipo de esa selección.</span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
