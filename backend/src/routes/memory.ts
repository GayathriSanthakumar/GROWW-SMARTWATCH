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

// GET /api/memory/summary — "what changed since you were last here", scoped to
// the user's watchlists. Drives the returning-visit hub on the watchlist page.
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const user = await query<{ last_memory_review_at: string | null }>(
      `SELECT last_memory_review_at FROM users WHERE id = $1`,
      [req.user!.id],
    );

    const grouped = await query<{ event_type: string; total: number; stocks: number; last24h: number }>(
      `WITH mine AS (
         SELECT DISTINCT wi.instrument_id
         FROM watchlist_items wi
         JOIN watchlists wl ON wl.id = wi.watchlist_id AND wl.user_id = $1
       )
       SELECT ce.event_type,
              COUNT(DISTINCT ce.id)::int AS total,
              COUNT(DISTINCT ce.instrument_id)::int AS stocks,
              COUNT(DISTINCT ce.id) FILTER (WHERE ce.detected_at > now() - interval '24 hours')::int AS last24h
       FROM change_events ce
       JOIN mine m ON m.instrument_id = ce.instrument_id
       WHERE ce.user_id = $1 AND ce.reviewed = false
       GROUP BY ce.event_type`,
      [req.user!.id],
    );

    const recent = await query(
      `SELECT DISTINCT ON (ce.id)
              ce.id, ce.event_type AS "eventType", ce.magnitude, ce.confidence, ce.explanation,
              ce.detected_at AS "detectedAt", ce.instrument_id AS "instrumentId",
              i.symbol, i.company_name AS "companyName",
              pt.ltp, pt.prev_close, pt.data_status AS "dataStatus"
       FROM change_events ce
       JOIN instruments i ON i.id = ce.instrument_id
       JOIN price_ticks pt ON pt.instrument_id = ce.instrument_id
       JOIN watchlist_items wi ON wi.instrument_id = ce.instrument_id
       JOIN watchlists wl ON wl.id = wi.watchlist_id AND wl.user_id = $1
       WHERE ce.user_id = $1 AND ce.reviewed = false
       ORDER BY ce.id, ce.detected_at DESC
       LIMIT 8`,
      [req.user!.id],
    );

    const byType: Record<string, { total: number; stocks: number; last24h: number }> = {};
    let total = 0;
    const stocks = new Set<string>();
    for (const g of grouped.rows) {
      byType[g.event_type] = { total: g.total, stocks: g.stocks, last24h: g.last24h };
      total += g.total;
    }
    for (const r of recent.rows as { symbol: string }[]) stocks.add(r.symbol);

    res.json({
      total,
      byType,
      distinctStocks: stocks.size,
      reviewedAt: user.rows[0]?.last_memory_review_at ?? null,
      recent: recent.rows.map((r) => ({
        id: r.id,
        instrumentId: r.instrumentId,
        eventType: r.eventType,
        magnitude: Number(r.magnitude),
        confidence: r.confidence,
        explanation: r.explanation,
        detectedAt: r.detectedAt,
        symbol: r.symbol,
        companyName: r.companyName,
        ltp: Number(r.ltp),
        changePct: Number(r.prev_close) ? ((Number(r.ltp) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0,
        dataStatus: r.dataStatus,
      })),
    });
  }),
);

// POST /api/memory/catchup — "I've seen it": refresh baselines for everything on
// the user's watchlists, clear unreviewed change events & change notifications,
// and stamp the visit time. One batched baseline upsert + two small updates.
router.post(
  "/catchup",
  asyncHandler(async (req, res) => {
    await query("BEGIN");
    try {
      await query(
        `INSERT INTO user_instrument_memory
           (user_id, instrument_id, last_seen_price, last_seen_volume,
            last_seen_attention_score, last_seen_opportunity_score, last_seen_risk_score,
            last_seen_at, last_viewed_at)
         SELECT $1, ids.instrument_id, pt.ltp, pt.volume, sc.attention_score, sc.opportunity_score, sc.risk_score, now(), now()
         FROM (SELECT DISTINCT wi.instrument_id
               FROM watchlist_items wi
               JOIN watchlists wl ON wl.id = wi.watchlist_id AND wl.user_id = $1) ids
         JOIN price_ticks pt ON pt.instrument_id = ids.instrument_id
         LEFT JOIN instrument_scores sc ON sc.instrument_id = ids.instrument_id
         ON CONFLICT (user_id, instrument_id) DO UPDATE SET
           last_seen_price = EXCLUDED.last_seen_price,
           last_seen_volume = EXCLUDED.last_seen_volume,
           last_seen_attention_score = EXCLUDED.last_seen_attention_score,
           last_seen_opportunity_score = EXCLUDED.last_seen_opportunity_score,
           last_seen_risk_score = EXCLUDED.last_seen_risk_score,
           last_seen_at = now(), last_viewed_at = now()`,
        [req.user!.id],
      );
      await query(`UPDATE change_events SET reviewed = true WHERE user_id = $1 AND reviewed = false`, [req.user!.id]);
      await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false AND alert_id IS NULL`, [req.user!.id]);
      await query(`UPDATE users SET last_memory_review_at = now() WHERE id = $1`, [req.user!.id]);
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
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
