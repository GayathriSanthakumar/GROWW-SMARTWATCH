import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { optionalAuth } from "../middleware/auth.js";

const router = Router();
router.use(optionalAuth);

// GET /api/etf
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT i.id, i.symbol, i.company_name, i.sector, pt.ltp, pt.prev_close, pt.volume,
              e.expense_ratio_pct, e.benchmark_index, e.aum, e.tracking_error_pct
       FROM instruments i
       JOIN etf_details e ON e.instrument_id = i.id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE i.instrument_type = 'etf' AND i.is_active = true
       ORDER BY e.aum DESC`,
    );
    const etfs = rows.rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.company_name,
      sector: r.sector,
      ltp: Number(r.ltp),
      changePct: Number(r.prev_close) ? ((Number(r.ltp) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0,
      expenseRatio: Number(r.expense_ratio_pct),
      benchmark: r.benchmark_index,
      aum: Number(r.aum),
      trackingError: Number(r.tracking_error_pct),
    }));
    res.json({ etfs });
  }),
);

// GET /api/etf/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT i.*, e.expense_ratio_pct, e.benchmark_index, e.aum, e.tracking_error_pct, e.top_holdings, pt.ltp, pt.prev_close
       FROM instruments i
       JOIN etf_details e ON e.instrument_id = i.id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE i.id = $1`,
      [req.params.id],
    );
    if (!rows.rows[0]) return res.status(404).json({ error: "NOT_FOUND", message: "ETF not found" });
    const r = rows.rows[0];
    res.json({
      etf: {
        id: r.id,
        symbol: r.symbol,
        name: r.company_name,
        sector: r.sector,
        ltp: Number(r.ltp),
        changePct: Number(r.prev_close) ? ((Number(r.ltp) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0,
        expenseRatio: Number(r.expense_ratio_pct),
        benchmark: r.benchmark_index,
        aum: Number(r.aum),
        trackingError: Number(r.tracking_error_pct),
        topHoldings: r.top_holdings ?? [],
      },
    });
  }),
);

// GET /api/etf/presets/list
router.get(
  "/presets/list",
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT i.id, i.symbol, i.company_name, e.expense_ratio_pct, e.aum, e.tracking_error_pct
       FROM instruments i JOIN etf_details e ON e.instrument_id = i.id WHERE i.instrument_type = 'etf'`,
    );
    const etfs = rows.rows.map((r) => ({
      id: r.id, symbol: r.symbol, name: r.company_name,
      expenseRatio: Number(r.expense_ratio_pct), aum: Number(r.aum), trackingError: Number(r.tracking_error_pct),
    }));
    res.json({
      lowestExpense: [...etfs].sort((a, b) => a.expenseRatio - b.expenseRatio).slice(0, 5),
      bestTracking: [...etfs].sort((a, b) => a.trackingError - b.trackingError).slice(0, 5),
      highestAum: [...etfs].sort((a, b) => b.aum - a.aum).slice(0, 5),
    });
  }),
);

export default router;
