import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessFinanzaContabilidadHub } from "../lib/auth";
import { formatCurrencyNumber } from "../lib/formatCurrency";
import { sgiHome } from "../lib/marketplacePaths.js";
import {
  CONTABILIDAD_MEDIOS_PAGO,
  getContabilidadGastos,
  getProveedoresHrs,
  type ContabilidadGasto,
  type ContabilidadMoneda,
  type ProveedorHrs,
} from "../lib/api";
import "../styles/facturacion.css";

function formatGastoFechaTabla(isoDate: string): string {
  const t = String(isoDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || "—";
  const [yStr, mStr, dStr] = t.split("-");
  const y = Number.parseInt(yStr, 10);
  const mo = Number.parseInt(mStr, 10);
  const day = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return t;
  const yy = String(y).slice(-2).padStart(2, "0");
  return `${String(day).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${yy}`;
}

function formatYmDisplay(ym: string): string {
  const t = String(ym || "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return t || "—";
  const [yearStr, moStr] = t.split("-");
  const y = Number.parseInt(yearStr, 10);
  const mo = Number.parseInt(moStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return t;
  const d = new Date(y, mo - 1, 1);
  if (Number.isNaN(d.getTime())) return t;
  const label = d.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
  if (!label) return t;
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return cap.replace(/\s+de\s+/gi, " ");
}

function formatMontoOriginal(moneda: ContabilidadMoneda, monto: number): string {
  if (!Number.isFinite(monto)) return "—";
  if (moneda === "PYG") return `${Math.round(monto).toLocaleString("es-PY")} Gs.`;
  if (moneda === "USD") return formatCurrencyNumber(monto);
  return formatCurrencyNumber(monto);
}

const MONEDA_FILTER_OPTIONS: ReadonlyArray<{ value: "" | ContabilidadMoneda; label: string }> = [
  { value: "", label: "Todas" },
  { value: "UYU", label: "UYU" },
  { value: "USD", label: "USD" },
  { value: "PYG", label: "PYG" },
];

export function ResumenPresupuestoPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ContabilidadGasto[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorHrs[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [qBuscar, setQBuscar] = useState("");
  const [qProveedorId, setQProveedorId] = useState("");
  const [qPresupuestoYm, setQPresupuestoYm] = useState("");
  const [qMoneda, setQMoneda] = useState<"" | ContabilidadMoneda>("");
  const [qMedioPago, setQMedioPago] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setListLoading(true);
    setFetchError("");
    try {
      const [gRes, pRes] = await Promise.all([getContabilidadGastos(), getProveedoresHrs()]);
      setItems(Array.isArray(gRes.items) ? gRes.items : []);
      setProveedores(Array.isArray(pRes.items) ? pRes.items : []);
    } catch {
      setItems([]);
      setProveedores([]);
      setFetchError("No se pudieron cargar los gastos.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && canAccessFinanzaContabilidadHub(user)) {
      void load();
    }
  }, [loading, user, load]);

  const proveedorRubroById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of proveedores) {
      const id = Number(p.id);
      if (!Number.isFinite(id)) continue;
      m.set(id, String(p.rubro ?? "").trim());
    }
    return m;
  }, [proveedores]);

  const presupuestoOpciones = useMemo(() => {
    const set = new Set<string>();
    for (const row of items) {
      const pm = String(row.presupuestoMes || "").trim().slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(pm)) set.add(pm);
    }
    return [...set].sort((a, b) => b.localeCompare(a, "en"));
  }, [items]);

  const proveedoresOrdenados = useMemo(
    () =>
      [...proveedores].sort((a, b) =>
        String(a.supplierNumber || "").localeCompare(String(b.supplierNumber || ""), undefined, { numeric: true })
      ),
    [proveedores]
  );

  const filtered = useMemo(() => {
    const q = qBuscar.trim().toLowerCase();
    const pid = qProveedorId.trim();
    const pym = qPresupuestoYm.trim().slice(0, 7);
    const medio = qMedioPago.trim();
    return items.filter((row) => {
      if (pid) {
        const want = Number.parseInt(pid, 10);
        if (!Number.isFinite(want) || row.proveedorId !== want) return false;
      }
      if (pym && /^\d{4}-\d{2}$/.test(pym)) {
        if (String(row.presupuestoMes || "").slice(0, 7) !== pym) return false;
      }
      if (qMoneda && row.moneda !== qMoneda) return false;
      if (medio && String(row.medioPago || "").trim() !== medio) return false;
      if (!q) return true;
      const haystack = [
        row.supplierNumber,
        row.supplierName,
        proveedorRubroById.get(Number(row.proveedorId)) ?? "",
        row.numeroFactura,
        row.descripcion,
        row.observaciones ?? "",
        row.fecha,
        formatGastoFechaTabla(row.fecha),
        row.mesServicio ?? "",
        row.presupuestoMes ?? "",
        formatYmDisplay(row.mesServicio),
        formatYmDisplay(row.presupuestoMes),
        row.medioPago ?? "",
        row.moneda,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, qBuscar, qProveedorId, qPresupuestoYm, qMoneda, qMedioPago, proveedorRubroById]);

  const totalUsdFiltrado = useMemo(
    () => filtered.reduce((acc, row) => acc + (Number.isFinite(row.monto) ? row.monto : 0), 0),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [qBuscar, qProveedorId, qPresupuestoYm, qMoneda, qMedioPago, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessFinanzaContabilidadHub(user)) {
    return <Navigate to={sgiHome()} replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Resumen de Presupuesto"
          backTo="/gestion-financiera"
          backText="Volver a Gestión Financiera"
        />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-3 align-items-end facturas-mes-filtros-row">
                  <div className="col-6 col-md-2">
                    <label className="form-label small fw-bold mb-1">Presupuesto</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={qPresupuestoYm}
                      onChange={(e) => setQPresupuestoYm(e.target.value)}
                    >
                      <option value="">Todos los meses</option>
                      {presupuestoOpciones.map((ym) => (
                        <option key={ym} value={ym}>
                          {formatYmDisplay(ym)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label small fw-bold mb-1">Proveedor</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={qProveedorId}
                      onChange={(e) => setQProveedorId(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {proveedoresOrdenados.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.supplierNumber} — {p.supplierName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label small fw-bold mb-1">Moneda</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={qMoneda}
                      onChange={(e) => setQMoneda(e.target.value as "" | ContabilidadMoneda)}
                    >
                      {MONEDA_FILTER_OPTIONS.map((op) => (
                        <option key={op.label} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-md-3">
                    <label className="form-label small fw-bold mb-1">Medio de pago</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={qMedioPago}
                      onChange={(e) => setQMedioPago(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {CONTABILIDAD_MEDIOS_PAGO.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-3">
                    <label className="form-label small fw-bold mb-1">Buscar</label>
                    <input
                      className="form-control form-control-sm w-100"
                      placeholder="Descripción, factura, rubro…"
                      value={qBuscar}
                      onChange={(e) => setQBuscar(e.target.value)}
                    />
                  </div>
                  <div className="col-6 col-md-auto d-flex align-items-end filtros-limpiar-col">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => {
                        setQBuscar("");
                        setQProveedorId("");
                        setQPresupuestoYm("");
                        setQMoneda("");
                        setQMedioPago("");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="col-6 col-md-auto d-flex align-items-end ms-md-auto">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => void load()}
                      disabled={listLoading}
                    >
                      <i className="bi bi-arrow-clockwise me-1" />
                      Actualizar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="historial-listado-wrap">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h6 className="fw-bold m-0 listado-table-title">
                📊 Gastos registrados ({filtered.length})
              </h6>
              <Link to="/gestion-financiera/contabilidad" className="btn btn-outline-primary btn-sm">
                Ir a Contabilidad
              </Link>
            </div>
            <p className="text-muted small mb-3">
              Listado de todos los gastos de empresa con totales en USD. Usá los filtros para acotar por mes de presupuesto,
              proveedor, moneda o medio de pago.
            </p>

            {fetchError ? (
              <div className="alert alert-warning d-flex align-items-center gap-2">
                <i className="bi bi-exclamation-triangle" />
                <span>{fetchError}</span>
                <button type="button" className="btn btn-sm btn-outline-warning ms-auto" onClick={() => void load()}>
                  Reintentar
                </button>
              </div>
            ) : null}

            {listLoading ? (
              <div className="d-flex justify-content-center py-5">
                <div className="spinner-border text-secondary" role="status" aria-label="Cargando gastos" />
              </div>
            ) : (
              <>
                <div className="resumen-presupuesto-total-bar mb-3">
                  <span className="text-muted small">Total filtrado (USD):</span>
                  <strong className="resumen-presupuesto-total-valor">
                    {formatCurrencyNumber(totalUsdFiltrado)} <span className="currency">USD</span>
                  </strong>
                  {filtered.length !== items.length ? (
                    <span className="text-muted small ms-2">
                      ({filtered.length} de {items.length} registros)
                    </span>
                  ) : null}
                </div>

                <div className="table-responsive resumen-presupuesto-tabla-wrap">
                  <table className="table table-sm align-middle resumen-presupuesto-table">
                    <colgroup>
                      <col className="rp-col-fecha" />
                      <col className="rp-col-prov" />
                      <col className="rp-col-nombre" />
                      <col className="rp-col-rubro" />
                      <col className="rp-col-desc" />
                      <col className="rp-col-factura" />
                      <col className="rp-col-mes-svc" />
                      <col className="rp-col-presup" />
                      <col className="rp-col-moneda" />
                      <col className="rp-col-monto-orig" />
                      <col className="rp-col-usd" />
                    </colgroup>
                    <thead className="table-dark">
                      <tr>
                        <th className="text-start rp-col-fecha">Fecha</th>
                        <th className="text-start rp-col-prov" title="Número de proveedor">Nº prov.</th>
                        <th className="text-start rp-col-nombre">Proveedor</th>
                        <th className="text-start rp-col-rubro">Rubro</th>
                        <th className="text-start rp-col-desc">Descripción</th>
                        <th className="text-start rp-col-factura" title="Número de factura o comprobante">Nº fact.</th>
                        <th className="text-start rp-col-mes-svc" title="Mes de servicio">M. serv.</th>
                        <th className="text-start rp-col-presup" title="Mes de presupuesto">Presup.</th>
                        <th className="text-center rp-col-moneda">Mon.</th>
                        <th className="text-end rp-col-monto-orig" title="Monto en moneda original">M. orig.</th>
                        <th className="text-end rp-col-usd">USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="text-center text-muted py-4">
                            {items.length === 0
                              ? "No hay gastos registrados."
                              : "Ningún gasto coincide con los filtros aplicados."}
                          </td>
                        </tr>
                      ) : (
                        paginated.map((row) => {
                          const rubro = proveedorRubroById.get(Number(row.proveedorId)) || "—";
                          return (
                            <tr key={row.id}>
                              <td className="text-start rp-col-fecha">{formatGastoFechaTabla(row.fecha)}</td>
                              <td className="text-start rp-col-prov">
                                <span className="rp-prov-badge">{row.supplierNumber}</span>
                              </td>
                              <td className="text-start rp-col-nombre" title={row.supplierName}>
                                <span className="rp-text-ellipsis">{row.supplierName}</span>
                              </td>
                              <td className="text-start rp-col-rubro" title={rubro !== "—" ? rubro : undefined}>
                                <span className="rp-text-ellipsis">{rubro}</span>
                              </td>
                              <td className="text-start rp-col-desc" title={row.descripcion}>
                                <span className="rp-desc-text">{row.descripcion || "—"}</span>
                              </td>
                              <td className="text-start rp-col-factura" title={row.numeroFactura || undefined}>
                                {row.numeroFactura || "—"}
                              </td>
                              <td className="text-start rp-col-mes-svc" title={row.mesServicio || undefined}>
                                {formatYmDisplay(row.mesServicio)}
                              </td>
                              <td className="text-start rp-col-presup" title={row.presupuestoMes || undefined}>
                                {formatYmDisplay(row.presupuestoMes)}
                              </td>
                              <td className="text-center rp-col-moneda">{row.moneda}</td>
                              <td className="text-end rp-col-monto-orig rp-monto-cell">
                                {formatMontoOriginal(row.moneda, row.montoOriginal ?? row.monto)}
                              </td>
                              <td className="text-end fw-semibold rp-col-usd rp-monto-cell">
                                {formatCurrencyNumber(row.monto)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {filtered.length > 0 ? (
                  <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
                    <div className="d-flex align-items-center gap-2">
                      <label className="text-muted small mb-0">Mostrar</label>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "auto" }}
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                      >
                        {[10, 25, 50, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span className="text-muted small">
                        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length}
                      </span>
                    </div>
                    <div className="d-flex align-items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className="text-muted small px-2">
                        Pág. {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
