import { Router } from "express";

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

function parseWorkerBlock(html: string, workerName: string): Omit<KryptexWorkerData, "poolUrl" | "usuario" | "modelo"> {
  const workerIdx = html.indexOf(workerName);
  if (workerIdx === -1) {
    return { name: workerName, hashrate24h: null, hashrate10m: null, status: "desconocido" };
  }
  const fragment = html.slice(workerIdx, workerIdx + 3500);
  const thMatch = fragment.match(/([\d.]+)\s*TH\/s/);
  const ghMatch = fragment.match(/([\d.]+)\s*GH\/s/);
  const hsMatch = fragment.match(/([\d.]+)\s*H\/s/);
  const hashrate24h = thMatch ? `${thMatch[1]} TH/s` : ghMatch ? `${ghMatch[1]} GH/s` : null;
  const hashrate10m = hsMatch ? `${hsMatch[1]} H/s` : null;
  const value10m = hsMatch ? parseFloat(hsMatch[1] ?? "0") : 0;
  const status: "activo" | "inactivo" | "desconocido" =
    hashrate10m === null ? "desconocido" : value10m > 0 ? "activo" : "inactivo";
  return { name: workerName, hashrate24h, hashrate10m, status };
}

export const kryptexRouter = Router();

kryptexRouter.get("/kryptex/workers", async (_req, res) => {
  const allWorkers: KryptexWorkerData[] = [];
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html,application/xhtml+xml",
  };

  try {
    for (const config of POOL_CONFIGS) {
      const resp = await fetch(config.url, { headers });
      if (!resp.ok) {
        allWorkers.push(
          ...config.workers.map((name) => ({
            name,
            hashrate24h: null as string | null,
            hashrate10m: null as string | null,
            status: "desconocido" as const,
            poolUrl: config.url,
            usuario: config.usuario,
            modelo: config.modelo,
          }))
        );
        continue;
      }
      const html = await resp.text();
      for (const workerName of config.workers) {
        const parsed = parseWorkerBlock(html, workerName);
        allWorkers.push({
          ...parsed,
          poolUrl: config.url,
          usuario: config.usuario,
          modelo: config.modelo,
        });
      }
    }
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
