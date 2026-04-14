import { useState, useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getMarketplacePresenceStats, getMarketplaceQuoteTicketsStats, updateMyPassword } from "../lib/api";
import { canViewMarketplaceQuoteTickets } from "../lib/auth.js";
import { playMarketplaceOrderNotificationSound } from "../lib/marketplaceCartSound";
import { showToast } from "../components/ToastNotification";
import "../styles/hrshome.css";
import "../styles/marketplace-hashrate.css";

const menuItems: Array<{ to: string; icon: string; label: string; desc: string; roles?: string[]; cardClass?: string }> = [
  {
    to: "/marketplace",
    icon: "bi-bag-heart",
    label: "Tienda online",
    desc: "Catálogo público de equipos ASIC — vista cliente (sin administración)",
    cardClass: "hrs-home-card--tienda-cliente",
  },
  { to: "/hosting", icon: "bi-receipt", label: "Servicios de Hosting", desc: "Información de Facturación de Servicios de Hosting", roles: ["admin_a", "admin_b", "operador"] },
  { to: "/equipos-asic", icon: "bi-cpu", label: "Equipos ASIC", desc: "Información de Facturación de Equipos de Minería ASIC", roles: ["admin_a", "admin_b", "operador"] },
  { to: "/kryptex", icon: "bi-currency-bitcoin", label: "Kryptex", desc: "Información de Kryptex", roles: ["admin_a", "admin_b", "lector"] },
  { to: "/cuenta-cliente", icon: "bi-journal-text", label: "Cuenta por cliente", desc: "Detalle histórico de movimientos por cliente (Hosting + ASIC)" },
  { to: "/historial", icon: "bi-clock-history", label: "Historial", desc: "Ver y gestionar comprobantes" },
  {
    to: "/clientes-hub",
    icon: "bi-people",
    label: "Clientes",
    desc: "Administración de Bases de Clientes de Tienda Online & Clientes de Hosting",
  },
  { to: "/reportes", icon: "bi-graph-up", label: "Reportes", desc: "Estadísticas y análisis" }
];

export function HomePage() {
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoSrc, setLogoSrc] = useState("/images/HRSLOGO.png");
  const [marketplaceOpenCount, setMarketplaceOpenCount] = useState(0);
  const [marketplaceBadgePulse, setMarketplaceBadgePulse] = useState(false);
  const [marketplaceOnlineTotal, setMarketplaceOnlineTotal] = useState(0);
  const [marketplaceOnlineLogged, setMarketplaceOnlineLogged] = useState(0);
  const [marketplaceOnlineAnon, setMarketplaceOnlineAnon] = useState(0);
  const prevOpenCountRef = useRef(0);
  const roleNorm = (r: string | undefined) => (r ?? "").toLowerCase().trim();
const visibleMenuItems = menuItems.filter(
  (item) => !item.roles || (user && item.roles.some((r) => roleNorm(r) === roleNorm(user.role)))
);
  const canSeeMarketplaceOrdersCard = Boolean(user && canViewMarketplaceQuoteTickets(user.role));

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

  useEffect(() => {
    if (!canSeeMarketplaceOrdersCard) return;
    let cancelled = false;
    let pulseTimeout: number | null = null;
    const computeOpenCount = (byStatus: Record<string, number> | undefined): number => {
      if (!byStatus) return 0;
      const cerrado = Number(byStatus.cerrado ?? 0) || 0;
      const descartado = Number(byStatus.descartado ?? 0) || 0;
      const total = Object.values(byStatus).reduce((s, n) => s + (Number(n) || 0), 0);
      return Math.max(0, total - cerrado - descartado);
    };
    const refresh = async () => {
      try {
        const stats = await getMarketplaceQuoteTicketsStats();
        if (cancelled) return;
        const nextOpen = computeOpenCount(stats.byStatus);
        setMarketplaceOpenCount(nextOpen);
        if (nextOpen > prevOpenCountRef.current) {
          playMarketplaceOrderNotificationSound();
          setMarketplaceBadgePulse(true);
          if (pulseTimeout) window.clearTimeout(pulseTimeout);
          pulseTimeout = window.setTimeout(() => setMarketplaceBadgePulse(false), 1600);
        }
        prevOpenCountRef.current = nextOpen;
      } catch {
        if (!cancelled) {
          setMarketplaceOpenCount(0);
        }
      }
    };
    void refresh();
    const int = window.setInterval(() => {
      void refresh();
    }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(int);
      window.removeEventListener("focus", onFocus);
      if (pulseTimeout) window.clearTimeout(pulseTimeout);
    };
  }, [canSeeMarketplaceOrdersCard]);

  useEffect(() => {
    if (!canSeeMarketplaceOrdersCard) return;
    let cancelled = false;
    const refreshPresence = async () => {
      try {
        const presence = await getMarketplacePresenceStats();
        if (cancelled) return;
        const total = Number(presence.onlineTotal) || 0;
        const by = presence.byViewerType ?? {};
        const logged = (Number(by.cliente ?? 0) || 0) + (Number(by.staff ?? 0) || 0);
        setMarketplaceOnlineTotal(total);
        setMarketplaceOnlineLogged(logged);
        setMarketplaceOnlineAnon(Number(by.anon ?? 0) || 0);
      } catch {
        if (!cancelled) {
          setMarketplaceOnlineTotal(0);
          setMarketplaceOnlineLogged(0);
          setMarketplaceOnlineAnon(0);
        }
      }
    };
    void refreshPresence();
    const int = window.setInterval(() => {
      void refreshPresence();
    }, 8000);
    const onFocus = () => void refreshPresence();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(int);
      window.removeEventListener("focus", onFocus);
    };
  }, [canSeeMarketplaceOrdersCard]);

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

  // LECTOR solo ve Kryptex: redirigir a /kryptex
  if (user?.role === "lector") {
    return <Navigate to="/kryptex" replace />;
  }
  if (user?.role === "cliente") {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <div className="hrs-home">
      <div className="hrs-home-container">
        <header className="sgi-unified-header sgi-unified-header--home">
          <div className="container sgi-unified-header__inner">
            <div className="sgi-unified-header__brand">
              <img
                src={logoSrc}
                alt="HRS Logo"
                className="sgi-unified-header__home-logo"
                onError={() => {
                  console.error("Error loading HRSLOGO.png, trying fallback");
                  setLogoSrc("/images/HASHRATELOGO2.png");
                }}
              />
              <div>
                <h1 className="sgi-unified-header__home-title">HRS GROUP S.A</h1>
                <p className="sgi-unified-header__home-sub">Sistema de Gestión Interna</p>
              </div>
            </div>
            {user ? (
              <div className="sgi-unified-header__actions sgi-unified-header__actions--home hrs-home-user">
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
            ) : null}
          </div>
        </header>

        <main className="hrs-home-grid">
          {visibleMenuItems.map((item) => (
            <Link key={item.to + (item.label || "")} to={item.to} className={`hrs-home-card${item.cardClass ? ` ${item.cardClass}` : ""}`}>
              <div className="hrs-home-card-icon">
                <i className={`bi ${item.icon}`} />
              </div>
              <h3 className="hrs-home-card-title">{item.label}</h3>
              <p className="hrs-home-card-desc">{item.desc}</p>
            </Link>
          ))}
          {canSeeMarketplaceOrdersCard ? (
            <Link to="/cotizaciones-marketplace" className="hrs-home-card hrs-home-card--marketplace-tickets">
              <div className="hrs-home-card-icon hrs-home-card-icon--marketplace">
                <i className="bi bi-ticket-perforated" aria-hidden />
                {marketplaceOpenCount > 0 ? (
                  <span
                    className={
                      "hrs-home-marketplace-badge" +
                      (marketplaceBadgePulse ? " hrs-home-marketplace-badge--pulse" : "")
                    }
                    aria-label={`${marketplaceOpenCount} órdenes abiertas`}
                    title={`${marketplaceOpenCount} órdenes abiertas`}
                  >
                    {marketplaceOpenCount > 99 ? "99+" : marketplaceOpenCount}
                  </span>
                ) : null}
              </div>
              <h3 className="hrs-home-card-title">Ordenes Marketplace</h3>
              <p className="hrs-home-card-desc">Tickets y órdenes del carrito (monitoreo en vivo)</p>
            </Link>
          ) : null}
          {canSeeMarketplaceOrdersCard ? (
            <Link to="/marketplace-presencia" className="hrs-home-card hrs-home-card--marketplace-presence" role="status" aria-live="polite">
              <div className="hrs-home-card-icon hrs-home-card-icon--marketplace-presence">
                <i className="bi bi-broadcast-pin" aria-hidden />
                <span className="hrs-home-marketplace-presence-dot" aria-hidden />
              </div>
              <h3 className="hrs-home-card-title">Marketplace en vivo</h3>
              <p className="hrs-home-marketplace-presence-count">
                {marketplaceOnlineTotal} online ahora
              </p>
              <p className="hrs-home-card-desc">
                logueados: {marketplaceOnlineLogged} · sin cuenta: {marketplaceOnlineAnon}
              </p>
            </Link>
          ) : null}
          {user ? (
            <Link to="/configuracion" className="hrs-home-card hrs-home-card-admin">
              <div className="hrs-home-card-icon">
                <i className="bi bi-gear-fill" aria-hidden />
              </div>
              <h3 className="hrs-home-card-title">Configuración</h3>
              <p className="hrs-home-card-desc">
                Tienda Online, equipos ASIC, Setup y Garantías
                {(roleNorm(user?.role) === "admin_a" || roleNorm(user?.role) === "admin_b") ? "; Usuarios" : ""}
              </p>
            </Link>
          ) : null}
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
