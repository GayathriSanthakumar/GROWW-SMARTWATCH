import { query } from "../db/pool.js";
import { aiVerdictLabel, alphaGrowthCategory, smartMoneyVerdict } from "./scoring.js";

// Deterministic, data-grounded AI analyst. No external API key required — every
// response is generated from the instrument's own scores, fundamentals and news,
// which keeps the demo fully offline while remaining transparent and explainable.

export type Intent = "WHY_CHANGED" | "COMPARE_STOCKS" | "EXPLAIN_SCORE" | "VERDICT" | "SUMMARY" | "HISTORY" | "FORECAST" | "GENERAL";

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
  const r = rows.rows[0];
  if (!r) return null;

  const news = await query<{ sentiment: string }>(
    `SELECT sentiment FROM news_items WHERE instrument_id = $1 ORDER BY published_at DESC LIMIT 5`,
    [instrumentId],
  );

  const ltp = Number(r.ltp);
  const prevClose = Number(r.prev_close);
  const bseLtp = r.bse_ltp == null ? null : Number(r.bse_ltp);
  const bsePrev = r.bse_prev_close == null ? null : Number(r.bse_prev_close);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    symbol: String(r.symbol),
    companyName: String(r.company_name),
    sector: String(r.sector),
    ltp,
    changePct: prevClose ? ((ltp - prevClose) / prevClose) * 100 : 0,
    volume: Number(r.volume),
    avgVolume: Number(r.avg_volume_20d),
    bseLtp,
    bseChangePct: bseLtp && bsePrev ? ((bseLtp - bsePrev) / bsePrev) * 100 : null,
    dayOpen: Number(r.day_open) || ltp,
    dayHigh: Number(r.day_high) || ltp,
    dayLow: Number(r.day_low) || ltp,
    week52High: Number(r.week52_high) || ltp * 1.2,
    week52Low: Number(r.week52_low) || ltp * 0.8,
    perf1w: n(r.perf_1w),
    perf1m: n(r.perf_1m),
    perf3m: n(r.perf_3m),
    perf6m: n(r.perf_6m),
    perf1y: n(r.perf_1y),
    pe: Number(r.pe_ratio),
    peg: Number(r.peg_ratio),
    debtToEquity: Number(r.debt_to_equity),
    roe: Number(r.roe_pct),
    operatingMargin: Number(r.operating_margin_pct),
    revenueGrowth: Number(r.revenue_growth_yoy_pct),
    earningsGrowth: Number(r.earnings_growth_yoy_pct),
    dividendYield: Number(r.dividend_yield_pct),
    fairValue: Number(r.fair_value_estimate),
    fairValueStatus: String(r.fair_value_status),
    aiVerdict: String(r.ai_verdict),
    opportunity: Number(r.opportunity_score),
    risk: Number(r.risk_score),
    financialStrength: Number(r.financial_strength_score),
    alphaGrowth: Number(r.alpha_growth_score),
    smartMoney: Number(r.smart_money_score),
    newsSentiment: news.rows.map((n2) => n2.sentiment),
  };
}

export function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/\b(history|historical|past|last week|last month|last year|1 year|52 week|ytd|year to date|previous|performance of|how has)\b/.test(m)) return "HISTORY";
  if (/\b(predict|prediction|forecast|outlook|target|future|will it|going to|upside|downside|estimate)\b/.test(m)) return "FORECAST";
  if (/\bwhy\b.*\b(chang|move|fall|rise|drop|up|down)\b/.test(m) || m.includes("why did")) return "WHY_CHANGED";
  if (/\b(compare|versus|vs\.?)\b/.test(m)) return "COMPARE_STOCKS";
  if (/\b(verdict|buy|sell|hold|watch)\b/.test(m) && !/\bexplain\b/.test(m)) return "VERDICT";
  if (/\b(explain|what is|why is|how is)\b.*\b(score|opportunity|risk|attention|alpha|smart money|financial)\b/.test(m)) return "EXPLAIN_SCORE";
  if (/\b(summary|overview|tell me about|about this)\b/.test(m)) return "SUMMARY";
  return "GENERAL";
}

const pct = (v: number | null): string => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export function historicalResponse(c: InstrumentCtx): string {
  const lines = [
    `${c.companyName} (${c.symbol}) — trailing performance:`,
    `  1 Week: ${pct(c.perf1w)}`,
    `  1 Month: ${pct(c.perf1m)}`,
    `  3 Months: ${pct(c.perf3m)}`,
    `  6 Months: ${pct(c.perf6m)}`,
    `  1 Year: ${pct(c.perf1y)}`,
    `52-week range: ₹${c.week52Low} – ₹${c.week52High} (currently ₹${c.ltp}).`,
  ];
  return lines.join("\n");
}

export function forecastResponse(c: InstrumentCtx): string {
  const fairValue = c.fairValue;
  const upPct = fairValue ? ((fairValue - c.ltp) / c.ltp) * 100 : null;
  const momentum = c.perf1m ?? 0;
  const trend = momentum >= 0 ? "positive short-term momentum" : "negative short-term momentum";
  const targetLine = fairValue
    ? `A research fair-value estimate of ₹${fairValue.toFixed(0)} implies ${upPct! >= 0 ? "upside" : "downside"} of ${Math.abs(upPct!).toFixed(0)}% from ₹${c.ltp}.`
    : "No fair-value estimate is available for a target.";
  return [
    `${c.symbol} outlook (educational, not advice):`,
    `• Trend: ${trend} (1-month ${pct(c.perf1m)}), 1-year ${pct(c.perf1y)}.`,
    `• ${targetLine}`,
    `• Consensus-style read: ${aiVerdictLabel(c.aiVerdict)} — Opportunity ${c.opportunity}/100, Risk ${c.risk}/100.`,
    `• 52-week position: ${(((c.ltp - c.week52Low) / Math.max(c.week52High - c.week52Low, 1)) * 100).toFixed(0)}% above the low.`,
    "These are derived projections from historical data and scores — not a prediction or recommendation.",
  ].join("\n");
}

export function summarize(c: InstrumentCtx): string {
  const strength = c.financialStrength >= 65 ? "solid financial strength" : c.financialStrength >= 45 ? "adequate financial strength" : "weaker financial footing";
  const valuation = c.fairValueStatus === "undervalued" ? "appears undervalued relative to its fundamentals" : c.fairValueStatus === "overvalued" ? "looks richly valued at current levels" : "is trading roughly in line with its fundamentals";
  const growth = c.alphaGrowth >= 65 ? "with strong forward growth quality" : c.alphaGrowth >= 50 ? "with steady growth prospects" : "with modest growth momentum";
  const risk = c.risk >= 60 ? "Elevated risk from leverage/volatility warrants caution." : c.risk <= 35 ? "Risk levels look contained." : "Risk is moderate.";
  const bse = c.bseLtp ? ` BSE ${c.bseLtp}` : "";
  const perf = c.perf1y != null ? ` Over the past year it is ${pct(c.perf1y)} (1-month ${pct(c.perf1m)}).` : "";
  return `${c.companyName} trades at ₹${c.ltp} on NSE (${pct(c.changePct)} today)${bse}. It shows ${strength} and ${valuation}, ${growth}. ${c.sector} sector, ${c.dividendYield.toFixed(1)}% dividend yield.${perf} ${risk}`;
}

export function whyChanged(c: InstrumentCtx): string {
  const dir = c.changePct >= 0 ? "up" : "down";
  const volNote = c.avgVolume && c.volume / c.avgVolume > 1.5 ? " on unusually high volume" : "";
  const sentiment = c.newsSentiment.filter((s) => s === "positive").length >= 2
    ? "Recent news flow is positive, which is likely contributing."
    : c.newsSentiment.filter((s) => s === "negative").length >= 2
      ? "Recent news flow has been negative, adding downward pressure."
      : "News flow is mixed and not the primary driver.";
  return `${c.symbol} is ${dir} ${Math.abs(c.changePct).toFixed(2)}% today${volNote}. ${sentiment} This change reflects intraday market activity and is not a recommendation.`;
}

export function explainVerdict(c: InstrumentCtx): string {
  return `${c.symbol} carries an AI verdict of ${aiVerdictLabel(c.aiVerdict)}. Inputs: Opportunity ${c.opportunity}/100, Risk ${c.risk}/100, valuation ${c.fairValueStatus}. ${
    c.aiVerdict === "buy_lean"
      ? "Opportunity is strong while risk stays contained and the stock isn't overvalued."
      : c.aiVerdict === "avoid_lean"
        ? "Risk is elevated and/or valuation is stretched relative to opportunity."
        : c.aiVerdict === "hold"
          ? "Scores are balanced — neither a clear edge nor a red flag."
          : "Signals are mixed; worth monitoring before committing."
  } Educational research only — not financial advice.`;
}

export function explainScore(c: InstrumentCtx): string {
  return `Score breakdown for ${c.symbol}: Opportunity ${c.opportunity}/100 (growth + valuation + dividend), Risk ${c.risk}/100 (leverage + liquidity + volatility + earnings consistency), Financial Strength ${c.financialStrength}/100 (ROE ${c.roe}%, margin ${c.operatingMargin}%), Alpha Growth ${c.alphaGrowth}/100 (${alphaGrowthCategory(c.alphaGrowth)}), Smart Money ${c.smartMoney}/100 (${smartMoneyVerdict(c.smartMoney)}).`;
}

export function compare(a: InstrumentCtx, b: InstrumentCtx): string {
  const pick = (name: string, av: number, bv: number, higherBetter = true) => {
    const diff = av - bv;
    const better = higherBetter ? diff > 0 : diff < 0;
    const winner = better ? a.symbol : b.symbol;
    return `${name}: ${a.symbol} ${av} vs ${b.symbol} ${bv} → ${winner}`;
  };
  return [
    `${a.companyName} vs ${b.companyName}:`,
    pick("Opportunity", a.opportunity, b.opportunity),
    pick("Risk (lower is better)", a.risk, b.risk, false),
    pick("Alpha Growth", a.alphaGrowth, b.alphaGrowth),
    pick("Financial Strength", a.financialStrength, b.financialStrength),
    `P/E: ${a.symbol} ${a.pe || "n/a"} vs ${b.symbol} ${b.pe || "n/a"}`,
  ].join("\n");
}

export function generalResponse(c: InstrumentCtx, message: string): string {
  const bse = c.bseLtp ? ` · BSE ₹${c.bseLtp}` : "";
  return [
    `${c.companyName} (${c.symbol}) — ${c.sector} sector, NSE ₹${c.ltp}${bse}.`,
    summarize(c),
    `52-week: ₹${c.week52Low} – ₹${c.week52High}.`,
    "You can also ask: 'what is its history?', 'give a forecast/outlook', 'explain the scores', or 'what changed today?'.",
  ].join("\n");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// When no explicit instrument is attached, try to figure out which company the
// user is asking about from the message text (symbol or company name).
export async function resolveInstrumentFromText(message: string): Promise<{ id: string; ctx: InstrumentCtx } | null> {
  const rows = await query<{ id: string; symbol: string; company_name: string }>(
    `SELECT id, symbol, company_name FROM instruments WHERE is_active = true`,
  );
  const m = message.toLowerCase();

  // 1) exact symbol token match
  for (const r of rows.rows) {
    const sym = r.symbol.toLowerCase();
    if (sym.length >= 2 && new RegExp(`\\b${escapeRegExp(sym)}\\b`).test(m)) {
      const ctx = await fetchInstrumentCtx(r.id);
      if (ctx) return { id: r.id, ctx };
    }
  }
  // 2) company-name substring match (longest names first to avoid partial hits)
  const byName = [...rows.rows].sort((a, b) => b.company_name.length - a.company_name.length);
  for (const r of byName) {
    const name = r.company_name.toLowerCase();
    if (name.length > 3 && m.includes(name)) {
      const ctx = await fetchInstrumentCtx(r.id);
      if (ctx) return { id: r.id, ctx };
    }
  }
  return null;
}
