import { useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  type UserListItem
} from "../lib/api";
import type { UserRole } from "../lib/auth";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import "../styles/facturacion.css";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "operador", label: "Operador" },
  { value: "lector", label: "Lector" }
];

export function UsuariosPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | UserListItem | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operador");
  const [saving, setSaving] = useState(false);

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

  const isAdmin = currentUser?.role === "admin";

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
                  <p className="text-muted small mb-0">Usuarios identificados por correo. Rol: Administrador, Operador o Lector.</p>
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
                            <td>{ROLES.find((r) => r.value === u.role)?.label ?? u.role}</td>
                            <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}</td>
                            <td className="text-center">
                              <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(u)}>
                                Editar
                              </button>
                              {currentUser?.id !== u.id && (
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
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <small className="text-muted">Administrador: todo; Operador: facturación y clientes; Lector: solo consulta.</small>
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
