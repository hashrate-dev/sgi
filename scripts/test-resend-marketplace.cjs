#!/usr/bin/env node
/**
 * Prueba la API de Resend con la misma config que el server (lee .env.resend.local en la raíz).
 * Envía un mail mínimo a delivered@resend.dev (buzón de prueba de Resend).
 *
 * Uso: npm run resend:test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function badKey(k) {
  const s = (k || "").trim();
  if (!s.startsWith("re_")) return true;
  if (s.startsWith("re_vcp_") || s.includes("vcp_")) return true;
  return false;
}

async function main() {
  const merged = {
    ...parseDotEnv(path.join(ROOT, ".env")),
    ...parseDotEnv(path.join(ROOT, ".env.resend.local")),
  };
  const apiKey = (merged.RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim();
  if (!apiKey || badKey(apiKey)) {
    console.error("Falta RESEND_API_KEY válida (re_…) en .env.resend.local");
    process.exit(1);
  }

  const from = (merged.RESEND_FROM_EMAIL || "").trim() || "onboarding@resend.dev";
  const to = "delivered@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[Prueba Hashrate] Resend OK",
      text: "Si ves esto en Resend dashboard → Emails, la API key y el remitente funcionan.",
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Resend error HTTP", res.status, body);
    process.exit(1);
  }
  console.log("OK — Resend aceptó el envío a", to, "(revisá https://resend.com/emails )");
  try {
    console.log(JSON.parse(body));
  } catch {
    console.log(body);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
