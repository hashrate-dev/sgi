import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canEditFacturacion } from "../lib/auth";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import { sgiHome } from "../lib/marketplacePaths.js";
import { isClienteTiendaOnline } from "../lib/clientTienda";
import { clientName2ForComprobante } from "../lib/clientInvoiceDisplay";
import { formatUSD } from "../lib/formatCurrency";
import { generateFacturaPdf, loadImageAsBase64 } from "../lib/generateFacturaPdf";
import { showToast } from "../components/ToastNotification";
import {
  authorizeHostingBillingAgentDraft,
  generateHostingBillingAgentDrafts,
  getClients,
  getHostingBillingAgent,
  getHostingBillingAgentDrafts,
  importHostingBillingAgentLastInvoice,
  putHostingBillingAgentClient,
  putHostingBillingAgentSettings,
  putHostingBillingAgentUnits,
  rejectHostingBillingAgentDraft,
  removeHostingBillingAgentClient,
  addHostingBillingAgentClient,
  testPreviewHostingBillingAgent,
  type HostingBillingAgentClient,
  type HostingBillingAgentDraft,
  type HostingBillingAgentGarantia,
  type HostingBillingAgentLine,
  type HostingBillingAgentTestPreview,
} from "../lib/api";
import type { Client, LineItem } from "../lib/types";
import "../styles/facturacion.css";

const PATH = "/gestion-administrativa/agentes-facturacion-hosting";

function buildHostingPdfFilename(number: string, clientName: string, monthStr: string): string {
  const safeName = (clientName.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() || "cliente").replace(/\s+/g, "_");
  const meses: Record<string, string> = {
    "01": "ENERO",
    "02": "FEBRERO",
    "03": "MARZO",
    "04": "ABRIL",
    "05": "MAYO",
    "06": "JUNIO",
    "07": "JULIO",
    "08": "AGOSTO",
    "09": "SEPTIEMBRE",
    "10": "OCTUBRE",
    "11": "NOVIEMBRE",
    "12": "DICIEMBRE",
  };
  const [year, month] = monthStr.split("-");
  const mesLabel = (month && meses[month]) || "SIN_MES";
  const anio = year || new Date().getFullYear().toString();
  return `HRS_GROUP_${number}_${safeName}_${mesLabel}_${anio}.pdf`;
}

function energyUsdDay(watts: number, usdPerKwh: number): number {
  const w = Math.max(0, Number(watts) || 0);
  const rate = Math.max(0, Number(usdPerKwh) || 0);
  return Math.round((w / 1000) * 24 * rate * 100) / 100;
}

function energyUsdMonth(watts: number, days: number, usdPerKwh: number): number {
  const d = Math.max(0, Number(days) || 0);
  const w = Math.max(0, Number(watts) || 0);
  const rate = Math.max(0, Number(usdPerKwh) || 0);
  return Math.round((w / 1000) * 24 * d * rate * 100) / 100;
}

function parseDueDateStr(s: string): Date | undefined {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function statusLabel(s: string): string {
  if (s === "authorized") return "Autorizada";
  if (s === "rejected") return "Rechazada";
  if (s === "already_emitted") return "Ya emitida (manual)";
  return "Pendiente de autorización";
}

export function HostingBillingAgentPage() {
  const { user } = useAuth();
  const canView = Boolean(user && canUserAccessNavPath(user, PATH));
  const canWrite = Boolean(user && canEditFacturacion(user));

  const [loading, setLoading] = useState(true);
  const [usdPerKwh, setUsdPerKwh] = useState(0.078);
  const [dueDateDays, setDueDateDays] = useState<5 | 6 | 7>(6);
  const [addInclude4pct, setAddInclude4pct] = useState(false);
  const [catalog, setCatalog] = useState<
    Array<{ code: string; name: string; price: number; defaultWatts: number; wattsFromGarantia?: boolean }>
  >([]);
  const [garantias, setGarantias] = useState<HostingBillingAgentGarantia[]>([]);
  const [enrolled, setEnrolled] = useState<HostingBillingAgentClient[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [addClientId, setAddClientId] = useState<string>("");
  const [month, setMonth] = useState("");
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [drafts, setDrafts] = useState<HostingBillingAgentDraft[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState<HostingBillingAgentDraft | null>(null);
  const [testClientId, setTestClientId] = useState<string>("");
  const [testResult, setTestResult] = useState<HostingBillingAgentTestPreview | null>(null);

  const loadAll = useCallback(async (prefMonth?: string) => {
    const [meta, clientsRes] = await Promise.all([getHostingBillingAgent(), getClients().catch(() => ({ clients: [] as Client[] }))]);
    setUsdPerKwh(meta.settings.usdPerKwh);
    setDueDateDays(meta.settings.dueDateDays);
    setCatalog(meta.catalog);
    setGarantias(meta.garantias || []);
    setEnrolled(meta.clients);
    setAllClients(((clientsRes.clients ?? []) as Client[]).filter((c) => !isClienteTiendaOnline(c)));
    const m = prefMonth || meta.defaultClosedMonth;
    setMonth(m);
    const d = await getHostingBillingAgentDrafts(m);
    setDaysInMonth(d.daysInMonth);
    setDrafts(d.drafts);
  }, []);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadAll();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "No se pudo cargar el agente.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, loadAll]);

  const enrolledIds = useMemo(() => new Set(enrolled.map((c) => c.clientId)), [enrolled]);
  const addOptions = useMemo(
    () => allClients.filter((c) => c.id != null && !enrolledIds.has(Number(c.id))),
    [allClients, enrolledIds]
  );

  async function saveSettings() {
    if (!canWrite) return;
    setBusy(true);
    try {
      await putHostingBillingAgentSettings({ usdPerKwh, dueDateDays });
      showToast("Configuración del agente guardada.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addClient() {
    const id = Number(addClientId);
    if (!canWrite || !Number.isFinite(id) || id <= 0) return;
    setBusy(true);
    try {
      const r = await addHostingBillingAgentClient(id, { include4pct: addInclude4pct });
      setEnrolled(r.clients);
      setAddClientId("");
      setAddInclude4pct(false);
      showToast("Cliente agregado al agente. Se importaron equipos de la última factura si existía.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo agregar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runTesting() {
    const cid = Number(testClientId);
    if (!testClientId || !Number.isFinite(cid) || cid <= 0) {
      showToast("Elegí un cliente para el testing.", "warning");
      return;
    }
    if (!month) {
      showToast("Elegí el mes a probar.", "warning");
      return;
    }
    setBusy(true);
    try {
      const r = await testPreviewHostingBillingAgent({
        month,
        clientId: cid,
        usdPerKwh,
      });
      setTestResult(r);
      showToast("Testing listo: no se emitió ninguna factura.", "success");
    } catch (e) {
      setTestResult(null);
      showToast(e instanceof Error ? e.message : "No se pudo correr el testing.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!canWrite) return;
    setBusy(true);
    try {
      const r = await generateHostingBillingAgentDrafts(month || undefined);
      setMonth(r.month);
      setDaysInMonth(r.daysInMonth);
      setDrafts(r.drafts);
      showToast(
        `Borradores del mes cerrado: ${r.summary.created} nuevos, ${r.summary.refreshed} actualizados. Ninguna factura se emitió.`,
        "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudieron generar los borradores.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onMonthChange(next: string) {
    setMonth(next);
    setBusy(true);
    try {
      const d = await getHostingBillingAgentDrafts(next);
      setDaysInMonth(d.daysInMonth);
      setDrafts(d.drafts);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo cargar el mes.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doAuthorize(d: HostingBillingAgentDraft, downloadPdf: boolean) {
    if (!canWrite) return;
    setBusy(true);
    try {
      const r = await authorizeHostingBillingAgentDraft(d.id);
      setDrafts((prev) => prev.map((x) => (x.id === d.id ? r.draft : x)));
      setConfirmDraft(null);
      showToast(`Factura ${r.invoice.number} autorizada y registrada en historial de hosting.`, "success");
      if (downloadPdf) await downloadPdfFromInvoice(r.invoice, r.draft);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo autorizar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doReject(d: HostingBillingAgentDraft) {
    if (!canWrite) return;
    setBusy(true);
    try {
      const r = await rejectHostingBillingAgentDraft(d.id);
      setDrafts((prev) => prev.map((x) => (x.id === d.id ? r.draft : x)));
      showToast("Borrador rechazado. No se emitió factura.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo rechazar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdfFromInvoice(
    inv: {
      number: string;
      clientName: string;
      clientPhone?: string;
      clientEmail?: string;
      clientAddress?: string;
      clientCity?: string;
      clientName2?: string;
      clientPhone2?: string;
      clientEmail2?: string;
      clientAddress2?: string;
      clientCity2?: string;
      date: string;
      dueDate?: string;
      month: string;
      subtotal: number;
      discounts: number;
      total: number;
      items: HostingBillingAgentLine[];
    },
    draft: HostingBillingAgentDraft
  ) {
    const items: LineItem[] = (inv.items || draft.items).map((it) => ({
      serviceKey: it.serviceKey,
      serviceName: it.serviceName,
      month: it.month,
      quantity: it.quantity,
      price: it.price,
      discount: it.discount,
    }));
    let logoBase64: string | undefined;
    try {
      logoBase64 = await loadImageAsBase64("/images/LOGO-HASHRATE.png");
    } catch {
      /* logo opcional */
    }
    const dateParts = String(inv.date || "").split("/");
    const invoiceDate =
      dateParts.length === 3
        ? new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]))
        : new Date();
    const doc = generateFacturaPdf(
      {
        number: inv.number,
        type: "Factura",
        clientName: inv.clientName,
        clientPhone: inv.clientPhone,
        clientEmail: inv.clientEmail,
        clientAddress: inv.clientAddress,
        clientCity: inv.clientCity,
        clientName2: clientName2ForComprobante(inv.clientName, inv.clientName2),
        clientPhone2: inv.clientPhone2,
        clientEmail2: inv.clientEmail2,
        clientAddress2: inv.clientAddress2,
        clientCity2: inv.clientCity2,
        date: invoiceDate,
        items,
        subtotal: inv.subtotal,
        discounts: inv.discounts,
        total: inv.total,
        dueDate: inv.dueDate ? parseDueDateStr(inv.dueDate) : undefined,
        dueDateDays,
      },
      { logoBase64 }
    );
    doc.save(buildHostingPdfFilename(inv.number, inv.clientName, inv.month || draft.serviceMonth));
  }

  async function downloadAuthorized(d: HostingBillingAgentDraft) {
    if (!d.invoiceNumber) return;
    const enrolledClient = enrolled.find((c) => c.clientId === d.clientId);
    await downloadPdfFromInvoice(
      {
        number: d.invoiceNumber,
        clientName: d.clientName,
        clientPhone: enrolledClient?.phone,
        clientEmail: enrolledClient?.email,
        clientAddress: enrolledClient?.address,
        clientCity: enrolledClient?.city,
        clientName2: enrolledClient?.name2,
        date: new Date().toLocaleDateString(),
        month: d.serviceMonth,
        subtotal: d.subtotal,
        discounts: d.discounts,
        total: d.total,
        items: d.items,
      },
      d
    );
  }

  async function saveUnits(c: HostingBillingAgentClient, units: HostingBillingAgentClient["units"]) {
    if (!canWrite) return;
    setBusy(true);
    try {
      const r = await putHostingBillingAgentUnits(
        c.clientId,
        units.map((u) => ({
          serviceKey: u.serviceKey,
          garantiaId: u.garantiaId || undefined,
          quantity: u.quantity,
          watts: u.watts,
          discount: u.discount,
        }))
      );
      setEnrolled(r.clients);
      showToast("Equipos del cliente actualizados.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar equipos.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <Navigate to={sgiHome()} replace />;
  if (!canView) return <Navigate to={sgiHome()} replace />;

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Agentes Facturación de Hosting" showBackButton backTo="/gestion-administrativa" backText="Volver a Gestión Administrativa" />

        <div className="hrs-card hrs-card--rect p-4 mb-3">
          <p className="mb-2">
            Este agente arma las facturas del <strong>mes cerrado</strong> (a mes vencido: los primeros días del mes
            actual factura febrero si hoy es marzo, con 28/29/30/31 días según el calendario). El consumo en W sale
            de{" "}
            <Link to="/gestion-administrativa/valores-garantias-asic" className="link-success">
              Valores de garantías ASIC
            </Link>{" "}
            (el consumo W de cada máquina de esa tabla) y se combina con los días del mes y la tarifa USD/kWh.
          </p>
          <p className="text-muted small mb-0">
            Nada se emite solo: el administrador revisa cada borrador y lo <strong>autoriza</strong>. La emisión manual
            sigue en{" "}
            <Link to="/hosting/billing" className="link-success">
              Emitir Facturas de Hosting
            </Link>
            .
          </p>
        </div>

        {loading ? (
          <p className="text-muted">Cargando agente…</p>
        ) : (
          <>
            <div className="hrs-card hrs-card--rect p-4 mb-3">
              <h6 className="fw-bold border-bottom pb-2">Configuración</h6>
              <div className="row g-3 align-items-end">
                <div className="col-md-3">
                  <label className="form-label small fw-bold">USD / kWh</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    step="0.001"
                    min={0.001}
                    value={usdPerKwh}
                    disabled={!canWrite || busy}
                    onChange={(e) => setUsdPerKwh(Number(e.target.value))}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-bold">Vencimiento</label>
                  <div className="d-flex gap-2">
                    {([5, 6, 7] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`btn btn-sm ${dueDateDays === d ? "btn-success" : "btn-outline-secondary"}`}
                        disabled={!canWrite || busy}
                        onClick={() => setDueDateDays(d)}
                      >
                        {d} días
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-md-3">
                  {canWrite ? (
                    <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void saveSettings()}>
                      Guardar configuración
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hrs-card hrs-card--rect p-4 mb-3">
              <h6 className="fw-bold border-bottom pb-2">Consumo W de Valores de garantías ASIC</h6>
              <p className="small text-muted mb-3">
                Esta es la misma tabla de{" "}
                <Link to="/gestion-administrativa/valores-garantias-asic" className="link-success">
                  Valores de garantías ASIC
                </Link>
                . El agente toma el W de la fila exacta (marca + modelo + procesador). Un S21 235 ths no es el mismo W
                que un S21 270 ths; un Z15K no es un Z15Pro.
              </p>
              {garantias.length === 0 ? (
                <p className="text-warning small mb-0">No hay filas con consumo cargado. Cargalas en Valores de garantías ASIC.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0" style={{ fontSize: "0.82rem" }}>
                    <thead>
                      <tr>
                        <th>Marca</th>
                        <th>Modelo</th>
                        <th>Procesador</th>
                        <th>Consumo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {garantias.map((g) => (
                        <tr key={g.id}>
                          <td>{g.marca}</td>
                          <td>{g.modelo}</td>
                          <td>{g.procesador}</td>
                          <td>{g.consumoW.toLocaleString("es-PY")} W</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="hrs-card hrs-card--rect p-4 mb-3" style={{ border: "1px dashed rgba(234, 179, 8, 0.7)" }}>
              <h6 className="fw-bold border-bottom pb-2">Testing (no emite facturas)</h6>
              <p className="small text-muted mb-3">
                Simula el cálculo del agente para un cliente y un mes: días del mes, consumo W de Valores de garantías
                ASIC, kWh y total. <strong>No guarda borradores ni crea documentos</strong>.
              </p>
              <div className="row g-2 align-items-end mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-bold">Cliente de prueba</label>
                  <select className="form-select form-select-sm" value={testClientId} onChange={(e) => setTestClientId(e.target.value)}>
                    <option value="">Elegí un cliente…</option>
                    {allClients.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-bold">Mes a simular</label>
                  <input type="month" className="form-control form-control-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div className="col-md-3">
                  <button type="button" className="btn btn-warning btn-sm" disabled={busy} onClick={() => void runTesting()}>
                    Correr testing
                  </button>
                </div>
              </div>
              {testResult ? (
                <div>
                  <div className="alert alert-warning py-2 small mb-3">
                    Modo testing · mes {testResult.month} · {testResult.daysInMonth} días · {testResult.formula} · USD/kWh{" "}
                    {testResult.usdPerKwh} · filas de garantías ASIC: {testResult.garantiaRows} · emite factura: no
                  </div>
                  {testResult.previews.map((p) => (
                    <div key={p.clientId} className="mb-3">
                      <div className="d-flex flex-wrap gap-2 small mb-2">
                        <span className="badge text-bg-secondary">{p.clientCode}</span>
                        <strong>{p.clientName}</strong>
                        <span className={p.checks.wattsFromGarantiaAsic ? "text-success" : "text-warning"}>
                          {p.checks.wattsFromGarantiaAsic ? "W conectado a garantías ASIC" : "W no encontrado en garantías ASIC"}
                        </span>
                        <span>{p.include4pct ? "4% gastos op. marcado" : "Sin 4% gastos op."}</span>
                        <span>{p.checks.hasItems ? "Ítems OK" : "Sin ítems"}</span>
                        <span>{p.checks.totalPositive ? `Total ${formatUSD(p.total)}` : "Total 0"}</span>
                        {p.existingInvoiceNumber ? <span>Ya hay {p.existingInvoiceNumber} (no se duplicaría)</span> : null}
                      </div>
                      {p.warning ? <div className="text-muted small mb-2">{p.warning}</div> : null}
                      <div className="table-responsive">
                        <table className="table table-sm mb-0" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr>
                              <th>Servicio</th>
                              <th>W</th>
                              <th>Origen W</th>
                              <th>Cant.</th>
                              <th>Días</th>
                              <th>kWh mes</th>
                              <th>Energía / día (1 eq.)</th>
                              <th>Energía / mes (1 eq.)</th>
                              <th>Total línea</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.items.map((it, i) => (
                              <tr key={i}>
                                <td>{it.serviceName}</td>
                                <td>{it.watts || "—"}</td>
                                <td>
                                  {it.serviceKey === "D"
                                    ? "4%"
                                    : it.garantiaLabel
                                      ? it.garantiaLabel
                                      : it.wattsSource === "garantia-asic"
                                        ? "Valores de garantías ASIC"
                                        : "Elegí la fila exacta en garantías ASIC"}
                                </td>
                                <td>{it.quantity}</td>
                                <td>{it.daysInMonth || p.checks.daysInMonth}</td>
                                <td>{it.kwhMonth ? it.kwhMonth.toLocaleString("es-PY", { maximumFractionDigits: 1 }) : "—"}</td>
                                <td>
                                  {it.serviceKey === "D" || !it.watts
                                    ? "—"
                                    : formatUSD(energyUsdDay(it.watts, it.usdPerKwh || usdPerKwh))}
                                </td>
                                <td>
                                  {it.serviceKey === "D" || !it.watts
                                    ? "—"
                                    : formatUSD(
                                        energyUsdMonth(it.watts, it.daysInMonth || p.checks.daysInMonth, it.usdPerKwh || usdPerKwh)
                                      )}
                                </td>
                                <td>{formatUSD((it.price - it.discount) * it.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th colSpan={4}>Totales testing</th>
                              <th>{p.checks.daysInMonth}</th>
                              <th>{p.kwhTotal ? p.kwhTotal.toLocaleString("es-PY", { maximumFractionDigits: 1 }) : "—"}</th>
                              <th />
                              <th />
                              <th>{formatUSD(p.total)}</th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small text-muted mb-0">Todavía no hay una corrida de testing. Elegí cliente y mes y pulsá Correr testing.</p>
              )}
            </div>

            <div className="hrs-card hrs-card--rect p-4 mb-3">
              <h6 className="fw-bold border-bottom pb-2">Clientes que factura el agente todos los meses</h6>
              {canWrite ? (
                <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
                  <div className="flex-grow-1" style={{ minWidth: 240 }}>
                    <label className="form-label small fw-bold">Agregar cliente hosting</label>
                    <select className="form-select form-select-sm" value={addClientId} onChange={(e) => setAddClientId(e.target.value)}>
                      <option value="">Elegí un cliente…</option>
                      {addOptions.map((c) => (
                        <option key={String(c.id)} value={String(c.id)}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="form-check mb-1">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={addInclude4pct}
                      disabled={busy}
                      onChange={(e) => setAddInclude4pct(e.target.checked)}
                    />
                    <span className="form-check-label small">4% gastos operativos</span>
                  </label>
                  <button type="button" className="btn btn-outline-success btn-sm" disabled={!addClientId || busy} onClick={() => void addClient()}>
                    Agregar
                  </button>
                </div>
              ) : null}

              {enrolled.length === 0 ? (
                <p className="text-muted small mb-0">Todavía no hay clientes en el agente. Agregá los que se facturan todos los meses.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle" style={{ fontSize: "0.85rem" }}>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Equipos</th>
                        <th>Activo</th>
                        <th>4% gastos op.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {enrolled.map((c) => (
                        <AgentClientRow
                          key={c.clientId}
                          client={c}
                          catalog={catalog}
                          garantias={garantias}
                          canWrite={canWrite}
                          busy={busy}
                          usdPerKwh={usdPerKwh}
                          daysInMonth={daysInMonth}
                          onToggleActive={async (active) => {
                            const r = await putHostingBillingAgentClient(c.clientId, { active });
                            setEnrolled(r.clients);
                          }}
                          onToggle4pct={async (include4pct) => {
                            const r = await putHostingBillingAgentClient(c.clientId, { include4pct });
                            setEnrolled(r.clients);
                          }}
                          onImport={async () => {
                            setBusy(true);
                            try {
                              const r = await importHostingBillingAgentLastInvoice(c.clientId);
                              setEnrolled(r.clients);
                              showToast(`Equipos importados de la factura ${r.importedFromMonth}.`, "success");
                            } catch (e) {
                              showToast(e instanceof Error ? e.message : "No hay factura previa.", "error");
                            } finally {
                              setBusy(false);
                            }
                          }}
                          onSaveUnits={(units) => void saveUnits(c, units)}
                          onRemove={async () => {
                            setBusy(true);
                            try {
                              const r = await removeHostingBillingAgentClient(c.clientId);
                              setEnrolled(r.clients);
                            } catch (e) {
                              showToast(e instanceof Error ? e.message : "No se pudo quitar.", "error");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="hrs-card hrs-card--rect p-4">
              <div className="d-flex flex-wrap gap-2 align-items-end justify-content-between mb-3">
                <div>
                  <h6 className="fw-bold mb-1">Borradores del mes cerrado</h6>
                  <p className="text-muted small mb-0">
                    Mes de servicio: <strong>{month}</strong> · {daysInMonth} días. Autorizar emite la factura real.
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-end">
                  <div>
                    <label className="form-label small fw-bold">Mes</label>
                    <input
                      type="month"
                      className="form-control form-control-sm"
                      value={month}
                      onChange={(e) => void onMonthChange(e.target.value)}
                    />
                  </div>
                  {canWrite ? (
                    <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void generate()}>
                      Generar / actualizar borradores
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-sm align-middle" style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Días</th>
                      <th>kWh</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th>Factura</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-muted text-center py-4">
                          No hay borradores para este mes. Generá el mes cerrado cuando estén los clientes y equipos.
                        </td>
                      </tr>
                    ) : (
                      drafts.map((d) => {
                        const kwh = d.items.filter((i) => i.serviceKey !== "D").reduce((a, i) => a + (i.kwhMonth || 0), 0);
                        const open = expandedId === d.id;
                        return (
                          <Fragment key={d.id}>
                            <tr>
                              <td>
                                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setExpandedId(open ? null : d.id)}>
                                  {d.clientName}
                                </button>
                              </td>
                              <td>{d.daysInMonth}</td>
                              <td>{kwh ? kwh.toLocaleString("es-PY", { maximumFractionDigits: 1 }) : "—"}</td>
                              <td>{formatUSD(d.total)}</td>
                              <td>{statusLabel(d.status)}</td>
                              <td>
                                <code>{d.invoiceNumber || "—"}</code>
                              </td>
                              <td className="text-nowrap">
                                {canWrite && d.status === "draft" ? (
                                  <>
                                    <button type="button" className="btn btn-success btn-sm me-1" disabled={busy} onClick={() => setConfirmDraft(d)}>
                                      Autorizar
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => void doReject(d)}>
                                      Rechazar
                                    </button>
                                  </>
                                ) : null}
                                {(d.status === "authorized" || d.status === "already_emitted") && d.invoiceNumber ? (
                                  <button type="button" className="btn btn-outline-success btn-sm" onClick={() => void downloadAuthorized(d)}>
                                    PDF
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                            {open ? (
                              <tr>
                                <td colSpan={7}>
                                  {d.warning ? <div className="alert alert-warning py-2 small">{d.warning}</div> : null}
                                  <table className="table table-sm mb-0">
                                    <thead>
                                      <tr>
                                        <th>Servicio</th>
                                        <th>W</th>
                                        <th>Máquina (garantías ASIC)</th>
                                        <th>Cant.</th>
                                        <th>Días</th>
                                        <th>Energía / día (1 eq.)</th>
                                        <th>Energía / mes (1 eq.)</th>
                                        <th>Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {d.items.map((it, i) => (
                                        <tr key={i}>
                                          <td>{it.serviceName}</td>
                                          <td>{it.watts || "—"}</td>
                                          <td>{it.serviceKey === "D" ? "—" : it.garantiaLabel || "—"}</td>
                                          <td>{it.quantity}</td>
                                          <td>{it.daysInMonth || d.daysInMonth}</td>
                                          <td>
                                            {it.serviceKey === "D" || !it.watts
                                              ? "—"
                                              : formatUSD(energyUsdDay(it.watts, it.usdPerKwh || usdPerKwh))}
                                          </td>
                                          <td>
                                            {it.serviceKey === "D" || !it.watts
                                              ? "—"
                                              : formatUSD(
                                                  energyUsdMonth(it.watts, it.daysInMonth || d.daysInMonth, it.usdPerKwh || usdPerKwh)
                                                )}
                                          </td>
                                          <td>{formatUSD((it.price - it.discount) * it.quantity)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {confirmDraft ? (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,.45)" }} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Autorizar factura</h5>
                <button type="button" className="btn-close" onClick={() => setConfirmDraft(null)} />
              </div>
              <div className="modal-body">
                <p>
                  Vas a emitir la factura real de hosting de <strong>{confirmDraft.clientName}</strong> por el mes{" "}
                  <strong>{confirmDraft.serviceMonth}</strong> ({confirmDraft.daysInMonth} días) por{" "}
                  <strong>{formatUSD(confirmDraft.total)}</strong>.
                </p>
                <p className="small text-muted mb-0">Sin autorización el agente no registra el documento.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setConfirmDraft(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-outline-success btn-sm" disabled={busy} onClick={() => void doAuthorize(confirmDraft, false)}>
                  Autorizar sin PDF
                </button>
                <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void doAuthorize(confirmDraft, true)}>
                  Autorizar y PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgentClientRow({
  client,
  catalog,
  garantias,
  usdPerKwh,
  daysInMonth,
  canWrite,
  busy,
  onToggleActive,
  onToggle4pct,
  onImport,
  onSaveUnits,
  onRemove,
}: {
  client: HostingBillingAgentClient;
  catalog: Array<{ code: string; name: string; defaultWatts: number; wattsFromGarantia?: boolean }>;
  garantias: HostingBillingAgentGarantia[];
  usdPerKwh: number;
  daysInMonth: number;
  canWrite: boolean;
  busy: boolean;
  onToggleActive: (active: boolean) => Promise<void>;
  onToggle4pct: (include4pct: boolean) => Promise<void>;
  onImport: () => void;
  onSaveUnits: (units: HostingBillingAgentClient["units"]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(client.units);
  useEffect(() => setUnits(client.units), [client.units]);

  function garantiaFor(u: HostingBillingAgentClient["units"][number]) {
    if (u.garantiaId) return garantias.find((g) => g.id === u.garantiaId) ?? null;
    return null;
  }

  return (
    <>
      <tr>
        <td>
          <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setOpen((v) => !v)}>
            {client.code} — {client.name}
          </button>
        </td>
        <td>{client.units.reduce((a, u) => a + u.quantity, 0)} eq.</td>
        <td>
          <input
            type="checkbox"
            checked={client.active}
            disabled={!canWrite || busy}
            onChange={(e) => void onToggleActive(e.target.checked)}
          />
        </td>
        <td>
          <input
            type="checkbox"
            checked={Boolean(client.include4pct)}
            disabled={!canWrite || busy}
            title="4% Gastos Operativos Transferencia solo para este cliente"
            onChange={(e) => void onToggle4pct(e.target.checked)}
          />
        </td>
        <td className="text-nowrap">
          {canWrite ? (
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={onRemove}>
              Quitar
            </button>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5}>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {canWrite ? (
                <>
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={onImport}>
                    Importar última factura
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const g = garantias[0];
                      const cat = catalog[0];
                      setUnits((prev) => [
                        ...prev,
                        {
                          id: 0,
                          clientId: client.clientId,
                          serviceKey: g?.serviceKey || cat?.code || "A",
                          serviceName: g?.serviceName || cat?.name || "",
                          quantity: 1,
                          watts: g?.consumoW || 0,
                          discount: 0,
                          garantiaId: g?.id ?? null,
                          garantiaLabel: g?.label || "",
                        },
                      ]);
                    }}
                  >
                    + Equipo
                  </button>
                  <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => onSaveUnits(units)}>
                    Guardar equipos
                  </button>
                </>
              ) : null}
            </div>
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>
                    Equipo
                    <div className="small fw-normal text-muted">Valores de garantías ASIC</div>
                  </th>
                  <th>Cantidad</th>
                  <th>
                    Días
                    <div className="small fw-normal text-muted">Mes de la factura</div>
                  </th>
                  <th>
                    Consumo (W)
                    <div className="small fw-normal text-muted">Valores de garantías ASIC</div>
                  </th>
                  <th>
                    Energía / día
                    <div className="small fw-normal text-muted">1 equipo · {formatUSD(usdPerKwh)}/kWh</div>
                  </th>
                  <th>
                    Energía / mes
                    <div className="small fw-normal text-muted">1 equipo · {daysInMonth} días</div>
                  </th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} className="text-muted">
                      Sin equipos. Importá la última factura o agregá filas.
                    </td>
                  </tr>
                ) : (
                  units.map((u, idx) => (
                    <tr key={`${u.id}-${idx}`}>
                      <td>
                        {garantias.length > 0 ? (
                          <select
                            className="form-select form-select-sm"
                            value={String(garantiaFor(u)?.id || u.garantiaId || "")}
                            disabled={!canWrite}
                            onChange={(e) => {
                              const g = garantias.find((x) => String(x.id) === e.target.value);
                              setUnits((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        garantiaId: g?.id ?? null,
                                        garantiaLabel: g?.label || "",
                                        serviceKey: g?.serviceKey || x.serviceKey,
                                        serviceName: g?.serviceName || x.serviceName,
                                        watts: g?.consumoW || 0,
                                      }
                                    : x
                                )
                              );
                            }}
                          >
                            <option value="">Elegí máquina de garantías ASIC…</option>
                            {garantias.map((g) => (
                              <option key={g.id} value={String(g.id)}>
                                {g.label} · {g.consumoW.toLocaleString("es-PY")} W
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-warning small">No hay consumo cargado en Valores de garantías ASIC.</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min={1}
                          value={u.quantity}
                          disabled={!canWrite}
                          onChange={(e) =>
                            setUnits((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))
                          }
                        />
                      </td>
                      <td>{daysInMonth}</td>
                      <td>
                        {(() => {
                          const g = garantiaFor(u);
                          const w = g?.consumoW || 0;
                          return (
                            <span title={g ? `${g.label} · Valores de garantías ASIC` : "Sin match en garantías ASIC"}>
                              {w ? `${w.toLocaleString("es-PY")} W` : "—"}
                              {g ? (
                                <span className="text-muted small"> · garantías ASIC</span>
                              ) : (
                                <span className="text-warning small"> · falta en garantías</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const w = garantiaFor(u)?.consumoW || 0;
                          return w ? formatUSD(energyUsdDay(w, usdPerKwh)) : "—";
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const w = garantiaFor(u)?.consumoW || 0;
                          return w ? formatUSD(energyUsdMonth(w, daysInMonth, usdPerKwh)) : "—";
                        })()}
                      </td>
                      {canWrite ? (
                        <td>
                          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setUnits((prev) => prev.filter((_, i) => i !== idx))}>
                            Quitar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
