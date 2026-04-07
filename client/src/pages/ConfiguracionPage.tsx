import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/PageHeader";
import "../styles/facturacion.css";

const configMenuItems: Array<{ to: string; icon: string; label: string; desc: string }> = [
  {
    to: "/marketplacedashboard",
    icon: "bi-shop-window",
    label: "Tienda Online Configuración",
    desc: "Configuración de precios y productos publicados en la tienda ASIC",
  },
  { to: "/equipos-asic/equipos", icon: "bi-gear", label: "Gestión de Equipos ASIC", desc: "Configuración de Equipos ASIC por marca y modelo" },
  { to: "/equipos-asic/setup", icon: "bi-tools", label: "Gestión de Setup", desc: "Configuración de tipos de Setup" },
  { to: "/equipos-asic/items-garantia", icon: "bi-list-ul", label: "Gestión de Garantías ANDE", desc: "Configuración de Garantías ANDE por tipo de equipo" },
];

export function ConfiguracionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_a" || user?.role === "admin_b";

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Configuración" />

        <div className="hrs-card p-4">
          <p className="text-muted small mb-3">Opciones de configuración del sistema:</p>
          <div className="reportes-grid">
            {configMenuItems.map((item) => (
              <Link key={item.to} to={item.to} className="reportes-card mineria-hub-card">
                <div className="reportes-card-icon">
                  <i className={`bi ${item.icon}`} />
                </div>
                <h3 className="reportes-card-title">{item.label}</h3>
                <p className="reportes-card-desc">{item.desc}</p>
              </Link>
            ))}
            {isAdmin && (
              <Link to="/usuarios" className="reportes-card mineria-hub-card">
                <div className="reportes-card-icon">
                  <i className="bi bi-shield-lock" />
                </div>
                <h3 className="reportes-card-title">Usuarios y permisos</h3>
                <p className="reportes-card-desc">Gestionar accesos y roles</p>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
