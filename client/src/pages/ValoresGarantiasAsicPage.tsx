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
import "../styles/valores-garantias-asic.css";

const PATH = "/gestion-administrativa/valores-garantias-asic";

const INITIAL_FORM: ValorGarantiaAsicPayload = {
  marca: "",
  modelo: "",
  procesador: "",
  consumoW: 0,
  montoUsd: 0,
  montoClienteUsd: 0,
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

function formatDateShort(ymd: string): string {
  const d = String(ymd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
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
      [row.marca, row.modelo, row.procesador, row.notas, String(row.consumoW), String(row.montoUsd), String(row.montoClienteUsd), row.fecha]
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
    if (!Number.isFinite(form.montoUsd) || form.montoUsd < 0) return "El valor de garantía hosting debe ser 0 o mayor.";
    if (!Number.isFinite(form.montoClienteUsd) || form.montoClienteUsd < 0) {
      return "El valor de garantía cliente debe ser 0 o mayor.";
    }
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
        montoClienteUsd: form.montoClienteUsd,
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
      montoClienteUsd: row.montoClienteUsd,
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
      <div className="container vga-page">
        <PageHeader
          title="Valores de garantías ASIC"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver atrás"
        />

        <div className="vga-kpis">
          <div className="vga-kpi">
            <span>Máquinas vigentes</span>
            <strong>{tableLoading ? "…" : items.length}</strong>
          </div>
          <div className="vga-kpi">
            <span>Actualizaciones</span>
            <strong>{tableLoading ? "…" : historial.length}</strong>
          </div>
          <div className="vga-kpi">
            <span>Suma hosting</span>
            <strong>
              {tableLoading
                ? "…"
                : formatUsd(items.reduce((acc, row) => acc + (Number.isFinite(row.montoUsd) ? row.montoUsd : 0), 0))}
            </strong>
          </div>
          <div className="vga-kpi">
            <span>Suma cliente</span>
            <strong>
              {tableLoading
                ? "…"
                : formatUsd(
                    items.reduce((acc, row) => acc + (Number.isFinite(row.montoClienteUsd) ? row.montoClienteUsd : 0), 0)
                  )}
            </strong>
          </div>
        </div>

        <section className="vga-composer">
          <header className="vga-composer__head">
            <div>
              <p className="vga-kicker">Catálogo de valores</p>
              <h2>{editingId != null ? "Editar valor de garantía ASIC" : "Nuevo valor de garantía ASIC"}</h2>
              <p>Elegí el equipo del catálogo ASIC. Hosting y cliente se cargan por separado y quedan fechados.</p>
            </div>
            <div className="vga-date">
              <label htmlFor="vga-fecha">Fecha del valor</label>
              <input
                id="vga-fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                disabled={!canEdit || busy}
              />
            </div>
          </header>

          <div className="vga-composer__body">
            <form onSubmit={onSubmit}>
              <div className="vga-sections">
                <div className="vga-section">
                  <h3>Equipo</h3>
                  <div className="vga-equipo">
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="vga-marca">Marca</label>
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
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="vga-modelo">Modelo</label>
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
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="vga-procesador">Procesador</label>
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
                  </div>
                </div>

                <div className="vga-section">
                  <h3>Valores y consumo</h3>
                  <div className="vga-money-pair">
                    <div className="vga-money vga-money--hosting">
                      <label htmlFor="vga-monto">Valor garantía USD (Hosting)</label>
                      <div className="vga-money__box">
                        <em>USD</em>
                        <input
                          id="vga-monto"
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.montoUsd}
                          onChange={(e) => setForm((p) => ({ ...p, montoUsd: Number(e.target.value) }))}
                          disabled={!canEdit || busy}
                        />
                      </div>
                    </div>
                    <div className="vga-money vga-money--client">
                      <label htmlFor="vga-monto-cliente">Valor garantía (Cliente)</label>
                      <div className="vga-money__box">
                        <em>USD</em>
                        <input
                          id="vga-monto-cliente"
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.montoClienteUsd}
                          onChange={(e) => setForm((p) => ({ ...p, montoClienteUsd: Number(e.target.value) }))}
                          disabled={!canEdit || busy}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="vga-field vga-meta">
                    <label htmlFor="vga-consumo">Consumo de energía</label>
                    <div className="vga-affix">
                      <input
                        id="vga-consumo"
                        type="number"
                        step="1"
                        min={0}
                        value={form.consumoW}
                        onChange={(e) => setForm((p) => ({ ...p, consumoW: Number(e.target.value) }))}
                        disabled={!canEdit || busy}
                        placeholder="3500"
                      />
                      <span>W</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="vga-field vga-notes">
                <label htmlFor="vga-notas">Notas (opcional)</label>
                <input
                  id="vga-notas"
                  type="text"
                  value={form.notas ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                  disabled={!canEdit || busy}
                  placeholder="Observación de esta actualización"
                  maxLength={400}
                  autoComplete="off"
                />
              </div>

              {err ? <div className="alert alert-danger vga-msg">{err}</div> : null}
              {ok ? <div className="alert alert-success vga-msg">{ok}</div> : null}

              <div className="vga-actions">
                {editingId != null ? (
                  <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={busy}>
                    Cancelar edición
                  </button>
                ) : null}
                <button type="submit" className="btn btn-success" disabled={!canEdit || busy}>
                  {editingId != null ? "Guardar cambios" : "Registrar valor"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="vga-sheet">
          <div className="vga-sheet__top">
            <h2>Valores vigentes por máquina</h2>
            <input
              type="search"
              className="fact-input"
              placeholder="Buscar en la tabla…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p>
            Un registro vigente por marca + modelo + procesador. El consumo es el de esa máquina; los valores se
            actualizan con la fecha del momento.
          </p>
          <div className="vga-frame">
            <table className="vga-gridtable">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Procesador</th>
                  <th className="vga-num">Consumo</th>
                  <th className="vga-num">
                    Valor garantía
                    <span>USD (Hosting)</span>
                  </th>
                  <th className="vga-num">
                    Valor garantía
                    <span>(Cliente)</span>
                  </th>
                  <th>Notas</th>
                  {canEdit ? <th className="vga-num">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8} className="vga-empty">
                      Cargando registros…
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8} className="vga-empty">
                      No hay valores de garantía ASIC registrados.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((row) => (
                    <tr key={row.id}>
                      <td className="vga-datecell">{formatDateShort(row.fecha)}</td>
                      <td>{row.marca}</td>
                      <td className="vga-model">{row.modelo}</td>
                      <td className="vga-proc">{row.procesador}</td>
                      <td className="vga-num">{formatWatts(row.consumoW)}</td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--h">{formatUsd(row.montoUsd)}</span>
                      </td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--c">{formatUsd(row.montoClienteUsd)}</span>
                      </td>
                      <td className="vga-notes-cell">{row.notas || "—"}</td>
                      {canEdit ? (
                        <td className="vga-num">
                          <div className="vga-row-actions">
                            <button type="button" disabled={busy} onClick={() => startEdit(row)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              disabled={busy}
                              onClick={() => void removeItem(row.id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="vga-sheet">
          <div className="vga-sheet__top">
            <h2>
              <i className="bi bi-clock-history me-2" aria-hidden />
              Historial de valores anteriores
            </h2>
            <span className="vga-count">{historial.length} movimientos</span>
          </div>
          <p>
            Cada vez que cambia el consumo o alguno de los valores de garantía, el dato previo queda acá con su fecha.
          </p>
          <div className="vga-frame">
            <table className="vga-gridtable">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Procesador</th>
                  <th className="vga-num">Consumo</th>
                  <th className="vga-num">
                    Valor garantía
                    <span>USD (Hosting)</span>
                  </th>
                  <th className="vga-num">
                    Valor garantía
                    <span>(Cliente)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={7} className="vga-empty">
                      Cargando historial…
                    </td>
                  </tr>
                ) : historial.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="vga-empty">
                      Todavía no hay actualizaciones históricas.
                    </td>
                  </tr>
                ) : (
                  historial.map((row) => (
                    <tr key={`hist-${row.id}`}>
                      <td className="vga-datecell">{formatDateShort(row.fecha)}</td>
                      <td>{row.marca}</td>
                      <td className="vga-model">{row.modelo}</td>
                      <td className="vga-proc">{row.procesador}</td>
                      <td className="vga-num">{formatWatts(row.consumoW)}</td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--h">{formatUsd(row.montoUsd)}</span>
                      </td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--c">{formatUsd(row.montoClienteUsd)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
