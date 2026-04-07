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

  return (
    <header className="fact-topbar">
      <div className="fact-topbar-left">
        {logoHref ? (
          <Link
            to={logoHref}
            className="fact-logo-container fact-logo-container--link"
            aria-label={logoLinkAriaLabel}
            title="Ir al inicio SGI"
          >
            <img 
              src={logoSrc}
              alt="" 
              className={`fact-logo ${useFallback ? "" : "fact-logo--white"}`}
              width={180}
              height={48}
              loading="eager"
              onError={() => setLogoSrc(LOGO_FALLBACK)}
            />
          </Link>
        ) : (
          <div className="fact-logo-container">
            <img 
              src={logoSrc}
              alt="Hashrate" 
              className={`fact-logo ${useFallback ? "" : "fact-logo--white"}`}
              width={180}
              height={48}
              loading="eager"
              onError={() => setLogoSrc(LOGO_FALLBACK)}
            />
          </div>
        )}
        <h1>{title}</h1>
      </div>
      <div className="fact-topbar-right">
        {rightContent}
        {showBackButton && (
          <Link to={backTo} className="fact-back">
            {backText}
          </Link>
        )}
      </div>
    </header>
  );
}
