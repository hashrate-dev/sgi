import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createGarantiaItem, getGarantiasItems } from "../lib/api";
import type { ItemGarantiaAnde } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getNextCodigoGarantia(items: ItemGarantiaAnde[]): string {
  const prefix = "G";
  const nums = items
    .map((i) => {
      const m = i.codigo.trim().toUpperCase().match(/^G(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function GarantiaAndeItemNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user ? canEditClientes(user.role) : false;
  const [items, setItems] = useState<ItemGarantiaAnde[]>([]);
  const [, setLoading] = useState(true);

  const nextCodigo = getNextCodigoGarantia(items);

  const [formData, setFormData] = useState({
    codigo: "G001",
    marca: "",
    modelo: "",
    fechaIngreso: new Date().toISOString().slice(0, 10),
    observaciones: "",
  });

  useEffect(() => {
    getGarantiasItems()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.marca.trim() || !formData.modelo.trim() || !formData.fechaIngreso.trim()) {
      showToast("Debe completar Marca, Modelo y Fecha ingreso.", "error", "Items Garantía ANDE");
      return;
    }

    const codigo = getNextCodigoGarantia(items);
    const newItem: ItemGarantiaAnde = {
      id: genId(),
      codigo,
      marca: formData.marca.trim(),
      modelo: formData.modelo.trim(),
      fechaIngreso: formData.fechaIngreso.trim(),
      observaciones: formData.observaciones.trim() || undefined,
    };
    try {
      await createGarantiaItem(newItem);
      showToast("Ítem agregado correctamente.", "success", "Items Garantía ANDE");
      navigate("/equipos-asic/items-garantia");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar.", "error", "Items Garantía ANDE");
    }
  }

  if (!canEdit) {
    return (
      <div className="fact-page">
        <div className="container">
          <PageHeader title="Items Garantía ANDE" />
          <p className="text-muted">No tenés permisos para crear ítems.</p>
          <Link to="/equipos-asic/items-garantia" className="fact-btn fact-btn-secondary">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Nuevo ítem Garantía ANDE" />
        <p className="text-muted small mb-3">
          <Link to="/equipos-asic/items-garantia" style={{ textDecoration: "none" }}>← Volver al listado</Link>
          {" · "}
          Completá el formulario para dar de alta un ítem en la base de datos de garantía.
        </p>

        <div className="fact-layout mb-4" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
          <div className="fact-card">
            <div className="fact-card-header">Nuevo ítem Garantía ANDE</div>
            <div className="fact-card-body">
              <form onSubmit={handleSubmit}>
                <div className="client-form-grid-4">
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Identificación</h3>
                    <div className="fact-field">
                      <label className="fact-label">Fecha ingreso *</label>
                      <input
                        type="date"
                        className="fact-input"
                        value={formData.fechaIngreso}
                        readOnly
                        title="Se asigna automáticamente con la fecha actual"
                        style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
                        required
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Código *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={nextCodigo}
                        readOnly
                        title="Se asigna automáticamente (G001, G002, ...)"
                        style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
                      />
                      <small className="text-muted d-block mt-1">Se asigna automáticamente. Siguiente: {nextCodigo}</small>
                    </div>
                  </div>
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Equipo</h3>
                    <div className="fact-field">
                      <label className="fact-label">Marca *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.marca}
                        onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                        placeholder="Ej: Bitmain"
                        required
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Modelo *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.modelo}
                        onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                        placeholder="Ej: Antminer"
                        required
                      />
                    </div>
                  </div>
                  <div className="client-form-column" style={{ gridColumn: "span 2" }}>
                    <h3 className="client-form-section-title">Observaciones</h3>
                    <div className="fact-field">
                      <label className="fact-label">Observaciones</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.observaciones}
                        onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-3 flex-wrap" style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}>
                  <Link to="/equipos-asic/items-garantia" className="fact-btn fact-btn-secondary">
                    Cancelar
                  </Link>
                  <button type="submit" className="fact-btn fact-btn-primary">
                    Guardar
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
