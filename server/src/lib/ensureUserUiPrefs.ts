import { db } from "../db.js";

let ready = false;

export async function ensureUserUiPrefsTable(): Promise<void> {
  if (ready) return;
  const isPg = (db as { isPostgres?: boolean }).isPostgres === true;
  if (isPg) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sgi_user_ui_prefs (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pref_key TEXT NOT NULL,
        body_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, pref_key)
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sgi_user_ui_prefs (
        user_id INTEGER NOT NULL,
        pref_key TEXT NOT NULL,
        body_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, pref_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
  ready = true;
}
