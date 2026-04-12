import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/facturacion.css";
import "../styles/marketplace-hashrate.css";

const LOGO_PRINCIPAL = "/images/HASHRATELOGO2.png";
const LOGO_FALLBACK = "/images/LOGO-HASHRATE.png";

interface PageHeaderProps {
  title: string;
  showBackButton?: boolean;
  backTo?: string;
  backText?: string;
  rightContent?: React.ReactNode;
  /** Logo custom (ej. Facturación usa HASHRATELOGO2.png) */
  logoSrc?: string;
  /** Si se define, el logo enlaza (ej. "/" inicio SGI) */
  logoHref?: string;
  logoLinkAriaLabel?: string;
}

/**
 * Barra superior SGI — misma línea visual que el header del marketplace (blanco, sticky, grid estable).
 */
export function PageHeader({
  title,
  showBackButton = true,
  backTo = "/",
  backText = "Volver al inicio",
  rightContent,
  logoSrc: logoSrcProp,
  logoHref,
  logoLinkAriaLabel = "Ir al inicio del Sistema de Gestión Interna",
}: PageHeaderProps) {
  const [logoSrc, setLogoSrc] = useState(logoSrcProp ?? LOGO_PRINCIPAL);
  useEffect(() => {
    setLogoSrc(logoSrcProp ?? LOGO_PRINCIPAL);
  }, [logoSrcProp]);

  const logoImg = (
    <img
      src={logoSrc}
      alt=""
      className="sgi-unified-header__logo-img"
      width={200}
      height={52}
      loading="eager"
      decoding="async"
      onError={() => setLogoSrc(LOGO_FALLBACK)}
    />
  );

  return (
    <header className="sgi-unified-header">
      <div className="container sgi-unified-header__inner">
        <div className="sgi-unified-header__logo">
          {logoHref ? (
            <Link to={logoHref} className="sgi-unified-header__logo-link" aria-label={logoLinkAriaLabel} title="Ir al inicio SGI">
              {logoImg}
            </Link>
          ) : (
            <span className="sgi-unified-header__logo-wrap">{logoImg}</span>
          )}
        </div>
        <h1 className="sgi-unified-header__title">{title}</h1>
        <div className="sgi-unified-header__actions">
          {rightContent}
          {showBackButton ? (
            <Link to={backTo} className="fact-back sgi-unified-header__back">
              {backText}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
