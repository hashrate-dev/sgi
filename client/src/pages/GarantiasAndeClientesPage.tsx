import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AsicCotizadorCatalogSelect } from "../components/AsicCotizadorCatalogSelect";
import { HostingClientSelect } from "../components/HostingClientSelect";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  createGarantiaAndeCliente,
  deleteGarantiaAndeCliente,
  getGarantiasAndeClientes,
  getGarantiasAndeHostingClients,
  updateGarantiaAndeCliente,
  type GarantiaAndeClienteItem,
  type GarantiaAndeClientePayload,
} from "../lib/api";
import { canAccessGarantiasModule, canEditGarantiasModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import "../styles/facturacion.css";
import "../styles/valores-garantias-asic.css";

type FormState = GarantiaAndeClientePayload;

const INITIAL_FORM: FormState = {
  clientId: 0,
  marca: "",
  modelo: "",
  procesador: "",
  numeroSerie: "",
  nombreEquipo: "",
  montoUsd: 0,
  montoClienteUsd: 0,
  fechaInicio: new Date().toISOString().slice(0, 10),
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDateShort(ymd: string): string {
  const d = String(ymd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function clientFullName(c: {
  code?: string;
  clientCode?: string;
  name?: string;
  clientName?: string;
  name2?: string;
  clientName2?: string;
}): string {
  const name = `${String(c.name ?? c.clientName ?? "").trim()}${
    c.name2 || c.clientName2 ? ` ${String(c.name2 ?? c.clientName2 ?? "").trim()}` : ""
  }`.trim();
  const code = String(c.code ?? c.clientCode ?? "").trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || "—";
}

export function GarantiasAndeClientesPage() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<Array<{ id: number; code: string; name: string; name2?: string }>>([]);
  const [items, setItems] = useState<GarantiaAndeClienteItem[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"todas" | "activas" | "devueltas">("todas");

  const canEdit = Boolean(user && canEditGarantiasModule(user));

  const loadData = useCallback(async () => {
    setTableLoading(true);
    try {
      const [cRes, gRes] = await Promise.all([getGarantiasAndeHostingClients(), getGarantiasAndeClientes()]);
      const normalized = (cRes.clients || [])
        .map((x) => ({
          id: Number(x.id ?? 0),
          code: String(x.code || "").trim(),
          name: String(x.name || "").trim(),
          name2: String(x.name2 || "").trim(),
        }))
        .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.code && x.name);
      setClients(normalized);
      setItems(gRes.items || []);
      setForm((prev) =>
        prev.clientId > 0 || normalized.length === 0
          ? prev
          : { ...prev, clientId: normalized[0]!.id }
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la información.");
      setItems([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessGarantiasModule(user)) return;
    void loadData();
  }, [loading, user, loadData]);

  const totalUsd = useMemo(
    () =>
      items
        .filter((row) => (row.estado ?? "activa") === "activa")
        .reduce((acc, row) => acc + (Number.isFinite(row.montoUsd) ? row.montoUsd : 0), 0),
    [items]
  );
  const totalClienteUsd = useMemo(
    () =>
      items
        .filter((row) => (row.estado ?? "activa") === "activa")
        .reduce((acc, row) => acc + (Number.isFinite(row.montoClienteUsd) ? row.montoClienteUsd : 0), 0),
    [items]
  );
  const totalDevueltoUsd = useMemo(
    () =>
      items
        .filter((row) => row.estado === "devuelta")
        .reduce(
          (acc, row) =>
            acc +
            (Number.isFinite(row.montoDevueltoUsd ?? NaN)
              ? Number(row.montoDevueltoUsd)
              : Number.isFinite(row.montoUsd)
                ? row.montoUsd
                : 0),
          0
        ),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return items.filter((row) => {
      const estado = row.estado ?? "activa";
      if (estadoFiltro === "activas" && estado !== "activa") return false;
      if (estadoFiltro === "devueltas" && estado !== "devuelta") return false;
      if (!q) return true;
      const hay = [
        row.clientCode,
        row.clientName,
        row.clientName2,
        row.marca,
        row.modelo,
        row.procesador,
        row.numeroSerie,
        row.nombreEquipo,
        row.estado,
        row.devolucionNota,
        String(row.montoUsd),
        String(row.montoClienteUsd),
        row.fechaInicio,
        row.fechaDevolucion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");
      return hay.includes(q);
    });
  }, [items, search, estadoFiltro]);

  const historialDevoluciones = useMemo(
    () =>
      items
        .filter((row) => (row.estado ?? "activa") === "devuelta")
        .slice()
        .sort((a, b) => {
          const da = String(a.fechaDevolucion || a.updatedAt || "");
          const db = String(b.fechaDevolucion || b.updatedAt || "");
          return db.localeCompare(da);
        }),
    [items]
  );

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessGarantiasModule(user)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const resetForm = () => {
    setEditingId(null);
    setForm({
      ...INITIAL_FORM,
      fechaInicio: new Date().toISOString().slice(0, 10),
      clientId: clients[0]?.id ?? 0,
    });
  };

  const reloadHostingClients = async (selectId?: number) => {
    const cRes = await getGarantiasAndeHostingClients();
    const normalized = (cRes.clients || [])
      .map((x) => ({
        id: Number(x.id ?? 0),
        code: String(x.code || "").trim(),
        name: String(x.name || "").trim(),
        name2: String(x.name2 || "").trim(),
      }))
      .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.code && x.name);
    setClients(normalized);
    if (selectId != null && selectId > 0) {
      setForm((prev) => ({ ...prev, clientId: selectId }));
    }
    return normalized;
  };

  const validateForm = (): string | null => {
    if (!form.clientId || form.clientId <= 0) return "Seleccioná un cliente de hosting.";
    if (!form.marca.trim()) return "Seleccioná la marca del equipo.";
    if (!form.modelo.trim()) return "Seleccioná el modelo del equipo.";
    if (!form.procesador.trim()) return "Seleccioná el procesador.";
    if (!form.numeroSerie.trim()) return "Ingresá el número de serie.";
    if (!form.nombreEquipo.trim()) return "Ingresá el nombre del equipo.";
    if (!Number.isFinite(form.montoUsd) || form.montoUsd < 0) return "El monto de garantía hosting debe ser 0 o mayor.";
    if (!Number.isFinite(form.montoClienteUsd) || form.montoClienteUsd < 0) {
      return "El monto de garantía cliente debe ser 0 o mayor.";
    }
    if (!form.fechaInicio.trim()) return "Elegí la fecha de inicio.";
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
      const payload: GarantiaAndeClientePayload = {
        clientId: form.clientId,
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        procesador: form.procesador.trim(),
        numeroSerie: form.numeroSerie.trim(),
        nombreEquipo: form.nombreEquipo.trim(),
        montoUsd: form.montoUsd,
        montoClienteUsd: form.montoClienteUsd,
        fechaInicio: form.fechaInicio.trim(),
      };
      if (editingId != null) {
        await updateGarantiaAndeCliente(editingId, payload);
        setOk("Garantía actualizada correctamente.");
      } else {
        await createGarantiaAndeCliente(payload);
        setOk("Garantía registrada correctamente.");
      }
      const refreshed = await getGarantiasAndeClientes();
      setItems(refreshed.items || []);
      resetForm();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "No se pudo guardar la garantía.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: GarantiaAndeClienteItem) => {
    if (!canEdit) return;
    if (row.estado === "devuelta") {
      setErr("Esta garantía ya fue devuelta al cliente; no se puede editar.");
      return;
    }
    setEditingId(row.id);
    setForm({
      clientId: row.clientId,
      marca: row.marca,
      modelo: row.modelo,
      procesador: row.procesador,
      numeroSerie: row.numeroSerie,
      nombreEquipo: row.nombreEquipo,
      montoUsd: row.montoUsd,
      montoClienteUsd: row.montoClienteUsd,
      fechaInicio: row.fechaInicio.slice(0, 10),
    });
    setErr("");
    setOk("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeItem = async (id: number) => {
    if (!canEdit) return;
    if (!window.confirm("¿Eliminar este registro de garantía ANDE?")) return;
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await deleteGarantiaAndeCliente(id);
      setOk("Garantía eliminada.");
      const refreshed = await getGarantiasAndeClientes();
      setItems(refreshed.items || []);
      if (editingId === id) resetForm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar la garantía.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fact-page">
      <div className="container vga-page">
        <PageHeader
          title="Garantías ANDE (Clientes)"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver atrás"
        />

        <div className="vga-kpis">
          <div className="vga-kpi">
            <span>Suma hosting activa</span>
            <strong>{tableLoading ? "…" : formatUsd(totalUsd)}</strong>
          </div>
          <div className="vga-kpi">
            <span>Suma cliente activa</span>
            <strong>{tableLoading ? "…" : formatUsd(totalClienteUsd)}</strong>
          </div>
          <div className="vga-kpi">
            <span>Total devuelto a clientes</span>
            <strong>{tableLoading ? "…" : formatUsd(totalDevueltoUsd)}</strong>
          </div>
          <div className="vga-kpi">
            <span>Registros</span>
            <strong>{tableLoading ? "…" : items.length}</strong>
          </div>
        </div>

        <section className="vga-composer">
          <header className="vga-composer__head">
            <div>
              <p className="vga-kicker">Registro ANDE</p>
              <h2>{editingId != null ? "Editar garantía ANDE" : "Nueva garantía ANDE"}</h2>
              <p>Asigná el equipo del catálogo ASIC al cliente de hosting. Hosting y cliente se cargan por separado.</p>
            </div>
            <div className="vga-date">
              <label htmlFor="ga-ande-fecha">Fecha de inicio</label>
              <input
                id="ga-ande-fecha"
                type="date"
                value={form.fechaInicio}
                onChange={(e) => setForm((p) => ({ ...p, fechaInicio: e.target.value }))}
                disabled={!canEdit || busy}
              />
            </div>
          </header>

          <div className="vga-composer__body">
            <form onSubmit={onSubmit}>
              <div className="vga-sections">
                <div className="vga-section">
                  <h3>Cliente y equipo</h3>
                  <div className="vga-field">
                    <label htmlFor="ga-ande-cliente">Cliente (listado Hosting)</label>
                    <HostingClientSelect
                      buttonId="ga-ande-cliente"
                      value={form.clientId}
                      onChange={(clientId) => setForm((p) => ({ ...p, clientId }))}
                      clients={clients}
                      canAdd={canEdit}
                      disabled={!canEdit || busy}
                      required
                      placeholder="Seleccionar cliente de hosting"
                      onClientCreated={async (created) => {
                        await reloadHostingClients(created.id);
                        setOk(`Cliente de hosting agregado: ${created.code} — ${created.name}`);
                        setErr("");
                      }}
                    />
                  </div>
                  <div className="vga-equipo">
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="ga-ande-marca">Marca</label>
                      <AsicCotizadorCatalogSelect
                        tipo="marca"
                        value={form.marca}
                        onChange={(marca) => setForm((p) => ({ ...p, marca }))}
                        disabled={!canEdit || busy}
                        labelId="ga-ande-marca"
                        placeholder="Seleccionar marca"
                        searchPlaceholder="Buscar marca…"
                        allowCreate={false}
                        onError={setErr}
                      />
                    </div>
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="ga-ande-modelo">Modelo</label>
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
                        labelId="ga-ande-modelo"
                        placeholder="Seleccionar modelo"
                        searchPlaceholder="Buscar modelo…"
                        allowCreate={false}
                        onError={setErr}
                      />
                    </div>
                    <div className="vga-field asic-cotizador-field-wrap">
                      <label htmlFor="ga-ande-procesador">Procesador</label>
                      <AsicCotizadorCatalogSelect
                        tipo="procesador"
                        parent={form.modelo}
                        value={form.procesador}
                        onChange={(procesador) => setForm((p) => ({ ...p, procesador }))}
                        disabled={!canEdit || busy}
                        labelId="ga-ande-procesador"
                        placeholder={form.modelo ? "Seleccionar procesador" : "Seleccionar modelo primero"}
                        searchPlaceholder="Buscar procesador…"
                        allowCreate={false}
                        onError={setErr}
                      />
                    </div>
                  </div>
                </div>

                <div className="vga-section">
                  <h3>Identificación y montos</h3>
                  <div className="vga-money-pair">
                    <div className="vga-money vga-money--hosting">
                      <label htmlFor="ga-ande-monto">Monto USD Hosting</label>
                      <div className="vga-money__box">
                        <em>USD</em>
                        <input
                          id="ga-ande-monto"
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
                      <label htmlFor="ga-ande-monto-cliente">Monto USD Cliente</label>
                      <div className="vga-money__box">
                        <em>USD</em>
                        <input
                          id="ga-ande-monto-cliente"
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
                    <label htmlFor="ga-ande-serie">Número de serie</label>
                    <input
                      id="ga-ande-serie"
                      type="text"
                      className="vga-input"
                      value={form.numeroSerie}
                      onChange={(e) => setForm((p) => ({ ...p, numeroSerie: e.target.value }))}
                      disabled={!canEdit || busy}
                      placeholder="Ej. SN-123456"
                      autoComplete="off"
                    />
                  </div>
                  <div className="vga-field vga-meta">
                    <label htmlFor="ga-ande-nombre-equipo">Nombre equipo</label>
                    <input
                      id="ga-ande-nombre-equipo"
                      type="text"
                      className="vga-input"
                      value={form.nombreEquipo}
                      onChange={(e) => setForm((p) => ({ ...p, nombreEquipo: e.target.value }))}
                      disabled={!canEdit || busy}
                      placeholder="Nombre identificatorio del equipo"
                      autoComplete="off"
                    />
                  </div>
                </div>
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
                  {editingId != null ? "Guardar cambios" : "Registrar garantía"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="vga-sheet">
          <div className="vga-sheet__top">
            <h2>Registros de garantías ANDE (USD)</h2>
            <div className="vga-sheet__tools">
              <div className="vga-filters" role="group" aria-label="Filtro de estado">
                <button
                  type="button"
                  className={`vga-filter${estadoFiltro === "todas" ? " is-on" : ""}`}
                  onClick={() => setEstadoFiltro("todas")}
                >
                  Todas
                </button>
                <button
                  type="button"
                  className={`vga-filter${estadoFiltro === "activas" ? " is-on" : ""}`}
                  onClick={() => setEstadoFiltro("activas")}
                >
                  Activas
                </button>
                <button
                  type="button"
                  className={`vga-filter${estadoFiltro === "devueltas" ? " is-on" : ""}`}
                  onClick={() => setEstadoFiltro("devueltas")}
                >
                  Ya devueltas
                </button>
              </div>
              <input
                type="search"
                className="fact-input"
                placeholder="Buscar en la tabla…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <p>
            Cuando un equipo se da de baja con devolución de garantía, el registro queda marcado como{" "}
            <strong>ya devuelta</strong> y también figura en el historial debajo.
          </p>
          <div className="vga-frame">
            <table className="vga-gridtable">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Fecha inicio</th>
                  <th>Cliente</th>
                  <th>Equipo</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Procesador</th>
                  <th className="vga-num">
                    Monto USD
                    <span>Hosting</span>
                  </th>
                  <th className="vga-num">
                    Monto USD
                    <span>Cliente</span>
                  </th>
                  <th>Devolución</th>
                  {canEdit ? <th className="vga-num">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="vga-empty">
                      Cargando registros…
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="vga-empty">
                      No hay garantías registradas.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((row) => {
                    const isDevuelta = row.estado === "devuelta";
                    return (
                      <tr key={row.id} className={isDevuelta ? "is-returned" : undefined}>
                        <td>
                          {isDevuelta ? (
                            <span className="vga-pill vga-pill--off">Ya devuelta</span>
                          ) : (
                            <span className="vga-pill vga-pill--on">Activa</span>
                          )}
                        </td>
                        <td className="vga-datecell">{formatDateShort(row.fechaInicio)}</td>
                        <td>{clientFullName(row)}</td>
                        <td>
                          {row.nombreEquipo || "—"}
                          <span className="vga-sn vga-sub">{row.numeroSerie || "—"}</span>
                        </td>
                        <td>{row.marca}</td>
                        <td className="vga-model">{row.modelo}</td>
                        <td className="vga-proc">{row.procesador}</td>
                        <td className="vga-num">
                          <span className={`vga-amt vga-amt--h${isDevuelta ? " text-decoration-line-through" : ""}`}>
                            {formatUsd(row.montoUsd)}
                          </span>
                        </td>
                        <td className="vga-num">
                          <span className={`vga-amt vga-amt--c${isDevuelta ? " text-decoration-line-through" : ""}`}>
                            {formatUsd(row.montoClienteUsd)}
                          </span>
                        </td>
                        <td>
                          {isDevuelta ? (
                            <>
                              {formatDateShort(row.fechaDevolucion || "")}
                              <span className="vga-sub">
                                Devuelto {formatUsd(Number(row.montoDevueltoUsd ?? row.montoClienteUsd))}
                              </span>
                              {row.devolucionNota ? <span className="vga-sub">{row.devolucionNota}</span> : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        {canEdit ? (
                          <td className="vga-num">
                            <div className="vga-row-actions">
                              <button
                                type="button"
                                disabled={busy || isDevuelta}
                                title={isDevuelta ? "Garantía ya devuelta: no editable" : "Editar"}
                                onClick={() => startEdit(row)}
                              >
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="vga-sheet">
          <div className="vga-sheet__top">
            <h2>
              <i className="bi bi-clock-history me-2" aria-hidden />
              Historial de devoluciones de garantía
            </h2>
            <span className="vga-count">{historialDevoluciones.length} movimientos</span>
          </div>
          <p>
            Registro histórico de garantías ANDE ya devueltas al cliente (ajuste al dar de baja el equipo en el
            monitor).
          </p>
          <div className="vga-frame">
            <table className="vga-gridtable">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Fecha devolución</th>
                  <th>Cliente</th>
                  <th>Equipo</th>
                  <th>Nº serie</th>
                  <th className="vga-num">
                    Monto USD
                    <span>Hosting</span>
                  </th>
                  <th className="vga-num">
                    Monto USD
                    <span>Cliente</span>
                  </th>
                  <th className="vga-num">Monto devuelto</th>
                  <th>Detalle / baja</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={9} className="vga-empty">
                      Cargando historial…
                    </td>
                  </tr>
                ) : historialDevoluciones.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="vga-empty">
                      Todavía no hay devoluciones registradas.
                    </td>
                  </tr>
                ) : (
                  historialDevoluciones.map((row) => (
                    <tr key={`dev-${row.id}`} className="is-returned">
                      <td>
                        <span className="vga-pill vga-pill--off">Ya devuelta</span>
                      </td>
                      <td className="vga-datecell">{formatDateShort(row.fechaDevolucion || "")}</td>
                      <td>{clientFullName(row)}</td>
                      <td>
                        {row.nombreEquipo || "—"}
                        <span className="vga-sub">
                          {row.marca} {row.modelo} {row.procesador}
                        </span>
                      </td>
                      <td className="vga-sn">{row.numeroSerie || "—"}</td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--h">{formatUsd(row.montoUsd)}</span>
                      </td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--c">{formatUsd(row.montoClienteUsd)}</span>
                      </td>
                      <td className="vga-num">
                        <span className="vga-amt vga-amt--c">
                          {formatUsd(Number(row.montoDevueltoUsd ?? row.montoClienteUsd ?? row.montoUsd))}
                        </span>
                      </td>
                      <td className="vga-notes-cell">
                        {row.devolucionNota || "—"}
                        {row.bajaEquipoId ? (
                          <span className="vga-sub">Baja equipo: {row.bajaEquipoId.slice(0, 8)}…</span>
                        ) : null}
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
