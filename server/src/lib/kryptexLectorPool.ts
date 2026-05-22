import { loadKryptexPoolConfigs } from "../config/kryptexPoolsFromEnv.js";

function normalizeUsuario(u: string): string {
  return (u ?? "").replace(/^@/, "").trim().toLowerCase();
}

/** Busca wallet/pool comparando usuario SGI, username y parte local del email con POOL_CONFIGS.usuario */
export function resolveKryptexWalletForUser(input: {
  usuario?: string | null;
  username?: string | null;
  email?: string | null;
}): { wallet: string; pool: string } | null {
  const candidates: string[] = [];
  const push = (v?: string | null) => {
    const t = (v ?? "").trim();
    if (!t) return;
    candidates.push(t);
    if (t.includes("@")) {
      const local = t.split("@")[0]?.trim();
      if (local) candidates.push(local);
    }
  };
  push(input.usuario);
  push(input.username);
  push(input.email);

  const seen = new Set<string>();
  const configs = loadKryptexPoolConfigs();
  for (const c of candidates) {
    const norm = normalizeUsuario(c);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const config = configs.find((x) => normalizeUsuario(x.usuario) === norm);
    if (!config) continue;
    const m = config.url.match(/\/miner\/stats\/(0x[a-fA-F0-9]+)/);
    const wallet = m?.[1];
    const poolMatch = config.url.match(/pool\.kryptex\.com\/([^/]+)\//);
    const pool = poolMatch?.[1] ?? "quai-scrypt";
    if (wallet) return { wallet, pool };
  }
  return null;
}

export function lectorHasKryptexPoolAssigned(input: {
  usuario?: string | null;
  username?: string | null;
  email?: string | null;
}): boolean {
  return resolveKryptexWalletForUser(input) != null;
}
