import { useEffect, useState } from "react";

export type GarantiaCatalogQuickAddForm = {
  marca: string;
  modelo: string;
  precioGarantia: number | "";
};

const EMPTY_FORM: GarantiaCatalogQuickAddForm = {
  marca: "",
  modelo: "",
  precioGarantia: "",
};

type Props = {
  open: boolean;
  nextCodigo: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (form: GarantiaCatalogQuickAddForm) => void | Promise<void>;
};

/** Modal rápido para alta de ítem de depósito garantía desde el select del form. */
export function GarantiaCatalogQuickAddModal({ open, nextCodigo, busy = false, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<GarantiaCatalogQuickAddForm>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content fact-card" style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}>
          <div className="fact-card-header d-flex align-items-center justify-content-between">
            <span>Nuevo ítem de garantía</span>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" disabled={busy} />
          </div>
          <div className="fact-card-body">
            <p className="small text-muted mb-3">
              Se guarda en la base y queda disponible en el selector sin salir de este formulario.
            </p>
            <div className="fact-field">
              <label className="fact-label">Código</label>
              <input type="text" className="fact-input" value={nextCodigo} readOnly style={{ backgroundColor: "#f0f0f0" }} />
            </div>
            <div className="fact-field">
              <label className="fact-label">Marca *</label>
              <input
                type="text"
                className="fact-input"
                value={form.marca}
                onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
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
                placeholder="Ej. Antminer S21"
                disabled={busy}
              />
            </div>
            <div className="fact-field">
              <label className="fact-label">Precio garantía (USD)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="fact-input"
                value={form.precioGarantia}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm((f) => ({ ...f, precioGarantia: "" }));
                    return;
                  }
                  const n = Math.round(Number(raw));
                  setForm((f) => ({
                    ...f,
                    precioGarantia: Number.isFinite(n) ? Math.max(0, n) : "",
                  }));
                }}
                placeholder="Opcional"
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
                onClick={() => void onSubmit(form)}
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
