import { useEffect, useState } from "react";
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
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import "../styles/facturacion.css";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin_a", label: "AdministradorA" },
  { value: "admin_b", label: "AdministradorB" },
  { value: "operador", label: "Operador" },
  { value: "lector", label: "Lector" }
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
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | UserListItem | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operador");
  const [saving, setSaving] = useState(false);

  function loadActivity() {
    setActivityLoading(true);
    getUsersActivity(200)
      .then((r) => setActivity(r.activity))
      .catch(() => setActivity([]))
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
    if (currentUser?.role === "admin_a" || currentUser?.role === "admin_b") loadActivity();
  }, [currentUser?.role]);

  function openNew() {
    setModal("new");
    setFormEmail("");
    setFormPassword("");
    setFormRole("operador");
  }

  function openEdit(u: UserListItem) {
    setModal(u);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role as UserRole);
  }

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
      createUser({ email: formEmail.trim(), password: formPassword, role: formRole })
        .then(() => {
          showToast("Usuario creado correctamente.", "success", toastContext);
          setModal(null);
          loadUsers();
        })
        .catch((err) => showToast(`Error al crear usuario: ${err instanceof Error ? err.message : "Error desconocido"}`, "error", toastContext))
        .finally(() => setSaving(false));
    } else {
      const body: { email?: string; password?: string; role?: UserRole } = { email: formEmail.trim(), role: formRole };
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

  return (
    <div className="fact-page usuarios-page">
      <div className="container">
        <PageHeader title="Gestión de usuarios y permisos" showBackButton backTo="/" backText="← Volver al inicio" />
        <div className="fact-card">
          {!isAdmin ? (
            <div className="fact-card-body">
              <p className="text-muted mb-0">Solo los administradores pueden gestionar usuarios.</p>
            </div>
          ) : (
            <>
              <div className="fact-card-header-custom">
                <div className="card-title-wrap">
                  <div className="card-title-icon">
                    <i className="bi bi-people-fill" />
                  </div>
                  <div>
                    <h2>Usuarios</h2>
                    <p className="card-subtitle">Identificados por correo. Roles: AdministradorA, AdministradorB, Operador o Lector.</p>
                  </div>
                </div>
                <button type="button" className="fact-btn-new-user" onClick={openNew}>
                  <i className="bi bi-plus-lg" />
                  Nuevo usuario
                </button>
              </div>
              <div className="fact-card-body">
                {error && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {error}
                  </div>
                )}
                {loading ? (
                  <div className="usuarios-loading">
                    <div className="spinner-border" role="status" aria-label="Cargando" />
                    <p className="mt-2 mb-0 small">Cargando usuarios...</p>
                  </div>
                ) : (
                  <div className="usuarios-table-wrap">
                    <table className="usuarios-table">
                      <thead>
                        <tr>
                          <th>Correo</th>
                          <th>Rol</th>
                          <th>Fecha alta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td><span className="user-email">{u.email}</span></td>
                            <td>
                              <span className={getRoleBadgeClass(u.role, currentUser?.role)}>
                                {getRoleDisplayLabel(u.role, currentUser?.role)}
                              </span>
                            </td>
                            <td><span className="user-date">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}</span></td>
                            <td>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {isAdmin && (
          <div className="fact-card activity-card mt-4">
            <div className="fact-card-header-custom">
              <div className="card-title-wrap">
                <div className="card-title-icon">
                  <i className="bi bi-activity" />
                </div>
                <div>
                  <h2>Actividad de usuarios</h2>
                  <p className="card-subtitle">Entradas y salidas al sistema, horarios y tiempo conectado.</p>
                </div>
              </div>
            </div>
            <div className="fact-card-body">
              {activityLoading ? (
                <div className="activity-loading">
                  <div className="spinner-border" role="status" aria-label="Cargando" />
                  <p className="mt-2 mb-0 small">Cargando actividad...</p>
                </div>
              ) : activity.length === 0 ? (
                <div className="empty-activity">
                  <i className="bi bi-inbox" />
                  Sin registros aún
                </div>
              ) : (
                <div className="activity-table-wrap">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Evento</th>
                        <th>Fecha y hora</th>
                        <th>Tiempo conectado</th>
                        <th>Ubicación (IP)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((a) => (
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
            </div>
          </div>
        )}
      </div>

      {modal && (
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
                    <label className="form-label professional-modal-body .form-label">Correo</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label professional-modal-body .form-label">{modal === "new" ? "Contraseña (mín. 6 caracteres)" : "Nueva contraseña (dejar en blanco para no cambiar)"}</label>
                    <input
                      type="password"
                      className="form-control"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required={modal === "new"}
                      minLength={modal === "new" ? 6 : undefined}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label professional-modal-body .form-label">Rol</label>
                    <select className="form-select" value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}>
                      {modal !== "new" && (modal as UserListItem).role === "admin_a" && currentUser?.role === "admin_b" && (
                        <option value="admin_a" disabled>Administrador</option>
                      )}
                      {ROLES.filter((r) => r.value !== "admin_a" || currentUser?.role === "admin_a").map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <p className="modal-help mb-0 mt-2" style={{ fontSize: "0.85rem", color: "#6b7280", lineHeight: "1.5" }}>AdministradorA: todo (incl. eliminar otros admins); AdministradorB: todo salvo eso; Operador: facturación y clientes; Lector: solo consulta. Operador y Lector cambian su contraseña desde Inicio &gt; Cambiar contraseña. Cualquier Administrador (A o B) puede cambiar la contraseña de cualquier usuario aquí.</p>
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

      {deleteConfirmUser && (
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
