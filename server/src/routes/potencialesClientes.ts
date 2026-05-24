import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

/** Base de datos lógica: POTENCIALES CLIENTES (leads de compra de mineros). */
export const potencialesClientesRouter = Router();
let schemaEnsured = false;

async function ensurePotencialesClientesSchema(): Promise<void> {
  if (schemaEnsured) return;

  if (db.isPostgres) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS potenciales_clientes (
          id BIGSERIAL PRIMARY KEY,
          created_at TEXT NOT NULL,
          nombre TEXT NOT NULL,
          apellidos TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          celular TEXT NOT NULL DEFAULT '',
          observaciones TEXT NOT NULL DEFAULT '',
          registered_by_email TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_potenciales_clientes_created ON potenciales_clientes(created_at DESC, id DESC)"
      )
      .run();
  } else {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS potenciales_clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          nombre TEXT NOT NULL,
          apellidos TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          celular TEXT NOT NULL DEFAULT '',
          observaciones TEXT NOT NULL DEFAULT '',
          registered_by_email TEXT NOT NULL DEFAULT ''
        )`
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_potenciales_clientes_created ON potenciales_clientes(created_at DESC, id DESC)"
      )
      .run();
  }

  await db
    .prepare(
      "ALTER TABLE potenciales_clientes ADD COLUMN IF NOT EXISTS registered_by_email TEXT NOT NULL DEFAULT ''"
    )
    .run();

  schemaEnsured = true;
}

const LeadPayloadSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  apellidos: z.string().trim().max(160).optional(),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Email inválido." }),
  celular: z.string().trim().max(80).optional(),
  observaciones: z.string().trim().max(4000).optional(),
});

type LeadRow = {
  id: number;
  created_at: string;
  nombre: string;
  apellidos: string;
  email: string;
  celular: string;
  observaciones: string;
  registered_by_email: string;
};

function mapLeadRow(raw: Record<string, unknown>) {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    createdAt: String(r.created_at ?? ""),
    nombre: String(r.nombre ?? ""),
    apellidos: String(r.apellidos ?? ""),
    email: String(r.email ?? ""),
    celular: String(r.celular ?? ""),
    observaciones: String(r.observaciones ?? ""),
    registeredByEmail: String(r.registered_by_email ?? ""),
  };
}

function csvEscapeCell(value: string): string {
  const s = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const EMAIL_DUPLICATE_MSG =
  "Ese email ya está registrado.";

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

async function leadWithEmailExists(email: string, excludeId?: number): Promise<boolean> {
  const key = normalizeEmailKey(email);
  if (!key) return false;
  const sql =
    excludeId != null && excludeId > 0
      ? `SELECT id FROM potenciales_clientes
         WHERE TRIM(email) != '' AND LOWER(TRIM(email)) = ? AND id != ?
         LIMIT 1`
      : `SELECT id FROM potenciales_clientes
         WHERE TRIM(email) != '' AND LOWER(TRIM(email)) = ?
         LIMIT 1`;
  const row =
    excludeId != null && excludeId > 0
      ? await db.prepare(sql).get(key, excludeId)
      : await db.prepare(sql).get(key);
  return row != null;
}

async function getLeadById(id: number): Promise<LeadRow | undefined> {
  return (await db
    .prepare(
      `SELECT id, created_at, nombre, apellidos, email, celular, observaciones, registered_by_email
       FROM potenciales_clientes WHERE id = ?`
    )
    .get(id)) as LeadRow | undefined;
}

potencialesClientesRouter.get(
  "/potenciales-clientes",
  requireRole("admin_a", "admin_b", "operador"),
  async (_req, res) => {
    await ensurePotencialesClientesSchema();
    const rows = (await db
      .prepare(
        `SELECT id, created_at, nombre, apellidos, email, celular, observaciones, registered_by_email
         FROM potenciales_clientes
         ORDER BY created_at DESC, id DESC`
      )
      .all()) as LeadRow[];
    res.json({ items: rows.map((x) => mapLeadRow(x as unknown as Record<string, unknown>)) });
  }
);

potencialesClientesRouter.post(
  "/potenciales-clientes",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensurePotencialesClientesSchema();
    const parsed = LeadPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Datos inválidos.";
      return res.status(400).json({ error: { message: msg } });
    }
    const d = parsed.data;
    const emailTrim = d.email?.trim() || "";
    if (emailTrim) {
      const duplicate = await leadWithEmailExists(emailTrim);
      if (duplicate) {
        return res.status(409).json({
          error: { message: EMAIL_DUPLICATE_MSG, code: "EMAIL_DUPLICATE" },
        });
      }
    }

    const createdAt = new Date().toISOString();
    const registeredByEmail = String(req.user?.email ?? req.user?.username ?? "")
      .trim()
      .slice(0, 254);

    const result = await db
      .prepare(
        `INSERT INTO potenciales_clientes (created_at, nombre, apellidos, email, celular, observaciones, registered_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createdAt,
        d.nombre,
        d.apellidos?.trim() || "",
        d.email?.trim() || "",
        d.celular?.trim() || "",
        d.observaciones?.trim() || "",
        registeredByEmail
      );

    const insertedId = Number(result.lastInsertRowid ?? 0);
    const inserted = (await db
      .prepare(
        `SELECT id, created_at, nombre, apellidos, email, celular, observaciones, registered_by_email
         FROM potenciales_clientes WHERE id = ?`
      )
      .get(insertedId)) as LeadRow | undefined;

    res.status(201).json({
      ok: true,
      item: inserted ? mapLeadRow(inserted as unknown as Record<string, unknown>) : null,
    });
  }
);

potencialesClientesRouter.put(
  "/potenciales-clientes/:id",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensurePotencialesClientesSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "ID inválido." } });
    }
    const existing = await getLeadById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Lead no encontrado." } });
    }

    const parsed = LeadPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Datos inválidos.";
      return res.status(400).json({ error: { message: msg } });
    }
    const d = parsed.data;
    const emailTrim = d.email?.trim() || "";
    if (emailTrim) {
      const duplicate = await leadWithEmailExists(emailTrim, id);
      if (duplicate) {
        return res.status(409).json({
          error: { message: EMAIL_DUPLICATE_MSG, code: "EMAIL_DUPLICATE" },
        });
      }
    }

    const result = await db
      .prepare(
        `UPDATE potenciales_clientes
         SET nombre = ?, apellidos = ?, email = ?, celular = ?, observaciones = ?
         WHERE id = ?`
      )
      .run(
        d.nombre,
        d.apellidos?.trim() || "",
        emailTrim,
        d.celular?.trim() || "",
        d.observaciones?.trim() || "",
        id
      );

    if (Number(result.changes ?? 0) === 0) {
      return res.status(404).json({ error: { message: "Lead no encontrado." } });
    }

    const updated = await getLeadById(id);
    res.json({
      ok: true,
      item: updated ? mapLeadRow(updated as unknown as Record<string, unknown>) : null,
    });
  }
);

potencialesClientesRouter.delete(
  "/potenciales-clientes/:id",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensurePotencialesClientesSchema();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: "ID inválido." } });
    }
    const result = await db.prepare("DELETE FROM potenciales_clientes WHERE id = ?").run(id);
    if (Number(result.changes ?? 0) === 0) {
      return res.status(404).json({ error: { message: "Lead no encontrado." } });
    }
    res.json({ ok: true });
  }
);

potencialesClientesRouter.get(
  "/potenciales-clientes/export.csv",
  requireRole("admin_a", "admin_b", "operador"),
  async (_req, res) => {
    await ensurePotencialesClientesSchema();
    const rows = (await db
      .prepare(
        `SELECT id, created_at, nombre, apellidos, email, celular, observaciones, registered_by_email
         FROM potenciales_clientes
         ORDER BY created_at DESC, id DESC`
      )
      .all()) as LeadRow[];

    const header = [
      "ID",
      "Fecha registro",
      "Nombre",
      "Apellidos",
      "Email",
      "Celular",
      "Observaciones",
      "Registrado por (SGI)",
    ];
    const lines = [
      header.join(";"),
      ...rows.map((r) => {
        const item = mapLeadRow(r as unknown as Record<string, unknown>);
        const fecha = item.createdAt
          ? new Date(item.createdAt).toLocaleString("es-UY", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        return [
          csvEscapeCell(String(item.id)),
          csvEscapeCell(fecha),
          csvEscapeCell(item.nombre),
          csvEscapeCell(item.apellidos),
          csvEscapeCell(item.email),
          csvEscapeCell(item.celular),
          csvEscapeCell(item.observaciones),
          csvEscapeCell(item.registeredByEmail),
        ].join(";");
      }),
    ];

    const bom = "\uFEFF";
    const body = bom + lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="potenciales-clientes-${stamp}.csv"`);
    res.send(body);
  }
);
