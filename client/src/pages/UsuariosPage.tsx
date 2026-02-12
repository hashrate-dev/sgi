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

export function UsuariosPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | UserListItem | null>(null);
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
      showToast("El correo es obligatorio.", "error");
      return;
    }
    if (modal === "new" && !formPassword) {
      showToast("La contraseña es obligatoria para nuevo usuario.", "error");
      return;
    }
    if (modal === "new" && formPassword.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }
    setSaving(true);
    if (modal === "new") {
      createUser({ email: formEmail.trim(), password: formPassword, role: formRole })
        .then(() => {
          showToast("Usuario creado.", "success");
          setModal(null);
          loadUsers();
        })
        .catch((err) => showToast(err instanceof Error ? err.message : "Error al crear", "error"))
        .finally(() => setSaving(false));
    } else {
      const body: { email?: string; password?: string; role?: UserRole } = { email: formEmail.trim(), role: formRole };
      if (formPassword) body.password = formPassword;
      updateUser((modal as UserListItem).id, body)
        .then(() => {
          showToast("Usuario actualizado.", "success");
          setModal(null);
          loadUsers();
        })
        .catch((err) => showToast(err instanceof Error ? err.message : "Error al actualizar", "error"))
        .finally(() => setSaving(false));
    }
  }

  function handleDelete(u: UserListItem) {
    if (currentUser?.id === u.id) {
      showToast("No puede eliminarse a sí mismo.", "error");
      return;
    }
    if (!window.confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return;
    deleteUser(u.id)
      .then(() => {
        showToast("Usuario eliminado.", "success");
        loadUsers();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al eliminar", "error"));
  }

  const isAdmin = currentUser?.role === "admin_a" || currentUser?.role === "admin_b";

  return (
    <div className="fact-page">
      <PageHeader title="Gestión de usuarios y permisos" showBackButton backTo="/" backText="← Volver al inicio" />
      <div className="container">
        <div className="fact-card">
          <div className="fact-card-body">
            {!isAdmin ? (
              <p className="text-muted">Solo los administradores pueden gestionar usuarios.</p>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <p className="text-muted small mb-0">Usuarios identificados por correo. Roles: AdministradorA, AdministradorB, Operador o Lector.</p>
                  <button type="button" className="fact-btn fact-btn-primary" onClick={openNew}>
                    Nuevo usuario
                  </button>
                </div>
                {error && (
                  <div className="alert alert-danger py-2 small">
                    {error}
                  </div>
                )}
                {loading ? (
                  <p className="text-muted">Cargando usuarios...</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered">
                      <thead>
                        <tr>
                          <th>Correo</th>
                          <th>Rol</th>
                          <th>Fecha alta</th>
                          <th className="text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td>{u.email}</td>
                            <td>{getRoleDisplayLabel(u.role, currentUser?.role)}</td>
                            <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}</td>
                            <td className="text-center">
                              <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(u)}>
                                Editar
                              </button>
                              {currentUser && currentUser.id !== u.id && canDeleteAdminUser(currentUser.role, u.role) && (
                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u)}>
                                  Eliminar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="fact-card mt-4">
            <div className="fact-card-body">
              <h3 className="h6 mb-3">Actividad de usuarios</h3>
              <p className="text-muted small mb-3">Entradas y salidas al sistema, horarios y tiempo conectado.</p>
              {activityLoading ? (
                <p className="text-muted">Cargando actividad...</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered table-sm">
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
                      {activity.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted text-center">Sin registros aún</td>
                        </tr>
                      ) : (
                        activity.map((a) => (
                          <tr key={a.id}>
                            <td>{a.user_email}</td>
                            <td>{a.event === "login" ? "Entrada" : "Salida"}</td>
                            <td>{new Date(a.created_at).toLocaleString("es-AR")}</td>
                            <td>
                              {a.duration_seconds != null
                                ? `${Math.floor(a.duration_seconds / 3600)}h ${Math.floor((a.duration_seconds % 3600) / 60)}min`
                                : "—"}
                            </td>
                            <td>{a.ip_address || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{modal === "new" ? "Nuevo usuario" : "Editar usuario"}</h5>
                <button type="button" className="btn-close" onClick={() => setModal(null)} aria-label="Cerrar" />
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Correo</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
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
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Rol</label>
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
                    <small className="text-muted">AdministradorA: todo (incl. eliminar otros admins); AdministradorB: todo salvo eso; Operador: facturación y clientes; Lector: solo consulta. Operador y Lector cambian su contraseña desde Inicio &gt; Cambiar contraseña. Cualquier Administrador (A o B) puede cambiar la contraseña de Operador, Lector o de otro admin aquí.</small>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando..." : modal === "new" ? "Crear" : "Guardar"}
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
