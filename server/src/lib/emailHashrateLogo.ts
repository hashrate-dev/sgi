import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_PUBLIC_ORIGIN } from "./publicAppOrigin.js";
import { HASHRATE_EMAIL_LOGO_DATA_URI } from "../generated/hashrateEmailLogoDataUri.embedded.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Rutas de respaldo en dev si el módulo generado no existe aún. */
function logoFileCandidates(): string[] {
  const cwd = process.cwd();
  const serverRoot = path.resolve(MODULE_DIR, "../..");
  const repoRoot = path.resolve(serverRoot, "..");
  return [
    path.join(serverRoot, "dist", "assets", "hashrate-LOGO.png"),
    path.join(cwd, "dist", "assets", "hashrate-LOGO.png"),
    path.join(cwd, "dist", "images", "wp-uploads", "hashrate-LOGO.png"),
    path.join(repoRoot, "dist", "images", "wp-uploads", "hashrate-LOGO.png"),
    path.join(repoRoot, "client", "public", "images", "wp-uploads", "hashrate-LOGO.png"),
    path.join(cwd, "client", "public", "images", "wp-uploads", "hashrate-LOGO.png"),
  ];
}

let cachedFileDataUri: string | null | undefined;

function readLogoFromDisk(): string | null {
  if (cachedFileDataUri !== undefined) return cachedFileDataUri;
  for (const filePath of logoFileCandidates()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      if (buf.length < 32) continue;
      cachedFileDataUri = `data:image/png;base64,${buf.toString("base64")}`;
      return cachedFileDataUri;
    } catch {
      /* siguiente candidato */
    }
  }
  cachedFileDataUri = null;
  return null;
}

/** Logo embebido (fiable en Gmail/Outlook); no depende de URL externa ni del SPA. */
export function getHashrateEmailLogoDataUri(): string | null {
  if (HASHRATE_EMAIL_LOGO_DATA_URI?.startsWith("data:image/png;base64,")) {
    return HASHRATE_EMAIL_LOGO_DATA_URI;
  }
  return readLogoFromDisk();
}

/** URL pública (último recurso). */
export function getHashrateEmailLogoPublicUrl(siteOrigin?: string): string {
  const base = (siteOrigin || CANONICAL_PUBLIC_ORIGIN).replace(/\/+$/, "");
  return `${base}/images/wp-uploads/hashrate-LOGO.png`;
}

/**
 * `<img>` para plantillas Resend: prioriza data URI embebido en el bundle del servidor.
 */
export function hashrateEmailLogoImgHtml(opts?: { siteOrigin?: string; heightPx?: number }): string {
  const height = opts?.heightPx ?? 44;
  const width = Math.round(height * (248 / 60));
  const src = getHashrateEmailLogoDataUri() || getHashrateEmailLogoPublicUrl(opts?.siteOrigin);
  return `<img src="${src}" alt="Hashrate Space" width="${width}" height="${height}" style="display:block;height:${height}px;width:auto;max-width:${width}px;border:0;outline:none;text-decoration:none" />`;
}
