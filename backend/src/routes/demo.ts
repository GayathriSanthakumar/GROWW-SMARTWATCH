import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { signAccessToken, signRefreshToken, hashToken, randomToken } from "../lib/jwt.js";
import { setAuthCookies } from "../lib/cookies.js";
import { badRequest } from "../lib/errors.js";
import { detectChangesForUser } from "../services/changeDetector.js";

const router = Router();

const SCENARIOS = [
  { id: "price_spike", name: "Sudden price spike", description: "TATAMOTORS jumps 6% on volume in seconds" },
  { id: "price_drop", name: "Sharp drop", description: "HDFCBANK slides 4% — triggers a price-movement alert" },
  { id: "volume_surge", name: "Volume surge", description: "Unusual volume on ITC detected against your last-seen baseline" },
  { id: "attention_alert", name: "Attention spike", description: "RELIANCE attention score hits the Significant band" },
  { id: "stale_data", name: "Stale data", description: "A quote stops updating — shows the STALE status badge" },
  { id: "conflict_data", name: "Data conflict", description: "Two sources disagree — shows the CONFLICT badge" },
];

// GET /api/demo/status
router.get("/status", asyncHandler(async (_req, res) => {
  res.json({ scenarios: SCENARIOS });
}));

// POST /api/demo/enter — log into the seeded demo account
router.post("/enter", asyncHandler(async (req, res) => {
  const rows = await query<{ id: string; email: string; full_name: string; is_demo_account: boolean; knowledge_level: string }>(
    `SELECT id, email, full_name, is_demo_account, knowledge_level FROM users WHERE is_demo_account = true AND deleted_at IS NULL LIMIT 1`,
  );
  const demo = rows.rows[0];
  if (!demo) throw badRequest("No demo account seeded. Run `npm run db:seed`.");

  const access = signAccessToken({ sub: demo.id, email: demo.email, isDemo: true });
  const refresh = signRefreshToken({ sub: demo.id, jti: randomToken() });
  await query(`INSERT INTO refresh_tokens (user_id, token_hash, device_label, expires_at) VALUES ($1, $2, 'demo', now() + interval '30 days')`, [demo.id, hashToken(refresh)]);

  setAuthCookies(res, access, refresh);
  res.json({ user: { id: demo.id, email: demo.email, fullName: demo.full_name, authProvider: "email", isDemo: true, knowledgeLevel: demo.knowledge_level } });
}));

// POST /api/demo/trigger { scenarioId }
router.post("/trigger", asyncHandler(async (req, res) => {
  const scenarioId = String(req.body?.scenarioId || "");
  const map: Record<string, { symbol: string; factor: number; volumeFactor: number; status?: string }> = {
    price_spike: { symbol: "TATAMOTORS", factor: 1.06, volumeFactor: 2.5 },
    price_drop: { symbol: "HDFCBANK", factor: 0.96, volumeFactor: 1.8 },
    volume_surge: { symbol: "ITC", factor: 1.01, volumeFactor: 3.0 },
    attention_alert: { symbol: "RELIANCE", factor: 1.03, volumeFactor: 2.2 },
    stale_data: { symbol: "TCS", factor: 1.0, volumeFactor: 1.0, status: "STALE" },
    conflict_data: { symbol: "INFY", factor: 1.0, volumeFactor: 1.0, status: "CONFLICT" },
  };
  const spec = map[scenarioId];
  if (!spec) throw badRequest("Unknown scenario");

  await query(
    `UPDATE price_ticks SET ltp = ltp * $1, volume = (volume * $2::numeric)::bigint, data_status = COALESCE($3, data_status), updated_at = now()
     WHERE instrument_id = (SELECT id FROM instruments WHERE symbol = $4)`,
    [spec.factor, spec.volumeFactor, spec.status ?? null, spec.symbol],
  );

  // refresh change detection for demo user so the event surfaces immediately
  const demo = await query<{ id: string }>(`SELECT id FROM users WHERE is_demo_account = true LIMIT 1`);
  if (demo.rows[0]) await detectChangesForUser(demo.rows[0].id);

  res.json({ ok: true, scenario: spec });
}));

// POST /api/demo/reset — restore original seeded prices
router.post("/reset", asyncHandler(async (_req, res) => {
  // Simplest robust reset: recompute ticks from the 1d candles' most recent close.
  await query(
    `UPDATE price_ticks pt SET
       ltp = c.close,
       prev_close = c2.close,
       volume = pt.avg_volume_20d,
       data_status = 'LIVE',
       updated_at = now()
     FROM price_candles c
     LEFT JOIN price_candles c2 ON c2.instrument_id = c.instrument_id AND c2.interval = '1d' AND c2.ts = (SELECT MAX(ts) FROM price_candles WHERE instrument_id = c.instrument_id AND interval = '1d' AND ts < c.ts)
     WHERE c.instrument_id = pt.instrument_id AND c.interval = '1d'
       AND c.ts = (SELECT MAX(ts) FROM price_candles WHERE instrument_id = c.instrument_id AND interval = '1d')`,
  );
  res.json({ ok: true });
}));

export default router;
