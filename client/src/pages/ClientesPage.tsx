import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createClient, getClients, updateClient } from "../lib/api";
import type { Client } from "../lib/types";
import "../styles/facturacion.css";

const emptyForm = {
  code: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  city: ""
};

export function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | string | null>(null);

  function loadClients() {
    setLoading(true);
    setError(null);
    getClients()
      .then((r) => setClients(r.clients as Client[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar clientes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(loadClients, 0);
    return () => clearTimeout(t);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined
    };
    if (!payload.code || !payload.name) {
      setMessage({ type: "err", text: "Código y nombre son obligatorios." });
      return;
    }

    if (editingId !== null) {
      updateClient(editingId, payload)
        .then(() => {
          setMessage({ type: "ok", text: "Cliente actualizado correctamente." });
          setForm(emptyForm);
          setEditingId(null);
          loadClients();
        })
        .catch((err) => setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al actualizar" }));
    } else {
      createClient(payload)
        .then(() => {
          setMessage({ type: "ok", text: "Cliente agregado correctamente." });
          setForm(emptyForm);
          loadClients();
        })
        .catch((err) => setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al crear" }));
    }
  }

  function startEdit(c: Client) {
    if (c.id == null) return;
    setForm({
      code: c.code ?? "",
      name: c.name ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      city: c.city ?? ""
    });
    setEditingId(c.id);
    setMessage(null);
  }

  function cancelEdit() {
    setForm(emptyForm);
    setEditingId(null);
    setMessage(null);
  }

  return (
    <div className="fact-page">
      <div className="container">
        <header className="fact-topbar">
          <h1>Clientes</h1>
          <Link to="/" className="fact-back">
            ← Volver al inicio
          </Link>
        </header>

        <div className="fact-layout" style={{ gridTemplateColumns: "400px 1fr" }}>
          {/* Formulario: alta y edición */}
          <aside className="fact-sidebar">
            <div className="fact-card">
              <div className="fact-card-header">
                {editingId !== null ? "Editar cliente" : "Nuevo cliente"}
              </div>
              <div className="fact-card-body">
                <form onSubmit={handleSubmit}>
                  <div className="fact-field">
                    <label className="fact-label">Código *</label>
                    <input
                      className="fact-input"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="Ej. C01"
                      disabled={editingId !== null}
                    />
                    {editingId !== null && (
                      <small className="text-muted">El código no se puede cambiar al editar.</small>
                    )}
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Nombre o razón social *</label>
                    <input
                      className="fact-input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ej. PIROTTO, PABLO"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Teléfono</label>
                    <input
                      className="fact-input"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Ej. (+598) 99 123 456"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Email</label>
                    <input
                      className="fact-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="cliente@email.com"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Dirección</label>
                    <input
                      className="fact-input"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Calle, número, apto"
                    />
                  </div>
                  <div className="fact-field">
                    <label className="fact-label">Ciudad / País</label>
                    <input
                      className="fact-input"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="Ej. MONTEVIDEO, URUGUAY"
                    />
                  </div>
                  {message && (
                    <div
                      className="fact-field"
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderRadius: 8,
                        background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
                        color: message.type === "ok" ? "#166534" : "#b91c1c",
                        fontSize: "0.875rem"
                      }}
                    >
                      {message.text}
                    </div>
                  )}
                  <div className="d-flex gap-2 mt-3">
                    <button type="submit" className="fact-btn fact-btn-primary">
                      {editingId !== null ? "Guardar cambios" : "Agregar cliente"}
                    </button>
                    {editingId !== null && (
                      <button type="button" className="fact-btn fact-btn-secondary" onClick={cancelEdit}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </aside>

          {/* Listado */}
          <main className="fact-main">
            <div className="fact-card">
              <div className="fact-card-header">Listado de clientes</div>
              <div className="fact-card-body">
                {error && (
                  <div className="mb-3 p-3 rounded" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                    {error}. Asegurate de tener el servidor levantado (npm run dev en la raíz).
                  </div>
                )}
                {loading ? (
                  <p className="text-muted">Cargando clientes...</p>
                ) : clients.length === 0 ? (
                  <div className="fact-empty">
                    <div className="fact-empty-icon">👥</div>
                    <div className="fact-empty-text">No hay clientes cargados. Agregá uno con el formulario.</div>
                  </div>
                ) : (
                  <div className="fact-table-wrap">
                    <table className="fact-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Nombre</th>
                          <th>Teléfono</th>
                          <th>Email</th>
                          <th style={{ width: 100 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map((c) => (
                          <tr key={c.id ?? c.code}>
                            <td className="fw-semibold">{c.code}</td>
                            <td>{c.name}</td>
                            <td>{c.phone ?? "—"}</td>
                            <td>{c.email ?? "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="fact-btn fact-btn-secondary"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                                onClick={() => startEdit(c)}
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
