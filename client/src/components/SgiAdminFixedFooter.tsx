import { Link } from "react-router-dom";

/** Pie fijo estilo vitrina Hashrate: solo se monta para administradores en `ProtectedAppLayout`. */
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
        <Link to="/" className="sgi-admin-fixed-footer__sgi">
          Sistema de Gestión Interna (SGI)
        </Link>
      </div>
    </footer>
  );
}
