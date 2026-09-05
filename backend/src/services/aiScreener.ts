import { query } from "../db/pool.js";

// Screener AI: parses plain-English screening requests into concrete DB filters,
// runs them live, and returns sortable results (not prose). The parsed filters
// are returned as "chips" so the UI can show/let users correct what was parsed.

export interface ScreenResult {
  kind: "results" | "clarify" | "unsupported";
  chips: string[];
  headline: string;
  rows: { symbol: string; companyName: string; sector: string; ltp: number; changePct: number; pe: number | null; roe: number | null; dividendYield: number | null; opportunity: number | null; risk: number | null; verdict: string | null }[];
  clarify?: string;
}

const SECTORS: [string, string][] = [
  ["it", "IT"], ["tech", "IT"], ["bank", "Banking"], ["banking", "Banking"],
  ["pharma", "Pharma"], ["fmcg", "FMCG"], ["auto", "Auto"], ["energy", "Energy"], ["oil", "Energy"],
  ["metal", "Metals"], ["steel", "Metals"], ["power", "Power"], ["cement", "Cement"],
  ["consumer", "Consumer"], ["telecom", "Telecom"], ["infra", "Infrastructure"], ["conglomerate", "Conglomerate"], ["nbcf", "NBFC"], ["nbfc", "NBFC"], ["finance", "NBFC"],
];
const COMPARE = (m: string) => {
  if (/\b(less than|under|below|max|at most|<)\b/.test(m)) return "lt";
  if (/\b(more than|greater than|above|over|min|at least|>)\b/.test(m)) return "gt";
  return null;
};

export async function answerScreenQuery(raw: string): Promise<ScreenResult> {
  const m = raw.toLowerCase();
  const chips: string[] = [];
  const where: string[] = ["i.is_active = true"];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const addNum = (col: string, op: "lt" | "gt", val: number) => {
    chips.push(`${colLabel(col)} ${op === "lt" ? "<" : ">"} ${val}${col.includes("dividend") || col.includes("margin") || col.includes("growth") ? "%" : ""}`);
    where.push(`${col} ${op === "lt" ? "<=" : ">="} ${add(val)}`);
  };

  // Sector
  for (const [k, s] of SECTORS) if (new RegExp(`\\b${k}\\b`).test(m)) { where.push(`i.sector = ${add(s)}`); chips.push(`Sector: ${s}`); }
  // Valuation / quality statuses & verdicts
  if (/\bundervalued\b/.test(m)) { where.push(`sc.fair_value_status = ${add("undervalued")}`); chips.push("Fair value: undervalued"); }
  if (/\bovervalued\b/.test(m)) { where.push(`sc.fair_value_status = ${add("overvalued")}`); chips.push("Fair value: overvalued"); }
  if (/\bbuy\b/.test(m) && !/\bshould\b/.test(m)) { where.push(`sc.ai_verdict = ${add("BUY_LEAN")}`); chips.push("AI verdict: buy-lean"); }
  if (/\b(high opp|opportunity.*(above|over|high)|good opportunity)\b/.test(m)) { where.push(`sc.opportunity_score >= ${add(70)}`); chips.push("Opportunity ≥ 70"); }
  if (/\b(low risk|risk.*(below|under|low))\b/.test(m)) { where.push(`sc.risk_score <= ${add(40)}`); chips.push("Risk ≤ 40"); }

  // Numeric metrics: "pe below 20", "roe above 15", "dividend yield > 3%", ...
  const metrics: { re: RegExp; col: string; label: string; isPct: boolean }[] = [
    { re: /\b(?:pe|p\/e)\b/, col: "fs.pe_ratio", label: "PE", isPct: false },
    { re: /\broe\b/, col: "fs.roe_pct", label: "ROE", isPct: false },
    { re: /\bdividend yield\b/, col: "fs.dividend_yield_pct", label: "Dividend yield", isPct: true },
    { re: /\bdebt\s*to\s*equity|\bd\/e\b/, col: "fs.debt_to_equity", label: "D/E", isPct: false },
    { re: /\bearnings growth\b/, col: "fs.earnings_growth_yoy_pct", label: "Earnings growth", isPct: true },
    { re: /\brevenue growth\b/, col: "fs.revenue_growth_yoy_pct", label: "Revenue growth", isPct: true },
  ];
  for (const item of metrics) {
    if (!item.re.test(m)) continue;
    // Find the number near the metric word, not an unrelated count earlier in
    // the sentence ("top 10 stocks with PE below 20" must read 20, not 10).
    const at = m.search(item.re);
    const window = m.slice(Math.max(0, at - 6), at + 24);
    const numMatch = window.match(/\d+(?:\.\d+)?/);
    const val = numMatch ? parseFloat(numMatch[0]) : NaN;
    const cmp = COMPARE(m);
    if (!Number.isFinite(val) || !cmp) continue;
    addNum(item.col, cmp, val);
  }

  // 52-week proximity phrases need candle/range data — we surface a note instead.
  const clarify =
    /(large cap|large-cap|mid cap|mid-cap|small cap|small-cap)/.test(m) && chips.length === 0
      ? "For market-cap tiers I use SEBI ranges (large ≈ top 100, mid ≈ 101–250, small ≈ rest). Which tier, and any metric filter?"
      : undefined;

  if (where.length === 1 && !clarify) {
    return { kind: "unsupported", chips: [], headline: "I couldn't turn that into screener filters.", rows: [], clarify: "Try e.g. \"stocks with PE below 20\", \"IT stocks with dividend yield above 2%\", or \"undervalued stocks with opportunity above 70\"." };
  }
  if (where.length === 1 && clarify) {
    return { kind: "clarify", chips, headline: "Need one detail", rows: [], clarify };
  }

  const order = chips.some((c) => c.startsWith("PE") || c.startsWith("ROE") || c.startsWith("Dividend")) ? "ltp" : "opportunity";
  const orderSql = order === "ltp" ? "pt.ltp" : "sc.opportunity_score";
  const rows = await query(
    `SELECT i.symbol, i.company_name AS "companyName", i.sector, pt.ltp, pt.prev_close, fs.pe_ratio, fs.roe_pct, fs.dividend_yield_pct,
            sc.opportunity_score, sc.risk_score, sc.ai_verdict
     FROM instruments i
     JOIN price_ticks pt ON pt.instrument_id = i.id
     LEFT JOIN fundamentals_snapshot fs ON fs.instrument_id = i.id AND fs.as_of_date = (SELECT MAX(as_of_date) FROM fundamentals_snapshot WHERE instrument_id = i.id)
     LEFT JOIN instrument_scores sc ON sc.instrument_id = i.id
     WHERE ${where.join(" AND ")}
     ORDER BY ${orderSql} DESC NULLS LAST LIMIT 8`,
    params,
  );
  const mapped = rows.rows.map((r) => ({
    symbol: r.symbol, companyName: r.companyName, sector: r.sector,
    ltp: Number(r.ltp), changePct: Number(r.prev_close) ? ((Number(r.ltp) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0,
    pe: r.pe_ratio == null ? null : Number(r.pe_ratio), roe: r.roe_pct == null ? null : Number(r.roe_pct),
    dividendYield: r.dividend_yield_pct == null ? null : Number(r.dividend_yield_pct),
    opportunity: r.opportunity_score == null ? null : Number(r.opportunity_score),
    risk: r.risk_score == null ? null : Number(r.risk_score), verdict: r.ai_verdict,
  }));
  const headline =
    mapped.length === 0
      ? "No stocks matched those filters — try loosening them."
      : `Found ${mapped.length} matching stock${mapped.length === 1 ? "" : "s"} (top results, live data).`;
  return { kind: "results", chips, headline, rows: mapped };
}

function colLabel(col: string): string {
  return { "fs.pe_ratio": "PE", "fs.roe_pct": "ROE", "fs.dividend_yield_pct": "Dividend yield", "fs.debt_to_equity": "D/E", "fs.earnings_growth_yoy_pct": "Earnings growth", "fs.revenue_growth_yoy_pct": "Revenue growth" }[col] || col;
}
