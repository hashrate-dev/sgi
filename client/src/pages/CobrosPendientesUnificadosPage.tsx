import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { clientName2ForComprobante } from "../lib/clientInvoiceDisplay";
import { getClients, getInvoiceById, getInvoices, wakeUpBackend } from "../lib/api";
import { fetchAsicInvoiceLedger, mapApiInvoiceToInvoice } from "../lib/asicInvoiceLedger";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { prepareLineItemsForPdf } from "../lib/prepareLineItemsForPdf";
import { invoiceCollectionState } from "../lib/invoiceCollection";
import { isAsicEquipmentSaleInvoice, resolveAsicInvoiceDocumentContext } from "../lib/asicDocumentKind";
import { buildAsicComprobantePdfFilenameResolved } from "../lib/asicPdfFilename";
import { sgiHome } from "../lib/marketplacePaths.js";
import type { Invoice, LineItem } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canExport } from "../lib/auth";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

const EPSILON = 0.0001;
const PAGE_SIZE = 25;

type CobroOrigen = "hosting" | "asic";

type UnifiedPending = {
  origen: CobroOrigen;
  invoice: Invoice;
  originalTotal: number;
  creditApplied: number;
  paidApplied: number;
  pendingAmount: number;
};

function calculateDueDate(dateStr: string): string {
  try {
    let date: Date;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        date = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return "-";
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate.toLocaleDateString();
  } catch {
    return "-";
  }
}

function parseInvoiceDate(dateStr: string): Date {
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function invoiceMonthKey(raw: string | undefined): string {
  const t = String(raw ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}`;
  return t.slice(0, 7);
}

function pendingsFromLedger(all: Invoice[], origen: CobroOrigen): UnifiedPending[] {
  const facturas = all.filter((inv) => {
    if (inv.type !== "Factura") return false;
    if (inv.source && inv.source !== origen) return false;
    if (origen === "asic" && isAsicEquipmentSaleInvoice(inv)) return false;
    return true;
  });
  return facturas
    .map((factura) => {
      const st = invoiceCollectionState(factura, all);
      return {
        origen,
        invoice: factura,
        originalTotal: st.originalTotal,
        creditApplied: st.creditApplied,
        paidApplied: st.paidApplied,
        pendingAmount: st.pendingAmount,
      };
    })
    .filter((row) => row.pendingAmount > EPSILON);
}

export function CobrosPendientesUnificadosPage() {
  const { user } = useAuth();
  const canSeeHosting = canUserAccessNavPath(user, "/hosting/pending");
  const canSeeAsic = canUserAccessNavPath(user, "/asic/pending");
  const canSeePage = canUserAccessNavPath(user, "/gestion-administrativa/cobros-pendientes") || canSeeHosting || canSeeAsic;
  const canExportData = user ? canExport(user) : false;

  const [hostingAll, setHostingAll] = useState<Invoice[]>([]);
  const [asicAll, setAsicAll] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [qClient, setQClient] = useState("");
  const [qMonth, setQMonth] = useState("");
  const [qOrigen, setQOrigen] = useState<"todos" | CobroOrigen>("todos");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<UnifiedPending | null>(null);

  const fetchDocuments = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    const jobs: Array<Promise<void>> = [];
    if (canSeeHosting) {
      jobs.push(
        wakeUpBackend()
          .then(() => getInvoices({ source: "hosting" }))
          .then((r) => {
            setHostingAll((r.invoices ?? []).map(mapApiInvoiceToInvoice));
          })
      );
    } else {
      setHostingAll([]);
    }
    if (canSeeAsic) {
      jobs.push(
        fetchAsicInvoiceLedger().then((list) => {
          setAsicAll(list);
        })
      );
    } else {
      setAsicAll([]);
    }
    Promise.all(jobs)
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : "Error al cargar cobros pendientes");
        if (canSeeHosting) setHostingAll([]);
        if (canSeeAsic) setAsicAll([]);
      })
      .finally(() => setLoading(false));
  }, [canSeeHosting, canSeeAsic]);

  useEffect(() => {
    if (!canSeePage) return;
    fetchDocuments();
  }, [canSeePage, fetchDocuments]);

  useEffect(() => {
    const onEmitted = () => fetchDocuments();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchDocuments();
    };
    window.addEventListener("hrs-emitted-changed", onEmitted);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("hrs-emitted-changed", onEmitted);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchDocuments]);

  const pendingAll = useMemo(() => {
    const rows = [
      ...(canSeeHosting ? pendingsFromLedger(hostingAll, "hosting") : []),
      ...(canSeeAsic ? pendingsFromLedger(asicAll, "asic") : []),
    ];
    return rows.sort((a, b) => {
      const da = parseInvoiceDate(a.invoice.date).getTime();
      const db = parseInvoiceDate(b.invoice.date).getTime();
      if (db !== da) return db - da;
      return b.pendingAmount - a.pendingAmount;
    });
  }, [hostingAll, asicAll, canSeeHosting, canSeeAsic]);

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return pendingAll.filter((row) => {
      const okOrigen = qOrigen === "todos" || row.origen === qOrigen;
      const okClient = !client || row.invoice.clientName.toLowerCase().includes(client);
      const okMonth = !qMonth || invoiceMonthKey(row.invoice.month) === qMonth;
      return okOrigen && okClient && okMonth;
    });
  }, [pendingAll, qClient, qMonth, qOrigen]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [filtered.length, qOrigen]);

  const stats = useMemo(() => {
    const hosting = filtered.filter((r) => r.origen === "hosting");
    const asic = filtered.filter((r) => r.origen === "asic");
    return {
      total: filtered.length,
      monto: filtered.reduce((s, r) => s + r.pendingAmount, 0),
      hostingN: hosting.length,
      hostingMonto: hosting.reduce((s, r) => s + r.pendingAmount, 0),
      asicN: asic.length,
      asicMonto: asic.reduce((s, r) => s + r.pendingAmount, 0),
    };
  }, [filtered]);

  if (!user || !canSeePage) {
    return <Navigate to={sgiHome()} replace />;
  }

  function exportExcel() {
    if (filtered.length === 0) {
      showToast("No hay cobros pendientes para exportar.", "warning", "Cobros pendientes");
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cobros pendientes");
    ws.columns = [
      { header: "Origen", key: "origen", width: 12 },
      { header: "Número", key: "number", width: 14 },
      { header: "Cliente", key: "clientName", width: 30 },
      { header: "Fecha Emisión", key: "date", width: 18 },
      { header: "Hora Emisión", key: "emissionTime", width: 12 },
      { header: "Fecha Vencimiento", key: "dueDate", width: 18 },
      { header: "Total Factura", key: "total", width: 14 },
      { header: "NC Aplicada", key: "creditApplied", width: 14 },
      { header: "Cobros", key: "paidApplied", width: 12 },
      { header: "Saldo Pendiente", key: "pendingAmount", width: 16 },
    ];
    filtered.forEach((row) => {
      ws.addRow({
        origen: row.origen === "hosting" ? "HOSTING" : "ASIC",
        number: row.invoice.number,
        clientName: row.invoice.clientName,
        date: row.invoice.date,
        emissionTime: row.invoice.emissionTime || "-",
        dueDate: row.invoice.dueDate || calculateDueDate(row.invoice.date),
        total: row.originalTotal.toFixed(2),
        creditApplied: row.creditApplied.toFixed(2),
        paidApplied: row.paidApplied.toFixed(2),
        pendingAmount: row.pendingAmount.toFixed(2),
      });
    });
    wb.xlsx.writeBuffer().then((buffer) => {
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buffer]), `Todos_los_Cobros_Pendientes_${fecha}.xlsx`);
      showToast("Excel exportado correctamente.", "success", "Cobros pendientes");
    });
  }

  async function generatePdf(row: UnifiedPending) {
    try {
      const id = Number(row.invoice.id);
      if (!Number.isFinite(id) || id < 1) {
        showToast("No se pudo identificar la factura para el PDF.", "error", "Cobros pendientes");
        return;
      }
      const full = await getInvoiceById(id);
      const inv = full.invoice;
      const items: LineItem[] = (inv.items ?? []).map((it) => ({
        service: it.service,
        serviceName: it.service,
        month: it.month,
        quantity: it.quantity,
        price: it.price,
        discount: it.discount,
      }));
      if (items.length === 0) {
        showToast("Esta factura no tiene ítems cargados. No se puede generar el PDF.", "error", "Cobros pendientes");
        return;
      }
      const clientsResponse = await getClients();
      const clients = clientsResponse.clients ?? [];
      const client = clients.find((c) => c.name === inv.clientName);
      if (!client) {
        showToast(`No se encontró el cliente "${inv.clientName}" en la base de datos.`, "error", "Cobros pendientes");
        return;
      }
      let logoBase64: string | undefined;
      try {
        logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
      } catch {
        logoBase64 = undefined;
      }
      const invoiceForPdf: Invoice = {
        ...row.invoice,
        items,
        documentContext: inv.documentContext ?? row.invoice.documentContext,
      };
      const validItems = prepareLineItemsForPdf(items, inv.month);
      const doc = generateFacturaPdf(
        {
          number: inv.number,
          type: inv.type as Invoice["type"],
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
          date: parseInvoiceDate(inv.date),
          items: validItems,
          subtotal: inv.subtotal || 0,
          discounts: inv.discounts || 0,
          total: inv.total || 0,
          documentContext:
            row.origen === "asic" ? resolveAsicInvoiceDocumentContext(invoiceForPdf) : inv.documentContext,
        },
        { logoBase64 }
      );
      if (row.origen === "asic") {
        doc.save(
          await buildAsicComprobantePdfFilenameResolved({
            number: inv.number,
            clientName: client.name,
            type: inv.type as Invoice["type"],
            items: validItems,
            documentContext: resolveAsicInvoiceDocumentContext(invoiceForPdf),
          })
        );
      } else {
        const safeName = client.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente";
        doc.save(`${inv.number}_${safeName}.pdf`);
      }
      showToast("PDF generado correctamente.", "success", "Cobros pendientes");
    } catch (error) {
      showToast(
        `Error al generar el PDF: ${error instanceof Error ? error.message : "Error desconocido"}`,
        "error",
        "Cobros pendientes"
      );
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Todos los Cobros Pendientes"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver a Gestión Administrativa"
        />

        {fetchError && (
          <div className="alert alert-warning mb-3">
            {fetchError} —{" "}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={fetchDocuments}>
              Reintentar
            </button>
          </div>
        )}

        <div className="hrs-card hrs-card--rect p-4">
          <p className="text-muted small mb-3">
            Reúne el saldo real de cobro (factura − NC − recibos, incluidos parciales). El comprobante de pago de equipos
            ASIC no entra: se cierra al emitir.
            {canSeeHosting ? (
              <>
                {" "}
                <Link to="/hosting/pending">Pendientes Hosting</Link>
              </>
            ) : null}
            {canSeeHosting && canSeeAsic ? " · " : null}
            {canSeeAsic ? <Link to="/asic/pending">Pendientes ASIC</Link> : null}
          </p>

          <div className="pendientes-filtros-outer">
            <div className="pendientes-filtros-container">
              <div className="card pendientes-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2">
                  {canSeeHosting && canSeeAsic ? (
                    <div className="col-md-3">
                      <label className="form-label small fw-bold">Origen</label>
                      <select
                        className="form-select form-select-sm"
                        value={qOrigen}
                        onChange={(e) => setQOrigen(e.target.value as "todos" | CobroOrigen)}
                      >
                        <option value="todos">Todos</option>
                        <option value="hosting">Hosting</option>
                        <option value="asic">ASIC</option>
                      </select>
                    </div>
                  ) : null}
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
                        setQOrigen("todos");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  {canExportData ? (
                    <div className="col-md-auto d-flex align-items-end ms-auto">
                      <button
                        className="btn btn-outline-secondary btn-sm pendientes-export-excel-btn"
                        style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }}
                        onClick={exportExcel}
                      >
                        📊 Exportar Excel
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="pendientes-listado-wrap">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">📄 Cobros pendientes{user && !canExportData ? " (solo consulta)" : ""}</h6>
            </div>
            <div className="table-responsive pendientes-facturas-table-scroll">
              <table className="table table-sm align-middle pendientes-facturas-table">
                <thead className="table-dark">
                  <tr>
                    <th className="text-start">Origen</th>
                    <th className="text-start">N°</th>
                    <th className="text-start">Cliente</th>
                    <th className="text-start">Mes</th>
                    <th className="text-start">F. emisión</th>
                    <th className="text-start">Hora</th>
                    <th className="text-start">F. venc.</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">NC</th>
                    <th className="text-end">Cobros</th>
                    <th className="text-end">Saldo</th>
                    <th className="text-center">Est.</th>
                    <th className="text-center">Acc.</th>
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
                        <small>
                          {pendingAll.length === 0
                            ? "No hay cobros pendientes de Hosting ni ASIC."
                            : "No se encontraron cobros con los filtros aplicados."}
                        </small>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => {
                      const dueDate = row.invoice.dueDate || calculateDueDate(row.invoice.date);
                      return (
                        <tr key={`${row.origen}-${row.invoice.id}`}>
                          <td className="text-start">
                            <span className={`badge ${row.origen === "hosting" ? "bg-success" : "bg-primary"}`}>
                              {row.origen === "hosting" ? "HOSTING" : "ASIC"}
                            </span>
                          </td>
                          <td className="fw-bold text-start">{row.invoice.number}</td>
                          <td className="text-start" title={row.invoice.clientName}>
                            {row.invoice.clientName}
                          </td>
                          <td className="text-start">{invoiceMonthKey(row.invoice.month) || "—"}</td>
                          <td className="text-start">{row.invoice.date}</td>
                          <td className="text-start">{row.invoice.emissionTime || "—"}</td>
                          <td className="text-start">{dueDate}</td>
                          <td className="text-end">{formatCurrencyNumber(row.originalTotal)}</td>
                          <td className="text-end text-info">−{formatCurrencyNumber(row.creditApplied)}</td>
                          <td className="text-end text-primary">−{formatCurrencyNumber(row.paidApplied)}</td>
                          <td className="text-end fw-bold text-danger">{formatCurrencyNumber(row.pendingAmount)}</td>
                          <td className="text-center">
                            <span title="Pendiente de cobro" aria-label="Pendiente de cobro">
                              ⚠️
                            </span>
                          </td>
                          <td className="text-center">
                            <div className="d-flex gap-1 justify-content-center align-items-center flex-nowrap historial-acciones-btns">
                              <button
                                type="button"
                                className="btn btn-sm border historial-accion-btn"
                                onClick={() => setDetail(row)}
                                title="Ver detalles"
                              >
                                ℹ️
                              </button>
                              <button
                                type="button"
                                className="fact-btn fact-btn-primary btn-sm historial-accion-btn"
                                onClick={() => void generatePdf(row)}
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
            {filtered.length > PAGE_SIZE ? (
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1 historial-pagination">
                <span className="text-muted small">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}{" "}
                  operaciones
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
            ) : null}
          </div>
        </div>

        <div className="row mt-4 g-3 historial-stats">
          <div className="col-6 col-md-3">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Total operaciones</div>
              <div className="stat-value text-danger">{stats.total}</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card stat-card p-3">
              <div className="stat-accent bg-danger" />
              <div className="stat-label">Monto unificado</div>
              <div className="stat-value text-danger">
                {formatCurrencyNumber(stats.monto)} <span className="currency">USD</span>
              </div>
            </div>
          </div>
          {canSeeHosting ? (
            <div className="col-6 col-md-3">
              <div className="card stat-card p-3">
                <div className="stat-accent bg-success" />
                <div className="stat-label">Hosting ({stats.hostingN})</div>
                <div className="stat-value">
                  {formatCurrencyNumber(stats.hostingMonto)} <span className="currency">USD</span>
                </div>
              </div>
            </div>
          ) : null}
          {canSeeAsic ? (
            <div className="col-6 col-md-3">
              <div className="card stat-card p-3">
                <div className="stat-accent bg-primary" />
                <div className="stat-label">ASIC ({stats.asicN})</div>
                <div className="stat-value">
                  {formatCurrencyNumber(stats.asicMonto)} <span className="currency">USD</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {detail ? (
          <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Detalle del cobro pendiente</h5>
                  <button type="button" className="btn-close" onClick={() => setDetail(null)} aria-label="Cerrar" />
                </div>
                <div className="modal-body">
                  <div className="row g-2 small mb-3">
                    <div className="col-md-4">
                      <strong>Origen:</strong> {detail.origen === "hosting" ? "HOSTING" : "ASIC"}
                    </div>
                    <div className="col-md-4">
                      <strong>Número:</strong> {detail.invoice.number}
                    </div>
                    <div className="col-md-4">
                      <strong>Cliente:</strong> {detail.invoice.clientName}
                    </div>
                    <div className="col-md-4">
                      <strong>Fecha emisión:</strong> {detail.invoice.date}
                    </div>
                    <div className="col-md-4">
                      <strong>Hora:</strong> {detail.invoice.emissionTime || "-"}
                    </div>
                    <div className="col-md-4">
                      <strong>Vencimiento:</strong> {detail.invoice.dueDate || calculateDueDate(detail.invoice.date)}
                    </div>
                    <div className="col-md-4">
                      <strong>Mes:</strong> {detail.invoice.month || "-"}
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-md-4 text-end">
                      <strong>Total factura:</strong> {formatCurrency(detail.originalTotal)}
                    </div>
                    <div className="col-md-4 text-end text-info">
                      <strong>NC:</strong> − {formatCurrency(detail.creditApplied)}
                    </div>
                    <div className="col-md-4 text-end text-primary">
                      <strong>Cobros:</strong> − {formatCurrency(detail.paidApplied)}
                    </div>
                    <div className="col-md-12 text-end text-danger">
                      <strong>Saldo pendiente:</strong> {formatCurrency(detail.pendingAmount)}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
