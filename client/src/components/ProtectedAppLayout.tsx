import { Outlet } from "react-router-dom";
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
  const showAdminFooter = Boolean(user && canManageUsers(user.role));

  return (
    <Box
      className={showAdminFooter ? "sgi-protected-root--admin-footer" : undefined}
      pb={showAdminFooter ? "84px" : 0}
      w="100%"
      maxW="100%"
      minH="100vh"
      bg="#f1f5f9"
      overflowX="hidden"
    >
      <Outlet />
      {showAdminFooter ? <SgiAdminFixedFooter /> : null}
    </Box>
  );
}
