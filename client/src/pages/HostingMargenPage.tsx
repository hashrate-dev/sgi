import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canEditFacturacion } from "../lib/auth";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import { sgiHome } from "../lib/marketplacePaths.js";
import {
  getHostingMarginSettings,
  getInvoices,
  putHostingMarginSettings,
  type ContabilidadGasto,
  type HostingMarginProveedor,
} from "../lib/api";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import {
  buildHostingMargenYearSeries,
  hostingMargenTotals,
  normalizeHostingSupplierCode,
} from "../lib/hostingMargenKpi";
import type { InvoiceMonthNetRow } from "../lib/monitorTripleIngresoKpi";
import "../styles/facturacion.css";

const YEAR_FROM = 2025;
const YEAR_TO = new Date().getFullYear() + 1;
const YEAR_OPTIONS: number[] = [];
for (let y = YEAR_TO; y >= YEAR_FROM; y--) YEAR_OPTIONS.push(y);

const ING_COLOR = "#0f766e";
const GAS_COLOR = "#c2410c";
const MAR_POS = "#15803d";
const MAR_NEG = "#dc2626";

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(1).replace(".", ",");
  return n < 0 ? `-${abs} %` : `${abs} %`;
}

export function HostingMargenPage() {
  const { user, loading: authLoading } = useAuth();
  const canEdit = canEditFacturacion(user);
  const yearNow = new Date().getFullYear();
  const [year, setYear] = useState(yearNow < YEAR_FROM ? YEAR_FROM : yearNow);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [invoices, setInvoices] = useState<InvoiceMonthNetRow[]>([]);
  const [gastos, setGastos] = useState<ContabilidadGasto[]>([]);
  const [supplierNumbers, setSupplierNumbers] = useState<string[]>(["P002", "P003"]);
  const [proveedores, setProveedores] = useState<HostingMarginProveedor[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [provFilter, setProvFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInst = useRef<ChartInstance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [invRes, setRes] = await Promise.all([
        getInvoices({ source: "hosting" }),
        getHostingMarginSettings(),
      ]);
      const rows: InvoiceMonthNetRow[] = (invRes.invoices || []).map((inv) => ({
        id: inv.id,
        type: inv.type,
        month: inv.month,
        total: inv.total,
        number: inv.number,
        paymentDate: inv.paymentDate,
        date: inv.date,
        relatedInvoiceId: inv.relatedInvoiceId,
        relatedInvoiceNumber: inv.relatedInvoiceNumber,
        source: inv.source ?? "hosting",
        documentContext: inv.documentContext,
      }));
      setInvoices(rows);
      setSupplierNumbers(setRes.supplierNumbers);
      setProveedores(setRes.proveedores);
      setGastos(
        (setRes.gastos || []).map((g) => ({
          id: g.id,
          fecha: g.fecha,
          proveedorId: g.proveedorId,
          supplierNumber: g.supplierNumber,
          supplierName: g.supplierName,
          numeroFactura: "",
          descripcion: g.descripcion,
          observaciones: "",
          mesServicio: g.mesServicio,
          presupuestoMes: g.presupuestoMes,
          medioPago: "",
          moneda: (g.moneda as ContabilidadGasto["moneda"]) || "USD",
          monto: g.monto,
          montoOriginal: g.monto,
          tipoCambio: null,
          createdAt: "",
        }))
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar el margen de hosting.");
      setInvoices([]);
      setGastos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(
    () => buildHostingMargenYearSeries(year, invoices, gastos, supplierNumbers),
    [year, invoices, gastos, supplierNumbers]
  );
  const totals = useMemo(() => hostingMargenTotals(months), [months]);

  const nameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of proveedores) {
      const code = normalizeHostingSupplierCode(p.number);
      const name = String(p.name ?? "").trim();
      if (code && name) m.set(code, name);
    }
    for (const g of gastos) {
      const code = normalizeHostingSupplierCode(g.supplierNumber);
      const name = String(g.supplierName ?? "").trim();
      if (code && name && !m.has(code)) m.set(code, name);
    }
    return m;
  }, [proveedores, gastos]);

  const supplierSummary = supplierNumbers
    .map((c) => {
      const name = nameByCode.get(c);
      return name ? `${c} ${name}` : c;
    })
    .join(", ");

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: months.map((m) => m.label),
        datasets: [
          {
            label: "Ingresos cobrados",
            data: months.map((m) => m.ingresos),
            backgroundColor: ING_COLOR,
            borderRadius: 4,
          },
          {
            label: "Gastos proveedores",
            data: months.map((m) => m.gastos),
            backgroundColor: GAS_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(Number(ctx.parsed.y) || 0)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => formatCurrencyNumber(typeof v === "number" ? v : Number(v) || 0),
            },
          },
        },
      },
    });
    return () => {
      chartInst.current?.destroy();
      chartInst.current = null;
    };
  }, [months]);

  const openConfig = () => {
    setDraftCodes([...supplierNumbers]);
    setProvFilter("");
    setSaveErr("");
    setConfigOpen(true);
  };

  const toggleCode = (code: string) => {
    const c = normalizeHostingSupplierCode(code);
    setDraftCodes((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const saveConfig = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      const res = await putHostingMarginSettings(draftCodes);
      setSupplierNumbers(res.supplierNumbers);
      setProveedores(res.proveedores);
      setGastos(
        (res.gastos || []).map((g) => ({
          id: g.id,
          fecha: g.fecha,
          proveedorId: g.proveedorId,
          supplierNumber: g.supplierNumber,
          supplierName: g.supplierName,
          numeroFactura: "",
          descripcion: g.descripcion,
          observaciones: "",
          mesServicio: g.mesServicio,
          presupuestoMes: g.presupuestoMes,
          medioPago: "",
          moneda: (g.moneda as ContabilidadGasto["moneda"]) || "USD",
          monto: g.monto,
          montoOriginal: g.monto,
          tipoCambio: null,
          createdAt: "",
        }))
      );
      setConfigOpen(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const filterQ = provFilter.trim().toLowerCase();
  const filteredProveedores = useMemo(() => {
    const list = [...proveedores];
    const known = new Set(list.map((p) => p.number));
    for (const code of draftCodes) {
      if (!known.has(code)) list.push({ number: code, name: "(no está en el padrón)" });
    }
    if (!filterQ) return list;
    return list.filter(
      (p) => p.number.toLowerCase().includes(filterQ) || p.name.toLowerCase().includes(filterQ)
    );
  }, [proveedores, draftCodes, filterQ]);

  if (authLoading) return null;
  if (!user || !canUserAccessNavPath(user, "/hosting/margen")) {
    return <Navigate to={sgiHome()} replace />;
  }

  return (
    <div className="fact-page hm-page">
      <div className="container">
        <PageHeader title="Margen de Hosting" />
        <Link to="/hosting" className="fact-back">
          <i className="bi bi-arrow-left" /> Volver a Servicios de Hosting
        </Link>

        <div className="hrs-card p-4 mt-3">
          <div className="hm-toolbar">
            <div>
              <label className="form-label small mb-1" htmlFor="hm-year">
                Año
              </label>
              <select
                id="hm-year"
                className="form-select form-select-sm hm-year-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-outline-secondary hm-config-btn" onClick={openConfig}>
              <i className="bi bi-gear" /> Configuración
            </button>
          </div>

          <p className="text-muted small mb-3">
            Ingresos: cobros de hosting (Recibos menos Notas de Crédito) del historial. Gastos: USD de
            los proveedores de hosting, imputados al <strong>mes de servicio</strong> (P002 Digital Assets y
            P003 Blunode facturan a mes vencido; el pago queda en el mes siguiente). Si el mes de servicio no
            está cargado o coincide con el de presupuesto, se usa el mes anterior al pago
            {supplierSummary ? ` (${supplierSummary})` : " (ninguno elegido)"}. El margen es ingresos menos
            gastos, en USD.
          </p>

          {err ? <div className="alert alert-danger py-2">{err}</div> : null}
          {loading ? <p className="text-muted mb-0">Cargando…</p> : null}

          {!loading && !err ? (
            <>
              <div className="hm-kpi-grid">
                <div className="hm-kpi">
                  <span className="hm-kpi-label">Ingresos cobrados</span>
                  <strong className="hm-kpi-val">{formatCurrency(totals.ingresos)}</strong>
                </div>
                <div className="hm-kpi">
                  <span className="hm-kpi-label">Gastos hosting</span>
                  <strong className="hm-kpi-val hm-kpi-val--gas">{formatCurrency(totals.gastos)}</strong>
                </div>
                <div className="hm-kpi">
                  <span className="hm-kpi-label">Margen USD</span>
                  <strong
                    className="hm-kpi-val"
                    style={{ color: totals.margen >= 0 ? MAR_POS : MAR_NEG }}
                  >
                    {formatCurrency(totals.margen)}
                  </strong>
                </div>
                <div className="hm-kpi">
                  <span className="hm-kpi-label">Margen %</span>
                  <strong className="hm-kpi-val">{formatPct(totals.margenPct)}</strong>
                </div>
              </div>

              <div className="hm-chart-wrap">
                <canvas ref={chartRef} aria-label="Ingresos vs gastos de hosting por mes" />
              </div>

              <div className="table-responsive">
                <table className="table table-sm hm-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th className="text-end">Ingresos USD</th>
                      <th className="text-end">Gastos USD</th>
                      {supplierNumbers.map((c) => (
                        <th key={c} className="text-end hm-th-prov">
                          <span className="hm-th-code">{c}</span>
                          <span className="hm-th-name">{nameByCode.get(c) || "Proveedor"}</span>
                        </th>
                      ))}
                      <th className="text-end">Margen USD</th>
                      <th className="text-end">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.ym}>
                        <td>
                          {m.label} {year}
                        </td>
                        <td className="text-end">{formatCurrencyNumber(m.ingresos)}</td>
                        <td className="text-end">{formatCurrencyNumber(m.gastos)}</td>
                        {supplierNumbers.map((c) => (
                          <td key={c} className="text-end">
                            {formatCurrencyNumber(m.gastosBySupplier[c] ?? 0)}
                          </td>
                        ))}
                        <td
                          className="text-end hm-td-margen"
                          style={{ color: m.margen >= 0 ? MAR_POS : MAR_NEG }}
                        >
                          {formatCurrency(m.margen)}
                        </td>
                        <td className="text-end">{formatPct(m.margenPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total {year}</th>
                      <th className="text-end">{formatCurrencyNumber(totals.ingresos)}</th>
                      <th className="text-end">{formatCurrencyNumber(totals.gastos)}</th>
                      {supplierNumbers.map((c) => (
                        <th key={c} className="text-end">
                          {formatCurrencyNumber(months.reduce((a, m) => a + (m.gastosBySupplier[c] ?? 0), 0))}
                        </th>
                      ))}
                      <th className="text-end hm-td-margen" style={{ color: totals.margen >= 0 ? MAR_POS : MAR_NEG }}>
                        {formatCurrency(totals.margen)}
                      </th>
                      <th className="text-end">{formatPct(totals.margenPct)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {configOpen ? (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Proveedores de hosting</h5>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setConfigOpen(false)} />
              </div>
              <div className="modal-body">
                <p className="small text-muted">
                  Elegí qué proveedores del padrón HRS se cuentan como gasto de hosting. Hoy: P002 Digital
                  Assets y P003 Blunode Paraguay. Podés sumar otro código más adelante.
                </p>
                {!canEdit ? (
                  <div className="alert alert-info py-2">Solo lectura: tu usuario no puede cambiar esta lista.</div>
                ) : null}
                <input
                  type="search"
                  className="form-control form-control-sm mb-3"
                  placeholder="Buscar por código o nombre…"
                  value={provFilter}
                  onChange={(e) => setProvFilter(e.target.value)}
                />
                <div className="hm-prov-list">
                  {filteredProveedores.length === 0 ? (
                    <p className="text-muted small mb-0">No hay proveedores para mostrar.</p>
                  ) : (
                    filteredProveedores.map((p) => (
                      <label key={p.number} className="hm-prov-row">
                        <input
                          type="checkbox"
                          disabled={!canEdit || saving}
                          checked={draftCodes.includes(p.number)}
                          onChange={() => toggleCode(p.number)}
                        />
                        <span className="hm-prov-code">{p.number}</span>
                        <span>{p.name || "—"}</span>
                      </label>
                    ))
                  )}
                </div>
                {saveErr ? <div className="alert alert-danger py-2 mt-3 mb-0">{saveErr}</div> : null}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setConfigOpen(false)}>
                  Cancelar
                </button>
                {canEdit ? (
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveConfig()}>
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {configOpen ? <div className="modal-backdrop fade show" /> : null}
    </div>
  );
}
