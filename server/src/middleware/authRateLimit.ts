import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const isProd = env.NODE_ENV === "production";

/**
 * Limita intentos de login (por IP). Mitiga fuerza bruta sin afectar uso normal detrás de NAT moderado.
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 40 : 400,
  message: { error: { message: "Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos." } },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Registro público más restrictivo (abuse / spam de cuentas).
 */
export const registerClienteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 15 : 120,
  message: { error: { message: "Demasiados registros desde esta red. Probá más tarde o contactanos." } },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST públicos del marketplace (contacto, yields, presencia): mitiga spam y coste de email/DB. */
export const marketplacePublicPostRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 60 : 300,
  message: { error: { message: "Demasiadas solicitudes desde esta red. Probá de nuevo en unos minutos." } },
  standardHeaders: true,
  legacyHeaders: false,
});
