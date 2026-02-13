import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { getClients } from "../lib/api";
import type { Client } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { loadInvoices } from "../lib/storage";
import "../styles/facturacion.css";

type ReportesView = "menu" | "por-mes" | "ranking-clientes" | "por-hosting";

const reportesMenuItems: Array<{ id: ReportesView; icon: string; label: string; desc: string }> = [
  { id: "por-mes", icon: "bi-graph-up", label: "Facturación Total", desc: "Facturación total por mes" },
  { id: "ranking-clientes", icon: "bi-trophy", label: "TOP Facturación Total", desc: "Clientes ordenados del que más facturó al que menos" },
  { id: "por-hosting", icon: "bi-hdd-network", label: "Facturación por Hosting", desc: "Facturación relacionada a hosting" },
];

/** Suma acumulada por cliente (Facturas menos NC) ordenado de mayor a menor */
function useClientesConTotalFacturado(): { clients: Client[]; loading: boolean; error: string | null; rows: { client: Client; total: number }[] } {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getClients()
      .then((r) => setClients(r.clients as Client[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar clientes"))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const invoices = loadInvoices();
    const byClientName = new Map<string, number>();
    invoices.forEach((inv) => {
      const name = (inv.clientName || "").trim();
      if (!name) return;
      const total = Math.abs(Number(inv.total) || 0);
      if (inv.type === "Factura") {
        byClientName.set(name, (byClientName.get(name) ?? 0) + total);
      } else if (inv.type === "Nota de Crédito") {
        byClientName.set(name, (byClientName.get(name) ?? 0) - total);
      }
    });
    return clients
      .map((client) => ({
        client,
        total: byClientName.get((client.name || "").trim()) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [clients]);

  return { clients, loading, error, rows };
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} USD`;
}

/** Meses con total neto (Facturas - NC y recibos relacionados). Ordenado por mes. */
function useFacturacionPorMes(view: ReportesView): { month: string; total: number }[] {
  return useMemo(() => {
    if (view !== "por-mes" && view !== "por-hosting") return [];
    const all = loadInvoices();
    const byMonth = new Map<string, number>();
    all.forEach((inv) => {
      const isNegative = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
      const value = isNegative ? -(Math.abs(inv.total) || 0) : (inv.total || 0);
      byMonth.set(inv.month, (byMonth.get(inv.month) ?? 0) + value);
    });
    return Array.from(byMonth.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [view]);
}

/** Formatear YYYY-MM a "Ene 2024" */
function formatMonth(month: string): string {
  if (!month || month.length < 7) return month;
  const [y, m] = month.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const i = parseInt(m, 10);
  const label = months[i - 1] ?? m;
  return `${label} ${y}`;
}

export function ReportesPage() {
  const [view, setView] = useState<ReportesView>("menu");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const { loading, error, rows } = useClientesConTotalFacturado();
  const porMesRows = useFacturacionPorMes(view);

  useEffect(() => {
    if (view !== "por-mes") return;
    const all = loadInvoices();
    const byMonth = new Map<string, number>();
    all.forEach((inv) => {
      const isNegative = inv.type === "Nota de Crédito" || (inv.type === "Recibo" && inv.relatedInvoiceId);
      const value = isNegative ? -(Math.abs(inv.total) || 0) : (inv.total || 0);
      byMonth.set(inv.month, (byMonth.get(inv.month) ?? 0) + value);
    });
    const labels = Array.from(byMonth.keys()).sort();
    const values = labels.map((m) => byMonth.get(m) ?? 0);

    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Total facturado ($)", data: values, borderWidth: 1 }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [view]);

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Reportes" />

        <div className="hrs-card p-4">
          {view !== "menu" && (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm mb-3"
              onClick={() => setView("menu")}
            >
              ← Volver a reportes
            </button>
          )}

          {view === "menu" && (
            <div className="reportes-grid">
              {reportesMenuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="reportes-card"
                  onClick={() => setView(item.id)}
                >
                  <div className="reportes-card-icon">
                    <i className={`bi ${item.icon}`} />
                  </div>
                  <h3 className="reportes-card-title">{item.label}</h3>
                  <p className="reportes-card-desc">{item.desc}</p>
                </button>
              ))}
            </div>
          )}

          {view === "por-mes" && (
            <div className="card mt-2 p-4">
              <h5 className="fw-bold mb-3">📊 Facturación Total</h5>
              <canvas ref={canvasRef} height={120} />
            </div>
          )}

          {view === "ranking-clientes" && (
            <div className="reportes-listado-wrap">
              <h6 className="fw-bold m-0 mb-3">🏆 TOP Facturación Total</h6>
              <p className="text-muted small mb-3">Clientes de la base de datos ordenados del que más facturó al que menos (Facturas menos Notas de Crédito).</p>
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              {loading ? (
                <p className="text-muted">Cargando clientes...</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle reportes-listado-table" style={{ fontSize: "0.85rem" }}>
                    <thead className="table-dark">
                      <tr>
                        <th className="text-start">#</th>
                        <th className="text-start">Código</th>
                        <th className="text-start">Cliente</th>
                        <th className="text-end">Total facturado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ client, total }, index) => (
                        <tr key={client.id ?? client.code ?? index}>
                          <td className="text-start">{index + 1}</td>
                          <td className="text-start">{client.code || "-"}</td>
                          <td className="text-start">{client.name || "-"}</td>
                          <td className="text-end fw-bold">{formatCurrency(total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {view === "por-hosting" && (
            <div className="reportes-listado-wrap">
              <h6 className="fw-bold m-0 mb-3">📋 Facturación Hosting acumulada por mes</h6>
              <p className="text-muted small mb-3">Total neto por mes, facturación hosting (Facturas menos Notas de Crédito y recibos relacionados).</p>
              {porMesRows.length === 0 ? (
                <p className="text-muted mb-0">No hay datos de facturación por mes.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle reportes-listado-table" style={{ fontSize: "0.85rem" }}>
                    <thead className="table-dark">
                      <tr>
                        <th className="text-start">Mes</th>
                        <th className="text-end">Total facturado (neto)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porMesRows.map(({ month, total }) => (
                        <tr key={month}>
                          <td className="text-start">{formatMonth(month)}</td>
                          <td className="text-end fw-bold">{formatCurrency(total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

