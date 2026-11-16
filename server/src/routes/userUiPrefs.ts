import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureUserUiPrefsTable } from "../lib/ensureUserUiPrefs.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const userUiPrefsRouter = Router();

const KEY_RE = /^[a-z][a-z0-9_-]{1,40}$/;
const MAX_BODY = 350_000;

function parseBodyJson(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

userUiPrefsRouter.get("/me/ui-prefs/:key", requireAuth, async (req, res, next) => {
  try {
    const key = String(req.params.key ?? "");
    if (!KEY_RE.test(key)) {
      res.status(400).json({ error: { message: "Clave inválida" } });
      return;
    }
    await ensureUserUiPrefsTable();
    const row = (await db
      .prepare("SELECT body_json FROM sgi_user_ui_prefs WHERE user_id = ? AND pref_key = ?")
      .get(req.user!.id, key)) as Record<string, unknown> | undefined;
    const n = row ? rowKeysToLowercase(row) : null;
    res.json({ prefs: n ? parseBodyJson(n.body_json) : null });
  } catch (e) {
    next(e);
  }
});

userUiPrefsRouter.put("/me/ui-prefs/:key", requireAuth, async (req, res, next) => {
  try {
    const key = String(req.params.key ?? "");
    if (!KEY_RE.test(key)) {
      res.status(400).json({ error: { message: "Clave inválida" } });
      return;
    }
    const prefs = (req.body as { prefs?: unknown } | null)?.prefs ?? req.body;
    if (prefs == null || typeof prefs !== "object") {
      res.status(400).json({ error: { message: "Preferencias inválidas" } });
      return;
    }
    const body = JSON.stringify(prefs);
    if (body.length > MAX_BODY) {
      res.status(413).json({ error: { message: "Preferencias demasiado grandes" } });
      return;
    }
    await ensureUserUiPrefsTable();
    const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
    if (isPg) {
      await db
        .prepare(
          `INSERT INTO sgi_user_ui_prefs (user_id, pref_key, body_json, updated_at)
           VALUES (?, ?, ?, NOW())
           ON CONFLICT (user_id, pref_key)
           DO UPDATE SET body_json = EXCLUDED.body_json, updated_at = NOW()`
        )
        .run(req.user!.id, key, body);
    } else {
      await db
        .prepare(
          `INSERT INTO sgi_user_ui_prefs (user_id, pref_key, body_json, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, pref_key)
           DO UPDATE SET body_json = excluded.body_json, updated_at = datetime('now')`
        )
        .run(req.user!.id, key, body);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
