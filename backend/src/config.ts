import dotenv from "dotenv";
dotenv.config();

const toBool = (v: string | undefined, d = false) =>
  v === undefined ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase());

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:4000",

  databaseUrl:
    process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER || "gayathris"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "smartwatch"}`,

  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
    accessTtl: process.env.ACCESS_TOKEN_TTL || "30m",
    refreshTtlDays: 30,
  },

  bcryptCost: Number(process.env.BCRYPT_COST || 12),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },

  openaiApiKey: process.env.OPENAI_API_KEY || "",

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "SMARTWATCH <news@smartwatch.app>",
  },

  demo: {
    default: toBool(process.env.DEMO_MODE_DEFAULT, true),
    seedAccount: toBool(process.env.SEED_DEMO_ACCOUNT, true),
  },

  universeLimit: Number(process.env.UNIVERSE_LIMIT || 800),

  // Directory of the built static frontend (Next `output: export`). When set,
  // the backend also serves the SPA from the same origin — perfect for a single
  // Render service. Leave blank to run the frontend separately (dev).
  staticDir: process.env.STATIC_DIR || "",

  // Optional licensed broker feed (leave blank → demo provider)
  kiteApiKey: process.env.KITE_API_KEY || "",

  // A LIVE badge is only honest when a licensed real-time feed is configured.
  // Free/delayed sources (TradingView public scanner, Yahoo, sim) must label as
  // DELAYED/DEMO. Set LIVE_FEED_LICENSED=true ONLY with an authorized broker
  // market-data subscription.
  liveFeedLicensed: toBool(process.env.LIVE_FEED_LICENSED, false),

  // Demo/testing: force the market to look OPEN (REGULAR) so live-tick behaviour
  // can be exercised outside NSE/BSE hours. Never set in production.
  simulateMarketOpen: toBool(process.env.SIMULATE_MARKET_OPEN, false),

  // Demo/testing: skip TradingView and run the simulator (deterministic moves)
  // so live-refresh behaviour can be demonstrated offline.
  forceSimulator: toBool(process.env.FORCE_SIMULATOR, false),
};

export type Config = typeof config;
