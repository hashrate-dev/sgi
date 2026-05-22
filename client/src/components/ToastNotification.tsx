import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { launchHrsConfettiInElement } from "../lib/celebrationConfetti";

export type ToastType = "success" | "error" | "warning" | "info";

export type ShowToastOptions = {
  /** Alert centrado en pantalla (modal con backdrop) */
  center?: boolean;
  /** Alert centrado con confeti (solo éxito; implica center) */
  celebrate?: boolean;
  /** Título del encabezado (reemplaza contexto + etiqueta por tipo) */
  title?: string;
  /** Duración visible en ms (por defecto según tipo) */
  durationMs?: number;
};

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Contexto opcional (ej. "Gestión de usuarios", "Historial") para mostrar en el encabezado */
  context?: string;
  /** Título personalizado del encabezado */
  title?: string;
  center?: boolean;
  celebrate?: boolean;
}

let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export function showToast(
  message: string,
  type: ToastType = "info",
  context?: string,
  options?: ShowToastOptions
) {
  const id = `${Date.now()}-${Math.random()}`;
  const celebrate = options?.celebrate === true && type === "success";
  const center = options?.center === true || celebrate;
  const newToast: Toast = {
    id,
    message,
    type,
    context,
    title: options?.title,
    center,
    celebrate,
  };
  toasts.push(newToast);
  notifyListeners();

  const defaultDuration = center
    ? 8000
    : type === "error"
      ? 5500
      : type === "success"
        ? 5000
        : 4000;
  const durationMs = options?.durationMs ?? defaultDuration;
  setTimeout(() => {
    removeToast(id);
  }, durationMs);
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyListeners();
}

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

function ToastConfettiLayer({ active }: { active: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !layerRef.current) return;
    const stop = launchHrsConfettiInElement(layerRef.current, 3200);
    return stop;
  }, [active]);

  if (!active) return null;

  return (
    <div
      ref={layerRef}
      className="hrs-toast-confetti-layer"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

function ToastCard({
  toast,
  variant,
}: {
  toast: Toast;
  variant: "corner" | "center";
}) {
  const style = TOAST_STYLE[toast.type];
  const isCenter = variant === "center";
  const celebrate = toast.celebrate === true;

  return (
    <div
      className={`hrs-toast ${isCenter ? "hrs-center-alert-card" : "show"}`}
      role="alertdialog"
      aria-modal={isCenter ? true : undefined}
      aria-labelledby={isCenter ? `hrs-alert-title-${toast.id}` : undefined}
      onClick={isCenter ? (e) => e.stopPropagation() : undefined}
      style={{
        minWidth: isCenter ? "min(92vw, 420px)" : "320px",
        maxWidth: isCenter ? "480px" : "400px",
        width: isCenter ? "100%" : undefined,
        borderRadius: "16px",
        boxShadow: isCenter
          ? "0 20px 50px rgba(0, 0, 0, 0.28), 0 8px 24px rgba(0, 0, 0, 0.12)"
          : "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08)",
        border: `1px solid ${style.headerBorder}`,
        marginBottom: isCenter ? 0 : "0.75rem",
        overflow: "hidden",
        animation: isCenter
          ? "hrs-center-alert-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
          : "hrs-toast-slideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        background: "#fff",
      }}
    >
      <div
        className="hrs-toast-header d-flex align-items-center"
        style={{
          padding: isCenter ? "1rem 1.5rem" : "0.75rem 1.25rem",
          background: style.headerBg,
          color: "#fff",
          borderBottom: `2px solid ${style.headerBorder}`,
        }}
      >
        <div
          style={{
            width: isCenter ? "40px" : "32px",
            height: isCenter ? "40px" : "32px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "0.75rem",
            flexShrink: 0,
            background: style.iconBg,
          }}
        >
          <span style={{ fontSize: isCenter ? "1.25rem" : "1rem" }}>{TOAST_ICONS[toast.type]}</span>
        </div>
        <strong
          id={isCenter ? `hrs-alert-title-${toast.id}` : undefined}
          className="me-auto"
          style={{ fontSize: isCenter ? "1.0625rem" : "0.9375rem", fontWeight: 600 }}
        >
          {toast.title ? (
            toast.title
          ) : (
            <>
              {toast.context ? (
                <>
                  <span style={{ opacity: 0.98 }}>{toast.context}</span>
                  <span style={{ opacity: 0.8, margin: "0 0.35rem", fontWeight: 400 }}>{" · "}</span>
                </>
              ) : null}
              {TOAST_LABELS[toast.type]}
            </>
          )}
        </strong>
        {!isCenter ? (
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
        ) : null}
      </div>

      <div
        className="hrs-toast-body"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: celebrate ? (isCenter ? "1.5rem 1.75rem 1.75rem" : "1.25rem 1.25rem 1.5rem") : "1rem 1.25rem",
          minHeight: celebrate ? (isCenter ? "7rem" : "5.5rem") : undefined,
          fontSize: isCenter ? "1rem" : "0.9375rem",
          lineHeight: 1.55,
          color: "#374151",
          background: "#fff",
          textAlign: isCenter ? "center" : "left",
        }}
      >
        <ToastConfettiLayer active={celebrate} />
        <div style={{ position: "relative", zIndex: 2, whiteSpace: "pre-line" }}>{toast.message}</div>
      </div>

      {isCenter ? (
        <div
          className="hrs-center-alert-footer"
          style={{
            padding: "0 1.5rem 1.35rem",
            background: "#fff",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            className={`btn px-4 ${
              toast.type === "success"
                ? "btn-success"
                : toast.type === "warning"
                  ? "btn-warning"
                  : toast.type === "error"
                    ? "btn-danger"
                    : "btn-primary"
            }`}
            onClick={() => removeToast(toast.id)}
          >
            Entendido
          </button>
        </div>
      ) : null}
    </div>
  );
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

  const cornerToasts = currentToasts.filter((t) => !t.center);
  const centerAlerts = currentToasts.filter((t) => t.center);

  return createPortal(
    <>
      {centerAlerts.length > 0 ? (
        <div
          className="hrs-center-alert-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            background: "rgba(15, 23, 42, 0.52)",
            animation: "hrs-center-alert-fadeIn 0.25s ease-out",
          }}
          onClick={() => {
            const last = centerAlerts[centerAlerts.length - 1];
            if (last) removeToast(last.id);
          }}
        >
          {centerAlerts.slice(-1).map((toast) => (
            <ToastCard key={toast.id} toast={toast} variant="center" />
          ))}
        </div>
      ) : null}

      <div
        className="hrs-toast-container position-fixed top-0 end-0 p-3"
        style={{ zIndex: 20000 }}
      >
        {cornerToasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} variant="corner" />
        ))}
      </div>

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
        @keyframes hrs-center-alert-pop {
          from {
            transform: scale(0.88) translateY(12px);
            opacity: 0;
          }
          to {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
        @keyframes hrs-center-alert-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hrs-toast-container .hrs-toast-close:hover {
          opacity: 1 !important;
        }
        .hrs-center-alert-backdrop .hrs-center-alert-card {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </>,
    document.body
  );
}
