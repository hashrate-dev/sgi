import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { dbType, initDb } from "./db.js";
import { runSeedVitrinaEquipos } from "./db/seedVitrinaEquipos.js";

async function main() {
  try {
    await initDb();
    if (env.NODE_ENV !== "production" && dbType === "sqlite") {
      // eslint-disable-next-line no-console
      console.warn(
        "[DB] Usuarios (/api/users) salen de SQLite (data.db), no de Supabase. Para la misma base que producción: SUPABASE_DATABASE_URL en server/.env o .env (o npm run supabase:set). Ver GET /api/db-info."
      );
    }
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
