import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";

const hostingMenuItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  { to: "/facturacion-hosting", icon: "bi-receipt", label: "Emitir Facturas de Hosting", desc: "Emisión de Facturas, Notas de Crédito y Recibos" },
  { to: "/historial-hosting", icon: "bi-clock-history", label: "Historial Servicios de Hosting", desc: "Ver y gestionar comprobantes por Servicios de Hosting" },
  { to: "/pendientes-hosting", icon: "bi-hourglass-split", label: "Pendientes de Cobro", desc: "Facturas pendientes de cobro por venta de Servicios de Hosting" },
];

export function HostingHubPage() {
  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Servicios de Hosting" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">Espacio para gestionar todo lo relacionado a la venta de Servicios de Hosting de Minería:</p>
          <div className="reportes-grid">
            {hostingMenuItems.map((item) => (
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
