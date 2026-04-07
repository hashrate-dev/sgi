import { useEffect, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import "./precioHistorialFullModal.css";

export type PrecioHistorialModalEntry = { precioUsd: number; actualizadoEn: string };

type Props = {
  open: boolean;
  onClose: () => void;
  historial: PrecioHistorialModalEntry[];
  marca: string;
  modelo: string;
  procesador: string;
  /** Código de producto / Nº serie cuando existe */
  codigoProducto?: string | null;
};

function sortHistorialAsc(entries: PrecioHistorialModalEntry[]): PrecioHistorialModalEntry[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.actualizadoEn).getTime();
    const tb = new Date(b.actualizadoEn).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

function sortHistorialDesc(entries: PrecioHistorialModalEntry[]): PrecioHistorialModalEntry[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.actualizadoEn).getTime();
    const tb = new Date(b.actualizadoEn).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

function formatFechaHora(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("es-PY", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function productLabel(marca: string, modelo: string, procesador: string): string {
  const parts = [marca?.trim(), modelo?.trim(), procesador?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function formatUsd(value: number): string {
  return `${value.toLocaleString("es-PY")} USD`;
}

function formatPctVariation(current: number, previous: number | null): string {
  if (previous === null || previous <= 0) return "—";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function PrecioHistorialChart({
  historialSortedAsc,
  productoTexto,
}: {
  historialSortedAsc: PrecioHistorialModalEntry[];
  productoTexto: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!historialSortedAsc.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const labels = historialSortedAsc.map((h) => {
      const d = new Date(h.actualizadoEn);
      return Number.isNaN(d.getTime())
        ? h.actualizadoEn
        : d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
    });
    const values = historialSortedAsc.map((h) => h.precioUsd);

    const ctx = canvas.getContext("2d");
    let fillColor: CanvasGradient | string = "rgba(45, 93, 70, 0.12)";
    if (ctx) {
      const h = canvas.offsetHeight || 280;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(45, 93, 70, 0.45)");
      g.addColorStop(0.35, "rgba(45, 93, 70, 0.15)");
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      fillColor = g;
    }

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Precio (USD)",
            data: values,
            borderColor: "#1f4d38",
            backgroundColor: fillColor,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            cubicInterpolationMode: "monotone",
            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#2d5d46",
            pointBorderWidth: 2,
            pointRadius: historialSortedAsc.length === 1 ? 7 : 5,
            pointHoverRadius: 9,
            pointHoverBackgroundColor: "#2d5d46",
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              font: { size: 12, weight: 600 },
              color: "#14532d",
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            titleFont: { size: 13, weight: "bold" },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              afterBody: () => [`Producto: ${productoTexto}`],
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: (v) => (typeof v === "number" ? `${v.toLocaleString("es-PY")} USD` : String(v)),
              color: "#475569",
              font: { size: 11 },
            },
            grid: { color: "rgba(45, 93, 70, 0.1)" },
            border: { display: false },
          },
          x: {
            ticks: {
              maxRotation: 40,
              minRotation: 0,
              color: "#64748b",
              font: { size: 10 },
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
  }, [historialSortedAsc, productoTexto]);

  if (!historialSortedAsc.length) return null;

  return (
    <div className="hrs-precio-historial-chart-scene" aria-hidden={false}>
      <div className="hrs-precio-historial-chart-panel">
        <p className="hrs-precio-historial-chart-caption">
          Evolución del precio en el tiempo <span className="text-muted">(vista 3D suave)</span>
        </p>
        <div className="hrs-precio-historial-chart-canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}

export function PrecioHistorialFullModal({
  open,
  onClose,
  historial,
  marca,
  modelo,
  procesador,
  codigoProducto,
}: Props) {
  const productoTexto = useMemo(() => productLabel(marca, modelo, procesador), [marca, modelo, procesador]);
  const asc = useMemo(() => sortHistorialAsc(historial), [historial]);
  const desc = useMemo(() => sortHistorialDesc(historial), [historial]);
  const latest = asc.length > 0 ? asc[asc.length - 1] : null;
  const first = asc.length > 0 ? asc[0] : null;
  const minPrecio = asc.length > 0 ? Math.min(...asc.map((h) => h.precioUsd)) : null;
  const maxPrecio = asc.length > 0 ? Math.max(...asc.map((h) => h.precioUsd)) : null;
  const avgPrecio = asc.length > 0 ? Math.round(asc.reduce((acc, h) => acc + h.precioUsd, 0) / asc.length) : null;
  const deltaAbs = latest && first ? latest.precioUsd - first.precioUsd : null;
  const deltaPct = latest && first && first.precioUsd > 0 ? ((latest.precioUsd - first.precioUsd) / first.precioUsd) * 100 : null;

  if (!open) return null;

  async function handleDownloadReport() {
    if (!desc.length) return;
    const baseName = `historial_precios_${(codigoProducto?.trim() || `${marca}_${modelo}`).replace(/[^\w\-]+/g, "_")}`;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Historico precios");
    ws.columns = [
      { header: "#", key: "n", width: 8 },
      { header: "Fecha y hora de actualizacion", key: "fecha", width: 32 },
      { header: "Precio USD", key: "precio", width: 16 },
      { header: "% variacion", key: "variacion", width: 16 },
      { header: "Producto", key: "producto", width: 42 },
      { header: "Marca", key: "marca", width: 18 },
      { header: "Modelo", key: "modelo", width: 24 },
      { header: "Procesador", key: "procesador", width: 16 },
      { header: "Codigo de producto", key: "codigo", width: 24 },
    ];

    desc.forEach((h, i) => {
      const previous = i + 1 < desc.length ? desc[i + 1].precioUsd : null;
      ws.addRow({
        n: desc.length - i,
        fecha: formatFechaHora(h.actualizadoEn),
        precio: h.precioUsd,
        variacion: formatPctVariation(h.precioUsd, previous),
        producto: productoTexto,
        marca: marca?.trim() || "—",
        modelo: modelo?.trim() || "—",
        procesador: procesador?.trim() || "—",
        codigo: codigoProducto?.trim() || "—",
      });
    });

    ws.getRow(1).font = { bold: true };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.getCell(3).numFmt = "#,##0";
      }
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `${baseName}.xlsx`);
  }

  return (
    <div
      className="modal d-block professional-modal-overlay hrs-precio-historial-full-overlay"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hrs-precio-historial-full-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable hrs-precio-historial-full-dialog">
        <div className="modal-content professional-modal hrs-precio-historial-full-content">
          <div className="modal-header professional-modal-header">
            <h5 id="hrs-precio-historial-full-title" className="modal-title professional-modal-title">
              Histórico completo de precios · USD
            </h5>
            <button type="button" className="professional-modal-close" onClick={onClose} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="modal-body professional-modal-body hrs-precio-historial-full-body">
            <div className="hrs-precio-historial-product-card">
              <p className="hrs-precio-historial-product-label">Producto</p>
              <p className="hrs-precio-historial-product-main">{productoTexto}</p>
              <dl className="hrs-precio-historial-product-dl">
                <div>
                  <dt>Marca</dt>
                  <dd>{marca?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{modelo?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>Procesador</dt>
                  <dd>{procesador?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>Código de producto</dt>
                  <dd>{codigoProducto?.trim() || "—"}</dd>
                </div>
              </dl>
            </div>

            {asc.length > 0 ? (
              <>
                <section className="hrs-precio-historial-kpis" aria-label="Resumen de precios">
                  <article className="hrs-precio-historial-kpi">
                    <p className="hrs-precio-historial-kpi-label">Precio actual</p>
                    <p className="hrs-precio-historial-kpi-value">{latest ? formatUsd(latest.precioUsd) : "—"}</p>
                    <p className="hrs-precio-historial-kpi-sub">
                      {latest ? formatFechaHora(latest.actualizadoEn) : "Sin fecha"}
                    </p>
                  </article>
                  <article className="hrs-precio-historial-kpi">
                    <p className="hrs-precio-historial-kpi-label">Variación acumulada</p>
                    <p
                      className={`hrs-precio-historial-kpi-value ${
                        deltaAbs !== null && deltaAbs >= 0 ? "hrs-precio-historial-kpi-value--up" : "hrs-precio-historial-kpi-value--down"
                      }`}
                    >
                      {deltaAbs !== null ? `${deltaAbs >= 0 ? "+" : ""}${formatUsd(deltaAbs)}` : "—"}
                    </p>
                    <p className="hrs-precio-historial-kpi-sub">
                      {deltaPct !== null ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%` : "—"}
                    </p>
                  </article>
                  <article className="hrs-precio-historial-kpi">
                    <p className="hrs-precio-historial-kpi-label">Rango histórico</p>
                    <p className="hrs-precio-historial-kpi-value">
                      {minPrecio !== null && maxPrecio !== null ? `${formatUsd(minPrecio)} - ${formatUsd(maxPrecio)}` : "—"}
                    </p>
                    <p className="hrs-precio-historial-kpi-sub">{asc.length} registro(s) en base</p>
                  </article>
                  <article className="hrs-precio-historial-kpi">
                    <p className="hrs-precio-historial-kpi-label">Precio promedio</p>
                    <p className="hrs-precio-historial-kpi-value">{avgPrecio !== null ? formatUsd(avgPrecio) : "—"}</p>
                    <p className="hrs-precio-historial-kpi-sub">Promedio de todos los precios registrados</p>
                  </article>
                </section>

                <section className="hrs-precio-historial-dashboard-grid">
                  <div className="hrs-precio-historial-dashboard-chart">
                    <PrecioHistorialChart historialSortedAsc={asc} productoTexto={productoTexto} />
                  </div>
                  <div className="hrs-precio-historial-dashboard-table">
                    <h6 className="hrs-precio-historial-table-title">Registros ({asc.length})</h6>
                    <div className="table-responsive hrs-precio-historial-table-wrap">
                      <table className="table table-sm table-hover align-middle mb-0 hrs-precio-historial-table">
                        <thead>
                          <tr>
                            <th scope="col">#</th>
                            <th scope="col">Fecha y hora de actualización</th>
                            <th scope="col" className="text-end">
                              Precio USD
                            </th>
                            <th scope="col" className="text-end">% variación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {desc.map((h, i) => (
                            <tr key={`${h.actualizadoEn}-${desc.length - i}`}>
                              <td>{desc.length - i}</td>
                              <td className="text-nowrap">{formatFechaHora(h.actualizadoEn)}</td>
                              <td className="text-end fw-semibold text-success">{formatUsd(h.precioUsd)}</td>
                              <td
                                className={`text-end fw-semibold ${
                                  i + 1 < desc.length && h.precioUsd < desc[i + 1].precioUsd
                                    ? "text-danger"
                                    : "text-success"
                                }`}
                              >
                                {formatPctVariation(h.precioUsd, i + 1 < desc.length ? desc[i + 1].precioUsd : null)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <p className="text-muted mb-0">No hay registros en el historial.</p>
            )}
          </div>
          <div className="modal-footer professional-modal-footer">
            <button type="button" className="fact-btn fact-btn-primary" onClick={handleDownloadReport} disabled={desc.length === 0}>
              📊 Exportar Excel
            </button>
            <button type="button" className="fact-btn fact-btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
