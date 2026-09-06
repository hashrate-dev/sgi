import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAsicCotizadorCatalogo,
  getAsicCotizadorCatalogo,
  type AsicCotizadorCatalogTipo,
} from "../lib/api";

const MAX_VALOR_LEN = 120;

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
  onError?: (msg: string) => void;
};

function mergeOpciones(catalogo: string[], value: string): string[] {
  const map = new Map<string, string>();
  for (const raw of [...catalogo, value]) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLocaleLowerCase("es");
    if (!map.has(key)) map.set(key, v);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
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
  onError,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nuevaRef = useRef<HTMLInputElement>(null);

  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevaValor, setNuevaValor] = useState("");
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const parentKey = parent.trim();
  const needsParent = tipo === "procesador";
  const canLoad = !needsParent || Boolean(parentKey);

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
      setCatalogo((r.items ?? []).map((x) => x.valor).filter(Boolean));
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
    return todas.filter((x) => x.toLowerCase().includes(t));
  }, [busqueda, todas]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setBusqueda("");
    setModoNuevo(false);
    setNuevaValor("");
  }, []);

  const elegir = useCallback(
    (v: string) => {
      onChange(v);
      cerrar();
    },
    [onChange, cerrar]
  );

  const abrir = () => {
    if (disabled || !canLoad) return;
    setAbierto(true);
    setBusqueda("");
    setModoNuevo(false);
    setNuevaValor("");
  };

  const abrirNuevo = (sugerida = "") => {
    setNuevaValor(sugerida.trim().slice(0, MAX_VALOR_LEN));
    setModoNuevo(true);
  };

  const guardarNueva = async () => {
    const nombre = nuevaValor.trim().slice(0, MAX_VALOR_LEN);
    if (!nombre) return;

    const yaExiste = todas.some((c) => c.localeCompare(nombre, "es", { sensitivity: "accent" }) === 0);
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
      setCatalogo((prev) => mergeOpciones([...prev, creado], ""));
      onChange(creado);
      cerrar();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "No se pudo guardar la opción.");
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    if (!abierto || modoNuevo) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [abierto, modoNuevo]);

  useEffect(() => {
    if (!modoNuevo) return;
    const t = window.setTimeout(() => nuevaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [modoNuevo]);

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
              disabled={modoNuevo}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (modoNuevo) setModoNuevo(false);
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
                : `${todas.length} en catálogo · buscá o agregá`}
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
            {!modoNuevo ? (
              <li>
                <button type="button" className="asic-cotizador-catalog-item-nuevo" onClick={() => abrirNuevo()}>
                  <strong>+</strong>
                  <span>{addLabel}</span>
                </button>
              </li>
            ) : null}

            {!modoNuevo && filtradas.length === 0 && busqueda.trim() ? (
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
              ? filtradas.map((opt) => (
                  <li key={opt}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === opt}
                      className={`asic-cotizador-catalog-item${value === opt ? " is-selected" : ""}`}
                      onClick={() => elegir(opt)}
                    >
                      {opt}
                    </button>
                  </li>
                ))
              : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
