import { query } from "../db/pool.js";

// Real-anchored candlestick generator. TradingView exposes real end-of-day
// quotes, 52-week range and trailing performance (1W/1M/3M/6M/1Y) but no public
// REST candle history, so each timeframe series is generated deterministically
// and ANCHORED to those real values: intraday bars end at the real LTP and span
// the real day open/high/low; daily/weekly/monthly bars end at the real LTP and
// pass through the real trailing-performance points.

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleInterval = "5m" | "15m" | "1h" | "1d" | "1w" | "1M";

const INTERVAL_MS: Record<CandleInterval, number> = {
  "5m": 5 * 60000,
  "15m": 15 * 60000,
  "1h": 60 * 60000,
  "1d": 86400000,
  "1w": 7 * 86400000,
  "1M": 30 * 86400000,
};

function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getCandles(instrumentId: string, interval: CandleInterval, limit = 75): Promise<Candle[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT i.symbol, pt.ltp, pt.prev_close, pt.day_open, pt.day_high, pt.day_low,
            pt.week52_high, pt.week52_low, pt.perf_1w, pt.perf_1m, pt.perf_3m, pt.perf_6m, pt.perf_1y, pt.avg_volume_20d
     FROM instruments i
     LEFT JOIN price_ticks pt ON pt.instrument_id = i.id
     WHERE i.id = $1`,
    [instrumentId],
  );
  const r = rows.rows[0];
  if (!r || num(r.ltp) === null) return [];

  const symbol = String(r.symbol);
  const price = num(r.ltp)!;
  const dayOpen = num(r.day_open) ?? price;
  const dayHigh = num(r.day_high) ?? price;
  const dayLow = num(r.day_low) ?? price;
  const week52High = num(r.week52_high) ?? price * 1.2;
  const week52Low = num(r.week52_low) ?? price * 0.8;
  const avgVol = num(r.avg_volume_20d) ?? 100000;
  const perf = {
    w: num(r.perf_1w),
    m: num(r.perf_1m),
    m3: num(r.perf_3m),
    m6: num(r.perf_6m),
    y: num(r.perf_1y),
  };

  // deterministic seed: stable within the day for intraday, within the month for long ranges
  const now = new Date();
  const bucket = interval === "5m" || interval === "15m" || interval === "1h"
    ? `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    : `${now.getFullYear()}-${now.getMonth()}`;
  const rng = mulberry32(hashSymbol(symbol + interval + bucket) + 1);

  const range = Math.max(dayHigh - dayLow, price * 0.02);
  const volScale = range / price;

  let closes: number[];
  let tsStep = INTERVAL_MS[interval];

  if (interval === "5m" || interval === "15m" || interval === "1h") {
    closes = intradayCloses(dayOpen, price, limit, rng, volScale);
  } else if (interval === "1d") {
    closes = anchoredCloses(limit, price, perf, 1, rng);
  } else if (interval === "1w") {
    closes = anchoredCloses(limit, price, perf, 7, rng);
  } else {
    closes = anchoredCloses(limit, price, perf, 30, rng);
  }

  const candles: Candle[] = [];
  for (let i = 0; i < closes.length; i++) {
    const open = i === 0 ? (interval === "5m" || interval === "15m" || interval === "1h" ? dayOpen : closes[i]) : closes[i - 1];
    const close = closes[i];
    const hi = Math.max(open, close) * (1 + rng() * volScale * 0.5);
    const lo = Math.min(open, close) * (1 - rng() * volScale * 0.5);
    const ts = new Date(now.getTime() - (closes.length - 1 - i) * tsStep).toISOString();
    candles.push({
      ts,
      open: +open.toFixed(2),
      high: +Math.max(hi, Math.max(open, close)).toFixed(2),
      low: +Math.min(lo, Math.min(open, close)).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(avgVol * (0.6 + rng() * 0.8)),
    });
  }

  // clamp intraday extremes to the real day high/low
  if (interval === "5m" || interval === "15m" || interval === "1h") {
    for (const c of candles) {
      c.high = Math.min(c.high, dayHigh * 1.01);
      c.low = Math.max(c.low, dayLow * 0.99);
    }
    candles[candles.length - 1].close = price;
  }

  // clamp long-range extremes to the real 52-week band
  if (interval === "1d" || interval === "1w" || interval === "1M") {
    const lo = week52Low * 0.97;
    const hi = week52High * 1.03;
    for (const c of candles) {
      c.high = Math.min(c.high, hi);
      c.low = Math.max(c.low, lo);
    }
    candles[candles.length - 1].close = price;
  }

  return candles;
}

function intradayCloses(dayOpen: number, price: number, limit: number, rng: () => number, volScale: number): number[] {
  const out: number[] = [];
  let cur = dayOpen;
  for (let k = 0; k < limit; k++) {
    const t = (k + 1) / limit;
    const target = dayOpen + (price - dayOpen) * t;
    cur = target + (rng() - 0.5) * price * volScale * 0.8;
    out.push(Math.max(0.1, cur));
  }
  out[limit - 1] = price;
  return out;
}

function anchoredCloses(limit: number, price: number, perf: { w: number | null; m: number | null; m3: number | null; m6: number | null; y: number | null }, daysPerCandle: number, rng: () => number): number[] {
  const maxDays = (limit - 1) * daysPerCandle;
  const anchors: { d: number; p: number }[] = [{ d: 0, p: price }];
  const add = (days: number, pct: number | null) => {
    if (pct != null) anchors.push({ d: days, p: price / (1 + pct / 100) });
  };
  add(7, perf.w);
  add(21, perf.m);
  add(63, perf.m3);
  add(126, perf.m6);
  add(252, perf.y);

  const within = anchors.filter((a) => a.d <= maxDays).sort((a, b) => a.d - b.d);
  const closes = new Array(limit).fill(price);
  const idxOf = (d: number) => limit - 1 - Math.round(d / daysPerCandle);

  for (let i = within.length - 1; i > 0; i--) {
    const older = within[i];
    const newer = within[i - 1];
    const iO = idxOf(older.d);
    const iN = idxOf(newer.d);
    closes[iO] = older.p;
    closes[iN] = newer.p;
    let cur = older.p;
    for (let k = iO + 1; k < iN; k++) {
      const t = (k - iO) / Math.max(iN - iO, 1);
      const target = older.p + (newer.p - older.p) * t;
      cur = target + (rng() - 0.5) * Math.abs(newer.p - older.p) * 0.08;
      closes[k] = Math.max(0.1, cur);
    }
  }

  const oldest = within[within.length - 1];
  const iOld = idxOf(oldest.d);
  let cur = oldest.p;
  for (let k = iOld - 1; k >= 0; k--) {
    cur = cur / (1 + (rng() - 0.45) * 0.03);
    closes[k] = Math.max(0.1, cur);
  }

  return closes;
}
