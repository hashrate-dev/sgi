import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { updateMyPassword } from "../lib/api";
import { showToast } from "../components/ToastNotification";
import "../styles/hrshome.css";

const menuItems: Array<{ to: string; icon: string; label: string; desc: string; roles?: string[] }> = [
  { to: "/hosting", icon: "bi-receipt", label: "Servicios de Hosting", desc: "Información de Facturación de Servicios de Hosting", roles: ["admin_a", "admin_b", "operador"] },
  { to: "/equipos-asic", icon: "bi-cpu", label: "Equipos ASIC", desc: "Información de Facturación de Equipos de Minería ASIC", roles: ["admin_a", "admin_b", "operador"] },
  { to: "/historial-hosting", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  { to: "/pendientes-hosting", icon: "bi-hourglass-split", label: "Pendientes", desc: "Facturas pendientes de cobro" },
  { to: "/clientes", icon: "bi-people", label: "Clientes", desc: "Administrar cartera de clientes" },
  { to: "/reportes", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" }
];

export function HomePage() {
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/images/HRSLOGO.png");
  const visibleMenuItems = menuItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  useEffect(() => {
    // Verificar que la imagen existe
    const img = new Image();
    img.onload = () => {
      setLogoSrc("/images/HRSLOGO.png");
    };
    img.onerror = () => {
      console.warn("HRSLOGO.png not found, using fallback");
      setLogoSrc("/images/HASHRATELOGO2.png");
    };
    img.src = "/images/HRSLOGO.png";
  }, []);

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Las contraseñas no coinciden.", "error");
      return;
    }
    setSaving(true);
    updateMyPassword(newPassword)
      .then(() => {
        showToast("✓ Tu contraseña ha sido cambiada exitosamente.", "success");
        setShowPasswordModal(false);
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al actualizar la contraseña", "error"))
      .finally(() => setSaving(false));
  }

  return (
    <div className="hrs-home">
      <div className="hrs-home-container">
        <header className="hrs-home-header">
          <div className="hrs-home-brand">
            <img 
              src={logoSrc} 
              alt="HRS Logo" 
              className="hrs-home-logo"
              onError={() => {
                console.error("Error loading HRSLOGO.png, trying fallback");
                setLogoSrc("/images/HASHRATELOGO2.png");
              }}
            />
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
              <button type="button" className="btn btn-link py-0 px-2" onClick={() => setShowPasswordModal(true)} title="Cambiar mi contraseña">
                <i className="bi bi-key" /> Cambiar contraseña
              </button>
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
          {(user?.role === "admin_a" || user?.role === "admin_b") && (
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

      {showPasswordModal && user && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-form">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15C14.2091 15 16 13.2091 16 11C16 8.79086 14.2091 7 12 7C9.79086 7 8 8.79086 8 11C8 13.2091 9.79086 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3.41016 11C3.41016 16.5563 7.44365 21 12.9999 21C18.5562 21 22.5897 16.5563 22.5897 11C22.5897 5.44365 18.5562 1 12.9999 1C7.44365 1 3.41016 5.44365 3.41016 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 11V15M12 7V7.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title">Cambiar mi contraseña</h5>
                <button type="button" className="professional-modal-close" onClick={() => setShowPasswordModal(false)} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleChangePassword}>
                <div className="modal-body professional-modal-body">
                  <div className="mb-3">
                    <label className="form-label professional-modal-body .form-label">Usuario</label>
                    <input type="text" className="form-control" value={user.email || user.username} readOnly disabled style={{ background: "#f3f4f6", cursor: "not-allowed" }} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label professional-modal-body .form-label">Nueva contraseña (mín. 6 caracteres)</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label professional-modal-body .form-label">Confirmar nueva contraseña</label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="modal-footer professional-modal-footer">
                  <button type="button" className="professional-btn professional-btn-secondary" onClick={() => setShowPasswordModal(false)}>Cancelar</button>
                  <button type="submit" className="professional-btn professional-btn-primary" disabled={saving}>
                    {saving ? (
                      <>
                        <span className="professional-btn-spinner"></span>
                        Guardando...
                      </>
                    ) : (
                      "Guardar"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
