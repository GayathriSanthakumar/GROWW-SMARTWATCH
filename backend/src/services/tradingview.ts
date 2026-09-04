import { query } from "../db/pool.js";

// TradingView live-data provider. Uses TradingView's public India scanner API to
// pull real-time quotes for our NSE instruments and indices. Falls back to the
// offline simulator (marketSim) when TradingView is unreachable.

const SCANNER_URL = "https://scanner.tradingview.com/india/scan";

const COLUMNS = [
  "name",
  "description",
  "close",
  "change",
  "change_abs",
  "volume",
  "high",
  "low",
  "open",
  "market_cap_basic",
  "sector",
  "price_52_week_high",
  "price_52_week_low",
  "average_volume_30d_calc",
  "dividends_yield",
  "Perf.W",
  "Perf.1M",
  "Perf.3M",
  "Perf.6M",
  "Perf.Y",
];

export interface TvQuote {
  ticker: string;
  symbol: string;
  name: string | null;
  close: number;
  changePct: number;
  changeAbs: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  marketCap: number | null;
  sector: string | null;
  week52High: number | null;
  week52Low: number | null;
  avgVolume30d: number | null;
  dividendYield: number | null;
  perf1w: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf6m: number | null;
  perf1y: number | null;
}

// Map our index symbols to their TradingView tickers.
export const INDEX_TICKERS: Record<string, string> = {
  NIFTY50: "NSE:NIFTY",
  SENSEX: "BSE:SENSEX",
  BANKNIFTY: "NSE:BANKNIFTY",
  MIDCPNIFTY: "NSE:MIDCPNIFTY",
  FINNIFTY: "NSE:FINNIFTY",
};

export async function fetchQuotes(tickers: string[]): Promise<TvQuote[]> {
  const out: TvQuote[] = [];
  const batchSize = 50;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const res = await fetch(SCANNER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SMARTWATCH/1.0 (educational tool)",
        Accept: "application/json",
      },
      body: JSON.stringify({
        symbols: { tickers: batch, query: { types: [] } },
        columns: COLUMNS,
      }),
    });
    if (!res.ok) throw new Error(`tradingview http ${res.status}`);
    const data = (await res.json()) as { data?: { s: string; d: (string | number | null)[] }[] };
    for (const row of data.data ?? []) {
      const q = parseRow(row.s, row.d);
      if (q) out.push(q);
    }
  }
  return out;
}

function parseRow(ticker: string, d: (string | number | null)[]): TvQuote | null {
  const close = num(d[2]);
  if (close === null) return null;
  const changeAbs = num(d[4]) ?? 0;
  return {
    ticker,
    symbol: String(d[0] ?? ticker),
    name: d[1] ? String(d[1]) : null,
    close,
    changePct: num(d[3]) ?? 0,
    changeAbs,
    volume: num(d[5]) ?? 0,
    dayHigh: num(d[6]) ?? close,
    dayLow: num(d[7]) ?? close,
    dayOpen: num(d[8]) ?? close,
    marketCap: num(d[9]),
    sector: d[10] ? String(d[10]) : null,
    week52High: num(d[11]),
    week52Low: num(d[12]),
    avgVolume30d: num(d[13]),
    dividendYield: num(d[14]),
    perf1w: num(d[15]),
    perf1m: num(d[16]),
    perf3m: num(d[17]),
    perf6m: num(d[18]),
    perf1y: num(d[19]),
  };
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build TradingView tickers for all active instruments (NSE — primary, live).
export async function getInstrumentTickers() {
  const rows = await query<{ id: string; symbol: string }>(
    `SELECT id, symbol FROM instruments WHERE is_active = true`,
  );
  const map: Record<string, { id: string; symbol: string }> = {};
  const tickers: string[] = [];
  for (const r of rows.rows) {
    const ticker = `NSE:${r.symbol}`;
    map[ticker] = { id: r.id, symbol: r.symbol };
    tickers.push(ticker);
  }
  return { map, tickers };
}

// BSE tickers (secondary — refreshed at a slower cadence).
export async function getBseTickers() {
  const rows = await query<{ id: string; symbol: string }>(
    `SELECT id, symbol FROM instruments WHERE is_active = true`,
  );
  const map: Record<string, { id: string }> = {};
  const tickers: string[] = [];
  for (const r of rows.rows) {
    const ticker = `BSE:${r.symbol}`;
    map[ticker] = { id: r.id };
    tickers.push(ticker);
  }
  return { map, tickers };
}

export interface UniverseRow {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  close: number;
  changePct: number;
  changeAbs: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  marketCap: number | null;
  sector: string | null;
  week52High: number | null;
  week52Low: number | null;
  avgVolume30d: number | null;
  dividendYield: number | null;
  pe: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  beta: number | null;
  perf1w: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf6m: number | null;
  perf1y: number | null;
}

const UNIVERSE_COLUMNS = [
  "name",
  "description",
  "exchange",
  "type",
  "close",
  "change",
  "change_abs",
  "volume",
  "high",
  "low",
  "open",
  "market_cap_basic",
  "sector",
  "price_52_week_high",
  "price_52_week_low",
  "average_volume_30d_calc",
  "dividends_yield",
  "price_earnings_ttm",
  "operating_margin",
  "net_margin",
  "beta_1_year",
  "Perf.W",
  "Perf.1M",
  "Perf.3M",
  "Perf.6M",
  "Perf.Y",
];

// Fetch the top N Indian instruments by market cap (both NSE and BSE rows).
export async function fetchUniverse(limit = 1000): Promise<UniverseRow[]> {
  const res = await fetch(SCANNER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "SMARTWATCH/1.0 (educational tool)",
      Accept: "application/json",
    },
    body: JSON.stringify({
      columns: UNIVERSE_COLUMNS,
      sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
      options: { lang: "en" },
      range: [0, limit],
    }),
  });
  if (!res.ok) throw new Error(`tradingview universe http ${res.status}`);
  const data = (await res.json()) as { data?: { s: string; d: (string | number | null)[] }[] };
  const out: UniverseRow[] = [];
  for (const row of data.data ?? []) {
    const d = row.d;
    const close = num(d[4]);
    if (close === null) continue;
    out.push({
      symbol: String(d[0] ?? row.s.replace(/^[A-Z]+:/, "")),
      name: d[1] ? String(d[1]) : String(d[0]),
      exchange: d[2] ? String(d[2]) : "NSE",
      type: d[3] ? String(d[3]) : "stock",
      close,
      changePct: num(d[5]) ?? 0,
      changeAbs: num(d[6]) ?? 0,
      volume: num(d[7]) ?? 0,
      dayHigh: num(d[8]) ?? close,
      dayLow: num(d[9]) ?? close,
      dayOpen: num(d[10]) ?? close,
      marketCap: num(d[11]),
      sector: d[12] ? String(d[12]) : null,
      week52High: num(d[13]),
      week52Low: num(d[14]),
      avgVolume30d: num(d[15]),
      dividendYield: num(d[16]),
      pe: num(d[17]),
      operatingMargin: num(d[18]),
      netMargin: num(d[19]),
      beta: num(d[20]),
      perf1w: num(d[21]),
      perf1m: num(d[22]),
      perf3m: num(d[23]),
      perf6m: num(d[24]),
      perf1y: num(d[25]),
    });
  }
  return out;
}
