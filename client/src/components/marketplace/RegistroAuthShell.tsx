import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MARKETPLACE } from "../../lib/marketplacePaths.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

export type RegistroAuthShellMode = "login" | "signup";

type RegistroAuthShellProps = {
  mode: RegistroAuthShellMode;
  children: ReactNode;
  loginLinkState?: { from: "quote" };
  /** Ocultar tabs Iniciar sesión / Crear cuenta (p. ej. pantalla de acceso dedicada). */
  showToggle?: boolean;
};

/** Contenedor auth + tabs opcionales (registro y acceso tienda). */
export function RegistroAuthShell({
  mode,
  children,
  loginLinkState,
  showToggle = true,
}: RegistroAuthShellProps) {
  const { t } = useMarketplaceLang();
  const signupState = loginLinkState;

  return (
    <div className="market-registro-auth-shell">
      {showToggle ? (
        <div className="market-registro-auth-toggle" role="tablist" aria-label={t("reg.auth_toggle_aria")}>
        {mode === "login" ? (
          <span className="market-registro-auth-toggle__tab is-active" role="tab" aria-selected>
            {t("reg.toggle_signin")}
          </span>
        ) : (
          <Link
            to={MARKETPLACE.clientLogin}
            className="market-registro-auth-toggle__tab"
            role="tab"
            aria-selected={false}
            state={loginLinkState}
          >
            {t("reg.toggle_signin")}
          </Link>
        )}
        {mode === "signup" ? (
          <span className="market-registro-auth-toggle__tab is-active" role="tab" aria-selected>
            {t("reg.toggle_signup")}
          </span>
        ) : (
          <Link
            to={MARKETPLACE.clientSignup}
            className="market-registro-auth-toggle__tab"
            role="tab"
            aria-selected={false}
            state={signupState}
          >
            {t("reg.toggle_signup")}
          </Link>
        )}
      </div>
      ) : null}
      {children}
    </div>
  );
}
