import { Router } from "express";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

export const securityOverviewRouter = Router();

const HOUR = 60 * 60 * 1000;

function parseDbTime(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const withZone = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return Date.parse(withZone);
}

function within(ms: number, raw: unknown, now: number): boolean {
  const t = parseDbTime(raw);
  return Number.isFinite(t) && now - t <= ms && t <= now + 5 * 60 * 1000;
}

securityOverviewRouter.get(
  "/security/overview",
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("usuarios"),
  async (_req, res, next) => {
    try {
      const now = Date.now();
      const accounts = (await db.prepare("SELECT role, COUNT(*) AS n FROM users GROUP BY role").all()) as Array<{
        role?: string;
        n?: number;
      }>;

      let activity: Array<{
        event?: string;
        created_at?: string;
        ip_address?: string | null;
        email?: string | null;
        username?: string | null;
        role?: string | null;
        duration_seconds?: number | null;
      }> = [];
      try {
        activity = (await db
          .prepare(
            `SELECT a.event, a.created_at, a.ip_address, a.duration_seconds, u.email, u.username, u.role
             FROM user_activity a
             JOIN users u ON u.id = a.user_id
             ORDER BY a.created_at DESC
             LIMIT 400`
          )
          .all()) as typeof activity;
      } catch {
        activity = [];
      }

      let resets = 0;
      try {
        const rows = (await db
          .prepare("SELECT expires_at, used_at FROM password_reset_tokens ORDER BY created_at DESC LIMIT 200")
          .all()) as Array<{ expires_at?: string; used_at?: string | null }>;
        resets = rows.filter((row) => !row.used_at && parseDbTime(row.expires_at) > now).length;
      } catch {
        resets = 0;
      }

      let changes: Array<{ created_at?: string; user_email?: string; action?: string; summary?: string }> = [];
      let auditReady = true;
      try {
        changes = (await db
          .prepare(
            `SELECT created_at, user_email, action, summary
             FROM equipos_asic_audit
             ORDER BY created_at DESC
             LIMIT 80`
          )
          .all()) as typeof changes;
      } catch {
        auditReady = false;
        changes = [];
      }

      const logins7d = activity.filter((row) => row.event === "login" && within(7 * 24 * HOUR, row.created_at, now));
      const byAccount = new Map<string, Set<string>>();
      const byIp = new Map<string, Set<string>>();
      for (const row of logins7d) {
        const account = String(row.email || row.username || "").trim();
        const ip = String(row.ip_address || "").trim();
        if (!account || !ip) continue;
        const ips = byAccount.get(account) ?? new Set<string>();
        ips.add(ip);
        byAccount.set(account, ips);
        const accountsOnIp = byIp.get(ip) ?? new Set<string>();
        accountsOnIp.add(account);
        byIp.set(ip, accountsOnIp);
      }

      const recentAccess = activity.slice(0, 18).map((row) => ({
        at: String(row.created_at ?? ""),
        account: String(row.email || row.username || ""),
        role: String(row.role ?? ""),
        event: String(row.event ?? ""),
        ip: String(row.ip_address ?? "").trim(),
      }));

      res.json({
        generatedAt: new Date(now).toISOString(),
        accounts: accounts.map((row) => ({ role: String(row.role ?? ""), count: Number(row.n) || 0 })),
        openSessions: activity.filter(
          (row) => row.event === "login" && row.duration_seconds == null && within(24 * HOUR, row.created_at, now)
        ).length,
        logins24h: activity.filter((row) => row.event === "login" && within(24 * HOUR, row.created_at, now)).length,
        logouts24h: activity.filter((row) => row.event === "logout" && within(24 * HOUR, row.created_at, now)).length,
        audit24h: changes.filter((row) => within(24 * HOUR, row.created_at, now)).length,
        pendingResets: resets,
        auditReady,
        multiIpAccounts: [...byAccount.entries()]
          .filter(([, ips]) => ips.size > 1)
          .map(([account, ips]) => ({ account, ips: [...ips] }))
          .slice(0, 12),
        sharedIpAccounts: [...byIp.entries()]
          .filter(([, names]) => names.size > 1)
          .map(([ip, names]) => ({ ip, accounts: [...names] }))
          .slice(0, 12),
        recentAccess,
        recentChanges: changes.slice(0, 12).map((row) => ({
          at: String(row.created_at ?? ""),
          account: String(row.user_email ?? ""),
          action: String(row.action ?? ""),
          summary: String(row.summary ?? ""),
        })),
      });
    } catch (e) {
      next(e);
    }
  }
);
