/**
 * Handler explícito para GET /api/kryptex/workers.
 * Evita 404 cuando el catch-all no enruta correctamente en Vercel.
 */
import { initDb } from "../../server/dist/db.js";
import { createApp } from "../../server/dist/app.js";

let appPromise = null;
async function getApp() {
  if (!appPromise) {
    await initDb();
    appPromise = createApp();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  const rawUrl = req.url ?? "";
  const pathname = (rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl).split("?")[0] || "/api/kryptex/workers";
  const q = rawUrl.includes("?") ? "?" + rawUrl.split("?")[1] : "";
  if (req.url && (req.url.startsWith("http") || !req.url.startsWith("/"))) {
    req.url = pathname + q;
  }
  return app(req, res);
}
