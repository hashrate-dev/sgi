import type { HostingFxOperation, HostingInvoiceTransferCommissionRow } from "../lib/api";
import { hostingFxOperationProfitUsd } from "../lib/hostingFxOperationProfit";

const HASHRATE_LOGO = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";

/** Mes/año legible a partir de la fecha de operación (YYYY-MM-DD u otro prefijo ISO). */
function mesDesdeFechaOperacion(operationDate: string | undefined): string {
  const raw = String(operationDate ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(raw);
  if (!m) return "—";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return "—";
  const d = new Date(y, mo - 1, 15);
  return new Intl.DateTimeFormat("es-PY", { month: "short", year: "numeric" }).format(d);
}

export type HostingFxOperationsHistoryCardProps = {
  operations: HostingFxOperation[];
  tableLoading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  pdfLoadingId: number | null;
  onEdit: (op: HostingFxOperation) => void;
  onTicket: (id: number) => void;
  onPdf: (op: HostingFxOperation) => void;
  onDelete: (id: number) => void;
};

export function HostingFxOperationsHistoryCard({
  operations,
  tableLoading,
  canEdit,
  canDelete,
  pdfLoadingId,
  onEdit,
  onTicket,
  onPdf,
  onDelete,
}: HostingFxOperationsHistoryCardProps) {
  return (
    <div className="fact-card mb-4">
      <div className="fact-card-header">
        <div className="d-flex justify-content-between gap-2 flex-wrap">
          <span>Historial de operaciones de cambio</span>
        </div>
      </div>
      <div className="fact-card-body">
        <div className="hosting-fx-ops-table-wrap">
          <table className="hosting-fx-ops-table hosting-fx-ops-table--historial">
            <colgroup>
              <col className="hosting-fx-ops-w-mes" />
              <col className="hosting-fx-ops-w-fecha" />
              <col className="hosting-fx-ops-w-cliente" />
              <col className="hosting-fx-ops-w-tipo" />
              <col className="hosting-fx-ops-w-compra" />
              <col className="hosting-fx-ops-w-ganancia" />
              <col className="hosting-fx-ops-w-notas" />
              <col className="hosting-fx-ops-w-acciones" />
            </colgroup>
            <thead className="hosting-fx-ops-thead">
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Fecha</th>
                <th scope="col">Cliente</th>
                <th scope="col">Tipo</th>
                <th scope="col">Compra de USDT / USD</th>
                <th scope="col" className="hosting-fx-ops-th--end">
                  Ganancia operación
                </th>
                <th scope="col">Notas (Opcional)</th>
                <th scope="col" className="hosting-fx-ops-th--center">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    Cargando operaciones...
                  </td>
                </tr>
              ) : operations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    Sin operaciones registradas todavía.
                  </td>
                </tr>
              ) : (
                operations.map((op) => (
                  <tr key={op.id}>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--mes">
                      <span className="text-nowrap">{mesDesdeFechaOperacion(op.operationDate)}</span>
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--fecha">
                      <span className="text-nowrap">{op.operationDate}</span>
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--cliente">
                      {`${op.clientCode || ""} ${op.clientName || ""} ${op.clientLastName || ""}`.trim()}
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--tipo">
                      <span className="text-nowrap">
                        {op.operationType === "usdt_to_usd" ? "USDT → USD" : "USD → USDT"}
                      </span>
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--compra">
                      {op.compraFlowHostingCommission
                        ? "4% Comisión por Hosting"
                        : op.usdtSide === "buy_usdt"
                          ? "Compra USDT"
                          : "Compra USD"}
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--end hosting-fx-ops-td--ganancia">
                      <span className="hosting-fx-ops-num">{hostingFxOperationProfitUsd(op).toFixed(2)}</span>
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-notes-cell">
                      {op.notes?.trim() ? (
                        <span title={op.notes.trim()}>{op.notes.trim()}</span>
                      ) : (
                        <span className="hosting-fx-ops-notes-empty">—</span>
                      )}
                    </td>
                    <td className="hosting-fx-ops-td hosting-fx-ops-td--center hosting-fx-ops-actions">
                      <div
                        className="d-flex justify-content-center align-items-center hosting-fx-ops-icon-row"
                        role="group"
                        aria-label="Acciones de la fila"
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--edit"
                            onClick={() => onEdit(op)}
                            title="Editar"
                            aria-label="Editar"
                          >
                            <i className="bi bi-pencil-fill" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--info"
                          onClick={() => onTicket(op.id)}
                          title="Ver ticket"
                          aria-label="Ver ticket"
                        >
                          <span className="hosting-fx-ops-ico-info" aria-hidden>
                            i
                          </span>
                        </button>
                        <button
                          type="button"
                          className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--pdf"
                          onClick={() => void onPdf(op)}
                          disabled={pdfLoadingId === op.id}
                          title="Descargar PDF"
                          aria-label="Descargar PDF"
                        >
                          {pdfLoadingId === op.id ? (
                            <i className="bi bi-hourglass-split" aria-hidden />
                          ) : (
                            <i className="bi bi-file-earmark" aria-hidden />
                          )}
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--delete"
                            onClick={() => void onDelete(op.id)}
                            title="Eliminar"
                            aria-label="Eliminar"
                          >
                            <i className="bi bi-trash" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export type HostingTransferCommissionInvoicesCardProps = {
  transferCommissionInvoices: HostingInvoiceTransferCommissionRow[];
  tableLoading: boolean;
};

export function HostingTransferCommissionInvoicesCard({
  transferCommissionInvoices,
  tableLoading,
}: HostingTransferCommissionInvoicesCardProps) {
  let sumCommission = 0;
  let sumInvoiceTotal = 0;
  const count = transferCommissionInvoices.length;
  for (const row of transferCommissionInvoices) {
    const c = Number(row.commissionUsd);
    const t = Number(row.invoiceTotalUsd);
    if (Number.isFinite(c) && c > 0) sumCommission += c;
    if (Number.isFinite(t)) sumInvoiceTotal += t;
  }

  return (
    <div className="fact-card mb-4" id="hosting-transfer-commission-section">
      <div className="fact-card-header">
        <span>Facturas hosting con comisión 4% (Gastos operativos transferencia)</span>
      </div>
      <div className="fact-card-body">
        <p className="small text-muted mb-3">
          Solo facturas hosting cuyo detalle incluye líneas «4% Gastos Operativos Transferencia» y además existe un{" "}
          <strong>Recibo</strong> de pago vinculado a esa factura, con <strong>fecha de pago</strong> registrada (pago
          efectuado). Las operaciones de cambio no condicionan este listado.
        </p>
        <div className="hosting-fx-ops-table-wrap">
          <table className="hosting-fx-ops-table">
            <thead className="hosting-fx-ops-thead">
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Cliente</th>
                <th scope="col">Número</th>
                <th scope="col">Mes doc.</th>
                <th scope="col" className="hosting-fx-ops-th--end">
                  Total factura
                </th>
                <th scope="col" className="hosting-fx-ops-th--end">
                  Suma 4% transf.
                </th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Cargando facturas…
                  </td>
                </tr>
              ) : transferCommissionInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    No hay facturas hosting en la base que incluyan ítems de comisión 4% transferencia.
                  </td>
                </tr>
              ) : (
                transferCommissionInvoices.map((row) => (
                  <tr key={row.invoiceId}>
                    <td>
                      <span className="text-nowrap">{row.date}</span>
                    </td>
                    <td className="text-start">{row.clientName}</td>
                    <td>
                      <span className="text-nowrap fw-medium">{row.number}</span>
                    </td>
                    <td>
                      <span className="text-nowrap">{row.month}</span>
                    </td>
                    <td className="hosting-fx-ops-td--end hosting-fx-ops-num">
                      {Number.isFinite(row.invoiceTotalUsd)
                        ? new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(row.invoiceTotalUsd)
                        : "—"}
                    </td>
                    <td className="hosting-fx-ops-td--end hosting-fx-ops-num">
                      {Number.isFinite(row.commissionUsd)
                        ? new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(row.commissionUsd)
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!tableLoading && transferCommissionInvoices.length > 0 ? (
              <tfoot>
                <tr className="hosting-fx-ops-transfer-comm-foot">
                  <td colSpan={4} className="text-end align-middle fw-medium hosting-fx-ops-transfer-comm-foot__label">
                    Totales ({count} {count === 1 ? "factura" : "facturas"})
                  </td>
                  <td className="hosting-fx-ops-td--end hosting-fx-ops-num align-middle fw-semibold">
                    {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(sumInvoiceTotal)}
                  </td>
                  <td className="hosting-fx-ops-td--end hosting-fx-ops-num align-middle fw-semibold">
                    {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(sumCommission)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}

export type HostingFxTicketModalProps = {
  ticketOperation: HostingFxOperation | null;
  onClose: () => void;
};

export function HostingFxTicketModal({ ticketOperation, onClose }: HostingFxTicketModalProps) {
  if (!ticketOperation) return null;
  return (
    <div className="hosting-fx-ticket-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="hosting-fx-ticket-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hosting-fx-ticket-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hosting-fx-ticket-modal-head">
          <div>
            <p className="hosting-fx-ticket-modal-eyebrow mb-1">Comprobante interno</p>
            <h5 id="hosting-fx-ticket-title" className="mb-0">
              Ticket operación {ticketOperation.ticketCode || `#${ticketOperation.id}`}
            </h5>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg me-1" aria-hidden />
            Cerrar
          </button>
        </div>

        <div className="hosting-fx-ticket-modal-body">
          <div className="hosting-fx-ticket-card">
            <div className="hosting-fx-ticket-card-header">
              <div className="hosting-fx-ticket-brand">
                <img src={HASHRATE_LOGO} alt="Hashrate Space" className="hosting-fx-ticket-brand-logo" />
              </div>
              <div className="d-flex flex-wrap gap-3 gap-md-4 justify-content-end align-items-start">
                <div className="text-md-end">
                  <div className="small text-muted">N° Ticket</div>
                  <div className="fw-semibold">{ticketOperation.ticketCode || "—"}</div>
                </div>
                <div className="text-md-end">
                  <div className="small text-muted">Fecha</div>
                  <div className="fw-semibold">{ticketOperation.operationDate}</div>
                </div>
              </div>
            </div>
            <hr className="my-3" />
            <div className="row g-3">
              <div className="col-12 col-lg-5">
                <div className="hosting-fx-ticket-details-col">
                  <div>
                    <strong>Cliente:</strong>{" "}
                    {`${ticketOperation.clientCode || ""} ${ticketOperation.clientName || ""} ${ticketOperation.clientLastName || ""}`.trim()}
                  </div>
                  <div>
                    <strong>Tipo:</strong>{" "}
                    {ticketOperation.operationType === "usdt_to_usd" ? "Cambio USDT a USD" : "Cambio USD a USDT"}
                  </div>
                  <div>
                    <strong>Cliente (Compra de USDT / Compra de USD / 4% Hosting):</strong>{" "}
                    {ticketOperation.compraFlowHostingCommission
                      ? "4% Comisión por Hosting"
                      : ticketOperation.usdtSide === "buy_usdt"
                        ? "Compra de USDT"
                        : "Compra de USD"}
                  </div>
                  <div>
                    <strong>Monto operación:</strong>{" "}
                    {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(ticketOperation.operationAmount)}
                  </div>
                  <div>
                    <strong>% comisión Hashrate:</strong> {ticketOperation.hrsCommissionPct.toFixed(2)}%
                  </div>
                  <div>
                    <strong>Comisión bancaria:</strong>{" "}
                    {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(ticketOperation.bankFeeAmount)}
                  </div>
                  <div>
                    <strong>Monto transferencia:</strong>{" "}
                    {ticketOperation.deliveryMethod === "usdt_to_hrs_binance"
                      ? `${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                          ticketOperation.clientTotalPayment
                        )} USDT`
                      : new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(
                          ticketOperation.clientTotalPayment
                        )}
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-7">
                <div className="hosting-fx-ticket-details-col">
                  <div>
                    <strong>Envío:</strong>{" "}
                    {ticketOperation.deliveryMethod === "usd_to_bank" ? "Envio USD a Banco" : "USDT a Binance"}
                  </div>
                  {ticketOperation.deliveryMethod === "usd_to_bank" ? (
                    <>
                      <div>
                        <strong>Banco:</strong> {ticketOperation.bankName}
                      </div>
                      <div>
                        <strong>Sucursal:</strong> {ticketOperation.bankBranch}
                      </div>
                      <div>
                        <strong>Nombre completo de cuenta:</strong> {ticketOperation.accountHolderName}
                      </div>
                      <div>
                        <strong>Moneda:</strong> {ticketOperation.currency}
                      </div>
                      <div>
                        <strong>N° Cuenta:</strong> {ticketOperation.accountNumber}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
