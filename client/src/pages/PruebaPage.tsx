import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

const cambioMenuItems = [
  {
    to: "/hosting/exchange-operations",
    icon: "bi-currency-exchange",
    label: "Operaciones de Cambio USDT/USD",
    desc: "Registro de compra/venta USDT con comisión, banco y cuenta por cliente Hosting",
  },
  {
    to: "/hosting/tipo-cambio-historial",
    icon: "bi-journal-text",
    label: "Historial tipo de cambio",
    desc: "Tablas de operaciones USDT/USD y facturas hosting con comisión 4% transferencia (recibo pagado)",
  },
] as const;

export function PruebaPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const visible = cambioMenuItems.filter((item) => canUserAccessNavPath(user, item.to));
  if (visible.length === 0) {
    return <Navigate to="/gestion-financiera" replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title="Cambio USDT/USD"
          showBackButton
          backTo="/gestion-financiera"
          backText="Volver a Gestión Financiera"
        />
        <div className="hrs-card p-4">
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
