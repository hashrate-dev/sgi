import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Navigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getMarketplaceSetupQuotePrices, getMyMarketplaceQuoteTickets, type MarketplaceQuoteTicket } from "../lib/api.js";
import { ticketRowLineSubtotalUsd, QUOTE_ADDON_SETUP_USD_FALLBACK } from "../lib/marketplaceQuoteCart.js";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext.js";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader.js";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter.js";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../lib/i18n.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/marketplace-hashrate.css";
import "../styles/facturacion.css";
import "../styles/hrs-clientes-tienda-online.css";
import "../styles/hrs-marketplace-mis-ordenes-cti.css";

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

export function MarketplaceMisOrdenesPage() {
  const { lang, t, tf } = useMarketplaceLang();
  const loc = marketplaceLocale(lang);
  const { user, loading } = useAuth();
  const [tickets, setTickets] = useState<MarketplaceQuoteTicket[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<MarketplaceQuoteTicket | null>(null);
  const [search, setSearch] = useState("");
  const [setupEquipoCompletoUsd, setSetupEquipoCompletoUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);
  const [setupCompraHashrateUsd, setSetupCompraHashrateUsd] = useState(QUOTE_ADDON_SETUP_USD_FALLBACK);

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

  const load = useCallback(async () => {
    setLoadingList(true);
    setLoadErr(null);
    try {
      const { tickets: list } = await getMyMarketplaceQuoteTickets();
      setTickets(list);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : tf("orders.load_err"));
    } finally {
      setLoadingList(false);
    }
  }, [tf]);

  useEffect(() => {
    if (!loading && user && canUseMarketplaceQuoteCart(user.role)) {
      void load();
    }
  }, [loading, user, load]);

  const statusLabel = useCallback(
    (status: string) => {
      const key = `orders.status.${status}`;
      const s = t(key);
      return s !== key ? s : status;
    },
    [t]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((tk) => {
      const stLabel = statusLabel(tk.status).toLowerCase();
      const blob = [tk.orderNumber, tk.ticketCode, tk.status, stLabel].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [tickets, search, statusLabel]);

  const exportExcel = useCallback(() => {
    if (filtered.length === 0) {
      showToast(t("orders.excel_empty"), "warning", "Tienda");
      return;
    }
    const en = lang === "en";
    const h = {
      order: en ? "Order" : "Orden",
      ticket: en ? "Ticket" : "Ticket",
      status: en ? "Status" : "Estado",
      lines: en ? "Lines" : "Líneas",
      units: en ? "Units" : "Unidades",
      total: en ? "Total USD" : "Total USD",
      created: en ? "Created" : "Creado",
      updated: en ? "Updated" : "Actualizado",
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
      showToast(t("orders.excel_ok"), "success", "Tienda");
    });
  }, [filtered, lang, loc, statusLabel, t]);

  if (!loading && (!user || !canUseMarketplaceQuoteCart(user.role))) {
    return <Navigate to="/marketplace/login" replace state={{ from: "orders" }} />;
  }

  if (loading || !user) {
    return (
      <div className="marketplace-asic-page">
        <div className="bg-mesh" aria-hidden />
        <MarketplaceSiteHeader />
        <main className="page-main page-main--market p-4">
          <p className="market-intro__desc">{t("orders.loading")}</p>
        </main>
        <MarketplaceSiteFooter />
      </div>
    );
  }

  const pendingCount = tickets.filter((x) => ["enviado_consulta", "en_gestion", "respondido"].includes(x.status)).length;

  const recordsMeta =
    tickets.length === 1
      ? tf("orders.meta_records_one", { n: String(tickets.length) })
      : tf("orders.meta_records_other", { n: String(tickets.length) });

  return (
    <div className="marketplace-asic-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-mis-ordenes">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <div className="container py-3 py-md-4 cti-page moo-cti-wrap">
            <div className="cti-unified-panel">
              <div className="cti-unified-panel__intro">
                <h1 className="mb-0">{t("orders.title")}</h1>
                <p className="mt-2 mb-0">{t("orders.intro")}</p>
                <p className="cti-unified-meta">
                  <i className="bi bi-receipt-cutoff" aria-hidden />
                  <span>
                    {recordsMeta}
                    {search.trim() ? (
                      <>
                        {" "}
                        {tf("orders.meta_filtered", { n: String(filtered.length) })}
                      </>
                    ) : null}
                  </span>
                </p>
                {pendingCount > 0 ? (
                  <p className="cti-unified-meta" style={{ marginTop: "0.35rem" }}>
                    <i className="bi bi-hourglass-split" aria-hidden />
                    <span>
                      <strong>{pendingCount}</strong> {t("orders.kpi_suffix")}
                    </span>
                  </p>
                ) : null}
              </div>

              <hr className="cti-unified-panel__divider" />

              <div className="cti-unified-panel__toolbar">
                <div className="cti-filter-search-block">
                  <label className="cti-filter-label" htmlFor="moo-search-input">
                    {t("orders.search_label")}
                  </label>
                  <div className="cti-input-group-joined">
                    <input
                      id="moo-search-input"
                      type="search"
                      className="cti-search-field"
                      placeholder={t("orders.search_placeholder")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoComplete="off"
                    />
                    <button type="button" className="cti-btn-limpiar" onClick={() => setSearch("")}>
                      {lang === "en" ? "Clear" : "Limpiar"}
                    </button>
                  </div>
                </div>
                <div className="cti-filter-actions">
                  <button type="button" className="cti-btn-excel" onClick={() => void exportExcel()} disabled={filtered.length === 0}>
                    <span className="cti-btn-excel-icon" aria-hidden>
                      📊
                    </span>
                    {t("orders.export_excel")}
                  </button>
                  <button type="button" className="cti-btn-borrar-todo" disabled title={t("orders.borrar_na_title")}>
                    <i className="bi bi-trash3" aria-hidden />
                    {t("orders.borrar_todo")}
                  </button>
                </div>
              </div>
            </div>

            {loadErr ? (
              <div className="alert alert-danger mb-3" role="alert">
                {loadErr}
              </div>
            ) : null}

            {loadingList ? (
              <div className="cti-skeleton-grid" aria-hidden>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="cti-skeleton-card" />
                ))}
              </div>
            ) : null}

            {!loadingList && tickets.length === 0 ? (
              <div className="cti-empty">
                <div className="cti-empty-icon" aria-hidden>
                  <i className="bi bi-bag-x" />
                </div>
                <p className="fw-semibold text-secondary mb-1">{t("orders.empty_title")}</p>
                <p className="small mb-0">
                  {t("orders.empty_p1")} <strong>{t("orders.empty_strong")}</strong> {t("orders.empty_p2")}
                </p>
              </div>
            ) : null}

            {!loadingList && tickets.length > 0 && filtered.length === 0 ? (
              <div className="cti-empty">
                <div className="cti-empty-icon" aria-hidden>
                  <i className="bi bi-search" />
                </div>
                <p className="fw-semibold text-secondary mb-1">{t("orders.no_results_title")}</p>
                <p className="small mb-0">{t("orders.no_results_hint")}</p>
              </div>
            ) : null}

            {!loadingList && filtered.length > 0 ? (
              <div className="cti-grid">
                {filtered.map((tk) => {
                  const title = tk.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(tk.id) });
                  const onOpen = () => setSelected(tk);
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
                          <h2 className="cti-card-name">{title}</h2>
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
                        <MooRow
                          icon="bi-clock-history"
                          label={t("orders.row_updated")}
                          value={formatWhen(tk.updatedAt, loc)}
                        />
                      </div>
                      <div className="cti-card-footer">
                        <span className="cti-btn-edit">
                          <i className="bi bi-eye" aria-hidden />
                          {t("orders.detail_btn")}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </main>
        <MarketplaceSiteFooter />
      </div>

      {selected ? (
        <div
          className="market-mis-ord__overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside
            className="market-mis-ord__drawer market-mis-ord__drawer--cti"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mis-ord-drawer-title"
          >
            <div className="market-mis-ord__drawer-head">
              <div>
                <h2 id="mis-ord-drawer-title">
                  {selected.orderNumber ?? tf("orders.drawer_order_fallback", { id: String(selected.id) })}
                </h2>
                <p className="market-mis-ord__drawer-sub mb-0">
                  {selected.ticketCode} · <span className={badgeClass(selected.status)}>{statusLabel(selected.status)}</span>
                </p>
              </div>
              <button
                type="button"
                className="market-mis-ord__drawer-close"
                onClick={() => setSelected(null)}
                aria-label={t("orders.drawer_close")}
              >
                ×
              </button>
            </div>
            <div className="market-mis-ord__drawer-body">
              <p className="small text-muted">
                {tf("orders.created_updated", {
                  created: formatWhen(selected.createdAt, loc),
                  updated: formatWhen(selected.updatedAt, loc),
                })}
              </p>
              {selected.lastContactChannel ? (
                <p className="small mb-2">
                  {t("orders.channel")}{" "}
                  <strong>
                    {selected.lastContactChannel === "portal" ? t("orders.channel_portal") : selected.lastContactChannel}
                  </strong>
                  {selected.contactedAt ? ` · ${formatWhen(selected.contactedAt, loc)}` : ""}
                </p>
              ) : null}
              <p className="market-mis-ord__drawer-total mb-3">
                {t("orders.ref_total")} <strong>{selected.subtotalUsd.toLocaleString(loc)} USD</strong>
              </p>
              <p className="market-mis-ord__section-label">{t("orders.your_order")}</p>
              <ul className="market-mis-ord__items">
                {(selected.items as Array<Record<string, unknown>>).map((row, i) => {
                  const qty = Number(row.qty) || 0;
                  const name = `${String(row.brand ?? "")} ${String(row.model ?? "")}`.trim() || String(row.productId ?? "—");
                  const sub = ticketRowLineSubtotalUsd(row, {
                    setupEquipoCompletoUsd,
                    setupCompraHashrateUsd,
                  });
                  return (
                    <li key={i}>
                      <span className="market-mis-ord__item-name">{name}</span>
                      <span className="market-mis-ord__item-qty">×{qty}</span>
                      <span className="market-mis-ord__item-sub">{sub.toLocaleString(loc)} USD</span>
                    </li>
                  );
                })}
              </ul>
              <p className="small text-muted mt-3 mb-0">{t("orders.footer_note")}</p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
