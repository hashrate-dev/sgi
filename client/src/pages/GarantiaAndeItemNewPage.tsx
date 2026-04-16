import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createGarantiaItem, getEquipos, getGarantiasItems, wakeUpBackend, type EquiposResponse, type GarantiasItemsResponse } from "../lib/api";
import type { ItemGarantiaAnde } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { showToast } from "../components/ToastNotification";
import { useAuth } from "../contexts/AuthContext";
import { canEditClientes } from "../lib/auth";
import "../styles/facturacion.css";
import "../styles/marketplace-hashrate.css";
import "../styles/cliente-tienda-edit.css";

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
  const [marketplaceEquipos, setMarketplaceEquipos] = useState<Array<{ id: string; label: string }>>([]);

  const nextCodigo = getNextCodigoGarantia(items);

  const [formData, setFormData] = useState({
    marca: "",
    modelo: "",
    marketplaceEquipoId: "",
    fechaIngreso: new Date().toISOString().slice(0, 10),
    precioGarantia: "",
    observaciones: "",
  });

  useEffect(() => {
    getGarantiasItems()
      .then((r: GarantiasItemsResponse) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    wakeUpBackend()
      .then(() => getEquipos())
      .then((r: EquiposResponse) => {
        const all = Array.isArray(r.items) ? r.items : [];
        const mapped = all
          .filter((x) => x?.id && x.marketplaceVisible === true)
          .map((x) => ({
            id: x.id,
            label: `${x.marcaEquipo ?? "—"} ${x.modelo ?? "—"} · ${x.procesador ?? "—"} · ${x.numeroSerie ?? x.id}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "es"));
        setMarketplaceEquipos(mapped);
      })
      .catch(() => setMarketplaceEquipos([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.marca.trim() || !formData.modelo.trim() || !formData.fechaIngreso.trim()) {
      showToast("Debe completar Marca, Modelo y Fecha ingreso.", "error", "Items Garantía ANDE");
      return;
    }

    const codigo = getNextCodigoGarantia(items);
    const precioRaw = formData.precioGarantia.trim();
    const precioNum = precioRaw ? parseFloat(precioRaw.replace(",", ".")) : NaN;
    const precioGarantia = Number.isFinite(precioNum) ? precioNum : undefined;
    const newItem: ItemGarantiaAnde = {
      id: genId(),
      codigo,
      marca: formData.marca.trim(),
      modelo: formData.modelo.trim(),
      marketplaceEquipoId: formData.marketplaceEquipoId.trim() || undefined,
      fechaIngreso: formData.fechaIngreso.trim(),
      precioGarantia,
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
      <div className="fact-page fact-page--cte-tienda-edit">
        <div className="container cte-edit-tienda-page-inner">
          <PageHeader title="Items Garantía ANDE" logoHref="/" />
          <main className="cte-edit-market-main page-main page-main--market page-main--market--asic cliente-tienda-edit--admin">
            <section className="market-registro-section pt-0">
              <div className="py-2 cte-edit-tienda-container">
                <div className="market-registro-card cte-edit-market__card cte-edit-market__card--full">
                  <div className="p-3 text-muted">No tenés permisos para crear ítems.</div>
                  <div className="px-3 pb-3">
                    <Link to="/equipos-asic/items-garantia" className="btn btn-outline-secondary">
                      Volver al listado
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="fact-page fact-page--cte-tienda-edit">
      <div className="container cte-edit-tienda-page-inner">
        <PageHeader title="Nuevo ítem Garantía ANDE" logoHref="/" />
        <main className="cte-edit-market-main page-main page-main--market page-main--market--asic cliente-tienda-edit--admin">
          <section className="market-registro-section pt-0">
            <div className="py-2 py-lg-2 cte-edit-tienda-container">
              <div className="market-registro-card cte-edit-market__card cte-edit-market__card--full">
                <header className="market-registro-card__head cte-edit-tienda-card-head">
                  <p className="market-registro-card__kicker">Garantía ANDE · Ítems</p>
                  <h2 className="market-registro-card__title cte-edit-market__title-row">
                    <span>Nuevo ítem</span>
                    <span className="badge bg-success rounded-pill cte-edit-market__code-badge">{nextCodigo}</span>
                  </h2>
                </header>

                <form onSubmit={handleSubmit} noValidate className="cte-edit-market-form--admin">
                  <div className="row g-3 align-items-stretch cte-edit-tienda-main-grid">
                    <div className="col-12 col-lg-4 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="gar-new-legend-id"
                      >
                        <div id="gar-new-legend-id" className="market-registro-fieldset__legend">
                          <i className="bi bi-tag" aria-hidden />
                          Identificación
                        </div>
                        <div className="mb-2">
                          <label className="form-label market-registro-label" htmlFor="gar-new-fecha">
                            Fecha ingreso <span className="text-danger">*</span>
                          </label>
                          <input
                            id="gar-new-fecha"
                            type="date"
                            className="form-control cte-edit-market__input--locked"
                            value={formData.fechaIngreso}
                            readOnly
                            required
                            title="Se asigna automáticamente con la fecha actual"
                          />
                        </div>
                        <div className="mb-0">
                          <label className="form-label market-registro-label" htmlFor="gar-new-codigo">
                            Código <span className="text-danger">*</span>
                          </label>
                          <input
                            id="gar-new-codigo"
                            type="text"
                            className="form-control cte-edit-market__input--locked"
                            value={nextCodigo}
                            readOnly
                            aria-readonly="true"
                            title="Se asigna automáticamente (G001, G002, …)"
                          />
                          <div className="market-registro-hint text-muted">Se asigna automáticamente. Siguiente: {nextCodigo}</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-lg-4 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="gar-new-legend-eq"
                      >
                        <div id="gar-new-legend-eq" className="market-registro-fieldset__legend">
                          <i className="bi bi-cpu" aria-hidden />
                          Equipo
                        </div>
                        <div className="mb-2">
                          <label className="form-label market-registro-label" htmlFor="gar-new-marca">
                            Marca <span className="text-danger">*</span>
                          </label>
                          <input
                            id="gar-new-marca"
                            type="text"
                            className="form-control"
                            value={formData.marca}
                            onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                            placeholder="Ej: Bitmain"
                            required
                            autoComplete="off"
                          />
                        </div>
                        <div className="mb-2">
                          <label className="form-label market-registro-label" htmlFor="gar-new-modelo">
                            Modelo <span className="text-danger">*</span>
                          </label>
                          <input
                            id="gar-new-modelo"
                            type="text"
                            className="form-control"
                            value={formData.modelo}
                            onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                            placeholder="Ej: Antminer"
                            required
                            autoComplete="off"
                          />
                        </div>
                        <div className="mb-2">
                          <label className="form-label market-registro-label" htmlFor="gar-new-marketplace-equipo">
                            Equipo marketplace vinculado
                          </label>
                          <select
                            id="gar-new-marketplace-equipo"
                            className="form-select"
                            value={formData.marketplaceEquipoId}
                            onChange={(e) => setFormData({ ...formData, marketplaceEquipoId: e.target.value })}
                          >
                            <option value="">— Sin vínculo explícito —</option>
                            {marketplaceEquipos.map((eq) => (
                              <option key={eq.id} value={eq.id}>
                                {eq.label}
                              </option>
                            ))}
                          </select>
                          <div className="market-registro-hint text-muted">
                            Este vínculo fuerza el match de garantía para ese equipo del marketplace.
                          </div>
                        </div>
                        <div className="mb-0">
                          <label className="form-label market-registro-label" htmlFor="gar-new-precio">
                            Precio garantía
                          </label>
                          <input
                            id="gar-new-precio"
                            type="text"
                            inputMode="decimal"
                            className="form-control"
                            value={formData.precioGarantia}
                            onChange={(e) => setFormData({ ...formData, precioGarantia: e.target.value })}
                            placeholder="Opcional · ej. 150 o 150.50"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-lg-4 d-flex">
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                        role="group"
                        aria-labelledby="gar-new-legend-obs"
                      >
                        <div id="gar-new-legend-obs" className="market-registro-fieldset__legend">
                          <i className="bi bi-chat-left-text" aria-hidden />
                          Observaciones
                        </div>
                        <label className="form-label market-registro-label" htmlFor="gar-new-obs">
                          Observaciones
                        </label>
                        <textarea
                          id="gar-new-obs"
                          className="form-control"
                          rows={5}
                          value={formData.observaciones}
                          onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                          placeholder="Opcional"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="market-registro-submit-row d-flex flex-wrap gap-2 justify-content-end align-items-center cte-edit-tienda-actions">
                    <Link to="/equipos-asic/items-garantia" className="btn btn-outline-secondary order-2 order-md-1">
                      Cancelar
                    </Link>
                    <button type="submit" className="btn btn-success market-registro-submit order-1 order-md-3">
                      Guardar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
