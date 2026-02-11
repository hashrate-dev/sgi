/**
 * Vercel Serverless: todas las rutas /api/* se delegan al Express.
 * El servidor debe estar compilado (npm run build en root genera server/dist).
 */
import { createApp } from "../server/dist/app.js";

const app = createApp();
export default app;
