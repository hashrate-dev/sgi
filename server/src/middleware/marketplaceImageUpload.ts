import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Desde `server/dist/middleware` o `server/src/middleware`: sube 3 niveles.
 * - Monorepo local: llega a la raíz del repo → `client/public/...`
 * - Vercel (bundle bajo `client/`): llega a `client/` → `public/...` (sin segundo `client/`)
 */
const DEPLOY_ROOT = path.resolve(__dirname, "..", "..", "..");

function resolveDiskUploadDir(): string {
  const monorepoImages = path.join(DEPLOY_ROOT, "client", "public", "images");
  const clientRootImages = path.join(DEPLOY_ROOT, "public", "images");
  try {
    if (fs.existsSync(monorepoImages)) {
      return path.join(monorepoImages, "marketplace-uploads");
    }
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(clientRootImages)) {
      return path.join(clientRootImages, "marketplace-uploads");
    }
  } catch {
    /* ignore */
  }
  if (process.env.VERCEL === "1") {
    return path.join(clientRootImages, "marketplace-uploads");
  }
  return path.join(monorepoImages, "marketplace-uploads");
}

export const MARKETPLACE_UPLOAD_DIR = resolveDiskUploadDir();

/** En Vercel el FS del bundle es de solo lectura salvo `/tmp`; guardamos la imagen en memoria y devolvemos data URL. */
export function marketplaceImageUploadUsesMemory(): boolean {
  return process.env.VERCEL === "1" || process.env.MARKETPLACE_UPLOAD_MEMORY === "1";
}

export function ensureMarketplaceUploadDir(): void {
  fs.mkdirSync(MARKETPLACE_UPLOAD_DIR, { recursive: true });
}

function safeExt(original: string): string {
  const m = original.match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1]!.toLowerCase() : "";
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "";
  return ext === "jpeg" ? "jpg" : ext;
}

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const mt = (file.mimetype || "").toLowerCase().trim();
  const ok =
    /^image\/(jpeg|png|gif|webp)$/i.test(mt) ||
    mt === "image/jpg" ||
    mt === "image/pjpeg" ||
    /** Windows / archivos sin extensión suelen subir como octet-stream; validamos firma en la ruta. */
    mt === "application/octet-stream" ||
    mt === "";
  if (!ok) {
    cb(new Error("Solo imágenes (JPEG, PNG, WebP, GIF)."));
    return;
  }
  cb(null, true);
};

const diskStorage = multer.diskStorage({
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

const memoryStorage = multer.memoryStorage();

/** Límite menor en memoria para no inflar respuestas JSON / filas en BD con data URLs. */
const LIMIT_DISK = 8 * 1024 * 1024;
const LIMIT_MEMORY = 2 * 1024 * 1024;

function buildUploadMw() {
  const useMem = marketplaceImageUploadUsesMemory();
  return multer({
    storage: useMem ? memoryStorage : diskStorage,
    limits: { fileSize: useMem ? LIMIT_MEMORY : LIMIT_DISK },
    fileFilter,
  }).single("file");
}

/** single("file") — disco en dev/monorepo; memoria + data URL en Vercel */
export const uploadMarketplaceImageMw = buildUploadMw();
