/**
 * Escribí tu URL de Supabase en .env para usar el backend con PostgreSQL.
 * Uso: node scripts/set-supabase-url.cjs "postgresql://postgres.xxx:TU_PASSWORD@..."
 * O:   npm run supabase:set -- "postgresql://..."
 * Guarda en raíz/.env y server/.env para que localhost siempre use Supabase.
 */
const fs = require("fs");
const path = require("path");

const url = process.argv[2];

if (!url || !url.startsWith("postgresql://")) {
  console.error("Uso: node scripts/set-supabase-url.cjs \"postgresql://postgres.xxx:password@...\"");
  console.error("Obtené la URL en Supabase → Project Settings → Database → Connection string (URI)");
  process.exit(1);
}

const key = "SUPABASE_DATABASE_URL=";
const line = key + url.trim() + "\n";

function writeEnv(envPath) {
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }
  if (content.includes(key)) {
    content = content.replace(new RegExp(key + "[^\n]*", "g"), line.trim());
  } else {
    content = content.trimEnd() + (content ? "\n" : "") + "\n# Supabase (backend)\n" + line;
  }
  fs.writeFileSync(envPath, content, "utf8");
}

const rootEnv = path.join(__dirname, "..", ".env");
const serverEnv = path.join(__dirname, "..", "server", ".env");

writeEnv(rootEnv);
writeEnv(serverEnv);

console.log("OK: SUPABASE_DATABASE_URL guardada en .env y server/.env");
console.log("Reiniciá con: npm run dev");
