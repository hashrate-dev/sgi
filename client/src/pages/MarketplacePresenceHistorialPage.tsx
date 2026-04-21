import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Navigate } from "react-router-dom";
import { getMarketplacePresenceHistory, type MarketplacePresenceHistoryRow } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { canViewMarketplaceQuoteTickets } from "../lib/auth";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";
import "../styles/hrs-marketplace-presence.css";

function viewerTypeLabel(raw: string): string {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "cliente") return "Cliente logueado";
  if (t === "staff") return "Staff logueado";
  return "Invitado (sin cuenta)";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

const PAGE_SIZE = 20;
const EXPORT_BATCH_SIZE = 500;

export function MarketplacePresenceHistorialPage() {
  const { user } = useAuth();
  const canView = Boolean(user && canViewMarketplaceQuoteTickets(user.role));
  const [rows, setRows] = useState<MarketplacePresenceHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [viewerTypeFilter, setViewerTypeFilter] = useState<"" | "anon" | "cliente" | "staff">("");
  const [page, setPage] = useState(1);
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [qInput]);

  /** Antes del fetch: al cambiar filtros, volver a página 1. */
  useLayoutEffect(() => {
    setPage(1);
  }, [qDebounced, viewerTypeFilter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const loadPage = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const r = await getMarketplacePresenceHistory({
        limit: PAGE_SIZE,
        offset,
        ...(qDebounced ? { q: qDebounced } : {}),
        ...(viewerTypeFilter ? { viewerType: viewerTypeFilter } : {}),
      });
      setRows(r.rows);
      setTotal(r.total);
      const maxP = Math.max(1, Math.ceil(r.total / PAGE_SIZE));
      if (page > maxP) {
        setPage(maxP);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canView, page, qDebounced, viewerTypeFilter]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const rangeLabel = useMemo(() => {
    if (total === 0) return "0 filas";
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return `${from}–${to} de ${total}`;
  }, [page, total]);

  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    setErr(null);
    try {
      const rowsToExport: MarketplacePresenceHistoryRow[] = [];
      let offset = 0;
      let totalRows = 0;
      while (true) {
        const res = await getMarketplacePresenceHistory({
          limit: EXPORT_BATCH_SIZE,
          offset,
          ...(qDebounced ? { q: qDebounced } : {}),
          ...(viewerTypeFilter ? { viewerType: viewerTypeFilter } : {}),
        });
        if (offset === 0) totalRows = res.total;
        rowsToExport.push(...res.rows);
        offset += res.rows.length;
        if (res.rows.length === 0 || rowsToExport.length >= totalRows) break;
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Presencia marketplace");
      ws.columns = [
        { header: "Fecha / hora", key: "recordedAt", width: 24 },
        { header: "Tipo", key: "viewerType", width: 20 },
        { header: "Ruta", key: "currentPath", width: 36 },
        { header: "Pais", key: "country", width: 24 },
        { header: "IP", key: "clientIp", width: 20 },
        { header: "Email", key: "userEmail", width: 34 },
        { header: "Locale", key: "locale", width: 16 },
        { header: "Timezone", key: "timezone", width: 24 },
      ];

      for (const r of rowsToExport) {
        ws.addRow({
          recordedAt: formatWhen(r.recordedAt),
          viewerType: viewerTypeLabel(r.viewerType),
          currentPath: r.currentPath || "—",
          country: `${r.countryName || "—"} (${r.countryCode || "—"})`,
          clientIp: r.clientIp || "—",
          userEmail: r.userEmail || "—",
          locale: r.locale || "—",
          timezone: r.timezone || "—",
        });
      }

      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(
        now.getHours()
      ).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `marketplace_presencia_historial_${stamp}.xlsx`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo exportar el Excel.");
    } finally {
      setExportingExcel(false);
    }
  }, [exportingExcel, qDebounced, viewerTypeFilter]);

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="fact-page hrs-mplive-page">
      <div className="container">
        <PageHeader
          title="Historial detalle — Presencia marketplace"
          logoHref="/"
          showBackButton
          backTo="/marketplace/presence"
          backText="Volver al monitor"
        />

        <div className="hrs-card hrs-card--rect p-4">

          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-lg-5 col-md-6">
                    <label className="form-label small fw-bold">Texto libre</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Email, ruta, IP, país, código país, visitor…"
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                      aria-label="Filtrar por texto en el historial"
                    />
                  </div>
                  <div className="col-md-4 col-lg-3">
                    <label className="form-label small fw-bold">Tipo de visitante</label>
                    <select
                      className="form-select form-select-sm"
                      value={viewerTypeFilter}
                      onChange={(e) =>
                        setViewerTypeFilter((e.target.value || "") as "" | "anon" | "cliente" | "staff")
                      }
                      aria-label="Filtrar por tipo de visitante"
                    >
                      <option value="">Todos</option>
                      <option value="anon">Invitado (sin cuenta)</option>
                      <option value="cliente">Cliente logueado</option>
                      <option value="staff">Staff logueado</option>
                    </select>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => {
                        setQInput("");
                        setQDebounced("");
                        setViewerTypeFilter("");
                      }}
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm clientes-export-excel-btn"
                      style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }}
                      disabled={exportingExcel}
                      onClick={() => void handleExportExcel()}
                    >
                      {exportingExcel ? "⏳ Exportando..." : "📊 Exportar Excel"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {err ? <div className="alert alert-danger py-2">{err}</div> : null}

          <div className="historial-listado-wrap historial-listado-outer">
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <h6 className="fw-bold m-0">
                📄 Movimientos
                {!loading && total > 0 ? <span className="text-muted small ms-1">({total})</span> : null}
              </h6>
              <span className="small text-muted">{loading ? "Cargando…" : rangeLabel}</span>
            </div>
            <p className="text-muted small mb-3">
              Detalle de movimientos de usuarios en el Marketplace.
            </p>

            <div className="table-responsive">
            <table className="table table-sm align-middle historial-listado-table" style={{ fontSize: "0.85rem" }}>
              <thead className="table-dark">
                <tr>
                  <th className="text-start">Fecha / hora</th>
                  <th className="text-start">Tipo</th>
                  <th className="text-start">Ruta</th>
                  <th className="text-start">País</th>
                  <th className="text-start">IP</th>
                  <th className="text-start">Email</th>
                  <th className="text-start">Locale / TZ</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      Cargando historial…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      Sin registros todavía o ningún resultado para el filtro.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className="text-start" style={{ whiteSpace: "nowrap" }}>{formatWhen(r.recordedAt)}</td>
                      <td className="text-start">{viewerTypeLabel(r.viewerType)}</td>
                      <td className="text-start">
                        <code className="small">{r.currentPath || "—"}</code>
                      </td>
                      <td className="text-start">
                        {r.countryName}
                        <span className="text-muted small"> ({r.countryCode})</span>
                      </td>
                      <td className="text-start">
                        <code className="small">{r.clientIp || "—"}</code>
                      </td>
                      <td className="text-start">
                        <code className="small">{r.userEmail || "—"}</code>
                      </td>
                      <td className="text-start small text-muted">
                        {r.locale || "—"}
                        <br />
                        {r.timezone || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

            {total > 0 ? (
              <nav
                className="d-flex flex-wrap align-items-center justify-content-between gap-2 hrs-mplive-pagination hrs-mplive-pagination--in-listado"
                aria-label="Paginación del historial"
              >
                <span className="small text-muted flex-shrink-0 me-2">
                  Página {page} de {totalPages}
                </span>
                <ul className="pagination pagination-sm mb-0 hrs-mplive-pagination__pages flex-shrink-0">
                  <li className={`page-item${page <= 1 || loading ? " disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </button>
                  </li>
                  <li className={`page-item${page >= totalPages || loading ? " disabled" : ""}`}>
                    <button
                      type="button"
                      className="page-link"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Siguiente
                    </button>
                  </li>
                </ul>
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
