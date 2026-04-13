import { useEffect } from "react";
import { Link } from "react-router-dom";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";

const UP = "https://hashrate.space/wp-content/uploads";

export function MarketplaceServicesPage() {
  const { t } = useMarketplaceLang();

  const serviceItems = [
    { key: "asic", label: t("services.card.asic") },
    { key: "network", label: t("services.card.network") },
    { key: "installation", label: t("services.card.installation") },
    { key: "security", label: t("services.card.security") },
    { key: "maintenance", label: t("services.card.maintenance") },
    { key: "insurance", label: t("services.card.insurance") },
  ];

  const flowItems = [
    { icon: "purchase", label: t("services.flow.purchase") },
    { icon: "shipping", label: t("services.flow.shipping") },
    { icon: "customs", label: t("services.flow.customs") },
    { icon: "mining", label: t("services.flow.setup") },
  ];

  useEffect(() => {
    const prevTitle = document.title;
    document.title = t("services.doc_title");
    let meta = document.querySelector('meta[name="description"]');
    const prevContent = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", t("services.meta_desc"));
    return () => {
      document.title = prevTitle;
      meta?.setAttribute("content", prevContent);
    };
  }, [t]);

  return (
    <div className="marketplace-asic-page market-corp-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-services">
        <MarketplaceSiteHeader />
        <main
          id="page-main"
          className="page-main page-main--market page-main--market--corp page-main--market--services"
        >
          <section className="market-services-band" aria-label={t("services.hero.title")}>
            <div className="market-services-band__bg" aria-hidden />
            <div className="market-services-band__overlay" aria-hidden />
            <div className="market-services-band__inner">
              <h2>{t("services.hero.title")}</h2>
              <p className="market-services-band__body">{t("services.hero.body")}</p>
              <Link to="/marketplace/contact" className="market-services-band__cta">
                {t("corp.green.cta")}
              </Link>
            </div>
          </section>

          <section id="services" className="market-services-grid" aria-label={t("services.section.title")}>
            <div className="market-services-grid__inner">
              {serviceItems.map((item) => (
                <article key={item.key} className="market-services-card">
                  <div
                    className="market-services-card__bg"
                    style={{ backgroundImage: `url(${UP}/background.png)` }}
                    aria-hidden
                  />
                  <span className="market-services-card__icon" aria-hidden>
                    {item.key === "asic" ? (
                      <ServiceIconAsic />
                    ) : item.key === "network" ? (
                      <ServiceIconNetwork />
                    ) : item.key === "installation" ? (
                      <ServiceIconInstallation />
                    ) : item.key === "security" ? (
                      <ServiceIconSecurity />
                    ) : item.key === "maintenance" ? (
                      <ServiceIconMaintenance />
                    ) : (
                      <ServiceIconInsurance />
                    )}
                  </span>
                  <h3>{item.label}</h3>
                </article>
              ))}
            </div>
          </section>

          <section className="market-services-flow">
            <div className="market-services-flow__overlay" aria-hidden />
            <div className="market-services-flow__inner">
              <div className="market-services-flow__copy">
                <h2>{t("services.flow.title")}</h2>
                <p>{t("services.flow.body")}</p>
              </div>
              <div className="market-services-flow__steps" aria-label={t("services.flow.aria")}>
                {flowItems.map((step) => (
                  <div key={step.label} className="market-services-flow__step">
                    <div className="market-services-flow__icon-wrap" aria-hidden>
                      {step.icon === "purchase" ? (
                        <IconFlowPurchase />
                      ) : step.icon === "shipping" ? (
                        <IconFlowShipping />
                      ) : step.icon === "customs" ? (
                        <IconFlowCustoms />
                      ) : (
                        <IconFlowMining />
                      )}
                    </div>
                    <span className="market-services-flow__label">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
        <MarketplaceSiteFooter />
      </div>
    </div>
  );
}

/** Iconos faja “flujo” — trazo fino (misma línea visual que el resto del marketplace) */
function IconFlowPurchase() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconFlowShipping() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconFlowCustoms() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

function IconFlowMining() {
  /* Símbolo Bitcoin (Lucide): trazo fino, mismo lenguaje que el resto de la faja */
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
    </svg>
  );
}

function ServiceIconAsic() {
  /* Chip tipo paquete BGA/LGA: marco, ventana del die y pines en los 4 lados — currentColor */
  const pinW = 1.35;
  const pinH = 2.15;
  const pinRx = 0.28;
  const sidePinW = 2.15;
  const sidePinH = 1.35;
  const c = "currentColor";
  const pkg = { t: 6.25, r: 17.75, b: 17.75, l: 6.25 } as const;
  const topY = pkg.t - pinH;
  const bottomY = pkg.b;
  const leftX = pkg.l - sidePinW;
  const rightX = pkg.r;
  const topXs = [6.72, 9.24, 11.76, 14.28] as const;
  const sideYs = [6.72, 9.24, 11.76, 14.28] as const;
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
      <path
        fill={c}
        fillRule="evenodd"
        d="M6.25 6.25h11.5v11.5H6.25V6.25Zm2.85 2.85h5.8v5.8h-5.8v-5.8Z"
      />
      {/* Detalle tipo circuito en la ventana del die */}
      <path
        fill="none"
        stroke={c}
        strokeWidth="0.85"
        strokeLinecap="round"
        opacity={0.5}
        d="M10.75 11.2h2.5M12 9.95v2.5M9.3 12.6h5.4M9.3 13.95h5.4"
      />
      {topXs.map((x) => (
        <rect key={`pt-${x}`} x={x} y={topY} width={pinW} height={pinH} rx={pinRx} fill={c} />
      ))}
      {topXs.map((x) => (
        <rect key={`pb-${x}`} x={x} y={bottomY} width={pinW} height={pinH} rx={pinRx} fill={c} />
      ))}
      {sideYs.map((y) => (
        <rect key={`pl-${y}`} x={leftX} y={y} width={sidePinW} height={sidePinH} rx={pinRx} fill={c} />
      ))}
      {sideYs.map((y) => (
        <rect key={`pr-${y}`} x={rightX} y={y} width={sidePinW} height={sidePinH} rx={pinRx} fill={c} />
      ))}
    </svg>
  );
}

function ServiceIconNetwork() {
  /* Wi‑Fi / conectividad inalámbrica (arcos + punto) — currentColor como el resto de la grilla */
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.86a10 10 0 0 1 14 0" />
        <path d="M8.5 16.43a5 5 0 0 1 7 0" />
        <path d="M12 20h.01" />
      </g>
    </svg>
  );
}

function ServiceIconInstallation() {
  /* Engranaje clásico (Feather “settings”): dientes angulares, se lee bien a 28px; mismo color vía currentColor */
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
  );
}

function ServiceIconSecurity() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28">
      <path
        fill="currentColor"
        d="M12 2 4 5v6c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5l-8-3zm0 4a3 3 0 0 1 3 3v1h1v7h-8v-7h1V9a3 3 0 0 1 3-3zm-1 4h2V9a1 1 0 1 0-2 0v1z"
      />
    </svg>
  );
}

function ServiceIconMaintenance() {
  /* Mismo tono que el resto: currentColor hereda de .market-services-card__icon (#0f766e) */
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ServiceIconInsurance() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28">
      <path
        fill="currentColor"
        d="M12 2 4 5v6c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5l-8-3zm3.5 12.3-1.4 1.4L12 13.6l-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1z"
      />
    </svg>
  );
}
