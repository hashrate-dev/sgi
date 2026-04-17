import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  deleteMarketplaceQuoteTicketAdmin,
  getMarketplaceGarantiaQuotePrices,
  getMarketplaceQuoteTickets,
  getMarketplaceQuoteTicket,
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
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  marketplaceQuoteTicketLineDisplayName,
} from "../lib/marketplaceQuoteCart.js";
import { resolveWarrantyUsdForQuoteLine, type GarantiaQuotePriceItem } from "../lib/marketplaceGarantiaQuote.js";
import { useAuth } from "../contexts/AuthContext.js";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/facturacion.css";
import "../styles/hrs-cotizaciones-marketplace.css";

const STATUS_OPTS = [
  { value: "all", label: "Todos" },
  { value: "borrador", label: "Carrito abierto" },
  { value: "enviado_consulta", label: "Pendiente" },
  { value: "en_contacto_equipo", label: "Contacto por equipo" },
  { value: "en_gestion", label: "En gestión" },
  { value: "pagada", label: "Pagada" },
  { value: "en_viaje", label: "En viaje" },
  { value: "instalado", label: "Instalado" },
  { value: "cerrado", label: "Cerrado" },
  { value: "descartado", label: "Eliminada" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  borrador: "ABIERTO",
  enviado_consulta: "Pendiente",
  en_contacto_equipo: "EN CONTACTO",
  en_gestion: "En gestión",
  pagada: "Pagada",
  en_viaje: "En viaje",
  instalado: "Instalado",
  respondido: "Respondido (legado)",
  cerrado: "Cerrado",
  descartado: "Eliminada",
};

/** Pasos del embudo post «generar orden» (misma semántica que el servidor). */
const OPERATION_FLOW: readonly { key: string; label: string }[] = [
  { key: "borrador", label: "ABIERTO" },
  { key: "enviado_consulta", label: "Pendiente" },
  { key: "en_contacto_equipo", label: "Contacto por equipo" },
  { key: "en_gestion", label: "En gestión" },
  { key: "pagada", label: "Pagada" },
  { key: "en_viaje", label: "En viaje" },
  { key: "instalado", label: "Instalado" },
  { key: "cerrado", label: "CERRADO" },
  { key: "descartado", label: "ELIMINADO" },
] as const;

function isMarketplaceTicketCerradoLaneStatus(status: string): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  return st === "cerrado" || st === "descartado";
}

/** Orden dentro del carril «Pendiente» amplio: carrito abierto → pendiente inicial → embudo → instalado. */
function statusActivoLaneOrder(status: string): number {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "borrador") return 5;
  if (st === "enviado_consulta") return 10;
  if (st === "respondido") return 15;
  const order: Record<string, number> = {
    en_contacto_equipo: 20,
    en_gestion: 30,
    pagada: 40,
    en_viaje: 50,
    instalado: 60,
  };
  return order[st] ?? 80;
}

function MqtOperationalFlowStrip({ status }: { status: string }) {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "borrador") {
    return (
      <div className="hrs-mqt-flow-strip hrs-mqt-flow-strip--note hrs-mqt-flow-strip--note-cart mb-0" role="note">
        <span className="hrs-mqt-flow-strip__note-icon" aria-hidden>
          i
        </span>
        <div className="hrs-mqt-flow-strip__note-copy">
          <p className="hrs-mqt-flow-strip__note-title mb-1">Carrito abierto</p>
          <p className="hrs-mqt-flow-strip__note-text mb-0">
            Hay productos guardados, pero la orden de compra todavía no fue generada. El embudo comercial comienza
            cuando se confirma la orden.
          </p>
        </div>
      </div>
    );
  }
  const flowIdx = (() => {
    if (st === "respondido") return 1;
    const i = OPERATION_FLOW.findIndex((s) => s.key === st);
    return i >= 0 ? i : 0;
  })();
  return (
    <div className="hrs-mqt-flow-strip" aria-label="Embudo operativo de la orden">
      <p className="hrs-mqt-flow-strip__title">Embudo operativo</p>
      <div className="hrs-mqt-flow-strip__track">
        {OPERATION_FLOW.map((step, i) => (
          <div
            key={step.key}
            className={
              "hrs-mqt-flow-strip__step" +
              (i === flowIdx ? " hrs-mqt-flow-strip__step--current" : "") +
              (i < flowIdx ? " hrs-mqt-flow-strip__step--done" : "")
            }
          >
            <span className="hrs-mqt-flow-strip__dot" aria-hidden>
              {i < flowIdx ? "✓" : i + 1}
            </span>
            <span className="hrs-mqt-flow-strip__lbl">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NEW_TICKET_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

type MqtLaneHelpId = "general" | "pendiente" | "cerrados";

const MQT_LANE_HELP_TITLE: Record<MqtLaneHelpId, string> = {
  general: "Qué es este panel",
  pendiente: "Carril Pendiente y embudo operativo",
  cerrados: "Carril Cerrados",
};

function MqtLaneHelpModalBody({ id }: { id: MqtLaneHelpId }): ReactNode {
  switch (id) {
    case "general":
      return (
        <>
          <p className="mb-0">
            Monitoreo de listas de cotización ASIC: orden, ticket, ítems y totales referenciales. Solo cuentas{" "}
            <strong>AdministradorA</strong> y <strong>AdministradorB</strong>.
          </p>
        </>
      );
    case "pendiente":
      return (
        <>
          <p>
            Este carril reúne todo lo <strong>activo</strong> antes de cierres definitivos:{" "}
            <strong>carritos abiertos</strong> (productos en carrito sin orden generada) y órdenes ya generadas hasta
            instalación.
          </p>
          <p className="mb-2">
            <strong>Carrito abierto</strong> (estado técnico «borrador»): el cliente cargó equipos en el carrito de la
            tienda y aún <strong>no confirmó la orden de compra</strong>. En el panel se muestra la etiqueta{" "}
            <strong>ABIERTO</strong>.
          </p>
          <p className="mb-1">
            <strong>Pendiente</strong> (primer paso tras generar la orden): ventas inicia el seguimiento (teléfono,
            WhatsApp, correo, etc.).
          </p>
          <p className="mb-1">
            <strong>Embudo operativo</strong> (siguientes etapas, en orden típico):
          </p>
          <ul className="hrs-mqt-help-list">
            <li>
              <strong>Contacto por equipo</strong>: el equipo ya está gestionando la orden con el cliente.
            </li>
            <li>
              <strong>En gestión</strong>: la venta está <strong>casi cerrada</strong> (negociación avanzada).
            </li>
            <li>
              <strong>Pagada</strong>: el cliente pagó; la operación quedó concretada a nivel comercial.
            </li>
            <li>
              <strong>En viaje</strong>: equipos en tránsito (p. ej. desde China hacia destino).
            </li>
            <li>
              <strong>Instalado</strong>: equipos operando en la granja del cliente.
            </li>
          </ul>
          <p className="mb-0 small text-muted">
            Las transiciones de estado las controla el servidor; en el detalle de cada orden ves el embudo visual y las
            notas internas.
          </p>
        </>
      );
    case "cerrados":
      return (
        <>
          <p>
            <strong>Cerrada</strong>: se archivó la operación <strong>sin completar</strong> el embudo hasta instalado
            (cierre comercial u operativo sin entrega final en granja).
          </p>
          <p className="mb-0">
            <strong>Eliminada</strong> (descartada): cancelación por el cliente o por staff desde el flujo; el registro
            puede seguir visible acá para auditoría (quién dio de baja se ve en el detalle de la orden).
          </p>
        </>
      );
    default:
      return null;
  }
}

function MqtLaneTitleWithHelp({
  title,
  titleId,
  helpId,
  onOpenHelp,
}: {
  title: string;
  titleId: string;
  helpId: "pendiente" | "cerrados";
  onOpenHelp: (id: MqtLaneHelpId) => void;
}) {
  return (
    <div className="hrs-mqt-lane__head-row">
      <h3 id={titleId} className="hrs-mqt-lane__title">
        {title}
      </h3>
      <button
        type="button"
        className="hrs-mqt-help-trigger"
        aria-label={`Ayuda: qué órdenes van en el carril ${title}`}
        onClick={() => onOpenHelp(helpId)}
      >
        <i className="bi bi-eye" aria-hidden />
      </button>
    </div>
  );
}

function badgeClass(status: string): string {
  const k = status.replace(/[^a-z_]/gi, "_");
  return `hrs-mqt-badge hrs-mqt-badge--${k}`;
}

/** Consulta reactivada tras eliminación: badge distinto (verde más oscuro). */
function pipelinePrimaryBadge(t: MarketplaceQuoteTicket): { label: string; className: string } {
  if (t.status === "borrador") {
    return { label: STATUS_LABEL.borrador, className: "hrs-mqt-badge hrs-mqt-badge--carrito_abierto" };
  }
  if (t.status === "enviado_consulta" && t.reactivatedAt) {
    return { label: "RE-ACTIVO", className: "hrs-mqt-badge hrs-mqt-badge--re_activo" };
  }
  return { label: STATUS_LABEL[t.status] ?? t.status, className: badgeClass(t.status) };
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

function isNewTicketBadgeVisible(t: MarketplaceQuoteTicket): boolean {
  if (t.status === "cerrado" || t.status === "descartado" || t.status === "instalado") return false;
  const createdAtMs = Date.parse(t.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs <= NEW_TICKET_MAX_AGE_MS;
}

function MqtTicketCardButton({ t, onOpen }: { t: MarketplaceQuoteTicket; onOpen: (x: MarketplaceQuoteTicket) => void }) {
  const primaryBadge = pipelinePrimaryBadge(t);
  return (
    <button type="button" className="hrs-mqt-ticket-card" onClick={() => onOpen(t)}>
      <div className="hrs-mqt-ticket-card__top">
        <div>
          <div className="hrs-mqt-ticket-card__ord">{t.orderNumber ?? `— (#${t.id})`}</div>
          <div className="hrs-mqt-ticket-card__tkt">{t.ticketCode}</div>
        </div>
        <div className="hrs-mqt-ticket-card__badges">
          <span className={primaryBadge.className}>{primaryBadge.label}</span>
          {isNewTicketBadgeVisible(t) ? (
            <span className="hrs-mqt-badge hrs-mqt-badge--nuevo">
              <i className="bi bi-bell-fill" aria-hidden />
              Nuevo
            </span>
          ) : null}
        </div>
      </div>
      <div className="hrs-mqt-ticket-card__row">
        <span>
          {t.lineCount === 1 ? "1 línea" : `${t.lineCount} líneas`} · {t.unitCount} u.
        </span>
        <span className="hrs-mqt-ticket-card__total">{t.subtotalUsd.toLocaleString("es-PY")} USD</span>
      </div>
      <div className="hrs-mqt-ticket-card__meta">
        {t.contactEmail ? (
          <span className="d-block text-truncate mb-1 hrs-mqt-ticket-card__email">{t.contactEmail}</span>
        ) : null}
        Actualizado {formatWhen(t.updatedAt)}
        {t.lastContactChannel ? ` · vía ${t.lastContactChannel}` : ""}
      </div>
    </button>
  );
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
  /** Mientras el detalle GET no devuelve líneas: evita tabla vacía (solo thead). */
  const [drawerDetailLoading, setDrawerDetailLoading] = useState(false);
  const drawerFetchGenRef = useRef(0);
  const [saving, setSaving] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [garantiaQuoteItems, setGarantiaQuoteItems] = useState<GarantiaQuotePriceItem[]>([]);
  const [deleteModalTicket, setDeleteModalTicket] = useState<MarketplaceQuoteTicket | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [laneHelpOpen, setLaneHelpOpen] = useState<MqtLaneHelpId | null>(null);

  useEffect(() => {
    if (!laneHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaneHelpOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laneHelpOpen]);

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
    let cancelled = false;
    void getMarketplaceGarantiaQuotePrices()
      .then((r) => {
        if (cancelled) return;
        const items = Array.isArray(r.items) ? r.items : [];
        setGarantiaQuoteItems(
          items.filter(
            (x) =>
              x &&
              typeof x.codigo === "string" &&
              typeof x.marca === "string" &&
              typeof x.modelo === "string" &&
              Number.isFinite(Number(x.precioGarantia)) &&
              Number(x.precioGarantia) >= 0
          ) as GarantiaQuotePriceItem[]
        );
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

  const closeTicketDrawer = useCallback(() => {
    drawerFetchGenRef.current += 1;
    setDrawerDetailLoading(false);
    setSelected(null);
  }, []);

  const openTicketDrawer = useCallback((t: MarketplaceQuoteTicket) => {
    const gen = ++drawerFetchGenRef.current;
    setSelected(t);
    const hasRows = Array.isArray(t.items) && t.items.length > 0;
    setDrawerDetailLoading(!hasRows);
    void getMarketplaceQuoteTicket(t.id)
      .then(({ ticket }) => {
        if (drawerFetchGenRef.current !== gen) return;
        setSelected(ticket);
      })
      .catch(() => {
        /* se mantiene el snapshot del listado */
      })
      .finally(() => {
        if (drawerFetchGenRef.current !== gen) return;
        setDrawerDetailLoading(false);
      });
  }, []);

  /** Órdenes en embudo después de «Pendiente»: contacto, gestión, pago y envío. */
  const embudoActivoCount = useMemo(() => {
    if (!stats?.byStatus) return 0;
    const keys = ["en_contacto_equipo", "en_gestion", "pagada", "en_viaje"] as const;
    return keys.reduce((a, k) => a + (Number(stats.byStatus[k]) || 0), 0);
  }, [stats]);

  /**
   * Con filtro «Todos»: dos carriles — Pendiente (carrito abierto + operativo) | Cerrados.
   * Incluye `borrador` (carrito con productos, sin orden generada) y el resto salvo cerrada/eliminada.
   */
  const lanesWhenAll = useMemo(() => {
    if (statusFilter !== "all") return null;
    const activos = tickets
      .filter((x) => !isMarketplaceTicketCerradoLaneStatus(x.status))
      .slice()
      .sort((a, b) => {
        const oa = statusActivoLaneOrder(a.status);
        const ob = statusActivoLaneOrder(b.status);
        if (oa !== ob) return oa - ob;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    const cerrados = tickets
      .filter((x) => isMarketplaceTicketCerradoLaneStatus(x.status))
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { activos, cerrados };
  }, [tickets, statusFilter]);

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
      setDrawerDetailLoading(false);
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
      if (selected?.id === id) closeTicketDrawer();
      showToast(`Orden ${label} eliminada del sistema.`, "success", "Cotizaciones tienda");
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo eliminar.", "error", "Cotizaciones tienda");
    } finally {
      setDeleteBusy(false);
    }
  };
  const selectedPrimaryBadge = selected ? pipelinePrimaryBadge(selected) : null;

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
          <div className="hrs-mqt-panel-lede-row mb-3">
            <p className="text-muted small mb-0 flex-grow-1" style={{ minWidth: "12rem" }}>
              Listas de cotización ASIC: orden, ticket, ítems y totales referenciales. Acceso{" "}
              <strong>AdministradorA</strong> / <strong>AdministradorB</strong>. Las definiciones del proceso están en el
              ícono de ojo del encabezado y de cada carril (Pendiente / Cerrados).
            </p>
            <button
              type="button"
              className="hrs-mqt-help-trigger hrs-mqt-help-trigger--panel"
              aria-label="Qué es este panel (resumen)"
              onClick={() => setLaneHelpOpen("general")}
            >
              <i className="bi bi-eye" aria-hidden />
            </button>
          </div>
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
                <div className="hrs-mqt-stat__lbl">Pendientes (orden generada)</div>
              </div>
              <div className="hrs-mqt-stat">
                <div className="hrs-mqt-stat__val">{embudoActivoCount}</div>
                <div className="hrs-mqt-stat__lbl">Embudo activo (post pendiente)</div>
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
                No hay tickets con estos filtros.{" "}
                {total === 0 ? "Cuando los clientes armen listas en /marketplace, aparecerán acá." : ""}
              </p>
            ) : null}

            {!loading && tickets.length > 0 && lanesWhenAll ? (
              <div className="hrs-mqt-lanes">
                <section className="hrs-mqt-lane hrs-mqt-lane--pendiente" aria-labelledby="hrs-mqt-lane-pend-title">
                  <MqtLaneTitleWithHelp
                    title="Pendiente"
                    titleId="hrs-mqt-lane-pend-title"
                    helpId="pendiente"
                    onOpenHelp={setLaneHelpOpen}
                  />
                  {lanesWhenAll.activos.length === 0 ? (
                    <p className="hrs-mqt-lane__empty">Ninguna orden en este carril con la búsqueda actual.</p>
                  ) : (
                    <div className="hrs-mqt-ticket-grid">
                      {lanesWhenAll.activos.map((t) => (
                        <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} />
                      ))}
                    </div>
                  )}
                </section>
                <section className="hrs-mqt-lane hrs-mqt-lane--cerrados" aria-labelledby="hrs-mqt-lane-cerr-title">
                  <MqtLaneTitleWithHelp
                    title="Cerrados"
                    titleId="hrs-mqt-lane-cerr-title"
                    helpId="cerrados"
                    onOpenHelp={setLaneHelpOpen}
                  />
                  {lanesWhenAll.cerrados.length === 0 ? (
                    <p className="hrs-mqt-lane__empty">Ninguna orden cerrada o eliminada con la búsqueda actual.</p>
                  ) : (
                    <div className="hrs-mqt-ticket-grid">
                      {lanesWhenAll.cerrados.map((t) => (
                        <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {!loading && tickets.length > 0 && !lanesWhenAll ? (
              <div className="hrs-mqt-ticket-grid">
                {tickets.map((t) => (
                  <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {laneHelpOpen ? (
        <div
          className="hrs-mqt-help-overlay"
          role="presentation"
          onClick={() => setLaneHelpOpen(null)}
        >
          <div
            className="hrs-mqt-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hrs-mqt-help-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="hrs-mqt-help-dialog__head">
              <h2 id="hrs-mqt-help-dialog-title">{MQT_LANE_HELP_TITLE[laneHelpOpen]}</h2>
              <button
                type="button"
                className="hrs-mqt-help-dialog__close"
                aria-label="Cerrar ayuda"
                onClick={() => setLaneHelpOpen(null)}
              >
                ×
              </button>
            </header>
            <div className="hrs-mqt-help-dialog__body">
              <MqtLaneHelpModalBody id={laneHelpOpen} />
            </div>
            <footer className="hrs-mqt-help-dialog__footer">
              <button type="button" className="btn btn-sm btn-dark" onClick={() => setLaneHelpOpen(null)}>
                Entendido
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div
          className="hrs-mqt-drawer-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeTicketDrawer();
          }}
        >
          <aside className="hrs-mqt-drawer" role="dialog" aria-modal="true" aria-labelledby="hrs-mqt-drawer-title">
            <div className="hrs-mqt-drawer__head">
              <div className="hrs-mqt-drawer__head-main">
                <p className="hrs-mqt-drawer__eyebrow mb-1">Orden de carrito</p>
                <h2 id="hrs-mqt-drawer-title">{selected.orderNumber ?? `Ticket #${selected.id}`}</h2>
                <div className="hrs-mqt-drawer__sub">
                  <span className="hrs-mqt-drawer__code">TX: {selected.ticketCode}</span>
                  {selectedPrimaryBadge ? <span className="hrs-mqt-drawer__status-chip">{selectedPrimaryBadge.label}</span> : null}
                </div>
              </div>
              <button type="button" className="hrs-mqt-drawer__close" onClick={closeTicketDrawer} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="hrs-mqt-drawer__body">
              <section className="hrs-mqt-meta-card" aria-label="Resumen del ticket">
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Creado</span>
                  <span className="hrs-mqt-meta-card__value">{formatWhen(selected.createdAt)}</span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Última actualización</span>
                  <span className="hrs-mqt-meta-card__value">{formatWhen(selected.updatedAt)}</span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Canal de contacto</span>
                  <span className="hrs-mqt-meta-card__value">{selected.lastContactChannel ?? "—"}</span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Contacto registrado</span>
                  <span className="hrs-mqt-meta-card__value">{selected.contactedAt ? formatWhen(selected.contactedAt) : "—"}</span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">IP (última sync)</span>
                  <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">{selected.ipAddress ?? "—"}</span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Cliente (correo)</span>
                  <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">{selected.contactEmail ?? "—"}</span>
                </div>
                {selected.status === "descartado" ? (
                  <div className="hrs-mqt-meta-card__row">
                    <span className="hrs-mqt-meta-card__label">Eliminación registrada por</span>
                    <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">
                      {selected.discardByEmail ?? "— (sin registro previo a esta función)"}
                    </span>
                  </div>
                ) : null}
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">ID usuario</span>
                  <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">
                    {selected.userId != null ? selected.userId : "—"}
                  </span>
                </div>
                <div className="hrs-mqt-meta-card__row">
                  <span className="hrs-mqt-meta-card__label">Clave sesión</span>
                  <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono hrs-mqt-meta-card__value--break">
                    {selected.sessionId}
                  </span>
                </div>
              </section>

              <MqtOperationalFlowStrip status={selected.status} />

              {drawerDetailLoading ? (
                <div className="hrs-mqt-items-loading d-flex justify-content-center py-4" role="status" aria-busy="true">
                  <div className="spinner-border text-secondary" aria-label="Cargando líneas del pedido" />
                </div>
              ) : (
              <div className="hrs-mqt-items-wrap">
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
                    {(Array.isArray(selected.items) ? selected.items : ([] as Array<Record<string, unknown>>)).map((row, i) => {
                    const qty = Number(row.qty) || 0;
                    const pu = Number(row.priceUsd) || 0;
                    const inclSetup = row.includeSetup === true;
                    const inclGar = row.includeWarranty === true;
                    const sharePct = ticketRowSharePct(row);
                    const shareMult = sharePct / 100;
                    const warrantyUnit = Math.round(
                      resolveWarrantyUsdForQuoteLine(
                        {
                          productId: String(row.productId ?? ""),
                          brand: String(row.brand ?? ""),
                          model: String(row.model ?? ""),
                          hashrate: String(row.hashrate ?? ""),
                        },
                        garantiaQuoteItems
                      ) * shareMult
                    );
                    const setupLbl = sharePct < 100 ? setupCompraHashrateUsd : setupEquipoCompletoUsd;
                    const linePending = ticketRowIsEquipmentPricePending(row);
                    const sub = ticketRowLineSubtotalUsd(row, {
                      setupEquipoCompletoUsd,
                      setupCompraHashrateUsd,
                      garantiaItems: garantiaQuoteItems,
                    });
                    const name = marketplaceQuoteTicketLineDisplayName(row);
                    return (
                      <tr key={i}>
                        <td>
                          <div className="hrs-mqt-item-name">{name}</div>
                          {inclSetup || inclGar ? (
                            <div className="hrs-mqt-item-addons">
                              {inclSetup ? (
                                <span className={"hrs-mqt-item-addon-pill" + (linePending ? " hrs-mqt-item-addon-pill--pending" : "")}>
                                  {linePending ? "Setup: solicitar valor/u" : `Setup ${setupLbl} USD/u`}
                                </span>
                              ) : null}
                              {inclGar ? (
                                <span className={"hrs-mqt-item-addon-pill" + (linePending ? " hrs-mqt-item-addon-pill--pending" : "")}>
                                  {linePending ? "Garantía: solicitar valor/u" : `Garantía ${warrantyUnit} USD/u`}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="hrs-mqt-items__num">{qty}</td>
                        <td className="hrs-mqt-items__money">{String(row.priceLabel ?? pu)}</td>
                        <td className="hrs-mqt-items__subtotal">
                          {linePending ? (
                            <span className="hrs-mqt-items__pending-chip">Cotización pendiente</span>
                          ) : (
                            `${sub.toLocaleString("es-PY")} USD`
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              <div className="hrs-mqt-total-line" role="status" aria-label="Precio total de la orden">
                <span className="hrs-mqt-total-line__label">Precio total</span>
                <span className="hrs-mqt-total-line__value">{selected.subtotalUsd.toLocaleString("es-PY")} USD</span>
              </div>

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
                <div className="hrs-mqt-admin-actions">
                  <button type="button" className="hrs-mqt-btn-save" disabled={saving} onClick={() => void saveDetail()}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    className="hrs-mqt-btn-delete-order"
                    disabled={deleteBusy}
                    onClick={() => setDeleteModalTicket(selected)}
                  >
                    <i className="bi bi-trash3 me-2" aria-hidden />
                    Eliminar orden
                  </button>
                </div>
                <p className="hrs-mqt-admin-actions__hint">
                  <strong>Zona de administración:</strong> al eliminar, la orden se borra del sistema y no se puede deshacer.
                </p>
              </div>

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
            <div style={{ fontSize: "1rem", color: "#374151" }}>
              <p style={{ margin: 0 }}>
                ¿Eliminar definitivamente la orden <strong>{orderLabel(deleteModalTicket)}</strong> ({deleteModalTicket.ticketCode})?
              </p>
              <p style={{ margin: "0.4rem 0 0 0" }}>
                Esta acción elimina la orden del sistema y no se puede deshacer. ¿Estás seguro de borrarla?
              </p>
            </div>
          ) : null
        }
        warningText="Se borrará el ticket de la base de datos, incluido el historial visible para el cliente."
        cancelLabel="Cancelar"
        confirmLabel="Sí, eliminar orden"
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
