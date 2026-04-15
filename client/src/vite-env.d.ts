/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API (opcional en dev; si no se define, se usa `http://<host>:<VITE_API_PORT>`). */
  readonly VITE_API_URL?: string;
  /** Puerto del servidor Express en local (por defecto 8080). */
  readonly VITE_API_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
