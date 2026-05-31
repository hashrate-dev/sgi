import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { sgiHome } from "../lib/marketplacePaths.js";
import { HostingFxOperationsIndicators } from "../components/HostingFxOperationsIndicators";
import {
  HostingFxOperationsHistoryCard,
  HostingFxTicketModal,
  HostingTransferCommissionInvoicesCard,
} from "../components/HostingTipoCambioHistorialTables";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import {
  canAccessHostingTipoCambio,
  canDeleteHostingFxOperation,
  canEditHostingTipoCambio,
} from "../lib/auth";
import {
  createHostingFxOperation,
  deleteHostingFxOperation,
  getClientsForFxOperations,
  getHostingFxOperations,
  getHostingInvoicesTransferCommission,
  updateHostingFxOperation,
  type HostingFxOperation,
  type HostingFxOperationPayload,
  type HostingInvoiceTransferCommissionRow,
} from "../lib/api";
import { downloadHostingFxTicketPdf } from "../lib/generateHostingFxTicketPdf";
import { hostingFxClientTotalPayment } from "../lib/hostingFxClientTotalPayment";
import { hostingFxOperationProfitUsd } from "../lib/hostingFxOperationProfit";
import "../styles/facturacion.css";

type FxFormState = HostingFxOperationPayload;

const INITIAL_FORM: FxFormState = {
  clientId: 0,
  operationDate: new Date().toISOString().slice(0, 10),
  operationAmount: 0,
  hrsCommissionPct: 1,
  bankFeeAmount: 0,
  deliveryMethod: "usdt_to_hrs_binance",
  bankName: "",
  accountNumber: "",
  currency: "USD",
  bankBranch: "",
  accountHolderName: "",
  usdtSide: "buy_usdt",
  notes: "",
};

const BANK_OPTIONS = ["Banco Santander", "BROU", "Banco Itau", "BBVA", "Prex", "Mi Dinero"] as const;
const DEFAULT_BANK_HOSTING_COMMISSION = BANK_OPTIONS[0]!;
const HRS_COMMISSION_PCT_OPTIONS = [0.8, 1, 1.5, 1.6, 1.7, 2, 2.5, 2.6, 2.7, 2.8, 2.9, 3, 3.5, 4] as const;

/** Valores del select «Cliente»: los dos primeros son operaciones FX; el tercero solo enlaza a la tabla de comisión 4% facturas. */
type ClientCompraSelectValue = FxFormState["usdtSide"] | "hosting_commission";
/** Al elegir «Compra de USDT»: envío fijo a Binance. Al elegir «Compra de USD»: envío por defecto a banco. */
function deliveryWhenClientCompraSideChanges(usdtSide: FxFormState["usdtSide"]): FxFormState["deliveryMethod"] {
  return usdtSide === "buy_usdt" ? "usdt_to_hrs_binance" : "usd_to_bank";
}

function normalizeHrsCommissionPct(n: number): number {
  const allowed = HRS_COMMISSION_PCT_OPTIONS as readonly number[];
  if (!Number.isFinite(n)) return 1;
  if (allowed.includes(n)) return n;
  return allowed.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), allowed[0]!);
}

export function HostingExchangeOperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const [clients, setClients] = useState<Array<{ id: number; code: string; name: string; name2?: string }>>([]);
  const [operations, setOperations] = useState<HostingFxOperation[]>([]);
  const [form, setForm] = useState<FxFormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [ticketOperationId, setTicketOperationId] = useState<number | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [transferCommissionInvoices, setTransferCommissionInvoices] = useState<HostingInvoiceTransferCommissionRow[]>([]);
  const [clientCompraSelect, setClientCompraSelect] = useState<ClientCompraSelectValue>("buy_usdt");

  const loadData = useCallback(async () => {
    setTableLoading(true);
    try {
      const c = await getClientsForFxOperations();
      const normalizedClients = (c.clients || [])
        .map((x) => ({
          id: Number(x.id ?? 0),
          code: String(x.code || "").trim(),
          name: String(x.name || "").trim(),
          name2: String(x.name2 || "").trim(),
        }))
        .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.code && x.name);
      setClients(normalizedClients);
      if (normalizedClients.length > 0 && form.clientId <= 0) {
        setForm((prev) => ({ ...prev, clientId: normalizedClients[0]!.id }));
      }
      const [rOps, rTi] = await Promise.allSettled([
        getHostingFxOperations(),
        getHostingInvoicesTransferCommission(),
      ]);
      if (rOps.status === "fulfilled") {
        setOperations(rOps.value.operations || []);
      } else {
        setOperations([]);
        setErr(
          rOps.reason instanceof Error ? rOps.reason.message : "No se pudieron cargar las operaciones."
        );
      }
      if (rTi.status === "fulfilled") {
        setTransferCommissionInvoices(rTi.value.invoices || []);
      } else {
        setTransferCommissionInvoices([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la información.");
    } finally {
      setTableLoading(false);
    }
  }, [form.clientId]);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessHostingTipoCambio(user)) return;
    void loadData();
  }, [loading, user, loadData]);

  /** Corrige comisión fuera de la lista (p. ej. 0% en estado viejo) para que el % y el monto transferencia coincidan. */
  useEffect(() => {
    setForm((p) => {
      const fixed = normalizeHrsCommissionPct(p.hrsCommissionPct);
      if (fixed === p.hrsCommissionPct) return p;
      return { ...p, hrsCommissionPct: fixed };
    });
  }, []);

  /** Compra de USDT → siempre «USDT a Binance» (corrige estados desincronizados). */
  useEffect(() => {
    setForm((p) => {
      if (p.usdtSide !== "buy_usdt") return p;
      const need = deliveryWhenClientCompraSideChanges("buy_usdt");
      if (p.deliveryMethod === need) return p;
      return { ...p, deliveryMethod: need };
    });
  }, [form.usdtSide]);

  const canEdit = Boolean(user && canEditHostingTipoCambio(user));
  const canDelete = Boolean(user && canDeleteHostingFxOperation(user));

  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        id: c.id,
        label: `${c.code} - ${c.name}${c.name2 ? ` ${c.name2}` : ""}`,
      })),
    [clients]
  );
  const ticketOperation = useMemo(
    () => operations.find((op) => op.id === ticketOperationId) ?? null,
    [operations, ticketOperationId]
  );
  const onDownloadRowPdf = useCallback(async (op: HostingFxOperation) => {
    setPdfLoadingId(op.id);
    setErr("");
    try {
      await downloadHostingFxTicketPdf(op);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfLoadingId(null);
    }
  }, []);
  const isHostingCommissionFlow = clientCompraSelect === "hosting_commission";
  const transferAmount = useMemo(
    () =>
      hostingFxClientTotalPayment(
        form.operationAmount,
        form.hrsCommissionPct,
        isHostingCommissionFlow
      ),
    [form.operationAmount, form.hrsCommissionPct, isHostingCommissionFlow]
  );
  const profitAmount = useMemo(
    () =>
      hostingFxOperationProfitUsd({
        operationAmount: form.operationAmount,
        clientTotalPayment: transferAmount,
        bankFeeAmount: form.bankFeeAmount,
        compraFlowHostingCommission: isHostingCommissionFlow,
      }),
    [form.operationAmount, transferAmount, form.bankFeeAmount, isHostingCommissionFlow]
  );
  const bankFieldsEnabled = form.deliveryMethod === "usd_to_bank";

  useEffect(() => {
    if (!ticketOperation) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setTicketOperationId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [ticketOperation]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessHostingTipoCambio(user)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const resetForm = () => {
    setEditingId(null);
    setClientCompraSelect("buy_usdt");
    setForm((prev) => ({
      ...INITIAL_FORM,
      operationDate: new Date().toISOString().slice(0, 10),
      clientId: prev.clientId > 0 ? prev.clientId : clientOptions[0]?.id ?? 0,
    }));
  };

  const refreshOperations = async () => {
    const data = await getHostingFxOperations();
    setOperations(data.operations || []);
    try {
      const inv = await getHostingInvoicesTransferCommission();
      setTransferCommissionInvoices(inv.invoices || []);
    } catch {
      /* misma página: si falla, no ocultamos el listado anterior */
    }
  };

  const validateForm = (): string | null => {
    if (!form.clientId || form.clientId <= 0) return "Seleccioná un cliente de hosting.";
    if (!form.operationDate.trim()) return "Ingresá la fecha de la operación.";
    if (bankFieldsEnabled) {
      if (!form.bankName.trim()) return "Ingresá el banco.";
      if (!form.currency.trim()) return "Ingresá la moneda.";
      /* Número de cuenta, sucursal y titular son opcionales */
    }
    if (!Number.isFinite(form.hrsCommissionPct) || form.hrsCommissionPct < 0 || form.hrsCommissionPct > 100) {
      return "La comisión debe estar entre 0 y 100.";
    }
    if (!Number.isFinite(form.operationAmount) || form.operationAmount < 0) {
      return "El monto de operación debe ser 0 o mayor.";
    }
    if (!Number.isFinite(form.bankFeeAmount) || form.bankFeeAmount < 0) {
      return "La comisión bancaria debe ser 0 o mayor.";
    }
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setErr("");
    setOk("");
    const validationErr = validateForm();
    if (validationErr) {
      setErr(validationErr);
      return;
    }
    setBusy(true);
    try {
      const bankOn = form.deliveryMethod === "usd_to_bank";
      const payload: HostingFxOperationPayload = {
        ...form,
        bankName: bankOn ? form.bankName.trim() : "",
        accountNumber: bankOn ? form.accountNumber.trim() : "",
        currency: bankOn ? form.currency.trim().toUpperCase() : "",
        bankBranch: bankOn ? form.bankBranch.trim() : "",
        accountHolderName: bankOn ? form.accountHolderName.trim() : "",
        clientTotalPayment: transferAmount,
        notes: form.notes?.trim() || "",
        compraFlowHostingCommission: clientCompraSelect === "hosting_commission",
      };
      if (editingId != null) {
        await updateHostingFxOperation(editingId, payload);
        setOk("Operación actualizada correctamente.");
      } else {
        await createHostingFxOperation(payload);
        setOk("Operación registrada correctamente.");
      }
      await refreshOperations();
      resetForm();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "No se pudo guardar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = useCallback((op: HostingFxOperation) => {
    if (!canEdit) return;
    setEditingId(op.id);
    setClientCompraSelect(
      op.compraFlowHostingCommission ? "hosting_commission" : op.usdtSide === "buy_usdt" ? "buy_usdt" : "sell_usdt"
    );
    setForm({
      clientId: op.clientId,
      operationDate: op.operationDate,
      operationAmount: Number(op.operationAmount ?? op.clientTotalPayment ?? 0),
      hrsCommissionPct: normalizeHrsCommissionPct(op.hrsCommissionPct),
      bankFeeAmount: Number(op.bankFeeAmount ?? 0),
      deliveryMethod:
        op.usdtSide === "buy_usdt"
          ? deliveryWhenClientCompraSideChanges("buy_usdt")
          : ((op.deliveryMethod as FxFormState["deliveryMethod"]) ?? "usd_to_bank"),
      bankName: op.bankName,
      accountNumber: op.accountNumber,
      currency: op.currency,
      bankBranch: op.bankBranch,
      accountHolderName: op.accountHolderName ?? "",
      usdtSide: op.usdtSide,
      notes: op.notes || "",
    });
    setErr("");
    setOk("");
  }, [canEdit]);

  const editIdFromUrl = searchParams.get("edit");
  useEffect(() => {
    if (!editIdFromUrl || !canEdit) return;
    const id = Number(editIdFromUrl);
    if (!Number.isFinite(id) || id <= 0 || operations.length === 0) return;
    const op = operations.find((o) => o.id === id);
    if (!op) return;
    startEdit(op);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      },
      { replace: true }
    );
  }, [editIdFromUrl, operations, canEdit, startEdit, setSearchParams]);

  const removeOperation = async (id: number) => {
    if (!canDelete) return;
    if (!window.confirm("¿Eliminar esta operación de cambio?")) return;
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await deleteHostingFxOperation(id);
      setOk("Operación eliminada.");
      await refreshOperations();
      setTicketOperationId((prev) => (prev === id ? null : prev));
      if (editingId === id) resetForm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar la operación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Operaciones de Cambio (USDT/USD)"
          showBackButton
          backTo="/gestion-administrativa/exchange"
          backText="Volver atrás"
        />
        <HostingFxOperationsIndicators operations={operations} tableLoading={tableLoading} />

        <div className="fact-card fact-panel-nuevo-documento mb-4">
          <div className="fact-panel-nuevo-documento-header">
            {editingId != null ? "Editar operación" : "Nueva operación"}
          </div>
          <div className="fact-card-body">
            <form onSubmit={onSubmit}>
            <div className="row g-3">
              <div className="col-12 col-lg-5">
                <label className="fact-label">Cliente Hosting</label>
                <select
                  className="fact-select"
                  value={form.clientId}
                  onChange={(e) => setForm((p) => ({ ...p, clientId: Number(e.target.value) }))}
                  disabled={!canEdit || busy}
                >
                  <option value={0}>Seleccionar cliente</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="fact-label">Fecha</label>
                <input
                  type="date"
                  className="fact-input"
                  value={form.operationDate}
                  onChange={(e) => setForm((p) => ({ ...p, operationDate: e.target.value }))}
                  disabled={!canEdit || busy}
                />
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Monto Operación</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="fact-input"
                  value={form.operationAmount}
                  onChange={(e) => setForm((p) => ({ ...p, operationAmount: Number(e.target.value) }))}
                  disabled={!canEdit || busy}
                />
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="fact-label">% comisión Hashrate</label>
                <select
                  className="fact-select"
                  value={normalizeHrsCommissionPct(form.hrsCommissionPct)}
                  onChange={(e) => setForm((p) => ({ ...p, hrsCommissionPct: Number(e.target.value) }))}
                  disabled={!canEdit || busy}
                >
                  {HRS_COMMISSION_PCT_OPTIONS.map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="fact-label">Monto Transferencia</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="fact-input"
                  readOnly
                  tabIndex={-1}
                  aria-readonly
                  value={
                    Number.isFinite(transferAmount)
                      ? new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                          transferAmount
                        )
                      : "0,00"
                  }
                />
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="fact-label">Comisión Bancaria</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="fact-input"
                  value={form.bankFeeAmount}
                  onChange={(e) => setForm((p) => ({ ...p, bankFeeAmount: Number(e.target.value) }))}
                  disabled={!canEdit || busy}
                />
              </div>
              <div className="col-12 col-md-6 col-lg-3">
                <label className="fact-label">Ganancia Operación</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="fact-input"
                  value={Number.isFinite(profitAmount) ? profitAmount.toFixed(2) : "0.00"}
                  readOnly
                  disabled
                />
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Cliente (Compra de USDT / Compra de USD / 4% Hosting)</label>
                <select
                  className="fact-select"
                  value={clientCompraSelect}
                  onChange={(e) => {
                    const v = e.target.value as ClientCompraSelectValue;
                    setClientCompraSelect(v);
                    if (v === "hosting_commission") {
                      setForm((p) => ({
                        ...p,
                        usdtSide: "sell_usdt",
                        deliveryMethod: "usd_to_bank",
                        bankName: DEFAULT_BANK_HOSTING_COMMISSION,
                      }));
                      return;
                    }
                    setForm((p) => ({
                      ...p,
                      usdtSide: v,
                      deliveryMethod: deliveryWhenClientCompraSideChanges(v),
                    }));
                  }}
                  disabled={!canEdit || busy}
                >
                  <option value="buy_usdt">Compra de USDT</option>
                  <option value="sell_usdt">Compra de USD</option>
                  <option value="hosting_commission">4% Comisión por Hosting</option>
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Envío</label>
                <select
                  className="fact-select"
                  value={form.deliveryMethod}
                  onChange={(e) => setForm((p) => ({ ...p, deliveryMethod: e.target.value as FxFormState["deliveryMethod"] }))}
                  disabled={!canEdit || busy || form.usdtSide === "buy_usdt"}
                  title={
                    form.usdtSide === "buy_usdt"
                      ? "Con Compra de USDT el envío es siempre a Binance (USDT)"
                      : undefined
                  }
                >
                  <option value="usd_to_bank">Envio USD a Banco</option>
                  <option value="usdt_to_hrs_binance">USDT a Binance</option>
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Banco</label>
                <select
                  className="fact-select"
                  value={form.bankName}
                  onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                  disabled={!canEdit || busy || !bankFieldsEnabled}
                >
                  <option value="">Seleccionar banco</option>
                  {BANK_OPTIONS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                  {form.bankName && !BANK_OPTIONS.includes(form.bankName as (typeof BANK_OPTIONS)[number]) ? (
                    <option value={form.bankName}>{form.bankName}</option>
                  ) : null}
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Número de cuenta</label>
                <input
                  type="text"
                  className="fact-input"
                  value={form.accountNumber}
                  onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
                  disabled={!canEdit || busy || !bankFieldsEnabled}
                  placeholder={bankFieldsEnabled ? "" : "Solo aplica para Envio USD a Banco"}
                />
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Sucursal bancaria</label>
                <input
                  type="text"
                  className="fact-input"
                  value={form.bankBranch}
                  onChange={(e) => setForm((p) => ({ ...p, bankBranch: e.target.value }))}
                  disabled={!canEdit || busy || !bankFieldsEnabled}
                  placeholder={bankFieldsEnabled ? "" : "Solo aplica para Envio USD a Banco"}
                />
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Nombre Completo de Cuenta</label>
                <input
                  type="text"
                  className="fact-input"
                  value={form.accountHolderName}
                  onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                  disabled={!canEdit || busy || !bankFieldsEnabled}
                  placeholder={bankFieldsEnabled ? "" : "Solo aplica para Envio USD a Banco"}
                />
              </div>
              <div className="col-12">
                <label className="fact-label">Notas (opcional)</label>
                <textarea
                  className="fact-input"
                  rows={2}
                  value={form.notes || ""}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  disabled={!canEdit || busy}
                />
              </div>
            </div>
            {err ? <div className="alert alert-danger py-2 mt-3 mb-0">{err}</div> : null}
            {ok ? <div className="alert alert-success py-2 mt-3 mb-0">{ok}</div> : null}
            <div className="d-flex justify-content-end flex-wrap gap-2 mt-4">
              <button type="submit" className="btn btn-success" disabled={!canEdit || busy}>
                {editingId != null ? "Guardar cambios" : "Registrar operación"}
              </button>
              {editingId != null ? (
                <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={busy}>
                  Cancelar edición
                </button>
              ) : null}
            </div>
            </form>
          </div>
        </div>

        <HostingFxOperationsHistoryCard
          operations={operations}
          tableLoading={tableLoading}
          canEdit={canEdit}
          canDelete={canDelete}
          pdfLoadingId={pdfLoadingId}
          onEdit={startEdit}
          onTicket={setTicketOperationId}
          onPdf={onDownloadRowPdf}
          onDelete={removeOperation}
        />

        <HostingTransferCommissionInvoicesCard
          transferCommissionInvoices={transferCommissionInvoices}
          tableLoading={tableLoading}
        />

        <HostingFxTicketModal ticketOperation={ticketOperation} onClose={() => setTicketOperationId(null)} />
      </div>
    </div>
  );
}
