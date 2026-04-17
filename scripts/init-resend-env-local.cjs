#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env.resend.local");
const example = path.join(root, ".env.resend.local.example");
if (fs.existsSync(target)) {
  console.log(
    ".env.resend.local ya existe. Agregá una línea sin #: RESEND_API_KEY=re_... (guardá y reiniciá npm run dev)."
  );
  process.exit(0);
}
if (!fs.existsSync(example)) {
  console.error("Falta .env.resend.local.example");
  process.exit(1);
}
fs.copyFileSync(example, target);
console.log(
  "Creado .env.resend.local — agregá una línea: RESEND_API_KEY=re_... (sin # al inicio), guardá y reiniciá npm run dev."
);
