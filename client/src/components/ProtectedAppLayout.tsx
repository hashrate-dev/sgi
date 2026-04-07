import { Outlet } from "react-router-dom";
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
    <div className={showAdminFooter ? "sgi-protected-root--admin-footer" : undefined}>
      <Outlet />
      {showAdminFooter ? <SgiAdminFixedFooter /> : null}
    </div>
  );
}
