import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canAccessLeadsBase } from "../lib/auth";
import {
  deletePotencialClienteLead,
  downloadPotencialesClientesCsv,
  getPotencialesClientesLeads,
  updatePotencialClienteLead,
  type ApiHttpError,
  type PotencialClienteLead,
  type PotencialClienteLeadPayload,
} from "../lib/api";
import "../styles/facturacion.css";

type LeadFormState = {
  nombre: string;
  apellidos: string;
  email: string;
  celular: string;
  observaciones: string;
};

const EMPTY_FORM: LeadFormState = {
  nombre: "",
  apellidos: "",
  email: "",
  celular: "",
  observaciones: "",
};

function formatFechaRegistro(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-UY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function leadMatchesQuery(lead: PotencialClienteLead, q: string): boolean {
  if (!q) return true;
  const hay = [
    lead.nombre,
    lead.apellidos,
    lead.email,
    lead.celular,
    lead.observaciones,
    lead.registeredByEmail,
    String(lead.id),
    formatFechaRegistro(lead.createdAt),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function leadToForm(lead: PotencialClienteLead): LeadFormState {
  return {
    nombre: lead.nombre,
    apellidos: lead.apellidos,
    email: lead.email,
    celular: lead.celular,
    observaciones: lead.observaciones,
  };
}

export function LeadsBasePage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<PotencialClienteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PotencialClienteLead | null>(null);
  const [form, setForm] = useState<LeadFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PotencialClienteLead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    return getPotencialesClientesLeads()
      .then((r) => setLeads(r.items ?? []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudieron cargar los leads.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const queryNorm = search.trim().toLowerCase();
  const filtered = useMemo(
    () => leads.filter((l) => leadMatchesQuery(l, queryNorm)),
    [leads, queryNorm]
  );

  if (!user || !canAccessLeadsBase(user)) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  function openEdit(lead: PotencialClienteLead): void {
    setEditing(lead);
    setForm(leadToForm(lead));
    setEditError("");
  }

  function closeEditModal(): void {
    setEditing(null);
    setForm(EMPTY_FORM);
    setEditError("");
  }

  async function handleSaveEdit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!editing) return;
    if (!form.nombre.trim()) {
      setEditError("El nombre es obligatorio.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    const payload: PotencialClienteLeadPayload = {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      celular: form.celular.trim(),
      observaciones: form.observaciones.trim(),
    };
    try {
      const resp = await updatePotencialClienteLead(editing.id, payload);
      if (resp.item) {
        setLeads((prev) => prev.map((l) => (l.id === editing.id ? resp.item! : l)));
      }
      closeEditModal();
      showToast("Lead actualizado correctamente.", "success");
    } catch (err) {
      const apiErr = err as ApiHttpError;
      const msg = apiErr?.message || "No se pudo actualizar el lead.";
      setEditError(msg);
      const isDup = apiErr?.status === 409 || apiErr?.code === "EMAIL_DUPLICATE";
      if (isDup) {
        showToast(msg, "warning", undefined, { center: true, title: "ATENCIÓN!" });
      } else {
        showToast(msg, "error");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePotencialClienteLead(deleteTarget.id);
      setLeads((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("Lead eliminado.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo eliminar el lead.", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExportCsv(): Promise<void> {
    setExporting(true);
    try {
      const blob = await downloadPotencialesClientesCsv();
      const stamp = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(blob, `potenciales-clientes-${stamp}.csv`);
      showToast("CSV descargado.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al exportar CSV.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportExcel(): Promise<void> {
    const rows = filtered;
    if (rows.length === 0) {
      showToast("No hay leads para exportar.", "warning");
      return;
    }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Potenciales clientes");
      ws.columns = [
        { header: "ID", key: "id", width: 8 },
        { header: "Fecha registro", key: "fecha", width: 22 },
        { header: "Nombre", key: "nombre", width: 22 },
        { header: "Apellidos", key: "apellidos", width: 22 },
        { header: "Email", key: "email", width: 32 },
        { header: "Celular", key: "celular", width: 18 },
        { header: "Observaciones", key: "observaciones", width: 48 },
        { header: "Registrado por (SGI)", key: "registeredByEmail", width: 32 },
      ];
      for (const r of rows) {
        ws.addRow({
          id: r.id,
          fecha: formatFechaRegistro(r.createdAt),
          nombre: r.nombre,
          apellidos: r.apellidos,
          email: r.email,
          celular: r.celular,
          observaciones: r.observaciones,
          registeredByEmail: r.registeredByEmail || "—",
        });
      }
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00A652" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 22;
      const buf = await wb.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buf]), `potenciales-clientes-${stamp}.xlsx`);
      showToast("Excel descargado.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al exportar Excel.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fact-page leads-base-page">
      <div className="container">
        <PageHeader title="Leads Base" />

        <div className="mb-3">
          <h1 className="h4 fw-semibold mb-0">Leads Base</h1>
          <p className="text-muted small mb-0">Todos los leads en POTENCIALES CLIENTES</p>
        </div>

        <div className="fact-card mb-4">
          <div className="fact-card-header">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span>Leads registrados</span>
              <div className="d-flex flex-wrap gap-2">
                <Link
                  to="/gestion-administrativa/nuevos-leads"
                  className="btn btn-sm btn-success"
                >
                  <i className="bi bi-person-plus me-1" aria-hidden />
                  Nuevo lead
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={exporting || loading}
                  onClick={() => void handleExportCsv()}
                >
                  <i className="bi bi-filetype-csv me-1" aria-hidden />
                  Descargar CSV
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={exporting || loading || filtered.length === 0}
                  onClick={() => void handleExportExcel()}
                >
                  <i className="bi bi-file-earmark-excel me-1" aria-hidden />
                  Descargar Excel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={loading}
                  onClick={() => void reload()}
                >
                  <i className="bi bi-arrow-clockwise me-1" aria-hidden />
                  Actualizar
                </button>
              </div>
            </div>
          </div>
          <div className="fact-card-body">
            <div className="mb-3">
              <label className="fact-label" htmlFor="leads-base-search">
                Buscar
              </label>
              <input
                id="leads-base-search"
                className="fact-input"
                type="search"
                placeholder="Nombre, email, celular, observaciones, registrado por…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            {error ? <div className="alert alert-danger py-2">{error}</div> : null}

            {loading ? (
              <div className="clientes-listado-wrap leads-base-listado-wrap">
                <table className="table table-sm align-middle clientes-listado-table leads-base-listado-table mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Nombre</th>
                      <th>Apellidos</th>
                      <th>Email</th>
                      <th>Celular</th>
                      <th>Observaciones</th>
                      <th>Registrado por</th>
                      <th className="leads-base-th-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td><span className="clientes-skeleton" style={{ width: "2em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "9em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "6em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "7em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "12em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "6em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "10em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "10em" }} /></td>
                        <td className="leads-base-cell-actions">
                          <span className="clientes-skeleton" style={{ width: "7em" }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">📋</div>
                <div className="fact-empty-text">
                  {leads.length === 0
                    ? "Todavía no hay leads registrados."
                    : "Ningún lead coincide con la búsqueda."}
                </div>
              </div>
            ) : (
              <div className="clientes-listado-wrap leads-base-listado-wrap">
                <table className="table table-sm align-middle clientes-listado-table leads-base-listado-table mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">ID</th>
                      <th className="text-start">Fecha</th>
                      <th className="text-start">Nombre</th>
                      <th className="text-start">Apellidos</th>
                      <th className="text-start">Email</th>
                      <th className="text-start">Celular</th>
                      <th className="text-start">Observaciones</th>
                      <th className="text-start">Registrado por</th>
                      <th className="text-start leads-base-th-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td className="leads-base-cell-id">{r.id}</td>
                        <td className="leads-base-cell-fecha">{formatFechaRegistro(r.createdAt)}</td>
                        <td className="leads-base-cell-nombre">{r.nombre}</td>
                        <td className="leads-base-cell-apellidos">{r.apellidos || "—"}</td>
                        <td className="leads-base-cell-email" title={r.email || undefined}>
                          {r.email || "—"}
                        </td>
                        <td className="leads-base-cell-celular">{r.celular || "—"}</td>
                        <td className="leads-base-cell-obs">{r.observaciones || "—"}</td>
                        <td className="leads-base-cell-registrado" title={r.registeredByEmail || undefined}>
                          {r.registeredByEmail || "—"}
                        </td>
                        <td className="leads-base-cell-actions">
                          <div className="d-flex gap-1 justify-content-center leads-base-actions-row">
                            <button
                              type="button"
                              className="fact-btn fact-btn-secondary btn-sm leads-base-action-btn"
                              onClick={() => openEdit(r)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm leads-base-action-btn"
                              onClick={() => setDeleteTarget(r)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted small mb-0 mt-2">
              {queryNorm
                ? `${filtered.length} de ${leads.length} lead${leads.length !== 1 ? "s" : ""}`
                : `${leads.length} lead${leads.length !== 1 ? "s" : ""}`}{" "}
              en POTENCIALES CLIENTES (orden: más recientes primero).
            </p>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content fact-card" style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}>
              <div className="fact-card-header d-flex align-items-center justify-content-between">
                <span>Editar lead #{editing.id}</span>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeEditModal}
                  aria-label="Cerrar"
                  disabled={savingEdit}
                />
              </div>
              <form onSubmit={(e) => void handleSaveEdit(e)}>
                <div className="fact-card-body">
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="fact-label" htmlFor="edit-lead-nombre">
                        Nombre <span className="text-danger">*</span>
                      </label>
                      <input
                        id="edit-lead-nombre"
                        className="fact-input"
                        type="text"
                        value={form.nombre}
                        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                        maxLength={120}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="fact-label" htmlFor="edit-lead-apellidos">
                        Apellidos
                      </label>
                      <input
                        id="edit-lead-apellidos"
                        className="fact-input"
                        type="text"
                        value={form.apellidos}
                        onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                        maxLength={160}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="fact-label" htmlFor="edit-lead-email">
                        Email
                      </label>
                      <input
                        id="edit-lead-email"
                        className="fact-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        maxLength={200}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="fact-label" htmlFor="edit-lead-celular">
                        Celular
                      </label>
                      <input
                        id="edit-lead-celular"
                        className="fact-input"
                        type="tel"
                        value={form.celular}
                        onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))}
                        maxLength={80}
                      />
                    </div>
                    <div className="col-12">
                      <label className="fact-label" htmlFor="edit-lead-obs">
                        Observaciones
                      </label>
                      <textarea
                        id="edit-lead-obs"
                        className="fact-input"
                        rows={3}
                        value={form.observaciones}
                        onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                        maxLength={4000}
                      />
                    </div>
                    <div className="col-12">
                      <p className="text-muted small mb-0">
                        Registrado: {formatFechaRegistro(editing.createdAt)}
                        {editing.registeredByEmail ? (
                          <>
                            {" · "}
                            Por: {editing.registeredByEmail}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {editError ? <div className="alert alert-danger py-2 mt-3 mb-0">{editError}</div> : null}
                </div>
                <div className="fact-card-body border-top pt-0 d-flex flex-wrap justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeEditModal}
                    disabled={savingEdit}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-success" disabled={savingEdit}>
                    {savingEdit ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden />
                        Guardando…
                      </>
                    ) : (
                      "Guardar cambios"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content historial-delete-modal">
              <div className="modal-header historial-delete-modal-header">
                <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                  <i className="bi bi-trash historial-delete-icon" style={{ fontSize: "1.5rem" }} aria-hidden />
                </div>
                <h5 className="modal-title historial-delete-modal-title">Eliminar lead</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setDeleteTarget(null)}
                  aria-label="Cerrar"
                  disabled={deleting}
                />
              </div>
              <div className="modal-body historial-delete-modal-body">
                <p className="historial-delete-question">¿Seguro que querés eliminar este lead?</p>
                <p className="historial-delete-warning text-muted small mb-0">
                  #{deleteTarget.id} — {[deleteTarget.nombre, deleteTarget.apellidos].filter(Boolean).join(" ")}
                  {deleteTarget.email ? ` · ${deleteTarget.email}` : ""}
                </p>
              </div>
              <div className="modal-footer historial-delete-modal-footer">
                <button
                  type="button"
                  className="btn historial-delete-btn-cancel"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  No
                </button>
                <button
                  type="button"
                  className="btn historial-delete-btn-confirm"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  {deleting ? "Eliminando…" : "Sí"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
