import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getEquiposAsicAudit, type EquipoAsicAuditEntry, type EquiposAsicAuditStats } from "../lib/api.js";
import { showToast } from "./ToastNotification.js";
import "../styles/tienda-online-audit.css";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const TOAST_CTX = "Auditoría tienda online";

function actionLabel(action: string): string {
  const m: Record<string, string> = {
    create: "Alta",
    update: "Edición",
    delete: "Baja",
    bulk_import: "Importación Excel",
    delete_all: "Borrar inventario",
    marketplace_image: "Imagen tienda",
  };
  return m[action] ?? action;
}

function badgeClass(action: string): string {
  if (action === "create") return "tienda-audit__badge tienda-audit__badge--create";
  if (action === "update") return "tienda-audit__badge tienda-audit__badge--update";
  if (action === "delete") return "tienda-audit__badge tienda-audit__badge--delete";
  if (action === "bulk_import") return "tienda-audit__badge tienda-audit__badge--bulk";
  if (action === "delete_all") return "tienda-audit__badge tienda-audit__badge--delete_all";
  if (action === "marketplace_image") return "tienda-audit__badge tienda-audit__badge--image";
  return "tienda-audit__badge tienda-audit__badge--default";
}

/** Mismo criterio visual que Clientes tienda / Historial: cabecera verde #2D5D46 y bordes. */
async function downloadAuditExcel(rows: EquipoAsicAuditEntry[], fileBase: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Auditoría", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Fecha (ISO)", key: "created_at", width: 24 },
    { header: "ID usuario", key: "user_id", width: 12 },
    { header: "Correo", key: "user_email", width: 30 },
    { header: "Usuario (BD)", key: "user_usuario", width: 18 },
    { header: "Acción (código)", key: "action", width: 18 },
    { header: "Movimiento", key: "movimiento", width: 18 },
    { header: "Código producto", key: "codigo_producto", width: 16 },
    { header: "ID equipo", key: "equipo_id", width: 28 },
    { header: "Resumen", key: "summary", width: 48 },
    { header: "Cambios (antes → después)", key: "deltas", width: 56 },
    { header: "Indicadores", key: "flags", width: 28 },
  ];

  for (const r of rows) {
    const deltas =
      r.deltas?.map((d) => `${d.label}: ${d.before} → ${d.after}`).join(" | ") ?? "";
    const flags = r.flags?.join(" | ") ?? "";
    ws.addRow({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      user_email: r.user_email ?? "",
      user_usuario: r.user_usuario ?? "",
      action: r.action,
      movimiento: actionLabel(r.action),
      codigo_producto: r.codigo_producto ?? "",
      equipo_id: r.equipo_id ?? "",
      summary: r.summary ?? "",
      deltas,
      flags,
    });
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2D5D46" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 24;

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (rowNumber > 1) {
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      }
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const fecha = new Date().toISOString().split("T")[0];
  saveAs(new Blob([buf]), `${fileBase}_${fecha}.xlsx`);
}

type Props = { refreshKey?: number };

export function TiendaOnlineAuditSection({ refreshKey = 0 }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [fromIso, setFromIso] = useState("");
  const [toIso, setToIso] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [entries, setEntries] = useState<EquipoAsicAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<EquiposAsicAuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, actionFilter, fromIso, toIso, pageSize]);

  const offset = (page - 1) * pageSize;

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getEquiposAsicAudit({
      limit: pageSize,
      offset,
      q: debouncedQ || undefined,
      action: actionFilter || undefined,
      from: fromIso || undefined,
      to: toIso ? `${toIso}T23:59:59.999Z` : undefined,
    })
      .then((r) => {
        const list = Array.isArray(r.entries) ? r.entries : [];
        setEntries(list);
        setTotal(typeof r.total === "number" ? r.total : list.length);
        setStats(
          r.stats ?? {
            grandTotal: list.length,
            last24h: 0,
            last7d: 0,
            byAction: {},
          }
        );
      })
      .catch(() => {
        setEntries([]);
        setTotal(0);
        setStats(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [pageSize, offset, debouncedQ, actionFilter, fromIso, toIso]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const byActionChips = useMemo(() => {
    if (!stats?.byAction) return [];
    return Object.entries(stats.byAction)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setActionFilter("");
    setFromIso("");
    setToIso("");
  }, []);

  async function handleExportVisible() {
    if (entries.length === 0) {
      showToast("No hay filas para exportar.", "info", TOAST_CTX);
      return;
    }
    try {
      await downloadAuditExcel(entries, "Auditoria_tienda_pagina");
      showToast(`Excel generado (${entries.length} fila(s) de esta página).`, "success", TOAST_CTX);
    } catch {
      showToast("No se pudo generar el Excel.", "error", TOAST_CTX);
    }
  }

  async function handleExportFiltered() {
    setExporting(true);
    try {
      const all: EquipoAsicAuditEntry[] = [];
      let off = 0;
      const lim = 500;
      let guard = 0;
      while (guard < 20) {
        guard += 1;
        const r = await getEquiposAsicAudit({
          limit: lim,
          offset: off,
          q: debouncedQ || undefined,
          action: actionFilter || undefined,
          from: fromIso || undefined,
          to: toIso ? `${toIso}T23:59:59.999Z` : undefined,
        });
        all.push(...(r.entries ?? []));
        if (!r.entries?.length || r.entries.length < lim || all.length >= (r.total ?? 0)) break;
        off += lim;
      }
      if (all.length === 0) {
        showToast("Sin registros con los filtros actuales.", "info", TOAST_CTX);
        return;
      }
      await downloadAuditExcel(all, "Auditoria_tienda_filtrado");
      showToast(`Excel generado (${all.length} registro(s) con los filtros actuales).`, "success", TOAST_CTX);
    } catch {
      showToast("No se pudo generar el Excel. Reintentá.", "error", TOAST_CTX);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="usuarios-page-card tienda-audit">
      <div className="usuarios-page-header">
        <div className="usuarios-page-header-inner">
          <h2 className="usuarios-page-title" id="usuarios-heading-auditoria">
            <span className="usuarios-page-title-icon" aria-hidden>
              <i className="bi bi-journal-text" />
            </span>
            Libro de movimientos · inventario y tienda online
          </h2>
          <p className="usuarios-page-subtitle">
            Trazabilidad <strong>operativa y contable</strong>: quién modificó qué, cuándo, y{" "}
            <strong>cambios de precio / publicación</strong> con valor anterior y nuevo. Cumple buenas prácticas de
            auditoría en e‑commerce B2B (segregación de funciones, evidencia exportable).
          </p>
          {stats ? (
            <div className="tienda-audit__kpi-row" aria-label="Indicadores de actividad">
              <div className="tienda-audit__kpi">
                <span className="tienda-audit__kpi-label">Registros totales</span>
                <span className="tienda-audit__kpi-value">{stats.grandTotal}</span>
              </div>
              <div className="tienda-audit__kpi">
                <span className="tienda-audit__kpi-label">Últimas 24 h</span>
                <span className="tienda-audit__kpi-value">{stats.last24h}</span>
              </div>
              <div className="tienda-audit__kpi">
                <span className="tienda-audit__kpi-label">Últimos 7 días</span>
                <span className="tienda-audit__kpi-value">{stats.last7d}</span>
              </div>
              <div className="tienda-audit__kpi">
                <span className="tienda-audit__kpi-label">Coinciden filtros</span>
                <span className="tienda-audit__kpi-value">{total}</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="tienda-audit__header-actions">
          <button type="button" className="btn btn-sm btn-outline-light" onClick={() => void load()} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" aria-hidden />
            Actualizar
          </button>
        </div>
      </div>

      <div className="usuarios-page-body">
        <div className="historial-filtros-outer tienda-audit__filtros-outer">
          <div className="historial-filtros-container">
            <div className="card historial-filtros-card">
              <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
              <div className="row g-2 align-items-end tienda-audit__filtros-row">
                <div className="col-12 col-md-3 col-lg-3">
                  <label className="form-label small fw-bold" htmlFor="tienda-audit-q">
                    Buscar
                  </label>
                  <input
                    id="tienda-audit-q"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Resumen, código, correo, ID usuario, JSON…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="col-6 col-md-2 col-lg-2">
                  <label className="form-label small fw-bold" htmlFor="tienda-audit-action">
                    Tipo
                  </label>
                  <select
                    id="tienda-audit-action"
                    className="form-select form-select-sm"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    title="Tipo de movimiento"
                  >
                    <option value="">Todos</option>
                    <option value="create">Alta</option>
                    <option value="update">Edición</option>
                    <option value="delete">Baja</option>
                    <option value="bulk_import">Importación Excel</option>
                    <option value="delete_all">Borrar inventario</option>
                    <option value="marketplace_image">Imagen tienda</option>
                  </select>
                </div>
                <div className="col-6 col-md-2 col-lg-2">
                  <label className="form-label small fw-bold" htmlFor="tienda-audit-from">
                    Desde
                  </label>
                  <input
                    id="tienda-audit-from"
                    type="date"
                    className="form-control form-control-sm"
                    value={fromIso}
                    onChange={(e) => setFromIso(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-3 col-lg-3 tienda-audit__hasta-limpiar-wrap">
                  <div className="tienda-audit__hasta-limpiar-inner d-flex align-items-end flex-wrap flex-md-nowrap">
                    <div className="flex-grow-1 min-w-0 tienda-audit__hasta-field">
                      <label className="form-label small fw-bold" htmlFor="tienda-audit-to">
                        Hasta
                      </label>
                      <input
                        id="tienda-audit-to"
                        type="date"
                        className="form-control form-control-sm"
                        value={toIso}
                        onChange={(e) => setToIso(e.target.value)}
                      />
                    </div>
                    <div className="flex-shrink-0 tienda-audit__limpiar-btn-wrap">
                      <button type="button" className="btn btn-outline-secondary btn-sm filtros-limpiar-btn" onClick={clearFilters}>
                        Limpiar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="tienda-audit__export-row">
                <div className="tienda-audit__export-actions d-flex flex-wrap justify-content-end align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm tienda-audit__btn-export-excel"
                    title="Exporta las filas visibles en esta página (.xlsx)"
                    onClick={() => void handleExportVisible()}
                    disabled={loading || entries.length === 0}
                  >
                    <i className="bi bi-bar-chart-fill" aria-hidden />
                    Exportar Excel (página)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm tienda-audit__btn-export-excel"
                    title="Exporta todos los registros que coinciden con los filtros (.xlsx)"
                    onClick={() => void handleExportFiltered()}
                    disabled={loading || exporting}
                  >
                    {exporting ? (
                      <span className="spinner-border spinner-border-sm text-light" role="status" aria-label="Exportando" />
                    ) : (
                      <>
                        <i className="bi bi-bar-chart-fill" aria-hidden />
                        Exportar Excel (filtrado)
                      </>
                    )}
                  </button>
                </div>
              </div>
              {byActionChips.length > 0 ? (
                <div className="tienda-audit__legend tienda-audit__legend--in-filtros">
                  <span>
                    <strong>Distribución histórica:</strong>
                  </span>
                  {byActionChips.map(([a, n]) => (
                    <span key={a}>
                      {actionLabel(a)}: <strong>{n}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="activity-loading">
            <div className="spinner-border" role="status" aria-label="Espere un momento" />
          </div>
        ) : error ? (
          <div className="empty-activity">
            <i className="bi bi-exclamation-triangle text-warning" />
            <p className="mb-2">No se pudo cargar la auditoría.</p>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-activity">
            <i className="bi bi-inbox" />
            <p className="mb-0">Sin registros con los filtros actuales.</p>
          </div>
        ) : (
          <div className="usuarios-listado-wrap">
            <table className="table table-sm align-middle usuarios-listado-table">
              <thead className="table-dark">
                <tr>
                  <th className="text-start">Fecha y hora</th>
                  <th className="text-start">ID usuario</th>
                  <th className="text-start">Correo</th>
                  <th className="text-start">Usuario (BD)</th>
                  <th className="text-start">Movimiento</th>
                  <th className="text-start">Código</th>
                  <th className="text-start">ID equipo</th>
                  <th className="text-start">Resumen</th>
                  <th className="text-start">Impacto contable / operativo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id}>
                    <td className="tienda-audit__mono text-nowrap">{new Date(row.created_at).toLocaleString("es-AR")}</td>
                    <td className="tienda-audit__mono">{row.user_id}</td>
                    <td>
                      <span className="user-email">{row.user_email}</span>
                    </td>
                    <td className="small">{row.user_usuario?.trim() || "—"}</td>
                    <td>
                      <span className={badgeClass(row.action)}>{actionLabel(row.action)}</span>
                    </td>
                    <td className="tienda-audit__mono">{row.codigo_producto ?? "—"}</td>
                    <td className="tienda-audit__mono small" title={row.equipo_id ?? undefined}>
                      {row.equipo_id ? (row.equipo_id.length > 16 ? `${row.equipo_id.slice(0, 16)}…` : row.equipo_id) : "—"}
                    </td>
                    <td className="tienda-audit__summary small">{row.summary}</td>
                    <td>
                      {row.deltas && row.deltas.length > 0 ? (
                        <table className="tienda-audit__delta-table">
                          <thead>
                            <tr>
                              <th>Campo</th>
                              <th>Valor anterior</th>
                              <th>Valor nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.deltas.map((d, i) => (
                              <tr key={i}>
                                <th scope="row">{d.label}</th>
                                <td>
                                  <span className="tienda-audit__delta-antes">{d.before}</span>
                                </td>
                                <td>
                                  <span className="tienda-audit__delta-despues">{d.after}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                      {row.flags && row.flags.length > 0 ? (
                        <ul className="tienda-audit__flags">
                          {row.flags.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && total > 0 ? (
          <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
            <div className="d-flex align-items-center gap-2">
              <label className="text-muted small mb-0">Filas por página</label>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto" }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="text-muted small">
                {total === 0 ? "—" : `Mostrando ${offset + 1}–${Math.min(offset + entries.length, total)} de ${total}`}
              </span>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ‹ Anterior
              </button>
              <span className="px-2 small text-muted">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente ›
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
