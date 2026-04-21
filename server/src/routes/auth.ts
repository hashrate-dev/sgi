import { Router, type Request } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { z, type ZodError } from "zod";
import { db } from "../db.js";
import { env } from "../config/env.js";
import {
  effectiveResendFromEmail,
  normalizeResendApiKey,
  RESEND_DEFAULT_ONBOARDING_FROM,
  resendApiKeyLooksInvalid,
} from "../config/resendFrom.js";
import { allocateNextTiendaOnlineClientCode, type TiendaSeqTx } from "../lib/tiendaOnlineClientCode.js";
import { getTiendaPhonesForUserId } from "../lib/tiendaClientContact.js";
import { requireAuth } from "../middleware/auth.js";
import { loginRateLimit, registerClienteRateLimit } from "../middleware/authRateLimit.js";
import type { AuthUser } from "../middleware/auth.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

const authRouter = Router();
const JWT_SECRET = env.JWT_SECRET;
const PASSWORD_RESET_TTL_MINUTES = 30;
const RESEND_API_URL = "https://api.resend.com/emails";
let passwordResetStorageReady = false;
const LoginSchema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1) });
const RegisterClienteSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  nombre: z.string().min(1).max(120).trim(),
  apellidos: z.string().min(1).max(120).trim(),
  country: z.string().min(2).max(100).trim(),
  city: z.string().min(1).max(100).trim(),
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

function registerFieldLabel(path: string): string {
  const k = path.toLowerCase();
  if (k === "email") return "correo electrónico";
  if (k === "password") return "contraseña";
  if (k === "nombre") return "nombre";
  if (k === "apellidos") return "apellidos";
  if (k === "country") return "país";
  if (k === "city") return "ciudad";
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

function resolvePublicAppOrigin(req: Request): string {
  const fromEnv = (process.env.APP_PUBLIC_URL || process.env.FRONTEND_ORIGIN || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const origin = String(req.headers.origin || "").trim();
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");
  const host = String(req.headers.host || "").trim();
  if (/localhost|127\.0\.0\.1/i.test(host)) return "http://localhost:5173";
  return "https://app.hashrate.space";
}

/** Resend en API key de prueba a veces solo permite entregar a un buzón (lo suele indicar en el JSON del 403). */
function parseResendSandboxInboxFrom403(bodyText: string): string | null {
  try {
    const j = JSON.parse(bodyText) as { message?: string };
    const msg = String(j.message || "");
    const m = msg.match(/\(\s*([^\s)]+@[^)\s]+)\s*\)/);
    if (m?.[1]) return m[1].trim().toLowerCase();
  } catch {
    /* ignore */
  }
  return null;
}

function isResendTestingRecipientRestriction403(status: number, bodyText: string): boolean {
  if (status !== 403 && status !== 422) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes("only send testing") ||
    t.includes("testing emails") ||
    t.includes("send emails to other recipients") ||
    (t.includes("recipient") && t.includes("testing"))
  );
}

/** Si Resend rechazó el remitente (dominio/from), probamos otro candidato antes de rendirnos. */
function shouldTryNextPasswordResetFrom(res: Response, bodyText: string): boolean {
  if (res.ok || res.status === 401) return false;
  if (isResendTestingRecipientRestriction403(res.status, bodyText)) return false;
  const t = bodyText.toLowerCase();
  if (res.status === 422 || res.status === 403 || res.status === 400) {
    return (
      /domain|verify|not verified|unauthorized|invalid|sender|from.?field|from_address|not allowed to use/i.test(
        bodyText
      ) || t.includes("validation_error")
    );
  }
  return false;
}

function passwordResetSandboxRelayEnabled(): boolean {
  const v = String(process.env.PASSWORD_RESET_RESEND_SANDBOX_RELAY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Si Resend falla por cualquier motivo (p. ej. dominio), enviar copia con el enlace a PASSWORD_RESET_RESEND_RELAY_TO / sales (solo con este flag en producción). */
function passwordResetRelayOnAnyFailure(): boolean {
  const v = String(process.env.PASSWORD_RESET_RELAY_ON_FAILURE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function passwordResetRelayInbox(): string {
  const explicit = String(process.env.PASSWORD_RESET_RESEND_RELAY_TO || "").trim().toLowerCase();
  if (explicit) return explicit;
  const notify = String(process.env.MARKETPLACE_NOTIFY_EMAIL_TO || "").trim().toLowerCase();
  if (notify) return notify;
  return "sales@hashrate.space";
}

/** Remitente solo para reset (no pisa avisos marketplace). Si no hay override, usa el mismo criterio que el resto de Resend. */
function passwordResetFromAddress(): string {
  const explicit = String(process.env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  if (explicit) return explicit;
  return effectiveResendFromEmail();
}

function passwordResetSmtpConfigured(): boolean {
  const host = String(process.env.PASSWORD_RESET_SMTP_HOST || "").trim();
  const user = String(process.env.PASSWORD_RESET_SMTP_USER || "").trim();
  const pass = String(process.env.PASSWORD_RESET_SMTP_PASS || "").trim();
  return !!(host && user && pass);
}

/**
 * Si definís PASSWORD_RESET_SMTP_* (p. ej. buzón de Google Workspace), el mismo mail con el enlace
 * se envía por SMTP al correo que pidió el reset — útil cuando Resend en prueba no entrega a ese destinatario.
 */
async function tryPasswordResetSmtpFallback(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!passwordResetSmtpConfigured()) return false;
  const host = String(process.env.PASSWORD_RESET_SMTP_HOST || "").trim();
  const user = String(process.env.PASSWORD_RESET_SMTP_USER || "").trim();
  const pass = String(process.env.PASSWORD_RESET_SMTP_PASS || "").trim();
  const rawPort = String(process.env.PASSWORD_RESET_SMTP_PORT || "587").trim();
  const parsedPort = Number.parseInt(rawPort, 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secureRaw = String(process.env.PASSWORD_RESET_SMTP_SECURE || "").trim().toLowerCase();
  const secure = secureRaw === "true" || secureRaw === "1" || port === 465;
  const from =
    String(process.env.PASSWORD_RESET_SMTP_FROM || process.env.PASSWORD_RESET_FROM_EMAIL || "").trim() || user;
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
  return true;
}

type PasswordResetSendMeta = { sandboxRelayTo?: string };

async function sendPasswordResetEmail(to: string, resetUrl: string, meta?: PasswordResetSendMeta): Promise<void> {
  const subject = "Recuperar contraseña · Hashrate Space";
  const text = `Recibimos una solicitud para restablecer tu contraseña.\n\nAbrí este enlace (válido por ${PASSWORD_RESET_TTL_MINUTES} minutos):\n${resetUrl}\n\nSi no solicitaste este cambio, podés ignorar este correo.`;
  const html = `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${resetUrl}">Restablecer contraseña</a> (válido por ${PASSWORD_RESET_TTL_MINUTES} minutos).</p><p>Si no solicitaste este cambio, podés ignorar este correo.</p>`;

  /**
   * SMTP (Workspace, etc.) entrega al correo que pidió el reset. En prod y en local va **antes** que Resend
   * para que el usuario reciba el mail en su buzón y no dependa del relay a sales@.
   */
  if (passwordResetSmtpConfigured()) {
    try {
      if (await tryPasswordResetSmtpFallback(to, subject, text, html)) return;
    } catch (smtpErr) {
      console.error("[auth] password-reset SMTP (prioritario al destinatario):", smtpErr);
    }
  }

  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const fromInitial = passwordResetFromAddress();
  if (!apiKey || resendApiKeyLooksInvalid(apiKey) || !fromInitial) {
    try {
      if (await tryPasswordResetSmtpFallback(to, subject, text, html)) return;
    } catch (smtpErr) {
      console.error("[auth] password-reset SMTP (sin Resend válido):", smtpErr);
    }
    if (env.NODE_ENV !== "production") {
      throw new Error(`RESET_EMAIL_NOT_CONFIGURED::${resetUrl}`);
    }
    throw new Error("Email provider no configurado.");
  }

  async function resendPost(from: string, recipient: string, subj: string, txt: string, htm: string, replyTo?: string) {
    const payload: Record<string, unknown> = {
      from,
      to: [recipient],
      subject: subj,
      text: txt,
      html: htm,
    };
    if (replyTo?.trim()) payload.reply_to = replyTo.trim();
    return fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const resendFromGlobal = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const fromCandidates = [fromInitial, resendFromGlobal, RESEND_DEFAULT_ONBOARDING_FROM]
    .map((x) => x.trim())
    .filter((x, i, arr) => x.length > 0 && arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

  let sendFrom = fromInitial;
  let res!: Response;
  let body = "";
  for (let i = 0; i < fromCandidates.length; i++) {
    sendFrom = fromCandidates[i]!;
    res = await resendPost(sendFrom, to, subject, text, html);
    body = await res.text().catch(() => "");
    if (res.ok) break;
    if (res.status === 401) break;
    const tryNext = i < fromCandidates.length - 1 && shouldTryNextPasswordResetFrom(res, body);
    if (!tryNext) break;
  }

  if (!res.ok) {
    try {
      if (await tryPasswordResetSmtpFallback(to, subject, text, html)) {
        return;
      }
    } catch (smtpErr) {
      console.error("[auth] password-reset SMTP fallback:", smtpErr);
    }
  }

  /**
   * Local: ante fallo Resend (salvo 401), relay al buzón del proyecto (modo prueba).
   * Producción: **no** relay a sales salvo que lo actives (`PASSWORD_RESET_RELAY_ON_FAILURE=1` o
   * `PASSWORD_RESET_RESEND_SANDBOX_RELAY=1` + error de prueba / remitente). Así el éxito implica entrega al usuario vía Resend o SMTP.
   */
  const testingRecipientBlock = isResendTestingRecipientRestriction403(res.status, body);
  const trySandboxRelay =
    !res.ok &&
    res.status !== 401 &&
    (env.NODE_ENV !== "production" ||
      passwordResetRelayOnAnyFailure() ||
      (passwordResetSandboxRelayEnabled() &&
        (testingRecipientBlock || shouldTryNextPasswordResetFrom(res, body))));

  if (trySandboxRelay) {
    const parsedInbox = parseResendSandboxInboxFrom403(body);
    const relay = (parsedInbox || passwordResetRelayInbox()).trim().toLowerCase();
    if (relay && relay !== to.trim().toLowerCase()) {
      const relaySubject = `${subject} (cuenta: ${to})`;
      const relayText = `Solicitud de restablecimiento para la cuenta: ${to}\n\nAbrí este enlace (válido por ${PASSWORD_RESET_TTL_MINUTES} minutos):\n${resetUrl}\n\nSi no solicitaste este cambio, ignorá este correo. Podés responder para contactar a ${to}.\n`;
      const relayHtml = `<p>Restablecimiento de contraseña para la cuenta <strong>${escapeHtml(to)}</strong>.</p><p><a href="${resetUrl}">Restablecer contraseña</a> (válido por ${PASSWORD_RESET_TTL_MINUTES} minutos).</p><p>Si no solicitaste este cambio, ignorá este correo. Reply-to: ${escapeHtml(to)}</p>`;
      const preferredFrom = String(process.env.PASSWORD_RESET_FROM_EMAIL || "").trim();
      const relayFromCandidates = [...new Set(["onboarding@resend.dev", preferredFrom, sendFrom].filter((x) => x.length > 0))];
      let lastRelayStatus = 0;
      let lastRelayBody = "";
      for (const rf of relayFromCandidates) {
        const resRelay = await resendPost(rf, relay, relaySubject, relayText, relayHtml, to);
        const bodyRelay = await resRelay.text().catch(() => "");
        lastRelayStatus = resRelay.status;
        lastRelayBody = bodyRelay;
        if (resRelay.ok) {
          if (meta) meta.sandboxRelayTo = relay;
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.log(`[auth] password-reset: Resend modo prueba → entregado a ${relay} (solicitó ${to}, from=${rf})`);
          } else if (testingRecipientBlock) {
            // eslint-disable-next-line no-console
            console.warn(
              `[auth] password-reset: envío directo a ${to} rechazado por Resend; enlace enviado por relay a ${relay}. Revisá clave API y dominio verificado (From @mail.hashrate.space).`
            );
          }
          return;
        }
      }
      throw new Error(`Resend ${lastRelayStatus}: ${lastRelayBody || "relay failed"}`);
    }
  }

  if (!res.ok) throw new Error(`Resend ${res.status}: ${body || res.statusText}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ensurePasswordResetStorage(): Promise<void> {
  if (passwordResetStorageReady) return;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      requested_ip TEXT,
      requested_user_agent TEXT
    )`
  ).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pwd_reset_user_created ON password_reset_tokens(user_id, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_created ON password_reset_tokens(email, created_at)").run();
  passwordResetStorageReady = true;
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
            null,
            body.city.trim(),
            emailNorm,
            null,
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
            null,
            body.city.trim(),
            emailNorm,
            null,
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
      return res.status(409).json({
        error: {
          code: "REGISTER_DUPLICATE_DATA",
          message:
            "Ya existe un registro con alguno de estos datos (correo, teléfono u otro campo único). Verificá la información e intentá nuevamente.",
        },
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("register-cliente:", e);
    const msgNorm = String(msg || "").toLowerCase();
    const userFacingMsg = msgNorm.includes("check constraint")
      ? "Hay datos inválidos en el formulario. Revisá los campos e intentá nuevamente."
      : msgNorm.includes("foreign key")
        ? "Hay una referencia inválida en los datos enviados. Revisá país, ciudad o celular."
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

const PasswordResetRequestSchema = z.object({
  email: z.string().email().max(200),
});

const PasswordResetConfirmSchema = z.object({
  token: z.string().min(20).max(300),
  password: z.string().min(6).max(100),
});

/** Solicitud de restablecimiento: valida que el correo exista; envía solo al correo indicado (sin reenvío salvo PASSWORD_RESET_RESEND_SANDBOX_RELAY). */
authRouter.post("/auth/password-reset-request", loginRateLimit, async (req, res) => {
  const parsed = PasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION", message: "Ingresá un correo electrónico válido." },
    });
  }
  const emailNorm = parsed.data.email.trim().toLowerCase();
  try {
    await ensurePasswordResetStorage();
    const sendMeta: PasswordResetSendMeta = {};
    const row = (await db
      .prepare("SELECT id, username, email FROM users WHERE LOWER(TRIM(COALESCE(email, username))) = ? LIMIT 1")
      .get(emailNorm)) as { id: number; username: string; email?: string | null } | undefined;
    if (!row?.id) {
      return res.status(404).json({
        error: { code: "INVALID_EMAIL", message: "MAIL INVALIDO" },
      });
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const now = new Date();
    const exp = new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000);
    const userId = Number(row.id);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const ua = String(req.headers["user-agent"] || "").slice(0, 500);
    await db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(now.toISOString(), userId);
    await db
      .prepare(
        `INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at, created_at, requested_ip, requested_user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(tokenHash, userId, emailNorm, exp.toISOString(), now.toISOString(), ip, ua);
    const origin = resolvePublicAppOrigin(req);
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendPasswordResetEmail(emailNorm, resetUrl, sendMeta);
    } catch (mailErr) {
      console.error("[auth] password-reset-request email:", mailErr);
      const mailMsg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      if (env.NODE_ENV !== "production") {
        const missingKeyHint = mailMsg.startsWith("RESET_EMAIL_NOT_CONFIGURED::")
          ? " Falta `RESEND_API_KEY` en `.env.resend.local` (reiniciá `npm run dev`)."
          : " En local, Resend a menudo no entrega a destinatarios que no sean el buzón autorizado del proyecto (modo prueba).";
        return res.status(200).json({
          ok: true,
          message: `Desarrollo: el correo no se pudo enviar a ${emailNorm}.${missingKeyHint} Usá este enlace (el token quedó guardado): ${resetUrl}`,
        });
      }
      try {
        await db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?").run(tokenHash);
      } catch (delErr) {
        console.error("[auth] password-reset-request rollback token:", delErr);
      }
      return res.status(422).json({
        error: {
          code: "EMAIL_SEND_FAILED",
          message: `No se pudo enviar el correo a ${emailNorm}. Usá clave Resend de producción y From @mail.hashrate.space, o definí PASSWORD_RESET_SMTP_* para enviar al usuario desde tu servidor de correo. Relay opcional a sales: PASSWORD_RESET_RELAY_ON_FAILURE=1.`,
        },
      });
    }
    const relayNote = sendMeta.sandboxRelayTo
      ? ` Revisá también ${sendMeta.sandboxRelayTo} si no ves el correo en ${emailNorm} (envío de respaldo en modo prueba Resend).`
      : "";
    return res.status(200).json({
      ok: true,
      message: `Te enviamos un enlace para restablecer la contraseña. Revisá tu correo (incluido spam).${relayNote}`,
    });
  } catch (e) {
    console.error("password-reset-request:", e);
    return res.status(500).json({ error: { message: "Error interno." } });
  }
});

/** Confirmación de restablecimiento: token de un solo uso. */
authRouter.post("/auth/password-reset-confirm", loginRateLimit, async (req, res) => {
  const parsed = PasswordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Token y contraseña válidos son obligatorios." } });
  }
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token.trim()).digest("hex");
  const nowIso = new Date().toISOString();
  try {
    await ensurePasswordResetStorage();
    const tok = (await db
      .prepare(
        `SELECT token_hash, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(tokenHash)) as { token_hash: string; user_id: number; expires_at: string; used_at?: string | null } | undefined;
    if (!tok || tok.used_at) {
      return res.status(400).json({ error: { message: "El enlace es inválido o ya fue utilizado." } });
    }
    if (String(tok.expires_at || "") <= nowIso) {
      return res.status(400).json({ error: { message: "El enlace expiró. Solicitá uno nuevo." } });
    }
    const newHash = bcrypt.hashSync(parsed.data.password, 10);
    await db.transaction(async (tx) => {
      await tx.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, tok.user_id);
      await tx.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?").run(nowIso, tok.token_hash);
      await tx
        .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND token_hash <> ? AND used_at IS NULL")
        .run(nowIso, tok.user_id, tok.token_hash);
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("password-reset-confirm:", e);
    return res.status(500).json({ error: { message: "No se pudo restablecer la contraseña." } });
  }
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
