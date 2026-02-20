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
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("cambiar-en-produccion-secreto-jwt-muy-largo"),
  /** API key de Render (https://dashboard.render.com → Account Settings → API Keys). Usado para listar servicios y disparar deploy desde la app. */
  RENDER_API_KEY: z.string().optional(),
  /** Supabase: conexión directa a Postgres. Si está definida, la app usa PostgreSQL (Supabase) en lugar de SQLite. */
  SUPABASE_DATABASE_URL: z.string().min(10).optional(),
  /** Host del pooler (ej. aws-1-us-east-1.pooler.supabase.com). Copiar desde Supabase Dashboard. */
  SUPABASE_POOLER_HOST: z.string().optional(),
  /** NiceHash API (opcional). Ver https://www.nicehash.com/my/settings/keys */
  NICEHASH_API_KEY: z.string().optional(),
  NICEHASH_API_SECRET: z.string().optional(),
  NICEHASH_ORG_ID: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

