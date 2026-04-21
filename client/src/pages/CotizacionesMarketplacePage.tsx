import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  deleteMarketplaceQuoteTicketAdmin,
  getMarketplaceGarantiaQuotePrices,
  getMarketplaceQuoteTickets,
  getMarketplaceQuoteTicket,
  getMarketplaceQuoteTicketsStats,
  getMarketplaceSetupQuotePrices,
  patchMarketplaceQuoteTicket,
  type MarketplaceQuoteCartHistoryChange,
  type MarketplaceQuoteTicket,
} from "../lib/api.js";
import { canViewMarketplaceQuoteTickets } from "../lib/auth.js";
import { playMarketplacePendienteLaneInSound } from "../lib/marketplaceCartSound.js";
import {
  ticketRowLineSubtotalUsd,
  ticketRowIsEquipmentPricePending,
  ticketRowSharePct,
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  marketplaceQuoteTicketLineDisplayParts,
} from "../lib/marketplaceQuoteCart.js";
import { resolveWarrantyUsdForQuoteLine, type GarantiaQuotePriceItem } from "../lib/marketplaceGarantiaQuote.js";
import { useAuth } from "../contexts/AuthContext.js";
import { MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT } from "../contexts/MarketplaceQuoteCartContext.js";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/facturacion.css";
import "../styles/hrs-cotizaciones-marketplace.css";

/** Chips del toolbar: mismo criterio que los tres carriles + Todos. */
const LANE_FILTER_OPTS = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "compra_confirmada", label: "Confirmada" },
  { value: "eliminadas", label: "Eliminadas" },
] as const;

type MqtListLaneFilter = (typeof LANE_FILTER_OPTS)[number]["value"];

/** Opciones del `<select>` de estado en el drawer (granular; incluye carrito abierto). */
const STATUS_OPTS_ADMIN = [
  { value: "borrador", label: "Carrito abierto" },
  { value: "pendiente", label: "Pendiente (sin generar)" },
  { value: "orden_lista", label: "Orden lista" },
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
  pendiente: "Pendiente",
  orden_lista: "Orden lista",
  enviado_consulta: "Consulta enviada",
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
  { key: "pendiente", label: "PENDIENTE" },
  { key: "orden_lista", label: "ORDEN LISTA" },
  { key: "en_contacto_equipo", label: "CONTACTO" },
  { key: "en_gestion", label: "EN GESTIÓN" },
  { key: "pagada", label: "PAGADA" },
  { key: "en_viaje", label: "EN VIAJE" },
  { key: "instalado", label: "INSTALADO" },
  { key: "cerrado", label: "CERRADO" },
  { key: "descartado", label: "ELIMINADO" },
] as const;

/** Solo bajas canceladas / vaciar carrito; `cerrado` (cierre tras pago u operación) va en COMPRA CONFIRMADA. */
function isMarketplaceTicketEliminadaLaneStatus(status: string): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  return st === "descartado";
}

/** Estados a partir del pago registrado: van al carril COMPRA CONFIRMADA (excluye eliminadas). */
function isMarketplaceTicketPostPagoLaneStatus(status: string): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  return st === "pagada" || st === "en_viaje" || st === "instalado" || st === "cerrado";
}

/**
 * Pre-pago: carril Pendiente incluye carrito, «Generar orden» (orden_lista), embudo y gestión hasta (excl.) Pagada.
 */
function isMarketplaceTicketPendienteLaneStatus(status: string): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "descartado") return false;
  return !isMarketplaceTicketPostPagoLaneStatus(st);
}

/** Coincidencia ticket ↔ filtro por carril del listado (misma regla que la API `lane`). */
function ticketMatchesListLaneFilter(status: string, lane: MqtListLaneFilter): boolean {
  if (lane === "all") return true;
  if (lane === "eliminadas") return isMarketplaceTicketEliminadaLaneStatus(status);
  if (lane === "pendiente") return isMarketplaceTicketPendienteLaneStatus(status);
  return !isMarketplaceTicketEliminadaLaneStatus(status) && !isMarketplaceTicketPendienteLaneStatus(status);
}

/** Orden dentro del carril (ordenación dentro de cada riel). */
function statusActivoLaneOrder(status: string): number {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "borrador") return 5;
  if (st === "pendiente") return 6;
  if (st === "orden_lista") return 8;
  if (st === "enviado_consulta") return 10;
  if (st === "respondido") return 15;
  const order: Record<string, number> = {
    en_contacto_equipo: 20,
    en_gestion: 30,
    pagada: 40,
    en_viaje: 50,
    instalado: 60,
    cerrado: 70,
  };
  return order[st] ?? 80;
}

/**
 * Índice del paso actual en `OPERATION_FLOW`.
 * `enviado_consulta` ya no es paso ni opción en panel: en el embudo se muestra como «orden lista» hasta contacto.
 */
function mqtOperationalFlowIndex(stRaw: string): number {
  const st = normalizeMqtTicketStatus(String(stRaw ?? ""));
  if (st === "respondido" || st === "enviado_consulta") {
    const j = OPERATION_FLOW.findIndex((s) => s.key === "orden_lista");
    return j >= 0 ? j : 0;
  }
  const i = OPERATION_FLOW.findIndex((s) => s.key === st);
  return i >= 0 ? i : 0;
}

/**
 * Último índice del embudo que puede mostrarse como «pasado» (verde). Por defecto todo lo anterior al paso actual.
 * En `descartado` el paso actual es el último del array: no marcar PAGADA / EN VIAJE / etc. como completados si nunca ocurrieron.
 */
function mqtOperationalFlowLastDoneInclusive(stRaw: string, flowIdx: number): number {
  const st = normalizeMqtTicketStatus(String(stRaw ?? ""));
  if (st === "descartado") return -1;
  return flowIdx - 1;
}

function MqtOperationalFlowStrip({ status }: { status: string }) {
  const flowIdx = mqtOperationalFlowIndex(status);
  const lastDoneInclusive = mqtOperationalFlowLastDoneInclusive(status, flowIdx);
  return (
    <div className="hrs-mqt-flow-strip" aria-label="Embudo operativo de la orden">
      <p className="hrs-mqt-flow-strip__title">Embudo operativo</p>
      <div className="hrs-mqt-flow-strip__track">
        {OPERATION_FLOW.map((step, i) => {
          const done = lastDoneInclusive >= 0 && i <= lastDoneInclusive;
          return (
            <div
              key={step.key}
              className={
                "hrs-mqt-flow-strip__step" +
                (i === flowIdx ? " hrs-mqt-flow-strip__step--current" : "") +
                (done ? " hrs-mqt-flow-strip__step--done" : "")
              }
            >
              <span className="hrs-mqt-flow-strip__dot" aria-hidden>
                {done ? "✓" : i + 1}
              </span>
              <span className="hrs-mqt-flow-strip__lbl">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NEW_TICKET_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function formatShareHistLabel(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "Equipo completo";
  return `${pct}% hashrate`;
}

function ynSetup(on: boolean | undefined): string {
  return on === true ? "Sí" : "No";
}

function ChistSpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hrs-mqt-chist-spec__line">
      <span className="hrs-mqt-chist-spec__k">{label}</span>
      <span className="hrs-mqt-chist-spec__v">{value}</span>
    </div>
  );
}

function MqtCartHistoryChangeCard({ ch }: { ch: MarketplaceQuoteCartHistoryChange }) {
  const share = formatShareHistLabel(ch.hashrateSharePct ?? null);
  const badge =
    ch.action === "added"
      ? { cls: "hrs-mqt-chist-badge--add", label: "Agregó", icon: "bi-plus-lg" as const }
      : ch.action === "removed"
        ? { cls: "hrs-mqt-chist-badge--rm", label: "Quitó", icon: "bi-dash-lg" as const }
        : { cls: "hrs-mqt-chist-badge--up", label: "Actualizó", icon: "bi-sliders" as const };

  const qtyLine =
    ch.action === "updated" && ch.previousQty != null && ch.qty != null && ch.previousQty !== ch.qty
      ? `${ch.previousQty} → ${ch.qty}`
      : String(ch.qty ?? "—");

  const setupLine =
    ch.action === "updated" &&
    ch.previousIncludeSetup !== undefined &&
    ch.includeSetup !== undefined &&
    ch.previousIncludeSetup !== ch.includeSetup
      ? `${ynSetup(ch.previousIncludeSetup)} → ${ynSetup(ch.includeSetup)}`
      : ynSetup(ch.includeSetup);

  const garLine =
    ch.action === "updated" &&
    ch.previousIncludeWarranty !== undefined &&
    ch.includeWarranty !== undefined &&
    ch.previousIncludeWarranty !== ch.includeWarranty
      ? `${ynSetup(ch.previousIncludeWarranty)} → ${ynSetup(ch.includeWarranty)}`
      : ynSetup(ch.includeWarranty);

  const shareLine =
    ch.action === "updated" &&
    ch.previousHashrateSharePct !== undefined &&
    (ch.hashrateSharePct ?? null) !== (ch.previousHashrateSharePct ?? null)
      ? `${formatShareHistLabel(ch.previousHashrateSharePct)} → ${formatShareHistLabel(ch.hashrateSharePct ?? null)}`
      : share;

  const priceStr =
    ch.priceUsd != null && ch.priceUsd > 0
      ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(ch.priceUsd) + " USD"
      : ch.priceLabel && ch.priceLabel.trim()
        ? ch.priceLabel.trim()
        : "—";

  const hasDelta =
    ch.action === "updated" &&
    ((ch.previousQty != null && ch.qty != null && ch.previousQty !== ch.qty) ||
      (ch.previousIncludeSetup !== undefined &&
        ch.includeSetup !== undefined &&
        ch.previousIncludeSetup !== ch.includeSetup) ||
      (ch.previousIncludeWarranty !== undefined &&
        ch.includeWarranty !== undefined &&
        ch.previousIncludeWarranty !== ch.includeWarranty) ||
      (ch.previousHashrateSharePct !== undefined &&
        (ch.hashrateSharePct ?? null) !== (ch.previousHashrateSharePct ?? null)));

  return (
    <article className={`hrs-mqt-chist-card hrs-mqt-chist-card--${ch.action}`} aria-label={`${badge.label}: ${ch.productLabel}`}>
      <div className="hrs-mqt-chist-card__accent" aria-hidden />
      <div className="hrs-mqt-chist-card__body">
        <header className="hrs-mqt-chist-card__topline">
          <span className={`hrs-mqt-chist-badge ${badge.cls}`}>
            <i className={`bi ${badge.icon}`} aria-hidden />
            {badge.label}
          </span>
          <h4 className="hrs-mqt-chist-card__title">{ch.productLabel}</h4>
          <div className="hrs-mqt-chist-card__id-chip" title={ch.productId}>
            <span className="hrs-mqt-chist-card__id-chip-label">ID</span>
            <code className="hrs-mqt-chist-card__id">{ch.productId}</code>
          </div>
        </header>
        <div className="hrs-mqt-chist-spec" role="group" aria-label="Detalle de la línea">
          <ChistSpecRow label="Cantidad" value={qtyLine} />
          {ch.action !== "removed" ? (
            <>
              <ChistSpecRow label="Setup" value={setupLine} />
              <ChistSpecRow label="Garantía" value={garLine} />
            </>
          ) : (
            <>
              <ChistSpecRow label="Setup (último)" value={ynSetup(ch.includeSetup)} />
              <ChistSpecRow label="Garantía (último)" value={ynSetup(ch.includeWarranty)} />
            </>
          )}
          <ChistSpecRow label="Fracción" value={shareLine} />
          <ChistSpecRow label="Precio ref." value={priceStr} />
        </div>
        {hasDelta ? (
          <p className="hrs-mqt-chist-card__hint">
            Formato <strong>antes → después</strong> en los campos que cambiaron en esta sincronización.
          </p>
        ) : null}
      </div>
    </article>
  );
}

type MqtLaneHelpId = "general" | "pendiente" | "compra_confirmada" | "cerrados";

const MQT_LANE_HELP_TOOLTIP: Record<MqtLaneHelpId, string> = {
  general:
    "Monitoreo de listas de cotización ASIC: orden, ticket, ítems y totales referenciales. Solo cuentas AdministradorA y AdministradorB.",
  pendiente:
    "Órdenes hasta antes del pago registrado: carrito, «Generar orden», orden lista y gestión comercial. El carril COMPRA CONFIRMADA empieza en estado Pagada.",
  compra_confirmada:
    "Órdenes con pago ya registrado (Pagada) y etapas siguientes: envío, instalación y cierre administrativo (Cerrado).",
  cerrados:
    "Solo órdenes eliminadas o descartadas (cancelación o vaciar carrito). Las cerradas por ventas figuran en COMPRA CONFIRMADA.",
};

function MqtLaneTitleWithHelp({
  title,
  titleId,
  helpId,
}: {
  title: string;
  titleId: string;
  helpId: "pendiente" | "compra_confirmada" | "cerrados";
}) {
  return (
    <div className="hrs-mqt-lane__head-row">
      <h3 id={titleId} className="hrs-mqt-lane__title">
        {title}
      </h3>
      <button
        type="button"
        className="hrs-mqt-help-trigger hrs-mqt-help-trigger--lane"
        aria-label={`Ayuda: qué órdenes van en el carril ${title}`}
        data-tooltip={MQT_LANE_HELP_TOOLTIP[helpId]}
      >
        <i className="bi bi-info-circle-fill" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Slug estable para estado (BD / API). NFKC + quitar invisibles: evita `pendiente`≠match por Unicode
 * y clases `…--PENDIENTE` que no aplican `.…--pendiente`.
 */
function normalizeMqtTicketStatus(s: string): string {
  const t = String(s ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (t === "pending" || t === "pendientes") return "pendiente";
  return t;
}

const ADMIN_SELECT_STATUS_SLUGS = new Set<string>(STATUS_OPTS_ADMIN.map((o) => o.value));

/** Slug que coincide con `<option value>` del panel admin (evita select «descoordinado» con legado `respondido`). */
function adminSelectStatusValue(status: string): string {
  const st = normalizeMqtTicketStatus(status);
  /** Sin opción «ABIERTA»: órdenes en `enviado_consulta` se editan desde «Orden lista» hasta otro estado. */
  if (st === "respondido" || st === "enviado_consulta") return "orden_lista";
  if (ADMIN_SELECT_STATUS_SLUGS.has(st)) return st;
  return "pendiente";
}

/** Opciones del desplegable de estado según el ticket actual (p. ej. instalado → sin Cerrado ni Eliminada). */
function adminStatusSelectOptions(currentTicketStatus: string) {
  const base = [...STATUS_OPTS_ADMIN];
  const st = normalizeMqtTicketStatus(currentTicketStatus);
  if (st === "instalado") {
    return base.filter((o) => o.value !== "cerrado" && o.value !== "descartado");
  }
  return base;
}

function badgeClass(status: string): string {
  const n = normalizeMqtTicketStatus(status);
  const k = n.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "unknown";
  return `hrs-mqt-badge hrs-mqt-badge--${k}`;
}

/** Consulta reactivada tras eliminación: badge distinto (verde más oscuro). */
function pipelinePrimaryBadge(t: MarketplaceQuoteTicket): { label: string; className: string } {
  const st = normalizeMqtTicketStatus(t.status);
  if (st === "borrador") {
    return { label: STATUS_LABEL.borrador, className: "hrs-mqt-badge hrs-mqt-badge--carrito_abierto" };
  }
  if (st === "pendiente") {
    return { label: STATUS_LABEL.pendiente, className: "hrs-mqt-badge hrs-mqt-badge--pendiente" };
  }
  if (st === "orden_lista") {
    return { label: STATUS_LABEL.orden_lista, className: "hrs-mqt-badge hrs-mqt-badge--orden_lista" };
  }
  if (st === "enviado_consulta" && t.reactivatedAt) {
    return { label: "RE-ACTIVO", className: "hrs-mqt-badge hrs-mqt-badge--re_activo" };
  }
  return { label: STATUS_LABEL[st] ?? t.status, className: badgeClass(t.status) };
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

/** Canal de último contacto: etiqueta corta (sin «vía») para tarjetas y resúmenes. */
function formatLastContactChannelLabel(channel: string | null | undefined): string {
  if (channel == null || String(channel).trim() === "") return "—";
  const c = String(channel).trim().toLowerCase();
  if (c === "email") return "correo";
  if (c === "portal") return "portal";
  if (c === "whatsapp") return "whatsapp";
  return c.replace(/_/g, " ");
}

function isNewTicketBadgeVisible(t: MarketplaceQuoteTicket): boolean {
  if (t.status === "cerrado" || t.status === "descartado" || t.status === "instalado") return false;
  const createdAtMs = Date.parse(t.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs <= NEW_TICKET_MAX_AGE_MS;
}

/** Carril con scroll horizontal y flechas cuando hay más órdenes que caben en el ancho. */
function MqtLaneTicketScroller({
  laneId,
  revision,
  children,
}: {
  laneId: string;
  /** Cambia cuando cambia el listado (p. ej. `tickets.length`) para recalcular overflow. */
  revision: number;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 2) {
      setHasOverflow(false);
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    setHasOverflow(true);
    const { scrollLeft } = el;
    const eps = 1;
    setCanPrev(scrollLeft > eps);
    setCanNext(scrollLeft < maxScroll - eps);
  }, []);

  useLayoutEffect(() => {
    updateArrows();
  }, [revision, updateArrows]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(updateArrows);
    });
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    const t = window.setTimeout(updateArrows, 0);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [revision, updateArrows]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    const step = Math.max(180, Math.floor(el.clientWidth * 0.72));
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  };

  const viewId = `mqt-lane-view-${laneId}`;

  return (
    <div className={`hrs-mqt-lane-scroll${hasOverflow ? " hrs-mqt-lane-scroll--overflow" : ""}`}>
      <button
        type="button"
        className="hrs-mqt-lane-scroll__nav hrs-mqt-lane-scroll__nav--prev"
        aria-controls={viewId}
        aria-label="Ver órdenes anteriores en este carril"
        disabled={!canPrev}
        onClick={() => scrollByDir(-1)}
      >
        <i className="bi bi-chevron-left" aria-hidden />
      </button>
      <div
        id={viewId}
        ref={viewportRef}
        className="hrs-mqt-lane-scroll__viewport"
        tabIndex={hasOverflow ? 0 : undefined}
        role="region"
        aria-label="Órdenes en fila"
      >
        <div className="hrs-mqt-ticket-grid hrs-mqt-ticket-grid--hscroll">{children}</div>
      </div>
      <button
        type="button"
        className="hrs-mqt-lane-scroll__nav hrs-mqt-lane-scroll__nav--next"
        aria-controls={viewId}
        aria-label="Ver más órdenes en este carril"
        disabled={!canNext}
        onClick={() => scrollByDir(1)}
      >
        <i className="bi bi-chevron-right" aria-hidden />
      </button>
    </div>
  );
}

function MqtTicketCardButton({
  t,
  onOpen,
  trainCarIndex,
}: {
  t: MarketplaceQuoteTicket;
  onOpen: (x: MarketplaceQuoteTicket) => void;
  /** Índice en el carril o en el listado filtrado (vagón del tren): entrada escalonada desde la derecha. */
  trainCarIndex?: number;
}) {
  const primaryBadge = pipelinePrimaryBadge(t);
  const stNorm = normalizeMqtTicketStatus(t.status);
  const showInstaladoOk = stNorm === "instalado";
  const eliminadaCls = isMarketplaceTicketEliminadaLaneStatus(t.status) ? " hrs-mqt-ticket-card--eliminada" : "";
  const trainCls = trainCarIndex !== undefined ? " hrs-mqt-ticket-card--train-car" : "";
  const trainStyle: CSSProperties | undefined =
    trainCarIndex !== undefined ? ({ "--mqt-train-i": trainCarIndex } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      className={`hrs-mqt-ticket-card${eliminadaCls}${trainCls}`}
      style={trainStyle}
      onClick={() => onOpen(t)}
    >
      <div className="hrs-mqt-ticket-card__top">
        <div className="hrs-mqt-ticket-card__top-row">
          <div className="hrs-mqt-ticket-card__ids">
            <div className="hrs-mqt-ticket-card__ord">{t.orderNumber ?? `— (#${t.id})`}</div>
            <div className="hrs-mqt-ticket-card__tkt">{t.ticketCode}</div>
          </div>
          {showInstaladoOk ? (
            <span className="hrs-mqt-ticket-card__instalado-ok" title="Instalación confirmada" aria-hidden>
              <i className="bi bi-check-circle-fill" />
            </span>
          ) : null}
        </div>
        <div className="hrs-mqt-ticket-card__badges">
          <span className={primaryBadge.className} data-mqt-status={stNorm}>
            {primaryBadge.label}
          </span>
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
        <div className="hrs-mqt-ticket-card__meta-inner">
          {t.contactEmail ? (
            <>
              <span className="hrs-mqt-ticket-card__email text-truncate">{t.contactEmail}</span>
              <span className="hrs-mqt-ticket-card__meta-sep" aria-hidden>
                {" "}
                ·{" "}
              </span>
            </>
          ) : null}
          <span className="hrs-mqt-ticket-card__meta-muted">
            Actualizado {formatWhen(t.updatedAt)}
            {t.lastContactChannel ? ` · ${formatLastContactChannelLabel(t.lastContactChannel)}` : ""}
          </span>
        </div>
      </div>
    </button>
  );
}

export function CotizacionesMarketplacePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; total: number; todayCount: number } | null>(null);
  const [tickets, setTickets] = useState<MarketplaceQuoteTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [laneFilter, setLaneFilter] = useState<MqtListLaneFilter>("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [selected, setSelected] = useState<MarketplaceQuoteTicket | null>(null);
  /** Mientras el detalle GET no devuelve líneas: evita tabla vacía (solo thead). */
  const [drawerDetailLoading, setDrawerDetailLoading] = useState(false);
  const drawerFetchGenRef = useRef(0);
  const [saving, setSaving] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  /** Slug del `<select>` al abrir el ticket: no reenviar `status` en PATCH si el usuario no lo cambió (evita transiciones fantasma). */
  const editStatusBaselineRef = useRef<string | null>(null);
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [garantiaQuoteItems, setGarantiaQuoteItems] = useState<GarantiaQuotePriceItem[]>([]);
  const [deleteModalTicket, setDeleteModalTicket] = useState<MarketplaceQuoteTicket | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** IDs vistos en carril Pendiente: detectar altas y avisar con sonido (sin disparar en la primera carga tras montar / cambio de filtro). */
  const knownPendienteIdsRef = useRef<Set<number>>(new Set());
  const pendienteLaneSoundPrimedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  /** Modal «más datos» (canal, IP, descarte) sobre el drawer de detalle. */
  const [metaExtraOpen, setMetaExtraOpen] = useState(false);
  /** Modal historial de líneas del carrito (altas/bajas/cambios). */
  const [cartHistoryOpen, setCartHistoryOpen] = useState(false);

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

  useEffect(() => {
    knownPendienteIdsRef.current = new Set();
    pendienteLaneSoundPrimedRef.current = false;
  }, [laneFilter, qDebounced]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const rid = ++loadRequestIdRef.current;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const listParams = {
        ...(laneFilter === "all" ? {} : { lane: laneFilter }),
        q: qDebounced || undefined,
        limit: 100,
        offset: 0,
      };
      const needPendienteSidecar = laneFilter !== "all" && laneFilter !== "pendiente";
      const pendienteSidecarPromise = needPendienteSidecar
        ? getMarketplaceQuoteTickets({
            lane: "pendiente",
            q: qDebounced || undefined,
            limit: 100,
            offset: 0,
          })
        : Promise.resolve(null);

      const [st, list, pendSnapshot] = await Promise.all([
        getMarketplaceQuoteTicketsStats(),
        getMarketplaceQuoteTickets(listParams),
        pendienteSidecarPromise,
      ]);

      if (rid !== loadRequestIdRef.current) return;

      setStats(st);
      setTickets(list.tickets);
      setTotal(list.total);

      const pendienteIds: number[] =
        laneFilter === "all"
          ? list.tickets.filter((x) => isMarketplaceTicketPendienteLaneStatus(x.status)).map((t) => t.id)
          : laneFilter === "pendiente"
            ? list.tickets.map((t) => t.id)
            : (pendSnapshot?.tickets ?? []).map((t) => t.id);

      const prevKnown = knownPendienteIdsRef.current;
      let anyNewInPendienteLane = false;
      for (const id of pendienteIds) {
        if (!prevKnown.has(id)) {
          anyNewInPendienteLane = true;
          break;
        }
      }
      if (pendienteLaneSoundPrimedRef.current && anyNewInPendienteLane) {
        playMarketplacePendienteLaneInSound();
      }
      knownPendienteIdsRef.current = new Set(pendienteIds);
      pendienteLaneSoundPrimedRef.current = true;
    } catch (e) {
      if (rid !== loadRequestIdRef.current) return;
      if (!silent) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (rid === loadRequestIdRef.current && !silent) setLoading(false);
    }
  }, [laneFilter, qDebounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => {
      void load();
    };
    window.addEventListener(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT, fn);
    return () => window.removeEventListener(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT, fn);
  }, [load]);

  /** Refresco en segundo plano: detecta órdenes nuevas en Pendiente aunque no haya evento del carrito. */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load({ silent: true });
    };
    const id = window.setInterval(tick, 28000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (selected) {
      const v = adminSelectStatusValue(selected.status);
      setEditStatus(v);
      editStatusBaselineRef.current = v;
      setEditNotes(selected.notesAdmin ?? "");
    } else {
      editStatusBaselineRef.current = null;
    }
  }, [selected]);

  const closeTicketDrawer = useCallback(() => {
    drawerFetchGenRef.current += 1;
    setDrawerDetailLoading(false);
    setMetaExtraOpen(false);
    setCartHistoryOpen(false);
    setSelected(null);
  }, []);

  const openTicketDrawer = useCallback((t: MarketplaceQuoteTicket) => {
    const gen = ++drawerFetchGenRef.current;
    setMetaExtraOpen(false);
    setCartHistoryOpen(false);
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

  useEffect(() => {
    const raw = searchParams.get("openTicket");
    if (!raw) return;
    const id = Number(raw);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("openTicket");
        return next;
      },
      { replace: true }
    );
    if (!Number.isFinite(id) || id <= 0) return;
    void getMarketplaceQuoteTicket(id)
      .then(({ ticket }) => {
        openTicketDrawer(ticket);
      })
      .catch(() => {
        showToast("No se encontró la orden solicitada.", "warning", "Cotizaciones tienda");
      });
  }, [searchParams, setSearchParams, openTicketDrawer]);

  useEffect(() => {
    if (!metaExtraOpen && !cartHistoryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMetaExtraOpen(false);
        setCartHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [metaExtraOpen, cartHistoryOpen]);

  /**
   * KPIs alineados con los carriles del tablero (misma partición que `lane=` en la API).
   * Suma por cada `status` devuelto en `byStatus` (incluye legados u otros valores en un solo bucket «compra» si no son pre-pago ni eliminadas).
   */
  const laneKpiCounts = useMemo(() => {
    const out = { pendienteLane: 0, compraLane: 0, eliminadas: 0 };
    if (!stats?.byStatus) return out;
    for (const [st, raw] of Object.entries(stats.byStatus)) {
      const n = Number(raw) || 0;
      if (isMarketplaceTicketEliminadaLaneStatus(st)) out.eliminadas += n;
      else if (isMarketplaceTicketPendienteLaneStatus(st)) out.pendienteLane += n;
      else out.compraLane += n;
    }
    return out;
  }, [stats]);

  /**
   * Con filtro «Todos»: Pendiente (pre-pago) | COMPRA CONFIRMADA (desde Pagada) | Eliminadas (solo descartado).
   */
  const lanesWhenAll = useMemo(() => {
    if (laneFilter !== "all") return null;
    const sortActivo = (a: MarketplaceQuoteTicket, b: MarketplaceQuoteTicket) => {
      const oa = statusActivoLaneOrder(a.status);
      const ob = statusActivoLaneOrder(b.status);
      if (oa !== ob) return oa - ob;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    };
    const pendiente = tickets.filter((x) => isMarketplaceTicketPendienteLaneStatus(x.status)).slice().sort(sortActivo);
    const compraConfirmada = tickets
      .filter((x) => !isMarketplaceTicketEliminadaLaneStatus(x.status) && !isMarketplaceTicketPendienteLaneStatus(x.status))
      .slice()
      .sort(sortActivo);
    const cerrados = tickets
      .filter((x) => isMarketplaceTicketEliminadaLaneStatus(x.status))
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { pendiente, compraConfirmada, cerrados };
  }, [tickets, laneFilter]);

  if (!user || !canViewMarketplaceQuoteTickets(user.role)) {
    return <Navigate to="/" replace />;
  }

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const statusChanged = editStatus !== editStatusBaselineRef.current;
      const { ticket } = await patchMarketplaceQuoteTicket(selected.id, {
        ...(statusChanged ? { status: editStatus } : {}),
        notesAdmin: editNotes || null,
      });
      setDrawerDetailLoading(false);
      const nextStatus = adminSelectStatusValue(ticket.status);
      setSelected(ticket);
      setEditStatus(nextStatus);
      editStatusBaselineRef.current = nextStatus;
      if (statusChanged && laneFilter !== "all" && !ticketMatchesListLaneFilter(ticket.status, laneFilter)) {
        setLaneFilter("all");
        showToast(
          "Estado actualizado. El filtro pasó a «Todos» para que la orden siga visible en el tablero.",
          "success",
          "Cotizaciones tienda"
        );
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      showToast(msg, "error", "Cotizaciones tienda");
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
            <Link to="/marketplace/orders/history-detail" className="fact-back">
              <i className="bi bi-table me-1" aria-hidden />
              Historial detalle
            </Link>
          }
        />

        <div className="hrs-mqt-panel">
          <div className="hrs-mqt-monitor">
            <div className="hrs-mqt-monitor__head">
              <div className="hrs-mqt-panel-lede-title-group">
                <p
                  className="mb-0 fw-bold text-uppercase text-white hrs-mqt-monitor__title"
                  style={{ minWidth: 0, letterSpacing: "0.04em", lineHeight: 1.25 }}
                >
                  MONITOR DE OPERACIONES DE ORDENES DE COMPRA
                </p>
                <button
                  type="button"
                  className="hrs-mqt-help-trigger hrs-mqt-help-trigger--panel"
                  aria-label="Qué es este panel (resumen)"
                  data-tooltip={MQT_LANE_HELP_TOOLTIP.general}
                >
                  <i className="bi bi-info-circle-fill" aria-hidden />
                </button>
              </div>
            </div>
            {err ? <div className="hrs-mqt-err hrs-mqt-monitor__err">{err}</div> : null}

            <div className="hrs-mqt-stats-filters-row">
              <div className="hrs-mqt-stats-filters-row__stats">
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
                      <div className="hrs-mqt-stat__val">{laneKpiCounts.pendienteLane}</div>
                      <div className="hrs-mqt-stat__lbl">Pendiente</div>
                    </div>
                    <div className="hrs-mqt-stat">
                      <div className="hrs-mqt-stat__val">{laneKpiCounts.compraLane}</div>
                      <div className="hrs-mqt-stat__lbl">Compra confirmada</div>
                    </div>
                    <div className="hrs-mqt-stat hrs-mqt-stat--eliminadas-kpi">
                      <div className="hrs-mqt-stat__val">{laneKpiCounts.eliminadas}</div>
                      <div className="hrs-mqt-stat__lbl">Eliminadas</div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hrs-mqt-stats-filters-row__actions">
                <div className="hrs-mqt-search hrs-mqt-search--monitor">
                  <input
                    type="search"
                    placeholder="Buscar por orden, ticket o modelo…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Buscar tickets"
                  />
                </div>
                <div className="hrs-mqt-filters hrs-mqt-filters--rail" role="toolbar" aria-label="Filtrar por carril">
                  {LANE_FILTER_OPTS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`hrs-mqt-chip${laneFilter === o.value ? " hrs-mqt-chip--active" : ""}${
                        o.value === "eliminadas" ? " hrs-mqt-chip--eliminada" : ""
                      }`}
                      onClick={() => setLaneFilter(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
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
                  />
                  {lanesWhenAll.pendiente.length === 0 ? (
                    <p className="hrs-mqt-lane__empty">Ninguna orden en este carril con la búsqueda actual.</p>
                  ) : (
                    <MqtLaneTicketScroller laneId="pendiente" revision={lanesWhenAll.pendiente.length}>
                      {lanesWhenAll.pendiente.map((t, i) => (
                        <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} trainCarIndex={i} />
                      ))}
                    </MqtLaneTicketScroller>
                  )}
                </section>
                <section className="hrs-mqt-lane hrs-mqt-lane--compra_confirmada" aria-labelledby="hrs-mqt-lane-compra-title">
                  <MqtLaneTitleWithHelp
                    title="COMPRA CONFIRMADA"
                    titleId="hrs-mqt-lane-compra-title"
                    helpId="compra_confirmada"
                  />
                  {lanesWhenAll.compraConfirmada.length === 0 ? (
                    <p className="hrs-mqt-lane__empty">Ninguna orden en este carril con la búsqueda actual.</p>
                  ) : (
                    <MqtLaneTicketScroller laneId="compra" revision={lanesWhenAll.compraConfirmada.length}>
                      {lanesWhenAll.compraConfirmada.map((t, i) => (
                        <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} trainCarIndex={i} />
                      ))}
                    </MqtLaneTicketScroller>
                  )}
                </section>
                <section className="hrs-mqt-lane hrs-mqt-lane--cerrados" aria-labelledby="hrs-mqt-lane-cerr-title">
                  <MqtLaneTitleWithHelp
                    title="Eliminadas"
                    titleId="hrs-mqt-lane-cerr-title"
                    helpId="cerrados"
                  />
                  {lanesWhenAll.cerrados.length === 0 ? (
                    <p className="hrs-mqt-lane__empty">Ninguna orden eliminada con la búsqueda actual.</p>
                  ) : (
                    <MqtLaneTicketScroller laneId="eliminadas" revision={lanesWhenAll.cerrados.length}>
                      {lanesWhenAll.cerrados.map((t, i) => (
                        <MqtTicketCardButton key={t.id} t={t} onOpen={openTicketDrawer} trainCarIndex={i} />
                      ))}
                    </MqtLaneTicketScroller>
                  )}
                </section>
              </div>
            ) : null}

            {!loading && tickets.length > 0 && !lanesWhenAll ? (
              <MqtLaneTicketScroller laneId="filtro" revision={tickets.length}>
                {tickets.map((t, i) => (
                  <MqtTicketCardButton
                    key={t.id}
                    t={t}
                    onOpen={openTicketDrawer}
                    trainCarIndex={laneFilter !== "all" ? i : undefined}
                  />
                ))}
              </MqtLaneTicketScroller>
            ) : null}
          </div>
        </div>
      </div>

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
                  {selectedPrimaryBadge ? (
                    <span
                      className={`hrs-mqt-drawer__status-chip ${selectedPrimaryBadge.className}`}
                      data-mqt-status={normalizeMqtTicketStatus(selected.status)}
                    >
                      {selectedPrimaryBadge.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <button type="button" className="hrs-mqt-drawer__close" onClick={closeTicketDrawer} aria-label="Cerrar">
                ×
              </button>
            </div>

            <div className="hrs-mqt-drawer__body">
              <div className="hrs-mqt-drawer-meta-wrap">
                <section className="hrs-mqt-meta-card hrs-mqt-meta-card--drawer-compact" aria-label="Resumen del ticket">
                  <div className="hrs-mqt-meta-card__row">
                    <span className="hrs-mqt-meta-card__label">Cliente (correo)</span>
                    <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">{selected.contactEmail ?? "—"}</span>
                  </div>
                  <div className="hrs-mqt-meta-card__row">
                    <span className="hrs-mqt-meta-card__label">ID usuario</span>
                    <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">
                      {selected.userId != null ? selected.userId : "—"}
                    </span>
                  </div>
                  <div className="hrs-mqt-meta-card__row">
                    <span className="hrs-mqt-meta-card__label">Creado</span>
                    <span className="hrs-mqt-meta-card__value">{formatWhen(selected.createdAt)}</span>
                  </div>
                  <div className="hrs-mqt-meta-card__row">
                    <span className="hrs-mqt-meta-card__label">Última actualización</span>
                    <span className="hrs-mqt-meta-card__value">{formatWhen(selected.updatedAt)}</span>
                  </div>
                </section>
                <div className="hrs-mqt-drawer-meta__cta">
                  <button
                    type="button"
                    className="hrs-mqt-meta-extra-trigger"
                    onClick={() => {
                      setCartHistoryOpen(false);
                      setMetaExtraOpen(true);
                    }}
                  >
                    <i className="bi bi-info-circle" aria-hidden />
                    <span>Más información</span>
                  </button>
                  <button
                    type="button"
                    className="hrs-mqt-meta-extra-trigger"
                    onClick={() => {
                      setMetaExtraOpen(false);
                      setCartHistoryOpen(true);
                    }}
                  >
                    <i className="bi bi-clock-history" aria-hidden />
                    <span>Historial del carrito</span>
                  </button>
                </div>
              </div>

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
                    const titleParts = marketplaceQuoteTicketLineDisplayParts(row);
                    return (
                      <tr key={i}>
                        <td>
                          <div className="hrs-mqt-item-name hrs-mqt-item-name--stacked">
                            <span className="hrs-mqt-item-name__model">{titleParts.brandModel}</span>
                            {titleParts.specLine ? (
                              <span className="hrs-mqt-item-name__spec">{titleParts.specLine}</span>
                            ) : null}
                          </div>
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
                  {adminStatusSelectOptions(selected.status).map((o) => (
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

            {metaExtraOpen ? (
              <div
                className="hrs-mqt-meta-extra-overlay"
                role="presentation"
                onClick={() => setMetaExtraOpen(false)}
              >
                <div
                  className="hrs-mqt-meta-extra"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="hrs-mqt-meta-extra-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="hrs-mqt-meta-extra__head">
                    <h3 id="hrs-mqt-meta-extra-title" className="hrs-mqt-meta-extra__title">
                      Más información
                    </h3>
                    <button
                      type="button"
                      className="hrs-mqt-meta-extra__close"
                      onClick={() => setMetaExtraOpen(false)}
                      aria-label="Cerrar ventana"
                    >
                      ×
                    </button>
                  </div>
                  <div className="hrs-mqt-meta-card hrs-mqt-meta-card--nested mb-0" aria-label="Datos técnicos del ticket">
                    <div className="hrs-mqt-meta-card__row">
                      <span className="hrs-mqt-meta-card__label">Canal de contacto</span>
                      <span className="hrs-mqt-meta-card__value">{formatLastContactChannelLabel(selected.lastContactChannel)}</span>
                    </div>
                    <div className="hrs-mqt-meta-card__row">
                      <span className="hrs-mqt-meta-card__label">Contacto registrado</span>
                      <span className="hrs-mqt-meta-card__value">{selected.contactedAt ? formatWhen(selected.contactedAt) : "—"}</span>
                    </div>
                    <div className="hrs-mqt-meta-card__row">
                      <span className="hrs-mqt-meta-card__label">IP (última sync)</span>
                      <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">{selected.ipAddress ?? "—"}</span>
                    </div>
                    {selected.status === "descartado" ? (
                      <div className="hrs-mqt-meta-card__row">
                        <span className="hrs-mqt-meta-card__label">Eliminación registrada por</span>
                        <span className="hrs-mqt-meta-card__value hrs-mqt-meta-card__value--mono">
                          {selected.discardByEmail ?? "— (sin registro previo a esta función)"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {cartHistoryOpen ? (
              <div
                className="hrs-mqt-meta-extra-overlay hrs-mqt-meta-extra-overlay--cart-hist"
                role="presentation"
                onClick={() => setCartHistoryOpen(false)}
              >
                <div
                  className="hrs-mqt-meta-extra hrs-mqt-cart-history-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="hrs-mqt-cart-hist-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="hrs-mqt-cart-history-dialog__head">
                    <div className="hrs-mqt-cart-history-dialog__head-text">
                      <h3 id="hrs-mqt-cart-hist-title" className="hrs-mqt-cart-history-dialog__title">
                        Historial del carrito
                      </h3>
                      <p className="hrs-mqt-cart-history-dialog__subtitle">
                        Auditoría de líneas: cada bloque es una sincronización del cliente con el servidor.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="hrs-mqt-meta-extra__close"
                      onClick={() => setCartHistoryOpen(false)}
                      aria-label="Cerrar ventana"
                    >
                      ×
                    </button>
                  </div>
                  <div className="hrs-mqt-cart-history-callout" role="note">
                    <i className="bi bi-info-circle" aria-hidden />
                    <p>
                      Las marcas de tiempo corresponden al guardado en servidor. Los precios son referencia publicada al
                      momento del sync (no incluyen descuentos manuales posteriores).
                    </p>
                  </div>
                  <div className="hrs-mqt-cart-history-body" role="list">
                    {Array.isArray(selected.itemsCartHistory) && selected.itemsCartHistory.length > 0 ? (
                      [...selected.itemsCartHistory].reverse().map((entry, idx) => (
                        <section className="hrs-mqt-chist-sync" key={`${entry.at}-${idx}`} role="listitem">
                          <header className="hrs-mqt-chist-sync__head">
                            <div className="hrs-mqt-chist-sync__mark" aria-hidden />
                            <div className="hrs-mqt-chist-sync__meta">
                              <time className="hrs-mqt-chist-sync__time" dateTime={entry.at}>
                                {formatWhen(entry.at)}
                              </time>
                              <p className="hrs-mqt-chist-sync__sub">
                                {entry.changes.length} movimiento{entry.changes.length !== 1 ? "s" : ""} en esta
                                sincronización
                              </p>
                            </div>
                          </header>
                          <div className="hrs-mqt-chist-sync__cards">
                            {entry.changes.map((ch, j) => (
                              <MqtCartHistoryChangeCard key={`${ch.action}-${ch.productId}-${j}`} ch={ch} />
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="hrs-mqt-cart-history-empty" role="status">
                        <i className="bi bi-inbox hrs-mqt-cart-history-empty__icon" aria-hidden />
                        <p className="hrs-mqt-cart-history-empty__title">Sin registros todavía</p>
                        <p className="hrs-mqt-cart-history-empty__text">
                          Cuando el cliente agregue, quite o modifique productos y el carrito se sincronice, verás aquí
                          cada cambio con fecha y detalle.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
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
