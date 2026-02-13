import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { loadSetup, saveSetup } from "../lib/storage";
import type { Setup } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function SetupPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [setups, setSetups] = useState<Setup[]>(() => loadSetup());
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSetup, setEditingSetup] = useState<Setup | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    precioUSD: 0,
  });

  useEffect(() => {
    setSetups(loadSetup());
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

    const updated = [...setups];
    if (editingSetup) {
      const idx = updated.findIndex((s) => s.id === editingSetup.id);
      if (idx >= 0) {
        updated[idx] = { ...editingSetup, ...formData };
      }
      showToast("Setup actualizado correctamente.", "success", "Setup");
    } else {
      updated.push({
        id: genId(),
        ...formData,
      });
      showToast("Setup agregado correctamente.", "success", "Setup");
    }
    saveSetup(updated);
    setSetups(updated);
    setShowAddModal(false);
    setEditingSetup(null);
    setFormData({
      nombre: "",
      precioUSD: 0,
    });
  }

  function handleEdit(s: Setup) {
    setEditingSetup(s);
    setFormData({
      nombre: s.nombre,
      precioUSD: s.precioUSD,
    });
    setShowAddModal(true);
  }

  function handleDelete(s: Setup) {
    const updated = setups.filter((st) => st.id !== s.id);
    saveSetup(updated);
    setSetups(updated);
    showToast("Setup eliminado correctamente.", "success", "Setup");
  }

  function handleDeleteAllClick() {
    setShowDeleteConfirm1(true);
  }

  function handleDeleteConfirm1() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(true);
  }

  function handleDeleteConfirm2() {
    setDeleting(true);
    saveSetup([]);
    setSetups([]);
    setShowDeleteConfirm2(false);
    setDeleting(false);
    showToast("Todos los Setup han sido eliminados.", "success", "Setup");
  }

  function exportExcel() {
    if (!canExportData) {
      showToast("No tiene permisos para exportar.", "error", "Setup");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Setup");
    ws.columns = [
      { header: "Nombre", key: "nombre", width: 30 },
      { header: "Precio USD", key: "precioUSD", width: 15 },
    ];
    setups.forEach((s) => {
      ws.addRow({
        nombre: s.nombre,
        precioUSD: s.precioUSD,
      });
    });
    ws.getRow(1).font = { bold: true };
    wb.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, "Setup.xlsx");
      showToast("Archivo Excel exportado correctamente.", "success", "Setup");
    });
  }

  const filtered = setups.filter((s) =>
    s.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fact-page">
      <PageHeader title="Gestión de Setup" />
      <div className="fact-content">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: "250px" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ maxWidth: "300px" }}
            />
          </div>
          <div className="d-flex gap-2">
            {canExportData && (
              <button className="btn btn-outline-success" onClick={exportExcel}>
                <i className="bi bi-file-earmark-excel"></i> Exportar Excel
              </button>
            )}
            {canEdit && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingSetup(null);
                  setFormData({ nombre: "", precioUSD: 0 });
                  setShowAddModal(true);
                }}
              >
                <i className="bi bi-plus-circle"></i> Nuevo Setup
              </button>
            )}
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio USD</th>
                {canEdit && <th style={{ width: 100 }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 3 : 2} className="text-center text-muted py-4">
                    {searchTerm ? "No se encontraron Setup con ese nombre." : "No hay Setup registrados."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nombre}</td>
                    <td>${s.precioUSD} USD</td>
                    {canEdit && (
                      <td>
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(s)}
                            title="Editar"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          {canDelete && (
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDelete(s)}
                              title="Eliminar"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canDelete && setups.length > 0 && (
          <div className="mt-3">
            <button className="btn btn-danger" onClick={handleDeleteAllClick} disabled={deleting}>
              <i className="bi bi-trash"></i> Eliminar Todos los Setup
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingSetup ? "Editar Setup" : "Nuevo Setup"}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingSetup(null);
                    setFormData({ nombre: "", precioUSD: 0 });
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Nombre del Setup *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ej: Setup Básico"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Precio USD *</label>
                  <select
                    className="form-select"
                    value={formData.precioUSD}
                    onChange={(e) => setFormData({ ...formData, precioUSD: Number(e.target.value) })}
                  >
                    <option value={0}>$0 USD</option>
                    <option value={50}>$50 USD</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingSetup(null);
                    setFormData({ nombre: "", precioUSD: 0 });
                  }}
                >
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                  {editingSetup ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm1 && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmar eliminación</h5>
                <button type="button" className="btn-close" onClick={() => setShowDeleteConfirm1(false)}></button>
              </div>
              <div className="modal-body">
                <p>¿Está seguro de que desea eliminar todos los Setup?</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteConfirm1(false)}>
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
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmación final</h5>
                <button type="button" className="btn-close" onClick={() => setShowDeleteConfirm2(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-danger">
                  <strong>¡ADVERTENCIA!</strong> Esta acción eliminará permanentemente todos los Setup. Esta acción no se puede deshacer.
                </p>
                <p>¿Está completamente seguro?</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteConfirm2(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm2} disabled={deleting}>
                  {deleting ? "Eliminando..." : "Eliminar Todo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
