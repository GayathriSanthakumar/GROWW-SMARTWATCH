export interface User {
  id: string;
  email: string;
  fullName: string;
  authProvider: string;
  isDemo: boolean;
  knowledgeLevel: string;
}

export interface Fundamentals {
  pe: number;
  pb: number;
  peg: number;
  debtToEquity: number;
  currentRatio: number;
  roe: number;
  operatingMargin: number;
  freeCashFlow: number;
  revenueGrowthYoY: number;
  earningsGrowthYoY: number;
  dividendYield: number;
  payoutRatio: number;
  fairValue: number;
  marketCap: number;
  shariaStatus: string;
}

export interface Scores {
  opportunity: number;
  risk: number;
  financialStrength: number;
  alphaGrowth: number;
  smartMoney: number;
  fairValueStatus: string;
  aiVerdict: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  exchange: string;
  instrumentType: "stock" | "etf" | "index";
  companyName: string;
  sector: string;
  industry: string;
  logoUrl: string | null;
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  avgVolume20d: number;
  week52High: number;
  week52Low: number;
  bseLtp: number | null;
  bseChangePct: number | null;
  dataStatus: string;
  fundamentals: Fundamentals;
  scores: Scores;
}

export interface WatchlistItem extends Instrument {
  watchIntent: string | null;
  notes: string | null;
  tags: string[];
  entryLevel: number | null;
  exitLevel: number | null;
  isPinned: boolean;
  sortOrder: number;
  addedAt: string;
  addedPrice: number | null;
  cagr: number | null;
}

export interface Watchlist {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  item_count: string;
}

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndexTick {
  index_symbol: string;
  level: string;
  change_abs: string;
  change_pct: string;
  updated_at: string;
}

export interface PortfolioPosition {
  id: string;
  instrumentId: string;
  symbol: string;
  companyName: string;
  sector: string;
  status: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  sellPrice: number | null;
  sellDate: string | null;
  fees: number;
  thesisNotes: string | null;
  priceTarget: number | null;
  stopLoss: number | null;
  goalId: string | null;
  ltp: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  scores: { opportunity: number; risk: number; aiVerdict: string };
}
