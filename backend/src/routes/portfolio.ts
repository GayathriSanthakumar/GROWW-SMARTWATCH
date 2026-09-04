import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, notFound } from "../lib/errors.js";

const router = Router();
router.use(requireAuth);

// GET /api/portfolio
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT pp.*, i.symbol, i.company_name, i.sector, pt.ltp, pt.prev_close,
              sc.opportunity_score, sc.risk_score, sc.ai_verdict
       FROM portfolio_positions pp
       JOIN instruments i ON i.id = pp.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
       WHERE pp.user_id = $1 ORDER BY pp.buy_date DESC`,
      [req.user!.id],
    );
    const positions = rows.rows.map((r) => {
      const ltp = Number(r.ltp) || Number(r.buy_price);
      const invested = Number(r.quantity) * Number(r.buy_price);
      const current = Number(r.quantity) * ltp;
      const pnl = current - invested;
      const pnlPct = invested ? (pnl / invested) * 100 : 0;
      return {
        id: r.id,
        instrumentId: r.instrument_id,
        symbol: r.symbol,
        companyName: r.company_name,
        sector: r.sector,
        status: r.status,
        quantity: Number(r.quantity),
        buyPrice: Number(r.buy_price),
        buyDate: r.buy_date,
        sellPrice: Number(r.sell_price),
        sellDate: r.sell_date,
        fees: Number(r.fees),
        thesisNotes: r.thesis_notes,
        priceTarget: Number(r.price_target),
        stopLoss: Number(r.stop_loss),
        goalId: r.goal_id ?? null,
        ltp,
        invested: +invested.toFixed(2),
        currentValue: +current.toFixed(2),
        pnl: +pnl.toFixed(2),
        pnlPct: +pnlPct.toFixed(2),
        scores: { opportunity: r.opportunity_score, risk: r.risk_score, aiVerdict: r.ai_verdict },
      };
    });
    res.json({ positions });
  }),
);

// GET /api/portfolio/summary
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT pp.quantity, pp.buy_price, pt.ltp
       FROM portfolio_positions pp
       JOIN instruments i ON i.id = pp.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE pp.user_id = $1 AND pp.status = 'holding'`,
      [req.user!.id],
    );
    let invested = 0;
    let current = 0;
    for (const r of rows.rows) {
      invested += Number(r.quantity) * Number(r.buy_price);
      current += Number(r.quantity) * (Number(r.ltp) || Number(r.buy_price));
    }
    const pnl = current - invested;
    res.json({
      summary: {
        invested: +invested.toFixed(2),
        currentValue: +current.toFixed(2),
        pnl: +pnl.toFixed(2),
        pnlPct: invested ? +((pnl / invested) * 100).toFixed(2) : 0,
        holdings: rows.rows.length,
      },
    });
  }),
);

const positionSchema = z.object({
  instrumentId: z.string().uuid(),
  status: z.enum(["holding", "sold", "watching_only"]).optional().default("holding"),
  quantity: z.number().positive(),
  buyPrice: z.number().positive(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fees: z.number().nonnegative().optional().default(0),
  thesisNotes: z.string().optional(),
  priceTarget: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  goalId: z.string().uuid().nullable().optional(),
});

// POST /api/portfolio
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = positionSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const d = parsed.data;
    const { rows } = await query<{ id: string }>(
      `INSERT INTO portfolio_positions (user_id, instrument_id, status, quantity, buy_price, buy_date, fees, thesis_notes, price_target, stop_loss, goal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [req.user!.id, d.instrumentId, d.status, d.quantity, d.buyPrice, d.buyDate, d.fees, d.thesisNotes ?? null, d.priceTarget ?? null, d.stopLoss ?? null, d.goalId ?? null],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

// PATCH /api/portfolio/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await query(`SELECT 1 FROM portfolio_positions WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    if (!existing.rows[0]) throw notFound("Position not found");

    const partial = positionSchema.partial().safeParse(req.body);
    if (!partial.success) throw badRequest(partial.error.issues[0].message);
    const d = partial.data;
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      instrumentId: "instrument_id", status: "status", quantity: "quantity", buyPrice: "buy_price", buyDate: "buy_date",
      fees: "fees", thesisNotes: "thesis_notes", priceTarget: "price_target", stopLoss: "stop_loss", goalId: "goal_id",
    };
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${map[k]} = $${params.length}`);
    }
    if (sets.length === 0) throw badRequest("Nothing to update");
    params.push(req.params.id, req.user!.id);
    await query(`UPDATE portfolio_positions SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length}`, params);
    res.json({ ok: true });
  }),
);

// DELETE /api/portfolio/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM portfolio_positions WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// Journal
const journalSchema = z.object({ entryText: z.string().min(1), entryType: z.string().optional() });

// GET /api/portfolio/journal
router.get(
  "/journal",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT ij.*, i.symbol, i.company_name FROM investment_journal ij
       LEFT JOIN portfolio_positions pp ON pp.id = ij.position_id
       LEFT JOIN instruments i ON i.id = pp.instrument_id
       WHERE ij.user_id = $1 ORDER BY ij.created_at DESC`,
      [req.user!.id],
    );
    res.json({ entries: rows.rows });
  }),
);

// POST /api/portfolio/:id/journal
router.post(
  "/:id/journal",
  asyncHandler(async (req, res) => {
    const parsed = journalSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { rows } = await query(
      `INSERT INTO investment_journal (user_id, position_id, entry_text, entry_type) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.user!.id, req.params.id, parsed.data.entryText, parsed.data.entryType ?? "review"],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

// GET /api/portfolio/allocation — sector + instrument-type mix
router.get(
  "/allocation",
  asyncHandler(async (req, res) => {
    const rows = await query<{ sector: string; instrument_type: string; value: number }>(
      `SELECT i.sector AS sector, i.instrument_type AS instrument_type, SUM(pp.quantity * COALESCE(pt.ltp, pp.buy_price)) AS value
       FROM portfolio_positions pp
       JOIN instruments i ON i.id = pp.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE pp.user_id = $1 AND pp.status = 'holding'
       GROUP BY i.sector, i.instrument_type`,
      [req.user!.id],
    );
    const bySector = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const r of rows.rows) {
      const v = Number(r.value) || 0;
      bySector.set(r.sector, (bySector.get(r.sector) || 0) + v);
      const t = r.instrument_type === "etf" ? "ETF" : "Stock";
      byType.set(t, (byType.get(t) || 0) + v);
    }
    const arr = (m: Map<string, number>) => [...m.entries()].map(([label, value]) => ({ label, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);
    res.json({ bySector: arr(bySector), byType: arr(byType) });
  }),
);

// Goals
const goalSchema = z.object({ name: z.string().min(1).max(60), targetAmount: z.number().nonnegative() });

// GET /api/portfolio/goals
router.get(
  "/goals",
  asyncHandler(async (req, res) => {
    const rows = await query<{ id: string; name: string; target_amount: number; current: number }>(
      `SELECT g.id, g.name, g.target_amount,
              COALESCE((SELECT SUM(pp.quantity * COALESCE(pt.ltp, pp.buy_price))
               FROM portfolio_positions pp
               LEFT JOIN price_ticks pt ON pt.instrument_id = pp.instrument_id
               WHERE pp.goal_id = g.id AND pp.status = 'holding'), 0) AS current
       FROM portfolio_goals g WHERE g.user_id = $1 ORDER BY g.created_at`,
      [req.user!.id],
    );
    const goals = rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      targetAmount: Number(r.target_amount),
      current: Number(r.current),
      progress: r.target_amount > 0 ? Math.min(100, +( (Number(r.current) / Number(r.target_amount)) * 100 ).toFixed(1)) : 0,
    }));
    res.json({ goals });
  }),
);

// POST /api/portfolio/goals
router.post(
  "/goals",
  asyncHandler(async (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO portfolio_goals (user_id, name, target_amount) VALUES ($1, $2, $3) RETURNING id`,
      [req.user!.id, parsed.data.name, parsed.data.targetAmount],
    );
    res.status(201).json({ id: rows[0].id });
  }),
);

// PATCH /api/portfolio/goals/:id
router.patch(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    const parsed = goalSchema.partial().safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.name !== undefined) { params.push(parsed.data.name); sets.push(`name = $${params.length}`); }
    if (parsed.data.targetAmount !== undefined) { params.push(parsed.data.targetAmount); sets.push(`target_amount = $${params.length}`); }
    if (sets.length) {
      params.push(req.params.id, req.user!.id);
      await query(`UPDATE portfolio_goals SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length}`, params);
    }
    res.json({ ok: true });
  }),
);

// DELETE /api/portfolio/goals/:id
router.delete(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    await query(`UPDATE portfolio_positions SET goal_id = NULL WHERE goal_id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    await query(`DELETE FROM portfolio_goals WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    res.json({ ok: true });
  }),
);

// GET /api/portfolio/calendar — daily P&L heatmap (last ~90 days)
router.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    const { getCandles } = await import("../services/candleService.js");
    const positions = await query<{ instrument_id: string; quantity: number; buy_price: number }>(
      `SELECT instrument_id, quantity, buy_price FROM portfolio_positions WHERE user_id = $1 AND status = 'holding'`,
      [req.user!.id],
    );
    const seriesByHolding: { qty: number; closes: number[]; dates: string[] }[] = [];
    for (const p of positions.rows) {
      const candles = await getCandles(p.instrument_id, "1d", 90);
      if (candles.length) {
        seriesByHolding.push({
          qty: Number(p.quantity),
          closes: candles.map((c) => c.close),
          dates: candles.map((c) => c.ts.slice(0, 10)),
        });
      }
    }
    // align on dates from the first holding
    const days: { date: string; pnl: number }[] = [];
    if (seriesByHolding.length) {
      const n = seriesByHolding[0].closes.length;
      for (let i = 1; i < n; i++) {
        let pnl = 0;
        for (const h of seriesByHolding) {
          if (i < h.closes.length) pnl += h.qty * (h.closes[i] - h.closes[i - 1]);
        }
        days.push({ date: seriesByHolding[0].dates[i], pnl: +pnl.toFixed(2) });
      }
    }
    res.json({ days });
  }),
);

export default router;
