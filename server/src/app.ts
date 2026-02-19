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
import { renderRouter } from "./routes/render.js";
import { emittedRouter } from "./routes/emitted.js";
import { garantiasRouter } from "./routes/garantias.js";
import { setupsRouter } from "./routes/setups.js";
import { equiposRouter } from "./routes/equipos.js";
import { kryptexRouter } from "./routes/kryptex.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);

  app.use(helmet());
  // CORS: permitir cualquier origen para que login funcione desde sgi-hrs.vercel.app y sgi.hashrate.space sin depender de proxy ni de CORS_ORIGIN en Render
  app.use(
    cors({
      origin: true,
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
  app.use("/api", requireAuth, renderRouter);
  app.use("/api", emittedRouter);
  app.use("/api", garantiasRouter);
  app.use("/api", requireAuth, setupsRouter);
  app.use("/api", requireAuth, equiposRouter);
  app.use("/api", requireAuth, requireRole("admin_a", "admin_b"), kryptexRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

