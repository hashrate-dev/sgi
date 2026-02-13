import React, { useEffect, useState } from "react";
import type { Client, ComprobanteType, LineItem } from "../lib/types";
import "../styles/invoice-preview.css";

const EMISOR = {
  nombre: "HRS GROUP S.A",
  direccion: "Juan de Salazar 1857",
  ciudad: "Asunción - Paraguay",
  telefono: "Teléfono: (+595) 993 358 387",
  email: "sales@hashrate.space",
  ruc: "RUC EMISOR: 80144251-6",
  web: "https://hashrate.space",
};

const MESES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];

function formatFechaTexto(d: Date): string {
  const mes = MESES[d.getMonth()];
  const dia = d.getDate();
  const anio = d.getFullYear();
  return `${mes} ${dia}, ${anio}`;
}

function formatDDMMYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatUSD(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} USD`;
}

function ymToMonthYear(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${m}-${y}`;
}

interface InvoicePreviewProps {
  type: ComprobanteType;
  number: string;
  client: Client | null;
  date: Date;
  items: LineItem[];
  subtotal: number;
  discounts: number;
  total: number;
}

export function InvoicePreview({
  type,
  number,
  client,
  date,
  items,
  total,
}: InvoicePreviewProps) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    // Intentar cargar el logo
    const img = new Image();
    img.onload = () => {
      setLogoSrc("/images/LOGO-HASHRATE.png");
    };
    img.onerror = () => {
      setLogoSrc(null);
    };
    img.src = "/images/LOGO-HASHRATE.png";
  }, []);

  const tipoLabel =
    type === "Factura" ? "FACTURA CREDITO" :
    type === "Recibo" ? "RECIBO" :
    "NOTA DE CRÉDITO";

  const vencimiento = new Date(date);
  vencimiento.setDate(vencimiento.getDate() + 7);

  const hasText = (s?: string) => Boolean(s && s.trim());

  // Manejar nombres con guion para dividirlos en líneas
  const getClientNameLines = (name?: string): string[] => {
    if (!hasText(name)) return [];
    const nameStr = String(name).trim();
    const hasHyphen = nameStr.includes(" - ");
    if (hasHyphen) {
      const parts = nameStr.split(" - ").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Si el nombre completo es muy largo, dividir por el guion
        return parts;
      }
    }
    return [nameStr];
  };

  const client1NameLines = getClientNameLines(client?.name);
  const client2NameLines = getClientNameLines(client?.name2);

  return (
    <div className="invoice-preview-container">
      <div className="invoice-preview">
        {/* Header con logo e información de empresa */}
        <div className="invoice-preview-header">
          {logoSrc && (
            <div className="invoice-preview-logo">
              <img src={logoSrc} alt="HRS Logo" />
            </div>
          )}
          <div className="invoice-preview-company">
            <div className="invoice-preview-company-left">
              <div className="invoice-preview-company-name">{EMISOR.nombre}</div>
              <div className="invoice-preview-company-detail">{EMISOR.direccion}</div>
              <div className="invoice-preview-company-detail">{EMISOR.ciudad}</div>
              <div className="invoice-preview-company-detail">{EMISOR.telefono}</div>
              <div className="invoice-preview-company-detail">{EMISOR.email}</div>
            </div>
            <div className="invoice-preview-company-right">
              <div className="invoice-preview-type">{tipoLabel} - {number}</div>
              <div className="invoice-preview-label">VIA CLIENTE</div>
              <div className="invoice-preview-label">FECHA</div>
              <div className="invoice-preview-value">{formatFechaTexto(date)}</div>
              <div className="invoice-preview-ruc">{EMISOR.ruc}</div>
            </div>
          </div>
        </div>

        {/* Línea separadora gris */}
        <div className="invoice-preview-separator" />

        {/* Información del cliente */}
        {client && (
          <div className="invoice-preview-client">
            <div className="invoice-preview-client-col">
              {client1NameLines.map((line, idx) => (
                <div key={idx} className="invoice-preview-client-name">{line}</div>
              ))}
              {hasText(client.phone) && (
                <div className="invoice-preview-client-detail">{client.phone}</div>
              )}
              {hasText(client.email) && (
                <div className="invoice-preview-client-detail">{client.email}</div>
              )}
              {hasText(client.address) && (
                <div className="invoice-preview-client-detail">{client.address}</div>
              )}
              {hasText(client.city) && (
                <div className="invoice-preview-client-detail">{client.city?.toUpperCase() ?? ""}</div>
              )}
            </div>
            {(hasText(client.name2) || hasText(client.phone2) || hasText(client.email2) || hasText(client.address2) || hasText(client.city2)) && (
              <div className="invoice-preview-client-col">
                {client2NameLines.map((line, idx) => (
                  <div key={idx} className="invoice-preview-client-name">{line}</div>
                ))}
                {hasText(client.phone2) && (
                  <div className="invoice-preview-client-detail">{client.phone2}</div>
                )}
                {hasText(client.email2) && (
                  <div className="invoice-preview-client-detail">{client.email2}</div>
                )}
                {hasText(client.address2) && (
                  <div className="invoice-preview-client-detail">{client.address2}</div>
                )}
                {hasText(client.city2) && (
                  <div className="invoice-preview-client-detail">{client.city2?.toUpperCase() ?? ""}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tabla de ítems */}
        {items.length > 0 && (
          <div className="invoice-preview-table-container">
            <table className="invoice-preview-table">
              <thead>
                <tr>
                  <th className="invoice-preview-th-desc">DESCRIPCION</th>
                  <th className="invoice-preview-th-precio">PRECIO</th>
                  <th className="invoice-preview-th-cant">CANTIDAD</th>
                  <th className="invoice-preview-th-total">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const lineTotalServicio = item.price * item.quantity;
                  // Determinar la descripción: priorizar Setup, luego equipos ASIC, luego servicios de Hosting
                  let desc = "";
                  if (item.setupId && item.setupNombre) {
                    // Setup
                    desc = item.setupNombre;
                  } else if (item.marcaEquipo && item.modeloEquipo && item.procesadorEquipo) {
                    // Equipo ASIC
                    const equipoDesc = `${item.marcaEquipo} - ${item.modeloEquipo} - ${item.procesadorEquipo}`;
                    desc = item.month ? `${equipoDesc} - ${ymToMonthYear(item.month)}` : equipoDesc;
                  } else if (item.serviceName) {
                    // Servicio de Hosting (compatibilidad hacia atrás)
                    desc = item.month ? `${item.serviceName} - ${ymToMonthYear(item.month)}` : item.serviceName;
                  } else {
                    // Fallback
                    desc = item.month ? `Item - ${ymToMonthYear(item.month)}` : "Item";
                  }
                  return (
                    <React.Fragment key={idx}>
                      <tr>
                        <td className="invoice-preview-td-desc">{desc.substring(0, 52)}</td>
                        <td className="invoice-preview-td-precio">{formatUSD(item.price)}</td>
                        <td className="invoice-preview-td-cant">{item.quantity}</td>
                        <td className="invoice-preview-td-total">{formatUSD(lineTotalServicio)}</td>
                      </tr>
                      {item.discount > 0 && (
                        <tr>
                          <td className="invoice-preview-td-desc">
                            {item.setupId && item.setupNombre
                              ? `Descuento ${item.setupNombre}`
                              : item.marcaEquipo && item.modeloEquipo 
                                ? `Descuento ${item.marcaEquipo} ${item.modeloEquipo}`
                                : item.serviceKey === "A" 
                                  ? "Descuento HASHRATE L7" 
                                  : item.serviceKey === "B" 
                                    ? "Descuento HASHRATE L9" 
                                    : "Descuento HASHRATE S21"}
                          </td>
                          <td className="invoice-preview-td-precio">- {formatUSD(item.discount)}</td>
                          <td className="invoice-preview-td-cant">{item.quantity}</td>
                          <td className="invoice-preview-td-total">- {formatUSD(item.discount * item.quantity)}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bloque de fechas */}
        {items.length > 0 && (
          <div className="invoice-preview-dates">
            <div className="invoice-preview-dates-header">
              <div className="invoice-preview-dates-label">FECHA DE EMISIÓN:</div>
              <div className="invoice-preview-dates-label">FECHA DE VENCIMIENTO:</div>
            </div>
            <div className="invoice-preview-dates-values">
              <div className="invoice-preview-dates-value">{formatDDMMYY(date)}</div>
              <div className="invoice-preview-dates-value">{formatDDMMYY(vencimiento)}</div>
            </div>
          </div>
        )}

        {/* Total al pie: alineado a la derecha con la tabla y fechas (187mm) */}
        {items.length > 0 && (
          <div className="invoice-preview-total-wrap">
            <div className="invoice-preview-total-box">
              <div className="invoice-preview-total-label">TOTAL</div>
              <div className="invoice-preview-total-amount">{formatUSD(total)}</div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {items.length === 0 && (
          <div className="invoice-preview-empty">
            <p>Agregá ítems para ver la vista previa de la factura</p>
          </div>
        )}
      </div>
    </div>
  );
}
