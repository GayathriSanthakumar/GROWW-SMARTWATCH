import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import { buildInsight, recordSnapshot } from "../services/insightService.js";

const router = Router();
router.use(requireAuth);

// GET /api/insights/:instrumentId — unified, honest company view: market
// (real 1-day change), scores, valuation, technical read, snapshot comparison,
// analysis validation and metric explanations. Shared by the company panel and
// the AI Analyst page.
router.get(
  "/:instrumentId",
  asyncHandler(async (req, res) => {
    const insight = await buildInsight(req.params.instrumentId, req.user!.id);
    if (!insight) throw badRequest("Instrument not found or has no live data");
    res.json({ insight });
  }),
);

// POST /api/insights/:instrumentId — record an append-only "I viewed this now"
// snapshot so the NEXT visit can compare against it. Never overwrites history.
router.post(
  "/:instrumentId",
  asyncHandler(async (req, res) => {
    await recordSnapshot(req.params.instrumentId, req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;
