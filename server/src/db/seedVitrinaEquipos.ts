/**
 * Inserta en `equipos_asic` los 7 listados ASIC de vitrina (mismo contenido que el catálogo estático histórico)
 * solo si no existe ya una fila con ese `id`. No borra ni modifica datos existentes.
 */
import { getDb } from "../db.js";
import { initialPrecioHistorialJson } from "../lib/precioHistorialAsic.js";

function img(file: string): string {
  return `/images/${encodeURIComponent(file)}`;
}

const IMG_S21 = img("S21-catalog.png");
const GALLERY_S21 = [img("S21 - 1.jpg"), img("S21 - 5.png"), img("S21 - 6.png"), img("S21 - 7.png")];
const IMG_L9 = img("L9-catalog.png");
const GALLERY_L9 = [img("L9 - 1.jpg"), img("L9 - 2.png"), img("L9 - 3.png")];

type Seed = {
  id: string;
  numeroSerie: string;
  marca: string;
  modelo: string;
  procesador: string;
  precio: number;
  algo: "sha256" | "scrypt";
  hashrateLabel: string;
  image: string;
  gallery: string[];
  detailRows: Array<{ icon: string; text: string }>;
  yield: { line1: string; line2: string };
  sort: number;
};

const SEEDS: Seed[] = [
  {
    id: "vitrina_s21_pro_235",
    numeroSerie: "VIT-S21-235",
    marca: "Bitmain",
    modelo: "Antminer S21 Pro",
    procesador: "235 TH/s",
    precio: 4990,
    algo: "sha256",
    hashrateLabel: "235 TH/s",
    image: IMG_S21,
    gallery: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.950 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    yield: { line1: "~0,000111 BTC", line2: "≈ 7,48 USDT" },
    sort: 1,
  },
  {
    id: "vitrina_s21_pro_245",
    numeroSerie: "VIT-S21-245",
    marca: "Bitmain",
    modelo: "Antminer S21 Pro",
    procesador: "245 TH/s",
    precio: 5200,
    algo: "sha256",
    hashrateLabel: "245 TH/s",
    image: IMG_S21,
    gallery: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.950 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    yield: { line1: "Por día: ~0,00011572 BTC", line2: "Equivalente diario (USDT): ≈ 7,80 USDT" },
    sort: 2,
  },
  {
    id: "vitrina_s21_xp_270",
    numeroSerie: "VIT-S21XP-270",
    marca: "Bitmain",
    modelo: "Antminer S21 XP",
    procesador: "270 TH/s",
    precio: 5900,
    algo: "sha256",
    hashrateLabel: "270 TH/s",
    image: IMG_S21,
    gallery: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.800 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    yield: { line1: "~0,000127 BTC", line2: "≈ 8,60 USDT" },
    sort: 3,
  },
  {
    id: "vitrina_l9_15g",
    numeroSerie: "VIT-L9-15G",
    marca: "Bitmain",
    modelo: "Antminer L9",
    procesador: "15.000 MH/s",
    precio: 5700,
    algo: "scrypt",
    hashrateLabel: "15.000 MH/s",
    image: IMG_L9,
    gallery: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    yield: { line1: "~0,01914 LTC + ~72 DOGE", line2: "≈ 7,5 USDT" },
    sort: 4,
  },
  {
    id: "vitrina_l9_16g",
    numeroSerie: "VIT-L9-16G",
    marca: "Bitmain",
    modelo: "Antminer L9",
    procesador: "16.000 MH/s",
    precio: 6100,
    algo: "scrypt",
    hashrateLabel: "16.000 MH/s",
    image: IMG_L9,
    gallery: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    yield: { line1: "~0,02042 LTC + ~77 DOGE", line2: "≈ 8 USDT" },
    sort: 5,
  },
  {
    id: "vitrina_l9_165g",
    numeroSerie: "VIT-L9-165G",
    marca: "Bitmain",
    modelo: "Antminer L9",
    procesador: "16.500 MH/s",
    precio: 6200,
    algo: "scrypt",
    hashrateLabel: "16.500 MH/s",
    image: IMG_L9,
    gallery: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    yield: { line1: "~0,041 LTC + ~18.563 DOGE", line2: "≈ 46 USDT" },
    sort: 6,
  },
  {
    id: "vitrina_l9_17g",
    numeroSerie: "VIT-L9-17G",
    marca: "Bitmain",
    modelo: "Antminer L9",
    procesador: "17.000 MH/s",
    precio: 6600,
    algo: "scrypt",
    hashrateLabel: "17.000 MH/s",
    image: IMG_L9,
    gallery: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    yield: { line1: "~0,02169 LTC + ~82 DOGE", line2: "≈ 8,5 USDT" },
    sort: 7,
  },
];

const FECHA_PLACEHOLDER = "2025-01-01";

export async function runSeedVitrinaEquipos(): Promise<void> {
  const db = getDb();
  for (const s of SEEDS) {
    const exists = await db.prepare("SELECT 1 AS ok FROM equipos_asic WHERE id = ?").get(s.id);
    if (exists) continue;

    const precioHist = initialPrecioHistorialJson(s.precio, `${FECHA_PLACEHOLDER}T12:00:00.000Z`);
    await db
      .prepare(
        `INSERT INTO equipos_asic (
          id, numero_serie, fecha_ingreso, marca_equipo, modelo, procesador, precio_usd, observaciones,
          mp_visible, mp_algo, mp_hashrate_display, mp_image_src, mp_gallery_json, mp_detail_rows_json, mp_yield_json, mp_sort_order,
          mp_price_label, precio_historial_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        s.id,
        s.numeroSerie,
        FECHA_PLACEHOLDER,
        s.marca,
        s.modelo,
        s.procesador,
        s.precio,
        "Catálogo vitrina (seed inicial — editable en Gestión de Equipos ASIC)",
        1,
        s.algo,
        s.hashrateLabel,
        s.image,
        JSON.stringify(s.gallery),
        JSON.stringify(s.detailRows),
        JSON.stringify(s.yield),
        s.sort,
        null,
        precioHist
      );
  }
}
