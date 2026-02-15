import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  createGarantiaItem,
  deleteGarantiaItem,
  deleteGarantiasItemsAll,
  getGarantiasItems,
  updateGarantiaItem,
  type GarantiasItemsResponse,
} from "../lib/api";
import type { ItemGarantiaAnde } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function GarantiasAndeItemsPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [items, setItems] = useState<ItemGarantiaAnde[]>([]);
  const [, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemGarantiaAnde | null>(null);
  const [formData, setFormData] = useState({
    codigo: "",
    marca: "",
    modelo: "",
    fechaIngreso: "",
    observaciones: "",
  });

  useEffect(() => {
    getGarantiasItems()
      .then((r: GarantiasItemsResponse) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!formData.codigo.trim() || !formData.marca.trim() || !formData.modelo.trim() || !formData.fechaIngreso.trim()) {
      showToast("Debe completar Código, Marca, Modelo y Fecha ingreso.", "error", "Items Garantía ANDE");
      return;
    }

    try {
      if (editingItem) {
        await updateGarantiaItem(editingItem.id, {
          codigo: formData.codigo.trim(),
          marca: formData.marca.trim(),
          modelo: formData.modelo.trim(),
          fechaIngreso: formData.fechaIngreso.trim(),
          observaciones: formData.observaciones.trim() || undefined,
        });
        showToast("Ítem actualizado correctamente.", "success", "Items Garantía ANDE");
      } else {
        await createGarantiaItem({
          id: genId(),
          codigo: formData.codigo.trim(),
          marca: formData.marca.trim(),
          modelo: formData.modelo.trim(),
          fechaIngreso: formData.fechaIngreso.trim(),
          observaciones: formData.observaciones.trim() || undefined,
        });
        showToast("Ítem agregado correctamente.", "success", "Items Garantía ANDE");
      }
      const res = await getGarantiasItems();
      setItems(res.items);
      setShowAddModal(false);
      setEditingItem(null);
      setFormData({ codigo: "", marca: "", modelo: "", fechaIngreso: "", observaciones: "" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar.", "error", "Items Garantía ANDE");
    }
  }

  function handleEdit(item: ItemGarantiaAnde) {
    setEditingItem(item);
    setFormData({
      codigo: item.codigo,
      marca: item.marca ?? "",
      modelo: item.modelo ?? "",
      fechaIngreso: item.fechaIngreso ?? "",
      observaciones: item.observaciones ?? "",
    });
    setShowAddModal(true);
  }

  async function handleDelete(item: ItemGarantiaAnde) {
    try {
      await deleteGarantiaItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast("Ítem eliminado correctamente.", "success", "Items Garantía ANDE");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Items Garantía ANDE");
    }
  }

  function handleDeleteAllClick() {
    setShowDeleteConfirm1(true);
  }

  function handleDeleteConfirm1() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(true);
  }

  async function handleDeleteConfirm2() {
    setShowDeleteConfirm2(false);
    setDeleting(true);
    try {
      await deleteGarantiasItemsAll();
      setItems([]);
      showToast("Todos los ítems han sido eliminados.", "success", "Items Garantía ANDE");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar todo.", "error", "Items Garantía ANDE");
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  function exportExcel() {
    if (items.length === 0) {
      showToast("No hay ítems para exportar.", "warning", "Items Garantía ANDE");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Items Garantía ANDE");

    ws.columns = [
      { header: "Código", key: "codigo", width: 14 },
      { header: "Marca", key: "marca", width: 22 },
      { header: "Modelo", key: "modelo", width: 22 },
      { header: "Fecha ingreso", key: "fechaIngreso", width: 16 },
      { header: "Observaciones", key: "observaciones", width: 30 },
    ];

    items.forEach((i) => {
      ws.addRow({
        codigo: i.codigo,
        marca: i.marca ?? "",
        modelo: i.modelo ?? "",
        fechaIngreso: i.fechaIngreso ?? "",
        observaciones: i.observaciones ?? "",
      });
    });

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D5D46" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    ws.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
    });

    wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0].replace(/-/g, "");
      saveAs(new Blob([buf]), `Items_Garantia_ANDE_${fecha}.xlsx`);
      showToast("Excel exportado correctamente.", "success", "Items Garantía ANDE");
    });
  }

  const filteredItems = items.filter((i) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      i.codigo?.toLowerCase().includes(searchLower) ||
      (i.marca ?? "").toLowerCase().includes(searchLower) ||
      (i.modelo ?? "").toLowerCase().includes(searchLower) ||
      (i.fechaIngreso ?? "").toLowerCase().includes(searchLower) ||
      (i.observaciones ?? "").toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Items Garantía ANDE" />

        {showAddModal && editingItem && (
          <div className="fact-layout mb-4" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
            <div className="fact-card">
              <div className="fact-card-header">
                Editar ítem Garantía ANDE
              </div>
              <div className="fact-card-body">
                <div className="client-form-grid-4">
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Identificación</h3>
                    <div className="fact-field">
                      <label className="fact-label">Código *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.codigo}
                        readOnly
                        title={editingItem ? "El código no se puede modificar" : "Se asigna automáticamente (G001, G002, ...)"}
                      />
                      {!editingItem && (
                        <small className="text-muted d-block mt-1">Se asigna automáticamente. Siguiente: {formData.codigo}</small>
                      )}
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Marca *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.marca}
                        onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                        placeholder="Ej: Antminer"
                      />
                    </div>
                  </div>
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Equipo y fecha</h3>
                    <div className="fact-field">
                      <label className="fact-label">Modelo *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.modelo}
                        onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                        placeholder="Ej: S19 Pro"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Fecha ingreso *</label>
                      <input
                        type="date"
                        className="fact-input"
                        value={formData.fechaIngreso}
                        onChange={(e) => setFormData({ ...formData, fechaIngreso: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="client-form-column" style={{ gridColumn: "span 2" }}>
                    <h3 className="client-form-section-title">Observaciones</h3>
                    <div className="fact-field">
                      <label className="fact-label">Observaciones</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.observaciones}
                        onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-3 flex-wrap" style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}>
                  <button
                    type="button"
                    className="fact-btn fact-btn-secondary"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingItem(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" className="fact-btn fact-btn-primary" onClick={handleSave}>
                    {editingItem ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                      placeholder="Buscar por código, marca, modelo, fecha u observaciones..."
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
                        disabled={items.length === 0}
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
              <h6 className="fw-bold m-0">
                🛡️ Listado de ítems Garantía ANDE ({filteredItems.length})
                {!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}
              </h6>
              {canEdit && (
                <Link
                  to="/equipos-asic/items-garantia/nuevo"
                  className="fact-btn fact-btn-primary btn-sm"
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block", color: "inherit" }}
                >
                  ➕ Nuevo ítem
                </Link>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">🛡️</div>
                <div className="fact-empty-text">
                  {searchTerm
                    ? "No se encontraron ítems con ese criterio de búsqueda."
                    : 'No hay ítems cargados. Agregá uno con el botón "Nuevo ítem".'}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Código</th>
                      <th className="text-start">Marca</th>
                      <th className="text-start">Modelo</th>
                      <th className="text-start">Fecha ingreso</th>
                      <th className="text-start">Observaciones</th>
                      {canEdit && <th className="text-start" style={{ width: "120px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((i) => (
                      <tr key={i.id}>
                        <td className="text-start fw-bold">{i.codigo}</td>
                        <td className="text-start">{i.marca ?? "—"}</td>
                        <td className="text-start">{i.modelo ?? "—"}</td>
                        <td className="text-start">{i.fechaIngreso ? new Date(i.fechaIngreso + "T12:00:00").toLocaleDateString("es-AR") : "—"}</td>
                        <td className="text-start text-muted small">{i.observaciones ?? "—"}</td>
                        {canEdit && (
                          <td className="text-start">
                            <div className="d-flex gap-1">
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => handleEdit(i)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => handleDelete(i)}
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
                  <p>
                    ¿Estás seguro de que querés eliminar <strong>todos</strong> los ítems de garantía ANDE?
                  </p>
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
                  <p>¿Realmente querés eliminar todos los ítems?</p>
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

      </div>
    </div>
  );
}
