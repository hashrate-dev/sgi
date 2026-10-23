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
export type AsicPedidoMedioDinero = "banco_py" | "banco_uy" | "usdt_binance" | "usdc_binance" | "binance";

export type AsicPedidoStageState = {
  status: "done" | "skipped";
  fecha: string;
  notas: string;
  modoCobro?: AsicPedidoModoCobro;
  numeroFactura?: string;
  numeroRecibo?: string;
  numeroComprobante?: string;
  titularFactura?: string;
  numeroGarantia?: string;
  valorGarantiaUsd?: number | null;
  medioDinero?: AsicPedidoMedioDinero;
  referencia?: string;
  firmadoNombre?: string;
  firmadoClientId?: number;
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
  numeroGarantia?: string;
  valorGarantiaUsd?: number;
  medioDinero?: AsicPedidoMedioDinero;
  referencia?: string;
  firmadoNombre?: string;
  firmadoClientId?: number;
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
      return "Se emite factura crédito y el recibo de pago, o un comprobante de pago si el cliente paga antes de generar la factura. Al recibir el dinero también se suma el comprobante de garantía.";
    case "dinero":
      return "La transferencia todavía no ingresó. Cuando llegue, confirmá el medio y la etapa pasa sola al pedido.";
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
  if (medio === "usdt_binance") return "USDT en Binance";
  if (medio === "usdc_binance") return "USDC en Binance";
  return "Dólar digital por Binance";
}

export function asicPedidoStageSummary(key: AsicPedidoStageKey, state: AsicPedidoStageState): string {
  const bits: string[] = [];
  if (state.fecha) bits.push(formatAsicPedidoFecha(state.fecha));
  if (key === "contrato" && state.firmadoNombre) bits.push(state.firmadoNombre);
  if (key === "documentos" && state.modoCobro === "factura_recibo") {
    bits.push(`Factura ${state.numeroFactura || "—"}${state.titularFactura ? ` (${state.titularFactura})` : ""}`);
    bits.push(state.numeroRecibo ? `Recibo ${state.numeroRecibo}` : "Recibo pendiente");
  } else if (key === "documentos" && state.modoCobro === "comprobante_previo") {
    bits.push(`Comprobante ${state.numeroComprobante || "—"}${state.titularFactura ? ` (${state.titularFactura})` : ""}`);
  } else if (key === "dinero" && state.medioDinero) {
    bits.push(asicPedidoMedioLabel(state.medioDinero));
  } else if (state.referencia) {
    bits.push(state.referencia);
  }
  if (key === "documentos") {
    if (state.numeroGarantia) {
      const valor =
        state.valorGarantiaUsd != null && Number.isFinite(state.valorGarantiaUsd)
          ? ` ${state.valorGarantiaUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
          : "";
      bits.push(`Garantía ${state.numeroGarantia}${valor}`);
    } else {
      bits.push("Garantía pendiente");
    }
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

/** Factura crédito ya conectada, a la espera del recibo y del comprobante de garantía. */
export function asicPedidoCobroPendiente(pedido: AsicPedido): { recibo: boolean; garantia: boolean } {
  const docs = pedido.etapas.documentos;
  if (docs?.modoCobro === "comprobante_previo") return { recibo: false, garantia: false };
  const credito =
    docs?.modoCobro === "factura_recibo" ||
    (Boolean(pedido.facturaNumero) && (pedido.etapaActual === "documentos" || docs?.status === "done"));
  if (!credito) return { recibo: false, garantia: false };
  return {
    recibo: !docs?.numeroRecibo,
    garantia: !docs?.numeroGarantia,
  };
}

export function asicPedidoEtapaLabel(pedido: AsicPedido): string {
  if (pedido.etapaActual === "completo") return "Instalado en Ayolas";
  if (pedido.etapaActual === "dinero") return "Esperando la transferencia";
  return asicPedidoStageTitle(pedido.etapaActual, pedido.origen);
}

export function listAsicPedidoGarantias(): Promise<{
  garantias: Array<{ number: string; clientName: string; date: string; total: number; detalle?: string }>;
}> {
  return api("/api/asic-pedidos/garantias");
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
