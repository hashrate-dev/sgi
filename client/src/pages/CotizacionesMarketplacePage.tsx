import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  deleteMarketplaceQuoteTicketAdmin,
  getMarketplaceQuoteTickets,
  getMarketplaceQuoteTicketsStats,
  getMarketplaceSetupQuotePrices,
  patchMarketplaceQuoteTicket,
  type MarketplaceQuoteTicket,
} from "../lib/api.js";
import { canViewMarketplaceQuoteTickets } from "../lib/auth.js";
import {
  ticketRowLineSubtotalUsd,
  ticketRowIsEquipmentPricePending,
  ticketRowSharePct,
  QUOTE_ADDON_WARRANTY_USD,
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  marketplaceQuoteTicketLineDisplayName,
} from "../lib/marketplaceQuoteCart.js";
import { useAuth } from "../contexts/AuthContext.js";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/facturacion.css";
import "../styles/hrs-cotizaciones-marketplace.css";

const STATUS_OPTS = [
  { value: "all", label: "Todos" },
  { value: "borrador", label: "Borrador" },
  { value: "enviado_consulta", label: "Consulta enviada" },
  { value: "en_gestion", label: "En gestión" },
  { value: "respondido", label: "Respondido" },
  { value: "cerrado", label: "Cerrado" },
  { value: "descartado", label: "Descartado" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  enviado_consulta: "Consulta enviada",
  en_gestion: "En gestión",
  respondido: "Respondido",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

function badgeClass(status: string): string {
  const k = status.replace(/[^a-z_]/gi, "_");
  return `hrs-mqt-badge hrs-mqt-badge--${k}`;
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function CotizacionesMarketplacePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; total: number; todayCount: number } | null>(null);
  const [tickets, setTickets] = useState<MarketplaceQuoteTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [selected, setSelected] = useState<MarketplaceQuoteTicket | null>(null);
  const [saving, setSaving] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [deleteModalTicket, setDeleteModalTicket] = useState<MarketplaceQuoteTicket | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMarketplaceSetupQuotePrices()
      .then((r) => {
        if (cancelled) return;
        const a = Number(r.setupEquipoCompletoUsd);
        const b = Number(r.setupCompraHashrateUsd);
        if (Number.isFinite(a) && a >= 0) setSetupEquipoCompletoUsd(Math.round(a));
        if (Number.isFinite(b) && b >= 0) setSetupCompraHashrateUsd(Math.round(b));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [st, list] = await Promise.all([
        getMarketplaceQuoteTicketsStats(),
        getMarketplaceQuoteTickets({
          status: statusFilter === "all" ? undefined : statusFilter,
          q: qDebounced || undefined,
          limit: 100,
          offset: 0,
        }),
      ]);
      setStats(st);
      setTickets(list.tickets);
      setTotal(list.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, qDebounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setEditStatus(selected.status);
      setEditNotes(selected.notesAdmin ?? "");
    }
  }, [selected]);

  const pendingContact = useMemo(() => {
    if (!stats?.byStatus) return 0;
    return (stats.byStatus["enviado_consulta"] ?? 0) + (stats.byStatus["en_gestion"] ?? 0);
  }, [stats]);

  if (!user || !canViewMarketplaceQuoteTickets(user.role)) {
    return <Navigate to="/" replace />;
  }

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { ticket } = await patchMarketplaceQuoteTicket(selected.id, {
        status: editStatus,
        notesAdmin: editNotes || null,
      });
      setSelected(ticket);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const orderLabel = (t: MarketplaceQuoteTicket) => t.orderNumber ?? `Ticket #${t.id}`;

  const executeDeleteFromSystem = async () => {
    if (!deleteModalTicket) return;
    const id = deleteModalTicket.id;
    const label = orderLabel(deleteModalTicket);
    setDeleteBusy(true);
    try {
      await deleteMarketplaceQuoteTicketAdmin(id);
      setDeleteModalTicket(null);
      if (selected?.id === id) setSelected(null);
      showToast(`Orden ${label} eliminada del sistema.`, "success", "Cotizaciones tienda");
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo eliminar.", "error", "Cotizaciones tienda");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="fact-page hrs-mqt-page">
      <div className="container">
        <PageHeader
          title="Centro de Ordenes - Tienda Online"
          logoHref="/"
          rightContent={
            <Link to="/configuracion" className="fact-back">
              <i className="bi bi-gear me-1" aria-hidden />
              Configuración
            </Link>
          }
        />

        <div className="hrs-mqt-panel">
          <p className="text-muted small mb-3">
            Monitoreo de listas de cotización ASIC: orden, ticket, ítems y totales referenciales. Solo AdministradorA y
            AdministradorB.
          </p>
          {err ? <div className="hrs-mqt-err">{err}</div> : null}

          {stats ? (
            <div className="hrs-mqt-stats">
              <div className="hrs-mqt-stat hrs-mqt-stat--accent">
                <div className="hrs-mqt-stat__val">{stats.total}</div>
                <div className="hrs-mqt-stat__lbl">Tickets totales</div>
              </div>
              <div className="hrs-mqt-stat">
                <div className="hrs-mqt-stat__val">{stats.todayCount}</div>
                <div className="hrs-mqt-stat__lbl">Creados hoy</div>
              </div>
              <div className="hrs-mqt-stat">
                <div className="hrs-mqt-stat__val">{stats.byStatus["enviado_consulta"] ?? 0}</div>
                <div className="hrs-mqt-stat__lbl">Consultas enviadas</div>
              </div>
              <div className="hrs-mqt-stat">
                <div className="hrs-mqt-stat__val">{pendingContact}</div>
                <div className="hrs-mqt-stat__lbl">Pipeline activo</div>
              </div>
            </div>
          ) : null}

          <div className="hrs-mqt-toolbar">
            <div className="hrs-mqt-search">
              <input
                type="search"
                placeholder="Buscar por orden, ticket o modelo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar tickets"
              />
            </div>
            <div className="hrs-mqt-filters">
              {STATUS_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`hrs-mqt-chip${statusFilter === o.value ? " hrs-mqt-chip--active" : ""}`}
                  onClick={() => setStatusFilter(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hrs-mqt-orders-region" aria-label="Listado de órdenes">
            {loading ? (
              <div className="d-flex justify-content-center py-5">
                <div className="spinner-border text-secondary" role="status" aria-label="Espere un momento" />
              </div>
            ) : null}

            {!loading && tickets.length === 0 ? (
              <p className="hrs-mqt-msg">
                No hay tickets con estos filtros. {total === 0 ? "Cuando los clientes armen listas en /marketplace, aparecerán acá." : ""}
              </p>
            ) : null}

            {!loading && tickets.length > 0 ? (
              <div className="hrs-mqt-ticket-grid">
                {tickets.map((t) => (
                  <button key={t.id} type="button" className="hrs-mqt-ticket-card" onClick={() => setSelected(t)}>
                    <div className="hrs-mqt-ticket-card__top">
                      <div>
                        <div className="hrs-mqt-ticket-card__ord">{t.orderNumber ?? `— (#${t.id})`}</div>
                        <div className="hrs-mqt-ticket-card__tkt">{t.ticketCode}</div>
                      </div>
                      <span className={badgeClass(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</span>
                    </div>
                    <div className="hrs-mqt-ticket-card__row">
                      <span>
                        {t.lineCount} líneas · {t.unitCount} u.
                      </span>
                      <span className="hrs-mqt-ticket-card__total">{t.subtotalUsd.toLocaleString("es-PY")} USD</span>
                    </div>
                    <div className="hrs-mqt-ticket-card__meta">
                      {t.contactEmail ? <span className="d-block text-truncate mb-1">{t.contactEmail}</span> : null}
                      Actualizado {formatWhen(t.updatedAt)}
                      {t.lastContactChannel ? ` · vía ${t.lastContactChannel}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selected ? (
        <div
          className="hrs-mqt-drawer-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside className="hrs-mqt-drawer" role="dialog" aria-modal="true" aria-labelledby="hrs-mqt-drawer-title">
            <div className="hrs-mqt-drawer__head">
              <div>
                <h2 id="hrs-mqt-drawer-title">{selected.orderNumber ?? `Ticket #${selected.id}`}</h2>
                <div className="hrs-mqt-drawer__sub">
                  {selected.ticketCode} · {STATUS_LABEL[selected.status] ?? selected.status}
                </div>
              </div>
              <button type="button" className="hrs-mqt-drawer__close" onClick={() => setSelected(null)} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="hrs-mqt-drawer__body">
              <dl className="hrs-mqt-timeline">
                <dt>Creado</dt>
                <dd>{formatWhen(selected.createdAt)}</dd>
                <dt>Última actualización</dt>
                <dd>{formatWhen(selected.updatedAt)}</dd>
                <dt>Canal de contacto</dt>
                <dd>{selected.lastContactChannel ?? "—"}</dd>
                <dt>Contacto registrado</dt>
                <dd>{selected.contactedAt ? formatWhen(selected.contactedAt) : "—"}</dd>
                <dt>IP (última sync)</dt>
                <dd>{selected.ipAddress ?? "—"}</dd>
                <dt>Cliente (correo)</dt>
                <dd>{selected.contactEmail ?? "—"}</dd>
                <dt>ID usuario</dt>
                <dd>{selected.userId != null ? selected.userId : "—"}</dd>
                <dt>Clave sesión</dt>
                <dd style={{ wordBreak: "break-all", fontSize: "0.7rem" }}>{selected.sessionId}</dd>
              </dl>

              <table className="hrs-mqt-items">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Cant.</th>
                    <th>P. unit.</th>
                    <th>Subt.</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items as Array<Record<string, unknown>>).map((row, i) => {
                    const qty = Number(row.qty) || 0;
                    const pu = Number(row.priceUsd) || 0;
                    const inclSetup = row.includeSetup === true;
                    const inclGar = row.includeWarranty === true;
                    const sharePct = ticketRowSharePct(row);
                    const shareMult = sharePct / 100;
                    const warrantyUnit = Math.round(QUOTE_ADDON_WARRANTY_USD * shareMult);
                    const setupLbl = sharePct < 100 ? setupCompraHashrateUsd : setupEquipoCompletoUsd;
                    const linePending = ticketRowIsEquipmentPricePending(row);
                    const sub = ticketRowLineSubtotalUsd(row, {
                      setupEquipoCompletoUsd,
                      setupCompraHashrateUsd,
                    });
                    const name = marketplaceQuoteTicketLineDisplayName(row);
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{name}</div>
                          {inclSetup || inclGar ? (
                            <div
                              style={{
                                fontSize: "0.68rem",
                                color: linePending ? "#b91c1c" : "#0d6efd",
                                marginTop: "0.35rem",
                              }}
                            >
                              {inclSetup
                                ? linePending
                                  ? "+ Setup: solicitar valor / u."
                                  : `+ Setup ${setupLbl} USD/u`
                                : null}
                              {inclSetup && inclGar ? " · " : null}
                              {inclGar
                                ? linePending
                                  ? "Garantía: solicitar valor / u."
                                  : `Garantía ${warrantyUnit} USD/u`
                                : null}
                            </div>
                          ) : null}
                        </td>
                        <td>{qty}</td>
                        <td>{String(row.priceLabel ?? pu)}</td>
                        <td style={{ fontWeight: 700 }}>
                          {linePending ? "Cotización pendiente" : `${sub.toLocaleString("es-PY")} USD`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="hrs-mqt-total-line">Precio Total: {selected.subtotalUsd.toLocaleString("es-PY")} USD</div>

              <div className="hrs-mqt-admin-form">
                <label htmlFor="hrs-mqt-status">Estado del ticket</label>
                <select id="hrs-mqt-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {STATUS_OPTS.filter((o) => o.value !== "all").map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="hrs-mqt-notes">Notas internas (solo staff)</label>
                <textarea
                  id="hrs-mqt-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Seguimiento comercial, llamadas, etc."
                />
                <button type="button" className="hrs-mqt-btn-save" disabled={saving} onClick={() => void saveDetail()}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>

              <div className="hrs-mqt-drawer__danger-zone">
                <p className="hrs-mqt-drawer__danger-label">Zona de administración</p>
                <button
                  type="button"
                  className="hrs-mqt-btn-delete-order"
                  disabled={deleteBusy}
                  onClick={() => setDeleteModalTicket(selected)}
                >
                  <i className="bi bi-trash3 me-2" aria-hidden />
                  Eliminar orden del sistema
                </button>
                <p className="hrs-mqt-drawer__danger-hint">
                  Borra el registro por completo. El cliente ya no lo verá en «Mis órdenes». No se puede deshacer.
                </p>
              </div>

              {selected.userAgent ? (
                <p style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "1rem", wordBreak: "break-word" }}>
                  UA: {selected.userAgent}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteModalTicket !== null}
        elevated
        variant="delete"
        title="Eliminar orden del sistema"
        message={
          deleteModalTicket ? (
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
              ¿Eliminar definitivamente la orden{" "}
              <strong>{orderLabel(deleteModalTicket)}</strong> ({deleteModalTicket.ticketCode})? Esta acción no se puede deshacer.
            </p>
          ) : null
        }
        warningText="Se borrará el ticket de la base de datos, incluido el historial visible para el cliente."
        cancelLabel="Cancelar"
        confirmLabel="Eliminar"
        confirmPending={deleteBusy}
        confirmPendingLabel="Eliminando…"
        onCancel={() => {
          if (!deleteBusy) setDeleteModalTicket(null);
        }}
        onConfirm={() => void executeDeleteFromSystem()}
      />
    </div>
  );
}
