import { Link, Navigate } from "react-router-dom";
import { sgiHome } from "../lib/marketplacePaths.js";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";

const hubItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  {
    to: "/clients/hosting",
    icon: "bi-hdd-stack",
    label: "Clientes · Hosting",
    desc: "Administración de Clientes Hosting.",
  },
  {
    to: "/clients/store",
    icon: "bi-bag-heart",
    label: "Clientes · Tienda online",
    desc: "Administración de Cuentas Registradas en Tienda Online",
  },
];

export function ClientesHubPage() {
  const { user } = useAuth();
  const visible = hubItems.filter((item) => canUserAccessNavPath(user, item.to));

  if (!user || visible.length === 0) {
    return <Navigate to={sgiHome()} replace />;
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Clientes" backTo="/" backText="Volver al inicio" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Elegí el tipo de cartera: facturación <strong>hosting</strong> o cuentas de la <strong>tienda online</strong>.
          </p>
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
