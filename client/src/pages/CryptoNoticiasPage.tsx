import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { CryptoNoticiasMediosConfig } from "../components/CryptoNoticiasMediosConfig";
import { useAuth } from "../contexts/AuthContext";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext";
import {
  getCryptoNoticias,
  getCryptoNoticiasMeta,
  refreshCryptoNoticias,
  type CryptoNoticiaItem,
} from "../lib/api";
import { canAccessNoticiasModule, canEditNoticiasModule } from "../lib/auth";
import type { MarketplaceLang } from "../lib/i18n.js";
import { sgiHome } from "../lib/marketplacePaths.js";
import "../styles/facturacion.css";
import "../styles/crypto-noticias.css";

const TOPIC_LABEL: Record<MarketplaceLang, Record<string, string>> = {
  es: {
    bitcoin: "Bitcoin",
    dogecoin: "Dogecoin",
    litecoin: "Litecoin",
    zcash: "Zcash",
    cripto: "Cripto",
    inversion: "Inversiones",
    gobierno_usa: "Gobierno USA",
    uruguay: "Cripto Uruguay",
    usa: "Cripto USA",
  },
  pt: {
    bitcoin: "Bitcoin",
    dogecoin: "Dogecoin",
    litecoin: "Litecoin",
    zcash: "Zcash",
    cripto: "Cripto",
    inversion: "Investimentos",
    gobierno_usa: "Governo EUA",
    uruguay: "Cripto Uruguai",
    usa: "Cripto EUA",
  },
  en: {
    bitcoin: "Bitcoin",
    dogecoin: "Dogecoin",
    litecoin: "Litecoin",
    zcash: "Zcash",
    cripto: "Crypto",
    inversion: "Investing",
    gobierno_usa: "US government",
    uruguay: "Crypto Uruguay",
    usa: "Crypto USA",
  },
};

function timeAgo(iso: string, lang: MarketplaceLang): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const loc = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "es-AR";
  if (lang === "pt") {
    if (sec < 60) return "há instantes";
    if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `há ${Math.floor(sec / 3600)} h`;
    if (sec < 86400 * 7) return `há ${Math.floor(sec / 86400)} d`;
  } else if (lang === "en") {
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} d ago`;
  } else {
    if (sec < 60) return "hace instantes";
    if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
    if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  }
  try {
    return new Date(t).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso.slice(0, 16);
  }
}

function formatStamp(iso: string | null | undefined, lang: MarketplaceLang): string {
  if (!iso) return "—";
  const loc = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "es-AR";
  try {
    return new Date(iso).toLocaleString(loc, { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

export function CryptoNoticiasPage() {
  const { user, loading } = useAuth();
  const { lang, setLang } = useMarketplaceLang();
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

  const canEdit = Boolean(user && canEditNoticiasModule(user));
  const copy =
    lang === "pt"
      ? {
          pageTitle: "Notícias",
          back: "Voltar",
          kicker: "Sala de redação · Wire cripto HRS",
          heroTitle: "Últimas notícias do mercado",
          heroLead:
            "O bot captura em contínuo sinais de Bitcoin, Dogecoin, Litecoin, Zcash, investimentos, governo dos EUA, cripto no Uruguai e nos EUA. Cada peça entra no histórico.",
          historial: "No histórico",
          ultima: "Última captura",
          refresh: "Atualizar bot agora",
          refreshing: "Capturando…",
          allWire: "Todo o wire",
          searchPh: "Buscar no histórico…",
          search: "Buscar",
          loading: "Sintonizando o wire e traduzindo…",
          empty: "Ainda não há peças no histórico",
          emptyHint: " — toque em «Atualizar bot agora» para a primeira captura.",
          read: "Ler na origem →",
          live: "AO VIVO",
          showing: "Mostrando",
          of: "de",
          inView: "nesta vista · histórico acumulado",
          backHub: "Voltar ao hub",
          langHint: "Idioma das notícias",
          errLoad: "Não foi possível carregar o wire de notícias.",
          errRefresh: "Não foi possível atualizar o bot.",
          okBot: (a: number, b: number, c: number) =>
            `Bot atualizado: ${a} novas · ${b} lidas${c ? ` · ${c} fontes com aviso` : ""}.`,
        }
      : lang === "en"
        ? {
            pageTitle: "News",
            back: "Back",
            kicker: "Newsroom · HRS crypto wire",
            heroTitle: "Latest market news",
            heroLead:
              "The bot continuously captures Bitcoin, Dogecoin, Litecoin, Zcash, investing, US government, crypto in Uruguay and the USA. Every piece is kept in history.",
            historial: "In archive",
            ultima: "Last capture",
            refresh: "Refresh bot now",
            refreshing: "Capturing…",
            allWire: "Full wire",
            searchPh: "Search archive…",
            search: "Search",
            loading: "Tuning the wire…",
            empty: "No stories in the archive yet",
            emptyHint: " — tap «Refresh bot now» for the first capture.",
            read: "Read original →",
            live: "LIVE",
            showing: "Showing",
            of: "of",
            inView: "in this view · archive total",
            backHub: "Back to hub",
            langHint: "News language",
            errLoad: "Could not load the news wire.",
            errRefresh: "Could not refresh the bot.",
            okBot: (a: number, b: number, c: number) =>
              `Bot updated: ${a} new · ${b} scanned${c ? ` · ${c} feed warnings` : ""}.`,
          }
        : {
            pageTitle: "Noticias",
            back: "Volver atrás",
            kicker: "Sala de redacción · Wire cripto HRS",
            heroTitle: "Últimas noticias del mercado",
            heroLead:
              "El bot captura de forma continua señales de Bitcoin, Dogecoin, Litecoin, Zcash, inversiones, gobierno de EE.UU., cripto en Uruguay y en USA. Cada pieza entra al historial y no se pierde.",
            historial: "En historial",
            ultima: "Última captura",
            refresh: "Actualizar bot ahora",
            refreshing: "Capturando…",
            allWire: "Todo el wire",
            searchPh: "Buscar en el historial…",
            search: "Buscar",
            loading: "Sintonizando el wire y traduciendo…",
            empty: "Todavía no hay piezas en el historial",
            emptyHint: " — tocá «Actualizar bot ahora» para la primera captura.",
            read: "Leer en origen →",
            live: "EN VIVO",
            showing: "Mostrando",
            of: "de",
            inView: "en esta vista · historial acumulado",
            backHub: "Volver al hub",
            langHint: "Idioma de las noticias",
            errLoad: "No se pudo cargar el wire de noticias.",
            errRefresh: "No se pudo refrescar el bot.",
            okBot: (a: number, b: number, c: number) =>
              `Bot actualizado: ${a} nuevas · ${b} escaneadas${c ? ` · ${c} fuentes con aviso` : ""}.`,
          };

  const loadMeta = useCallback(async () => {
    try {
      const m = await getCryptoNoticiasMeta();
      setMetaTotal(m.total);
      setLastFetchedAt(m.lastFetchedAt);
    } catch {
      /* soft */
    }
  }, []);

  const loadNews = useCallback(async () => {
    setTableLoading(true);
    setErr("");
    try {
      const r = await getCryptoNoticias({
        topic: topic || undefined,
        q: q || undefined,
        limit: lang === "en" ? 80 : 36,
        offset: 0,
        lang,
      });
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (e) {
      setItems([]);
      setErr(
        e instanceof Error
          ? e.message
          : lang === "pt"
            ? "Não foi possível carregar o wire de notícias."
            : lang === "en"
              ? "Could not load the news wire."
              : "No se pudo cargar el wire de noticias."
      );
    } finally {
      setTableLoading(false);
    }
  }, [topic, q, lang]);

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessNoticiasModule(user)) return;
    void loadMeta();
    void loadNews();
  }, [loading, user, loadMeta, loadNews]);

  useEffect(() => {
    if (loading || !user || !canAccessNoticiasModule(user)) return;
    const id = window.setInterval(() => {
      void loadNews();
      void loadMeta();
      setLivePulse((p) => !p);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [loading, user, loadNews, loadMeta]);

  const featured = items[0] ?? null;
  const rest = useMemo(() => items.slice(1), [items]);
  const topicLabels = TOPIC_LABEL[lang];

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
      void Promise.all([loadNews(), loadMeta()]).catch(() => undefined);
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
                <span className={`crypto-news-live${livePulse ? " is-on" : ""}`} aria-hidden />
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
                  {formatStamp(lastFetchedAt, lang)}
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
            </div>
          </div>

          <div className="crypto-news-lang" role="group" aria-label={copy.langHint}>
            <span className="crypto-news-lang__label">{copy.langHint}</span>
            {(
              [
                { id: "es", label: "ES" },
                { id: "pt", label: "PT" },
                { id: "en", label: "EN" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`crypto-news-lang__btn${lang === opt.id ? " is-active" : ""}`}
                aria-pressed={lang === opt.id}
                onClick={() => setLang(opt.id)}
              >
                {opt.label}
              </button>
            ))}
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

        <CryptoNoticiasMediosConfig canEdit={canEdit} />

        {tableLoading ? (
          <div className="crypto-news-loading text-muted">{copy.loading}</div>
        ) : items.length === 0 ? (
          <div className="hrs-card sgi-glass-panel p-4 text-muted">
            {copy.empty}
            {canEdit ? copy.emptyHint : "."}
          </div>
        ) : (
          <>
            {featured ? (
              <article
                className={`crypto-news-feature hrs-card sgi-glass-panel${
                  featured.imageUrl ? "" : " crypto-news-feature--no-media"
                }`}
              >
                {featured.imageUrl ? (
                  <a
                    className="crypto-news-feature__media"
                    href={featured.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={-1}
                    aria-hidden
                  >
                    <img src={featured.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </a>
                ) : null}
                <div className="crypto-news-feature__body">
                  <div className="crypto-news-feature__meta">
                    <span className="crypto-news-source">{featured.sourceName || "Wire"}</span>
                    <span className="crypto-news-dot" aria-hidden />
                    <time dateTime={featured.publishedAt}>{timeAgo(featured.publishedAt, lang)}</time>
                  </div>
                  <h2 className="crypto-news-feature__title">
                    <a href={featured.url} target="_blank" rel="noopener noreferrer">
                      {featured.title}
                    </a>
                  </h2>
                  {featured.summary ? <p className="crypto-news-feature__summary">{featured.summary}</p> : null}
                  <div className="crypto-news-tags">
                    {featured.topics.map((t) => (
                      <span key={t} className="crypto-news-tag">
                        {topicLabels[t] ?? t}
                      </span>
                    ))}
                  </div>
                  <a
                    className="crypto-news-read"
                    href={featured.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {copy.read}
                  </a>
                </div>
              </article>
            ) : null}

            <section className="crypto-news-grid" aria-label="Historial de noticias">
              {rest.map((n) => (
                <article key={n.id} className="crypto-news-card">
                  {n.imageUrl ? (
                    <a
                      className="crypto-news-card__media"
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={-1}
                      aria-hidden
                    >
                      <img src={n.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    </a>
                  ) : null}
                  <div className="crypto-news-card__body">
                    <div className="crypto-news-card__meta">
                      <span className="crypto-news-source">{n.sourceName || "Wire"}</span>
                      <time dateTime={n.publishedAt}>{timeAgo(n.publishedAt, lang)}</time>
                    </div>
                    <h3 className="crypto-news-card__title">
                      <a href={n.url} target="_blank" rel="noopener noreferrer">
                        {n.title}
                      </a>
                    </h3>
                    {n.summary ? <p className="crypto-news-card__summary">{n.summary}</p> : null}
                    <div className="crypto-news-tags">
                      {n.topics.slice(0, 4).map((t) => (
                        <span key={t} className="crypto-news-tag">
                          {topicLabels[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <p className="crypto-news-footer-note text-muted small">
              {copy.showing} {items.length} {copy.of} {total} {copy.inView} {metaTotal}.{" "}
              <Link to="/gestion-administrativa" className="link-success">
                {copy.backHub}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
