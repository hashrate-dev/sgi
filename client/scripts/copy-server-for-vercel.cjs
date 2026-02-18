const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const src = path.join(root, "server", "dist");
const dest = path.join(__dirname, "..", "server", "dist");
const schemaSrc = path.join(root, "server", "src", "db", "schema-supabase.sql");
const schemaDest = path.join(dest, "db", "schema-supabase.sql");
if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  if (fs.existsSync(schemaSrc)) {
    fs.mkdirSync(path.dirname(schemaDest), { recursive: true });
    fs.copyFileSync(schemaSrc, schemaDest);
  }
  console.log("Copied server/dist -> client/server/dist");
} else {
  console.warn("server/dist not found - run 'npm run build -w server' from project root first");
}
