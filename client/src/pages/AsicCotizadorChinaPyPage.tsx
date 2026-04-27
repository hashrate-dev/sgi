import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { createAsicCostoEquipo, getAsicCostosEquipos, type AsicCostoEquipoItem } from "../lib/api";
import "../styles/facturacion.css";

/** Valores por defecto de la fórmula: PRECIO ORIGEN + (220 USD) × 1,17 + 300 */
const DEFAULT_BLOQUE_USD = 220;
const DEFAULT_MULT = 1.17;
const DEFAULT_PROVEEDOR_USD = 300;

const ASIC_MODELOS = ["S21", "L7", "L9", "Z15", "X9"] as const;

/** Hashrate / variante de procesador según modelo */
const PROCESADOR_POR_MODELO: Record<(typeof ASIC_MODELOS)[number], readonly string[]> = {
  S21: ["200 ths", "234 ths", "235 ths", "245 ths", "270 ths", "473 ths hydro"],
  L7: ["8800 mhs", "9050 mhs", "9500 mhs"],
  L9: ["15.000 mhs", "16.000 mhs", "16.500 mhs", "17.000 mhs"],
  Z15: ["840 kSol/s"],
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

function displayAsNegative(raw: string): string {
  if (!raw.trim()) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return "0";
  return `-${formatDisplayNumber(raw).replace(/^-+/, "")}`;
}

function displayAsPositive(raw: string): string {
  if (!raw.trim()) return "";
  return `+${formatDisplayNumber(raw).replace(/^[+-]+/, "")}`;
}

function removeMinus(raw: string): string {
  return raw.replace(/-/g, "");
}

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
    const bloque = Math.max(0, parseMoney(bloqueUsd));
    const mult = Math.max(0, parseMoney(multiplicador));
    const montoBloque = bloque * mult;
    const prov = Math.max(0, parseMoney(proveedorPy));
    return { precioNum: p, totalNacionalizado: p + montoBloque + prov };
  }, [precioOrigen, bloqueUsd, multiplicador, proveedorPy]);

  const precioVenta = useMemo(() => totalNacionalizado + parseMoney(margen), [margen, totalNacionalizado]);

  /** % del margen sobre el precio de venta: margen USD / PVP × 100 */
  const pctMargenSobrePvp = useMemo(() => {
    const m = parseMoney(margen);
    if (precioVenta <= 0) return 0;
    return (m / precioVenta) * 100;
  }, [margen, precioVenta]);

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
                    value={displayAsNegative(precioOrigen)}
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
                    value={displayAsNegative(bloqueUsd)}
                    onChange={(e) => setBloqueUsd(sanitizeNumberInput(removeMinus(e.target.value)))}
                  />
                </div>
                <div className="col asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-mult">
                    Coeficiente (ej. 1,17)
                  </label>
                  <input
                    id="cot-mult"
                    className="fact-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={String(DEFAULT_MULT)}
                    value={displayAsNegative(multiplicador)}
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
                    value={displayAsNegative(proveedorPy)}
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
              <div className="d-flex justify-content-end mt-3">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
