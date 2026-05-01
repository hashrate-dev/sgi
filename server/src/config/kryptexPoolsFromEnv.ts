import { z } from "zod";
import { DEFAULT_KRYPTEX_POOL_CONFIGS } from "./kryptexPoolDefaults.js";

const PoolEntrySchema = z.object({
  url: z.string().url().max(500),
  workers: z.array(z.string().min(1).max(120)).min(1).max(50),
  usuario: z.string().min(1).max(120),
  modelo: z.string().min(1).max(200),
});

const PoolsJsonSchema = z.array(PoolEntrySchema).min(1).max(50);

export type KryptexPoolConfig = z.infer<typeof PoolEntrySchema>;

export function loadKryptexPoolConfigs(): KryptexPoolConfig[] {
  const raw = process.env.KRYPTEX_POOLS_JSON?.trim();
  if (!raw) return DEFAULT_KRYPTEX_POOL_CONFIGS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return PoolsJsonSchema.parse(parsed);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[kryptex] KRYPTEX_POOLS_JSON inválido; se usan pools por defecto. Definí un array JSON con url, workers, usuario, modelo.",
      e instanceof Error ? e.message : e
    );
    return DEFAULT_KRYPTEX_POOL_CONFIGS;
  }
}
