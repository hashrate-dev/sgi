import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { AsicCotizadorCatalogSelect } from "../components/AsicCotizadorCatalogSelect";
import { createAsicCostoEquipo, deleteAsicCostoEquipo, getAsicCostosEquipos, type AsicCostoEquipoItem } from "../lib/api";
import { downloadAsicCotizacionPdf } from "../lib/generateAsicCotizacionPdf";
import { AsicCotizadorEvolucionModal } from "../components/AsicCotizadorEvolucionModal";
import "../styles/facturacion.css";

/** Valores por defecto de la fórmula: ((PRECIO ORIGEN + 220 USD) × 1,23) + 300 */
const DEFAULT_BLOQUE_USD = 220;
/** Coeficiente fijo de nacionalización (no editable). */
const COEFICIENTE_FIJO = 1.23;
const DEFAULT_PROVEEDOR_USD = 300;
import { HASHRATE_SPACE_LOGO } from "../lib/marketplaceWpAssets.js";
const HASHRATE_LOGO = HASHRATE_SPACE_LOGO;

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
  return Math.round(n).toLocaleString("es-PY", { maximumFractionDigits: 0 });
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatWhole(value: number): string {
  return new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(value));
}

/** Línea de texto comercial: Marca - Modelo procesador —-> precio usd [obs] */
function buildCotizacionTxtLine(item: AsicCostoEquipoItem): string {
  const marca = (item.marca || "").trim();
  const modelo = (item.modelo || "").trim();
  const procesador = (item.procesador || "").trim();
  const obs = (item.observaciones || "").trim();
  const equipoParts = [marca, modelo].filter(Boolean);
  const equipo = equipoParts.length > 0 ? equipoParts.join(" - ") : "Equipo ASIC";
  const left = procesador ? `${equipo} ${procesador}` : equipo;
  const price = `${formatWhole(item.precioVenta)} usd`;
  const base = `${left} —-> ${price}`;
  return obs ? `${base} — ${obs}` : base;
}

function displayAsPositive(raw: string): string {
  if (!raw.trim()) return "";
  return `+${formatDisplayNumber(raw).replace(/^[+-]+/, "")}`;
}

function removeMinus(raw: string): string {
  return raw.replace(/-/g, "");
}

function prioridadModeloCotizacion(modeloRaw: string): number {
  const modeloNorm = modeloRaw.trim().toUpperCase();
  if (modeloNorm === "S21") return 0;
  if (modeloNorm === "S23") return 1;
  if (modeloNorm === "L9") return 2;
  if (modeloNorm === "L11") return 3;
  return 4;
}

export function AsicCotizadorChinaPyPage() {
  const [precioOrigen, setPrecioOrigen] = useState("");
  const [bloqueUsd, setBloqueUsd] = useState(String(DEFAULT_BLOQUE_USD));
  const [proveedorPy, setProveedorPy] = useState(String(DEFAULT_PROVEEDOR_USD));
  const [margen, setMargen] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [procesador, setProcesador] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [registros, setRegistros] = useState<AsicCostoEquipoItem[]>([]);
  const [registrosLoading, setRegistrosLoading] = useState(false);
  const [registrosError, setRegistrosError] = useState("");
  const [eliminandoIds, setEliminandoIds] = useState<Set<number>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pdfDestinatario, setPdfDestinatario] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showHoyModal, setShowHoyModal] = useState(false);
  const [showTxtModal, setShowTxtModal] = useState(false);
  const [txtCopyDone, setTxtCopyDone] = useState(false);
  const [showEvoModal, setShowEvoModal] = useState(false);

  useEffect(() => {
    setProcesador("");
  }, [modelo]);

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
    const prov = Math.max(0, parseMoney(proveedorPy));
    const totalSinMargen = (p + montoUsd) * COEFICIENTE_FIJO + prov;
    return { precioNum: p, totalNacionalizado: Math.round(totalSinMargen) };
  }, [precioOrigen, bloqueUsd, proveedorPy]);

  const precioVenta = useMemo(
    () => Math.round(totalNacionalizado + parseMoney(margen)),
    [margen, totalNacionalizado]
  );

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
        observaciones: observaciones.trim(),
        precioOrigen: parseMoney(precioOrigen),
        montoUsd: parseMoney(bloqueUsd),
        coeficiente: COEFICIENTE_FIJO,
        proveedorPy: parseMoney(proveedorPy),
        margenUsd: parseMoney(margen),
        totalNacionalizado,
        precioVenta,
        pctMargen: Math.round(pctMargenSobrePvp),
      });
      if (resp.item) {
        setRegistros((prev) => [resp.item!, ...prev]);
        setObservaciones("");
      }
    } catch (e) {
      setRegistrosError(e instanceof Error ? e.message : "No se pudo registrar la cotización.");
    }
  }

  const selectedRegistros = useMemo(
    () => registros.filter((r) => selectedIds.has(r.id)),
    [registros, selectedIds]
  );

  const selectedCotizacionTxt = useMemo(
    () => selectedRegistros.map(buildCotizacionTxtLine).join("\n"),
    [selectedRegistros]
  );

  const allVisibleSelected = registros.length > 0 && registros.every((r) => selectedIds.has(r.id));

  function toggleSelectAll(checked: boolean): void {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(registros.map((r) => r.id)));
  }

  function toggleSelectOne(id: number, checked: boolean): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDescargarPdfCotizacion(): Promise<void> {
    if (selectedRegistros.length === 0) {
      setRegistrosError("Seleccioná al menos un registro para generar el PDF.");
      return;
    }
    setRegistrosError("");
    setPdfBusy(true);
    try {
      await downloadAsicCotizacionPdf({
        items: selectedRegistros,
        destinatario: pdfDestinatario.trim(),
      });
    } catch (e) {
      setRegistrosError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function handleAbrirTxtCotizacion(): void {
    if (selectedRegistros.length === 0) {
      setRegistrosError("Seleccioná al menos un registro para generar el texto.");
      return;
    }
    setRegistrosError("");
    setTxtCopyDone(false);
    setShowTxtModal(true);
  }

  async function handleCopiarTxtCotizacion(): Promise<void> {
    const text = selectedCotizacionTxt;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setTxtCopyDone(true);
      window.setTimeout(() => setTxtCopyDone(false), 2000);
    } catch {
      setRegistrosError("No se pudo copiar al portapapeles. Seleccioná el texto manualmente.");
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
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
                {formatUsd(precioNum)}
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
                {formatUsd(totalNacionalizado)}
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
                {formatWhole(pctMargenSobrePvp)}
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
              <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--usd-whole">
                {formatUsd(precioVenta)}
              </p>
            </article>
          </div>
        </section>

        <div className="fact-card fact-panel-nuevo-documento asic-cotizador-params-panel mb-4">
          <div className="fact-panel-nuevo-documento-header">Parámetros de cotización</div>
          <div className="fact-card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="row g-3 mb-2 asic-cotizador-catalog-row">
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-marca">
                    Marca
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="marca"
                    value={marca}
                    onChange={setMarca}
                    labelId="cot-marca"
                    placeholder="Seleccionar marca"
                    searchPlaceholder="Buscar marca…"
                    addLabel="Agregar nueva marca"
                    newTitle="Nueva marca"
                    onError={(msg) => setRegistrosError(msg)}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-modelo">
                    Modelo
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="modelo"
                    value={modelo}
                    onChange={setModelo}
                    labelId="cot-modelo"
                    placeholder="Seleccionar modelo"
                    searchPlaceholder="Buscar modelo…"
                    addLabel="Agregar nuevo modelo"
                    newTitle="Nuevo modelo"
                    onError={(msg) => setRegistrosError(msg)}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="cot-procesador">
                    Procesador
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="procesador"
                    parent={modelo}
                    value={procesador}
                    onChange={setProcesador}
                    labelId="cot-procesador"
                    placeholder={modelo ? "Seleccionar procesador" : "Seleccionar modelo primero"}
                    searchPlaceholder="Buscar procesador…"
                    addLabel="Agregar nuevo procesador"
                    newTitle="Nuevo procesador"
                    onError={(msg) => setRegistrosError(msg)}
                  />
                </div>
              </div>
              <div className="row g-3 asic-cotizador-costos-row">
                <div className="col-12 col-sm-6 col-xl asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
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
                <div className="col-12 col-sm-6 col-xl asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
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
                <div className="col-12 col-sm-6 col-xl asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
                  <label className="fact-label" htmlFor="cot-mult">
                    Coeficiente <span className="text-muted">(fijo)</span>
                  </label>
                  <input
                    id="cot-mult"
                    className="fact-input"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    value="1,23"
                  />
                </div>
                <div className="col-12 col-sm-6 col-xl asic-cotizador-field-wrap asic-cotizador-field-wrap--costo">
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
                <div className="col-12 col-sm-6 col-xl asic-cotizador-field-wrap asic-cotizador-field-wrap--margen-amarillo">
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
              <div className="row g-3 mt-1 asic-cotizador-obs-row">
                <div className="col-12 asic-cotizador-field-wrap asic-cotizador-field-wrap--obs">
                  <label className="fact-label" htmlFor="cot-observaciones">
                    Observaciones
                  </label>
                  <textarea
                    id="cot-observaciones"
                    className="fact-input asic-cotizador-observaciones"
                    rows={3}
                    maxLength={2000}
                    autoComplete="off"
                    placeholder="Detalles u observaciones de esta cotización (opcional)…"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                  />
                  <div className="asic-cotizador-observaciones-meta">
                    {observaciones.trim() ? `${observaciones.trim().length}/2000` : "Opcional"}
                  </div>
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
              <>
                <div className="asic-cotizador-pdf-toolbar mb-3">
                  <div className="asic-cotizador-pdf-toolbar__dest">
                    <label className="form-label small mb-1" htmlFor="cot-pdf-destinatario">
                      Destinatario del PDF (opcional)
                    </label>
                    <input
                      id="cot-pdf-destinatario"
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Nombre del cliente o potencial cliente"
                      value={pdfDestinatario}
                      onChange={(e) => setPdfDestinatario(e.target.value)}
                      maxLength={160}
                    />
                  </div>
                  <div className="asic-cotizador-pdf-toolbar__actions">
                    <span className="text-muted small">
                      {selectedIds.size > 0 ? `${selectedIds.size} seleccionado(s)` : "Sin selección"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success asic-cotizador-hoy-btn"
                      onClick={() => setShowHoyModal(true)}
                    >
                      <i className="bi bi-card-list me-1" />
                      Equipos de hoy
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={pdfBusy || selectedIds.size === 0}
                      onClick={() => void handleDescargarPdfCotizacion()}
                      title={selectedIds.size === 0 ? "Seleccioná uno o más registros" : "Descargar PDF de cotización"}
                    >
                      <i className="bi bi-file-earmark-pdf me-1" aria-hidden />
                      {pdfBusy ? "Generando PDF…" : "Descargar PDF cotización"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      disabled={selectedIds.size === 0}
                      onClick={handleAbrirTxtCotizacion}
                      title={
                        selectedIds.size === 0
                          ? "Seleccioná uno o más registros"
                          : "Ver precios finales en texto para copiar"
                      }
                    >
                      <i className="bi bi-file-text me-1" aria-hidden />
                      Texto precios
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success asic-cotizador-hoy-btn"
                      disabled={registros.length === 0}
                      onClick={() => setShowEvoModal(true)}
                      title={
                        registros.length === 0
                          ? "Todavía no hay cotizaciones registradas"
                          : "Ver evolución de precio final y margen por equipo"
                      }
                    >
                      <i className="bi bi-graph-up-arrow me-1" aria-hidden />
                      Evolución precios
                    </button>
                  </div>
                </div>
                <div className="table-responsive asic-cotizador-registros-wrap">
                  <table className="table table-sm align-middle asic-cotizador-registros-table">
                    <thead>
                      <tr>
                        <th className="asic-cotizador-col-check text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={allVisibleSelected}
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                            aria-label="Seleccionar todos"
                            title="Seleccionar todos"
                          />
                        </th>
                        <th>Fecha</th>
                        <th>Equipo</th>
                        <th>Procesador</th>
                        <th>Observaciones</th>
                        <th className="text-end">Costo origen</th>
                        <th className="text-end">Monto</th>
                        <th className="text-end">Coef.</th>
                        <th className="text-end">Proveedor</th>
                        <th className="text-end">Total nac.</th>
                        <th className="text-end">Margen</th>
                        <th className="text-end">% Margen</th>
                        <th className="text-end">Precio venta</th>
                        <th className="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.map((r) => {
                        const selected = selectedIds.has(r.id);
                        const obs = r.observaciones?.trim() || "";
                        const created = new Date(r.createdAt);
                        const fechaCorta = created.toLocaleDateString("es-PY", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        });
                        const horaCorta = created.toLocaleTimeString("es-PY", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        return (
                          <tr key={r.id} className={selected ? "asic-cotizador-row--selected" : undefined}>
                            <td className="asic-cotizador-col-check text-center">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selected}
                                onChange={(e) => toggleSelectOne(r.id, e.target.checked)}
                                aria-label={`Seleccionar ${r.marca} ${r.modelo}`}
                              />
                            </td>
                            <td className="asic-cotizador-reg-fecha">
                              <span className="asic-cotizador-reg-fecha__dia">{fechaCorta}</span>
                              <span className="asic-cotizador-reg-fecha__hora">{horaCorta}</span>
                            </td>
                            <td className="asic-cotizador-reg-equipo">
                              <span className="asic-cotizador-reg-equipo__marca">{r.marca || "—"}</span>
                              <span className="asic-cotizador-reg-equipo__modelo">{r.modelo || "—"}</span>
                            </td>
                            <td>{r.procesador}</td>
                            <td className="asic-cotizador-obs-cell" title={obs || undefined}>
                              {obs || "—"}
                            </td>
                            <td className="text-end">{formatUsd(r.precioOrigen)}</td>
                            <td className="text-end">{formatUsd(r.montoUsd)}</td>
                            <td className="text-end">
                              {new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(r.coeficiente)}
                            </td>
                            <td className="text-end">{formatUsd(r.proveedorPy)}</td>
                            <td className="text-end fw-semibold">{formatUsd(r.totalNacionalizado)}</td>
                            <td className="text-end text-success fw-semibold">+{formatWhole(r.margenUsd)}</td>
                            <td className="text-end">{formatWhole(r.pctMargen)}%</td>
                            <td className="text-end fw-bold">{formatUsd(r.precioVenta)}</td>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

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
                                    {formatUsd(r.precioVenta)}
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

        {showTxtModal ? (
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
                        Precios finales (texto) — {selectedRegistros.length} equipo(s)
                      </span>
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Cerrar"
                      onClick={() => {
                        setShowTxtModal(false);
                        setTxtCopyDone(false);
                      }}
                    />
                  </div>
                  <div className="modal-body">
                    <p className="text-muted small mb-2">
                      Texto listo para copiar y pegar. Incluye observaciones cuando el registro las tiene.
                    </p>
                    <textarea
                      className="form-control asic-cotizador-txt-modal__textarea"
                      readOnly
                      rows={Math.min(16, Math.max(6, selectedRegistros.length + 2))}
                      value={selectedCotizacionTxt}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="Texto de precios finales seleccionados"
                    />
                  </div>
                  <div className="modal-footer flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={() => void handleCopiarTxtCotizacion()}
                      disabled={!selectedCotizacionTxt.trim()}
                    >
                      <i className={`bi ${txtCopyDone ? "bi-check2" : "bi-clipboard"} me-1`} aria-hidden />
                      {txtCopyDone ? "Copiado" : "Copiar texto"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowTxtModal(false);
                        setTxtCopyDone(false);
                      }}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="modal-backdrop fade show"
              onClick={() => {
                setShowTxtModal(false);
                setTxtCopyDone(false);
              }}
            />
          </>
        ) : null}

        <AsicCotizadorEvolucionModal
          open={showEvoModal}
          onClose={() => setShowEvoModal(false)}
          registros={registros}
          preferredIds={[...selectedIds]}
        />
      </div>
    </div>
  );
}
