import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { optionalAuth } from "../middleware/auth.js";

const router = Router();
router.use(optionalAuth);

const LESSONS = [
  { id: "basics-stock-market", level: "beginner", title: "What is the stock market?", category: "Basics", minutes: 5, body: "The stock market is a place where shares of public companies are bought and sold. When you buy a share, you own a small part of that company. Prices move based on supply and demand, company performance, and broader economic conditions." },
  { id: "basics-pe-ratio", level: "beginner", title: "Price-to-Earnings (P/E) ratio", category: "Valuation", minutes: 6, body: "P/E = share price / earnings per share. It tells you how much investors pay for each rupee of profit. A high P/E can mean high growth expectations; a low P/E can mean the market is pessimistic or the company is cheap." },
  { id: "basics-diversification", level: "beginner", title: "Why diversify?", category: "Risk", minutes: 4, body: "Diversification means spreading money across different stocks and sectors so a loss in one doesn't sink your entire portfolio. It reduces risk without necessarily reducing expected return." },
  { id: "inter-score-opportunity", level: "intermediate", title: "Understanding the Opportunity Score", category: "SMARTWATCH", minutes: 7, body: "The Opportunity Score (0–100) blends revenue & earnings growth, valuation (P/E, PEG), dividend yield and price position within the 52-week range. It answers: is there a compelling reason to be interested?" },
  { id: "inter-score-risk", level: "intermediate", title: "Understanding the Risk Score", category: "SMARTWATCH", minutes: 7, body: "The Risk Score (0–100) combines leverage (debt-to-equity), liquidity (current ratio), volatility (52-week range) and earnings consistency. Higher means more things can go wrong." },
  { id: "inter-attention-score", level: "intermediate", title: "The Attention Score & change detection", category: "SMARTWATCH", minutes: 5, body: "Attention Score measures unusual activity: volume versus its 20-day average plus the size of today's price move. SMARTWATCH compares today's state to your personal 'last-seen' baseline so you only notice what actually changed." },
  { id: "adv-alpha-growth", level: "advanced", title: "Alpha Growth Score & reinvestment", category: "Growth", minutes: 8, body: "Alpha Growth (0–100) scores forward growth quality: revenue acceleration, consecutive earnings beats, margin expansion, reinvestment rate and analyst revisions. It complements (not replaces) the broader Opportunity Score." },
  { id: "adv-smart-money", level: "advanced", title: "Following institutional 'smart money'", category: "Institutional", minutes: 8, body: "Smart Money Score combines institutional ownership trend, new entrants, holder concentration and FII/DII flow. Broad-based accumulation by many institutions is more meaningful than one large holder." },
  { id: "adv-sharia", level: "advanced", title: "Sharia screening basics", category: "Screening", minutes: 6, body: "Sharia screening excludes certain sectors and caps debt-to-market-cap and interest income ratios. SMARTWATCH applies deterministic rules and shows the exact ratios — guidelines, not a religious ruling." },
  { id: "basics-candlesticks", level: "beginner", title: "Reading candlestick charts", category: "Charts", minutes: 6, body: "Each candlestick shows a period's open, high, low and close. A green candle means the close was above the open (buyers in control); a red candle means the close was below the open (sellers in control). The thick part is the body (open to close) and the thin lines are wicks (the high and low). A long lower wick suggests buying pressure near the low; a long upper wick suggests selling pressure near the high. A doji (tiny body) signals indecision." },
];

// GET /api/education
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ lessons: LESSONS });
  }),
);

// GET /api/education/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lesson = LESSONS.find((l) => l.id === req.params.id);
    if (!lesson) return res.status(404).json({ error: "NOT_FOUND", message: "Lesson not found" });
    res.json({ lesson });
  }),
);

export default router;
