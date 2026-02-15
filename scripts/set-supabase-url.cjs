/**
 * Escribí tu URL de Supabase en .env para usar el backend con PostgreSQL.
 * Uso: node scripts/set-supabase-url.cjs "postgresql://postgres.xxx:TU_PASSWORD@..."
 * O:   npm run supabase:set -- "postgresql://..."
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const url = process.argv[2];

if (!url || !url.startsWith("postgresql://")) {
  console.error("Uso: node scripts/set-supabase-url.cjs \"postgresql://postgres.xxx:password@...\"");
  console.error("Obtené la URL en Supabase → Project Settings → Database → Connection string (URI)");
  process.exit(1);
}

let content = "";
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf8");
}

const key = "SUPABASE_DATABASE_URL=";
const line = key + url.trim() + "\n";

if (content.includes(key)) {
  content = content.replace(new RegExp(key + "[^\n]*", "g"), key + url.trim());
} else {
  content = content.trimEnd() + (content ? "\n" : "") + "\n# Supabase (backend)\n" + line;
}

fs.writeFileSync(envPath, content, "utf8");
console.log("OK: SUPABASE_DATABASE_URL guardada en .env. Reiniciá con: npm run dev");
