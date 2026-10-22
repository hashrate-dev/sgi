import { api } from "./api";

/** Mismas claves que server/src/routes/asicPedidos.ts */
export const ASIC_PEDIDO_STAGE_KEYS = [
  "contrato",
  "documentos",
  "dinero",
  "pedido",
  "pago_proveedor",
  "envio",
  "aduana_llegada",
  "aduana_salida",
  "camino_ayolas",
  "llegada_dc",
  "instalado",
] as const;

export type AsicPedidoStageKey = (typeof ASIC_PEDIDO_STAGE_KEYS)[number];
export type AsicPedidoOrigen = "china" | "paraguay";
export type AsicPedidoModoCobro = "factura_recibo" | "comprobante_previo";
export type AsicPedidoMedioDinero = "banco_py" | "banco_uy" | "binance";

export type AsicPedidoStageState = {
  status: "done" | "skipped";
  fecha: string;
  notas: string;
  modoCobro?: AsicPedidoModoCobro;
  numeroFactura?: string;
  numeroRecibo?: string;
  numeroComprobante?: string;
  titularFactura?: string;
  medioDinero?: AsicPedidoMedioDinero;
  referencia?: string;
  montoUsd?: number | null;
};

export type AsicPedido = {
  id: number;
  cliente: string;
  clientId: number | null;
  origen: AsicPedidoOrigen;
  marca: string;
  equipo: string;
  procesador: string;
  cantidad: number;
  vendedor: string;
  tieneComision: boolean;
  comisionUsd: number | null;
  aduanaAplica: boolean;
  notas: string;
  facturaId: number | null;
  facturaNumero: string;
  facturaTitular: string;
  etapas: Partial<Record<AsicPedidoStageKey, AsicPedidoStageState>>;
  etapaActual: AsicPedidoStageKey | "completo";
  createdAt: string;
  updatedAt: string;
};

export type AsicPedidoConfirmBody = {
  fecha?: string;
  notas?: string;
  modoCobro?: AsicPedidoModoCobro;
  numeroFactura?: string;
  numeroRecibo?: string;
  numeroComprobante?: string;
  titularFactura?: string;
  medioDinero?: AsicPedidoMedioDinero;
  referencia?: string;
  montoUsd?: number;
  saltarAduana?: boolean;
};

const ADUANA = new Set<AsicPedidoStageKey>(["aduana_llegada", "aduana_salida"]);

export function asicPedidoStagesFor(pedido: Pick<AsicPedido, "aduanaAplica">): AsicPedidoStageKey[] {
  return ASIC_PEDIDO_STAGE_KEYS.filter((key) => pedido.aduanaAplica || !ADUANA.has(key));
}

export function asicPedidoStageTitle(key: AsicPedidoStageKey, origen: AsicPedidoOrigen): string {
  switch (key) {
    case "contrato":
      return "Contrato firmado";
    case "documentos":
      return "Factura o comprobante";
    case "dinero":
      return "Dinero recibido";
    case "pedido":
      return origen === "china" ? "Pedido a China" : "Pedido al proveedor de Paraguay";
    case "pago_proveedor":
      return origen === "china" ? "Pago a China" : "Pago al proveedor de Paraguay";
    case "envio":
      return origen === "china" ? "Envío desde China" : "Envío desde el proveedor de Paraguay";
    case "aduana_llegada":
      return "Llegada a aduana";
    case "aduana_salida":
      return "Salida de aduana";
    case "camino_ayolas":
      return "En camino a Ayolas";
    case "llegada_dc":
      return "Llegada al datacenter";
    case "instalado":
      return "Instalado";
  }
}

export function asicPedidoStageDetail(key: AsicPedidoStageKey): string {
  switch (key) {
    case "contrato":
      return "Momento 0. El cliente firma el contrato.";
    case "documentos":
      return "Se emite factura crédito y el recibo de pago, o un comprobante de pago si el cliente paga antes de generar la factura.";
    case "dinero":
      return "El dinero entra en el banco de Paraguay, en el banco de Uruguay, o como dólar digital por Binance.";
    case "pedido":
      return "Se hace el pedido a China o al proveedor de Paraguay, según el origen de las máquinas.";
    case "pago_proveedor":
      return "Se paga al proveedor de Paraguay o a China.";
    case "envio":
      return "Los equipos salen desde China o desde el proveedor de Paraguay.";
    case "aduana_llegada":
      return "El equipo llega a aduana.";
    case "aduana_salida":
      return "Se saca el equipo de aduana.";
    case "camino_ayolas":
      return "Se manda al datacenter de Ayolas, en Paraguay.";
    case "llegada_dc":
      return "El equipo llega al datacenter de Ayolas.";
    case "instalado":
      return "Se instala todo en el datacenter.";
  }
}

export function asicPedidoOrigenLabel(origen: AsicPedidoOrigen): string {
  return origen === "china" ? "China" : "Paraguay";
}

export function asicPedidoMedioLabel(medio: AsicPedidoMedioDinero): string {
  if (medio === "banco_py") return "Banco en Paraguay";
  if (medio === "banco_uy") return "Banco en Uruguay";
  return "Dólar digital por Binance";
}

export function asicPedidoStageSummary(key: AsicPedidoStageKey, state: AsicPedidoStageState): string {
  const bits: string[] = [];
  if (state.fecha) bits.push(formatAsicPedidoFecha(state.fecha));
  if (key === "documentos" && state.modoCobro === "factura_recibo") {
    bits.push(`Factura ${state.numeroFactura || "—"}${state.titularFactura ? ` (${state.titularFactura})` : ""}`);
    bits.push(`Recibo ${state.numeroRecibo || "—"}`);
  } else if (key === "documentos" && state.modoCobro === "comprobante_previo") {
    bits.push(`Comprobante ${state.numeroComprobante || "—"}${state.titularFactura ? ` (${state.titularFactura})` : ""}`);
  } else if (key === "dinero" && state.medioDinero) {
    bits.push(asicPedidoMedioLabel(state.medioDinero));
  } else if (state.referencia) {
    bits.push(state.referencia);
  }
  if (state.montoUsd != null && Number.isFinite(state.montoUsd)) {
    bits.push(
      `${state.montoUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
    );
  }
  return bits.join(" · ");
}

export function formatAsicPedidoFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function asicPedidoEtapaLabel(pedido: AsicPedido): string {
  if (pedido.etapaActual === "completo") return "Instalado en Ayolas";
  return asicPedidoStageTitle(pedido.etapaActual, pedido.origen);
}

export function listAsicPedidoCatalogo(): Promise<{ vendedores: string[]; contratoRefs: string[] }> {
  return api("/api/asic-pedidos/catalogo");
}

export function createAsicPedidoCatalogo(
  tipo: "vendedor" | "contrato_ref",
  nombre: string
): Promise<{ nombre: string; alreadyExists: boolean }> {
  return api("/api/asic-pedidos/catalogo", { method: "POST", body: JSON.stringify({ tipo, nombre }) });
}

export function listAsicPedidos(): Promise<{ pedidos: AsicPedido[] }> {
  return api("/api/asic-pedidos");
}

export function createAsicPedido(body: {
  cliente: string;
  clientId?: number;
  origen: AsicPedidoOrigen;
  marca: string;
  equipo: string;
  procesador: string;
  cantidad: number;
  vendedor: string;
  tieneComision: boolean;
  comisionUsd?: number;
  fechaContrato: string;
  contratoRef?: string;
  notas?: string;
  aduanaAplica?: boolean;
}): Promise<{ pedido: AsicPedido }> {
  return api("/api/asic-pedidos", { method: "POST", body: JSON.stringify(body) });
}

export function updateAsicPedido(
  id: number,
  body: Partial<Pick<AsicPedido, "cliente" | "equipo" | "cantidad" | "notas" | "aduanaAplica" | "facturaId" | "facturaNumero" | "facturaTitular">>
): Promise<{ pedido: AsicPedido }> {
  return api(`/api/asic-pedidos/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function confirmAsicPedidoStage(
  id: number,
  key: AsicPedidoStageKey,
  body: AsicPedidoConfirmBody
): Promise<{ pedido: AsicPedido }> {
  return api(`/api/asic-pedidos/${id}/etapas/${key}`, { method: "POST", body: JSON.stringify(body) });
}

export function reopenAsicPedidoStage(id: number, key: AsicPedidoStageKey): Promise<{ pedido: AsicPedido }> {
  return api(`/api/asic-pedidos/${id}/etapas/${key}/reabrir`, { method: "POST", body: "{}" });
}

export function deleteAsicPedido(id: number): Promise<{ ok: boolean }> {
  return api(`/api/asic-pedidos/${id}`, { method: "DELETE" });
}
