import { useMemo } from "react";
import { formatCurrency } from "../lib/formatCurrency";
import { MonitorFinancieroSectionHeader } from "./MonitorFinancieroSectionHeader";

const BAR_PALETTE = ["#2563eb", "#059669", "#7c3aed", "#ea580c", "#0ea5e9", "#db2777", "#ca8a04", "#14b8a6"];

export type MedioPagoBucketsSummary = {
  total: number;
  cantidad: number;
  bank: number;
  stable: number;
  pesos: number;
  gs: number;
  other: number;
};

type Row =
  | { id: string; kind: "total"; title: string; amount: number }
  | { id: string; kind: "count"; title: string; amount: number }
  | { id: string; kind: "currency"; title: string; hint?: string; amount: number };

type Props = {
  buckets: MedioPagoBucketsSummary;
  hint?: string;
};

function buildRows(b: MedioPagoBucketsSummary): Row[] {
  const medios: Row[] = [
    { id: "bank", kind: "currency", title: "Banco / contado USD", hint: "Santander, Interfisa, USD contado", amount: b.bank },
    { id: "stable", kind: "currency", title: "USDT / USDC", hint: "Stablecoins", amount: b.stable },
    { id: "pesos", kind: "currency", title: "Equiv. USD (pesos)", hint: "Medio pesos Uruguayos", amount: b.pesos },
    { id: "gs", kind: "currency", title: "Equiv. USD (guaraníes)", hint: "Medio Gs contado", amount: b.gs },
  ];
  if (b.other > 0.005) {
    medios.push({ id: "other", kind: "currency", title: "Otros medios", amount: b.other });
  }
  return [
    { id: "sum-total", kind: "total", title: "Total acumulado", amount: b.total },
    { id: "mov", kind: "count", title: "Movimientos", amount: b.cantidad },
    ...medios,
  ];
}

export function GastosPorMedioPagoListCard({ buckets, hint }: Props) {
  const rows = useMemo(() => buildRows(buckets), [buckets]);
  const totalRef = buckets.total;
  const sinDatos = buckets.total <= 0.005 && buckets.cantidad === 0;

  return (
    <section className="monitor-financiero-prov-list monitor-financiero-prov-list--medios" aria-label="Gastos por medio de pago en USD">
      <MonitorFinancieroSectionHeader variant="card" title="Gastos por medio de pago (USD)" subtitle={hint} />

      {sinDatos ? (
        <p className="monitor-financiero-prov-list__empty text-muted small mb-0">
          No hay gastos por medio de pago en el período filtrado.
        </p>
      ) : (
        <ul className="monitor-financiero-prov-list__ul">
          {rows.map((row, i) => {
            const color = BAR_PALETTE[i % BAR_PALETTE.length]!;
            if (row.kind === "total") {
              return (
                <li key={row.id} className="monitor-financiero-prov-list__item monitor-financiero-prov-list__item--highlight">
                  <span className="monitor-financiero-prov-list__dot" style={{ background: "#1e3a5f" }} aria-hidden />
                  <div className="monitor-financiero-prov-list__label monitor-financiero-prov-list__label--stack">
                    <span className="monitor-financiero-prov-list__name">{row.title}</span>
                  </div>
                  <div className="monitor-financiero-prov-list__viz">
                    <div className="monitor-financiero-prov-list__track">
                      <div className="monitor-financiero-prov-list__fill" style={{ width: "100%", background: "#1e3a5f" }} />
                    </div>
                    <span className="monitor-financiero-prov-list__amount">{formatCurrency(row.amount)}</span>
                  </div>
                </li>
              );
            }
            if (row.kind === "count") {
              return (
                <li key={row.id} className="monitor-financiero-prov-list__item">
                  <span className="monitor-financiero-prov-list__dot" style={{ background: "#64748b" }} aria-hidden />
                  <div className="monitor-financiero-prov-list__label monitor-financiero-prov-list__label--stack">
                    <span className="monitor-financiero-prov-list__name">{row.title}</span>
                  </div>
                  <div className="monitor-financiero-prov-list__viz monitor-financiero-prov-list__viz--plain">
                    <span className="monitor-financiero-prov-list__amount monitor-financiero-prov-list__amount--mov">
                      {row.amount}
                    </span>
                  </div>
                </li>
              );
            }
            const pct =
              totalRef > 0 && Number.isFinite(row.amount) ? Math.min(100, (row.amount / totalRef) * 100) : 0;
            return (
              <li key={row.id} className="monitor-financiero-prov-list__item">
                <span className="monitor-financiero-prov-list__dot" style={{ background: color }} aria-hidden />
                <div className="monitor-financiero-prov-list__label monitor-financiero-prov-list__label--stack">
                  <span className="monitor-financiero-prov-list__name">{row.title}</span>
                  {row.hint ? (
                    <span className="monitor-financiero-prov-list__medios-hint">{row.hint}</span>
                  ) : null}
                </div>
                <div className="monitor-financiero-prov-list__viz">
                  <div className="monitor-financiero-prov-list__track">
                    <div className="monitor-financiero-prov-list__fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="monitor-financiero-prov-list__amount">{formatCurrency(row.amount)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="monitor-financiero-prov-list__foot">
        <div>
          <p className="monitor-financiero-prov-list__foot-label">Total del período</p>
          <p className="monitor-financiero-prov-list__foot-sub">
            {buckets.cantidad} movimiento{buckets.cantidad === 1 ? "" : "s"}
          </p>
        </div>
        <p className="monitor-financiero-prov-list__foot-value">{formatCurrency(buckets.total)}</p>
      </footer>
    </section>
  );
}
