import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

const hubItems = [
  {
    to: "/gestion-administrativa/cambio-usdt/clientes",
    icon: "bi-people-fill",
    label: "Clientes de Cambio USDT",
    desc: "Registrar y editar clientes que solo operan cambio USDT/USD (código FX). Alimentan el formulario de Operaciones de Cambio.",
  },
  {
    to: "/gestion-administrativa/exchange",
    icon: "bi-currency-exchange",
    label: "Operaciones de Cambio",
    desc: "Registro de compra/venta USDT, historial y comisiones (mismo acceso que desde Gestión Financiera).",
  },
] as const;

export function CambioUsdtHubPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const visible = hubItems.filter((item) => canUserAccessNavPath(user, item.to));
  if (visible.length === 0) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Servicios de Cambio USDT"
          showBackButton
          backTo="/gestion-administrativa"
          backText="Volver a Gestión Administrativa"
        />
        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Gestión de clientes exclusivos de cambio y operaciones USDT/USD vinculadas al SGI.
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
