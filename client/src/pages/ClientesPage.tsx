import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { deleteAllClients, getClients } from "../lib/api";
import type { Client } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes, canExport } from "../lib/auth";
import "../styles/facturacion.css";

export function ClientesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function loadClients() {
    setLoading(true);
    setError(null);
    getClients()
      .then((r) => setClients(r.clients as Client[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar clientes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(loadClients, 0);
    return () => clearTimeout(t);
  }, []);

  function handleEdit(c: Client) {
    if (c.id == null) return;
    navigate(`/clientes/${c.id}/edit`);
  }

  function handleNewClient() {
    navigate("/clientes/nuevo");
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
    deleteAllClients()
      .then(() => {
        loadClients();
        showToast("Todos los clientes han sido eliminados.", "success", "Clientes");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al borrar");
        showToast(err instanceof Error ? err.message : "Error al borrar", "error", "Clientes");
      })
      .finally(() => setDeleting(false));
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm1(false);
    setShowDeleteConfirm2(false);
  }

  function exportExcel() {
    if (clients.length === 0) {
      showToast("No hay clientes para exportar.", "warning");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Clientes");

    // Configurar columnas
    ws.columns = [
      { header: "Código", key: "code", width: 15 },
      { header: "Nombre o Razón Social 1", key: "name", width: 35 },
      { header: "Nombre o Razón Social 2", key: "name2", width: 35 },
      { header: "Teléfono 1", key: "phone", width: 20 },
      { header: "Teléfono 2", key: "phone2", width: 20 },
      { header: "Email 1", key: "email", width: 30 },
      { header: "Email 2", key: "email2", width: 30 },
      { header: "Dirección 1", key: "address", width: 40 },
      { header: "Dirección 2", key: "address2", width: 40 },
      { header: "Ciudad / País 1", key: "city", width: 30 },
      { header: "Ciudad / País 2", key: "city2", width: 30 }
    ];

    // Agregar datos
    clients.forEach((client) => {
      ws.addRow({
        code: client.code || "",
        name: client.name || "",
        name2: client.name2 || "",
        phone: client.phone || "",
        phone2: client.phone2 || "",
        email: client.email || "",
        email2: client.email2 || "",
        address: client.address || "",
        address2: client.address2 || "",
        city: client.city || "",
        city2: client.city2 || ""
      });
    });

    // Estilizar encabezados
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF00A652" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    // Aplicar bordes a todas las celdas con datos
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

    // Generar y descargar archivo
    wb.xlsx.writeBuffer().then((buf) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buf]), `ClientesHRS_Activos_${fecha}.xlsx`);
    });
  }

  const filteredClients = clients.filter((c) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      c.code?.toLowerCase().includes(searchLower) ||
      c.name?.toLowerCase().includes(searchLower) ||
      c.name2?.toLowerCase().includes(searchLower) ||
      c.phone?.toLowerCase().includes(searchLower) ||
      c.email?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Clientes" />

        <div className="hrs-card hrs-card--rect p-4">
          {/* Filtros: mismo diseño que Historial */}
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
                      placeholder="Buscar por código, nombre, teléfono o email..."
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
                        disabled={clients.length === 0}
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

          {/* Listado: mismo diseño que Historial (tabla con encabezado verde) */}
          <div className="clientes-listado-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">👥 Listado de clientes ({filteredClients.length}){!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}</h6>
              {canEdit && (
                <button
                  type="button"
                  className="fact-btn fact-btn-primary btn-sm"
                  onClick={handleNewClient}
                  style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
                >
                  ➕ Nuevo Cliente
                </button>
              )}
            </div>

            {error && (
              <div className="mb-3 p-3 rounded" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                {error}
                {typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1") && " Asegurate de tener el servidor levantado (npm run dev en la raíz)."}
              </div>
            )}

            {loading ? (
              <p className="text-muted">Cargando clientes...</p>
            ) : filteredClients.length === 0 ? (
              <div className="fact-empty">
                <div className="fact-empty-icon">👥</div>
                <div className="fact-empty-text">
                  {searchTerm ? "No se encontraron clientes con ese criterio de búsqueda." : "No hay clientes cargados. Agregá uno con el formulario."}
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle clientes-listado-table" style={{ fontSize: "0.85rem" }}>
                  <thead className="table-dark">
                    <tr>
                      <th className="text-start">Código</th>
                      <th className="text-start">Nombre/Razón Social</th>
                      <th className="text-start">Contacto</th>
                      <th className="text-start">Ubicación</th>
                      {canEdit && <th className="text-start" style={{ width: "100px" }}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((c) => (
                      <tr key={c.id ?? c.code}>
                        <td className="text-start client-code">{c.code}</td>
                        <td className="text-start client-name">
                          <div className="client-name-primary">{c.name}</div>
                          {c.name2 && (
                            <div className="client-name-secondary">
                              <span>{c.name2}</span>
                            </div>
                          )}
                        </td>
                        <td className="text-start client-contact">
                          {c.phone && <div>📞 {c.phone}</div>}
                          {c.phone2 && <div className="text-muted small">📞 {c.phone2}</div>}
                          {c.email && <div>✉️ {c.email}</div>}
                          {c.email2 && <div className="text-muted small">✉️ {c.email2}</div>}
                        </td>
                        <td className="text-start client-location">
                          {c.address && <div>{c.address}</div>}
                          {c.city && <div className="text-muted small">{c.city}</div>}
                        </td>
                        {canEdit && (
                          <td className="text-start">
                            <button
                              type="button"
                              className="fact-btn fact-btn-secondary btn-sm"
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                              onClick={() => handleEdit(c)}
                            >
                              Editar
                            </button>
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

      {/* Modal Primera Confirmación - Eliminar Todos los Clientes */}
      {showDeleteConfirm1 && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-delete">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title">
                  Eliminar Todos los Clientes
                </h5>
                <button type="button" className="professional-modal-close" onClick={handleDeleteCancel} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body professional-modal-body">
                <p style={{ fontSize: "1rem", color: "#374151", marginBottom: "1rem" }}>
                  ¿Eliminar <strong>todos</strong> los clientes permanentemente?
                </p>
                <div className="professional-modal-warning-box">
                  Esta acción no se puede deshacer.
                </div>
              </div>
              <div className="modal-footer professional-modal-footer">
                <button type="button" className="professional-btn professional-btn-secondary" onClick={handleDeleteCancel}>
                  Cancelar
                </button>
                <button type="button" className="professional-btn professional-btn-primary" onClick={handleDeleteConfirm1}>
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Segunda Confirmación - Eliminar Todos los Clientes */}
      {showDeleteConfirm2 && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-delete">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title">
                  Confirmar Eliminación
                </h5>
                <button type="button" className="professional-modal-close" onClick={handleDeleteCancel} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body professional-modal-body">
                <p style={{ fontSize: "1rem", color: "#374151", marginBottom: "1rem" }}>
                  Se eliminarán <strong>todos</strong> los clientes de la base de datos.
                </p>
                <div className="professional-modal-warning-box">
                  Esta acción es irreversible. ¿Continuar?
                </div>
              </div>
              <div className="modal-footer professional-modal-footer">
                <button type="button" className="professional-btn professional-btn-secondary" onClick={handleDeleteCancel} disabled={deleting}>
                  Cancelar
                </button>
                <button type="button" className="professional-btn professional-btn-primary" onClick={handleDeleteConfirm2} disabled={deleting}>
                  {deleting ? (
                    <>
                      <span className="professional-btn-spinner"></span>
                      Eliminando...
                    </>
                  ) : (
                    "Sí, eliminar todo"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
