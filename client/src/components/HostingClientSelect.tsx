import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/api";

export type HostingClientOption = {
  id: number;
  code: string;
  name: string;
  name2?: string;
};

type Props = {
  value: number;
  onChange: (clientId: number) => void;
  clients: HostingClientOption[];
  onClientCreated: (client: HostingClientOption) => void | Promise<void>;
  canAdd?: boolean;
  disabled?: boolean;
  buttonId?: string;
  required?: boolean;
  placeholder?: string;
};

function clientLabel(c: HostingClientOption): string {
  const name = `${c.name.trim()}${c.name2?.trim() ? ` ${c.name2.trim()}` : ""}`.trim();
  const code = c.code.trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || "—";
}

export function HostingClientSelect({
  value,
  onChange,
  clients,
  onClientCreated,
  canAdd = false,
  disabled,
  buttonId,
  required,
  placeholder = "— Seleccionar —",
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [name2, setName2] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value) ?? null;
  const label = selected ? clientLabel(selected) : placeholder;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es");
    if (!q) return clients;
    return clients.filter((c) => clientLabel(c).toLocaleLowerCase("es").includes(q));
  }, [clients, busqueda]);

  useEffect(() => {
    if (!open) return;
    const onDocMouse = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setOpen(false);
        setAdding(false);
        setErr("");
        setBusqueda("");
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setErr("");
        setBusqueda("");
      }
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const resetDraft = () => {
    setName("");
    setName2("");
    setPhone("");
    setEmail("");
    setErr("");
  };

  const saveNew = async () => {
    if (!canAdd) return;
    setErr("");
    const nombre = name.trim();
    if (!nombre) {
      setErr("Ingresá el nombre completo del cliente.");
      return;
    }
    setBusy(true);
    try {
      const r = await createClient({
        name: nombre,
        name2: name2.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });
      const created: HostingClientOption = {
        id: Number(r.client?.id ?? 0),
        code: String(r.client?.code ?? "").trim(),
        name: String(r.client?.name ?? nombre).trim(),
        name2: String(r.client?.name2 ?? "").trim(),
      };
      if (!Number.isFinite(created.id) || created.id <= 0) {
        throw new Error("No se obtuvo el ID del cliente creado.");
      }
      await onClientCreated(created);
      onChange(created.id);
      resetDraft();
      setAdding(false);
      setOpen(false);
      setBusqueda("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar el cliente.");
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
        aria-label="Cliente de hosting"
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
          <li className="px-2 pb-1" role="none">
            <input
              type="search"
              className="form-control form-control-sm"
              placeholder="Buscar cliente…"
              value={busqueda}
              disabled={busy || adding}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </li>
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-muted small" role="none">
              No hay coincidencias.
            </li>
          ) : (
            filtrados.map((c) => {
              const selectedRow = c.id === value;
              return (
                <li key={c.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedRow}
                    className={`btn btn-light border-0 w-100 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0 text-body contabilidad-proveedor-dd-item${
                      selectedRow ? " active fw-semibold" : ""
                    }`}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setAdding(false);
                      setErr("");
                      setBusqueda("");
                    }}
                  >
                    <span className="text-truncate">{clientLabel(c)}</span>
                  </button>
                </li>
              );
            })
          )}

          {canAdd ? (
            <li role="none" className="border-top mt-1 pt-1 px-2 pb-2">
              {err ? <div className="small text-danger mb-1">{err}</div> : null}
              {adding ? (
                <div className="contabilidad-proveedor-dd-add">
                  <div className="row g-2">
                    <div className="col-12">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Nombre completo / razón social *"
                        value={name}
                        disabled={busy}
                        autoFocus
                        onChange={(e) => setName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-12">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Nombre 2 (opcional)"
                        value={name2}
                        disabled={busy}
                        onChange={(e) => setName2(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Teléfono"
                        value={phone}
                        disabled={busy}
                        onChange={(e) => setPhone(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Email"
                        value={email}
                        disabled={busy}
                        onChange={(e) => setEmail(e.target.value)}
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
                          resetDraft();
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
                  + Agregar cliente de hosting
                </button>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
