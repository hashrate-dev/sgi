/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API (opcional en dev; si no se define, se usa `http://<host>:<VITE_API_PORT>`). */
  readonly VITE_API_URL?: string;
  /** En localhost: si `1` o `true`, la API es `https://hashrate.space` (mismos usuarios/datos que producción). */
  readonly VITE_USE_HASHRATE_SPACE_API?: string;
  /** @deprecated Usar `VITE_USE_HASHRATE_SPACE_API`. */
  readonly VITE_USE_APP_HASHRATE_SPACE_API?: string;
  /** Puerto del servidor Express en local (por defecto 8080). */
  readonly VITE_API_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
