import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { deleteClient, getClients, updateClient } from "../lib/api";
import type { Client } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteClientes, canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";

const emptyForm = {
  code: "",
  name: "",
  name2: "",
  phone: "",
  phone2: "",
  email: "",
  email2: "",
  address: "",
  address2: "",
  city: "",
  city2: ""
};

export function ClienteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = user ? canDeleteClientes(user.role) : false;
  const canEdit = user ? canEditClientes(user.role) : false;
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState(emptyForm);

  if (user && !canEdit) return <Navigate to="/clientes" replace />;

  useEffect(() => {
    if (!id) {
      setError("ID de cliente no válido");
      setLoading(false);
      return;
    }

    getClients()
      .then((r) => {
        const found = r.clients.find((c) => String(c.id) === id) as Client | undefined;
        if (!found) {
          setError("Cliente no encontrado");
          setLoading(false);
          return;
        }
        setClient(found);
        setForm({
          code: found.code ?? "",
          name: found.name ?? "",
          name2: found.name2 ?? "",
          phone: found.phone ?? "",
          phone2: found.phone2 ?? "",
          email: found.email ?? "",
          email2: found.email2 ?? "",
          address: found.address ?? "",
          address2: found.address2 ?? "",
          city: found.city ?? "",
          city2: found.city2 ?? ""
        });
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Error al cargar cliente");
        setLoading(false);
      });
  }, [id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setMessage(null);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      name2: form.name2.trim() || undefined,
      phone: form.phone.trim() || undefined,
      phone2: form.phone2.trim() || undefined,
      email: form.email.trim() || undefined,
      email2: form.email2.trim() || undefined,
      address: form.address.trim() || undefined,
      address2: form.address2.trim() || undefined,
      city: form.city.trim() || undefined,
      city2: form.city2.trim() || undefined
    };
    if (!payload.code || !payload.name) {
      setMessage({ type: "err", text: "Código y nombre son obligatorios." });
      return;
    }

    updateClient(id, payload)
      .then(() => {
        setMessage({ type: "ok", text: "Cliente actualizado correctamente." });
        setTimeout(() => {
          navigate("/clientes");
        }, 1500);
      })
      .catch((err) => setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al actualizar" }));
  }

  function handleDelete() {
    if (!id) return;
    if (!window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;
    setMessage(null);
    deleteClient(id)
      .then(() => {
        setMessage({ type: "ok", text: "Cliente eliminado." });
        setTimeout(() => {
          navigate("/clientes");
        }, 1500);
      })
      .catch((err) => setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al eliminar" }));
  }

  if (loading) {
    return (
      <div className="fact-page">
        <div className="container">
          <div className="fact-card">
            <div className="fact-card-body">
              <p className="text-muted">Cargando cliente...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="fact-page">
        <div className="container">
          <PageHeader title="Editar Cliente" />
          <div className="fact-card">
            <div className="fact-card-body">
              <div className="mb-3 p-3 rounded" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                {error || "Cliente no encontrado"}
              </div>
              <Link to="/" className="fact-btn fact-btn-primary">
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Editar Cliente" />

        <div className="fact-layout" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
          <div className="fact-card">
            <div className="fact-card-header">Editar cliente: {client.code}</div>
            <div className="fact-card-body">
              <form onSubmit={handleSubmit}>
                {/* Formulario en 4 columnas */}
                <div className="client-form-grid-4">
                  {/* Columna 1: Información Básica */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Información Básica</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Código *</label>
                      <input
                        className="fact-input"
                        value={form.code}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="Ej. C01"
                        disabled
                      />
                      <small className="text-muted">El código no se puede cambiar.</small>
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 1 *</label>
                      <input
                        className="fact-input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ej. PIROTTO, PABLO"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 2</label>
                      <input className="fact-input" value={form.name2} onChange={(e) => setForm((f) => ({ ...f, name2: e.target.value }))} placeholder="Nombre alternativo" />
                    </div>
                  </div>

                  {/* Columna 2: Teléfonos */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Teléfonos</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Teléfono 1</label>
                      <input
                        className="fact-input"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Ej. (+598) 99 123 456"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Teléfono 2</label>
                      <input className="fact-input" type="tel" value={form.phone2} onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))} placeholder="Teléfono alternativo" />
                    </div>
                  </div>

                  {/* Columna 3: Contacto */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Contacto</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Email 1</label>
                      <input
                        className="fact-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="cliente@email.com"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Email 2</label>
                      <input
                        className="fact-input"
                        type="email"
                        value={form.email2}
                        onChange={(e) => setForm((f) => ({ ...f, email2: e.target.value }))}
                        placeholder="segundo@email.com"
                      />
                    </div>
                  </div>

                  {/* Columna 4: Ubicación */}
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Ubicación</h3>
                    
                    <div className="fact-field">
                      <label className="fact-label">Dirección 1</label>
                      <input
                        className="fact-input"
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Calle, número, apto"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Dirección 2</label>
                      <input className="fact-input" value={form.address2} onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))} placeholder="Dirección alternativa" />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 1</label>
                      <input
                        className="fact-input"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Ej. MONTEVIDEO, URUGUAY"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 2</label>
                      <input className="fact-input" value={form.city2} onChange={(e) => setForm((f) => ({ ...f, city2: e.target.value }))} placeholder="Ciudad/País alternativo" />
                    </div>
                  </div>
                </div>

                {message && (
                  <div
                    className="fact-field"
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: 8,
                      background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
                      color: message.type === "ok" ? "#166534" : "#b91c1c",
                      fontSize: "0.875rem",
                      gridColumn: "1 / -1",
                      marginTop: "1rem"
                    }}
                  >
                    {message.text}
                  </div>
                )}
                <div className="d-flex gap-2 mt-3 flex-wrap" style={{ gridColumn: "1 / -1", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                  <Link to="/clientes" className="fact-btn fact-btn-secondary">
                    Cancelar
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      className="fact-btn"
                      style={{ background: "#dc2626", color: "#fff" }}
                      onClick={handleDelete}
                    >
                      Eliminar cliente
                    </button>
                  )}
                  <button type="submit" className="fact-btn fact-btn-primary">
                    Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
