/**
 * Hook al arranque del servidor: antes insertaba fichas vitrina S21/L9 si faltaban.
 * Hoy no hay seed automático — el catálogo sale solo de `equipos_asic` (BD / altas manuales).
 */
export async function runSeedVitrinaEquipos(): Promise<void> {}
