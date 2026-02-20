/**
 * Handler explícito para /api/clients/:id (GET, PUT, DELETE).
 * Delega al Express para evitar 404 en Vercel cuando la ruta no llega al catch-all.
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
  const id = req.query?.id ?? "";
  const h = req.headers || {};
  const hVal = (k) => (typeof h[k] === "string" ? h[k] : Array.isArray(h[k]) ? h[k][0] : null);
  const rawUrl = req.url ?? req.originalUrl ?? hVal("x-vercel-url") ?? hVal("x-url") ?? hVal("x-invoke-path") ?? "";
  let pathname = (rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl).split("?")[0] ?? "";
  if (!pathname || !pathname.includes("/clients/")) pathname = `/api/clients/${id}`;
  const q = rawUrl.includes("?") ? "?" + rawUrl.split("?")[1] : "";
  req.url = pathname + q;
  res.setHeader("Content-Type", "application/json");
  const app = await getApp();
  return app(req, res);
}
