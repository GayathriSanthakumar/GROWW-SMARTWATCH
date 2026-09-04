import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";

const router = Router();
router.use(requireAuth);

// GET /api/alerts
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT a.*, i.symbol, i.company_name, pt.ltp
       FROM alerts a
       LEFT JOIN instruments i ON i.id = a.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
      [req.user!.id],
    );
    res.json({ alerts: rows.rows });
  }),
);

const alertSchema = z.object({
  instrumentId: z.string().uuid().optional().nullable(),
  conditionJson: z.record(z.unknown()),
  notifyMode: z.enum(["immediate", "summary", "silent", "quiet"]).optional().default("immediate"),
});

// POST /api/alerts
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = alertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { rows } = await query(
      `INSERT INTO alerts (user_id, instrument_id, condition_json, notify_mode) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.user!.id, parsed.data.instrumentId ?? null, JSON.stringify(parsed.data.conditionJson), parsed.data.notifyMode],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

// PATCH /api/alerts/:id  { isActive }
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const isActive = req.body?.isActive;
    if (typeof isActive !== "boolean") throw badRequest("isActive required");
    await query(`UPDATE alerts SET is_active = $1 WHERE id = $2 AND user_id = $3`, [isActive, req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// DELETE /api/alerts/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM alerts WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
