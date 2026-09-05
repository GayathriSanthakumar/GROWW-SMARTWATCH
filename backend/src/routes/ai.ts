import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import {
  detectIntent,
  fetchInstrumentCtx,
  resolveInstrumentFromText,
  resolveInstrumentsFromText,
  answerQuestion,
  compare,
  summarize,
  type KnowledgeLevel,
} from "../services/aiAnalyst.js";
import { getCandles, type CandleInterval } from "../services/candleService.js";
import { getMarketStatus } from "../services/marketStatus.js";
import { answerScreenQuery } from "../services/aiScreener.js";

const router = Router();
router.use(requireAuth);

const chatSchema = z.object({
  message: z.string().min(1).max(3000),
  instrumentId: z.string().uuid().optional().nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().default("beginner"),
  context: z
    .object({
      symbol: z.string().optional(),
      exchange: z.string().optional(),
      timeframe: z.string().optional(),
    })
    .optional(),
});

// POST /api/ai/chat — unified, data-grounded analyst + education assistant
router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { message, instrumentId, experienceLevel, context } = parsed.data;
    // Allow natural-language level overrides.
    let level: KnowledgeLevel = experienceLevel ?? "beginner";
    const ml = message.toLowerCase();
    if (/\b(like a beginner|from scratch|for a beginner|i am new|i'm new)\b/.test(ml)) level = "beginner";
    else if (/\b(professionally|advanced|expert|multi.timeframe)\b/.test(ml)) level = "advanced";
    else if (/\b(intermediate)\b/.test(ml)) level = "intermediate";
    const marketStatus = getMarketStatus();

    // Two-stock comparison (e.g. "Compare TCS and Infosys")
    if (detectIntent(message) === "COMPARE_STOCKS") {
      const resolved = await resolveInstrumentsFromText(message, 2);
      if (resolved.length >= 2) {
        const response = compare(resolved[0].ctx, resolved[1].ctx);
        await query(
          `INSERT INTO ai_conversations (user_id, role, content, intent) VALUES ($1, 'user', $2, 'COMPARE_STOCKS'), ($1, 'assistant', $3, 'COMPARE_STOCKS')`,
          [req.user!.id, message, response],
        );
        res.json({ response, intent: "COMPARE_STOCKS", learnTopic: null, instrumentId: null, disclaimer: "Educational research tool — not financial advice." });
        return;
      }
    }

    // Natural-language screener: "stocks with PE below 20 and ROE above 15"
    if (detectIntent(message) === "SCREEN") {
      const screen = await answerScreenQuery(message);
      const chipLine = screen.chips.length ? screen.chips.map((c) => `[${c}]`).join(" ") : "_(no explicit filters — see note)_";
      let response: string;
      if (screen.kind === "unsupported") {
        response = `### Screener\n\n${screen.clarify ?? screen.headline}`;
      } else if (screen.kind === "clarify") {
        response = `### Screener — one clarification needed\n\n${screen.clarify}`;
      } else {
        const lines = screen.rows
          .map(
            (r, i) =>
              `${i + 1}. **${r.symbol}** — ${r.companyName} · ${r.sector} · ₹${r.ltp.toFixed(2)} (${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%) · PE ${r.pe ?? "—"} · ROE ${r.roe ?? "—"} · Div ${r.dividendYield ?? "—"} · Opp ${r.opportunity ?? "—"} · ${r.verdict ?? "—"}`,
          )
          .join("\n");
        response = `### Screener results\n\nParsed filters: ${chipLine}\n\n${screen.headline}\n\n${lines}`;
      }
      await query(
        `INSERT INTO ai_conversations (user_id, role, content, intent) VALUES ($1, 'user', $2, 'SCREEN'), ($1, 'assistant', $3, 'SCREEN')`,
        [req.user!.id, message, response],
      );
      res.json({ response, intent: "SCREEN", learnTopic: null, instrumentId: null, disclaimer: "Educational research tool — not financial advice." });
      return;
    }

    // Resolve the company: explicit id → context symbol → message text.
    let ctx = instrumentId ? await fetchInstrumentCtx(instrumentId) : null;
    let resolvedId: string | null = instrumentId ?? null;

    if (!ctx && context?.symbol) {
      const rows = await query<{ id: string }>(`SELECT id FROM instruments WHERE symbol = $1 LIMIT 1`, [context.symbol]);
      if (rows.rows[0]) {
        ctx = await fetchInstrumentCtx(rows.rows[0].id);
        resolvedId = rows.rows[0].id;
      }
    }
    if (!ctx) {
      const resolved = await resolveInstrumentFromText(message);
      if (resolved) {
        ctx = resolved.ctx;
        resolvedId = resolved.id;
      }
    }

    // Multi-turn follow-ups ("and what about its debt?", "how are its margins?"):
    // if the current message doesn't name a company but clearly continues the
    // conversation, carry over the instrument the user was last discussing.
    const intent = detectIntent(message);
    const ml2 = message.toLowerCase();
    const definitional = /\b(what is|what are|what does|explain|define|meaning of|how does)\b/.test(ml2);
    const followUp = /\b(it|its|it's|their|this stock|this one|that stock|what about|how about|and|also|then)\b/.test(ml2);
    const needsCompany = ["FUNDAMENTALS", "VALUATION", "GROWTH", "DIVIDEND", "NEWS", "RISK", "HISTORY", "FORECAST", "ANALYZE", "BUY_SELL", "SUPPORT_RESISTANCE", "WHY_CHANGED", "GENERAL"].includes(intent);
    if (!ctx && needsCompany && followUp && !definitional && message.length < 160) {
      const recent = await query<{ instrument_id: string }>(
        `SELECT instrument_id FROM ai_conversations
         WHERE user_id = $1 AND instrument_id IS NOT NULL AND created_at > now() - interval '2 days'
         ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id],
      );
      if (recent.rows[0]) {
        const follow = await fetchInstrumentCtx(recent.rows[0].instrument_id);
        if (follow) {
          ctx = follow;
          resolvedId = recent.rows[0].instrument_id;
        }
      }
    }

    // Fetch chart data for grounding.
    let candles: import("../services/aiAnalyst.js").Candle[] = [];
    if (resolvedId) {
      const timeframe = (context?.timeframe || "1d") as CandleInterval;
      candles = await getCandles(resolvedId, timeframe, 60).catch(() => []);
    }

    // Fetch recent headlines for the NEWS intent.
    const news = resolvedId
      ? (
          await query<{ headline: string; source: string | null; sentiment: string | null; published_at: Date }>(
            `SELECT headline, source, sentiment, published_at FROM news_items WHERE instrument_id = $1 ORDER BY published_at DESC LIMIT 5`,
            [resolvedId],
          )
        ).rows.map((n) => ({ headline: n.headline, source: n.source, sentiment: n.sentiment, publishedAt: n.published_at ? new Date(n.published_at).toISOString() : null }))
      : [];

    const result = answerQuestion(message, level, ctx, candles, marketStatus, news);

    await query(
      `INSERT INTO ai_conversations (user_id, instrument_id, role, content, intent) VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $4)`,
      [req.user!.id, resolvedId, message, result.intent, result.response],
    );

    res.json({
      response: result.response,
      intent: result.intent,
      learnTopic: result.learnTopic ?? null,
      instrumentId: resolvedId,
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

// GET /api/ai/context/:instrumentId — structured context for the frontend
router.get(
  "/context/:instrumentId",
  asyncHandler(async (req, res) => {
    const ctx = await fetchInstrumentCtx(req.params.instrumentId);
    if (!ctx) throw badRequest("Instrument not found");
    res.json({ context: ctx });
  }),
);

export default router;
