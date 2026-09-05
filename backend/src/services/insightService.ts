import { query } from "../db/pool.js";
import { fetchInstrumentCtx } from "./aiAnalyst.js";
import { getCandles } from "./candleService.js";
import { ema, rsi, lastValue } from "./indicators.js";
import { aiVerdictLabel, alphaGrowthCategory, smartMoneyVerdict } from "./scoring.js";

// Company insight engine: builds one structured, honest view of a company from
// REAL data only (live ticks, scores, valuation, candles) and re-uses it across
// the company panel, the AI Analyst page and the What-Changed section.
//
//  market   → 1-day change from the actual previous close (never synthesized)
//  technical→ indicators the app itself computes from its candle series
//  validation→ rule-based check of the existing app analysis vs current data
//  snapshot → append-only history of what the user last saw

export interface Snapshot {
  snapshotAt: string;
  price: number | null;
  prevClose: number | null;
  changeAbs: number | null;
  changePct: number | null;
  opportunity: number | null;
  risk: number | null;
  alpha: number | null;
  smartMoney: number | null;
  pe: number | null;
  dividendYield: number | null;
  fairValueStatus: string | null;
  aiVerdict: string | null;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  trendLabel: string | null;
}

interface TechnicalRead {
  available: boolean;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  trendLabel: string | null;
  support: number | null;
  resistance: number | null;
  volumeRatio: number | null;
  closes: number[];
}

// Direction implied by the app's own verdict.
const VERDICT_DIR: Record<string, number> = { buy_lean: 1, hold: 0, watch: 0, avoid_lean: -1 };
export function classificationLabel(verdict: string | null | undefined): string {
  switch ((verdict || "").toLowerCase()) {
    case "buy_lean": return "Bullish";
    case "hold": return "Moderately Positive";
    case "watch": return "Neutral";
    case "avoid_lean": return "Bearish";
    default: return "Unknown";
  }
}

function technicalBiasDir(t: TechnicalRead): number {
  if (!t.available || t.rsi == null || t.ema20 == null) return 0;
  const trend = t.rsi >= 55 ? 1 : t.rsi <= 45 ? -1 : 0;
  return trend;
}

async function technicalRead(instrumentId: string): Promise<TechnicalRead> {
  const candles = await getCandles(instrumentId, "1d", 150).catch(() => []);
  if (candles.length < 30) return { available: false, rsi: null, ema20: null, ema50: null, trendLabel: null, support: null, resistance: null, volumeRatio: null, closes: [] };
  const closes = candles.map((c) => c.close);
  const e20 = lastValue(ema(closes, 20));
  const e50 = lastValue(ema(closes, 50));
  const r = lastValue(rsi(closes, 14));
  const price = closes[closes.length - 1];
  const recent = candles.slice(-30);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  let trendLabel: string | null = null;
  if (e20 != null && e50 != null) {
    if (price >= e20 && e20 >= e50) trendLabel = "Uptrend";
    else if (price < e20 && e20 < e50) trendLabel = "Downtrend";
    else trendLabel = "Sideways/transition";
  }
  const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const volumeRatio = avgVol > 0 && candles.length ? candles[candles.length - 1].volume / avgVol : null;
  return { available: true, rsi: r, ema20: e20, ema50: e50, trendLabel, support, resistance, volumeRatio, closes };
}

async function fetchTick(instrumentId: string): Promise<{ prevClose: number | null; dataStatus: string | null; updatedAt: Date | null }> {
  const rows = await query<{ prev_close: number | null; data_status: string | null; updated_at: Date | null }>(
    `SELECT prev_close, data_status, updated_at FROM price_ticks WHERE instrument_id = $1`,
    [instrumentId],
  );
  const r = rows.rows[0];
  return { prevClose: r?.prev_close == null ? null : Number(r.prev_close), dataStatus: r?.data_status ?? null, updatedAt: r?.updated_at ?? null };
}

interface MetricNote {
  metric: string;
  label: string;
  value: string;
  explanation: string;
}

type Ctx = NonNullable<Awaited<ReturnType<typeof fetchInstrumentCtx>>>;

function metricExplanations(ctx: Ctx): MetricNote[] {
  const notes: MetricNote[] = [];
  const n = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  notes.push({
    metric: "opportunity",
    label: "Opportunity Score",
    value: `${ctx.opportunity}/100`,
    explanation:
      ctx.opportunity >= 70
        ? `Opportunity is strong at ${ctx.opportunity}/100 — supported by the company's valuation, growth and relative performance in the application's model.`
        : ctx.opportunity >= 55
          ? `Opportunity is moderate at ${ctx.opportunity}/100. Earnings/revenue growth (${n(ctx.revenueGrowth)}% / ${n(ctx.earningsGrowth)}% YoY) and valuation keep it from being either very weak or very strong.`
          : `Opportunity is weak at ${ctx.opportunity}/100. Growth is limited (revenue ${n(ctx.revenueGrowth)}% YoY) and the model currently sees few positive catalysts.`,
  });
  notes.push({
    metric: "risk",
    label: "Risk Score",
    value: `${ctx.risk}/100`,
    explanation:
      ctx.risk >= 60
        ? `Risk is elevated at ${ctx.risk}/100. Contributing factors include volatility, ${ctx.debtToEquity > 1 ? `leverage (D/E ${n(ctx.debtToEquity)})` : "the company's debt profile"}, and valuation stretch.`
        : ctx.risk <= 40
          ? `Risk is contained at ${ctx.risk}/100 — leverage is low (D/E ${n(ctx.debtToEquity)}), the 52-week range is ${n(((ctx.week52High - ctx.week52Low) / ctx.week52Low) * 100)}%, and downside appears limited on the app's model.`
          : `Risk is moderate at ${ctx.risk}/100 — a blend of volatility, price movement and financial leverage that warrants monitoring.`,
  });
  notes.push({
    metric: "alpha",
    label: "Alpha Score",
    value: `${ctx.alphaGrowth}/100`,
    explanation: `Alpha is ${alphaGrowthCategory(ctx.alphaGrowth).toLowerCase()} at ${ctx.alphaGrowth}/100, reflecting the stock's relative performance versus the comparison universe the app uses.`,
  });
  notes.push({
    metric: "smartMoney",
    label: "Smart $ Score",
    value: `${ctx.smartMoney}/100`,
    explanation: `Smart-money activity is ${smartMoneyVerdict(ctx.smartMoney)} at ${ctx.smartMoney}/100 based on the ownership/flow signals tracked by the application.`,
  });
  notes.push({
    metric: "pe",
    label: "P/E",
    value: ctx.pe > 0 ? n(ctx.pe) : "—",
    explanation:
      ctx.pe > 0
        ? `The company trades at about ${n(ctx.pe)}× trailing earnings. This should be read against its sector, its historical band and earnings growth (${n(ctx.earningsGrowth)}% YoY) rather than in isolation.`
        : "P/E is not meaningful for this instrument (often the case for funds).",
  });
  notes.push({
    metric: "dividendYield",
    label: "Dividend Yield",
    value: `${n(ctx.dividendYield)}%`,
    explanation:
      ctx.dividendYield >= 3
        ? `Dividend yield is meaningful at ${n(ctx.dividendYield)}%, so income is part of the total-return case.`
        : `Dividend yield is low at ${n(ctx.dividendYield)}%, meaning the investment case is driven by business performance and price appreciation rather than income.`,
  });
  notes.push({
    metric: "fairValue",
    label: "Fair Value",
    value: ctx.fairValueStatus,
    explanation:
      ctx.fairValueStatus === "undervalued"
        ? "The model reads the stock as undervalued — market price sits below the estimated fair-value range."
        : ctx.fairValueStatus === "overvalued"
          ? "The model reads the stock as overvalued — price sits above the estimated fair-value range."
          : "The model classifies valuation as fair — the market price is broadly aligned with its estimated fair-value range.",
  });
  return notes;
}

interface ChangeDiff {
  metric: string;
  label: string;
  previous: number | string | null;
  current: number | string | null;
  change: number | string | null;
}

function diff(prev: Snapshot | null, current: {
  opportunity: number; risk: number; alpha: number; smartMoney: number; pe: number; dividendYield: number; fairValueStatus: string; price: number;
}): ChangeDiff[] {
  if (!prev) return [];
  const num = (x: number | string | null | undefined): number | null => (x == null ? null : Number(x));
  const round = (x: number | null, d: number): number | null => (x == null ? null : Number(x.toFixed(d)));
  const row = (metric: string, label: string, p: number | string | null, c: number, digits = 2): ChangeDiff => {
    const pn = num(p);
    const cn = num(c) ?? 0;
    const change = pn == null ? null : round(cn - pn, digits);
    return { metric, label, previous: round(pn, digits), current: round(cn, digits), change };
  };
  return [
    row("opportunity", "Opportunity", prev.opportunity, current.opportunity, 0),
    row("risk", "Risk", prev.risk, current.risk, 0),
    row("alpha", "Alpha", prev.alpha, current.alpha, 0),
    row("smartMoney", "Smart $", prev.smartMoney, current.smartMoney, 0),
    row("pe", "P/E", prev.pe, current.pe),
    { metric: "fairValue", label: "Fair Value", previous: prev.fairValueStatus ?? null, current: current.fairValueStatus, change: prev.fairValueStatus === current.fairValueStatus ? null : "changed" },
  ];
}

function narrative(diffs: ChangeDiff[], market: { changeAbs: number; changePct: number; price: number; prevClose: number }, t: TechnicalRead): string {
  const parts: string[] = [];
  parts.push(
    `The stock ${market.changeAbs >= 0 ? "rose" : "declined"} ₹${Math.abs(market.changeAbs).toFixed(2)} (${market.changePct >= 0 ? "+" : ""}${market.changePct.toFixed(2)}%) over the last trading day (₹${market.prevClose.toFixed(2)} → ₹${market.price.toFixed(2)}).`,
  );
  const opp = diffs.find((d) => d.metric === "opportunity");
  const risk = diffs.find((d) => d.metric === "risk");
  if (opp && typeof opp.change === "number" && opp.change !== 0)
    parts.push(`Opportunity ${opp.change > 0 ? "rose" : "fell"} ${Math.abs(opp.change)} point(s) (${opp.previous} → ${opp.current}).`);
  if (risk && typeof risk.change === "number" && risk.change !== 0)
    parts.push(`Risk ${risk.change > 0 ? "increased" : "decreased"} ${Math.abs(risk.change)} point(s) (${risk.previous} → ${risk.current}).`);
  const fv = diffs.find((d) => d.metric === "fairValue");
  if (fv && fv.change == null) parts.push("The fair-value classification is unchanged.");
  if (t.available) {
    const moves: string[] = [];
    if (t.rsi != null) moves.push(t.rsi <= 45 ? "RSI has weakened into lower territory" : t.rsi >= 55 ? "RSI remains firm" : "RSI is in neutral ground");
    if (t.ema20 != null && t.ema50 != null && t.ema20 < t.ema50) moves.push("price is below the 20-day average");
    if (moves.length) parts.push(`The change is consistent with the technical read: ${moves.join(", ")}.`);
  }
  parts.push("This is based on the available data — correlation, not a proven cause.");
  return parts.join(" ");
}

export async function buildInsight(instrumentId: string, userId: string) {
  const ctx = await fetchInstrumentCtx(instrumentId);
  if (!ctx) return null;
  const tick = await fetchTick(instrumentId);

  const tech = await technicalRead(instrumentId);
  const prevRow = await query<Record<string, unknown>>(
    `SELECT snapshot_at AS "snapshotAt", price, prev_close AS "prevClose", change_abs AS "changeAbs", change_pct AS "changePct",
            opportunity, risk, alpha_growth AS alpha, smart_money AS "smartMoney", pe, dividend_yield AS "dividendYield",
            fair_value_status AS "fairValueStatus", ai_verdict AS "aiVerdict", rsi, ema20, ema50, trend_label AS "trendLabel"
     FROM company_snapshots
     WHERE user_id = $1 AND instrument_id = $2
     ORDER BY snapshot_at DESC LIMIT 1`,
    [userId, instrumentId],
  );
  const toN = (x: unknown): number | null => (x == null ? null : Number(x));
  const p = prevRow.rows[0] as Record<string, unknown> | undefined;
  const prev: Snapshot | null = p
    ? {
        snapshotAt: String(p.snapshotAt),
        price: toN(p.price), prevClose: toN(p.prevClose), changeAbs: toN(p.changeAbs), changePct: toN(p.changePct),
        opportunity: toN(p.opportunity), risk: toN(p.risk), alpha: toN(p.alpha), smartMoney: toN(p.smartMoney),
        pe: toN(p.pe), dividendYield: toN(p.dividendYield),
        fairValueStatus: p.fairValueStatus == null ? null : String(p.fairValueStatus),
        aiVerdict: p.aiVerdict == null ? null : String(p.aiVerdict),
        rsi: toN(p.rsi), ema20: toN(p.ema20), ema50: toN(p.ema50),
        trendLabel: p.trendLabel == null ? null : String(p.trendLabel),
      }
    : null;

  // 1-day change uses the REAL market previous close (never synthesized).
  const prevClose = tick.prevClose ?? ctx.ltp;
  const price = ctx.ltp;
  const market = {
    price,
    prevClose,
    changeAbs: +(price - prevClose).toFixed(2),
    changePct: prevClose ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : 0,
    sourceLabel:
      tick.dataStatus === "LIVE" ? "Live feed (TradingView-sourced quote)" :
      tick.dataStatus === "DELAYED" ? "Delayed/simulated quote" :
      tick.dataStatus ? `Data status: ${tick.dataStatus}` : "Status unavailable",
    asOf: tick.updatedAt ? new Date(tick.updatedAt).toISOString() : new Date().toISOString(),
  };

  const current = {
    opportunity: ctx.opportunity,
    risk: ctx.risk,
    alpha: ctx.alphaGrowth,
    smartMoney: ctx.smartMoney,
    pe: ctx.pe,
    dividendYield: ctx.dividendYield,
    fairValueStatus: ctx.fairValueStatus,
    price,
  };
  const diffs = diff(prev, current);
  const currentVerdict = (ctx.aiVerdict || "").toLowerCase();

  // ── Validation: existing app analysis vs latest data ──────────────────────
  const supporting: string[] = [];
  const contradicting: string[] = [];
  if (tech.available) {
    if (tech.rsi != null) (tech.rsi >= 55 ? supporting : tech.rsi <= 45 ? contradicting : supporting).push(`RSI ${tech.rsi.toFixed(0)} is ${tech.rsi >= 55 ? "firm" : tech.rsi <= 45 ? "soft" : "neutral"}`);
    if (tech.ema20 != null && tech.ema50 != null) {
      if (price >= tech.ema20 && tech.ema20 >= tech.ema50) supporting.push(`Price (₹${price.toFixed(2)}) holds above the 20-day average (₹${tech.ema20.toFixed(2)})`);
      else if (price < tech.ema20 && tech.ema20 < tech.ema50) contradicting.push(`Price (₹${price.toFixed(2)}) is below the 20-day average (₹${tech.ema20.toFixed(2)})`);
    }
    if (tech.volumeRatio != null) {
      const note = tech.volumeRatio >= 1.5 ? `Volume is ${tech.volumeRatio.toFixed(1)}× average today` : tech.volumeRatio <= 0.7 ? `Volume is light (${tech.volumeRatio.toFixed(1)}× average)` : `Volume is near average (${tech.volumeRatio.toFixed(1)}×)`;
      (market.changePct < 0 && tech.volumeRatio >= 1.2 ? contradicting : supporting).push(note);
    }
  } else {
    supporting.push("Technical indicators could not be computed (insufficient candle history) — using scores only.");
  }

  const verdictDir = VERDICT_DIR[currentVerdict] ?? 0;
  const techDir = technicalBiasDir(tech);
  const riskRise = diffs.find((d) => d.metric === "risk" && typeof d.change === "number" && (d.change as number) > 0);
  const oppFall = diffs.find((d) => d.metric === "opportunity" && typeof d.change === "number" && (d.change as number) < 0);

  let status: "verified" | "corrected" | "insufficient_data";
  let correctedConclusion: string | null = null;
  let reason = "";
  const corrections: string[] = [];

  const dataSufficient = tech.available || ctx.ltp > 0;
  if (!dataSufficient) {
    status = "insufficient_data";
    reason = "Not enough verified market/technical data is available to validate the analysis.";
  } else if ((techDir !== 0 && verdictDir !== 0 && techDir !== verdictDir)) {
    status = "corrected";
    correctedConclusion = techDir === 1 ? "Bullish" : techDir === -1 ? "Bearish" : "Neutral";
    reason = `The latest technical data (RSI ${tech.rsi?.toFixed(0)}, trend ${tech.trendLabel ?? "unknown"}) does not support the current ${classificationLabel(currentVerdict)} classification.`;
    corrections.push(`Rebased short-term view to ${correctedConclusion} based on current momentum/average alignment.`);
  } else if ((riskRise && techDir !== 1) || (oppFall && techDir !== 1)) {
    status = "corrected";
    correctedConclusion = techDir === 0 ? (verdictDir > 0 ? "Neutral" : classificationLabel(currentVerdict)) : classificationLabel(currentVerdict);
    reason = "Score movement since the last application snapshot conflicts with the current view: risk rose / opportunity fell while technical momentum is not positive.";
    corrections.push("Downgrade short-term conviction until momentum confirms.");
  } else {
    status = "verified";
    reason = tech.available
      ? "The existing analysis is consistent with the latest market and technical data."
      : "The existing analysis is internally consistent with the latest scores and price data.";
  }

  const changeNarrative = diffs.length ? narrative(diffs, market, tech) : null;
  const classifications = { previous: prev ? classificationLabel(prev.aiVerdict) : null, current: classificationLabel(currentVerdict) };

  return {
    company: { id: instrumentId, symbol: ctx.symbol, companyName: ctx.companyName, sector: ctx.sector },
    market,
    scores: {
      opportunity: ctx.opportunity, risk: ctx.risk, alpha: ctx.alphaGrowth, smartMoney: ctx.smartMoney,
      financialStrength: ctx.financialStrength, verdict: currentVerdict, verdictLabel: aiVerdictLabel(currentVerdict),
    },
    valuation: { pe: ctx.pe, dividendYield: ctx.dividendYield, fairValueStatus: ctx.fairValueStatus, fairValue: ctx.fairValue },
    technical: {
      available: tech.available,
      source: "application candle data (deterministic); live quote freshness is shown by the market badge",
      rsi: tech.rsi, ema20: tech.ema20, ema50: tech.ema50, trendLabel: tech.trendLabel,
      support: tech.support, resistance: tech.resistance, volumeRatio: tech.volumeRatio,
    },
    snapshot: {
      exists: !!prev,
      firstSeenAt: prev?.snapshotAt ?? null,
      previous: prev,
    },
    firstView: !prev,
    comparison: prev ? diffs : null,
    changeNarrative,
    classifications,
    validation: {
      status,
      previousConclusion: classifications.previous,
      currentConclusion: classifications.current,
      correctedConclusion,
      reason,
      supportingSignals: supporting,
      contradictingSignals: contradicting,
      corrections,
      confidence: tech.available ? "moderate (technical data present)" : "low (technical data unavailable)",
    },
    explanations: metricExplanations(ctx),
    disclaimer: "Educational research tool — not financial advice.",
  };
}

// Records an append-only snapshot of what the user saw. Returns nothing fake.
export async function recordSnapshot(instrumentId: string, userId: string): Promise<void> {
  const ctx = await fetchInstrumentCtx(instrumentId);
  if (!ctx) return;
  const tick = await fetchTick(instrumentId);
  const tech = await technicalRead(instrumentId);
  const prevClose = tick.prevClose ?? ctx.ltp;
  const changePct = prevClose ? +(((ctx.ltp - prevClose) / prevClose) * 100).toFixed(2) : 0;
  await query(
    `INSERT INTO company_snapshots
       (user_id, instrument_id, price, prev_close, change_abs, change_pct, opportunity, risk, alpha_growth, smart_money,
        pe, dividend_yield, fair_value_status, ai_verdict, rsi, ema20, ema50, trend_label, technical_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
    [
      userId, instrumentId, ctx.ltp, prevClose, +(ctx.ltp - prevClose).toFixed(2), changePct,
      ctx.opportunity, ctx.risk, ctx.alphaGrowth, ctx.smartMoney, ctx.pe, ctx.dividendYield, ctx.fairValueStatus,
      (ctx.aiVerdict || "").toLowerCase(), tech.rsi, tech.ema20, tech.ema50, tech.trendLabel,
      JSON.stringify({ volumeRatio: tech.volumeRatio, support: tech.support, resistance: tech.resistance }),
    ],
  );
}
