import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { optionalAuth } from "../middleware/auth.js";
import { getMarketStatus } from "../services/marketStatus.js";
import { getProvider } from "../services/marketData.js";

const router = Router();
router.use(optionalAuth);

// GET /api/market/status — IST market hours, next session, data mode
router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const status = getProvider().getMarketStatus();
    res.json(status);
  }),
);

// GET /api/market/indices
router.get(
  "/indices",
  asyncHandler(async (_req, res) => {
    const rows = await query(`SELECT * FROM index_ticks ORDER BY index_symbol`);
    res.json({ indices: rows.rows });
  }),
);

// GET /api/market/overview — breadth + movers
router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const ticks = await query(
      `SELECT i.symbol, i.company_name, i.sector, pt.ltp, pt.prev_close, pt.volume, pt.avg_volume_20d
       FROM price_ticks pt JOIN instruments i ON i.id = pt.instrument_id WHERE i.is_active = true`,
    );
    const rows = ticks.rows.map((r) => ({
      symbol: r.symbol,
      companyName: r.company_name,
      sector: r.sector,
      ltp: Number(r.ltp),
      changePct: Number(r.prev_close) ? ((Number(r.ltp) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0,
      volume: Number(r.volume),
      avgVolume: Number(r.avg_volume_20d),
    }));

    const advancers = rows.filter((r) => r.changePct > 0).length;
    const decliners = rows.filter((r) => r.changePct < 0).length;
    const gainers = [...rows].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
    const losers = [...rows].sort((a, b) => a.changePct - b.changePct).slice(0, 5);
    const byVolume = [...rows].sort((a, b) => b.volume - a.volume).slice(0, 5);

    res.json({ breadth: { advancers, decliners, unchanged: rows.length - advancers - decliners, total: rows.length }, gainers, losers, byVolume });
  }),
);

// GET /api/market/sectors — sector aggregate performance
router.get(
  "/sectors",
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT i.sector, AVG((pt.ltp - pt.prev_close)/NULLIF(pt.prev_close,0)*100)::float8 AS avg_pct, COUNT(*)::int AS cnt
       FROM price_ticks pt JOIN instruments i ON i.id = pt.instrument_id
       WHERE i.is_active = true AND i.instrument_type = 'stock'
       GROUP BY i.sector ORDER BY avg_pct DESC`,
    );
    res.json({ sectors: rows.rows });
  }),
);

export default router;
