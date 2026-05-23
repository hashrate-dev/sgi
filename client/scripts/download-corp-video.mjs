/**
 * Descarga el vídeo institucional desde el WordPress legado (179.27.153.62).
 * Ejecutar: node client/scripts/download-corp-video.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, "..", "public", "video", "Hashrate-Farm-Py.mp4");
const LEGACY_HOST = "hashrate.space";
const LEGACY_IP = "179.27.153.62";

fs.mkdirSync(path.dirname(dest), { recursive: true });

if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
  console.log(`skip (exists, ${fs.statSync(dest).size} bytes)`);
  process.exit(0);
}

const req = http.get(
  {
    host: LEGACY_IP,
    path: "/video/Hashrate-Farm-Py.mp4",
    headers: { Host: LEGACY_HOST },
  },
  (res) => {
    if (res.statusCode !== 200) {
      console.error(`HTTP ${res.statusCode}`);
      res.resume();
      process.exit(1);
    }
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(dest, buf);
      console.log(`OK ${dest} (${buf.length} bytes)`);
    });
  }
);
req.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
req.setTimeout(600_000, () => req.destroy(new Error("timeout")));
