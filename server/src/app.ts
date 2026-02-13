import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { clientsRouter } from "./routes/clients.js";
import { invoicesRouter } from "./routes/invoices.js";
import { requireAuth } from "./middleware/auth.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);

  app.use(helmet());
  // Permitir siempre sgi-hrs.vercel.app y cualquier *.vercel.app; además los orígenes de CORS_ORIGIN y localhost
  const allowedOrigins = new Set<string>([
    "https://sgi-hrs.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://localhost:5178",
    "http://localhost:5179",
    "http://127.0.0.1:5173"
  ]);
  if (env.CORS_ORIGIN) {
    env.CORS_ORIGIN.split(",").forEach((o) => {
      const t = o.trim().replace(/\/+$/, "");
      if (t) allowedOrigins.add(t);
    });
  }
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        if (origin.endsWith(".vercel.app") && (origin.startsWith("https://") || origin.startsWith("http://"))) return cb(null, true);
        return cb(null, false);
      },
      credentials: true
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => {
    res.json({
      message: "API HRS Facturación",
      health: "/api/health",
      docs: "Rutas: GET/POST/PUT/DELETE /api/clients, GET/POST/DELETE /api/invoices"
    });
  });

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", requireAuth, usersRouter);
  app.use("/api", requireAuth, clientsRouter);
  app.use("/api", requireAuth, invoicesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

