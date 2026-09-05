# SMARTWATCH

**Don't watch everything. Know what changed.**

A full-stack Indian-equity **smart market watchlist** built end-to-end (React/Next.js frontend + Node/Express/Postgres backend). It layers "personal market memory" and data-grounded AI onto a watchlist — so instead of a wall of flickering numbers, you get: *what meaningfully changed since you last looked, whether the app's own analysis is still right, and why.*

> ⚠️ Educational research tool — **not financial advice**. SMARTWATCH does not execute trades or guarantee returns. It uses public market-data sources and clearly-labelled simulation.

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

## Deployment & public demo link

# Instructions to Run

##Instructions to Run
-Live Demo

-The project is fully deployed and can be tested directly using the live application:

-Live Demo: https://groww-smartwatch-frontend.vercel.app/

-Demo Account

-click just exploring?Demo mode

-Or create new account

-The live application is connected to the deployed backend and database. No local setup or configuration is required to test the project.

-Reviewers can simply open the live demo link, sign in using the demo credentials above, and explore the application.


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
