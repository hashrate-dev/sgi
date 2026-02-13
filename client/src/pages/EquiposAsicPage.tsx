import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { loadEquiposAsic, saveEquiposAsic } from "../lib/storage";
import type { EquipoASIC } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function EquiposAsicPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [equipos, setEquipos] = useState<EquipoASIC[]>(() => loadEquiposAsic());
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEquipo, setEditingEquipo] = useState<EquipoASIC | null>(null);
  const [formData, setFormData] = useState({
    fechaIngreso: new Date().toISOString().split("T")[0],
    marcaEquipo: "",
    modelo: "",
    procesador: "",
    precioUSD: 0,
  });

  useEffect(() => {
    setEquipos(loadEquiposAsic());
  }, []);

  function handleSave() {
    if (!formData.marcaEquipo || !formData.modelo || !formData.procesador) {
      showToast("Debe completar Marca, Modelo y Procesador.", "error", "Equipos ASIC");
      return;
    }

    const updated = [...equipos];
    if (editingEquipo) {
      const idx = updated.findIndex((e) => e.id === editingEquipo.id);
      if (idx >= 0) {
        updated[idx] = { ...editingEquipo, ...formData };
      }
      showToast("Equipo actualizado correctamente.", "success", "Equipos ASIC");
    } else {
      updated.push({
        id: genId(),
        ...formData,
      });
      showToast("Equipo agregado correctamente.", "success", "Equipos ASIC");
    }
    saveEquiposAsic(updated);
    setEquipos(updated);
    setShowAddModal(false);
    setEditingEquipo(null);
    setFormData({
      fechaIngreso: new Date().toISOString().split("T")[0],
      marcaEquipo: "",
      modelo: "",
      procesador: "",
      precioUSD: 0,
    });
  }

  function handleEdit(e: EquipoASIC) {
    setEditingEquipo(e);
    setFormData({
      fechaIngreso: e.fechaIngreso,
      marcaEquipo: e.marcaEquipo,
      modelo: e.modelo,
      procesador: e.procesador,
      precioUSD: e.precioUSD,
    });
    setShowAddModal(true);
  }

  function handleDelete(e: EquipoASIC) {
    const updated = equipos.filter((eq) => eq.id !== e.id);
    saveEquiposAsic(updated);
    setEquipos(updated);
    showToast("Equipo eliminado correctamente.", "success", "Equipos ASIC");
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
    saveEquiposAsic([]);
    setEquipos([]);
    showToast("Todos los equipos han sido eliminados.", "success", "Equipos ASIC");
    setDeleting(false);
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  function exportExcel() {
    if (equipos.length === 0) {
      showToast("No hay equipos para exportar.", "warning", "Equipos ASIC");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Equipos ASIC");

    ws.columns = [
      { header: "Fecha Ingreso", key: "fechaIngreso", width: 18 },
      { header: "Marca Equipo", key: "marcaEquipo", width: 25 },
      { header: "Modelo", key: "modelo", width: 30 },
      { header: "Procesador", key: "procesador", width: 25 },
    ];

    equipos.forEach((eq) => {
      ws.addRow({
        fechaIngreso: eq.fechaIngreso,
        marcaEquipo: eq.marcaEquipo,
        modelo: eq.modelo,
        procesador: eq.procesador,
      });
    });

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D5D46" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
    });

    wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0].replace(/-/g, "");
      saveAs(new Blob([buf]), `Equipos_ASIC_${fecha}.xlsx`);
      showToast("Excel exportado correctamente.", "success", "Equipos ASIC");
    });
  }

  const filteredEquipos = equipos.filter((e) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      e.marcaEquipo?.toLowerCase().includes(searchLower) ||
      e.modelo?.toLowerCase().includes(searchLower) ||
      e.procesador?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Equipos ASIC" />

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
                      placeholder="Buscar por marca, modelo o procesador..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end">
                    <button
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
                        disabled={equipos.length === 0}
                      >
                        📊 Exportar Excel
                      </button>
                    )}
                    {canDelete && (
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
              <h6 className="fw-bold m-0">⚙️ Listado de Equipos ASIC ({filteredEquipos.length}){!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}</h6>
              {canEdit && (
                <button
                  type="button"
                  className="fact-btn fact-btn-primary btn-sm"
                  onClick={() => {
                    setEditingEquipo(null);
                    setFormData({
                      fechaIngreso: new Date().toISOString().split("T")[0],
                      marcaEquipo: "",
                      modelo: "",
                      procesador: "",
                      precioUSD: 0,
                    });
                    setShowAddModal(true);
                  }}
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
                >
                  ➕ Nuevo Equipo
                </button>
              )}
            </div>

            {filteredEquipos.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">⚙️</div>
                <div className="fact-empty-text">
                  {searchTerm ? "No se encontraron equipos con ese criterio de búsqueda." : "No hay equipos cargados. Agregá uno con el botón \"Nuevo Equipo\"."}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Fecha Ingreso</th>
                      <th className="text-start">Marca</th>
                      <th className="text-start">Modelo</th>
                      <th className="text-start">Procesador</th>
                      {canEdit && <th className="text-start" style={{ width: "120px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipos.map((e) => (
                      <tr key={e.id}>
                        <td className="text-start">{e.fechaIngreso}</td>
                        <td className="text-start fw-bold">{e.marcaEquipo}</td>
                        <td className="text-start">{e.modelo}</td>
                        <td className="text-start">{e.procesador}</td>
                        {canEdit && (
                          <td className="text-start">
                            <div className="d-flex gap-1">
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => handleEdit(e)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => handleDelete(e)}
                              >
                                🗑️
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

        {showDeleteConfirm1 && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Confirmar eliminación</h5>
                  <button type="button" className="btn-close" onClick={handleDeleteCancel} />
                </div>
                <div className="modal-body">
                  <p>¿Estás seguro de que querés eliminar <strong>todos</strong> los equipos?</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleDeleteCancel}>Cancelar</button>
                  <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm1}>Confirmar</button>
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
                  <p className="text-danger fw-bold">Esta acción no se puede deshacer.</p>
                  <p>¿Realmente querés eliminar todos los equipos?</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleDeleteCancel}>Cancelar</button>
                  <button type="button" className="btn btn-danger" disabled={deleting} onClick={handleDeleteConfirm2}>
                    {deleting ? "Eliminando..." : "Eliminar todo"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAddModal && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingEquipo ? "Editar Equipo ASIC" : "Nuevo Equipo ASIC"}</h5>
                  <button type="button" className="btn-close" onClick={() => { setShowAddModal(false); setEditingEquipo(null); }} />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-bold">Fecha Ingreso *</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.fechaIngreso}
                        onChange={(e) => setFormData({ ...formData, fechaIngreso: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold">Marca Equipo *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.marcaEquipo}
                        onChange={(e) => setFormData({ ...formData, marcaEquipo: e.target.value })}
                        placeholder="Ej: Bitmain"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold">Modelo *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.modelo}
                        onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                        placeholder="Ej: Antminer S21"
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold">Procesador *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.procesador}
                        onChange={(e) => setFormData({ ...formData, procesador: e.target.value })}
                        placeholder="Ej: SHA-256"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setEditingEquipo(null); }}>Cancelar</button>
                  <button type="button" className="btn btn-primary" onClick={handleSave}>
                    {editingEquipo ? "Actualizar" : "Guardar"}
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
