/**
 * Descarga fotos del equipo desde el WordPress legado (179.27.153.62).
 * Ejecutar: node client/scripts/download-wp-team-images.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, "..", "public", "images", "wp-uploads");
const LEGACY_HOST = "hashrate.space";
const LEGACY_IP = "179.27.153.62";

const files = [
  "FB-Team-1-1024x991.png",
  "JV-Team-1024x991.png",
  "AF-Team-1024x991.png",
  "RG-1024x991.png",
  "AB-Team-1024x991.png",
  "DG-Team-HRS-1024x991.png",
];

function download(file) {
  return new Promise((resolve, reject) => {
    const out = path.join(dest, file);
    const req = http.get(
      {
        host: LEGACY_IP,
        path: `/wp-content/uploads/${file}`,
        headers: { Host: LEGACY_HOST },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (buf.length < 50_000) reject(new Error(`too small (${buf.length})`));
          else {
            fs.writeFileSync(out, buf);
            resolve(buf.length);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => req.destroy(new Error("timeout")));
  });
}

fs.mkdirSync(dest, { recursive: true });

for (const file of files) {
  const out = path.join(dest, file);
  if (fs.existsSync(out) && fs.statSync(out).size > 50_000) {
    console.log(`skip ${file}`);
    continue;
  }
  try {
    const n = await download(file);
    console.log(`OK ${file} (${n} bytes)`);
  } catch (e) {
    console.error(`MISSING ${file}: ${e.message}`);
  }
}
