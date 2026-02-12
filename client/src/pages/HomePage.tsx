import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { updateMyPassword } from "../lib/api";
import { showToast } from "../components/ToastNotification";
import "../styles/hrshome.css";

const menuItems: Array<{ to: string; icon: string; label: string; desc: string; roles?: string[] }> = [
  { to: "/facturacion", icon: "bi-receipt", label: "Facturación", desc: "Emitir facturas, recibos y notas de crédito", roles: ["admin_a", "admin_b", "operador"] },
  { to: "/historial", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  { to: "/clientes", icon: "bi-people", label: "Clientes", desc: "Administrar cartera de clientes" },
  { to: "/reportes", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" }
];

export function HomePage() {
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const visibleMenuItems = menuItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

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
        showToast("Contraseña actualizada.", "success");
        setShowPasswordModal(false);
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al actualizar", "error"))
      .finally(() => setSaving(false));
  }

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
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Cambiar mi contraseña</h5>
                <button type="button" className="btn-close" onClick={() => setShowPasswordModal(false)} aria-label="Cerrar" />
              </div>
              <form onSubmit={handleChangePassword}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Usuario</label>
                    <input type="text" className="form-control" value={user.email || user.username} readOnly disabled />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Nueva contraseña (mín. 6 caracteres)</label>
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
                    <label className="form-label">Confirmar nueva contraseña</label>
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
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
