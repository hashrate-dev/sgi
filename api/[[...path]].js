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
  const rawUrl = req.url ?? "";
  const path = (rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl).split("?")[0] ?? "";
  res.setHeader("Content-Type", "application/json");

  // /api/health responde de inmediato (sin esperar DB)
  if (path === "/api/health" || path.endsWith("/health") || path === "/health") {
    res.status(200).end(JSON.stringify({ ok: true }));
    return;
  }

  // /api/test-db: diagnóstico de conexión a Supabase
  if (path === "/api/test-db" || path.endsWith("/test-db") || path === "/test-db") {
    try {
      const { initDb, getDb } = await import("../server/dist/db.js");
      await initDb();
      const row = await getDb().prepare("SELECT 1 as ok").get();
      res.status(200).end(JSON.stringify({ ok: true, db: "connected", row }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  // /api/login-debug: diagnóstico del login (ensureDefaultUser + listar usuarios)
  if (path === "/api/login-debug" || path.endsWith("/login-debug") || path === "/login-debug" || path.includes("login-debug")) {
    try {
      const { initDb, getDb } = await import("../server/dist/db.js");
      const { ensureDefaultUser } = await import("../server/dist/routes/auth.js");
      await initDb();
      await ensureDefaultUser();
      const db = getDb();
      const users = await db.prepare("SELECT id, username, email, role FROM users LIMIT 5").all();
      const testUser = await db.prepare("SELECT id, username FROM users WHERE username = ? OR email = ?").get("jv@hashrate.space", "jv@hashrate.space");
      res.status(200).end(JSON.stringify({ ok: true, usersCount: Array.isArray(users) ? users.length : 0, users: users ?? [], testUser }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  const app = await getApp();
  return app(req, res);
}
