import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getClients } from "../lib/api";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { loadInvoices, saveInvoices } from "../lib/storage";
import type { ComprobanteType, Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteHistorial, canExport } from "../lib/auth";
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
    // Intentar parsear la fecha (puede estar en formato DD/MM/YYYY o MM/DD/YYYY)
    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        // Asumir formato DD/MM/YYYY
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Los meses en Date son 0-indexed
        const year = parseInt(parts[2], 10);
        date = new Date(year, month, day);
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateStr);
    }
    
    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) {
      return "-";
    }
    
    // Sumar 7 días
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate.toLocaleDateString();
  } catch {
    return "-";
  }
}

export function HistorialPage() {
  const { user } = useAuth();
  const [all, setAll] = useState<Invoice[]>(() => loadInvoices());
  const [qClient, setQClient] = useState("");
  const [qType, setQType] = useState<"" | ComprobanteType>("");
  const [qMonth, setQMonth] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const canDelete = user ? canDeleteHistorial(user.role) : false;
  const canExportData = user ? canExport(user.role) : false;

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return all.filter((inv) => {
      const okClient = !client || inv.clientName.toLowerCase().includes(client);
      const okType = !qType || inv.type === qType;
      const okMonth = !qMonth || inv.month.startsWith(qMonth);
      return okClient && okType && okMonth;
    });
  }, [all, qClient, qType, qMonth]);

  const stats = useMemo(() => {
    const facturas = all.filter((i) => i.type === "Factura").length;
    const recibos = all.filter((i) => i.type === "Recibo").length;
    const notasCredito = all.filter((i) => i.type === "Nota de Crédito").length;
    // Facturación total: suma de todas las facturas, menos las notas de crédito (restan la factura correspondiente)
    const sumaFacturas = all.filter((i) => i.type === "Factura").reduce((s, i) => s + (Number(i.total) || 0), 0);
    const sumaNotasCredito = all.filter((i) => i.type === "Nota de Crédito").reduce((s, i) => s + (Math.abs(i.total) || 0), 0);
    const facturacionTotal = sumaFacturas - sumaNotasCredito;
    // Cobros pendientes: facturas que figuran como pendiente de pago (sin recibo asociado en la BD)
    const facturasPendientes = all.filter((i) => {
      if (i.type !== "Factura") return false;
      const tieneRecibo = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === i.id);
      return !tieneRecibo;
    });
    const cobrosPendientes = facturasPendientes.reduce((s, i) => s + (Number(i.total) || 0), 0);
    // Cobros realizados = Facturación total - Cobros pendientes
    const cobrosRealizados = facturacionTotal - cobrosPendientes;
    return { facturas, recibos, notasCredito, facturacionTotal, cobrosPendientes, cobrosRealizados, registros: all.length };
  }, [all]);

  function exportExcel() {
    if (all.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Historial");

    ws.columns = [
      { header: "Número", key: "number", width: 14 },
      { header: "Tipo", key: "type", width: 10 },
      { header: "Cliente", key: "clientName", width: 30 },
      { header: "Fecha Emisión", key: "date", width: 18 },
      { header: "Hora Emisión", key: "emissionTime", width: 12 },
      { header: "Fecha Vencimiento", key: "dueDate", width: 18 },
      { header: "Fecha Pago", key: "paymentDate", width: 18 },
      { header: "Mes", key: "month", width: 10 },
      { header: "Total (S/Desc)", key: "subtotal", width: 16 },
      { header: "Descuento", key: "discounts", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "Estado", key: "status", width: 10 }
    ];

    all.forEach((inv) => {
      // Calcular fecha de vencimiento si no existe
      const dueDate = inv.dueDate || calculateDueDate(inv.date);
      // Aplicar signo negativo a las Notas de Crédito y Recibos relacionados con facturas
      const isNegative = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
      const subtotal = isNegative ? -(Math.abs(inv.subtotal) || 0) : (inv.subtotal || 0);
      // Descuento: negativo para Facturas, positivo para Recibos, negativo para Notas de Crédito
      let discounts: number;
      if (inv.type === "Factura") {
        discounts = -(Math.abs(inv.discounts) || 0);
      } else if (inv.type === "Recibo") {
        discounts = Math.abs(inv.discounts) || 0;
      } else {
        // Nota de Crédito
        discounts = -(Math.abs(inv.discounts) || 0);
      }
      const total = isNegative ? -(Math.abs(inv.total) || 0) : (inv.total || 0);
      
      // Verificar si la operación está cerrada
      let isClosed = false;
      let isCancelledByNC = false;
      if (inv.type === "Factura") {
        const hasReceipt = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
        // Solo considerar válida si hay exactamente UNA Nota de Crédito relacionada
        const creditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.id);
        const hasCreditNote = creditNotes.length === 1;
        isClosed = hasReceipt || hasCreditNote;
        isCancelledByNC = hasCreditNote;
      } else if (inv.type === "Recibo" && inv.relatedInvoiceId) {
        isClosed = true;
      } else if (inv.type === "Nota de Crédito" && inv.relatedInvoiceId) {
        // Verificar que sea la única NC para esa factura
        const otherNCs = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.relatedInvoiceId && nc.id !== inv.id);
        if (otherNCs.length === 0) {
          isClosed = true;
          isCancelledByNC = true;
        }
      }
      
      // Determinar el estado para Excel
      let status = "Pendiente";
      if (isClosed) {
        if (isCancelledByNC && inv.type === "Nota de Crédito") {
          status = "✓ Cancelado (NC)";
        } else if (isCancelledByNC) {
          status = "✓ Cancelado (NC)";
        } else {
          status = "✓ Cerrado";
        }
      } else if (inv.type === "Factura") {
        status = "⚠️ Pendiente";
      }
      // Fecha de pago: misma lógica que la tabla (Factura pagada=fecha, cancelada por NC="Cancelada", sino "Pendiente"; NC=fecha emisión)
      const relatedReciboPayment = inv.type === "Factura" ? all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id) : null;
      const relatedNCPayment = inv.type === "Factura" ? all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id) : null;
      let paymentDateExportCell: string;
      if (inv.type === "Factura") {
        if (relatedReciboPayment?.paymentDate) paymentDateExportCell = new Date(relatedReciboPayment.paymentDate).toLocaleDateString();
        else if (relatedNCPayment) paymentDateExportCell = "Cancelada";
        else paymentDateExportCell = "Pendiente";
      } else if (inv.type === "Nota de Crédito") {
        paymentDateExportCell = inv.date || (inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-");
      } else {
        paymentDateExportCell = inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-";
      }
      ws.addRow({
        number: inv.number,
        type: inv.type,
        clientName: inv.clientName,
        date: inv.date,
        emissionTime: inv.emissionTime || "-",
        dueDate: dueDate,
        paymentDate: paymentDateExportCell,
        month: inv.month,
        discounts: discounts,
        subtotal: subtotal,
        total: total,
        status: status
      });
    });
    ws.getRow(1).font = { bold: true };

    wb.xlsx.writeBuffer().then((buf) => {
      saveAs(new Blob([buf]), "Historial_Facturas.xlsx");
    });
  }

  function removeOne(id: string) {
    const next = all.filter((i) => i.id !== id);
    setAll(next);
    saveInvoices(next);
  }

  function clearAll() {
    if (!confirm("¿Borrar todo el historial? Esta acción no se puede deshacer.")) return;
    setAll([]);
    saveInvoices([]);
  }

  async function generatePdfFromHistory(inv: Invoice) {
    try {
      // Validar que el invoice tenga items
      if (!inv.items || inv.items.length === 0) {
        showToast("Esta factura no tiene ítems cargados. No se puede generar el PDF.", "error");
        return;
      }

      // Buscar el cliente completo por nombre
      const clientsResponse = await getClients();
      const clients = clientsResponse.clients ?? [];
      const client = clients.find((c) => c.name === inv.clientName);
      
      if (!client) {
        showToast(`No se encontró el cliente "${inv.clientName}" en la base de datos.`, "error");
        return;
      }

      // Cargar el logo
      let logoBase64: string | undefined;
      try {
        logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
      } catch (err) {
        console.warn("No se pudo cargar el logo:", err);
        // Continuar sin logo
      }

      // Convertir la fecha del string a Date
      // La fecha puede estar en formato localizado (ej: "11/2/2026") o ISO
      let invoiceDate: Date;
      if (inv.date.includes("/")) {
        // Formato localizado: DD/MM/YYYY o M/D/YYYY
        const parts = inv.date.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Los meses en Date son 0-indexed
          const year = parseInt(parts[2], 10);
          invoiceDate = new Date(year, month, day);
        } else {
          invoiceDate = new Date(inv.date);
        }
      } else {
        invoiceDate = new Date(inv.date);
      }

      // Validar que la fecha sea válida
      if (isNaN(invoiceDate.getTime())) {
        console.warn("Fecha inválida, usando fecha actual");
        invoiceDate = new Date();
      }

      // Validar y asegurar que los items tengan la estructura correcta
      const validItems = inv.items.map((item) => {
        // Asegurar que serviceKey existe, si no, intentar inferirlo desde serviceName
        let serviceKey: "A" | "B" | "C" = item.serviceKey || "A";
        if (!item.serviceKey && item.serviceName) {
          // Intentar inferir desde el nombre del servicio
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

      // Generar el PDF
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

      // Guardar el PDF
      const safeName = client.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
      doc.save(`${inv.number}_${safeName}.pdf`);
      showToast("PDF generado correctamente.", "success");
    } catch (error) {
      console.error("Error al generar PDF:", error);
      showToast(`Error al generar el PDF: ${error instanceof Error ? error.message : "Error desconocido"}`, "error");
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Historial" />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="card rounded-0 p-3 mb-3">
          <h6 className="fw-bold mb-3 border-bottom pb-2">🔍 Filtros</h6>
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
              <label className="form-label small fw-bold">Tipo</label>
              <select
                className="form-select form-select-sm"
                value={qType}
                onChange={(e) => setQType(e.target.value as "" | ComprobanteType)}
              >
                <option value="">Todos</option>
                <option value="Factura">Factura</option>
                <option value="Recibo">Recibo</option>
                <option value="Nota de Crédito">Nota de Crédito</option>
              </select>
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
                  setQType("");
                  setQMonth("");
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
          </div>
        </div>

        <div className="card rounded-0 p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-bold m-0">📄 Listado{user && !canExportData && !canDelete ? " (solo consulta)" : ""}</h6>
            <div className="d-flex gap-2">
              {canExportData && (
              <button className="btn btn-success btn-sm" onClick={exportExcel}>
                📊 Excel
              </button>
            )}
              {canDelete && (
              <button className="btn btn-danger btn-sm" onClick={clearAll}>
                🗑️ Limpiar todo
              </button>
            )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm align-middle" style={{ fontSize: "0.85rem" }}>
              <thead className="table-dark">
                <tr>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Fecha Emisión</th>
                  <th>Hora Emisión</th>
                  <th>Fecha Vencimiento</th>
                  <th>Fecha Pago</th>
                  <th>Mes</th>
                  <th className="text-end">Total (S/Desc)</th>
                  <th className="text-end">Descuento</th>
                  <th className="text-end">Total</th>
                  <th className="text-center">Estado</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center text-muted py-4">
                      <small>No hay facturas registradas</small>
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    // Calcular fecha de vencimiento si no existe (para facturas antiguas)
                    const dueDate = inv.dueDate || calculateDueDate(inv.date);
                    // Aplicar signo negativo a las Notas de Crédito y Recibos relacionados con facturas
                    const isNegativeType = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
                    const subtotal = isNegativeType ? -(Math.abs(inv.subtotal) || 0) : (inv.subtotal || 0);
                    // Descuento: negativo para Facturas, positivo para Recibos, negativo para Notas de Crédito
                    let discounts: number;
                    if (inv.type === "Factura") {
                      discounts = -(Math.abs(inv.discounts) || 0);
                    } else if (inv.type === "Recibo") {
                      discounts = Math.abs(inv.discounts) || 0;
                    } else {
                      // Nota de Crédito
                      discounts = -(Math.abs(inv.discounts) || 0);
                    }
                    const total = isNegativeType ? -(Math.abs(inv.total) || 0) : (inv.total || 0);

                    // Fecha de pago: Factura = fecha del Recibo si pagada, "Cancelada" si cancelada por NC, sino "Pendiente"; NC = fecha emisión
                    const relatedReciboForPayment = inv.type === "Factura" ? all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id) : null;
                    const relatedNCForPayment = inv.type === "Factura" ? all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id) : null;
                    const paymentDateDisplay = (inv.type === "Factura" && relatedReciboForPayment?.paymentDate) ? relatedReciboForPayment.paymentDate : inv.paymentDate;
                    let paymentDateCell: string;
                    if (inv.type === "Factura") {
                      if (relatedReciboForPayment?.paymentDate) paymentDateCell = new Date(relatedReciboForPayment.paymentDate).toLocaleDateString();
                      else if (relatedNCForPayment) paymentDateCell = "Cancelada";
                      else paymentDateCell = "Pendiente";
                    } else if (inv.type === "Nota de Crédito") {
                      paymentDateCell = inv.date || (inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-");
                    } else {
                      paymentDateCell = paymentDateDisplay ? new Date(paymentDateDisplay).toLocaleDateString() : "-";
                    }
                    // Verificar si la operación está cerrada (factura con recibo relacionado, factura cancelada por NC, o recibo/NC con factura relacionada)
                    let isClosed = false;
                    let isCancelledByNC = false;
                    if (inv.type === "Factura") {
                      // Buscar si existe un recibo relacionado con esta factura
                      const hasReceipt = all.some((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
                      // Buscar si existe exactamente UNA Nota de Crédito relacionada con esta factura (no múltiples)
                      const creditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.id);
                      const hasCreditNote = creditNotes.length === 1; // Solo una NC válida
                      isClosed = hasReceipt || hasCreditNote;
                      isCancelledByNC = hasCreditNote;
                    } else if (inv.type === "Recibo" && inv.relatedInvoiceId) {
                      // Si es un recibo con factura relacionada, está cerrado
                      isClosed = true;
                    } else if (inv.type === "Nota de Crédito" && inv.relatedInvoiceId) {
                      // Verificar que sea la única NC para esa factura
                      const otherNCs = all.filter((nc) => nc.type === "Nota de Crédito" && nc.relatedInvoiceId === inv.relatedInvoiceId && nc.id !== inv.id);
                      // Solo mostrar check si es la única NC para esa factura
                      if (otherNCs.length === 0) {
                        isClosed = true;
                        isCancelledByNC = true;
                      }
                    }
                    return (
                      <tr key={inv.id}>
                        <td className="fw-bold">{inv.number}</td>
                        <td>{inv.type}</td>
                        <td>{inv.clientName}</td>
                        <td>{inv.date}</td>
                        <td>{inv.emissionTime || "-"}</td>
                        <td>{dueDate}</td>
                        <td>{paymentDateCell}</td>
                        <td>{inv.month}</td>
                        <td className="text-end">{formatCurrency(subtotal)}</td>
                        <td className="text-end">{formatCurrency(discounts)}</td>
                        <td className="text-end fw-bold">{formatCurrency(total)}</td>
                        <td className="text-center">
                          {isClosed ? (
                            isCancelledByNC ? (
                              <span className="badge" style={{ fontSize: "0.75rem", padding: "0.15rem 0.3rem", borderRadius: "50%", width: "1.3rem", height: "1.3rem", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "#004085", color: "#fff" }} title={inv.type === "Nota de Crédito" ? "Nota de Crédito que cancela factura" : "Factura cancelada con Nota de Crédito"}>
                                ✓
                              </span>
                            ) : (
                              <span className="badge bg-success" style={{ fontSize: "0.75rem", padding: "0.15rem 0.3rem", borderRadius: "50%", width: "1.3rem", height: "1.3rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Operación cerrada - Cliente pagó">
                                ✓
                              </span>
                            )
                          ) : inv.type === "Factura" ? (
                            <span style={{ fontSize: "1.4rem", padding: "0.2rem 0.4rem", borderRadius: "50%", width: "1.5rem", height: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", color: "#ffc107", margin: "0 auto", marginTop: "-0.3rem" }} title="Factura pendiente de pago">
                              ⚠️
                            </span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: "0.875rem" }}>-</span>
                          )}
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
                          {canDelete && (
                            <button 
                              className="btn btn-danger btn-sm" 
                              onClick={() => removeOne(inv.id)}
                              style={{ width: "1.3rem", height: "1.3rem", padding: 0, fontSize: "1.1rem", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row mt-4 g-3 historial-stats">
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-primary" />
              <div className="stat-label">Total facturas</div>
              <div className="stat-value text-primary">{stats.facturas}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-success" />
              <div className="stat-label">Total recibos</div>
              <div className="stat-value text-success">{stats.recibos}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-warning" />
              <div className="stat-label">Notas de crédito</div>
              <div className="stat-value text-warning">{stats.notasCredito}</div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-dark" />
              <div className="stat-label">Facturación total</div>
              <div className="stat-value text-dark">{stats.facturacionTotal.toFixed(2)} <span className="currency">USD</span></div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Cobros pendientes</div>
              <div className="stat-value text-danger">{stats.cobrosPendientes.toFixed(2)} <span className="currency">USD</span></div>
            </div>
          </div>
          <div className="col-6 col-md-2">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-success" />
              <div className="stat-label">Cobros realizados</div>
              <div className="stat-value text-success">{stats.cobrosRealizados.toFixed(2)} <span className="currency">USD</span></div>
            </div>
          </div>
        </div>
        <div className="row mt-3 g-3 historial-stats">
          <div className="col-12">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-info" />
              <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap">
                <span className="stat-label mb-0">Registros en historial</span>
                <span className="stat-value text-info mb-0">{stats.registros}</span>
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
                    const relatedRecibo = all.find((r) => r.type === "Recibo" && r.relatedInvoiceId === inv.id);
                    const relatedNC = all.find((n) => n.type === "Nota de Crédito" && n.relatedInvoiceId === inv.id);
                    const relatedFactura = inv.relatedInvoiceId ? all.find((f) => f.id === inv.relatedInvoiceId) : null;
                    return (
                      <>
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4"><strong>Número:</strong> {inv.number}</div>
                          <div className="col-md-4"><strong>Tipo:</strong> {inv.type}</div>
                          <div className="col-md-4"><strong>Cliente:</strong> {inv.clientName}</div>
                          <div className="col-md-4"><strong>Fecha emisión:</strong> {inv.date}</div>
                          <div className="col-md-4"><strong>Hora emisión:</strong> {inv.emissionTime || "-"}</div>
                          <div className="col-md-4"><strong>Fecha vencimiento:</strong> {dueDate}</div>
                          <div className="col-md-4"><strong>Fecha pago:</strong> {inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : "-"}</div>
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
                        {inv.type === "Factura" && relatedRecibo && (
                          <div className="rounded p-3" style={{ backgroundColor: "#d1e7dd", border: "1px solid #0f5132" }}>
                            <strong style={{ color: "#0f5132" }}>✓ Ya fue pagada</strong>
                            <div className="mt-1 small" style={{ color: "#0f5132" }}>
                              Recibo de pago: <strong>{relatedRecibo.number}</strong>
                              {relatedRecibo.paymentDate && (
                                <> — Fecha de pago: <strong>{new Date(relatedRecibo.paymentDate).toLocaleDateString()}</strong></>
                              )}
                            </div>
                          </div>
                        )}
                        {inv.type === "Factura" && relatedNC && (
                          <div className="rounded p-3" style={{ backgroundColor: "#e7f1ff", border: "1px solid #004085" }}>
                            <strong style={{ color: "#004085" }}>✓ Factura cancelada</strong>
                            <div className="mt-1 small" style={{ color: "#004085" }}>
                              Nota de Crédito: <strong>{relatedNC.number}</strong>
                              {relatedNC.date && <> — Emisión: <strong>{relatedNC.date}</strong></>}
                            </div>
                          </div>
                        )}
                        {inv.type === "Factura" && !relatedRecibo && !relatedNC && (
                          <div className="rounded p-3" style={{ backgroundColor: "#fff3cd", border: "1px solid #856404" }}>
                            <strong style={{ color: "#856404" }}>Pendiente de Pago</strong>
                          </div>
                        )}
                        {inv.type === "Recibo" && inv.paymentDate && (
                          <div className="rounded p-3 mb-2" style={{ backgroundColor: "#d1e7dd", border: "1px solid #0f5132" }}>
                            <strong style={{ color: "#0f5132" }}>✓ Ya está pagado</strong>
                            <div className="mt-1 small" style={{ color: "#0f5132" }}>
                              Fecha de pago: <strong>{new Date(inv.paymentDate).toLocaleDateString()}</strong>
                            </div>
                          </div>
                        )}
                        {inv.type === "Recibo" && relatedFactura && (
                          <div className="border rounded p-3 bg-light small">
                            <strong>Factura relacionada:</strong> {relatedFactura.number}
                            {relatedFactura.date && <> — Emisión: {relatedFactura.date}</>}
                          </div>
                        )}
                        {inv.type === "Nota de Crédito" && relatedFactura && (
                          <div className="rounded p-3" style={{ backgroundColor: "#e7f1ff", border: "1px solid #004085" }}>
                            <strong style={{ color: "#004085" }}>✓ Factura cancelada</strong>
                            <div className="mt-1 small" style={{ color: "#004085" }}>
                              Factura: <strong>{relatedFactura.number}</strong>
                              {relatedFactura.date && <> — Emisión: <strong>{relatedFactura.date}</strong></>}
                            </div>
                          </div>
                        )}
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

