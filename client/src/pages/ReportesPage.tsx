import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { PageHeader } from "../components/PageHeader";
import { loadInvoices } from "../lib/storage";
import "../styles/facturacion.css";

export function ReportesPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const all = loadInvoices();
    const byMonth = new Map<string, number>();
    all.forEach((inv) => {
      // Las Notas de Crédito y Recibos relacionados deben restarse (valores negativos)
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
  }, []);

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Reportes" />

        <div className="hrs-card p-4">
          <div className="card mt-4 p-4">
            <h5 className="fw-bold mb-3">📊 Facturación Total por Mes</h5>
            <canvas ref={canvasRef} height={120} />
          </div>
        </div>
      </div>
    </div>
  );
}

