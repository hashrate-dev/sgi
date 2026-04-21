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

  // express-rate-limit rechaza trust proxy = true (ERR_ERL_PERMISSIVE_TRUST_PROXY). En Vercel basta 1 hop.
  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  const corsAllowlist = env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
  const isLocalDevOrigin = (origin: string): boolean => {
    if (env.NODE_ENV === "production") return false;
    try {
      const u = new URL(origin);
      const isLocalHost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (!isLocalHost) return false;
      const p = Number.parseInt(u.port || "80", 10);
      return Number.isFinite(p) && p >= 3000 && p <= 5999;
    } catch {
      return false;
    }
  };
  const defaultTrustedOrigins = new Set([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://app.hashrate.space",
    "https://sgi.hashrate.space",
  ]);
  const corsOptions: CorsOptions = {
    credentials: true,
    ...(corsAllowlist.length > 0
      ? {
          origin(origin, callback) {
            if (!origin) return callback(null, true);
            if (corsAllowlist.includes(origin)) return callback(null, true);
            // Misma app con Vite: a veces abrís localhost:5173 y otras 127.0.0.1:5173; CORS_ORIGIN suele listar solo uno.
            if (defaultTrustedOrigins.has(origin) || isLocalDevOrigin(origin)) return callback(null, true);
            callback(null, false);
          },
        }
      : env.NODE_ENV === "production"
        ? {
            origin(origin, callback) {
              // Producción segura por defecto: permitir solo orígenes confiables conocidos.
              if (!origin) return callback(null, true);
              if (defaultTrustedOrigins.has(origin)) return callback(null, true);
              try {
                const u = new URL(origin);
                if (u.hostname.endsWith(".vercel.app")) return callback(null, true);
              } catch {
                /* origin inválido */
              }
              return callback(null, false);
            },
          }
        : { origin: true }),
  };
  app.use(cors(corsOptions));

  // Equipos ASIC pueden enviar mp_image_src como data URL (Vercel / modo memoria); 1mb cortaba el guardado.
  /** Vitrina: varias data URLs (imagen + galería) en un solo PUT pueden superar 15MB. */
  app.use(express.json({ limit: "32mb" }));
  app.use(express.urlencoded({ extended: true, limit: "32mb" }));

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

