const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const src = path.join(repoRoot, "client", "public", "images", "wp-uploads", "hashrate-LOGO.png");
const destDir = path.join(__dirname, "..", "dist", "assets");
const dest = path.join(destDir, "hashrate-LOGO.png");
const generatedDir = path.join(__dirname, "..", "src", "generated");
const generatedTs = path.join(generatedDir, "hashrateEmailLogoDataUri.embedded.ts");

if (!fs.existsSync(src)) {
  console.warn("[copy-email-logo] No se encontró", src);
  process.exit(0);
}

const buf = fs.readFileSync(src);
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);

fs.mkdirSync(generatedDir, { recursive: true });
const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
fs.writeFileSync(
  generatedTs,
  `/** Generado por scripts/copy-email-logo-asset.cjs — no editar a mano */\nexport const HASHRATE_EMAIL_LOGO_DATA_URI = ${JSON.stringify(dataUri)};\n`,
  "utf8"
);

console.log("[copy-email-logo] Copiado a", dest);
console.log("[copy-email-logo] Generado", generatedTs);
