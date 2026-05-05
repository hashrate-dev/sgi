import { useMemo } from "react";
import { formatCurrency } from "../lib/formatCurrency";
import { MonitorFinancieroSectionHeader } from "./MonitorFinancieroSectionHeader";

export type ProveedorGastoRow = {
  code: string;
  name: string;
  totalUsd: number;
  n: number;
};

/** Misma familia cromática que el donut de rubros / monitor (#2563eb, verdes, violetas). */
const BAR_PALETTE = ["#2563eb", "#059669", "#7c3aed", "#ea580c", "#0ea5e9", "#db2777", "#ca8a04", "#14b8a6"];

type Props = {
  rows: ProveedorGastoRow[];
  totalPeriodoUsd: number;
  /** Texto bajo el título (ej. filtro de mes activo). */
  hint?: string;
};

export function GastosPorProveedorListCard({ rows, totalPeriodoUsd, hint }: Props) {
  const maxUsd = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.totalUsd), 0) : 0), [rows]);

  return (
    <section className="monitor-financiero-prov-list" aria-label="Gastos por proveedor en USD">
      <MonitorFinancieroSectionHeader variant="card" title="Gastos por proveedor (USD)" subtitle={hint} />

      {rows.length === 0 ? (
        <p className="monitor-financiero-prov-list__empty text-muted small mb-0">No hay proveedores con gastos en el período filtrado.</p>
      ) : (
        <ul className="monitor-financiero-prov-list__ul">
          {rows.map((row, i) => {
            const color = BAR_PALETTE[i % BAR_PALETTE.length]!;
            const pct = maxUsd > 0 ? Math.min(100, (row.totalUsd / maxUsd) * 100) : 0;
            return (
              <li key={row.code} className="monitor-financiero-prov-list__item">
                <span className="monitor-financiero-prov-list__dot" style={{ background: color }} aria-hidden />
                <div className="monitor-financiero-prov-list__label">
                  <code className="monitor-financiero-prov-list__code">{row.code}</code>
                  <span className="monitor-financiero-prov-list__name">{row.name}</span>
                  <span className="monitor-financiero-prov-list__mov">{row.n} mov.</span>
                </div>
                <div className="monitor-financiero-prov-list__viz">
                  <div className="monitor-financiero-prov-list__track">
                    <div
                      className="monitor-financiero-prov-list__fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="monitor-financiero-prov-list__amount">{formatCurrency(row.totalUsd)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="monitor-financiero-prov-list__foot">
        <div>
          <p className="monitor-financiero-prov-list__foot-label">Total del período</p>
          <p className="monitor-financiero-prov-list__foot-sub"></p>
        </div>
        <p className="monitor-financiero-prov-list__foot-value">{formatCurrency(totalPeriodoUsd)}</p>
      </footer>
    </section>
  );
}
