import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Raíz del monorepo (server/src/middleware → sube 3 niveles). */
const MONOREPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Misma carpeta que sirve Vite en dev: `/images/marketplace-uploads/...` */
export const MARKETPLACE_UPLOAD_DIR = path.join(
  MONOREPO_ROOT,
  "client",
  "public",
  "images",
  "marketplace-uploads"
);

export function ensureMarketplaceUploadDir(): void {
  fs.mkdirSync(MARKETPLACE_UPLOAD_DIR, { recursive: true });
}

function safeExt(original: string): string {
  const m = original.match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1]!.toLowerCase() : "";
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "";
  return ext === "jpeg" ? "jpg" : ext;
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      ensureMarketplaceUploadDir();
      cb(null, MARKETPLACE_UPLOAD_DIR);
    } catch (e) {
      cb(e instanceof Error ? e : new Error(String(e)), MARKETPLACE_UPLOAD_DIR);
    }
  },
  filename(_req, file, cb) {
    const ext = safeExt(file.originalname) || "jpg";
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    cb(null, name);
  },
});

/** single("file") — guarda en client/public/images/marketplace-uploads */
export const uploadMarketplaceImageMw = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype) ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/pjpeg";
    if (!ok) {
      cb(new Error("Solo imágenes (JPEG, PNG, WebP, GIF)."));
      return;
    }
    cb(null, true);
  },
}).single("file");
