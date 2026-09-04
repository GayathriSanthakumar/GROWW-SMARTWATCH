import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import {
  detectIntent,
  fetchInstrumentCtx,
  summarize,
  whyChanged,
  explainVerdict,
  explainScore,
  compare,
  generalResponse,
  historicalResponse,
  forecastResponse,
  resolveInstrumentFromText,
} from "../services/aiAnalyst.js";

const router = Router();
router.use(requireAuth);

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  instrumentId: z.string().uuid().optional().nullable(),
});

// POST /api/ai/chat
router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { message, instrumentId } = parsed.data;

    // Resolve the company either from the explicit id or from the message text,
    // so "analyze TCS" works without manually attaching a stock.
    let ctx = instrumentId ? await fetchInstrumentCtx(instrumentId) : null;
    let resolvedId = instrumentId ?? null;
    if (!ctx) {
      const resolved = await resolveInstrumentFromText(message);
      if (resolved) {
        ctx = resolved.ctx;
        resolvedId = resolved.id;
      }
    }

    const intent = detectIntent(message);
    let content: string;

    if (intent === "COMPARE_STOCKS" && !ctx) {
      content = "To compare stocks, open one of the two stocks and ask to compare, or mention two symbols.";
    } else if (ctx) {
      content =
        intent === "WHY_CHANGED" ? whyChanged(ctx) :
        intent === "VERDICT" ? explainVerdict(ctx) :
        intent === "EXPLAIN_SCORE" ? explainScore(ctx) :
        intent === "HISTORY" ? historicalResponse(ctx) :
        intent === "FORECAST" ? forecastResponse(ctx) :
        intent === "SUMMARY" ? summarize(ctx) :
        generalResponse(ctx, message);
    } else {
      content = "I couldn't find that company. Ask about a seeded symbol (e.g. TCS, RELIANCE, INFY, HDFCBANK, ITC) or attach a stock from its panel.";
    }

    await query(
      `INSERT INTO ai_conversations (user_id, instrument_id, role, content, intent) VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $4)`,
      [req.user!.id, resolvedId, message, intent, content],
    );

    res.json({
      response: content,
      intent,
      disclaimer: "Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.",
    });
  }),
);

// GET /api/ai/conversation?instrumentId=
router.get(
  "/conversation",
  asyncHandler(async (req, res) => {
    const instrumentId = (req.query.instrumentId as string) || null;
    const rows = await query(
      `SELECT role, content, intent, created_at FROM ai_conversations
       WHERE user_id = $1 AND (($2::uuid IS NULL AND instrument_id IS NULL) OR instrument_id = $2)
       ORDER BY created_at ASC LIMIT 100`,
      [req.user!.id, instrumentId],
    );
    res.json({ messages: rows.rows });
  }),
);

// GET /api/ai/summary/:instrumentId — AI company summary card
router.get(
  "/summary/:instrumentId",
  asyncHandler(async (req, res) => {
    const ctx = await fetchInstrumentCtx(req.params.instrumentId);
    if (!ctx) throw badRequest("Instrument not found");
    res.json({ summary: summarize(ctx) });
  }),
);

// POST /api/ai/compare  { a: instrumentId, b: instrumentId }
router.post(
  "/compare",
  asyncHandler(async (req, res) => {
    const { a, b } = req.body ?? {};
    if (!a || !b) throw badRequest("a and b instrument ids required");
    const ca = await fetchInstrumentCtx(a);
    const cb = await fetchInstrumentCtx(b);
    if (!ca || !cb) throw badRequest("One or both instruments not found");
    res.json({ comparison: compare(ca, cb) });
  }),
);

export default router;
