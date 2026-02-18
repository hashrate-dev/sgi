/**
 * Vercel Serverless: rutas /api/*. Funciona con Root Directory = client.
 * Requiere server/dist copiado a client/server/dist (build:vercel).
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
  // Vercel puede pasar req.url como undefined; usar fallbacks
  const h = req.headers || {};
  const hVal = (k) => (typeof h[k] === "string" ? h[k] : Array.isArray(h[k]) ? h[k][0] : null);
  const rawUrl =
    req.url ??
    req.originalUrl ??
    hVal("x-vercel-url") ??
    hVal("x-url") ??
    hVal("x-invoke-path") ??
    "";
  const path = (rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl).split("?")[0] ?? "";
  res.setHeader("Content-Type", "application/json");

  if (path === "/api/health" || path.endsWith("/health") || path === "/health") {
    res.status(200).end(JSON.stringify({ ok: true }));
    return;
  }

  if (path === "/api/warmup" || path.endsWith("/warmup") || path === "/warmup") {
    try {
      await getApp();
      res.status(200).end(JSON.stringify({ ok: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

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

  // Fallback: GET /api/garantias/items si el handler dedicado no matchea
  if ((path === "/api/garantias/items" || path.endsWith("/garantias/items")) && req.method === "GET") {
    try {
      const { default: itemsHandler } = await import("./garantias/items.js");
      return itemsHandler(req, res);
    } catch (e) {
      /* seguir al app */
    }
  }

  // Fallback: DELETE/PUT /api/setups/:id si el handler dedicado no matchea
  const setupsIdMatch = path.match(/^\/api\/setups\/(.+)$/);
  if (setupsIdMatch && (req.method === "DELETE" || req.method === "PUT")) {
    try {
      const id = decodeURIComponent(setupsIdMatch[1]);
      const { default: setupsIdHandler } = await import("./setups/[id].js");
      const reqWithQuery = { ...req, query: { ...(req.query || {}), id } };
      return setupsIdHandler(reqWithQuery, res);
    } catch (e) {
      /* seguir al app */
    }
  }

  // Fallback: DELETE/PUT /api/users/:id si el handler dedicado no matchea
  const usersIdMatch = path.match(/^\/api\/users\/(.+)$/);
  if (usersIdMatch && !path.includes("/activity") && (req.method === "DELETE" || req.method === "PUT")) {
    try {
      const id = decodeURIComponent(usersIdMatch[1]);
      const { default: usersIdHandler } = await import("./users/[id].js");
      const reqWithQuery = { ...req, query: { ...(req.query || {}), id } };
      return usersIdHandler(reqWithQuery, res);
    } catch (e) {
      /* seguir al app */
    }
  }

  const app = await getApp();
  // Normalizar req.url para Express (Vercel puede pasar URL completa)
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const q = rawUrl.includes("?") ? "?" + rawUrl.split("?")[1] : "";
  if (req.url && (req.url.startsWith("http") || !req.url.startsWith("/"))) {
    req.url = pathname + q;
  }
  return app(req, res);
}
