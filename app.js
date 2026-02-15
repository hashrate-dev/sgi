/**
 * Entry point para Vercel: toda la app (API + SPA) la maneja Express.
 * Vercel usa este archivo como handler único cuando está en la raíz (sin outputDirectory).
 * Ver: https://vercel.com/docs/frameworks/backend/express
 */
import { createApp } from "./server/dist/app.js";

export default createApp();
