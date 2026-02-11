import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/hrshome.css";

const menuItems: Array<{ to: string; icon: string; label: string; desc: string; roles?: string[] }> = [
  { to: "/facturacion", icon: "bi-receipt", label: "Facturación", desc: "Emitir facturas, recibos y notas de crédito", roles: ["admin", "operador"] },
  { to: "/historial", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  { to: "/clientes", icon: "bi-people", label: "Clientes", desc: "Administrar cartera de clientes" },
  { to: "/reportes", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" }
];

export function HomePage() {
  const { user, logout } = useAuth();
  const visibleMenuItems = menuItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="hrs-home">
      <div className="hrs-home-container">
        <header className="hrs-home-header">
          <div className="hrs-home-brand">
            <span className="hrs-home-logo">HRS</span>
            <div>
              <h1 className="hrs-home-title">HRS GROUP S.A</h1>
              <p className="hrs-home-subtitle">Sistema de Gestión Interna</p>
            </div>
          </div>
          {user && (
            <div className="hrs-home-user">
              <span className="hrs-home-user-badge">
                <i className="bi bi-person-circle me-2" />
                <span className="hrs-home-user-email">{user.email || user.username}</span>
                <span className="hrs-home-user-role">{user.role}</span>
              </span>
              <button type="button" className="hrs-home-logout btn btn-link" onClick={logout}>
                <i className="bi bi-box-arrow-right me-1" />
                Cerrar sesión
              </button>
            </div>
          )}
        </header>

        <main className="hrs-home-grid">
          {visibleMenuItems.map((item) => (
            <Link key={item.to} to={item.to} className="hrs-home-card">
              <div className="hrs-home-card-icon">
                <i className={`bi ${item.icon}`} />
              </div>
              <h3 className="hrs-home-card-title">{item.label}</h3>
              <p className="hrs-home-card-desc">{item.desc}</p>
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link to="/usuarios" className="hrs-home-card hrs-home-card-admin">
              <div className="hrs-home-card-icon">
                <i className="bi bi-shield-lock" />
              </div>
              <h3 className="hrs-home-card-title">Usuarios y permisos</h3>
              <p className="hrs-home-card-desc">Gestionar accesos y roles</p>
            </Link>
          )}
        </main>
      </div>
    </div>
  );
}
