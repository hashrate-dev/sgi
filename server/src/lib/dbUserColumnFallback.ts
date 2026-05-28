import { db } from "../db.js";
import { rowKeysToLowercase } from "./pgRowLowercase.js";

/** PostgreSQL/SQLite: columna opcional aún no presente en `users`. */
export function isRecoverableMissingUserColumnDbErr(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  return code === "42703" || msg.includes("no such column") || msg.includes("does not exist");
}

/** Login: mismas columnas que el flujo principal, con degradación si falta `lector_grants_json` u otras JSON. */
export async function fetchUserRowForLogin(loginName: string): Promise<Record<string, unknown> | undefined> {
  const bundlesOrEmail = [
    "SELECT id, username, email, password_hash, role, usuario, admin_b_grants_json, lector_grants_json, email_verified_at FROM users WHERE username = ? OR email = ?",
    "SELECT id, username, email, password_hash, role, usuario, admin_b_grants_json, lector_grants_json FROM users WHERE username = ? OR email = ?",
    "SELECT id, username, email, password_hash, role, usuario, admin_b_grants_json FROM users WHERE username = ? OR email = ?",
    "SELECT id, username, email, password_hash, role, usuario FROM users WHERE username = ? OR email = ?",
  ];
  for (const sql of bundlesOrEmail) {
    try {
      const raw = (await db.prepare(sql).get(loginName, loginName)) as Record<string, unknown> | undefined;
      if (!raw) return undefined;
      return rowKeysToLowercase(raw) as Record<string, unknown>;
    } catch (e) {
      if (!isRecoverableMissingUserColumnDbErr(e)) throw e;
    }
  }
  const bundlesUserOnly = [
    "SELECT id, username, password_hash, role, usuario, admin_b_grants_json, lector_grants_json FROM users WHERE username = ?",
    "SELECT id, username, password_hash, role, usuario, admin_b_grants_json FROM users WHERE username = ?",
    "SELECT id, username, password_hash, role, usuario FROM users WHERE username = ?",
  ];
  for (const sql of bundlesUserOnly) {
    try {
      const raw = (await db.prepare(sql).get(loginName)) as Record<string, unknown> | undefined;
      if (!raw) return undefined;
      return rowKeysToLowercase(raw) as Record<string, unknown>;
    } catch (e) {
      if (!isRecoverableMissingUserColumnDbErr(e)) throw e;
    }
  }
  return undefined;
}

/** Sesión JWT: fila `users` sin fallar si falta `lector_grants_json`. */
export async function fetchUserRowForSessionById(userId: number): Promise<Record<string, unknown> | undefined> {
  const bundles = [
    "SELECT id, username, email, role, usuario, admin_b_grants_json, lector_grants_json FROM users WHERE id = ?",
    "SELECT id, username, email, role, usuario, admin_b_grants_json FROM users WHERE id = ?",
    "SELECT id, username, email, role, usuario FROM users WHERE id = ?",
  ];
  for (const sql of bundles) {
    try {
      const raw = (await db.prepare(sql).get(userId)) as Record<string, unknown> | undefined;
      if (!raw) return undefined;
      return rowKeysToLowercase(raw) as Record<string, unknown>;
    } catch (e) {
      if (!isRecoverableMissingUserColumnDbErr(e)) throw e;
    }
  }
  return undefined;
}
