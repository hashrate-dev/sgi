/**
 * Ítem reservado para precio "Setup" en cotización marketplace (fracción hashrate).
 * Debe coincidir con server/src/lib/marketplaceSetupHashratePrice.ts
 */
export function isSetupCompraHashrateProtected(codigo?: string | null, nombre?: string | null): boolean {
  const c = String(codigo ?? "").trim().toUpperCase();
  if (c === "S03") return true;
  return String(nombre ?? "").trim().toLowerCase().includes("setup compra hashrate");
}
