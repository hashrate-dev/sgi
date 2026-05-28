import { useEffect, useState } from "react";
import { createFxExchangeClient, getNextFxClientCode } from "../lib/api";
import { showToast } from "./ToastNotification";
import "../styles/facturacion.css";

const TOAST_CONTEXT = "Clientes Cambio USDT";

const emptyForm = {
  code: "",
  name: "",
  phone: "",
  email: "",
  ubicacion: "",
};

type Props = {
  onSuccess: (message?: string) => void;
  onCancel: () => void;
  variant?: "card" | "modal";
};

export function FxClienteNewForm({ onSuccess, onCancel, variant = "card" }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [nextCodeLoading, setNextCodeLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setNextCodeLoading(true);
    getNextFxClientCode()
      .then((r) => {
        if (!alive) return;
        setForm((prev) => ({ ...prev, code: String(r?.code ?? "").trim() }));
      })
      .catch(() => {
        if (!alive) return;
        setForm((prev) => ({ ...prev, code: "" }));
      })
      .finally(() => {
        if (alive) setNextCodeLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.ubicacion.trim() || undefined,
    };
    if (!payload.name) {
      showToast("El nombre es obligatorio.", "error", TOAST_CONTEXT);
      return;
    }
    setSaving(true);
    createFxExchangeClient(payload)
      .then(() => {
        setForm(emptyForm);
        setNextCodeLoading(true);
        void getNextFxClientCode()
          .then((r) => setForm((prev) => ({ ...prev, code: String(r?.code ?? "").trim() })))
          .catch(() => {})
          .finally(() => setNextCodeLoading(false));
        onSuccess("Cliente de cambio USDT registrado correctamente.");
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al crear", "error", TOAST_CONTEXT))
      .finally(() => setSaving(false));
  }

  const formFields = (
    <>
      <p className="clientes-new-dos-formas">
        Clientes con código <strong>FX</strong> (solo cambio USDT/USD). Se listan en{" "}
        <strong>Operaciones de Cambio</strong> junto con la cartera de hosting.
      </p>

      <section className="clientes-new-paso clientes-new-paso-manual" aria-labelledby="fx-paso-manual-title">
        <h3 id="fx-paso-manual-title" className="clientes-new-paso-title">
          <span className="clientes-new-paso-num">A</span>
          Manual — Cargar un cliente de cambio
        </h3>

        <div className="client-form-ordered">
          <div className="client-form-code-block">
            <label className="fact-label">Código del cliente *</label>
            <input
              className="fact-input client-form-code-input"
              value={form.code}
              readOnly
              placeholder={nextCodeLoading ? "Generando…" : "FX001"}
              title="Código automático FX"
            />
          </div>

          <div className="client-form-contact-block">
            <h4 className="client-form-contact-title">
              <span className="client-form-contact-num">1</span>
              Contacto principal
            </h4>
            <div className="fact-field">
              <label className="fact-label">Nombre *</label>
              <input
                className="fact-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre"
                maxLength={200}
                required
              />
            </div>
            <div className="fact-field">
              <label className="fact-label">Teléfono</label>
              <input
                className="fact-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Teléfono"
              />
            </div>
            <div className="fact-field">
              <label className="fact-label">Email</label>
              <input
                className="fact-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="correo@mail.com"
              />
            </div>
            <div className="fact-field">
              <label className="fact-label">Ubicación</label>
              <input
                className="fact-input"
                value={form.ubicacion}
                onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))}
                placeholder="Ciudad, país o dirección"
                maxLength={300}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="clientes-new-actions">
        <button type="button" className="fact-btn fact-btn-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="fact-btn fact-btn-primary" disabled={saving || nextCodeLoading}>
          {saving ? "Guardando…" : "Agregar cliente"}
        </button>
      </div>
    </>
  );

  if (variant === "modal") {
    return (
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="modal-body professional-modal-body">{formFields}</div>
      </form>
    );
  }

  return (
    <div className="usuarios-page-card clientes-new-form-card">
      <div className="usuarios-page-header">
        <div className="usuarios-page-header-inner">
          <h2 className="usuarios-page-title">
            <span className="usuarios-page-title-icon" aria-hidden>
              <i className="bi bi-person-plus-fill" />
            </span>
            Agregar cliente de cambio USDT
          </h2>
        </div>
      </div>
      <div className="usuarios-page-body">
        <form onSubmit={(e) => void handleSubmit(e)}>{formFields}</form>
      </div>
    </div>
  );
}
