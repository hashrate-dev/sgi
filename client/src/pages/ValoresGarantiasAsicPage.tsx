import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AsicCotizadorCatalogSelect } from "../components/AsicCotizadorCatalogSelect";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createValorGarantiaAsic,
  deleteValorGarantiaAsic,
  getValoresGarantiasAsic,
  updateValorGarantiaAsic,
  type ValorGarantiaAsicHistorialItem,
  type ValorGarantiaAsicItem,
  type ValorGarantiaAsicPayload,
} from "../lib/api";
import { canEditGarantiasModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

const PATH = "/gestion-administrativa/valores-garantias-asic";

const INITIAL_FORM: ValorGarantiaAsicPayload = {
  marca: "",
  modelo: "",
  procesador: "",
  consumoW: 0,
  montoUsd: 0,
  fecha: new Date().toISOString().slice(0, 10),
  notas: "",
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatWatts(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n)} W`;
}

export function ValoresGarantiasAsicPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ValorGarantiaAsicItem[]>([]);
  const [historial, setHistorial] = useState<ValorGarantiaAsicHistorialItem[]>([]);
  const [form, setForm] = useState<ValorGarantiaAsicPayload>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [search, setSearch] = useState("");

  const canEdit = Boolean(user && canEditGarantiasModule(user));

  const loadData = useCallback(async () => {
    setTableLoading(true);
    try {
      const res = await getValoresGarantiasAsic();
      setItems(res.items || []);
      setHistorial(res.historial || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la información.");
      setItems([]);
      setHistorial([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canUserAccessNavPath(user, PATH)) return;
    void loadData();
  }, [loading, user, loadData]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    if (!q) return items;
    return items.filter((row) =>
      [row.marca, row.modelo, row.procesador, row.notas, String(row.consumoW), String(row.montoUsd), row.fecha]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(q)
    );
  }, [items, search]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canUserAccessNavPath(user, PATH)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...INITIAL_FORM, fecha: new Date().toISOString().slice(0, 10) });
  };

  const validateForm = (): string | null => {
    if (!form.marca.trim()) return "Seleccioná o agregá la marca del equipo.";
    if (!form.modelo.trim()) return "Seleccioná o agregá el modelo del equipo.";
    if (!form.procesador.trim()) return "Seleccioná o agregá el procesador.";
    if (!Number.isFinite(form.consumoW) || form.consumoW < 0) return "El consumo de energía debe ser 0 o mayor.";
    if (!Number.isFinite(form.montoUsd) || form.montoUsd < 0) return "El valor de garantía debe ser 0 o mayor.";
    if (!form.fecha.trim()) return "Elegí la fecha del valor.";
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setErr("");
    setOk("");
    const validationErr = validateForm();
    if (validationErr) {
      setErr(validationErr);
      return;
    }
    setBusy(true);
    try {
      const payload: ValorGarantiaAsicPayload = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        procesador: form.procesador.trim(),
        consumoW: form.consumoW,
        montoUsd: form.montoUsd,
        fecha: form.fecha.trim(),
        notas: form.notas?.trim() ?? "",
      };
      if (editingId != null) {
        await updateValorGarantiaAsic(editingId, payload);
        setOk("Valor de garantía actualizado. El valor anterior quedó en el historial si cambió el monto o el consumo.");
      } else {
        await createValorGarantiaAsic(payload);
        setOk("Valor de garantía registrado.");
      }
      await loadData();
      resetForm();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "No se pudo guardar el valor de garantía.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: ValorGarantiaAsicItem) => {
    if (!canEdit) return;
    setEditingId(row.id);
    setForm({
      marca: row.marca,
      modelo: row.modelo,
      procesador: row.procesador,
      consumoW: row.consumoW,
      montoUsd: row.montoUsd,
      fecha: row.fecha.slice(0, 10),
      notas: row.notas,
    });
    setErr("");
    setOk("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeItem = async (id: number) => {
    if (!canEdit) return;
    if (!window.confirm("¿Eliminar este valor de garantía ASIC y su historial?")) return;
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await deleteValorGarantiaAsic(id);
      setOk("Registro eliminado.");
      await loadData();
      if (editingId === id) resetForm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar el registro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Valores de garantías ASIC"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver atrás"
        />

        <div className="row g-3 mb-4">
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Máquinas con valor vigente</div>
              <div className="fs-4 fw-semibold">{tableLoading ? "…" : items.length}</div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Historial de actualizaciones</div>
              <div className="fs-4 fw-semibold">{tableLoading ? "…" : historial.length}</div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Suma valores vigentes (USD)</div>
              <div className="fs-4 fw-semibold">
                {tableLoading
                  ? "…"
                  : formatUsd(items.reduce((acc, row) => acc + (Number.isFinite(row.montoUsd) ? row.montoUsd : 0), 0))}
              </div>
            </div>
          </div>
        </div>

        <div className="fact-card fact-panel-nuevo-documento garantias-ande-form-panel mb-4">
          <div className="fact-panel-nuevo-documento-header">
            {editingId != null ? "Editar valor de garantía ASIC" : "Nuevo valor de garantía ASIC"}
          </div>
          <div className="fact-card-body">
            <p className="small text-muted mb-3">
              Marca, modelo y procesador salen del catálogo ASIC. Podés agregar un equipo o procesador nuevo desde cada
              lista. El valor queda fechado al momento; si lo actualizás, el anterior pasa al historial.
            </p>
            <form onSubmit={onSubmit}>
              <div className="row g-3">
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="vga-marca">
                    Marca equipo
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="marca"
                    value={form.marca}
                    onChange={(marca) => setForm((p) => ({ ...p, marca }))}
                    disabled={!canEdit || busy}
                    labelId="vga-marca"
                    placeholder="Seleccionar o agregar marca"
                    searchPlaceholder="Buscar marca…"
                    allowCreate={canEdit}
                    onError={setErr}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="vga-modelo">
                    Modelo de equipo
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="modelo"
                    value={form.modelo}
                    onChange={(modelo) =>
                      setForm((p) => ({
                        ...p,
                        modelo,
                        procesador: modelo === p.modelo ? p.procesador : "",
                      }))
                    }
                    disabled={!canEdit || busy}
                    labelId="vga-modelo"
                    placeholder="Seleccionar o agregar modelo"
                    searchPlaceholder="Buscar modelo…"
                    allowCreate={canEdit}
                    onError={setErr}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="vga-procesador">
                    Procesador
                  </label>
                  <AsicCotizadorCatalogSelect
                    tipo="procesador"
                    parent={form.modelo}
                    value={form.procesador}
                    onChange={(procesador) => setForm((p) => ({ ...p, procesador }))}
                    disabled={!canEdit || busy}
                    labelId="vga-procesador"
                    placeholder={form.modelo ? "Seleccionar o agregar procesador" : "Seleccioná modelo primero"}
                    searchPlaceholder="Buscar procesador…"
                    allowCreate={canEdit}
                    onError={setErr}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="fact-label" htmlFor="vga-consumo">
                    Consumo de energía (W)
                  </label>
                  <input
                    id="vga-consumo"
                    type="number"
                    step="1"
                    min={0}
                    className="fact-input"
                    value={form.consumoW}
                    onChange={(e) => setForm((p) => ({ ...p, consumoW: Number(e.target.value) }))}
                    disabled={!canEdit || busy}
                    placeholder="Ej. 3500"
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="fact-label" htmlFor="vga-monto">
                    Valor garantía (USD)
                  </label>
                  <input
                    id="vga-monto"
                    type="number"
                    step="0.01"
                    min={0}
                    className="fact-input"
                    value={form.montoUsd}
                    onChange={(e) => setForm((p) => ({ ...p, montoUsd: Number(e.target.value) }))}
                    disabled={!canEdit || busy}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="fact-label" htmlFor="vga-fecha">
                    Fecha del valor
                  </label>
                  <input
                    id="vga-fecha"
                    type="date"
                    className="fact-input"
                    value={form.fecha}
                    onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                    disabled={!canEdit || busy}
                  />
                </div>
                <div className="col-12">
                  <label className="fact-label" htmlFor="vga-notas">
                    Notas (opcional)
                  </label>
                  <input
                    id="vga-notas"
                    type="text"
                    className="fact-input"
                    value={form.notas ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                    disabled={!canEdit || busy}
                    placeholder="Observación de esta actualización"
                    maxLength={400}
                    autoComplete="off"
                  />
                </div>
              </div>

              {err ? <div className="alert alert-danger py-2 mt-3 mb-0">{err}</div> : null}
              {ok ? <div className="alert alert-success py-2 mt-3 mb-0">{ok}</div> : null}

              <div className="d-flex justify-content-end flex-wrap gap-2 mt-4">
                <button type="submit" className="btn btn-success" disabled={!canEdit || busy}>
                  {editingId != null ? "Guardar cambios" : "Registrar valor"}
                </button>
                {editingId != null ? (
                  <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={busy}>
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>

        <div className="fact-card">
          <div className="fact-card-body">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h5 mb-0">VALORES VIGENTES POR MÁQUINA</h2>
              <input
                type="search"
                className="fact-input"
                style={{ maxWidth: 280 }}
                placeholder="Buscar en la tabla…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="small text-muted mb-3">
              Un registro vigente por marca + modelo + procesador. El consumo es el de esa máquina; el valor se actualiza
              con la fecha del momento.
            </p>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Procesador</th>
                    <th className="text-end">Consumo</th>
                    <th className="text-end">Valor USD</th>
                    <th>Notas</th>
                    {canEdit ? <th className="text-end">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="text-muted">
                        Cargando…
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="text-muted">
                        No hay valores de garantía ASIC registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((row) => (
                      <tr key={row.id}>
                        <td>{row.fecha.slice(0, 10)}</td>
                        <td>{row.marca}</td>
                        <td>{row.modelo}</td>
                        <td>{row.procesador}</td>
                        <td className="text-end">{formatWatts(row.consumoW)}</td>
                        <td className="text-end fw-semibold">{formatUsd(row.montoUsd)}</td>
                        <td className="small" style={{ maxWidth: "14rem" }}>
                          {row.notas || "—"}
                        </td>
                        {canEdit ? (
                          <td className="text-end text-nowrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary me-1"
                              disabled={busy}
                              onClick={() => startEdit(row)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={busy}
                              onClick={() => void removeItem(row.id)}
                            >
                              Eliminar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="fact-card mt-4">
          <div className="fact-card-body">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h5 mb-0">
                <i className="bi bi-clock-history me-2" aria-hidden />
                HISTORIAL DE VALORES ANTERIORES
              </h2>
              <span className="badge text-bg-secondary">{historial.length} movimientos</span>
            </div>
            <p className="small text-muted mb-3">
              Cada vez que cambia el consumo o el valor USD, el dato previo queda acá con su fecha.
            </p>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Procesador</th>
                    <th className="text-end">Consumo</th>
                    <th className="text-end">Valor USD</th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        Cargando…
                      </td>
                    </tr>
                  ) : historial.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        Todavía no hay actualizaciones históricas.
                      </td>
                    </tr>
                  ) : (
                    historial.map((row) => (
                      <tr key={`hist-${row.id}`}>
                        <td>{row.fecha.slice(0, 10)}</td>
                        <td>{row.marca}</td>
                        <td>{row.modelo}</td>
                        <td>{row.procesador}</td>
                        <td className="text-end">{formatWatts(row.consumoW)}</td>
                        <td className="text-end fw-semibold">{formatUsd(row.montoUsd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
