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

  function handleDeleteAll() {
    if (!window.confirm("¿Está seguro de que desea borrar TODOS los clientes? Esta acción no se puede deshacer.")) return;
    if (!window.confirm("Segunda confirmación: se eliminarán todos los clientes de la base. ¿Continuar?")) return;
    deleteAllClients()
      .then(() => {
        loadClients();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al borrar"));
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
      const fecha = new Date().toISOString().split("T")[0].replace(/-/g, "");
      saveAs(new Blob([buf]), `Listado_Clientes_${fecha}.xlsx`);
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

        {/* Listado */}
        <main className="fact-main" style={{ maxWidth: "100%" }}>
          <div className="fact-card">
            <div className="fact-card-header">
              <div className="d-flex justify-content-between align-items-center">
                <span>Listado de clientes ({filteredClients.length}){!canEdit && <span className="text-muted small ms-2">(solo consulta)</span>}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="fact-btn fact-btn-primary"
                    onClick={handleNewClient}
                    style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
                  >
                    ➕ Nuevo Cliente
                  </button>
                )}
              </div>
            </div>
            <div className="fact-card-body">
              {/* Barra de búsqueda y acciones */}
              <div className="mb-3 d-flex flex-wrap gap-2 align-items-center" style={{ justifyContent: "space-between", paddingBottom: "1rem", borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ flex: "1 1 300px", minWidth: "200px" }}>
                  <input
                    type="text"
                    className="fact-input"
                    placeholder="🔍 Buscar por código, nombre, teléfono o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  {canExportData && (
                  <button
                    type="button"
                    className="fact-btn"
                    style={{ background: "#00a652", color: "#fff" }}
                    onClick={exportExcel}
                    disabled={clients.length === 0}
                  >
                    📊 Exportar Excel
                  </button>
                )}
                  {canDelete && (
                  <button
                    type="button"
                    className="fact-btn"
                    style={{ background: "#991b1b", color: "#fff" }}
                    onClick={handleDeleteAll}
                  >
                    🗑️ Borrar todo
                  </button>
                )}
                </div>
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
                  <div className="clients-table-container">
                    <table className="clients-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Nombre/Razón Social</th>
                          <th>Contacto</th>
                          <th>Ubicación</th>
                          {canEdit && <th style={{ width: "100px" }}>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.map((c) => (
                          <tr key={c.id ?? c.code}>
                            <td className="client-code">{c.code}</td>
                            <td className="client-name">
                              <div className="client-name-primary">{c.name}</div>
                              {c.name2 && (
                                <div className="client-name-secondary">
                                  <span>{c.name2}</span>
                                </div>
                              )}
                            </td>
                            <td className="client-contact">
                              {c.phone && <div>📞 {c.phone}</div>}
                              {c.phone2 && <div className="text-muted small">📞 {c.phone2}</div>}
                              {c.email && <div>✉️ {c.email}</div>}
                              {c.email2 && <div className="text-muted small">✉️ {c.email2}</div>}
                            </td>
                            <td className="client-location">
                              {c.address && <div>{c.address}</div>}
                              {c.city && <div className="text-muted small">{c.city}</div>}
                            </td>
                            {canEdit && (
                            <td>
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem", width: "100%" }}
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
        </main>
      </div>
    </div>
  );
}
