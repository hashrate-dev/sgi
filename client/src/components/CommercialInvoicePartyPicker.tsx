import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CommercialInvoicePartyOption = {
  id: number;
  userCode: string;
  name: string;
};

type Props = {
  parties: CommercialInvoicePartyOption[];
  selectedId: number | null;
  name: string;
  disabled?: boolean;
  placeholder?: string;
  onPick: (party: CommercialInvoicePartyOption) => void;
  onAddNew: () => void;
  onNameChange: (name: string) => void;
};

export function CommercialInvoicePartyPicker({
  parties,
  selectedId,
  name,
  disabled,
  placeholder = "Name / Nombre",
  onPick,
  onAddNew,
  onNameChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const selected = parties.find((p) => p.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return parties;
    return parties.filter((p) => `${p.userCode} ${p.name}`.toLowerCase().includes(nq));
  }, [parties, q]);

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
      if (wrapRef.current?.contains(ev.target as Node)) return;
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

  const toggle = () => {
    if (!disabled) setOpen((v) => !v);
  };

  return (
    <div className="ci-combo" ref={wrapRef}>
      {selected ? (
        <button type="button" className="fact-input ci-combo__trigger" disabled={disabled} onClick={toggle} aria-expanded={open}>
          <span>
            {selected.userCode} — {selected.name}
          </span>
          <span className="ci-combo__caret" aria-hidden>
            {open ? "▴" : "▾"}
          </span>
        </button>
      ) : (
        <div className="ci-combo__field">
          <input
            ref={nameRef}
            className="fact-input ci-combo__trigger"
            placeholder={placeholder}
            value={name}
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <button type="button" className="ci-combo__caret-btn" disabled={disabled} onClick={toggle} aria-label="Ver usuarios" tabIndex={-1}>
            {open ? "▴" : "▾"}
          </button>
        </div>
      )}
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
                placeholder="Buscar usuario…"
                value={q}
                disabled={disabled}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar usuario"
              />
              <button
                type="button"
                className="ci-combo__opt ci-combo__opt--action"
                disabled={disabled}
                onClick={() => {
                  onAddNew();
                  setOpen(false);
                  window.setTimeout(() => nameRef.current?.focus(), 0);
                }}
              >
                + Agregar nuevo
              </button>
              {filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`ci-combo__opt${selectedId === p.id ? " is-active" : ""}`}
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                >
                  {p.userCode} — {p.name}
                </button>
              ))}
              {filtered.length === 0 ? (
                <div className="ci-combo__opt" style={{ opacity: 0.6 }}>
                  No hay usuarios que coincidan
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
