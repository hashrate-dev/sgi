import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { CryptoNoticiasMediosConfig } from "../components/CryptoNoticiasMediosConfig";
import { CryptoNoticiasSentimentPanel } from "../components/CryptoNoticiasSentimentPanel";
import { useAuth } from "../contexts/AuthContext";
import {
  getCryptoNoticias,
  getCryptoNoticiasMeta,
  getCryptoNoticiasSentiment,
  refreshCryptoNoticias,
  sendCryptoNoticiaTelegram,
  type CryptoNoticiaItem,
  type CryptoNewsSentimentReport,
} from "../lib/api";
import { canAccessNoticiasModule, canEditNoticiasModule } from "../lib/auth";
import { sgiHome } from "../lib/marketplacePaths.js";
import "../styles/facturacion.css";
import "../styles/crypto-noticias.css";

const TOPIC_LABEL: Record<string, string> = {
  bitcoin: "Bitcoin",
  dogecoin: "Dogecoin",
  litecoin: "Litecoin",
  zcash: "Zcash",
  cripto: "Cripto",
  inversion: "Inversiones",
  gobierno_usa: "Gobierno USA",
  uruguay: "Cripto Uruguay",
  usa: "Cripto USA",
};

const COPY = {
  pageTitle: "Noticias",
  back: "Volver atrás",
  kicker: "Sala de redacción · Wire cripto HRS",
  heroTitle: "Últimas noticias del mercado",
  heroLead:
    "",
  historial: "En historial",
  ultima: "Última captura",
  refresh: "Actualizar bot ahora",
  refreshing: "Capturando…",
  allWire: "Todo el wire",
  searchPh: "Buscar en el historial…",
  search: "Buscar",
  loading: "Cargando wire…",
  empty: "Todavía no hay piezas en el historial",
  emptyHint: " — tocá «Actualizar bot ahora» para la primera captura.",
  read: "Abrir artículo →",
  live: "EN VIVO",
  showing: "Mostrando",
  of: "de",
  inView: "en esta vista · historial acumulado",
  errLoad: "No se pudo cargar el wire de noticias.",
  errRefresh: "No se pudo refrescar el bot.",
  okBot: (a: number, b: number, c: number) =>
    `Bot actualizado: ${a} nuevas · ${b} escaneadas${c ? ` · ${c} fuentes con aviso` : ""}.`,
} as const;

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "hace instantes";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  try {
    return new Date(t).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso.slice(0, 16);
  }
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

/** True si la noticia es del día local (calendario de hoy). */
function isPublishedToday(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const d = new Date(t);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Abre el artículo traducido al español (Google Translate). */
function newsOpenUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.includes("translate.google.")) return raw;
  } catch {
    return raw;
  }
  return `https://translate.google.com/translate?sl=auto&tl=es&hl=es&u=${encodeURIComponent(raw)}`;
}

export function CryptoNoticiasPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<CryptoNoticiaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [topic, setTopic] = useState("");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [metaTotal, setMetaTotal] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [livePulse, setLivePulse] = useState(true);
  const [mediosOpen, setMediosOpen] = useState(false);
  const [sentiment, setSentiment] = useState<CryptoNewsSentimentReport | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const [sendingId, setSendingId] = useState<number | null>(null);

  const canEdit = Boolean(user && canEditNoticiasModule(user));
  const copy = COPY;

  const loadMeta = useCallback(async () => {
    try {
      const m = await getCryptoNoticiasMeta();
      setMetaTotal(m.total);
      setLastFetchedAt(m.lastFetchedAt);
    } catch {
      /* soft */
    }
  }, []);

  const loadSentiment = useCallback(async () => {
    setSentimentLoading(true);
    try {
      const r = await getCryptoNoticiasSentiment({ topic: topic || undefined });
      setSentiment(r);
    } catch {
      /* soft: el wire sigue usable sin KPI */
    } finally {
      setSentimentLoading(false);
    }
  }, [topic]);

  const loadNews = useCallback(async () => {
    setTableLoading(true);
    setErr("");
    try {
      const r = await getCryptoNoticias({
        topic: topic || undefined,
        q: q || undefined,
        limit: 36,
        offset: 0,
        lang: "es",
      });
      const next = r.items || [];
      setItems(next);
      setTotal(r.total || 0);
      setTableLoading(false);

      // Traducciones pendientes: refresco suave en background (no bloquea la UI).
      const missingTx = next.filter((n) => !n.translated).length;
      if (missingTx > 0) {
        window.setTimeout(() => {
          void getCryptoNoticias({
            topic: topic || undefined,
            q: q || undefined,
            limit: 36,
            offset: 0,
            lang: "es",
          })
            .then((r2) => {
              setItems(r2.items || []);
              setTotal(r2.total || 0);
            })
            .catch(() => undefined);
        }, 2800);
      }
    } catch (e) {
      setItems([]);
      setErr(e instanceof Error ? e.message : copy.errLoad);
      setTableLoading(false);
    }
  }, [topic, q, copy.errLoad]);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessNoticiasModule(user)) return;
    // Paralelo: meta + wire + KPI (cada uno independiente).
    void loadMeta();
    void loadNews();
    void loadSentiment();
  }, [loading, user, loadMeta, loadNews, loadSentiment]);

  useEffect(() => {
    if (loading || !user || !canAccessNoticiasModule(user)) return;
    const id = window.setInterval(() => {
      void loadNews();
      void loadMeta();
      void loadSentiment();
      setLivePulse((p) => !p);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [loading, user, loadNews, loadMeta, loadSentiment]);

  const topicLabels = TOPIC_LABEL;

  const onSendNewsTelegram = async (n: CryptoNoticiaItem) => {
    if (!canEdit || n.telegramSent) return;
    setSendingId(n.id);
    setErr("");
    setOk("");
    try {
      await sendCryptoNoticiaTelegram(n.id);
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, telegramSent: true } : it)));
      setOk(`Enviada a Telegram: ${n.title}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo enviar esa noticia a Telegram.";
      if (/ya se envió/i.test(msg)) {
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, telegramSent: true } : it)));
      }
      setErr(msg);
    } finally {
      setSendingId(null);
    }
  };

  const onRefreshBot = async () => {
    if (!canEdit) return;
    setRefreshing(true);
    setErr("");
    setOk("");
    try {
      const r = await refreshCryptoNoticias();
      setOk(copy.okBot(r.inserted, r.scanned, r.feedErrors));
      // Liberar el botón ya: la recarga/traducción no debe dejarlo colgado en «Capturando…».
      setRefreshing(false);
      void Promise.all([loadNews(), loadMeta(), loadSentiment()]).catch(() => undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : copy.errRefresh);
      setRefreshing(false);
    }
  };

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !canAccessNoticiasModule(user)) {
    return <Navigate to={sgiHome()} replace />;
  }

  const chips = [
    { id: "", label: copy.allWire },
    ...Object.entries(topicLabels).map(([id, label]) => ({ id, label })),
  ];

  return (
    <div className="fact-page crypto-news-page">
      <div className="container">
        <PageHeader
          title={copy.pageTitle}
          showBackButton
          backTo="/gestion-administrativa"
          backText={copy.back}
        />

        <section className="crypto-news-hero hrs-card sgi-glass-panel">
          <div className="crypto-news-hero__top">
            <div>
              <div className="crypto-news-kicker">
                <span className={`crypto-news-live-pulse${livePulse ? " is-on" : ""}`} aria-hidden />
                {copy.kicker}
              </div>
              <h1 className="crypto-news-hero__title">{copy.heroTitle}</h1>
              <p className="crypto-news-hero__lead">{copy.heroLead}</p>
            </div>
            <div className="crypto-news-hero__stats">
              <div className="crypto-news-stat">
                <div className="crypto-news-stat__label">{copy.historial}</div>
                <div className="crypto-news-stat__value">{metaTotal}</div>
              </div>
              <div className="crypto-news-stat">
                <div className="crypto-news-stat__label">{copy.ultima}</div>
                <div className="crypto-news-stat__value crypto-news-stat__value--sm">
                  {formatStamp(lastFetchedAt)}
                </div>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-success crypto-news-refresh-btn"
                  disabled={refreshing}
                  onClick={() => void onRefreshBot()}
                >
                  {refreshing ? copy.refreshing : copy.refresh}
                </button>
              ) : null}
              <button
                type="button"
                className="crypto-news-config-btn"
                onClick={() => setMediosOpen(true)}
                aria-label="Configuración de medios y Telegram"
                title="Medios RSS y avisos Telegram"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="crypto-news-toolbar">
            <div className="crypto-news-chips" role="tablist" aria-label="Temas">
              {chips.map((c) => (
                <button
                  key={c.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={topic === c.id}
                  className={`crypto-news-chip${topic === c.id ? " is-active" : ""}`}
                  onClick={() => setTopic(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <form
              className="crypto-news-search"
              onSubmit={(e) => {
                e.preventDefault();
                setQ(qDraft.trim());
              }}
            >
              <input
                type="search"
                className="fact-input"
                placeholder={copy.searchPh}
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
              />
              <button type="submit" className="btn btn-outline-light btn-sm">
                {copy.search}
              </button>
            </form>
          </div>

          {err ? <div className="alert alert-danger py-2 mt-3 mb-0">{err}</div> : null}
          {ok ? <div className="alert alert-success py-2 mt-3 mb-0">{ok}</div> : null}

          {items.length > 0 ? (
            <div className="crypto-news-ticker" aria-label={copy.live}>
              <span className="crypto-news-ticker__badge">{copy.live}</span>
              <div className="crypto-news-ticker__track">
                <div className="crypto-news-ticker__inner">
                  {[...items.slice(0, 12), ...items.slice(0, 12)].map((n, i) => (
                    <span key={`${n.id}-${i}`} className="crypto-news-ticker__item">
                      <strong>{n.sourceName || "Wire"}</strong> · {n.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <CryptoNoticiasMediosConfig
          canEdit={canEdit}
          open={mediosOpen}
          onClose={() => setMediosOpen(false)}
        />

        <CryptoNoticiasSentimentPanel report={sentiment} loading={sentimentLoading} />

        {tableLoading ? (
          <div className="crypto-news-loading text-muted">{copy.loading}</div>
        ) : items.length === 0 ? (
          <div className="hrs-card sgi-glass-panel p-4 text-muted">
            {copy.empty}
            {canEdit ? copy.emptyHint : "."}
          </div>
        ) : (
          <>
            <section className="crypto-news-grid" aria-label="Historial de noticias">
              {items.map((n) => (
                <article key={n.id} className="crypto-news-card">
                  <div className="crypto-news-card__body">
                    <div className="crypto-news-card__meta">
                      <span className="crypto-news-source">{n.sourceName || "Wire"}</span>
                      {isPublishedToday(n.publishedAt) ? (
                        <span className="crypto-news-today" title="Publicada hoy">
                          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10Zm-9 3h2v2H10v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2H10v-2Zm4 0h2v2h-2v-2Z"
                            />
                          </svg>
                          Hoy
                        </span>
                      ) : null}
                      <time dateTime={n.publishedAt}>{timeAgo(n.publishedAt)}</time>
                    </div>
                    <h3 className="crypto-news-card__title">
                      <a href={newsOpenUrl(n.url)} target="_blank" rel="noopener noreferrer">
                        {n.title}
                      </a>
                    </h3>
                    {n.summary ? <p className="crypto-news-card__summary">{n.summary}</p> : <p className="crypto-news-card__summary">&nbsp;</p>}
                    <div className="crypto-news-tags">
                      {n.topics.slice(0, 4).map((t) => (
                        <span key={t} className="crypto-news-tag">
                          {topicLabels[t] ?? t}
                        </span>
                      ))}
                    </div>
                    <div className="crypto-news-card__actions">
                      <a
                        className="crypto-news-read"
                        href={newsOpenUrl(n.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {copy.read}
                      </a>
                      {canEdit ? (
                        <button
                          type="button"
                          className={`crypto-news-send-tg${n.telegramSent ? " crypto-news-send-tg--sent" : ""}`}
                          disabled={sendingId != null || Boolean(n.telegramSent)}
                          onClick={() => void onSendNewsTelegram(n)}
                        >
                          {n.telegramSent
                            ? "Ya enviada"
                            : sendingId === n.id
                              ? "Enviando…"
                              : "Enviar a Telegram"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <p className="crypto-news-footer-note text-muted small">
              {copy.showing} {items.length} {copy.of} {total} {copy.inView} {metaTotal}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
