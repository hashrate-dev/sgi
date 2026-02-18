/** Disparar cuando se eliminan documentos emitidos (Historial). Las páginas FacturacionHosting y FacturacionEquipos escuchan para refrescar Documentos Emitidos. */
export function dispatchEmittedChanged(source: "hosting" | "asic"): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hrs-emitted-changed", { detail: { source } }));
  }
}

export type EmittedChangedDetail = { source: "hosting" | "asic" };
