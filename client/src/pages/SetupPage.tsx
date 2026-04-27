import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getSetups,
  createSetup,
  updateSetup,
  deleteSetup,
  deleteSetupsAll,
  applyMarketplaceSetupGlobal,
  type SetupsResponse,
} from "../lib/api";
import type { Setup } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes, canExport } from "../lib/auth";
import { isSetupCompraHashrateProtected } from "../lib/setupCompraHashrateProtected";
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
    if (![0, 40, 50].includes(precioUSD)) precioUSD = 0;
    result.push({ nombre, precioUSD });
  }
  return result;
}

export function SetupPage() {
  const { user } = useAuth();
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirmSetup, setDeleteConfirmSetup] = useState<Setup | null>(null);
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSetup, setEditingSetup] = useState<Setup | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [setupGlobalMarketplaceUsd, setSetupGlobalMarketplaceUsd] = useState<0 | 50>(50);
  const [applyingSetupGlobal, setApplyingSetupGlobal] = useState(false);
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

  /** Precios permitidos en el formulario: 0, 40 o 50 USD. */
  function normalizeSetupPrecioUsd(v: unknown): 0 | 40 | 50 {
    const n = Number(v);
    if (n === 50) return 50;
    if (n === 40) return 40;
    return 0;
  }

  function handleSave() {
    if (!formData.nombre.trim()) {
      showToast("Debe completar el nombre del Setup.", "error", "Setup");
      return;
    }
    const precioUSD = normalizeSetupPrecioUsd(formData.precioUSD);
    const nombre = formData.nombre.trim();

    if (editingSetup) {
      const id = editingSetup.id;
      updateSetup(id, { nombre, precioUSD })
        .then(() => {
          showToast("Setup actualizado correctamente.", "success", "Setup");
          setSetups((prev) => prev.map((x) => (x.id === id ? { ...x, nombre, precioUSD } : x)));
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
      createSetup({ nombre, precioUSD })
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
    setFormData({ nombre: s.nombre, precioUSD: normalizeSetupPrecioUsd(s.precioUSD) });
    setShowAddModal(true);
  }

  function handleDelete(s: Setup) {
    if (isSetupCompraHashrateProtected(s.codigo, s.nombre)) {
      showToast(
        "No se puede eliminar «Setup Compra Hashrate» (S03): lo usa la tienda para cotizaciones con fracción de hashrate.",
        "error",
        "Setup"
      );
      return;
    }
    deleteSetup(s.id)
      .then(() => {
        showToast("Setup eliminado correctamente.", "success", "Setup");
        return getSetups();
      })
      .then((r: SetupsResponse) => setSetups(r.items || []))
      .catch((e) => showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Setup"));
  }

  function handleDeleteOneConfirm() {
    if (!deleteConfirmSetup) return;
    handleDelete(deleteConfirmSetup);
    setDeleteConfirmSetup(null);
  }

  function handleDeleteConfirm1() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(true);
  }

  function handleDeleteConfirm2() {
    setShowDeleteConfirm2(false);
    setDeleting(true);
    deleteSetupsAll()
      .then(async (meta) => {
        const r = await getSetups();
        setSetups(r.items || []);
        const n = meta.deletedCount ?? 0;
        if (n === 0) {
          showToast("No había otros Setup por eliminar. S03 (Setup Compra Hashrate) permanece.", "info", "Setup");
        } else {
          showToast(
            `Se eliminaron ${n} Setup. «Setup Compra Hashrate» (S03) se conserva para la tienda online.`,
            "success",
            "Setup"
          );
        }
      })
      .catch((e) => showToast(e instanceof Error ? e.message : "Error al eliminar.", "error", "Setup"))
      .finally(() => setDeleting(false));
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  async function handleApplySetupGlobalMarketplace() {
    if (!canEdit) {
      showToast("No tiene permisos para aplicar setup global.", "error", "Setup");
      return;
    }
    const target = Number(setupGlobalMarketplaceUsd) === 0 ? 0 : 50;
    const ok = window.confirm(
      `¿Aplicar setup global de ${target} USD a todos los equipos del marketplace? (Setup Compra Hashrate S03 queda aparte en 40 USD)`
    );
    if (!ok) return;
    setApplyingSetupGlobal(true);
    try {
      const result = await applyMarketplaceSetupGlobal(target);
      showToast(
        `Setup global aplicado: ${target} USD (S02). Equipos actualizados: ${result.updatedCount}. Omitidos: ${result.skippedCount}. Compra Hashrate (S03) fijado en ${result.hashratePinnedUsd} USD.`,
        "success",
        "Setup"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al aplicar setup global.", "error", "Setup");
    } finally {
      setApplyingSetupGlobal(false);
    }
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
                  <div className="col-md-2 d-flex align-items-end filtros-limpiar-col">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
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
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block", color: "inherit" }}
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
                        <td className="text-start">
                          {Number.isFinite(Number(s.precioUSD)) ? Number(s.precioUSD) : 0} USD
                        </td>
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
                              <span
                                className="text-muted small align-self-center px-1"
                                title="Eliminación bloqueada para todos los Setup."
                              >
                                <i className="bi bi-lock-fill" aria-hidden />
                              </span>
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

          {canEdit && (
            <div className="setup-global-marketplace-panel mt-4">
              <div className="setup-global-marketplace-panel__head">
                <div>
                  <h6 className="setup-global-marketplace-panel__title mb-1">Setup global marketplace</h6>
                  <p className="setup-global-marketplace-panel__desc mb-0">
                    Aplicá a todos los equipos del marketplace, solo con compra completa de unidad. No incluye compra de Hashrate (% de Equipo ASIC).
                  </p>
                </div>
                <span className="setup-global-marketplace-panel__badge">
                  {setupGlobalMarketplaceUsd === 50 ? "Modo ON · 50 USD" : "Modo OFF · 0 USD"}
                </span>
              </div>
              <div className="setup-global-marketplace-panel__controls">
                <div className="form-check form-switch setup-global-marketplace-panel__switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="setup-global-marketplace-switch"
                    checked={setupGlobalMarketplaceUsd === 50}
                    onChange={(e) => setSetupGlobalMarketplaceUsd(e.target.checked ? 50 : 0)}
                    disabled={applyingSetupGlobal}
                  />
                  <label className="form-check-label" htmlFor="setup-global-marketplace-switch">
                    {setupGlobalMarketplaceUsd === 50 ? "Setup activado (50 USD)" : "Setup desactivado (0 USD)"}
                  </label>
                </div>
                <button
                  type="button"
                  className="fact-btn fact-btn-primary setup-global-marketplace-panel__apply"
                  onClick={() => void handleApplySetupGlobalMarketplace()}
                  disabled={applyingSetupGlobal}
                  title="Aplica setupUsd a todos los equipos del marketplace con fracciones de hashrate"
                >
                  {applyingSetupGlobal ? "Aplicando..." : "⚡ Aplicar a todo marketplace"}
                </button>
              </div>
            </div>
          )}
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
                    <label className="fact-label" htmlFor="setup-modal-precio-usd">
                      Precio USD *
                    </label>
                    <select
                      id="setup-modal-precio-usd"
                      className="fact-select"
                      value={
                        formData.precioUSD === 50 ? "50" : formData.precioUSD === 40 ? "40" : "0"
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === "50" ? 50 : raw === "40" ? 40 : 0;
                        setFormData({ ...formData, precioUSD: v });
                      }}
                    >
                      <option value="0">0 USD</option>
                      <option value="40">40 USD</option>
                      <option value="50">50 USD</option>
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

        {/* Modal Confirmación eliminar un ítem */}
        {deleteConfirmSetup && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <i className="bi bi-trash historial-delete-icon" style={{ fontSize: "1.5rem" }} />
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Eliminar Setup</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteConfirmSetup(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">
                    ¿Está eliminando un ítem. ¿Está seguro que quiere hacer esto?
                  </p>
                  <p className="historial-delete-warning text-muted small mb-0">
                    {deleteConfirmSetup.codigo ?? "—"} - {deleteConfirmSetup.nombre} ({deleteConfirmSetup.precioUSD} USD)
                  </p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={() => setDeleteConfirmSetup(null)}>
                    No
                  </button>
                  <button type="button" className="btn historial-delete-btn-confirm" onClick={handleDeleteOneConfirm}>
                    Sí
                  </button>
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
                  <p>
                    ¿Estás seguro de que querés eliminar <strong>todos</strong> los Setup?
                  </p>
                  <p className="text-muted small mb-0">
                    Se conservará <strong>Setup Compra Hashrate (S03)</strong>, necesario para la tienda online.
                  </p>
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
                    <strong>¡ADVERTENCIA!</strong> Esta acción eliminará permanentemente los Setup
                    seleccionables. <strong>No se elimina S03 (Setup Compra Hashrate).</strong> No se puede deshacer el
                    resto.
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
