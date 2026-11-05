import { Router } from "express";
import { db } from "../db.js";
import { JWT_SECRET_DEV_DEFAULT, env } from "../config/env.js";
import { ensureAuthFailuresTable } from "../lib/authFailureLog.js";
import { requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";

type SecurityAlert = { level: "alto" | "aviso"; title: string; detail: string };
type Protection = { name: string; ok: boolean; detail: string };

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

      let failures: Array<{ created_at?: string; ip_address?: string | null; account_hint?: string | null }> = [];
      try {
        await ensureAuthFailuresTable();
        failures = (await db
          .prepare(
            `SELECT created_at, ip_address, account_hint
             FROM auth_failures
             ORDER BY created_at DESC
             LIMIT 300`
          )
          .all()) as typeof failures;
      } catch {
        failures = [];
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

      const fail15 = failures.filter((row) => within(15 * 60 * 1000, row.created_at, now));
      const fail1h = failures.filter((row) => within(HOUR, row.created_at, now));
      const fail24h = failures.filter((row) => within(24 * HOUR, row.created_at, now));
      const alerts: SecurityAlert[] = [];

      const allowlist = env.CORS_ORIGIN?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
      const vercelWildcard = env.NODE_ENV === "production" && allowlist.length === 0;
      if (vercelWildcard) {
        alerts.push({
          level: "alto",
          title: "Cualquier sitio de Vercel puede usar la sesión",
          detail:
            "La API, si no hay una lista propia de orígenes, acepta pedidos con la cookie de sesión desde cualquier página en vercel.app. hashrate.space sigue permitido. Conviene definir CORS_ORIGIN solo con los sitios propios.",
        });
      }

      if (fail15.length >= 8) {
        alerts.push({
          level: "alto",
          title: "Ráfaga de contraseñas incorrectas",
          detail: `${fail15.length} intentos rechazados en los últimos 15 minutos.`,
        });
      }
      const failsByIp = new Map<string, number>();
      const failsByAccount = new Map<string, number>();
      for (const row of fail1h) {
        const ip = String(row.ip_address || "").trim();
        const account = String(row.account_hint || "").trim();
        if (ip) failsByIp.set(ip, (failsByIp.get(ip) ?? 0) + 1);
        if (account) failsByAccount.set(account, (failsByAccount.get(account) ?? 0) + 1);
      }
      for (const [ip, count] of failsByIp) {
        if (count < 5) continue;
        alerts.push({
          level: "alto",
          title: "Una red insiste con contraseñas incorrectas",
          detail: `${ip} acumuló ${count} intentos fallidos en la última hora.`,
        });
      }
      for (const [account, count] of failsByAccount) {
        if (count < 5) continue;
        alerts.push({
          level: "alto",
          title: "Están probando una cuenta",
          detail: `${account} recibió ${count} contraseñas incorrectas en la última hora.`,
        });
      }
      if (resets > 0) {
        alerts.push({
          level: "aviso",
          title: "Hay enlaces de restablecimiento sin usar",
          detail: `${resets} enlaces siguen vigentes. Si nadie los pidió, conviene revisarlos.`,
        });
      }

      const adminIps = new Map<string, { role: string; ips: Set<string> }>();
      for (const row of activity) {
        if (row.event !== "login" || !within(24 * HOUR, row.created_at, now)) continue;
        const role = String(row.role ?? "");
        if (role !== "admin_a" && role !== "admin_b") continue;
        const account = String(row.email || row.username || "").trim();
        const ip = String(row.ip_address || "").trim();
        if (!account || !ip) continue;
        const current = adminIps.get(account) ?? { role, ips: new Set<string>() };
        current.ips.add(ip);
        adminIps.set(account, current);
      }
      for (const [account, info] of adminIps) {
        if (info.ips.size < 2) continue;
        alerts.push({
          level: info.ips.size >= 3 ? "alto" : "aviso",
          title: "Cuenta de administración desde varias redes",
          detail: `${account} entró en 24 horas desde ${[...info.ips].join(", ")}.`,
        });
      }

      const jwtOk =
        env.JWT_SECRET.length >= 32 &&
        env.JWT_SECRET !== JWT_SECRET_DEV_DEFAULT &&
        !env.JWT_SECRET.includes("cambiar-en-produccion");
      const protections: Protection[] = [
        {
          name: "Cookie de sesión",
          ok: env.NODE_ENV === "production",
          detail:
            env.NODE_ENV === "production"
              ? "httpOnly y solo por HTTPS. Un script de la página no puede leerla."
              : "Este entorno no es producción: la cookie no exige HTTPS.",
        },
        {
          name: "Clave de firma",
          ok: jwtOk,
          detail: jwtOk
            ? "La sesión se firma con una clave del servidor de al menos 32 caracteres. El tablero no la muestra."
            : "La clave de firma es corta o sigue siendo la de desarrollo.",
        },
        {
          name: "Tope de login",
          ok: true,
          detail:
            env.NODE_ENV === "production"
              ? "Cada red tiene 40 intentos de entrada cada 15 minutos."
              : "En desarrollo el tope es amplio para no frenar las pruebas.",
        },
        {
          name: "Orígenes de la API",
          ok: !vercelWildcard,
          detail: vercelWildcard
            ? "Falta una lista propia: además de hashrate.space se acepta cualquier sitio vercel.app."
            : "Hay una lista de orígenes o el permiso amplio de vercel.app no está activo.",
        },
        {
          name: "Cabeceras",
          ok: true,
          detail: "Helmet está activo: el sitio no se incrusta en un iframe y no publica la tecnología del servidor.",
        },
      ];
      if (!jwtOk) {
        alerts.push({
          level: "alto",
          title: "La clave que firma las sesiones es débil",
          detail: "En producción el servidor no debería arrancar así. Revisá JWT_SECRET sin copiarla a este tablero.",
        });
      }

      const status: "alerta" | "aviso" | "tranquilo" = alerts.some((alert) => alert.level === "alto")
        ? "alerta"
        : alerts.length > 0
          ? "aviso"
          : "tranquilo";

      const recentAccess = activity.slice(0, 18).map((row) => ({
        at: String(row.created_at ?? ""),
        account: String(row.email || row.username || ""),
        role: String(row.role ?? ""),
        event: String(row.event ?? ""),
        ip: String(row.ip_address ?? "").trim(),
      }));

      res.json({
        generatedAt: new Date(now).toISOString(),
        status,
        alerts: alerts.slice(0, 12),
        protections,
        failedLogins15m: fail15.length,
        failedLogins24h: fail24h.length,
        recentFailures: failures.slice(0, 12).map((row) => ({
          at: String(row.created_at ?? ""),
          account: String(row.account_hint ?? ""),
          ip: String(row.ip_address ?? "").trim(),
        })),
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
