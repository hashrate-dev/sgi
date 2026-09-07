import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Box, Image } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { canAccessSgiFromMarketplaceFooter } from "../lib/auth";
import { isSgiDashboardPath } from "../lib/marketplacePaths";
import { SgiAdminFixedFooter } from "./SgiAdminFixedFooter";
import { SgiProtectedTopBar } from "./SgiProtectedTopBar";
import "../styles/sgi-admin-footer.css";

const SGI_FARM_BG = "/images/config-mining-datacenter-bg.png";
const SGI_HOME_AERIAL_BG = "/images/sgi-home-datacenter-aerial-night.png";
const HASHRATE_LOGO_WHITE = "/images/wp-uploads/hashrate-white.png";

/**
 * Layout de rutas internas (post-login): personal interno ve footer fijo Hashrate + enlace SGI.
 */
export function ProtectedAppLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const showAdminFooter = Boolean(user && canAccessSgiFromMarketplaceFooter(user));
  const isHomePage = isSgiDashboardPath(location.pathname);
  const [sgiTopBarH, setSgiTopBarH] = useState(80);
  const onSgiTopBarHeight = useCallback((h: number) => {
    setSgiTopBarH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (isHomePage) {
      root.classList.add("hrs-home-bg");
      body.classList.add("hrs-home-bg");
      root.classList.remove("hrs-protected-green-bg");
      body.classList.remove("hrs-protected-green-bg");
    } else {
      root.classList.remove("hrs-home-bg");
      body.classList.remove("hrs-home-bg");
      root.classList.add("hrs-protected-green-bg");
      body.classList.add("hrs-protected-green-bg");
    }
    return () => {
      root.classList.remove("hrs-home-bg");
      body.classList.remove("hrs-home-bg");
      root.classList.remove("hrs-protected-green-bg");
      body.classList.remove("hrs-protected-green-bg");
    };
  }, [isHomePage]);

  return (
    <Box
      className={`sgi-protected-root${showAdminFooter ? " sgi-protected-root--admin-footer" : ""}${
        isHomePage ? " sgi-protected-root--home" : " sgi-protected-root--farm-bg"
      }`}
      pb={showAdminFooter ? { base: "140px", md: "120px" } : 0}
      w="100%"
      maxW="100%"
      minH="100vh"
      minW={0}
      bg={isHomePage ? "#071510" : "transparent"}
      backgroundImage={`url(${isHomePage ? SGI_HOME_AERIAL_BG : SGI_FARM_BG})`}
      backgroundSize="cover"
      backgroundPosition={isHomePage ? "center 35%" : "center"}
      backgroundRepeat="no-repeat"
      backgroundAttachment={{ base: "scroll", md: "fixed" }}
      overflowX={isHomePage ? "visible" : "hidden"}
      position="relative"
    >
      <Box
        className={isHomePage ? "sgi-home-bg-overlay" : "sgi-farm-bg-overlay"}
        position="fixed"
        inset={0}
        bg={
          isHomePage
            ? "linear-gradient(155deg, rgba(4, 28, 20, 0.72) 0%, rgba(8, 22, 34, 0.58) 42%, rgba(6, 40, 28, 0.66) 100%)"
            : "linear-gradient(135deg, rgba(7, 40, 28, 0.9) 0%, rgba(15, 23, 42, 0.84) 55%, rgba(7, 64, 37, 0.88) 100%)"
        }
        pointerEvents="none"
        zIndex={0}
      />

      {user ? <SgiProtectedTopBar onHeightChange={onSgiTopBarHeight} /> : null}
      {user ? (
        <Box className="sgi-topbar-spacer" aria-hidden h={`${sgiTopBarH}px`} flexShrink={0} position="relative" zIndex={1} />
      ) : null}
      <Box position="relative" zIndex={1} w="100%" minW={0}>
        {children ?? <Outlet />}
      </Box>
      {showAdminFooter ? <SgiAdminFixedFooter /> : null}

      <Image
        className="sgi-hashrate-brand-logo"
        src={HASHRATE_LOGO_WHITE}
        alt="HASHRATE"
        position="fixed"
        bottom={{ base: "88px", md: "64px" }}
        left={{ base: 4, md: 6 }}
        h={{ base: "22px", md: "26px" }}
        w="auto"
        maxW="150px"
        objectFit="contain"
        zIndex={5}
        pointerEvents="none"
        filter="drop-shadow(0 2px 10px rgba(0,0,0,0.45))"
        opacity={0.95}
      />
    </Box>
  );
}
