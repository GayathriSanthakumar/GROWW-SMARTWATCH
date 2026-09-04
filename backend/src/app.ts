import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
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
import blueprintRoutes from "./routes/blueprint.js";
import etfRoutes from "./routes/etf.js";
import meRoutes from "./routes/me.js";
import demoRoutes from "./routes/demo.js";
import screenRoutes from "./routes/screens.js";
import newsRoutes from "./routes/news.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
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
  app.use("/api/blueprint", blueprintRoutes);
  app.use("/api/etf", etfRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/demo", demoRoutes);
  app.use("/api/screens", screenRoutes);
  app.use("/api/news", newsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
