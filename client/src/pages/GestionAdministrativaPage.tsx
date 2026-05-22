import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

type HubItem = {
  to: string;
  icon: string;
  label: string;
  desc: string;
};

const hubItems: readonly HubItem[] = [
  {
    to: "/hosting",
    icon: "bi-hdd-network",
    label: "Servicios de Hosting",
    desc: "Información de facturación de servicios de hosting",
  },
  {
    to: "/asic",
    icon: "bi-cpu",
    label: "Equipos ASIC",
    desc: "Información de facturación de equipos de minería ASIC",
  },
  {
    to: "/gestion-financiera",
    icon: "bi-cash-stack",
    label: "Gestión Financiera",
    desc: "Reportes, cuentas por cliente y operaciones de cambio (USDT/USD)",
  },
  {
    to: "/gestion-administrativa/nuevos-leads",
    icon: "bi-person-plus-fill",
    label: "Nuevos Leads",
    desc: "Registro de potenciales compradores de equipos ASIC y exportación de contactos",
  },
  {
    to: "/gestion-administrativa/leads-base",
    icon: "bi-database-fill",
    label: "Leads Base",
    desc: "Consulta de todos los leads en POTENCIALES CLIENTES",
  },
];

export function GestionAdministrativaPage() {
  const { user } = useAuth();
  const visible = hubItems.filter((item) => canUserAccessNavPath(user, item.to));

  if (!user || visible.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Gestión Administrativa — HRS GROUP S.A." />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Área interna corporativa: Hosting, Equipos ASIC y Gestión Financiera (mismo estilo de tarjetas que en el resto del
            SGI).
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
