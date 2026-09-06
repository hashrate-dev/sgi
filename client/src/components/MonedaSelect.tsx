import { useEffect, useRef, useState } from "react";
import type { ContabilidadMoneda } from "../lib/api";
import pesosUyImg from "../assets/medio-pago/pesos-uruguayos.svg?url";
import pesosArImg from "../assets/medio-pago/pesos-argentinos.svg?url";
import gsPyImg from "../assets/medio-pago/gs-paraguay.svg?url";
import realesBrImg from "../assets/medio-pago/reales-brasil.svg?url";
import eurosUeImg from "../assets/medio-pago/euros-ue.svg?url";
import usdEfectivoUsaImg from "../assets/medio-pago/usd-efectivo-usa.svg?url";

export const MONEDA_OPTIONS: ReadonlyArray<{ value: ContabilidadMoneda; label: string; flagSrc: string; flagTitle: string }> = [
  { value: "UYU", label: "Pesos uruguayos ($)", flagSrc: pesosUyImg, flagTitle: "Uruguay" },
  { value: "USD", label: "Dólares estadounidenses (US$)", flagSrc: usdEfectivoUsaImg, flagTitle: "Estados Unidos" },
  { value: "PYG", label: "Guaraníes (Gs.)", flagSrc: gsPyImg, flagTitle: "Paraguay" },
  { value: "BRL", label: "Reales Brasil (RS)", flagSrc: realesBrImg, flagTitle: "Brasil" },
  { value: "ARS", label: "Pesos argentinos ($)", flagSrc: pesosArImg, flagTitle: "Argentina" },
  { value: "EUR", label: "Euros (€)", flagSrc: eurosUeImg, flagTitle: "Unión Europea" },
];

type Props = {
  value: ContabilidadMoneda;
  onChange: (v: ContabilidadMoneda) => void;
  disabled?: boolean;
  buttonId?: string;
};

function MonedaFlag({ src, title }: { src: string; title: string }) {
  return (
    <img
      src={src}
      width={20}
      height={20}
      alt=""
      title={title}
      draggable={false}
      className="contabilidad-medio-pago-country-flag flex-shrink-0"
      aria-hidden
    />
  );
}

export function MonedaSelect({ value, onChange, disabled, buttonId }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = MONEDA_OPTIONS.find((o) => o.value === value) ?? MONEDA_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const onDocMouse = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`position-relative w-100 min-w-0 contabilidad-medio-pago-dd${disabled ? " contabilidad-medio-pago-dd--disabled" : ""}`}
      ref={wrapRef}
    >
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        className="form-select w-100 min-w-0 d-flex align-items-center gap-2 text-start contabilidad-medio-pago-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Moneda"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className="flex-grow-1 min-w-0 text-truncate">{selected.label}</span>
        <MonedaFlag src={selected.flagSrc} title={selected.flagTitle} />
      </button>
      {open ? (
        <ul
          className="contabilidad-medio-pago-dd-menu shadow border rounded-3 bg-white list-unstyled mb-0 mt-1 py-1"
          role="listbox"
          aria-activedescendant={value}
          style={{
            position: "absolute",
            zIndex: 1080,
            left: 0,
            right: 0,
            maxHeight: "min(380px, 75vh)",
            overflowY: "auto",
          }}
        >
          {MONEDA_OPTIONS.map((o) => (
            <li key={o.value} role="none" className="contabilidad-medio-pago-dd-row">
              <div
                className={`contabilidad-medio-pago-dd-row-inner${
                  o.value === value ? " contabilidad-medio-pago-dd-row-inner--active" : ""
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`btn btn-light border-0 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0 text-body contabilidad-medio-pago-dd-item${
                    o.value === value ? " active fw-semibold" : ""
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex-grow-1 min-w-0 text-truncate">{o.label}</span>
                </button>
                <span className="contabilidad-medio-pago-dd-flag-slot">
                  <MonedaFlag src={o.flagSrc} title={o.flagTitle} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
