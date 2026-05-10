import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { HostingFxOperationsIndicators } from "../components/HostingFxOperationsIndicators";
import {
  HostingFxOperationsHistoryCard,
  HostingFxTicketModal,
  HostingTransferCommissionInvoicesCard,
} from "../components/HostingTipoCambioHistorialTables";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessHostingTipoCambio } from "../lib/auth";
import {
  getHostingFxOperations,
  getHostingInvoicesTransferCommission,
  type HostingFxOperation,
  type HostingInvoiceTransferCommissionRow,
} from "../lib/api";
import { downloadHostingFxTicketPdf } from "../lib/generateHostingFxTicketPdf";
import {
  filterHostingFxOperations,
  filterHostingTransferCommissionInvoices,
  sumTransferCommissionUsd,
  type HostingHistorialFilterState,
} from "../lib/hostingHistorialFilters";
import "../styles/facturacion.css";

/** Año más antiguo en el desplegable: no listar 2024 ni anteriores. */
const HOSTING_HISTORIAL_YEAR_FROM = 2025;
const HOSTING_HISTORIAL_YEAR_TO = new Date().getFullYear() + 1;
const HOSTING_HISTORIAL_YEAR_OPTIONS: number[] = [];
for (let y = HOSTING_HISTORIAL_YEAR_TO; y >= HOSTING_HISTORIAL_YEAR_FROM; y--) {
  HOSTING_HISTORIAL_YEAR_OPTIONS.push(y);
}

const HOSTING_HISTORIAL_MESES: { value: string; label: string }[] = [
  { value: "", label: "Todo el año" },
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

export function HostingTipoCambioHistorialPage() {
  const { user, loading } = useAuth();
  const [operations, setOperations] = useState<HostingFxOperation[]>([]);
  const [transferCommissionInvoices, setTransferCommissionInvoices] = useState<HostingInvoiceTransferCommissionRow[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [filters, setFilters] = useState<HostingHistorialFilterState>({
    clientText: "",
    periodYear: "",
    periodMonth: "",
  });
  const [err, setErr] = useState("");
  const [ticketOperationId, setTicketOperationId] = useState<number | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setTableLoading(true);
    setErr("");
    try {
      const [rOps, rTi] = await Promise.allSettled([
        getHostingFxOperations(),
        getHostingInvoicesTransferCommission(),
      ]);
      if (rOps.status === "fulfilled") {
        setOperations(rOps.value.operations || []);
      } else {
        setOperations([]);
        setErr(rOps.reason instanceof Error ? rOps.reason.message : "No se pudieron cargar las operaciones.");
      }
      if (rTi.status === "fulfilled") {
        setTransferCommissionInvoices(rTi.value.invoices || []);
      } else {
        setTransferCommissionInvoices([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la información.");
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessHostingTipoCambio(user)) return;
    void loadData();
  }, [loading, user, loadData]);

  const filteredOperations = useMemo(
    () => filterHostingFxOperations(operations, filters),
    [operations, filters]
  );
  const filteredTransferInvoices = useMemo(
    () => filterHostingTransferCommissionInvoices(transferCommissionInvoices, filters),
    [transferCommissionInvoices, filters]
  );
  const transferCommissionSumFiltered = useMemo(
    () => sumTransferCommissionUsd(filteredTransferInvoices),
    [filteredTransferInvoices]
  );

  const ticketOperation = useMemo(
    () => operations.find((op) => op.id === ticketOperationId) ?? null,
    [operations, ticketOperationId]
  );

  const filtersActive =
    Boolean(filters.clientText.trim()) || Boolean(filters.periodYear.trim());

  const onDownloadRowPdf = useCallback(async (op: HostingFxOperation) => {
    setPdfLoadingId(op.id);
    setErr("");
    try {
      await downloadHostingFxTicketPdf(op);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfLoadingId(null);
    }
  }, []);

  useEffect(() => {
    if (!ticketOperation) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setTicketOperationId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [ticketOperation]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessHostingTipoCambio(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Historial tipo de cambio (USDT/USD)"
          showBackButton
          backTo="/gestion-administrativa/exchange"
          backText="Volver atrás"
          rightContent={
            <Link to="/hosting/exchange-operations" className="fact-back">
              Operaciones de cambio
            </Link>
          }
        />

        <div className="hrs-card hrs-card--rect p-4 mb-3">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-12 col-md-4 col-lg-4">
                    <label className="form-label small fw-bold">Cliente (texto)</label>
                    <input
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Código o nombre…"
                      value={filters.clientText}
                      onChange={(e) => setFilters((p) => ({ ...p, clientText: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="col-6 col-md-3 col-lg-2">
                    <label className="form-label small fw-bold">Año</label>
                    <select
                      className="form-select form-select-sm"
                      value={filters.periodYear}
                      onChange={(e) =>
                        setFilters((p) => ({
                          ...p,
                          periodYear: e.target.value,
                          periodMonth: e.target.value ? p.periodMonth : "",
                        }))
                      }
                      aria-label="Filtrar por año"
                    >
                      <option value="">Todos</option>
                      {HOSTING_HISTORIAL_YEAR_OPTIONS.map((y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-md-3 col-lg-3">
                    <label className="form-label small fw-bold">Mes</label>
                    <select
                      className="form-select form-select-sm"
                      value={filters.periodMonth}
                      disabled={!filters.periodYear}
                      onChange={(e) => setFilters((p) => ({ ...p, periodMonth: e.target.value }))}
                      aria-label="Filtrar por mes o año completo"
                    >
                      {HOSTING_HISTORIAL_MESES.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-auto d-flex align-items-end">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      disabled={!filtersActive}
                      onClick={() => setFilters({ clientText: "", periodYear: "", periodMonth: "" })}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                {filtersActive ? (
                  <p className="small mb-0 mt-3 hosting-fx-historial-filtros-activo">
                    {[
                      filters.periodYear &&
                        (filters.periodMonth
                          ? `Período: ${HOSTING_HISTORIAL_MESES.find((m) => m.value === filters.periodMonth)?.label ?? ""} ${filters.periodYear}`
                          : `Período: año ${filters.periodYear} completo`),
                      filters.clientText.trim() ? "Cliente por texto" : null,
                      "Operaciones por fecha de operación; facturas por fecha del comprobante.",
                    ]
                      .filter(Boolean)
                      .join(". ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <HostingFxOperationsIndicators
          operations={filteredOperations}
          tableLoading={tableLoading}
          facturasTransferCommissionKpi={{
            sumUsd: transferCommissionSumFiltered,
            invoiceCount: filteredTransferInvoices.length,
          }}
        />


        {err ? <div className="alert alert-danger py-2 mb-3">{err}</div> : null}

        <HostingFxOperationsHistoryCard
          operations={filteredOperations}
          tableLoading={tableLoading}
          canEdit={false}
          canDelete={false}
          pdfLoadingId={pdfLoadingId}
          onEdit={() => {}}
          onTicket={setTicketOperationId}
          onPdf={onDownloadRowPdf}
          onDelete={() => {}}
        />

        <HostingTransferCommissionInvoicesCard
          transferCommissionInvoices={filteredTransferInvoices}
          tableLoading={tableLoading}
        />

        <HostingFxTicketModal ticketOperation={ticketOperation} onClose={() => setTicketOperationId(null)} />
      </div>
    </div>
  );
}
