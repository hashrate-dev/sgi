import { Router } from "express";
import { dbType } from "../db/index.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

healthRouter.get("/db-info", (_req, res) => {
  res.json({ db: dbType, message: dbType === "supabase" ? "Conectado a Supabase (datos compartidos con Vercel)" : "Usando SQLite local. Configurá SUPABASE_DATABASE_URL en server/.env" });
});

