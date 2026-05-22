import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canAccessNuevosLeads } from "../lib/auth";
import { createPotencialClienteLead, type ApiHttpError } from "../lib/api";
import "../styles/facturacion.css";

export function NuevosLeadsPage() {
  const { user } = useAuth();
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!user || !canAccessNuevosLeads(user)) {
    return <Navigate to="/gestion-administrativa" replace />;
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!nombre.trim()) {
      showToast("El nombre es obligatorio.", "warning");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createPotencialClienteLead({
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        email: email.trim(),
        celular: celular.trim(),
        observaciones: observaciones.trim(),
      });
      const nombreTrim = nombre.trim();
      const apellidosTrim = apellidos.trim();
      setNombre("");
      setApellidos("");
      setEmail("");
      setCelular("");
      setObservaciones("");
      const nombreCompleto = [nombreTrim, apellidosTrim].filter(Boolean).join(" ");
      showToast(
        nombreCompleto
          ? `¡Registro realizado con éxito!\n\n¡Muchas gracias, ${nombreCompleto}! Recibimos tus datos correctamente. Nos pondremos en contacto a la brevedad.`
          : "¡Registro realizado con éxito!\n\n¡Muchas gracias! Recibimos tus datos correctamente. Nos pondremos en contacto a la brevedad.",
        "success",
        undefined,
        { celebrate: true, title: "Nuevo Registro" }
      );
    } catch (err) {
      const apiErr = err as ApiHttpError;
      const msg = apiErr?.message || "No se pudo guardar el lead.";
      const isDup = apiErr?.status === 409 || apiErr?.code === "EMAIL_DUPLICATE";
      if (isDup) {
        setError("");
        showToast(msg, "warning", undefined, { center: true, title: "ATENCIÓN!" });
      } else {
        setError(msg);
        showToast(msg, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Nuevos Leads" />

        <div className="mb-3">
          <h1 className="h4 fw-semibold mb-0">Nuevos Leads</h1>
          <p className="text-muted small mb-0">
            Completá el formulario y nuestro equipo se comunicará con vos.
          </p>
        </div>

        <div className="fact-card fact-panel-nuevo-documento mb-4">
          <div className="fact-panel-nuevo-documento-header">Registrar potencial cliente</div>
          <div className="fact-card-body">
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="lead-nombre">
                    Nombre <span className="text-danger">*</span>
                  </label>
                  <input
                    id="lead-nombre"
                    className="fact-input"
                    type="text"
                    autoComplete="off"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="lead-apellidos">
                    Apellidos
                  </label>
                  <input
                    id="lead-apellidos"
                    className="fact-input"
                    type="text"
                    autoComplete="off"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    maxLength={160}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="lead-email">
                    Email
                  </label>
                  <input
                    id="lead-email"
                    className="fact-input"
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="fact-label" htmlFor="lead-celular">
                    Celular
                  </label>
                  <input
                    id="lead-celular"
                    className="fact-input"
                    type="tel"
                    autoComplete="off"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="col-12">
                  <label className="fact-label" htmlFor="lead-obs">
                    Observaciones
                  </label>
                  <textarea
                    id="lead-obs"
                    className="fact-input"
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    maxLength={4000}
                    placeholder="Interés en modelo, presupuesto, seguimiento, etc."
                  />
                </div>
              </div>
              <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden />
                      Guardando…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-save me-1" aria-hidden />
                      Registrar
                    </>
                  )}
                </button>
              </div>
              {error ? <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div> : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
