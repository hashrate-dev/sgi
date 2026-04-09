import { useId, type ReactNode } from "react";
import "../styles/facturacion.css";

type Variant = "info" | "warning" | "delete" | "success";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  /** Texto del recuadro rosa (ej. «Esta acción no se puede deshacer»). */
  warningText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
  /** Deshabilita botones y muestra spinner en confirmar (acciones async). */
  confirmPending?: boolean;
  confirmPendingLabel?: string;
  /** Por encima de capas altas (ej. drawer marketplace z-index ~10040). */
  elevated?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  info: "professional-modal-info",
  warning: "professional-modal-warning",
  delete: "professional-modal-delete",
  success: "professional-modal-success",
};

/** Icono de documento/PDF para confirmación de guardar */
function DocIcon() {
  return (
    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** Mismo icono que ClienteEdit / Usuarios (eliminar). */
function DeleteDangerIcon() {
  return (
    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  warningText,
  confirmLabel = "Sí",
  cancelLabel = "No",
  variant = "info",
  onConfirm,
  onCancel,
  confirmPending = false,
  confirmPendingLabel = "Procesando…",
  elevated = false,
}: ConfirmModalProps) {
  const titleId = useId();
  if (!open) return null;

  const modalClass = VARIANT_CLASS[variant];
  const overlayClass =
    "modal d-block professional-modal-overlay" + (elevated ? " professional-modal-overlay--elevated" : "");

  return (
    <div className={overlayClass} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-dialog modal-dialog-centered">
        <div className={`modal-content professional-modal ${modalClass}`}>
          <div className="professional-modal-header modal-header">
            <div className="professional-modal-icon-wrapper">{variant === "delete" ? <DeleteDangerIcon /> : <DocIcon />}</div>
            <h5 className="modal-title professional-modal-title" id={titleId}>
              {title}
            </h5>
            <button type="button" className="professional-modal-close" onClick={onCancel} disabled={confirmPending} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="modal-body professional-modal-body">
            <div style={{ fontSize: "1rem", color: "#374151", marginBottom: warningText ? "1rem" : 0 }}>{message}</div>
            {warningText ? <div className="professional-modal-warning-box">{warningText}</div> : null}
          </div>
          <div className="modal-footer professional-modal-footer">
            <button type="button" className="professional-btn professional-btn-secondary" onClick={onCancel} disabled={confirmPending}>
              {cancelLabel}
            </button>
            <button type="button" className="professional-btn professional-btn-primary" onClick={onConfirm} disabled={confirmPending}>
              {confirmPending ? (
                <>
                  <span className="professional-btn-spinner" />
                  {confirmPendingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
