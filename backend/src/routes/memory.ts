import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import { detectChangesForUser } from "../services/changeDetector.js";

const router = Router();
router.use(requireAuth);

// GET /api/memory/changes — list change events (must precede /:instrumentId)
router.get(
  "/changes",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT ce.*, i.symbol, i.company_name FROM change_events ce
       JOIN instruments i ON i.id = ce.instrument_id
       WHERE ce.user_id = $1 ORDER BY ce.detected_at DESC LIMIT 50`,
      [req.user!.id],
    );
    res.json({ changes: rows.rows });
  }),
);

// POST /api/memory/changes/:id/reviewed
router.post(
  "/changes/:id/reviewed",
  asyncHandler(async (req, res) => {
    await query(`UPDATE change_events SET reviewed = true WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// POST /api/memory/detect — trigger change detection on demand
router.post(
  "/detect",
  asyncHandler(async (req, res) => {
    const created = await detectChangesForUser(req.user!.id);
    res.json({ created });
  }),
);

// GET /api/memory/:instrumentId — baseline + change since last seen
router.get(
  "/:instrumentId",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT m.*, pt.ltp, pt.volume, sc.attention_score
       FROM user_instrument_memory m
       LEFT JOIN price_ticks pt ON pt.instrument_id = m.instrument_id
       LEFT JOIN instrument_scores sc ON sc.instrument_id = m.instrument_id
       WHERE m.user_id = $1 AND m.instrument_id = $2`,
      [req.user!.id, req.params.instrumentId],
    );
    const mem = rows.rows[0];
    if (!mem) {
      // no baseline yet — auto-create on first view
      await query(
        `INSERT INTO user_instrument_memory (user_id, instrument_id, last_viewed_at) VALUES ($1, $2, now())
         ON CONFLICT (user_id, instrument_id) DO UPDATE SET last_viewed_at = now()`,
        [req.user!.id, req.params.instrumentId],
      );
      res.json({ memory: null, baselineExists: false });
      return;
    }

    const currentPrice = Number(mem.ltp);
    const baselinePrice = Number(mem.last_seen_price);
    const changePct = baselinePrice ? ((currentPrice - baselinePrice) / baselinePrice) * 100 : 0;
    res.json({
      memory: {
        lastSeenPrice: baselinePrice,
        lastSeenVolume: Number(mem.last_seen_volume),
        lastSeenAt: mem.last_seen_at,
        lastViewedAt: mem.last_viewed_at,
        lastSeenAttention: mem.last_seen_attention_score,
        lastSeenOpportunity: mem.last_seen_opportunity_score,
        lastSeenRisk: mem.last_seen_risk_score,
      },
      baselineExists: !!mem.last_seen_at,
      current: { price: currentPrice, volume: Number(mem.volume), attention: mem.attention_score },
      change: { pricePct: +changePct.toFixed(2), abs: +(currentPrice - baselinePrice).toFixed(2) },
    });
  }),
);

// POST /api/memory/:instrumentId/review — capture current state as new baseline
router.post(
  "/:instrumentId/review",
  asyncHandler(async (req, res) => {
    const tick = await query(
      `SELECT pt.ltp, pt.volume, sc.attention_score, sc.opportunity_score, sc.risk_score
       FROM price_ticks pt LEFT JOIN instrument_scores sc ON sc.instrument_id = pt.instrument_id
       WHERE pt.instrument_id = $1`,
      [req.params.instrumentId],
    );
    if (!tick.rows[0]) throw badRequest("Instrument has no live data");
    const t = tick.rows[0];
    await query(
      `INSERT INTO user_instrument_memory (user_id, instrument_id, last_seen_price, last_seen_volume, last_seen_attention_score, last_seen_opportunity_score, last_seen_risk_score, last_seen_at, last_viewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (user_id, instrument_id) DO UPDATE SET
         last_seen_price = EXCLUDED.last_seen_price, last_seen_volume = EXCLUDED.last_seen_volume,
         last_seen_attention_score = EXCLUDED.last_seen_attention_score, last_seen_opportunity_score = EXCLUDED.last_seen_opportunity_score,
         last_seen_risk_score = EXCLUDED.last_seen_risk_score, last_seen_at = now(), last_viewed_at = now()`,
      [req.user!.id, req.params.instrumentId, t.ltp, t.volume, t.attention_score, t.opportunity_score, t.risk_score],
    );
    res.json({ ok: true });
  }),
);

export default router;
