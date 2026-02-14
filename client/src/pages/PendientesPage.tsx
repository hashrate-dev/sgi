import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getClients } from "../lib/api";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { loadInvoices } from "../lib/storage";
import type { Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canExport } from "../lib/auth";
import "../styles/facturacion.css";

// Función para formatear números: negativos con -, positivos sin cambios; todo en negro
function formatCurrency(value: number): string {
  if (value < 0) {
    return `-${Math.abs(value).toFixed(2)} USD`;
  }
  return `${value.toFixed(2)} USD`;
}

// Función para calcular fecha de vencimiento desde fecha de emisión
function calculateDueDate(dateStr: string): string {
  try {
    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        date = new Date(year, month, day);
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateStr);
    }
    
    if (isNaN(date.getTime())) {
      return "-";
    }
    
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate.toLocaleDateString();
  } catch {
    return "-";
  }
}

export function PendientesPage() {
  const { user } = useAuth();
  const [all] = useState<Invoice[]>(() => loadInvoices());
  const [qClient, setQClient] = useState("");
  const [qMonth, setQMonth] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const canExportData = user ? canExport(user.role) : false;

  // Filtrar solo facturas pendientes (sin recibo ni nota de crédito relacionada)
  const pendingInvoices = useMemo(() => {
    return all.filter((inv) => {
      // Solo facturas
      if (inv.type !== "Factura") return false;
      
      // Verificar si tiene recibo relacionado
      const hasReceipt = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
      
      // Verificar si tiene nota de crédito relacionada
      const hasCreditNote = all.some((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.id);
      
      // Es pendiente si no tiene recibo ni nota de crédito
      return !hasReceipt && !hasCreditNote;
    });
  }, [all]);

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return pendingInvoices.filter((inv) => {
      const okClient = !client || inv.clientName.toLowerCase().includes(client);
      const okMonth = !qMonth || inv.month.startsWith(qMonth);
      return okClient && okMonth;
    });
  }, [pendingInvoices, qClient, qMonth]);

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [filtered.length]);

  const stats = useMemo(() => {
    const totalPendientes = pendingInvoices.length;
    const totalMontoPendiente = pendingInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    return { totalPendientes, totalMontoPendiente };
  }, [pendingInvoices]);

  function exportExcel() {
    if (filtered.length === 0) {
      showToast("No hay facturas pendientes para exportar.", "warning", "Pendientes");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Facturas Pendientes");

    ws.columns = [
      { header: "Número", key: "number", width: 14 },
      { header: "Cliente", key: "clientName", width: 30 },
      { header: "Fecha Emisión", key: "date", width: 18 },
      { header: "Hora Emisión", key: "emissionTime", width: 12 },
      { header: "Fecha Vencimiento", key: "dueDate", width: 18 },
      { header: "Mes", key: "month", width: 10 },
      { header: "Total (S/Desc)", key: "subtotal", width: 16 },
      { header: "Descuento", key: "discounts", width: 12 },
      { header: "Total", key: "total", width: 12 }
    ];

    filtered.forEach((inv) => {
      const dueDate = inv.dueDate || calculateDueDate(inv.date);
      ws.addRow({
        number: inv.number,
        clientName: inv.clientName,
        date: inv.date,
        emissionTime: inv.emissionTime || "-",
        dueDate: dueDate,
        month: inv.month,
        subtotal: inv.subtotal.toFixed(2),
        discounts: inv.discounts.toFixed(2),
        total: inv.total.toFixed(2)
      });
    });

    wb.xlsx.writeBuffer().then((buffer) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buffer]), `Facturas_Pendientes_Hosting_${fecha}.xlsx`);
      showToast("Excel exportado correctamente.", "success", "Pendientes");
    });
  }

  async function generatePdfFromHistory(inv: Invoice) {
    try {
      if (!inv.items || inv.items.length === 0) {
        showToast("Esta factura no tiene ítems cargados. No se puede generar el PDF.", "error", "Pendientes");
        return;
      }

      const clientsResponse = await getClients();
      const clients = clientsResponse.clients ?? [];
      const client = clients.find((c) => c.name === inv.clientName);
      
      if (!client) {
        showToast(`No se encontró el cliente "${inv.clientName}" en la base de datos.`, "error", "Pendientes");
        return;
      }

      let logoBase64: string | undefined;
      try {
        logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
      } catch (err) {
        console.warn("No se pudo cargar el logo:", err);
      }

      let invoiceDate: Date;
      if (inv.date.includes("/")) {
        const parts = inv.date.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          invoiceDate = new Date(year, month, day);
        } else {
          invoiceDate = new Date(inv.date);
        }
      } else {
        invoiceDate = new Date(inv.date);
      }

      if (isNaN(invoiceDate.getTime())) {
        invoiceDate = new Date();
      }

      const validItems = inv.items.map((item) => {
        let serviceKey: "A" | "B" | "C" | "D" = (item.serviceKey as "A" | "B" | "C" | "D") || "A";
        if (!item.serviceKey && item.serviceName) {
          if (item.serviceName.includes("L7") || item.serviceName.includes("L9")) {
            serviceKey = item.serviceName.includes("L9") ? "B" : "A";
          } else {
            serviceKey = "C";
          }
        }
        
        return {
          serviceKey,
          serviceName: item.serviceName || "Servicio",
          month: item.month || inv.month,
          quantity: item.quantity || 1,
          price: item.price || 0,
          discount: item.discount || 0
        };
      });

      const doc = generateFacturaPdf(
        {
          number: inv.number,
          type: inv.type,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          clientAddress: client.address,
          clientCity: client.city,
          clientName2: client.name2,
          clientPhone2: client.phone2,
          clientEmail2: client.email2,
          clientAddress2: client.address2,
          clientCity2: client.city2,
          date: invoiceDate,
          items: validItems,
          subtotal: inv.subtotal || 0,
          discounts: inv.discounts || 0,
          total: inv.total || 0
        },
        { logoBase64 }
      );

      const safeName = client.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
      doc.save(`${inv.number}_${safeName}.pdf`);
      showToast("PDF generado correctamente.", "success", "Pendientes");
    } catch (error) {
      console.error("Error al generar PDF:", error);
      showToast(`Error al generar el PDF: ${error instanceof Error ? error.message : "Error desconocido"}`, "error", "Pendientes");
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Facturas Pendientes" />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="pendientes-filtros-outer">
            <div className="pendientes-filtros-container">
              <div className="card pendientes-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2">
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Cliente</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar cliente..."
                      value={qClient}
                      onChange={(e) => setQClient(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-bold">Mes</label>
                    <input
                      type="month"
                      className="form-control form-control-sm"
                      value={qMonth}
                      onChange={(e) => setQMonth(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end">
                    <button
                      className="btn btn-outline-secondary btn-sm w-100"
                      onClick={() => {
                        setQClient("");
                        setQMonth("");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  {canExportData && (
                    <div className="col-md-auto d-flex align-items-end ms-auto">
                      <button
                        className="btn btn-outline-secondary btn-sm pendientes-export-excel-btn"
                        style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }}
                        onClick={exportExcel}
                      >
                        📊 Exportar Excel
                      </button>
                    </div>
                  )}
                </div>
            </div>
          </div>
        </div>

        <div className="pendientes-listado-wrap">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-bold m-0">📄 Facturas Pendientes{user && !canExportData ? " (solo consulta)" : ""}</h6>
          </div>

          <div className="table-responsive">
            <table className="table table-sm align-middle" style={{ fontSize: "0.85rem" }}>
              <thead className="table-dark">
                <tr>
                  <th className="text-start">N°</th>
                  <th className="text-start">Cliente</th>
                  <th className="text-start">Fecha Emisión</th>
                  <th className="text-start">Hora Emisión</th>
                  <th className="text-start">Fecha Vencimiento</th>
                  <th className="text-start">Mes</th>
                  <th className="text-start">Total (S/Desc)</th>
                  <th className="text-start">Descuento</th>
                  <th className="text-start">Total</th>
                  <th className="text-start">Estado</th>
                  <th className="text-start">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center text-muted py-4">
                      <small>{pendingInvoices.length === 0 ? "No hay facturas pendientes de cobro." : "No se encontraron facturas con los filtros aplicados."}</small>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inv) => {
                    const dueDate = inv.dueDate || calculateDueDate(inv.date);
                    return (
                      <tr key={inv.id}>
                        <td className="fw-bold text-start">{inv.number}</td>
                        <td className="text-start">{inv.clientName}</td>
                        <td className="text-start">{inv.date}</td>
                        <td className="text-start">{inv.emissionTime || "-"}</td>
                        <td className="text-start">{dueDate}</td>
                        <td className="text-start">{inv.month}</td>
                        <td className="text-start">{formatCurrency(inv.subtotal)}</td>
                        <td className="text-start">{formatCurrency(inv.discounts)}</td>
                        <td className="text-start fw-bold">{formatCurrency(inv.total)}</td>
                        <td className="text-center">
                          <span className="d-inline-flex" style={{ fontSize: "0.95rem", padding: "0.1rem 0.2rem", borderRadius: "50%", width: "1.05rem", height: "1.05rem", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", color: "#ffc107" }} title="Factura pendiente de pago">
                            ⚠️
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="d-flex gap-1 justify-content-center flex-wrap">
                            <button
                              type="button"
                              className="btn btn-sm border"
                              onClick={() => setDetailInvoice(inv)}
                              title="Ver detalles"
                              style={{ width: "1.3rem", height: "1.3rem", padding: 0, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, backgroundColor: "#fff9c4", color: "#5d4037", borderColor: "#d4c44a" }}
                            >
                              ℹ️
                            </button>
                            <button 
                              className="fact-btn fact-btn-primary btn-sm" 
                              onClick={() => generatePdfFromHistory(inv)}
                              title="PDF"
                              style={{ width: "1.3rem", height: "1.3rem", padding: 0, fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                            >
                              📄
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1 historial-pagination">
              <span className="text-muted small">
                Mostrando {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} operaciones
              </span>
              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Anterior
                </button>
                <span className="px-2 small text-muted">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Estadísticas */}
        <div className="row mt-4 g-3 historial-stats">
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-warning" />
              <div className="stat-label">Total facturas pendientes</div>
              <div className="stat-value text-warning">{stats.totalPendientes}</div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Monto total pendiente</div>
              <div className="stat-value text-danger">
                {stats.totalMontoPendiente.toFixed(2)} <span className="currency">USD</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Detalle del comprobante */}
        {detailInvoice && (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Detalle del comprobante</h5>
                  <button type="button" className="btn-close" onClick={() => setDetailInvoice(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body">
                  {(() => {
                    const inv = detailInvoice;
                    const dueDate = inv.dueDate || calculateDueDate(inv.date);
                    return (
                      <>
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4"><strong>Número:</strong> {inv.number}</div>
                          <div className="col-md-4"><strong>Tipo:</strong> {inv.type}</div>
                          <div className="col-md-4"><strong>Cliente:</strong> {inv.clientName}</div>
                          <div className="col-md-4"><strong>Fecha emisión:</strong> {inv.date}</div>
                          <div className="col-md-4"><strong>Hora emisión:</strong> {inv.emissionTime || "-"}</div>
                          <div className="col-md-4"><strong>Fecha vencimiento:</strong> {dueDate}</div>
                          <div className="col-md-4"><strong>Fecha pago:</strong> -</div>
                          <div className="col-md-4"><strong>Mes:</strong> {inv.month}</div>
                        </div>
                        {inv.items && inv.items.length > 0 && (
                          <div className="mb-3">
                            <strong>Ítems</strong>
                            <table className="table table-sm table-bordered mt-1">
                              <thead>
                                <tr>
                                  <th>Servicio</th>
                                  <th>Mes</th>
                                  <th className="text-end">Cant.</th>
                                  <th className="text-end">Precio</th>
                                  <th className="text-end">Desc.</th>
                                  <th className="text-end">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td>{item.serviceName}</td>
                                    <td>{item.month || "-"}</td>
                                    <td className="text-end">{item.quantity}</td>
                                    <td className="text-end">{item.price.toFixed(2)} USD</td>
                                    <td className="text-end">{item.discount.toFixed(2)} USD</td>
                                    <td className="text-end">{((item.quantity * item.price) - item.discount).toFixed(2)} USD</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4 text-end"><strong>Total (S/Desc):</strong> {formatCurrency(inv.subtotal)}</div>
                          <div className="col-md-4 text-end"><strong>Descuento:</strong> {formatCurrency(inv.discounts)}</div>
                          <div className="col-md-4 text-end"><strong>Total:</strong> {formatCurrency(inv.total)}</div>
                        </div>
                        <div className="alert alert-warning">
                          <strong>⚠️ Estado:</strong> Esta factura está pendiente de cobro. No tiene recibo ni nota de crédito relacionada.
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailInvoice(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
