/**
 * Script: convierte HASHRATELOGO.png a fondo transparente.
 * Mantiene los píxeles blancos/claros del logo y hace transparente el resto (fondo teal/cyan/verde).
 *
 * Uso (desde la raíz del proyecto client):
 *   node scripts/make-logo-transparent.mjs
 *
 * Requiere: npm install sharp (ya en devDependencies)
 */

import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public", "images");
const inputPath = join(publicDir, "HASHRATELOGO.png");
const outputPath = join(publicDir, "HASHRATELOGO.png");

if (!existsSync(inputPath)) {
  console.error("No se encuentra:", inputPath);
  process.exit(1);
}

// Umbral: píxeles más claros que esto se consideran "logo" (se mantienen), el resto fondo (transparente)
const BRIGHTNESS_THRESHOLD = 200;
const WHITE_CUTOFF = 245;

async function main() {
  const image = sharp(inputPath);
  const meta = await image.metadata();
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const base = i * channels;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    const brightness = (r + g + b) / 3;

    if (brightness >= BRIGHTNESS_THRESHOLD) {
      // Parte clara (logo blanco): mantener con opacidad según qué tan blanco
      const t = (brightness - BRIGHTNESS_THRESHOLD) / (255 - BRIGHTNESS_THRESHOLD);
      const alpha = brightness >= WHITE_CUTOFF ? 255 : Math.round(200 + 55 * t);
      data[base + 3] = alpha;
    } else {
      // Fondo: transparente
      data[base + 3] = 0;
    }
  }

  await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log("Listo. Logo con fondo transparente guardado en:", outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
