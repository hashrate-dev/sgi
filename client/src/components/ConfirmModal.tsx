import type { ReactNode } from "react";
import "../styles/facturacion.css";

type Variant = "info" | "warning" | "delete" | "success";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
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

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Sí",
  cancelLabel = "No",
  variant = "info",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const modalClass = VARIANT_CLASS[variant];

  return (
    <div className="modal d-block professional-modal-overlay" tabIndex={-1} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-dialog-centered">
        <div className={`modal-content professional-modal ${modalClass}`}>
          <div className="professional-modal-header modal-header">
            <div className="professional-modal-icon-wrapper">
              <DocIcon />
            </div>
            <h5 className="modal-title professional-modal-title">{title}</h5>
            <button type="button" className="professional-modal-close" onClick={onCancel} aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="modal-body professional-modal-body">
            <p style={{ fontSize: "1rem", color: "#374151", margin: 0 }}>{message}</p>
          </div>
          <div className="modal-footer professional-modal-footer">
            <button type="button" className="professional-btn professional-btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className="professional-btn professional-btn-primary" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
