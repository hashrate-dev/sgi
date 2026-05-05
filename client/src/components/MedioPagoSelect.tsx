import { useEffect, useRef, useState } from "react";
import { CONTABILIDAD_MEDIOS_PAGO, type ContabilidadMedioPago } from "../lib/api";
import usdContadoImg from "../assets/medio-pago/usd-contado.png?url";

const ICON_BOX = "0 0 24 24";

/** Llama Banco Santander (trazo tomado del logotipo público en Wikimedia Commons), incrustado para evitar ruta externa rota */
const SANTANDER_FLAME_PATH =
  "M 31.5,19.5 C 31.4,18 31,16.5 30.2,15.2 L 23.4,3.3 C 22.9,2.4 22.5,1.4 22.3,0.4 L 22,0.9 c -1.7,2.9 -1.7,6.6 0,9.5 l 5.5,9.5 c 1.7,2.9 1.7,6.6 0,9.5 l -0.3,0.5 c -0.2,-1 -0.6,-2 -1.1,-2.9 l -5,-8.7 -3.2,-5.6 C 17.4,11.8 17,10.8 16.8,9.8 l -0.3,0.5 c -1.7,2.9 -1.7,6.5 0,9.5 v 0 l 5.5,9.5 c 1.7,2.9 1.7,6.6 0,9.5 l -0.3,0.5 c -0.2,-1 -0.6,-2 -1.1,-2.9 L 13.7,24.5 C 12.8,22.9 12.4,21.1 12.4,19.3 5.1,21.2 0,25.3 0,30 0,36.6 9.8,41.9 21.9,41.9 34,41.9 43.8,36.6 43.8,30 43.9,25.5 38.9,21.4 31.5,19.5 Z";

/** Icono discreto (~22px); marcas reconocibles en versión geométrica simplificada. */
export function MedioPagoIcon({ code }: { code: string }) {
  switch (code) {
    case "USD BANCO SANTANDER UY":
      return (
        <svg
          viewBox="-0.5 -0.5 44.5 43"
          width={22}
          height={22}
          aria-hidden
          className="contabilidad-medio-pago-ico flex-shrink-0"
        >
          <path fill="#EA1D25" d={SANTANDER_FLAME_PATH} />
        </svg>
      );
    case "USD BANCO INTERFISA":
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0">
          <rect x="3" y="5" width="18" height="14" rx="2.8" fill="#006848" />
          <path fill="#fff" d="M6.5 8.5h2.8v7H6.5zm4.35 0H18v1.85h-7.15v1.65H17v1.85h-7.8v3.65h-2.85V8.5z" opacity=".92" />
        </svg>
      );
    case "USDT BINANCE":
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0">
          <polygon fill="#F0B90B" points="12,2.2 21.8,12 12,21.8 2.2,12" />
          <polygon fill="#1E2329" opacity=".08" points="12,5.8 17.9,11.95 15.95,13.95 12,9.9 8.05,13.95 6.1,11.95" />
          <circle cx="12" cy="12.95" r="5.1" fill="#26a17a" stroke="#fff" strokeWidth=".42" />
          <text x="11.92" y="15.68" fill="#fff" fontSize="7.6" fontWeight="800" textAnchor="middle" fontFamily="system-ui,sans-serif">
            ₮
          </text>
        </svg>
      );
    case "USDC BINANCE":
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0">
          <polygon fill="#F0B90B" points="12,2.2 21.8,12 12,21.8 2.2,12" />
          <polygon fill="#1E2329" opacity=".08" points="12,5.8 17.9,11.95 15.95,13.95 12,9.9 8.05,13.95 6.1,11.95" />
          <circle cx="12" cy="12.95" r="5.1" fill="#2775ca" stroke="#fff" strokeWidth=".42" />
          <text x="11.92" y="15.76" fill="#fff" fontSize="8.25" fontWeight="800" textAnchor="middle" fontFamily="system-ui,sans-serif">
            $
          </text>
        </svg>
      );
    case "USD CONTADO":
      return (
        <img
          src={usdContadoImg}
          width={22}
          height={22}
          alt=""
          draggable={false}
          className="contabilidad-medio-pago-ico-img flex-shrink-0"
        />
      );
    case "PESOS URUGUAYOS CONTADO":
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0">
          <rect x="2.5" y="3.5" width="19" height="17" rx="3.2" fill="#009fe3" />
          <rect x="2.5" y="11.95" width="19" height="2.95" rx="0" fill="#fff" />
          <circle cx="12.5" cy="12.5" r="3.95" fill="#fcd116" stroke="#0038a8" strokeWidth=".42" />
          <path fill="#111" opacity=".85" d="M12.5 14.7c-.9 0-1.62-.73-1.62-1.62v-1.9c0-.9.73-1.62 1.62-1.62s1.62.73 1.62 1.62v1.9c0 .9-.73 1.62-1.62 1.62zm-.9-6.12h2.92v-.75h-.9v-.65h-.5v-.55h-.5v-.47h-.5v-.94h-.5v-.52h-.5v-.43h-.5v-.37h-.5v-.38h-.9v-.1z" />
        </svg>
      );
    case "GS CONTADO":
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0">
          <rect x="2.8" y="4" width="18.4" height="16" rx="3" fill="#0038a8" />
          <rect x="2.8" y="4" width="18.4" height="4.5" rx="3" fill="#fff" />
          <rect x="2.8" y="15.05" width="18.4" height="5" rx="3" fill="#d52b1e" />
          <rect x="2.8" y="8.95" width="18.4" height="7.2" fill="#eee" opacity=".94" rx="2" ry="2" />
          <text x="12" y="14.95" fontSize="7.2" fontWeight="700" textAnchor="middle" fill="#1a1a1a" fontFamily="system-ui,sans-serif">
            Gs
          </text>
        </svg>
      );
    default:
      return (
        <svg viewBox={ICON_BOX} width={22} height={22} aria-hidden className="contabilidad-medio-pago-ico flex-shrink-0 opacity-45">
          <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".35" />
        </svg>
      );
  }
}

type Props = {
  value: ContabilidadMedioPago;
  onChange: (v: ContabilidadMedioPago) => void;
  disabled?: boolean;
  buttonId?: string;
};

export function MedioPagoSelect({ value, onChange, disabled, buttonId }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
        aria-label="Medio de pago"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <MedioPagoIcon code={value} />
        <span className="flex-grow-1 min-w-0 text-truncate">{value}</span>
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
            maxHeight: "min(340px, 70vh)",
            overflowY: "auto",
          }}
        >
          {CONTABILIDAD_MEDIOS_PAGO.map((v) => (
            <li key={v} role="none">
              <button
                type="button"
                role="option"
                aria-selected={v === value}
                className={`btn btn-light border-0 w-100 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0 text-body contabilidad-medio-pago-dd-item${
                  v === value ? " active fw-semibold" : ""
                }`}
                onClick={() => {
                  onChange(v);
                  setOpen(false);
                }}
              >
                <MedioPagoIcon code={v} />
                <span className="text-truncate">{v}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
