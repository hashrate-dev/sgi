import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type KeyboardEvent } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  cancelMyMarketplaceQuoteTicket,
  deleteAllMyMarketplaceQuoteTickets,
  deleteMyMarketplaceQuoteTicket,
  getMarketplaceSetupQuotePrices,
  getMyMarketplaceQuoteTicket,
  getMyMarketplaceQuoteTickets,
  type MarketplaceQuoteTicket,
} from "../../lib/api.js";
import { MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT, useMarketplaceQuoteCart } from "../../contexts/MarketplaceQuoteCartContext.js";
import {
  ticketRowLineSubtotalUsd,
  ticketRowIsEquipmentPricePending,
  QUOTE_ADDON_SETUP_USD_FALLBACK,
  isMarketplacePipelineTicketStatus,
  marketplaceQuoteTicketLineDisplayName,
} from "../../lib/marketplaceQuoteCart.js";
import { canBulkManageMarketplaceMyOrders, enforceSingleMarketplaceOrderForRole } from "../../lib/auth.js";
import { useAuth } from "../../contexts/AuthContext.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../../lib/i18n.js";
import { ConfirmModal } from "../ConfirmModal.js";
import { showToast } from "../ToastNotification.js";
/** Estilos compartidos con Clientes tienda online (toolbar verde, tarjetas cti-card, botones) */
import "../../styles/hrs-clientes-tienda-online.css";
import "../../styles/hrs-marketplace-mis-ordenes-cti.css";

function badgeClass(status: string): string {
  const k = status.replace(/[^a-z_]/gi, "_");
  return `market-mis-ord__badge market-mis-ord__badge--${k}`;
}

function formatWhen(iso: string, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function MooRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="cti-row">
      <span className="cti-row-icon" aria-hidden>
        <i className={`bi ${icon}`} />
      </span>
      <div className="cti-row-body">
        <span className="cti-row-label">{label}</span>
        <span className="cti-row-value">{value}</span>
      </div>
    </div>
  );
}

type Props = { onBackToCart: () => void };

export function MarketplaceCartOrdersPanel({ onBackToCart }: Props) {
  const { lang, t, tf } = useMarketplaceLang();
  const loc = marketplaceLocale(lang);
  const { user } = useAuth();
  const userCelular = user?.celular?.trim();
  const userTelefono = user?.telefono?.trim();
  const { refreshActiveOrderGate } = useMarketplaceQuoteCart();
  const [tickets, setTickets] = useState<MarketplaceQuoteTicket[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<MarketplaceQuoteTicket | null>(null);
  const [search, setSearch] = useState("");
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [deleteUi, setDeleteUi] = useState<
    null | { kind: "one"; ticket: MarketplaceQuoteTicket } | { kind: "all"; n: number }
  >(null);
  const [cancelUi, setCancelUi] = useState<null | { ticket: MarketplaceQuoteTicket }>(null);
  const [cancelBusyId, setCancelBusyId] = useState<number | null>(null);
  /** Refresco de ítems al abrir detalle (evita cuerpo vacío si el listado vino incompleto). */
  const [detailHydratingId, setDetailHydratingId] = useState<number | null>(null);

  const openOrderDetail = useCallback((tk: MarketplaceQuoteTicket) => {
    setSelected(tk);
    setDetailHydratingId(tk.id);
    void getMyMarketplaceQuoteTicket(tk.id)
      .then(({ ticket }) => {
        setTickets((prev) => prev.map((x) => (x.id === ticket.id ? ticket : x)));
        setSelected((s) => (s?.id === ticket.id ? ticket : s));
      })
      .catch(() => {
        /* se mantiene el snapshot del listado */
      })
      .finally(() => {
        setDetailHydratingId((cur) => (cur === tk.id ? null : cur));
      });
  }, []);

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

  const load = useCallback(async (): Promise<MarketplaceQuoteTicket[]> => {
    setLoadingList(true);
    setLoadErr(null);
    try {
      const { tickets: list } = await getMyMarketplaceQuoteTickets();
      setTickets(list);
      return list;
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : tf("orders.load_err"));
      return [];
    } finally {
      setLoadingList(false);
    }
  }, [tf]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = useCallback(
    (status: string) => {
      const key = `orders.status.${status}`;
      const s = t(key);
      return s !== key ? s : status;
    },
    [t]
  );

  /** En carrito marketplace: solo consultas en curso (no historial descartado/cerrado). */
  const singleOrderAccount = enforceSingleMarketplaceOrderForRole(user?.role);
  const cartScopeTickets = useMemo(() => {
    if (!singleOrderAccount) return tickets;
    return tickets.filter((tk) => isMarketplacePipelineTicketStatus(tk.status));
  }, [tickets, singleOrderAccount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cartScopeTickets;
    return cartScopeTickets.filter((tk) => {
      const stLabel = statusLabel(tk.status).toLowerCase();
      const blob = [tk.orderNumber, tk.ticketCode, tk.status, stLabel].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [cartScopeTickets, search, statusLabel]);

  /**
   * Solo auto-abrir detalle si hay exactamente una orden en curso en el alcance del carrito.
   */
  useLayoutEffect(() => {
    if (loadingList || !user) return;
    if (!singleOrderAccount) return;
    if (cartScopeTickets.length !== 1) return;
    const only = cartScopeTickets[0]!;
    if (!isMarketplacePipelineTicketStatus(only.status)) return;
    if (selected?.id === only.id) return;
    openOrderDetail(only);
  }, [loadingList, user, singleOrderAccount, cartScopeTickets, selected?.id, openOrderDetail]);

  const openDeleteOneDialog = (tk: MarketplaceQuoteTicket) => setDeleteUi({ kind: "one", ticket: tk });

  const openDeleteAllDialog = useCallback(() => {
    if (tickets.length === 0) {
      showToast(t("orders.delete_all_empty"), "warning", t("orders.title"));
      return;
    }
    setDeleteUi({ kind: "all", n: tickets.length });
  }, [tickets.length, t]);

  const executeDelete = useCallback(async () => {
    if (!deleteUi) return;
    if (deleteUi.kind === "one") {
      const tk = deleteUi.ticket;
      const orderLabel = tk.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(tk.id) });
      setDeleteBusyId(tk.id);
      try {
        await deleteMyMarketplaceQuoteTicket(tk.id);
        setTickets((prev) => prev.filter((x) => x.id !== tk.id));
        setSelected((s) => (s?.id === tk.id ? null : s));
        setDeleteUi(null);
        showToast(tf("orders.delete_ok_one_detail", { order: orderLabel }), "success", t("orders.title"));
        void refreshActiveOrderGate();
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("orders.delete_err"), "error", t("orders.title"));
      } finally {
        setDeleteBusyId(null);
      }
      return;
    }
    const total = deleteUi.n;
    setDeleteAllBusy(true);
    try {
      const res = await deleteAllMyMarketplaceQuoteTickets();
      const deletedCount = typeof res.deleted === "number" && res.deleted >= 0 ? res.deleted : total;
      setTickets([]);
      setSelected(null);
      setDeleteUi(null);
      showToast(tf("orders.delete_ok_all_toast", { n: String(deletedCount) }), "success", t("orders.title"));
      void refreshActiveOrderGate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("orders.delete_err"), "error", t("orders.title"));
    } finally {
      setDeleteAllBusy(false);
    }
  }, [deleteUi, tf, t, refreshActiveOrderGate]);

  const executeCancel = useCallback(async () => {
    if (!cancelUi) return;
    const tk = cancelUi.ticket;
    setCancelBusyId(tk.id);
    try {
      await cancelMyMarketplaceQuoteTicket(tk.id);
      const list = await load();
      setCancelUi(null);
      setSelected((s) => (s?.id === tk.id ? null : s));
      showToast(t("orders.cancel_ok"), "success", t("orders.title"));
      window.dispatchEvent(new Event(MARKETPLACE_ACTIVE_ORDER_CHANGED_EVENT));
      void refreshActiveOrderGate();
      /** Sin ninguna orden en curso: volver al carrito (no dejar la pantalla de “orden pendiente” en 0). */
      if (!list.some((x) => isMarketplacePipelineTicketStatus(x.status))) {
        onBackToCart();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("orders.cancel_err"), "error", t("orders.title"));
    } finally {
      setCancelBusyId(null);
    }
  }, [cancelUi, load, onBackToCart, t, refreshActiveOrderGate]);

  const exportExcel = useCallback(() => {
    if (filtered.length === 0) {
      showToast(t("orders.excel_empty"), "warning", t("orders.title"));
      return;
    }
    const h =
      lang === "en"
        ? {
            order: "Order",
            ticket: "Ticket",
            status: "Status",
            lines: "Lines",
            units: "Units",
            total: "Total USD",
            created: "Created",
            updated: "Updated",
          }
        : lang === "pt"
          ? {
              order: "Pedido",
              ticket: "Ticket",
              status: "Status",
              lines: "Linhas",
              units: "Unidades",
              total: "Total USD",
              created: "Criado",
              updated: "Atualizado",
            }
          : {
              order: "Orden",
              ticket: "Ticket",
              status: "Estado",
              lines: "Líneas",
              units: "Unidades",
              total: "Total USD",
              created: "Creado",
              updated: "Actualizado",
            };
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t("orders.excel_sheet").slice(0, 31));
    ws.columns = [
      { header: h.order, key: "order", width: 16 },
      { header: h.ticket, key: "ticket", width: 16 },
      { header: h.status, key: "status", width: 22 },
      { header: h.lines, key: "lines", width: 10 },
      { header: h.units, key: "units", width: 10 },
      { header: h.total, key: "total", width: 14 },
      { header: h.created, key: "created", width: 20 },
      { header: h.updated, key: "updated", width: 20 },
    ];
    filtered.forEach((tk) => {
      ws.addRow({
        order: tk.orderNumber ?? "",
        ticket: tk.ticketCode ?? "",
        status: statusLabel(tk.status),
        lines: tk.lineCount,
        units: tk.unitCount,
        total: tk.subtotalUsd,
        created: formatWhen(tk.createdAt, loc),
        updated: formatWhen(tk.updatedAt, loc),
      });
    });
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D5D46" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    void wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buf]), `MisConsultas_${fecha}.xlsx`);
      showToast(t("orders.excel_ok"), "success", t("orders.title"));
    });
  }, [filtered, lang, loc, statusLabel, t]);

  if (!user) return null;

  const pendingCount = singleOrderAccount
    ? cartScopeTickets.length
    : tickets.filter((x) => isMarketplacePipelineTicketStatus(x.status)).length;
  const showLegacyMultiPipelineHint = Boolean(user && singleOrderAccount) && pendingCount > 1;
  const showStaffOrderTools = canBulkManageMarketplaceMyOrders(user.role);
  /** Una sola orden en curso en el carrito: vista solo-detalle. */
  const soloUnTicketDetalle = Boolean(user && singleOrderAccount) && cartScopeTickets.length === 1;

  const detailClose = () => {
    setDetailHydratingId(null);
    if (soloUnTicketDetalle) {
      onBackToCart();
    } else {
      setSelected(null);
    }
  };

  return (
    <div
      className={`moo-cart-orders-panel${soloUnTicketDetalle ? " moo-cart-orders-panel--solo-detalle-cliente" : ""}`}
    >
      {!soloUnTicketDetalle ? (
        <div className="cti-unified-panel moo-cart-orders-panel__intro">
          <div className="cti-unified-panel__toolbar">
            <div className="cti-filter-search-block">
              <label className="cti-filter-label" htmlFor="moo-cart-search-input">
                {t("orders.search_label")}
              </label>
              <div className="cti-input-group-joined">
                <input
                  id="moo-cart-search-input"
                  type="search"
                  className="cti-search-field"
                  placeholder={t("orders.search_placeholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
                <button type="button" className="cti-btn-limpiar" onClick={() => setSearch("")}>
                  {t("orders.clear_search")}
                </button>
              </div>
            </div>
            {showStaffOrderTools ? (
              <div className="cti-filter-actions">
                <button type="button" className="cti-btn-excel" onClick={() => void exportExcel()} disabled={filtered.length === 0}>
                  <span className="cti-btn-excel-icon" aria-hidden>
                    📊
                  </span>
                  {t("orders.export_excel")}
                </button>
                <button
                  type="button"
                  className="cti-btn-borrar-todo"
                  disabled={tickets.length === 0 || deleteAllBusy || loadingList}
                  onClick={() => openDeleteAllDialog()}
                >
                  <i className="bi bi-trash3" aria-hidden />
                  {t("orders.borrar_todo")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {loadErr ? (
        <div className="alert alert-danger my-2 py-2 small" role="alert">
          {loadErr}
        </div>
      ) : null}

      {showLegacyMultiPipelineHint ? (
        <div className="alert alert-warning my-2 py-2 small" role="status">
          {t("orders.legacy_multi_pipeline")}
        </div>
      ) : null}

      {loadingList ? (
        singleOrderAccount ? (
          <div className="moo-cart-single-detail-loading" aria-busy="true" role="status">
            <div className="moo-cart-single-detail-loading__head" />
            <div className="moo-cart-single-detail-loading__body">
              <div className="moo-cart-single-detail-loading__row moo-cart-single-detail-loading__row--meta" />
              <div className="moo-cart-single-detail-loading__row moo-cart-single-detail-loading__row--wide" />
              <div className="moo-cart-single-detail-loading__row" />
              <div className="moo-cart-single-detail-loading__row" />
              <div className="moo-cart-single-detail-loading__row moo-cart-single-detail-loading__row--short" />
            </div>
          </div>
        ) : (
          <div className="cti-skeleton-grid" aria-hidden>
            {[1, 2].map((i) => (
              <div key={i} className="cti-skeleton-card" />
            ))}
          </div>
        )
      ) : null}

      {!loadingList && cartScopeTickets.length === 0 ? (
        tickets.length > 0 ? (
          <div className="cti-empty py-3">
            <div className="cti-empty-icon" aria-hidden>
              <i className="bi bi-check2-circle" />
            </div>
            <p className="fw-semibold text-secondary mb-1 small">{t("orders.empty_no_active_title")}</p>
            <p className="small mb-0">{t("orders.empty_no_active_p")}</p>
          </div>
        ) : (
          <div className="cti-empty py-3">
            <div className="cti-empty-icon" aria-hidden>
              <i className="bi bi-bag-x" />
            </div>
            <p className="fw-semibold text-secondary mb-1 small">{t("orders.empty_title")}</p>
            <p className="small mb-0">
              {t("orders.empty_p1")} <strong>{t("orders.empty_strong")}</strong> {t("orders.empty_p2")}
            </p>
          </div>
        )
      ) : null}

      {!loadingList && cartScopeTickets.length > 0 && filtered.length === 0 ? (
        <div className="cti-empty py-3">
          <div className="cti-empty-icon" aria-hidden>
            <i className="bi bi-search" />
          </div>
          <p className="fw-semibold text-secondary mb-1 small">{t("orders.no_results_title")}</p>
          <p className="small mb-0">{t("orders.no_results_hint")}</p>
        </div>
      ) : null}

      {/* Un solo ticket en cuenta: nunca mostrar grilla; solo vista detalle. */}
      {!loadingList && filtered.length > 0 && !soloUnTicketDetalle ? (
        <div className="cti-grid moo-cart-orders-grid">
          {filtered.map((tk) => {
            const title = tk.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(tk.id) });
            const pipeline = isMarketplacePipelineTicketStatus(tk.status);
            const onOpen = () => openOrderDetail(tk);
            const onKey = (e: KeyboardEvent<HTMLElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            };
            return (
              <article
                key={tk.id}
                className="cti-card moo-cti-order-card"
                role="button"
                tabIndex={0}
                onClick={onOpen}
                onKeyDown={onKey}
              >
                <div className="cti-card-head">
                  <div className="cti-avatar" aria-hidden>
                    <i className="bi bi-cart-check-fill" />
                  </div>
                  <div className="cti-card-titles">
                    <h3 className="cti-card-name h6 mb-0">{title}</h3>
                    <span className="cti-badge">{statusLabel(tk.status)}</span>
                    <div className="cti-code">{tk.ticketCode}</div>
                  </div>
                </div>
                <div className="cti-rows">
                  <MooRow icon="bi-ticket-perforated" label={t("orders.row_ticket")} value={tk.ticketCode} />
                  <MooRow icon="bi-flag" label={t("orders.row_status")} value={statusLabel(tk.status)} />
                  <MooRow
                    icon="bi-box-seam"
                    label={t("orders.row_items")}
                    value={tf("orders.card_items", { lines: String(tk.lineCount), units: String(tk.unitCount) })}
                  />
                  <MooRow
                    icon="bi-currency-dollar"
                    label={t("orders.row_total")}
                    value={`${tk.subtotalUsd.toLocaleString(loc)} USD`}
                  />
                  <MooRow icon="bi-clock-history" label={t("orders.row_updated")} value={formatWhen(tk.updatedAt, loc)} />
                </div>
                <div className="cti-card-footer moo-cti-card-footer">
                  <button
                    type="button"
                    className="cti-btn-edit moo-cti-footer-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen();
                    }}
                  >
                    <i className="bi bi-eye" aria-hidden />
                    {t("orders.detail_btn")}
                  </button>
                  {pipeline ? (
                    <button
                      type="button"
                      className="moo-cti-btn-cancel-order moo-cti-footer-btn"
                      disabled={cancelBusyId === tk.id || deleteBusyId === tk.id}
                      aria-label={t("orders.cancel_order_aria")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancelUi({ ticket: tk });
                      }}
                    >
                      <i className="bi bi-x-circle" aria-hidden />
                      <span>{t("orders.cancel_order")}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="moo-cti-btn-delete moo-cti-footer-btn"
                      disabled={deleteBusyId === tk.id}
                      aria-label={t("orders.delete_one_aria")}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteOneDialog(tk);
                      }}
                    >
                      <i className="bi bi-trash3" aria-hidden />
                      <span>{t("orders.delete_one")}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {selected ? (
        <aside
          className="market-mis-ord__drawer market-mis-ord__drawer--cti moo-cart-embed-detail moo-order-detail-pro"
          role="region"
          aria-labelledby="moo-cart-detail-title"
        >
          <div className="market-mis-ord__drawer-head moo-order-detail-pro__head">
            <div className="flex-grow-1 min-w-0">
              {!soloUnTicketDetalle ? (
                <button
                  type="button"
                  className="moo-order-detail-pro__back"
                  onClick={() => {
                    setDetailHydratingId(null);
                    setSelected(null);
                  }}
                >
                  <i className="bi bi-arrow-left" aria-hidden /> {t("orders.back_to_list")}
                </button>
              ) : null}
              <p className="moo-order-detail-pro__order-kicker">
                {isMarketplacePipelineTicketStatus(selected.status) ? t("orders.title") : t("orders.title_record")}
              </p>
              <h2 id="moo-cart-detail-title" className="moo-order-detail-pro__order-id mb-0">
                {selected.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(selected.id) })}
              </h2>
              <div className="moo-order-detail-pro__ticket-row">
                <span className="moo-order-detail-pro__ticket-code">{selected.ticketCode}</span>
                <span className={`moo-order-detail-pro__status-pill ${badgeClass(selected.status)}`}>{statusLabel(selected.status)}</span>
              </div>
            </div>
            <button
              type="button"
              className="market-mis-ord__drawer-close moo-order-detail-pro__close"
              onClick={detailClose}
              aria-label={soloUnTicketDetalle ? t("drawer.back_to_cart") : t("orders.drawer_close")}
            >
              ×
            </button>
          </div>
          <div className="market-mis-ord__drawer-body moo-order-detail-pro__body">
            <div className="moo-order-detail-pro__meta-card">
              <div className="moo-order-detail-pro__meta-grid">
                <div className="moo-order-detail-pro__meta-cell">
                  <span className="moo-order-detail-pro__meta-label">{t("orders.detail_meta_created")}</span>
                  <span className="moo-order-detail-pro__meta-value">{formatWhen(selected.createdAt, loc)}</span>
                </div>
                <div className="moo-order-detail-pro__meta-sep" aria-hidden />
                <div className="moo-order-detail-pro__meta-cell">
                  <span className="moo-order-detail-pro__meta-label">{t("orders.detail_meta_updated")}</span>
                  <span className="moo-order-detail-pro__meta-value">{formatWhen(selected.updatedAt, loc)}</span>
                </div>
              </div>
              {selected.lastContactChannel ? (
                <div className="moo-order-detail-pro__channel">
                  <i className="bi bi-shop" aria-hidden />
                  <span>
                    <span className="moo-order-detail-pro__meta-label">{t("orders.channel")} </span>
                    <strong className="moo-order-detail-pro__channel-strong">
                      {selected.lastContactChannel === "portal" ? t("orders.channel_portal") : selected.lastContactChannel}
                    </strong>
                    {selected.contactedAt ? (
                      <span className="moo-order-detail-pro__channel-when"> · {formatWhen(selected.contactedAt, loc)}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="moo-order-detail-pro__lines-section">
              <p className="moo-order-detail-pro__section-kicker">{t("orders.your_order")}</p>
              {detailHydratingId === selected.id ? (
                <div className="moo-order-detail-pro__lines-status" role="status">
                  <div className="spinner-border spinner-border-sm text-success" aria-hidden />
                  <span>{t("orders.detail_lines_loading")}</span>
                </div>
              ) : (() => {
                  const rawItems = selected.items as Array<Record<string, unknown>> | undefined;
                  const lineItems = Array.isArray(rawItems) ? rawItems : [];
                  if (lineItems.length === 0) {
                    return (
                      <div className="moo-order-detail-pro__lines-status moo-order-detail-pro__lines-status--summary">
                        <p className="mb-0">
                          {tf("orders.detail_lines_summary", {
                            lines: String(selected.lineCount),
                            units: String(selected.unitCount),
                            total: selected.subtotalUsd.toLocaleString(loc),
                          })}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <ul className="market-mis-ord__items moo-order-detail-pro__items">
                      {lineItems.map((row, i) => {
                        const qty = Number(row.qty) || 0;
                        const name = marketplaceQuoteTicketLineDisplayName(row);
                        const linePending = ticketRowIsEquipmentPricePending(row);
                        const sub = ticketRowLineSubtotalUsd(row, {
                          setupEquipoCompletoUsd,
                          setupCompraHashrateUsd,
                        });
                        return (
                          <li key={i}>
                            <span className="market-mis-ord__item-name moo-order-detail-pro__item-name">{name}</span>
                            <span className="market-mis-ord__item-qty moo-order-detail-pro__item-qty">×{qty}</span>
                            <span className="market-mis-ord__item-sub moo-order-detail-pro__item-sub">
                              {linePending ? t("orders.detail_line_subtotal_pending") : `${sub.toLocaleString(loc)} USD`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
            </div>

            <p className="moo-order-detail-pro__disclaimer">{t("orders.footer_note")}</p>

            {user && isMarketplacePipelineTicketStatus(selected.status) ? (
              <div className="moo-order-detail-pro__contact-note" role="status">
                {userCelular
                  ? tf("orders.contact_status_email_whatsapp", { email: user.email, whatsapp: userCelular })
                  : userTelefono
                    ? tf("orders.contact_status_email_phone", { email: user.email, phone: userTelefono })
                    : tf("orders.contact_status_email", { email: user.email })}
              </div>
            ) : null}

            <div className="moo-order-detail-pro__total-card moo-order-detail-pro__total-card--footer">
              <div className="moo-order-detail-pro__total-copy">
                <span className="moo-order-detail-pro__total-label">{t("orders.ref_total")}</span>
                <span className="moo-order-detail-pro__total-note">{tf("orders.detail_lines_count", { n: String(selected.lineCount) })}</span>
              </div>
              <span className="moo-order-detail-pro__total-amt">{selected.subtotalUsd.toLocaleString(loc)} USD</span>
            </div>

            <div className="market-mis-ord__drawer-delete-wrap moo-order-detail-pro__actions">
              {isMarketplacePipelineTicketStatus(selected.status) ? (
                <button
                  type="button"
                  className="moo-order-detail-pro__btn-cancel"
                  disabled={cancelBusyId === selected.id}
                  onClick={() => setCancelUi({ ticket: selected })}
                >
                  <span className="moo-order-detail-pro__btn-cancel-icon" aria-hidden>
                    <i className="bi bi-slash-circle" />
                  </span>
                  <span className="moo-order-detail-pro__btn-cancel-text">
                    <span className="moo-order-detail-pro__btn-cancel-title">{t("orders.cancel_order")}</span>
                    <span className="moo-order-detail-pro__btn-cancel-sub">{t("orders.cancel_order_sub")}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="moo-order-detail-pro__btn-delete"
                  disabled={deleteBusyId === selected.id}
                  onClick={() => openDeleteOneDialog(selected)}
                >
                  <span className="moo-order-detail-pro__btn-cancel-icon" aria-hidden>
                    <i className="bi bi-trash3" />
                  </span>
                  <span className="moo-order-detail-pro__btn-cancel-text">
                    <span className="moo-order-detail-pro__btn-cancel-title">{t("orders.delete_drawer")}</span>
                    <span className="moo-order-detail-pro__btn-cancel-sub">{t("orders.delete_drawer_sub")}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </aside>
      ) : null}

      <ConfirmModal
        open={deleteUi !== null}
        elevated
        variant="delete"
        title={
          deleteUi?.kind === "all"
            ? t("orders.modal_delete_all_title")
            : deleteUi?.kind === "one"
              ? t("orders.modal_delete_order_title")
              : ""
        }
        message={
          deleteUi?.kind === "one" ? (
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
              {t("orders.modal_delete_one_before")}
              <strong>
                {deleteUi.ticket.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(deleteUi.ticket.id) })}
              </strong>
              {t("orders.modal_delete_one_after")}
            </p>
          ) : deleteUi?.kind === "all" ? (
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
              {t("orders.modal_delete_all_before")}
              <strong>{deleteUi.n}</strong>
              {t("orders.modal_delete_all_after")}
            </p>
          ) : null
        }
        warningText={t("orders.modal_irreversible")}
        cancelLabel={t("orders.modal_cancel")}
        confirmLabel={t("orders.modal_confirm_delete")}
        confirmPending={
          deleteUi?.kind === "one"
            ? deleteBusyId === deleteUi.ticket.id
            : deleteUi?.kind === "all"
              ? deleteAllBusy
              : false
        }
        confirmPendingLabel={t("orders.modal_deleting")}
        onCancel={() => {
          if (deleteBusyId !== null || deleteAllBusy) return;
          setDeleteUi(null);
        }}
        onConfirm={() => void executeDelete()}
      />

      <ConfirmModal
        open={cancelUi !== null}
        elevated
        variant="warning"
        title={t("orders.modal_cancel_order_title")}
        message={
          cancelUi ? (
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
              {t("orders.modal_cancel_order_before")}
              <strong>
                {cancelUi.ticket.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(cancelUi.ticket.id) })}
              </strong>
              {t("orders.modal_cancel_order_after")}
            </p>
          ) : null
        }
        cancelLabel={t("orders.modal_cancel")}
        confirmLabel={t("orders.modal_confirm_cancel_order")}
        confirmPending={cancelUi != null && cancelBusyId === cancelUi.ticket.id}
        confirmPendingLabel={t("orders.modal_canceling")}
        onCancel={() => {
          if (cancelBusyId !== null) return;
          setCancelUi(null);
        }}
        onConfirm={() => void executeCancel()}
      />
    </div>
  );
}
