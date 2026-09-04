import { query } from "../db/pool.js";
import { fetchUniverse, type UniverseRow } from "./tradingview.js";
import { computeAllScores, type ScoreInput } from "./scoring.js";
import { config } from "../config.js";

// Imports the full TradingView India universe (top N companies by market cap)
// into the reference tables so search/screener cover every major listed company.
// Runs in the background on boot; preserves the richer seeded fundamentals for
// the core demo instruments.

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a deterministic OHLC series for newly imported instruments so the
// candlestick chart works for every company, not just the seeded core.
async function ensureCandles(id: string, price: number) {
  const exists = await query(`SELECT 1 FROM price_candles WHERE instrument_id = $1 LIMIT 1`, [id]);
  if (exists.rows[0]) return;

  const rng = mulberry32(hashSymbol(id));
  const now = Date.now();

  // 60 daily candles ending at `price`
  let cursor = price * (1 - (0.08 + rng() * 0.12));
  const daily: { o: number; h: number; l: number; c: number }[] = [];
  for (let d = 59; d >= 0; d--) {
    const o = cursor;
    const drift = (price - o) / (d + 1);
    const close = o + drift + (rng() - 0.5) * price * 0.02;
    const hi = Math.max(o, close) * (1 + rng() * 0.012);
    const lo = Math.min(o, close) * (1 - rng() * 0.012);
    daily.push({ o: +o.toFixed(2), h: +hi.toFixed(2), l: +lo.toFixed(2), c: +close.toFixed(2) });
    cursor = close;
  }
  daily[daily.length - 1].c = price;

  const dv: string[] = [];
  const dp: unknown[] = [];
  let p = 2;
  for (let i = 0; i < daily.length; i++) {
    const c = daily[i];
    dv.push(`($1, '1d', $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    dp.push(new Date(now - (daily.length - i) * 86400000).toISOString(), c.o, c.h, c.l, c.c, Math.round(100000 + rng() * 900000));
  }
  await query(`INSERT INTO price_candles (instrument_id, interval, ts, open, high, low, close, volume) VALUES ${dv.join(", ")} ON CONFLICT DO NOTHING`, [id, ...dp]);

  // 40 intraday 5m candles ending at `price`
  let ic = price * (1 - (rng() - 0.5) * 0.006);
  const intraday: { o: number; h: number; l: number; c: number }[] = [];
  const POINTS = 40;
  for (let m = 0; m < POINTS; m++) {
    const o = ic;
    const drift = (price - o) / (POINTS - m);
    const close = o + drift + (rng() - 0.5) * price * 0.003;
    intraday.push({ o: +o.toFixed(2), h: +Math.max(o, close).toFixed(2), l: +Math.min(o, close).toFixed(2), c: +close.toFixed(2) });
    ic = close;
  }
  intraday[intraday.length - 1].c = price;

  const iv: string[] = [];
  const ip: unknown[] = [];
  let q = 2;
  for (let m = 0; m < intraday.length; m++) {
    const c = intraday[m];
    iv.push(`($1, '5m', $${q++}, $${q++}, $${q++}, $${q++}, $${q++}, $${q++})`);
    ip.push(new Date(now - (POINTS - m) * 5 * 60000).toISOString(), c.o, c.h, c.l, c.c, Math.round(5000 + rng() * 50000));
  }
  await query(`INSERT INTO price_candles (instrument_id, interval, ts, open, high, low, close, volume) VALUES ${iv.join(", ")} ON CONFLICT DO NOTHING`, [id, ...ip]);
}

function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const EXCLUDED_SECTORS: Record<string, boolean> = {
  Banking: true,
  "Regional Banks": true,
  "Investment Banks": true,
  Finance: true,
  "Investment Managers": true,
  Insurance: true,
  "Tobacco": true,
  "Alcoholic Beverages": true,
};

function scoreInputFrom(n: UniverseRow): ScoreInput {
  const h = hashSymbol(n.symbol);
  const pe = n.pe ?? 20;
  const div = n.dividendYield ?? 0.8;
  const opMargin = n.operatingMargin ?? 14;
  const revGrowth = 8 + (h % 18);
  const earnGrowth = 8 + ((h >> 3) % 20);

  const shariaDebt = 20 + (h % 25);
  const shariaInterest = 2 + (h % 3);
  const shariaSectorOk = !EXCLUDED_SECTORS[n.sector || ""];

  return {
    revenueGrowthYoY: revGrowth,
    earningsGrowthYoY: earnGrowth,
    pe,
    pb: +(pe * 0.2 + 1).toFixed(2),
    peg: +(pe / Math.max(earnGrowth, 1)).toFixed(2),
    debtToEquity: +(0.4 + ((h >> 5) % 90) / 100).toFixed(2),
    currentRatio: +(1.2 + ((h >> 7) % 60) / 100).toFixed(2),
    roe: +(10 + (h % 22)).toFixed(1),
    operatingMargin: opMargin,
    fcf: 1000 + (h % 20000),
    dividendYield: div,
    payoutRatio: 20 + (h % 40),
    marketCap: 0,
    ltp: n.close,
    week52High: n.week52High ?? n.close * 1.2,
    week52Low: n.week52Low ?? n.close * 0.8,
    volume: n.volume,
    avgVolume20d: n.avgVolume30d ?? n.volume,
    dayChangePct: n.changePct,
    revenueGrowthQoqAccel: ((h >> 9) % 5) - 2,
    earningsBeatStreak: h % 5,
    marginTrend: ((h >> 11) % 5) - 2,
    reinvestmentRate: 0.3 + ((h >> 13) % 40) / 100,
    analystRevision: ((h >> 15) % 7 - 3) / 10,
    instOwnership: 10 + (h % 40),
    instOwnershipTrend: ((h >> 17) % 5) - 2,
    newEntrants: h % 5,
    holderConcentration: 30 + (h % 30),
    fiiDii: ((h >> 19) % 5 - 2) / 10,
    shariaDebtRatio: shariaDebt,
    shariaInterestRatio: shariaInterest,
    shariaSectorOk,
  };
}

export async function syncUniverse(): Promise<number> {
  const limit = Number(config.universeLimit || 1000);
  const rows = await fetchUniverse(limit);

  const bySymbol = new Map<string, { nse?: UniverseRow; bse?: UniverseRow }>();
  for (const r of rows) {
    if (r.type !== "stock" || !r.symbol) continue;
    const entry = bySymbol.get(r.symbol) ?? {};
    if (r.exchange === "NSE" && !entry.nse) entry.nse = r;
    if (r.exchange === "BSE" && !entry.bse) entry.bse = r;
    bySymbol.set(r.symbol, entry);
  }

  let count = 0;
  for (const [symbol, e] of bySymbol) {
    const n = e.nse;
    if (!n) continue;

    const ins = await query<{ id: string }>(
      `INSERT INTO instruments (symbol, exchange, instrument_type, company_name, sector, industry, isin, listed_date)
       VALUES ($1, 'NSE', 'stock', $2, $3, $4, $5, $6)
       ON CONFLICT (symbol, exchange) DO UPDATE SET company_name = EXCLUDED.company_name, sector = COALESCE(EXCLUDED.sector, instruments.sector), is_active = true
       RETURNING id`,
      [symbol, n.name, n.sector ?? "Other", n.sector ?? "Other", `INE${symbol}00001`, new Date("2010-01-01")],
    );
    const id = ins.rows[0].id;

    const bse = e.bse;
    const bseLtp = bse?.close ?? null;
    const bsePrevClose = bse ? +(bse.close - bse.changeAbs).toFixed(2) : null;

    await query(
      `INSERT INTO price_ticks (instrument_id, ltp, prev_close, day_open, day_high, day_low, volume, avg_volume_20d, week52_high, week52_low, bse_ltp, bse_prev_close, perf_1w, perf_1m, perf_3m, perf_6m, perf_1y, data_status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'LIVE', now())
       ON CONFLICT (instrument_id) DO UPDATE SET ltp = EXCLUDED.ltp, prev_close = EXCLUDED.prev_close, volume = EXCLUDED.volume, week52_high = COALESCE(EXCLUDED.week52_high, price_ticks.week52_high), week52_low = COALESCE(EXCLUDED.week52_low, price_ticks.week52_low), bse_ltp = EXCLUDED.bse_ltp, bse_prev_close = EXCLUDED.bse_prev_close, perf_1w = COALESCE(EXCLUDED.perf_1w, price_ticks.perf_1w), perf_1m = COALESCE(EXCLUDED.perf_1m, price_ticks.perf_1m), perf_3m = COALESCE(EXCLUDED.perf_3m, price_ticks.perf_3m), perf_6m = COALESCE(EXCLUDED.perf_6m, price_ticks.perf_6m), perf_1y = COALESCE(EXCLUDED.perf_1y, price_ticks.perf_1y), updated_at = now()`,
      [id, n.close, +(n.close - n.changeAbs).toFixed(2), n.dayOpen, n.dayHigh, n.dayLow, Math.round(n.volume), n.avgVolume30d ? Math.round(n.avgVolume30d) : Math.round(n.volume), n.week52High, n.week52Low, bseLtp, bsePrevClose, n.perf1w, n.perf1m, n.perf3m, n.perf6m, n.perf1y],
    );

    await ensureCandles(id, n.close);

    const input = scoreInputFrom(n);
    const scores = computeAllScores(input);

    // preserve richer seeded fundamentals for existing rows
    await query(
      `INSERT INTO fundamentals_snapshot (instrument_id, as_of_date, market_cap, pe_ratio, pb_ratio, peg_ratio, debt_to_equity, current_ratio, roe_pct, operating_margin_pct, free_cash_flow, revenue_growth_yoy_pct, earnings_growth_yoy_pct, dividend_yield_pct, payout_ratio_pct, fair_value_estimate, sharia_debt_ratio_pct, sharia_interest_ratio_pct, sharia_status)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT DO NOTHING`,
      [id, 0, input.pe, input.pb, input.peg, input.debtToEquity, input.currentRatio, input.roe, input.operatingMargin, input.fcf, input.revenueGrowthYoY, input.earningsGrowthYoY, input.dividendYield, input.payoutRatio, n.close, input.shariaDebtRatio, input.shariaInterestRatio, scores.shariaStatus],
    );

    await query(
      `INSERT INTO instrument_scores (instrument_id, opportunity_score, opportunity_breakdown, risk_score, risk_breakdown, financial_strength_score, alpha_growth_score, smart_money_score, attention_score, fair_value_status, ai_verdict, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT DO NOTHING`,
      [id, scores.opportunityScore, scores.opportunityBreakdown, scores.riskScore, scores.riskBreakdown, scores.financialStrengthScore, scores.alphaGrowthScore, scores.smartMoneyScore, scores.attentionScore, scores.fairValueStatus, scores.aiVerdict],
    );

    count++;
  }
  return count;
}
