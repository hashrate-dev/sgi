import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canEditFacturacion } from "../lib/auth";
import {
  createHostingFxOperation,
  deleteHostingFxOperation,
  getClients,
  getHostingFxOperations,
  updateHostingFxOperation,
  type HostingFxOperation,
  type HostingFxOperationPayload,
} from "../lib/api";
import { downloadHostingFxTicketPdf } from "../lib/generateHostingFxTicketPdf";
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
const HRS_COMMISSION_PCT_OPTIONS = [1, 1.5, 2, 3, 4] as const;
const HASHRATE_LOGO = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";

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

/** Misma fórmula que la columna «Ganancia operación» del listado. */
function hostingFxOperationProfit(op: HostingFxOperation): number {
  return Math.max(0, op.operationAmount - op.clientTotalPayment - op.bankFeeAmount);
}

export function HostingExchangeOperationsPage() {
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

  const loadData = useCallback(async () => {
    setTableLoading(true);
    try {
      const c = await getClients();
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
      try {
        const o = await getHostingFxOperations();
        setOperations(o.operations || []);
      } catch (e) {
        setOperations([]);
        setErr(e instanceof Error ? e.message : "No se pudieron cargar las operaciones.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la información.");
    } finally {
      setTableLoading(false);
    }
  }, [form.clientId]);

  useEffect(() => {
    if (loading || !user) return;
    if (!canEditFacturacion(user.role) && user.role !== "lector") return;
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

  const canEdit = Boolean(user && canEditFacturacion(user.role));
  const canDelete = user?.role === "admin_a" || user?.role === "admin_b";

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
  const exchangeOpsStats = useMemo(() => {
    let totalGanancias = 0;
    let montoVentaUsd = 0;
    let montoCompraUsd = 0;
    /** Suma de «Monto transferencia» (clientTotalPayment) con Cliente: Compra de USD (sell_usdt). */
    let montoTransferenciaVentaUsdt = 0;
    /** Suma de monto transferencia con Cliente: Compra de USDT (buy_usdt). */
    let montoTransferenciaCompraDeUsdt = 0;
    for (const op of operations) {
      totalGanancias += hostingFxOperationProfit(op);
      const amt = Number.isFinite(op.operationAmount) ? op.operationAmount : 0;
      const transfer = Number.isFinite(op.clientTotalPayment) ? op.clientTotalPayment : 0;
      if (op.usdtSide === "sell_usdt") {
        montoVentaUsd += amt;
        montoTransferenciaVentaUsdt += transfer;
      } else {
        montoCompraUsd += amt;
        montoTransferenciaCompraDeUsdt += transfer;
      }
    }
    return {
      totalGanancias,
      count: operations.length,
      montoVentaUsd,
      montoCompraUsd,
      montoTransferenciaVentaUsdt,
      montoTransferenciaCompraDeUsdt,
    };
  }, [operations]);
  const transferAmount = useMemo(() => {
    const opAmount = Number.isFinite(form.operationAmount) ? form.operationAmount : 0;
    const comm = Number.isFinite(form.hrsCommissionPct) ? form.hrsCommissionPct : 0;
    const commissionAmount = (opAmount * comm) / 100;
    return Math.max(0, opAmount - commissionAmount);
  }, [form.operationAmount, form.hrsCommissionPct]);
  const profitAmount = useMemo(
    () =>
      Math.max(
        0,
        (Number.isFinite(form.operationAmount) ? form.operationAmount : 0) -
          transferAmount -
          (Number.isFinite(form.bankFeeAmount) ? form.bankFeeAmount : 0)
      ),
    [form.operationAmount, transferAmount, form.bankFeeAmount]
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
  if (!loading && user && !canEditFacturacion(user.role) && user.role !== "lector") {
    return <Navigate to="/" replace />;
  }

  const resetForm = () => {
    setEditingId(null);
    setForm((prev) => ({
      ...INITIAL_FORM,
      operationDate: new Date().toISOString().slice(0, 10),
      clientId: prev.clientId > 0 ? prev.clientId : clientOptions[0]?.id ?? 0,
    }));
  };

  const refreshOperations = async () => {
    const data = await getHostingFxOperations();
    setOperations(data.operations || []);
  };

  const validateForm = (): string | null => {
    if (!form.clientId || form.clientId <= 0) return "Seleccioná un cliente de hosting.";
    if (!form.operationDate.trim()) return "Ingresá la fecha de la operación.";
    if (bankFieldsEnabled) {
      if (!form.bankName.trim()) return "Ingresá el banco.";
      if (!form.accountNumber.trim()) return "Ingresá el número de cuenta.";
      if (!form.currency.trim()) return "Ingresá la moneda.";
      if (!form.bankBranch.trim()) return "Ingresá la sucursal bancaria.";
      if (!form.accountHolderName.trim()) return "Ingresá el nombre completo de cuenta.";
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

  const startEdit = (op: HostingFxOperation) => {
    if (!canEdit) return;
    setEditingId(op.id);
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
  };

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
          backTo="/hosting"
          backText="Volver a Hosting"
        />
        <section className="hosting-fx-ops-indicators mb-4 mt-3" aria-label="Indicadores de operaciones" aria-live="polite">
          <div className="hosting-fx-ops-indicators__grid" role="presentation">
            <article className="hosting-fx-ops-metric hosting-fx-ops-metric--profit" aria-label="Total de ganancias en USD">
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-currency-dollar" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">Rendimiento</span>
                  <h3 className="hosting-fx-ops-metric__title">Total de ganancias</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure">
                {tableLoading ? (
                  <span className="hosting-fx-ops-metric__loading">Cargando…</span>
                ) : (
                  new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(
                    exchangeOpsStats.totalGanancias
                  )
                )}
              </p>
            </article>
            <article className="hosting-fx-ops-metric hosting-fx-ops-metric--count" aria-label="Cantidad de operaciones en el listado">
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-journal-text" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">Volumen</span>
                  <h3 className="hosting-fx-ops-metric__title">Operaciones en listado</h3>
                </div>
              </div>
              <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--count">
                {tableLoading ? <span className="hosting-fx-ops-metric__loading">—</span> : exchangeOpsStats.count}
              </p>
            </article>
            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--sell"
              aria-label="Monto operación, compra de USD, cliente paga con USDT"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-arrow-up-right" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">
                    Compra de USD
                    <br />
                    (Cliente paga con USDT)
                  </span>
                  <div className="hosting-fx-ops-metric__title-with-info">
                    <h3 className="hosting-fx-ops-metric__title" id="hosting-fx-metric-sell-title">
                      Monto total movido
                    </h3>
                    <span className="hosting-fx-ops-metric__info-trig">
                      <button
                        type="button"
                        className="hosting-fx-ops-metric__info-btn"
                        aria-label="Más información sobre compra de USD (cliente paga con USDT) en este resumen"
                        aria-describedby="hosting-fx-metric-sell-tip"
                      >
                        <i className="bi bi-info-circle" aria-hidden />
                      </button>
                      <span className="hosting-fx-ops-metric__info-bubble" id="hosting-fx-metric-sell-tip" role="tooltip">
                        Suma de operaciones con movimiento hacia dólares (en USD).
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="hosting-fx-ops-metric__figure-stack">
                <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--usdt">
                  {tableLoading ? (
                    <span className="hosting-fx-ops-metric__loading">Cargando…</span>
                  ) : (
                    <>
                      +
                      {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                        exchangeOpsStats.montoVentaUsd
                      )}{" "}
                      <span className="hosting-fx-ops-metric__unit">USDT</span>
                    </>
                  )}
                </p>
                {!tableLoading && (
                  <p
                    className="hosting-fx-ops-metric__figure-sub hosting-fx-ops-metric__figure-sub--transfer-usdt-neg"
                    aria-label="Suma de monto transferencia en USD, operaciones con compra de USD (cliente)"
                  >
                    −
                    {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                      exchangeOpsStats.montoTransferenciaVentaUsdt
                    )}{" "}
                    <span className="hosting-fx-ops-metric__unit">USD</span>
                  </p>
                )}
              </div>
            </article>
            <article
              className="hosting-fx-ops-metric hosting-fx-ops-metric--buy"
              aria-label="Monto operación, compra de USDT, cliente paga con USD"
            >
              <div className="hosting-fx-ops-metric__top">
                <div className="hosting-fx-ops-metric__icon" aria-hidden>
                  <i className="bi bi-arrow-down-left" />
                </div>
                <div className="hosting-fx-ops-metric__intro">
                  <span className="hosting-fx-ops-metric__eyebrow">
                    Compra de USDT
                    <br />
                    (Cliente paga con USD)
                  </span>
                  <div className="hosting-fx-ops-metric__title-with-info">
                    <h3 className="hosting-fx-ops-metric__title" id="hosting-fx-metric-buy-title">
                      Monto total movido
                    </h3>
                    <span className="hosting-fx-ops-metric__info-trig">
                      <button
                        type="button"
                        className="hosting-fx-ops-metric__info-btn"
                        aria-label="Más información sobre compra de USDT (cliente paga con USD) en este resumen"
                        aria-describedby="hosting-fx-metric-buy-tip"
                      >
                        <i className="bi bi-info-circle" aria-hidden />
                      </button>
                      <span className="hosting-fx-ops-metric__info-bubble" id="hosting-fx-metric-buy-tip" role="tooltip">
                        Suma de operaciones: compra de USDT, el cliente paga con USD.
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="hosting-fx-ops-metric__figure-stack">
                <p className="hosting-fx-ops-metric__figure hosting-fx-ops-metric__figure--usdt">
                  {tableLoading ? (
                    <span className="hosting-fx-ops-metric__loading">Cargando…</span>
                  ) : (
                    <>
                      +
                      {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                        exchangeOpsStats.montoCompraUsd
                      )}{" "}
                      <span className="hosting-fx-ops-metric__unit">USD</span>
                    </>
                  )}
                </p>
                {!tableLoading && (
                  <p
                    className="hosting-fx-ops-metric__figure-sub hosting-fx-ops-metric__figure-sub--transfer-usdt-neg"
                    aria-label="Suma de monto transferencia en USDT, operaciones con compra de USDT (cliente)"
                  >
                    −
                    {new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                      exchangeOpsStats.montoTransferenciaCompraDeUsdt
                    )}{" "}
                    <span className="hosting-fx-ops-metric__unit">USDT</span>
                  </p>
                )}
              </div>
            </article>
          </div>
        </section>

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
                <label className="fact-label">Cliente (Compra de USDT / Compra de USD)</label>
                <select
                  className="fact-select"
                  value={form.usdtSide}
                  onChange={(e) => {
                    const usdtSide = e.target.value as FxFormState["usdtSide"];
                    setForm((p) => ({
                      ...p,
                      usdtSide,
                      deliveryMethod: deliveryWhenClientCompraSideChanges(usdtSide),
                    }));
                  }}
                  disabled={!canEdit || busy}
                >
                  <option value="buy_usdt">Compra de USDT</option>
                  <option value="sell_usdt">Compra de USD</option>
                </select>
              </div>
              <div className="col-12 col-md-6 col-lg-4">
                <label className="fact-label">Envío</label>
                <select
                  key={form.usdtSide}
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

        <div className="fact-card mb-4">
          <div className="fact-card-header">
            <div className="d-flex justify-content-between gap-2 flex-wrap">
              <span>Historial de operaciones</span>
            </div>
          </div>
          <div className="fact-card-body">
          <div className="hosting-fx-ops-table-wrap">
            <table className="hosting-fx-ops-table">
              <thead className="hosting-fx-ops-thead">
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Compra de USDT / USD</th>
                  <th scope="col" className="hosting-fx-ops-th--end">Ganancia operación</th>
                  <th scope="col" className="hosting-fx-ops-th--center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      Cargando operaciones...
                    </td>
                  </tr>
                ) : operations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      Sin operaciones registradas todavía.
                    </td>
                  </tr>
                ) : (
                  operations.map((op) => (
                    <tr key={op.id}>
                      <td>
                        <span className="text-nowrap">{op.operationDate}</span>
                      </td>
                      <td>
                        {`${op.clientCode || ""} ${op.clientName || ""} ${op.clientLastName || ""}`.trim()}
                      </td>
                      <td>
                        {op.operationType === "usdt_to_usd" ? "USDT → USD" : "USD → USDT"}
                      </td>
                      <td>
                        {op.usdtSide === "buy_usdt" ? "Compra USDT" : "Compra USD"}
                      </td>
                      <td className="hosting-fx-ops-td--end">
                        <span className="hosting-fx-ops-num">
                          {hostingFxOperationProfit(op).toFixed(2)}
                        </span>
                      </td>
                      <td className="text-center hosting-fx-ops-actions">
                        <div className="d-flex justify-content-center align-items-center hosting-fx-ops-icon-row" role="group" aria-label="Acciones de la fila">
                          {canEdit ? (
                            <button
                              type="button"
                              className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--edit"
                              onClick={() => startEdit(op)}
                              title="Editar"
                              aria-label="Editar"
                            >
                              <i className="bi bi-pencil-fill" aria-hidden />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="hosting-fx-ops-icon-btn hosting-fx-ops-icon-btn--info"
                            onClick={() => setTicketOperationId(op.id)}
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
                            onClick={() => void onDownloadRowPdf(op)}
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
                              onClick={() => void removeOperation(op.id)}
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

        {ticketOperation ? (
          <div className="hosting-fx-ticket-modal-overlay" role="presentation" onClick={() => setTicketOperationId(null)}>
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
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setTicketOperationId(null)}>
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
                        <div><strong>Cliente:</strong> {`${ticketOperation.clientCode || ""} ${ticketOperation.clientName || ""} ${ticketOperation.clientLastName || ""}`.trim()}</div>
                        <div><strong>Tipo:</strong> {ticketOperation.operationType === "usdt_to_usd" ? "Cambio USDT a USD" : "Cambio USD a USDT"}</div>
                        <div>
                          <strong>Cliente (Compra de USDT / Compra de USD):</strong>{" "}
                          {ticketOperation.usdtSide === "buy_usdt" ? "Compra de USDT" : "Compra de USD"}
                        </div>
                        <div><strong>Monto operación:</strong> {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(ticketOperation.operationAmount)}</div>
                        <div><strong>% comisión Hashrate:</strong> {ticketOperation.hrsCommissionPct.toFixed(2)}%</div>
                        <div><strong>Comisión bancaria:</strong> {new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(ticketOperation.bankFeeAmount)}</div>
                        <div>
                          <strong>Monto transferencia:</strong>{" "}
                          {ticketOperation.deliveryMethod === "usdt_to_hrs_binance"
                            ? `${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ticketOperation.clientTotalPayment)} USDT`
                            : new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD" }).format(ticketOperation.clientTotalPayment)}
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
                            <div><strong>Banco:</strong> {ticketOperation.bankName}</div>
                            <div><strong>Sucursal:</strong> {ticketOperation.bankBranch}</div>
                            <div><strong>Nombre completo de cuenta:</strong> {ticketOperation.accountHolderName}</div>
                            <div><strong>Moneda:</strong> {ticketOperation.currency}</div>
                            <div><strong>N° Cuenta:</strong> {ticketOperation.accountNumber}</div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
