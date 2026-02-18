/**
 * Handler explícito para GET /api/auth/me.
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
  return app(req, res);
}
