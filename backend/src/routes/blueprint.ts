import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";

const router = Router();
router.use(requireAuth);

interface Alloc {
  label: string;
  pct: number;
  sectors: string[];
}

function suggestedAllocation(riskAppetite: string, goals: string[]): Alloc[] {
  const income = goals.includes("build_dividend_income");
  const growth = goals.includes("find_growth") || goals.includes("follow_smart_money");
  if (income && riskAppetite === "conservative") {
    return [
      { label: "Large-cap / dividend", pct: 55, sectors: ["FMCG", "Power", "Energy"] },
      { label: "Mid-cap growth", pct: 20, sectors: ["Auto", "Metals"] },
      { label: "Debt / cash equivalents", pct: 25, sectors: [] },
    ];
  }
  if (growth && riskAppetite === "aggressive") {
    return [
      { label: "Large-cap core", pct: 40, sectors: ["Banking", "IT", "Energy"] },
      { label: "Mid/small-cap growth", pct: 40, sectors: ["Auto", "Metals", "Cement", "NBFC"] },
      { label: "Dividend / defensive", pct: 20, sectors: ["FMCG", "Power"] },
    ];
  }
  return [
    { label: "Large-cap core", pct: 60, sectors: ["Banking", "IT", "Energy", "FMCG"] },
    { label: "Mid-cap growth", pct: 25, sectors: ["Auto", "Metals", "Cement"] },
    { label: "Dividend income", pct: 15, sectors: ["Power", "Energy"] },
  ];
}

// GET /api/blueprint
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await query<{ onboarding_goals: string[]; risk_appetite: string; knowledge_level: string }>(
      `SELECT onboarding_goals, risk_appetite, knowledge_level FROM users WHERE id = $1`,
      [req.user!.id],
    );
    const u = user.rows[0];
    const goals = u.onboarding_goals || [];
    const risk = u.risk_appetite || "moderate";

    const alloc = suggestedAllocation(risk, goals);

    const positions = await query<{ sector: string; current: number }>(
      `SELECT i.sector AS sector, SUM(pp.quantity * COALESCE(pt.ltp, pp.buy_price)) AS current
       FROM portfolio_positions pp
       JOIN instruments i ON i.id = pp.instrument_id
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       WHERE pp.user_id = $1 AND pp.status = 'holding'
       GROUP BY i.sector`,
      [req.user!.id],
    );

    const total = positions.rows.reduce((s, r) => s + Number(r.current), 0);
    const sectorWeights = new Map<string, number>();
    for (const p of positions.rows) {
      if (total > 0) sectorWeights.set(p.sector, (Number(p.current) / total) * 100);
    }

    // gap analysis: map suggested sector groups to actual weights
    const gaps = alloc.map((a) => {
      const actual = a.sectors.reduce((s, sec) => s + (sectorWeights.get(sec) || 0), 0);
      return { label: a.label, suggested: a.pct, actual: +actual.toFixed(1), delta: +(actual - a.pct).toFixed(1) };
    });

    const checklist: string[] = [];
    for (const g of gaps) {
      if (g.delta > 10) checklist.push(`Diversify out of ${g.label} — you're ${g.delta.toFixed(0)}pt overweight (${g.actual}% vs suggested ${g.suggested}%).`);
      else if (g.delta < -10) checklist.push(`Add exposure to ${g.label} — you're ${Math.abs(g.delta).toFixed(0)}pt underweight (${g.actual}% vs suggested ${g.suggested}%).`);
    }

    // high-risk holdings in portfolio
    const risky = await query<{ symbol: string; risk: number }>(
      `SELECT i.symbol, sc.risk_score AS risk FROM portfolio_positions pp
       JOIN instruments i ON i.id = pp.instrument_id
       JOIN instrument_scores sc ON sc.instrument_id = i.id
       WHERE pp.user_id = $1 AND pp.status = 'holding' AND sc.risk_score >= 60
       ORDER BY sc.risk_score DESC LIMIT 3`,
      [req.user!.id],
    );
    for (const r of risky.rows) checklist.push(`Review ${r.symbol} — Risk Score rose to ${r.risk}.`);

    if (checklist.length === 0) checklist.push("Your portfolio is broadly aligned with your goals. Keep tracking and reviewing.");

    res.json({
      blueprint: {
        goals,
        riskAppetite: risk,
        knowledgeLevel: u.knowledge_level,
        allocation: alloc,
        gaps,
        checklist,
        disclaimer: "Illustrative and educational only — not financial advice. SMARTWATCH does not execute trades.",
      },
    });
  }),
);

const quizSchema = z.object({ riskAppetite: z.enum(["conservative", "moderate", "aggressive"]) });

// POST /api/blueprint/risk-quiz
router.post(
  "/risk-quiz",
  asyncHandler(async (req, res) => {
    const parsed = quizSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
    await query(`UPDATE users SET risk_appetite = $1, updated_at = now() WHERE id = $2`, [parsed.data.riskAppetite, req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
