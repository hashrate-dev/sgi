import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Box } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { canManageUsers } from "../lib/auth";
import { SgiAdminFixedFooter } from "./SgiAdminFixedFooter";
import "../styles/sgi-admin-footer.css";

/**
 * Layout de rutas internas (post-login): administradores A/B ven footer fijo Hashrate + enlace SGI.
 */
export function ProtectedAppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const showAdminFooter = Boolean(user && canManageUsers(user.role));
  const isHomePage = location.pathname === "/";

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
      className={`sgi-protected-root${showAdminFooter ? " sgi-protected-root--admin-footer" : ""}`}
      pb={showAdminFooter ? { base: "78px", md: "52px" } : 0}
      w="100%"
      maxW="100%"
      minH="100vh"
      bg={isHomePage ? "linear-gradient(135deg, #074025 0%, #2d8f3a 55%, #49f227 100%)" : "#f1f5f9"}
      overflowX="hidden"
    >
      <Outlet />
      {showAdminFooter ? <SgiAdminFixedFooter /> : null}
    </Box>
  );
}
