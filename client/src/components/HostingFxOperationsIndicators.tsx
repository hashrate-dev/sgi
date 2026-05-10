import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HostingFxOperation } from "../lib/api";
import { hostingFxIsHostingCommissionUsdBank } from "../lib/hostingFxOperationClassification";
import { hostingFxOperationProfitUsd } from "../lib/hostingFxOperationProfit";

export type HostingFxOperationsIndicatorsProps = {
  operations: HostingFxOperation[];
  tableLoading: boolean;
  /** KPI opcional (historial): suma «Suma 4% transf.» de la tabla de facturas hosting con recibo pagado */
  facturasTransferCommissionKpi?: {
    sumUsd: number;
    /** Cantidad de facturas en el listado filtrado que aportan a la comisión */
    invoiceCount: number;
  };
};

export function HostingFxOperationsIndicators({
  operations,
  tableLoading,
  facturasTransferCommissionKpi,
}: HostingFxOperationsIndicatorsProps) {
  const exchangeOpsStats = useMemo(() => {
    let totalGanancias = 0;
    let montoVentaUsd = 0;
    let montoCompraUsd = 0;
    let montoTransferenciaVentaUsdt = 0;
    let montoTransferenciaCompraDeUsdt = 0;
    let montoTransferHostingBankUsdt = 0;
    for (const op of operations) {
      totalGanancias += hostingFxOperationProfitUsd(op);
      const amt = Number.isFinite(op.operationAmount) ? op.operationAmount : 0;
      const transfer = Number.isFinite(op.clientTotalPayment) ? op.clientTotalPayment : 0;
      const hostingUsdBanco = hostingFxIsHostingCommissionUsdBank(op);
      if (op.usdtSide === "sell_usdt" && !hostingUsdBanco) {
        montoVentaUsd += amt;
        montoTransferenciaVentaUsdt += transfer;
      } else if (op.usdtSide === "buy_usdt" || hostingUsdBanco) {
        montoCompraUsd += amt;
        if (hostingUsdBanco) {
          montoTransferHostingBankUsdt += transfer;
        } else {
          montoTransferenciaCompraDeUsdt += transfer;
        }
      }
    }
    return {
      totalGanancias,
      count: operations.length,
      montoVentaUsd,
      montoCompraUsd,
      montoTransferenciaVentaUsdt,
      montoTransferenciaCompraDeUsdt,
      montoTransferHostingBankUsdt,
    };
  }, [operations]);

  const totalGananciasMasComisionesUsd = useMemo(() => {
    const sumComision = facturasTransferCommissionKpi?.sumUsd;
    if (sumComision == null) return 0;
    return exchangeOpsStats.totalGanancias + sumComision;
  }, [exchangeOpsStats.totalGanancias, facturasTransferCommissionKpi?.sumUsd]);

  /** Referencia del KPI «Rendimiento» para igualar altura del KPI «Comisión» en la misma columna (desktop). */
  const rendimientoKpiRef = useRef<HTMLElement | null>(null);
  const [comisionKpiMinHeightPx, setComisionKpiMinHeightPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (facturasTransferCommissionKpi == null) {
      setComisionKpiMinHeightPx(undefined);
      return;
    }
    const src = rendimientoKpiRef.current;
    if (!src) return;

    const mq = window.matchMedia("(min-width: 1200px)");
    const sync = () => {
      if (!mq.matches) {
        setComisionKpiMinHeightPx(undefined);
        return;
      }
      setComisionKpiMinHeightPx(src.offsetHeight);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(src);
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);

    return () => {
      ro.disconnect();
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, [facturasTransferCommissionKpi, operations, tableLoading]);

  const gridExtraClass = facturasTransferCommissionKpi != null ? " hosting-fx-ops-indicators__grid--with-transfer-kpi" : "";

  return (
    <section className="hosting-fx-ops-indicators mb-4 mt-3" aria-label="Indicadores de operaciones" aria-live="polite">
      <div className={`hosting-fx-ops-indicators__grid${gridExtraClass}`} role="presentation">
        <article
          ref={rendimientoKpiRef}
          className="hosting-fx-ops-metric hosting-fx-ops-metric--profit"
          aria-label="Total de ganancias en USD"
        >
          <div className="hosting-fx-ops-metric__top">
            <div className="hosting-fx-ops-metric__icon" aria-hidden>
              <i className="bi bi-currency-dollar" />
            </div>
            <div className="hosting-fx-ops-metric__intro">
              <span className="hosting-fx-ops-metric__eyebrow">COMISIÓN CAMBIO</span>
              <h3 className="hosting-fx-ops-metric__title">Total de Ganancia Cambio</h3>
            </div>
          </div>
          <p className="hosting-fx-ops-metric__figure">
            {tableLoading ? (
              <span className="hosting-fx-ops-metric__loading">Cargando…</span>
            ) : (
              new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(exchangeOpsStats.totalGanancias)
            )}
          </p>
        </article>
        <article className="hosting-fx-ops-metric hosting-fx-ops-metric--count" aria-label="Cantidad de operaciones en el listado">
          <div className="hosting-fx-ops-metric__top">
            <div className="hosting-fx-ops-metric__icon" aria-hidden>
              <i className="bi bi-journal-text" />
            </div>
            <div className="hosting-fx-ops-metric__intro">
              <span className="hosting-fx-ops-metric__eyebrow">VOLUMEN DE CAMBIO</span>
              <h3 className="hosting-fx-ops-metric__title">Cantidad Operaciones</h3>
            </div>
          </div>
          <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--count">
            {tableLoading ? <span className="hosting-fx-ops-metric__loading">—</span> : exchangeOpsStats.count}
          </p>
        </article>
        <article
          className="hosting-fx-ops-metric hosting-fx-ops-metric--sell"
          aria-label="Monto operación: cliente pagó con USDT (excluye 4% Hosting USD banco)"
        >
          <div className="hosting-fx-ops-metric__top">
            <div className="hosting-fx-ops-metric__icon" aria-hidden>
              <i className="bi bi-arrow-up-right" />
            </div>
            <div className="hosting-fx-ops-metric__intro">
              <span className="hosting-fx-ops-metric__eyebrow">
                Compra de USD
                <br />
                (Cliente paga con USDT)
              </span>
              <div className="hosting-fx-ops-metric__title-with-info">
                <h3 className="hosting-fx-ops-metric__title" id="hosting-fx-metric-sell-title">
                  Monto Total Movido
                </h3>
                <span className="hosting-fx-ops-metric__info-trig">
                  <button
                    type="button"
                    className="hosting-fx-ops-metric__info-btn"
                    aria-label="Más información sobre compra de USD (cliente paga con USDT) en este resumen"
                    aria-describedby="hosting-fx-metric-sell-tip"
                  >
                    <i className="bi bi-info-circle" aria-hidden />
                  </button>
                  <span className="hosting-fx-ops-metric__info-bubble" id="hosting-fx-metric-sell-tip" role="tooltip">
                    Operaciones donde el cliente pagó en USDT (Binance). No incluye 4% Hosting con pago USD vía banco.
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="hosting-fx-ops-metric__figure-stack">
            <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--usdt">
              {tableLoading ? (
                <span className="hosting-fx-ops-metric__loading">Cargando…</span>
              ) : (
                <>
                  +
                  {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    exchangeOpsStats.montoVentaUsd
                  )}{" "}
                  <span className="hosting-fx-ops-metric__unit">USDT</span>
                </>
              )}
            </p>
            {!tableLoading && (
              <p
                className="hosting-fx-ops-metric__figure-sub hosting-fx-ops-metric__figure-sub--transfer-usdt-neg"
                aria-label="Suma de monto transferencia en USD, operaciones con compra de USD (cliente)"
              >
                −
                {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                  exchangeOpsStats.montoTransferenciaVentaUsdt
                )}{" "}
                <span className="hosting-fx-ops-metric__unit">USD</span>
              </p>
            )}
          </div>
        </article>
        <article
          className="hosting-fx-ops-metric hosting-fx-ops-metric--buy"
          aria-label="Monto operación: cliente paga con USD (compra USDT o 4% Hosting vía banco)"
        >
          <div className="hosting-fx-ops-metric__top">
            <div className="hosting-fx-ops-metric__icon" aria-hidden>
              <i className="bi bi-arrow-down-left" />
            </div>
            <div className="hosting-fx-ops-metric__intro">
              <span className="hosting-fx-ops-metric__eyebrow">
                Compra de USDT
                <br />
                (Cliente paga con USD)
              </span>
              <div className="hosting-fx-ops-metric__title-with-info">
                <h3 className="hosting-fx-ops-metric__title" id="hosting-fx-metric-buy-title">
                  Monto Total Movido
                </h3>
                <span className="hosting-fx-ops-metric__info-trig">
                  <button
                    type="button"
                    className="hosting-fx-ops-metric__info-btn"
                    aria-label="Más información sobre compra de USDT (cliente paga con USD) en este resumen"
                    aria-describedby="hosting-fx-metric-buy-tip"
                  >
                    <i className="bi bi-info-circle" aria-hidden />
                  </button>
                  <span className="hosting-fx-ops-metric__info-bubble" id="hosting-fx-metric-buy-tip" role="tooltip">
                    Incluye compra de USDT (cliente paga USD) y operaciones 4% Hosting con pago USD vía banco.
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="hosting-fx-ops-metric__figure-stack">
            <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--usdt">
              {tableLoading ? (
                <span className="hosting-fx-ops-metric__loading">Cargando…</span>
              ) : (
                <>
                  +
                  {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    exchangeOpsStats.montoCompraUsd
                  )}{" "}
                  <span className="hosting-fx-ops-metric__unit">USD</span>
                </>
              )}
            </p>
            {!tableLoading && exchangeOpsStats.montoTransferenciaCompraDeUsdt > 0 ? (
              <p
                className="hosting-fx-ops-metric__figure-sub hosting-fx-ops-metric__figure-sub--transfer-usdt-neg"
                aria-label="Suma de monto transferencia en USDT, operaciones con compra de USDT (cliente)"
              >
                −
                {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                  exchangeOpsStats.montoTransferenciaCompraDeUsdt
                )}{" "}
                <span className="hosting-fx-ops-metric__unit">USDT</span>
              </p>
            ) : null}
            {!tableLoading && exchangeOpsStats.montoTransferHostingBankUsdt > 0 ? (
              <p
                className="hosting-fx-ops-metric__figure-sub hosting-fx-ops-metric__figure-sub--transfer-usdt-neg"
                aria-label="Suma de monto transferencia en USDT, operaciones 4% Hosting con pago vía banco"
              >
                −
                {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                  exchangeOpsStats.montoTransferHostingBankUsdt
                )}{" "}
                <span className="hosting-fx-ops-metric__unit">USDT</span>
              </p>
            ) : null}
          </div>
        </article>
        {facturasTransferCommissionKpi != null ? (
          <>
            <div
              className="hosting-fx-ops-transfer-invoices-kpi hosting-fx-ops-row2-kpi-wrap"
              style={comisionKpiMinHeightPx != null ? { minHeight: comisionKpiMinHeightPx } : undefined}
            >
              <article
                className="hosting-fx-ops-metric hosting-fx-ops-metric--profit"
                aria-label="Suma total comisión 4% gastos operativos transferencia en facturas hosting"
              >
                <div className="hosting-fx-ops-metric__top">
                  <div className="hosting-fx-ops-metric__icon" aria-hidden>
                    <i className="bi bi-percent" />
                  </div>
                  <div className="hosting-fx-ops-metric__intro">
                    <span className="hosting-fx-ops-metric__eyebrow">Comisión Hosting</span>
                    <h3 className="hosting-fx-ops-metric__title">Total Comisiones Hosting</h3>
                  </div>
                </div>
                <p className="hosting-fx-ops-metric__figure">
                  {tableLoading ? (
                    <span className="hosting-fx-ops-metric__loading">Cargando…</span>
                  ) : (
                    new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(
                      facturasTransferCommissionKpi.sumUsd
                    )
                  )}
                </p>
              </article>
            </div>
            <div
              className="hosting-fx-ops-volume-change-kpi hosting-fx-ops-row2-kpi-wrap"
              style={comisionKpiMinHeightPx != null ? { minHeight: comisionKpiMinHeightPx } : undefined}
            >
              <article
                className="hosting-fx-ops-metric hosting-fx-ops-metric--count"
                aria-label="Cantidad de facturas hosting con comisión por transferencia en el listado filtrado"
              >
                <div className="hosting-fx-ops-metric__top">
                  <div className="hosting-fx-ops-metric__icon" aria-hidden>
                    <i className="bi bi-file-earmark-text" />
                  </div>
                  <div className="hosting-fx-ops-metric__intro">
                    <span className="hosting-fx-ops-metric__eyebrow">Volumen de cambio Hosting</span>
                    <h3 className="hosting-fx-ops-metric__title">Cantidad Operaciones</h3>
                  </div>
                </div>
                <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--count">
                  {tableLoading ? (
                    <span className="hosting-fx-ops-metric__loading">—</span>
                  ) : (
                    facturasTransferCommissionKpi.invoiceCount
                  )}
                </p>
              </article>
            </div>
            <div
              className="hosting-fx-ops-consolidated-kpi hosting-fx-ops-row2-kpi-wrap"
              style={comisionKpiMinHeightPx != null ? { minHeight: comisionKpiMinHeightPx } : undefined}
            >
              <article
                className="hosting-fx-ops-metric hosting-fx-ops-metric--grand-total"
                aria-label="Total de ganancias en operaciones más total de comisiones hosting en USD"
              >
                <div className="hosting-fx-ops-metric__top">
                  <div className="hosting-fx-ops-metric__icon" aria-hidden>
                    <i className="bi bi-cash-stack" />
                  </div>
                  <div className="hosting-fx-ops-metric__intro">
                    <span className="hosting-fx-ops-metric__eyebrow">Rendimiento + comisiones</span>
                    <h3 className="hosting-fx-ops-metric__title">Total Comisiones Cambio</h3>
                  </div>
                </div>
                <p className="hosting-fx-ops-metric__figure">
                  {tableLoading ? (
                    <span className="hosting-fx-ops-metric__loading">Cargando…</span>
                  ) : (
                    new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(
                      totalGananciasMasComisionesUsd
                    )
                  )}
                </p>
              </article>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
