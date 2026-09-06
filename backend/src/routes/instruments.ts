import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { notFound } from "../lib/errors.js";
import { optionalAuth } from "../middleware/auth.js";
import { getCandlesByInstrumentId } from "../services/marketHistory.js";

const router = Router();

export const INSTRUMENT_SELECT = `
  i.id, i.symbol, i.exchange, i.instrument_type, i.company_name, i.sector, i.industry, i.logo_url,
  pt.ltp, pt.prev_close, pt.day_open, pt.day_high, pt.day_low, pt.volume, pt.avg_volume_20d, pt.week52_high, pt.week52_low, pt.bse_ltp, pt.bse_prev_close, pt.data_status,
  fs.pe_ratio, fs.pb_ratio, fs.peg_ratio, fs.debt_to_equity, fs.current_ratio, fs.roe_pct, fs.operating_margin_pct, fs.free_cash_flow,
  fs.revenue_growth_yoy_pct, fs.earnings_growth_yoy_pct, fs.dividend_yield_pct, fs.payout_ratio_pct, fs.fair_value_estimate, fs.market_cap, fs.sharia_status,
  sc.opportunity_score, sc.risk_score, sc.financial_strength_score, sc.alpha_growth_score, sc.smart_money_score, sc.fair_value_status, sc.ai_verdict
`;

const JOIN_TICKS = `
  FROM instruments i
  LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
  LEFT JOIN fundamentals_snapshot fs ON fs.instrument_id = i.id AND fs.as_of_date = (SELECT MAX(as_of_date) FROM fundamentals_snapshot WHERE instrument_id = i.id)
  LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
`;

export function mapInstrumentRow(r: Record<string, unknown>) {
  const ltp = Number(r.ltp);
  const prevClose = Number(r.prev_close);
  const changePct = prevClose ? ((ltp - prevClose) / prevClose) * 100 : 0;
  return {
    id: r.id,
    symbol: r.symbol,
    exchange: r.exchange,
    instrumentType: r.instrument_type,
    companyName: r.company_name,
    sector: r.sector,
    industry: r.industry,
    logoUrl: r.logo_url,
    ltp,
    prevClose,
    change: +(ltp - prevClose).toFixed(2),
    changePct: +changePct.toFixed(2),
    dayOpen: Number(r.day_open),
    dayHigh: Number(r.day_high),
    dayLow: Number(r.day_low),
    volume: Number(r.volume),
    avgVolume20d: Number(r.avg_volume_20d),
    week52High: Number(r.week52_high),
    week52Low: Number(r.week52_low),
    bseLtp: Number(r.bse_ltp) || null,
    bseChangePct: r.bse_ltp && r.bse_prev_close ? +(((Number(r.bse_ltp) - Number(r.bse_prev_close)) / Number(r.bse_prev_close)) * 100).toFixed(2) : null,
    dataStatus: r.data_status,
    fundamentals: {
      pe: Number(r.pe_ratio),
      pb: Number(r.pb_ratio),
      peg: Number(r.peg_ratio),
      debtToEquity: Number(r.debt_to_equity),
      currentRatio: Number(r.current_ratio),
      roe: Number(r.roe_pct),
      operatingMargin: Number(r.operating_margin_pct),
      freeCashFlow: Number(r.free_cash_flow),
      revenueGrowthYoY: Number(r.revenue_growth_yoy_pct),
      earningsGrowthYoY: Number(r.earnings_growth_yoy_pct),
      dividendYield: Number(r.dividend_yield_pct),
      payoutRatio: Number(r.payout_ratio_pct),
      fairValue: Number(r.fair_value_estimate),
      marketCap: Number(r.market_cap),
      shariaStatus: r.sharia_status,
    },
    scores: {
      opportunity: Number(r.opportunity_score),
      risk: Number(r.risk_score),
      financialStrength: Number(r.financial_strength_score),
      alphaGrowth: Number(r.alpha_growth_score),
      smartMoney: Number(r.smart_money_score),
      fairValueStatus: r.fair_value_status,
      aiVerdict: r.ai_verdict,
    },
  };
}

// GET /api/instruments/search?q=&limit=
router.get(
  "/search",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const rows = await query(
      `SELECT ${INSTRUMENT_SELECT} ${JOIN_TICKS}
       WHERE i.is_active = true AND (i.symbol ILIKE $1 OR i.company_name ILIKE $1)
       ORDER BY CASE WHEN i.symbol ILIKE $1 THEN 0 ELSE 1 END, i.company_name
       LIMIT $2`,
      [`%${q}%`, limit],
    );
    res.json({ results: rows.rows.map(mapInstrumentRow) });
  }),
);

// GET /api/instruments/:id
router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(`SELECT ${INSTRUMENT_SELECT} ${JOIN_TICKS} WHERE i.id = $1`, [req.params.id]);
    if (!rows.rows[0]) throw notFound("Instrument not found");
    res.json({ instrument: mapInstrumentRow(rows.rows[0] as Record<string, unknown>) });
  }),
);

// GET /api/instruments/:id/candles?interval=1d&limit=90
router.get(
  "/:id/candles",
  asyncHandler(async (req, res) => {
    const interval = String(req.query.interval || "1d") as import("../services/candleService.js").CandleInterval;
    const limit = Math.min(Number(req.query.limit) || 90, 500);
    const candles = await getCandlesByInstrumentId(req.params.id, interval, limit);
    res.json({ candles });
  }),
);

// POST /api/instruments/candles/batch — { instrumentIds, interval, limit }
// One request serves many rows (watchlist Trend) instead of a fetch per row.
router.post(
  "/candles/batch",
  asyncHandler(async (req, res) => {
    const ids = (req.body?.instrumentIds ?? []) as string[];
    const interval = String(req.body?.interval || "1d") as import("../services/candleService.js").CandleInterval;
    const limit = Math.min(Number(req.body?.limit) || 40, 120);
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("instrumentIds required");
    if (ids.length > 120) ids.splice(120);
    const out: Record<string, unknown[]> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          out[id] = await getCandlesByInstrumentId(id, interval, limit);
        } catch {
          out[id] = [];
        }
      }),
    );
    res.json({ candles: out });
  }),
);

// GET /api/instruments/:id/news
router.get(
  "/:id/news",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, headline, source, url, sentiment, published_at FROM news_items WHERE instrument_id = $1 ORDER BY published_at DESC LIMIT 20`,
      [req.params.id],
    );
    res.json({ news: rows.rows });
  }),
);

// GET /api/instruments/:id/holdings
router.get(
  "/:id/holdings",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT holder_name, ownership_pct, change_pct, as_of_date FROM institutional_holdings WHERE instrument_id = $1 ORDER BY ownership_pct DESC`,
      [req.params.id],
    );
    res.json({ holdings: rows.rows });
  }),
);

export default router;
