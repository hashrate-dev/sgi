import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { createClient, createClientsBulk, getClients } from "../lib/api";
import { parseExcelFile } from "../lib/parseClientExcel";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes } from "../lib/auth";
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

export function ClienteNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [excelLoading, setExcelLoading] = useState(false);
  if (user && !canEditClientes(user.role)) return <Navigate to="/clients/hosting" replace />;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    createClient(payload)
      .then(() => {
        setMessage({ type: "ok", text: "Cliente agregado correctamente." });
        setForm(emptyForm);
        setTimeout(() => {
          navigate("/clients/hosting");
        }, 1500);
      })
      .catch((err) => setMessage({ type: "err", text: err instanceof Error ? err.message : "Error al crear" }));
  }

  async function handleExcelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx =
      file.name.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (!isXlsx) {
      setMessage({ type: "err", text: "Elegí un archivo Excel (.xlsx)." });
      e.target.value = "";
      return;
    }
    setExcelLoading(true);
    setMessage(null);
    e.target.value = "";
    try {
      const existingCodes = await getClients().then((r) => (r.clients ?? []).map((c) => c.code).filter(Boolean) as string[]);
      const rows = await parseExcelFile(file, { existingCodes });
      if (rows.length === 0) {
        setMessage({ type: "ok", text: "No hay clientes nuevos para agregar. Todos los del Excel ya existían o no hay filas con datos." });
        setExcelLoading(false);
        return;
      }
      const res = await createClientsBulk(rows);
      const { inserted, skipped, errors } = res;
      if (errors > 0) {
        const errPreview = (res.errorMessages ?? []).slice(0, 3).join(" | ");
        setMessage({
          type: "err",
          text: errPreview
            ? `Se agregaron ${inserted}. ${skipped} omitidos. ${errors} con error: ${errPreview}`
            : `Se agregaron ${inserted}. ${skipped} omitidos. ${errors} con error de validación. Revisá que Código y Nombre tengan datos.`
        });
      } else if (inserted > 0) {
        setMessage({ type: "ok", text: `Se agregaron ${inserted} cliente(s) nuevo(s). ${skipped > 0 ? `${skipped} omitidos (ya existían).` : ""} Redirigiendo...` });
      } else {
        setMessage({ type: "ok", text: `Se agregaron ${inserted}. ${skipped} omitidos (código ya existía).` });
      }
      if (inserted > 0) setTimeout(() => navigate("/clients/hosting"), 2000);
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Error al leer el archivo Excel."
      });
    } finally {
      setExcelLoading(false);
    }
  }

  return (
    <div className="fact-page clientes-new-page">
      <div className="container">
        <PageHeader title="Nuevo Cliente" showBackButton backTo="/clients/hosting" backText="Volver a clientes" />

        <div className="usuarios-page-card">
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
            <div className="clientes-new-excel-box">
              <strong className="clientes-new-excel-title">B. Automático: cargar desde Excel</strong>
              <p className="clientes-new-excel-text">
                Usá un archivo .xlsx. La <strong>primera fila</strong> = nombres de columnas, en este orden:
              </p>
              <ul className="clientes-new-excel-columns">
                <li><strong>Código</strong></li>
                <li><strong>Contacto Principal</strong> y <strong>Contacto alternativo</strong>: para cada uno, columnas — Nombre o Razón Social, Teléfono, Email, Dirección, Ciudad / País.</li>
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
              </div>
            </div>

            <hr className="clientes-new-divider" />

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
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 1 *</label>
                      <input
                        className="fact-input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Nombre o razón social"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Nombre o Razón Social 2</label>
                      <input className="fact-input" value={form.name2} onChange={(e) => setForm((f) => ({ ...f, name2: e.target.value }))} placeholder="Nombre (opcional)" />
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
                        placeholder="Teléfono"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Teléfono 2</label>
                      <input className="fact-input" type="tel" value={form.phone2} onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))} placeholder="Teléfono" />
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
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Email 2</label>
                      <input
                        className="fact-input"
                        type="email"
                        value={form.email2}
                        onChange={(e) => setForm((f) => ({ ...f, email2: e.target.value }))}
                        placeholder="correo@ejemplo.com"
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
                        placeholder="Dirección"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Dirección 2</label>
                      <input className="fact-input" value={form.address2} onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))} placeholder="Dirección" />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 1</label>
                      <input
                        className="fact-input"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Ciudad, País"
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Ciudad / País 2</label>
                      <input className="fact-input" value={form.city2} onChange={(e) => setForm((f) => ({ ...f, city2: e.target.value }))} placeholder="Ciudad, País" />
                    </div>
                  </div>
                </div>

                {message && (
                <div className={`clientes-new-message clientes-new-message--${message.type}`}>
                  {message.text}
                </div>
              )}
              <div className="clientes-new-actions">
                <Link to="/clients/hosting" className="fact-btn fact-btn-secondary">
                  Cancelar
                </Link>
                <button type="submit" className="fact-btn fact-btn-primary">
                  Agregar cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
