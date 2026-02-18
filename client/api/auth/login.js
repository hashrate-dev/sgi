/**
 * Handler explícito para POST /api/auth/login.
 * Vercel puede no enrutar correctamente el catch-all para algunas rutas.
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
