import { useCallback, useEffect, useMemo, useState } from "react";
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

const PAGE_SIZE = 150;

export function MarketplacePresenceHistorialPage() {
  const { user } = useAuth();
  const canView = Boolean(user && canViewMarketplaceQuoteTickets(user.role));
  const [rows, setRows] = useState<MarketplacePresenceHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await getMarketplacePresenceHistory({
        limit: PAGE_SIZE,
        offset: 0,
        ...(qDebounced ? { q: qDebounced } : {}),
      });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qDebounced]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setErr(null);
    try {
      const r = await getMarketplacePresenceHistory({
        limit: PAGE_SIZE,
        offset: rows.length,
        ...(qDebounced ? { q: qDebounced } : {}),
      });
      setRows((prev) => [...prev, ...r.rows]);
      setTotal(r.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [qDebounced, rows.length]);

  useEffect(() => {
    if (!canView) return;
    void loadInitial();
  }, [canView, loadInitial]);

  const hasMore = useMemo(() => rows.length < total, [rows.length, total]);

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="fact-page hrs-mplive-page">
      <div className="container">
        <PageHeader
          title="Historial detalle — Presencia marketplace"
          logoHref="/"
          showBackButton
          backTo="/marketplace-presencia"
          backText="Volver al monitor"
        />

        <section className="hrs-mplive-panel">
          <p className="hrs-mplive-intro mb-3">
            Registro persistido de navegación en marketplace (invitados, clientes y staff). Se actualiza con cada
            heartbeat (~30 s) y cuando cambia ruta, país o sesión.
          </p>

          <div className="row g-2 align-items-end mb-3">
            <div className="col-md-6 col-lg-5">
              <label className="form-label small fw-bold text-white mb-1">Buscar</label>
              <input
                className="form-control form-control-sm"
                placeholder="Visitor ID, email, ruta, IP o país…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                aria-label="Filtrar historial"
              />
            </div>
            <div className="col-md-auto">
              <span className="small text-white-50">
                {loading ? "Cargando…" : `${rows.length} de ${total} filas`}
              </span>
            </div>
          </div>

          {err ? <div className="alert alert-danger py-2">{err}</div> : null}

          <div className="table-responsive rounded bg-white p-1">
            <table className="table table-sm align-middle mb-0 hrs-mplive-table">
              <thead>
                <tr>
                  <th>Fecha / hora</th>
                  <th>Tipo</th>
                  <th>Ruta</th>
                  <th>País</th>
                  <th>IP</th>
                  <th>Email</th>
                  <th>Locale / TZ</th>
                  <th>Visitor</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="hrs-mplive-empty text-center py-4">
                      Cargando historial…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="hrs-mplive-empty text-center py-4">
                      Sin registros todavía o ningún resultado para el filtro.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatWhen(r.recordedAt)}</td>
                      <td>{viewerTypeLabel(r.viewerType)}</td>
                      <td>
                        <code className="small">{r.currentPath || "—"}</code>
                      </td>
                      <td>
                        {r.countryName}
                        <span className="text-muted small"> ({r.countryCode})</span>
                      </td>
                      <td>
                        <code className="small">{r.clientIp || "—"}</code>
                      </td>
                      <td>
                        <code className="small">{r.userEmail || "—"}</code>
                      </td>
                      <td className="small text-muted">
                        {r.locale || "—"}
                        <br />
                        {r.timezone || "—"}
                      </td>
                      <td>
                        <code className="small" title={r.visitorId}>
                          {r.visitorId.length > 18 ? `${r.visitorId.slice(0, 18)}…` : r.visitorId}
                        </code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMore && rows.length > 0 ? (
            <div className="mt-3 text-center">
              <button
                type="button"
                className="btn btn-light btn-sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
