#!/usr/bin/env node
/**
 * Sube RESEND_* (y opcional MARKETPLACE_NOTIFY_EMAIL_TO) desde .env y .env.resend.local
 * al proyecto de Vercel vía API, para Production + Preview.
 *
 * Requisitos:
 *   - Token: https://vercel.com/account/tokens → export VERCEL_TOKEN=...
 *   - Mismo team/proyecto que deploy:vercel (o definí VERCEL_TEAM_ID y VERCEL_PROJECT_ID).
 *
 * Uso: npm run vercel:env:resend
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const RESEND_LOCAL_PATH = path.join(ROOT, ".env.resend.local");

/** Defaults alineados con scripts/deploy-vercel.cjs */
const DEFAULT_TEAM_ID = "team_ZrFs7KNf947ZEMU0YbE1Ri05";
const DEFAULT_PROJECT_ID = "prj_mzDDYrMiQPXnQcHlWVpGUXoIfQ77";

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
    comment: "Marketplace avisos por email (Resend)",
  });
  return httpsJson(
    "POST",
    url,
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    payload
  );
}

async function main() {
  const token = (process.env.VERCEL_TOKEN || "").trim();
  const teamId = (process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || DEFAULT_TEAM_ID).trim();
  const projectId = (process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID).trim();

  if (!token) {
    console.error(
      "Falta VERCEL_TOKEN. Creá un token en https://vercel.com/account/tokens y ejecutá:\n" +
        "  set VERCEL_TOKEN=tu_token   (PowerShell: $env:VERCEL_TOKEN=\"...\")\n" +
        "  npm run vercel:env:resend"
    );
    process.exit(1);
  }

  const rootEnv = parseDotEnv(ENV_PATH);
  const resendLocal = parseDotEnv(RESEND_LOCAL_PATH);
  const merged = { ...rootEnv, ...resendLocal };
  const apiKey = (merged.RESEND_API_KEY || process.env.RESEND_API_KEY || "").trim();
  let from = (merged.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "").trim();
  const notifyTo = (
    merged.MARKETPLACE_NOTIFY_EMAIL_TO ||
    process.env.MARKETPLACE_NOTIFY_EMAIL_TO ||
    ""
  ).trim();

  if (!apiKey) {
    console.error(
      "Falta RESEND_API_KEY en .env o .env.resend.local (raíz del repo) o en el entorno actual."
    );
    process.exit(1);
  }
  if (!from) from = "onboarding@resend.dev";

  const target = ["production", "preview"];
  const pairs = [
    { key: "RESEND_API_KEY", value: apiKey, type: "sensitive" },
    { key: "RESEND_FROM_EMAIL", value: from, type: "encrypted" },
  ];
  if (notifyTo) pairs.push({ key: "MARKETPLACE_NOTIFY_EMAIL_TO", value: notifyTo, type: "encrypted" });

  console.log(`Sincronizando ${pairs.length} variable(s) a Vercel (project ${projectId})…`);

  for (const p of pairs) {
    const res = await upsertEnv({ token, teamId, projectId, ...p, target });
    if (res.status < 200 || res.status >= 300) {
      const msg = res.json?.error?.message || res.json?.message || res.raw || res.status;
      console.error(`Error en ${p.key}: HTTP ${res.status} — ${msg}`);
      process.exit(1);
    }
    console.log(`  OK ${p.key}`);
  }

  console.log(
    "\nListo. En Vercel → Deployments hacé Redeploy del último (o un push) para que los lambdas/serverless lean las nuevas variables."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
