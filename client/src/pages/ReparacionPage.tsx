import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getReparacionTipos,
  createReparacionTipo,
  updateReparacionTipo,
  deleteReparacionTipo,
  type ReparacionTiposResponse,
} from "../lib/api";
import type { ReparacionTipo } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";

function findCol(headerRow: (string | number)[], ...names: string[]): number {
  for (let i = 1; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? "").trim().toLowerCase();
    for (const n of names) {
      const k = n.toLowerCase();
      if (h === k || h.includes(k) || k.includes(h)) return i;
    }
  }
  return -1;
}

function normalizePrecioUsd(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(99999, Math.max(0, n));
}

async function parseExcelReparacion(file: File): Promise<{ nombre: string; precioUSD: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => rows.push(row.values as (string | number)[]));
  if (rows.length < 2) return [];

  const headerRow = rows[0]!;
  const idx = {
    nombre: findCol(headerRow, "nombre"),
    precioUSD: findCol(headerRow, "precio usd", "precioUSD", "precio"),
  };

  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
  const getNum = (row: (string | number)[], i: number): number => {
    const val = get(row, i);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const result: { nombre: string; precioUSD: number }[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const nombre = idx.nombre >= 0 ? get(row, idx.nombre) : get(row, 1);
    if (!nombre) continue;
    let precioUSD = idx.precioUSD >= 0 ? getNum(row, idx.precioUSD) : getNum(row, 2);
    precioUSD = normalizePrecioUsd(precioUSD);
    result.push({ nombre, precioUSD });
  }
  return result;
}

export function ReparacionPage() {
  const { user } = useAuth();
  const canEdit = user ? canEditClientes(user) : false;
  const canExportData = user ? canExport(user) : false;
  const [items, setItems] = useState<ReparacionTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReparacionTipo | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<ReparacionTipo | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [formData, setFormData] = useState({ nombre: "", precioUSD: 0 });

  const load = () =>
    getReparacionTipos()
      .then((r: ReparacionTiposResponse) => setItems(r.items || []))
      .catch(() => {
        setItems([]);
        showToast("Error al cargar los tipos de reparación. Revisá la conexión con el servidor.", "error", "Reparación");
      });

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    if (!t) return items;
    return items.filter((s) => s.nombre.toLowerCase().includes(t));
  }, [items, searchTerm]);

  function handleSave() {
    if (!formData.nombre.trim()) {
      showToast("Completá el nombre del tipo de reparación.", "error", "Reparación");
      return;
    }
    const precioUSD = normalizePrecioUsd(formData.precioUSD);
    const nombre = formData.nombre.trim();

    if (editing) {
      const id = editing.id;
      updateReparacionTipo(id, { nombre, precioUSD })
        .then(() => {
          showToast("Tipo actualizado correctamente.", "success", "Reparación");
          return getReparacionTipos();
        })
        .then((r: ReparacionTiposResponse) => setItems(r.items || []))
        .catch((e) => showToast(e instanceof Error ? e.message : "Error al actualizar.", "error", "Reparación"))
        .finally(() => {
          setShowAddModal(false);
          setEditing(null);
          setFormData({ nombre: "", precioUSD: 0 });
        });
    } else {
      createReparacionTipo({ nombre, precioUSD })
        .then(() => {
          showToast("Tipo agregado correctamente.", "success", "Reparación");
          return getReparacionTipos();
        })
        .then((r: ReparacionTiposResponse) => setItems(r.items || []))
        .catch((e) => showToast(e instanceof Error ? e.message : "Error al guardar.", "error", "Reparación"))
        .finally(() => {
          setShowAddModal(false);
          setFormData({ nombre: "", precioUSD: 0 });
        });
    }
  }

  function openEdit(s: ReparacionTipo) {
    setEditing(s);
    setFormData({ nombre: s.nombre, precioUSD: normalizePrecioUsd(s.precioUSD) });
    setShowAddModal(true);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteReparacionTipo(deleteTarget.id)
      .then(() => {
        showToast("Tipo eliminado correctamente.", "success", "Reparación");
        return getReparacionTipos();
      })
      .then((r: ReparacionTiposResponse) => setItems(r.items || []))
      .catch((e) => showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Reparación"))
      .finally(() => setDeleteTarget(null));
  }

  function exportExcel() {
    if (!canExportData) {
      showToast("No tenés permisos para exportar.", "error", "Reparación");
      return;
    }
    if (items.length === 0) {
      showToast("No hay tipos para exportar.", "warning", "Reparación");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Reparación");
    ws.addRow(["Nombre", "Precio USD"]);
    for (const s of items) {
      ws.addRow([s.nombre, Number(s.precioUSD) || 0]);
    }
    void wb.xlsx.writeBuffer().then((buffer) => {
      const fecha = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buffer]), `Reparacion-${fecha}.xlsx`);
      showToast("Archivo Excel exportado correctamente.", "success", "Reparación");
    });
  }

  function handleImportExcel(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !canEdit) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", "Reparación");
      return;
    }
    setExcelLoading(true);
    void (async () => {
      try {
        const parsed = await parseExcelReparacion(file);
        if (parsed.length === 0) {
          showToast("No se encontraron filas válidas. Usá encabezados: Nombre, Precio USD.", "error", "Reparación");
          return;
        }
        for (const row of parsed) {
          await createReparacionTipo({ nombre: row.nombre, precioUSD: row.precioUSD });
        }
        const r = await getReparacionTipos();
        setItems(r.items || []);
        showToast(`Se importaron ${parsed.length} tipos de reparación.`, "success", "Reparación");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al importar Excel.", "error", "Reparación");
      } finally {
        setExcelLoading(false);
      }
    })();
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Gestión de Reparación" />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="clientes-filtros-outer">
            <div className="clientes-filtros-container">
              <div className="card clientes-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Buscar</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Buscar por nombre…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end filtros-limpiar-col">
                    <button type="button" className="btn btn-outline-secondary btn-sm filtros-limpiar-btn" onClick={() => setSearchTerm("")}>
                      Limpiar
                    </button>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    {canExportData && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm clientes-export-excel-btn"
                        style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }}
                        onClick={exportExcel}
                        disabled={items.length === 0}
                      >
                        📊 Exportar Excel
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <input type="file" accept=".xlsx,.xls" className="d-none" id="reparacion-import-excel" onChange={handleImportExcel} disabled={excelLoading} />
                        <label
                          htmlFor="reparacion-import-excel"
                          className="btn btn-outline-secondary btn-sm mb-0"
                          style={{
                            backgroundColor: "rgba(25, 135, 84, 0.12)",
                            cursor: excelLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {excelLoading ? "⏳ Importando…" : "📥 Importar Excel"}
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="clientes-listado-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">
                📋 Tipos de reparación ({loading ? "…" : filtered.length})
                {!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}
              </h6>
              {canEdit && (
                <button
                  type="button"
                  className="fact-btn fact-btn-primary btn-sm"
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block", color: "inherit" }}
                  onClick={() => {
                    setEditing(null);
                    setFormData({ nombre: "", precioUSD: 0 });
                    setShowAddModal(true);
                  }}
                >
                  ➕ Nuevo tipo
                </button>
              )}
            </div>

            {loading ? (
              <div className="table-responsive" style={{ minHeight: 200 }}>
                <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Nº</th>
                      <th className="text-start">Nombre</th>
                      <th className="text-start">Precio USD</th>
                      {canEdit && <th className="text-start" style={{ width: "140px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td>
                          <span className="clientes-skeleton" style={{ width: "2em" }} />
                        </td>
                        <td>
                          <span className="clientes-skeleton" style={{ width: "10em" }} />
                        </td>
                        <td>
                          <span className="clientes-skeleton" style={{ width: "4em" }} />
                        </td>
                        {canEdit && (
                          <td>
                            <span className="clientes-skeleton" style={{ width: "5em" }} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">📋</div>
                <div className="fact-empty-text">
                  {searchTerm ? "No hay tipos con ese nombre." : 'No hay tipos de reparación. Agregá uno con «Nuevo tipo».'}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Nº</th>
                      <th className="text-start">Nombre</th>
                      <th className="text-start">Precio USD</th>
                      {canEdit && (
                        <th className="text-start" style={{ width: "140px" }}>
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id}>
                        <td className="text-start fw-bold">{s.codigo ?? "—"}</td>
                        <td className="text-start fw-bold">{s.nombre}</td>
                        <td className="text-start">{normalizePrecioUsd(s.precioUSD)} USD</td>
                        {canEdit && (
                          <td className="text-start">
                            <div className="d-flex gap-1 flex-wrap">
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => openEdit(s)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => setDeleteTarget(s)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {showAddModal && (
          <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content fact-card" style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}>
                <div className="fact-card-header d-flex align-items-center justify-content-between">
                  <span>{editing ? "Editar tipo de reparación" : "Nuevo tipo de reparación"}</span>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditing(null);
                      setFormData({ nombre: "", precioUSD: 0 });
                    }}
                    aria-label="Cerrar"
                  />
                </div>
                <div className="fact-card-body">
                  {editing?.codigo ? (
                    <div className="fact-field">
                      <label className="fact-label">Número de ítem</label>
                      <input type="text" className="fact-input" value={editing.codigo} readOnly style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }} />
                    </div>
                  ) : null}
                  <div className="fact-field">
                    <label className="fact-label">Nombre *</label>
                    <input
                      type="text"
                      className="fact-input"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ej. Reparación placa control"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label" htmlFor="reparacion-precio-usd">
                      Precio USD *
                    </label>
                    <input
                      id="reparacion-precio-usd"
                      type="number"
                      min={0}
                      max={99999}
                      step={1}
                      className="fact-input"
                      value={formData.precioUSD}
                      onChange={(e) => setFormData({ ...formData, precioUSD: normalizePrecioUsd(e.target.value) })}
                    />
                  </div>
                  <div className="d-flex gap-2 mt-3 flex-wrap" style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}>
                    <button
                      type="button"
                      className="fact-btn fact-btn-secondary"
                      onClick={() => {
                        setShowAddModal(false);
                        setEditing(null);
                        setFormData({ nombre: "", precioUSD: 0 });
                      }}
                    >
                      Cancelar
                    </button>
                    <button type="button" className="fact-btn fact-btn-primary" onClick={handleSave}>
                      {editing ? "Actualizar" : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <i className="bi bi-trash historial-delete-icon" style={{ fontSize: "1.5rem" }} aria-hidden />
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Eliminar tipo de reparación</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteTarget(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">¿Seguro que querés eliminar este tipo?</p>
                  <p className="historial-delete-warning text-muted small mb-0">
                    {deleteTarget.codigo ?? "—"} — {deleteTarget.nombre} ({normalizePrecioUsd(deleteTarget.precioUSD)} USD)
                  </p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={() => setDeleteTarget(null)}>
                    No
                  </button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleDelete}>
                    Sí
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
