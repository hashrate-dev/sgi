import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getEquipos,
  createEquipo,
  updateEquipo,
  deleteEquipo,
  deleteEquiposAll,
  createEquiposBulk,
  wakeUpBackend,
} from "../lib/api";
import type { EquipoASIC } from "../lib/types";
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

/** Parsea Excel de equipos ASIC (mismo formato que exportExcel: Nº Serie, Fecha Ingreso, Marca Equipo, Modelo, Procesador, Precio USD, Observaciones) */
async function parseExcelEquipos(file: File): Promise<Omit<EquipoASIC, "id">[]> {
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
    numeroSerie: findCol(headerRow, "nº serie", "numero serie", "numeroSerie", "n° serie"),
    fechaIngreso: findCol(headerRow, "fecha ingreso", "fechaIngreso", "fecha"),
    marcaEquipo: findCol(headerRow, "marca equipo", "marcaEquipo", "marca"),
    modelo: findCol(headerRow, "modelo"),
    procesador: findCol(headerRow, "procesador"),
    precioUSD: findCol(headerRow, "precio usd", "precioUSD", "precio"),
    observaciones: findCol(headerRow, "observaciones"),
  };

  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
  const getNum = (row: (string | number)[], i: number): number => {
    const val = get(row, i);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  /** Convierte fecha en DD/MM/YYYY o similar a YYYY-MM-DD */
  function toYyyyMmDd(s: string): string {
    if (!s) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parts = s.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
      return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    return new Date().toISOString().slice(0, 10);
  }

  const result: Omit<EquipoASIC, "id">[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const marcaEquipo = idx.marcaEquipo >= 0 ? get(row, idx.marcaEquipo) : get(row, 3);
    const modelo = idx.modelo >= 0 ? get(row, idx.modelo) : get(row, 4);
    const procesador = idx.procesador >= 0 ? get(row, idx.procesador) : get(row, 5);
    if (!marcaEquipo && !modelo && !procesador) continue;

    const numeroSerie = idx.numeroSerie >= 0 ? get(row, idx.numeroSerie) || undefined : undefined;
    const fechaIngreso = idx.fechaIngreso >= 0 ? toYyyyMmDd(get(row, idx.fechaIngreso)) : toYyyyMmDd(get(row, 2));
    const precioUSD = idx.precioUSD >= 0 ? getNum(row, idx.precioUSD) : 0;
    const observaciones = idx.observaciones >= 0 ? get(row, idx.observaciones) || undefined : undefined;

    result.push({
      numeroSerie: numeroSerie && numeroSerie !== "—" ? numeroSerie : undefined,
      fechaIngreso,
      marcaEquipo: marcaEquipo || "—",
      modelo: modelo || "—",
      procesador: procesador || "—",
      precioUSD: Math.max(0, precioUSD),
      observaciones: observaciones || undefined,
    });
  }
  return result;
}

export function EquiposAsicPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [equipos, setEquipos] = useState<EquipoASIC[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [editingEquipo, setEditingEquipo] = useState<EquipoASIC | null>(null);
  const [formData, setFormData] = useState({
    fechaIngreso: new Date().toISOString().split("T")[0],
    marcaEquipo: "",
    modelo: "",
    procesador: "",
    precioUSD: 0,
    observaciones: "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    wakeUpBackend()
      .then(() => getEquipos())
      .then((res) => {
        if (!cancelled) {
          setEquipos(res.items ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Error al cargar equipos");
          setEquipos([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!formData.marcaEquipo || !formData.modelo || !formData.procesador) {
      showToast("Debe completar Marca, Modelo y Procesador.", "error", "Equipos ASIC");
      return;
    }

    try {
      if (editingEquipo) {
        await updateEquipo(editingEquipo.id, {
          fechaIngreso: formData.fechaIngreso,
          marcaEquipo: formData.marcaEquipo,
          modelo: formData.modelo,
          procesador: formData.procesador,
          precioUSD: formData.precioUSD,
          observaciones: formData.observaciones || undefined,
        });
        setEquipos((prev) =>
          prev.map((e) =>
            e.id === editingEquipo.id
              ? { ...e, ...formData }
              : e
          )
        );
        showToast("Equipo actualizado correctamente.", "success", "Equipos ASIC");
      } else {
        const res = await createEquipo({
          fechaIngreso: formData.fechaIngreso,
          marcaEquipo: formData.marcaEquipo,
          modelo: formData.modelo,
          procesador: formData.procesador,
          precioUSD: formData.precioUSD,
          observaciones: formData.observaciones || undefined,
        });
        setEquipos((prev) => [
          ...prev,
          {
            id: res.id,
            numeroSerie: res.numeroSerie,
            fechaIngreso: formData.fechaIngreso,
            marcaEquipo: formData.marcaEquipo,
            modelo: formData.modelo,
            procesador: formData.procesador,
            precioUSD: formData.precioUSD,
            observaciones: formData.observaciones || undefined,
          },
        ]);
        showToast("Equipo agregado correctamente.", "success", "Equipos ASIC");
      }
      setShowAddModal(false);
      setEditingEquipo(null);
      setFormData({
        fechaIngreso: new Date().toISOString().split("T")[0],
        marcaEquipo: "",
        modelo: "",
        procesador: "",
        precioUSD: 0,
        observaciones: "",
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error", "Equipos ASIC");
    }
  }

  function handleEdit(e: EquipoASIC) {
    setEditingEquipo(e);
    setFormData({
      fechaIngreso: e.fechaIngreso,
      marcaEquipo: e.marcaEquipo,
      modelo: e.modelo,
      procesador: e.procesador,
      precioUSD: e.precioUSD,
      observaciones: e.observaciones ?? "",
    });
    setShowAddModal(true);
  }

  async function handleDelete(e: EquipoASIC) {
    try {
      await deleteEquipo(e.id);
      setEquipos((prev) => prev.filter((eq) => eq.id !== e.id));
      showToast("Equipo eliminado correctamente.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al eliminar", "error", "Equipos ASIC");
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
      await deleteEquiposAll();
      setEquipos([]);
      showToast("Todos los equipos han sido eliminados.", "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al eliminar", "error", "Equipos ASIC");
    } finally {
      setDeleting(false);
    }
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!isXlsx) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", "Equipos ASIC");
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const parsed = await parseExcelEquipos(file);
      if (parsed.length === 0) {
        showToast("No se encontraron filas válidas en el Excel. Use encabezados: Nº Serie, Fecha Ingreso, Marca Equipo, Modelo, Procesador, Precio USD, Observaciones.", "error", "Equipos ASIC");
        setExcelLoading(false);
        return;
      }
      const items = parsed.map((row) => ({
        fechaIngreso: row.fechaIngreso,
        marcaEquipo: row.marcaEquipo,
        modelo: row.modelo,
        procesador: row.procesador,
        precioUSD: row.precioUSD ?? 0,
        observaciones: row.observaciones,
        numeroSerie: row.numeroSerie,
      }));
      const res = await createEquiposBulk(items);
      const { items: updated } = await getEquipos();
      setEquipos(updated ?? []);
      showToast(`Se importaron ${res.inserted} equipo(s) correctamente.`, "success", "Equipos ASIC");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar Excel.", "error", "Equipos ASIC");
    } finally {
      setExcelLoading(false);
    }
  }

  function exportExcel() {
    if (equipos.length === 0) {
      showToast("No hay equipos para exportar.", "warning", "Equipos ASIC");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Equipos ASIC");

    ws.columns = [
      { header: "Nº Serie", key: "numeroSerie", width: 12 },
      { header: "Fecha Ingreso", key: "fechaIngreso", width: 18 },
      { header: "Marca Equipo", key: "marcaEquipo", width: 25 },
      { header: "Modelo", key: "modelo", width: 30 },
      { header: "Procesador", key: "procesador", width: 25 },
      { header: "Precio USD", key: "precioUSD", width: 14 },
      { header: "Observaciones", key: "observaciones", width: 35 },
    ];

    equipos.forEach((eq) => {
      ws.addRow({
        numeroSerie: eq.numeroSerie ?? "—",
        fechaIngreso: eq.fechaIngreso,
        marcaEquipo: eq.marcaEquipo,
        modelo: eq.modelo,
        procesador: eq.procesador,
        precioUSD: eq.precioUSD ?? 0,
        observaciones: eq.observaciones ?? "",
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
    <div className="fact-page clientes-page">
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
                  <div className="col-md-2 d-flex align-items-end filtros-limpiar-col">
                    <button
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                    onClick={() => setSearchTerm("")}
                  >
                    Limpiar
                    </button>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    {canEdit && (
                      <label
                        className="btn btn-outline-secondary btn-sm historial-import-excel-btn mb-0"
                        style={{
                          backgroundColor: "rgba(45, 93, 70, 0.35)",
                          cursor: excelLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {excelLoading ? "⏳ Importando..." : "📥 Importar Excel"}
                        <input
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="d-none"
                          onChange={handleExcelImport}
                          disabled={excelLoading}
                        />
                      </label>
                    )}
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
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block", color: "inherit" }}
                  onClick={() => {
                    setEditingEquipo(null);
                    setFormData({
                      fechaIngreso: new Date().toISOString().split("T")[0],
                      marcaEquipo: "",
                      modelo: "",
                      procesador: "",
                      precioUSD: 0,
                      observaciones: "",
                    });
                    setShowAddModal(true);
                  }}
                >
                  ➕ Nuevo Equipo
                </button>
              )}
            </div>

            {loading ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">⏳</div>
                <div className="fact-empty-text">Cargando equipos...</div>
              </div>
            ) : loadError ? (
              <div className="fact-empty">
                <div className="fact-empty-icon text-danger">⚠️</div>
                <div className="fact-empty-text">{loadError}</div>
              </div>
            ) : filteredEquipos.length === 0 ? (
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
                      <th className="text-start">Nº Serie</th>
                      <th className="text-start">Fecha Ingreso</th>
                      <th className="text-start">Marca</th>
                      <th className="text-start">Modelo</th>
                      <th className="text-start">Procesador</th>
                      <th className="text-start">Observaciones</th>
                      {canEdit && <th className="text-start" style={{ width: "120px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipos.map((e) => (
                      <tr key={e.id}>
                        <td className="text-start fw-bold">{e.numeroSerie ?? "—"}</td>
                        <td className="text-start">{e.fechaIngreso}</td>
                        <td className="text-start fw-bold">{e.marcaEquipo}</td>
                        <td className="text-start">{e.modelo}</td>
                        <td className="text-start">{e.procesador}</td>
                        <td className="text-start text-muted small">{e.observaciones ?? "—"}</td>
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
          <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg clientes-new-modal-dialog">
              <div className="modal-content professional-modal professional-modal-form clientes-new-modal-content">
                <div className="modal-header professional-modal-header">
                  <div className="professional-modal-icon-wrapper">
                    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h5 className="modal-title professional-modal-title">
                    {editingEquipo ? "Editar Equipo ASIC" : "Agregar nuevo equipo"}
                  </h5>
                  <button type="button" className="professional-modal-close" onClick={() => { setShowAddModal(false); setEditingEquipo(null); }} aria-label="Cerrar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <div className="modal-body">
                  <div className="client-form-grid-4">
                    <div className="client-form-column">
                      <h3 className="client-form-section-title">Identificación</h3>
                      {editingEquipo?.numeroSerie && (
                        <div className="fact-field">
                          <label className="fact-label">Número de serie</label>
                          <input
                            type="text"
                            className="fact-input"
                            value={editingEquipo.numeroSerie}
                            readOnly
                            style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
                          />
                        </div>
                      )}
                      <div className="fact-field">
                        <label className="fact-label">Fecha ingreso *</label>
                        <input
                          type="date"
                          className="fact-input"
                          value={formData.fechaIngreso}
                          onChange={(e) => setFormData({ ...formData, fechaIngreso: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="client-form-column">
                      <h3 className="client-form-section-title">Equipo</h3>
                      <div className="fact-field">
                        <label className="fact-label">Marca *</label>
                        <input
                          type="text"
                          className="fact-input"
                          value={formData.marcaEquipo}
                          onChange={(e) => setFormData({ ...formData, marcaEquipo: e.target.value })}
                          placeholder="Ej: Bitmain"
                          required
                        />
                      </div>
                      <div className="fact-field">
                        <label className="fact-label">Modelo *</label>
                        <input
                          type="text"
                          className="fact-input"
                          value={formData.modelo}
                          onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                          placeholder="Ej: Antminer S21"
                          required
                        />
                      </div>
                      <div className="fact-field">
                        <label className="fact-label">Procesador *</label>
                        <input
                          type="text"
                          className="fact-input"
                          value={formData.procesador}
                          onChange={(e) => setFormData({ ...formData, procesador: e.target.value })}
                          placeholder="Ej: SHA-256"
                          required
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
                    <button type="button" className="fact-btn fact-btn-secondary" onClick={() => { setShowAddModal(false); setEditingEquipo(null); }}>
                      Cancelar
                    </button>
                    <button type="button" className="fact-btn fact-btn-primary" onClick={handleSave}>
                      {editingEquipo ? "Actualizar" : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
