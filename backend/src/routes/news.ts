import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import { sendEmail, smtpConfigured } from "../services/emailService.js";

const router = Router();
router.use(requireAuth);

// GET /api/news/subscription
router.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT email, enabled, frequency, last_sent_at FROM news_subscriptions WHERE user_id = $1`,
      [req.user!.id],
    );
    res.json({
      subscription: rows.rows[0] ?? { email: req.user!.email, enabled: false, frequency: "daily", last_sent_at: null },
      smtpConfigured: smtpConfigured(),
    });
  }),
);

const subSchema = z.object({
  email: z.string().email(),
  enabled: z.boolean(),
  frequency: z.enum(["daily", "weekly"]).optional().default("daily"),
});

// PUT /api/news/subscription
router.put(
  "/subscription",
  asyncHandler(async (req, res) => {
    const parsed = subSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    const { email, enabled, frequency } = parsed.data;
    await query(
      `INSERT INTO news_subscriptions (user_id, email, enabled, frequency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, enabled = EXCLUDED.enabled, frequency = EXCLUDED.frequency`,
      [req.user!.id, email, enabled, frequency],
    );
    res.json({ ok: true });
  }),
);

// POST /api/news/send-digest — compile and email today's news
router.post(
  "/send-digest",
  asyncHandler(async (req, res) => {
    const sub = await query<{ email: string; enabled: boolean }>(
      `SELECT email, enabled FROM news_subscriptions WHERE user_id = $1`,
      [req.user!.id],
    );
    const email = sub.rows[0]?.email ?? req.user!.email;

    const digest = await buildDigest(req.user!.id);

    const result = await sendEmail(email, `SMARTWATCH market news — ${new Date().toLocaleDateString("en-IN")}`, digest.html);

    await query(
      `INSERT INTO email_digests (user_id, subject, body_html, status, sent_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user!.id, `SMARTWATCH market news`, digest.html, result.mode === "sent" ? "sent" : "preview", result.sent ? new Date() : null],
    );

    res.json({ ok: true, ...result, preview: result.sent ? undefined : digest.text, count: digest.count });
  }),
);

// GET /api/news/items — curated news for the user's watchlist + market
router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const digest = await buildDigest(req.user!.id);
    res.json({ items: digest.items, text: digest.text });
  }),
);

async function buildDigest(userId: string) {
  // news for instruments the user tracks
  const tracked = await query<{ symbol: string; company_name: string; headline: string; source: string; sentiment: string; published_at: string }>(
    `SELECT i.symbol, i.company_name, n.headline, n.source, n.sentiment, n.published_at
     FROM news_items n
     JOIN instruments i ON i.id = n.instrument_id
     WHERE n.instrument_id IN (
       SELECT wi.instrument_id FROM watchlist_items wi
       JOIN watchlists wl ON wl.id = wi.watchlist_id
       WHERE wl.user_id = $1
     )
     ORDER BY n.published_at DESC LIMIT 12`,
    [userId],
  );

  // top market movers
  const movers = await query<{ symbol: string; company_name: string; change_pct: number }>(
    `SELECT i.symbol, i.company_name, ((pt.ltp - pt.prev_close)/NULLIF(pt.prev_close,0)*100)::float8 AS change_pct
     FROM price_ticks pt JOIN instruments i ON i.id = pt.instrument_id
     WHERE i.is_active = true
     ORDER BY change_pct DESC LIMIT 5`,
  );

  const items = tracked.rows.map((r) => ({
    symbol: r.symbol,
    companyName: r.company_name,
    headline: r.headline,
    source: r.source,
    sentiment: r.sentiment,
    publishedAt: r.published_at,
  }));

  const rows = items
    .map((n) => `<li><strong>${n.symbol}</strong> — ${n.headline} <span style="color:#888">(${n.source})</span></li>`)
    .join("");
  const moversHtml = movers.rows
    .map((m) => `<li><strong>${m.symbol}</strong> ${m.change_pct >= 0 ? "+" : ""}${m.change_pct.toFixed(2)}%</li>`)
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;color:#111">
      <h2>SMARTWATCH Daily Brief</h2>
      <p><em>Educational research tool — not financial advice.</em></p>
      <h3>News for your watchlist</h3>
      ${items.length ? `<ul>${rows}</ul>` : "<p>No tracked-company news today.</p>"}
      <h3>Today's top movers</h3>
      <ul>${moversHtml}</ul>
    </div>`;

  const text = items
    .map((n) => `${n.symbol}: ${n.headline} (${n.source})`)
    .concat(movers.rows.map((m) => `${m.symbol} ${m.change_pct >= 0 ? "+" : ""}${m.change_pct.toFixed(2)}%`))
    .join("\n");

  return { items, html, text, count: items.length };
}

export default router;
