import { Fragment, useEffect, useMemo, useState } from "react";
import type { Client, ComprobanteType, LineItem } from "../lib/types";
import { formatUSD } from "../lib/formatCurrency";
import {
  collapseLegacyReciboSettlementItemsForPdf,
  getReceiptSettlementRowKind,
  reciboIsPaymentLineSettledTable,
} from "../lib/receiptSettlementLine";
import { recibimosMontoEnDosLineas } from "../lib/numberToWords";
import { invoiceClientDisplayNames, hasSecondaryClientColumn } from "../lib/clientInvoiceDisplay";
import { alignLineItemDiscountsForDisplay } from "../lib/invoiceDiscountDisplay";
import { getLineItemDescription, getLineItemDiscountDescription } from "../lib/invoiceLineItemDescription";
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

interface InvoicePreviewProps {
  type: ComprobanteType;
  number: string;
  client: Client | null;
  date: Date;
  items: LineItem[];
  subtotal: number;
  discounts: number;
  total: number;
  /** Días para fecha de vencimiento (5, 6 o 7). Por defecto 6. */
  dueDateDays?: number;
  /** Para Nota de Crédito: número de factura relacionada (referencia). */
  relatedInvoiceNumber?: string;
  /** Para Nota de Crédito: tipo de anulación respecto de la referencia. */
  creditNoteMode?: "partial" | "total";
  /** Recibo: bloque de concepto (pago sobre factura + NC / recibos previos). */
  reciboConceptText?: string;
}

export function InvoicePreview({
  type,
  number,
  client,
  date,
  items,
  discounts,
  total,
  dueDateDays = 6,
  relatedInvoiceNumber,
  creditNoteMode,
  reciboConceptText,
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
    type === "Recibo Devolución" ? "RECIBO DEVOLUCIÓN" :
    "NOTA DE CRÉDITO";

  const vencimiento = new Date(date);
  vencimiento.setDate(vencimiento.getDate() + dueDateDays);

  const hasText = (s?: string) => Boolean(s && s.trim());

  const displayItems = useMemo(() => {
    const collapsed = collapseLegacyReciboSettlementItemsForPdf(type, items, relatedInvoiceNumber);
    return alignLineItemDiscountsForDisplay(collapsed, discounts);
  }, [type, items, relatedInvoiceNumber, discounts]);
  const showReciboConceptBlock = type === "Recibo" && hasText(reciboConceptText) && !reciboIsPaymentLineSettledTable(displayItems);

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

  const clientNames = client
    ? invoiceClientDisplayNames(
        client.name,
        client.name2,
        client.phone2,
        client.email2,
        client.address2,
        client.city2
      )
    : { name1: "", name2: "" };
  const client1NameLines = getClientNameLines(clientNames.name1);
  const client2NameLines = getClientNameLines(clientNames.name2);

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
            {hasSecondaryClientColumn(
              client.name,
              client.name2,
              client.phone2,
              client.email2,
              client.address2,
              client.city2
            ) && (
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

        {showReciboConceptBlock && (
          <div className="invoice-preview-recibo-concept">{String(reciboConceptText).trim()}</div>
        )}

        {/* Tabla de ítems */}
        {displayItems.length > 0 && (
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
                {displayItems.map((item, idx) => {
                  const settlementKind = getReceiptSettlementRowKind(item);
                  const desc = getLineItemDescription(item);

                  if (settlementKind === "credit_note" || settlementKind === "prior_receipt") {
                    const amt = item.discount * item.quantity;
                    return (
                      <tr key={idx}>
                        <td className="invoice-preview-td-desc">{desc}</td>
                        <td className="invoice-preview-td-precio">—</td>
                        <td className="invoice-preview-td-cant">{item.quantity}</td>
                        <td className="invoice-preview-td-total">- {formatUSD(amt)}</td>
                      </tr>
                    );
                  }

                  const unitDiscount = Number(item.discount) || 0;
                  const lineTotalServicio = item.price * item.quantity;
                  const showDiscountRow = unitDiscount > 0 && settlementKind == null;

                  return (
                    <Fragment key={idx}>
                      <tr>
                        <td className="invoice-preview-td-desc">{desc}</td>
                        <td className="invoice-preview-td-precio">{formatUSD(item.price)}</td>
                        <td className="invoice-preview-td-cant">{item.quantity}</td>
                        <td className="invoice-preview-td-total">{formatUSD(lineTotalServicio)}</td>
                      </tr>
                      {showDiscountRow ? (
                        <tr>
                          <td className="invoice-preview-td-desc">{getLineItemDiscountDescription(item)}</td>
                          <td className="invoice-preview-td-precio">- {formatUSD(unitDiscount)}</td>
                          <td className="invoice-preview-td-cant">{item.quantity}</td>
                          <td className="invoice-preview-td-total">- {formatUSD(unitDiscount * item.quantity)}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Recibo / Recibo Devolución: "Recibimos la cantidad de..." o "Se devuelve la cantidad de..." */}
        {displayItems.length > 0 && (type === "Recibo" || type === "Recibo Devolución") && (() => {
          const { line1, line2 } = recibimosMontoEnDosLineas(total, type);
          const notaGuarani = "El monto que se devuelve puede ser distinto al monto contable, debido a que se ajusta por el valor del Guaraní a la fecha.";
          return (
            <div className="invoice-preview-recibimos-block">
              {type === "Recibo Devolución" ? (
                <div className="invoice-preview-recibimos-texto-seguido">
                  {line1} {line2} {notaGuarani}
                </div>
              ) : (
                <>
                  <div className="invoice-preview-recibimos-line1">{line1}</div>
                  <div className="invoice-preview-recibimos-line2">{line2}</div>
                </>
              )}
            </div>
          );
        })()}
        {displayItems.length > 0 && type !== "Recibo" && type !== "Recibo Devolución" && (
          <div className="invoice-preview-dates-wrap">
            {type === "Nota de Crédito" && relatedInvoiceNumber && (
              <div className="invoice-preview-credit-note-ref">
                {`Anulación ${creditNoteMode === "partial" ? "Parcial" : "Total"} Factura N° ${relatedInvoiceNumber}`}
              </div>
            )}
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
          </div>
        )}

        {/* Total al pie: alineado a la derecha con la tabla y fechas (187mm) */}
        {items.length > 0 && (
          <div className="invoice-preview-total-wrap">
            <div className="invoice-preview-total-box">
              <div className="invoice-preview-total-label">TOTAL</div>
              <div className="invoice-preview-total-amount">
                {formatUSD(Math.abs(total))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {displayItems.length === 0 && (
          <div className="invoice-preview-empty">
            <p>Agregá ítems para ver la vista previa de la factura</p>
          </div>
        )}
      </div>
    </div>
  );
}
