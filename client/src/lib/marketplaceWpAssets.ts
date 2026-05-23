import { publicImageUrl } from "./marketplaceAsicCatalog.js";

/** Assets que antes vivían en WordPress (`/wp-content/uploads/`). Ahora en `public/images/wp-uploads/`. */
export function wpUpload(fileName: string): string {
  const name = fileName.replace(/^\//, "");
  return publicImageUrl(`/images/wp-uploads/${name}`);
}

export const HASHRATE_SPACE_LOGO = wpUpload("hashrate-LOGO.png");
export const HASHRATE_SPACE_LOGO_WHITE = wpUpload("hashrate-white-300x46.png");
