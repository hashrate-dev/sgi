import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getInvoices, wakeUpBackend } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

type InvoiceRow = {
  id: number;
  number: string;
  type: string;
  clientName: string;
  date: string;
  month: string;
  subtotal: number;
  discounts: number;
  total: number;
  source?: string;
  relatedInvoiceId?: number;
  relatedInvoiceNumber?: string;
  paymentDate?: string;
  emissionTime?: string;
  dueDate?: string;
};

function formatTimeNoSeconds(t: string | undefined): string {
  if (!t || t === "-") return "-";
  const parts = String(t).trim().split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return t;
}

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
    if (isNaN(date.getTime())) return "-";
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate.toLocaleDateString();
  } catch {
    return "-";
  }
}

function isLinkedToInvoice(comp: InvoiceRow, factura: InvoiceRow): boolean {
  const matchId = comp.relatedInvoiceId != null && String(comp.relatedInvoiceId) === String(factura.id);
  const matchNumber = comp.relatedInvoiceNumber != null && comp.relatedInvoiceNumber === factura.number;
  return matchId || matchNumber;
}

export function CuentaClienteDetallePage() {
  const [searchParams] = useSearchParams();
  const clientName = searchParams.get("cliente") ?? "";
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(() => {
    if (!clientName.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    wakeUpBackend()
      .then(() => getInvoices({ client: clientName }))
      .then((r) => {
        const list = (r.invoices ?? []).map((inv) => ({
          id: inv.id,
          number: inv.number,
          type: inv.type,
          clientName: inv.clientName,
          date: inv.date,
          month: inv.month,
          subtotal: inv.subtotal,
          discounts: inv.discounts,
          total: inv.total,
          source: inv.source ?? "hosting",
          relatedInvoiceId: inv.relatedInvoiceId,
          relatedInvoiceNumber: inv.relatedInvoiceNumber,
          paymentDate: inv.paymentDate,
          emissionTime: inv.emissionTime,
          dueDate: inv.dueDate,
        }));
        setInvoices(list);
      })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [clientName]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.type !== "Factura") return false;
      const hasReceipt = invoices.some((r) => r.type === "Recibo" && isLinkedToInvoice(r, inv));
      const hasCreditNote = invoices.some((nc) => nc.type === "Nota de Crédito" && isLinkedToInvoice(nc, inv));
      return !hasReceipt && !hasCreditNote;
    });
  }, [invoices]);

  const totals = useMemo(() => {
    let facturasHosting = 0;
    let ncHosting = 0;
    let facturasAsic = 0;
    let ncAsic = 0;
    let totalFacturas = 0;
    let totalRecibos = 0;
    let totalNC = 0;
    let totalPendiente = 0;
    let cobrosRealizados = 0;
    let countFacturas = 0;
    let countRecibos = 0;
    let countNC = 0;
    invoices.forEach((inv) => {
      const src = (inv.source ?? "hosting").toLowerCase();
      if (inv.type === "Factura") {
        countFacturas++;
        totalFacturas += inv.total;
        if (src === "hosting") facturasHosting += inv.total;
        else facturasAsic += inv.total;
      } else if (inv.type === "Recibo") {
        countRecibos++;
        totalRecibos += inv.total;
        if (inv.relatedInvoiceId || inv.relatedInvoiceNumber) cobrosRealizados += inv.total;
      } else if (inv.type === "Nota de Crédito") {
        countNC++;
        totalNC += inv.total;
        if (src === "hosting") ncHosting += Math.abs(inv.total ?? 0);
        else ncAsic += Math.abs(inv.total ?? 0);
      }
    });
    const totalHosting = facturasHosting - ncHosting;
    const totalAsic = facturasAsic - ncAsic;
    pendingInvoices.forEach((inv) => {
      totalPendiente += inv.total;
    });
    return {
      hosting: totalHosting,
      asic: totalAsic,
      general: totalHosting + totalAsic,
      facturas: totalFacturas,
      recibos: totalRecibos,
      nc: totalNC,
      pendiente: totalPendiente,
      cobrosRealizados,
      countFacturas,
      countRecibos,
      countNC,
    };
  }, [invoices, pendingInvoices]);

  const sortedInvoices = useMemo(() => {
    return [...invoices].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [invoices]);

  if (!clientName.trim()) {
    return (
      <div className="fact-page clientes-page cuenta-cliente-page">
        <div className="container">
          <PageHeader title="Detalle de cuenta" showBackButton backTo="/cuenta-cliente" backText="Volver al directorio" />
          <div className="text-center text-muted py-5">
            <p className="mb-1">No se especificó un cliente.</p>
            <Link to="/cuenta-cliente">Volver al directorio de clientes</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page clientes-page cuenta-cliente-page">
      <div className="container">
        <PageHeader
          title={`Cuenta: ${clientName}`}
          showBackButton
          backTo="/cuenta-cliente"
          backText="Volver al directorio"
        />
      </div>

      <div className="container">
        <div className="hrs-card hrs-card--rect p-4 mt-4">
          <div className="historial-listado-wrap historial-listado-outer">
            {invoices.length === 0 && !loading ? (
              <div className="text-center text-muted py-5">
                <p className="mb-1">No se encontraron movimientos para &quot;{clientName}&quot;</p>
                <small>Verificá el nombre del cliente o probá con parte del nombre.</small>
                <div className="mt-3">
                  <Link to="/cuenta-cliente" className="btn btn-sm btn-outline-secondary">Volver al directorio</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold m-0">📄 Listado de documentos ({invoices.length})</h6>
                </div>
                <p className="text-muted small mb-3">Detalle histórico de movimientos por cliente (Hosting + ASIC).</p>

                {loading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-secondary" role="status" aria-label="Espere un momento" />
                  </div>
                ) : invoices.length > 0 ? (
                  <>
                    <div className="row g-3 mb-4 historial-stats">
                      <div className="col-6 col-md-3">
                        <div className="card stat-card p-3">
                          <div className="stat-accent" style={{ backgroundColor: "#0d5d35" }} />
                          <div className="stat-label">Total Hosting</div>
                          <div className="stat-value" style={{ color: "#0d5d35" }}>{formatCurrencyNumber(totals.hosting)} <span className="currency">USD</span></div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="card stat-card p-3">
                          <div className="stat-accent" style={{ backgroundColor: "#6b7280" }} />
                          <div className="stat-label">Total ASIC</div>
                          <div className="stat-value" style={{ color: "#6b7280" }}>{formatCurrencyNumber(totals.asic)} <span className="currency">USD</span></div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="card stat-card p-3">
                          <div className="stat-accent" style={{ backgroundColor: "#2563eb" }} />
                          <div className="stat-label">Total general</div>
                          <div className="stat-value" style={{ color: "#2563eb" }}>{formatCurrencyNumber(totals.general)} <span className="currency">USD</span></div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="card stat-card p-3">
                          <div className="stat-accent bg-danger" />
                          <div className="stat-label">Pendiente de pago</div>
                          <div className="stat-value text-danger">
                            {formatCurrencyNumber(totals.pendiente)} <span className="currency">USD</span>
                          </div>
                          {totals.pendiente > 0 && <small className="text-muted d-block mt-1">Facturas sin recibo ni NC</small>}
                        </div>
                      </div>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-sm align-middle historial-listado-table" style={{ fontSize: "0.85rem" }}>
                        <thead className="table-dark">
                          <tr>
                            <th className="text-start historial-col-origen">Origen</th>
                            <th className="text-start historial-col-num">N°</th>
                            <th className="text-start historial-col-tipo">Tipo</th>
                            <th className="text-start historial-col-cliente">Cliente</th>
                            <th className="text-start historial-col-fecha-emision">Fecha<br />Emisión</th>
                            <th className="text-start historial-col-hora">Hora<br />Emisión</th>
                            <th className="text-start historial-col-fecha-venc">Fecha<br />Venc.</th>
                            <th className="text-start historial-col-fecha-pago">Fecha<br />Pago</th>
                            <th className="text-start historial-col-total-sdesc">Total<br />(S/Desc)</th>
                            <th className="text-start historial-col-total">Total</th>
                            <th className="text-start">Fact. relacionada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedInvoices.map((inv) => {
                            const dueDate = inv.dueDate || calculateDueDate(inv.date);
                            const hasNC = invoices.some((nc) => nc.type === "Nota de Crédito" && isLinkedToInvoice(nc, inv));
                            const relatedRecibo = invoices.find((r) => r.type === "Recibo" && isLinkedToInvoice(r, inv));
                            let paymentDateCell: string;
                            if (inv.type === "Factura") {
                              if (relatedRecibo?.paymentDate) paymentDateCell = relatedRecibo.paymentDate;
                              else if (hasNC) paymentDateCell = "Cancelada";
                              else paymentDateCell = "Pendiente";
                            } else if (inv.type === "Nota de Crédito") {
                              paymentDateCell = inv.date || (inv.paymentDate ?? "-");
                            } else {
                              paymentDateCell = inv.paymentDate ?? "-";
                            }
                            const isNegativeType = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && (inv.relatedInvoiceId || inv.relatedInvoiceNumber));
                            const subtotal = isNegativeType ? -(Math.abs(inv.subtotal) || 0) : (inv.subtotal || 0);
                            const total = isNegativeType ? -(Math.abs(inv.total) || 0) : (inv.total || 0);
                            return (
                              <tr key={inv.id}>
                                <td className="text-start small historial-col-origen">{(inv.source ?? "hosting").toUpperCase()}</td>
                                <td className="fw-bold text-start historial-col-num">{inv.number}</td>
                                <td className="text-start historial-col-tipo">{inv.type === "Nota de Crédito" ? "NC" : inv.type}</td>
                                <td className="text-start historial-col-cliente"><span className="historial-cliente-nombre">{inv.clientName}</span></td>
                                <td className="text-start historial-col-fecha-emision">{inv.date}</td>
                                <td className="text-start historial-col-hora">{formatTimeNoSeconds(inv.emissionTime)}</td>
                                <td className="text-start historial-col-fecha-venc">{dueDate}</td>
                                <td className="text-start historial-col-fecha-pago">{paymentDateCell}</td>
                                <td className="text-start historial-col-total-sdesc historial-monto-cell">{formatCurrency(subtotal)}</td>
                                <td className="text-start fw-bold historial-col-total historial-monto-cell">{formatCurrency(total)}</td>
                                <td className="text-start">{inv.relatedInvoiceNumber ?? "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="cuenta-cliente-resumen mt-4">
                      <div className="cuenta-cliente-resumen-header">
                        <span className="cuenta-cliente-resumen-icon">📊</span>
                        <div>
                          <h6 className="cuenta-cliente-resumen-title mb-0">Resumen</h6>
                          <small className="cuenta-cliente-resumen-subtitle">Estadísticas de facturación y cobros.</small>
                        </div>
                      </div>
                      <div className="row g-3 cuenta-cliente-resumen-cards">
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">TOTAL FACTURAS</div>
                            <div className="cuenta-cliente-resumen-card-accent" style={{ backgroundColor: "#2563eb" }} />
                            <div className="cuenta-cliente-resumen-card-value" style={{ color: "#2563eb" }}>{totals.countFacturas}</div>
                          </div>
                        </div>
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">TOTAL RECIBOS</div>
                            <div className="cuenta-cliente-resumen-card-accent" style={{ backgroundColor: "#16a34a" }} />
                            <div className="cuenta-cliente-resumen-card-value" style={{ color: "#16a34a" }}>{totals.countRecibos}</div>
                          </div>
                        </div>
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">NOTAS DE CRÉDITO</div>
                            <div className="cuenta-cliente-resumen-card-accent" style={{ backgroundColor: "#ca8a04" }} />
                            <div className="cuenta-cliente-resumen-card-value" style={{ color: "#ca8a04" }}>{totals.countNC}</div>
                          </div>
                        </div>
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">FACTURACIÓN TOTAL</div>
                            <div className="cuenta-cliente-resumen-card-accent" style={{ backgroundColor: "#1f2937" }} />
                            <div className="cuenta-cliente-resumen-card-value" style={{ color: "#1f2937" }}>{formatCurrencyNumber(totals.general)} <span className="currency">USD</span></div>
                          </div>
                        </div>
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">COBROS PENDIENTES</div>
                            <div className="cuenta-cliente-resumen-card-accent bg-danger" />
                            <div className="cuenta-cliente-resumen-card-value text-danger">{formatCurrencyNumber(totals.pendiente)} <span className="currency">USD</span></div>
                          </div>
                        </div>
                        <div className="col-6 col-md-4 col-lg-2">
                          <div className="cuenta-cliente-resumen-card">
                            <div className="cuenta-cliente-resumen-card-label">COBROS REALIZADOS</div>
                            <div className="cuenta-cliente-resumen-card-accent" style={{ backgroundColor: "#16a34a" }} />
                            <div className="cuenta-cliente-resumen-card-value" style={{ color: "#16a34a" }}>{formatCurrencyNumber(Math.abs(totals.cobrosRealizados))} <span className="currency">USD</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="cuenta-cliente-resumen-footer">
                        <span className="cuenta-cliente-resumen-footer-label">REGISTROS EN HISTORIAL</span>
                        <span className="cuenta-cliente-resumen-footer-value">{invoices.length}</span>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
