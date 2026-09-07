import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAsicCotizadorCatalogo,
  getAsicCotizadorCatalogo,
  updateAsicCotizadorCatalogo,
  type AsicCotizadorCatalogTipo,
} from "../lib/api";

const MAX_VALOR_LEN = 120;

type CatalogOpt = { id: number | null; valor: string };

type Props = {
  tipo: AsicCotizadorCatalogTipo;
  /** Para procesador: modelo padre. */
  parent?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  labelId: string;
  placeholder?: string;
  searchPlaceholder?: string;
  addLabel?: string;
  newTitle?: string;
  /** Si false, no se puede agregar/editar opciones del catálogo (solo elegir). */
  allowCreate?: boolean;
  onError?: (msg: string) => void;
};

function mergeOpciones(catalogo: CatalogOpt[], value: string): CatalogOpt[] {
  const map = new Map<string, CatalogOpt>();
  for (const raw of catalogo) {
    const v = raw.valor.trim();
    if (!v) continue;
    const key = v.toLocaleLowerCase("es");
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { id: raw.id, valor: v });
    } else if (prev.id == null && raw.id != null) {
      map.set(key, { id: raw.id, valor: v });
    }
  }
  const vv = value.trim();
  if (vv) {
    const key = vv.toLocaleLowerCase("es");
    if (!map.has(key)) map.set(key, { id: null, valor: vv });
  }
  return [...map.values()].sort((a, b) => a.valor.localeCompare(b.valor, "es", { sensitivity: "base" }));
}

export function AsicCotizadorCatalogSelect({
  tipo,
  parent = "",
  value,
  onChange,
  disabled = false,
  labelId,
  placeholder = "— Seleccionar —",
  searchPlaceholder = "Buscar…",
  addLabel = "Agregar nuevo",
  newTitle = "Nueva opción",
  allowCreate = true,
  onError,
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
  const [catalogo, setCatalogo] = useState<CatalogOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const parentKey = parent.trim();
  const needsParent = tipo === "procesador";
  const canLoad = !needsParent || Boolean(parentKey);
  const enEdicion = editandoId != null;

  const loadCatalogo = useCallback(async () => {
    if (!canLoad) {
      setCatalogo([]);
      return;
    }
    setLoading(true);
    try {
      const r = await getAsicCotizadorCatalogo({
        tipo,
        parent: needsParent ? parentKey : undefined,
      });
      setCatalogo(
        (r.items ?? [])
          .map((x) => ({
            id: Number.isFinite(x.id) && x.id > 0 ? x.id : null,
            valor: String(x.valor ?? "").trim(),
          }))
          .filter((x) => x.valor)
      );
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo cargar el catálogo.");
      setCatalogo([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, needsParent, onError, parentKey, tipo]);

  useEffect(() => {
    void loadCatalogo();
  }, [loadCatalogo]);

  useEffect(() => {
    if (!abierto) return;
    void loadCatalogo();
  }, [abierto, loadCatalogo]);

  const todas = useMemo(() => mergeOpciones(catalogo, value), [catalogo, value]);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return todas;
    return todas.filter((x) => x.valor.toLowerCase().includes(t));
  }, [busqueda, todas]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setBusqueda("");
    setModoNuevo(false);
    setNuevaValor("");
    setEditandoId(null);
    setEditValor("");
  }, []);

  const cancelarEdicion = useCallback(() => {
    setEditandoId(null);
    setEditValor("");
  }, []);

  const elegir = useCallback(
    (v: string) => {
      if (enEdicion || modoNuevo) return;
      onChange(v);
      cerrar();
    },
    [onChange, cerrar, enEdicion, modoNuevo]
  );

  const abrir = () => {
    if (disabled || !canLoad) return;
    setAbierto(true);
    setBusqueda("");
    setModoNuevo(false);
    setNuevaValor("");
    setEditandoId(null);
    setEditValor("");
  };

  const abrirNuevo = (sugerida = "") => {
    cancelarEdicion();
    setNuevaValor(sugerida.trim().slice(0, MAX_VALOR_LEN));
    setModoNuevo(true);
  };

  const abrirEditar = (opt: CatalogOpt) => {
    if (opt.id == null) return;
    setModoNuevo(false);
    setNuevaValor("");
    setEditandoId(opt.id);
    setEditValor(opt.valor.slice(0, MAX_VALOR_LEN));
  };

  const guardarNueva = async () => {
    const nombre = nuevaValor.trim().slice(0, MAX_VALOR_LEN);
    if (!nombre) return;

    const yaExiste = todas.some((c) => c.valor.localeCompare(nombre, "es", { sensitivity: "accent" }) === 0);
    if (yaExiste) {
      onChange(nombre);
      cerrar();
      return;
    }

    setGuardando(true);
    try {
      const resp = await createAsicCotizadorCatalogo({
        tipo,
        valor: nombre,
        parent: needsParent ? parentKey : undefined,
      });
      const creado = resp.item?.valor?.trim() || nombre;
      const creadoId = Number(resp.item?.id ?? 0);
      setCatalogo((prev) =>
        mergeOpciones(
          [...prev, { id: Number.isFinite(creadoId) && creadoId > 0 ? creadoId : null, valor: creado }],
          ""
        )
      );
      onChange(creado);
      cerrar();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo guardar la opción.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async () => {
    if (editandoId == null) return;
    const nombre = editValor.trim().slice(0, MAX_VALOR_LEN);
    if (!nombre) return;

    const actual = todas.find((x) => x.id === editandoId);
    if (actual && actual.valor.localeCompare(nombre, "es", { sensitivity: "accent" }) === 0) {
      cancelarEdicion();
      return;
    }

    const conflicto = todas.some(
      (c) => c.id !== editandoId && c.valor.localeCompare(nombre, "es", { sensitivity: "accent" }) === 0
    );
    if (conflicto) {
      onError?.(`Ya existe «${nombre}» en este catálogo.`);
      return;
    }

    setGuardando(true);
    try {
      const resp = await updateAsicCotizadorCatalogo(editandoId, { valor: nombre });
      const nuevo = resp.item?.valor?.trim() || nombre;
      const prevValor = (resp.previousValor ?? actual?.valor ?? "").trim();
      setCatalogo((prev) =>
        prev.map((x) => (x.id === editandoId ? { id: editandoId, valor: nuevo } : x))
      );
      if (value.trim() && prevValor && value.localeCompare(prevValor, "es", { sensitivity: "accent" }) === 0) {
        onChange(nuevo);
      }
      cancelarEdicion();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo editar la opción.");
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    if (!abierto || modoNuevo || enEdicion) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [abierto, modoNuevo, enEdicion]);

  useEffect(() => {
    if (!modoNuevo) return;
    const t = window.setTimeout(() => nuevaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [modoNuevo]);

  useEffect(() => {
    if (!enEdicion) return;
    const t = window.setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [enEdicion, editandoId]);

  useEffect(() => {
    if (!abierto) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [abierto, cerrar]);

  const textoSeleccion = value.trim() || placeholder;
  const triggerDisabled = disabled || !canLoad;
  const listaBloqueada = modoNuevo || enEdicion;

  return (
    <div className="asic-cotizador-catalog-select" ref={rootRef}>
      <div className="asic-cotizador-catalog-shell">
        <button
          type="button"
          id={labelId}
          className="fact-select asic-cotizador-catalog-trigger"
          aria-expanded={abierto}
          aria-haspopup="listbox"
          onClick={() => (abierto ? cerrar() : abrir())}
          disabled={triggerDisabled}
          title={!canLoad ? "Elegí primero el modelo" : undefined}
        >
          <span className={value.trim() ? "" : "asic-cotizador-catalog-placeholder"}>{textoSeleccion}</span>
        </button>
        {value.trim() && !triggerDisabled ? (
          <button
            type="button"
            className="asic-cotizador-catalog-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            title="Quitar selección"
            aria-label="Quitar selección"
          >
            ×
          </button>
        ) : null}
      </div>

      {abierto && !triggerDisabled ? (
        <div className="asic-cotizador-catalog-panel" role="dialog" aria-label={newTitle}>
          <div className="asic-cotizador-catalog-search">
            <label htmlFor={`${labelId}-search`} className="visually-hidden">
              Buscar
            </label>
            <input
              ref={searchRef}
              id={`${labelId}-search`}
              type="search"
              className="form-control form-control-sm"
              placeholder={searchPlaceholder}
              value={busqueda}
              disabled={listaBloqueada}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (modoNuevo) setModoNuevo(false);
                  else if (enEdicion) cancelarEdicion();
                  else cerrar();
                }
              }}
            />
          </div>
          <p className="asic-cotizador-catalog-meta">
            {loading
              ? "Cargando catálogo…"
              : busqueda.trim()
                ? `${filtradas.length} coincidencia(s) de ${todas.length}`
                : `${todas.length} en catálogo · buscá, editá o agregá`}
          </p>

          {modoNuevo ? (
            <div
              className="asic-cotizador-catalog-nuevo"
              role="group"
              aria-label={newTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !guardando) {
                  e.preventDefault();
                  void guardarNueva();
                }
              }}
            >
              <p className="asic-cotizador-catalog-nuevo-title">{newTitle}</p>
              <label className="form-label small mb-1" htmlFor={`${labelId}-nueva`}>
                Nombre
              </label>
              <input
                ref={nuevaRef}
                id={`${labelId}-nueva`}
                type="text"
                className="form-control form-control-sm"
                maxLength={MAX_VALOR_LEN}
                placeholder="Escribí el nombre…"
                value={nuevaValor}
                disabled={guardando}
                onChange={(e) => setNuevaValor(e.target.value)}
              />
              <div className="asic-cotizador-catalog-nuevo-actions">
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={!nuevaValor.trim() || guardando}
                  onClick={() => void guardarNueva()}
                >
                  {guardando ? "Guardando…" : "Guardar y usar"}
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={guardando} onClick={() => setModoNuevo(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          <ul className="asic-cotizador-catalog-list" role="listbox">
            {allowCreate && !listaBloqueada ? (
              <li>
                <button type="button" className="asic-cotizador-catalog-item-nuevo" onClick={() => abrirNuevo()}>
                  <strong>+</strong>
                  <span>{addLabel}</span>
                </button>
              </li>
            ) : null}

            {allowCreate && !listaBloqueada && filtradas.length === 0 && busqueda.trim() ? (
              <li>
                <button
                  type="button"
                  className="asic-cotizador-catalog-item-nuevo asic-cotizador-catalog-item-nuevo--sugerido"
                  onClick={() => abrirNuevo(busqueda.trim())}
                >
                  <strong>+</strong>
                  <span>Crear «{busqueda.trim()}»</span>
                </button>
              </li>
            ) : null}

            {!modoNuevo
              ? filtradas.map((opt) => {
                  const key = opt.id != null ? `id-${opt.id}` : `v-${opt.valor}`;
                  const editingThis = opt.id != null && editandoId === opt.id;

                  if (editingThis) {
                    return (
                      <li key={key} className="asic-cotizador-catalog-edit-row">
                        <div
                          className="asic-cotizador-catalog-edit"
                          role="group"
                          aria-label={`Editar ${opt.valor}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !guardando) {
                              e.preventDefault();
                              void guardarEdicion();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelarEdicion();
                            }
                          }}
                        >
                          <label className="form-label small mb-1" htmlFor={`${labelId}-edit-${opt.id}`}>
                            Editar
                          </label>
                          <input
                            ref={editRef}
                            id={`${labelId}-edit-${opt.id}`}
                            type="text"
                            className="form-control form-control-sm"
                            maxLength={MAX_VALOR_LEN}
                            value={editValor}
                            disabled={guardando}
                            onChange={(e) => setEditValor(e.target.value)}
                          />
                          <div className="asic-cotizador-catalog-nuevo-actions">
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={!editValor.trim() || guardando}
                              onClick={() => void guardarEdicion()}
                            >
                              {guardando ? "Guardando…" : "Guardar"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              disabled={guardando}
                              onClick={cancelarEdicion}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={key} className="asic-cotizador-catalog-row-item">
                      <button
                        type="button"
                        role="option"
                        aria-selected={value === opt.valor}
                        className={`asic-cotizador-catalog-item${value === opt.valor ? " is-selected" : ""}`}
                        onClick={() => elegir(opt.valor)}
                        disabled={enEdicion}
                      >
                        {opt.valor}
                      </button>
                      {allowCreate && opt.id != null && !enEdicion ? (
                        <button
                          type="button"
                          className="asic-cotizador-catalog-edit-btn"
                          title="Editar"
                          aria-label={`Editar ${opt.valor}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEditar(opt);
                          }}
                        >
                          Editar
                        </button>
                      ) : null}
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
