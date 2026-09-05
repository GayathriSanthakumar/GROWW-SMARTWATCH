# SMARTWATCH — Code by Groww 2026 Submission Kit

Everything below is copy-ready for the submission form. All flows referenced were
verified with a real headless browser against the live build (zero console errors).

---

## 1. Title 

2. **SMARTWATCH: A Watchlist That Tells You What Matters, Not Just What Moved**


Why it's not "just another watchlist": it tells you *what changed while you were
away*, *whether the app's own analysis is still correct*, and *why* — with AI-style
explanations grounded in the real data behind every metric.

---

## 2. Description

### The problem
Investors don't lose to a lack of data — they lose to **information overload**.
A watchlist shows you 40 rows of flickering numbers every day. The real question is:
*"Out of everything I track, what meaningfully changed since the last time I looked,
and does that change my view?"*

### What SMARTWATCH does
SMARTWATCH is a full-stack Indian-equity watchlist with **personal market memory**.
It doesn't just show latest prices; it records a baseline of everything you looked at
(price, scores, valuation, AI verdict) and, when you return, surfaces **what changed
since you were last here**, explains **why**, and **validates whether the app's own
analysis is still correct** against the latest market and technical data.

### The three bare-minimum requirements
- **Create & manage a watchlist** — multiple named watchlists, drag-reorder, notes/tags,
  pin, move-between-lists, search-to-add. Persists server-side per user (verified empty,
  1-stock, and 11-stock states; survives refresh and re-login).
- **View latest market information** — live index strip and ticking quotes (TradingView-
  sourced when reachable, clearly-labelled simulator fallback), market breadth, movers,
  sector performance, per-stock charts across 12 timeframes.
- **Return later and see what changed** — every view is snapshotted (append-only history).
  On return, a "Since you were last here" hub lists real detected changes (price moves
  ≥2%, volume ≥1.5×, attention shifts ≥15 pts) and one click baselines you for the next
  visit.

### Product decisions (and why)
- **What counts as "meaningful change"** — not every tick. Thresholds are explicit and
  tunable: ≥2% price move vs your last-seen baseline, ≥1.5× volume, ≥15-pt attention
  shift. Noise is deliberately ignored.
- **What to surface** — changes are grouped by type with plain-English explanations
  ("TCS has moved 6% up since you last reviewed it…"). I deliberately left out
  per-minute noise, and I refuse (rather than fabricate) data the product doesn't have
  (analyst targets, promoter filings, earnings-call quotes) — an honest "I don't have
  that" beats a confident guess.
- **How state persists across sessions/devices** — all user state (watchlists, memory
  baselines, snapshots, alerts, portfolio) is server-side Postgres scoped per user with
  JWT sessions and Row-Level Security, so state is the same on any device. UI preferences
  (hidden columns/sort) persist locally.
- **Stale / delayed / conflicting data** — data is honestly labelled (LIVE / DELAYED /
  STALE / CONFLICT). While the market is open the app auto-flags rows not refreshed for
  3 minutes as STALE and flags NSE-vs-BSE divergence >1.5pp as CONFLICT. It never claims
  real-time when it isn't.
- **Scaling** — the hot loops are batched (a ~800-instrument feed updates via a handful
  of multi-row SQL statements, not 800 sequential writes), change detection is one SQL
  pass per user, socket events only go to rooms with listeners, and hot-path indexes
  exist. Architecture is a provider interface so a licensed broker feed can replace the
  TradingView/demo provider without touching UI.
- **Simple vs complex** — complexity was added only where it creates trust (real snapshots,
  honest data-status, no-fabrication rules). Everything else stayed deliberately simple.

### Why this isn't "the obvious watchlist"
- **AI Analyst** — a company-aware analyst that answers conceptual, company-specific,
  screening and "why did this change" questions, with multi-turn context and prompt-
  injection/refusal guardrails. It validates the app's existing analysis
  (**Verified / Needs Correction / Insufficient Data**).
- **Alpha Growth & Smart Money scores, AI verdicts** — deterministic,
  explainable scoring that the AI actually explains from the real numbers.
- **Screener AI** — natural language → live structured filters → real sortable results.
- **Trustworthy numbers** — the visual trend is drawn from real candle closes; 1-day
  change uses the actual previous close; "since last view" uses stored snapshots; the AI
  and the charts share the same verified data.

---

## 3. Theme

Built around the Groww 2026 **"What to build?"** prompt — an end-to-end product that
helps everyday Indian investors cut through noise. On the form, pick the option that
matches **building your own investor-facing product/app** (i.e., not a specific
pre-defined problem to solve) and describe it as: *"A stock watchlist that tells you
what changed, what it means, and whether your analysis is still right."*
If the form lists target users/domains, select **retail investing / personal finance /
decision support**. Adjust to the exact wording of the dropdown if it differs — the
submission content above matches any investor-tool category.

---

## 4. Screenshots (capture these 6)

1. **Landing / value prop** (`/`) — headline + "Try Demo Mode".
2. **Watchlist — populated** — index strip, live quotes, AI verdict badges, the new
   real-candle Trend sparklines.
3. **"Since you were last here" hub** — the changes list with catch-up button.
4. **Stock detail panel** — 1-day change, AI Analysis & validation, What-changed
   comparison, metric explanations.
5. **AI Analyst page** — company context card + a chat answer.
6. **Screener AI / Market** — a natural-language screener result (or Market Radar).

Before each capture: the flow was verified zero-console-error and flicker-free in QA.

---

## 5. Video script (60–90s)

1. **(0–8s) Problem:** "Every morning investors stare at a watchlist of flickering
   numbers. The hard part isn't finding data — it's knowing what actually changed and
   whether it matters."
2. **(8–20s) Solution:** "SMARTWATCH remembers what you last looked at. When you come
   back it tells you what meaningfully changed — and whether its own analysis is still
   right."
3. **(20–45s) Walkthrough 1 — Watchlist:** add/remove stocks, live quotes + AI verdicts,
   trend sparklines from real candles.
4. **(45–60s) Walkthrough 2 — Return:** trigger a move, come back → "Since you were
   last here", one-click catch-up.
5. **(60–80s) Differentiators:** AI Analyst validates the analysis (Verified / Needs
   Correction) and explains metrics; Screener AI turns plain English into filters.
6. **(80–90s) Close:** "Educational research tool — built end-to-end. Don't watch
   everything — know what changed."

---

## 6. Demo link

Current live tunnel: **https://vermont-sufficiently-silly-investor.trycloudflare.com/?demo=1**
Log in: **demo@smartwatch.app / demo1234** (or click **Try Demo Mode** — no keys needed).

⚠️ This is a Cloudflare Quick Tunnel: it works now, but the host can change if the
tunnel is restarted. **Before submitting, deploy the permanent version** (Neon Postgres
+ Render web service) using `DEPLOY.md` — it produces a stable `*.onrender.com` URL and
the backend auto-seeds the demo account on first boot. Do not submit a quick-tunnel URL
as your only link.

---



## 8. Source code upload (< 50 MB)

Run from the repo root:

```bash
bash scripts/package-submission.sh
```

This creates `../GROWW-SMARTWATCH-submission.zip` excluding `node_modules`, `.git`,
build output, logs, and real `.env` files (it keeps `.env.example`). Typical size is a
few MB — well under 50 MB.

---

## Known limitations (honest & scoped)

- **Market data is last-close/delayed, not a licensed real-time feed.** No broker API
  credentials were available at build time, so the app labels itself DELAYED/DEMO (never
  LIVE) unless `LIVE_FEED_LICENSED=true` + a broker key (Kite Connect, Upstox, Angel) is
  configured. Path: swap the provider behind `services/marketData.ts` + `candleService`.
- **Price verification:** stored quotes were cross-verified against an external source for
  the watchlist universe — 13/15 exact matches after reconciliation
  (`backend/scripts/verify-external.mjs`, `backend/scripts/reconcile-watchlist.ts`).
  3MINDIA and LT differ by a small partial-bar window, and **TATAMOTORS** could not be
  verified externally at all (Yahoo/TradingView returned no data) — it is flagged
  "verification pending" in the UI rather than shown with false confidence.
- **Historical multi-year candles** are application-derived (deterministic from real
  price/perf anchors) until a broker historical API is connected; charts are labelled
  accordingly.

**Re-run before submitting:** `node backend/scripts/verify-external.mjs` as a final sanity
check against the current data.

---

## 9. Instructions to run (from scratch)

**Prerequisites**
- Node.js **18+** (tested on 23), npm **9+**
- PostgreSQL **14+** running locally (or Docker), plus optional Redis (not required — the
  app falls back to an in-memory cache)

**Setup**

1. Clone and install:
   ```bash
   git clone <repo-url> smartwatch
   cd smartwatch
   npm install
   ```
2. Create the database (use your local Postgres role):
   ```bash
   createdb smartwatch        # role = your OS user by default
   cp .env.example .env        # backend env
   cp frontend/.env.local.example frontend/.env.local
   ```
3. Look inside `.env.example` — defaults work out of the box on localhost. The only
   values you may need to change: `DATABASE_URL` (if your Postgres user differs).
   Leave everything else blank — **no API keys are required**.
4. Build the schema and seed demo data:
   ```bash
   npm run db:reset
   ```
5. Start both servers:
   ```bash
   npm run dev      # backend on :4000, frontend on :3000
   ```
6. Open **http://localhost:3000**

**Using it with zero friction (no account, no keys)**
- Click **"Try Demo Mode"** on the landing page — you're instantly in a fully-populated
  demo account (watchlist, market data, AI Analyst, portfolio).
- Or log in with the seeded demo account: **demo@smartwatch.app / demo1234**.
- The market feed: TradingView is used when reachable (shows **LIVE**); offline it runs a
  clearly-labelled simulator (shows **DELAYED/DEMO**). To see change detection anytime,
  open **Demo Control** (avatar menu) and fire a scenario like "Sudden price spike".
- Educational research tool — not financial advice. SMARTWATCH does not execute trades
  or guarantee returns.
