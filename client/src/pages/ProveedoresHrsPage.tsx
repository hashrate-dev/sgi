import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { sgiHome } from "../lib/marketplacePaths.js";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canAccessProveedoresHrs, canEditProveedoresHrs } from "../lib/auth";
import {
  createProveedorHrs,
  deleteProveedorHrs,
  getProveedoresHrs,
  updateProveedorHrs,
  type ProveedorHrs,
  type ProveedorHrsPayload,
} from "../lib/api";
import "../styles/facturacion.css";

const EMPTY_FORM: ProveedorHrsPayload = {
  supplierName: "",
  country: "",
  ruc: "",
  rubro: "",
  contactFirstName: "",
  contactLastName: "",
};

/** Fecha + hora compacta en una sola línea (tabla proveedores). */
function formatProveedorRegistro(iso: string): string {
  const t = String(iso || "").trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const fecha = d.toLocaleDateString(undefined, { day: "numeric", month: "numeric", year: "numeric" });
  const hora = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${fecha} · ${hora}`;
}

export function ProveedoresHrsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ProveedorHrs[]>([]);
  const [form, setForm] = useState<ProveedorHrsPayload>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const canMutateList = Boolean(user && canEditProveedoresHrs(user));

  const loadList = useCallback(async () => {
    setListLoading(true);
    setErr("");
    try {
      const r = await getProveedoresHrs();
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch (e) {
      setItems([]);
      setErr(e instanceof Error ? e.message : "No se pudieron cargar los proveedores.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && canAccessProveedoresHrs(user)) {
      void loadList();
    }
  }, [loading, user, loadList]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessProveedoresHrs(user)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canMutateList) return;
    setErr("");
    setOk("");
    const supplierName = form.supplierName.trim();
    const contactFirstName = form.contactFirstName.trim();
    const contactLastName = form.contactLastName.trim();
    if (!supplierName) {
      setErr("Ingresá el nombre del proveedor.");
      return;
    }
    if (!contactFirstName || !contactLastName) {
      setErr("Ingresá nombre y apellido de la persona responsable.");
      return;
    }
    const country = (form.country ?? "").trim();
    const ruc = (form.ruc ?? "").trim();
    if (!country) {
      setErr("Ingresá el país del proveedor.");
      return;
    }
    if (!ruc) {
      setErr("Ingresá el RUC.");
      return;
    }
    const rubro = (form.rubro ?? "").trim();
    if (!rubro) {
      setErr("Ingresá el rubro del proveedor.");
      return;
    }
    setBusy(true);
    try {
      const payload = { supplierName, country, ruc, rubro, contactFirstName, contactLastName };
      if (editingId != null) {
        const r = await updateProveedorHrs(editingId, payload);
        setOk(`${r.item.supplierNumber}: datos actualizados.`);
      } else {
        const r = await createProveedorHrs(payload);
        setOk(`Proveedor registrado: ${r.item.supplierNumber} — ${r.item.supplierName}`);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el proveedor.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: ProveedorHrs) => {
    setEditingId(row.id);
    setErr("");
    setOk("");
    setForm({
      supplierName: row.supplierName,
      country: row.country,
      ruc: row.ruc,
      rubro: row.rubro ?? "",
      contactFirstName: row.contactFirstName,
      contactLastName: row.contactLastName,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErr("");
  };

  const onDeleteRow = async (row: ProveedorHrs) => {
    if (!canMutateList) return;
    const okDel = window.confirm(
      `¿Eliminar el proveedor ${row.supplierNumber} — ${row.supplierName}? Esta acción no se puede deshacer.`
    );
    if (!okDel) return;
    setErr("");
    setOk("");
    setRowBusy(row.id);
    try {
      await deleteProveedorHrs(row.id);
      if (editingId === row.id) {
        cancelEdit();
      }
      setOk(`${row.supplierNumber} eliminado.`);
      await loadList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar el proveedor.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Proveedores HRS" backTo="/gestion-financiera" backText="Volver a Gestión Financiera" />

        <div className="hrs-card hrs-card--rect p-4 mb-4">
          <div className="clientes-filtros-outer">
            <div className="clientes-filtros-container">
              <div className="card clientes-filtros-card">
                <p className="small mb-3 text-white">
                  Cada proveedor recibe un número único generado por el sistema (P001, P002, …). Los demás datos quedan
                  guardados en la base <strong>Proveedores HRS</strong>.
                </p>

                {canMutateList && editingId != null ? (
                  <div className="alert alert-light py-2 small mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2 border-0 shadow-sm">
                    <span className="text-dark">
                      Editando <strong>{items.find((i) => i.id === editingId)?.supplierNumber ?? "proveedor"}</strong> · el
                      número de proveedor no se modifica.
                    </span>
                    <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit}>
                      Cancelar edición
                    </button>
                  </div>
                ) : null}

                {canMutateList ? (
                  <form onSubmit={onSubmit} className="row g-3">
                    <div className="col-12 col-lg-5">
                      <label className="form-label">Nombre del proveedor</label>
                      <input
                        className="form-control"
                        value={form.supplierName}
                        onChange={(e) => setForm((p) => ({ ...p, supplierName: e.target.value }))}
                        maxLength={300}
                        autoComplete="organization"
                      />
                    </div>
                    <div className="col-6 col-lg-2">
                      <label className="form-label">País</label>
                      <input
                        className="form-control"
                        value={form.country ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                        maxLength={120}
                        autoComplete="country-name"
                      />
                    </div>
                    <div className="col-6 col-lg-2">
                      <label className="form-label">RUC</label>
                      <input
                        className="form-control"
                        value={form.ruc ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, ruc: e.target.value }))}
                        maxLength={120}
                      />
                    </div>
                    <div className="col-12 col-lg-3">
                      <label className="form-label">Rubro</label>
                      <input
                        className="form-control"
                        value={form.rubro ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, rubro: e.target.value }))}
                        maxLength={200}
                        placeholder="Ej. importación de equipos"
                      />
                    </div>
                    <div className="col-12 col-sm-6 col-md-4 col-xl-3">
                      <label className="form-label">Nombre persona responsable</label>
                      <input
                        className="form-control"
                        value={form.contactFirstName}
                        onChange={(e) => setForm((p) => ({ ...p, contactFirstName: e.target.value }))}
                        maxLength={120}
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="col-12 col-sm-6 col-md-4 col-xl-3">
                      <label className="form-label">Apellido persona responsable</label>
                      <input
                        className="form-control"
                        value={form.contactLastName}
                        onChange={(e) => setForm((p) => ({ ...p, contactLastName: e.target.value }))}
                        maxLength={120}
                        autoComplete="family-name"
                      />
                    </div>
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Guardando…" : editingId != null ? "Guardar cambios" : "Registrar proveedor"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="small mb-0 text-white">Solo lectura: no podés registrar proveedores con tu rol actual.</p>
                )}

                {err ? <div className="alert alert-danger mt-3 mb-0 py-2">{err}</div> : null}
                {ok ? <div className="alert alert-success mt-3 mb-0 py-2">{ok}</div> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="hrs-card p-4">
          <h2 className="h6 mb-3">Proveedores registrados</h2>
          {listLoading ? (
            <p className="text-muted small mb-0">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">Todavía no hay proveedores cargados.</p>
          ) : (
            <div className="table-responsive proveedores-hrs-tabla-wrap">
              <table className="table table-sm table-striped align-middle mb-0 proveedores-hrs-tabla">
                <thead>
                  <tr>
                    <th className="proveedores-hrs-th proveedores-hrs-col-codigo" scope="col">
                      Nº proveedor
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-col-nombre" scope="col">
                      Nombre
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-col-pais proveedores-hrs-th-compact" scope="col">
                      País
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-col-ruc" scope="col">
                      RUC
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-col-rubro" scope="col">
                      Rubro
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-col-responsable" scope="col">
                      Responsable
                    </th>
                    <th className="proveedores-hrs-th proveedores-hrs-th-registro" scope="col">
                      Registro
                    </th>
                    {canMutateList ? (
                      <th className="proveedores-hrs-th proveedores-hrs-th-acciones text-end text-nowrap" scope="col">
                        Acciones
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className={editingId === row.id ? "table-active" : undefined}>
                      <td className="proveedores-hrs-td proveedores-hrs-td-code proveedores-hrs-col-codigo text-nowrap">
                        <code>{row.supplierNumber}</code>
                      </td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-wrap proveedores-hrs-col-nombre">{row.supplierName}</td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-compact proveedores-hrs-col-pais text-nowrap">{row.country || "—"}</td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-wrap proveedores-hrs-col-ruc">{row.ruc || "—"}</td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-wrap proveedores-hrs-col-rubro">{row.rubro || "—"}</td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-wrap proveedores-hrs-col-responsable">
                        {row.contactFirstName} {row.contactLastName}
                      </td>
                      <td className="proveedores-hrs-td proveedores-hrs-td-registro small text-muted text-nowrap">
                        {formatProveedorRegistro(row.createdAt)}
                      </td>
                      {canMutateList ? (
                        <td className="proveedores-hrs-td proveedores-hrs-td-acciones text-end align-middle text-nowrap">
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-primary p-1 me-1"
                            aria-label={`Editar ${row.supplierNumber}`}
                            title="Editar"
                            disabled={busy || rowBusy === row.id}
                            onClick={() => startEdit(row)}
                          >
                            <i className="bi bi-pencil-square fs-5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-danger p-1"
                            aria-label={`Eliminar ${row.supplierNumber}`}
                            title="Eliminar"
                            disabled={busy || rowBusy === row.id}
                            onClick={() => void onDeleteRow(row)}
                          >
                            <i className={`bi fs-5 ${rowBusy === row.id ? "bi-hourglass-split" : "bi-trash3"}`} aria-hidden />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
