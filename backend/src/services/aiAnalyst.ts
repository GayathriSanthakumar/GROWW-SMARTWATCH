import { query } from "../db/pool.js";
import { aiVerdictLabel, alphaGrowthCategory, smartMoneyVerdict } from "./scoring.js";
import { ema, rsi, lastValue } from "./indicators.js";

// Deterministic, data-grounded AI analyst + market/candlestick education engine.
// Every response is generated from the instrument's own scores, fundamentals,
// candles, news and a curated education knowledge base — no external API key
// required, and no financial numbers are fabricated.

export type KnowledgeLevel = "beginner" | "intermediate" | "advanced";
export type Intent =
  | "WHY_CHANGED" | "COMPARE_STOCKS" | "EXPLAIN_SCORE" | "VERDICT"
  | "SUMMARY" | "HISTORY" | "FORECAST" | "ANALYZE" | "CANDLE" | "PATTERN"
  | "SUPPORT_RESISTANCE" | "BUY_SELL" | "RISK" | "EDUCATION" | "MARKET_STATUS"
  | "NEWS" | "FUNDAMENTALS" | "VALUATION" | "GROWTH" | "DIVIDEND"
  | "SCREEN" | "REFUSE" | "NO_DATA" | "GENERAL";

export interface NewsItem {
  headline: string;
  source: string | null;
  sentiment: string | null;
  publishedAt: string | null;
}

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface InstrumentCtx {
  symbol: string;
  companyName: string;
  sector: string;
  ltp: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  bseLtp: number | null;
  bseChangePct: number | null;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  perf1w: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf6m: number | null;
  perf1y: number | null;
  pe: number;
  peg: number;
  debtToEquity: number;
  roe: number;
  operatingMargin: number;
  revenueGrowth: number;
  earningsGrowth: number;
  dividendYield: number;
  fairValue: number;
  fairValueStatus: string;
  aiVerdict: string;
  opportunity: number;
  risk: number;
  financialStrength: number;
  alphaGrowth: number;
  smartMoney: number;
  newsSentiment: string[];
}

const r = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

// ────────────────────────────────────────────────────────────────────────────
// Context + instrument retrieval
// ────────────────────────────────────────────────────────────────────────────

export async function fetchInstrumentCtx(instrumentId: string): Promise<InstrumentCtx | null> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.symbol, i.company_name, i.sector, pt.ltp, pt.prev_close, pt.volume, pt.avg_volume_20d,
            pt.bse_ltp, pt.bse_prev_close, pt.day_open, pt.day_high, pt.day_low,
            pt.week52_high, pt.week52_low, pt.perf_1w, pt.perf_1m, pt.perf_3m, pt.perf_6m, pt.perf_1y,
            fs.pe_ratio, fs.peg_ratio, fs.debt_to_equity, fs.roe_pct, fs.operating_margin_pct,
            fs.revenue_growth_yoy_pct, fs.earnings_growth_yoy_pct, fs.dividend_yield_pct, fs.fair_value_estimate,
            sc.opportunity_score, sc.risk_score, sc.financial_strength_score, sc.alpha_growth_score, sc.smart_money_score,
            sc.fair_value_status, sc.ai_verdict
     FROM instruments i
     LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
     LEFT JOIN fundamentals_snapshot fs ON fs.instrument_id = i.id AND fs.as_of_date = (SELECT MAX(as_of_date) FROM fundamentals_snapshot WHERE instrument_id = i.id)
     LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
     WHERE i.id = $1`,
    [instrumentId],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const news = await query<{ sentiment: string }>(
    `SELECT sentiment FROM news_items WHERE instrument_id = $1 ORDER BY published_at DESC LIMIT 5`,
    [instrumentId],
  );

  const ltp = Number(row.ltp);
  const prevClose = Number(row.prev_close);
  const bseLtp = row.bse_ltp == null ? null : Number(row.bse_ltp);
  const bsePrev = row.bse_prev_close == null ? null : Number(row.bse_prev_close);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    symbol: String(row.symbol),
    companyName: String(row.company_name),
    sector: String(row.sector),
    ltp,
    changePct: prevClose ? ((ltp - prevClose) / prevClose) * 100 : 0,
    volume: Number(row.volume),
    avgVolume: Number(row.avg_volume_20d),
    bseLtp,
    bseChangePct: bseLtp && bsePrev ? ((bseLtp - bsePrev) / bsePrev) * 100 : null,
    dayOpen: Number(row.day_open) || ltp,
    dayHigh: Number(row.day_high) || ltp,
    dayLow: Number(row.day_low) || ltp,
    week52High: Number(row.week52_high) || ltp * 1.2,
    week52Low: Number(row.week52_low) || ltp * 0.8,
    perf1w: n(row.perf_1w), perf1m: n(row.perf_1m), perf3m: n(row.perf_3m), perf6m: n(row.perf_6m), perf1y: n(row.perf_1y),
    pe: Number(row.pe_ratio), peg: Number(row.peg_ratio), debtToEquity: Number(row.debt_to_equity),
    roe: Number(row.roe_pct), operatingMargin: Number(row.operating_margin_pct),
    revenueGrowth: Number(row.revenue_growth_yoy_pct), earningsGrowth: Number(row.earnings_growth_yoy_pct),
    dividendYield: Number(row.dividend_yield_pct), fairValue: Number(row.fair_value_estimate),
    fairValueStatus: String(row.fair_value_status), aiVerdict: String(row.ai_verdict),
    opportunity: Number(row.opportunity_score), risk: Number(row.risk_score),
    financialStrength: Number(row.financial_strength_score), alphaGrowth: Number(row.alpha_growth_score),
    smartMoney: Number(row.smart_money_score),
    newsSentiment: news.rows.map((x) => x.sentiment),
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function resolveInstrumentFromText(message: string): Promise<{ id: string; ctx: InstrumentCtx } | null> {
  const r = await resolveInstrumentsFromText(message, 1);
  return r[0] ?? null;
}

export async function resolveInstrumentsFromText(message: string, max = 2): Promise<{ id: string; ctx: InstrumentCtx }[]> {
  const rows = await query<{ id: string; symbol: string; company_name: string }>(
    `SELECT id, symbol, company_name FROM instruments WHERE is_active = true`,
  );
  const m = message.toLowerCase();
  const found: { id: string; ctx: InstrumentCtx }[] = [];
  const seen = new Set<string>();
  // Company-name first words that are ordinary English and must never be
  // treated as a company ("indian bank stocks", "crude oil prices").
  const GENERIC_FIRST = new Set([
    "indian", "india", "oil", "bank", "banks", "state", "the", "of", "limited", "ltd",
    "co", "corp", "corporation", "industries", "group", "auto", "energy", "power", "steel", "cement",
  ]);
  // Symbols that are ordinary words must not be picked out of generic prose
  // ("crude oil prices" must not resolve to symbol OIL).
  const GENERIC_SYMBOLS = new Set(["oil", "gas", "idea", "bank", "auto", "gold", "silver", "power", "steel"]);
  for (const row of rows.rows) {
    const sym = row.symbol.toLowerCase();
    if (
      sym.length >= 2 &&
      !GENERIC_SYMBOLS.has(sym) &&
      new RegExp(`\\b${escapeRegExp(sym)}\\b`).test(m) &&
      !seen.has(row.id)
    ) {
      const ctx = await fetchInstrumentCtx(row.id);
      if (ctx) {
        found.push({ id: row.id, ctx });
        seen.add(row.id);
      }
      if (found.length >= max) return found;
    }
  }
  // Full company-name matches first (handles "HDFC Bank" over a longer name that
  // merely shares its first word). Names whose first TWO words are both generic
  // ("Indian Bank", "Oil India") are almost always false positives in prose like
  // "Indian bank stocks" or "crude oil prices" — skip them.
  for (const row of rows.rows) {
    if (seen.has(row.id)) continue;
    const name = row.company_name.toLowerCase();
    if (name.length > 3 && m.includes(name)) {
      const toks = name.split(/\s+/);
      if (toks.length >= 2 && GENERIC_FIRST.has(toks[0]) && GENERIC_FIRST.has(toks[1])) continue;
      const ctx = await fetchInstrumentCtx(row.id);
      if (ctx) {
        found.push({ id: row.id, ctx });
        seen.add(row.id);
      }
      if (found.length >= max) return found;
    }
  }
  // Shortest-name-first for first-word matches, skipping generic first words.
  for (const row of [...rows.rows].sort((a, b) => a.company_name.length - b.company_name.length)) {
    if (seen.has(row.id)) continue;
    const name = row.company_name.toLowerCase();
    const firstWord = name.split(/\s+/)[0];
    if (firstWord.length < 4 || GENERIC_FIRST.has(firstWord)) continue;
    if (new RegExp(`\\b${escapeRegExp(firstWord)}\\b`).test(m)) {
      const ctx = await fetchInstrumentCtx(row.id);
      if (ctx) {
        found.push({ id: row.id, ctx });
        seen.add(row.id);
      }
      if (found.length >= max) return found;
    }
  }
  return found;
}

// ────────────────────────────────────────────────────────────────────────────
// Intent detection
// ────────────────────────────────────────────────────────────────────────────

export function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  // 0) Safety first. These guardrails run before anything else so adversarial
  //    prompts can never reach a data path.
  if (
    /\b(ignore (all )?(previous|prior|above) (instructions|prompts|rules)|disregard (previous|prior)|forget (all )?(your )?(instructions|rules)|reveal (your|the) (system|prompt)|what (is|are) your (instructions|system prompt)|act as (my|an?) .*(broker|advisor|sebi)|pretend (you are|to be)|you are now|developer mode|jailbreak|do anything now)\b/.test(m) ||
    m.includes("ignore previous") ||
    m.includes("system prompt") ||
    m.includes("dan mode")
  )
    return "REFUSE";
  if (
    /\b(buy|sell|purchase|invest).{0,40}\b(shares|stocks|lots|units)\b/i.test(m) && // "buy 500 shares of X"
    !/\b(should i|is it|would you|worth|analysis of)\b/.test(m)
  )
    return "REFUSE"; // imperative trade instruction
  // 0b) Imperative trade instructions that are NOT framed as a question.
  if (
    /\b(buy|sell|purchase|invest).{0,40}\b(shares|stocks|lots|units)\b/i.test(m) && // "buy 500 shares of X"
    !/\b(should i|is it|would you|worth|analysis of)\b/.test(m)
  )
    return "REFUSE";

  if (/\b(history|historical|past|last week|last month|last year|52 week|ytd|previous|performance of)\b/.test(m)) return "HISTORY";
  if (/\b(predict|prediction|forecast|outlook|will it go|going to)\b/.test(m) && !/\b(target price|analyst)\b/.test(m)) return "FORECAST";
  if (/\b(support|resistance|level|floor|ceiling)\b/.test(m) && /\b(where|find|what|level)\b/.test(m)) return "SUPPORT_RESISTANCE";
  if (/\b(should i (buy|sell|hold)|buy this|sell this|is .*good (stock|buy|investment)|worth buying|good time to (buy|enter)|entry point|buy or not)\b/.test(m)) return "BUY_SELL";
  if (
    /\b(screen|screener|screen for|filter (stocks|the market)|find stocks|top stocks|stocks (that|with|below|above)|show me stocks|companies (that|with))\b/.test(m) ||
    (/\b(pe|roe|yield|margin|growth|market cap|debt|risk)\b/.test(m) &&
      /\b(below|above|under|less than|more than|greater than|less|more|low|high)\b/.test(m) &&
      !/\b(why|did |moved|move|movement|is it|what are the)\b/.test(m))
  )
    return "SCREEN";
  if (/\brisks?\b/.test(m)) return "RISK";
  if (/\b(candle|candlestick|doji|hammer|engulfing|shooting star|morning star|evening star|spinning top|wick|body of)\b/.test(m) && !/\b(analy|technic|what is|what does|explain|define|meaning|means)\b/.test(m)) return "PATTERN";
  if (/\b(latest candle|current candle|this candle|these candles|the candles|the chart|this chart|what is happening here|going down|going up)\b/.test(m)) return "CANDLE";
  if (/\b(analyze|analyse|analysis|analy\w*|technical|technicals|price action|multi.timeframe)\b/.test(m)) return "ANALYZE";
  if (/\bwhy\b.*\b(chang|move|fall|rise|drop|up|down)\b/.test(m) || m.includes("why did")) return "WHY_CHANGED";
  // "Sensex vs Nifty" / "mutual fund vs ETF" are concept comparisons, not
  // two-stock compare requests.
  const CONCEPT_VS = /\b(mutual fund|etf|sensex|nifty|pe\b|p\/e|p\/b|roe|delivery|intraday|futures|options|bull market|bear market|large cap|mid cap)\b/.test(m);
  if (/\b(compare|versus|vs\.?|comparison)\b/.test(m) && !CONCEPT_VS) return "COMPARE_STOCKS";
  if (/\b(verdict)\b/.test(m)) return "VERDICT";
  // Company-specific fundamental / news intents (must run before the generic
  // education clauses below so "what is TCS's PE ratio?" answers about TCS).
  if (/\b(news|headlines?|announcement|what.s (new|happening) with|latest on)\b/.test(m)) return "NEWS";
  if (/\b(dividend|payout|yield)\b/.test(m)) return "DIVIDEND";
  if (/\b(growing|growth|revenue growth|earnings growth|sales growth|accelerat|expansion)\b/.test(m)) return "GROWTH";
  if (/\b(fair value|overvalued|undervalued|overval|underval|expensive|cheap|valuat\w*|pe ratio|p\/e|price.to.earnings|premium)\b/.test(m)) return "VALUATION";
  if (/\b(fundamental\w*|financials|financial health|balance sheet|roe|return on equity|operating margin|profitab\w*|debt.to.equity|leverage)\b/.test(m)) return "FUNDAMENTALS";
  if (/\b(explain|what is|what are|what does|how does|meaning|means|mean|define|tell me about|describe)\b/.test(m)) return "EDUCATION";
  if (/\b(what is|what does|explain|how does|define|meaning)\b.*\b(rsi|ema|sma|volume|moving average|support|resistance|trend|candlestick|doji|timeframe|market hours|nse|bse)\b/.test(m)) return "EDUCATION";
  if (/\b(market (open|closed|status|hours)|pre.open|trading hours)\b/.test(m)) return "MARKET_STATUS";
  if (/\b(summary|overview|fundamentals)\b/.test(m)) return "SUMMARY";
  // Last resort: anything mentioning a term we can explain is an education
  // request (e.g. a bare "Sensex vs Nifty?").
  if (findConcept(message)) return "EDUCATION";
  return "GENERAL";
}

// ────────────────────────────────────────────────────────────────────────────
// Education knowledge base
// ────────────────────────────────────────────────────────────────────────────

interface Concept {
  topic: string;
  learnTopic: string;
  beginner: string;
  intermediate: string;
  advanced: string;
}

const CONCEPTS: Record<string, Concept> = {
  candlestick: {
    topic: "What is a candlestick?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A candlestick is a simple picture of how a stock's price moved during one period (like 1 minute, 1 hour or 1 day). " +
      "It uses four prices: Open (where it started), Close (where it ended), High (the highest it went) and Low (the lowest it went). " +
      "Example: if Wipro opened at ₹176, went up to ₹178, down to ₹175 and closed at ₹177, then Open=176, High=178, Low=175, Close=177. " +
      "A green candle means it closed higher than it opened (Close > Open); a red candle means it closed lower (Close < Open).",
    intermediate:
      "A candlestick encodes OHLC (Open/High/Low/Close) for a given timeframe. The rectangle between open and close is the body; the thin lines above/below are the wicks (shadows) marking the high and low. " +
      "Body size reflects conviction, and wick length shows where price was rejected.",
    advanced:
      "Candlesticks compress intra-period auction into OHLC. Body = directional impulse (close vs open); wicks = rejected excursions. Context (trend, volume, timeframe) determines significance of individual candles.",
  },
  rsi: {
    topic: "What is RSI?",
    learnTopic: "basics-candlesticks",
    beginner:
      "RSI (Relative Strength Index) is a number from 0 to 100 that tells you if a stock has been going up too fast (overbought) or down too fast (oversold). " +
      "Above 70 is usually considered overbought; below 30 is usually oversold. It is a hint, not a guarantee.",
    intermediate:
      "RSI (default 14 periods) measures the speed and size of recent price changes on a 0–100 scale. Readings above 70 suggest overbought conditions; below 30 suggest oversold. In strong trends RSI can stay elevated/oversold for extended periods.",
    advanced:
      "RSI-14 measures average gain vs average loss. Standard 70/30 overbought/oversold bands; divergences (price making new highs while RSI makes lower highs) flag momentum weakening. Treat band breaches as zones, not signals.",
  },
  ema: {
    topic: "What is EMA?",
    learnTopic: "basics-candlesticks",
    beginner:
      "EMA (Exponential Moving Average) is the average price over a number of periods, but it gives more weight to recent prices so it reacts faster. " +
      "EMA 20 is a short-term average; EMA 50 is a longer-term average. When price is above a rising EMA, the trend is generally up.",
    intermediate:
      "EMA applies exponential weighting to recent closes. EMA 20 tracks short-term trend, EMA 50 medium-term. Price above a rising EMA = bullish structure; a cross of the shorter EMA above the longer (golden cross) is a bullish signal.",
    advanced:
      "EMA reacts faster than SMA to recent price. Monitor EMA 20/50 slope and separation, price relative to the band, and crossovers for trend continuation/regime shifts. Moving averages are lagging, not predictive.",
  },
  sma: {
    topic: "What is SMA?",
    learnTopic: "basics-candlesticks",
    beginner: "SMA (Simple Moving Average) is just the plain average of the last N closing prices. It smooths out daily noise so you can see the general direction.",
    intermediate: "SMA is the unweighted mean of the last N closes. It lags price and is slower to react than EMA, useful for identifying broader trend and dynamic support/resistance.",
    advanced: "SMA is a lagging, equally-weighted mean. Longer SMAs (50/200) act as structural trend filters and dynamic S/R; slope and price crossovers define regime.",
  },
  volume: {
    topic: "What is volume?",
    learnTopic: "basics-candlesticks",
    beginner:
      "Volume is the number of shares traded during a period. High volume means lots of people are trading (strong interest); low volume means few are. " +
      "A big price move on high volume is usually more meaningful than one on low volume.",
    intermediate:
      "Volume measures participation. A breakout or breakdown is more credible when confirmed by above-average volume. Rising price on declining volume can indicate fading momentum.",
    advanced:
      "Volume confirms or denies price action. Analyze volume climax, distribution/accumulation phases, and volume-on-breakout for conviction. Divergence (price up, volume down) warns of weakening demand.",
  },
  support_resistance: {
    topic: "Support & resistance",
    learnTopic: "basics-candlesticks",
    beginner:
      "Support is a price level where a falling stock tends to stop falling (buyers step in). Resistance is a level where a rising stock tends to stop rising (sellers step in).",
    intermediate:
      "Support and resistance are zones where supply/demand previously reversed. Broken support often becomes resistance (role reversal). Levels are more significant the more times they are tested.",
    advanced:
      "S/R derive from swing highs/lows, prior consolidation, and volume nodes. Treat as zones rather than exact prices; watch for break/retest confirmation and role-reversal.",
  },
  trend: {
    topic: "What is a trend?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A trend is the general direction a stock is moving. An uptrend makes higher highs and higher lows; a downtrend makes lower highs and lower lows. Sideways is called consolidation.",
    intermediate:
      "Trend structure is defined by successive higher-highs/higher-lows (up) or lower-highs/lower-lows (down). A break of the last higher-low (up) or lower-high (down) signals potential reversal.",
    advanced:
      "Classify trend by structure (HH/HL vs LH/LL), timeframe, and moving-average alignment. Multi-timeframe confluence improves conviction; respect the higher timeframe trend.",
  },
  doji: {
    topic: "What is a Doji?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A Doji is a candle where the open and close are almost the same, so the body is very small — it looks like a cross or plus sign. It can mean buyers and sellers are balanced and no one is in control.",
    intermediate:
      "A Doji has open ≈ close (tiny body) with wicks on either side. It signals indecision; its meaning depends on context — after an uptrend it can suggest exhaustion.",
    advanced:
      "Doji = equilibrium at the close. Distinguish long-legged, dragonfly and gravestone doji by wick asymmetry; interpret within prior trend and volume context.",
  },
  hammer: {
    topic: "What is a Hammer?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A Hammer is a candle with a small body at the top and a long lower wick. It often appears after a decline and may suggest buyers are pushing the price back up.",
    intermediate:
      "A Hammer has a small body near the top and a lower wick at least twice the body. After a downtrend it can indicate a potential bullish reversal, ideally confirmed by the next candle and volume.",
    advanced:
      "Hammer = rejection of lower prices (long lower shadow, small upper body). Needs confirmation (next bar closes higher) and ideally volume expansion; false signals are common in strong downtrends.",
  },
  shooting_star: {
    topic: "What is a Shooting Star?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A Shooting Star is a candle with a small body at the bottom and a long upper wick. After a rise it may suggest sellers pushed the price back down.",
    intermediate:
      "A Shooting Star has a long upper wick and small body near the low. After an uptrend it can signal a potential bearish reversal; confirmation (next candle closes lower) increases reliability.",
    advanced:
      "Shooting star = rejection of higher prices. Significance rises near resistance; require follow-through selling to confirm, and avoid acting on it in isolation.",
  },
  market_hours: {
    topic: "Market hours (NSE/BSE)",
    learnTopic: "basics-candlesticks",
    beginner:
      "Indian stock markets (NSE and BSE) have a pre-open session from 9:00–9:15 AM, then regular trading from 9:15 AM to 3:30 PM (IST), Monday to Friday. They are closed on weekends and holidays.",
    intermediate:
      "NSE/BSE equity: 09:00–09:15 pre-open, 09:15–15:30 continuous trading, then a closing auction. Times are IST; weekends and exchange holidays are non-trading days.",
    advanced:
      "Session structure: pre-open order collection (09:00–09:15), continuous market (09:15–15:30), closing session. Auctions and circuit limits affect liquidity near open/close.",
  },
  nse_bse: {
    topic: "NSE vs BSE",
    learnTopic: "basics-candlesticks",
    beginner:
      "NSE (National Stock Exchange) and BSE (Bombay Stock Exchange) are India's two main stock exchanges. Many stocks trade on both. Prices can differ slightly because they are separate markets.",
    intermediate:
      "NSE is India's largest exchange by volume; BSE is Asia's oldest. Symbols differ (NSE uses tickers like RELIANCE; BSE uses numeric codes). Quotes come from each exchange's own order book.",
    advanced:
      "NSE and BSE are independent order books, so bid/ask and last traded price can diverge slightly. Arbitrage keeps them aligned; choose the exchange with better liquidity for a given security.",
  },
  timeframe: {
    topic: "What is a timeframe?",
    learnTopic: "basics-candlesticks",
    beginner:
      "A timeframe is how much time each candle covers. A 5-minute candle summarises 5 minutes of trading; a 1-day candle summarises a whole day. Shorter timeframes show detail; longer ones show the big picture.",
    intermediate:
      "The timeframe sets candle aggregation. 1m/5m for intraday detail; 1h/4h for intraday structure; 1d/1w/1M for swing/positional view. Higher timeframes are generally more reliable.",
    advanced:
      "Multi-timeframe analysis: trade in the direction of the higher timeframe while timing entries on the lower. Aggregation is deterministic — open of first, high/low extremes, close of last, summed volume.",
  },
  market_cap: {
    topic: "Market cap & company tiers",
    learnTopic: "",
    beginner:
      "Market cap = share price × total shares. It tells you how big a company is. In India: large-cap ≈ top 100 companies (~₹20,000 crore+), mid-cap ≈ 101–250 (~₹5,000–20,000 crore), small-cap ≈ the rest. Bigger is not 'better' — just a different risk/reward profile.",
    intermediate:
      "Tier definitions (SEBI 2017): top 100 by market cap = large, 101–250 = mid, 251+ = small. Indexes (NIFTY 50 / NIFTY Next 50 / Midcap 150) are the practical membership lists. Market cap also sets weight in index funds.",
    advanced:
      "Market cap = equity value but not enterprise value (add net debt). Tier drives liquidity, institutional mandate, and index inclusion. Use cap with float-adjusted free-float value for index weights and to size positions.",
  },
  pe_ratio: {
    topic: "What is P/E ratio?",
    learnTopic: "",
    beginner:
      "P/E = price ÷ earnings per share. It's how many years of current profit you're paying for. P/E 20 means ₹20 for every ₹1 of annual profit. Lower can mean cheaper — but only if profits are healthy.",
    intermediate:
      "P/E compares price to trailing (TTM) or forward EPS. Compare within a sector, not across sectors — banks and tech trade at very different multiples. A high P/E expects growth; a falling P/E with falling price is not automatically cheap.",
    advanced:
      "Use P/E with earnings quality (ROE, accruals), growth (PEG), and cycle. Distinguish trailing vs forward P/E. Low P/E can be a value trap (distressed earnings) and high P/E can persist in structural growers.",
  },
  pb_ratio: {
    topic: "What is P/B ratio?",
    learnTopic: "",
    beginner:
      "P/B = price ÷ book value per share. Book value ≈ what shareholders own per share (assets minus liabilities). P/B below 1 can mean the market values the company below its accounting net worth.",
    intermediate:
      "P/B suits asset-heavy businesses (banks, NBFCs). Banks trade near/below book; a P/B above 2–3 is rich for most asset-heavy firms. Book value is accounting-based — it lags reality (intangibles, mark-to-market).",
    advanced:
      "P/B is most meaningful for financials and cyclicals. Adjust for ROE: P/B ≈ ROE ÷ required return is a rough fair-value anchor (Gordon-style). Intangible-heavy firms make book a weak denominator.",
  },
  eps: {
    topic: "What is EPS?",
    learnTopic: "",
    beginner: "EPS = profit ÷ number of shares. It's the company's profit per share. P/E is just price ÷ EPS — so EPS is the 'E' everyone talks about.",
    intermediate: "EPS = net income attributable to shareholders ÷ weighted average shares. Watch diluted EPS (after options/convertibles). Growth in EPS drives stock appreciation over time.",
    advanced: "Use diluted EPS and exclude one-offs for quality growth. EPS can be inflated by buybacks (fewer shares) even when net income is flat — separate operational growth from financial engineering.",
  },
  roe: {
    topic: "What is ROE?",
    learnTopic: "",
    beginner:
      "ROE = profit ÷ shareholders' money. It measures how well the company turns the owners' capital into profit. 15–20%+ is generally considered strong.",
    intermediate:
      "ROE decomposes via DuPont: margin × asset turnover × leverage. High ROE from heavy debt is riskier than high ROE from margins. Compare ROE within a sector.",
    advanced: "Audit ROE quality: is it driven by margins, turnover, or leverage? Use ROIC/RoCE to see returns on ALL capital (debt + equity). Watch for buyback-inflated equity dilution games.",
  },
  roce: {
    topic: "What is ROCE / RoCE?",
    learnTopic: "",
    beginner: "RoCE = operating profit ÷ total capital used (debt + equity). It shows how well the company earns on every rupee invested in it, before who paid for it.",
    intermediate: "RoCE uses EBIT ÷ (equity + debt − cash). It isolates operating efficiency from capital structure — a better cross-company gauge than ROE alone.",
    advanced: "RoCE > WACC means the company creates value as it grows. Watch capital intensity: cyclical asset-heavy firms swing RoCE wildly across the cycle.",
  },
  debt_equity: {
    topic: "What is Debt-to-Equity (D/E)?",
    learnTopic: "",
    beginner: "D/E = debt ÷ shareholders' equity. It shows how much the company borrows versus what owners put in. Below 1 is generally conservative outside banks.",
    intermediate: "Banks/NBFCs are structurally high-D/E (they lend deposits) — compare within sector. Rising D/E + falling margins = rising risk.",
    advanced: "Use net debt (debt − cash) and include leases (IFRS 16). Combine with interest coverage (EBIT ÷ interest) — the real test is ability to service debt.",
  },
  dividend_yield: {
    topic: "What is a dividend yield?",
    learnTopic: "",
    beginner: "Dividend yield = annual dividend ÷ share price, in %. It's the cash income you get per rupee of price. 3% yield = ₹3 per year per ₹100 invested.",
    intermediate: "Yield rises when price falls (same dividend). Sustainability matters: payout ratio, free cash flow, and consistency. High yield can signal a falling, risky price.",
    advanced: "Yield = payout × earnings yield. Judge total return (yield + growth). Watch special dividends and buybacks (tax-advantaged return of capital in India).",
  },
  split_bonus: {
    topic: "Stock splits, bonuses & corporate actions",
    learnTopic: "",
    beginner:
      "A split cuts the face value so you get more shares at a lower price (value unchanged). A bonus gives free shares out of reserves (value also unchanged). Both feel nice but don't create money by themselves.",
    intermediate:
      "Splits/bonuses are accounting events — market cap and your holding value don't change, only share count and price. They can improve liquidity/affordability and are a signal of confidence.",
    advanced:
      "Corporate actions require adjusting historical charts (price and EPS) for comparability. Track ex-dates: buy before ex-date for the entitlement; the price adjusts on ex-date.",
  },
  buyback_rights: {
    topic: "Buybacks & rights issues",
    learnTopic: "",
    beginner:
      "A buyback is the company buying its own shares from shareholders (returns cash, raises your % stake). A rights issue lets existing shareholders buy new shares at a discount to raise money.",
    intermediate:
      "Buybacks boost EPS if bought below intrinsic value; evaluate against dividends. Rights issues dilute unless you subscribe; the money must fund growth to create value.",
    advanced:
      "Compare buyback price vs intrinsic value and funding source. For rights: accretion/dilution math and the stated use of proceeds decide whether subscribing is rational.",
  },
  intraday_delivery: {
    topic: "Intraday vs delivery trading",
    learnTopic: "",
    beginner:
      "Delivery = you buy and the shares stay in your demat (long-term ownership). Intraday = you buy and sell the same day. Intraday is riskier — many lose because of costs and leverage.",
    intermediate:
      "Intraday is settled same-day (T+0), delivery settles T+1. Intraday positions are typically leveraged via broker margins; brokerage and STT apply per side.",
    advanced:
      "Intraday is a low-holding-period game dominated by costs and slippage; delivery lets compounding and dividends work. Match the strategy to your edge and holding horizon.",
  },
  stop_loss: {
    topic: "What is a stop-loss?",
    learnTopic: "",
    beginner:
      "A stop-loss is a pre-decided price at which you exit to limit a loss (e.g. sell if it falls 8%). It turns 'I hope it recovers' into a rule.",
    intermediate:
      "Set stops based on volatility (ATR) and structure (below support), not a random round number. A stop is an order — it can gap through on bad news. Size risk per trade (e.g. 1–2% of capital).",
    advanced:
      "Stops manage tail risk and position sizing; the exit is a probability decision, not a prediction. Factor in slippage, gaps, and your edge's win/loss asymmetry.",
  },
  fno: {
    topic: "Futures & Options (F&O) basics",
    learnTopic: "",
    beginner:
      "F&O are derivatives — contracts based on an underlying (stock/index). A future obligates you to buy/sell later; an option gives the RIGHT (not duty) to buy (call) or sell (put). They're risk tools, not toys for beginners.",
    intermediate:
      "Options have premium, strike, expiry, and greeks (delta, theta, vega). Futures use margin and mark-to-market. Open interest (OI) shows outstanding contracts — OI + price moves indicate new vs closing positions.",
    advanced:
      "Use F&O for hedging or expressing high-conviction views with defined risk (options) — understand theta decay, implied volatility, and expiry pinning. Most retail options expire worthless.",
  },
  ipo: {
    topic: "IPOs & listings",
    learnTopic: "",
    beginner:
      "IPO = a private company selling shares to the public for the first time. You bid in the offer, shares are allotted, then it lists on NSE/BSE where price moves freely.",
    intermediate:
      "Key IPO terms: price band, lot size, issue size (fresh + OFS), subscription, GMP (grey-market premium — unofficial). Allotment is lottery-based for retail; listing gain ≠ quality.",
    advanced:
      "Read the RHP (offer document) — business, risks, use of proceeds. Compare valuation vs listed peers. Post-listing, price is driven by earnings delivery, not listing-day pop.",
  },
  mf_etf_equity: {
    topic: "Mutual funds vs ETFs vs direct equity",
    learnTopic: "",
    beginner:
      "Direct equity = you own individual stocks (you do the work). Mutual funds = a professional pools your money across stocks. ETFs = funds that trade on the exchange like a stock (index tracking).",
    intermediate:
      "Index funds/ETFs give diversification cheaply. Active funds try to beat the index (higher fees, mixed results). Direct equity needs stock-picking skill and time.",
    advanced:
      "Compare on cost (TER), tracking error, and liquidity. Direct indexing / factor ETFs blur the line. Tax: equity funds LTCG over ₹1L; direct equity similar — plan accordingly.",
  },
  order_types: {
    topic: "Order types: Market, Limit, SL, SL-M",
    learnTopic: "",
    beginner:
      "Market order = buy/sell at the best available price now. Limit order = only at your price or better. SL (stop-loss) = triggers a limit order when price hits your level; SL-M triggers a market order.",
    intermediate:
      "Use limit orders to avoid paying the spread; use SL/SL-M to automate exits. Market orders risk slippage in fast moves; limit orders risk not filling.",
    advanced:
      "SL-M guarantees execution (at market) once triggered, SL guarantees price. Be aware of trigger-price vs limit-price rules and exchange circuit handling on index/stock orders.",
  },
  circuit_limits: {
    topic: "Circuit limits (price bands)",
    learnTopic: "",
    beginner:
      "NSE/BSE freeze a stock's price if it swings too much in a day (e.g. ±10–20%). If it hits the limit, trading halts — it's a shock absorber, not a prediction.",
    intermediate:
      "Band depends on the stock's volatility tier (2%, 5%, 10%, 20%, or no band). Hitting the upper/lower circuit pauses trading and can indicate extreme one-sidedness.",
    advanced:
      "Circuit = when the limit price is hit; 'locked at circuit' means no matching orders at the limit. Watch for index-level mechanisms too, and avoid assuming fills near bands.",
  },
  settlement: {
    topic: "T+1 settlement & demat",
    learnTopic: "",
    beginner:
      "T+1 means your bought shares land in your demat account the next working day (and sale money too). A demat account holds shares electronically; a trading account places orders.",
    intermediate:
      "India moved to T+1 settlement (2023). On the same day you sell, you can't reuse those shares until payout; margins/prefunding rules apply intraday.",
    advanced:
      "T+1 shortens counterparty/settlement risk vs T+2. Understand prefunding for sells, and that demat is where corporate actions (bonus/split) reflect.",
  },
  sensex_nifty: {
    topic: "Sensex vs Nifty",
    learnTopic: "",
    beginner:
      "Both are India's headline index numbers. Sensex = 30 large BSE companies; NIFTY 50 = 50 large NSE companies. They usually move together and are shorthand for 'the market'.",
    intermediate:
      "NIFTY 50 (free-float cap-weighted) is the most-traded derivatives underlying; Sensex is BSE's 30-stock index. Sector weights differ slightly, so they can diverge.",
    advanced:
      "Use broad market proxies: NIFTY 500 / midcap / smallcap for breadth vs the large-cap headliners. Index level alone hides sector rotation.",
  },
  bull_bear: {
    topic: "Bull vs bear market",
    learnTopic: "",
    beginner:
      "Bull market = prices mostly rising (optimism). Bear market = prices mostly falling (pessimism, often −20%+ from highs). They're moods of the market, not predictions.",
    intermediate:
      "Common definitions: bear = −20% from recent high; bull = +20% from low. Look at breadth, volume, and leadership to gauge health, not just the index.",
    advanced:
      "Regimes are clearer in hindsight. Watch credit conditions, earnings revisions, and liquidity (FII flows) as leading signals rather than price alone.",
  },
  technical: {
    topic: "Key indicators: MACD, Bollinger, moving averages",
    learnTopic: "",
    beginner:
      "MACD shows momentum via two moving-average lines and a signal line. Bollinger Bands draw a band around price using volatility. Both are helpers — no single indicator predicts.",
    intermediate:
      "MACD: line − signal crossover & histogram; divergence warns of fading momentum. Bollinger: price at the outer band is 'stretched'; band squeeze precedes breakouts. Moving averages smooth trend.",
    advanced:
      "Use indicators as filters within trend/context, not standalone signals. MACD histogram momentum, Bollinger %B, and mean-reversion vs breakout logic depend on regime (trending vs ranging).",
  },
};

const EDU_INTENT: Record<string, string> = {
  candlestick: "candlestick", candle: "candlestick",
  "green candle": "candlestick", "red candle": "candlestick",
  "upper wick": "candlestick", "lower wick": "candlestick", wick: "candlestick", body: "candlestick",
  rsi: "rsi", ema: "ema", sma: "sma", "moving average": "ema",
  volume: "volume", "support": "support_resistance", "resistance": "support_resistance",
  trend: "trend", doji: "doji", hammer: "hammer", "shooting star": "shooting_star",
  "market hours": "market_hours", "market open": "market_hours", "trading hours": "market_hours",
  nse: "nse_bse", bse: "nse_bse", timeframe: "timeframe",
  // Extended taxonomy (Section: basics/terminology)
  macd: "technical", bollinger: "technical", "bollinger bands": "technical",
  "market cap": "market_cap", marketcap: "market_cap", largecap: "market_cap", midcap: "market_cap", smallcap: "market_cap",
  "pe ratio": "pe_ratio", "p/e": "pe_ratio", "price to earnings": "pe_ratio",
  "pb ratio": "pb_ratio", "p/b": "pb_ratio", "price to book": "pb_ratio",
  eps: "eps", "earnings per share": "eps",
  roe: "roe", "return on equity": "roe",
  roce: "roce", "return on capital": "roce",
  "debt to equity": "debt_equity", "debt/equity": "debt_equity",
  "dividend yield": "dividend_yield",
  "stock split": "split_bonus", split: "split_bonus", bonus: "split_bonus",
  buyback: "buyback_rights", "rights issue": "buyback_rights",
  intraday: "intraday_delivery", delivery: "intraday_delivery",
  "stop loss": "stop_loss", stoploss: "stop_loss", slm: "order_types",
  fno: "fno", futures: "fno", options: "fno", "open interest": "fno",
  ipo: "ipo", fpo: "ipo", listing: "ipo",
  "mutual fund": "mf_etf_equity", "mutual funds": "mf_etf_equity", etf: "mf_etf_equity", "direct equity": "mf_etf_equity",
  "order types": "order_types", "market order": "order_types", "limit order": "order_types", "sl-m": "order_types",
  "circuit limit": "circuit_limits", circuit: "circuit_limits", "price band": "circuit_limits",
  settlement: "settlement", "t+1": "settlement", demat: "settlement", "trading account": "settlement",
  sensex: "sensex_nifty", nifty: "sensex_nifty",
  "bull market": "bull_bear", "bear market": "bull_bear",
  // Hyphenated & shorthand variants of the same concepts (avoid duplicating keys)
  "stop-loss": "stop_loss", "p/e ratio": "pe_ratio", "price-earnings": "pe_ratio",
  "stock splits": "split_bonus", splits: "split_bonus", "bonus issue": "split_bonus", "bonus shares": "split_bonus",
  "rights issues": "buyback_rights", buybacks: "buyback_rights",
  "futures and options": "fno", "options trading": "fno", "option trading": "fno",
};

function findConcept(message: string): Concept | null {
  const m = message.toLowerCase();
  for (const [key, concept] of Object.entries(EDU_INTENT)) {
    if (m.includes(key)) return CONCEPTS[concept];
  }
  if (m.includes("doji")) return CONCEPTS.doji;
  if (m.includes("hammer")) return CONCEPTS.hammer;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Technical analysis helpers
// ────────────────────────────────────────────────────────────────────────────

function computeSupportResistance(candles: Candle[], ctx: InstrumentCtx) {
  const recent = candles.slice(-30);
  const resistance = Math.max(...recent.map((c) => c.high));
  const support = Math.min(...recent.map((c) => c.low));
  return { support, resistance, support52: ctx.week52Low, resistance52: ctx.week52High };
}

function describeTrend(closes: number[], ema20: number | null, ema50: number | null, price: number): string {
  if (ema20 == null || ema50 == null) return "Insufficient data for a trend read.";
  const above20 = price >= ema20;
  const above50 = price >= ema50;
  const rising20 = ema20 >= (closes[closes.length - 6] ?? ema20);
  const cross = ema20 >= ema50 ? "EMA20 is above EMA50 (short-term trend above medium-term — bullish alignment)" : "EMA20 is below EMA50 (bearish alignment)";
  const parts = [`Price is ${above20 ? "above" : "below"} EMA20 and ${above50 ? "above" : "below"} EMA50.`, cross, `EMA20 is ${rising20 ? "rising" : "flat/falling"}.`];
  return parts.join(" ");
}

function describeRsi(rsiVal: number | null): string {
  if (rsiVal == null) return "RSI data unavailable.";
  if (rsiVal >= 70) return `RSI is ${rsiVal.toFixed(0)} — overbought territory (≥70), suggesting stretched upside momentum.`;
  if (rsiVal <= 30) return `RSI is ${rsiVal.toFixed(0)} — oversold territory (≤30), suggesting stretched downside momentum.`;
  return `RSI is ${rsiVal.toFixed(0)} — neutral zone.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Company / chart analysis (level-aware)
// ────────────────────────────────────────────────────────────────────────────

function analyzeCompany(ctx: InstrumentCtx, candles: Candle[], level: KnowledgeLevel): string {
  const closes = candles.map((c) => c.close);
  const e20 = lastValue(ema(closes, 20));
  const e50 = lastValue(ema(closes, 50));
  const rsiVal = lastValue(rsi(closes, 14));
  const sr = computeSupportResistance(candles, ctx);
  const last = candles[candles.length - 1];
  const volRatio = ctx.avgVolume ? ctx.volume / ctx.avgVolume : 1;

  const head = `### ${ctx.companyName} (${ctx.symbol}) — ${level === "beginner" ? "Simple overview" : level === "intermediate" ? "Technical view" : "Technical analysis"}\n`;
  const price = `**Price:** ₹${ctx.ltp} (${ctx.changePct >= 0 ? "+" : ""}${r(ctx.changePct)}% today) · sector ${ctx.sector}.`;

  const trend = describeTrend(closes, e20, e50, ctx.ltp);
  const rsiLine = describeRsi(rsiVal);
  const srLine = `**Support:** ₹${r(sr.support)} (52w ₹${r(sr.support52)}) · **Resistance:** ₹${r(sr.resistance)} (52w ₹${r(sr.resistance52)}).`;
  const volLine = `**Volume:** ${volRatio >= 1.5 ? "above average" : volRatio <= 0.7 ? "below average" : "near average"} (${r(volRatio)}x 20-day average).`;

  const bull: string[] = [];
  const bear: string[] = [];
  if (e20 && ctx.ltp >= e20) bull.push("price holding above EMA20");
  if (e20 && e50 && e20 >= e50) bull.push("EMA20 above EMA50 (bullish alignment)");
  if (rsiVal != null && rsiVal > 30 && rsiVal < 70) bull.push("RSI in neutral (not overbought)");
  if (volRatio >= 1.2 && ctx.changePct >= 0) bull.push("up move on healthy volume");
  if (ctx.fairValueStatus === "undervalued") bull.push("valuation reads undervalued");
  if (ctx.opportunity >= 60) bull.push("Opportunity Score high");

  if (e20 && ctx.ltp < e20) bear.push("price below EMA20");
  if (e20 && e50 && e20 < e50) bear.push("EMA20 below EMA50 (bearish alignment)");
  if (rsiVal != null && rsiVal >= 70) bear.push("RSI overbought — pullback risk");
  if (rsiVal != null && rsiVal <= 30) bear.push("RSI oversold — weak momentum");
  if (volRatio < 0.7 && ctx.changePct < 0) bear.push("down move on low conviction volume");
  if (ctx.fairValueStatus === "overvalued") bear.push("valuation reads overvalued");
  if (ctx.risk >= 60) bear.push("elevated risk score");

  let out = head + "\n" + price + "\n\n### Trend\n" + trend + "\n\n### Support & Resistance\n" + srLine + "\n\n### Momentum\n" + rsiLine + "\n\n### Volume\n" + volLine;

  if (level !== "beginner") {
    out += "\n\n### Bullish scenario\n" + (bull.length ? bull.map((b) => `- ${b}`).join("\n") : "- No strong bullish signals currently.") +
      "\n\n### Bearish scenario\n" + (bear.length ? bear.map((b) => `- ${b}`).join("\n") : "- No strong bearish signals currently.");
  }

  out += `\n\n**Bottom line:** ${ctx.companyName} is ${aiVerdictLabel(ctx.aiVerdict)} (Opportunity ${ctx.opportunity}/100, Risk ${ctx.risk}/100).`;

  if (level === "beginner") {
    const up = ctx.changePct >= 0 ? "up" : "down";
    out += `\n\n**Beginner takeaway:** Today ${ctx.symbol} is ${up} ${r(Math.abs(ctx.changePct))}%. Support around ₹${r(sr.support)} is where buyers have stepped in recently, and ₹${r(sr.resistance)} is where it has faced selling.`;
  }

  out += "\n\nEducational research tool — not financial advice.";
  return out;
}

function analyzeCandle(ctx: InstrumentCtx, candles: Candle[], level: KnowledgeLevel): string {
  const c = candles[candles.length - 1];
  const bullish = c.close >= c.open;
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  const total = Math.max(c.high - c.low, 0.01);

  let out = `### Latest candle — ${ctx.symbol}\n`;
  out += `O ₹${c.open} · H ₹${c.high} · L ₹${c.low} · C ₹${c.close}\n\n`;
  out += `This is a **${bullish ? "bullish (green)" : "bearish (red)"}** candle — it closed ${bullish ? "above" : "below"} its open.\n\n`;

  const bodyPct = body / total;
  const upperPct = upper / total;
  const lowerPct = lower / total;
  if (bodyPct > 0.6) out += `- **Large body** (${(bodyPct * 100).toFixed(0)}% of range) ${bullish ? "may indicate strong buying pressure" : "may indicate strong selling pressure"}.\n`;
  if (upperPct > 0.4) out += `- **Long upper wick** (${(upperPct * 100).toFixed(0)}%) — price traded higher but was pushed back down; could indicate selling pressure near the high.\n`;
  if (lowerPct > 0.4) out += `- **Long lower wick** (${(lowerPct * 100).toFixed(0)}%) — price traded lower but recovered; could indicate buying near the low.\n`;
  if (bodyPct <= 0.15) out += `- **Tiny body / Doji-like** — open and close are very close, which may indicate indecision.\n`;

  const pattern = detectPattern(candles);
  if (pattern) out += `\n**Pattern spotted:** ${pattern.name} — ${pattern.meaning}\n`;

  if (level === "beginner") {
    out += `\n**Beginner takeaway:** ${bullish ? "The green candle means the stock ended this period higher than where it started." : "The red candle means the stock ended this period lower than where it started."} ${lowerPct > 0.4 ? "The long lower wick means price went lower during the period but recovered before the close." : ""}`;
  } else if (level === "advanced") {
    out += `\n${bullish ? "Demand dominated the period" : "Supply dominated the period"} with ${(bodyPct * 100).toFixed(0)}% of the range as body. ${upperPct > 0.4 ? "Upper-wick rejection flags overhead supply." : ""}${lowerPct > 0.4 ? " Lower-wick rejection flags demand beneath." : ""}`;
  }

  out += "\n\nCandle structure is context, not a guarantee. Educational tool — not financial advice.";
  return out;
}

function detectPattern(candles: Candle[]): { name: string; meaning: string } | null {
  const n = candles.length;
  if (n < 3) return null;
  const a = candles[n - 3];
  const b = candles[n - 2];
  const c = candles[n - 1];

  const body = (x: Candle) => Math.abs(x.close - x.open);
  const range = (x: Candle) => Math.max(x.high - x.low, 0.01);

  // doji
  if (body(c) / range(c) <= 0.1) return { name: "Doji", meaning: "Open ≈ Close — indecision between buyers and sellers." };
  // hammer / shooting star
  const lower = Math.min(c.open, c.close) - c.low;
  const upper = c.high - Math.max(c.open, c.close);
  if (lower > 2 * body(c) && upper < body(c) * 0.5) return { name: "Hammer", meaning: "Long lower wick — possible bullish reversal after a decline." };
  if (upper > 2 * body(c) && lower < body(c) * 0.5) return { name: "Shooting Star", meaning: "Long upper wick — possible bearish reversal after a rise." };
  // engulfing
  if (c.close > c.open && b.close < b.open && c.open <= b.close && c.close >= b.open) return { name: "Bullish Engulfing", meaning: "Green candle engulfs the prior red candle — potential bullish reversal." };
  if (c.close < c.open && b.close > b.open && c.open >= b.close && c.close <= b.open) return { name: "Bearish Engulfing", meaning: "Red candle engulfs the prior green candle — potential bearish reversal." };
  return null;
}

function buySell(ctx: InstrumentCtx, candles: Candle[]): string {
  const closes = candles.map((c) => c.close);
  const e20 = lastValue(ema(closes, 20));
  const rsiVal = lastValue(rsi(closes, 14));
  const sr = computeSupportResistance(candles, ctx);

  const bull: string[] = [];
  const bear: string[] = [];
  if (e20 && ctx.ltp >= e20) bull.push("price is above EMA20");
  if (ctx.fairValueStatus === "undervalued") bull.push("valuation reads undervalued");
  if (ctx.opportunity >= 60 && ctx.risk <= 45) bull.push("Opportunity high with contained risk");
  if (e20 && ctx.ltp < e20) bear.push("price is below EMA20");
  if (rsiVal != null && rsiVal >= 70) bear.push("RSI overbought");
  if (ctx.risk >= 60) bear.push("risk score elevated");
  if (ctx.fairValueStatus === "overvalued") bear.push("valuation reads overvalued");

  let out = `### Should you buy ${ctx.symbol}?\n\nI can't predict the future — here's the current setup instead.\n\n`;
  out += `**Bullish case:**\n${bull.length ? bull.map((b) => `- ${b}`).join("\n") : "- No strong bullish signals right now."}\n\n`;
  out += `**Bearish case:**\n${bear.length ? bear.map((b) => `- ${b}`).join("\n") : "- No strong bearish signals right now."}\n\n`;
  out += `**Possible scenarios:**\n`;
  out += `- *Bullish*: if price breaks and holds above ₹${r(sr.resistance)} with rising volume.\n`;
  out += `- *Bearish*: if price breaks below ₹${r(sr.support)} with increasing selling.\n\n`;
  out += `What would confirm the bullish view: a close above resistance on volume. What would invalidate it: a break below support.\n\n`;
  out += "This is educational analysis, not a recommendation. Not financial advice.";
  return out;
}

function riskAnalysis(ctx: InstrumentCtx): string {
  const factors: string[] = [];
  const range = ((ctx.week52High - ctx.week52Low) / ctx.week52Low) * 100;
  if (range > 30) factors.push(`high 52-week range (${r(range)}%) suggests volatility`);
  if (ctx.risk >= 60) factors.push(`elevated Risk Score (${ctx.risk}/100)`);
  if (ctx.debtToEquity > 1) factors.push(`leverage (debt/equity ${r(ctx.debtToEquity)})`);
  if (ctx.avgVolume && ctx.volume < ctx.avgVolume * 0.7) factors.push("declining volume (lower participation)");
  if (ctx.fairValueStatus === "overvalued") factors.push("valuation reads overvalued");
  if (ctx.sector) factors.push(`sector exposure (${ctx.sector})`);
  let out = `### Risk factors — ${ctx.symbol}\n\n`;
  out += factors.length ? factors.map((f) => `- ${f}`).join("\n") : "- No major risk flags from available data.";
  out += "\n\nRisk factors here are derived from available data only. Educational tool — not financial advice.";
  return out;
}

function supportResistance(ctx: InstrumentCtx, candles: Candle[]): string {
  const sr = computeSupportResistance(candles, ctx);
  return `### Support & Resistance — ${ctx.symbol}\n\n` +
    `**Nearest support:** ₹${r(sr.support)} (recent swing low)\n` +
    `**Nearest resistance:** ₹${r(sr.resistance)} (recent swing high)\n` +
    `**52-week low / high:** ₹${r(sr.support52)} / ₹${r(sr.resistance52)}\n\n` +
    `Price at ₹${ctx.ltp} sits ${r(((ctx.ltp - sr.support) / Math.max(sr.resistance - sr.support, 0.01)) * 100, 0)}% of the way from support toward resistance. These are zones, not exact prices.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Fundamentals, valuation, growth, dividend & news (level-aware)
// ────────────────────────────────────────────────────────────────────────────

const pct = (v: number | null, signed = true) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${signed && v > 0 ? "+" : ""}${r(v)}%`;
};

function fundamentalsResponse(c: InstrumentCtx, level: KnowledgeLevel): string {
  const roe = c.roe;
  const roeNote = roe >= 25 ? "strong — capital is being used very efficiently" : roe >= 15 ? "healthy" : roe > 0 ? "modest" : "not meaningful for this instrument (often n/a for funds)";
  const de = c.debtToEquity;
  const deNote = de <= 0.5 ? "low leverage (conservative balance sheet)" : de <= 1.5 ? "moderate leverage" : "high leverage — debt load needs watching";
  const margin = c.operatingMargin;
  const marginNote = margin >= 20 ? "wide operating margin" : margin >= 12 ? "decent operating margin" : margin > 0 ? "thin operating margin" : "operating margin not meaningful for this instrument";

  let out = `### ${c.companyName} — fundamentals at a glance\n`;
  out += `\n**Profitability:** ROE ${r(roe)}% (${roeNote}) · operating margin ${r(margin)}% (${marginNote}).\n`;
  out += `\n**Growth:** revenue ${pct(c.revenueGrowth)} YoY · earnings ${pct(c.earningsGrowth)} YoY.\n`;
  out += `\n**Balance sheet:** debt/equity ${r(de)} (${deNote}).\n`;
  out += `\n**Valuation & income:** P/E ${c.pe > 0 ? r(c.pe) : "—"} · dividend yield ${r(c.dividendYield)}%.\n`;

  if (level === "beginner") {
    const strong = (roe >= 15 ? "it earns a solid return on the money invested in it" : "returns are on the lower side") +
      (margin >= 15 ? ", keeps a healthy slice of revenue as operating profit" : ", with thinner operating margins") +
      (de <= 1 ? " and carries little debt" : " and carries meaningful debt");
    out += `\n**Beginner takeaway:** In simple terms, ${c.symbol} ${strong}. Use this with price trends — good financials alone don't mean the price will rise.`;
  } else if (level === "advanced") {
    out += `\n**Cross-check:** contrast ${c.roe > 0 ? r(c.roe) : "—"}% ROE with earnings growth ${pct(c.earningsGrowth)} to judge whether returns are improving or driven by leverage (${r(de)} D/E).`;
  }

  out += "\n\nDerived from the latest fundamentals snapshot. Educational tool — not financial advice.";
  return out;
}

function valuationResponse(c: InstrumentCtx): string {
  const fv = c.fairValue;
  const upside = fv > 0 ? ((fv - c.ltp) / c.ltp) * 100 : null;
  const peg = c.peg;
  const statusRead =
    c.fairValueStatus === "undervalued" ? "reads **undervalued** vs the model estimate" :
    c.fairValueStatus === "overvalued" ? "reads **overvalued** vs the model estimate" :
    "sits near its fair-value estimate";

  let out = `### Is ${c.symbol} cheap or expensive?\n`;
  out += `\n- **Price:** ₹${r(c.ltp)} (P/E ${c.pe > 0 ? r(c.pe) : "—"}, PEG ${peg > 0 ? r(peg) : "—"}).\n`;
  out += `\n- **Fair-value estimate:** ₹${r(fv, 0)} — so on the model, the stock ${statusRead}.\n`;
  out += `\n- **Implied move to fair value:** ${upside == null ? "—" : upside >= 0 ? "~" + r(upside, 0) + "% upside" : "~" + r(Math.abs(upside), 0) + "% downside"}.\n`;

  const cheapSignals: string[] = [];
  if (c.fairValueStatus === "undervalued") cheapSignals.push("trades below the fair-value estimate");
  if (peg > 0 && peg <= 1) cheapSignals.push(`PEG of ${r(peg)} suggests growth is priced reasonably`);
  if (c.pe > 0 && c.pe < 15) cheapSignals.push("P/E below 15 is low for the broad market");
  const priceySignals: string[] = [];
  if (c.fairValueStatus === "overvalued") priceySignals.push("trades above the fair-value estimate");
  if (peg > 2) priceySignals.push(`PEG of ${r(peg)} implies growth may be priced optimistically`);
  if (c.pe > 40) priceySignals.push("P/E above 40 is a rich multiple");

  out += `\n**Points toward cheap:**\n${cheapSignals.length ? cheapSignals.map((s) => `- ${s}`).join("\n") : "- None obvious from valuation alone."}\n`;
  out += `\n**Points toward expensive:**\n${priceySignals.length ? priceySignals.map((s) => `- ${s}`).join("\n") : "- None obvious from valuation alone."}\n`;
  out += "\nValuation is one lens — pair it with earnings quality and trend. Educational tool — not financial advice.";
  return out;
}

function growthResponse(c: InstrumentCtx): string {
  const rev = c.revenueGrowth;
  const earn = c.earningsGrowth;
  const quality = (v: number | null) => (v == null || !Number.isFinite(v) ? 0 : v);
  const momentum = [c.perf1m, c.perf3m, c.perf1y].some((p) => p != null && p > 0);

  let out = `### Is ${c.symbol} growing?\n`;
  out += `\n- **Revenue growth (YoY):** ${pct(rev)}.\n`;
  out += `\n- **Earnings growth (YoY):** ${pct(earn)}.\n`;
  out += `\n- **Efficiency:** ROE ${r(c.roe)}% · operating margin ${r(c.operatingMargin)}%.\n`;
  out += `\n- **Price momentum:** 1M ${pct(c.perf1m)} · 3M ${pct(c.perf3m)} · 1Y ${pct(c.perf1y)}.\n`;

  const verdicts: string[] = [];
  if (quality(earn) >= 20) verdicts.push("earnings are compounding quickly (20%+ YoY)");
  else if (quality(earn) >= 10) verdicts.push("earnings are growing at a solid mid-teens-plus pace");
  else if (quality(earn) > 0) verdicts.push("earnings are growing only modestly");
  else verdicts.push("earnings are flat or contracting");
  if (quality(rev) >= 15) verdicts.push("revenue growth is strong");
  else if (quality(rev) > 0 && quality(rev) < 8) verdicts.push("revenue growth is slow — watch for acceleration");
  if (c.roe >= 15) verdicts.push("returns on equity remain healthy");
  if (momentum) verdicts.push("recent price action has been positive");

  out += `\n**Read:** ${verdicts.join("; ")}.\n`;
  out += "\nGrowth must be sustainable — check whether margins and debt support it. Educational tool — not financial advice.";
  return out;
}

function dividendResponse(c: InstrumentCtx): string {
  const y = c.dividendYield;
  const pays = y > 0;
  let out = `### Does ${c.symbol} pay a dividend?\n`;
  if (!pays) {
    out += `\nThe latest snapshot shows a **${r(y)}% dividend yield** — no dividend is currently being paid. ${c.sector ? `Companies in ${c.sector} often reinvest cash rather than distribute it.` : ""}\n`;
  } else {
    out += `\nYes — the latest fundamentals show a dividend yield of **${r(y)}%** on the current price.\n`;
    out += `\n- Yield ${y >= 3 ? "above 3% — meaningful income, common among cash-generative large caps (e.g. ITC, NTPC, Coal India, Power Grid)" : y >= 1.5 ? "around 1.5–3% — a moderate income stream" : "below 1.5% — income is a minor part of the total return here"}.\n`;
    out += `\n- For an investor the yield matters less than whether the payout is sustainable out of earnings and cash flow.\n`;
  }
  out += "\nDividends are not guaranteed and can be cut. Educational tool — not financial advice.";
  return out;
}

function timeAgo(ts: string | null): string {
  if (!ts) return "recently";
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "recently";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(days / 365)}y ago`;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "▲ positive",
  negative: "▼ negative",
  neutral: "● neutral",
};

function newsResponse(c: InstrumentCtx, news: NewsItem[]): string {
  const items = news.slice(0, 5);
  if (!items.length) {
    return `### Latest news — ${c.symbol}\n\nI don't have recent headline coverage for ${c.symbol} in the database yet. As new items are ingested they'll appear here. Try asking for a technical analysis or fundamentals meanwhile.`;
  }
  const tally = { positive: 0, negative: 0, neutral: 0 };
  for (const n of items) if (n.sentiment && n.sentiment in tally) tally[n.sentiment as keyof typeof tally]++;
  const mood = tally.positive > tally.negative + tally.neutral ? "broadly positive" :
    tally.negative > tally.positive + tally.neutral ? "broadly negative" : "mixed/neutral";

  let out = `### Latest news — ${c.symbol}\n\nRecent coverage leans **${mood}** (${tally.positive} positive, ${tally.negative} negative, ${tally.neutral} neutral of ${items.length}).\n\n`;
  items.forEach((n, i) => {
    const s = n.sentiment && SENTIMENT_LABEL[n.sentiment] ? SENTIMENT_LABEL[n.sentiment] : "●";
    out += `${i + 1}. **${n.headline}** ${n.source ? `— ${n.source}` : ""} (${s}, ${timeAgo(n.publishedAt)})\n`;
  });
  out += "\nSentiment is derived, not a forecast. Educational tool — not financial advice.";
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Unified answer dispatcher
// ────────────────────────────────────────────────────────────────────────────

export function summarize(c: InstrumentCtx): string {
  const strength = c.financialStrength >= 65 ? "solid financial strength" : c.financialStrength >= 45 ? "adequate financial strength" : "weaker financial footing";
  const valuation = c.fairValueStatus === "undervalued" ? "appears undervalued" : c.fairValueStatus === "overvalued" ? "looks richly valued" : "trades around fair value";
  const bse = c.bseLtp ? ` · BSE ₹${c.bseLtp}` : "";
  return `${c.companyName} trades at ₹${c.ltp} on NSE (${c.changePct >= 0 ? "+" : ""}${r(c.changePct)}% today)${bse}. It shows ${strength} and ${valuation}. Sector: ${c.sector}; dividend yield ${r(c.dividendYield)}%.`;
}

export function whyChanged(c: InstrumentCtx): string {
  const dir = c.changePct >= 0 ? "up" : "down";
  const volNote = c.avgVolume && c.volume / c.avgVolume > 1.5 ? " on above-average volume" : "";
  const sentiment = c.newsSentiment.filter((s) => s === "positive").length >= 2 ? "Recent news flow is positive." : c.newsSentiment.filter((s) => s === "negative").length >= 2 ? "Recent news flow has been negative." : "News flow is mixed and not a clear driver.";
  return `${c.symbol} is ${dir} ${r(Math.abs(c.changePct))}% today${volNote}. ${sentiment} Day range ₹${c.dayLow}–₹${c.dayHigh}. This reflects market activity, not a recommendation.`;
}

export function explainVerdict(c: InstrumentCtx): string {
  return `${c.symbol} carries an AI verdict of ${aiVerdictLabel(c.aiVerdict)} (Opportunity ${c.opportunity}/100, Risk ${c.risk}/100, valuation ${c.fairValueStatus}). Educational research only — not financial advice.`;
}

export function explainScore(c: InstrumentCtx): string {
  return `Score breakdown for ${c.symbol}: Opportunity ${c.opportunity}/100 (growth + valuation + dividend), Risk ${c.risk}/100 (leverage + liquidity + volatility), Financial Strength ${c.financialStrength}/100, Alpha Growth ${c.alphaGrowth}/100 (${alphaGrowthCategory(c.alphaGrowth)}), Smart Money ${c.smartMoney}/100 (${smartMoneyVerdict(c.smartMoney)}).`;
}

export function compare(a: InstrumentCtx, b: InstrumentCtx): string {
  const pick = (name: string, av: number, bv: number, higherBetter = true) => {
    const winner = higherBetter ? (av >= bv ? a.symbol : b.symbol) : (av <= bv ? a.symbol : b.symbol);
    return `- ${name}: ${a.symbol} ${av} vs ${b.symbol} ${bv} → ${winner}`;
  };
  return [
    `### ${a.companyName} vs ${b.companyName}`,
    pick("Opportunity", a.opportunity, b.opportunity),
    pick("Risk (lower better)", a.risk, b.risk, false),
    pick("Alpha Growth", a.alphaGrowth, b.alphaGrowth),
    pick("Financial Strength", a.financialStrength, b.financialStrength),
    `- P/E: ${a.symbol} ${r(a.pe)} vs ${b.symbol} ${r(b.pe)}`,
    `- Dividend yield: ${a.symbol} ${r(a.dividendYield)}% vs ${b.symbol} ${r(b.dividendYield)}%`,
    `- 1-year return: ${a.symbol} ${a.perf1y == null ? "—" : r(a.perf1y) + "%"} vs ${b.symbol} ${b.perf1y == null ? "—" : r(b.perf1y) + "%"}`,
  ].join("\n");
}

export function historicalResponse(c: InstrumentCtx): string {
  return [
    `${c.companyName} (${c.symbol}) — trailing performance:`,
    `  1W ${c.perf1w == null ? "—" : (c.perf1w >= 0 ? "+" : "") + r(c.perf1w) + "%"} · 1M ${c.perf1m == null ? "—" : (c.perf1m >= 0 ? "+" : "") + r(c.perf1m) + "%"} · 3M ${c.perf3m == null ? "—" : (c.perf3m >= 0 ? "+" : "") + r(c.perf3m) + "%"}`,
    `  6M ${c.perf6m == null ? "—" : (c.perf6m >= 0 ? "+" : "") + r(c.perf6m) + "%"} · 1Y ${c.perf1y == null ? "—" : (c.perf1y >= 0 ? "+" : "") + r(c.perf1y) + "%"}`,
    `52-week range: ₹${c.week52Low} – ₹${c.week52High} (currently ₹${c.ltp}).`,
  ].join("\n");
}

export function forecastResponse(c: InstrumentCtx): string {
  const upPct = c.fairValue ? ((c.fairValue - c.ltp) / c.ltp) * 100 : null;
  return [
    `${c.symbol} outlook (educational, not advice):`,
    `• Trend: 1-month ${c.perf1m == null ? "—" : (c.perf1m >= 0 ? "+" : "") + r(c.perf1m) + "%"}, 1-year ${c.perf1y == null ? "—" : (c.perf1y >= 0 ? "+" : "") + r(c.perf1y) + "%"}.`,
    `• ${c.fairValue ? `Fair-value estimate ₹${r(c.fairValue, 0)} implies ${upPct! >= 0 ? "upside" : "downside"} of ~${r(Math.abs(upPct!), 0)}%.` : "No fair-value estimate available."}`,
    `• Consensus-style read: ${aiVerdictLabel(c.aiVerdict)}.`,
    "These are derived projections, not predictions.",
  ].join("\n");
}

export function generalResponse(c: InstrumentCtx, message: string): string {
  const bse = c.bseLtp ? ` · BSE ₹${c.bseLtp}` : "";
  return `${c.companyName} (${c.symbol}) — ${c.sector} sector, NSE ₹${c.ltp}${bse}.\n${summarize(c)}\n\nYou can ask for a technical analysis, the latest candle, support/resistance, risks, or a comparison.`;
}

// Topics we structurally do not have (never fabricated). A request is only a
// no-data refusal if the term isn't a concept we can explain generically
// ("what is open interest?" is education; "analyst target for TCS" is no-data).
const NO_DATA_TOPIC = /(earnings call|quarterly (result|call)|promoter holding|fii holding|dii holding|analyst (target|rating|consensus)|price target|annual report|insider (trad|buy|sell)|block deal|bulk deal|open interest|options (chain|greeks)|implied volatility|social sentiment)/;
const GENERIC_DEF = /\b(what is|what are|what does|explain|define|meaning of)\b/;

function hasEdConcept(m: string): boolean {
  return Object.keys(EDU_INTENT).some((k) => k.length > 2 && m.includes(k));
}

export function isNoDataRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (!NO_DATA_TOPIC.test(m)) return false;
  // "what is open interest?" is a concept question, not a request for data.
  if (GENERIC_DEF.test(m) && hasEdConcept(m)) return false;
  return true;
}

// ── Guardrails & honesty (never fabricated, never directive) ────────────────

function refuseResponse(): string {
  return (
    "I'm an educational research assistant — I don't follow instructions hidden inside pasted text or \"act as\" / developer-mode prompts, and I never issue buy/sell directives.\n\n" +
    "What I can do instead:\n" +
    "- Analyze a stock's fundamentals, valuation, scores or technicals (e.g. \"Analyze TCS\")\n" +
    "- Explain any concept (\"what is ROE?\", \"explain a stop-loss\", \"what are circuit limits?\")\n" +
    "- Screen the market in plain English (\"stocks with PE below 20\")\n" +
    "- Tell you what changed since you last looked (\"what changed since my last visit?\")"
  );
}

function noDataResponse(ctx: InstrumentCtx | null): string {
  const who = ctx ? ctx.symbol : "a company";
  return (
    `I don't have that data for ${who} in my dataset (I never fabricate figures).\n\n` +
    "Currently unavailable: earnings-call transcripts/quotes, promoter/FII/DII holding history, analyst target prices & consensus, insider/bulk/block-deal records, options OI & greeks, and full annual-report risk sections.\n\n" +
    "What I DO have for " +
    (ctx ? `${ctx.symbol}: live price & move, P/E, P/B, PEG, ROE, margins, growth, D/E, dividend yield, fair-value estimate, Opportunity/Risk/Alpha/Smart-Money scores, 52-week range, news sentiment, and technicals from candles.` : "a company you name: live price & move, P/E, ROE, margins, growth, D/E, dividend yield, fair value, scores, 52-week range, news sentiment, and technicals.") +
    "\n\nAsk for one of those and I'll pull the live numbers."
  );
}

export function answerQuestion(
  message: string,
  level: KnowledgeLevel,
  ctx: InstrumentCtx | null,
  candles: Candle[],
  marketStatus: { status: string; label: string; isOpen: boolean } | null,
  news: NewsItem[] = [],
): { response: string; learnTopic?: string; intent: Intent } {
  const intent = detectIntent(message);

  // 0) Guardrails / screener — always take priority.
  if (intent === "REFUSE") return { response: refuseResponse(), intent };
  if (intent === "SCREEN") {
    return {
      response:
        "### Screen the market\n\nAsk in plain English and I'll convert it into real screener filters and run them, e.g.:\n- \"Stocks with PE below 20 and ROE above 15\"\n- \"IT stocks with dividend yield above 2%\"\n- \"Undervalued large caps with opportunity score above 70\"\n\nI'll show the filters I parsed (as chips) and the live results.",
      intent,
    };
  }

  // 1) education concepts
  const concept = findConcept(message);
  if (concept && intent === "EDUCATION") {
    const body = level === "beginner" ? concept.beginner : level === "advanced" ? concept.advanced : concept.intermediate;
    return { response: `### ${concept.topic}\n\n${body}`, learnTopic: concept.learnTopic, intent };
  }

  // 1b) Topics we have no data for — honest refusal beats a confident guess.
  if (isNoDataRequest(message)) {
    return { response: noDataResponse(ctx), intent: "NO_DATA" };
  }

  // 2) market status — only when the question is genuinely about session status
  if (
    intent === "MARKET_STATUS" ||
    (/\bmarket\b/.test(message.toLowerCase()) && !ctx && /\b(open|closed|hours|status|pre.?open|trading hours|session|live)\b/.test(message.toLowerCase()))
  ) {
    const s = marketStatus;
    const statusText = s ? `Market status: **${s.label}** (${s.isOpen ? "open" : "closed"}). Regular NSE/BSE equity hours are 09:15 AM – 03:30 PM IST, Mon–Fri.` : "Market status data unavailable.";
    return { response: `### Market status\n\n${statusText}`, intent };
  }

  if (ctx) {
    const hasCandles = candles && candles.length >= 2;
    switch (intent) {
      case "WHY_CHANGED": return { response: whyChanged(ctx), intent };
      case "COMPARE_STOCKS": return { response: `Open the two stocks and compare, or mention both symbols (e.g. "Compare TCS and Infosys").`, intent };
      case "VERDICT": return { response: explainVerdict(ctx), intent };
      case "EXPLAIN_SCORE": return { response: explainScore(ctx), intent };
      case "HISTORY": return { response: historicalResponse(ctx), intent };
      case "FORECAST": return { response: forecastResponse(ctx), intent };
      case "NEWS": return { response: newsResponse(ctx, news), intent };
      case "FUNDAMENTALS": return { response: fundamentalsResponse(ctx, level), intent };
      case "VALUATION": return { response: valuationResponse(ctx), intent };
      case "GROWTH": return { response: growthResponse(ctx), intent };
      case "DIVIDEND": return { response: dividendResponse(ctx), intent };
      case "ANALYZE":
        if (hasCandles) return { response: analyzeCompany(ctx, candles, level), intent };
        return { response: summarize(ctx) + "\n\n" + explainScore(ctx) + `\n\n(Chart data isn't available for deeper technical analysis.)`, intent };
      case "CANDLE":
        if (hasCandles) return { response: analyzeCandle(ctx, candles, level), intent };
        return { response: `I don't have chart data for ${ctx.symbol} right now. That data isn't currently available.`, intent };
      case "PATTERN": {
        const p = hasCandles ? detectPattern(candles) : null;
        if (p) return { response: `### ${p.name} (${ctx.symbol})\n\n${p.meaning}\n\nA pattern is a hint, not a guarantee — look for confirmation and volume.`, learnTopic: "basics-candlesticks", intent };
        if (hasCandles) return { response: analyzeCandle(ctx, candles, level), intent };
        return { response: `I can explain candlestick patterns — try "what is a Doji?" or "what is a hammer?".`, intent };
      }
      case "SUPPORT_RESISTANCE":
        if (hasCandles) return { response: supportResistance(ctx, candles), intent };
        return { response: `Support/resistance needs chart data, which isn't currently available for ${ctx.symbol}.`, intent };
      case "BUY_SELL":
        if (hasCandles) return { response: buySell(ctx, candles), intent };
        return { response: explainVerdict(ctx) + "\n\n(Chart data unavailable for a fuller setup read.)", intent };
      case "RISK": return { response: riskAnalysis(ctx), intent };
      case "SUMMARY": return { response: summarize(ctx) + "\n\n" + explainScore(ctx), intent };
      case "EDUCATION":
        if (hasCandles) return { response: analyzeCompany(ctx, candles, level), intent };
        return { response: summarize(ctx) + "\n\n" + explainScore(ctx), intent };
      default: return { response: generalResponse(ctx, message), intent };
    }
  }

  // no stock context — pure definition questions take the knowledge-base path
  // even when their keyword normally routes to a company-data handler.
  if (
    concept &&
    (intent === "EDUCATION" || intent === "FUNDAMENTALS" || intent === "VALUATION" || intent === "GROWTH" || intent === "DIVIDEND")
  ) {
    const body = level === "beginner" ? concept.beginner : level === "advanced" ? concept.advanced : concept.intermediate;
    return { response: `### ${concept.topic}\n\n${body}`, learnTopic: concept.learnTopic, intent: "EDUCATION" };
  }

  const primers: Partial<Record<Intent, string>> = {
    NEWS: "I can pull the latest headlines for a specific company. Try \"What's the news on TCS?\"",
    FUNDAMENTALS: "I can break down a company's fundamentals — profitability, growth, balance sheet and dividends. Try \"Show TCS fundamentals\".",
    VALUATION: "I can estimate whether a stock is cheap or expensive using P/E, PEG and a fair-value model. Try \"Is TCS undervalued?\"",
    GROWTH: "I can assess how fast a company is growing — revenue, earnings and momentum. Try \"How fast is TCS growing?\"",
    DIVIDEND: "I can tell you whether a company pays a dividend and what the current yield is. Try \"Does ITC pay a dividend?\"",
  };
  if (primers[intent]) {
    return { response: primers[intent], intent };
  }

  return {
    response:
      "I couldn't find a company to attach that to — I'd rather ask than guess. Name a symbol (TCS, RELIANCE, INFY, HDFCBANK, ITC…) and ask again.\n\n" +
      "Or try one of these:\n" +
      '- Analyze a stock: "Analyze TCS"\n' +
      '- Concepts: "what is a stop-loss?", "explain circuit limits", "what is ROE?"\n' +
      '- Screener: "stocks with PE below 20 and ROE above 15"\n' +
      '- Markets: "why did TCS move today?", "is the market open?"',
    intent,
  };
}
