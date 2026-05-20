import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { createAsicCostoEquipo, deleteAsicCostoEquipo, getAsicCostosEquipos, type AsicCostoEquipoItem } from "../lib/api";
import "../styles/facturacion.css";

/** Valores por defecto de la fórmula: ((PRECIO ORIGEN + 220 USD) × 1,23) + 300 */
const DEFAULT_BLOQUE_USD = 220;
const DEFAULT_MULT = 1.23;
const DEFAULT_PROVEEDOR_USD = 300;
const HASHRATE_LOGO = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";

const ASIC_MODELOS = ["S21", "L7", "L9", "Z15", "X9"] as const;

/** Hashrate / variante de procesador según modelo */
const PROCESADOR_POR_MODELO: Record<(typeof ASIC_MODELOS)[number], readonly string[]> = {
  S21: ["200 ths", "234 ths", "235 ths", "245 ths", "270 ths", "473 ths hydro"],
  L7: ["8800 mhs", "9050 mhs", "9500 mhs"],
  L9: ["15.000 mhs", "16.000 mhs", "16.500 mhs", "17.000 mhs"],
  Z15: ["840 kSol/s", "860 kSol/s"],
  X9: ["1.000K"],
};

function parseMoney(raw: string): number {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeNumberInput(raw: string): string {
  let s = raw.trim().replace(/\s/g, "").replace(/-/g, "").replace(/\./g, "").replace(",", ".");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

function formatDisplayNumber(raw: string): string {
  if (!raw.trim()) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("es-PY", { maximumFractionDigits: 6 });
}

function displayAsPositive(raw: string): string {
  if (!raw.trim()) return "";
  return `+${formatDisplayNumber(raw).replace(/^[+-]+/, "")}`;
}

function removeMinus(raw: string): string {
  return raw.replace(/-/g, "");
}

function calendarDayKey(iso: string): string {
  const f = new Date(iso);
  const y = f.getFullYear();
  const m = String(f.getMonth() + 1).padStart(2, "0");
  const d = String(f.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prioridadModeloCotizacion(modeloRaw: string): number {
  const modeloNorm = modeloRaw.trim().toUpperCase();
  if (modeloNorm === "S21") return 0;
  if (modeloNorm === "L9") return 1;
  return 2;
}

const USD_FMT_CEIL = new Intl.NumberFormat("es-PY", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function AsicCotizadorChinaPyPage() {
  const [precioOrigen, setPrecioOrigen] = useState("");
  const [bloqueUsd, setBloqueUsd] = useState(String(DEFAULT_BLOQUE_USD));
  const [multiplicador, setMultiplicador] = useState(String(DEFAULT_MULT));
  const [proveedorPy, setProveedorPy] = useState(String(DEFAULT_PROVEEDOR_USD));
  const [margen, setMargen] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [procesador, setProcesador] = useState("");
  const [registros, setRegistros] = useState<AsicCostoEquipoItem[]>([]);
  const [registrosLoading, setRegistrosLoading] = useState(false);
  const [registrosError, setRegistrosError] = useState("");
  const [eliminandoIds, setEliminandoIds] = useState<Set<number>>(() => new Set());
  const [showHoyModal, setShowHoyModal] = useState(false);
  const [showUltimosModal, setShowUltimosModal] = useState(false);

  const opcionesProcesador = useMemo((): string[] => {
    if (modelo && modelo in PROCESADOR_POR_MODELO) {
      return [...PROCESADOR_POR_MODELO[modelo as keyof typeof PROCESADOR_POR_MODELO]];
    }
    return [];
  }, [modelo]);

  useEffect(() => {
    if (opcionesProcesador.length === 0) {
      setProcesador("");
      return;
    }
    setProcesador((prev) => {
      if (opcionesProcesador.includes(prev)) return prev;
      if (opcionesProcesador.length === 1) return opcionesProcesador[0]!;
      return "";
    });
  }, [modelo, opcionesProcesador]);

  useEffect(() => {
    let mounted = true;
    setRegistrosLoading(true);
    setRegistrosError("");
    getAsicCostosEquipos()
      .then((r) => {
        if (!mounted) return;
        setRegistros(r.items || []);
      })
      .catch((e) => {
        if (!mounted) return;
        setRegistrosError(e instanceof Error ? e.message : "No se pudieron cargar los costos registrados.");
      })
      .finally(() => {
        if (!mounted) return;
        setRegistrosLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const { precioNum, totalNacionalizado } = useMemo(() => {
    const p = parseMoney(precioOrigen);
    const montoUsd = Math.max(0, parseMoney(bloqueUsd));
    const mult = Math.max(0, parseMoney(multiplicador));
    const prov = Math.max(0, parseMoney(proveedorPy));
    const totalSinMargen = (p + montoUsd) * mult + prov;
    return { precioNum: p, totalNacionalizado: totalSinMargen };
  }, [precioOrigen, bloqueUsd, multiplicador, proveedorPy]);

  const precioVenta = useMemo(() => totalNacionalizado + parseMoney(margen), [margen, totalNacionalizado]);

  /** % del margen sobre el precio de venta: margen USD / PVP × 100 */
  const pctMargenSobrePvp = useMemo(() => {
    const m = parseMoney(margen);
    if (precioVenta <= 0) return 0;
    return (m / precioVenta) * 100;
  }, [margen, precioVenta]);

  const registrosHoy = useMemo(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const d = hoy.getDate();
    return registros
      .filter((r) => {
        const f = new Date(r.createdAt);
        return f.getFullYear() === y && f.getMonth() === m && f.getDate() === d;
      })
      .sort((a, b) => prioridadModeloCotizacion(a.modelo) - prioridadModeloCotizacion(b.modelo));
  }, [registros]);

  /** Solo equipos del día de registro más reciente (último lote de cotizaciones). */
  const ultimoLotePrecios = useMemo(() => {
    if (registros.length === 0) {
      return { fechaLabel: null as string | null, items: [] as AsicCostoEquipoItem[] };
    }
    const sorted = [...registros].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id
    );
    const diaReciente = calendarDayKey(sorted[0]!.createdAt);
    const items = sorted
      .filter((r) => calendarDayKey(r.createdAt) === diaReciente)
      .sort((a, b) => prioridadModeloCotizacion(a.modelo) - prioridadModeloCotizacion(b.modelo));
    const fechaLabel = new Intl.DateTimeFormat("es-PY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(sorted[0]!.createdAt));
    return { fechaLabel, items };
  }, [registros]);

  const fechaActualizacionHoy = useMemo(
    () =>
      new Intl.DateTimeFormat("es-PY", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    []
  );

  async function generarYRegistrarPrecio(): Promise<void> {
    setRegistrosError("");
    try {
      const resp = await createAsicCostoEquipo({
        marca: marca.trim(),
        modelo: modelo.trim(),
        procesador: procesador.trim(),
        precioOrigen: parseMoney(precioOrigen),
        montoUsd: parseMoney(bloqueUsd),
        coeficiente: parseMoney(multiplicador),
        proveedorPy: parseMoney(proveedorPy),
        margenUsd: parseMoney(margen),
        totalNacionalizado,
        precioVenta,
        pctMargen: pctMargenSobrePvp,
      });
      if (resp.item) setRegistros((prev) => [resp.item!, ...prev]);
    } catch (e) {
      setRegistrosError(e instanceof Error ? e.message : "No se pudo registrar la cotización.");
    }
  }

  async function handleEliminarRegistro(item: AsicCostoEquipoItem): Promise<void> {
    if (eliminandoIds.has(item.id)) return;
    const confirmed = window.confirm("¿Eliminar este registro de cotización?");
    if (!confirmed) return;
    setRegistrosError("");
    setEliminandoIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });

    // Optimista: sacar la fila inmediatamente; si el DELETE falla, re-cargamos.
    setRegistros((prev) => prev.filter((r) => r.id !== item.id));
    try {
      await deleteAsicCostoEquipo(item.id);
    } catch (e) {
      setRegistrosError(e instanceof Error ? e.message : "No se pudo eliminar el registro.");
      try {
        const r = await getAsicCostosEquipos();
        setRegistros(r.items || []);
      } catch {
        // Si falla el refresh, al menos mantenemos el mensaje de error.
      }
    } finally {
      setEliminandoIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Cotizador ASIC: China → Paraguay"
          showBackButton
          backTo="/asic"
          backText="Volver a Equipos ASIC"
        />

        <section
          className="hosting-fx-ops-indicators hosting-fx-ops-indicators--asic-quoter mb-4 mt-3"
          aria-label="Resumen de cotización"
          aria-live="polite"
        >
          <div className="hosting-fx-ops-indicators__grid" role="presentation">
            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--count"
              aria-label="Precio del equipo en origen China en USD"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-cpu" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">Origen</span>
                  <h3 className="hosting-fx-ops-metric__title">Precio China (USD)</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure">
                {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(precioNum)}
              </p>
            </article>

            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--count"
              aria-label="Precio del equipo nacionalizado en Paraguay"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-calculator" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <h3 className="hosting-fx-ops-metric__title">Total Nacionalizado</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure">
                {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(totalNacionalizado)}
              </p>
            </article>

            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--sell hosting-fx-ops-metric--margen-input"
              aria-label="Margen USD: monto en la línea inferior"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-currency-dollar" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">Venta</span>
                  <h3 className="hosting-fx-ops-metric__title">Margen USD</h3>
                </div>
              </div>
              <div className="hosting-fx-ops-metric__field">
                <label className="visually-hidden" htmlFor="cot-margen">
                  Margen USD — valor numérico en la línea inferior
                </label>
                <input
                  id="cot-margen"
                  className="hosting-fx-ops-metric__field-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={displayAsPositive(margen)}
                  onChange={(e) => setMargen(sanitizeNumberInput(e.target.value))}
                  aria-describedby="cot-margen-hint"
                />
                <span id="cot-margen-hint" className="visually-hidden">
                  El margen usado es el monto en USD que ingresás aquí. Se suma al total nacionalizado para el precio
                  de venta.
                </span>
              </div>
            </article>

            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--buy"
              aria-label="Porcentaje de margen sobre el precio de venta"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-pie-chart" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <h3 className="hosting-fx-ops-metric__title">% Margen</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--pct">
                {new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(
                  pctMargenSobrePvp
                )}
                <span className="hosting-fx-ops-metric__unit hosting-fx-ops-metric__unit--suffix-pct">%</span>
              </p>

            </article>

            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--profit"
              aria-label="Precio de venta: total nacionalizado más margen"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-tag" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">Venta</span>
                  <h3 className="hosting-fx-ops-metric__title">Precio de venta</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure">
                {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(precioVenta)}
              </p>
            </article>
          </div>
        </section>

        <div className="fact-card fact-panel-nuevo-documento mb-4">
          <div className="fact-panel-nuevo-documento-header">Parámetros de cotización</div>
          <div className="fact-card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="row g-3 mb-2">
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-marca">
                    Marca
                  </label>
                  <input
                    id="cot-marca"
                    className="fact-input"
                    type="text"
                    autoComplete="off"
                    placeholder="ej. Bitmain"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-modelo">
                    Modelo
                  </label>
                  <select
                    id="cot-modelo"
                    className="fact-select"
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                  >
                    <option value="">Seleccionar modelo</option>
                    {ASIC_MODELOS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-procesador">
                    Procesador
                  </label>
                  <select
                    id="cot-procesador"
                    className="fact-select"
                    value={procesador}
                    onChange={(e) => setProcesador(e.target.value)}
                    disabled={!modelo || opcionesProcesador.length === 0}
                    title={!modelo ? "Elegí primero el modelo" : undefined}
                  >
                    <option value="">
                      {modelo ? "Seleccionar procesador" : "Seleccionar modelo primero"}
                    </option>
                    {opcionesProcesador.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row row-cols-1 row-cols-md-2 row-cols-xl-5 g-3">
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-precio-origen">
                    Precio ASIC en origen (China) <span className="text-muted">USD</span>
                  </label>
                  <input
                    id="cot-precio-origen"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={displayAsPositive(precioOrigen)}
                    onChange={(e) => setPrecioOrigen(sanitizeNumberInput(removeMinus(e.target.value)))}
                  />
                </div>
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-bloque">
                    Monto en USD (ej. 220) <span className="text-muted">USD</span>
                  </label>
                  <input
                    id="cot-bloque"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={String(DEFAULT_BLOQUE_USD)}
                    value={displayAsPositive(bloqueUsd)}
                    onChange={(e) => setBloqueUsd(sanitizeNumberInput(removeMinus(e.target.value)))}
                  />
                </div>
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-mult">
                    Coeficiente (ej. 1,23)
                  </label>
                  <input
                    id="cot-mult"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={String(DEFAULT_MULT)}
                    value={displayAsPositive(multiplicador)}
                    onChange={(e) => setMultiplicador(sanitizeNumberInput(removeMinus(e.target.value)))}
                  />
                </div>
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-proveedor">
                    Proveedor PY <span className="text-muted">USD</span>
                  </label>
                  <input
                    id="cot-proveedor"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={String(DEFAULT_PROVEEDOR_USD)}
                    value={displayAsPositive(proveedorPy)}
                    onChange={(e) => setProveedorPy(sanitizeNumberInput(removeMinus(e.target.value)))}
                  />
                </div>
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--margen-amarillo">
                  <label className="fact-label" htmlFor="cot-margen-param">
                    Margen USD
                  </label>
                  <input
                    id="cot-margen-param"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={displayAsPositive(margen)}
                    onChange={(e) => setMargen(sanitizeNumberInput(e.target.value))}
                    aria-describedby="cot-margen-hint"
                  />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 mt-3 flex-wrap">
                <button
                  type="button"
                  className="btn btn-outline-light asic-cotizador-ultimos-btn"
                  onClick={() => setShowUltimosModal(true)}
                  disabled={registrosLoading}
                >
                  <i className="bi bi-clock-history me-1" aria-hidden />
                  Últimos precios registrados
                </button>
                <button type="button" className="btn btn-success" onClick={() => void generarYRegistrarPrecio()}>
                  <i className="bi bi-plus-circle me-1" />
                  Generar precio y registrar
                </button>
              </div>
              {registrosError ? <div className="alert alert-danger py-2 mt-3 mb-0">{registrosError}</div> : null}
            </form>
          </div>
        </div>

        <div className="fact-card mb-4">
          <div className="fact-card-header">
            <div className="d-flex justify-content-between gap-2 flex-wrap">
              <span>Registros de cotizaciones</span>
              <span className="text-muted small">{registros.length} registro(s)</span>
            </div>
          </div>
          <div className="fact-card-body">
            {registrosLoading ? (
              <div className="text-muted small">Cargando registros...</div>
            ) : registros.length === 0 ? (
              <div className="text-muted small">Todavia no hay cotizaciones registradas.</div>
            ) : (
              <>
                <div className="d-flex justify-content-end mb-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success asic-cotizador-hoy-btn"
                    onClick={() => setShowHoyModal(true)}
                  >
                    <i className="bi bi-card-list me-1" />
                    Equipos de hoy
                  </button>
                </div>
                <div className="table-responsive asic-cotizador-registros-wrap">
                  <table className="table table-sm align-middle asic-cotizador-registros-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Marca</th>
                      <th>Modelo</th>
                      <th>Procesador</th>
                      <th className="text-end">Costo origen</th>
                      <th className="text-end">Monto</th>
                      <th className="text-end">Coef.</th>
                      <th className="text-end">Proveedor</th>
                      <th className="text-end">Total nacionalizado</th>
                      <th className="text-end">Margen</th>
                      <th className="text-end">% Margen</th>
                      <th className="text-end">Precio venta</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {new Date(r.createdAt).toLocaleString("es-PY", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td>{r.marca}</td>
                        <td>{r.modelo}</td>
                        <td>{r.procesador}</td>
                        <td className="text-end">
                          {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(r.precioOrigen)}
                        </td>
                        <td className="text-end">
                          {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(r.montoUsd)}
                        </td>
                        <td className="text-end">{new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(r.coeficiente)}</td>
                        <td className="text-end">
                          {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(r.proveedorPy)}
                        </td>
                        <td className="text-end fw-semibold">
                          {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(r.totalNacionalizado)}
                        </td>
                        <td className="text-end text-success fw-semibold">
                          +{new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(r.margenUsd)}
                        </td>
                        <td className="text-end">{new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(r.pctMargen)}%</td>
                        <td className="text-end fw-bold">
                          {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(r.precioVenta)}
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            title="Eliminar registro"
                            onClick={() => void handleEliminarRegistro(r)}
                            disabled={eliminandoIds.has(r.id)}
                          >
                            <i className="bi bi-trash" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {showUltimosModal ? (
          <>
            <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
              <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
                <div className="modal-content asic-cotizador-hoy-modal__content">
                  <div className="modal-header asic-cotizador-hoy-modal__header">
                    <h5 className="modal-title asic-cotizador-hoy-modal__title">
                      <img
                        src={HASHRATE_LOGO}
                        alt="Hashrate"
                        className="asic-cotizador-hoy-modal__logo"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="asic-cotizador-hoy-modal__title-text">
                        Últimos precios registrados ({ultimoLotePrecios.items.length})
                      </span>
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Cerrar"
                      onClick={() => setShowUltimosModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    {registrosLoading ? (
                      <div className="text-muted small">Cargando registros…</div>
                    ) : ultimoLotePrecios.items.length === 0 ? (
                      <div className="text-muted small">Todavía no hay cotizaciones registradas.</div>
                    ) : (
                      <div>
                        <p className="text-muted small mb-2">
                          Equipos del último día de registro
                          {ultimoLotePrecios.fechaLabel ? (
                            <>
                              : <strong>{ultimoLotePrecios.fechaLabel}</strong>
                            </>
                          ) : null}
                          .
                        </p>
                        <div className="table-responsive asic-cotizador-registros-wrap asic-cotizador-hoy-modal__table-wrap">
                          <table className="table table-sm align-middle mb-0 asic-cotizador-registros-table asic-cotizador-hoy-modal__table">
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Marca</th>
                                <th>Modelo</th>
                                <th>Procesador</th>
                                <th className="text-end">Precio venta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ultimoLotePrecios.items.map((r) => (
                                <tr key={`ult-${r.id}`}>
                                  <td className="asic-cotizador-hoy-modal__date-cell">
                                    {ultimoLotePrecios.fechaLabel ?? "—"}
                                  </td>
                                  <td>{r.marca || "—"}</td>
                                  <td>{r.modelo || "—"}</td>
                                  <td>{r.procesador || "—"}</td>
                                  <td className="text-end fw-semibold asic-cotizador-hoy-modal__price-cell">
                                    {USD_FMT_CEIL.format(Math.ceil(r.precioVenta))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="asic-cotizador-hoy-modal__nota mb-0 mt-2">*No incluye precios de Garantías</p>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowUltimosModal(false)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setShowUltimosModal(false)} />
          </>
        ) : null}

        {showHoyModal ? (
          <>
            <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
              <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
                <div className="modal-content asic-cotizador-hoy-modal__content">
                  <div className="modal-header asic-cotizador-hoy-modal__header">
                    <h5 className="modal-title asic-cotizador-hoy-modal__title">
                      <img
                        src={HASHRATE_LOGO}
                        alt="Hashrate"
                        className="asic-cotizador-hoy-modal__logo"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="asic-cotizador-hoy-modal__title-text">
                        Cotización de Precios EQUIPOS ASIC ({registrosHoy.length})
                      </span>
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Cerrar"
                      onClick={() => setShowHoyModal(false)}
                    />
                  </div>
                  <div className="modal-body">
                    {registrosHoy.length === 0 ? (
                      <div className="text-muted small">Hoy todavia no hay equipos registrados.</div>
                    ) : (
                      <div>
                        <div className="table-responsive asic-cotizador-registros-wrap asic-cotizador-hoy-modal__table-wrap">
                          <table className="table table-sm align-middle mb-0 asic-cotizador-registros-table asic-cotizador-hoy-modal__table">
                            <thead>
                              <tr>
                                <th>Marca</th>
                                <th>Modelo</th>
                                <th>Procesador</th>
                                <th>Fecha de Actualización</th>
                                <th className="text-end">Precio venta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {registrosHoy.map((r) => (
                                <tr key={`hoy-${r.id}`}>
                                  <td>{r.marca || "-"}</td>
                                  <td>{r.modelo || "-"}</td>
                                  <td>{r.procesador || "-"}</td>
                                  <td className="asic-cotizador-hoy-modal__date-cell">{fechaActualizacionHoy}</td>
                                  <td className="text-end fw-semibold asic-cotizador-hoy-modal__price-cell">
                                    {new Intl.NumberFormat("es-PY", {
                                      style: "currency",
                                      currency: "USD",
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    }).format(Math.ceil(r.precioVenta))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="asic-cotizador-hoy-modal__nota mb-0 mt-2">*No incluye precios de Garantias</p>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowHoyModal(false)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setShowHoyModal(false)} />
          </>
        ) : null}
      </div>
    </div>
  );
}
