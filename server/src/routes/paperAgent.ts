import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireModuleGrant } from "../middleware/moduleGrant.js";
import {
  clampPaperMaxOps,
  emptyPaperBook,
  hydratePaperBook,
  narratePaper,
  normalizePaperRunInterval,
  pushPaperNote,
  resetPaperBook,
  type PaperBook,
  type PaperUniverse,
} from "../lib/mercadosPaperAgent.js";
import { loadOrCreatePaperBook, loadUserPaperBook, saveUserPaperBook } from "../lib/paperBookStore.js";
import { PAPER_SYMBOLS, runArmedPaperAgents } from "../lib/paperWorker.js";

export const paperAgentRouter = Router();

const readMw = [
  requireAuth,
  requireRole("admin_a", "admin_b", "operador", "lector"),
  requireModuleGrant("noticias"),
] as const;

const writeMw = [
  requireAuth,
  requireRole("admin_a", "admin_b", "operador"),
  requireModuleGrant("noticias"),
] as const;

function isUniverse(raw: unknown): raw is PaperUniverse {
  if (raw === "ALL") return true;
  return typeof raw === "string" && (PAPER_SYMBOLS as readonly string[]).includes(raw);
}

paperAgentRouter.get("/paper/book", ...readMw, async (req, res, next) => {
  try {
    const book = await loadUserPaperBook(req.user!.id);
    res.json({ book, server: true });
  } catch (e) {
    next(e);
  }
});

paperAgentRouter.put("/paper/book", ...writeMw, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      seed?: unknown;
      armed?: boolean;
      universe?: unknown;
      maxOps?: unknown;
      runInterval?: unknown;
      reset?: { fund?: unknown; maxOps?: unknown };
    };
    let book = await loadUserPaperBook(req.user!.id);
    if (!book) {
      book = (body.seed ? hydratePaperBook(body.seed as Partial<PaperBook> & { v?: number }) : null) ?? emptyPaperBook();
    }

    if (body.reset) {
      const fund = Number(body.reset.fund);
      const maxOps = clampPaperMaxOps(Number(body.reset.maxOps ?? book.maxOps));
      const n = Number.isFinite(fund) && fund >= 100 ? fund : book.initialUsd;
      const armed = book.armed;
      const uni = book.universe;
      const iv = book.runInterval;
      const mode = book.mode;
      const lev = book.leverage;
      book = resetPaperBook(n, uni, maxOps, mode, lev);
      book.armed = armed;
      book.runInterval = iv;
      book = pushPaperNote(book, {
        at: Date.now(),
        tone: "idle",
        title: "Cuenta nueva",
        body: `Reinicié la cuenta en el servidor. Sigo operando 24/7 si estoy ON. Tope ${maxOps}.`,
        fingerprint: `reset/${maxOps}/${n}`,
      });
    }
    if (typeof body.armed === "boolean") {
      book = { ...book, armed: body.armed };
      book = pushPaperNote(book, narratePaper(book, [], [], (s) => s.replace(/USDT$/i, "")));
    }
    if (isUniverse(body.universe)) {
      book = { ...book, universe: body.universe };
      book = pushPaperNote(book, narratePaper(book, [], [], (s) => s.replace(/USDT$/i, "")));
    }
    if (body.maxOps != null) {
      book = { ...book, maxOps: clampPaperMaxOps(Number(body.maxOps)) };
    }
    if (body.runInterval != null) {
      book = { ...book, runInterval: normalizePaperRunInterval(body.runInterval) };
    }
    await saveUserPaperBook(req.user!.id, book);
    res.json({ book, server: true });
  } catch (e) {
    next(e);
  }
});

paperAgentRouter.post("/paper/book", ...writeMw, async (req, res, next) => {
  try {
    const seed = hydratePaperBook((req.body as { seed?: unknown })?.seed as Partial<PaperBook> & { v?: number });
    const book = await loadOrCreatePaperBook(req.user!.id, seed);
    res.json({ book, server: true });
  } catch (e) {
    next(e);
  }
});

export async function paperAgentCronHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = String(req.headers.authorization ?? "");
    const cronHeader = String(req.headers["x-vercel-cron"] ?? "");
    const secret = String(process.env.CRON_SECRET ?? "").trim();
    const okBearer = Boolean(secret) && auth === `Bearer ${secret}`;
    const okVercel = cronHeader === "1";
    if (!okBearer && !okVercel) {
      res.status(401).json({ error: { message: "No autorizado." } });
      return;
    }
    const result = await runArmedPaperAgents();
    res.json(result);
  } catch (e) {
    next(e);
  }
}
