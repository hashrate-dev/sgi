import { createApp } from "./app.js";
import { env } from "./config/env.js";

try {
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on :${env.PORT}`);
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
