import { useCallback, useEffect, useState } from "react";
import {
  createCryptoNoticiaMedio,
  deleteCryptoNoticiaMedio,
  getCryptoNoticiasMedios,
  updateCryptoNoticiaMedio,
  type CryptoNoticiaMedio,
  type CryptoNoticiaTopic,
} from "../lib/api";

type Props = {
  canEdit: boolean;
};

const TOPIC_OPTS: Array<{ id: CryptoNoticiaTopic; label: string }> = [
  { id: "cripto", label: "Cripto" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "dogecoin", label: "Dogecoin" },
  { id: "litecoin", label: "Litecoin" },
  { id: "zcash", label: "Zcash" },
  { id: "inversion", label: "Inversiones" },
  { id: "gobierno_usa", label: "Gobierno USA" },
  { id: "usa", label: "Cripto USA" },
  { id: "uruguay", label: "Cripto Uruguay" },
];

export function CryptoNoticiasMediosConfig({ canEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CryptoNoticiaMedio[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [topics, setTopics] = useState<CryptoNoticiaTopic[]>(["cripto"]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await getCryptoNoticiasMedios();
      setItems(r.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar la configuración de medios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const toggleEnabled = async (m: CryptoNoticiaMedio) => {
    if (!canEdit) return;
    setBusyId(m.id);
    setErr("");
    setOk("");
    try {
      const r = await updateCryptoNoticiaMedio(m.id, { enabled: !m.enabled });
      if (r.item) {
        setItems((prev) => prev.map((x) => (x.id === m.id ? r.item! : x)));
      } else {
        await load();
      }
      setOk(m.enabled ? `Medio desactivado: ${m.name}` : `Medio aceptado: ${m.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar el medio.");
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async () => {
    if (!canEdit) return;
    setErr("");
    setOk("");
    const n = name.trim();
    const u = url.trim();
    if (n.length < 2) {
      setErr("Indicá el nombre del medio de comunicación.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setErr("La URL del RSS debe empezar con http:// o https://");
      return;
    }
    setSaving(true);
    try {
      const r = await createCryptoNoticiaMedio({
        name: n,
        url: u,
        topics: topics.length ? topics : ["cripto"],
        enabled: true,
      });
      if (r.item) setItems((prev) => [...prev, r.item!].sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, "es")));
      else await load();
      setName("");
      setUrl("");
      setTopics(["cripto"]);
      setOk(`Medio agregado: ${n}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo agregar el medio.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (m: CryptoNoticiaMedio) => {
    if (!canEdit || m.isBuiltin) return;
    if (!window.confirm(`¿Eliminar el medio «${m.name}»?`)) return;
    setBusyId(m.id);
    setErr("");
    setOk("");
    try {
      await deleteCryptoNoticiaMedio(m.id);
      setItems((prev) => prev.filter((x) => x.id !== m.id));
      setOk(`Medio eliminado: ${m.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar el medio.");
    } finally {
      setBusyId(null);
    }
  };

  const enabledCount = items.filter((x) => x.enabled).length;

  return (
    <section className="crypto-news-medios hrs-card sgi-glass-panel">
      <div className="crypto-news-medios__head">
        <div>
          <h2 className="crypto-news-medios__title">Configuración de medios</h2>
          <p className="crypto-news-medios__lead">
            Aceptá o rechazá las fuentes que el bot consulta. También podés indicar un medio propio con su URL RSS.
            {open && !loading ? ` (${enabledCount} activos de ${items.length})` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-light btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Ocultar" : "Abrir configuración"}
        </button>
      </div>

      {open ? (
        <div className="crypto-news-medios__body">
          {err ? <div className="alert alert-danger py-2">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2">{ok}</div> : null}
          {loading ? (
            <p className="text-muted small mb-0">Cargando medios…</p>
          ) : (
            <>
              <ul className="crypto-news-medios__list">
                {items.map((m) => (
                  <li key={m.id} className={`crypto-news-medios__item${m.enabled ? " is-on" : " is-off"}`}>
                    <div className="crypto-news-medios__item-main">
                      <div className="crypto-news-medios__item-title">
                        <span>{m.name}</span>
                        <span className={`crypto-news-medios__badge${m.isBuiltin ? "" : " is-manual"}`}>
                          {m.isBuiltin ? "Bot" : "Manual"}
                        </span>
                        <span className={`crypto-news-medios__badge${m.enabled ? " is-ok" : " is-no"}`}>
                          {m.enabled ? "Aceptado" : "Rechazado"}
                        </span>
                      </div>
                      <div className="crypto-news-medios__item-url" title={m.url}>
                        {m.url}
                      </div>
                      <div className="crypto-news-medios__item-topics">
                        {m.topics.map((t) => (
                          <span key={t}>{TOPIC_OPTS.find((o) => o.id === t)?.label ?? t}</span>
                        ))}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="crypto-news-medios__item-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${m.enabled ? "btn-outline-warning" : "btn-success"}`}
                          disabled={busyId === m.id}
                          onClick={() => void toggleEnabled(m)}
                        >
                          {busyId === m.id ? "…" : m.enabled ? "Rechazar" : "Aceptar"}
                        </button>
                        {!m.isBuiltin ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busyId === m.id}
                            onClick={() => void onDelete(m)}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canEdit ? (
                <div className="crypto-news-medios__add">
                  <h3 className="crypto-news-medios__add-title">Agregar medio manualmente</h3>
                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label small text-white-50 mb-1">Nombre del medio</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Ej. Cointelegraph, Bloomberg Crypto…"
                        value={name}
                        disabled={saving}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-8">
                      <label className="form-label small text-white-50 mb-1">URL del feed RSS</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="https://ejemplo.com/rss.xml"
                        value={url}
                        disabled={saving}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                    <div className="col-12">
                      <div className="crypto-news-medios__topics" role="group" aria-label="Temas">
                        {TOPIC_OPTS.map((t) => {
                          const on = topics.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className={`crypto-news-chip${on ? " is-active" : ""}`}
                              disabled={saving}
                              onClick={() =>
                                setTopics((prev) =>
                                  on ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                                )
                              }
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="col-12">
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={saving}
                        onClick={() => void onAdd()}
                      >
                        {saving ? "Guardando…" : "Agregar medio"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted small mb-0 mt-2">Solo lectura: pedile a un administrador que active o agregue medios.</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
