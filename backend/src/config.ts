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
};

export type Config = typeof config;
