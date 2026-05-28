import crypto from "node:crypto";
import type { Request } from "express";
import { db } from "../db.js";
import { isRecoverableMissingUserColumnDbErr } from "./dbUserColumnFallback.js";
import type { MarketplaceWelcomeLang } from "./marketplaceWelcomeEmail.js";

export const EMAIL_VERIFICATION_TTL_HOURS = 48;

let storageReady = false;
let legacyClienteVerifiedBackfillDone = false;

export async function ensureEmailVerificationStorage(): Promise<void> {
  if (storageReady) return;

  try {
    await db.prepare("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ").run();
  } catch {
    try {
      await db.prepare("ALTER TABLE users ADD COLUMN email_verified_at TEXT").run();
    } catch (e) {
      if (!isRecoverableMissingUserColumnDbErr(e)) throw e;
    }
  }

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT 'es',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      requested_ip TEXT,
      requested_user_agent TEXT
    )`
  ).run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_email_verify_user_created ON email_verification_tokens(user_id, created_at)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_email_verify_email_created ON email_verification_tokens(email, created_at)")
    .run();

  try {
    await db
      .prepare(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, datetime('now'))
         WHERE role != 'cliente' AND (email_verified_at IS NULL OR TRIM(COALESCE(email_verified_at, '')) = '')`
      )
      .run();
  } catch {
    try {
      await db
        .prepare(
          `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
           WHERE role != 'cliente' AND email_verified_at IS NULL`
        )
        .run();
    } catch {
      /* opcional */
    }
  }

  if (!legacyClienteVerifiedBackfillDone) {
    try {
      await db
        .prepare(
          `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, datetime('now'))
           WHERE role = 'cliente' AND (email_verified_at IS NULL OR TRIM(COALESCE(email_verified_at, '')) = '')`
        )
        .run();
    } catch {
      try {
        await db
          .prepare(
            `UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
             WHERE role = 'cliente' AND email_verified_at IS NULL`
          )
          .run();
      } catch {
        /* opcional */
      }
    }
    legacyClienteVerifiedBackfillDone = true;
  }

  storageReady = true;
}

export function hashEmailVerificationToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

export async function getUserEmailVerifiedAt(userId: number): Promise<string | null> {
  await ensureEmailVerificationStorage();
  try {
    const row = (await db.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(userId)) as
      | { email_verified_at?: string | null }
      | undefined;
    const v = row?.email_verified_at;
    return v != null && String(v).trim() !== "" ? String(v).trim() : null;
  } catch (e) {
    if (isRecoverableMissingUserColumnDbErr(e)) return new Date().toISOString();
    throw e;
  }
}

export async function isMarketplaceClienteEmailVerified(userId: number, role: string): Promise<boolean> {
  if (role !== "cliente") return true;
  return !!(await getUserEmailVerifiedAt(userId));
}

export async function createEmailVerificationToken(args: {
  userId: number;
  email: string;
  displayName: string;
  lang: MarketplaceWelcomeLang;
  req?: Request;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  await ensureEmailVerificationStorage();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashEmailVerificationToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60_000);
  const ip =
    (args.req?.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    args.req?.socket?.remoteAddress ||
    "";
  const ua = String(args.req?.headers["user-agent"] || "").slice(0, 500);

  await db
    .prepare("UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
    .run(now.toISOString(), args.userId);
  await db
    .prepare(
      `INSERT INTO email_verification_tokens
        (token_hash, user_id, email, display_name, lang, expires_at, created_at, requested_ip, requested_user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tokenHash,
      args.userId,
      args.email.trim().toLowerCase(),
      args.displayName.trim(),
      args.lang,
      expiresAt.toISOString(),
      now.toISOString(),
      ip,
      ua
    );

  return { rawToken, expiresAt };
}

export async function markUserEmailVerified(userId: number, tokenHash: string): Promise<void> {
  await ensureEmailVerificationStorage();
  const nowIso = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(nowIso, userId);
    await tx.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?").run(nowIso, tokenHash);
    await tx
      .prepare("UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND token_hash <> ? AND used_at IS NULL")
      .run(nowIso, userId, tokenHash);
  });
}

export type EmailVerificationTokenRow = {
  token_hash: string;
  user_id: number;
  email: string;
  display_name: string;
  lang: MarketplaceWelcomeLang;
  expires_at: string;
  used_at?: string | null;
};

export async function findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationTokenRow | undefined> {
  await ensureEmailVerificationStorage();
  return (await db
    .prepare(
      `SELECT token_hash, user_id, email, display_name, lang, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(tokenHash)) as EmailVerificationTokenRow | undefined;
}

export async function findUnverifiedClienteByEmail(emailNorm: string): Promise<
  | {
      id: number;
      username: string;
      email?: string | null;
      display_name: string;
      lang: MarketplaceWelcomeLang;
    }
  | undefined
> {
  await ensureEmailVerificationStorage();
  const row = (await db
    .prepare(
      `SELECT u.id, u.username, u.email, u.email_verified_at,
              TRIM(COALESCE(c.name, '') || ' ' || COALESCE(c.name2, '')) AS display_name
       FROM users u
       LEFT JOIN clients c ON c.user_id = u.id
       WHERE u.role = 'cliente'
         AND (LOWER(TRIM(u.username)) = ? OR LOWER(TRIM(COALESCE(u.email, u.username))) = ?)
       LIMIT 1`
    )
    .get(emailNorm, emailNorm)) as
    | {
        id: number;
        username: string;
        email?: string | null;
        email_verified_at?: string | null;
        display_name?: string | null;
      }
    | undefined;
  if (!row?.id) return undefined;
  if (row.email_verified_at && String(row.email_verified_at).trim() !== "") return undefined;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    display_name: String(row.display_name || "").trim() || row.username,
    lang: "es",
  };
}
