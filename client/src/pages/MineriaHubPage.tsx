import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

const asicMenuItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  {
    to: "/asic/monitor-equipos",
    icon: "bi-speedometer2",
    label: "Monitor equipos ASIC (NiceHash)",
    desc: "En vivo desde tus enlaces watcher W1…WN (NiceHash por cuenta). El listado local con notas: ?registro=1 o el botón «Registro» en el tablero.",
  },
  {
    to: "/asic/equipos-dados-de-baja",
    icon: "bi-archive",
    label: "Equipos ASIC dados de baja",
    desc: "Listado de equipos retirados del monitor (snapshot en servidor; venta o baja del sistema)",
  },
  {
    to: "/asic/cotizador-china-py",
    icon: "bi-calculator",
    label: "Cotizador China → Paraguay",
    desc: "Cotizador de equipos ASIC de China a Paraguay",
  },
  { to: "/asic/billing", icon: "bi-receipt", label: "Emitir Facturas de Equipos ASIC", desc: "Emisión de Facturas, Notas de Crédito y Recibos" },
  { to: "/asic/history", icon: "bi-clock-history", label: "Historial Venta de ASIC", desc: "Ver y gestionar comprobantes por Ventas de Equipos ASIC" },
  { to: "/asic/pending", icon: "bi-hourglass-split", label: "Pendientes de Cobro", desc: "Facturas pendientes de cobro por venta de Equipos ASIC" },
  { to: "/asic/ande-warranty", icon: "bi-file-earmark-text", label: "Recibos Garantía ANDE", desc: "Emisión de recibos de garantía ANDE para equipos" },
  { to: "/asic/warranties-history", icon: "bi-clock-history", label: "Historial Garantías ANDE", desc: "Ver y gestionar documentos de Garantia ANDE" },
];

export function MineriaHubPage() {
  const { user } = useAuth();
  const visible = useMemo(
    () => asicMenuItems.filter((item) => canUserAccessNavPath(user, item.to)),
    [user]
  );

  if (!user || visible.length === 0) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  return (
    <div className="fact-page mineria-page">
      <div className="container">
        <PageHeader title="Equipos ASIC" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">Espacio para gestionar todo lo relacionado a la venta de Equipos ASIC:</p>
          <div className="reportes-grid">
            {visible.map((item) => (
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
