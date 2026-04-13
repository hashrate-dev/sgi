import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Al cambiar de ruta, lleva el scroll al inicio del documento para que la página
 * se vea desde arriba (hero / cabecera). Si la URL incluye `#id`, intenta
 * centrar esa sección una vez montado el DOM.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const id = decodeURIComponent(hash.replace(/^#/, ""));
    const scrollToHash = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    };

    scrollToHash();
    const t = window.setTimeout(scrollToHash, 0);
    return () => window.clearTimeout(t);
  }, [pathname, hash]);

  return null;
}
