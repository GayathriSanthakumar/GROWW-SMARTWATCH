import http from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initSocket } from "./ws/index.js";
import { startMarketSim } from "./services/marketSim.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { query } from "./db/pool.js";
import { syncUniverse } from "./services/universeSync.js";

async function main() {
  try {
    await migrate();
  } catch (e) {
    console.error("[server] migration failed", e);
    process.exit(1);
  }

  if (config.demo.seedAccount) {
    try {
      const existing = await query(`SELECT 1 FROM users LIMIT 1`);
      if (existing.rows.length === 0) {
        await seed();
      } else {
        console.log("[server] existing users found — skipping auto-seed (use `npm run db:seed` to force)");
      }
    } catch (e) {
      console.error("[server] seed failed", e);
    }
  }

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.port, () => {
    console.log(`[server] SMARTWATCH API running on http://localhost:${config.port}`);
    console.log(`[server] demo account: demo@smartwatch.app / demo1234`);
  });

  startMarketSim();

  // Import the full TradingView universe in the background (non-blocking).
  setTimeout(() => {
    syncUniverse()
      .then((n) => console.log(`[universe] imported ${n} companies from TradingView`))
      .catch((e) => console.error("[universe] sync failed", e instanceof Error ? e.message : e));
  }, 3000);

  const shutdown = () => {
    console.log("[server] shutting down...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[server] fatal", e);
  process.exit(1);
});
