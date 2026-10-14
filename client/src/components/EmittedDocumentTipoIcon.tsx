import type { CSSProperties } from "react";
import type { EmittedDocumentTipoMark } from "../lib/invoiceCollection";

const ICON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.2rem",
  height: "1.2rem",
  flexShrink: 0,
  borderRadius: "50%",
  fontSize: "0.7rem",
  lineHeight: 1,
};

export function EmittedDocumentTipoIcon({ mark }: { mark: EmittedDocumentTipoMark }) {
  if (mark === "recent") {
    return (
      <span
        className="fact-emitted-tipo-icon fact-emitted-tipo-icon--recent"
        style={{ ...ICON_STYLE, backgroundColor: "#ff9800" }}
        title="Emitido recientemente"
      >
        🔖
      </span>
    );
  }
  if (mark === "closed") {
    return (
      <span
        className="fact-emitted-tipo-icon fact-emitted-tipo-icon--ok"
        style={{ ...ICON_STYLE, backgroundColor: "#198754", color: "#fff", fontSize: "0.75rem" }}
        title="Operación cerrada (factura + recibo o nota de crédito)"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className="fact-emitted-tipo-icon fact-emitted-tipo-icon--pending"
      style={{ ...ICON_STYLE, backgroundColor: "#f59e0b", color: "#fff", fontSize: "0.72rem" }}
      title="Operación pendiente: aún no se cerró con Recibo o Nota de Crédito"
    >
      ⏳
    </span>
  );
}
