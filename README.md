# SMARTWATCH

**Don't watch everything. Know what changed.**

A full-stack stock watchlist intelligence app: Groww-style watchlist & order UI layered with Warifin-style AI intelligence. Every user gets their own private, live-updating watchlists, portfolio, alerts and "personal market memory" — isolated at the database level.

> Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.

## Stack

- **Backend** — Node.js + Express + TypeScript, PostgreSQL (with Row-Level Security), Redis (optional, in-memory fallback), Socket.IO for live updates, JWT auth (access + rotating refresh tokens), bcrypt.
- **Frontend** — Next.js 14 (App Router) + React + TypeScript, Tailwind CSS, Zustand, Recharts, Socket.IO client.
- **Infra** — `docker-compose.yml` for Postgres + Redis (optional — works against a local Postgres too).

## Quick start

### 1. Database

Either use Docker:

```bash
docker compose up -d
```

…or use an existing local PostgreSQL (Homebrew, etc.) and create the database:

```bash
createdb smartwatch        # via psql; role is your OS user by default
```

Then copy env files:

```bash
cp .env.example .env                       # backend (see note below)
cp frontend/.env.local.example frontend/.env.local   # if you changed ports
```

`DATABASE_URL` defaults to `postgres://gayathris@localhost:5432/smartwatch`. Edit it to match your local role. For Docker, use `postgres://smartwatch:smartwatch@localhost:5432/smartwatch`.

### 2. Install

```bash
npm install           # at the repo root (installs backend + frontend + root tools)
```

### 3. Migrate + seed

```bash
npm run db:reset      # drop, migrate, and seed demo data (safe to re-run)
```

Seeds a demo account — **demo@smartwatch.app / demo1234** — plus ~34 Indian stocks/ETFs, 5 indices, 90 days of candles, fundamentals, scores, watchlists, a portfolio, alerts and last-seen baselines.

### 4. Run

```bash
npm run dev           # backend :4000 + frontend :3000 concurrently
```

Open http://localhost:3000 → click **"Try Demo Mode"** or log in with the demo credentials. Sign up to create your own account.

## What's implemented (spec mapping)

- **Tier 0 — Auth & onboarding**: email/password (bcrypt, rate-limited), Google OAuth (server-verified; runs as a labelled stub until `GOOGLE_CLIENT_ID` is set), JWT access + rotating refresh tokens, session management, goal-picker onboarding, knowledge-level quiz, demo mode.
- **Tier 1/2 — Personal market memory & change detection**: `user_instrument_memory` baseline per (user, instrument); a background worker detects price/volume changes since last review and emits `change_events` + notifications.
- **Tier 3/4 — Scoring & watchlists**: deterministic Opportunity / Risk / Attention / Financial Strength scores; multi-watchlist CRUD.
- **Tier 5/6 — Market intelligence**: index ticker, market breadth, sector performance, institutional holdings, news.
- **Tier 7 — Screener**: 30+ filterable params + presets (Alpha Leaders, Emerging Winners, Safe Bets, Sharia, etc.) + save/restore screens.
- **Tier 8 — AI Analyst**: deterministic, data-grounded Q&A (why-changed, verdict, scores, summary, compare) — no API key needed. Optional `OPENAI_API_KEY` hook point.
- **Tier 9/10 — Education & portfolio**: lessons, simulated portfolio tracking (no brokerage), investment journal.
- **Tier 11/12 — Alerts & live updates**: trigger-builder alerts, Socket.IO tick streams, live index strip. Prices stream live from **TradingView's public India scanner API** (~3s, NSE live + BSE every 30s), with a local simulator fallback when offline.
- **Full market universe**: on boot, SMARTWATCH imports the top ~400 Indian companies (by market cap) from TradingView — search, screener, charts and AI all cover every major listed company, each with NSE + BSE quotes and candlestick history. Raise `UNIVERSE_LIMIT` to import more.
- **Tier 13/14/15 — Reliability & demo mode**: data-status badges (LIVE/DELAYED/STALE/CONFLICT), a Demo Control Center with seeded scenarios, Redis read-through cache with in-memory fallback.
- **Tier 16 — Groww-style watchlist UI**: live index strip, multi-tab watchlists (drag reorder, rename/delete, create), sparkline trend column, 52-week range slider, slide-over stock detail panel with "Add to Portfolio" / "Set Alert" tabs, column picker, search/add-stocks modal.
- **Tier 17 — Warifin-style intelligence**: AI verdict badges (BUY-lean/HOLD/WATCH/AVOID-lean), AI company summary, Wealth Blueprint, Alpha Growth Score, Smart Money Score, ETF intelligence, Sharia screening.
- **Email news digest**: subscribe to a daily/weekly email of watchlist news + top movers. Sends via SMTP when `SMTP_HOST` is set, otherwise shows a preview (works fully offline).

## Database schema

Full schema lives in `backend/src/db/schema.sql`, separated into four groups (auth, reference data, live/time-series, per-user) with Row-Level Security on every per-user table. The app sets `app.current_user_id` per request; RLS enforces isolation automatically whenever the app connects as a non-superuser role (local dev as superuser bypasses RLS, but all queries still filter by `user_id`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run backend + frontend together |
| `npm run build` | Type-check & build both |
| `npm run db:reset` | Drop + migrate + seed |
| `npm run db:migrate` | Apply schema only |
| `npm run db:seed` | Seed demo data only |

## Environment variables

See `.env.example` (backend). The important ones:

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — optional; app falls back to in-memory cache if unreachable
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — change in production
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — leave blank for the stub flow
- `OPENAI_API_KEY` — optional; blank keeps the analyst fully deterministic

## Google OAuth (production)

1. Create OAuth credentials in Google Cloud Console (Web client).
2. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the backend `.env`.
3. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` and load the Google Identity Services script + official button widget (see `components/auth/GoogleButton.tsx`). The backend verifies the ID token against Google's tokeninfo/JWKS endpoint — never trust the frontend profile.
