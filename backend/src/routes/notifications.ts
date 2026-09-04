import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /api/notifications
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT n.*, i.symbol, i.company_name FROM notifications n
       LEFT JOIN instruments i ON i.id = n.instrument_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 100`,
      [req.user!.id],
    );
    res.json({ notifications: rows.rows });
  }),
);

// GET /api/notifications/unread-count
router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const rows = await query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`, [req.user!.id]);
    res.json({ count: rows.rows[0].count });
  }),
);

// PATCH /api/notifications/:id  { isRead }
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const isRead = req.body?.isRead;
    await query(`UPDATE notifications SET is_read = $1 WHERE id = $2 AND user_id = $3`, [isRead, req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// POST /api/notifications/read-all
router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
