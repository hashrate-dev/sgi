import { parse, serialize } from "cookie";
import type { Response } from "express";
import { env } from "../config/env.js";

export const HRS_AUTH_COOKIE = "hrs_auth";
export const HRS_AUTH_COOKIE_PATH = "/api";

/** Bearer tiene prioridad (compat); si no, cookie httpOnly de sesión. */
export function getAuthTokenFromRequest(req: { headers: { authorization?: string; cookie?: string } }): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const raw = req.headers.cookie;
  if (!raw) return null;
  const cookies = parse(raw);
  const c = cookies[HRS_AUTH_COOKIE];
  return typeof c === "string" && c.length > 0 ? c : null;
}

function sameSiteForCookie(): "strict" | "lax" | "none" {
  if (env.NODE_ENV !== "production") return "lax";
  return env.AUTH_COOKIE_SAMESITE ?? "none";
}

export function buildAuthCookieSerializeOptions(): Parameters<typeof serialize>[2] {
  const sameSite = sameSiteForCookie();
  const secure = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: HRS_AUTH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60,
  };
}

export function appendAuthCookie(res: Response, token: string): void {
  res.appendHeader("Set-Cookie", serialize(HRS_AUTH_COOKIE, token, buildAuthCookieSerializeOptions()));
}

export function appendClearAuthCookie(res: Response): void {
  const base = buildAuthCookieSerializeOptions();
  res.appendHeader(
    "Set-Cookie",
    serialize(HRS_AUTH_COOKIE, "", {
      ...base,
      maxAge: 0,
    })
  );
}
