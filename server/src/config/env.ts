import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import dotenv from "dotenv";

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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = (process.env.MARKETPLACE_NOTIFY_EMAIL_TO || "sales@hashrate.space").trim();
  const devConsole =
    process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_EMAIL_DEV_CONSOLE !== "0";
  if (apiKey && from) {
    // eslint-disable-next-line no-console
    console.log(`[email] Avisos marketplace por email: activos (destino: ${to}).`);
  } else if (devConsole) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] Avisos marketplace (desarrollo): sin Resend — cada aviso se imprime en consola (destino sería ${to}). Definí RESEND_API_KEY y RESEND_FROM_EMAIL para envío real.`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[email] Avisos marketplace por email: no configurados. Definí RESEND_API_KEY y RESEND_FROM_EMAIL en el .env de la raíz del repo o en server/.env (sin comillas; reiniciá el proceso después de guardar)."
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

