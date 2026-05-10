import { useEffect, useMemo, useState } from "react";
import type { HostingFxOperation, HostingInvoiceTransferCommissionRow } from "../lib/api";
import { hostingFxTipoDescripcionLarga, hostingFxTipoTableLabel } from "../lib/hostingFxOperationClassification";
import { hostingFxOperationProfitUsd } from "../lib/hostingFxOperationProfit";

const FX_HISTORIAL_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const TRANSFER_COMMISSION_TABLE_HELP =
  "Solo facturas hosting cuyo detalle incluye líneas «4% Gastos Operativos Transferencia» y además existe un Recibo de pago vinculado a esa factura, con fecha de pago registrada (pago efectuado). Las operaciones de cambio no condicionan este listado.";

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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [goToPage, setGoToPage] = useState("");

  const total = operations.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginatedOperations = useMemo(() => {
    const start = (page - 1) * pageSize;
    return operations.slice(start, start + pageSize);
  }, [operations, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [operations]);

  function handlePageSizeChange(v: number) {
    setPageSize(v);
    setPage(1);
  }

  function handleGoTo() {
    const n = parseInt(goToPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
      setPage(n);
      setGoToPage("");
    }
  }

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
                paginatedOperations.map((op) => (
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
                      {hostingFxTipoTableLabel(op)}
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
        {!tableLoading && total > 0 ? (
          <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
            <div className="d-flex align-items-center gap-2">
              <label className="text-muted small mb-0">Mostrar</label>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto" }}
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                aria-label="Registros por página"
              >
                {FX_HISTORIAL_PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-muted small">registros</span>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="text-muted small">
                Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}
              </span>
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
              <div className="d-flex align-items-center gap-1">
                <span className="small text-muted">Ir a</span>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  style={{ width: "4rem" }}
                  min={1}
                  max={totalPages}
                  value={goToPage}
                  onChange={(e) => setGoToPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGoTo();
                    }
                  }}
                  placeholder={String(totalPages)}
                  aria-label="Ir a página"
                />
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoTo}>
                  Ir
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [goToPage, setGoToPage] = useState("");

  const { sumCommission, sumInvoiceTotal, count } = useMemo(() => {
    let sc = 0;
    let st = 0;
    const n = transferCommissionInvoices.length;
    for (const row of transferCommissionInvoices) {
      const c = Number(row.commissionUsd);
      const t = Number(row.invoiceTotalUsd);
      if (Number.isFinite(c) && c > 0) sc += c;
      if (Number.isFinite(t)) st += t;
    }
    return { sumCommission: sc, sumInvoiceTotal: st, count: n };
  }, [transferCommissionInvoices]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return transferCommissionInvoices.slice(start, start + pageSize);
  }, [transferCommissionInvoices, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [transferCommissionInvoices]);

  function handlePageSizeChange(v: number) {
    setPageSize(v);
    setPage(1);
  }

  function handleGoTo() {
    const n = parseInt(goToPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
      setPage(n);
      setGoToPage("");
    }
  }

  return (
    <div className="fact-card mb-4" id="hosting-transfer-commission-section">
      <div className="fact-card-header">
        <span className="d-inline-flex align-items-center gap-2 flex-wrap">
          Facturas hosting con comisión 4% (Gastos operativos transferencia)
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none hosting-transfer-comm-info-btn"
            title={TRANSFER_COMMISSION_TABLE_HELP}
            aria-label="Información sobre el listado de facturas con comisión 4%"
          >
            <i className="bi bi-info-circle" aria-hidden />
          </button>
        </span>
      </div>
      <div className="fact-card-body">
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
                paginatedRows.map((row) => (
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
        {!tableLoading && count > 0 ? (
          <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
            <div className="d-flex align-items-center gap-2">
              <label className="text-muted small mb-0">Mostrar</label>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto" }}
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                aria-label="Registros por página"
              >
                {FX_HISTORIAL_PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-muted small">registros</span>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="text-muted small">
                Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, count)} de {count}
              </span>
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
              <div className="d-flex align-items-center gap-1">
                <span className="small text-muted">Ir a</span>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  style={{ width: "4rem" }}
                  min={1}
                  max={totalPages}
                  value={goToPage}
                  onChange={(e) => setGoToPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGoTo();
                    }
                  }}
                  placeholder={String(totalPages)}
                  aria-label="Ir a página"
                />
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoTo}>
                  Ir
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
                    {hostingFxTipoDescripcionLarga(ticketOperation)}
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
