import express from "express";
import cors, { type CorsOptions } from "cors";
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
import { marketplaceRouter } from "./routes/marketplace.js";
import { marketplaceQuoteTicketsRouter } from "./routes/marketplaceQuoteTickets.js";
import { kryptexRouter } from "./routes/kryptex.js";
import { requireAuth } from "./middleware/auth.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  const corsAllowlist = env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
  const corsOptions: CorsOptions = {
    credentials: true,
    ...(corsAllowlist.length > 0
      ? {
          origin(origin, callback) {
            if (!origin) return callback(null, true);
            if (corsAllowlist.includes(origin)) return callback(null, true);
            callback(null, false);
          },
        }
      : { origin: true }),
  };
  app.use(cors(corsOptions));

  // Equipos ASIC pueden enviar mp_image_src como data URL (Vercel / modo memoria); 1mb cortaba el guardado.
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

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
  // Kryptex: público (datos de pool, sin info sensible). Sin auth para que funcione en localhost sin login.
  app.use("/api", kryptexRouter);
  // Vitrina, precios carrito, POST asic-yields: públicos. Debe ir ANTES de cualquier `requireAuth` en /api
  // o las peticiones sin JWT mueren en 401 y no llegan al marketplaceRouter.
  app.use("/api", marketplaceRouter);
  app.use("/api", marketplaceQuoteTicketsRouter);
  app.use("/api", requireAuth, usersRouter);
  app.use("/api", requireAuth, clientsRouter);
  app.use("/api", requireAuth, invoicesRouter);
  app.use("/api", requireAuth, renderRouter);
  app.use("/api", emittedRouter);
  app.use("/api", garantiasRouter);
  app.use("/api", requireAuth, setupsRouter);
  app.use("/api", requireAuth, equiposRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

