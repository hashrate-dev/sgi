import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  createGarantiaItem,
  deleteGarantiaItem,
  deleteGarantiasItemsAll,
  getGarantiaItemPrecioHistorial,
  getGarantiasItems,
  updateGarantiaItem,
  wakeUpBackend,
  type GarantiasItemsResponse,
} from "../lib/api";
import type { ItemGarantiaAnde } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { PrecioHistorialFullModal } from "../components/equipos/PrecioHistorialFullModal";
import type { PrecioHistorialModalEntry } from "../components/equipos/PrecioHistorialFullModal";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";
import "../styles/marketplace-hashrate.css";
import "../styles/cliente-tienda-edit.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

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

function precioFromFormField(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Parsea Excel (mismo formato que export: Código, Marca, Modelo, Fecha ingreso, Precio garantía, Observaciones) */
async function parseExcelGarantiasItems(file: File): Promise<Omit<ItemGarantiaAnde, "id">[]> {
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
    codigo: findCol(headerRow, "código", "codigo"),
    marca: findCol(headerRow, "marca"),
    modelo: findCol(headerRow, "modelo"),
    fechaIngreso: findCol(headerRow, "fecha ingreso", "fechaIngreso", "fecha"),
    precioGarantia: findCol(headerRow, "precio garantía", "precio garantia", "precioGarantia", "precio"),
    observaciones: findCol(headerRow, "observaciones"),
  };

  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";

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

  const result: Omit<ItemGarantiaAnde, "id">[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const marca = idx.marca >= 0 ? get(row, idx.marca) : get(row, 2);
    const modelo = idx.modelo >= 0 ? get(row, idx.modelo) : get(row, 3);
    if (!marca && !modelo) continue;

    const codigo = idx.codigo >= 0 ? get(row, idx.codigo) : "";
    const fechaIngreso = idx.fechaIngreso >= 0 ? toYyyyMmDd(get(row, idx.fechaIngreso)) : toYyyyMmDd(get(row, 4));
    const precioRaw = idx.precioGarantia >= 0 ? get(row, idx.precioGarantia) : "";
    const precioGarantia = precioRaw ? precioFromFormField(precioRaw) : null;
    const observaciones = idx.observaciones >= 0 ? get(row, idx.observaciones) || undefined : undefined;

    result.push({
      codigo: codigo || "—",
      marca: marca || "—",
      modelo: modelo || "—",
      fechaIngreso,
      precioGarantia: precioGarantia ?? undefined,
      observaciones: observaciones || undefined,
    });
  }
  return result;
}

export function GarantiasAndeItemsPage() {
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [items, setItems] = useState<ItemGarantiaAnde[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ItemGarantiaAnde | null>(null);
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemGarantiaAnde | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [formData, setFormData] = useState({
    codigo: "",
    marca: "",
    modelo: "",
    fechaIngreso: "",
    precioGarantia: "",
    observaciones: "",
  });
  const [precioHistorialOpen, setPrecioHistorialOpen] = useState(false);
  const [precioHistorialEntries, setPrecioHistorialEntries] = useState<PrecioHistorialModalEntry[]>([]);
  const [precioHistorialLoading, setPrecioHistorialLoading] = useState(false);

  function loadItems() {
    setLoading(true);
    setLoadError(false);
    wakeUpBackend()
      .then(() => getGarantiasItems())
      .then((r: GarantiasItemsResponse) => {
        setItems(r.items);
        setLoadError(false);
      })
      .catch((e) => {
        setItems([]);
        setLoadError(true);
        showToast(e instanceof Error ? e.message : "No se pudo cargar desde el servidor.", "error", "Items Garantía ANDE");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (!showAddModal || !editingItem) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (precioHistorialOpen) {
          setPrecioHistorialOpen(false);
          e.preventDefault();
          return;
        }
        setShowAddModal(false);
        setEditingItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showAddModal, editingItem, precioHistorialOpen]);

  function closeEditModal() {
    setPrecioHistorialOpen(false);
    setPrecioHistorialEntries([]);
    setShowAddModal(false);
    setEditingItem(null);
  }

  async function openPrecioHistorialModal() {
    if (!editingItem) return;
    setPrecioHistorialLoading(true);
    try {
      const r = await getGarantiaItemPrecioHistorial(editingItem.id);
      let entries: PrecioHistorialModalEntry[] = r.entries.map((x) => ({
        precioUsd: x.precioUsd,
        actualizadoEn: x.actualizadoEn,
      }));
      if (
        entries.length === 0 &&
        editingItem.precioGarantia != null &&
        Number.isFinite(Number(editingItem.precioGarantia))
      ) {
        const fi = editingItem.fechaIngreso?.trim() || new Date().toISOString().slice(0, 10);
        entries = [
          {
            precioUsd: Number(editingItem.precioGarantia),
            actualizadoEn: /^\d{4}-\d{2}-\d{2}$/.test(fi) ? `${fi}T12:00:00.000Z` : new Date().toISOString(),
          },
        ];
      }
      setPrecioHistorialEntries(entries);
      setPrecioHistorialOpen(true);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "No se pudo cargar el historial de precios.",
        "error",
        "Items Garantía ANDE"
      );
    } finally {
      setPrecioHistorialLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.codigo.trim() || !formData.marca.trim() || !formData.modelo.trim() || !formData.fechaIngreso.trim()) {
      showToast("Debe completar Código, Marca, Modelo y Fecha ingreso.", "error", "Items Garantía ANDE");
      return;
    }

    const precioVal = precioFromFormField(formData.precioGarantia);

    try {
      if (editingItem) {
        await updateGarantiaItem(editingItem.id, {
          codigo: formData.codigo.trim(),
          marca: formData.marca.trim(),
          modelo: formData.modelo.trim(),
          fechaIngreso: formData.fechaIngreso.trim(),
          precioGarantia: precioVal,
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
          precioGarantia: precioVal ?? undefined,
          observaciones: formData.observaciones.trim() || undefined,
        });
        showToast("Ítem agregado correctamente.", "success", "Items Garantía ANDE");
      }
      const res = await getGarantiasItems();
      setItems(res.items);
      setShowAddModal(false);
      setEditingItem(null);
      setFormData({ codigo: "", marca: "", modelo: "", fechaIngreso: "", precioGarantia: "", observaciones: "" });
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
      precioGarantia: item.precioGarantia != null && Number.isFinite(Number(item.precioGarantia)) ? String(item.precioGarantia) : "",
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

  function handleDeleteOneConfirm() {
    if (!deleteConfirmItem) return;
    handleDelete(deleteConfirmItem);
    setDeleteConfirmItem(null);
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
      { header: "Precio garantía", key: "precioGarantia", width: 14 },
      { header: "Observaciones", key: "observaciones", width: 30 },
    ];

    items.forEach((i) => {
      ws.addRow({
        codigo: i.codigo,
        marca: i.marca ?? "",
        modelo: i.modelo ?? "",
        fechaIngreso: i.fechaIngreso ?? "",
        precioGarantia: i.precioGarantia != null && Number.isFinite(Number(i.precioGarantia)) ? Number(i.precioGarantia) : "",
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

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", "Items Garantía ANDE");
      e.target.value = "";
      return;
    }
    if (!canEdit) {
      showToast("No tiene permisos para importar.", "error", "Items Garantía ANDE");
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const parsed = await parseExcelGarantiasItems(file);
      if (parsed.length === 0) {
        showToast(
          "No se encontraron filas válidas. Use encabezados: Código, Marca, Modelo, Fecha ingreso, Precio garantía (opc.), Observaciones.",
          "error",
          "Items Garantía ANDE"
        );
        setExcelLoading(false);
        return;
      }
      const usedCodigos = new Set(items.map((i) => i.codigo));
      let nextG = 1;
      while (usedCodigos.has(`G${String(nextG).padStart(3, "0")}`)) nextG++;

      let imported = 0;
      for (const row of parsed) {
        let codigo: string;
        if (row.codigo && row.codigo !== "—" && !usedCodigos.has(row.codigo)) {
          codigo = row.codigo;
        } else {
          while (usedCodigos.has(`G${String(nextG).padStart(3, "0")}`)) nextG++;
          codigo = `G${String(nextG).padStart(3, "0")}`;
          nextG++;
        }
        usedCodigos.add(codigo);
        try {
          await createGarantiaItem({
            id: genId(),
            codigo,
            marca: row.marca,
            modelo: row.modelo,
            fechaIngreso: row.fechaIngreso,
            precioGarantia: row.precioGarantia ?? undefined,
            observaciones: row.observaciones,
          });
          imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Fila ${imported + 1}: ${msg}`);
        }
      }
      const res = await getGarantiasItems();
      setItems(res.items);
      setLoadError(false);
      showToast(`Se importaron ${parsed.length} ítem(s) correctamente.`, "success", "Items Garantía ANDE");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar Excel. Verificá que la tabla items_garantia_ande exista en Supabase (SQL Editor).", "error", "Items Garantía ANDE");
    } finally {
      setExcelLoading(false);
    }
  }

  const filteredItems = items.filter((i) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      i.codigo?.toLowerCase().includes(searchLower) ||
      (i.marca ?? "").toLowerCase().includes(searchLower) ||
      (i.modelo ?? "").toLowerCase().includes(searchLower) ||
      (i.fechaIngreso ?? "").toLowerCase().includes(searchLower) ||
      String(i.precioGarantia ?? "").toLowerCase().includes(searchLower) ||
      (i.observaciones ?? "").toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="fact-page fact-page--cte-tienda-edit">
      <div className="container cte-edit-tienda-page-inner">
        <PageHeader title="Items Garantía ANDE" logoHref="/" />

        <main className="cte-edit-market-main page-main page-main--market page-main--market--asic cliente-tienda-edit--admin">
          <section className="market-registro-section pt-0">

            <div className="py-2 py-lg-2 cte-edit-tienda-container">
              {/* Mismo contenedor / filtros / tabla / botones que SetupPage */}
              <div className="hrs-card hrs-card--rect p-4">
                <div className="clientes-filtros-outer">
                  <div className="clientes-filtros-container">
                    <div className="card clientes-filtros-card">
                      <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                      <div className="row g-2 align-items-end">
                        <div className="col-md-4">
                          <label className="form-label small fw-bold" htmlFor="garantias-items-search">
                            Buscar
                          </label>
                          <input
                            id="garantias-items-search"
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Buscar por código, marca, modelo, fecha o observaciones…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoComplete="off"
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
                              disabled={items.length === 0}
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
                                id="garantias-items-import-excel"
                                onChange={handleImportExcel}
                                disabled={excelLoading}
                              />
                              <label
                                htmlFor="garantias-items-import-excel"
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
                      📋 Listado de ítems ({loading ? "…" : filteredItems.length})
                      {!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}
                    </h6>
                    {canEdit && (
                      <Link
                        to="/equipos-asic/items-garantia/nuevo"
                        className="fact-btn fact-btn-primary btn-sm"
                        style={{
                          fontSize: "0.8125rem",
                          padding: "0.5rem 1rem",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          color: "inherit",
                        }}
                      >
                        ➕ Nuevo ítem
                      </Link>
                    )}
                  </div>

                  {loading ? (
                    <div className="table-responsive" style={{ minHeight: 200 }}>
                      <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                        <thead className="table-dark">
                          <tr>
                            <th className="text-start">Código</th>
                            <th className="text-start">Marca</th>
                            <th className="text-start">Modelo</th>
                            <th className="text-start">Fecha ingreso</th>
                            <th className="text-end">Precio garantía</th>
                            <th className="text-start">Observaciones</th>
                            {canEdit && (
                              <th className="text-start" style={{ width: "120px" }}>
                                Acciones
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3, 4, 5].map((row) => (
                            <tr key={row}>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "3em" }} />
                              </td>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "6em" }} />
                              </td>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "8em" }} />
                              </td>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "5em" }} />
                              </td>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "4em" }} />
                              </td>
                              <td>
                                <span className="clientes-skeleton" style={{ width: "10em" }} />
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
                  ) : loadError ? (
                    <div className="fact-empty">
                      <div className="fact-empty-icon text-warning">⚠️</div>
                      <div className="fact-empty-text">
                        No se pudo cargar desde el servidor. Si estás en Vercel, verificá que la tabla <code>items_garantia_ande</code> exista en Supabase (SQL Editor → ejecutá el schema).
                      </div>
                      <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={loadItems}>
                        Reintentar
                      </button>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="fact-empty">
                      <div className="fact-empty-icon">📋</div>
                      <div className="fact-empty-text">
                        {searchTerm
                          ? "No se encontraron ítems con ese criterio de búsqueda."
                          : 'No hay ítems cargados. Agregá uno con el botón "Nuevo ítem" o importá desde Excel.'}
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
                            <th className="text-start">Código</th>
                            <th className="text-start">Marca</th>
                            <th className="text-start">Modelo</th>
                            <th className="text-start">Fecha ingreso</th>
                            <th className="text-end">Precio garantía</th>
                            <th className="text-start">Observaciones</th>
                            {canEdit && (
                              <th className="text-start" style={{ width: "120px" }}>
                                Acciones
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((i) => (
                            <tr key={i.id}>
                              <td className="text-start fw-bold">{i.codigo}</td>
                              <td className="text-start">{i.marca ?? "—"}</td>
                              <td className="text-start">{i.modelo ?? "—"}</td>
                              <td className="text-start">
                                {i.fechaIngreso
                                  ? new Date(i.fechaIngreso + "T12:00:00").toLocaleDateString("es-AR")
                                  : "—"}
                              </td>
                              <td className="text-end text-muted small">
                                {i.precioGarantia != null && Number.isFinite(Number(i.precioGarantia))
                                  ? Number(i.precioGarantia).toLocaleString("es-AR", { maximumFractionDigits: 2 })
                                  : "—"}
                              </td>
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
                                      onClick={() => setDeleteConfirmItem(i)}
                                      title="Eliminar"
                                    >
                                      <i className="bi bi-trash" />
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
            </div>
          </section>
        </main>

        {/* Editar ítem: modal superpuesto al listado (no empuja filtros/tabla hacia abajo) */}
        {showAddModal && editingItem ? (
          <div
            className="gar-ande-edit-modal-root modal show d-block"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gar-edit-modal-title"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1060 }}
            onClick={closeEditModal}
          >
            <div
              className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable gar-ande-edit-modal-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content market-registro-card cte-edit-market__card cte-edit-market__card--full border-0 shadow-lg">
                <div className="modal-header border-0 pb-0 align-items-start">
                  <header className="market-registro-card__head cte-edit-tienda-card-head flex-grow-1 mb-0 border-0 p-0">
                    <p className="market-registro-card__kicker mb-1">Garantía ANDE · Ítems</p>
                    <h2 id="gar-edit-modal-title" className="market-registro-card__title cte-edit-market__title-row h4 mb-0">
                      <span>Editar ítem</span>
                      <span className="badge bg-success rounded-pill cte-edit-market__code-badge">{editingItem.codigo}</span>
                    </h2>
                  </header>
                  <button type="button" className="btn-close ms-2" aria-label="Cerrar" onClick={closeEditModal} />
                </div>
                <div className="modal-body pt-2">
                  <div className="cte-edit-market-form--admin px-1">
                    <div className="row g-3 align-items-stretch cte-edit-tienda-main-grid">
                      <div className="col-12 col-lg-4 d-flex">
                        <div
                          className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                          role="group"
                          aria-labelledby="gar-edit-legend-id"
                        >
                          <div id="gar-edit-legend-id" className="market-registro-fieldset__legend">
                            <i className="bi bi-tag" aria-hidden />
                            Identificación
                          </div>
                          <div className="mb-2">
                            <label className="form-label market-registro-label" htmlFor="gar-edit-codigo">
                              Código <span className="text-danger">*</span>
                            </label>
                            <input
                              id="gar-edit-codigo"
                              type="text"
                              className="form-control cte-edit-market__input--locked"
                              value={formData.codigo}
                              readOnly
                              aria-readonly="true"
                              title="El código no se puede modificar"
                            />
                          </div>
                          <div className="mb-0">
                            <label className="form-label market-registro-label" htmlFor="gar-edit-marca">
                              Marca <span className="text-danger">*</span>
                            </label>
                            <input
                              id="gar-edit-marca"
                              type="text"
                              className="form-control"
                              value={formData.marca}
                              onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                              placeholder="Ej: Bitmain"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-lg-4 d-flex">
                        <div
                          className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                          role="group"
                          aria-labelledby="gar-edit-legend-eq"
                        >
                          <div id="gar-edit-legend-eq" className="market-registro-fieldset__legend">
                            <i className="bi bi-cpu" aria-hidden />
                            Equipo y fecha
                          </div>
                          <div className="mb-2">
                            <label className="form-label market-registro-label" htmlFor="gar-edit-modelo">
                              Modelo <span className="text-danger">*</span>
                            </label>
                            <input
                              id="gar-edit-modelo"
                              type="text"
                              className="form-control"
                              value={formData.modelo}
                              onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                              placeholder="Ej: S19 Pro"
                            />
                          </div>
                          <div className="mb-2">
                            <label className="form-label market-registro-label" htmlFor="gar-edit-fecha">
                              Fecha ingreso <span className="text-danger">*</span>
                            </label>
                            <input
                              id="gar-edit-fecha"
                              type="date"
                              className="form-control"
                              value={formData.fechaIngreso}
                              onChange={(e) => setFormData({ ...formData, fechaIngreso: e.target.value })}
                            />
                          </div>
                          <div className="mb-0">
                            <label className="form-label market-registro-label" htmlFor="gar-edit-precio">
                              Precio garantía
                            </label>
                            <input
                              id="gar-edit-precio"
                              type="text"
                              inputMode="decimal"
                              className="form-control"
                              value={formData.precioGarantia}
                              onChange={(e) => setFormData({ ...formData, precioGarantia: e.target.value })}
                              placeholder="Opcional · ej. 150 o 150.50"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-lg-4 d-flex">
                        <div
                          className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                          role="group"
                          aria-labelledby="gar-edit-legend-obs"
                        >
                          <div id="gar-edit-legend-obs" className="market-registro-fieldset__legend">
                            <i className="bi bi-chat-left-text" aria-hidden />
                            Observaciones
                          </div>
                          <label className="form-label market-registro-label" htmlFor="gar-edit-obs">
                            Observaciones
                          </label>
                          <textarea
                            id="gar-edit-obs"
                            className="form-control"
                            rows={5}
                            value={formData.observaciones}
                            onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0 market-registro-submit-row d-flex flex-wrap gap-2 justify-content-end align-items-center cte-edit-tienda-actions">
                  <button type="button" className="btn btn-outline-secondary order-2 order-md-1" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-success order-2"
                    onClick={() => void openPrecioHistorialModal()}
                    disabled={precioHistorialLoading}
                    title="Ver evolución y registros de precio"
                  >
                    {precioHistorialLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden />
                        Cargando…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-graph-up-arrow me-1" aria-hidden />
                        Historial de precios
                      </>
                    )}
                  </button>
                  <button type="button" className="btn btn-success market-registro-submit order-1 order-md-3" onClick={handleSave}>
                    Actualizar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {precioHistorialOpen && editingItem ? (
          <PrecioHistorialFullModal
            open={precioHistorialOpen}
            onClose={() => setPrecioHistorialOpen(false)}
            historial={precioHistorialEntries}
            marca={editingItem.marca ?? ""}
            modelo={editingItem.modelo ?? ""}
            procesador="—"
            codigoProducto={editingItem.codigo}
          />
        ) : null}

        {/* Modal Confirmación eliminar un ítem */}
        {deleteConfirmItem && (
          <div className="modal show d-block historial-delete-modal-overlay" tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content historial-delete-modal">
                <div className="modal-header historial-delete-modal-header">
                  <div className="historial-delete-icon-wrapper historial-delete-icon-danger">
                    <i className="bi bi-trash historial-delete-icon" style={{ fontSize: "1.5rem" }} />
                  </div>
                  <h5 className="modal-title historial-delete-modal-title">Eliminar ítem</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteConfirmItem(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body historial-delete-modal-body">
                  <p className="historial-delete-question">
                    ¿Está eliminando un ítem. ¿Está seguro que quiere hacer esto?
                  </p>
                  <p className="historial-delete-warning text-muted small mb-0">
                    {deleteConfirmItem.codigo} - {deleteConfirmItem.marca} {deleteConfirmItem.modelo}
                  </p>
                </div>
                <div className="modal-footer historial-delete-modal-footer">
                  <button type="button" className="btn historial-delete-btn-cancel" onClick={() => setDeleteConfirmItem(null)}>
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
