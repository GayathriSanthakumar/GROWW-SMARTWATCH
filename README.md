# SMARTWATCH

**Don't watch everything. Know what changed.**

A full-stack Indian-equity **smart market watchlist** built end-to-end (React/Next.js frontend + Node/Express/Postgres backend). It's a Groww-style watchlist layered with "personal market memory" and data-grounded AI — so instead of a wall of flickering numbers, you get: *what meaningfully changed since you last looked, whether the app's own analysis is still right, and why.*

> ⚠️ Educational research tool — **not financial advice**. SMARTWATCH does not execute trades or guarantee returns. It does not scrape or republish Groww data.

---

## What it does

- **Watchlist** — multiple named lists (create/rename/delete/reorder), search-to-add, notes/tags, pin, move between lists. Persists per user server-side.
- **Latest market info** — live index strip and ticking quotes while the market is open (TradingView-sourced), last-close values when closed — **honestly labelled** (`LIVE` only with a licensed feed; otherwise `DELAYED` / last close). Per-stock charts across 1D→All ranges, real candle-closes trend sparklines, fundamentals, AI verdicts and Opportunity/Risk/Alpha/Smart-$ scores.
- **Return later → know what changed** — every view is snapshotted. On return, the **"Since you were last here"** hub lists what meaningfully changed and one click baselines you for next time.
- **AI Analyst** — a company-aware assistant that answers conceptual, company-specific and screening questions, keeps multi-turn context, and **validates the app's own analysis** (`Verified` / `Needs Correction` / `Insufficient Data`) against the latest data. Fully deterministic — works with zero API keys, never fabricates figures.
- **Screener AI** — natural-language queries ("stocks with PE below 20 and ROE above 15") become real, live filters with results.
- **Portfolio** — log paper holdings under your own portfolios (goals), with per-portfolio views, live P&L and a clearly-labelled simulated Buy/Sell panel.

**Core product decisions** (why it isn't "the obvious watchlist"):
- *Meaningful change* = explicit, tunable thresholds: price move ≥2% vs your last-seen baseline, volume ≥1.5×, or attention-score shift ≥15 pts.
- *What's surfaced* = changes grouped with plain-English reasons + the data behind each metric; data we don't have (analyst targets, promoter/insider records…) is **refused**, never invented.
- *State persists* server-side in Postgres per user (JWT + Row-Level Security), so it's identical across sessions/devices.
- *Stale/conflicting data* is labelled, not hidden: auto STALE, NSE-vs-BSE CONFLICT, and a truthful delayed/last-close badge when the market is closed.
- *Scaling*: batched multi-row feed writes, one SQL pass per user for change detection, and per-listener socket fan-out; provider interface ready for a licensed broker feed.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Zustand, Socket.IO client |
| Backend | Node.js, Express, TypeScript, Socket.IO, PostgreSQL (Row-Level Security), Redis-optional (in-memory fallback) |
| Market data | TradingView India scanner (when reachable) with a clearly-labelled simulator fallback |

---

## Quick start (local)

**Prerequisites:** Node.js 18+ and PostgreSQL 14+ (or Docker).

```bash
# 1) install
npm install

# 2) database
createdb smartwatch                # adjust to your local role
cp .env.example .env                # backend config (defaults work on localhost)
cp frontend/.env.local.example frontend/.env.local

# 3) schema + demo data
npm run db:reset                    # migrate + seed (~34 companies + full demo)

# 4) run both servers
npm run dev
```

Open **http://localhost:3000** and click **"Try Demo Mode"** — no account or API keys needed. Or log in with the seeded demo account:

```
Email:    demo@smartwatch.app
Password: demo1234
```

> No keys required. If TradingView is unreachable the app runs a clearly-labelled simulator (`DELAYED`/`DEMO`). To see change-detection any time, open **Demo Control** (avatar menu) and fire a scenario like "Sudden price spike".

### Environment variables (all optional for local dev)

- `DATABASE_URL` — Postgres connection string (defaults to `postgres://<user>@localhost:5432/smartwatch`)
- `REDIS_URL` — optional; falls back to in-memory cache
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — change in production
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — blank ⇒ Google runs as a documented stub
- `OPENAI_API_KEY` — blank ⇒ the AI Analyst stays fully deterministic/offline
- `SMTP_*` — blank ⇒ email digest shows a preview instead of sending
- `LIVE_FEED_LICENSED=true` — **only** with an authorized broker real-time feed (Kite/Upstox/Angel) before the UI may show `LIVE`
- `COOKIE_SAMESITE=none` — set when the frontend and API are on different domains (e.g. Vercel + Render)
- Dev/test only: `SIMULATE_MARKET_OPEN`, `FORCE_SIMULATOR`

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Backend `:4000` + frontend `:3000` together |
| `npm run build` | Type-check & build both |
| `npm start` | Run the production server (backend serves the built frontend, one origin) |
| `npm run db:reset` / `db:migrate` / `db:seed` | Drop+migrate+seed / migrate / seed |
| `npm run demo:proxy` | Single-port proxy (frontend + API + socket) for an instant tunnel |

### Verification scripts (run against a live backend)

```bash
node backend/scripts/verify-external.mjs     # cross-check every watchlist ticker vs real NSE close
node backend/scripts/trend-consistency.mjs   # assert sparkline direction == displayed 1D %
node backend/scripts/evalAi.mjs              # AI Analyst eval (37 questions across 8 categories)
node backend/scripts/reconcile-watchlist.ts  # restore stored closes from the market close
```

---

## Deployment & public demo link

A permanent live link needs a 24/7 host (this repo ships ready for a single Render service or a Vercel-frontend + Render-API split).

- **[DEPLOY.md](DEPLOY.md)** — step-by-step for Render + Neon, and the instant-tunnel option.
- `render.yaml` — one-service blueprint (static frontend + API + Socket.IO, single origin, auto-seed).
- The frontend is a Next.js **static export** (`frontend/out`); the backend can serve it or you can host it on Vercel and point `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` at the backend.

### Run it (Vercel — recommended)

The app is deployed on **Vercel** — no install, no keys:

1. Open **https://groww-smartwatch-frontend.vercel.app/?demo=1** → the demo dashboard loads directly.
   - Add `?demo=1` to auto-enter demo mode; open the plain URL (`/`) for the email login (**demo@smartwatch.app / demo1234**).
2. The Vercel app is the frontend and needs the backend running to load live data. Deploy the backend (see below / [DEPLOY.md](DEPLOY.md)), then set these so the app connects:
   - **Vercel env:** `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` = your backend URL (e.g. `https://smartwatch-api.onrender.com`)
   - **Backend env:** `FRONTEND_URL=https://groww-smartwatch-frontend.vercel.app`, `COOKIE_SAMESITE=none`, plus `DATABASE_URL`
3. If you only want to try the UI locally: `npm run dev` → `http://localhost:3000` (also uses the backend on `:4000`).

---

## Repository structure

```
backend/   Express API, Postgres schema (RLS), Socket.IO feed, change-detection,
           insights/validation services, AI Analyst engine, scripts
frontend/  Next.js app, unified market store, MarketDataProvider/useStockData,
           watchlist UI, charts, AI Analyst page, error boundaries
scripts/   dev proxy + source packager for the hackathon upload
DEPLOY.md  deployment runbooks
SUBMISSION.md  hackathon submission kit (title/desc/video script/limitations)
```

## Known limitations (honest)

- Market data is last-close/delayed unless a **licensed** real-time feed is configured (`LIVE_FEED_LICENSED` + broker key). The UI never claims LIVE without one.
- A few tickers (e.g. TATAMOTORS) can't currently be externally verified by the free sources used; they show a "verification pending" flag rather than false confidence.
- Long-history candles are application-derived until a broker historical API is connected.

## Disclaimer

Educational research tool — not investment advice. SMARTWATCH does not execute trades or guarantee returns.
