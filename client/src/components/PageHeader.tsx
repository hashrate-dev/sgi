import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Box, Flex, Heading } from "@chakra-ui/react";
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
    <Box as="header" className="fact-topbar" width="100%">
      <Flex className="fact-topbar-left" align="center" wrap="wrap">
        {logoBlock}
        <Heading
          as="h1"
          size="md"
          color="#ffffff"
          fontWeight="bold"
          fontSize={{ base: "1.05rem", md: "1.15rem" }}
          letterSpacing="-0.02em"
          lineHeight="1.2"
          m={0}
          position="relative"
          display="inline-block"
          textShadow="0 2px 4px rgba(0, 0, 0, 0.2)"
        >
          {title}
        </Heading>
      </Flex>
      <Flex className="fact-topbar-right" align="center" wrap="wrap">
        {rightContent}
        {showBackButton ? (
          <Link to={backTo} className="fact-back">
            {backText}
          </Link>
        ) : null}
      </Flex>
    </Box>
  );
}
