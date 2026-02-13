import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Contexto opcional (ej. "Gestión de usuarios", "Historial") para mostrar en el encabezado */
  context?: string;
}

let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export function showToast(message: string, type: ToastType = "info", context?: string) {
  const id = `${Date.now()}-${Math.random()}`;
  const newToast: Toast = { id, message, type, context };
  toasts.push(newToast);
  notifyListeners();

  setTimeout(() => {
    removeToast(id);
  }, type === "error" ? 5000 : 4000);
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
}

/* Paleta alineada al proyecto: verde principal #2D5D46, mismos bordes redondeados y sombras */
const TOAST_STYLE = {
  success: {
    headerBg: "#2D5D46",
    headerBorder: "rgba(255, 255, 255, 0.2)",
    iconBg: "rgba(255, 255, 255, 0.22)",
  },
  error: {
    headerBg: "#991b1b",
    headerBorder: "rgba(255, 255, 255, 0.2)",
    iconBg: "rgba(255, 255, 255, 0.22)",
  },
  warning: {
    headerBg: "#b45309",
    headerBorder: "rgba(255, 255, 255, 0.2)",
    iconBg: "rgba(255, 255, 255, 0.22)",
  },
  info: {
    headerBg: "#0d6efd",
    headerBorder: "rgba(255, 255, 255, 0.2)",
    iconBg: "rgba(255, 255, 255, 0.22)",
  },
} as const;

const TOAST_LABELS: Record<ToastType, string> = {
  success: "Éxito",
  error: "Error",
  warning: "Atención",
  info: "Información",
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setCurrentToasts(newToasts);
    };
    toastListeners.push(listener);
    setCurrentToasts([...toasts]);

    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return createPortal(
    <div
      className="hrs-toast-container position-fixed top-0 end-0 p-3"
      style={{ zIndex: 9999 }}
    >
      {currentToasts.map((toast) => {
        const style = TOAST_STYLE[toast.type];
        return (
          <div
            key={toast.id}
            className="hrs-toast show"
            role="alert"
            style={{
              minWidth: "320px",
              maxWidth: "400px",
              borderRadius: "16px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08)",
              border: `1px solid ${style.headerBorder}`,
              marginBottom: "0.75rem",
              overflow: "hidden",
              animation: "hrs-toast-slideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
              background: "#fff",
            }}
          >
            {/* Encabezado: mismo estilo que Filtros del proyecto (verde/blanco) */}
            <div
              className="hrs-toast-header d-flex align-items-center"
              style={{
                padding: "0.75rem 1.25rem",
                background: style.headerBg,
                color: "#fff",
                borderBottom: `2px solid ${style.headerBorder}`,
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: "0.75rem",
                  flexShrink: 0,
                  background: style.iconBg,
                }}
              >
                <span style={{ fontSize: "1rem" }}>{TOAST_ICONS[toast.type]}</span>
              </div>
              <strong className="me-auto" style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                {toast.context ? (
                  <>
                    <span style={{ opacity: 0.98 }}>{toast.context}</span>
                    <span style={{ opacity: 0.8, margin: "0 0.35rem", fontWeight: 400 }}>{" · "}</span>
                  </>
                ) : null}
                {TOAST_LABELS[toast.type]}
              </strong>
              <button
                type="button"
                className="hrs-toast-close btn-close btn-close-white"
                onClick={() => removeToast(toast.id)}
                aria-label="Cerrar"
                style={{
                  opacity: 0.85,
                  fontSize: "0.7rem",
                  padding: "0.35rem",
                }}
              />
            </div>
            {/* Cuerpo: fondo blanco como listados del proyecto */}
            <div
              className="hrs-toast-body"
              style={{
                padding: "1rem 1.25rem",
                fontSize: "0.9375rem",
                lineHeight: 1.5,
                color: "#374151",
                background: "#fff",
              }}
            >
              {toast.message}
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes hrs-toast-slideIn {
          from {
            transform: translateX(120%) scale(0.92);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        .hrs-toast-container .hrs-toast-close:hover {
          opacity: 1 !important;
        }
      `}</style>
    </div>,
    document.body
  );
}
