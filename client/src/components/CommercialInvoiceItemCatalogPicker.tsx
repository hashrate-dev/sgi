import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommercialInvoiceCatalogEquipo } from "../lib/api";
import type { CommercialInvoiceItem } from "../lib/commercialInvoice";

export const CI_CUSTOM_KEY = "custom";

export function commercialInvoiceEquipoLabel(eq: CommercialInvoiceCatalogEquipo): string {
  return [eq.marcaEquipo, eq.modelo].filter(Boolean).join(" — ");
}

type Props = {
  item: CommercialInvoiceItem;
  equipos: CommercialInvoiceCatalogEquipo[];
  disabled?: boolean;
  onPick: (patch: Partial<CommercialInvoiceItem>) => void;
};

export function CommercialInvoiceItemCatalogPicker({
  item,
  equipos,
  disabled,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selectValue =
    item.catalogKey === CI_CUSTOM_KEY
      ? CI_CUSTOM_KEY
      : item.catalogKey?.startsWith("equipo_") && equipos.some((e) => `equipo_${e.id}` === item.catalogKey)
        ? item.catalogKey
        : equipos.find((e) => commercialInvoiceEquipoLabel(e) === item.description)
          ? `equipo_${equipos.find((e) => commercialInvoiceEquipoLabel(e) === item.description)!.id}`
          : item.description.trim()
            ? CI_CUSTOM_KEY
            : "";

  const nq = q.trim().toLowerCase();
  const equiposFiltrados = useMemo(
    () => equipos.filter((eq) => !nq || `${eq.marcaEquipo} ${eq.modelo}`.toLowerCase().includes(nq)),
    [equipos, nq]
  );

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setMenuBox(null);
      return;
    }
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const maxH = 280;
      const gap = 4;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(140, Math.min(maxH, openUp ? spaceAbove : spaceBelow));
      setMenuBox({
        left: r.left,
        width: Math.max(r.width, 280),
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
      const t = ev.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((ev.target as HTMLElement | null)?.closest?.(".ci-combo__menu")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQ("");
  }, [open]);

  const apply = (value: string) => {
    if (!value) {
      onPick({ catalogKey: "", description: "", unitPrice: 0, kind: "goods" });
      setOpen(false);
      return;
    }
    if (value === CI_CUSTOM_KEY) {
      onPick({ catalogKey: CI_CUSTOM_KEY, kind: "goods" });
      setOpen(false);
      return;
    }
    if (value.startsWith("equipo_")) {
      const eq = equipos.find((x) => `equipo_${x.id}` === value);
      if (eq) {
        onPick({
          catalogKey: value,
          kind: "goods",
          description: commercialInvoiceEquipoLabel(eq),
          unit: "un",
          unitPrice: eq.precioUSD,
          serialNumber: eq.numeroSerie || item.serialNumber || "",
        });
      }
      setOpen(false);
    }
  };

  const closedLabel = item.description.trim() || "Seleccionar equipo…";

  return (
    <div className="ci-combo" ref={wrapRef}>
      <button
        type="button"
        className="fact-input ci-combo__trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={item.description.trim() ? "" : "ci-combo__placeholder"}>{closedLabel}</span>
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
              <input
                ref={searchRef}
                className="fact-input ci-combo__search"
                placeholder="Buscar marca o modelo…"
                value={q}
                disabled={disabled}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar en catálogo"
              />
              {equiposFiltrados.map((eq) => (
                <button
                  type="button"
                  key={eq.id}
                  className={`ci-combo__opt${selectValue === `equipo_${eq.id}` ? " is-active" : ""}`}
                  onClick={() => apply(`equipo_${eq.id}`)}
                >
                  {commercialInvoiceEquipoLabel(eq)}
                </button>
              ))}
              <button
                type="button"
                className={`ci-combo__opt${selectValue === CI_CUSTOM_KEY ? " is-active" : ""}`}
                onClick={() => apply(CI_CUSTOM_KEY)}
              >
                Otro / texto libre…
              </button>
            </div>,
            document.body
          )
        : null}
      {selectValue === CI_CUSTOM_KEY ? (
        <input
          className="fact-input"
          placeholder="Descripción libre"
          value={item.description}
          disabled={disabled}
          onChange={(e) => onPick({ catalogKey: CI_CUSTOM_KEY, kind: "goods", description: e.target.value })}
        />
      ) : null}
    </div>
  );
}
