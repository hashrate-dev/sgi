/**
 * Rebuild FB-Team-1-1024x991.png igual que JV: círculo 728px, borde antialiased con alpha.
 * Fuente: FB-Team-1-1024x991.pre-align.png (WordPress original).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "../public/images/wp-uploads");
const srcPath = path.join(dir, "FB-Team-1-1024x991.pre-align.png");
const outPath = path.join(dir, "FB-Team-1-1024x991.png");
const jvPath = path.join(dir, "JV-Team-1024x991.png");

const W = 1024;
const H = 991;
const CX = 512;
const CY = 495;
const R = 364;

function isOutsideFrame(r, g, b, a) {
  if (a !== undefined && a <= 8) return true;
  return r <= 8 && g <= 8 && b <= 8;
}

async function extractPortrait() {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  let minX = w,
    maxX = 0,
    minY = h,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!isOutsideFrame(r, g, b, a)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return sharp(srcPath)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function circleMaskSvg() {
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="white"/>
    </svg>`
  );
}

async function buildTeamPhoto(portraitBuf) {
  const box = R * 2;
  const meta = await sharp(portraitBuf).metadata();
  const pw = meta.width ?? 1;
  const ph = meta.height ?? 1;
  const scale = Math.max(box / pw, box / ph);
  const rw = Math.round(pw * scale);
  const rh = Math.round(ph * scale);
  const focusY = 0.24;
  const left = Math.round(CX - rw / 2);
  const top = Math.round(CY - rh / 2 + (box - rh) * (focusY - 0.5));

  const scaled = await sharp(portraitBuf)
    .resize(rw, rh, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png()
    .toBuffer();

  const placed = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer();

  return sharp(placed)
    .composite([{ input: await sharp(circleMaskSvg()).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function measure(name, buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const ch = info.channels;
  let top = info.height,
    bottom = 0,
    maxSpan = 0;
  for (let y = 0; y < info.height; y++) {
    let l = -1,
      r = -1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (data[i + 3] > 8) {
        if (l < 0) l = x;
        r = x;
      }
    }
    const span = l >= 0 ? r - l + 1 : 0;
    if (span > 0) {
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (span > maxSpan) maxSpan = span;
    }
  }
  const px = (x, y) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  console.log(`${name}: span=${maxSpan} top=${top} bottom=${bottom} cy=${((top + bottom) / 2).toFixed(1)}`);
  for (let y = top; y <= top + 8; y++) {
    const [r, g, b, a] = px(512, y);
    console.log(`  edge y=${y}: rgb(${r},${g},${b}) a=${a}`);
  }
}

if (!fs.existsSync(srcPath)) {
  console.error("Missing source:", srcPath);
  process.exit(1);
}

const portrait = await extractPortrait();
const rebuilt = await buildTeamPhoto(portrait);
fs.writeFileSync(outPath, rebuilt);
console.log("Written:", outPath, rebuilt.length, "bytes");

await measure("JV ref", await fs.promises.readFile(jvPath));
await measure("FB rebuilt", rebuilt);
