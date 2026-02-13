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
  const corsOrigin = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
    : [
        "https://hashrateapp.vercel.app",
        "https://sgi-hrs.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
      ];
  const originOption =
    Array.isArray(corsOrigin) && corsOrigin.length === 0 ? true
    : Array.isArray(corsOrigin) && corsOrigin.length === 1 ? corsOrigin[0]!
    : corsOrigin;
  app.use(
    cors({
      origin: originOption,
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

