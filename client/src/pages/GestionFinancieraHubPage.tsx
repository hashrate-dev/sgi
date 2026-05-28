import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

type FinHubItem = {
  to: string;
  icon: string;
  label: string;
  desc: string;
};

const hubItems: readonly FinHubItem[] = [
  {
    to: "/gestion-financiera/proveedores",
    icon: "bi-building",
    label: "Proveedores",
    desc: "Registro de proveedores HRS con número único (P001, P002…) y datos fiscales / contacto",
  },
  {
    to: "/gestion-financiera/contabilidad",
    icon: "bi-calculator",
    label: "Contabilidad",
    desc: "Registro de gastos de empresa: fecha, proveedor, descripción, moneda (UYU / USD / PYG) e importe",
  },
  {
    to: "/gestion-financiera/monitor-financiero",
    icon: "bi-speedometer2",
    label: "Monitor Financiero",
    desc: "Dashboard de gastos de contabilidad: totales por moneda, por mes de presupuesto y últimos movimientos",
  },
  {
    to: "/reports",
    icon: "bi-graph-up-arrow",
    label: "Reportes",
    desc: "Estadísticas, rankings y análisis de facturación",
  },
  {
    to: "/clients/account",
    icon: "bi-journal-text",
    label: "Cuenta por cliente",
    desc: "Movimientos históricos por cliente (hosting y ASIC)",
  },
];

export function GestionFinancieraHubPage() {
  const { user } = useAuth();
  const visible = hubItems.filter((item) => canUserAccessNavPath(user, item.to));

  if (!user || visible.length === 0) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Gestión Financiera" backTo="/gestion-administrativa" backText="Volver a Gestión Administrativa" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Herramientas de consulta y seguimiento financiero vinculadas al SGI (mismo estilo de accesos que en Hosting /
            ASIC).
          </p>
          <div className="reportes-grid">
            {visible.map((item) => (
              <Link key={item.to} to={item.to} className="reportes-card mineria-hub-card">
                <div className="reportes-card-icon">
                  <i className={`bi ${item.icon}`} aria-hidden />
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
