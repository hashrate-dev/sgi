import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessFinanzaContabilidadHub } from "../lib/auth";
import {
  getContabilidadGastos,
  getHostingFxOperations,
  getInvoices,
  getProveedoresHrs,
  type ContabilidadGasto,
  type HostingFxOperation,
  type ProveedorHrs,
} from "../lib/api";
import { computeTripleKpiResult, type InvoiceMonthNetRow } from "../lib/monitorTripleIngresoKpi";
import {
  MonitorGastosMensualCard,
  collectYearsFromPresupuestoItems,
  filterGastosByPresupuestoMes,
} from "../components/MonitorGastosMensualCard";
import { GastosPorRubroDonut } from "../components/GastosPorRubroDonut";
import { GastosPorProveedorListCard } from "../components/GastosPorProveedorListCard";
import { GastosPorMedioPagoListCard } from "../components/GastosPorMedioPagoListCard";
import { CambioGananciasMensualAreaCard } from "../components/CambioGananciasMensualAreaCard";
import "../styles/facturacion.css";
import "../styles/reportes-dashboard.css";

/** Medios contabilidad considerados pago en USD «clásico» (banco / contado). */
const MEDIOS_USD_FIAT = new Set([
  "USD BANCO SANTANDER UY",
  "USD BANCO INTERFISA",
  "USD CONTADO",
]);

/** Stablecoins en registro. */
const MEDIOS_USDT_USDC = new Set(["USDT BINANCE", "USDC BINANCE"]);

const MEDIO_PESOS_CONTADO = "PESOS URUGUAYOS CONTADO";
const MEDIO_GS_CONTADO = "GS CONTADO";

function normalizeMedio(raw: string): string {
  return String(raw ?? "").trim();
}

/** Reparte cada movimiento (ya en USD) en un solo bucket según medio de pago. */
function mapInvoicesToMonthRows(inv: { invoices?: Array<{ type: string; month: string; total: number }> }): InvoiceMonthNetRow[] {
  return (inv.invoices ?? []).map((x) => ({
    type: String(x.type ?? ""),
    month: String(x.month ?? ""),
    total: Number(x.total) || 0,
  }));
}

/** Etiqueta de mes para el selector global (misma convención que las tarjetas del monitor). */
function formatMonthShortEs(ym: string): string {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return ym;
  const [ys, ms] = t.split("-");
  const y = Number.parseInt(ys, 10);
  const m = Number.parseInt(ms, 10);
  const d = new Date(y, m - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  const raw = d.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ym;
}

function yearFromYYYYMM(s: string | undefined | null): number | null {
  const t = String(s ?? "").trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const y = Number.parseInt(t.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function collectMonitorFinancieroYearOptions(
  items: ContabilidadGasto[],
  fxOperations: HostingFxOperation[],
  hostingInv: InvoiceMonthNetRow[],
  asicInv: InvoiceMonthNetRow[]
): number[] {
  const s = new Set<number>();
  const yNow = new Date().getFullYear();
  s.add(yNow);
  s.add(yNow - 1);
  for (const y of collectYearsFromPresupuestoItems(items)) s.add(y);
  for (const op of fxOperations) {
    const y = yearFromYYYYMM(String(op.operationDate ?? ""));
    if (y != null) s.add(y);
  }
  for (const row of hostingInv) {
    const y = yearFromYYYYMM(row.month);
    if (y != null) s.add(y);
  }
  for (const row of asicInv) {
    const y = yearFromYYYYMM(row.month);
    if (y != null) s.add(y);
  }
  return [...s].sort((a, b) => b - a);
}

function bucketMedio(g: ContabilidadGasto): "bank" | "stable" | "pesos" | "gs" | "other" {
  const m = normalizeMedio(g.medioPago);
  if (MEDIOS_USDT_USDC.has(m) || /USDT|USDC/i.test(m)) return "stable";
  if (m === MEDIO_PESOS_CONTADO) return "pesos";
  if (m === MEDIO_GS_CONTADO) return "gs";
  if (MEDIOS_USD_FIAT.has(m)) return "bank";
  return "other";
}

export function MonitorFinancieroPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ContabilidadGasto[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorHrs[]>([]);
  const [fxOperations, setFxOperations] = useState<HostingFxOperation[]>([]);
  const [invoicesHosting, setInvoicesHosting] = useState<InvoiceMonthNetRow[]>([]);
  const [invoicesAsic, setInvoicesAsic] = useState<InvoiceMonthNetRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [err, setErr] = useState("");
  const yearsAvailable = useMemo(
    () => collectMonitorFinancieroYearOptions(items, fxOperations, invoicesHosting, invoicesAsic),
    [items, fxOperations, invoicesHosting, invoicesAsic]
  );
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());
  const [filterMesYm, setFilterMesYm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    setErr("");
    try {
      const [gSettled, pSettled, fxSettled, hInvSettled, aInvSettled] = await Promise.allSettled([
        getContabilidadGastos(),
        getProveedoresHrs(),
        getHostingFxOperations(),
        getInvoices({ source: "hosting" }),
        getInvoices({ source: "asic" }),
      ]);
      if (gSettled.status === "fulfilled") {
        setItems(Array.isArray(gSettled.value.items) ? gSettled.value.items : []);
        setErr("");
      } else {
        setErr("No se pudieron cargar los gastos.");
        setItems([]);
      }
      if (pSettled.status === "fulfilled") {
        setProveedores(Array.isArray(pSettled.value.items) ? pSettled.value.items : []);
      } else {
        setProveedores([]);
      }
      if (fxSettled.status === "fulfilled") {
        setFxOperations(Array.isArray(fxSettled.value.operations) ? fxSettled.value.operations : []);
      } else {
        setFxOperations([]);
      }
      if (hInvSettled.status === "fulfilled") {
        setInvoicesHosting(mapInvoicesToMonthRows(hInvSettled.value));
      } else {
        setInvoicesHosting([]);
      }
      if (aInvSettled.status === "fulfilled") {
        setInvoicesAsic(mapInvoicesToMonthRows(aInvSettled.value));
      } else {
        setInvoicesAsic([]);
      }
    } catch {
      setErr("No se pudieron cargar los gastos.");
      setItems([]);
      setProveedores([]);
      setFxOperations([]);
      setInvoicesHosting([]);
      setInvoicesAsic([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && canAccessFinanzaContabilidadHub(user)) {
      void load();
    }
  }, [loading, user, load]);

  useEffect(() => {
    if (yearsAvailable.length === 0) return;
    setFilterYear((prev) => (yearsAvailable.includes(prev) ? prev : yearsAvailable[0]!));
  }, [yearsAvailable]);

  useEffect(() => {
    setFilterMesYm(null);
  }, [filterYear]);

  const filteredItems = useMemo(
    () => filterGastosByPresupuestoMes(items, filterYear, filterMesYm),
    [items, filterYear, filterMesYm]
  );

  const buckets = useMemo(() => {
    let bank = 0;
    let stable = 0;
    let pesos = 0;
    let gs = 0;
    let other = 0;
    let total = 0;
    for (const g of filteredItems) {
      const v = Number.isFinite(g.monto) ? g.monto : 0;
      total += v;
      switch (bucketMedio(g)) {
        case "bank":
          bank += v;
          break;
        case "stable":
          stable += v;
          break;
        case "pesos":
          pesos += v;
          break;
        case "gs":
          gs += v;
          break;
        default:
          other += v;
      }
    }
    return { bank, stable, pesos, gs, other, total, cantidad: filteredItems.length };
  }, [filteredItems]);

  const rubroByProveedorId = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of proveedores) {
      const r = (p.rubro ?? "").trim();
      m.set(p.id, r || "Sin rubro");
    }
    return m;
  }, [proveedores]);

  const gastosPorRubroSlices = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of filteredItems) {
      const rubro = rubroByProveedorId.get(g.proveedorId) ?? "Sin rubro";
      const v = Number.isFinite(g.monto) ? g.monto : 0;
      map.set(rubro, (map.get(rubro) ?? 0) + v);
    }
    return [...map.entries()]
      .map(([rubro, total]) => ({ rubro, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredItems, rubroByProveedorId]);

  const rubroTotalUsd = useMemo(
    () => gastosPorRubroSlices.reduce((acc, s) => acc + s.total, 0),
    [gastosPorRubroSlices]
  );

  const tripleIngresoKpi = useMemo(
    () =>
      computeTripleKpiResult(filterYear, filterMesYm, fxOperations, invoicesHosting, invoicesAsic),
    [filterYear, filterMesYm, fxOperations, invoicesHosting, invoicesAsic]
  );

  const proveedoresRanked = useMemo(() => {
    type Row = { code: string; name: string; totalUsd: number; n: number };
    const map = new Map<string, Row>();
    for (const g of filteredItems) {
      const key = g.supplierNumber;
      if (!map.has(key)) {
        map.set(key, { code: g.supplierNumber, name: g.supplierName, totalUsd: 0, n: 0 });
      }
      const r = map.get(key)!;
      r.n += 1;
      if (Number.isFinite(g.monto)) r.totalUsd += g.monto;
    }
    return [...map.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  }, [filteredItems]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessFinanzaContabilidadHub(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page reportes-page">
      <div className="container py-3 py-md-4">
        <PageHeader title="Monitor Financiero" backTo="/gestion-financiera" backText="Volver a Gestión Financiera" />

        <div className="mb-3 d-flex flex-wrap align-items-center gap-2">
          <Link to="/gestion-financiera/contabilidad" className="btn btn-outline-primary btn-sm">
            Ir a Contabilidad — Gastos
          </Link>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={listLoading} onClick={() => void load()}>
            Actualizar
          </button>
        </div>

        {err ? <div className="alert alert-danger py-2">{err}</div> : null}

        {listLoading ? (
          <p className="text-muted small">Cargando gastos…</p>
        ) : items.length === 0 ? (
          <div className="reportes-dash__chart p-4 text-center text-muted">
            <p className="mb-2">Todavía no hay gastos registrados.</p>
            <Link to="/gestion-financiera/contabilidad" className="btn btn-primary btn-sm">
              Ir a cargar gastos
            </Link>
          </div>
        ) : (
          <>
            <div className="monitor-financiero-filtro-principal d-flex flex-wrap align-items-end gap-2 gap-md-3 pb-3 mb-4 border-bottom">
              <div className="me-md-2">
                <span className="d-block small text-muted text-uppercase mb-1" style={{ letterSpacing: "0.05em", fontSize: "0.68rem" }}>
                  Período
                </span>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <label htmlFor="monitor-financiero-anio" className="visually-hidden">
                    Año
                  </label>
                  <select
                    id="monitor-financiero-anio"
                    className="reportes-dash__period-select"
                    value={filterYear}
                    aria-label="Año"
                    onChange={(e) => {
                      const y = Number.parseInt(e.target.value, 10);
                      setFilterYear(y);
                    }}
                  >
                    {yearsAvailable.map((y) => (
                      <option key={y} value={y}>
                        {String(y)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="monitor-financiero-mes" className="visually-hidden">
                    Mes (opcional)
                  </label>
                  <select
                    id="monitor-financiero-mes"
                    className="reportes-dash__period-select"
                    value={filterMesYm ?? ""}
                    aria-label="Mes del período"
                    onChange={(e) => {
                      const v = e.target.value;
                      setFilterMesYm(v === "" ? null : v);
                    }}
                  >
                    <option value="">Todos los meses</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const ym = `${filterYear}-${String(m).padStart(2, "0")}`;
                      return (
                        <option key={ym} value={ym}>
                          {formatMonthShortEs(ym)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <MonitorGastosMensualCard
                items={items}
                hidePeriodSelectors
                totalIngresosCombinedUsd={tripleIngresoKpi.totalCombined}
                presupuestoFilter={{
                  year: filterYear,
                  mesYm: filterMesYm,
                  onYearChange: setFilterYear,
                  onMesYmChange: setFilterMesYm,
                }}
              />
            </div>

            <div className="mb-4">
              <CambioGananciasMensualAreaCard
                operations={fxOperations}
                invoicesHosting={invoicesHosting}
                invoicesAsic={invoicesAsic}
                years={yearsAvailable}
                hidePeriodSelectors
                presupuestoFilter={{
                  year: filterYear,
                  mesYm: filterMesYm,
                  onYearChange: setFilterYear,
                  onMesYmChange: setFilterMesYm,
                }}
              />
            </div>

            <div className="reportes-dash__section-below mb-4">
              <div className="monitor-financiero-below-grid">
                <div className="d-flex flex-column gap-3">
                  <GastosPorProveedorListCard
                    rows={proveedoresRanked}
                    totalPeriodoUsd={buckets.total}
                    hint={
                      filterMesYm
                        ? "Equivalente USD por proveedor · solo el mes de presupuesto seleccionado · orden por mayor total"
                        : undefined
                    }
                  />
                  <GastosPorMedioPagoListCard
                    buckets={buckets}
                    hint={
                      filterMesYm
                        ? "Equivalente USD por medio · solo el mes de presupuesto seleccionado · barras proporcionales al total del período"
                        : undefined
                    }
                  />
                </div>
                <div className="min-w-0">
                  <GastosPorRubroDonut slices={gastosPorRubroSlices} totalUsd={rubroTotalUsd} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
