import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { createClient } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";

type ClientRow = { code: string; name: string; name2?: string; phone?: string; phone2?: string; email?: string; email2?: string; address?: string; address2?: string; city?: string; city2?: string };

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300/g, "")
    .trim();
}

function findCol(headerRow: (string | number)[], ...names: string[]): number {
  for (let i = 1; i < headerRow.length; i++) {
    const h = normalizeHeader(String(headerRow[i] ?? ""));
    for (const n of names) {
      const k = normalizeHeader(n);
      if (h === k || h.includes(k) || k.includes(h)) return i;
    }
  }
  return -1;
}

async function parseExcelFile(file: File): Promise<ClientRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: (string | number)[][] = [];
  sheet.eachRow((row) => rows.push(row.values as (string | number)[]));
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  const idx = {
    code: findCol(headerRow, "codigo", "código", "code"),
    name: findCol(headerRow, "nombre o razon social 1", "nombre o razón social 1", "nombre", "razon social", "name"),
    name2: findCol(headerRow, "nombre o razon social 2", "nombre o razón social 2", "nombre 2", "nombre2"),
    phone: findCol(headerRow, "teléfono 1", "telefono 1", "teléfono", "telefono", "phone"),
    phone2: findCol(headerRow, "teléfono 2", "telefono 2", "phone2"),
    email: findCol(headerRow, "email1", "email 1", "email", "correo"),
    email2: findCol(headerRow, "email2", "email 2"),
    address: findCol(headerRow, "dirección 1", "direccion 1", "dirección", "direccion", "address"),
    address2: findCol(headerRow, "direccion 2", "dirección 2", "address2"),
    city: findCol(headerRow, "ciudad / pais 1", "ciudad / país 1", "ciudad", "pais", "city"),
    city2: findCol(headerRow, "ciudad / pais 2", "ciudad / país 2", "city2")
  };
  const get = (row: (string | number)[], i: number): string =>
    i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";

  const result: ClientRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const code = idx.code >= 0 ? get(row, idx.code) : get(row, 1);
    const name = idx.name >= 0 ? get(row, idx.name) : get(row, 2);
    if (!code && !name) continue;
    result.push({
      code: code || `R${r}`,
      name: name || "Sin nombre",
      name2: idx.name2 >= 0 ? get(row, idx.name2) || undefined : undefined,
      phone: idx.phone >= 0 ? get(row, idx.phone) || undefined : undefined,
      phone2: idx.phone2 >= 0 ? get(row, idx.phone2) || undefined : undefined,
      email: idx.email >= 0 ? get(row, idx.email) || undefined : undefined,
      email2: idx.email2 >= 0 ? get(row, idx.email2) || undefined : undefined,
      address: idx.address >= 0 ? get(row, idx.address) || undefined : undefined,
      address2: idx.address2 >= 0 ? get(row, idx.address2) || undefined : undefined,
      city: idx.city >= 0 ? get(row, idx.city) || undefined : undefined,
      city2: idx.city2 >= 0 ? get(row, idx.city2) || undefined : undefined
    });
  }
  return result;
}

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
  if (user && !canEditClientes(user.role)) return <Navigate to="/clientes" replace />;

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
          navigate("/clientes");
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
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setMessage({ type: "err", text: "No se encontraron filas con datos. La primera fila debe ser encabezados (Código, Nombre, etc.)." });
        setExcelLoading(false);
        return;
      }
      const results = await Promise.allSettled(rows.map((payload) => createClient(payload)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const err = results.filter((r) => r.status === "rejected").length;
      if (err === 0) {
        setMessage({ type: "ok", text: `Se agregaron ${ok} clientes desde el Excel. Redirigiendo...` });
        setTimeout(() => {
          navigate("/clientes");
        }, 2000);
      } else {
        setMessage({
          type: "err",
          text: `Se agregaron ${ok} clientes. ${err} no se pudieron agregar (código duplicado u otro error).`
        });
      }
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
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Nuevo Cliente" />

        <div className="fact-layout" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
          <div className="fact-card">
            <div className="fact-card-header">Agregar nuevo cliente</div>
            <div className="fact-card-body">
              {/* Opción de cargar desde Excel */}
              <div className="mb-3 p-3 rounded" style={{ background: "#f0f9ff", border: "1px solid #bae6fd" }}>
                <strong className="d-block mb-2">Cargar desde Excel</strong>
                <p className="text-muted small mb-2">
                  Subí un .xlsx con la primera fila igual que &quot;listado de clientes&quot;: <strong>Codigo</strong>, <strong>Nombre o Razon Social 1</strong>, 2, <strong>Teléfono 1</strong>, 2, <strong>Email1</strong>, Email2, <strong>Dirección 1</strong>, Direccion 2, <strong>Ciudad / Pais 1</strong>, 2.
                </p>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="d-block mb-2"
                  onChange={handleExcelChange}
                  disabled={excelLoading}
                />
                {excelLoading && <span className="text-muted small">Cargando y guardando clientes...</span>}
              </div>

              <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

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
                  <button type="submit" className="fact-btn fact-btn-primary">
                    Agregar cliente
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
