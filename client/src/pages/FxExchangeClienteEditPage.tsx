import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canAccessHostingTipoCambio, canEditHostingTipoCambio } from "../lib/auth";
import { deleteFxExchangeClient, getFxExchangeClients, updateFxExchangeClient } from "../lib/api";
import type { Client } from "../lib/types";
import "../styles/facturacion.css";

const emptyForm = {
  code: "",
  name: "",
  phone: "",
  email: "",
  ubicacion: "",
};

export function FxExchangeClienteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAccess = user ? canAccessHostingTipoCambio(user) : false;
  const canEdit = user ? canEditHostingTipoCambio(user) : false;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [clientId, setClientId] = useState<number | null>(null);

  useEffect(() => {
    if (!id || !canAccess) {
      setLoading(false);
      return;
    }
    const idDecoded = decodeURIComponent(id);
    getFxExchangeClients()
      .then((r) => {
        const found = (r.clients || []).find(
          (c) => String(c.id) === idDecoded || (c.code && c.code === idDecoded)
        ) as Client | undefined;
        if (!found) {
          setError("Cliente no encontrado");
          return;
        }
        setClientId(Number(found.id));
        setForm({
          code: found.code || "",
          name: found.name || "",
          phone: found.phone || "",
          email: found.email || "",
          ubicacion: found.address || found.city || "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [id, canAccess]);

  if (!user || !canAccess) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || clientId == null) return;
    if (!form.name.trim()) {
      showToast("El nombre es obligatorio.", "warning");
      return;
    }
    setSaving(true);
    try {
      await updateFxExchangeClient(clientId, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.ubicacion.trim() || undefined,
      });
      showToast("Cliente actualizado.", "success");
      navigate("/gestion-administrativa/cambio-usdt/clientes");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canEdit || clientId == null) return;
    if (!window.confirm(`¿Eliminar el cliente ${form.code}?`)) return;
    setSaving(true);
    try {
      await deleteFxExchangeClient(clientId);
      showToast("Cliente eliminado.", "success");
      navigate("/gestion-administrativa/cambio-usdt/clientes");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al eliminar", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader
          title={`Editar — ${form.code || "Cliente FX"}`}
          showBackButton
          backTo="/gestion-administrativa/cambio-usdt/clientes"
          backText="Volver a clientes de cambio"
        />
        <div className="hrs-card p-4">
          {loading ? (
            <p className="text-muted">Cargando…</p>
          ) : error ? (
            <div className="alert alert-danger">{error}</div>
          ) : (
            <form onSubmit={(e) => void handleSave(e)} className="client-form-ordered">
              <div className="fact-field">
                <label className="fact-label">Código</label>
                <input className="fact-input" value={form.code} readOnly />
              </div>
              <div className="fact-field">
                <label className="fact-label">Nombre *</label>
                <input
                  className="fact-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="fact-label">Teléfono</label>
                  <input
                    className="fact-input"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    disabled={!canEdit}
                  />
                </div>
                <div className="col-md-6">
                  <label className="fact-label">Email</label>
                  <input
                    className="fact-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div className="fact-field">
                <label className="fact-label">Ubicación</label>
                <input
                  className="fact-input"
                  value={form.ubicacion}
                  onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
                  placeholder="Ciudad, país o dirección"
                  disabled={!canEdit}
                  maxLength={300}
                />
              </div>
              {canEdit && (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button type="submit" className="btn btn-success" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button type="button" className="btn btn-outline-danger" disabled={saving} onClick={() => void handleDelete()}>
                    Eliminar cliente
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
