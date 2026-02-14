export type ComprobanteType = "Factura" | "Recibo" | "Nota de Crédito";

export type Client = {
  id?: number | string;
  code: string;
  name: string;
  name2?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  email2?: string;
  address?: string;
  address2?: string;
  city?: string;
  city2?: string;
};

export type LineItem = {
  serviceKey?: "A" | "B" | "C" | "D"; // Para facturas de Hosting
  serviceName?: string; // Para facturas de Hosting
  // Campos para equipos ASIC:
  equipoId?: string; // ID del equipo ASIC
  marcaEquipo?: string; // Marca del equipo
  modeloEquipo?: string; // Modelo del equipo
  procesadorEquipo?: string; // Procesador del equipo
  // Campos para Setup:
  setupId?: string; // ID del Setup
  setupNombre?: string; // Nombre del Setup
  month: string; // YYYY-MM
  quantity: number;
  price: number;
  discount: number;
};

export type Invoice = {
  id: string;
  number: string; // FC1001 / RC1001 / NC1001
  type: ComprobanteType;
  clientName: string;
  /** Datos del cliente al momento de emisión (para reimprimir PDF con datos completos) */
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientCity?: string;
  clientName2?: string;
  clientPhone2?: string;
  clientEmail2?: string;
  clientAddress2?: string;
  clientCity2?: string;
  date: string;
  emissionTime?: string; // Hora de emisión (HH:MM:SS)
  dueDate?: string; // Fecha de vencimiento (fecha + 7 días)
  paymentDate?: string; // Fecha de pago (solo para recibos)
  month: string;
  subtotal: number;
  discounts: number;
  total: number;
  items: LineItem[];
  relatedInvoiceId?: string; // ID de la factura relacionada (para notas de crédito y recibos)
  relatedInvoiceNumber?: string; // Número de la factura relacionada (para notas de crédito y recibos)
};

export type EquipoASIC = {
  id: string;
  fechaIngreso: string; // Fecha de ingreso
  marcaEquipo: string; // Marca del equipo
  modelo: string; // Modelo
  procesador: string; // Procesador
  precioUSD: number; // Precio en USD
};

export type Setup = {
  id: string;
  nombre: string; // Nombre del Setup
  precioUSD: number; // Precio en USD (50 o 0)
};

