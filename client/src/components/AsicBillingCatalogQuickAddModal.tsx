import { useEffect, useState } from "react";

export type AsicBillingCatalogQuickAddKind = "equipo" | "setup" | "reparacion" | "flete";

export type AsicBillingCatalogQuickAddForm = {
  marcaEquipo: string;
  modelo: string;
  procesador: string;
  nombre: string;
  precioUSD: number;
};

const EMPTY_FORM: AsicBillingCatalogQuickAddForm = {
  marcaEquipo: "",
  modelo: "",
  procesador: "",
  nombre: "",
  precioUSD: 0,
};

const TITLES: Record<AsicBillingCatalogQuickAddKind, string> = {
  equipo: "Nuevo equipo ASIC",
  setup: "Nuevo Setup",
  reparacion: "Nuevo tipo de reparación",
  flete: "Nuevo transporte / flete",
};

type Props = {
  kind: AsicBillingCatalogQuickAddKind | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (kind: AsicBillingCatalogQuickAddKind, form: AsicBillingCatalogQuickAddForm) => void | Promise<void>;
};

function normalizePrecioUsd(raw: string): number {
  const n = Math.round(Number(String(raw).replace(/,/g, ".")));
  if (!Number.isFinite(n)) return 0;
  return Math.min(999999, Math.max(0, n));
}

/** Modal rápido para alta de catálogo desde el select de ítems en ASIC Billing. */
export function AsicBillingCatalogQuickAddModal({ kind, busy = false, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<AsicBillingCatalogQuickAddForm>(EMPTY_FORM);

  useEffect(() => {
    if (kind) setForm(EMPTY_FORM);
  }, [kind]);

  if (!kind) return null;

  const title = TITLES[kind];
  const isEquipo = kind === "equipo";

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content fact-card" style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}>
          <div className="fact-card-header d-flex align-items-center justify-content-between">
            <span>{title}</span>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" disabled={busy} />
          </div>
          <div className="fact-card-body">
            <p className="small text-muted mb-3">
              Se guarda en la base y queda disponible en el selector sin salir de este formulario.
            </p>
            {isEquipo ? (
              <>
                <div className="fact-field">
                  <label className="fact-label">Marca *</label>
                  <input
                    type="text"
                    className="fact-input"
                    value={form.marcaEquipo}
                    onChange={(e) => setForm((f) => ({ ...f, marcaEquipo: e.target.value }))}
                    placeholder="Ej. Bitmain"
                    disabled={busy}
                    autoFocus
                  />
                </div>
                <div className="fact-field">
                  <label className="fact-label">Modelo *</label>
                  <input
                    type="text"
                    className="fact-input"
                    value={form.modelo}
                    onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                    placeholder="Ej. Antminer S21 Pro"
                    disabled={busy}
                  />
                </div>
                <div className="fact-field">
                  <label className="fact-label">Procesador / hashrate *</label>
                  <input
                    type="text"
                    className="fact-input"
                    value={form.procesador}
                    onChange={(e) => setForm((f) => ({ ...f, procesador: e.target.value }))}
                    placeholder="Ej. 235 TH/s"
                    disabled={busy}
                  />
                </div>
              </>
            ) : (
              <div className="fact-field">
                <label className="fact-label">Nombre *</label>
                <input
                  type="text"
                  className="fact-input"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder={
                    kind === "setup"
                      ? "Ej. Setup"
                      : kind === "reparacion"
                        ? "Ej. Reparación placa control"
                        : "Ej. Envío ASIC L7 ASU-SCL"
                  }
                  disabled={busy}
                  autoFocus
                />
              </div>
            )}
            <div className="fact-field">
              <label className="fact-label">Precio USD *</label>
              <input
                type="number"
                min={0}
                max={999999}
                step={1}
                className="fact-input"
                value={form.precioUSD}
                onChange={(e) => setForm((f) => ({ ...f, precioUSD: normalizePrecioUsd(e.target.value) }))}
                disabled={busy}
              />
            </div>
            <div className="d-flex gap-2 mt-3 flex-wrap" style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button type="button" className="fact-btn fact-btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="fact-btn fact-btn-primary"
                disabled={busy}
                onClick={() => void onSubmit(kind, form)}
              >
                {busy ? "Guardando…" : "Guardar y usar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
