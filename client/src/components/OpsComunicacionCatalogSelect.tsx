import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type OpsComCatalogItem = {
  id: number;
  label: string;
  isBuiltin?: boolean;
};

type Props = {
  items: OpsComCatalogItem[];
  valueId: string;
  onChange: (id: string, items: OpsComCatalogItem[]) => void;
  disabled?: boolean;
  onError?: (msg: string) => void;
  triggerId: string;
  placeholder: string;
  addLabel: string;
  newTitle: string;
  panelLabel: string;
  create: (nombre: string) => Promise<{ itemId: string; items: OpsComCatalogItem[] }>;
  update: (id: number, nombre: string) => Promise<{ items: OpsComCatalogItem[] }>;
  remove: (id: number) => Promise<{ items: OpsComCatalogItem[] }>;
};

function isFijo(item: OpsComCatalogItem): boolean {
  return Boolean(item.isBuiltin);
}

export function OpsComunicacionCatalogSelect({
  items,
  valueId,
  onChange,
  disabled,
  onError,
  triggerId,
  placeholder,
  addLabel,
  newTitle,
  panelLabel,
  create,
  update,
  remove,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nuevaRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevaValor, setNuevaValor] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const selected = items.find((t) => String(t.id) === valueId) || null;
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => t.label.toLowerCase().includes(q));
  }, [busqueda, items]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setBusqueda("");
    setModoNuevo(false);
    setNuevaValor("");
    setEditandoId(null);
    setEditValor("");
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [abierto, cerrar]);

  useEffect(() => {
    if (!abierto || modoNuevo || editandoId != null) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [abierto, modoNuevo, editandoId]);

  useEffect(() => {
    if (!modoNuevo) return;
    const t = window.setTimeout(() => nuevaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [modoNuevo]);

  useEffect(() => {
    if (editandoId == null) return;
    const t = window.setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editandoId]);

  const guardarNueva = async () => {
    const nombre = nuevaValor.trim();
    if (nombre.length < 3) return;
    setGuardando(true);
    try {
      const r = await create(nombre);
      onChange(r.itemId || valueId, r.items);
      cerrar();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async () => {
    if (editandoId == null) return;
    const nombre = editValor.trim();
    if (nombre.length < 3) return;
    setGuardando(true);
    try {
      const r = await update(editandoId, nombre);
      onChange(valueId, r.items);
      setEditandoId(null);
      setEditValor("");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo editar.");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id: number) => {
    const item = items.find((x) => x.id === id);
    if (item && isFijo(item)) {
      onError?.("Corte Programado es predefinido y no se puede eliminar.");
      return;
    }
    setGuardando(true);
    try {
      const r = await remove(id);
      const keep = r.items.some((t) => String(t.id) === valueId) ? valueId : r.items[0] ? String(r.items[0].id) : "";
      onChange(keep, r.items);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setGuardando(false);
    }
  };

  const listaBloqueada = modoNuevo || editandoId != null || guardando;

  return (
    <div className="ops-com-catalog" ref={rootRef}>
      <button
        type="button"
        id={triggerId}
        className="fact-input ops-com-catalog__trigger"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
      >
        <span className={selected ? "" : "ops-com-catalog__placeholder"}>
          {selected ? `${selected.label}${isFijo(selected) ? " · fijo" : ""}` : placeholder}
        </span>
      </button>

      {abierto && !disabled ? (
        <div className="ops-com-catalog__panel" role="dialog" aria-label={panelLabel}>
          <div className="ops-com-catalog__search">
            <input
              ref={searchRef}
              type="search"
              className="fact-input"
              placeholder="Buscar…"
              value={busqueda}
              disabled={listaBloqueada}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (modoNuevo) setModoNuevo(false);
                  else if (editandoId != null) setEditandoId(null);
                  else cerrar();
                }
              }}
            />
          </div>
          <p className="ops-com-catalog__meta">
            {busqueda.trim()
              ? `${filtradas.length} coincidencia(s) de ${items.length}`
              : `${items.length} en catálogo · buscá, agregá o editá`}
          </p>

          {modoNuevo ? (
            <div
              className="ops-com-catalog__nuevo"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !guardando) {
                  e.preventDefault();
                  void guardarNueva();
                }
              }}
            >
              <p className="ops-com-catalog__nuevo-title">{newTitle}</p>
              <input
                ref={nuevaRef}
                className="fact-input"
                maxLength={180}
                placeholder="Escribí el nombre…"
                value={nuevaValor}
                disabled={guardando}
                onChange={(e) => setNuevaValor(e.target.value)}
              />
              <div className="ops-com-catalog__actions">
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={nuevaValor.trim().length < 3 || guardando}
                  onClick={() => void guardarNueva()}
                >
                  {guardando ? "Guardando…" : "Guardar y usar"}
                </button>
                <button type="button" className="btn btn-outline-light btn-sm" disabled={guardando} onClick={() => setModoNuevo(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          <ul className="ops-com-catalog__list" role="listbox">
            {!listaBloqueada ? (
              <li>
                <button type="button" className="ops-com-catalog__item-nuevo" onClick={() => setModoNuevo(true)}>
                  <strong>+</strong>
                  <span>{addLabel}</span>
                </button>
              </li>
            ) : null}

            {!modoNuevo
              ? filtradas.map((opt) => {
                  const editing = editandoId === opt.id;
                  const fijo = isFijo(opt);
                  if (editing) {
                    return (
                      <li key={opt.id} className="ops-com-catalog__edit">
                        <input
                          ref={editRef}
                          className="fact-input"
                          maxLength={180}
                          value={editValor}
                          disabled={guardando}
                          onChange={(e) => setEditValor(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void guardarEdicion();
                            }
                            if (e.key === "Escape") setEditandoId(null);
                          }}
                        />
                        <div className="ops-com-catalog__actions">
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            disabled={editValor.trim().length < 3 || guardando}
                            onClick={() => void guardarEdicion()}
                          >
                            Guardar
                          </button>
                          <button type="button" className="btn btn-outline-light btn-sm" disabled={guardando} onClick={() => setEditandoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={opt.id} className="ops-com-catalog__row">
                      <button
                        type="button"
                        role="option"
                        aria-selected={String(opt.id) === valueId}
                        className={`ops-com-catalog__item${String(opt.id) === valueId ? " is-selected" : ""}`}
                        disabled={listaBloqueada}
                        onClick={() => {
                          onChange(String(opt.id), items);
                          cerrar();
                        }}
                      >
                        {opt.label}
                        {fijo ? " · fijo" : ""}
                      </button>
                      {fijo ? null : (
                        <>
                          <button
                            type="button"
                            className="ops-com-catalog__side"
                            disabled={listaBloqueada}
                            onClick={() => {
                              setModoNuevo(false);
                              setEditandoId(opt.id);
                              setEditValor(opt.label);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="ops-com-catalog__side ops-com-catalog__side--del"
                            disabled={listaBloqueada}
                            onClick={() => void eliminar(opt.id)}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </li>
                  );
                })
              : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
