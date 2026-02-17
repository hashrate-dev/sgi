import { useState } from "react";
import { createClient } from "../lib/api";
import { parseExcelFile, type ClientRow } from "../lib/parseClientExcel";
import { showToast } from "./ToastNotification";
import "../styles/facturacion.css";

const TOAST_CONTEXT = "Clientes";

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

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
  /** "modal" = solo cuerpo + pie para usar dentro del modal; "card" = card completa con header */
  variant?: "card" | "modal";
};

export function ClienteNewForm({ onSuccess, onCancel, variant = "card" }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [excelLoading, setExcelLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      showToast("Código y nombre son obligatorios.", "error", TOAST_CONTEXT);
      return;
    }

    createClient(payload)
      .then(() => {
        showToast("Cliente agregado correctamente.", "success", TOAST_CONTEXT);
        setForm(emptyForm);
        onSuccess();
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Error al crear", "error", TOAST_CONTEXT));
  }

  async function handleExcelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!isXlsx) {
      showToast("Elegí un archivo Excel (.xlsx).", "error", TOAST_CONTEXT);
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    e.target.value = "";
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        showToast("No se encontraron filas con datos. La primera fila debe ser encabezados (Código, Nombre, etc.).", "error", TOAST_CONTEXT);
        setExcelLoading(false);
        return;
      }
      const results = await Promise.allSettled(rows.map((payload: ClientRow) => createClient(payload)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const err = results.filter((r) => r.status === "rejected").length;
      if (err === 0) {
        showToast(`Se agregaron ${ok} clientes desde el Excel.`, "success", TOAST_CONTEXT);
        onSuccess();
      } else {
        showToast(`Se agregaron ${ok} clientes. ${err} no se pudieron agregar (código duplicado u otro error).`, "error", TOAST_CONTEXT);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al leer el archivo Excel.", "error", TOAST_CONTEXT);
    } finally {
      setExcelLoading(false);
    }
  }

  const innerContent = (
      <>
        <section className="clientes-new-paso clientes-new-paso-manual" aria-labelledby="paso-manual-title">
          <h3 id="paso-manual-title" className="clientes-new-paso-title">
            <span className="clientes-new-paso-num">A</span>
            Manual — Cargar un cliente con el formulario
          </h3>
        <div className="client-form-ordered">
          <div className="client-form-code-block">
            <label className="fact-label">Código del cliente *</label>
            <input
              className="fact-input client-form-code-input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Ej. C01"
            />
          </div>

          <div className="client-form-contacts-grid">
            <div className="client-form-contact-block">
              <h3 className="client-form-contact-title">
                <span className="client-form-contact-num">1</span>
                Contacto principal
              </h3>
              <div className="fact-field">
                <label className="fact-label">Nombre o Razón Social *</label>
                <input
                  className="fact-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre o razón social"
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
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Dirección</label>
                <input
                  className="fact-input"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Dirección"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Ciudad / País</label>
                <input
                  className="fact-input"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Ciudad, País"
                />
              </div>
            </div>

            <div className="client-form-contact-block">
              <h3 className="client-form-contact-title">
                <span className="client-form-contact-num">2</span>
                Contacto Alternativo
              </h3>
              <div className="fact-field">
                <label className="fact-label">Nombre o Razón Social</label>
                <input
                  className="fact-input"
                  value={form.name2}
                  onChange={(e) => setForm((f) => ({ ...f, name2: e.target.value }))}
                  placeholder="Nombre (opcional)"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Teléfono</label>
                <input
                  className="fact-input"
                  type="tel"
                  value={form.phone2}
                  onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
                  placeholder="Teléfono"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Email</label>
                <input
                  className="fact-input"
                  type="email"
                  value={form.email2}
                  onChange={(e) => setForm((f) => ({ ...f, email2: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Dirección</label>
                <input
                  className="fact-input"
                  value={form.address2}
                  onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
                  placeholder="Dirección"
                />
              </div>
              <div className="fact-field">
                <label className="fact-label">Ciudad / País</label>
                <input
                  className="fact-input"
                  value={form.city2}
                  onChange={(e) => setForm((f) => ({ ...f, city2: e.target.value }))}
                  placeholder="Ciudad, País"
                />
              </div>
            </div>
          </div>
        </div>
        </section>

        <div className="clientes-new-actions">
          <button type="button" className="fact-btn fact-btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="fact-btn fact-btn-primary">
            Agregar cliente
          </button>
        </div>

        <hr className="clientes-new-divider" />

        <section className="clientes-new-paso clientes-new-paso-excel" aria-labelledby="paso-excel-title">
          <h3 id="paso-excel-title" className="clientes-new-paso-title">
            <span className="clientes-new-paso-num">B</span>
            Automático — Importar desde Excel (base de clientes)
          </h3>
        <div className="clientes-new-excel-box">
          <p className="clientes-new-excel-text">
            Usá un archivo tipo Excel para cargar la Base de Clientes (.xlsx):
          </p>
          <ul className="clientes-new-excel-columns">
            <li><strong>Código</strong></li>
            <li><strong>Contacto Principal</strong> y <strong>Contacto Alternativo</strong>: para cada uno, columnas — Nombre o Razón Social, Teléfono, Email, Dirección, Ciudad / País.</li>
          </ul>
          <div className="clientes-new-excel-actions">
            <label
              className="btn btn-outline-secondary btn-sm historial-import-excel-btn mb-0"
              style={{
                backgroundColor: "rgba(45, 93, 70, 0.35)",
                cursor: excelLoading ? "not-allowed" : "pointer",
              }}
            >
              {excelLoading ? "⏳ Importando..." : "📥 Importar Excel"}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="d-none"
                onChange={handleExcelChange}
                disabled={excelLoading}
              />
            </label>
            {excelLoading && <span className="clientes-new-excel-loading ms-2 align-middle">₿</span>}
          </div>
        </div>
        </section>
      </>
  );

  if (variant === "modal") {
    return (
      <form onSubmit={handleSubmit}>
        <div className="modal-body professional-modal-body">
          {innerContent}
        </div>
      </form>
    );
  }

  return (
    <div className="usuarios-page-card clientes-new-form-card">
      <div className="usuarios-page-header">
        <div className="usuarios-page-header-inner">
          <h2 className="usuarios-page-title">
            <span className="usuarios-page-title-icon" aria-hidden><i className="bi bi-person-plus-fill" /></span>
            Agregar nuevo cliente
          </h2>
          <p className="usuarios-page-subtitle">
            Código, nombre, teléfonos, contacto y ubicación. Opcional: cargar desde Excel.
          </p>
        </div>
      </div>
      <div className="usuarios-page-body">
        <form onSubmit={handleSubmit}>
          {innerContent}
        </form>
      </div>
    </div>
  );
}
