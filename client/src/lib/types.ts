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
  serviceKey: "A" | "B" | "C";
  serviceName: string;
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

