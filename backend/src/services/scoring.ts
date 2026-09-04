// Deterministic scoring engine. Pure functions so both the seeder and the
// background worker can share identical logic without side effects.

export interface ScoreInput {
  revenueGrowthYoY: number;
  earningsGrowthYoY: number;
  pe: number;
  pb: number;
  peg: number;
  debtToEquity: number;
  currentRatio: number;
  roe: number;
  operatingMargin: number;
  fcf: number;
  dividendYield: number;
  payoutRatio: number;
  marketCap: number;
  ltp: number;
  week52High: number;
  week52Low: number;
  volume: number;
  avgVolume20d: number;
  dayChangePct: number;
  revenueGrowthQoqAccel: number;
  earningsBeatStreak: number;
  marginTrend: number;
  reinvestmentRate: number;
  analystRevision: number;
  instOwnership: number;
  instOwnershipTrend: number;
  newEntrants: number;
  holderConcentration: number;
  fiiDii: number;
  shariaDebtRatio: number;
  shariaInterestRatio: number;
  shariaSectorOk: boolean;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

export function computeOpportunity(i: ScoreInput) {
  let score = 50;

  score += i.revenueGrowthYoY * 0.6;
  score += i.earningsGrowthYoY * 0.7;

  // valuation: lower PE better, but negative PE punished
  if (i.pe > 0 && i.pe < 15) score += 15;
  else if (i.pe >= 15 && i.pe < 25) score += 8;
  else if (i.pe >= 25 && i.pe < 40) score += 0;
  else if (i.pe >= 40) score -= 10;
  else score -= 15;

  if (i.peg > 0 && i.peg < 1) score += 12;
  else if (i.peg >= 1 && i.peg < 2) score += 6;
  else if (i.peg >= 2) score -= 8;

  score += Math.min(i.dividendYield, 4) * 2;

  const posInRange = (i.ltp - i.week52Low) / Math.max(i.week52High - i.week52Low, 1);
  if (posInRange < 0.3) score += 10;
  else if (posInRange > 0.85) score -= 8;

  const breakdown = {
    growth: clamp(50 + i.revenueGrowthYoY * 0.6 + i.earningsGrowthYoY * 0.7),
    valuation: clamp(50 + (i.pe > 0 && i.pe < 25 ? 20 : i.pe >= 40 ? -20 : 0) + (i.peg > 0 && i.peg < 2 ? 15 : -10)),
    dividend: clamp(Math.min(i.dividendYield, 4) * 25),
    momentumPosition: clamp(50 + (posInRange < 0.3 ? 20 : posInRange > 0.85 ? -16 : 0)),
  };

  return { score: clamp(score), breakdown };
}

export function computeRisk(i: ScoreInput) {
  let score = 30;

  // leverage
  if (i.debtToEquity < 0.5) score += 0;
  else if (i.debtToEquity < 1) score += 15;
  else if (i.debtToEquity < 2) score += 30;
  else score += 45;

  // liquidity
  if (i.currentRatio < 1) score += 20;
  else if (i.currentRatio < 1.5) score += 8;

  // volatility proxy via 52w range
  const range = (i.week52High - i.week52Low) / Math.max(i.week52Low, 1);
  if (range > 0.6) score += 15;
  else if (range > 0.3) score += 8;

  // earnings consistency
  if (i.earningsBeatStreak <= 0) score += 12;
  else if (i.earningsBeatStreak <= 2) score += 5;

  // negative earnings
  if (i.earningsGrowthYoY < -10) score += 15;

  const breakdown = {
    leverage: clamp(i.debtToEquity * 35),
    liquidity: clamp(i.currentRatio < 1 ? 60 : i.currentRatio < 1.5 ? 30 : 10),
    volatility: clamp((range / 0.7) * 40),
    earningsConsistency: clamp(i.earningsBeatStreak <= 0 ? 50 : i.earningsBeatStreak <= 2 ? 30 : 10),
  };

  return { score: clamp(score), breakdown };
}

export function computeAttention(i: ScoreInput) {
  let score = 30;

  const volRatio = i.volume / Math.max(i.avgVolume20d, 1);
  if (volRatio > 2) score += 35;
  else if (volRatio > 1.5) score += 25;
  else if (volRatio > 1.2) score += 15;
  else if (volRatio < 0.7) score -= 10;

  const move = Math.abs(i.dayChangePct);
  score += Math.min(move * 4, 35);

  return clamp(score);
}

export function computeFinancialStrength(i: ScoreInput) {
  let score = 50;
  score += i.roe * 1.2;
  score += (i.operatingMargin - 12) * 1.2;
  if (i.fcf > 0) score += 15;
  else score -= 15;
  score += (i.currentRatio - 1.5) * 15;

  return clamp(score);
}

export function computeAlphaGrowth(i: ScoreInput) {
  let score = 50;
  score += i.revenueGrowthQoqAccel * 4;
  score += Math.min(i.earningsBeatStreak, 8) * 4;
  score += i.marginTrend * 5;
  score += i.reinvestmentRate * 30;
  score += i.analystRevision * 25;

  return clamp(score);
}

export function alphaGrowthCategory(score: number) {
  if (score >= 80) return "Exceptional";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Steady";
  return "Emerging";
}

export function computeSmartMoney(i: ScoreInput) {
  let score = 40;
  score += Math.min(i.instOwnership, 60) * 0.5;
  score += i.instOwnershipTrend * 6;
  score += Math.min(i.newEntrants, 6) * 4;
  score -= i.holderConcentration * 0.3;
  score += i.fiiDii * 5;

  return clamp(score);
}

export function smartMoneyVerdict(score: number) {
  if (score >= 65) return "accumulating";
  if (score <= 35) return "distributing";
  return "neutral";
}

export function computeFairValueStatus(i: ScoreInput) {
  // proxy for fair value using PE band; real impl uses fair_value_estimate
  if (i.pe > 0 && i.pe < 18) return "undervalued";
  if (i.pe > 32) return "overvalued";
  return "fair";
}

export function computeAiVerdict(opportunity: number, risk: number, fairValue: string) {
  if (opportunity >= 70 && risk <= 40 && fairValue !== "overvalued") return "buy_lean";
  if (risk >= 70 || (fairValue === "overvalued" && opportunity < 55)) return "avoid_lean";
  if (opportunity >= 55 && risk <= 50) return "hold";
  return "watch";
}

export function aiVerdictLabel(verdict: string) {
  switch (verdict) {
    case "buy_lean":
      return "BUY-lean";
    case "hold":
      return "HOLD";
    case "watch":
      return "WATCH";
    default:
      return "AVOID-lean";
  }
}

export function computeSharia(i: ScoreInput) {
  if (!i.shariaSectorOk) return "non_compliant";
  if (i.shariaDebtRatio < 33 && i.shariaInterestRatio < 5) return "compliant";
  return "purification_needed";
}

export function computeAllScores(i: ScoreInput) {
  const opportunity = computeOpportunity(i);
  const risk = computeRisk(i);
  const attention = computeAttention(i);
  const financialStrength = computeFinancialStrength(i);
  const alphaGrowth = computeAlphaGrowth(i);
  const smartMoney = computeSmartMoney(i);
  const fairValue = computeFairValueStatus(i);
  const aiVerdict = computeAiVerdict(opportunity.score, risk.score, fairValue);
  const sharia = computeSharia(i);

  return {
    opportunityScore: opportunity.score,
    opportunityBreakdown: opportunity.breakdown,
    riskScore: risk.score,
    riskBreakdown: risk.breakdown,
    attentionScore: attention,
    financialStrengthScore: financialStrength,
    alphaGrowthScore: alphaGrowth,
    alphaGrowthCategory: alphaGrowthCategory(alphaGrowth),
    smartMoneyScore: smartMoney,
    smartMoneyVerdict: smartMoneyVerdict(smartMoney),
    fairValueStatus: fairValue,
    aiVerdict,
    shariaStatus: sharia,
  };
}
