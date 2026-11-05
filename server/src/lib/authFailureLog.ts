import type { Request } from "express";
import { db } from "../db.js";

let ready = false;

/** Intentos de login rechazados. No guarda la contraseña. */
export async function ensureAuthFailuresTable(): Promise<void> {
  if (ready) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS auth_failures (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address TEXT,
        account_hint TEXT NOT NULL DEFAULT ''
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS auth_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip_address TEXT,
        account_hint TEXT NOT NULL DEFAULT ''
      )
    `);
  }
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_auth_failures_created ON auth_failures(created_at DESC)`);
  ready = true;
}

export function requestClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = String(raw ?? "").split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  return ip.slice(0, 80);
}

export function recordAuthFailure(req: Request, account: string): void {
  const hint = account.trim().toLowerCase().slice(0, 80);
  const ip = requestClientIp(req);
  void (async () => {
    try {
      await ensureAuthFailuresTable();
      await db.prepare("INSERT INTO auth_failures (ip_address, account_hint) VALUES (?, ?)").run(ip, hint);
    } catch (e) {
      console.error("auth_failures:", e);
    }
  })();
}
