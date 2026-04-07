import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Captura errores de render en hijos y evita pantalla “vacía” (solo fondo del body).
 * El aviso “Download the React DevTools…” en consola NO es un error; ignorarlo.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="d-flex flex-column align-items-center justify-content-center min-vh-100 p-4"
          style={{
            background: "#1f2937",
            color: "#f9fafb",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 className="h4 mb-3">Algo falló al cargar la vista</h1>
          <p className="text-center mb-2" style={{ maxWidth: 520 }}>
            En la consola del navegador (F12 → pestaña <strong>Consola</strong>) buscá líneas en{" "}
            <strong style={{ color: "#fca5a5" }}>rojo</strong>. El texto sobre React DevTools no cuenta como error.
          </p>
          <pre
            className="p-3 rounded small text-start overflow-auto"
            style={{
              maxWidth: "100%",
              width: 560,
              background: "#111827",
              color: "#fecaca",
              fontSize: 12,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="btn btn-light mt-3"
            onClick={() => window.location.reload()}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
