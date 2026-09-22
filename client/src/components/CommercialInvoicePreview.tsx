import {
  COMMERCIAL_INVOICE_DECLARATION_EN,
  COMMERCIAL_INVOICE_DECLARATION_ES,
  commercialInvoiceDateLong,
  commercialInvoiceLineAmount,
  commercialInvoiceMoney,
  commercialInvoicePartyTitle,
  commercialInvoiceRecipientRows,
  commercialInvoiceSenderRows,
  commercialInvoiceSerialLabel,
  commercialInvoiceTotals,
  commercialInvoiceUsdInWords,
  type CommercialInvoiceFields,
} from "../lib/commercialInvoice";

export function CommercialInvoicePreview({
  fields,
  number,
}: {
  fields: CommercialInvoiceFields;
  number: string;
}) {
  const { total } = commercialInvoiceTotals(fields.items, 0);
  const visibleItems = fields.items.filter((it) => it.description.trim() || it.unitPrice);

  return (
    <article className="ci-paper" aria-label="Vista previa Commercial Invoice">
      <header className={`ci-paper__brand${fields.showHashrateLogo ? " ci-paper__brand--logo" : ""}`}>
        {fields.showHashrateLogo ? (
          <img className="ci-paper__logo" src="/images/LOGO-HASHRATE.png" alt="Hashrate" />
        ) : null}
        <h1 className="ci-paper__title">COMMERCIAL INVOICE / FACTURA COMERCIAL</h1>
      </header>
      <div className="ci-paper__title-rule" />

      <table className="ci-paper__meta">
        <tbody>
          <tr>
            <td>
              <div className="ci-paper__meta-k">Date / Fecha:</div>
              <div className="ci-paper__meta-v">{commercialInvoiceDateLong(fields.invoiceDate)}</div>
            </td>
            <td>
              <div className="ci-paper__meta-k">Invoice Number / Número de Factura:</div>
              <div className="ci-paper__meta-v">{number}</div>
            </td>
            <td>
              <div className="ci-paper__meta-k">Status of Goods / Estado:</div>
              <div className="ci-paper__meta-v">{fields.goodsStatus.trim() || "—"}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="ci-paper__parties">
        <section className="ci-paper__party">
          <h3 className="ci-paper__party-head">{commercialInvoicePartyTitle("sender", fields.originCountry || fields.sellerCountry)}</h3>
          <dl className="ci-paper__party-body">
            {commercialInvoiceSenderRows(fields).map(([label, value]) => (
              <div key={label} className="ci-paper__kv">
                <dt>{label}:</dt>
                <dd>{value.trim() || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="ci-paper__party">
          <h3 className="ci-paper__party-head">{commercialInvoicePartyTitle("recipient", fields.destinationCountry || fields.buyerCountry)}</h3>
          <dl className="ci-paper__party-body">
            {commercialInvoiceRecipientRows(fields).map(([label, value]) => (
              <div key={label} className="ci-paper__kv">
                <dt>{label}:</dt>
                <dd>{value.trim() || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="ci-paper__box">
        <h3 className="ci-paper__box-head">3. DESCRIPTION OF GOODS / DESCRIPCIÓN DE LAS MERCANCÍAS</h3>
        <table className="ci-paper__goods">
          <thead>
            <tr>
              <th>Full Description of Goods / Descripción Detallada</th>
              <th className="ci-c">
                Qty /
                <br />
                Cant
              </th>
              <th className="ci-r">Unit Price (USD)</th>
              <th className="ci-r">Total (USD)</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="ci-paper__empty-row">
                  Agregá ítems para verlos en el documento
                </td>
              </tr>
            ) : (
              visibleItems.map((it, i) => (
                <tr key={i}>
                  <td className="ci-paper__desc">
                    <div>{it.description || "—"}</div>
                    {commercialInvoiceSerialLabel(it) ? <div className="ci-paper__sn">{commercialInvoiceSerialLabel(it)}</div> : null}
                  </td>
                  <td className="ci-c">{it.quantity}</td>
                  <td className="ci-r">{commercialInvoiceMoney(it.unitPrice)}</td>
                  <td className="ci-r">{commercialInvoiceMoney(commercialInvoiceLineAmount(it))}</td>
                </tr>
              ))
            )}
            <tr className="ci-paper__goods-total">
              <td colSpan={3} className="ci-r">
                TOTAL:
              </td>
              <td className="ci-r">{commercialInvoiceMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <p className="ci-paper__value">
        <strong>TOTAL VALUE / VALOR TOTAL: {commercialInvoiceMoney(total)}</strong>
        {" "}
        ({commercialInvoiceUsdInWords(total)})
      </p>

      <section className="ci-paper__box">
        <h3 className="ci-paper__box-head">4. SHIPPING &amp; DECLARATION / ENVÍO Y DECLARACIÓN</h3>
        <dl className="ci-paper__ship">
          <div>
            <dt>Terms of Delivery / Incoterms:</dt>
            <dd>{fields.incoterms.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Purpose of Shipment / Propósito del envío:</dt>
            <dd>{fields.shipmentPurpose.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Country of Origin / País de origen:</dt>
            <dd>{fields.goodsOriginCountry.trim() || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="ci-paper__box">
        <h3 className="ci-paper__box-head">5. DECLARATION STATEMENT / DECLARACIÓN JURADA</h3>
        <div className="ci-paper__decl">
          <p>{COMMERCIAL_INVOICE_DECLARATION_EN}</p>
          <p>{COMMERCIAL_INVOICE_DECLARATION_ES}</p>
          <div className="ci-paper__sign">
            <div className="ci-paper__sign-line" />
            <div>Sender&apos;s Signature / Firma del Expedidor</div>
          </div>
        </div>
      </section>
    </article>
  );
}
