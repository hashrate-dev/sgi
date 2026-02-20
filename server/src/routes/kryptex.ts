import { Router } from "express";

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 30000; // 30 segundos - datos frescos para S21/L7

const POOL_CONFIGS: Array<{
  url: string;
  workers: string[];
  usuario: string;
  modelo: string;
}> = [
  {
    url: "https://pool.kryptex.com/quai-sha256/miner/stats/0x006942Fa7a650523A80044d9A7fDBac7f093929F",
    workers: ["HashR2L4P3", "HashR2L6P8", "HashR2L4P4"],
    usuario: "Mariri",
    modelo: "S21 - 200 ths",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x00213cd13935074E78a34FBFa9cf432398a0e15D",
    workers: ["HashR2L11P2"],
    usuario: "Chivilcoy",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x006942Fa7a650523A80044d9A7fDBac7f093929F",
    workers: ["HashR2L2P4", "HashR2L10P2", "HashR2L4P2", "HashR2L9P4"],
    usuario: "Mariri",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0062E304D5d3B145326C69127f78FC68739c9c35",
    workers: ["HashR1L1P4"],
    usuario: "Cryptobros",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x000F983A501b754ebB500Fbca0C98b21D6F1C5f2",
    workers: ["HashR2L1P3", "HashR2L9P3", "HashR2L1P1", "HashR2L11P7"],
    usuario: "Hashrate",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x002D5872Ce22a3D66fEC2f798fC75ca5c165Cb77",
    workers: ["HashR2L9P6", "HashR2L10P7", "HashR2L9P2", "HashR2L10P6", "HashR1L1P7", "HashR2L10P4"],
    usuario: "Pirotto",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x001F760a31e623B27381B99ef278DC209AAAf98E",
    workers: ["HashR1L1P2"],
    usuario: "Valkyria",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0050fc078B89fbe0a59956187B30B4FdF8F261e9",
    workers: ["HashR2L10P5", "HashR2L11P8"],
    usuario: "Damasco",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x005Eb53eD5242eCed3A10BD92D2B81CA1dE8F4D5",
    workers: ["HashR2L10P3"],
    usuario: "Bala",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0049bad765B6c41dFFBF48526B5e970404E9D5Ff",
    workers: ["HashR2L1P8", "HashR2L9P8", "HashR2L1P2"],
    usuario: "Jlsoler",
    modelo: "L7",
  },
];

export type KryptexWorkerData = {
  name: string;
  hashrate24h: string | null;
  hashrate10m: string | null;
  status: "activo" | "inactivo" | "desconocido";
  poolUrl: string;
  usuario: string;
  modelo: string;
};

let cache: { workers: KryptexWorkerData[]; ts: number } | null = null;

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers, signal: ac.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

function parseWorkerBlock(html: string, workerName: string): Omit<KryptexWorkerData, "poolUrl" | "usuario" | "modelo"> {
  const workerIdx = html.indexOf(workerName);
  if (workerIdx === -1) {
    return { name: workerName, hashrate24h: null, hashrate10m: null, status: "desconocido" };
  }
  // Fragmento: solo el bloque de este worker. S21=TH/s, L7=GH/s.
  const fragment = html.slice(workerIdx, workerIdx + 2500);
  const thAll = [...fragment.matchAll(/([\d.]+)\s*TH\/s/gi)];
  const ghAll = [...fragment.matchAll(/([\d.]+)\s*GH\/s/gi)];
  const hashrate24h = thAll[0] ? `${thAll[0][1]} TH/s` : ghAll[0] ? `${ghAll[0][1]} GH/s` : null;

  // 10m: patrón explícito de Kryptex. Apagado = "0.00 H/s" o "0 H/s". Prendido = "X.XX TH/s" (S21) o "X.XX GH/s" (L7)
  const match10m = fragment.match(/Hashrate\s*\(\s*10\s*m\s*\)\s*:\s*([\d.]+)\s*(TH\/s|GH\/s|H\/s)/i);
  let hashrate10m: string | null = null;
  let value10m = 0;
  if (match10m) {
    const val = match10m[1] ?? "0";
    const unit = match10m[2] ?? "H/s";
    hashrate10m = `${val} ${unit}`;
    value10m = parseFloat(val);
    if (unit.toUpperCase().startsWith("H/") && value10m < 0.001) value10m = 0;
  } else {
    const hsMatch = fragment.match(/Hashrate\s*\(\s*10\s*m\s*\)\s*:\s*([\d.]+)\s*H\/s/i);
    if (hsMatch) {
      hashrate10m = `${hsMatch[1]} H/s`;
      value10m = parseFloat(hsMatch[1] ?? "0");
    } else {
      const useTh = thAll.length > 0;
      const match10mThGh = useTh ? thAll[1] : ghAll[1];
      const fallbackHs = fragment.match(/([\d.]+)\s*H\/s/);
      if (match10mThGh) {
        hashrate10m = useTh ? `${match10mThGh[1]} TH/s` : `${match10mThGh[1]} GH/s`;
        value10m = parseFloat(match10mThGh[1] ?? "0");
      } else if (fallbackHs) {
        hashrate10m = `${fallbackHs[1]} H/s`;
        value10m = parseFloat(fallbackHs[1] ?? "0");
      }
    }
  }
  const status: "activo" | "inactivo" | "desconocido" =
    hashrate10m === null ? "desconocido" : value10m > 0 ? "activo" : "inactivo";
  return { name: workerName, hashrate24h, hashrate10m, status };
}

export const kryptexRouter = Router();

kryptexRouter.get("/kryptex/workers", async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query?.refresh === "1" || req.query?.refresh === "true";
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
    return res.json({ workers: cache.workers });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  try {
    const results = await Promise.all(
      POOL_CONFIGS.map(async (config) => {
        try {
          const html = await fetchWithTimeout(config.url, headers);
          return config.workers.map((workerName) => {
            const parsed = parseWorkerBlock(html, workerName);
            return { ...parsed, poolUrl: config.url, usuario: config.usuario, modelo: config.modelo };
          });
        } catch {
          return config.workers.map((name) => ({
            name,
            hashrate24h: null as string | null,
            hashrate10m: null as string | null,
            status: "desconocido" as const,
            poolUrl: config.url,
            usuario: config.usuario,
            modelo: config.modelo,
          }));
        }
      })
    );
    const allWorkers = results.flat();
    cache = { workers: allWorkers, ts: Date.now() };
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ workers: allWorkers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar Kryptex: ${msg}` });
  }
});

kryptexRouter.get("/kryptex/worker/:name", async (req, res) => {
  const workerName = req.params.name;
  if (!workerName || !/^[a-zA-Z0-9_-]+$/.test(workerName)) {
    return res.status(400).json({ error: "Nombre de worker inválido" });
  }
  const config = POOL_CONFIGS.find((c) => c.workers.includes(workerName)) ?? POOL_CONFIGS[0];
  if (!config) {
    return res.status(500).json({ error: "No hay configuración de pools" });
  }
  try {
    const resp = await fetch(config.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) {
      return res.status(502).json({ error: "Kryptex no respondió", status: resp.status });
    }
    const html = await resp.text();
    const data = parseWorkerBlock(html, workerName);
    return res.json({
      worker: data.name,
      status: data.status,
      hashrate24h: data.hashrate24h,
      hashrate10m: data.hashrate10m,
      usuario: config.usuario,
      modelo: config.modelo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar Kryptex: ${msg}` });
  }
});
