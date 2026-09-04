import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { query } from "../db/pool.js";
import { optionalAuth } from "../middleware/auth.js";
import { INSTRUMENT_SELECT, mapInstrumentRow } from "./instruments.js";

const router = Router();
router.use(optionalAuth);

// GET /api/screener — flexible filter builder
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where: string[] = ["i.is_active = true"];
    const params: unknown[] = [];
    const add = (val: unknown) => {
      params.push(val);
      return `$${params.length}`;
    };

    if (q.q) where.push(`(i.symbol ILIKE ${add(`%${q.q}%`)} OR i.company_name ILIKE ${add(`%${q.q}%`)})`);
    if (q.type) where.push(`i.instrument_type = ${add(q.type)}`);
    if (q.sectors) {
      const sectors = q.sectors.split(",").filter(Boolean);
      where.push(`i.sector = ANY(${add(sectors)})`);
    }
    if (q.aiVerdict) where.push(`sc.ai_verdict = ${add(q.aiVerdict)}`);
    if (q.fairValueStatus) where.push(`sc.fair_value_status = ${add(q.fairValueStatus)}`);
    if (q.sharia) where.push(`fs.sharia_status = ${add(q.sharia)}`);

    const ranges: [string, string, string][] = [
      ["sc.opportunity_score", "minOpportunity", "maxOpportunity"],
      ["sc.risk_score", "minRisk", "maxRisk"],
      ["sc.alpha_growth_score", "minAlpha", "maxAlpha"],
      ["sc.smart_money_score", "minSmartMoney", "maxSmartMoney"],
      ["sc.financial_strength_score", "minFinancialStrength", "maxFinancialStrength"],
      ["fs.pe_ratio", "minPe", "maxPe"],
      ["fs.dividend_yield_pct", "minDividendYield", "maxDividendYield"],
    ];
    for (const [col, minK, maxK] of ranges) {
      if (q[minK] !== undefined) where.push(`${col} >= ${add(Number(q[minK]))}`);
      if (q[maxK] !== undefined) where.push(`${col} <= ${add(Number(q[maxK]))}`);
    }

    const sortCols: Record<string, string> = {
      opportunity: "sc.opportunity_score",
      risk: "sc.risk_score",
      alpha: "sc.alpha_growth_score",
      smartMoney: "sc.smart_money_score",
      financialStrength: "sc.financial_strength_score",
      changePct: "((pt.ltp - pt.prev_close)/NULLIF(pt.prev_close,0))",
      marketCap: "fs.market_cap",
      dividendYield: "fs.dividend_yield_pct",
      symbol: "i.symbol",
    };
    const sort = sortCols[q.sort || "opportunity"] || sortCols.opportunity;
    const order = (q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const limit = Math.min(Number(q.limit) || 50, 200);
    const offset = Number(q.offset) || 0;

    const rows = await query(
      `SELECT ${INSTRUMENT_SELECT}
       FROM instruments i
       LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
       LEFT JOIN fundamentals_snapshot fs ON fs.instrument_id = i.id AND fs.as_of_date = (SELECT MAX(as_of_date) FROM fundamentals_snapshot WHERE instrument_id = i.id)
       LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
       WHERE ${where.join(" AND ")}
       ORDER BY ${sort} ${order} NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json({ results: rows.rows.map((r) => mapInstrumentRow(r as Record<string, unknown>)) });
  }),
);

// GET /api/screener/presets
router.get(
  "/presets",
  asyncHandler(async (_req, res) => {
    res.json({
      presets: [
        { id: "alpha_leaders", name: "Alpha Growth Leaders", params: { sort: "alpha", order: "desc" } },
        { id: "emerging_winners", name: "Emerging Winners", params: { minSmartMoney: 60, minOpportunity: 60, sort: "opportunity" } },
        { id: "safe_bets", name: "Safe Bets", params: { maxRisk: 40, minFinancialStrength: 60, sort: "risk", order: "asc" } },
        { id: "dividend_kings", name: "Dividend Kings", params: { minDividendYield: 2.5, sort: "dividendYield" } },
        { id: "undervalued", name: "Undervalued Gems", params: { fairValueStatus: "undervalued", sort: "opportunity" } },
        { id: "sharia_compliant", name: "Sharia Compliant", params: { sharia: "compliant", sort: "opportunity" } },
        { id: "low_expense_etf", name: "Lowest Expense Ratio ETF", params: { type: "etf", sort: "opportunity" } },
      ],
    });
  }),
);

export default router;
