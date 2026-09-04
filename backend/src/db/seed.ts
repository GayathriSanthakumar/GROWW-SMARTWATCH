import bcrypt from "bcryptjs";
import type pg from "pg";
import { pool } from "./pool.js";
import { config } from "../config.js";
import { computeAllScores, type ScoreInput } from "../services/scoring.js";
import { fetchQuotes } from "../services/tradingview.js";
import { fileURLToPath } from "node:url";

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

// Deterministic PRNG so demo data is reproducible across runs.
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedDef {
  symbol: string;
  type: "stock" | "etf";
  name: string;
  sector: string;
  industry: string;
  price: number;
  mcap: number; // in crores
  pe: number;
  pb: number;
  ps: number;
  peg: number;
  evEbitda: number;
  d2e: number;
  currentRatio: number;
  roe: number;
  opMargin: number;
  fcf: number;
  revGrowth: number;
  earnGrowth: number;
  divYield: number;
  payout: number;
  revAccel: number;
  beatStreak: number;
  marginTrend: number;
  reinvest: number;
  analyst: number;
  instOwn: number;
  instTrend: number;
  newEntrants: number;
  concentration: number;
  fiiDii: number;
  shariaDebt: number;
  shariaInterest: number;
  shariaOk: boolean;
  volatility: number; // used for 52w range + candles
}

const STOCKS: SeedDef[] = [
  { symbol: "RELIANCE", type: "stock", name: "Reliance Industries", sector: "Energy", industry: "Conglomerate", price: 2950, mcap: 1995000, pe: 25, pb: 2.1, ps: 2.4, peg: 1.4, evEbitda: 14, d2e: 0.42, currentRatio: 1.15, roe: 9.1, opMargin: 16.5, fcf: 42000, revGrowth: 11, earnGrowth: 7, divYield: 0.4, payout: 12, revAccel: 1.2, beatStreak: 3, marginTrend: 0.5, reinvest: 0.6, analyst: 0.3, instOwn: 22, instTrend: 1.4, newEntrants: 4, concentration: 38, fiiDii: 0.6, shariaDebt: 15, shariaInterest: 1.2, shariaOk: true, volatility: 0.16 },
  { symbol: "TCS", type: "stock", name: "Tata Consultancy Services", sector: "IT", industry: "IT Services", price: 3850, mcap: 1395000, pe: 27, pb: 11, ps: 6, peg: 1.8, evEbitda: 17, d2e: 0.05, currentRatio: 2.4, roe: 46, opMargin: 24.5, fcf: 46000, revGrowth: 8, earnGrowth: 9, divYield: 1.9, payout: 55, revAccel: 0.4, beatStreak: 5, marginTrend: 0.2, reinvest: 0.3, analyst: 0.2, instOwn: 17, instTrend: 0.4, newEntrants: 2, concentration: 42, fiiDii: 0.2, shariaDebt: 2, shariaInterest: 0.4, shariaOk: true, volatility: 0.12 },
  { symbol: "HDFCBANK", type: "stock", name: "HDFC Bank", sector: "Banking", industry: "Private Bank", price: 1650, mcap: 1255000, pe: 19, pb: 3.2, ps: 4.8, peg: 1.2, evEbitda: 11, d2e: 0.18, currentRatio: 0.9, roe: 15.4, opMargin: 28, fcf: 50000, revGrowth: 16, earnGrowth: 17, divYield: 1.1, payout: 22, revAccel: 2.1, beatStreak: 4, marginTrend: 0.4, reinvest: 0.4, analyst: 0.4, instOwn: 36, instTrend: 2.1, newEntrants: 6, concentration: 45, fiiDii: 1.1, shariaDebt: 30, shariaInterest: 8, shariaOk: false, volatility: 0.14 },
  { symbol: "INFY", type: "stock", name: "Infosys", sector: "IT", industry: "IT Services", price: 1500, mcap: 620000, pe: 24, pb: 7.5, ps: 4.5, peg: 1.6, evEbitda: 14, d2e: 0.03, currentRatio: 2.1, roe: 31, opMargin: 21, fcf: 22000, revGrowth: 6, earnGrowth: 7, divYield: 2.2, payout: 60, revAccel: -0.2, beatStreak: 3, marginTrend: -0.2, reinvest: 0.3, analyst: 0.1, instOwn: 33, instTrend: -0.5, newEntrants: 1, concentration: 40, fiiDii: -0.4, shariaDebt: 1, shariaInterest: 0.3, shariaOk: true, volatility: 0.14 },
  { symbol: "ICICIBANK", type: "stock", name: "ICICI Bank", sector: "Banking", industry: "Private Bank", price: 1100, mcap: 780000, pe: 18, pb: 3.4, ps: 4.4, peg: 1.1, evEbitda: 10, d2e: 0.16, currentRatio: 0.9, roe: 17.2, opMargin: 27, fcf: 42000, revGrowth: 18, earnGrowth: 19, divYield: 0.9, payout: 16, revAccel: 2.4, beatStreak: 6, marginTrend: 0.5, reinvest: 0.45, analyst: 0.5, instOwn: 38, instTrend: 2.6, newEntrants: 7, concentration: 44, fiiDii: 1.4, shariaDebt: 28, shariaInterest: 9, shariaOk: false, volatility: 0.15 },
  { symbol: "ITC", type: "stock", name: "ITC Limited", sector: "FMCG", industry: "Tobacco/FMCG", price: 460, mcap: 575000, pe: 26, pb: 7.8, ps: 7, peg: 2.2, evEbitda: 16, d2e: 0.02, currentRatio: 2.8, roe: 30, opMargin: 38, fcf: 18000, revGrowth: 7, earnGrowth: 6, divYield: 3.1, payout: 80, revAccel: 0.1, beatStreak: 2, marginTrend: 0.1, reinvest: 0.2, analyst: 0.1, instOwn: 25, instTrend: 0.6, newEntrants: 3, concentration: 50, fiiDii: 0.3, shariaDebt: 1, shariaInterest: 0.5, shariaOk: false, volatility: 0.13 },
  { symbol: "SBIN", type: "stock", name: "State Bank of India", sector: "Banking", industry: "Public Bank", price: 820, mcap: 730000, pe: 9, pb: 1.9, ps: 1.6, peg: 0.8, evEbitda: 6, d2e: 0.2, currentRatio: 0.8, roe: 16.5, opMargin: 22, fcf: 55000, revGrowth: 13, earnGrowth: 21, divYield: 1.7, payout: 15, revAccel: 1.8, beatStreak: 4, marginTrend: 0.6, reinvest: 0.3, analyst: 0.5, instOwn: 12, instTrend: 1.2, newEntrants: 3, concentration: 62, fiiDii: 0.8, shariaDebt: 33, shariaInterest: 11, shariaOk: false, volatility: 0.18 },
  { symbol: "BHARTIARTL", type: "stock", name: "Bharti Airtel", sector: "Telecom", industry: "Telecom", price: 1550, mcap: 930000, pe: 75, pb: 7.1, ps: 5.5, peg: 3.1, evEbitda: 16, d2e: 1.6, currentRatio: 0.8, roe: 10, opMargin: 29, fcf: 28000, revGrowth: 12, earnGrowth: 22, divYield: 0.5, payout: 40, revAccel: 1.5, beatStreak: 2, marginTrend: 0.7, reinvest: 0.7, analyst: 0.4, instOwn: 29, instTrend: 1.8, newEntrants: 4, concentration: 48, fiiDii: 0.7, shariaDebt: 45, shariaInterest: 3, shariaOk: true, volatility: 0.17 },
  { symbol: "LT", type: "stock", name: "Larsen & Toubro", sector: "Infrastructure", industry: "Engineering", price: 3650, mcap: 502000, pe: 33, pb: 5.5, ps: 2.8, peg: 1.7, evEbitda: 19, d2e: 0.7, currentRatio: 1.3, roe: 15.2, opMargin: 10.5, fcf: 8000, revGrowth: 19, earnGrowth: 18, divYield: 0.7, payout: 22, revAccel: 2.6, beatStreak: 5, marginTrend: 0.3, reinvest: 0.8, analyst: 0.6, instOwn: 31, instTrend: 2.2, newEntrants: 5, concentration: 41, fiiDii: 1.0, shariaDebt: 22, shariaInterest: 2, shariaOk: true, volatility: 0.2 },
  { symbol: "HINDUNILVR", type: "stock", name: "Hindustan Unilever", sector: "FMCG", industry: "Consumer Staples", price: 2450, mcap: 575000, pe: 56, pb: 11.5, ps: 9, peg: 3.4, evEbitda: 34, d2e: 0.03, currentRatio: 1.3, roe: 20.5, opMargin: 23, fcf: 11000, revGrowth: 5, earnGrowth: 5, divYield: 1.6, payout: 90, revAccel: -0.3, beatStreak: 1, marginTrend: -0.2, reinvest: 0.2, analyst: -0.2, instOwn: 14, instTrend: -0.4, newEntrants: 0, concentration: 40, fiiDii: -0.3, shariaDebt: 1, shariaInterest: 0.4, shariaOk: true, volatility: 0.11 },
  { symbol: "TATAMOTORS", type: "stock", name: "Tata Motors", sector: "Auto", industry: "Automobiles", price: 1050, mcap: 386000, pe: 12, pb: 3.5, ps: 1.1, peg: 0.6, evEbitda: 5, d2e: 1.1, currentRatio: 1.0, roe: 32, opMargin: 13, fcf: 30000, revGrowth: 21, earnGrowth: 42, divYield: 0.3, payout: 4, revAccel: 3.2, beatStreak: 6, marginTrend: 1.1, reinvest: 0.7, analyst: 0.7, instOwn: 21, instTrend: 2.8, newEntrants: 8, concentration: 46, fiiDii: 1.3, shariaDebt: 35, shariaInterest: 2.5, shariaOk: true, volatility: 0.26 },
  { symbol: "MARUTI", type: "stock", name: "Maruti Suzuki", sector: "Auto", industry: "Automobiles", price: 12500, mcap: 393000, pe: 27, pb: 4.6, ps: 2.8, peg: 1.6, evEbitda: 15, d2e: 0.02, currentRatio: 1.4, roe: 18.5, opMargin: 12, fcf: 12000, revGrowth: 14, earnGrowth: 16, divYield: 0.9, payout: 25, revAccel: 1.1, beatStreak: 3, marginTrend: 0.4, reinvest: 0.6, analyst: 0.3, instOwn: 12, instTrend: 0.5, newEntrants: 2, concentration: 55, fiiDii: 0.2, shariaDebt: 1, shariaInterest: 0.6, shariaOk: true, volatility: 0.16 },
  { symbol: "TITAN", type: "stock", name: "Titan Company", sector: "Consumer", industry: "Jewellery", price: 3550, mcap: 315000, pe: 90, pb: 28, ps: 8, peg: 3.6, evEbitda: 38, d2e: 0.5, currentRatio: 2.1, roe: 31, opMargin: 11.5, fcf: 3000, revGrowth: 20, earnGrowth: 18, divYield: 0.3, payout: 28, revAccel: 2.2, beatStreak: 4, marginTrend: 0.2, reinvest: 0.5, analyst: 0.5, instOwn: 19, instTrend: 1.6, newEntrants: 3, concentration: 43, fiiDii: 0.5, shariaDebt: 12, shariaInterest: 1.5, shariaOk: true, volatility: 0.19 },
  { symbol: "ASIANPAINT", type: "stock", name: "Asian Paints", sector: "Consumer", industry: "Paints", price: 2950, mcap: 283000, pe: 51, pb: 13, ps: 8.5, peg: 3.0, evEbitda: 31, d2e: 0.1, currentRatio: 1.6, roe: 26, opMargin: 18, fcf: 5000, revGrowth: 9, earnGrowth: 11, divYield: 1.1, payout: 55, revAccel: 0.3, beatStreak: 2, marginTrend: -0.1, reinvest: 0.4, analyst: 0.1, instOwn: 9, instTrend: -0.2, newEntrants: 1, concentration: 51, fiiDii: -0.2, shariaDebt: 4, shariaInterest: 0.5, shariaOk: true, volatility: 0.15 },
  { symbol: "TATASTEEL", type: "stock", name: "Tata Steel", sector: "Metals", industry: "Steel", price: 165, mcap: 206000, pe: 14, pb: 1.9, ps: 0.9, peg: 0.7, evEbitda: 6, d2e: 0.9, currentRatio: 1.0, roe: 11, opMargin: 11, fcf: 9000, revGrowth: 8, earnGrowth: 15, divYield: 1.2, payout: 18, revAccel: 0.6, beatStreak: 2, marginTrend: 0.2, reinvest: 0.6, analyst: 0.2, instOwn: 24, instTrend: 0.8, newEntrants: 2, concentration: 39, fiiDii: 0.3, shariaDebt: 30, shariaInterest: 1.8, shariaOk: true, volatility: 0.3 },
  { symbol: "JSWSTEEL", type: "stock", name: "JSW Steel", sector: "Metals", industry: "Steel", price: 950, mcap: 232000, pe: 19, pb: 3.1, ps: 1.4, peg: 1.0, evEbitda: 8, d2e: 1.0, currentRatio: 1.1, roe: 16, opMargin: 15, fcf: 7000, revGrowth: 10, earnGrowth: 17, divYield: 0.7, payout: 14, revAccel: 0.8, beatStreak: 3, marginTrend: 0.3, reinvest: 0.7, analyst: 0.3, instOwn: 22, instTrend: 1.0, newEntrants: 3, concentration: 40, fiiDii: 0.4, shariaDebt: 32, shariaInterest: 2.0, shariaOk: true, volatility: 0.28 },
  { symbol: "ADANIENT", type: "stock", name: "Adani Enterprises", sector: "Conglomerate", industry: "Diversified", price: 3200, mcap: 380000, pe: 80, pb: 8, ps: 4.5, peg: 2.8, evEbitda: 24, d2e: 1.4, currentRatio: 1.1, roe: 12, opMargin: 12, fcf: -2000, revGrowth: 24, earnGrowth: 35, divYield: 0.1, payout: 2, revAccel: 3.0, beatStreak: 3, marginTrend: 0.5, reinvest: 0.9, analyst: 0.4, instOwn: 15, instTrend: 1.5, newEntrants: 4, concentration: 60, fiiDii: 0.5, shariaDebt: 40, shariaInterest: 2.2, shariaOk: true, volatility: 0.35 },
  { symbol: "SUNPHARMA", type: "stock", name: "Sun Pharmaceutical", sector: "Pharma", industry: "Pharmaceuticals", price: 1750, mcap: 420000, pe: 36, pb: 5.8, ps: 6, peg: 2.1, evEbitda: 19, d2e: 0.3, currentRatio: 2.0, roe: 16.5, opMargin: 26, fcf: 9000, revGrowth: 10, earnGrowth: 13, divYield: 0.8, payout: 30, revAccel: 0.5, beatStreak: 2, marginTrend: 0.2, reinvest: 0.5, analyst: 0.3, instOwn: 26, instTrend: 1.1, newEntrants: 3, concentration: 42, fiiDii: 0.6, shariaDebt: 8, shariaInterest: 0.8, shariaOk: true, volatility: 0.18 },
  { symbol: "DRREDDY", type: "stock", name: "Dr. Reddy's Laboratories", sector: "Pharma", industry: "Pharmaceuticals", price: 6600, mcap: 110000, pe: 22, pb: 3.4, ps: 3.8, peg: 1.3, evEbitda: 12, d2e: 0.15, currentRatio: 2.4, roe: 15.5, opMargin: 20, fcf: 6000, revGrowth: 11, earnGrowth: 14, divYield: 0.5, payout: 18, revAccel: 0.4, beatStreak: 1, marginTrend: 0.1, reinvest: 0.5, analyst: 0.2, instOwn: 22, instTrend: 0.6, newEntrants: 2, concentration: 44, fiiDii: 0.4, shariaDebt: 5, shariaInterest: 0.6, shariaOk: true, volatility: 0.19 },
  { symbol: "NTPC", type: "stock", name: "NTPC Limited", sector: "Power", industry: "Power Generation", price: 380, mcap: 368000, pe: 15, pb: 2.2, ps: 2.0, peg: 0.9, evEbitda: 9, d2e: 1.5, currentRatio: 0.9, roe: 13.5, opMargin: 24, fcf: 6000, revGrowth: 9, earnGrowth: 10, divYield: 3.3, payout: 45, revAccel: 0.4, beatStreak: 3, marginTrend: 0.2, reinvest: 0.8, analyst: 0.2, instOwn: 15, instTrend: 0.7, newEntrants: 2, concentration: 58, fiiDii: 0.3, shariaDebt: 48, shariaInterest: 3.5, shariaOk: true, volatility: 0.15 },
  { symbol: "POWERGRID", type: "stock", name: "Power Grid Corporation", sector: "Power", industry: "Power Transmission", price: 340, mcap: 316000, pe: 17, pb: 3.4, ps: 6.5, peg: 1.1, evEbitda: 10, d2e: 1.7, currentRatio: 1.1, roe: 19, opMargin: 62, fcf: 4000, revGrowth: 7, earnGrowth: 8, divYield: 4.1, payout: 70, revAccel: 0.2, beatStreak: 2, marginTrend: 0.1, reinvest: 0.8, analyst: 0.1, instOwn: 13, instTrend: 0.4, newEntrants: 1, concentration: 60, fiiDii: 0.2, shariaDebt: 52, shariaInterest: 4.0, shariaOk: true, volatility: 0.13 },
  { symbol: "ONGC", type: "stock", name: "Oil & Natural Gas Corp", sector: "Energy", industry: "Oil & Gas", price: 270, mcap: 340000, pe: 8, pb: 1.2, ps: 1.1, peg: 0.5, evEbitda: 4, d2e: 0.55, currentRatio: 1.0, roe: 14.5, opMargin: 21, fcf: 20000, revGrowth: 6, earnGrowth: 9, divYield: 3.8, payout: 30, revAccel: 0.1, beatStreak: 2, marginTrend: 0.1, reinvest: 0.5, analyst: 0.1, instOwn: 18, instTrend: 0.5, newEntrants: 2, concentration: 55, fiiDii: 0.2, shariaDebt: 18, shariaInterest: 1.0, shariaOk: true, volatility: 0.22 },
  { symbol: "COALINDIA", type: "stock", name: "Coal India", sector: "Energy", industry: "Mining", price: 490, mcap: 302000, pe: 8, pb: 3.0, ps: 2.2, peg: 0.6, evEbitda: 5, d2e: 0.2, currentRatio: 1.7, roe: 43, opMargin: 32, fcf: 18000, revGrowth: 5, earnGrowth: 6, divYield: 5.5, payout: 60, revAccel: 0.0, beatStreak: 2, marginTrend: -0.1, reinvest: 0.3, analyst: 0.0, instOwn: 9, instTrend: 0.2, newEntrants: 1, concentration: 70, fiiDii: 0.1, shariaDebt: 6, shariaInterest: 1.2, shariaOk: true, volatility: 0.2 },
  { symbol: "WIPRO", type: "stock", name: "Wipro", sector: "IT", industry: "IT Services", price: 560, mcap: 290000, pe: 23, pb: 4.1, ps: 3.1, peg: 2.0, evEbitda: 13, d2e: 0.15, currentRatio: 2.5, roe: 17, opMargin: 18, fcf: 12000, revGrowth: 4, earnGrowth: 5, divYield: 0.4, payout: 12, revAccel: -0.4, beatStreak: 1, marginTrend: -0.3, reinvest: 0.3, analyst: -0.2, instOwn: 15, instTrend: -0.6, newEntrants: 0, concentration: 47, fiiDii: -0.4, shariaDebt: 4, shariaInterest: 0.5, shariaOk: true, volatility: 0.17 },
  { symbol: "HCLTECH", type: "stock", name: "HCL Technologies", sector: "IT", industry: "IT Services", price: 1450, mcap: 394000, pe: 24, pb: 5.9, ps: 3.6, peg: 1.5, evEbitda: 14, d2e: 0.08, currentRatio: 2.0, roe: 25, opMargin: 19, fcf: 16000, revGrowth: 7, earnGrowth: 8, divYield: 3.4, payout: 75, revAccel: 0.3, beatStreak: 4, marginTrend: 0.1, reinvest: 0.4, analyst: 0.2, instOwn: 28, instTrend: 0.8, newEntrants: 2, concentration: 41, fiiDii: 0.4, shariaDebt: 3, shariaInterest: 0.5, shariaOk: true, volatility: 0.14 },
  { symbol: "TECHM", type: "stock", name: "Tech Mahindra", sector: "IT", industry: "IT Services", price: 1450, mcap: 142000, pe: 27, pb: 4.8, ps: 2.9, peg: 1.7, evEbitda: 14, d2e: 0.1, currentRatio: 2.1, roe: 19, opMargin: 12, fcf: 6000, revGrowth: 5, earnGrowth: 6, divYield: 3.0, payout: 72, revAccel: -0.1, beatStreak: 2, marginTrend: -0.1, reinvest: 0.4, analyst: -0.1, instOwn: 20, instTrend: -0.3, newEntrants: 1, concentration: 43, fiiDii: -0.3, shariaDebt: 3, shariaInterest: 0.5, shariaOk: true, volatility: 0.16 },
  { symbol: "ULTRACEMCO", type: "stock", name: "UltraTech Cement", sector: "Cement", industry: "Cement", price: 10800, mcap: 312000, pe: 40, pb: 5.0, ps: 4.2, peg: 2.0, evEbitda: 20, d2e: 0.35, currentRatio: 0.9, roe: 12.5, opMargin: 18, fcf: 5000, revGrowth: 13, earnGrowth: 15, divYield: 0.5, payout: 18, revAccel: 1.0, beatStreak: 2, marginTrend: 0.3, reinvest: 0.9, analyst: 0.4, instOwn: 27, instTrend: 1.3, newEntrants: 3, concentration: 37, fiiDii: 0.6, shariaDebt: 11, shariaInterest: 0.8, shariaOk: true, volatility: 0.2 },
  { symbol: "DIVISLAB", type: "stock", name: "Divi's Laboratories", sector: "Pharma", industry: "Pharmaceuticals", price: 5800, mcap: 154000, pe: 55, pb: 10, ps: 11, peg: 3.2, evEbitda: 32, d2e: 0.02, currentRatio: 3.5, roe: 19, opMargin: 30, fcf: 4000, revGrowth: 12, earnGrowth: 13, divYield: 0.7, payout: 35, revAccel: 0.6, beatStreak: 2, marginTrend: 0.2, reinvest: 0.5, analyst: 0.3, instOwn: 23, instTrend: 0.9, newEntrants: 2, concentration: 40, fiiDii: 0.4, shariaDebt: 1, shariaInterest: 0.4, shariaOk: true, volatility: 0.18 },
  { symbol: "BAJFINANCE", type: "stock", name: "Bajaj Finance", sector: "NBFC", industry: "Financial Services", price: 7400, mcap: 460000, pe: 29, pb: 6.0, ps: 8.5, peg: 1.4, evEbitda: 15, d2e: 3.5, currentRatio: 1.0, roe: 22, opMargin: 40, fcf: -8000, revGrowth: 22, earnGrowth: 20, divYield: 0.4, payout: 10, revAccel: 1.6, beatStreak: 5, marginTrend: 0.2, reinvest: 0.8, analyst: 0.4, instOwn: 30, instTrend: 1.4, newEntrants: 4, concentration: 39, fiiDii: 0.8, shariaDebt: 70, shariaInterest: 15, shariaOk: false, volatility: 0.24 },
  { symbol: "NESTLEIND", type: "stock", name: "Nestle India", sector: "FMCG", industry: "Consumer Staples", price: 2500, mcap: 241000, pe: 68, pb: 42, ps: 12, peg: 4.0, evEbitda: 38, d2e: 0.05, currentRatio: 1.2, roe: 60, opMargin: 21, fcf: 4000, revGrowth: 10, earnGrowth: 12, divYield: 1.0, payout: 70, revAccel: 0.4, beatStreak: 3, marginTrend: 0.1, reinvest: 0.3, analyst: 0.2, instOwn: 11, instTrend: 0.3, newEntrants: 1, concentration: 52, fiiDii: 0.1, shariaDebt: 2, shariaInterest: 0.4, shariaOk: true, volatility: 0.12 },
];

const ETFS: SeedDef[] = [
  { symbol: "NIFTYBEES", type: "etf", name: "Nippon India ETF Nifty BeES", sector: "Index ETF", industry: "Large Cap", price: 250, mcap: 0, pe: 20, pb: 3.5, ps: 0, peg: 0, evEbitda: 0, d2e: 0, currentRatio: 0, roe: 0, opMargin: 0, fcf: 0, revGrowth: 0, earnGrowth: 0, divYield: 1.4, payout: 0, revAccel: 0, beatStreak: 0, marginTrend: 0, reinvest: 0, analyst: 0.2, instOwn: 40, instTrend: 1.0, newEntrants: 2, concentration: 20, fiiDii: 0.5, shariaDebt: 0, shariaInterest: 0, shariaOk: true, volatility: 0.12 },
  { symbol: "BANKBEES", type: "etf", name: "Nippon India ETF Bank BeES", sector: "Sector ETF", industry: "Banking", price: 520, mcap: 0, pe: 13, pb: 2.4, ps: 0, peg: 0, evEbitda: 0, d2e: 0, currentRatio: 0, roe: 0, opMargin: 0, fcf: 0, revGrowth: 0, earnGrowth: 0, divYield: 1.0, payout: 0, revAccel: 0, beatStreak: 0, marginTrend: 0, reinvest: 0, analyst: 0.1, instOwn: 45, instTrend: 1.2, newEntrants: 2, concentration: 22, fiiDii: 0.6, shariaDebt: 0, shariaInterest: 0, shariaOk: false, volatility: 0.16 },
  { symbol: "GOLDBEES", type: "etf", name: "Nippon India ETF Gold BeES", sector: "Commodity ETF", industry: "Gold", price: 65, mcap: 0, pe: 0, pb: 0, ps: 0, peg: 0, evEbitda: 0, d2e: 0, currentRatio: 0, roe: 0, opMargin: 0, fcf: 0, revGrowth: 0, earnGrowth: 0, divYield: 0, payout: 0, revAccel: 0, beatStreak: 0, marginTrend: 0, reinvest: 0, analyst: 0.1, instOwn: 30, instTrend: 0.8, newEntrants: 1, concentration: 25, fiiDii: 0.3, shariaDebt: 0, shariaInterest: 0, shariaOk: true, volatility: 0.1 },
  { symbol: "ITBEES", type: "etf", name: "Nippon India ETF Nifty IT BeES", sector: "Sector ETF", industry: "IT", price: 38, mcap: 0, pe: 25, pb: 6, ps: 0, peg: 0, evEbitda: 0, d2e: 0, currentRatio: 0, roe: 0, opMargin: 0, fcf: 0, revGrowth: 0, earnGrowth: 0, divYield: 1.6, payout: 0, revAccel: 0, beatStreak: 0, marginTrend: 0, reinvest: 0, analyst: 0.1, instOwn: 42, instTrend: 0.6, newEntrants: 1, concentration: 20, fiiDii: 0.4, shariaDebt: 0, shariaInterest: 0, shariaOk: true, volatility: 0.15 },
];

const INDICES: { symbol: string; name: string; level: number }[] = [
  { symbol: "NIFTY50", name: "NIFTY 50", level: 24850 },
  { symbol: "SENSEX", name: "SENSEX", level: 81200 },
  { symbol: "BANKNIFTY", name: "BANKNIFTY", level: 51200 },
  { symbol: "MIDCPNIFTY", name: "MIDCAP NIFTY", level: 12450 },
  { symbol: "FINNIFTY", name: "FINNIFTY", level: 23500 },
];

const ALL: SeedDef[] = [...STOCKS, ...ETFS];

interface RealPrice {
  price: number;
  week52High: number;
  week52Low: number;
  avgVolume: number;
}

// Best-effort: pull real-time prices from TradingView so the seeded demo data is
// consistent with the live feed. Falls back to the hardcoded values if offline.
async function fetchRealPrices(): Promise<Record<string, RealPrice>> {
  const out: Record<string, RealPrice> = {};
  try {
    const quotes = await Promise.race([
      fetchQuotes(ALL.map((s) => `NSE:${s.symbol}`)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    for (const q of quotes) {
      out[q.symbol] = {
        price: q.close,
        week52High: q.week52High ?? q.close * 1.2,
        week52Low: q.week52Low ?? q.close * 0.8,
        avgVolume: q.avgVolume30d ?? 0,
      };
    }
  } catch (e) {
    console.log("[seed] TradingView unavailable, using bundled prices", e instanceof Error ? e.message : "");
  }
  return out;
}

export async function seed() {
  const client = await pool.connect();
  const rng = mulberry32(42);

  try {
    await client.query("BEGIN");

    // ── Demo user ────────────────────────────────────────
    const passwordHash = await bcrypt.hash("demo1234", 10);
    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, email_verified, password_hash, full_name, auth_provider, knowledge_level, onboarding_goals, risk_appetite, is_demo_account)
       VALUES ($1, true, $2, $3, 'email', 'intermediate', $4, 'moderate', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name
       RETURNING id`,
      ["demo@smartwatch.app", passwordHash, "Demo Investor", ["find_growth", "analyze_ai", "follow_smart_money"]],
    );
    const demoUserId = userRes.rows[0].id;
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [demoUserId]);

    // ── Instruments + fundamentals + scores ─────────────
    const instrumentIds: Record<string, string> = {};
    const realPrices = await fetchRealPrices();

    for (const s of ALL) {
      const real = realPrices[s.symbol];
      const price = real?.price ?? s.price;
      const week52Low = real ? real.week52Low : +(s.price * (1 - s.volatility)).toFixed(2);
      const week52High = real ? real.week52High : +(s.price * (1 + s.volatility * 1.5)).toFixed(2);
      const prevClose = +(price / (1 + (rng() - 0.48) * 0.03)).toFixed(2);
      const avgVolume = real && real.avgVolume > 0 ? Math.round(real.avgVolume) : Math.round((s.mcap > 0 ? s.mcap * 100000 : 5000000) / s.price);
      const volRatio = 0.7 + rng() * 1.8;
      const volume = Math.round(avgVolume * volRatio);
      const dayChangePct = +((price / prevClose - 1) * 100).toFixed(2);

      const fairValue = +(price * (0.8 + rng() * 0.4)).toFixed(2);

      const insRes = await client.query<{ id: string }>(
        `INSERT INTO instruments (symbol, exchange, instrument_type, company_name, sector, industry, logo_url, isin, listed_date)
         VALUES ($1, 'NSE', $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, exchange) DO UPDATE SET company_name = EXCLUDED.company_name, sector = EXCLUDED.sector
         RETURNING id`,
        [s.symbol, s.type, s.name, s.sector, s.industry, null, `INE${s.symbol}00001`, new Date("2010-01-01")],
      );
      const instrumentId = insRes.rows[0].id;
      instrumentIds[s.symbol] = instrumentId;

      const scoreInput: ScoreInput = {
        revenueGrowthYoY: s.revGrowth,
        earningsGrowthYoY: s.earnGrowth,
        pe: s.pe,
        pb: s.pb,
        peg: s.peg,
        debtToEquity: s.d2e,
        currentRatio: s.currentRatio,
        roe: s.roe,
        operatingMargin: s.opMargin,
        fcf: s.fcf,
        dividendYield: s.divYield,
        payoutRatio: s.payout,
        marketCap: s.mcap,
        ltp: price,
        week52High,
        week52Low,
        volume,
        avgVolume20d: avgVolume,
        dayChangePct,
        revenueGrowthQoqAccel: s.revAccel,
        earningsBeatStreak: s.beatStreak,
        marginTrend: s.marginTrend,
        reinvestmentRate: s.reinvest,
        analystRevision: s.analyst,
        instOwnership: s.instOwn,
        instOwnershipTrend: s.instTrend,
        newEntrants: s.newEntrants,
        holderConcentration: s.concentration,
        fiiDii: s.fiiDii,
        shariaDebtRatio: s.shariaDebt,
        shariaInterestRatio: s.shariaInterest,
        shariaSectorOk: s.shariaOk,
      };

      const scores = computeAllScores(scoreInput);

      await client.query(
        `INSERT INTO fundamentals_snapshot (instrument_id, as_of_date, market_cap, pe_ratio, pb_ratio, ps_ratio, peg_ratio, ev_ebitda, debt_to_equity, current_ratio, roe_pct, operating_margin_pct, free_cash_flow, revenue_growth_yoy_pct, earnings_growth_yoy_pct, dividend_yield_pct, payout_ratio_pct, fair_value_estimate, sharia_debt_ratio_pct, sharia_interest_ratio_pct, sharia_status)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [instrumentId, s.mcap, s.pe, s.pb, s.ps, s.peg, s.evEbitda, s.d2e, s.currentRatio, s.roe, s.opMargin, s.fcf, s.revGrowth, s.earnGrowth, s.divYield, s.payout, fairValue, s.shariaDebt, s.shariaInterest, scores.shariaStatus],
      );

      await client.query(
        `INSERT INTO price_ticks (instrument_id, ltp, prev_close, day_open, day_high, day_low, volume, avg_volume_20d, week52_high, week52_low, data_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'LIVE', now())
         ON CONFLICT (instrument_id) DO UPDATE SET ltp = EXCLUDED.ltp, prev_close = EXCLUDED.prev_close, volume = EXCLUDED.volume, updated_at = now()`,
        [instrumentId, price, prevClose, +(prevClose * (1 + (rng() - 0.5) * 0.01)).toFixed(2), week52High * 0.98, week52Low * 1.02, volume, avgVolume, week52High, week52Low],
      );

      await client.query(
        `INSERT INTO instrument_scores (instrument_id, opportunity_score, opportunity_breakdown, risk_score, risk_breakdown, financial_strength_score, alpha_growth_score, smart_money_score, attention_score, fair_value_status, ai_verdict, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (instrument_id) DO UPDATE SET opportunity_score = EXCLUDED.opportunity_score, risk_score = EXCLUDED.risk_score, attention_score = EXCLUDED.attention_score, ai_verdict = EXCLUDED.ai_verdict`,
        [instrumentId, scores.opportunityScore, scores.opportunityBreakdown, scores.riskScore, scores.riskBreakdown, scores.financialStrengthScore, scores.alphaGrowthScore, scores.smartMoneyScore, scores.attentionScore, scores.fairValueStatus, scores.aiVerdict],
      );

      if (s.type === "etf") {
        const holdings = [
          { symbol: "HDFCBANK", weight_pct: 28 },
          { symbol: "ICICIBANK", weight_pct: 18 },
          { symbol: "SBIN", weight_pct: 14 },
          { symbol: "KOTAKBANK", weight_pct: 10 },
          { symbol: "AXISBANK", weight_pct: 9 },
        ];
        await client.query(
          `INSERT INTO etf_details (instrument_id, expense_ratio_pct, benchmark_index, aum, tracking_error_pct, top_holdings)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [instrumentId, +(0.05 + rng() * 0.3).toFixed(2), "NIFTY " + (s.sector.includes("Bank") ? "Bank" : s.sector.includes("IT") ? "IT" : "50"), Math.round(5000 + rng() * 40000), +(0.05 + rng() * 0.5).toFixed(2), JSON.stringify(holdings)],
        );
      }

      // Institutional holdings
      const holders = ["HDFC Mutual Fund", "ICICI Prudential MF", "SBI Mutual Fund", "Nippon India MF", "Kotak MF", "Foreign FII Pool"];
      for (let h = 0; h < 3; h++) {
        await client.query(
          `INSERT INTO institutional_holdings (instrument_id, as_of_date, holder_name, ownership_pct, change_pct)
           VALUES ($1, CURRENT_DATE, $2, $3, $4)`,
          [instrumentId, holders[Math.floor(rng() * holders.length)], +(2 + rng() * 12).toFixed(2), +(rng() * 4 - 2).toFixed(2)],
        );
      }

      // Earnings calendar
      await client.query(
        `INSERT INTO earnings_calendar (instrument_id, earnings_date, eps_expected, eps_previous)
         VALUES ($1, CURRENT_DATE + ($2 * interval '1 day'), $3, $4)`,
        [instrumentId, Math.floor(rng() * 45) + 10, +(5 + rng() * 40).toFixed(1), +(5 + rng() * 35).toFixed(1)],
      );

      // News
      const headlines = [
        ["reports strong quarterly results, beats estimates", "positive"],
        ["announces new capex plan for capacity expansion", "neutral"],
        ["analysts raise price target on improving outlook", "positive"],
        ["faces margin pressure from rising input costs", "negative"],
        ["management guides for steady growth ahead", "neutral"],
        ["institutional investors raise stake", "positive"],
      ];
      for (let n = 0; n < 3; n++) {
        const hl = headlines[Math.floor(rng() * headlines.length)];
        await client.query(
          `INSERT INTO news_items (instrument_id, headline, source, url, sentiment, published_at)
           VALUES ($1, $2, $3, $4, $5, now() - ($6 * interval '1 hour'))`,
          [instrumentId, `${s.name} ${hl[0]}`, "Business Wire", null, hl[1], Math.floor(rng() * 48)],
        );
      }

      // Candles: 90 daily + 40 intraday (5m)
      await seedCandles(client, instrumentId, price, prevClose, week52Low, week52High, rng, avgVolume);
    }

    // ── Indices ─────────────────────────────────────────
    for (const idx of INDICES) {
      const changePct = (rng() - 0.48) * 2;
      await client.query(
        `INSERT INTO index_ticks (index_symbol, level, change_abs, change_pct, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (index_symbol) DO UPDATE SET level = EXCLUDED.level, change_pct = EXCLUDED.change_pct, updated_at = now()`,
        [idx.symbol, idx.level, +(idx.level * (changePct / 100)).toFixed(2), +changePct.toFixed(2)],
      );
    }

    // ── Demo watchlists ─────────────────────────────────
    const lists: { name: string; emoji: string; desc: string; isDefault: boolean; symbols: string[] }[] = [
      { name: "My list", emoji: "📈", desc: "Core holdings & companies I track", isDefault: true, symbols: ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ITC"] },
      { name: "Momentum Trades", emoji: "⚡", desc: "High-momentum swing candidates", isDefault: false, symbols: ["TATAMOTORS", "TATASTEEL", "ADANIENT", "JSWSTEEL", "LT"] },
      { name: "Dividend Portfolio", emoji: "💰", desc: "Steady dividend payers", isDefault: false, symbols: ["ITC", "NTPC", "POWERGRID", "COALINDIA", "ONGC"] },
    ];

    const defaultWatchlistId: string[] = [];
    for (let i = 0; i < lists.length; i++) {
      const l = lists[i];
      const wlRes = await client.query<{ id: string }>(
        `INSERT INTO watchlists (user_id, name, emoji, description, is_default, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [demoUserId, l.name, l.emoji, l.desc, l.isDefault, i],
      );
      const watchlistId = wlRes.rows[0].id;
      if (l.isDefault) defaultWatchlistId.push(watchlistId);

      for (let j = 0; j < l.symbols.length; j++) {
        const sym = l.symbols[j];
        if (!instrumentIds[sym]) continue;
        const intent = l.name.includes("Momentum") ? "momentum" : l.name.includes("Dividend") ? "dividend" : "long_term";
        const tags = intent === "momentum" ? ["Momentum"] : intent === "dividend" ? ["Dividend", "Long-term"] : ["Long-term"];
        const base = realPrices[sym]?.price;
        const addedPrice = base ? +(base * (0.9 + (j % 3) * 0.03)).toFixed(2) : null;
        await client.query(
          `INSERT INTO watchlist_items (watchlist_id, instrument_id, watch_intent, tags, added_price, sort_order, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 * interval '1 day')) ON CONFLICT DO NOTHING`,
          [watchlistId, instrumentIds[sym], intent, tags, addedPrice, j, 30 + j * 45],
        );
      }
    }

    // ── Portfolio goals ────────────────────────────────
    const goals: { name: string; target: number; symbols: string[] }[] = [
      { name: "Emergency Fund", target: 500000, symbols: ["RELIANCE", "ITC"] },
      { name: "Child Education", target: 1000000, symbols: ["HDFCBANK", "TCS"] },
    ];
    const goalIds: Record<string, string> = {};
    for (const g of goals) {
      const gr = await client.query<{ id: string }>(
        `INSERT INTO portfolio_goals (user_id, name, target_amount) VALUES ($1, $2, $3) RETURNING id`,
        [demoUserId, g.name, g.target],
      );
      goalIds[g.name] = gr.rows[0].id;
    }

    // ── Portfolio positions ─────────────────────────────
    // Buy prices are derived from the (real) current price so demo P&L is sensible.
    const positions: [string, number, number, string][] = [
      ["RELIANCE", 10, +(realPrices["RELIANCE"]?.price ?? 2800 * 0.9).toFixed(2), "Emergency Fund"],
      ["HDFCBANK", 5, +(realPrices["HDFCBANK"]?.price ?? 1500 * 0.9).toFixed(2), "Child Education"],
      ["ITC", 50, +(realPrices["ITC"]?.price ?? 420 * 0.9).toFixed(2), "Emergency Fund"],
      ["TCS", 2, +(realPrices["TCS"]?.price ?? 3600 * 0.9).toFixed(2), "Child Education"],
    ];
    for (const [sym, qty, buy, goal] of positions) {
      if (!instrumentIds[sym]) continue;
      // buy ~8% below current so positions show a modest unrealised gain
      const buyPrice = +(buy * 0.92).toFixed(2);
      await client.query(
        `INSERT INTO portfolio_positions (user_id, instrument_id, status, quantity, buy_price, buy_date, thesis_notes, price_target, stop_loss, goal_id)
         VALUES ($1, $2, 'holding', $3, $4, CURRENT_DATE - 180, $5, $6, $7, $8)`,
        [demoUserId, instrumentIds[sym], qty, buyPrice, "Core position, long-term conviction", +(buyPrice * 1.25).toFixed(2), +(buyPrice * 0.9).toFixed(2), goalIds[goal] ?? null],
      );
    }

    // ── Alerts ──────────────────────────────────────────
    if (instrumentIds["RELIANCE"] && instrumentIds["TATASTEEL"]) {
      await client.query(
        `INSERT INTO alerts (user_id, instrument_id, condition_json, notify_mode) VALUES ($1, $2, $3, 'immediate'), ($1, $4, $5, 'summary')`,
        [demoUserId, instrumentIds["RELIANCE"], JSON.stringify({ type: "price_move", direction: "down", pct: 5 }), instrumentIds["TATASTEEL"], JSON.stringify({ type: "price_above", price: 180 })],
      );
    }

    // ── Memory (last-seen baseline) ─────────────────────
    for (const sym of ["RELIANCE", "ITC", "TATAMOTORS"]) {
      const instId = instrumentIds[sym];
      if (!instId) continue;
      const s = ALL.find((x) => x.symbol === sym)!;
      const basePrice = realPrices[sym]?.price ?? s.price;
      await client.query(
        `INSERT INTO user_instrument_memory (user_id, instrument_id, last_seen_price, last_seen_volume, last_seen_attention_score, last_seen_opportunity_score, last_seen_risk_score, last_seen_at, last_viewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() - interval '3 days', now() - interval '3 days')
         ON CONFLICT (user_id, instrument_id) DO UPDATE SET last_seen_price = EXCLUDED.last_seen_price, last_seen_at = EXCLUDED.last_seen_at`,
        [demoUserId, instId, +(basePrice * 0.96).toFixed(2), Math.round((s.mcap * 100000) / s.price), 55, 60, 40],
      );
    }

    // ── Subscription (free) ─────────────────────────────
    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active') ON CONFLICT (user_id) DO NOTHING`,
      [demoUserId],
    );

    await client.query("COMMIT");
    console.log("[db] seed complete — demo user: demo@smartwatch.app / demo1234");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function seedCandles(
  client: pg.PoolClient,
  instrumentId: string,
  price: number,
  prevClose: number,
  low: number,
  high: number,
  rng: () => number,
  avgVolume: number,
) {
  // 90 daily candles, random walk ending at `price`
  const daily: { ts: Date; o: number; h: number; l: number; c: number; v: number }[] = [];
  let cursor = price * (1 - (0.1 + rng() * 0.15));
  for (let d = 89; d >= 0; d--) {
    const o = cursor;
    const drift = (price - o) / (d + 1);
    const close = o + drift + (rng() - 0.5) * price * 0.02;
    const hi = Math.max(o, close) * (1 + rng() * 0.015);
    const lo = Math.min(o, close) * (1 - rng() * 0.015);
    const v = Math.round(avgVolume * (0.6 + rng() * 0.8));
    daily.push({ ts: new Date(Date.now() - d * 86400000), o: +o.toFixed(2), h: +hi.toFixed(2), l: +lo.toFixed(2), c: +close.toFixed(2), v });
    cursor = close;
  }
  daily[daily.length - 1].c = price;

  const values: unknown[] = [];
  const params: unknown[] = [];
  let p = 2;
  for (const c of daily) {
    values.push(`($1, '1d', $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(c.ts.toISOString(), c.o, c.h, c.l, c.c, c.v);
  }
  await client.query(`INSERT INTO price_candles (instrument_id, interval, ts, open, high, low, close, volume) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`, [instrumentId, ...params]);

  // 75 intraday 5m candles for a full-session candlestick chart
  const intraday: { o: number; h: number; l: number; c: number; v: number }[] = [];
  let ic = prevClose * (1 + (rng() - 0.5) * 0.004);
  const INTRADAY_POINTS = 75;
  for (let m = 0; m < INTRADAY_POINTS; m++) {
    const o = ic;
    const drift = (price - o) / (INTRADAY_POINTS - m);
    const close = o + drift + (rng() - 0.5) * price * 0.003;
    intraday.push({ o: +o.toFixed(2), h: +Math.max(o, close).toFixed(2), l: +Math.min(o, close).toFixed(2), c: +close.toFixed(2), v: Math.round(avgVolume / INTRADAY_POINTS) });
    ic = close;
  }
  intraday[intraday.length - 1].c = price;

  const iv: unknown[] = [];
  const ip: unknown[] = [];
  let q = 2;
  const now = Date.now();
  for (let m = 0; m < intraday.length; m++) {
    const c = intraday[m];
    iv.push(`($1, '5m', $${q++}, $${q++}, $${q++}, $${q++}, $${q++}, $${q++})`);
    ip.push(new Date(now - (INTRADAY_POINTS - m) * 5 * 60000).toISOString(), c.o, c.h, c.l, c.c, c.v);
  }
  await client.query(`INSERT INTO price_candles (instrument_id, interval, ts, open, high, low, close, volume) VALUES ${iv.join(", ")} ON CONFLICT DO NOTHING`, [instrumentId, ...ip]);
}

if (isMain) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[db] seed failed", e);
      process.exit(1);
    });
}
