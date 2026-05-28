import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_PUBLIC_ORIGIN } from "./publicAppOrigin.js";
import { HASHRATE_EMAIL_LOGO_DATA_URI } from "../generated/hashrateEmailLogoDataUri.embedded.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** ID para `<img src="cid:…">` y adjunto inline en Resend / Nodemailer. */
export const HASHRATE_EMAIL_LOGO_CID = "hashrate-logo";

export type ResendInlineLogoAttachment = {
  filename: string;
  content: string;
  content_id: string;
  content_type: string;
};

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

let cachedPng: Buffer | null | undefined;

function pngFromEmbeddedDataUri(): Buffer | null {
  if (!HASHRATE_EMAIL_LOGO_DATA_URI?.startsWith("data:image/png;base64,")) return null;
  try {
    return Buffer.from(HASHRATE_EMAIL_LOGO_DATA_URI.slice("data:image/png;base64,".length), "base64");
  } catch {
    return null;
  }
}

/** Bytes del PNG para adjuntos inline (Resend / SMTP). */
export function getHashrateEmailLogoPngBuffer(): Buffer | null {
  if (cachedPng !== undefined) return cachedPng;
  for (const filePath of logoFileCandidates()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const buf = fs.readFileSync(filePath);
      if (buf.length >= 32) {
        cachedPng = buf;
        return cachedPng;
      }
    } catch {
      /* siguiente */
    }
  }
  cachedPng = pngFromEmbeddedDataUri();
  return cachedPng;
}

/** Adjunto inline para Resend (`content_id` + `cid:` en HTML). Gmail no muestra data: URI. */
export function getHashrateEmailLogoResendAttachments(): ResendInlineLogoAttachment[] | undefined {
  const buf = getHashrateEmailLogoPngBuffer();
  if (!buf) return undefined;
  return [
    {
      filename: "hashrate-logo.png",
      content: buf.toString("base64"),
      content_id: HASHRATE_EMAIL_LOGO_CID,
      content_type: "image/png",
    },
  ];
}

/** URL pública si no hay adjunto (p. ej. vista previa sin Resend). */
export function getHashrateEmailLogoPublicUrl(siteOrigin?: string): string {
  const base = (siteOrigin || CANONICAL_PUBLIC_ORIGIN).replace(/\/+$/, "");
  return `${base}/images/wp-uploads/hashrate-LOGO.png`;
}

/**
 * `<img>` para plantillas: `cid:` cuando hay PNG; si no, URL pública.
 */
export function hashrateEmailLogoImgHtml(opts?: { siteOrigin?: string; heightPx?: number }): string {
  const height = opts?.heightPx ?? 44;
  const width = Math.round(height * (248 / 60));
  const hasInline = !!getHashrateEmailLogoPngBuffer();
  const src = hasInline ? `cid:${HASHRATE_EMAIL_LOGO_CID}` : getHashrateEmailLogoPublicUrl(opts?.siteOrigin);
  return `<img src="${src}" alt="Hashrate Space" width="${width}" height="${height}" style="display:block;height:${height}px;width:auto;max-width:${width}px;border:0;outline:none;text-decoration:none" />`;
}
