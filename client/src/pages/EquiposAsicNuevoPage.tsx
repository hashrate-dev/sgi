import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadEquiposAsic, saveEquiposAsic } from "../lib/storage";
import type { EquipoASIC } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Siguiente número de serie: M001, M002, ... sin repetir */
function getNextNumeroSerie(equipos: EquipoASIC[]): string {
  const nums = equipos
    .filter((e) => e.numeroSerie)
    .map((e) => {
      const m = e.numeroSerie!.trim().toUpperCase().match(/^M(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `M${String(next).padStart(3, "0")}`;
}

export function EquiposAsicNuevoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user ? canEditClientes(user.role) : false;
  const [equipos, _setEquipos] = useState<EquipoASIC[]>(() => loadEquiposAsic());
  const nextNumeroSerie = getNextNumeroSerie(equipos);

  const [formData, setFormData] = useState({
    fechaIngreso: new Date().toISOString().split("T")[0],
    marcaEquipo: "",
    modelo: "",
    procesador: "",
    observaciones: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.marcaEquipo?.trim() || !formData.modelo?.trim() || !formData.procesador?.trim()) {
      showToast("Debe completar Marca, Modelo y Procesador.", "error", "Equipos ASIC");
      return;
    }

    const equiposActual = loadEquiposAsic();
    const numeroSerie = getNextNumeroSerie(equiposActual);
    const nuevo: EquipoASIC = {
      id: genId(),
      numeroSerie,
      fechaIngreso: formData.fechaIngreso,
      marcaEquipo: formData.marcaEquipo.trim(),
      modelo: formData.modelo.trim(),
      procesador: formData.procesador.trim(),
      precioUSD: 0,
      observaciones: formData.observaciones.trim() || undefined,
    };
    saveEquiposAsic([...equiposActual, nuevo]);
    showToast("Equipo agregado correctamente.", "success", "Equipos ASIC");
    navigate("/equipos-asic/equipos");
  }

  if (!canEdit) {
    return (
      <div className="fact-page">
        <div className="container">
          <PageHeader title="Equipos ASIC" />
          <p className="text-muted">No tenés permisos para crear equipos.</p>
          <Link to="/equipos-asic/equipos" className="fact-btn fact-btn-secondary">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page">
      <div className="container">
        <PageHeader title="Nuevo Equipo ASIC" />
        <p className="text-muted small mb-3">
          <Link to="/equipos-asic/equipos" style={{ textDecoration: "none" }}>← Volver al listado</Link>
          {" · "}
          Completá el formulario para dar de alta un equipo en la base de datos.
        </p>

        <div className="fact-layout mb-4" style={{ gridTemplateColumns: "1fr", maxWidth: "100%" }}>
          <div className="fact-card">
            <div className="fact-card-header">Nuevo Equipo ASIC</div>
            <div className="fact-card-body">
              <form onSubmit={handleSubmit}>
                <div className="client-form-grid-4">
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Identificación</h3>
                    <div className="fact-field">
                      <label className="fact-label">Número de serie *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={nextNumeroSerie}
                        readOnly
                        title="Se asigna automáticamente (M001, M002, ...)"
                        style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
                      />
                      <small className="text-muted d-block mt-1">Se asigna automáticamente. Siguiente: {nextNumeroSerie}</small>
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Fecha ingreso *</label>
                      <input
                        type="date"
                        className="fact-input"
                        value={formData.fechaIngreso}
                        onChange={(e) => setFormData({ ...formData, fechaIngreso: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="client-form-column">
                    <h3 className="client-form-section-title">Equipo</h3>
                    <div className="fact-field">
                      <label className="fact-label">Marca *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.marcaEquipo}
                        onChange={(e) => setFormData({ ...formData, marcaEquipo: e.target.value })}
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
                        placeholder="Ej: Antminer S21"
                        required
                      />
                    </div>
                    <div className="fact-field">
                      <label className="fact-label">Procesador *</label>
                      <input
                        type="text"
                        className="fact-input"
                        value={formData.procesador}
                        onChange={(e) => setFormData({ ...formData, procesador: e.target.value })}
                        placeholder="Ej: SHA-256"
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
                  <Link to="/equipos-asic/equipos" className="fact-btn fact-btn-secondary">
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
