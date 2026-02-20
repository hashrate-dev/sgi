import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";

const NICEHASH_API = "https://api2.nicehash.com";
const CACHE_TTL_MS = 90000; // 90 segundos

let cache: { rigs: NiceHashRigData[]; ts: number } | null = null;

export type NiceHashRigData = {
  rigId: string;
  name: string;
  status: "activo" | "inactivo" | "desconocido";
  profitability: string | null;
  profitabilityUsd: number | null;
};

function signRequest(
  apiKey: string,
  apiSecret: string,
  orgId: string,
  method: string,
  path: string,
  query: string,
  body?: string
): { "X-Auth": string; "X-Time": string; "X-Nonce": string; "X-Organization-Id": string } {
  const time = String(Date.now());
  const nonce = crypto.randomUUID();
  const sep = "\u0000";
  let input = [query, path, method, "", orgId, "", nonce, time, apiKey].join(sep);
  if (body !== undefined && body !== "") {
    input += sep + body;
  }
  const sig = crypto.createHmac("sha256", apiSecret).update(input, "utf8").digest("hex");
  return {
    "X-Auth": `${apiKey}:${sig}`,
    "X-Time": time,
    "X-Nonce": nonce,
    "X-Organization-Id": orgId,
  };
}

async function fetchNiceHashRigs(): Promise<NiceHashRigData[]> {
  const apiKey = env.NICEHASH_API_KEY;
  const apiSecret = env.NICEHASH_API_SECRET;
  const orgId = env.NICEHASH_ORG_ID;

  if (!apiKey || !apiSecret || !orgId) {
    return [];
  }

  const path = "/main/api/v2/mining/rigs2";
  const method = "GET";
  const query = "";
  const url = `${NICEHASH_API}${path}`;
  const headers = signRequest(apiKey, apiSecret, orgId, method, path, query);

  const resp = await fetch(url, {
    method,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`NiceHash API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    miningRigs?: Array<{
      rigId?: string;
      name?: string;
      status?: { enumName?: string };
      profitability?: string;
      localProfitability?: string;
      unpaidAmount?: string;
    }>;
  };

  const rigs: NiceHashRigData[] = [];
  const list = data.miningRigs ?? [];

  for (const r of list) {
    const rigId = r.rigId ?? "";
    const name = r.name ?? "Sin nombre";
    const statusStr = (r.status?.enumName ?? "").toLowerCase();
    const profitRaw = r.localProfitability ?? r.profitability ?? r.unpaidAmount ?? "";

    // Status: MINING=prendido, OFFLINE=apagado, BENTCHMARKING/LOW_HASHRATE/etc=desconocido
    let status: NiceHashRigData["status"] = "desconocido";
    if (statusStr === "mining" || statusStr === "online") {
      status = "activo";
    } else if (statusStr === "offline" || statusStr === "inactive") {
      status = "inactivo";
    } else if (statusStr === "low_hashrate" || statusStr === "benchmarking" || statusStr === "error") {
      status = "desconocido";
    } else if (statusStr) {
      status = statusStr.includes("off") || statusStr.includes("inactive") ? "inactivo" : "desconocido";
    }

    let profitability: string | null = null;
    let profitabilityUsd: number | null = null;
    if (profitRaw) {
      const num = parseFloat(profitRaw.replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(num)) {
        profitabilityUsd = num;
        profitability = num >= 0 ? `$${num.toFixed(4)}` : `-$${Math.abs(num).toFixed(4)}`;
      } else {
        profitability = profitRaw;
      }
    }

    rigs.push({ rigId, name, status, profitability, profitabilityUsd });
  }

  return rigs;
}

export const nicehashRouter = Router();

nicehashRouter.get("/nicehash/rigs", async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query?.refresh === "1" || req.query?.refresh === "true";

  if (!env.NICEHASH_API_KEY || !env.NICEHASH_API_SECRET || !env.NICEHASH_ORG_ID) {
    return res.json({
      rigs: [],
      message: "NiceHash no configurado. Agregá NICEHASH_API_KEY, NICEHASH_API_SECRET y NICEHASH_ORG_ID en .env",
    });
  }

  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) {
    return res.json({ rigs: cache.rigs });
  }

  try {
    const rigs = await fetchNiceHashRigs();
    cache = { rigs, ts: Date.now() };
    return res.json({ rigs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Error al consultar NiceHash: ${msg}` });
  }
});
