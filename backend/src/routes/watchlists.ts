import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, notFound } from "../lib/errors.js";
import { INSTRUMENT_SELECT, mapInstrumentRow } from "./instruments.js";

const router = Router();
router.use(requireAuth);

// GET /api/watchlists
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const lists = await query(
      `SELECT wl.id, wl.name, wl.emoji, wl.description, wl.is_default, wl.sort_order, wl.created_at,
              (SELECT COUNT(*) FROM watchlist_items wi WHERE wi.watchlist_id = wl.id) AS item_count
       FROM watchlists wl WHERE wl.user_id = $1 ORDER BY wl.sort_order, wl.created_at`,
      [req.user!.id],
    );
    res.json({ watchlists: lists.rows });
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().max(8).optional(),
  description: z.string().max(200).optional(),
});

// POST /api/watchlists
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO watchlists (user_id, name, emoji, description, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order),0)+1 FROM watchlists WHERE user_id = $1))
       RETURNING id`,
      [req.user!.id, parsed.data.name, parsed.data.emoji || "📈", parsed.data.description || null],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  emoji: z.string().max(8).optional(),
  description: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
});

// PATCH /api/watchlists/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { name, emoji, description, isDefault } = parsed.data;

    const sets: string[] = [];
    const params: unknown[] = [];
    if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
    if (emoji !== undefined) { params.push(emoji); sets.push(`emoji = $${params.length}`); }
    if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
    if (sets.length === 0 && isDefault === undefined) throw badRequest("Nothing to update");

    await query("BEGIN");
    try {
      if (isDefault) {
        await query(`UPDATE watchlists SET is_default = false WHERE user_id = $1`, [req.user!.id]);
        sets.push("is_default = true");
      }
      if (sets.length) {
        params.push(req.params.id, req.user!.id);
        await query(`UPDATE watchlists SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length}`, params);
      }
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  }),
);

// DELETE /api/watchlists/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM watchlists WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// POST /api/watchlists/reorder  { ids: string[] }
router.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const ids = (req.body?.ids ?? []) as string[];
    if (!Array.isArray(ids) || ids.length === 0) throw badRequest("ids required");
    await query("BEGIN");
    try {
      for (let i = 0; i < ids.length; i++) {
        await query(`UPDATE watchlists SET sort_order = $1 WHERE id = $2 AND user_id = $3`, [i, ids[i], req.user!.id]);
      }
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  }),
);

// GET /api/watchlists/:id/items
router.get(
  "/:id/items",
  asyncHandler(async (req, res) => {
    await assertOwnWatchlist(req.params.id, req.user!.id);
    const rows = await query(
      `SELECT ${INSTRUMENT_SELECT}, wi.watch_intent, wi.notes, wi.tags, wi.entry_level, wi.exit_level, wi.added_price, wi.is_pinned, wi.sort_order, wi.added_at
       FROM watchlist_items wi
       JOIN instruments i ON i.id = wi.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       LEFT JOIN fundamentals_snapshot fs ON fs.instrument_id = i.id AND fs.as_of_date = (SELECT MAX(as_of_date) FROM fundamentals_snapshot WHERE instrument_id = i.id)
       LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
       WHERE wi.watchlist_id = $1
       ORDER BY wi.is_pinned DESC, wi.sort_order, wi.added_at`,
      [req.params.id],
    );
    const items = rows.rows.map((r) => {
      const ltp = Number(r.ltp);
      const addedPrice = r.added_price == null ? null : Number(r.added_price);
      const addedAt = r.added_at ? new Date(r.added_at) : null;
      let cagr: number | null = null;
      if (addedPrice && ltp && addedAt) {
        const days = Math.max((Date.now() - addedAt.getTime()) / 86400000, 30);
        cagr = (Math.pow(ltp / addedPrice, 365 / days) - 1) * 100;
      }
      return {
        ...mapInstrumentRow(r as Record<string, unknown>),
        watchIntent: r.watch_intent,
        notes: r.notes,
        tags: r.tags ?? [],
        entryLevel: r.entry_level == null ? null : Number(r.entry_level),
        exitLevel: r.exit_level == null ? null : Number(r.exit_level),
        isPinned: r.is_pinned,
        sortOrder: r.sort_order,
        addedAt: r.added_at,
        addedPrice,
        cagr: cagr == null ? null : +cagr.toFixed(2),
      };
    });
    res.json({ items });
  }),
);

const addItemsSchema = z.object({
  instrumentIds: z.array(z.string().uuid()).min(1),
  watchIntent: z.string().optional(),
});

// POST /api/watchlists/:id/items
router.post(
  "/:id/items",
  asyncHandler(async (req, res) => {
    await assertOwnWatchlist(req.params.id, req.user!.id);
    const parsed = addItemsSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);

    await query("BEGIN");
    try {
      for (const instId of parsed.data.instrumentIds) {
        const tick = await query<{ ltp: number }>(`SELECT ltp FROM price_ticks WHERE instrument_id = $1`, [instId]);
        await query(
          `INSERT INTO watchlist_items (watchlist_id, instrument_id, watch_intent, added_price, sort_order)
           VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order),0)+1 FROM watchlist_items WHERE watchlist_id = $1))
           ON CONFLICT (watchlist_id, instrument_id) DO NOTHING`,
          [req.params.id, instId, parsed.data.watchIntent ?? null, tick.rows[0]?.ltp ?? null],
        );
      }
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.status(201).json({ ok: true });
  }),
);

// DELETE /api/watchlists/:id/items/:instrumentId
router.delete(
  "/:id/items/:instrumentId",
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM watchlist_items WHERE watchlist_id = $1 AND instrument_id = $2 AND watchlist_id IN (SELECT id FROM watchlists WHERE user_id = $3)`, [req.params.id, req.params.instrumentId, req.user!.id]);
    res.json({ ok: true });
  }),
);

// DELETE /api/watchlists/:id/items  (bulk)  { instrumentIds: string[] }
router.delete(
  "/:id/items",
  asyncHandler(async (req, res) => {
    const ids = (req.body?.instrumentIds ?? []) as string[];
    if (!Array.isArray(ids) || ids.length === 0) throw badRequest("instrumentIds required");
    await query(
      `DELETE FROM watchlist_items WHERE watchlist_id = $1 AND instrument_id = ANY($2::uuid[]) AND watchlist_id IN (SELECT id FROM watchlists WHERE user_id = $3)`,
      [req.params.id, ids, req.user!.id],
    );
    res.json({ ok: true });
  }),
);

const patchItemSchema = z.object({
  watchIntent: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  entryLevel: z.number().nullable().optional(),
  exitLevel: z.number().nullable().optional(),
  isPinned: z.boolean().optional(),
});

// PATCH /api/watchlists/:id/items/:instrumentId
router.patch(
  "/:id/items/:instrumentId",
  asyncHandler(async (req, res) => {
    const parsed = patchItemSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { watchIntent, notes, tags, entryLevel, exitLevel, isPinned } = parsed.data;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (watchIntent !== undefined) { params.push(watchIntent); sets.push(`watch_intent = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`); }
    if (tags !== undefined) { params.push(tags); sets.push(`tags = $${params.length}`); }
    if (entryLevel !== undefined) { params.push(entryLevel); sets.push(`entry_level = $${params.length}`); }
    if (exitLevel !== undefined) { params.push(exitLevel); sets.push(`exit_level = $${params.length}`); }
    if (isPinned !== undefined) { params.push(isPinned); sets.push(`is_pinned = $${params.length}`); }
    if (sets.length === 0) throw badRequest("Nothing to update");
    params.push(req.params.id, req.params.instrumentId, req.user!.id);
    await query(
      `UPDATE watchlist_items SET ${sets.join(", ")} WHERE watchlist_id = $${params.length - 2} AND instrument_id = $${params.length - 1} AND watchlist_id IN (SELECT id FROM watchlists WHERE user_id = $${params.length})`,
      params,
    );
    res.json({ ok: true });
  }),
);

// POST /api/watchlists/:id/items/reorder  { instrumentIds: string[] }
router.post(
  "/:id/items/reorder",
  asyncHandler(async (req, res) => {
    const ids = (req.body?.instrumentIds ?? []) as string[];
    if (!Array.isArray(ids) || ids.length === 0) throw badRequest("instrumentIds required");
    await query("BEGIN");
    try {
      for (let i = 0; i < ids.length; i++) {
        await query(`UPDATE watchlist_items SET sort_order = $1 WHERE watchlist_id = $2 AND instrument_id = $3`, [i, req.params.id, ids[i]]);
      }
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  }),
);

// POST /api/watchlists/:id/items/move  { instrumentId, targetWatchlistId }
router.post(
  "/:id/items/move",
  asyncHandler(async (req, res) => {
    const { instrumentId, targetWatchlistId } = req.body ?? {};
    if (!instrumentId || !targetWatchlistId) throw badRequest("instrumentId and targetWatchlistId required");
    await assertOwnWatchlist(targetWatchlistId, req.user!.id);
    await query("BEGIN");
    try {
      await query(`DELETE FROM watchlist_items WHERE watchlist_id = $1 AND instrument_id = $2`, [req.params.id, instrumentId]);
      await query(
        `INSERT INTO watchlist_items (watchlist_id, instrument_id, sort_order) VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order),0)+1 FROM watchlist_items WHERE watchlist_id = $1)) ON CONFLICT DO NOTHING`,
        [targetWatchlistId, instrumentId],
      );
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
    res.json({ ok: true });
  }),
);

async function assertOwnWatchlist(id: string, userId: string) {
  const rows = await query(`SELECT 1 FROM watchlists WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows.rows[0]) throw notFound("Watchlist not found");
}

export default router;
