/**
 * Vercel Serverless: todas las rutas /api/* se delegan al Express.
 * El servidor debe estar compilado (npm run build genera client + server).
 * Conecta a Supabase vía SUPABASE_DATABASE_URL.
 */
import { initDb } from "../server/dist/db.js";
import { createApp } from "../server/dist/app.js";

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    await initDb();
    appPromise = createApp();
  }
  return appPromise;
}

export default async function handler(req, res) {
  // /api/health responde de inmediato (sin esperar DB) para cold start y monitoreo
  const path = req.url?.split("?")[0] ?? "";
  if (path === "/api/health" || path.endsWith("/health")) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).end(JSON.stringify({ ok: true }));
    return;
  }
  const app = await getApp();
  return app(req, res);
}
