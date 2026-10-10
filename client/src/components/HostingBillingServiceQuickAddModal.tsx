import { useEffect, useState } from "react";

export type HostingBillingServiceQuickAddForm = {
  name: string;
  price: number;
};

const EMPTY: HostingBillingServiceQuickAddForm = { name: "", price: 0 };

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (form: HostingBillingServiceQuickAddForm) => void | Promise<void>;
};

function normalizePrice(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.min(999999, Math.max(0, Math.round(n * 100) / 100));
}

/** Alta de un servicio de hosting para el selector de ítems de billing. */
export function HostingBillingServiceQuickAddModal({ open, busy = false, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<HostingBillingServiceQuickAddForm>(EMPTY);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  if (!open) return null;

  const nameOk = form.name.trim().length >= 3;

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content fact-card" style={{ border: "none", borderRadius: "8px", overflow: "hidden" }}>
          <div className="fact-card-header d-flex align-items-center justify-content-between">
            <span>Nuevo ítem de hosting</span>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" disabled={busy} />
          </div>
          <div className="fact-card-body">
            <p className="small text-muted mb-3">
              Se guarda en la base y queda disponible en el selector de servicio de este formulario.
            </p>
            <div className="fact-field">
              <label className="fact-label">Nombre del servicio *</label>
              <input
                type="text"
                className="fact-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Servicio alojamiento y mantenimiento L11"
                disabled={busy}
                autoFocus
                maxLength={160}
              />
            </div>
            <div className="fact-field">
              <label className="fact-label">Precio USD por equipo</label>
              <input
                type="number"
                min={0}
                max={999999}
                step={0.01}
                className="fact-input"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: normalizePrice(e.target.value) }))}
                disabled={busy}
              />
            </div>
            <div className="d-flex gap-2 flex-wrap" style={{ justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button type="button" className="fact-btn fact-btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="fact-btn fact-btn-primary"
                disabled={busy || !nameOk}
                onClick={() => void onSubmit(form)}
              >
                {busy ? "Guardando…" : "Guardar ítem"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
