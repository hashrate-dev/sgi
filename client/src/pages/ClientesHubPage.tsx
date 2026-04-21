import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
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
  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Clientes" backTo="/" backText="Volver al inicio" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">
            Elegí el tipo de cartera: facturación <strong>hosting</strong> o cuentas de la <strong>tienda online</strong>.
          </p>
          <div className="reportes-grid">
            {hubItems.map((item) => (
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
