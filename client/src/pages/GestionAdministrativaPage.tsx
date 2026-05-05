import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import "../styles/facturacion.css";

const hubItems = [
  {
    to: "/hosting",
    icon: "bi-hdd-network",
    label: "Servicios de Hosting",
    desc: "Información de facturación de servicios de hosting",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/asic",
    icon: "bi-cpu",
    label: "Equipos ASIC",
    desc: "Información de facturación de equipos de minería ASIC",
    roles: ["admin_a", "admin_b", "operador"],
  },
  {
    to: "/gestion-financiera",
    icon: "bi-cash-stack",
    label: "Gestión Financiera",
    desc: "Reportes, cuentas por cliente y operaciones de cambio (USDT/USD)",
    roles: ["admin_a", "admin_b", "operador"],
  },
] as const;

function roleNorm(r: string | undefined) {
  return (r ?? "").toLowerCase().trim();
}

export function GestionAdministrativaPage() {
  const { user } = useAuth();
  const canSeeLeaf = (roles: readonly string[]) =>
    user != null && roles.some((r) => roleNorm(r) === roleNorm(user.role));

  const visible = hubItems.filter((item) => canSeeLeaf(item.roles));

  /** Sin permiso sobre ningún módulo: no debe quedar página vacía ni acceso indebido */
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
