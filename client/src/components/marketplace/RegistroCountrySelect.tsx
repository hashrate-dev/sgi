import { useEffect, useId, useRef, useState } from "react";
import type { CountryRegistro } from "../../lib/marketplaceRegistroGeo";
import {
  countryById,
  countryFlagImgUrl,
  formatRegistroCountryDialLabel,
} from "../../lib/marketplaceRegistroGeo";

type RegistroCountrySelectProps = {
  id: string;
  value: string;
  onChange: (countryId: string) => void;
  countries: CountryRegistro[];
  placeholder?: string;
  /** Si false, no muestra opción vacía (p. ej. prefijo telefónico siempre tiene valor). */
  allowEmpty?: boolean;
  required?: boolean;
  className?: string;
  "aria-label": string;
};

/** Select de país con bandera (imagen); los `<select>` nativos en Windows no muestran emoji de bandera. */
export function RegistroCountrySelect({
  id,
  value,
  onChange,
  countries,
  placeholder = "",
  allowEmpty = true,
  required,
  className = "",
  "aria-label": ariaLabel,
}: RegistroCountrySelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = countryById(value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(countryId: string) {
    onChange(countryId);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`market-registro-country-select ${open ? "is-open" : ""} ${className}`.trim()}
    >
      <input
        type="text"
        className="market-registro-country-select__validator"
        value={value}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        readOnly
        onChange={() => {}}
      />
      <button
        type="button"
        id={id}
        className="market-registro-country-select__trigger form-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <span className="market-registro-country-select__value">
            <img
              className="market-registro-country-select__flag"
              src={countryFlagImgUrl(selected.id)}
              alt=""
              width={20}
              height={15}
              loading="lazy"
              decoding="async"
            />
            <span className="market-registro-country-select__text">
              {formatRegistroCountryDialLabel(selected, { withEmoji: false })}
            </span>
          </span>
        ) : allowEmpty ? (
          <span className="market-registro-country-select__placeholder">{placeholder}</span>
        ) : null}
      </button>
      {open ? (
        <ul id={listId} className="market-registro-country-select__menu" role="listbox">
          {allowEmpty ? (
            <li role="presentation">
              <button
                type="button"
                className="market-registro-country-select__option"
                role="option"
                aria-selected={value === ""}
                onClick={() => pick("")}
              >
                <span className="market-registro-country-select__text">{placeholder}</span>
              </button>
            </li>
          ) : null}
          {countries.map((c) => (
            <li key={c.id} role="presentation">
              <button
                type="button"
                className="market-registro-country-select__option"
                role="option"
                aria-selected={value === c.id}
                onClick={() => pick(c.id)}
              >
                <img
                  className="market-registro-country-select__flag"
                  src={countryFlagImgUrl(c.id)}
                  alt=""
                  width={20}
                  height={15}
                  loading="lazy"
                  decoding="async"
                />
                <span className="market-registro-country-select__text">
                  {formatRegistroCountryDialLabel(c, { withEmoji: false })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
