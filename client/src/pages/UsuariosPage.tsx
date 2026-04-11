import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  createUser,
  deleteUser,
  getUsers,
  getUsersActivity,
  updateUser,
  type ActivityItem,
  type UserListItem
} from "../lib/api";
import { canDeleteAdminUser, type UserRole } from "../lib/auth";
import { PageHeader } from "../components/PageHeader";
import { TiendaOnlineAuditSection } from "../components/TiendaOnlineAuditSection";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import "../styles/facturacion.css";

const PAGE_SIZE_OPTIONS = [20, 25, 30] as const;

/** Hub igual que /hosting: solo tarjetas; cada ruta muestra su tabla. */
const USUARIOS_HUB_ITEMS: Array<{ to: string; icon: string; label: string; desc: string }> = [
  {
    to: "/usuarios/cuentas",
    icon: "bi-people",
    label: "Cuentas de usuario",
    desc: "Alta, edición, roles y permisos. Identificados por correo.",
  },
  {
    to: "/usuarios/actividad",
    icon: "bi-clock-history",
    label: "Actividad de sesiones",
    desc: "Entradas y salidas al sistema, horarios, tiempo conectado e IP.",
  },
  {
    to: "/usuarios/auditoria",
    icon: "bi-journal-text",
    label: "Auditoría tienda e inventario",
    desc: "Libro de movimientos: quién cambió qué en equipos ASIC y tienda online.",
  },
];

function usuariosRouteMode(pathname: string): "hub" | "cuentas" | "actividad" | "auditoria" | "unknown" {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/usuarios") return "hub";
  if (p === "/usuarios/cuentas") return "cuentas";
  if (p === "/usuarios/actividad") return "actividad";
  if (p === "/usuarios/auditoria") return "auditoria";
  if (p.startsWith("/usuarios/")) return "unknown";
  return "unknown";
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin_a", label: "AdministradorA" },
  { value: "admin_b", label: "AdministradorB" },
  { value: "operador", label: "Operador" },
  { value: "lector", label: "Lector" },
  { value: "cliente", label: "Cliente (tienda)" }
];

/** AdministradorB ve "Administrador" en lugar de "AdministradorA" para usuarios de grado superior. */
function getRoleDisplayLabel(role: string, viewerRole: UserRole | undefined): string {
  if (viewerRole === "admin_b" && role === "admin_a") return "Administrador";
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

/** Clase CSS del badge según rol (para "Administrador" mostrado a admin_b usamos admin). */
function getRoleBadgeClass(role: string, viewerRole: UserRole | undefined): string {
  if (viewerRole === "admin_b" && role === "admin_a") return "role-badge role-badge--admin";
  return `role-badge role-badge--${role}`;
}

export function UsuariosPage() {
  const { pathname } = useLocation();
  const routeMode = usuariosRouteMode(pathname);
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | UserListItem | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operador");
  const [formUsuario, setFormUsuario] = useState("");
  const [saving, setSaving] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const [pageUsers, setPageUsers] = useState(1);
  const [pageSizeUsers, setPageSizeUsers] = useState<number>(20);
  const [pageActivity, setPageActivity] = useState(1);
  const [pageSizeActivity, setPageSizeActivity] = useState<number>(20);
  const [goToPageUsers, setGoToPageUsers] = useState("");
  const [goToPageActivity, setGoToPageActivity] = useState("");

  function loadActivity() {
    setActivityLoading(true);
    setActivityError(false);
    getUsersActivity(200)
      .then((r) => {
        setActivity(Array.isArray(r?.activity) ? r.activity : []);
        setActivityError(false);
      })
      .catch(() => {
        setActivity([]);
        setActivityError(true);
      })
      .finally(() => setActivityLoading(false));
  }

  function loadUsers() {
    setLoading(true);
    setError(null);
    getUsers()
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar usuarios"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (currentUser?.role === "admin_a" || currentUser?.role === "admin_b") {
      loadActivity();
    }
  }, [currentUser?.role]);

  function openNew() {
    setModal("new");
    setFormEmail("");
    setFormPassword("");
    setFormRole("operador");
    setFormUsuario("");
    setRoleDropdownOpen(false);
  }

  function openEdit(u: UserListItem) {
    setModal(u);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role as UserRole);
    setFormUsuario(u.usuario ?? "");
    setRoleDropdownOpen(false);
  }

  /* Cerrar dropdown Rol al hacer clic fuera */
  useEffect(() => {
    if (!roleDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [roleDropdownOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmail.trim()) {
      showToast("El correo es obligatorio.", "error", toastContext);
      return;
    }
    if (modal === "new" && !formPassword) {
      showToast("La contraseña es obligatoria para nuevo usuario.", "error", toastContext);
      return;
    }
    if (modal === "new" && formPassword.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres.", "error", toastContext);
      return;
    }
    setSaving(true);
    if (modal === "new") {
      createUser({ email: formEmail.trim(), password: formPassword, role: formRole, usuario: formUsuario.trim() || undefined })
        .then(() => {
          showToast("Usuario creado correctamente.", "success", toastContext);
          setModal(null);
          loadUsers();
          loadActivity();
          setAuditRefreshKey((k) => k + 1);
        })
        .catch((err) => showToast(`Error al crear usuario: ${err instanceof Error ? err.message : "Error desconocido"}`, "error", toastContext))
        .finally(() => setSaving(false));
    } else {
      const editingTiendaCliente = (modal as UserListItem).role === "cliente";
      const body: { email?: string; password?: string; role?: UserRole; usuario?: string } = {
        email: formEmail.trim(),
        usuario: formUsuario.trim() || undefined,
      };
      if (!editingTiendaCliente) body.role = formRole;
      if (formPassword) body.password = formPassword;
      updateUser((modal as UserListItem).id, body)
        .then(() => {
          showToast("Usuario actualizado correctamente.", "success", toastContext);
          setModal(null);
          loadUsers();
        })
        .catch((err) => showToast(`Error al actualizar usuario: ${err instanceof Error ? err.message : "Error desconocido"}`, "error", toastContext))
        .finally(() => setSaving(false));
    }
  }

  function handleDeleteClick(u: UserListItem) {
    if (currentUser?.id === u.id) {
      showToast("No puede eliminarse a sí mismo.", "error", toastContext);
      return;
    }
    setDeleteConfirmUser(u);
  }

  function handleDeleteConfirm() {
    if (!deleteConfirmUser) return;
    setDeleting(true);
    deleteUser(deleteConfirmUser.id)
      .then(() => {
        showToast("Usuario eliminado correctamente.", "success", toastContext);
        setDeleteConfirmUser(null);
        loadUsers();
      })
      .catch((err) => showToast(`Error al eliminar usuario: ${err instanceof Error ? err.message : "Error desconocido"}`, "error", toastContext))
      .finally(() => setDeleting(false));
  }

  const isAdmin = currentUser?.role === "admin_a" || currentUser?.role === "admin_b";
  const toastContext = "Gestión de usuarios";

  const totalPagesUsers = Math.max(1, Math.ceil(users.length / pageSizeUsers));
  const paginatedUsers = useMemo(() => {
    const start = (pageUsers - 1) * pageSizeUsers;
    return users.slice(start, start + pageSizeUsers);
  }, [users, pageUsers, pageSizeUsers]);

  const totalPagesActivity = Math.max(1, Math.ceil(activity.length / pageSizeActivity));
  const paginatedActivity = useMemo(() => {
    const start = (pageActivity - 1) * pageSizeActivity;
    return activity.slice(start, start + pageSizeActivity);
  }, [activity, pageActivity, pageSizeActivity]);

  function handlePageSizeUsersChange(v: number) {
    setPageSizeUsers(v);
    setPageUsers(1);
  }
  function handlePageSizeActivityChange(v: number) {
    setPageSizeActivity(v);
    setPageActivity(1);
  }
  function handleGoToUsers() {
    const n = parseInt(goToPageUsers, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPagesUsers) {
      setPageUsers(n);
      setGoToPageUsers("");
    }
  }
  function handleGoToActivity() {
    const n = parseInt(goToPageActivity, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPagesActivity) {
      setPageActivity(n);
      setGoToPageActivity("");
    }
  }
  const hubPageTitle = "Gestión de usuarios y permisos";
  const subPageHeader =
    routeMode === "cuentas"
      ? { title: "Cuentas de usuario", backText: "Volver a usuarios" }
      : routeMode === "actividad"
        ? { title: "Actividad de sesiones", backText: "Volver a usuarios" }
        : { title: "Auditoría tienda e inventario", backText: "Volver a usuarios" };

  return (
    <div className="fact-page usuarios-page">
      <div className="container">
        {!isAdmin ? (
          <>
            <PageHeader title={hubPageTitle} showBackButton backTo="/" backText="Volver al inicio" />
            <div className="usuarios-page-card usuarios-page-card--single">
              <div className="usuarios-page-card-inner">
                <div className="usuarios-page-no-access">
                  <span className="usuarios-page-no-access-icon" aria-hidden>👤</span>
                  <p className="usuarios-page-no-access-text">Solo los administradores pueden gestionar usuarios.</p>
                </div>
              </div>
            </div>
          </>
        ) : routeMode === "unknown" ? (
          <Navigate to="/usuarios" replace />
        ) : (
          <>
            <PageHeader
              title={routeMode === "hub" ? hubPageTitle : subPageHeader.title}
              showBackButton
              backTo={routeMode === "hub" ? "/" : "/usuarios"}
              backText={routeMode === "hub" ? "Volver al inicio" : subPageHeader.backText}
            />

            {routeMode === "hub" ? (
              <div className="hrs-card p-4">
                <p className="text-muted small mb-3">
                  Espacio para administrar cuentas del sistema, sesiones y trazabilidad de la tienda online (mismo
                  estilo de accesos que <strong>Servicios de Hosting</strong>).
                </p>
                <div className="reportes-grid">
                  {USUARIOS_HUB_ITEMS.map((item) => (
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
            ) : null}

            {routeMode === "cuentas" ? (
              <div className="usuarios-page-card">
              <div className="usuarios-page-header">
                <div className="usuarios-page-header-inner">
                  <h2 className="usuarios-page-title" id="usuarios-heading-cuentas">
                    <span className="usuarios-page-title-icon" aria-hidden>
                      <i className="bi bi-people" />
                    </span>
                    Usuarios
                  </h2>
                  <p className="usuarios-page-subtitle">Identificados por correo. Roles: AdministradorA, AdministradorB, Operador o Lector.</p>
                </div>
                <button type="button" className="usuarios-page-btn-new" onClick={openNew}>
                  <i className="bi bi-plus-lg" />
                  Nuevo usuario
                </button>
              </div>
              <div className="usuarios-page-body">
                {error && (
                  <div className="usuarios-page-alert usuarios-page-alert--danger">
                    {error}
                  </div>
                )}
                {loading ? (
                  <div className="usuarios-loading">
                    <div className="spinner-border" role="status" aria-label="Espere un momento" />
                  </div>
                ) : (
                  <div className="usuarios-listado-wrap">
                    <table className="usuarios-listado-table table table-sm align-middle">
                      <thead className="table-dark">
                        <tr>
                          <th className="text-start">Correo</th>
                          <th className="text-start">Usuario</th>
                          <th className="text-start">Rol</th>
                          <th className="text-start">Fecha alta</th>
                          <th className="text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-muted py-4">
                              <small>No hay usuarios registrados</small>
                            </td>
                          </tr>
                        ) : (
                          paginatedUsers.map((u) => (
                            <tr key={u.id}>
                              <td><span className="user-email">{u.email}</span></td>
                              <td><span className="user-usuario">{u.usuario ?? "—"}</span></td>
                              <td>
                                <span className={getRoleBadgeClass(u.role, currentUser?.role)}>
                                  {getRoleDisplayLabel(u.role, currentUser?.role)}
                                </span>
                              </td>
                              <td><span className="user-date">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}</span></td>
                              <td className="text-center">
                                <div className="action-btns">
                                  <button type="button" className="btn-action btn-action--edit" onClick={() => openEdit(u)} title="Editar">
                                    <i className="bi bi-pencil" />
                                    Editar
                                  </button>
                                  {currentUser && currentUser.id !== u.id && canDeleteAdminUser(currentUser.role, u.role) && (
                                    <button type="button" className="btn-action btn-action--danger" onClick={() => handleDeleteClick(u)} title="Eliminar">
                                      <i className="bi bi-trash" />
                                      Eliminar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {!loading && users.length > 0 && (
                  <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
                    <div className="d-flex align-items-center gap-2">
                      <label className="text-muted small mb-0">Mostrar</label>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "auto" }}
                        value={pageSizeUsers}
                        onChange={(e) => handlePageSizeUsersChange(Number(e.target.value))}
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <span className="text-muted small">registros</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-muted small">
                        Mostrando {((pageUsers - 1) * pageSizeUsers) + 1}-{Math.min(pageUsers * pageSizeUsers, users.length)} de {users.length}
                      </span>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={pageUsers <= 1} onClick={() => setPageUsers((p) => Math.max(1, p - 1))}>
                        ‹ Anterior
                      </button>
                      <span className="px-2 small text-muted">Página {pageUsers} de {totalPagesUsers}</span>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={pageUsers >= totalPagesUsers} onClick={() => setPageUsers((p) => Math.min(totalPagesUsers, p + 1))}>
                        Siguiente ›
                      </button>
                      <div className="d-flex align-items-center gap-1">
                        <span className="small text-muted">Ir a</span>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          style={{ width: "4rem" }}
                          min={1}
                          max={totalPagesUsers}
                          value={goToPageUsers}
                          onChange={(e) => setGoToPageUsers(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGoToUsers())}
                          placeholder={String(totalPagesUsers)}
                        />
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoToUsers}>
                          Ir
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            ) : null}

            {routeMode === "actividad" ? (
            <div className="usuarios-page-card usuarios-page-activity-card">
              <div className="usuarios-page-header usuarios-page-header--activity">
                <div className="usuarios-page-header-inner">
                  <h2 className="usuarios-page-title" id="usuarios-heading-actividad">
                    <span className="usuarios-page-title-icon usuarios-page-title-icon--activity" aria-hidden>
                      <i className="bi bi-clock-history" />
                    </span>
                    Actividad de usuarios
                  </h2>
                  <p className="usuarios-page-subtitle">Entradas y salidas al sistema, horarios y tiempo conectado.</p>
                </div>
              </div>
              <div className="usuarios-page-body">
                {activityLoading ? (
                  <div className="activity-loading">
                    <div className="spinner-border" role="status" aria-label="Espere un momento" />
                  </div>
                ) : activityError ? (
                  <div className="empty-activity">
                    <i className="bi bi-exclamation-triangle text-warning" />
                    <p className="mb-2">No se pudo cargar la actividad. Si estás en Vercel, verificá que la API esté desplegada (Root Directory en raíz del repo).</p>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadActivity}>
                      Reintentar
                    </button>
                  </div>
                ) : activity.length === 0 ? (
                  <div className="empty-activity">
                    <i className="bi bi-inbox" />
                    <p className="mb-0">Sin registros aún. La actividad se mostrará cuando los usuarios inicien o cierren sesión.</p>
                  </div>
                ) : (
                  <div className="usuarios-activity-listado-wrap">
                    <table className="usuarios-activity-listado-table table table-sm align-middle">
                      <thead className="table-dark">
                        <tr>
                          <th className="text-start">Usuario</th>
                          <th className="text-start">Evento</th>
                          <th className="text-start">Fecha y hora</th>
                          <th className="text-start">Tiempo conectado</th>
                          <th className="text-start">Ubicación (IP)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedActivity.map((a) => (
                          <tr key={a.id}>
                            <td><span className="user-email">{a.user_email}</span></td>
                            <td>
                              <span className={a.event === "login" ? "event-badge event-badge--login" : "event-badge event-badge--logout"}>
                                {a.event === "login" ? <><i className="bi bi-box-arrow-in-right" /> Entrada</> : <><i className="bi bi-box-arrow-right" /> Salida</>}
                              </span>
                            </td>
                            <td>{new Date(a.created_at).toLocaleString("es-AR")}</td>
                            <td className="activity-duration">
                              {a.duration_seconds != null
                                ? `${Math.floor(a.duration_seconds / 3600)}h ${Math.floor((a.duration_seconds % 3600) / 60)}min`
                                : "—"}
                            </td>
                            <td><span className="activity-ip">{a.ip_address || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!activityLoading && !activityError && activity.length > 0 && (
                  <div className="usuarios-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 px-1">
                    <div className="d-flex align-items-center gap-2">
                      <label className="text-muted small mb-0">Mostrar</label>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "auto" }}
                        value={pageSizeActivity}
                        onChange={(e) => handlePageSizeActivityChange(Number(e.target.value))}
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <span className="text-muted small">registros</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-muted small">
                        Mostrando {((pageActivity - 1) * pageSizeActivity) + 1}-{Math.min(pageActivity * pageSizeActivity, activity.length)} de {activity.length}
                      </span>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={pageActivity <= 1} onClick={() => setPageActivity((p) => Math.max(1, p - 1))}>
                        ‹ Anterior
                      </button>
                      <span className="px-2 small text-muted">Página {pageActivity} de {totalPagesActivity}</span>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={pageActivity >= totalPagesActivity} onClick={() => setPageActivity((p) => Math.min(totalPagesActivity, p + 1))}>
                        Siguiente ›
                      </button>
                      <div className="d-flex align-items-center gap-1">
                        <span className="small text-muted">Ir a</span>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          style={{ width: "4rem" }}
                          min={1}
                          max={totalPagesActivity}
                          value={goToPageActivity}
                          onChange={(e) => setGoToPageActivity(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGoToActivity())}
                          placeholder={String(totalPagesActivity)}
                        />
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleGoToActivity}>
                          Ir
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            ) : null}

            {routeMode === "auditoria" ? (
            <div className="usuarios-section usuarios-section--auditoria">
              <TiendaOnlineAuditSection refreshKey={auditRefreshKey} />
            </div>
            ) : null}
          </>
        )}
      </div>

      {isAdmin && modal && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-form">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {modal === "new" ? (
                      <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    ) : (
                      <path d="M11 5H6C4.89543 5 4 5.89543 4 7V18C4 19.1046 4.89543 20 6 20H17C18.1046 20 19 19.1046 19 18V13M18.5 2.5C18.8978 2.10218 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10218 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10218 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    )}
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title">
                  {modal === "new" ? "Nuevo usuario" : "Editar usuario"}
                </h5>
                <button type="button" className="professional-modal-close" onClick={() => setModal(null)} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body professional-modal-body">
                  <div className="mb-3">
                    <label className="form-label">Usuario</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formUsuario}
                      onChange={(e) => setFormUsuario(e.target.value)}
                      placeholder="Nombre de usuario"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Correo</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                      placeholder="usuario@ejemplo.com"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">{modal === "new" ? "Contraseña (mín. 6 caracteres)" : "Nueva contraseña (dejar en blanco para no cambiar)"}</label>
                    <input
                      type="password"
                      className="form-control"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required={modal === "new"}
                      minLength={modal === "new" ? 6 : undefined}
                      placeholder={modal === "new" ? "••••••••" : "•••••••• (opcional)"}
                    />
                  </div>
                  <div className="mb-3" ref={roleDropdownRef}>
                    <label className="form-label">Rol</label>
                    {modal !== "new" && (modal as UserListItem).role === "cliente" ? (
                      <>
                        <div className="usuarios-rol-locked d-flex align-items-center gap-2 flex-wrap p-2 rounded border bg-light">
                          <span className="role-badge role-badge--cliente">Cliente (tienda)</span>
                          <span className="text-muted small mb-0">
                            Cuenta de la tienda online — el rol no se puede cambiar desde aquí.
                          </span>
                        </div>
                        <p className="modal-help mb-0 mt-2">
                          Podés editar correo, usuario referido y contraseña. El vínculo con la ficha de cliente en tienda se mantiene.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="role-dropdown-wrap">
                          <button
                            type="button"
                            className="role-dropdown-trigger"
                            onClick={() => setRoleDropdownOpen((o) => !o)}
                            aria-expanded={roleDropdownOpen}
                            aria-haspopup="listbox"
                            aria-label="Seleccionar rol"
                          >
                            <span>{getRoleDisplayLabel(formRole, currentUser?.role)}</span>
                            <svg className="role-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {roleDropdownOpen && (
                            <ul className="role-dropdown-list" role="listbox">
                              {modal !== "new" && (modal as UserListItem).role === "admin_a" && currentUser?.role === "admin_b" && (
                                <li className="role-dropdown-option role-dropdown-option--disabled" role="option" aria-disabled="true">
                                  Administrador
                                </li>
                              )}
                              {ROLES.filter((r) => r.value !== "admin_a" || currentUser?.role === "admin_a").map((r) => (
                                <li
                                  key={r.value}
                                  className={`role-dropdown-option ${formRole === r.value ? "role-dropdown-option--selected" : ""}`}
                                  role="option"
                                  aria-selected={formRole === r.value}
                                  onClick={() => {
                                    setFormRole(r.value);
                                    setRoleDropdownOpen(false);
                                  }}
                                >
                                  {r.label}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <p className="modal-help mb-0">AdministradorA: todo (incl. eliminar otros admins); AdministradorB: todo salvo eso; Operador: facturación y clientes; Lector: solo consulta. Operador y Lector cambian su contraseña desde Inicio &gt; Cambiar contraseña. Cualquier Administrador (A o B) puede cambiar la contraseña de cualquier usuario aquí.</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="modal-footer professional-modal-footer">
                  <button type="button" className="professional-btn professional-btn-secondary" onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="professional-btn professional-btn-primary" disabled={saving}>
                    {saving ? (
                      <>
                        <span className="professional-btn-spinner"></span>
                        Guardando...
                      </>
                    ) : (
                      modal === "new" ? "Crear" : "Guardar"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isAdmin && deleteConfirmUser && (
        <div className="modal d-block professional-modal-overlay" tabIndex={-1} role="dialog" aria-labelledby="deleteModalTitle" aria-modal="true">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content professional-modal professional-modal-delete">
              <div className="modal-header professional-modal-header">
                <div className="professional-modal-icon-wrapper">
                  <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h5 className="modal-title professional-modal-title" id="deleteModalTitle">
                  Eliminar usuario
                </h5>
                <button type="button" className="professional-modal-close" onClick={() => setDeleteConfirmUser(null)} aria-label="Cerrar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="modal-body professional-modal-body">
                <div className="professional-modal-warning-box">
                  Esta acción no se puede deshacer.
                </div>
                <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>
                  ¿Eliminar al usuario <strong>{deleteConfirmUser.email}</strong>?
                </p>
              </div>
              <div className="modal-footer professional-modal-footer">
                <button type="button" className="professional-btn professional-btn-secondary" onClick={() => setDeleteConfirmUser(null)} disabled={deleting}>
                  Cancelar
                </button>
                <button type="button" className="professional-btn professional-btn-primary" onClick={handleDeleteConfirm} disabled={deleting}>
                  {deleting ? (
                    <>
                      <span className="professional-btn-spinner"></span>
                      Eliminando...
                    </>
                  ) : (
                    "Eliminar"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
