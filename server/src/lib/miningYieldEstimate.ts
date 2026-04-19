/**
 * Estimación de rendimiento tipo WhatToMine sin API de pago:
 * - Bitcoin: difficulty (blockchain.info) + recompensa fija actual.
 * - LTC + DOGE (Scrypt merge): hashrate red + emisión LTC (Blockchair); DOGE vía relación merge calibrada vs WhatToMine.
 * - Precios spot: CoinGecko.
 */

/** Subsidio actual BTC por bloque (post abril 2024). Actualizar tras próximo halving. */
const BTC_BLOCK_REWARD = 3.125;
const BLOCKS_PER_DAY_BTC = 144;

/**
 * DOGE por cada 1 LTC en merge (misma referencia WhatToMine merged LTC+DOGE).
 * En la tabla "Day": Rewards LTC ≈ 0,021694 y Rewards DOGE ≈ 81,552731 → ~81,55 DOGE/día (el punto es decimal inglés, NO ochenta y un mil).
 * Ratio = 81.552731 / 0.021694 ≈ 3.759
 */
const MERGED_DOGE_PER_LTC_COIN = 81.552731 / 0.021694;

const COINGECKO_SIMPLE =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,litecoin,dogecoin&vs_currencies=usd";

export type AsicYieldItem = {
  id: string;
  algo: "sha256" | "scrypt";
  hashrate: string;
  detailRows?: Array<{ icon: string; text: string }>;
};

export type AsicYieldResult = {
  id: string;
  line1: string;
  line2: string;
  note: string;
};

/** "3.950 W" (miles) o "3800 W" */
export function parsePowerWattsFromDetails(detailRows?: Array<{ text: string }>): number | null {
  if (!detailRows?.length) return null;
  const str = detailRows.map((r) => r.text).join(" ");
  const m = str.match(/(\d+(?:[.,]\d+)*)\s*W\b/i);
  if (!m?.[1]) return null;
  let raw = m[1];
  if (raw.includes(".") && !raw.includes(",")) {
    const segs = raw.split(".");
    if (segs.length === 2 && segs[1]!.length === 3) {
      const a = parseInt(segs[0]!, 10);
      const b = parseInt(segs[1]!, 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a * 1000 + b;
    }
  }
  raw = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Hashrate SHA-256 en TH/s */
export function parseSha256Ths(hashrate: string): number | null {
  const t = hashrate.trim().replace(/\s+/g, " ");
  const m = /([\d.,]+)\s*TH\s*\/?\s*s/i.exec(t);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]!.replace(/\./g, "").replace(",", ".")) || parseFloat(m[1]!.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Scrypt en Gh/s (WhatToMine merged usa Gh/s para LTC y DOGE) */
/**
 * Hashrate para WhatToMine ZEC (coin 166): parámetro `hr` en **kh/s** (coincide con la calculadora web).
 * Ej.: "840 kSol/s", "840.000 kSol/s" (miles con punto y decimales en cero → 840).
 */
export function parseZcashKhForWtm(hashrate: string): number | null {
  const t = hashrate.trim().replace(/\s+/g, " ");
  const m = /([\d.,]+)\s*kSol\s*\/\s*s/i.exec(t);
  if (!m?.[1]) return null;
  const raw = m[1].trim();
  const parts = raw.split(".");
  if (parts.length === 2 && parts[1]!.length === 3 && /^\d+$/.test(parts[0]!) && /^\d{3}$/.test(parts[1]!)) {
    const hi = parseInt(parts[0]!, 10);
    const lo = parseInt(parts[1]!, 10);
    if (hi > 0 && hi <= 5000 && lo === 0) return hi;
  }
  const n = parseEuNumber(raw);
  return n != null && n > 0 && n < 1e6 ? n : null;
}

/** Minero ZEC/Equihash (p. ej. Antminer Z15): rendimiento vía WhatToMine, no vía snapshot LTC/BTC. */
export function detectZecEquihashYieldItem(item: AsicYieldItem): boolean {
  if (parseZcashKhForWtm(item.hashrate) != null) return true;
  const blob = `${item.hashrate} ${(item.detailRows ?? []).map((r) => r.text).join(" ")}`.toLowerCase();
  if (/\bz15\b/.test(blob) && /k\s*sol|ksol/.test(blob)) return true;
  if ((/\bzcash\b/.test(blob) || /\bzec\b/.test(blob) || /equihash/.test(blob)) && /k\s*sol|ksol/.test(blob)) return true;
  return false;
}

export function parseScryptGhs(hashrate: string): number | null {
  const t = hashrate.trim().replace(/\s+/g, " ");
  let m = /([\d.,]+)\s*GH\s*\/?\s*s/i.exec(t);
  if (m?.[1]) {
    const n = parseEuNumber(m[1]);
    return n != null && n > 0 ? n : null;
  }
  m = /([\d.,]+)\s*MH\s*\/?\s*s/i.exec(t);
  if (m?.[1]) {
    const raw = m[1]!;
    let mhs: number | null;
    if (/^\d+\.\d{3}$/.test(raw)) {
      const [a, b] = raw.split(".");
      mhs = parseInt(a! + b!, 10);
    } else {
      mhs = parseEuNumber(raw);
    }
    return mhs != null && mhs > 0 ? mhs / 1000 : null;
  }
  m = /([\d.,]+)\s*TH\s*\/?\s*s/i.exec(t);
  if (m?.[1]) {
    const n = parseEuNumber(m[1]);
    return n != null && n > 0 ? n * 1000 : null;
  }
  return null;
}

function parseEuNumber(s: string): number | null {
  const hasComa = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComa && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
    return parseFloat(s.replace(/,/g, ""));
  }
  if (hasComa) return parseFloat(s.replace(",", "."));
  if (hasDot && /^(\d+)\.(\d{3})$/.test(s)) return parseFloat(s.replace(".", ""));
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmtEsCompact(n: number, maxFrac: number): string {
  return n.toLocaleString("es-PY", { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

export type NetworkMiningSnapshot = {
  btcDifficulty: number;
  ltcHashrateHs: number;
  ltcBlocks24h: number;
  ltcInflationRaw24h: number;
  prices: { btc: number; ltc: number; doge: number };
};

export async function fetchNetworkMiningSnapshot(): Promise<NetworkMiningSnapshot | null> {
  try {
    const [diffText, ltcJson, geoJson] = await Promise.all([
      fetch("https://blockchain.info/q/getdifficulty", { headers: { Accept: "text/plain" } }).then((r) =>
        r.ok ? r.text() : Promise.reject(new Error("btc difficulty"))
      ),
      fetch("https://api.blockchair.com/litecoin/stats").then((r) => r.json()),
      fetch(COINGECKO_SIMPLE, {
        headers: { Accept: "application/json", "User-Agent": "HashrateSpace-Marketplace/1.0" },
      }).then((r) => r.json()),
    ]);

    const diff = parseFloat(diffText);
    if (!Number.isFinite(diff) || diff <= 0) return null;

    const ld: { hashrate_24h?: string; blocks_24h?: number; inflation_24h?: number } = ltcJson?.data ?? {};
    const nh = ld.hashrate_24h != null ? Number(ld.hashrate_24h) : NaN;
    const blocks = ld.blocks_24h != null ? Number(ld.blocks_24h) : NaN;
    const inflation = ld.inflation_24h != null ? Number(ld.inflation_24h) : NaN;
    if (!Number.isFinite(nh) || nh <= 0 || !Number.isFinite(blocks) || blocks <= 0 || !Number.isFinite(inflation))
      return null;

    const pb = geoJson?.bitcoin?.usd;
    const pl = geoJson?.litecoin?.usd;
    const pd = geoJson?.dogecoin?.usd;
    if (typeof pb !== "number" || typeof pl !== "number" || typeof pd !== "number") return null;

    return {
      btcDifficulty: diff,
      ltcHashrateHs: nh,
      ltcBlocks24h: blocks,
      ltcInflationRaw24h: inflation,
      prices: { btc: pb, ltc: pl, doge: pd },
    };
  } catch {
    return null;
  }
}

function btcPerDay(ths: number, snap: NetworkMiningSnapshot): number {
  const hrHs = ths * 1e12;
  const nh = (snap.btcDifficulty * Math.pow(2, 32)) / 600;
  if (!Number.isFinite(nh) || nh <= 0) return 0;
  return (hrHs / nh) * BLOCKS_PER_DAY_BTC * BTC_BLOCK_REWARD;
}

function ltcDogePerDay(ghs: number, snap: NetworkMiningSnapshot): { ltc: number; doge: number } {
  const minerHs = ghs * 1e9;
  const share = minerHs / snap.ltcHashrateHs;
  const ltcPerBlock = snap.ltcInflationRaw24h / snap.ltcBlocks24h / 1e8;
  const ltc = share * snap.ltcBlocks24h * ltcPerBlock;
  const doge = ltc * MERGED_DOGE_PER_LTC_COIN;
  return { ltc, doge };
}

export function estimateYieldForItem(item: AsicYieldItem, snap: NetworkMiningSnapshot): AsicYieldResult | null {
  if (item.algo === "sha256") {
    const ths = parseSha256Ths(item.hashrate);
    if (ths == null) return null;
    const btcDay = btcPerDay(ths, snap);
    if (!Number.isFinite(btcDay) || btcDay <= 0) return null;
    const grossUsd = btcDay * snap.prices.btc;
    return {
      id: item.id,
      line1: `≈ ${fmtEsCompact(btcDay, 6)} BTC`,
      line2: `≈ ${fmtEsCompact(grossUsd, 2)} USD`,
      note: "Estimación orientativa · sujeta a red y precios.",
    };
  }

  const ghs = parseScryptGhs(item.hashrate);
  if (ghs == null) return null;
  const { ltc, doge } = ltcDogePerDay(ghs, snap);
  if (!Number.isFinite(ltc) || !Number.isFinite(doge)) return null;
  const grossUsd = ltc * snap.prices.ltc + doge * snap.prices.doge;

  const dogeFmt = doge >= 100 ? fmtEsCompact(doge, 0) : fmtEsCompact(doge, 2);

  return {
    id: item.id,
    line1: `≈ ${fmtEsCompact(ltc, 5)} LTC + ≈ ${dogeFmt} DOGE`,
    line2: `≈ ${fmtEsCompact(grossUsd, 2)} USD`,
    note: "Estimación orientativa · sujeta a red y precios.",
  };
}

export function estimateAllYields(items: AsicYieldItem[], snap: NetworkMiningSnapshot | null): AsicYieldResult[] {
  if (!snap) return [];
  const out: AsicYieldResult[] = [];
  for (const it of items) {
    const y = estimateYieldForItem(it, snap);
    if (y) out.push(y);
  }
  return out;
}
