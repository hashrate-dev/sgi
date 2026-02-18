import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getSetups,
  createSetup,
  updateSetup,
  deleteSetup,
  deleteSetupsAll,
  type SetupsResponse,
} from "../lib/api";
import type { Setup } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
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

/** Parsea Excel de Setup (mismo formato que export: Nombre, Precio USD) */
async function parseExcelSetups(file: File): Promise<{ nombre: string; precioUSD: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => rows.push(row.values as (string | number)[]));
  if (rows.length < 2) return [];

  const headerRow = rows[0];
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
    if (precioUSD !== 0 && precioUSD !== 50) precioUSD = 0;
    result.push({ nombre, precioUSD });
  }
  return result;
}

export function SetupPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSetup, setEditingSetup] = useState<Setup | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    precioUSD: 0,
  });

  useEffect(() => {
    getSetups()
      .then((r: SetupsResponse) => setSetups(r.items || []))
      .catch(() => {
        setSetups([]);
        showToast("Error al cargar los Setup. Revisá la conexión con el servidor.", "error", "Setup");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSave() {
    if (!formData.nombre.trim()) {
      showToast("Debe completar el nombre del Setup.", "error", "Setup");
      return;
    }
    if (formData.precioUSD !== 0 && formData.precioUSD !== 50) {
      showToast("El precio debe ser 0 USD o 50 USD.", "error", "Setup");
      return;
    }

    if (editingSetup) {
      updateSetup(editingSetup.id, { nombre: formData.nombre.trim(), precioUSD: formData.precioUSD })
        .then(() => {
          showToast("Setup actualizado correctamente.", "success", "Setup");
          return getSetups();
        })
        .then((r: SetupsResponse) => setSetups(r.items || []))
        .catch((e) => showToast(e instanceof Error ? e.message : "Error al actualizar.", "error", "Setup"))
        .finally(() => {
          setShowAddModal(false);
          setEditingSetup(null);
          setFormData({ nombre: "", precioUSD: 0 });
        });
    } else {
      createSetup({ nombre: formData.nombre.trim(), precioUSD: formData.precioUSD })
        .then(() => {
          showToast("Setup agregado correctamente.", "success", "Setup");
          return getSetups();
        })
        .then((r: SetupsResponse) => setSetups(r.items || []))
        .catch((e) => showToast(e instanceof Error ? e.message : "Error al guardar.", "error", "Setup"))
        .finally(() => {
          setShowAddModal(false);
          setFormData({ nombre: "", precioUSD: 0 });
        });
    }
  }

  function handleEdit(s: Setup) {
    setEditingSetup(s);
    setFormData({ nombre: s.nombre, precioUSD: s.precioUSD });
    setShowAddModal(true);
  }

  function handleDelete(s: Setup) {
    deleteSetup(s.id)
      .then(() => {
        showToast("Setup eliminado correctamente.", "success", "Setup");
        return getSetups();
      })
      .then((r: SetupsResponse) => setSetups(r.items || []))
      .catch((e) => showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Setup"));
  }

  function handleDeleteAllClick() {
    setShowDeleteConfirm1(true);
  }

  function handleDeleteConfirm1() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(true);
  }

  function handleDeleteConfirm2() {
    setShowDeleteConfirm2(false);
    setDeleting(true);
    deleteSetupsAll()
      .then(() => {
        setSetups([]);
        showToast("Todos los Setup han sido eliminados.", "success", "Setup");
      })
      .catch((e) => showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Setup"))
      .finally(() => setDeleting(false));
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  function exportExcel() {
    if (!canExportData || setups.length === 0) {
      if (setups.length === 0) showToast("No hay Setup para exportar.", "warning", "Setup");
      else showToast("No tiene permisos para exportar.", "error", "Setup");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Setup");
    ws.columns = [
      { header: "Nombre", key: "nombre", width: 30 },
      { header: "Precio USD", key: "precioUSD", width: 15 },
    ];
    setups.forEach((s) => ws.addRow({ nombre: s.nombre, precioUSD: s.precioUSD }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D5D46" },
    };
    wb.xlsx.writeBuffer().then((buffer) => {
      const fecha = new Date().toISOString().split("T")[0].replace(/-/g, "");
      saveAs(new Blob([buffer]), `Setup-${fecha}.xlsx`);
      showToast("Archivo Excel exportado correctamente.", "success", "Setup");
    });
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", "Setup");
      e.target.value = "";
      return;
    }
    if (!canEdit) {
      showToast("No tiene permisos para importar.", "error", "Setup");
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const parsed = await parseExcelSetups(file);
      if (parsed.length === 0) {
        showToast("No se encontraron filas válidas. Use encabezados: Nombre, Precio USD.", "error", "Setup");
        setExcelLoading(false);
        return;
      }
      let created = 0;
      for (const row of parsed) {
        await createSetup({ nombre: row.nombre, precioUSD: row.precioUSD });
        created++;
      }
      const r = await getSetups();
      setSetups(r.items || []);
      showToast(`Se importaron ${created} Setup correctamente.`, "success", "Setup");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar Excel.", "error", "Setup");
    } finally {
      setExcelLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    if (!t) return setups;
    return setups.filter((s) => s.nombre.toLowerCase().includes(t));
  }, [setups, searchTerm]);

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Gestión de Setup" />

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
                      placeholder="Buscar por nombre..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm w-100"
                      onClick={() => setSearchTerm("")}
                    >
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
                        disabled={setups.length === 0}
                      >
                        📊 Exportar Excel
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="d-none"
                          id="setup-import-excel"
                          onChange={handleImportExcel}
                          disabled={excelLoading}
                        />
                        <label
                          htmlFor="setup-import-excel"
                          className="btn btn-outline-secondary btn-sm mb-0"
                          style={{
                            backgroundColor: "rgba(25, 135, 84, 0.12)",
                            cursor: excelLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {excelLoading ? "⏳ Importando..." : "📥 Importar Excel"}
                        </label>
                      </>
                    )}
                    {canDelete && setups.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm clientes-borrar-todo-btn"
                        style={{ backgroundColor: "rgba(220, 53, 69, 0.4)" }}
                        onClick={handleDeleteAllClick}
                      >
                        🗑️ Borrar todo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="clientes-listado-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">
                📋 Listado de Setup ({loading ? "…" : filtered.length})
                {!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}
              </h6>
              {canEdit && (
                <button
                  type="button"
                  className="fact-btn fact-btn-primary btn-sm"
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
                  onClick={() => {
                    setEditingSetup(null);
                    setFormData({ nombre: "", precioUSD: 0 });
                    setShowAddModal(true);
                  }}
                >
                  ➕ Nuevo Setup
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
                      {canEdit && <th className="text-start" style={{ width: "120px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td><span className="clientes-skeleton" style={{ width: "2em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "10em" }} /></td>
                        <td><span className="clientes-skeleton" style={{ width: "4em" }} /></td>
                        {canEdit && <td><span className="clientes-skeleton" style={{ width: "5em" }} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtered.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">📋</div>
                <div className="fact-empty-text">
                  {searchTerm
                    ? "No se encontraron Setup con ese nombre."
                    : "No hay Setup registrados. Agregá uno con el botón \"Nuevo Setup\"."}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table
                  className="table table-sm align-middle clientes-listado-table"
                  style={{ fontSize: "0.85rem" }}
                >
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Nº</th>
                      <th className="text-start">Nombre</th>
                      <th className="text-start">Precio USD</th>
                      {canEdit && (
                        <th className="text-start" style={{ width: "120px" }}>
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
                        <td className="text-start">{s.precioUSD} USD</td>
                        {canEdit && (
                          <td className="text-start">
                            <div className="d-flex gap-1">
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => handleEdit(s)}
                              >
                                Editar
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                  onClick={() => handleDelete(s)}
                                >
                                  🗑️
                                </button>
                              )}
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
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div
                className="modal-content fact-card"
                style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}
              >
                <div className="fact-card-header d-flex align-items-center justify-content-between">
                  <span>{editingSetup ? "Editar Setup" : "Nuevo Setup"}</span>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingSetup(null);
                      setFormData({ nombre: "", precioUSD: 0 });
                    }}
                    aria-label="Cerrar"
                  />
                </div>
                <div className="fact-card-body">
                  {editingSetup?.codigo && (
                    <div className="fact-field">
                      <label className="fact-label">Número de ítem</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={editingSetup.codigo}
                        readOnly
                        style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
                      />
                    </div>
                  )}
                  <div className="fact-field">
                    <label className="fact-label">Nombre del Setup *</label>
                    <input
                      type="text"
                      className="fact-input"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ej: Setup Básico"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Precio USD *</label>
                    <select
                      className="fact-select"
                      value={formData.precioUSD}
                      onChange={(e) =>
                        setFormData({ ...formData, precioUSD: Number(e.target.value) })
                      }
                    >
                      <option value={0}>0 USD</option>
                      <option value={50}>50 USD</option>
                    </select>
                  </div>
                  <div
                    className="d-flex gap-2 mt-3 flex-wrap"
                    style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}
                  >
                    <button
                      type="button"
                      className="fact-btn fact-btn-secondary"
                      onClick={() => {
                        setShowAddModal(false);
                        setEditingSetup(null);
                        setFormData({ nombre: "", precioUSD: 0 });
                      }}
                    >
                      Cancelar
                    </button>
                    <button type="button" className="fact-btn fact-btn-primary" onClick={handleSave}>
                      {editingSetup ? "Actualizar" : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm1 && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Confirmar eliminación</h5>
                  <button type="button" className="btn-close" onClick={handleDeleteCancel} />
                </div>
                <div className="modal-body">
                  <p>¿Estás seguro de que querés eliminar <strong>todos</strong> los Setup?</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleDeleteCancel}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm1}>
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm2 && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Confirmación final</h5>
                  <button type="button" className="btn-close" onClick={handleDeleteCancel} />
                </div>
                <div className="modal-body">
                  <p className="text-danger">
                    <strong>¡ADVERTENCIA!</strong> Esta acción eliminará permanentemente todos los
                    Setup. No se puede deshacer.
                  </p>
                  <p>¿Estás completamente seguro?</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleDeleteCancel}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteConfirm2}
                    disabled={deleting}
                  >
                    {deleting ? "Eliminando..." : "Eliminar todo"}
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
