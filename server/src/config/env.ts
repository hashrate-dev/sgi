import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import dotenv from "dotenv";
import {
  effectiveResendFromEmail,
  normalizeResendApiKey,
  RESEND_DEFAULT_ONBOARDING_FROM,
  resendApiKeyLooksInvalid,
} from "./resendFrom.js";

// Cargar .env desde múltiples ubicaciones (localhost puede ejecutarse desde raíz o server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, "..", "..");
const projectRoot = path.join(serverDir, "..");

// 1) cwd (donde se ejecutó npm)
dotenv.config();
// 2) server/.env
const serverEnv = path.join(serverDir, ".env");
if (fs.existsSync(serverEnv)) dotenv.config({ path: serverEnv, override: true });
// 3) raíz del proyecto .env (set-supabase-url.cjs escribe aquí)
const rootEnv = path.join(projectRoot, ".env");
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv, override: true });
// 4) raíz .env.local (secretos locales frecuentes con Vite)
const rootLocal = path.join(projectRoot, ".env.local");
if (fs.existsSync(rootLocal)) dotenv.config({ path: rootLocal, override: true });
// 5) Resend solo (gitignored); evita mezclar con el .env principal
const resendLocal = path.join(projectRoot, ".env.resend.local");
if (fs.existsSync(resendLocal)) dotenv.config({ path: resendLocal, override: true });

/** Evita 401 de Resend por `re_re_…` (doble prefijo) o comillas en .env. */
(() => {
  const raw = process.env.RESEND_API_KEY;
  if (raw === undefined) return;
  const norm = normalizeResendApiKey(raw);
  if (norm !== String(raw).trim()) {
    process.env.RESEND_API_KEY = norm;
    if (process.env.NODE_ENV !== "production" && norm.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[email] RESEND_API_KEY se normalizó (comillas envolventes o prefijo re_ duplicado). Si Resend sigue con 401, creá otra clave en https://resend.com/api-keys"
      );
    }
  }
})();

const defaultSqlitePath = process.env.VERCEL ? "/tmp/data.db" : "data.db";
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  SQLITE_PATH: z.string().default(defaultSqlitePath),
  /** Orígenes permitidos separados por coma (ej. https://app.tudominio.com,http://localhost:5174). Si no se define, CORS refleja el Origin del cliente (modo actual). */
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("cambiar-en-produccion-secreto-jwt-muy-largo"),
  /** API key de Render (https://dashboard.render.com → Account Settings → API Keys). Usado para listar servicios y disparar deploy desde la app. */
  RENDER_API_KEY: z.string().optional(),
  /** Supabase: conexión directa a Postgres. Si está definida, la app usa PostgreSQL (Supabase) en lugar de SQLite. */
  SUPABASE_DATABASE_URL: z.string().min(10).optional(),
  /** Host del pooler (ej. aws-1-us-east-1.pooler.supabase.com). Copiar desde Supabase Dashboard. */
  SUPABASE_POOLER_HOST: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

(() => {
  const tok = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const to = process.env.WHATSAPP_NOTIFY_TO?.trim();
  if (tok && pid && to) {
    // eslint-disable-next-line no-console
    console.log(
      "[whatsapp] Avisos de órdenes (marketplace): activos (plantilla requiere aprobación en Meta; revisá logs al generar orden)."
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[whatsapp] Avisos de órdenes (marketplace): no configurados. Definí en .env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_NOTIFY_TO (y plantilla en Meta; ver server/docs/WHATSAPP_MARKETPLACE.md)."
    );
  }
})();

(() => {
  const apiKey = normalizeResendApiKey(process.env.RESEND_API_KEY);
  const from = effectiveResendFromEmail();
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || "sales@hashrate.space").trim();
  const devConsole =
    process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
  const badResendKey = Boolean(apiKey && resendApiKeyLooksInvalid(apiKey));
  if (badResendKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[email] RESEND_API_KEY inválida o mezclada con token de Vercel (no uses re_vcp_…). Creá una clave nueva en https://resend.com/api-keys (solo re_… de Resend)."
    );
  }
  if (apiKey && from && !badResendKey) {
    // eslint-disable-next-line no-console
    console.log(`[email] Avisos marketplace por email: activos (destino: ${to}, desde: ${from}).`);
    if (!process.env.RESEND_FROM_EMAIL?.trim() && from === RESEND_DEFAULT_ONBOARDING_FROM) {
      // eslint-disable-next-line no-console
      console.log(
        "[email] Si no llegan correos: con remitente de prueba Resend a veces solo se entrega a tu email de cuenta o hay que verificar dominio. Probá MARKETPLACE_NOTIFY_EMAIL_TO=tu_email@... (o delivered@resend.dev), revisá dashboard Resend → Emails y spam."
      );
    }
  } else if (devConsole) {
    // eslint-disable-next-line no-console
    console.log(
      badResendKey
        ? "[email] Avisos marketplace (desarrollo): clave Resend inválida — cada aviso se imprime en consola. Corregí RESEND_API_KEY (solo la clave re_… del dashboard de Resend)."
        : `[email] Avisos marketplace (desarrollo): sin API key — cada aviso se imprime en consola (destino sería ${to}). Definí RESEND_API_KEY en .env.resend.local (npm run resend:init) o en .env.`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[email] Avisos marketplace por email: no configurados. Definí RESEND_API_KEY (y opcional RESEND_FROM_EMAIL) en .env.resend.local o en el .env de la raíz / server/.env; reiniciá el proceso después de guardar."
    );
  }
})();

if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET.length < 32) {
    console.warn("[seguridad] JWT_SECRET debería tener al menos 32 caracteres en producción.");
  }
  if (env.JWT_SECRET.includes("cambiar-en-produccion") || env.JWT_SECRET === "cambiar-en-produccion-secreto-jwt-muy-largo") {
    console.warn("[seguridad] Cambiá JWT_SECRET: detectado valor por defecto de desarrollo.");
  }
  if (!env.CORS_ORIGIN?.trim()) {
    console.warn(
      "[seguridad] Definí CORS_ORIGIN en producción (URLs del front separadas por coma) para acotar orígenes permitidos."
    );
  }
}

