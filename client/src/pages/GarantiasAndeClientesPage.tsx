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

type FormState = GarantiaAndeClientePayload;

const INITIAL_FORM: FormState = {
  clientId: 0,
  marca: "",
  modelo: "",
  procesador: "",
  numeroSerie: "",
  nombreEquipo: "",
  montoUsd: 0,
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
    if (!Number.isFinite(form.montoUsd) || form.montoUsd < 0) return "El monto de garantía debe ser 0 o mayor.";
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
      <div className="container">
        <PageHeader
          title="Garantías ANDE (Clientes)"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver atrás"
        />

        <div className="row g-3 mb-4">
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Total garantías activas (USD)</div>
              <div className="fs-4 fw-semibold">{tableLoading ? "…" : formatUsd(totalUsd)}</div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Total devuelto a clientes (USD)</div>
              <div className="fs-4 fw-semibold">{tableLoading ? "…" : formatUsd(totalDevueltoUsd)}</div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-xl-4">
            <div className="hrs-card sgi-glass-panel p-3 h-100">
              <div className="text-muted small mb-1">Registros</div>
              <div className="fs-4 fw-semibold">{tableLoading ? "…" : items.length}</div>
            </div>
          </div>
        </div>

        <div className="fact-card fact-panel-nuevo-documento garantias-ande-form-panel mb-4">
          <div className="fact-panel-nuevo-documento-header">
            {editingId != null ? "Editar garantía ANDE" : "Nueva garantía ANDE"}
          </div>
          <div className="fact-card-body">
            <form onSubmit={onSubmit}>
              <div className="row g-3">
                <div className="col-12 col-lg-6">
                  <label className="fact-label" htmlFor="ga-ande-cliente">
                    Cliente (listado Hosting)
                  </label>
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
                <div className="col-12 col-md-6 col-lg-3">
                  <label className="fact-label" htmlFor="ga-ande-fecha">
                    Fecha inicio
                  </label>
                  <input
                    id="ga-ande-fecha"
                    type="date"
                    className="fact-input"
                    value={form.fechaInicio}
                    onChange={(e) => setForm((p) => ({ ...p, fechaInicio: e.target.value }))}
                    disabled={!canEdit || busy}
                  />
                </div>
                <div className="col-12 col-md-6 col-lg-3">
                  <label className="fact-label" htmlFor="ga-ande-monto">
                    Monto garantía (USD)
                  </label>
                  <input
                    id="ga-ande-monto"
                    type="number"
                    step="0.01"
                    min={0}
                    className="fact-input"
                    value={form.montoUsd}
                    onChange={(e) => setForm((p) => ({ ...p, montoUsd: Number(e.target.value) }))}
                    disabled={!canEdit || busy}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="ga-ande-marca">
                    Marca equipo
                  </label>
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
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="ga-ande-modelo">
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
                    labelId="ga-ande-modelo"
                    placeholder="Seleccionar modelo"
                    searchPlaceholder="Buscar modelo…"
                    allowCreate={false}
                    onError={setErr}
                  />
                </div>
                <div className="col-12 col-md-4 asic-cotizador-field-wrap">
                  <label className="fact-label" htmlFor="ga-ande-procesador">
                    Procesador
                  </label>
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
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="ga-ande-serie">
                    Número de serie
                  </label>
                  <input
                    id="ga-ande-serie"
                    type="text"
                    className="fact-input"
                    value={form.numeroSerie}
                    onChange={(e) => setForm((p) => ({ ...p, numeroSerie: e.target.value }))}
                    disabled={!canEdit || busy}
                    placeholder="Ej. SN-123456"
                    autoComplete="off"
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="ga-ande-nombre-equipo">
                    Nombre equipo
                  </label>
                  <input
                    id="ga-ande-nombre-equipo"
                    type="text"
                    className="fact-input"
                    value={form.nombreEquipo}
                    onChange={(e) => setForm((p) => ({ ...p, nombreEquipo: e.target.value }))}
                    disabled={!canEdit || busy}
                    placeholder="Nombre identificatorio del equipo"
                    autoComplete="off"
                  />
                </div>
              </div>

              {err ? <div className="alert alert-danger py-2 mt-3 mb-0">{err}</div> : null}
              {ok ? <div className="alert alert-success py-2 mt-3 mb-0">{ok}</div> : null}

              <div className="d-flex justify-content-end flex-wrap gap-2 mt-4">
                <button type="submit" className="btn btn-success" disabled={!canEdit || busy}>
                  {editingId != null ? "Guardar cambios" : "Registrar garantía"}
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
              <h2 className="h5 mb-0">REGISTROS DE GARANTÍAS ANDE (USD)</h2>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <div className="btn-group btn-group-sm" role="group" aria-label="Filtro de estado">
                  <button
                    type="button"
                    className={`btn ${estadoFiltro === "todas" ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => setEstadoFiltro("todas")}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={`btn ${estadoFiltro === "activas" ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => setEstadoFiltro("activas")}
                  >
                    Activas
                  </button>
                  <button
                    type="button"
                    className={`btn ${estadoFiltro === "devueltas" ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => setEstadoFiltro("devueltas")}
                  >
                    Ya devueltas
                  </button>
                </div>
                <input
                  type="search"
                  className="fact-input"
                  style={{ maxWidth: 280 }}
                  placeholder="Buscar en la tabla…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <p className="small text-muted mb-3">
              Cuando un equipo se da de baja con devolución de garantía, el registro queda marcado como{" "}
              <span className="badge text-bg-warning text-dark">YA DEVUELTA</span> y también figura en el historial
              debajo.
            </p>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Fecha inicio</th>
                    <th>Cliente</th>
                    <th>Nombre equipo</th>
                    <th>Nº serie</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Procesador</th>
                    <th className="text-end">Monto USD</th>
                    <th>Devolución</th>
                    {canEdit ? <th className="text-end">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr>
                      <td colSpan={canEdit ? 11 : 10} className="text-muted">
                        Cargando…
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 11 : 10} className="text-muted">
                        No hay garantías registradas.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((row) => {
                      const isDevuelta = row.estado === "devuelta";
                      return (
                        <tr
                          key={row.id}
                          className={isDevuelta ? "table-warning" : undefined}
                          style={isDevuelta ? { opacity: 0.92 } : undefined}
                        >
                          <td>
                            {isDevuelta ? (
                              <span className="badge text-bg-warning text-dark">
                                <i className="bi bi-arrow-return-left me-1" aria-hidden />
                                YA DEVUELTA
                              </span>
                            ) : (
                              <span className="badge text-bg-success">Activa</span>
                            )}
                          </td>
                          <td>{row.fechaInicio.slice(0, 10)}</td>
                          <td>{clientFullName(row)}</td>
                          <td>{row.nombreEquipo || "—"}</td>
                          <td>{row.numeroSerie || "—"}</td>
                          <td>{row.marca}</td>
                          <td>{row.modelo}</td>
                          <td>{row.procesador}</td>
                          <td className="text-end fw-semibold">
                            {isDevuelta ? (
                              <span className="text-decoration-line-through text-muted me-1">
                                {formatUsd(row.montoUsd)}
                              </span>
                            ) : null}
                            {isDevuelta
                              ? formatUsd(Number(row.montoDevueltoUsd ?? row.montoUsd))
                              : formatUsd(row.montoUsd)}
                          </td>
                          <td className="small">
                            {isDevuelta ? (
                              <>
                                <div className="fw-semibold">{row.fechaDevolucion?.slice(0, 10) || "—"}</div>
                                <div>{formatUsd(Number(row.montoDevueltoUsd ?? row.montoUsd))}</div>
                                {row.devolucionNota ? (
                                  <div className="text-muted" style={{ maxWidth: "14rem" }}>
                                    {row.devolucionNota}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          {canEdit ? (
                            <td className="text-end text-nowrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary me-1"
                                disabled={busy || isDevuelta}
                                title={isDevuelta ? "Garantía ya devuelta: no editable" : "Editar"}
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
                      );
                    })
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
                HISTORIAL DE DEVOLUCIONES DE GARANTÍA
              </h2>
              <span className="badge text-bg-secondary">{historialDevoluciones.length} movimientos</span>
            </div>
            <p className="small text-muted mb-3">
              Registro histórico de garantías ANDE ya devueltas al cliente (ajuste al dar de baja el equipo en el
              monitor).
            </p>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Fecha devolución</th>
                    <th>Cliente</th>
                    <th>Equipo</th>
                    <th>Nº serie</th>
                    <th className="text-end">Monto devuelto</th>
                    <th>Detalle / baja</th>
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr>
                      <td colSpan={7} className="text-muted">
                        Cargando…
                      </td>
                    </tr>
                  ) : historialDevoluciones.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted">
                        Todavía no hay devoluciones registradas.
                      </td>
                    </tr>
                  ) : (
                    historialDevoluciones.map((row) => (
                      <tr key={`dev-${row.id}`} className="table-warning">
                        <td>
                          <span className="badge text-bg-warning text-dark">
                            <i className="bi bi-check2-circle me-1" aria-hidden />
                            YA DEVUELTA
                          </span>
                        </td>
                        <td>{row.fechaDevolucion?.slice(0, 10) || "—"}</td>
                        <td>{clientFullName(row)}</td>
                        <td>
                          {row.nombreEquipo || "—"}
                          <div className="small text-muted">
                            {row.marca} {row.modelo} {row.procesador}
                          </div>
                        </td>
                        <td className="font-monospace small">{row.numeroSerie || "—"}</td>
                        <td className="text-end fw-semibold">
                          {formatUsd(Number(row.montoDevueltoUsd ?? row.montoUsd))}
                        </td>
                        <td className="small" style={{ maxWidth: "18rem" }}>
                          {row.devolucionNota || "—"}
                          {row.bajaEquipoId ? (
                            <div className="text-muted mt-1">
                              Baja equipo:{" "}
                              <code className="small sgi-tech-code">{row.bajaEquipoId.slice(0, 8)}…</code>
                            </div>
                          ) : null}
                        </td>
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
