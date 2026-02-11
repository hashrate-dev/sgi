import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { clientsRouter } from "./routes/clients.js";
import { invoicesRouter } from "./routes/invoices.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN ?? true,
      credentials: true
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use("/api", healthRouter);
  app.use("/api", clientsRouter);
  app.use("/api", invoicesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

