import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  SQLITE_PATH: z.string().default("data.db"),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(16).default("cambiar-en-produccion-secreto-jwt-muy-largo")
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

