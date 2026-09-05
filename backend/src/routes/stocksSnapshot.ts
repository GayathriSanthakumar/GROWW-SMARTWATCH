import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";

// REST snapshot controller used by the frontend as the ABSOLUTE fallback when
// the real-time stream is empty/null. Returns exchange-qualified symbols.
// POST /api/v1/stocks/snapshot  { instrumentIds?: string[] }
const router = Router();
router.use(requireAuth);

router.post(
  "/snapshot",
  asyncHandler(async (req, res) => {
    const ids = (req.body?.instrumentIds ?? []) as string[];
    if (Array.isArray(ids) && ids.length > 120) ids.splice(120);
    const rows = await query(
      `SELECT pt.instrument_id AS id, i.symbol, pt.ltp, pt.prev_close, pt.volume
       FROM price_ticks pt JOIN instruments i ON i.id = pt.instrument_id
       WHERE i.is_active = true ${Array.isArray(ids) && ids.length ? `AND pt.instrument_id = ANY($1::uuid[])` : ""}`,
      Array.isArray(ids) && ids.length ? [ids] : [],
    );
    const ticks = rows.rows.map((r) => {
      const ltp = Number(r.ltp);
      const prevClose = Number(r.prev_close);
      const dayChange = +(ltp - prevClose).toFixed(2);
      const dayChangePercent = prevClose > 0 ? +((dayChange / prevClose) * 100).toFixed(2) : 0;
      return {
        id: r.id,
        symbol: `NSE:${r.symbol}`,
        ltp,
        prevClose,
        dayChange,
        dayChangePercent,
        volume: Number(r.volume) || 0,
      };
    });
    res.json({ ticks });
  }),
);

export default router;
