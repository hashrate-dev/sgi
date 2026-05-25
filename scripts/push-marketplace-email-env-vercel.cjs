#!/usr/bin/env node
/**
 * Sube variables de email marketplace (Resend + SMTP opcional) a Vercel.
 * Uso: npm run vercel:env:marketplace-email
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const RESEND_LOCAL_PATH = path.join(ROOT, ".env.resend.local");
const DEFAULT_TEAM_ID = "team_ZrFs7KNf947ZEMU0YbE1Ri05";
const DEFAULT_PROJECT_ID = "prj_mzDDYrMiQPXnQcHlWVpGUXoIfQ77";

const SMTP_KEYS = [
  "PASSWORD_RESET_SMTP_HOST",
  "PASSWORD_RESET_SMTP_PORT",
  "PASSWORD_RESET_SMTP_SECURE",
  "PASSWORD_RESET_SMTP_USER",
  "PASSWORD_RESET_SMTP_PASS",
  "PASSWORD_RESET_SMTP_FROM",
  "MARKETPLACE_SMTP_HOST",
  "MARKETPLACE_SMTP_PORT",
  "MARKETPLACE_SMTP_SECURE",
  "MARKETPLACE_SMTP_USER",
  "MARKETPLACE_SMTP_PASS",
  "MARKETPLACE_SMTP_FROM",
];

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

function httpsJson(method, urlString, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { ...headers, "Content-Length": Buffer.byteLength(body || "") },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          /* raw */
        }
        resolve({ status: res.statusCode || 0, json, raw: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function upsertEnv({ token, teamId, projectId, key, value, type, target }) {
  const qs = new URLSearchParams();
  qs.set("upsert", "true");
  if (teamId) qs.set("teamId", teamId);
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?${qs}`;
  const payload = JSON.stringify({
    key,
    value,
    type,
    target,
    comment: "Marketplace email (Resend/SMTP)",
  });
  return httpsJson(
    "POST",
    url,
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    payload
  );
}

async function main() {
  const token = (process.env.VERCEL_TOKEN || "").trim();
  const teamId = (process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || DEFAULT_TEAM_ID).trim();
  const projectId = (process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID).trim();

  if (!token) {
    console.error("Falta VERCEL_TOKEN. Ver docs/MARKETPLACE_EMAIL_VERCEL.md");
    process.exit(1);
  }

  const merged = { ...parseDotEnv(ENV_PATH), ...parseDotEnv(RESEND_LOCAL_PATH) };
  const target = ["production", "preview"];
  const pairs = [];

  const apiKey = (merged.RESEND_API_KEY || "").trim();
  const from = (merged.RESEND_FROM_EMAIL || "").trim();
  if (apiKey) pairs.push({ key: "RESEND_API_KEY", value: apiKey, type: "sensitive" });
  if (from) pairs.push({ key: "RESEND_FROM_EMAIL", value: from, type: "encrypted" });

  const contactTo = (merged.MARKETPLACE_CONTACT_EMAIL_TO || merged.MARKETPLACE_NOTIFY_EMAIL_TO || "sales@hashrate.space").trim();
  pairs.push({ key: "MARKETPLACE_CONTACT_EMAIL_TO", value: contactTo, type: "encrypted" });
  pairs.push({ key: "MARKETPLACE_NOTIFY_EMAIL_TO", value: contactTo, type: "encrypted" });

  for (const key of SMTP_KEYS) {
    const v = (merged[key] || "").trim();
    if (v) pairs.push({ key, value: v, type: key.includes("PASS") ? "sensitive" : "encrypted" });
  }

  const hasSmtp = SMTP_KEYS.some((k) => (merged[k] || "").trim());
  if (hasSmtp) {
    pairs.push({ key: "MARKETPLACE_SALES_SMTP_FIRST", value: "1", type: "encrypted" });
  }

  if (!apiKey && !hasSmtp) {
    console.error("Definí RESEND_API_KEY o PASSWORD_RESET_SMTP_* en .env / .env.resend.local");
    process.exit(1);
  }

  console.log(`Subiendo ${pairs.length} variable(s) a Vercel…`);
  for (const p of pairs) {
    const res = await upsertEnv({ token, teamId, projectId, ...p, target });
    if (res.status < 200 || res.status >= 300) {
      const msg = res.json?.error?.message || res.json?.message || res.raw || res.status;
      console.error(`Error en ${p.key}: HTTP ${res.status} — ${msg}`);
      process.exit(1);
    }
    console.log(`  OK ${p.key}`);
  }

  console.log("\nListo. Redeploy en Vercel.");
  if (!hasSmtp) {
    console.warn("\nSin SMTP en .env: verificá mail.hashrate.space en https://resend.com/domains o agregá SMTP (docs/MARKETPLACE_EMAIL_VERCEL.md).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
