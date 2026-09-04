-- SMARTWATCH schema (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- GROUP 1: AUTH & USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT UNIQUE NOT NULL,
  email_verified    BOOLEAN DEFAULT FALSE,
  password_hash     TEXT,
  full_name         TEXT NOT NULL,
  avatar_url        TEXT,
  auth_provider     TEXT NOT NULL DEFAULT 'email',
  google_sub        TEXT UNIQUE,
  knowledge_level   TEXT DEFAULT 'beginner',
  onboarding_goals  TEXT[] DEFAULT '{}',
  risk_appetite     TEXT DEFAULT 'moderate',
  is_demo_account   BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  device_label  TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

-- ============================================================
-- GROUP 2: REFERENCE / MASTER DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS instruments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol            TEXT NOT NULL,
  exchange          TEXT NOT NULL,
  instrument_type   TEXT NOT NULL DEFAULT 'stock',
  company_name      TEXT NOT NULL,
  sector            TEXT,
  industry          TEXT,
  logo_url          TEXT,
  isin              TEXT,
  listed_date       DATE,
  is_active         BOOLEAN DEFAULT TRUE,
  UNIQUE(symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments (symbol);
CREATE INDEX IF NOT EXISTS idx_instruments_sector ON instruments (sector);

CREATE TABLE IF NOT EXISTS fundamentals_snapshot (
  instrument_id       UUID REFERENCES instruments(id) ON DELETE CASCADE,
  as_of_date          DATE NOT NULL,
  market_cap          NUMERIC,
  pe_ratio             NUMERIC,
  pb_ratio             NUMERIC,
  ps_ratio             NUMERIC,
  peg_ratio             NUMERIC,
  ev_ebitda            NUMERIC,
  debt_to_equity       NUMERIC,
  current_ratio        NUMERIC,
  roe_pct              NUMERIC,
  operating_margin_pct NUMERIC,
  free_cash_flow       NUMERIC,
  revenue_growth_yoy_pct NUMERIC,
  earnings_growth_yoy_pct NUMERIC,
  dividend_yield_pct   NUMERIC,
  payout_ratio_pct     NUMERIC,
  fair_value_estimate  NUMERIC,
  sharia_debt_ratio_pct NUMERIC,
  sharia_interest_ratio_pct NUMERIC,
  sharia_status         TEXT,
  PRIMARY KEY (instrument_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS etf_details (
  instrument_id     UUID PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
  expense_ratio_pct NUMERIC,
  benchmark_index   TEXT,
  aum               NUMERIC,
  tracking_error_pct NUMERIC,
  top_holdings      JSONB
);

CREATE TABLE IF NOT EXISTS institutional_holdings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id   UUID REFERENCES instruments(id) ON DELETE CASCADE,
  as_of_date      DATE NOT NULL,
  holder_name     TEXT NOT NULL,
  ownership_pct   NUMERIC,
  change_pct      NUMERIC
);

CREATE TABLE IF NOT EXISTS earnings_calendar (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id   UUID REFERENCES instruments(id) ON DELETE CASCADE,
  earnings_date   DATE NOT NULL,
  eps_expected    NUMERIC,
  eps_previous    NUMERIC,
  eps_actual      NUMERIC,
  guidance_note   TEXT
);

CREATE TABLE IF NOT EXISTS news_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id   UUID REFERENCES instruments(id) ON DELETE CASCADE,
  headline        TEXT NOT NULL,
  source          TEXT,
  url             TEXT,
  sentiment       TEXT,
  published_at    TIMESTAMPTZ
);

-- ============================================================
-- GROUP 3: LIVE / TIME-SERIES MARKET DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS price_ticks (
  instrument_id   UUID PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
  ltp             NUMERIC NOT NULL,
  prev_close      NUMERIC NOT NULL,
  day_open        NUMERIC,
  day_high        NUMERIC,
  day_low         NUMERIC,
  volume          BIGINT,
  avg_volume_20d  BIGINT,
  week52_high     NUMERIC,
  week52_low      NUMERIC,
  bse_ltp         NUMERIC,
  bse_prev_close  NUMERIC,
  perf_1w         NUMERIC,
  perf_1m         NUMERIC,
  perf_3m         NUMERIC,
  perf_6m         NUMERIC,
  perf_1y         NUMERIC,
  data_status     TEXT DEFAULT 'LIVE',
  updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS bse_ltp NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS bse_prev_close NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS perf_1w NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS perf_1m NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS perf_3m NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS perf_6m NUMERIC;
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS perf_1y NUMERIC;

CREATE TABLE IF NOT EXISTS price_candles (
  instrument_id   UUID REFERENCES instruments(id) ON DELETE CASCADE,
  interval        TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  open            NUMERIC,
  high            NUMERIC,
  low             NUMERIC,
  close           NUMERIC,
  volume          BIGINT,
  PRIMARY KEY (instrument_id, interval, ts)
);

CREATE TABLE IF NOT EXISTS index_ticks (
  index_symbol    TEXT PRIMARY KEY,
  level           NUMERIC NOT NULL,
  change_abs      NUMERIC,
  change_pct      NUMERIC,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instrument_scores (
  instrument_id       UUID PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
  opportunity_score    INT,
  opportunity_breakdown JSONB,
  risk_score            INT,
  risk_breakdown JSONB,
  financial_strength_score INT,
  alpha_growth_score    INT,
  smart_money_score     INT,
  attention_score       INT,
  fair_value_status      TEXT,
  ai_verdict             TEXT,
  computed_at            TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- GROUP 4: PER-USER DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  emoji         TEXT DEFAULT '📈',
  description   TEXT,
  is_default    BOOLEAN DEFAULT FALSE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists (user_id);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  watch_intent    TEXT,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  added_price     NUMERIC,
  entry_level     NUMERIC,
  exit_level      NUMERIC,
  is_pinned       BOOLEAN DEFAULT FALSE,
  sort_order      INT DEFAULT 0,
  added_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(watchlist_id, instrument_id)
);
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS added_price NUMERIC;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS entry_level NUMERIC;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS exit_level NUMERIC;

CREATE TABLE IF NOT EXISTS user_instrument_memory (
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id             UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  last_seen_price           NUMERIC,
  last_seen_volume          BIGINT,
  last_seen_attention_score INT,
  last_seen_opportunity_score INT,
  last_seen_risk_score      INT,
  last_seen_at              TIMESTAMPTZ,
  last_viewed_at            TIMESTAMPTZ,
  PRIMARY KEY (user_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS change_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  magnitude       NUMERIC,
  confidence      INT,
  explanation     TEXT,
  detected_at     TIMESTAMPTZ DEFAULT now(),
  reviewed        BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_change_events_user ON change_events (user_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id   UUID REFERENCES instruments(id) ON DELETE CASCADE,
  condition_json  JSONB NOT NULL,
  notify_mode     TEXT DEFAULT 'immediate',
  is_active       BOOLEAN DEFAULT TRUE,
  trigger_count   INT DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id        UUID REFERENCES alerts(id) ON DELETE SET NULL,
  instrument_id   UUID REFERENCES instruments(id),
  title           TEXT NOT NULL,
  body            TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  status          TEXT DEFAULT 'holding',
  quantity        NUMERIC NOT NULL,
  buy_price       NUMERIC NOT NULL,
  buy_date        DATE NOT NULL,
  sell_price      NUMERIC,
  sell_date       DATE,
  fees            NUMERIC DEFAULT 0,
  thesis_notes    TEXT,
  price_target    NUMERIC,
  stop_loss       NUMERIC,
  goal_id         UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_positions (user_id);
ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS goal_id UUID;

CREATE TABLE IF NOT EXISTS portfolio_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  target_amount   NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON portfolio_goals (user_id);

CREATE TABLE IF NOT EXISTS investment_journal (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id     UUID REFERENCES portfolio_positions(id) ON DELETE CASCADE,
  entry_text      TEXT NOT NULL,
  entry_type      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument_id   UUID REFERENCES instruments(id),
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  intent          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_screens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  filters_json    JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_subscriptions (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT TRUE,
  frequency       TEXT DEFAULT 'daily',   -- daily | weekly
  last_sent_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  status          TEXT DEFAULT 'queued',  -- queued | sent | preview
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT DEFAULT 'free',
  status          TEXT DEFAULT 'active',
  trial_ends_at   TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  provider_customer_id TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watchlists_isolation ON watchlists;
CREATE POLICY watchlists_isolation ON watchlists
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watchlist_items_isolation ON watchlist_items;
CREATE POLICY watchlist_items_isolation ON watchlist_items
  USING (watchlist_id IN (SELECT id FROM watchlists WHERE user_id = current_setting('app.current_user_id', true)::uuid));

ALTER TABLE user_instrument_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_isolation ON user_instrument_memory;
CREATE POLICY memory_isolation ON user_instrument_memory
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_events_isolation ON change_events;
CREATE POLICY change_events_isolation ON change_events
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerts_isolation ON alerts;
CREATE POLICY alerts_isolation ON alerts
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_isolation ON notifications;
CREATE POLICY notifications_isolation ON notifications
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_isolation ON portfolio_positions;
CREATE POLICY portfolio_isolation ON portfolio_positions
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE portfolio_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goals_isolation ON portfolio_goals;
CREATE POLICY goals_isolation ON portfolio_goals
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE investment_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_isolation ON investment_journal;
CREATE POLICY journal_isolation ON investment_journal
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_conversations_isolation ON ai_conversations;
CREATE POLICY ai_conversations_isolation ON ai_conversations
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE saved_screens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_screens_isolation ON saved_screens;
CREATE POLICY saved_screens_isolation ON saved_screens
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE news_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_subscriptions_isolation ON news_subscriptions;
CREATE POLICY news_subscriptions_isolation ON news_subscriptions
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

ALTER TABLE email_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_digests_isolation ON email_digests;
CREATE POLICY email_digests_isolation ON email_digests
  USING (user_id = current_setting('app.current_user_id', true)::uuid);
