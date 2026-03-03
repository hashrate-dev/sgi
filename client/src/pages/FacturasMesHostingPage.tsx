import { useEffect, useMemo, useState } from "react";
import { deleteInvoice, getInvoices, wakeUpBackend } from "../lib/api";
import type { ComprobanteType, Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { showToast } from "../components/ToastNotification";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

const STORAGE_PREFIX = "hosting_mail_sent_";

export type MailSentStatus = "SI" | "NO" | "Cancelado";

function getMailSent(invoiceId: string): MailSentStatus {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + invoiceId);
    if (v === "SI" || v === "NO" || v === "Cancelado") return v;
  } catch {}
  return "NO";
}

function setMailSent(invoiceId: string, value: MailSentStatus) {
  try {
    localStorage.setItem(STORAGE_PREFIX + invoiceId, value);
  } catch (e) {
    showToast("No se pudo guardar.", "error");
  }
}

/** Normaliza mes a YYYY-MM (ej. "2026-2" -> "2026-02") */
function normalizeMonth(mm: string | undefined): string {
  if (!mm || typeof mm !== "string") return "";
  const parts = mm.split("-").map((p) => parseInt(p.trim(), 10));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    const y = parts[0];
    const m = Math.max(1, Math.min(12, parts[1]));
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  return mm;
}

/** Parsea fecha en formato DD/MM/YYYY o YYYY-MM-DD y devuelve { year, month } */
function parseDateMonth(dateStr: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
    }
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
  return null;
}

/** Parsea fecha a Date (para comparar con hoy) */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) ? d : null;
}

/** Devuelve YYYY-MM del mes de una fecha parseada */
function dateToMonthStr(parsed: { year: number; month: number }): string {
  return `${parsed.year}-${String(parsed.month + 1).padStart(2, "0")}`;
}

/** Formatea mes YYYY-MM a "feb-2026" (mes del documento, columna MES) */
function formatMonth(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr || "—";
  const [y, m] = monthStr.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthStr;
  const d = new Date(y, m - 1, 1);
  const mes = d.toLocaleDateString("es-AR", { month: "short" });
  return `${mes}-${y}`;
}

function currentMonthValue(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

/** Comprueba si un comprobante (Recibo/NC) está vinculado a una factura. Usa id y number por robustez. */
function isLinkedToInvoice(comp: Invoice, factura: Invoice): boolean {
  const matchId = comp.relatedInvoiceId != null && String(comp.relatedInvoiceId) === String(factura.id);
  const matchNumber = comp.relatedInvoiceNumber != null && comp.relatedInvoiceNumber === factura.number;
  return matchId || matchNumber;
}

export function FacturasMesHostingPage() {
  const [all, setAll] = useState<Invoice[]>([]);
  const [, forceUpdate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  function fetchDocuments() {
    setLoading(true);
    setFetchError(null);
    wakeUpBackend()
      .then(() => getInvoices({ source: "hosting" }))
      .then((r) => {
        const list = (r.invoices ?? []).map((inv) => ({
          id: String(inv.id),
          number: inv.number,
          type: inv.type as ComprobanteType,
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
        setFetchError(err instanceof Error ? err.message : "Error al cargar documentos");
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
  const [qClient, setQClient] = useState("");
  const [qType, setQType] = useState<"" | ComprobanteType>("");
  /** Mes/año a mostrar (YYYY-MM); se ajusta en useEffect al primer MES con datos */
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  /** Cuando el usuario intenta pasar de SI a NO, guardamos el documento para pedir confirmación */
  const [confirmNoMailSent, setConfirmNoMailSent] = useState<Invoice | null>(null);
  /** Cuando el usuario elige Cancelado, pedimos confirmación antes de aplicar */
  const [confirmCancelado, setConfirmCancelado] = useState<Invoice | null>(null);

  /** Opciones de mes = solo MES que tienen al menos un documento (excl. NC, date <= hoy). Así feb/mar no aparecen si no hay datos. */
  const opcionesMesAnio = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const set = new Set<string>();
    for (const inv of all) {
      if (inv.type === "Nota de Crédito") continue;
      const mm = normalizeMonth(inv.month);
      if (!mm || mm.length < 7) continue;
      const invDate = parseDate(inv.date);
      if (invDate && invDate > hoy) continue;
      set.add(mm);
    }
    const sorted = Array.from(set).sort().reverse(); /* más reciente primero */
    return sorted.map((value) => ({ value, label: formatMonth(value) }));
  }, [all]);

  /** Si el mes seleccionado no está en las opciones, elegir el primero disponible (evita mostrar mar/feb con datos de ene). */
  useEffect(() => {
    if (opcionesMesAnio.length === 0) return;
    const exists = opcionesMesAnio.some((o) => o.value === selectedMonth);
    if (!exists) setSelectedMonth(opcionesMesAnio[0].value);
  }, [opcionesMesAnio, selectedMonth]);

  /** Documentos del mes seleccionado: filtro por columna MES (inv.month). Sin NC. */
  const facturasEsteMes = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const mesFiltro = normalizeMonth(selectedMonth);
    if (!mesFiltro) return [];
    return all.filter((inv) => {
      if (inv.type === "Nota de Crédito") return false;
      const docMes = normalizeMonth(inv.month);
      const invDate = parseDate(inv.date);
      const dateHoy = invDate ? invDate <= hoy : true;
      return docMes === mesFiltro && dateHoy;
    }).sort((a, b) => {
      const pa = parseDateMonth(a.date);
      const pb = parseDateMonth(b.date);
      if (!pa || !pb) return 0;
      if (pa.year !== pb.year) return pb.year - pa.year;
      if (pa.month !== pb.month) return pb.month - pa.month;
      return 0;
    });
  }, [all, selectedMonth]);

  /** Lista para la tabla: filtro por cliente/tipo; se muestran también los cancelados. */
  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return facturasEsteMes.filter((inv) => {
      const okClient = !client || inv.clientName.toLowerCase().includes(client);
      const okType = !qType || inv.type === qType;
      return okClient && okType;
    });
  }, [facturasEsteMes, qClient, qType]);

  /** Lista para totales y barra: excluye cancelados para que no se contabilicen. */
  const filteredForStats = useMemo(() => filtered.filter((inv) => getMailSent(inv.id) !== "Cancelado"), [filtered]);

  /** IDs de facturas que están conectadas con un Recibo o NC en la lista (para pintar ambas filas) */
  const connectedFacturaIds = useMemo(() => {
    const connected = new Set<string>();
    for (const inv of filtered) {
      if (inv.type === "Recibo" || inv.type === "Nota de Crédito") {
        const factura = filtered.find((f) => f.type === "Factura" && isLinkedToInvoice(inv, f));
        if (factura) connected.add(factura.id);
      }
    }
    return connected;
  }, [filtered]);

  function isRowConnected(inv: Invoice): boolean {
    if (inv.type === "Factura") return connectedFacturaIds.has(inv.id);
    if (inv.type === "Recibo" || inv.type === "Nota de Crédito") {
      const factura = filtered.find((f) => f.type === "Factura" && isLinkedToInvoice(inv, f));
      return factura ? connectedFacturaIds.has(factura.id) : false;
    }
    return false;
  }

  /** IDs de documentos que forman un par factura+recibo/NC y ambos están marcados como enviados por mail (solo entre no cancelados) */
  function getFullySentConnectedIds(): Set<string> {
    const set = new Set<string>();
    for (const facturaId of connectedFacturaIds) {
      const facturaRow = filteredForStats.find((i) => i.type === "Factura" && i.id === facturaId);
      if (!facturaRow) continue;
      const group = [facturaRow, ...filteredForStats.filter((i) => (i.type === "Recibo" || i.type === "Nota de Crédito") && isLinkedToInvoice(i, facturaRow))];
      const allSent = group.every((inv) => getMailSent(inv.id) === "SI");
      if (allSent) group.forEach((inv) => set.add(inv.id));
    }
    return set;
  }
  const fullySentConnectedIds = getFullySentConnectedIds();

  /** Resumen: solo documentos no cancelados (filteredForStats) para que los cancelados no se contabilicen. */
  const stats = useMemo(() => {
    const list = filteredForStats;
    const facturas = list.filter((i) => i.type === "Factura").length;
    const recibos = list.filter((i) => i.type === "Recibo").length;
    const notasCredito = list.filter((i) => i.type === "Nota de Crédito").length;
    const sumaFacturas = list.filter((i) => i.type === "Factura").reduce((s, i) => s + (Number(i.total) || 0), 0);
    const sumaNC = list.filter((i) => i.type === "Nota de Crédito").reduce((s, i) => s + (Math.abs(i.total) || 0), 0);
    const facturacionTotal = sumaFacturas - sumaNC;
    const tieneRecibo = (factura: Invoice) =>
      list.some((r) => r.type === "Recibo" && isLinkedToInvoice(r, factura));
    const facturasPendientes = list.filter((i) => i.type === "Factura" && !tieneRecibo(i));
    const cobrosPendientes = facturasPendientes.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const cobrosRealizados = list
      .filter((r) => r.type === "Recibo" && list.some((f) => f.type === "Factura" && isLinkedToInvoice(r, f)))
      .reduce((s, r) => s + (Math.abs(r.total) || 0), 0);
    const registros = list.filter((i) => i.type === "Factura" && tieneRecibo(i)).length;
    return { facturas, recibos, notasCredito, facturacionTotal, cobrosPendientes, cobrosRealizados, registros };
  }, [filteredForStats]);

  /** Porcentaje cobros realizados / facturación total (0–100) para la barra de progreso */
  const progressPct = useMemo(() => {
    if (stats.facturacionTotal <= 0) return 0;
    return Math.min(100, Math.round((stats.cobrosRealizados / stats.facturacionTotal) * 100));
  }, [stats.facturacionTotal, stats.cobrosRealizados]);

  function getObservaciones(inv: Invoice): string {
    if (inv.type === "Recibo" || inv.type === "Recibo Devolución" || inv.type === "Nota de Crédito") {
      const relatedNumber =
        inv.relatedInvoiceNumber ||
        (inv.relatedInvoiceId ? all.find((i) => i.id === inv.relatedInvoiceId)?.number : undefined);
      if (!relatedNumber) return "";

      if (inv.type === "Nota de Crédito") return `NC de ${relatedNumber}`;
      if (inv.type === "Recibo Devolución") return `Recibo devolución de ${relatedNumber}`;
      return `Recibo de ${relatedNumber}`;
    }
    return "";
  }

  function handleMailSentChange(inv: Invoice, value: MailSentStatus) {
    if (value === "NO" && getMailSent(inv.id) === "SI") {
      setConfirmNoMailSent(inv);
      return;
    }
    if (value === "Cancelado") {
      setConfirmCancelado(inv);
      return;
    }
    setMailSent(inv.id, value);
    forceUpdate((n) => n + 1);
    showToast(`Enviado por mail: ${value}`, "success");
  }

  async function confirmSetCancelado() {
    if (!confirmCancelado) return;
    const id = Number(confirmCancelado.id);
    if (!Number.isFinite(id)) {
      setConfirmCancelado(null);
      showToast("No se puede eliminar este documento.", "error");
      return;
    }
    try {
      await deleteInvoice(id);
      try {
        localStorage.removeItem(STORAGE_PREFIX + confirmCancelado.id);
      } catch {}
      setConfirmCancelado(null);
      fetchDocuments();
      showToast("Documento eliminado de la base de datos.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo eliminar.";
      showToast(msg, "error");
    }
  }

  function confirmSetNoMailSent() {
    if (!confirmNoMailSent) return;
    setMailSent(confirmNoMailSent.id, "NO");
    setConfirmNoMailSent(null);
    forceUpdate((n) => n + 1);
    showToast("Marcado como no enviado por mail.", "success");
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Control de Envío de Facturas y Recibos" showBackButton backTo="/hosting" backText="Volver a Hosting" />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-3 align-items-end facturas-mes-filtros-row">
                  <div className="col-6 col-md-2">
                    <label className="form-label small fw-bold mb-1">Mes</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                      {opcionesMesAnio.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6 col-md-3">
                    <label className="form-label small fw-bold mb-1">Cliente</label>
                    <input
                      className="form-control form-control-sm w-100"
                      placeholder="Buscar cliente..."
                      value={qClient}
                      onChange={(e) => setQClient(e.target.value)}
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label small fw-bold mb-1">Tipo</label>
                    <select
                      className="form-select form-select-sm w-100"
                      value={qType}
                      onChange={(e) => setQType(e.target.value as "" | ComprobanteType)}
                    >
                      <option value="">Todos</option>
                      <option value="Factura">Factura</option>
                      <option value="Recibo">Recibo</option>
                    </select>
                  </div>
                  <div className="col-6 col-md-auto d-flex align-items-end filtros-limpiar-col">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => {
                        setQClient("");
                        setQType("");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="col-6 col-md-auto d-flex align-items-end ms-md-auto">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => fetchDocuments()}
                      disabled={loading}
                    >
                      <i className="bi bi-arrow-clockwise me-1" />
                      Actualizar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="historial-filtros-outer flujo-emails-listado-outer">
            <div className="pendientes-listado-wrap">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-bold m-0 listado-table-title">📩 Flujo de Emails — {opcionesMesAnio.find((o) => o.value === selectedMonth)?.label ?? formatMonth(selectedMonth)}</h6>
          </div>
          <p className="text-muted small mb-3">
            Indicá si cada documento fue enviado por mail.
          </p>

          {fetchError ? (
            <div className="alert alert-warning d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-triangle" />
              <span>{fetchError}</span>
              <button type="button" className="btn btn-sm btn-outline-warning ms-auto" onClick={() => fetchDocuments()}>
                Reintentar
              </button>
            </div>
          ) : null}
          {loading ? (
            <p className="text-muted mb-0 py-4">Cargando documentos del historial...</p>
          ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle" style={{ fontSize: "0.9rem" }}>
              <thead className="table-dark">
                <tr>
                  <th className="text-start">N°</th>
                  <th className="text-start">Tipo</th>
                  <th className="text-start">Cliente</th>
                  <th className="text-start">Fecha</th>
                  <th className="text-start">Mes</th>
                  <th className="text-start">Total</th>
                  <th className="text-start">Observaciones</th>
                  <th className="text-start">Enviado por Mail</th>
                  <th className="text-center facturas-mes-col-estado">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-muted py-4">
                      {facturasEsteMes.length === 0
                        ? "No hay documentos emitidos en el mes seleccionado."
                        : "No se encontraron facturas con los filtros aplicados."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => (
                    <tr key={inv.id} className={isRowConnected(inv) ? "facturas-mes-row-connected" : undefined}>
                      <td className="fw-bold text-start">{inv.number}</td>
                      <td className="text-start">{inv.type === "Nota de Crédito" ? "NC" : inv.type}</td>
                      <td className="text-start">{inv.clientName}</td>
                      <td className="text-start">{inv.date}</td>
                      <td className="text-start" title={inv.month || undefined}>{formatMonth(inv.month)}</td>
                      <td className="text-start">{formatCurrency(inv.total)}</td>
                      <td className="text-start">{getObservaciones(inv)}</td>
                      <td className="text-start">
                        <select
                          className={`form-select form-select-sm ${getMailSent(inv.id) === "SI" ? "facturas-mes-mail-si" : getMailSent(inv.id) === "Cancelado" ? "facturas-mes-mail-cancelado" : ""}`}
                          style={{ width: "auto", minWidth: "6.5rem" }}
                          value={getMailSent(inv.id)}
                          onChange={(e) => handleMailSentChange(inv, e.target.value as MailSentStatus)}
                        >
                          <option value="NO">NO</option>
                          <option value="SI">SI</option>
                          <option value="Cancelado">Cancelado</option>
                        </select>
                      </td>
                      <td className="text-center facturas-mes-col-estado">
                        {fullySentConnectedIds.has(inv.id) ? (
                          <span title="Factura y recibo/NC enviados por mail"><span role="img" aria-hidden>✅✅</span> Confirmado</span>
                        ) : getMailSent(inv.id) === "SI" ? (
                          <span title="Enviado por mail"><span role="img" aria-hidden>✅</span> Confirmado</span>
                        ) : getMailSent(inv.id) === "Cancelado" ? (
                          <span title="Documento cancelado"><span role="img" aria-hidden>⛔</span> Cancelado</span>
                        ) : (
                          <span title="No enviado por mail"><span role="img" aria-hidden>🕐</span> Pendiente...</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}

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
                <div className="stat-value text-dark">{formatCurrencyNumber(stats.facturacionTotal)} <span className="currency">USD</span></div>
              </div>
            </div>
            <div className="col-6 col-md-2">
              <div className="card stat-card p-3">
                <div className="stat-accent bg-danger" />
                <div className="stat-label">Cobros pendientes</div>
                <div className="stat-value text-danger">{formatCurrencyNumber(stats.cobrosPendientes)} <span className="currency">USD</span></div>
              </div>
            </div>
            <div className="col-6 col-md-2">
              <div className="card stat-card p-3">
                <div className="stat-accent bg-success" />
                <div className="stat-label">Cobros realizados</div>
                <div className="stat-value text-success">{formatCurrencyNumber(stats.cobrosRealizados)} <span className="currency">USD</span></div>
              </div>
            </div>
          </div>
          <div className="row mt-3 g-3 historial-stats">
            <div className="col-12">
              <div className="card stat-card p-3">
                <div className="stat-progress-track">
                  <div className="stat-progress-fill bg-success" style={{ width: `${progressPct}%` }} title={`Cobros realizados: ${progressPct}% de la facturación total`} />
                </div>
                <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap mt-2">
                  <span className="stat-label mb-0">Facturas cobradas</span>
                  <span className="stat-value text-success mb-0">{stats.registros}</span>
                  <span className="stat-label mb-0 text-muted"> · Cobros realizados: </span>
                  <span className="stat-value text-success mb-0">{progressPct}%</span>
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>

        <ConfirmModal
          open={confirmNoMailSent !== null}
          title="¿Marcar como no enviado por mail?"
          message={
            confirmNoMailSent ? (
              <>
                <strong>{confirmNoMailSent.number}</strong> ({confirmNoMailSent.type === "Nota de Crédito" ? "NC" : confirmNoMailSent.type}) — {confirmNoMailSent.clientName}.
                <br />
                <span className="text-muted">Si confirmás, este documento quedará como "NO" enviado por mail.</span>
              </>
            ) : null
          }
          variant="warning"
          confirmLabel="Sí, poner NO"
          cancelLabel="Cancelar (seguir en SI)"
          onConfirm={confirmSetNoMailSent}
          onCancel={() => setConfirmNoMailSent(null)}
        />

        <ConfirmModal
          open={confirmCancelado !== null}
          title="¿Eliminar de la base de datos?"
          message={
            confirmCancelado ? (
              <>
                ¿Desea eliminar este documento de la base de datos?
                <br />
                <strong>{confirmCancelado.number}</strong> ({confirmCancelado.type}) — {confirmCancelado.clientName}.
                <br />
                <span className="text-muted">Esta acción no se puede deshacer.</span>
              </>
            ) : null
          }
          variant="delete"
          confirmLabel="Sí, eliminar"
          cancelLabel="No"
          onConfirm={confirmSetCancelado}
          onCancel={() => setConfirmCancelado(null)}
        />
      </div>
    </div>
  );
}
