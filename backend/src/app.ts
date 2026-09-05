import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/auth.js";
import instrumentRoutes from "./routes/instruments.js";
import watchlistRoutes from "./routes/watchlists.js";
import portfolioRoutes from "./routes/portfolio.js";
import alertRoutes from "./routes/alerts.js";
import notificationRoutes from "./routes/notifications.js";
import memoryRoutes from "./routes/memory.js";
import screenerRoutes from "./routes/screener.js";
import aiRoutes from "./routes/ai.js";
import marketRoutes from "./routes/market.js";
import educationRoutes from "./routes/education.js";
import etfRoutes from "./routes/etf.js";
import meRoutes from "./routes/me.js";
import demoRoutes from "./routes/demo.js";
import screenRoutes from "./routes/screens.js";
import newsRoutes from "./routes/news.js";
import insightRoutes from "./routes/insights.js";
import v1Routes from "./routes/stocksSnapshot.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // CORS: allow the configured frontend (production), plus localhost dev and
  // throwaway tunnel origins (trycloudflare / ngrok / localtunnel) so the demo
  // link works without editing config every time the tunnel URL changes.
  app.use(
    cors({
      credentials: true,
      origin(origin, cb) {
        if (!origin) return cb(null, true); // non-browser clients
        if (origin === config.frontendUrl) return cb(null, true);
        const devOrTunnel =
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          /\.trycloudflare\.com$|\.ngrok(-free)?\.dev$|\.loca\.lt$|\.ngrok\.io$/.test(origin);
        if (config.nodeEnv !== "production" || devOrTunnel) return cb(null, true);
        return cb(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "smartwatch", time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/instruments", instrumentRoutes);
  app.use("/api/watchlists", watchlistRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/memory", memoryRoutes);
  app.use("/api/screener", apiLimiter, screenerRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/market", marketRoutes);
  app.use("/api/education", educationRoutes);
  app.use("/api/etf", etfRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/demo", demoRoutes);
  app.use("/api/screens", screenRoutes);
  app.use("/api/news", newsRoutes);
  app.use("/api/insights", insightRoutes);
  app.use("/api/v1/stocks", v1Routes);

  // Serve the statically-exported frontend from the same process (single-origin
  // deploy). Only enabled when STATIC_DIR is set or the built frontend/out exists.
  const here = path.dirname(fileURLToPath(import.meta.url)); // backend/src
  const repoOut = path.resolve(here, "..", "..", "frontend", "out");
  const staticDir =
    (config.staticDir && fs.existsSync(config.staticDir) && config.staticDir) ||
    (fs.existsSync(repoOut) ? repoOut : "");
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/|_next\/|socket\.io\/|.*\..{2,6}$).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
