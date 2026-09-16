import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COMMERCIAL_INVOICE_SHIPPING_CARRIERS,
  patchCommercialInvoiceShipping,
  type CommercialInvoiceItem,
} from "../lib/commercialInvoice";

type Props = {
  item: CommercialInvoiceItem;
  disabled?: boolean;
  onChange: (patch: CommercialInvoiceItem) => void;
};

export function CommercialInvoiceShippingPicker({ item, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const label = `Shipping ${item.shippingCarrier || "DHL"}`;

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setMenuBox(null);
      return;
    }
    const place = () => {
      const trigger = wrapRef.current?.querySelector(".ci-combo__trigger") as HTMLElement | null;
      const r = (trigger ?? wrapRef.current)?.getBoundingClientRect();
      if (!r) return;
      const maxH = 320;
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(maxH, openUp ? spaceAbove : spaceBelow));
      setMenuBox({
        left: r.left,
        width: r.width,
        maxHeight,
        top: openUp ? r.top - gap - maxHeight : r.bottom + gap,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (wrapRef.current?.contains(ev.target as Node)) return;
      if ((ev.target as HTMLElement | null)?.closest?.(".ci-combo__menu")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="ci-combo" ref={wrapRef}>
      <button
        type="button"
        className="fact-input ci-combo__trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={label ? "" : "ci-combo__placeholder"}>{label || "Seleccionar shipping…"}</span>
        <span className="ci-combo__caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && menuBox
        ? createPortal(
            <div
              className="ci-combo__menu"
              role="listbox"
              style={{
                position: "fixed",
                top: menuBox.top,
                left: menuBox.left,
                width: menuBox.width,
                maxHeight: menuBox.maxHeight,
                zIndex: 5000,
              }}
            >
              {COMMERCIAL_INVOICE_SHIPPING_CARRIERS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`ci-combo__opt${(item.shippingCarrier || "DHL") === c ? " is-active" : ""}`}
                  onClick={() => onChange(patchCommercialInvoiceShipping(item, { shippingCarrier: c }))}
                >
                  Shipping {c}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
