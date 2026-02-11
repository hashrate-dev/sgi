import { createApp } from "./app.js";
import { env } from "./config/env.js";

try {
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on :${env.PORT}`);
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Startup error:", err);
  process.exit(1);
}
