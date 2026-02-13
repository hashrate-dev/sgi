import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const defaultSqlitePath = process.env.VERCEL ? "/tmp/data.db" : "data.db";
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  SQLITE_PATH: z.string().default(defaultSqlitePath),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("cambiar-en-produccion-secreto-jwt-muy-largo"),
  /** API key de Render (https://dashboard.render.com → Account Settings → API Keys). Usado para listar servicios y disparar deploy desde la app. */
  RENDER_API_KEY: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

