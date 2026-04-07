import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initDb } from "./db.js";
import { runSeedVitrinaEquipos } from "./db/seedVitrinaEquipos.js";

async function main() {
  try {
    await initDb();
    await runSeedVitrinaEquipos();
    const app = createApp();
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
}

main();
