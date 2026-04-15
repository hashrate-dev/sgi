import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";

const asicMenuItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  { to: "/facturacion-equipos", icon: "bi-receipt", label: "Emitir Facturas de Equipos ASIC", desc: "Emisión de Facturas, Notas de Crédito y Recibos" },
  { to: "/historial-equipos", icon: "bi-clock-history", label: "Historial Venta de ASIC", desc: "Ver y gestionar comprobantes por Ventas de Equipos ASIC" },
  { to: "/pendientes-equipos", icon: "bi-hourglass-split", label: "Pendientes de Cobro", desc: "Facturas pendientes de cobro por venta de Equipos ASIC" },
  { to: "/equipos-asic/garantia-ande", icon: "bi-file-earmark-text", label: "Recibos Garantía ANDE", desc: "Emisión de recibos de garantía ANDE para equipos" },
  { to: "/equipos-asic/garantias-historial", icon: "bi-clock-history", label: "Historial Garantías ANDE", desc: "Ver y gestionar documentos de Garantia ANDE" },
];

export function MineriaHubPage() {
  return (
    <div className="fact-page mineria-page">
      <div className="container">
        <PageHeader title="Equipos ASIC" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">Espacio para gestionar todo lo relacionado a la venta de Equipos ASIC:</p>
          <div className="reportes-grid">
            {asicMenuItems.map((item) => (
              <Link key={item.to} to={item.to} className="reportes-card mineria-hub-card">
                <div className="reportes-card-icon">
                  <i className={`bi ${item.icon}`} />
                </div>
                <h3 className="reportes-card-title">{item.label}</h3>
                <p className="reportes-card-desc">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
