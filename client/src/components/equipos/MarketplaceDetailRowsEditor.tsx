import { useEffect, useRef, useState } from "react";
import type { AsicDetailIcon } from "../../lib/marketplaceAsicCatalog";
import { AsicDetailSvg } from "../marketplace/AsicDetailIcon";
import "./MarketplaceDetailRowsEditor.css";

export const DETAIL_ROW_ICON_OPTIONS: { value: AsicDetailIcon; label: string }[] = [
  { value: "bolt", label: "Energía (rayo)" },
  { value: "chip", label: "Chip / monedas" },
  { value: "sun", label: "Refrigeración / aire" },
  { value: "btc", label: "Bitcoin" },
  { value: "dual", label: "Minería dual" },
];

function isDetailIcon(x: string): x is AsicDetailIcon {
  return x === "bolt" || x === "chip" || x === "sun" || x === "fan" || x === "droplet" || x === "btc" || x === "dual";
}

/** Presets de la fila fija «chip / monedas» (modal vitrina). */
export type CoinPreset =
  | "sha256"
  | "scrypt"
  | "zcash"
  | "moneroZephyr"
  | "ethernet100"
  | "capacityMax210"
  | "capacityMax308";

export const COIN_ROW_TEXT: Record<CoinPreset, string> = {
  sha256: "BTC / BCH / BSV · SHA-256",
  scrypt: "DOGE + LTC · Scrypt",
  zcash: "Zcash · Equihash",
  moneroZephyr: "Monero / Zephyr",
  ethernet100: "Ethernet RJ45 10/100M",
  capacityMax210: "Capacidad max. 210 unidades",
  capacityMax308: "Capacidad max. 308 unidades",
};

/** Refrigeración fija (icono sol en vitrina). */
export type CoolingPreset = "air" | "hydro";

export const COOLING_ROW_TEXT: Record<CoolingPreset, string> = {
  air: "Minero de Aire",
  hydro: "Minero Hydro",
};

/** Tipo de minería (Bitcoin, dual, Zcash o XMR en vitrina). */
export type MiningPreset = "bitcoin" | "dual" | "zcash" | "xmr";

export const MINING_ROW_BY_PRESET: Record<MiningPreset, { icon: AsicDetailIcon; text: string }> = {
  bitcoin: { icon: "btc", text: "Minería Bitcoin" },
  dual: { icon: "dual", text: "Minería Dual" },
  zcash: { icon: "dual", text: "Minería Zcash" },
  xmr: { icon: "dual", text: "Minería XMR" },
};

function isMiningCatalogRow(row: { icon: AsicDetailIcon; text: string }): boolean {
  return row.icon === "btc" || row.icon === "dual";
}

function miningPresetFromRow(row: { icon: AsicDetailIcon; text: string }): MiningPreset {
  const t = row.text.trim().toUpperCase();
  if (t.includes("XMR") || t.includes("MONERO")) return "xmr";
  if (t.includes("ZCASH") || t.includes("ZEC")) return "zcash";
  if (row.icon === "dual") return "dual";
  if (t.includes("DUAL")) return "dual";
  return "bitcoin";
}

/** Fila de refrigeración (fan = aire; droplet/sol legacy = hydro). */
function isCoolingSunRow(row: { icon: AsicDetailIcon; text: string }): boolean {
  if (row.icon !== "sun" && row.icon !== "fan" && row.icon !== "droplet") return false;
  const t = row.text.trim().toUpperCase();
  if (!t) return true;
  if (t.includes("HYDR")) return true;
  if (t.includes("AIRE") || t.includes("AIR")) return true;
  return false;
}

function coolingPresetFromText(text: string): CoolingPreset {
  const t = text.trim().toUpperCase();
  if (t.includes("HYDR")) return "hydro";
  return "air";
}

/** Icono contextual vitrina: ventilador (aire) o gota (hydro). */
function coolingTypeIconForPreset(coolingPreset: CoolingPreset): AsicDetailIcon {
  return coolingPreset === "air" ? "fan" : "droplet";
}

function isEthernetChipText(text: string): boolean {
  const t = text.trim().toUpperCase();
  return (
    t.includes("RJ45") ||
    (t.includes("ETHERNET") && (t.includes("10/100") || t.includes("100M"))) ||
    (t.includes("10/100") && t.includes("M"))
  );
}

/** Fila chip tipo rack/contenedor (capacidad en unidades). */
function capacityPresetFromChipText(text: string): "capacityMax210" | "capacityMax308" | null {
  const t = text.trim().toUpperCase();
  if (!t.includes("CAPACIDAD") || !(t.includes("UNIDAD") || t.includes("MAX"))) return null;
  if (t.includes("308")) return "capacityMax308";
  if (t.includes("210")) return "capacityMax210";
  return null;
}

function isCoinChipRow(row: { icon: AsicDetailIcon; text: string }): boolean {
  if (row.icon !== "chip") return false;
  const t = row.text.trim().toUpperCase();
  const hasBtcFamily =
    (t.includes("BTC") || t.includes("BCH") || t.includes("BSV")) && (t.includes("SHA") || t.includes("BTC"));
  const hasScryptFamily =
    (t.includes("DOGE") && (t.includes("LTC") || t.includes("LITECOIN"))) ||
    (t.includes("LTC") && t.includes("DOGE")) ||
    (t.includes("SCRYPT") && !t.includes("SHA-256"));
  const hasZcashFamily = t.includes("ZCASH") || t.includes("ZEC");
  const hasMoneroZephyrFamily = t.includes("MONERO") || t.includes("XMR") || t.includes("ZEPHYR") || t.includes("ZEPH");
  return (
    hasBtcFamily ||
    hasScryptFamily ||
    hasZcashFamily ||
    hasMoneroZephyrFamily ||
    isEthernetChipText(row.text) ||
    capacityPresetFromChipText(row.text) != null
  );
}

function coinPresetFromText(text: string): CoinPreset {
  const t = text.trim().toUpperCase();
  if (isEthernetChipText(text)) return "ethernet100";
  const cap = capacityPresetFromChipText(text);
  if (cap) return cap;
  if (
    (t.includes("DOGE") && (t.includes("LTC") || t.includes("LITECOIN"))) ||
    (t.includes("LTC") && t.includes("DOGE")) ||
    (t.includes("SCRYPT") && !t.includes("SHA-256"))
  ) {
    return "scrypt";
  }
  if (t.includes("ZCASH") || t.includes("ZEC")) {
    return "zcash";
  }
  if (t.includes("MONERO") || t.includes("XMR") || t.includes("ZEPHYR") || t.includes("ZEPH")) {
    return "moneroZephyr";
  }
  return "sha256";
}

/**
 * Separa JSON guardado en: preset de monedas, fila energía (siempre la primera del tipo rayo),
 * e ítems extra editables (sin quitar energía ni monedas del listado).
 * Orden persistido: [bolt, chip monedas, sun refrigeración, fila minería, ...extras] (como catálogo).
 */
export function extractDetailRowsForEditor(parsed: Array<{ icon: AsicDetailIcon; text: string }>): {
  preset: CoinPreset;
  powerRow: { icon: "bolt"; text: string };
  coolingPreset: CoolingPreset;
  miningPreset: MiningPreset;
  extraRows: Array<{ icon: AsicDetailIcon; text: string }>;
} {
  let preset: CoinPreset = "sha256";
  const rows = [...parsed];
  const coinIdx = rows.findIndex((r) => isCoinChipRow(r));
  if (coinIdx >= 0) {
    preset = coinPresetFromText(rows[coinIdx]!.text);
    rows.splice(coinIdx, 1);
  }
  const boltIdx = rows.findIndex((r) => r.icon === "bolt");
  let powerRow: { icon: "bolt"; text: string };
  if (boltIdx >= 0) {
    powerRow = { icon: "bolt", text: rows[boltIdx]!.text };
    rows.splice(boltIdx, 1);
  } else {
    powerRow = { icon: "bolt", text: "" };
  }
  let coolingPreset: CoolingPreset = "air";
  const coolIdx = rows.findIndex((r) => isCoolingSunRow(r));
  if (coolIdx >= 0) {
    coolingPreset = coolingPresetFromText(rows[coolIdx]!.text);
    rows.splice(coolIdx, 1);
  }
  let miningPreset: MiningPreset =
    preset === "scrypt" ? "dual" : preset === "zcash" ? "zcash" : "bitcoin";
  const miningIdx = rows.findIndex((r) => isMiningCatalogRow(r));
  if (miningIdx >= 0) {
    miningPreset = miningPresetFromRow(rows[miningIdx]!);
    rows.splice(miningIdx, 1);
  }
  return { preset, powerRow, coolingPreset, miningPreset, extraRows: rows };
}

export function buildDetailRowsFromEditor(
  preset: CoinPreset,
  powerRow: { icon: "bolt"; text: string },
  coolingPreset: CoolingPreset,
  miningPreset: MiningPreset,
  extraRows: Array<{ icon: AsicDetailIcon; text: string }>
): Array<{ icon: AsicDetailIcon; text: string }> {
  const coin = { icon: "chip" as const, text: COIN_ROW_TEXT[preset] };
  const coolIcon: AsicDetailIcon = coolingTypeIconForPreset(coolingPreset);
  const cooling = { icon: coolIcon, text: COOLING_ROW_TEXT[coolingPreset] };
  const mining = MINING_ROW_BY_PRESET[miningPreset];
  return [{ icon: "bolt", text: powerRow.text }, coin, cooling, { icon: mining.icon, text: mining.text }, ...extraRows];
}

/** Parsea vatios de textos tipo "3950 W", "3.950 W" (miles con punto). */
function parseBoltRowWatts(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)*)\s*W\b/i);
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
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Miles con punto (es-AR), p. ej. 24.000 — coherente con `parseBoltRowWatts`. */
function formatWattsGrouped(watts: number): string {
  const w = Math.max(0, Math.round(watts));
  return w.toLocaleString("es-AR", { maximumFractionDigits: 0, useGrouping: true });
}

function wattsTextFromNumber(watts: number): string {
  return `${formatWattsGrouped(watts)} W`;
}

/** Valor solo dígitos para el input (sin sufijo W). */
function wattsInputDisplayFromBoltText(text: string): string {
  const n = parseBoltRowWatts(text);
  if (n === null) return "";
  return formatWattsGrouped(n);
}

/** Interpreta lo que escribe el usuario: ignora puntos/comas de miles y letras (incl. W). */
function parseDigitsFromWattsInput(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s/g, "")
    .replace(/w/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, "");
  if (cleaned === "") return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 9_999_999);
}

export function parseDetailRowsJson(json: string): Array<{ icon: AsicDetailIcon; text: string }> {
  const t = json.trim();
  if (!t) return [];
  try {
    const raw = JSON.parse(t) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: Array<{ icon: AsicDetailIcon; text: string }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const icon = (item as { icon?: string }).icon;
      const text = (item as { text?: string }).text;
      const ic = typeof icon === "string" && isDetailIcon(icon) ? icon : "bolt";
      out.push({ icon: ic, text: typeof text === "string" ? text : "" });
    }
    return out;
  } catch {
    return [];
  }
}

/** JSON normalizado para API: solo filas con texto; iconos válidos. */
export function sanitizeDetailRowsForApi(json: string): string | null {
  const t = json.trim();
  if (!t) return null;
  try {
    const raw = JSON.parse(t) as unknown;
    if (!Array.isArray(raw)) return t;
    const out: Array<{ icon: AsicDetailIcon; text: string }> = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const icon = (item as { icon?: string }).icon;
      const text = String((item as { text?: unknown }).text ?? "").trim();
      if (!text) continue;
      const ic = typeof icon === "string" && isDetailIcon(icon) ? icon : "bolt";
      out.push({ icon: ic, text });
    }
    return out.length > 0 ? JSON.stringify(out) : null;
  } catch {
    return t;
  }
}

function commitFullRows(
  preset: CoinPreset,
  powerRow: { icon: "bolt"; text: string },
  coolingPreset: CoolingPreset,
  miningPreset: MiningPreset,
  extraRows: Array<{ icon: AsicDetailIcon; text: string }>,
  onChange: (json: string) => void
) {
  const full = buildDetailRowsFromEditor(preset, powerRow, coolingPreset, miningPreset, extraRows);
  onChange(JSON.stringify(full.map((r) => ({ icon: r.icon, text: r.text }))));
}

/** Formulario por filas: icono + texto; sincroniza con `mp_detail_rows_json`. */
export function MarketplaceDetailRowsEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (json: string) => void;
  disabled?: boolean;
}) {
  const parsed = parseDetailRowsJson(value);
  const { preset, powerRow, coolingPreset, miningPreset, extraRows } = extractDetailRowsForEditor(
    parsed.length > 0 ? parsed : []
  );
  const [iconMenuRow, setIconMenuRow] = useState<number | null>(null);
  const iconMenuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disabled) setIconMenuRow(null);
  }, [disabled]);

  useEffect(() => {
    if (iconMenuRow === null) {
      iconMenuWrapRef.current = null;
      return;
    }
    const onDocDown = (e: MouseEvent) => {
      const el = iconMenuWrapRef.current;
      if (el && !el.contains(e.target as Node)) setIconMenuRow(null);
    };
    document.addEventListener("mousedown", onDocDown, true);
    return () => document.removeEventListener("mousedown", onDocDown, true);
  }, [iconMenuRow]);

  function updatePowerRow(patch: Partial<{ text: string }>) {
    commitFullRows(preset, { ...powerRow, ...patch }, coolingPreset, miningPreset, extraRows, onChange);
  }

  function updateExtraRow(i: number, patch: Partial<{ icon: AsicDetailIcon; text: string }>) {
    const next = extraRows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    commitFullRows(preset, powerRow, coolingPreset, miningPreset, next, onChange);
  }

  function setCoinPreset(nextPreset: CoinPreset) {
    let nextMining = miningPreset;
    if (nextPreset === "zcash") {
      nextMining = "zcash";
    } else if (nextPreset === "moneroZephyr") {
      nextMining = "xmr";
    } else if (nextPreset === "scrypt") {
      if (nextMining === "bitcoin" || nextMining === "zcash" || nextMining === "xmr") nextMining = "dual";
    } else if (nextPreset === "sha256") {
      if (nextMining === "dual" || nextMining === "zcash" || nextMining === "xmr") nextMining = "bitcoin";
    } else {
      if (nextMining === "zcash" || nextMining === "xmr") nextMining = "bitcoin";
    }
    commitFullRows(nextPreset, powerRow, coolingPreset, nextMining, extraRows, onChange);
  }

  function setCoolingPreset(next: CoolingPreset) {
    commitFullRows(preset, powerRow, next, miningPreset, extraRows, onChange);
  }

  function setMiningPreset(next: MiningPreset) {
    commitFullRows(preset, powerRow, coolingPreset, next, extraRows, onChange);
  }

  function removeRow(i: number) {
    if (iconMenuRow === i) setIconMenuRow(null);
    const next = extraRows.filter((_, j) => j !== i);
    commitFullRows(preset, powerRow, coolingPreset, miningPreset, next, onChange);
  }

  return (
    <div className="fact-field">
      <div className="hrs-detail-rows__list">
        <div className="hrs-detail-rows__row hrs-detail-rows__row--power-fixed">
          <div className="hrs-detail-rows__icon-wrap">
            <div
              className="hrs-detail-rows__icon-display hrs-detail-rows__icon-display--static"
              title="Consumo eléctrico (fijo)"
              aria-hidden
            >
              <AsicDetailSvg kind="bolt" />
            </div>
          </div>
          <div className="hrs-detail-rows__watts-wrap hrs-detail-rows__watts-wrap--fixed">
            <input
              type="text"
              className="fact-input hrs-detail-rows__watts-number"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={wattsInputDisplayFromBoltText(powerRow.text)}
              disabled={disabled}
              placeholder="3.950"
              onChange={(e) => {
                const v = e.target.value;
                if (v.trim() === "") {
                  updatePowerRow({ text: "" });
                  return;
                }
                const n = parseDigitsFromWattsInput(v);
                if (n === null) return;
                updatePowerRow({ text: wattsTextFromNumber(n) });
              }}
              aria-label="Consumo en vatios"
            />
            <span className="hrs-detail-rows__watts-unit" aria-hidden>
              W
            </span>
          </div>
        </div>
        <div className="hrs-detail-rows__row hrs-detail-rows__row--coins-fixed">
          <div className="hrs-detail-rows__icon-wrap">
            <div
              className="hrs-detail-rows__icon-display hrs-detail-rows__icon-display--static"
              title="Monedas / algoritmo (fijo)"
              aria-hidden
            >
              <AsicDetailSvg kind="chip" />
            </div>
          </div>
          <select
            className="fact-input hrs-detail-rows__coins-select"
            value={preset}
            disabled={disabled}
            onChange={(e) => setCoinPreset(e.target.value as CoinPreset)}
            aria-label="Monedas y algoritmo"
          >
            <option value="sha256">{COIN_ROW_TEXT.sha256}</option>
            <option value="scrypt">{COIN_ROW_TEXT.scrypt}</option>
            <option value="zcash">{COIN_ROW_TEXT.zcash}</option>
            <option value="moneroZephyr">{COIN_ROW_TEXT.moneroZephyr}</option>
            <option value="ethernet100">{COIN_ROW_TEXT.ethernet100}</option>
            <option value="capacityMax210">{COIN_ROW_TEXT.capacityMax210}</option>
            <option value="capacityMax308">{COIN_ROW_TEXT.capacityMax308}</option>
          </select>
        </div>
        <div className="hrs-detail-rows__row hrs-detail-rows__row--cooling-fixed">
          <div className="hrs-detail-rows__icon-wrap">
            <div
              className="hrs-detail-rows__icon-display hrs-detail-rows__icon-display--static"
              title={coolingPreset === "air" ? "Ventilación / cooler" : "Refrigeración por agua"}
              aria-hidden
            >
              <AsicDetailSvg kind={coolingTypeIconForPreset(coolingPreset)} />
            </div>
          </div>
          <select
            className="fact-input hrs-detail-rows__coins-select"
            value={coolingPreset}
            disabled={disabled}
            onChange={(e) => setCoolingPreset(e.target.value as CoolingPreset)}
            aria-label="Tipo de refrigeración"
          >
            <option value="air">{COOLING_ROW_TEXT.air}</option>
            <option value="hydro">{COOLING_ROW_TEXT.hydro}</option>
          </select>
        </div>
        <div className="hrs-detail-rows__row hrs-detail-rows__row--mining-fixed">
          <div className="hrs-detail-rows__icon-wrap">
            <div
              className="hrs-detail-rows__icon-display hrs-detail-rows__icon-display--static"
              title="Tipo de minería (fijo)"
              aria-hidden
            >
              <AsicDetailSvg kind={MINING_ROW_BY_PRESET[miningPreset].icon} />
            </div>
          </div>
          <select
            className="fact-input hrs-detail-rows__coins-select"
            value={miningPreset}
            disabled={disabled}
            onChange={(e) => setMiningPreset(e.target.value as MiningPreset)}
            aria-label="Tipo de minería"
          >
            <option value="bitcoin">{MINING_ROW_BY_PRESET.bitcoin.text}</option>
            <option value="dual">{MINING_ROW_BY_PRESET.dual.text}</option>
            <option value="zcash">{MINING_ROW_BY_PRESET.zcash.text}</option>
            <option value="xmr">{MINING_ROW_BY_PRESET.xmr.text}</option>
          </select>
        </div>
        {extraRows.map((row, i) => (
          <div key={i} className="hrs-detail-rows__row">
            <div
              className="hrs-detail-rows__icon-wrap"
              ref={(el) => {
                if (i === iconMenuRow) iconMenuWrapRef.current = el;
              }}
            >
              <button
                type="button"
                className="hrs-detail-rows__icon-display"
                title="Cambiar icono"
                disabled={disabled}
                aria-label={`Icono: ${DETAIL_ROW_ICON_OPTIONS.find((o) => o.value === row.icon)?.label ?? row.icon}. Clic para cambiar.`}
                aria-expanded={iconMenuRow === i}
                onClick={() => setIconMenuRow(iconMenuRow === i ? null : i)}
              >
                <AsicDetailSvg kind={row.icon} />
              </button>
              {iconMenuRow === i && !disabled && (
                <div className="hrs-detail-rows__icon-flyout" role="listbox" aria-label="Elegir icono">
                  {DETAIL_ROW_ICON_OPTIONS.filter(
                    (o) =>
                      o.value !== "bolt" &&
                      o.value !== "sun" &&
                      o.value !== "fan" &&
                      o.value !== "droplet"
                  ).map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={row.icon === o.value}
                      disabled={disabled}
                      className={
                        "hrs-detail-rows__icon-flyout-btn" +
                        (row.icon === o.value ? " hrs-detail-rows__icon-flyout-btn--active" : "")
                      }
                      title={o.label}
                      onClick={() => {
                        updateExtraRow(i, { icon: o.value });
                        setIconMenuRow(null);
                      }}
                    >
                      <AsicDetailSvg kind={o.value} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {row.icon === "bolt" ? (
              <div className="hrs-detail-rows__watts-wrap">
                <input
                  type="text"
                  className="fact-input hrs-detail-rows__watts-number"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={wattsInputDisplayFromBoltText(row.text)}
                  disabled={disabled}
                  placeholder="3.950"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.trim() === "") {
                      updateExtraRow(i, { text: "" });
                      return;
                    }
                    const n = parseDigitsFromWattsInput(v);
                    if (n === null) return;
                    updateExtraRow(i, { text: wattsTextFromNumber(n) });
                  }}
                  aria-label={`Vatios fila extra ${i + 1}`}
                />
                <span className="hrs-detail-rows__watts-unit" aria-hidden>
                  W
                </span>
              </div>
            ) : (
              <input
                type="text"
                className="fact-input"
                value={row.text}
                disabled={disabled}
                onChange={(e) => updateExtraRow(i, { text: e.target.value })}
                placeholder="Texto del ítem"
                spellCheck={false}
                aria-label={`Texto fila ${i + 1}`}
              />
            )}
            <button
              type="button"
              className="btn btn-outline-danger btn-sm hrs-detail-rows__row-remove"
              disabled={disabled}
              onClick={() => removeRow(i)}
              title="Quitar fila"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
