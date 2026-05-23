import { Link } from "react-router-dom";
import { sgiHome } from "../lib/marketplacePaths.js";

/** Pie fijo estilo vitrina Hashrate: personal interno (admin, operador, lector) en `ProtectedAppLayout`. */
export function SgiAdminFixedFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="sgi-admin-fixed-footer" role="contentinfo" aria-label="Hashrate Space">
      <div className="sgi-admin-fixed-footer__row">
        <p className="sgi-admin-fixed-footer__copy mb-0">
          © {year} Hashrate Space. Todos los derechos reservados. ·{" "}
          <a href="https://hashrate.space" target="_blank" rel="noopener noreferrer">
            hashrate.space
          </a>
        </p>
        <Link to={sgiHome()} className="sgi-admin-fixed-footer__sgi">
          Sistema de Gestión Interna (SGI)
        </Link>
      </div>
    </footer>
  );
}
