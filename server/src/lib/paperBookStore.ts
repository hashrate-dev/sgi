import { db } from "../db.js";
import { emptyPaperBook, hydratePaperBook, type PaperBook } from "./mercadosPaperAgent.js";

let ready = false;

function isPg(): boolean {
  return (db as { isPostgres?: boolean }).isPostgres === true;
}

export async function ensurePaperBooksTable(): Promise<void> {
  if (ready) return;
  if (isPg()) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sgi_paper_books (
        user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        body_json TEXT NOT NULL,
        armed INTEGER NOT NULL DEFAULT 1,
        last_tick_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sgi_paper_books (
        user_id INTEGER NOT NULL PRIMARY KEY,
        body_json TEXT NOT NULL,
        armed INTEGER NOT NULL DEFAULT 1,
        last_tick_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
  ready = true;
}

function parseBook(raw: unknown): PaperBook | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return hydratePaperBook(parsed as Partial<PaperBook> & { v?: number });
}

export async function loadUserPaperBook(userId: number): Promise<PaperBook | null> {
  await ensurePaperBooksTable();
  const row = (await db.prepare("SELECT body_json FROM sgi_paper_books WHERE user_id = ?").get(userId)) as
    | { body_json?: string }
    | undefined;
  if (!row?.body_json) return null;
  return parseBook(row.body_json);
}

export async function saveUserPaperBook(userId: number, book: PaperBook): Promise<void> {
  await ensurePaperBooksTable();
  const body = JSON.stringify(book);
  const armed = book.armed ? 1 : 0;
  if (isPg()) {
    await db
      .prepare(
        `INSERT INTO sgi_paper_books (user_id, body_json, armed, updated_at)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET body_json = EXCLUDED.body_json, armed = EXCLUDED.armed, updated_at = NOW()`,
      )
      .run(userId, body, armed);
  } else {
    await db
      .prepare(
        `INSERT INTO sgi_paper_books (user_id, body_json, armed, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id)
         DO UPDATE SET body_json = excluded.body_json, armed = excluded.armed, updated_at = datetime('now')`,
      )
      .run(userId, body, armed);
  }
}

export async function listArmedPaperBooks(): Promise<Array<{ userId: number; book: PaperBook }>> {
  await ensurePaperBooksTable();
  const rows = (await db.prepare("SELECT user_id, body_json FROM sgi_paper_books WHERE armed = 1").all()) as Array<{
    user_id?: number;
    USER_ID?: number;
    body_json?: string;
    BODY_JSON?: string;
  }>;
  const out: Array<{ userId: number; book: PaperBook }> = [];
  for (const row of rows) {
    const userId = Number(row.user_id ?? row.USER_ID);
    const book = parseBook(row.body_json ?? row.BODY_JSON);
    if (!Number.isFinite(userId) || !book?.armed) continue;
    out.push({ userId, book });
  }
  return out;
}

export async function loadOrCreatePaperBook(userId: number, seed?: PaperBook | null): Promise<PaperBook> {
  const existing = await loadUserPaperBook(userId);
  if (existing) return existing;
  const created = seed ?? emptyPaperBook();
  await saveUserPaperBook(userId, created);
  return created;
}
