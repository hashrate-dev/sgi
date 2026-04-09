import { useCallback, useEffect, useMemo, useState } from "react";
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

function escapeCsvCell(s: string): string {
  const t = String(s ?? "").replace(/"/g, '""');
  return /[",\n\r]/.test(t) ? `"${t}"` : t;
}

function rowToCsvLine(r: EquipoAsicAuditEntry): string {
  const deltas =
    r.deltas?.map((d) => `${d.label}: ${d.before}→${d.after}`).join(" | ") ?? "";
  const flags = r.flags?.join(" | ") ?? "";
  return [
    r.id,
    r.created_at,
    r.user_id,
    r.user_email,
    r.user_usuario ?? "",
    r.action,
    r.codigo_producto ?? "",
    r.equipo_id ?? "",
    r.summary,
    deltas,
    flags,
  ]
    .map((c) => escapeCsvCell(String(c)))
    .join(",");
}

function downloadCsv(filename: string, rows: EquipoAsicAuditEntry[]) {
  const header =
    "id,fecha_iso,user_id,correo,usuario_bd,accion,codigo_producto,equipo_id,resumen,deltas,flags";
  const body = rows.map(rowToCsvLine).join("\n");
  const bom = "\ufeff";
  const blob = new Blob([bom + header + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

  async function handleExportVisible() {
    if (entries.length === 0) {
      showToast("No hay filas para exportar.", "info", TOAST_CTX);
      return;
    }
    const name = `auditoria-tienda_${new Date().toISOString().slice(0, 10)}_pagina.csv`;
    downloadCsv(name, entries);
    showToast(`Exportadas ${entries.length} fila(s) visibles.`, "success", TOAST_CTX);
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
      downloadCsv(`auditoria-tienda_${new Date().toISOString().slice(0, 10)}_completo.csv`, all);
      showToast(`Exportados ${all.length} registro(s) (filtros aplicados).`, "success", TOAST_CTX);
    } catch {
      showToast("No se pudo exportar. Reintentá.", "error", TOAST_CTX);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="tienda-audit mt-4">
      <div className="tienda-audit__hero">
        <div className="tienda-audit__hero-top">
          <div>
            <h2 className="tienda-audit__title">
              <span className="tienda-audit__title-icon" aria-hidden>
                📋
              </span>
              Libro de movimientos · inventario y tienda online
            </h2>
            <p className="tienda-audit__subtitle">
              Trazabilidad <strong>operativa y contable</strong>: quién modificó qué, cuándo, y{" "}
              <strong>cambios de precio / publicación</strong> con valor anterior y nuevo. Cumple buenas prácticas de
              auditoría en e‑commerce B2B (segregación de funciones, evidencia exportable).
            </p>
          </div>
          <div className="tienda-audit__hero-actions">
            <button type="button" className="tienda-audit__btn" onClick={() => void load()} disabled={loading}>
              ⟳ Actualizar
            </button>
            <button type="button" className="tienda-audit__btn" onClick={handleExportVisible} disabled={loading || entries.length === 0}>
              ⬇ CSV (página)
            </button>
            <button type="button" className="tienda-audit__btn" onClick={() => void handleExportFiltered()} disabled={loading || exporting}>
              {exporting ? "…" : "⬇ CSV (todo filtrado)"}
            </button>
          </div>
        </div>
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

      <div className="tienda-audit__toolbar">
        <div className="tienda-audit__filters">
          <div className="tienda-audit__field tienda-audit__field--search">
            <label htmlFor="tienda-audit-q">Buscar</label>
            <input
              id="tienda-audit-q"
              type="search"
              placeholder="Resumen, código, correo, ID usuario, JSON…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="tienda-audit__field">
            <label htmlFor="tienda-audit-action">Tipo de movimiento</label>
            <select
              id="tienda-audit-action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
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
          <div className="tienda-audit__field tienda-audit__field--date">
            <label htmlFor="tienda-audit-from">Desde</label>
            <input id="tienda-audit-from" type="date" value={fromIso} onChange={(e) => setFromIso(e.target.value)} />
          </div>
          <div className="tienda-audit__field tienda-audit__field--date">
            <label htmlFor="tienda-audit-to">Hasta</label>
            <input id="tienda-audit-to" type="date" value={toIso} onChange={(e) => setToIso(e.target.value)} />
          </div>
        </div>
        {byActionChips.length > 0 ? (
          <div className="tienda-audit__legend">
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

      <div className="tienda-audit__body">
        {loading ? (
          <div className="tienda-audit__loading">
            <div className="spinner-border spinner-border-sm" role="status" aria-label="Espere un momento" />
          </div>
        ) : error ? (
          <div className="tienda-audit__empty">
            <i className="bi bi-exclamation-triangle text-warning" />
            <p className="mb-2">No se pudo cargar la auditoría.</p>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="tienda-audit__empty">
            <i className="bi bi-inbox" />
            <p className="mb-0">Sin registros con los filtros actuales.</p>
          </div>
        ) : (
          <table className="tienda-audit__table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>ID usuario</th>
                <th>Correo</th>
                <th>Usuario (BD)</th>
                <th>Movimiento</th>
                <th>Código</th>
                <th>ID equipo</th>
                <th>Resumen</th>
                <th>Impacto contable / operativo</th>
                <th>Detalle técnico</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td className="tienda-audit__mono text-nowrap">{new Date(row.created_at).toLocaleString("es-AR")}</td>
                  <td className="tienda-audit__mono">{row.user_id}</td>
                  <td>
                    <span className="tienda-audit__email">{row.user_email}</span>
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
                  <td className="small">
                    {row.details_json ? (
                      <details className="tienda-audit__json">
                        <summary>JSON completo</summary>
                        <pre>
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(row.details_json), null, 2);
                            } catch {
                              return row.details_json;
                            }
                          })()}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && total > 0 ? (
        <div className="tienda-audit__footer">
          <div className="d-flex align-items-center gap-2 flex-wrap">
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
            <span className="small text-muted px-1">
              Página {page} / {totalPages}
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
  );
}
