import { useEffect, useRef, useState } from "react";
import { createProveedorHrs, type ProveedorHrs, type ProveedorHrsPayload } from "../lib/api";

const EMPTY_NUEVO: ProveedorHrsPayload = {
  supplierName: "",
  country: "",
  ruc: "",
  rubro: "",
  contactFirstName: "",
  contactLastName: "",
};

type Props = {
  value: string;
  onChange: (proveedorIdStr: string) => void;
  proveedores: ProveedorHrs[];
  onProveedorCreated: (item: ProveedorHrs) => void | Promise<void>;
  canAdd?: boolean;
  disabled?: boolean;
  buttonId?: string;
  required?: boolean;
};

export function ProveedorHrsSelect({
  value,
  onChange,
  proveedores,
  onProveedorCreated,
  canAdd = false,
  disabled,
  buttonId,
  required,
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ProveedorHrsPayload>(EMPTY_NUEVO);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = proveedores.find((p) => String(p.id) === value) ?? null;
  const label = selected
    ? `${selected.supplierNumber} — ${selected.supplierName}`
    : required && !value
      ? "— Seleccionar —"
      : "— Seleccionar —";

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

  const saveNew = async () => {
    if (!canAdd) return;
    setErr("");
    const supplierName = draft.supplierName.trim();
    const country = draft.country.trim();
    const ruc = draft.ruc.trim();
    const rubro = draft.rubro.trim();
    const contactFirstName = draft.contactFirstName.trim();
    const contactLastName = draft.contactLastName.trim();
    if (!supplierName) {
      setErr("Ingresá el nombre del proveedor.");
      return;
    }
    if (!country) {
      setErr("Ingresá el país del proveedor.");
      return;
    }
    if (!ruc) {
      setErr("Ingresá el RUC.");
      return;
    }
    if (!rubro) {
      setErr("Ingresá el rubro del proveedor.");
      return;
    }
    if (!contactFirstName || !contactLastName) {
      setErr("Ingresá nombre y apellido de la persona responsable.");
      return;
    }

    setBusy(true);
    try {
      const r = await createProveedorHrs({
        supplierName,
        country,
        ruc,
        rubro,
        contactFirstName,
        contactLastName,
      });
      await onProveedorCreated(r.item);
      onChange(String(r.item.id));
      setDraft(EMPTY_NUEVO);
      setAdding(false);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el proveedor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`position-relative w-100 min-w-0 contabilidad-proveedor-dd${disabled ? " contabilidad-proveedor-dd--disabled" : ""}`}
      ref={wrapRef}
    >
      <button
        id={buttonId}
        type="button"
        disabled={disabled}
        className="form-select w-100 min-w-0 d-flex align-items-center gap-2 text-start contabilidad-proveedor-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Nº proveedor"
        aria-required={required || undefined}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className={`flex-grow-1 min-w-0 text-truncate${selected ? "" : " text-secondary"}`}>{label}</span>
      </button>
      {open ? (
        <ul
          className="contabilidad-proveedor-dd-menu shadow border rounded-3 bg-white list-unstyled mb-0 mt-1 py-1"
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 1080,
            left: 0,
            right: 0,
            maxHeight: "min(380px, 75vh)",
            overflowY: "auto",
          }}
        >
          {proveedores.map((p) => {
            const idStr = String(p.id);
            const selectedRow = idStr === value;
            return (
              <li key={p.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedRow}
                  className={`btn btn-light border-0 w-100 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0 text-body contabilidad-proveedor-dd-item${
                    selectedRow ? " active fw-semibold" : ""
                  }`}
                  onClick={() => {
                    onChange(idStr);
                    setOpen(false);
                    setAdding(false);
                    setErr("");
                  }}
                >
                  <span className="text-truncate">
                    {p.supplierNumber} — {p.supplierName}
                  </span>
                </button>
              </li>
            );
          })}

          {canAdd ? (
            <li role="none" className="border-top mt-1 pt-1 px-2 pb-2">
              {err ? <div className="small text-danger mb-1">{err}</div> : null}
              {adding ? (
                <div className="contabilidad-proveedor-dd-add">
                  <div className="row g-2">
                    <div className="col-12">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Nombre del proveedor *"
                        value={draft.supplierName}
                        disabled={busy}
                        autoFocus
                        onChange={(e) => setDraft((d) => ({ ...d, supplierName: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="País *"
                        value={draft.country}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="RUC *"
                        value={draft.ruc}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, ruc: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-12">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Rubro *"
                        value={draft.rubro}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, rubro: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Nombre responsable *"
                        value={draft.contactFirstName}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, contactFirstName: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Apellido responsable *"
                        value={draft.contactLastName}
                        disabled={busy}
                        onChange={(e) => setDraft((d) => ({ ...d, contactLastName: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-12 d-flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void saveNew();
                        }}
                      >
                        {busy ? "Guardando…" : "Agregar"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdding(false);
                          setDraft(EMPTY_NUEVO);
                          setErr("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary w-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setErr("");
                    setAdding(true);
                  }}
                >
                  + Agregar nuevo proveedor
                </button>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
