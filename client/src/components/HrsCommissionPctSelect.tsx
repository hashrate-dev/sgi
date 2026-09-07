import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "hrs-commission-pct-custom-v1";

export const HRS_COMMISSION_PCT_DEFAULTS = [
  0.8, 1, 1.5, 1.6, 1.7, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3, 3.5, 4,
] as const;

function readStoredCustomPcts(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (typeof x === "number" ? x : Number.parseFloat(String(x))))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  } catch {
    return [];
  }
}

function writeStoredCustomPcts(pcts: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pcts));
  } catch {
    /* ignore quota / private mode */
  }
}

function formatPctLabel(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 1000) / 1000;
  const s = String(rounded);
  return `${s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}%`;
}

function parsePctInput(raw: string): number | null {
  const t = String(raw ?? "")
    .trim()
    .replace(/%/g, "")
    .replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 1000) / 1000;
}

function uniqSortedPcts(values: Iterable<number>): number[] {
  const set = new Set<number>();
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0 || v > 100) continue;
    set.add(Math.round(v * 1000) / 1000);
  }
  return [...set].sort((a, b) => a - b);
}

type Props = {
  value: number;
  onChange: (pct: number) => void;
  /** % extra (p. ej. usados en operaciones ya cargadas). */
  extraOptions?: readonly number[];
  canAdd?: boolean;
  disabled?: boolean;
  buttonId?: string;
};

export function HrsCommissionPctSelect({
  value,
  onChange,
  extraOptions = [],
  canAdd = false,
  disabled,
  buttonId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [customPcts, setCustomPcts] = useState<number[]>(() => readStoredCustomPcts());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => uniqSortedPcts([...HRS_COMMISSION_PCT_DEFAULTS, ...customPcts, ...extraOptions, value]),
    [customPcts, extraOptions, value]
  );

  useEffect(() => {
    if (!open) return;
    const onDocMouse = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setOpen(false);
        setAdding(false);
        setErr("");
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setErr("");
      }
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const saveNew = () => {
    const n = parsePctInput(draft);
    if (n == null) {
      setErr("Ingresá un % válido entre 0 y 100 (ej. 1,25).");
      return;
    }
    setCustomPcts((prev) => {
      const next = uniqSortedPcts([...prev, n]);
      writeStoredCustomPcts(next.filter((p) => !(HRS_COMMISSION_PCT_DEFAULTS as readonly number[]).includes(p)));
      return next;
    });
    onChange(n);
    setDraft("");
    setErr("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div
      className={`position-relative w-100 min-w-0 contabilidad-medio-pago-dd${disabled ? " contabilidad-medio-pago-dd--disabled" : ""}`}
      ref={wrapRef}
    >
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        className="form-select fact-select w-100 min-w-0 d-flex align-items-center gap-2 text-start contabilidad-medio-pago-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="% comisión Hashrate"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className="flex-grow-1 min-w-0 text-truncate">{formatPctLabel(value)}</span>
      </button>
      {open ? (
        <ul
          className="contabilidad-medio-pago-dd-menu shadow border rounded-3 bg-white list-unstyled mb-0 mt-1 py-1"
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 1080,
            left: 0,
            right: 0,
            maxHeight: "min(320px, 70vh)",
            overflowY: "auto",
          }}
        >
          {options.map((pct) => (
            <li key={pct} role="none">
              <button
                type="button"
                role="option"
                aria-selected={pct === value}
                className={`btn btn-light border-0 w-100 text-start d-flex align-items-center py-2 px-3 rounded-0 text-body contabilidad-medio-pago-dd-item${
                  pct === value ? " active fw-semibold" : ""
                }`}
                onClick={() => {
                  onChange(pct);
                  setOpen(false);
                  setAdding(false);
                  setErr("");
                }}
              >
                {formatPctLabel(pct)}
              </button>
            </li>
          ))}
          {canAdd ? (
            <li role="none" className={`border-top mt-1${adding ? " pt-1 px-2 pb-2" : " pt-0 px-0 pb-0"}`}>
              {err ? <div className="small text-danger mb-1 px-2">{err}</div> : null}
              {adding ? (
                <div className="d-flex align-items-center gap-1">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Ej. 1,25"
                    value={draft}
                    autoFocus
                    inputMode="decimal"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveNew();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-sm btn-success" onClick={saveNew}>
                    Agregar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                      setAdding(false);
                      setDraft("");
                      setErr("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="asic-cotizador-catalog-item-nuevo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdding(true);
                    setErr("");
                  }}
                >
                  <strong>+</strong>
                  <span>Agregar % de comisión</span>
                </button>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
