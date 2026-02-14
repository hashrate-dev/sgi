import { createApp } from "./app.js";
import { env } from "./config/env.js";

try {
  const app = createApp();
  // Render requiere binding en 0.0.0.0 para recibir requests desde internet (https://render.com/docs/web-services#port-binding)
  const host = "0.0.0.0";
  app.listen(env.PORT, host, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${host}:${env.PORT}`);
    if (env.NODE_ENV === "production" && env.CORS_ORIGIN) {
      // eslint-disable-next-line no-console
      console.log(`CORS allowed origin: ${env.CORS_ORIGIN}`);
    }
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Startup error:", err);
  process.exit(1);
}
