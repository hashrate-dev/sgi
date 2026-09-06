import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import {
  createContabilidadMedioPago,
  deactivateContabilidadMedioPago,
  ensureContabilidadMediosPagoSchema,
  getContabilidadMedioPagoById,
  isMediosPagoCatalogAdmin,
  listContabilidadMediosPago,
  updateContabilidadMedioPago,
  updateContabilidadMedioPagoLogo,
} from "../lib/contabilidadMediosPagoCatalog.js";
import {
  marketplaceImageUploadUsesMemory,
  uploadMarketplaceImageMw,
} from "../middleware/marketplaceImageUpload.js";

export const contabilidadMediosPagoRouter = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOY_ROOT = path.resolve(__dirname, "..", "..", "..");

function resolveMedioPagoUploadDir(): string {
  const monorepo = path.join(DEPLOY_ROOT, "client", "public", "images", "medio-pago-uploads");
  const clientRoot = path.join(DEPLOY_ROOT, "public", "images", "medio-pago-uploads");
  try {
    if (fs.existsSync(path.join(DEPLOY_ROOT, "client", "public", "images"))) return monorepo;
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(path.join(DEPLOY_ROOT, "public", "images"))) return clientRoot;
  } catch {
    /* ignore */
  }
  return monorepo;
}

function requireMediosPagoCatalogAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isMediosPagoCatalogAdmin(req.user)) {
    res.status(403).json({ error: { message: "Solo el administrador jv@hashrate.space puede gestionar medios de pago." } });
    return;
  }
  next();
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

contabilidadMediosPagoRouter.get(
  "/contabilidad/medios-pago",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("finanzas_contabilidad"),
  async (_req, res) => {
    try {
      await ensureContabilidadMediosPagoSchema();
      const items = await listContabilidadMediosPago({ includeInactive: false });
      return res.json({
        items,
        canManage: isMediosPagoCatalogAdmin(_req.user),
      });
    } catch (e) {
      console.error("[contabilidad] GET /medios-pago", e);
      return res.status(500).json({ error: { message: "No se pudo cargar el catálogo de medios de pago." } });
    }
  }
);

contabilidadMediosPagoRouter.post(
  "/contabilidad/medios-pago",
  requireRole("admin_a", "admin_b"),
  requireModuleGrant("finanzas_contabilidad"),
  requireMediosPagoCatalogAdmin,
  async (req, res) => {
    const parsed = z
      .object({
        codigo: z.string().min(1).max(80).trim(),
        clase: z.enum(["FIAT", "CRIPTO"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Código inválido." } });
    }
    try {
      const item = await createContabilidadMedioPago(parsed.data.codigo, parsed.data.clase);
      return res.status(201).json({ ok: true, item });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CODIGO_DUPLICADO") {
        return res.status(409).json({ error: { message: "Ya existe un medio de pago con ese nombre." } });
      }
      if (msg === "CODIGO_VACIO" || msg === "CODIGO_LARGO") {
        return res.status(400).json({ error: { message: "Código inválido." } });
      }
      console.error("[contabilidad] POST /medios-pago", e);
      return res.status(500).json({ error: { message: "No se pudo crear el medio de pago." } });
    }
  }
);

contabilidadMediosPagoRouter.patch(
  "/contabilidad/medios-pago/:id",
  requireRole("admin_a", "admin_b"),
  requireModuleGrant("finanzas_contabilidad"),
  requireMediosPagoCatalogAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const parsed = z
      .object({
        codigo: z.string().min(1).max(80).trim().optional(),
        clase: z.enum(["FIAT", "CRIPTO"]).optional(),
      })
      .refine((d) => d.codigo != null || d.clase != null, { message: "Sin cambios" })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    try {
      const item = await updateContabilidadMedioPago(id, parsed.data);
      return res.json({ ok: true, item });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_ENCONTRADO") return res.status(404).json({ error: { message: "Medio de pago no encontrado." } });
      if (msg === "CODIGO_DUPLICADO") {
        return res.status(409).json({ error: { message: "Ya existe un medio de pago con ese nombre." } });
      }
      if (msg === "CODIGO_VACIO" || msg === "CODIGO_LARGO") {
        return res.status(400).json({ error: { message: "Código inválido." } });
      }
      console.error("[contabilidad] PATCH /medios-pago/:id", e);
      return res.status(500).json({ error: { message: "No se pudo actualizar el medio de pago." } });
    }
  }
);

contabilidadMediosPagoRouter.delete(
  "/contabilidad/medios-pago/:id",
  requireRole("admin_a", "admin_b"),
  requireModuleGrant("finanzas_contabilidad"),
  requireMediosPagoCatalogAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    try {
      await deactivateContabilidadMedioPago(id);
      return res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_ENCONTRADO") return res.status(404).json({ error: { message: "Medio de pago no encontrado." } });
      console.error("[contabilidad] DELETE /medios-pago/:id", e);
      return res.status(500).json({ error: { message: "No se pudo eliminar el medio de pago." } });
    }
  }
);

contabilidadMediosPagoRouter.post(
  "/contabilidad/medios-pago/:id/logo",
  requireRole("admin_a", "admin_b"),
  requireModuleGrant("finanzas_contabilidad"),
  requireMediosPagoCatalogAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    uploadMarketplaceImageMw(req, res, (err: unknown) => {
      if (err) {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
        let msg = err instanceof Error ? err.message : "Error al subir la imagen";
        if (code === "LIMIT_FILE_SIZE") {
          msg = marketplaceImageUploadUsesMemory()
            ? "La imagen es demasiado grande (máx. ~4 MB)."
            : "La imagen supera el tamaño máximo permitido (8 MB).";
        }
        return res.status(400).json({ error: { message: msg } });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "Id inválido." } });
    }
    const existing = await getContabilidadMedioPagoById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Medio de pago no encontrado." } });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: "Archivo requerido (campo file)." } });
    }

    let buf: Buffer;
    if (marketplaceImageUploadUsesMemory()) {
      if (!file.buffer?.length) {
        return res.status(400).json({ error: { message: "Archivo vacío." } });
      }
      buf = file.buffer;
    } else {
      const p = (file as Express.Multer.File & { path?: string }).path;
      if (!p) {
        return res.status(400).json({ error: { message: "Archivo no guardado." } });
      }
      try {
        buf = fs.readFileSync(p);
      } catch {
        return res.status(400).json({ error: { message: "No se pudo leer el archivo." } });
      }
    }

    const mime = sniffImageMime(buf);
    if (!mime) {
      return res.status(400).json({ error: { message: "Solo imágenes (JPEG, PNG, WebP, GIF)." } });
    }

    let logoUrl: string;
    if (marketplaceImageUploadUsesMemory()) {
      logoUrl = `data:${mime};base64,${buf.toString("base64")}`;
    } else {
      const dir = resolveMedioPagoUploadDir();
      fs.mkdirSync(dir, { recursive: true });
      const name = `medio-${id}-${Date.now()}-${randomBytes(4).toString("hex")}.${extFromMime(mime)}`;
      const dest = path.join(dir, name);
      fs.writeFileSync(dest, buf);
      const uploadedPath = (file as Express.Multer.File & { path?: string }).path;
      if (uploadedPath && uploadedPath !== dest) {
        try {
          fs.unlinkSync(uploadedPath);
        } catch {
          /* ignore */
        }
      }
      logoUrl = `/images/medio-pago-uploads/${name}`;
    }

    try {
      const item = await updateContabilidadMedioPagoLogo(id, logoUrl);
      return res.status(201).json({ ok: true, item });
    } catch (e) {
      console.error("[contabilidad] POST /medios-pago/:id/logo", e);
      return res.status(500).json({ error: { message: "No se pudo guardar el logo." } });
    }
  }
);
