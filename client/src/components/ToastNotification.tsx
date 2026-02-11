import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export function showToast(message: string, type: ToastType = "info") {
  const id = `${Date.now()}-${Math.random()}`;
  const newToast: Toast = { id, message, type };
  toasts.push(newToast);
  notifyListeners();

  // Auto-remove after delay
  setTimeout(() => {
    removeToast(id);
  }, type === "error" ? 5000 : 4000);
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
}

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

  const getToastClass = (type: ToastType) => {
    switch (type) {
      case "success":
        return ""; // Usaremos estilo inline para el verde HASHRATE
      case "error":
        return "bg-danger text-white";
      case "warning":
        return "bg-warning text-dark";
      case "info":
        return ""; // Usaremos estilo inline para el azul
      default:
        return "bg-secondary text-white";
    }
  };

  const getToastStyle = (type: ToastType) => {
    if (type === "success") {
      return {
        backgroundColor: "#00a652",
        color: "#ffffff"
      };
    }
    if (type === "info") {
      return {
        backgroundColor: "#0d6efd", // Azul sólido de Bootstrap
        color: "#ffffff"
      };
    }
    return {};
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "📢";
    }
  };

  return createPortal(
    <div
      className="toast-container position-fixed top-0 end-0 p-3"
      style={{ zIndex: 9999 }}
    >
      {currentToasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast show ${getToastClass(toast.type)}`}
          role="alert"
          style={{
            minWidth: "320px",
            maxWidth: "400px",
            boxShadow: toast.type === "success" 
              ? "0 4px 16px rgba(0, 166, 82, 0.3)" 
              : "0 4px 16px rgba(0, 0, 0, 0.2)",
            borderRadius: "12px",
            border: "none",
            marginBottom: "0.75rem",
            animation: "slideInRight 0.3s ease-out",
            ...getToastStyle(toast.type)
          }}
        >
          <div className="toast-header bg-transparent border-0 text-white d-flex align-items-center" style={{ padding: "0.75rem 1rem 0.5rem" }}>
            <span className="me-2" style={{ fontSize: "1.3rem" }}>
              {getIcon(toast.type)}
            </span>
            <strong className="me-auto" style={{ fontSize: "0.95rem" }}>
              {toast.type === "success"
                ? "Éxito"
                : toast.type === "error"
                ? "Error"
                : toast.type === "warning"
                ? "Atención"
                : "Información"}
            </strong>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => removeToast(toast.id)}
              aria-label="Close"
              style={{ opacity: 0.8 }}
            ></button>
          </div>
          <div className="toast-body" style={{ padding: "0.5rem 1rem 0.75rem", fontSize: "0.9rem", lineHeight: "1.5" }}>
            {toast.message}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
