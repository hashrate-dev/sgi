import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { clientName2ForComprobante } from "../lib/clientInvoiceDisplay";
import { getClients, getInvoices, wakeUpBackend } from "../lib/api";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { prepareLineItemsForPdf } from "../lib/prepareLineItemsForPdf";
import type { Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canExport } from "../lib/auth";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

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

/** Compara si un comprobante (Recibo/NC) está vinculado a una factura. Usa id y number por robustez. */
function isLinkedToInvoice(comp: Invoice, factura: Invoice): boolean {
  const matchId = comp.relatedInvoiceId != null && String(comp.relatedInvoiceId) === String(factura.id);
  const matchNumber = comp.relatedInvoiceNumber != null && comp.relatedInvoiceNumber === factura.number;
  return matchId || matchNumber;
}

export function PendientesPage() {
  const { user } = useAuth();
  const [all, setAll] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [qClient, setQClient] = useState("");
  const [qMonth, setQMonth] = useState("");
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const canExportData = user ? canExport(user) : false;
  const EPSILON = 0.0001;

  function fetchDocuments() {
    setLoading(true);
    setFetchError(null);
    wakeUpBackend()
      .then(() => getInvoices({ source: "hosting" }))
      .then((r) => {
        const list = (r.invoices ?? []).map((inv) => ({
          id: String(inv.id),
          number: inv.number,
          type: inv.type as Invoice["type"],
          clientName: inv.clientName,
          date: inv.date,
          month: inv.month ?? "",
          subtotal: inv.subtotal,
          discounts: inv.discounts,
          total: inv.total,
          relatedInvoiceId: inv.relatedInvoiceId != null ? String(inv.relatedInvoiceId) : undefined,
          relatedInvoiceNumber: inv.relatedInvoiceNumber,
          paymentDate: inv.paymentDate,
          emissionTime: inv.emissionTime,
          dueDate: inv.dueDate,
          items: [],
        }));
        setAll(list);
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : "Error al cargar facturas");
        setAll([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    const onEmitted = (e: Event) => {
      const d = (e as CustomEvent).detail as { source?: string };
      if (d?.source === "hosting") fetchDocuments();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchDocuments();
    };
    window.addEventListener("hrs-emitted-changed", onEmitted);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("hrs-emitted-changed", onEmitted);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  type PendingInvoiceView = {
    invoice: Invoice;
    originalTotal: number;
    creditApplied: number;
    paidApplied: number;
    pendingAmount: number;
    creditNotes: Invoice[];
    receipts: Invoice[];
  };

  // Pendiente real = Factura - NC aplicadas - Recibos aplicados (permite mostrar facturas con NC parcial)
  const pendingInvoices = useMemo<PendingInvoiceView[]>(() => {
    const facturas = all.filter((inv) => inv.type === "Factura");
    return facturas
      .map((factura) => {
        const creditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && isLinkedToInvoice(nc, factura));
        const receipts = all.filter((r) => r.type === "Recibo" && isLinkedToInvoice(r, factura));
        const originalTotal = Math.abs(Number(factura.total) || 0);
        const creditApplied = creditNotes.reduce((s, nc) => s + Math.abs(Number(nc.total) || 0), 0);
        const paidApplied = receipts.reduce((s, r) => s + Math.abs(Number(r.total) || 0), 0);
        const pendingAmount = Math.max(0, originalTotal - creditApplied - paidApplied);
        return { invoice: factura, originalTotal, creditApplied, paidApplied, pendingAmount, creditNotes, receipts };
      })
      .filter((row) => row.pendingAmount > EPSILON);
  }, [all]);

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return pendingInvoices.filter((inv) => {
      const okClient = !client || inv.invoice.clientName.toLowerCase().includes(client);
      const okMonth = !qMonth || inv.invoice.month.startsWith(qMonth);
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
    const totalMontoPendiente = pendingInvoices.reduce((s, i) => s + i.pendingAmount, 0);
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
      { header: "Total (S/Desc)", key: "subtotal", width: 16 },
      { header: "Descuento", key: "discounts", width: 12 },
      { header: "Total Factura", key: "total", width: 14 },
      { header: "NC Aplicada", key: "creditApplied", width: 14 },
      { header: "Cobros", key: "paidApplied", width: 12 },
      { header: "Saldo Pendiente", key: "pendingAmount", width: 16 }
    ];

    filtered.forEach((inv) => {
      const dueDate = inv.invoice.dueDate || calculateDueDate(inv.invoice.date);
      ws.addRow({
        number: inv.invoice.number,
        clientName: inv.invoice.clientName,
        date: inv.invoice.date,
        emissionTime: inv.invoice.emissionTime || "-",
        dueDate: dueDate,
        subtotal: inv.invoice.subtotal.toFixed(2),
        discounts: inv.invoice.discounts.toFixed(2),
        total: inv.originalTotal.toFixed(2),
        creditApplied: inv.creditApplied.toFixed(2),
        paidApplied: inv.paidApplied.toFixed(2),
        pendingAmount: inv.pendingAmount.toFixed(2),
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

      const validItems = prepareLineItemsForPdf(inv.items, inv.month);

      const doc = generateFacturaPdf(
        {
          number: inv.number,
          type: inv.type,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          clientAddress: client.address,
          clientCity: client.city,
          clientName2: clientName2ForComprobante(client.name, client.name2),
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

        {fetchError && (
          <div className="alert alert-warning mb-3">
            {fetchError} — <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchDocuments}>Reintentar</button>
          </div>
        )}

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
                  <div className="col-md-2 d-flex align-items-end filtros-limpiar-col">
                    <button
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
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

          <div className="table-responsive pendientes-facturas-table-scroll">
            <table className="table table-sm align-middle pendientes-facturas-table">
              <colgroup>
                <col className="pendientes-col-num" />
                <col className="pendientes-col-cliente" />
                <col className="pendientes-col-fecha" />
                <col className="pendientes-col-hora" />
                <col className="pendientes-col-fecha" />
                <col className="pendientes-col-monto" />
                <col className="pendientes-col-monto" />
                <col className="pendientes-col-monto" />
                <col className="pendientes-col-monto" />
                <col className="pendientes-col-monto" />
                <col className="pendientes-col-monto pendientes-col-saldo" />
                <col className="pendientes-col-estado" />
                <col className="pendientes-col-acciones" />
              </colgroup>
              <thead className="table-dark">
                <tr>
                  <th className="text-start pendientes-col-num">N°</th>
                  <th className="text-start pendientes-col-cliente">Cliente</th>
                  <th className="text-start pendientes-col-fecha" title="Fecha de emisión">
                    F. emisión
                  </th>
                  <th className="text-start pendientes-col-hora" title="Hora de emisión">
                    Hora
                  </th>
                  <th className="text-start pendientes-col-fecha" title="Fecha de vencimiento">
                    F. venc.
                  </th>
                  <th className="text-end pendientes-col-monto" title="Total sin descuento">
                    Total s/desc
                  </th>
                  <th className="text-end pendientes-col-monto" title="Descuento">
                    Desc.
                  </th>
                  <th className="text-end pendientes-col-monto" title="Total factura">
                    Total
                  </th>
                  <th className="text-end pendientes-col-monto" title="Nota de crédito aplicada">
                    NC
                  </th>
                  <th className="text-end pendientes-col-monto" title="Cobros aplicados">
                    Cobros
                  </th>
                  <th className="text-end pendientes-col-monto pendientes-col-saldo" title="Saldo pendiente">
                    Saldo
                  </th>
                  <th className="text-center pendientes-col-estado" title="Estado">
                    Est.
                  </th>
                  <th className="text-center pendientes-col-acciones">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="text-center py-5">
                      <div className="spinner-border text-secondary" role="status" aria-label="Espere un momento" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center text-muted py-4">
                      <small>{pendingInvoices.length === 0 ? "No hay facturas pendientes de cobro." : "No se encontraron facturas con los filtros aplicados."}</small>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inv) => {
                    const dueDate = inv.invoice.dueDate || calculateDueDate(inv.invoice.date);
                    return (
                      <tr key={inv.invoice.id}>
                        <td className="fw-bold text-start pendientes-col-num">{inv.invoice.number}</td>
                        <td className="text-start pendientes-col-cliente" title={inv.invoice.clientName}>
                          <span className="pendientes-cliente-nombre">{inv.invoice.clientName}</span>
                        </td>
                        <td className="text-start pendientes-col-fecha">{inv.invoice.date}</td>
                        <td className="text-start pendientes-col-hora">{inv.invoice.emissionTime || "—"}</td>
                        <td className="text-start pendientes-col-fecha">{dueDate}</td>
                        <td className="text-end pendientes-col-monto pendientes-monto-cell">{formatCurrencyNumber(inv.invoice.subtotal)}</td>
                        <td className="text-end pendientes-col-monto pendientes-monto-cell">{formatCurrencyNumber(inv.invoice.discounts)}</td>
                        <td className="text-end pendientes-col-monto pendientes-monto-cell">{formatCurrencyNumber(inv.originalTotal)}</td>
                        <td className="text-end pendientes-col-monto pendientes-monto-cell text-info">
                          −{formatCurrencyNumber(inv.creditApplied)}
                        </td>
                        <td className="text-end pendientes-col-monto pendientes-monto-cell text-primary">
                          −{formatCurrencyNumber(inv.paidApplied)}
                        </td>
                        <td className="text-end pendientes-col-monto pendientes-col-saldo pendientes-monto-cell fw-bold text-danger">
                          {formatCurrencyNumber(inv.pendingAmount)}
                        </td>
                        <td className="text-center pendientes-col-estado">
                          <span
                            className="pendientes-estado-icon"
                            title="Factura pendiente de pago"
                            aria-label="Pendiente de pago"
                          >
                            ⚠️
                          </span>
                        </td>
                        <td className="text-center pendientes-col-acciones">
                          <div className="d-flex gap-1 justify-content-center align-items-center flex-nowrap historial-acciones-btns">
                            <button
                              type="button"
                              className="btn btn-sm border historial-accion-btn"
                              onClick={() => setDetailInvoice(inv.invoice)}
                              title="Ver detalles"
                            >
                              ℹ️
                            </button>
                            <button
                              type="button"
                              className="fact-btn fact-btn-primary btn-sm historial-accion-btn"
                              onClick={() => generatePdfFromHistory(inv.invoice)}
                              title="PDF"
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
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Total facturas pendientes</div>
              <div className="stat-value text-danger">{stats.totalPendientes}</div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Monto total pendiente</div>
              <div className="stat-value text-danger">
                {formatCurrencyNumber(stats.totalMontoPendiente)} <span className="currency">USD</span>
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
                    const relatedCreditNotes = all.filter((nc) => nc.type === "Nota de Crédito" && isLinkedToInvoice(nc, inv));
                    const relatedReceipts = all.filter((r) => r.type === "Recibo" && isLinkedToInvoice(r, inv));
                    const originalTotal = Math.abs(Number(inv.total) || 0);
                    const creditApplied = relatedCreditNotes.reduce((s, nc) => s + Math.abs(Number(nc.total) || 0), 0);
                    const paidApplied = relatedReceipts.reduce((s, r) => s + Math.abs(Number(r.total) || 0), 0);
                    const pendingAmount = Math.max(0, originalTotal - creditApplied - paidApplied);
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
                                    <td className="text-end">{formatCurrencyNumber(item.price)} USD</td>
                                    <td className="text-end">{formatCurrencyNumber(item.discount)} USD</td>
                                    <td className="text-end">{formatCurrencyNumber((item.quantity * item.price) - item.discount)} USD</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="row g-2 small mb-3">
                          <div className="col-md-4 text-end"><strong>Total (S/Desc):</strong> {formatCurrency(inv.subtotal)}</div>
                          <div className="col-md-4 text-end"><strong>Descuento:</strong> {formatCurrency(inv.discounts)}</div>
                          <div className="col-md-4 text-end"><strong>Total Factura:</strong> {formatCurrency(originalTotal)}</div>
                          <div className="col-md-4 text-end text-info"><strong>NC aplicada:</strong> - {formatCurrency(creditApplied)}</div>
                          <div className="col-md-4 text-end text-primary"><strong>Cobros aplicados:</strong> - {formatCurrency(paidApplied)}</div>
                          <div className="col-md-4 text-end text-danger"><strong>Saldo pendiente:</strong> {formatCurrency(pendingAmount)}</div>
                        </div>
                        <div className="alert alert-warning">
                          <strong>⚠️ Estado:</strong> Esta factura está pendiente de cobro con saldo neto (Factura - NC - Cobros).
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
