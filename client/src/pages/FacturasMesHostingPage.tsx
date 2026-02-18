import { useEffect, useMemo, useState } from "react";
import { loadInvoices } from "../lib/storage";
import type { ComprobanteType, Invoice } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { showToast } from "../components/ToastNotification";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import "../styles/facturacion.css";

const STORAGE_PREFIX = "hosting_mail_sent_";

function getMailSent(invoiceId: string): "SI" | "NO" {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + invoiceId);
    if (v === "SI" || v === "NO") return v;
  } catch {}
  return "NO";
}

function setMailSent(invoiceId: string, value: "SI" | "NO") {
  try {
    localStorage.setItem(STORAGE_PREFIX + invoiceId, value);
  } catch (e) {
    showToast("No se pudo guardar.", "error");
  }
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

/** Formatea mes YYYY-MM a "feb-2026" (mes del documento en emisión) */
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

export function FacturasMesHostingPage() {
  const [all] = useState<Invoice[]>(() => loadInvoices());
  const [, forceUpdate] = useState(0);
  const [qClient, setQClient] = useState("");
  const [qType, setQType] = useState<"" | ComprobanteType>("");
  /** Mes/año a mostrar (YYYY-MM); por defecto mes actual */
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentMonthValue());
  /** Cuando el usuario intenta pasar de SI a NO, guardamos el documento para pedir confirmación */
  const [confirmNoMailSent, setConfirmNoMailSent] = useState<Invoice | null>(null);

  /** Opciones de mes desde el primer mes (inv.month) con datos en la base hasta el mes actual */
  const opcionesMesAnio = useMemo(() => {
    const hoy = new Date();
    const endYear = hoy.getFullYear();
    const endMonth = hoy.getMonth(); /* 0-indexed */

    let startYear: number;
    let startMonth: number;

    if (all.length === 0) {
      startYear = endYear;
      startMonth = endMonth;
    } else {
      let minYear = endYear + 1;
      let minMonth = 12;
      for (const inv of all) {
        const mm = inv.month && inv.month.length >= 7 ? inv.month : "";
        if (!mm) continue;
        const [y, m] = mm.split("-").map(Number);
        const month0 = (m || 1) - 1;
        if (y < minYear || (y === minYear && month0 < minMonth)) {
          minYear = y;
          minMonth = month0;
        }
      }
      startYear = minYear;
      startMonth = minMonth;
    }

    const opciones: { value: string; label: string }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === endYear ? endMonth : 11;
      for (let m = mStart; m <= mEnd; m++) {
        const value = `${y}-${String(m + 1).padStart(2, "0")}`;
        const d = new Date(y, m, 1);
        const mes = d.toLocaleDateString("es-AR", { month: "short" });
        opciones.push({ value, label: `${mes}-${y}` });
      }
    }
    return opciones.reverse(); /* más recientes primero */
  }, [all]);

  /** Si el mes seleccionado no está en las opciones (p. ej. datos recién cargados), elegir el más reciente */
  useEffect(() => {
    if (opcionesMesAnio.length === 0) return;
    const exists = opcionesMesAnio.some((o) => o.value === selectedMonth);
    if (!exists) setSelectedMonth(opcionesMesAnio[0].value);
  }, [opcionesMesAnio, selectedMonth]);

  /** Documentos del mes seleccionado: filtro por inv.month (mes del documento), no por fecha de emisión */
  const facturasEsteMes = useMemo(() => {
    return all.filter((inv) => {
      const docMonth = inv.month && inv.month.length >= 7 ? inv.month : ""; // YYYY-MM
      return docMonth === selectedMonth;
    }).sort((a, b) => {
      const pa = parseDateMonth(a.date);
      const pb = parseDateMonth(b.date);
      if (!pa || !pb) return 0;
      if (pa.year !== pb.year) return pb.year - pa.year;
      if (pa.month !== pb.month) return pb.month - pa.month;
      return 0;
    });
  }, [all, selectedMonth]);

  const filtered = useMemo(() => {
    const client = qClient.trim().toLowerCase();
    return facturasEsteMes.filter((inv) => {
      const okClient = !client || inv.clientName.toLowerCase().includes(client);
      const okType = !qType || inv.type === qType;
      return okClient && okType;
    });
  }, [facturasEsteMes, qClient, qType]);

  /** IDs de facturas que están conectadas con un Recibo o NC en la lista (para pintar ambas filas) */
  const connectedFacturaIds = useMemo(() => {
    const facturaIds = new Set(filtered.filter((i) => i.type === "Factura").map((i) => i.id));
    const connected = new Set<string>();
    for (const inv of filtered) {
      if ((inv.type === "Recibo" || inv.type === "Nota de Crédito") && inv.relatedInvoiceId && facturaIds.has(inv.relatedInvoiceId)) {
        connected.add(inv.relatedInvoiceId);
      }
    }
    return connected;
  }, [filtered]);

  function isRowConnected(inv: Invoice): boolean {
    if (inv.type === "Factura") return connectedFacturaIds.has(inv.id);
    if ((inv.type === "Recibo" || inv.type === "Nota de Crédito") && inv.relatedInvoiceId) return connectedFacturaIds.has(inv.relatedInvoiceId);
    return false;
  }

  /** IDs de documentos que forman un par factura+recibo/NC y ambos están marcados como enviados por mail */
  function getFullySentConnectedIds(): Set<string> {
    const set = new Set<string>();
    for (const facturaId of connectedFacturaIds) {
      const facturaRow = filtered.find((i) => i.type === "Factura" && i.id === facturaId);
      if (!facturaRow) continue;
      const group = [facturaRow, ...filtered.filter((i) => i.relatedInvoiceId === facturaId)];
      const allSent = group.every((inv) => getMailSent(inv.id) === "SI");
      if (allSent) group.forEach((inv) => set.add(inv.id));
    }
    return set;
  }
  const fullySentConnectedIds = getFullySentConnectedIds();

  /** Resumen de lo que muestra la tabla (filtered). registros = solo facturas cobradas (con recibo). */
  const stats = useMemo(() => {
    const facturas = filtered.filter((i) => i.type === "Factura").length;
    const recibos = filtered.filter((i) => i.type === "Recibo").length;
    const notasCredito = filtered.filter((i) => i.type === "Nota de Crédito").length;
    const sumaFacturas = filtered.filter((i) => i.type === "Factura").reduce((s, i) => s + (Number(i.total) || 0), 0);
    const sumaNC = filtered.filter((i) => i.type === "Nota de Crédito").reduce((s, i) => s + (Math.abs(i.total) || 0), 0);
    const facturacionTotal = sumaFacturas - sumaNC;
    const facturasPendientes = filtered.filter((i) => {
      if (i.type !== "Factura") return false;
      const tieneRecibo = filtered.some((r) => r.type === "Recibo" && r.relatedInvoiceId === i.id);
      return !tieneRecibo;
    });
    const cobrosPendientes = facturasPendientes.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const cobrosRealizados = facturacionTotal - cobrosPendientes;
    /** Registros = solo facturas que ya están cobradas (tienen recibo asociado) */
    const registros = filtered.filter(
      (i) => i.type === "Factura" && filtered.some((r) => r.type === "Recibo" && r.relatedInvoiceId === i.id)
    ).length;
    return { facturas, recibos, notasCredito, facturacionTotal, cobrosPendientes, cobrosRealizados, registros };
  }, [filtered]);

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

  function handleMailSentChange(inv: Invoice, value: "SI" | "NO") {
    if (value === "NO" && getMailSent(inv.id) === "SI") {
      setConfirmNoMailSent(inv);
      return;
    }
    setMailSent(inv.id, value);
    forceUpdate((n) => n + 1);
    showToast(`Enviado por mail: ${value}`, "success");
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
                      <option value="Nota de Crédito">Nota de Crédito</option>
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
                          className={`form-select form-select-sm ${getMailSent(inv.id) === "SI" ? "facturas-mes-mail-si" : ""}`}
                          style={{ width: "auto", minWidth: "5rem" }}
                          value={getMailSent(inv.id)}
                          onChange={(e) => handleMailSentChange(inv, e.target.value as "SI" | "NO")}
                        >
                          <option value="NO">NO</option>
                          <option value="SI">SI</option>
                        </select>
                      </td>
                      <td className="text-center facturas-mes-col-estado">
                        {fullySentConnectedIds.has(inv.id) ? (
                          <span title="Factura y recibo/NC enviados por mail"><span role="img" aria-hidden>✅✅</span> Confirmado</span>
                        ) : getMailSent(inv.id) === "SI" ? (
                          <span title="Enviado por mail"><span role="img" aria-hidden>✅</span> Confirmado</span>
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
      </div>
    </div>
  );
}
