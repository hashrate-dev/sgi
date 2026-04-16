import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z, type ZodError } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import { allocateNextTiendaOnlineClientCode, type TiendaSeqTx } from "../lib/tiendaOnlineClientCode.js";
import { getTiendaPhonesForUserId } from "../lib/tiendaClientContact.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit, registerClienteRateLimit } from "../middleware/authRateLimit.js";
import type { AuthUser } from "../middleware/auth.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

const authRouter = Router();
const JWT_SECRET = env.JWT_SECRET;
const LoginSchema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1) });
const RegisterClienteSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  nombre: z.string().min(1).max(120).trim(),
  apellidos: z.string().min(1).max(120).trim(),
  documentoIdentidad: z.string().min(3).max(120).trim(),
  country: z.string().min(2).max(100).trim(),
  city: z.string().min(1).max(100).trim(),
  direccion: z.string().min(3).max(300).trim(),
  celular: z.string().min(6).max(40).trim(),
  telefono: z.string().max(40).trim().optional(),
});

const DEFAULT_USERS: Array<{ email: string; password: string; role: "admin_a" | "admin_b" | "operador" | "lector" }> = [
  { email: "jv@hashrate.space", password: "admin123", role: "admin_a" },
  { email: "fb@hashrate.space", password: "123456", role: "admin_b" },
];

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "").toLowerCase();
  return code.includes("23505") || msg.includes("unique");
}

function isEmailUniqueViolation(err: unknown): boolean {
  const e = err as { message?: unknown; detail?: unknown; constraint?: unknown; column?: unknown };
  const haystack = [
    String(e?.message ?? ""),
    String(e?.detail ?? ""),
    String(e?.constraint ?? ""),
    String(e?.column ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("users.username") ||
    haystack.includes("users.email") ||
    haystack.includes("clients.email") ||
    haystack.includes("users_username_key") ||
    haystack.includes("users_email_key") ||
    haystack.includes("clients_email_key") ||
    haystack.includes(" username ") ||
    haystack.includes(" email ")
  );
}

function isDocumentoUniqueViolation(err: unknown): boolean {
  const e = err as { message?: unknown; detail?: unknown; constraint?: unknown; column?: unknown };
  const haystack = [
    String(e?.message ?? ""),
    String(e?.detail ?? ""),
    String(e?.constraint ?? ""),
    String(e?.column ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("documento_identidad") ||
    haystack.includes("clients_documento") ||
    haystack.includes("idx_clients_documento")
  );
}

function normalizeDocumentoIdentidad(input: string): string {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function registerFieldLabel(path: string): string {
  const k = path.toLowerCase();
  if (k === "email") return "correo electrónico";
  if (k === "password") return "contraseña";
  if (k === "nombre") return "nombre";
  if (k === "apellidos") return "apellidos";
  if (k === "documentoidentidad") return "documento/cédula";
  if (k === "country") return "país";
  if (k === "city") return "ciudad";
  if (k === "direccion") return "dirección";
  if (k === "celular") return "celular";
  if (k === "telefono") return "teléfono";
  return path;
}

function formatRegisterValidationMessage(zerr: ZodError): string {
  const issue = zerr.issues[0];
  if (!issue) {
    return "Completá todos los datos requeridos para crear la cuenta.";
  }
  const field = issue.path.length > 0 ? String(issue.path[0]) : "datos";
  const label = registerFieldLabel(field);
  const msg = String(issue.message || "").trim();
  if (!msg) return `Revisá el campo ${label}.`;
  if (msg.toLowerCase().includes("required")) return `Completá el campo ${label}.`;
  return `Revisá ${label}: ${msg}.`;
}

/** Asegurar que los usuarios por defecto existan (crear si no existen). */
async function ensureDefaultUser(): Promise<void> {
  for (const { email, password, role } of DEFAULT_USERS) {
    let existing = (await db.prepare("SELECT id FROM users WHERE username = ?").get(email)) as { id: number } | undefined;
    if (!existing) {
      try {
        existing = (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) as { id: number } | undefined;
      } catch {
        /* columna email no existe */
      }
    }
    const hash = bcrypt.hashSync(password, 10);
    if (!existing) {
      try {
        await db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)").run(email, email, hash, role);
      } catch {
        await db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(email, hash, role);
      }
    }
    /* No sobrescribir contraseña si el usuario ya existe: respeta "Cambiar contraseña" */
  }
  try {
    await db.prepare("UPDATE users SET email = username WHERE email IS NULL OR email = ''").run();
  } catch {
    /* columna email puede no existir en BD muy antigua */
  }
}

/** Registro público: cuenta `users` rol cliente + fila en `clients` (tienda online). */
authRouter.post("/auth/register-cliente", registerClienteRateLimit, async (req, res) => {
  const parsed = RegisterClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "REGISTER_VALIDATION_ERROR",
        message: formatRegisterValidationMessage(parsed.error),
      },
    });
  }
  const body = parsed.data;
  const emailNorm = body.email.trim().toLowerCase();
  const documentoNorm = normalizeDocumentoIdentidad(body.documentoIdentidad);
  const password = body.password;
  const hash = bcrypt.hashSync(password, 10);
  const telefonoFijo = body.telefono?.trim() ? body.telefono.trim() : null;

  try {
    let dup: { id: number } | undefined;
    try {
      dup = (await db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(emailNorm, emailNorm)) as { id: number } | undefined;
    } catch {
      dup = (await db.prepare("SELECT id FROM users WHERE username = ?").get(emailNorm)) as { id: number } | undefined;
    }
    if (dup) {
      return res.status(409).json({
        error: {
          code: "EMAIL_ALREADY_REGISTERED",
          message:
            "Este correo electrónico ya está asociado a una cuenta en el sistema. No podés crear una cuenta nueva con el mismo correo. Si ya tenés usuario, iniciá sesión con tu contraseña.",
        },
      });
    }
    const dupClientEmail = (await db
      .prepare("SELECT id, user_id FROM clients WHERE LOWER(TRIM(COALESCE(email, ''))) = ? LIMIT 1")
      .get(emailNorm)) as { id: number; user_id?: number | null } | undefined;
    let reusableClientId: number | null = null;
    if (dupClientEmail) {
      const linkedUserId = Number(dupClientEmail.user_id ?? 0);
      if (Number.isFinite(linkedUserId) && linkedUserId > 0) {
        return res.status(409).json({
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message:
              "Este correo electrónico ya está asociado a una cuenta en el sistema. No podés crear una cuenta nueva con el mismo correo. Si ya tenés usuario, iniciá sesión con tu contraseña.",
          },
        });
      }
      const cid = Number(dupClientEmail.id);
      reusableClientId = Number.isFinite(cid) && cid > 0 ? cid : null;
    }
    const dupDocumento = (await db
      .prepare("SELECT id FROM clients WHERE LOWER(TRIM(COALESCE(documento_identidad, ''))) = ? LIMIT 1")
      .get(documentoNorm)) as { id: number } | undefined;
    if (dupDocumento) {
      return res.status(409).json({
        error: {
          code: "DOCUMENT_ALREADY_REGISTERED",
          message:
            "Este documento/cédula ya está asociado a una cuenta en el sistema. No podés crear otra cuenta con el mismo documento.",
        },
      });
    }

    await db.transaction(async (tx) => {
      const insUser = await tx
        .prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'cliente')")
        .run(emailNorm, emailNorm, hash);
      let uid = insUser.lastInsertRowid;
      if (uid == null || !Number.isFinite(Number(uid))) {
        const row = (await tx.prepare("SELECT id FROM users WHERE username = ?").get(emailNorm)) as { id: number } | undefined;
        uid = row?.id ?? null;
      }
      if (uid == null || !Number.isFinite(Number(uid))) {
        throw new Error("No se obtuvo el id de usuario tras el registro.");
      }
      if (reusableClientId != null) {
        await tx
          .prepare(
            `UPDATE clients
               SET name = ?,
                   name2 = ?,
                   phone = ?,
                   phone2 = ?,
                   email = ?,
                   address = ?,
                   city = ?,
                   usuario = ?,
                   documento_identidad = ?,
                   country = ?,
                   user_id = ?
             WHERE id = ?`
          )
          .run(
            body.nombre.trim(),
            body.apellidos.trim(),
            body.celular.trim(),
            telefonoFijo,
            emailNorm,
            body.direccion.trim(),
            body.city.trim(),
            emailNorm,
            body.documentoIdentidad.trim(),
            body.country.trim(),
            uid,
            reusableClientId
          );
      } else {
        const code = await allocateNextTiendaOnlineClientCode(tx as TiendaSeqTx);
        await tx
          .prepare(
            `INSERT INTO clients (code, name, name2, phone, phone2, email, email2, address, address2, city, city2, usuario, documento_identidad, country, user_id)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL, ?, ?, ?, ?)`
          )
          .run(
            code,
            body.nombre.trim(),
            body.apellidos.trim(),
            body.celular.trim(),
            telefonoFijo,
            emailNorm,
            body.direccion.trim(),
            body.city.trim(),
            emailNorm,
            body.documentoIdentidad.trim(),
            body.country.trim(),
            uid
          );
      }
    });
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      if (isEmailUniqueViolation(e)) {
        return res.status(409).json({
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message:
              "Este correo electrónico ya está asociado a una cuenta en el sistema. No podés crear una cuenta nueva con el mismo correo. Si ya tenés usuario, iniciá sesión con tu contraseña.",
          },
        });
      }
      if (isDocumentoUniqueViolation(e)) {
        return res.status(409).json({
          error: {
            code: "DOCUMENT_ALREADY_REGISTERED",
            message:
              "Este documento/cédula ya está asociado a una cuenta en el sistema. No podés crear otra cuenta con el mismo documento.",
          },
        });
      }
      return res.status(409).json({
        error: {
          code: "REGISTER_DUPLICATE_DATA",
          message:
            "Ya existe un registro con alguno de estos datos (documento, teléfono u otro campo único). Verificá la información e intentá nuevamente.",
        },
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("register-cliente:", e);
    const msgNorm = String(msg || "").toLowerCase();
    const userFacingMsg = msgNorm.includes("check constraint")
      ? "Hay datos inválidos en el formulario. Revisá los campos e intentá nuevamente."
      : msgNorm.includes("foreign key")
        ? "Hay una referencia inválida en los datos enviados. Revisá país, ciudad o documento."
        : env.NODE_ENV === "development"
          ? msg
          : "No se pudo crear la cuenta por un error del servidor. Intentá nuevamente en unos minutos.";
    return res.status(500).json({ error: { code: "REGISTER_FAILED", message: userFacingMsg } });
  }
  let row: { id: number; username: string; email?: string | null; password_hash: string; role: string; usuario?: string | null } | undefined;
  try {
    row = (await db.prepare("SELECT id, username, email, password_hash, role, usuario FROM users WHERE username = ?").get(emailNorm)) as typeof row;
  } catch {
    row = (await db.prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?").get(emailNorm)) as typeof row;
  }
  if (!row) {
    return res.status(500).json({ error: { message: "Cuenta creada pero no se pudo iniciar sesión." } });
  }
  const user: AuthUser = {
    id: row.id,
    username: row.username,
    email: row.email ?? row.username,
    role: row.role as AuthUser["role"],
    usuario: row.usuario ?? undefined,
    celular: body.celular.trim(),
    telefono: telefonoFijo ?? undefined,
  };
  const token = jwt.sign({ sub: row.username, userId: row.id }, JWT_SECRET, { expiresIn: "7d" });
  return res.status(201).json({ token, user });
});

authRouter.post("/auth/login", loginRateLimit, async (req, res) => {
  /* Solo desarrollo: evita sembrar credenciales por defecto en producción. */
  if (env.NODE_ENV !== "production") {
    try {
      await ensureDefaultUser();
    } catch (e) {
      console.warn("ensureDefaultUser (no bloquea login):", e);
    }
  }
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Usuario y contraseña requeridos" } });
  }
  const { username, password } = parsed.data;
  const loginName = username.trim();
  let row: { id: number; username: string; email?: string | null; password_hash: string; role: string; usuario?: string | null } | undefined;
  try {
    const raw = (await db.prepare("SELECT id, username, email, password_hash, role, usuario FROM users WHERE username = ? OR email = ?").get(loginName, loginName)) as Record<string, unknown> | undefined;
    row = raw ? (rowKeysToLowercase(raw) as typeof row) : undefined;
  } catch (e) {
    try {
      const raw = (await db.prepare("SELECT id, username, password_hash, role, usuario FROM users WHERE username = ?").get(loginName)) as Record<string, unknown> | undefined;
      row = raw ? (rowKeysToLowercase(raw) as typeof row) : undefined;
    } catch (e2) {
      console.error("login db error:", e2);
      return res.status(500).json({ error: { message: "Error al consultar usuario. Revisá la base de datos." } });
    }
  }
  if (!row) {
    return res.status(401).json({ error: { message: "Usuario o contraseña incorrectos" } });
  }
  const hashRaw = row.password_hash;
  const hash = typeof hashRaw === "string" ? hashRaw.trim() : "";
  if (!hash || !/^\$2[aby]\$\d{2}\$/.test(hash)) {
    console.warn("login: usuario sin password_hash bcrypt válido (id=%s)", row.id);
    return res.status(401).json({ error: { message: "Usuario o contraseña incorrectos" } });
  }
  let passwordOk = false;
  try {
    passwordOk = bcrypt.compareSync(password, hash);
  } catch (e) {
    console.error("login bcrypt compare:", e);
    return res.status(401).json({ error: { message: "Usuario o contraseña incorrectos" } });
  }
  if (!passwordOk) {
    return res.status(401).json({ error: { message: "Usuario o contraseña incorrectos" } });
  }
  try {
    const userId = typeof row.id === "number" ? row.id : Number(String(row.id).trim());
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(500).json({ error: { message: "Id de usuario inválido en la base de datos." } });
    }
    const { celular, telefono } = await getTiendaPhonesForUserId(userId);
    const user: AuthUser = {
      id: userId,
      username: row.username,
      email: row.email ?? row.username,
      role: row.role as AuthUser["role"],
      usuario: row.usuario ?? undefined,
      celular,
      telefono,
    };
    const token = jwt.sign({ sub: row.username, userId }, JWT_SECRET, { expiresIn: "7d" });
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const userAgent = (req.headers["user-agent"] as string) || "";
    try {
      await db.prepare("INSERT INTO user_activity (user_id, event, ip_address, user_agent) VALUES (?, 'login', ?, ?)").run(userId, ip, userAgent);
    } catch (e) {
      console.error("user_activity login insert:", e);
    }
    return res.json({ token, user });
  } catch (e) {
    console.error("login sign error:", e);
    return res.status(500).json({ error: { message: "Error al generar la sesión." } });
  }
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/auth/verify-password", requireAuth, async (req, res) => {
  const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Contraseña requerida" } });
  }
  const userId = req.user!.id;
  const password = parsed.data.password.trim();
  let row: { password_hash?: string; username?: string } | undefined;
  try {
    row = (await db.prepare("SELECT password_hash, username FROM users WHERE id = ?").get(userId)) as typeof row;
  } catch (e) {
    console.error("verify-password db error:", e);
    return res.status(500).json({ error: { message: "Error al consultar usuario" } });
  }
  if (!row) {
    return res.status(401).json({ error: { message: "Usuario no encontrado" } });
  }
  const rowAny = row as Record<string, unknown>;
  const hash = (row.password_hash ?? rowAny.password_hash ?? rowAny.Password_hash) as string | undefined;
  const valid = hash && typeof hash === "string" && bcrypt.compareSync(password, hash);
  if (valid) {
    return res.json({ valid: true });
  }
  /* Solo desarrollo: bypass conocido para columnas raras en SQLite/Postgres (no usar en producción). */
  const isAdminA = req.user!.role === "admin_a" || row.username === "jv@hashrate.space";
  if (env.NODE_ENV !== "production" && isAdminA && password === "admin123") {
    try {
      const newHash = bcrypt.hashSync("admin123", 10);
      await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, userId);
      return res.json({ valid: true });
    } catch (e) {
      console.error("verify-password repair:", e);
    }
  }
  return res.status(401).json({ error: { message: "Contraseña incorrecta" } });
});

authRouter.post("/auth/logout", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const userAgent = (req.headers["user-agent"] as string) || "";
  try {
    const now = new Date();
    let durationSec: number | null = null;
    const lastLogin = (await db.prepare(
      "SELECT id, created_at FROM user_activity WHERE user_id = ? AND event = 'login' AND duration_seconds IS NULL ORDER BY created_at DESC LIMIT 1"
    ).get(userId)) as { id: number; created_at: string } | undefined;
    if (lastLogin) {
      const loginAt = new Date(lastLogin.created_at).getTime();
      durationSec = Math.round((now.getTime() - loginAt) / 1000);
      await db.prepare("UPDATE user_activity SET duration_seconds = ? WHERE id = ?").run(durationSec, lastLogin.id);
    }
    await db.prepare(
      "INSERT INTO user_activity (user_id, event, ip_address, user_agent, duration_seconds) VALUES (?, 'logout', ?, ?, ?)"
    ).run(userId, ip, userAgent, durationSec);
  } catch (e) {
    console.error("user_activity logout:", e);
  }
  res.status(204).send();
});

export { authRouter, ensureDefaultUser };
