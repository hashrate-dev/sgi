import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/facturacion.css";

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
 * Barra superior SGI — estilo facturación (verde #2D5D46, logo + título blancos).
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
  const useFallback = logoSrc === LOGO_FALLBACK;

  const logoImg = (
    <img
      src={logoSrc}
      alt="Hashrate"
      className={`fact-logo ${useFallback ? "" : "fact-logo--white"}`}
      width={180}
      height={48}
      loading="eager"
      decoding="async"
      onError={() => setLogoSrc(LOGO_FALLBACK)}
    />
  );

  const logoBlock = logoHref ? (
    <Link
      to={logoHref}
      className="fact-logo-container fact-logo-container--link"
      aria-label={logoLinkAriaLabel}
      title="Ir al inicio SGI"
    >
      {logoImg}
    </Link>
  ) : (
    <div className="fact-logo-container">{logoImg}</div>
  );

  return (
    <header className="fact-topbar">
      <div className="fact-topbar-left">
        {logoBlock}
        <h1>{title}</h1>
      </div>
      <div className="fact-topbar-right">
        {rightContent}
        {showBackButton ? (
          <Link to={backTo} className="fact-back">
            {backText}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
