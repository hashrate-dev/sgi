import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Navigate, useNavigate } from "react-router-dom";
import { getMarketplaceQuoteTickets } from "../lib/api.js";
import type { MarketplaceQuoteTicket } from "../lib/api.js";
import { canExport, canViewMarketplaceQuoteTickets } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext.js";
import { PageHeader } from "../components/PageHeader.js";
import { showToast } from "../components/ToastNotification.js";
import "../styles/facturacion.css";
import "../styles/hrs-cotizaciones-marketplace.css";

const STATUS_LABEL: Record<string, string> = {
  borrador: "ABIERTO",
  pendiente: "Pendiente",
  orden_lista: "Orden lista",
  enviado_consulta: "Consulta enviada",
  en_contacto_equipo: "EN CONTACTO",
  en_gestion: "En gestión",
  pagada: "Pagada",
  en_viaje: "En viaje",
  instalado: "Instalado",
  respondido: "Respondido (legado)",
  cerrado: "Cerrado",
  descartado: "Eliminada",
};

const STATUS_FILTER_OPTS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "borrador", label: "Carrito abierto" },
  { value: "pendiente", label: "Pendiente" },
  { value: "orden_lista", label: "Orden lista" },
  { value: "enviado_consulta", label: "Consulta enviada" },
  { value: "en_contacto_equipo", label: "Contacto por equipo" },
  { value: "en_gestion", label: "En gestión" },
  { value: "pagada", label: "Pagada" },
  { value: "en_viaje", label: "En viaje" },
  { value: "instalado", label: "Instalado" },
  { value: "cerrado", label: "Cerrado" },
  { value: "descartado", label: "Eliminada" },
];

function normalizeMqtTicketStatus(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function badgeClass(status: string): string {
  const n = normalizeMqtTicketStatus(status);
  const k = n.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "unknown";
  return `hrs-mqt-badge hrs-mqt-badge--${k}`;
}

function pipelinePrimaryBadge(t: MarketplaceQuoteTicket): { label: string; className: string } {
  const st = normalizeMqtTicketStatus(t.status);
  if (st === "borrador") {
    return { label: STATUS_LABEL.borrador, className: "hrs-mqt-badge hrs-mqt-badge--carrito_abierto" };
  }
  if (st === "pendiente") {
    return { label: STATUS_LABEL.pendiente, className: "hrs-mqt-badge hrs-mqt-badge--pendiente" };
  }
  if (st === "orden_lista") {
    return { label: STATUS_LABEL.orden_lista, className: "hrs-mqt-badge hrs-mqt-badge--orden_lista" };
  }
  if (st === "enviado_consulta" && t.reactivatedAt) {
    return { label: "RE-ACTIVO", className: "hrs-mqt-badge hrs-mqt-badge--re_activo" };
  }
  return { label: STATUS_LABEL[st] ?? t.status, className: badgeClass(t.status) };
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PY", { dateStyle: "short" });
  } catch {
    return "—";
  }
}

function formatTimeNoSeconds(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function createdAtMonthKey(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr || "—";
  const [y, m] = monthStr.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthStr;
  const d = new Date(y, m - 1, 1);
  const mes = d.toLocaleDateString("es-AR", { month: "short" });
  return `${mes}-${y}`;
}

async function fetchAllTicketsPage(params: { q?: string; status?: string }): Promise<MarketplaceQuoteTicket[]> {
  const limit = 200;
  let offset = 0;
  const all: MarketplaceQuoteTicket[] = [];
  let total = Infinity;
  while (offset < total) {
    const r = await getMarketplaceQuoteTickets({
      ...(params.q ? { q: params.q } : {}),
      ...(params.status && params.status !== "all" ? { status: params.status } : {}),
      limit,
      offset,
    });
    all.push(...r.tickets);
    total = r.total;
    offset += r.tickets.length;
    if (r.tickets.length === 0) break;
  }
  return all;
}

function formatLastContactChannelLabel(channel: string | null | undefined): string {
  if (channel == null || String(channel).trim() === "") return "—";
  const c = String(channel).trim().toLowerCase();
  if (c === "email") return "Correo";
  if (c === "portal") return "Portal";
  if (c === "whatsapp") return "WhatsApp";
  return c.replace(/_/g, " ");
}

export function CotizacionesMarketplaceHistorialDetallePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<MarketplaceQuoteTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [qClient, setQClient] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [qStatus, setQStatus] = useState("all");
  const [qMonth, setQMonth] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);

  const canExportData = Boolean(user && canExport(user.role));

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(qClient.trim()), 350);
    return () => window.clearTimeout(t);
  }, [qClient]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchAllTicketsPage({
        q: qDebounced || undefined,
        status: qStatus,
      });
      setTickets(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, qStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) {
      const k = createdAtMonthKey(t.createdAt);
      if (k) set.add(k);
    }
    return [...set].sort().reverse();
  }, [tickets]);

  const filtered = useMemo(() => {
    if (!qMonth) return tickets;
    return tickets.filter((t) => createdAtMonthKey(t.createdAt) === qMonth);
  }, [tickets, qMonth]);

  const exportExcel = useCallback(async () => {
    if (filtered.length === 0) {
      showToast("No hay filas para exportar.", "warning", "Historial detalle");
      return;
    }
    setExcelBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Órdenes tienda", { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: "Origen", key: "origen", width: 14 },
        { header: "Orden", key: "order", width: 16 },
        { header: "Ticket", key: "ticket", width: 14 },
        { header: "Estado", key: "status", width: 20 },
        { header: "Cliente / email", key: "client", width: 32 },
        { header: "Fecha emisión", key: "fecha", width: 14 },
        { header: "Hora emisión", key: "hora", width: 12 },
        { header: "Actualizado", key: "upd", width: 18 },
        { header: "Total USD", key: "total", width: 12 },
        { header: "Líneas", key: "lines", width: 8 },
        { header: "Unidades", key: "units", width: 10 },
        { header: "Último canal", key: "ch", width: 14 },
        { header: "User ID", key: "uid", width: 10 },
      ];
      filtered.forEach((tk) => {
        ws.addRow({
          origen: "MARKETPLACE",
          order: tk.orderNumber ?? "",
          ticket: tk.ticketCode ?? "",
          status: pipelinePrimaryBadge(tk).label,
          client: tk.contactEmail ?? "—",
          fecha: formatDateOnly(tk.createdAt),
          hora: formatTimeNoSeconds(tk.createdAt),
          upd: formatWhen(tk.updatedAt),
          total: tk.subtotalUsd,
          lines: tk.lineCount,
          units: tk.unitCount,
          ch: formatLastContactChannelLabel(tk.lastContactChannel),
          uid: tk.userId ?? "",
        });
      });
      const hr = ws.getRow(1);
      hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
      hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF212529" } };
      hr.alignment = { vertical: "middle", horizontal: "center" };
      const buf = await wb.xlsx.writeBuffer();
      const fecha = new Date().toISOString().split("T")[0];
      saveAs(new Blob([buf]), `HistorialCotizacionesMarketplace_${fecha}.xlsx`);
      showToast("Excel descargado.", "success", "Historial detalle");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar.", "error", "Historial detalle");
    } finally {
      setExcelBusy(false);
    }
  }, [filtered]);

  if (!user || !canViewMarketplaceQuoteTickets(user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page clientes-page">
      <div className="container">
        <PageHeader
          title="Historial detalle — Cotizaciones marketplace"
          showBackButton
          backTo="/cotizaciones-marketplace"
          backText="Volver al tablero"
        />

        <div className="hrs-card hrs-card--rect p-4">
          <div className="historial-filtros-outer">
            <div className="historial-filtros-container">
              <div className="card historial-filtros-card">
                <h6 className="fw-bold border-bottom pb-2">🔍 Filtros</h6>
                <div className="row g-2 align-items-end">
                  <div className="col-md-3 col-lg-3">
                    <label className="form-label small fw-bold">Cliente / orden / ticket</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar cliente, orden, modelo…"
                      value={qClient}
                      onChange={(e) => setQClient(e.target.value)}
                      aria-label="Buscar"
                    />
                  </div>
                  <div className="col-md-2 col-lg-2">
                    <label className="form-label small fw-bold">Estado</label>
                    <select
                      className="form-select form-select-sm"
                      value={qStatus}
                      onChange={(e) => setQStatus(e.target.value)}
                      aria-label="Filtrar por estado"
                    >
                      {STATUS_FILTER_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2 col-lg-2">
                    <label className="form-label small fw-bold">Mes (creado)</label>
                    <select
                      className="form-select form-select-sm"
                      value={qMonth}
                      onChange={(e) => setQMonth(e.target.value)}
                      aria-label="Filtrar por mes de creación"
                    >
                      <option value="">Todos</option>
                      {monthOptions.map((m) => (
                        <option key={m} value={m}>
                          {formatMonthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-auto d-flex align-items-end">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm filtros-limpiar-btn"
                      onClick={() => {
                        setQClient("");
                        setQStatus("all");
                        setQMonth("");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="col-md-auto d-flex align-items-end gap-2 ms-auto">
                    {canExportData ? (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm clientes-export-excel-btn"
                        style={{ backgroundColor: "rgba(13, 110, 253, 0.12)" }}
                        disabled={excelBusy || filtered.length === 0}
                        onClick={() => void exportExcel()}
                      >
                        {excelBusy ? "⏳ Exportando…" : "📊 Exportar Excel"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="historial-listado-wrap historial-listado-outer">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold m-0">📄 Listado de órdenes ({filtered.length})</h6>
            </div>
            <p className="text-muted small mb-3">
              Todas las cotizaciones / órdenes de la tienda online (vista tabla). Los filtros de texto y estado consultan al
              servidor; el mes se aplica sobre el resultado cargado. Desde acciones podés abrir el detalle en el tablero.
            </p>
            {err ? <div className="alert alert-danger py-2 small">{err}</div> : null}
            <div className="table-responsive">
              <table className="table table-sm align-middle historial-listado-table" style={{ fontSize: "0.85rem" }}>
                <thead className="table-dark">
                  <tr>
                    <th className="text-start">Origen</th>
                    <th className="text-start">N° orden</th>
                    <th className="text-start">Ticket</th>
                    <th className="text-start">Estado</th>
                    <th className="text-start">Cliente</th>
                    <th className="text-start">
                      Fecha
                      <br />
                      creación
                    </th>
                    <th className="text-start">
                      Hora
                      <br />
                      creación
                    </th>
                    <th className="text-start">Actualizado</th>
                    <th className="text-end">Total USD</th>
                    <th className="text-center">Líneas</th>
                    <th className="text-center">Uds.</th>
                    <th className="text-start">Canal</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden />
                        Cargando…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="text-center text-muted py-4">
                        <small>No hay órdenes con estos filtros.</small>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => {
                      const badge = pipelinePrimaryBadge(t);
                      const totalStr = `${Number(t.subtotalUsd || 0).toLocaleString("es-PY")} USD`;
                      return (
                        <tr key={t.id}>
                          <td className="text-start small">MARKETPLACE</td>
                          <td className="fw-bold text-start">{t.orderNumber ?? `— (#${t.id})`}</td>
                          <td className="text-start font-monospace small">{t.ticketCode}</td>
                          <td className="text-start">
                            <span className={badge.className} style={{ fontSize: "0.72rem" }}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="text-start text-truncate" style={{ maxWidth: "220px" }} title={t.contactEmail ?? ""}>
                            {t.contactEmail ?? "—"}
                          </td>
                          <td className="text-start">{formatDateOnly(t.createdAt)}</td>
                          <td className="text-start">{formatTimeNoSeconds(t.createdAt)}</td>
                          <td className="text-start small">{formatWhen(t.updatedAt)}</td>
                          <td className="text-end fw-bold">{totalStr}</td>
                          <td className="text-center">{t.lineCount}</td>
                          <td className="text-center">{t.unitCount}</td>
                          <td className="text-start small">{formatLastContactChannelLabel(t.lastContactChannel)}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-light border historial-accion-btn"
                              title="Abrir esta orden en el tablero"
                              onClick={() => navigate(`/cotizaciones-marketplace?openTicket=${t.id}`)}
                            >
                              <i className="bi bi-window-stack" aria-hidden />
                              <span className="visually-hidden">Abrir en tablero</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
