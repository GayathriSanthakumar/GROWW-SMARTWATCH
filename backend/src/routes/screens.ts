import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";

const router = Router();
router.use(requireAuth);

// GET /api/screens
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(`SELECT id, name, filters_json, created_at FROM saved_screens WHERE user_id = $1 ORDER BY created_at DESC`, [req.user!.id]);
    res.json({ screens: rows.rows.map((r) => ({ id: r.id, name: r.name, filters: r.filters_json, createdAt: r.created_at })) });
  }),
);

const schema = z.object({ name: z.string().min(1).max(60), filters: z.record(z.unknown()) });

// POST /api/screens
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { rows } = await query(
      `INSERT INTO saved_screens (user_id, name, filters_json) VALUES ($1, $2, $3) RETURNING id`,
      [req.user!.id, parsed.data.name, JSON.stringify(parsed.data.filters)],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

// DELETE /api/screens/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM saved_screens WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
