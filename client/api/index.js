/**
 * Vercel Serverless: maneja TODAS las rutas /api/*.
 * Rewrite en vercel.json envía /api/:path* -> /api para que esta función reciba todo.
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

function getPathFromRequest(req) {
  const h = req.headers || {};
  const hVal = (k) => (typeof h[k] === "string" ? h[k] : Array.isArray(h[k]) ? h[k][0] : null);
  const q = req.query || {};
  const pathParam = typeof q.path === "string" ? q.path : Array.isArray(q.path) ? q.path.join("/") : null;
  if (pathParam) return `/api/${pathParam.replace(/^\/+/, "")}`;
  const rawUrl =
    req.url ??
    req.originalUrl ??
    hVal("x-vercel-url") ??
    hVal("x-url") ??
    hVal("x-invoke-path") ??
    hVal("x-original-url") ??
    "";
  const path = (rawUrl.startsWith("http") ? new URL(rawUrl).pathname : rawUrl).split("?")[0] ?? "";
  return path.startsWith("/") ? path : `/${path}`;
}

export default async function handler(req, res) {
  const path = getPathFromRequest(req);
  const rawUrl =
    req.url ??
    req.originalUrl ??
    (req.headers && (req.headers["x-vercel-url"] || req.headers["x-url"] || req.headers["x-invoke-path"])) ??
    "";
  const q = rawUrl.includes("?") ? "?" + String(rawUrl).split("?")[1] : "";

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

  const app = await getApp();
  req.url = path + q;
  req.originalUrl = req.originalUrl ?? req.url;
  return app(req, res);
}
