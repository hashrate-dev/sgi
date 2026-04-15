import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import { getClients, getInvoices, wakeUpBackend } from "../lib/api";
import { isClienteTiendaOnline } from "../lib/clientTienda";
import type { Client, ComprobanteType, Invoice, LineItem } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { formatCurrency } from "../lib/formatCurrency";
import "../styles/facturacion.css";
import "../styles/reportes-dashboard.css";

type ReportesView = "menu" | "por-mes" | "ranking-clientes" | "por-hosting";
type PeriodoFiltro = "all" | "year" | "12m";

function periodoFiltroLabel(p: PeriodoFiltro): string {
  if (p === "year") return "Año actual";
  if (p === "12m") return "Últimos 12 meses";
  return "Todo";
}

const reportesMenuItems: Array<{ id: ReportesView; icon: string; label: string; desc: string }> = [
  { id: "por-mes", icon: "bi-graph-up", label: "Facturación Total", desc: "Facturación total por mes" },
  {
    id: "ranking-clientes",
    icon: "bi-trophy",
    label: "TOP Facturación Hosting",
    desc: "Clientes hosting: del que más facturó al que menos (sin tienda online)",
  },
  { id: "por-hosting", icon: "bi-hdd-network", label: "Facturación por Hosting", desc: "Facturación relacionada a hosting" },
];

function normalizeMonth(mm: string | undefined): string {
  if (!mm || typeof mm !== "string") return "";
  const parts = mm.split("-").map((p) => parseInt(p.trim(), 10));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    const y = parts[0];
    const m = Math.max(1, Math.min(12, parts[1]));
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  return mm.trim();
}

/** Neto por cliente y mes (Factura − N.C.), mismo criterio que el ranking. */
function aggregateClientMonthTotals(invoices: Invoice[]): Map<string, Map<string, number>> {
  const byName = new Map<string, Map<string, number>>();
  invoices.forEach((inv) => {
    if (inv.type !== "Factura" && inv.type !== "Nota de Crédito") return;
    const name = (inv.clientName || "").trim();
    if (!name) return;
    const mk = normalizeMonth(inv.month);
    if (!mk || mk.length < 7) return;
    const t = Math.abs(Number(inv.total) || 0);
    const delta = inv.type === "Factura" ? t : -t;
    let inner = byName.get(name);
    if (!inner) {
      inner = new Map();
      byName.set(name, inner);
    }
    inner.set(mk, (inner.get(mk) ?? 0) + delta);
  });
  return byName;
}

function mapApiRowsToInvoices(
  rows: Array<{
    id: number;
    number: string;
    type: string;
    clientName: string;
    date: string;
    month: string;
    subtotal: number;
    discounts: number;
    total: number;
    relatedInvoiceId?: number;
    relatedInvoiceNumber?: string;
  }>
): Invoice[] {
  return (rows ?? []).map((inv) => ({
    id: String(inv.id),
    number: inv.number,
    type: inv.type as ComprobanteType,
    clientName: inv.clientName,
    date: inv.date,
    month: normalizeMonth(inv.month ?? ""),
    subtotal: inv.subtotal,
    discounts: inv.discounts,
    total: inv.total,
    relatedInvoiceId: inv.relatedInvoiceId != null ? String(inv.relatedInvoiceId) : undefined,
    relatedInvoiceNumber: inv.relatedInvoiceNumber,
    items: [] as LineItem[],
  }));
}

function useReportInvoices(view: ReportesView): { invoices: Invoice[]; loading: boolean; error: string | null } {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view !== "por-mes" && view !== "por-hosting" && view !== "ranking-clientes") {
      setInvoices([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params =
      view === "por-hosting" || view === "ranking-clientes" ? ({ source: "hosting" } as const) : undefined;
    wakeUpBackend()
      .then(() => getInvoices(params))
      .then((r) => setInvoices(mapApiRowsToInvoices(r.invoices ?? [])))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar facturas");
        setInvoices([]);
      })
      .finally(() => setLoading(false));
  }, [view]);

  return { invoices, loading, error };
}

function aggregateFacturacionPorMes(all: Invoice[]): { month: string; total: number }[] {
  const byMonth = new Map<string, number>();
  all.forEach((inv) => {
    if (inv.type !== "Factura" && inv.type !== "Nota de Crédito") return;
    const monthKey = normalizeMonth(inv.month);
    if (!monthKey || monthKey.length < 7) return;
    const amt = Math.abs(Number(inv.total)) || 0;
    const delta = inv.type === "Nota de Crédito" ? -amt : amt;
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + delta);
  });
  return Array.from(byMonth.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function filterMesRowsByPeriod(
  rows: { month: string; total: number }[],
  period: PeriodoFiltro
): { month: string; total: number }[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  if (period === "all") return sorted;
  const y = new Date().getFullYear();
  if (period === "year") return sorted.filter((r) => r.month.startsWith(`${y}-`));
  return sorted.slice(-12);
}

type KpiPack = {
  total: number;
  promedio: number;
  meses: number;
  maxVal: number;
  maxMonth: string;
  ultimo: number;
  pctVsAnterior: number | null;
  rangoEtiqueta: string;
};

function computeKpis(rows: { month: string; total: number }[]): KpiPack {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 0) {
    return {
      total: 0,
      promedio: 0,
      meses: 0,
      maxVal: 0,
      maxMonth: "",
      ultimo: 0,
      pctVsAnterior: null,
      rangoEtiqueta: "—",
    };
  }
  const total = sorted.reduce((s, r) => s + r.total, 0);
  const meses = sorted.length;
  let maxVal = sorted[0].total;
  let maxMonth = sorted[0].month;
  sorted.forEach((r) => {
    if (r.total > maxVal) {
      maxVal = r.total;
      maxMonth = r.month;
    }
  });
  const ultimo = sorted[sorted.length - 1].total;
  const penultimo = sorted.length >= 2 ? sorted[sorted.length - 2].total : null;
  const pctVsAnterior =
    penultimo != null && Math.abs(penultimo) > 1e-9 ? ((ultimo - penultimo) / Math.abs(penultimo)) * 100 : null;
  const rangoEtiqueta = `${formatMonth(sorted[0].month)} – ${formatMonth(sorted[sorted.length - 1].month)}`;
  return {
    total,
    promedio: meses ? total / meses : 0,
    meses,
    maxVal,
    maxMonth,
    ultimo,
    pctVsAnterior,
    rangoEtiqueta,
  };
}

function useClientesConTotalFacturado(invoicesForRanking: Invoice[]): {
  clients: Client[];
  loading: boolean;
  error: string | null;
  rows: { client: Client; total: number }[];
} {
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
    const byClientName = new Map<string, number>();
    invoicesForRanking.forEach((inv) => {
      const name = (inv.clientName || "").trim();
      if (!name) return;
      const t = Math.abs(Number(inv.total) || 0);
      if (inv.type === "Factura") {
        byClientName.set(name, (byClientName.get(name) ?? 0) + t);
      } else if (inv.type === "Nota de Crédito") {
        byClientName.set(name, (byClientName.get(name) ?? 0) - t);
      }
    });
    return clients
      .filter((client) => !isClienteTiendaOnline(client))
      .map((client) => ({
        client,
        total: byClientName.get((client.name || "").trim()) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [clients, invoicesForRanking]);

  return { clients, loading, error, rows };
}

function formatMonth(month: string): string {
  if (!month || month.length < 7) return month;
  const [y, m] = month.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const i = parseInt(m, 10);
  const label = months[i - 1] ?? m;
  return `${label} ${y}`;
}

function formatMonthShort(month: string): string {
  if (!month || month.length < 7) return month;
  const [y, m] = month.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const i = parseInt(m, 10);
  const label = months[i - 1] ?? m;
  return `${label} ${String(y).slice(-2)}`;
}

/** Variación % mes a mes: cada barra es el cambio vs el mes anterior (mismo período filtrado). */
function computeVariacionMensualPct(sortedRows: { month: string; total: number }[]): {
  labels: string[];
  values: number[];
  colors: string[];
} {
  const sorted = [...sortedRows].sort((a, b) => a.month.localeCompare(b.month));
  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const green = "rgba(5, 150, 105, 0.88)";
  const red = "rgba(220, 38, 38, 0.88)";
  const neutral = "rgba(100, 116, 139, 0.65)";

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].total;
    const curr = sorted[i].total;
    let pct = 0;
    if (Math.abs(prev) > 1e-6) {
      pct = ((curr - prev) / Math.abs(prev)) * 100;
    } else if (Math.abs(curr) > 1e-6) {
      pct = curr > 0 ? 100 : -100;
    } else {
      pct = 0;
    }
    pct = Math.round(pct * 100) / 100;
    labels.push(formatMonth(sorted[i].month));
    values.push(pct);
    colors.push(Math.abs(pct) < 0.005 ? neutral : pct > 0 ? green : pct < 0 ? red : neutral);
  }
  return { labels, values, colors };
}

/** % vs mes anterior en una serie ya ordenada (índice 0 → sin comparación). */
function pctVsMesAnteriorEnSerie(
  sortedAsc: readonly { month: string; total: number }[],
  index: number
): number | null {
  if (index <= 0) return null;
  const prev = sortedAsc[index - 1]!.total;
  const curr = sortedAsc[index]!.total;
  let pct = 0;
  if (Math.abs(prev) > 1e-6) {
    pct = ((curr - prev) / Math.abs(prev)) * 100;
  } else if (Math.abs(curr) > 1e-6) {
    pct = curr > 0 ? 100 : -100;
  }
  return Math.round(pct * 100) / 100;
}

function formatDetallePctCell(pct: number | null): { text: string; cls: string } {
  if (pct === null) return { text: "—", cls: "reportes-hosting-detalle-mes__row-pct--na" };
  if (Math.abs(pct) < 0.005) return { text: "0%", cls: "reportes-hosting-detalle-mes__row-pct--flat" };
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(2)}%`,
    cls: pct > 0 ? "reportes-hosting-detalle-mes__row-pct--up" : "reportes-hosting-detalle-mes__row-pct--down",
  };
}

function createReportesAreaChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  datasetLabel: string
): ChartInstance {
  Chart.getChart(canvas)?.destroy();

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: datasetLabel,
          data: values,
          borderColor: "#2563eb",
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#2563eb",
          pointBorderWidth: 2,
          backgroundColor: (context: { chart: ChartInstance; datasetIndex: number }) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(37, 99, 235, 0.08)";
            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "rgba(37, 99, 235, 0.42)");
            g.addColorStop(0.45, "rgba(37, 99, 235, 0.12)");
            g.addColorStop(1, "rgba(37, 99, 235, 0)");
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.97)",
          titleColor: "#1e293b",
          bodyColor: "#334155",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              return typeof v === "number" ? formatCurrency(v) : String(v ?? "");
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0, font: { size: 11 } },
          border: { color: "#e2e8f0" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.12)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback(v) {
              const n = Number(v);
              if (!Number.isFinite(n)) return String(v);
              if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
              if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
              return n.toLocaleString("es-AR");
            },
          },
          border: { display: false },
        },
      },
    },
  });
}

const RANKING_BAR_LABEL_MAX = 26;

/** Paleta para líneas + relleno degradado (estilo dashboard). */
const RANKING_CUMULATIVE_PALETTE: Array<{
  border: string;
  fillTop: string;
  fillMid: string;
  fillBot: string;
}> = [
  { border: "#2563eb", fillTop: "rgba(37, 99, 235, 0.34)", fillMid: "rgba(37, 99, 235, 0.15)", fillBot: "rgba(37, 99, 235, 0)" },
  { border: "#7c3aed", fillTop: "rgba(124, 58, 237, 0.3)", fillMid: "rgba(124, 58, 237, 0.13)", fillBot: "rgba(124, 58, 237, 0)" },
  { border: "#db2777", fillTop: "rgba(219, 39, 119, 0.28)", fillMid: "rgba(219, 39, 119, 0.12)", fillBot: "rgba(219, 39, 119, 0)" },
  { border: "#ea580c", fillTop: "rgba(234, 88, 12, 0.28)", fillMid: "rgba(234, 88, 12, 0.11)", fillBot: "rgba(234, 88, 12, 0)" },
  { border: "#ca8a04", fillTop: "rgba(202, 138, 4, 0.26)", fillMid: "rgba(202, 138, 4, 0.1)", fillBot: "rgba(202, 138, 4, 0)" },
  { border: "#059669", fillTop: "rgba(5, 150, 105, 0.28)", fillMid: "rgba(5, 150, 105, 0.12)", fillBot: "rgba(5, 150, 105, 0)" },
  { border: "#0891b2", fillTop: "rgba(8, 145, 178, 0.28)", fillMid: "rgba(8, 145, 178, 0.11)", fillBot: "rgba(8, 145, 178, 0)" },
  { border: "#4f46e5", fillTop: "rgba(79, 70, 229, 0.26)", fillMid: "rgba(79, 70, 229, 0.1)", fillBot: "rgba(79, 70, 229, 0)" },
  { border: "#be185d", fillTop: "rgba(190, 24, 93, 0.26)", fillMid: "rgba(190, 24, 93, 0.1)", fillBot: "rgba(190, 24, 93, 0)" },
  { border: "#c2410c", fillTop: "rgba(194, 65, 12, 0.24)", fillMid: "rgba(194, 65, 12, 0.09)", fillBot: "rgba(194, 65, 12, 0)" },
  { border: "#0d9488", fillTop: "rgba(13, 148, 136, 0.26)", fillMid: "rgba(13, 148, 136, 0.1)", fillBot: "rgba(13, 148, 136, 0)" },
  { border: "#6d28d9", fillTop: "rgba(109, 40, 217, 0.24)", fillMid: "rgba(109, 40, 217, 0.09)", fillBot: "rgba(109, 40, 217, 0)" },
  { border: "#b45309", fillTop: "rgba(180, 83, 9, 0.24)", fillMid: "rgba(180, 83, 9, 0.09)", fillBot: "rgba(180, 83, 9, 0)" },
  { border: "#1d4ed8", fillTop: "rgba(29, 78, 216, 0.26)", fillMid: "rgba(29, 78, 216, 0.1)", fillBot: "rgba(29, 78, 216, 0)" },
];

type RankingCumulativeSeriesSpec = {
  label: string;
  data: number[];
  borderColor: string;
  fillTop: string;
  fillMid: string;
  fillBot: string;
};

function createReportesRankingCumulativeChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  series: RankingCumulativeSeriesSpec[]
): ChartInstance {
  Chart.getChart(canvas)?.destroy();

  const ordered = [...series].sort((a, b) => {
    const la = a.data[a.data.length - 1] ?? 0;
    const lb = b.data[b.data.length - 1] ?? 0;
    return la - lb;
  });

  const fillStops = ordered.map((s) => ({ top: s.fillTop, mid: s.fillMid, bot: s.fillBot }));

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: ordered.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.borderColor,
        borderWidth: 2.25,
        tension: 0.35,
        fill: true,
        pointRadius: labels.length > 1 ? 4 : 5,
        pointHoverRadius: 7,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: s.borderColor,
        pointBorderWidth: 2,
        backgroundColor: (context: { chart: ChartInstance; datasetIndex: number }) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return "transparent";
          const stops = fillStops[context.datasetIndex];
          if (!stops) return "transparent";
          const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, stops.top);
          g.addColorStop(0.45, stops.mid);
          g.addColorStop(1, stops.bot);
          return g;
        },
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation:
        ordered.length > 35 ? false : ({ duration: 550, easing: "easeOutQuart" } as const),
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: ordered.length > 0,
          position: "bottom",
          align: "start",
          maxHeight: ordered.length > 12 ? 280 : undefined,
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: ordered.length > 20 ? 6 : 10,
            boxWidth: 8,
            boxHeight: 8,
            font: { size: ordered.length > 24 ? 9 : 10, weight: 600 },
            color: "#64748b",
          },
        },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          titleColor: "#0f172a",
          titleFont: { size: 13, weight: 700 },
          bodyColor: "#334155",
          bodyFont: { size: 12, weight: 500 },
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 14,
          cornerRadius: 12,
          displayColors: true,
          boxPadding: 5,
          usePointStyle: true,
          callbacks: {
            title(items) {
              return items[0]?.label ?? "";
            },
            label(ctx) {
              const v = ctx.parsed.y;
              const name = String(ctx.dataset.label ?? "");
              return `${name}: ${typeof v === "number" ? formatCurrency(v) : ""}`;
            },
          },
          itemSort: (a, b) => (Number(b.parsed.y) || 0) - (Number(a.parsed.y) || 0),
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0, font: { size: 11 } },
          border: { color: "#e2e8f0" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.12)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback(v) {
              const n = Number(v);
              if (!Number.isFinite(n)) return String(v);
              if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
              if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
              return n.toLocaleString("es-AR");
            },
          },
          border: { display: false },
        },
      },
    },
  });
}

function truncateRankingBarLabel(name: string, maxLen = RANKING_BAR_LABEL_MAX): string {
  const t = (name || "").trim();
  if (t.length <= maxLen) return t || "—";
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function createReportesRankingClientsBarChart(
  canvas: HTMLCanvasElement,
  labelsTruncated: string[],
  fullNames: string[],
  pctValues: number[],
  amountValues: number[],
  grandTotal: number,
  xScale: { max?: number; min?: number; beginAtZero: boolean }
): ChartInstance {
  Chart.getChart(canvas)?.destroy();

  const totalLabel = formatCurrency(grandTotal);

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: labelsTruncated,
      datasets: [
        {
          label: "% del total facturado (hosting)",
          data: pctValues,
          backgroundColor: "rgba(37, 99, 235, 0.88)",
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.97)",
          titleColor: "#1e293b",
          bodyColor: "#334155",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            title(items) {
              const i = items[0]?.dataIndex;
              if (i != null && fullNames[i]) return fullNames[i]!;
              return items[0]?.label ?? "";
            },
            label(ctx) {
              const i = ctx.dataIndex;
              const pct = ctx.parsed.x;
              const amt = amountValues[i] ?? 0;
              const pctStr =
                typeof pct === "number" && Number.isFinite(pct) ? `${pct.toFixed(2)}%` : "—";
              if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
                return [`${pctStr} del total`, formatCurrency(amt)];
              }
              return [
                `${pctStr} del total acumulado (${totalLabel})`,
                `Neto cliente: ${formatCurrency(amt)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: xScale.beginAtZero,
          ...(xScale.min != null ? { min: xScale.min } : {}),
          ...(xScale.max != null ? { max: xScale.max } : {}),
          grid: { display: false },
          ticks: { display: false },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#64748b", font: { size: 10 } },
          border: { color: "#e2e8f0" },
        },
      },
    },
  });
}

function KpiTrend({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <div className="reportes-dash__kpi-trend reportes-dash__kpi-trend--flat">
        <span>vs. mes anterior: —</span>
      </div>
    );
  }
  const up = pct > 0.5;
  const down = pct < -0.5;
  const cls = up ? "reportes-dash__kpi-trend--up" : down ? "reportes-dash__kpi-trend--down" : "reportes-dash__kpi-trend--flat";
  const arrow = up ? "↑" : down ? "↓" : "→";
  return (
    <div className={`reportes-dash__kpi-trend ${cls}`}>
      <span aria-hidden>{arrow}</span>
      <span>
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}% vs. mes anterior
      </span>
    </div>
  );
}

function ReportesKpiPanel({
  tituloResumen,
  kpis,
  periodo,
  onPeriodo,
  showCalendarioMeses,
}: {
  tituloResumen: string;
  kpis: KpiPack;
  periodo: PeriodoFiltro;
  onPeriodo: (p: PeriodoFiltro) => void;
  /** Icono calendario junto a “N meses con datos” (p. ej. panel hosting). */
  showCalendarioMeses?: boolean;
}) {
  return (
    <aside className="reportes-dash__kpis">
      <div className="reportes-dash__kpi-head">
        <h3 className="reportes-dash__kpi-title">{tituloResumen}</h3>
        <select
          className="reportes-dash__period-select"
          value={periodo}
          onChange={(e) => onPeriodo(e.target.value as PeriodoFiltro)}
          aria-label="Período del reporte"
        >
          <option value="year">Año actual</option>
          <option value="12m">Últimos 12 meses</option>
          <option value="all">Todo</option>
        </select>
      </div>
      <div>
        <div className="reportes-dash__kpi-main">{formatCurrency(kpis.total)}</div>
        <KpiTrend pct={kpis.pctVsAnterior} />
      </div>
      <div className="reportes-dash__kpi-row">
        <div>
          <p className="reportes-dash__kpi-cell-label">Promedio mensual</p>
          <p className="reportes-dash__kpi-cell-value">{formatCurrency(kpis.promedio)}</p>
        </div>
        <div>
          <p className="reportes-dash__kpi-cell-label">Mejor mes</p>
          <p className="reportes-dash__kpi-cell-value">{kpis.meses ? formatCurrency(kpis.maxVal) : "—"}</p>
        </div>
      </div>
      <div className="reportes-dash__kpi-foot">
        <span className="reportes-dash__kpi-foot-meses">
          <strong>{kpis.meses}</strong>
          <span className="reportes-dash__kpi-foot-meses-label"> meses con datos</span>
        </span>
        {showCalendarioMeses ? (
          <i className="bi bi-calendar3 reportes-dash__kpi-foot-calendar" aria-hidden title="Meses con datos en el período" />
        ) : null}
      </div>
    </aside>
  );
}

type RankingMatrixRow = {
  client: Client;
  monthValues: number[];
  periodTotal: number;
};

function rankingMatrixGridTemplate(numMonthCols: number): string {
  const monthFr =
    numMonthCols > 0 ? Array.from({ length: numMonthCols }, () => "minmax(4.25rem, 1fr)").join(" ") : "";
  return ["1.85rem", "minmax(128px, 200px)", monthFr, "minmax(5.5rem, auto)"]
    .filter((p) => p.length > 0)
    .join(" ");
}

function rankingSelectedMonthsButtonLabel(sortedKeys: string[]): string {
  if (sortedKeys.length === 0) return "Elegir meses…";
  if (sortedKeys.length <= 4) return sortedKeys.map((m) => formatMonthShort(m)).join(" · ");
  return `${sortedKeys.length} meses seleccionados`;
}

function groupRankingMonthsByYear(sortedAsc: string[]): { year: string; months: string[] }[] {
  const byYear = new Map<string, string[]>();
  for (const key of sortedAsc) {
    const y = key.length >= 7 ? key.slice(0, 4) : "";
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(key);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({ year, months }));
}

/** Filtro superior: lista desplegable con meses agrupados por año. */
function RankingPeriodFilter({
  availableMonths,
  selectedMonths,
  onToggleMonth,
  onPreset,
}: {
  availableMonths: string[];
  selectedMonths: string[];
  onToggleMonth: (monthKey: string) => void;
  onPreset: (preset: "last3" | "year" | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const byYear = useMemo(
    () => groupRankingMonthsByYear([...availableMonths].sort((a, b) => a.localeCompare(b))),
    [availableMonths]
  );
  const btnLabel = rankingSelectedMonthsButtonLabel(selectedMonths);

  if (availableMonths.length === 0) return null;

  return (
    <div className="reportes-ranking-period" ref={wrapRef}>
      <div className="reportes-ranking-period__bar">
        <span className="reportes-ranking-period__label" id="ranking-period-lbl">
          Período <span className="reportes-ranking-period__hint">(meses y años)</span>
        </span>
        <button
          type="button"
          className="reportes-ranking-period__trigger"
          aria-expanded={open}
          aria-controls="ranking-period-panel"
          aria-labelledby="ranking-period-lbl"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="reportes-ranking-period__trigger-text">{btnLabel}</span>
          <i
            className={`bi bi-chevron-down reportes-ranking-period__chev${open ? " is-open" : ""}`}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        <div
          id="ranking-period-panel"
          className="reportes-ranking-period__dropdown"
          role="region"
          aria-label="Lista de meses por año"
        >
          <div className="reportes-ranking-period__presets">
            <button type="button" className="reportes-ranking-period__preset" onClick={() => onPreset("last3")}>
              Últimos 3
            </button>
            <button type="button" className="reportes-ranking-period__preset" onClick={() => onPreset("year")}>
              Año actual
            </button>
            <button type="button" className="reportes-ranking-period__preset" onClick={() => onPreset("all")}>
              Todos
            </button>
          </div>
          <div className="reportes-ranking-period__scroll">
            <ul className="reportes-ranking-period__by-year">
              {byYear.map(({ year, months }) => (
                <li key={year} className="reportes-ranking-period__year-group">
                  <div className="reportes-ranking-period__year-head">{year}</div>
                  <ul className="reportes-ranking-period__month-rows">
                    {months.map((m) => (
                      <li key={m}>
                        <label className="reportes-ranking-period__month-row">
                          <input
                            type="checkbox"
                            checked={selectedMonths.includes(m)}
                            onChange={() => onToggleMonth(m)}
                          />
                          <span>{formatMonth(m)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const TOP10_RING_COLORS = [
  "#7c3aed",
  "#ca8a04",
  "#16a34a",
  "#db2777",
  "#2563eb",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#9333ea",
  "#0d9488",
] as const;

function Top10RankRing({ rank, color, arcFraction }: { rank: number; color: string; arcFraction: number }) {
  const size = 44;
  const stroke = 3;
  const r = (size - stroke) / 2 - 1.5;
  const c = 2 * Math.PI * r;
  const dash = Math.min(0.92, Math.max(0.14, arcFraction)) * c;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="reportes-top10-ring"
      aria-hidden
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8ecf1" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        dominantBaseline="central"
        textAnchor="middle"
        className="reportes-top10-ring__label"
      >
        {rank}°
      </text>
    </svg>
  );
}

/** Dashboard estilo “TOP N” con anillo, importe y % sobre la suma del Top 10. */
function RankingTop10Dashboard({
  items,
  periodLabel,
  grandTotal,
  totalClientCount,
  lastMonthLabel,
  lastMonthTotal,
  embedded,
}: {
  items: RankingMatrixRow[];
  periodLabel: string;
  /** Suma de todos los clientes del ranking (mismo criterio que la tabla / gráfico). */
  grandTotal: number;
  /** Cantidad de clientes en el ranking completo (misma lista que tabla / barras). */
  totalClientCount: number;
  /** Mes más reciente del filtro (texto corto). */
  lastMonthLabel: string;
  /** Total neto hosting de ese mes (columna del ranking). */
  lastMonthTotal: number | null;
  embedded?: boolean;
}) {
  const { rows, sumTop10 } = useMemo(() => {
    const sumTop10 = items.reduce((s, r) => s + r.periodTotal, 0);
    const maxTotal = Math.max(...items.map((r) => r.periodTotal), 1e-9);
    const rows = items.map((r, i) => ({
      r,
      rank: i + 1,
      pctOfTop10: sumTop10 > 1e-9 ? (r.periodTotal / sumTop10) * 100 : 0,
      arcFraction: 0.14 + 0.62 * (r.periodTotal / maxTotal),
      color: TOP10_RING_COLORS[i % TOP10_RING_COLORS.length]!,
    }));
    return { rows, sumTop10 };
  }, [items]);

  const pctTop10OnGrand =
    Number.isFinite(grandTotal) && Math.abs(grandTotal) > 1e-9
      ? (sumTop10 / grandTotal) * 100
      : null;

  return (
    <section
      className={`reportes-top10-dash${embedded ? " reportes-top10-dash--embedded" : ""}`}
      aria-label="Top 10 clientes por facturación"
    >
      <header className="reportes-top10-dash__head">
        <span className="reportes-top10-dash__head-ico reportes-top10-dash__head-ico--left" aria-hidden>
          <i className="bi bi-pc-display-horizontal" />
        </span>
        <div className="reportes-top10-dash__head-center">
          <h3 className="reportes-top10-dash__title">TOP 10</h3>
          <p className="reportes-top10-dash__subtitle-strong">Total facturado</p>
          <p className="reportes-top10-dash__subtitle-muted">
            Hosting · {periodLabel || "Período seleccionado"}
          </p>
        </div>
        <span className="reportes-top10-dash__head-ico reportes-top10-dash__head-ico--star" aria-hidden>
          <i className="bi bi-star-fill" />
        </span>
      </header>

      <ul className="reportes-top10-dash__list">
        {rows.map(({ r, rank, pctOfTop10, arcFraction, color }) => {
          const name = (r.client.name || "—").trim();
          const showName = name.length > 36 ? `${name.slice(0, 34)}…` : name;
          const pctRounded = Math.round(pctOfTop10 * 10) / 10;
          return (
            <li key={r.client.id ?? r.client.code ?? `top-${rank}`} className="reportes-top10-dash__row">
              <Top10RankRing rank={rank} color={color} arcFraction={arcFraction} />
              <div className="reportes-top10-dash__body">
                <span className="reportes-top10-dash__name" title={name}>
                  {showName}
                </span>
                <span className="reportes-top10-dash__amount">{formatCurrency(r.periodTotal)}</span>
                <span className="reportes-top10-dash__pct">{pctRounded}% del Top 10</span>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="reportes-top10-dash__foot">
        <span className="reportes-top10-dash__foot-label">Suma Top 10 (hosting)</span>
        <span className="reportes-top10-dash__foot-value">{formatCurrency(sumTop10)}</span>
        <span className="reportes-top10-dash__foot-meta">{items.length} clientes</span>
      </footer>

      <div className="reportes-top10-dash__grand" aria-label="Top 10 respecto al total del período">
        <div className="reportes-top10-dash__grand-stat">
          <span className="reportes-top10-dash__grand-label">% Top 10 sobre facturación acumulada</span>
          <span className="reportes-top10-dash__grand-value reportes-top10-dash__grand-value--pct">
            {pctTop10OnGrand != null && Number.isFinite(pctTop10OnGrand)
              ? `${pctTop10OnGrand.toFixed(2)}%`
              : "—"}
          </span>
        </div>
        <div className="reportes-top10-dash__grand-stat">
          <span className="reportes-top10-dash__grand-label">Facturación acumulada (todos los clientes)</span>
          <span className="reportes-top10-dash__grand-value">
            {formatCurrency(Number.isFinite(grandTotal) ? grandTotal : 0)}
          </span>
        </div>
        <div className="reportes-top10-dash__grand-stat">
          <span className="reportes-top10-dash__grand-label">
            {lastMonthLabel
              ? `Total facturado último mes (${lastMonthLabel})`
              : "Total facturado último mes del filtro"}
          </span>
          <span className="reportes-top10-dash__grand-value">
            {lastMonthTotal != null ? formatCurrency(lastMonthTotal) : "—"}
          </span>
        </div>
        <div className="reportes-top10-dash__grand-stat">
          <span className="reportes-top10-dash__grand-label">Clientes acumulados (ranking completo)</span>
          <span className="reportes-top10-dash__grand-value">
            {Number.isFinite(totalClientCount) && totalClientCount >= 0
              ? `${totalClientCount} ${totalClientCount === 1 ? "cliente" : "clientes"}`
              : "—"}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Listado ranking con columnas por mes y total del período (sin filtro: va arriba en el panel conectado). */
function RankingClientesCard({
  rows,
  selectedMonths,
  availableMonths,
  columnTotals,
  grandTotal,
  embedded,
}: {
  rows: RankingMatrixRow[];
  selectedMonths: string[];
  availableMonths: string[];
  columnTotals: number[];
  grandTotal: number;
  embedded?: boolean;
}) {
  const gridTpl = rankingMatrixGridTemplate(selectedMonths.length);

  return (
    <aside
      className={`reportes-dash__kpis reportes-ranking-clientes${embedded ? " reportes-ranking-clientes--embedded" : ""}`}
      aria-label="Ranking de clientes por facturación hosting"
    >
      <div className="reportes-ranking-clientes__top">
        <h3 className="reportes-dash__kpi-title">Ranking por cliente</h3>
        <span className="reportes-hosting-detalle-mes__period-badge">Solo hosting</span>
      </div>
      <p className="reportes-hosting-detalle-mes__hint">
        Sin tienda online (WEB-* / A9…). Neto: Factura − Nota de crédito, sin recibos.
      </p>

      <div className="reportes-ranking-clientes__matrix-scroll">
        <div className="reportes-ranking-clientes__list reportes-ranking-clientes__list--matrix" role="table">
          {availableMonths.length === 0 ? (
            <p className="reportes-ranking-clientes__empty mb-0">No hay facturas hosting con mes informado.</p>
          ) : selectedMonths.length === 0 ? (
            <p className="reportes-ranking-clientes__empty mb-0">Seleccioná al menos un mes para ver las columnas.</p>
          ) : rows.length === 0 ? (
            <p className="reportes-ranking-clientes__empty mb-0">No hay clientes para mostrar.</p>
          ) : (
            <>
              <div
                className="reportes-ranking-clientes__head-row reportes-ranking-clientes__head-row--matrix"
                role="row"
                style={{ gridTemplateColumns: gridTpl }}
              >
                <span role="columnheader">#</span>
                <span role="columnheader">Cliente</span>
                {selectedMonths.map((m) => (
                  <span key={m} role="columnheader" className="reportes-ranking-clientes__th-month">
                    {formatMonthShort(m)}
                  </span>
                ))}
                <span role="columnheader" className="reportes-ranking-clientes__th-num">
                  Total
                </span>
              </div>
              {rows.map((row, index) => (
                <div
                  key={row.client.id ?? row.client.code ?? `r-${index}`}
                  className="reportes-ranking-clientes__row reportes-ranking-clientes__row--matrix"
                  role="row"
                  style={{ gridTemplateColumns: gridTpl }}
                >
                  <span className="reportes-ranking-clientes__rank" role="cell">
                    {index + 1}
                  </span>
                  <span className="reportes-ranking-clientes__client" role="cell">
                    <span className="reportes-ranking-clientes__client-name">{row.client.name?.trim() || "—"}</span>
                    {row.client.code?.trim() ? (
                      <span className="reportes-ranking-clientes__client-code">{row.client.code.trim()}</span>
                    ) : null}
                  </span>
                  {row.monthValues.map((v, mi) => (
                    <span
                      key={selectedMonths[mi] ?? `m-${mi}`}
                      className={`reportes-ranking-clientes__cell-month${v <= 0 ? " reportes-ranking-clientes__cell-month--zero" : ""}`}
                      role="cell"
                    >
                      {formatCurrency(v)}
                    </span>
                  ))}
                  <span
                    className={`reportes-ranking-clientes__total${row.periodTotal <= 0 ? " reportes-ranking-clientes__total--zero" : ""}`}
                    role="cell"
                  >
                    {formatCurrency(row.periodTotal)}
                  </span>
                </div>
              ))}
              <div
                className="reportes-ranking-clientes__row reportes-ranking-clientes__row--matrix reportes-ranking-clientes__row--totals"
                role="row"
                style={{ gridTemplateColumns: gridTpl }}
              >
                <span className="reportes-ranking-clientes__totals-label" role="cell">
                  Σ
                </span>
                <span className="reportes-ranking-clientes__totals-label" role="cell">
                  Totales
                </span>
                {columnTotals.map((v, i) => (
                  <span key={selectedMonths[i] ?? `ct-${i}`} className="reportes-ranking-clientes__cell-month" role="cell">
                    {formatCurrency(v)}
                  </span>
                ))}
                <span className="reportes-ranking-clientes__total" role="cell">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="reportes-dash__kpi-foot reportes-ranking-clientes__foot">
        <span className="reportes-dash__kpi-foot-meses">
          <strong>{rows.length}</strong>
          <span className="reportes-dash__kpi-foot-meses-label">
            {" "}
            {rows.length === 1 ? "cliente" : "clientes"}
          </span>
        </span>
        <i className="bi bi-people reportes-hosting-detalle-mes__foot-ico" aria-hidden title="Listado de clientes" />
      </div>
    </aside>
  );
}

/** Tarjeta “Detalle por mes” mismo lenguaje visual que el panel KPI hosting (compacta, columna angosta). */
function HostingDetalleMesCard({
  periodo,
  meses,
}: {
  periodo: PeriodoFiltro;
  meses: { month: string; total: number }[];
}) {
  const sorted = useMemo(() => [...meses].sort((a, b) => a.month.localeCompare(b.month)), [meses]);

  return (
    <aside className="reportes-dash__kpis reportes-hosting-detalle-mes">
      <div className="reportes-hosting-detalle-mes__top">
        <h3 className="reportes-dash__kpi-title">Detalle por mes</h3>
        <span className="reportes-hosting-detalle-mes__period-badge">{periodoFiltroLabel(periodo)}</span>
      </div>
      <p className="reportes-hosting-detalle-mes__hint">% variación vs. mes anterior en el período</p>
      <div className="reportes-hosting-detalle-mes__list" role="table" aria-label="Detalle por mes">
        <div className="reportes-hosting-detalle-mes__head-row" role="row">
          <span role="columnheader">Mes</span>
          <span role="columnheader">Total (neto)</span>
          <span role="columnheader">% var.</span>
        </div>
        {sorted.map((row, i) => {
          const pct = pctVsMesAnteriorEnSerie(sorted, i);
          const { text, cls } = formatDetallePctCell(pct);
          return (
            <div key={row.month} className="reportes-hosting-detalle-mes__row" role="row">
              <span className="reportes-hosting-detalle-mes__row-mes" role="cell">
                {formatMonth(row.month)}
              </span>
              <span className="reportes-hosting-detalle-mes__row-total" role="cell">
                {formatCurrency(row.total)}
              </span>
              <span className={`reportes-hosting-detalle-mes__row-pct ${cls}`} role="cell">
                {text}
              </span>
            </div>
          );
        })}
      </div>
      <div className="reportes-dash__kpi-foot reportes-hosting-detalle-mes__foot">
        <span>
          <strong>{meses.length}</strong> {meses.length === 1 ? "mes" : "meses"} con datos
        </span>
        <i className="bi bi-calendar3 reportes-hosting-detalle-mes__foot-ico" aria-hidden />
      </div>
    </aside>
  );
}

export function ReportesPage() {
  const [view, setView] = useState<ReportesView>("menu");
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("year");

  const totalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const totalChartRef = useRef<ChartInstance | null>(null);
  const hostingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostingChartRef = useRef<ChartInstance | null>(null);
  const hostingVarPctCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostingVarPctChartRef = useRef<ChartInstance | null>(null);
  const rankingClientsBarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rankingClientsBarChartRef = useRef<ChartInstance | null>(null);
  const rankingCumulativeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rankingCumulativeChartRef = useRef<ChartInstance | null>(null);
  const { invoices: reportInvoices, loading: reportInvLoading, error: reportInvError } = useReportInvoices(view);
  const rankingInvoices = view === "ranking-clientes" ? reportInvoices : [];
  const { loading: clientsLoading, error, clients: rankingClients } = useClientesConTotalFacturado(rankingInvoices);
  const rankingLoading = clientsLoading || (view === "ranking-clientes" && reportInvLoading);

  const rankingClientMonthData = useMemo(() => {
    const nameToMonth = aggregateClientMonthTotals(rankingInvoices);
    const monthSet = new Set<string>();
    nameToMonth.forEach((inner) => {
      inner.forEach((_, mk) => monthSet.add(mk));
    });
    const allMonths = [...monthSet].sort((a, b) => a.localeCompare(b));
    return { nameToMonth, allMonths };
  }, [rankingInvoices]);

  const rankingAllMonthsKey = rankingClientMonthData.allMonths.join(",");
  const [rankingSelectedMonths, setRankingSelectedMonths] = useState<string[]>([]);

  useEffect(() => {
    if (view !== "ranking-clientes") return;
    const am = rankingClientMonthData.allMonths;
    if (am.length === 0) {
      setRankingSelectedMonths([]);
      return;
    }
    setRankingSelectedMonths((prev) => {
      const kept = prev.filter((x) => am.includes(x));
      if (kept.length > 0) return [...kept].sort((a, b) => a.localeCompare(b));
      const sorted = [...am].sort((a, b) => a.localeCompare(b));
      return sorted.slice(-3);
    });
  }, [view, rankingAllMonthsKey, rankingClientMonthData]);

  const rankingSelectedSorted = useMemo(() => {
    const amSet = new Set(rankingClientMonthData.allMonths);
    return [...rankingSelectedMonths].filter((m) => amSet.has(m)).sort((a, b) => a.localeCompare(b));
  }, [rankingSelectedMonths, rankingClientMonthData.allMonths]);

  const rankingMatrixRows = useMemo((): RankingMatrixRow[] => {
    const { nameToMonth } = rankingClientMonthData;
    const months = rankingSelectedSorted;
    const clientsFiltered = rankingClients.filter((c) => !isClienteTiendaOnline(c));
    if (clientsFiltered.length === 0 || months.length === 0) return [];

    return clientsFiltered
      .map((client) => {
        const name = (client.name || "").trim();
        const inner = nameToMonth.get(name);
        const monthValues = months.map((m) => inner?.get(m) ?? 0);
        const periodTotal = monthValues.reduce((s, v) => s + v, 0);
        return { client, monthValues, periodTotal };
      })
      .sort((a, b) => b.periodTotal - a.periodTotal);
  }, [rankingClients, rankingClientMonthData, rankingSelectedSorted]);

  const rankingColumnTotals = useMemo(() => {
    return rankingSelectedSorted.map((_, i) => rankingMatrixRows.reduce((s, r) => s + (r.monthValues[i] ?? 0), 0));
  }, [rankingMatrixRows, rankingSelectedSorted]);

  const rankingGrandTotal = useMemo(
    () => rankingMatrixRows.reduce((s, r) => s + r.periodTotal, 0),
    [rankingMatrixRows]
  );

  /** Último mes del período seleccionado (cronológico) y total hosting de ese mes (suma clientes del ranking). */
  const rankingLastMonthInPeriod = useMemo(() => {
    const months = rankingSelectedSorted;
    if (months.length === 0) return { label: "", total: null as number | null };
    const lastIdx = months.length - 1;
    const total = rankingColumnTotals[lastIdx];
    return {
      label: formatMonth(months[lastIdx]!),
      total: typeof total === "number" && Number.isFinite(total) ? total : 0,
    };
  }, [rankingSelectedSorted, rankingColumnTotals]);

  /** Serie acumulada por cliente (orden ranking) para gráfico multi-línea. */
  const rankingCumulativeChartModel = useMemo(() => {
    const months = rankingSelectedSorted;
    if (months.length === 0 || rankingMatrixRows.length === 0) return null;

    const labels = months.map((m) => formatMonth(m));
    const series: RankingCumulativeSeriesSpec[] = rankingMatrixRows.map((row, idx) => {
      const cum: number[] = [];
      let acc = 0;
      for (let i = 0; i < row.monthValues.length; i++) {
        acc += row.monthValues[i] ?? 0;
        cum.push(Math.round(acc * 100) / 100);
      }
      const p = RANKING_CUMULATIVE_PALETTE[idx % RANKING_CUMULATIVE_PALETTE.length]!;
      const raw = (row.client.name || "—").trim() || "—";
      return {
        label: raw.length > 48 ? `${raw.slice(0, 46)}…` : raw,
        data: cum,
        borderColor: p.border,
        fillTop: p.fillTop,
        fillMid: p.fillMid,
        fillBot: p.fillBot,
      };
    });

    return {
      labels,
      series,
      clientCount: rankingMatrixRows.length,
    };
  }, [rankingMatrixRows, rankingSelectedSorted]);

  const toggleRankingMonth = useCallback((m: string) => {
    setRankingSelectedMonths((prev) => {
      const s = new Set(prev);
      if (s.has(m)) {
        if (s.size <= 1) return prev;
        s.delete(m);
      } else {
        s.add(m);
      }
      return [...s].sort((a, b) => a.localeCompare(b));
    });
  }, []);

  const rankingMonthPreset = useCallback(
    (preset: "last3" | "year" | "all") => {
      const am = [...rankingClientMonthData.allMonths].sort((a, b) => a.localeCompare(b));
      if (am.length === 0) return;
      if (preset === "all") {
        setRankingSelectedMonths(am);
        return;
      }
      if (preset === "last3") {
        setRankingSelectedMonths(am.slice(-3));
        return;
      }
      const y = new Date().getFullYear();
      const inYear = am.filter((x) => x.startsWith(`${y}-`));
      setRankingSelectedMonths(inYear.length > 0 ? inYear : am);
    },
    [rankingClientMonthData.allMonths]
  );

  const porMesRows = useMemo(() => {
    if (view !== "por-mes" && view !== "por-hosting") return [];
    return aggregateFacturacionPorMes(reportInvoices);
  }, [view, reportInvoices]);

  const filteredMesForDash = useMemo(() => {
    if (view !== "por-mes" && view !== "por-hosting") return [];
    return filterMesRowsByPeriod(porMesRows, periodo);
  }, [view, porMesRows, periodo]);

  const kpisTotal = useMemo(() => computeKpis(filteredMesForDash), [filteredMesForDash]);

  const hostingVariacionMesData = useMemo(() => {
    if (view !== "por-hosting") return { labels: [] as string[], values: [] as number[], colors: [] as string[] };
    return computeVariacionMensualPct(filteredMesForDash);
  }, [view, filteredMesForDash]);

  const top10Ranking = useMemo(
    () => rankingMatrixRows.filter((r) => r.periodTotal > 0).slice(0, 10),
    [rankingMatrixRows]
  );

  const rankingTop10PeriodLabel = useMemo(() => {
    const m = rankingSelectedSorted;
    if (m.length === 0) return "";
    const first = m[0]!;
    const last = m[m.length - 1]!;
    if (first === last) return formatMonth(first);
    return `${formatMonth(first)} – ${formatMonth(last)}`;
  }, [rankingSelectedSorted]);

  useEffect(() => {
    if (view !== "por-mes" || reportInvLoading) {
      totalChartRef.current?.destroy();
      totalChartRef.current = null;
      return;
    }
    const canvas = totalCanvasRef.current;
    if (!canvas) return;
    totalChartRef.current?.destroy();
    const labels = filteredMesForDash.map((r) => formatMonth(r.month));
    const values = filteredMesForDash.map((r) => r.total);
    if (labels.length === 0) return;
    totalChartRef.current = createReportesAreaChart(canvas, labels, values, "Total neto ($)");
    return () => {
      totalChartRef.current?.destroy();
      totalChartRef.current = null;
    };
  }, [view, reportInvLoading, filteredMesForDash]);

  useEffect(() => {
    if (view !== "por-hosting" || reportInvLoading) {
      hostingChartRef.current?.destroy();
      hostingChartRef.current = null;
      return;
    }
    const canvas = hostingCanvasRef.current;
    if (!canvas) return;
    hostingChartRef.current?.destroy();
    const labels = filteredMesForDash.map((r) => formatMonth(r.month));
    const values = filteredMesForDash.map((r) => r.total);
    if (labels.length === 0) return;
    hostingChartRef.current = createReportesAreaChart(canvas, labels, values, "Hosting neto ($)");
    return () => {
      hostingChartRef.current?.destroy();
      hostingChartRef.current = null;
    };
  }, [view, reportInvLoading, filteredMesForDash]);

  useEffect(() => {
    if (view !== "por-hosting" || reportInvLoading) {
      hostingVarPctChartRef.current?.destroy();
      hostingVarPctChartRef.current = null;
      return;
    }
    const canvas = hostingVarPctCanvasRef.current;
    if (!canvas) return;
    hostingVarPctChartRef.current?.destroy();
    const { labels, values, colors } = hostingVariacionMesData;
    if (labels.length === 0) return;

    hostingVarPctChartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Variación %",
            data: values,
            backgroundColor: colors,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.97)",
            titleColor: "#1e293b",
            bodyColor: "#334155",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title(items) {
                return items[0]?.label ?? "";
              },
              label(ctx) {
                const v = ctx.parsed.y;
                if (typeof v !== "number") return "";
                return `Variación vs mes anterior: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#64748b", maxRotation: 45, minRotation: 0, font: { size: 11 } },
            border: { color: "#e2e8f0" },
          },
          y: {
            grid: { color: "rgba(148, 163, 184, 0.12)" },
            ticks: {
              color: "#94a3b8",
              font: { size: 11 },
              callback(v) {
                const n = Number(v);
                return Number.isFinite(n) ? `${n}%` : String(v);
              },
            },
            border: { display: false },
          },
        },
      },
    });

    const wrap = canvas.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined" && wrap
        ? new ResizeObserver(() => {
            hostingVarPctChartRef.current?.resize();
          })
        : null;
    if (wrap && ro) ro.observe(wrap);

    return () => {
      ro?.disconnect();
      hostingVarPctChartRef.current?.destroy();
      hostingVarPctChartRef.current = null;
    };
  }, [view, reportInvLoading, hostingVariacionMesData]);

  useEffect(() => {
    if (view !== "ranking-clientes" || rankingLoading) {
      rankingClientsBarChartRef.current?.destroy();
      rankingClientsBarChartRef.current = null;
      return;
    }
    const canvas = rankingClientsBarCanvasRef.current;
    if (!canvas) {
      rankingClientsBarChartRef.current?.destroy();
      rankingClientsBarChartRef.current = null;
      return;
    }
    rankingClientsBarChartRef.current?.destroy();
    const fullNames = rankingMatrixRows.map((r) => (r.client.name || "").trim() || "—");
    const labelsTruncated = fullNames.map((n) => truncateRankingBarLabel(n));
    const amountValues = rankingMatrixRows.map((r) => r.periodTotal);
    const grand = rankingGrandTotal;
    const pctValues = amountValues.map((t) =>
      Number.isFinite(grand) && Math.abs(grand) > 1e-9 ? (t / grand) * 100 : 0
    );
    if (fullNames.length === 0) {
      rankingClientsBarChartRef.current?.destroy();
      rankingClientsBarChartRef.current = null;
      return;
    }
    const minPct = pctValues.length ? Math.min(...pctValues) : 0;
    const maxPct = pctValues.length ? Math.max(...pctValues) : 0;
    /** Eje X sin escala visible: el máximo sigue al dato mayor para que la barra principal llegue al borde derecho. */
    const xScale =
      minPct >= -1e-6
        ? {
            beginAtZero: true as const,
            max: maxPct <= 0 ? 1 : maxPct * 1.02,
          }
        : {
            beginAtZero: false as const,
            min: Math.min(minPct * 1.08 - 0.5, 0),
            max: Math.max(maxPct * 1.08 + 0.5, 0),
          };
    rankingClientsBarChartRef.current = createReportesRankingClientsBarChart(
      canvas,
      labelsTruncated,
      fullNames,
      pctValues,
      amountValues,
      grand,
      xScale
    );
    const wrap = canvas.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined" && wrap
        ? new ResizeObserver(() => {
            rankingClientsBarChartRef.current?.resize();
          })
        : null;
    if (wrap && ro) ro.observe(wrap);
    return () => {
      ro?.disconnect();
      rankingClientsBarChartRef.current?.destroy();
      rankingClientsBarChartRef.current = null;
    };
  }, [view, rankingLoading, rankingMatrixRows, rankingGrandTotal]);

  useEffect(() => {
    if (view !== "ranking-clientes" || rankingLoading) {
      rankingCumulativeChartRef.current?.destroy();
      rankingCumulativeChartRef.current = null;
      return;
    }
    const canvas = rankingCumulativeCanvasRef.current;
    if (!canvas) {
      rankingCumulativeChartRef.current?.destroy();
      rankingCumulativeChartRef.current = null;
      return;
    }
    const model = rankingCumulativeChartModel;
    if (!model || model.series.length === 0) {
      rankingCumulativeChartRef.current?.destroy();
      rankingCumulativeChartRef.current = null;
      return;
    }
    rankingCumulativeChartRef.current?.destroy();
    rankingCumulativeChartRef.current = createReportesRankingCumulativeChart(
      canvas,
      model.labels,
      model.series
    );
    const wrap = canvas.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined" && wrap
        ? new ResizeObserver(() => {
            rankingCumulativeChartRef.current?.resize();
          })
        : null;
    if (wrap && ro) ro.observe(wrap);
    return () => {
      ro?.disconnect();
      rankingCumulativeChartRef.current?.destroy();
      rankingCumulativeChartRef.current = null;
    };
  }, [view, rankingLoading, rankingCumulativeChartModel]);

  return (
    <div className="fact-page reportes-page">
      <div className="container">
        <PageHeader title="Reportes" />

        <div className="hrs-card p-4">
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
            <div className="mt-2">
              <h5 className="fw-bold mb-2" style={{ color: "#1e3a5f" }}>
                📊 Facturación total
              </h5>
              <p className="text-muted small mb-3">
                Por mes: Facturas menos Notas de Crédito (sin recibos). Vista tipo panel + evolución.
              </p>
              {reportInvError && (
                <div className="alert alert-danger" role="alert">
                  {reportInvError}
                </div>
              )}
              {reportInvLoading ? (
                <div className="d-flex justify-content-center py-5">
                  <div className="spinner-border text-primary" role="status" aria-label="Cargando facturas" />
                </div>
              ) : filteredMesForDash.length === 0 ? (
                <p className="text-muted mb-0">No hay datos en el período seleccionado.</p>
              ) : (
                <div className="reportes-dash reportes-dash--total">
                  <ReportesKpiPanel
                    tituloResumen="Total facturado (neto)"
                    kpis={kpisTotal}
                    periodo={periodo}
                    onPeriodo={setPeriodo}
                  />
                  <div className="reportes-dash__chart">
                    <p className="reportes-dash__chart-title">Evolución mensual ({kpisTotal.rangoEtiqueta})</p>
                    <div className="reportes-dash__canvas-wrap">
                      <canvas ref={totalCanvasRef} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "ranking-clientes" && (
            <div className="reportes-listado-wrap border-0 shadow-none reportes-ranking-page" style={{ background: "transparent" }}>
              <h6 className="reportes-ranking-page__title">🏆 Ranking de Facturación de Hosting</h6>
              <p className="reportes-ranking-page__lede"> 
                Facturación Hosting por Cliente.
              </p>
              {(error || reportInvError) && (
                <div className="alert alert-danger" role="alert">
                  {error || reportInvError}
                </div>
              )}
              {rankingLoading ? (
                <div className="d-flex justify-content-center py-4">
                  <div className="spinner-border text-primary" role="status" aria-label="Espere un momento" />
                </div>
              ) : (
                <div className="reportes-ranking-connected">
                  {rankingClientMonthData.allMonths.length === 0 ? (
                    <p className="reportes-ranking-connected__no-data mb-0">
                      No hay facturas hosting con mes informado.
                    </p>
                  ) : (
                    <>
                      <RankingPeriodFilter
                        availableMonths={rankingClientMonthData.allMonths}
                        selectedMonths={rankingSelectedSorted}
                        onToggleMonth={toggleRankingMonth}
                        onPreset={rankingMonthPreset}
                      />
                      <div className="reportes-ranking-connected__stack">
                        <div className="reportes-ranking-connected__top-row">
                          <div className="reportes-ranking-connected__top-col reportes-ranking-connected__top-col--rank">
                            {top10Ranking.length > 0 ? (
                              <RankingTop10Dashboard
                                embedded
                                items={top10Ranking}
                                periodLabel={rankingTop10PeriodLabel}
                                grandTotal={rankingGrandTotal}
                                totalClientCount={rankingMatrixRows.length}
                                lastMonthLabel={rankingLastMonthInPeriod.label}
                                lastMonthTotal={rankingLastMonthInPeriod.total}
                              />
                            ) : (
                              <div className="reportes-ranking-connected__empty-top10">
                                No hay clientes con facturación positiva en los meses seleccionados para armar el Top 10.
                              </div>
                            )}
                          </div>
                          <div className="reportes-ranking-connected__top-col reportes-ranking-connected__top-col--chart">
                            {rankingSelectedSorted.length > 0 ? (
                              <div className="reportes-ranking-evolution-chart">
                                <p className="reportes-dash__chart-title mb-1">
                                  % por cliente ({rankingTop10PeriodLabel || "—"})
                                </p>
                                <p className="reportes-ranking-evolution-chart__subtitle">
                                  Participación sobre el total acumulado del período (
                                  {formatCurrency(rankingGrandTotal)}
                                  ) — mismo criterio que la tabla
                                </p>
                                {rankingMatrixRows.length === 0 ? (
                                  <p className="text-muted small mb-0 mt-2">No hay clientes para mostrar.</p>
                                ) : (
                                  <div
                                    className="reportes-dash__canvas-wrap reportes-ranking-evolution-chart__canvas reportes-ranking-clients-bar-chart__canvas"
                                    style={{
                                      minHeight: Math.min(720, Math.max(220, rankingMatrixRows.length * 22)),
                                    }}
                                  >
                                    <canvas
                                      ref={rankingClientsBarCanvasRef}
                                      aria-label="Gráfico de barras: porcentaje de facturación hosting de cada cliente sobre el total del período"
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="reportes-ranking-evolution-chart reportes-ranking-evolution-chart--empty">
                                <p className="reportes-dash__chart-title mb-1">% por cliente</p>
                                <p className="text-muted small mb-0">Seleccioná meses en el período para ver el gráfico.</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="reportes-ranking-connected__split" aria-hidden />
                        {rankingSelectedSorted.length > 0 && rankingMatrixRows.length > 0 ? (
                          <div className="reportes-ranking-cumulative">
                            <div className="reportes-ranking-cumulative__inner">
                              <p className="reportes-dash__chart-title mb-1">
                                Acumulado por cliente ({rankingTop10PeriodLabel || "—"})
                              </p>
                              <p className="reportes-ranking-cumulative__subtitle">
                                Neto hosting: suma corrida mes a mes. <strong>Todos los clientes</strong> del ranking
                                (mismo criterio que la tabla): una línea cada uno, degradado bajo la curva y marcadores
                                como el gráfico de evolución. Leyenda abajo (con scroll si hay muchos): clic para
                                ocultar o mostrar series.
                              </p>
                              <div
                                className="reportes-dash__canvas-wrap reportes-ranking-cumulative__canvas"
                                style={{
                                  minHeight: Math.min(
                                    1400,
                                    Math.max(400, 280 + (rankingCumulativeChartModel?.clientCount ?? 1) * 7)
                                  ),
                                }}
                              >
                                <canvas
                                  ref={rankingCumulativeCanvasRef}
                                  aria-label="Evolución de facturación acumulada por cliente y mes"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <RankingClientesCard
                          embedded
                          rows={rankingMatrixRows}
                          selectedMonths={rankingSelectedSorted}
                          availableMonths={rankingClientMonthData.allMonths}
                          columnTotals={rankingColumnTotals}
                          grandTotal={rankingGrandTotal}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {view === "por-hosting" && (
            <div className="reportes-listado-wrap border-0 shadow-none" style={{ background: "transparent" }}>
              <h6 className="fw-bold m-0 mb-2" style={{ color: "#1e3a5f" }}>
                📋 Facturación hosting por mes
              </h6>
              {reportInvError && (
                <div className="alert alert-danger" role="alert">
                  {reportInvError}
                </div>
              )}
              {reportInvLoading ? (
                <div className="d-flex justify-content-center py-5">
                  <div className="spinner-border text-primary" role="status" aria-label="Cargando facturas hosting" />
                </div>
              ) : porMesRows.length === 0 ? (
                <p className="text-muted mb-0">No hay datos de facturación por mes.</p>
              ) : filteredMesForDash.length === 0 ? (
                <p className="text-muted mb-0">No hay datos en el período seleccionado.</p>
              ) : (
                <>
                  <div className="reportes-dash">
                    <ReportesKpiPanel
                      tituloResumen="Hosting facturado (neto)"
                      kpis={kpisTotal}
                      periodo={periodo}
                      onPeriodo={setPeriodo}
                      showCalendarioMeses
                    />
                    <div className="reportes-dash__chart">
                      <p className="reportes-dash__chart-title">Evolución mensual ({kpisTotal.rangoEtiqueta})</p>
                      <div className="reportes-dash__canvas-wrap">
                        <canvas ref={hostingCanvasRef} />
                      </div>
                    </div>
                  </div>
                  <div id="reportes-hosting-tabla" className="reportes-dash__section-below reportes-hosting-detail-row">
                    <div className="reportes-hosting-detail-row__col reportes-hosting-detail-row__col--chart">
                      {hostingVariacionMesData.labels.length > 0 ? (
                        <div className="reportes-dash__chart reportes-hosting-var-chart mb-0">
                          <p className="reportes-dash__chart-title">
                            Variación % de facturación (mensual vs mes anterior)
                          </p>
                          <div className="reportes-dash__canvas-wrap">
                            <canvas ref={hostingVarPctCanvasRef} />
                          </div>
                        </div>
                      ) : filteredMesForDash.length === 1 ? (
                        <div className="reportes-hosting-var-chart reportes-hosting-detail-row__solo-mes p-3">
                          <p className="text-muted small mb-0">
                            Hay un solo mes en el período: la variación % requiere al menos dos meses consecutivos.
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="reportes-hosting-detail-row__col reportes-hosting-detail-row__col--detalle">
                      <HostingDetalleMesCard periodo={periodo} meses={filteredMesForDash} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
