import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { HASHRATE_SPACE_LOGO } from "../../lib/marketplaceWpAssets.js";

export type RegistroBrandPanelVariant = "signup" | "login";

type RegistroBrandPanelProps = {
  /** Versión compacta arriba del formulario en móvil. */
  compact?: boolean;
  /** Textos del panel: registro (crear cuenta) o acceso (ya tiene cuenta). */
  variant?: RegistroBrandPanelVariant;
};

const ASIDE_KEYS = {
  signup: {
    aria: "reg.aside_aria",
    titlePrefix: "reg.aside_title_prefix",
    titleAccent: "reg.aside_title_accent",
    lead: "reg.aside_lead",
    b1: "reg.aside_b1",
    b2: "reg.aside_b2",
    b3: "reg.aside_b3",
  },
  login: {
    aria: "login.aside_aria",
    titlePrefix: "login.aside_title_prefix",
    titleAccent: "login.aside_title_accent",
    lead: "login.aside_lead",
    b1: "login.aside_b1",
    b2: "login.aside_b2",
    b3: "login.aside_b3",
  },
} as const;

/** Panel lateral de marca (registro / acceso tienda): logo, titular con acento y beneficios. */
export function RegistroBrandPanel({ compact = false, variant = "signup" }: RegistroBrandPanelProps) {
  const { t } = useMarketplaceLang();
  const keys = ASIDE_KEYS[variant];

  return (
    <div
      className={
        "market-registro-brand-panel" + (compact ? " market-registro-brand-panel--compact" : "")
      }
    >
      <div className="market-registro-brand-panel__decor" aria-hidden>
        <span className="market-registro-brand-panel__ring market-registro-brand-panel__ring--a" />
        <span className="market-registro-brand-panel__ring market-registro-brand-panel__ring--b" />
        <span className="market-registro-brand-panel__ring market-registro-brand-panel__ring--c" />
      </div>
      <img
        className="market-registro-brand-panel__logo"
        src={HASHRATE_SPACE_LOGO}
        alt="Hashrate Space"
        width={220}
        height={52}
        loading="lazy"
        decoding="async"
      />
      <h1 className="market-registro-brand-panel__title">
        <span className="market-registro-brand-panel__title-main">{t(keys.titlePrefix)}</span>{" "}
        <span className="market-registro-brand-panel__title-accent">{t(keys.titleAccent)}</span>
      </h1>
      <p className="market-registro-brand-panel__lead">{t(keys.lead)}</p>
      <ul className="market-registro-brand-panel__list">
        <li>
          <span className="market-registro-brand-panel__check" aria-hidden>
            <i className="bi bi-check-lg" />
          </span>
          <span>{t(keys.b1)}</span>
        </li>
        <li>
          <span className="market-registro-brand-panel__check" aria-hidden>
            <i className="bi bi-check-lg" />
          </span>
          <span>{t(keys.b2)}</span>
        </li>
        <li>
          <span className="market-registro-brand-panel__check" aria-hidden>
            <i className="bi bi-check-lg" />
          </span>
          <span>{t(keys.b3)}</span>
        </li>
      </ul>
    </div>
  );
}
