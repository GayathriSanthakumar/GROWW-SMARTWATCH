import { query } from "../db/pool.js";

// Real-anchored candlestick generator with proper OHLC aggregation.
//
// No licensed real-time feed is configured, so this DEMO provider builds
// deterministic OHLC series that are ANCHORED to the genuine reference values we
// do store (live LTP, day open/high/low, 52-week range and trailing performance
// from the reference dataset). Intraday bars are aggregated from a 1-minute base
// series (correct open/high/low/close/volume per bucket) — not just resized.

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleInterval = "1m" | "2m" | "3m" | "5m" | "10m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";

const INTRA_AGG: Partial<Record<CandleInterval, number>> = {
  "1m": 1,
  "2m": 2,
  "3m": 3,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
};

const IST_OFFSET = 5.5 * 3600 * 1000;
const SESSION_MINUTES = 375; // 09:15 – 15:30 IST

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

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getCandles(instrumentId: string, interval: CandleInterval, limit = 200): Promise<Candle[]> {
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
  const week52High = num(r.week52_high) ?? price * 1.2;
  const week52Low = num(r.week52_low) ?? price * 0.8;
  const avgVol = num(r.avg_volume_20d) ?? 100000;
  const perf = { w: num(r.perf_1w), m: num(r.perf_1m), m3: num(r.perf_3m), m6: num(r.perf_6m), y: num(r.perf_1y) };

  const now = new Date();
  const intradayBucket = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const longBucket = `${now.getFullYear()}-${now.getMonth()}`;
  const isIntraday = INTRA_AGG[interval] !== undefined;
  const bucket = isIntraday ? intradayBucket : longBucket;
  const rng = mulberry32(hashSymbol(symbol + interval + bucket) + 1);

  let candles: Candle[];

  if (isIntraday) {
    const base = baseMinuteCandles(dayOpen, price, avgVol, rng);
    candles = aggregate(base, INTRA_AGG[interval]!);
  } else if (interval === "1h" || interval === "4h") {
    const daily = buildDailySeries(90, price, perf, week52High, week52Low, rng);
    candles = synthesizeIntraday(daily, interval === "1h" ? 6 : 2, rng);
  } else if (interval === "1d") {
    candles = buildDailySeries(limit, price, perf, week52High, week52Low, rng);
  } else if (interval === "1w") {
    const daily = buildDailySeries(limit * 7, price, perf, week52High, week52Low, rng);
    candles = aggregateDaily(daily, 7);
  } else {
    const daily = buildDailySeries(limit * 30, price, perf, week52High, week52Low, rng);
    candles = aggregateDaily(daily, 30);
  }

  if (candles.length > limit) candles = candles.slice(candles.length - limit);
  return candles;
}

// 1-minute base series for the current trading session (09:15–15:30 IST).
// Uses realistic per-minute volatility (small moves, not exaggerated wicks) so
// candle bodies and wicks are proportional to genuine intraday movement.
function baseMinuteCandles(dayOpen: number, price: number, avgVol: number, rng: () => number): Candle[] {
  const perMinVol = price * 0.0005; // ~0.05% per minute
  const wick = price * 0.0006; // ~0.06% wick beyond body

  const closes: number[] = [];
  let cur = dayOpen;
  for (let m = 0; m < SESSION_MINUTES; m++) {
    const t = (m + 1) / SESSION_MINUTES;
    const target = dayOpen + (price - dayOpen) * t;
    cur = target + (rng() - 0.5) * 2 * perMinVol;
    closes.push(cur);
  }
  closes[SESSION_MINUTES - 1] = price;

  const start = sessionOpenTs(new Date());
  const out: Candle[] = [];
  for (let m = 0; m < SESSION_MINUTES; m++) {
    const open = m === 0 ? dayOpen : closes[m - 1];
    const close = closes[m];
    // body between open→close; small wicks beyond body only
    const hi = Math.max(open, close) + rng() * wick;
    const lo = Math.min(open, close) - rng() * wick;
    out.push({
      ts: new Date(start + m * 60000).toISOString(),
      open: r2(open),
      high: r2(hi),
      low: r2(lo),
      close: r2(close),
      volume: Math.round((avgVol / SESSION_MINUTES) * (0.4 + rng() * 1.2)),
    });
  }
  return out;
}

function aggregate(candles: Candle[], minutes: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += minutes) {
    const bucket = candles.slice(i, i + minutes);
    if (bucket.length === 0) continue;
    out.push({
      ts: bucket[0].ts,
      open: bucket[0].open,
      high: Math.max(...bucket.map((c) => c.high)),
      low: Math.min(...bucket.map((c) => c.low)),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

function buildDailySeries(limit: number, price: number, perf: { w: number | null; m: number | null; m3: number | null; m6: number | null; y: number | null }, week52High: number, week52Low: number, rng: () => number): Candle[] {
  // clamp closes to the real 52-week band so bodies never sit outside the range
  const closes = anchoredCloses(limit, price, perf, rng).map((c) => Math.max(week52Low, Math.min(week52High, c)));
  const dayMs = 86400000;
  const now = Date.now();
  const out: Candle[] = [];
  for (let i = 0; i < closes.length; i++) {
    const open = i === 0 ? closes[i] : closes[i - 1];
    const close = closes[i];
    const hi = Math.max(open, close) * (1 + rng() * 0.006);
    const lo = Math.min(open, close) * (1 - rng() * 0.006);
    out.push({
      ts: new Date(now - (closes.length - 1 - i) * dayMs).toISOString(),
      open: r2(open),
      high: r2(Math.min(hi, week52High)),
      low: r2(Math.max(lo, week52Low)),
      close: r2(close),
      volume: Math.round(100000 + rng() * 900000),
    });
  }
  // force the last candle to end at the real LTP with a valid high/low
  const last = out[out.length - 1];
  last.close = price;
  last.high = Math.max(last.high, last.open, price);
  last.low = Math.min(last.low, last.open, price);
  return out;
}

function aggregateDaily(daily: Candle[], n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < daily.length; i += n) {
    const bucket = daily.slice(i, i + n);
    if (bucket.length === 0) continue;
    out.push({
      ts: bucket[0].ts,
      open: bucket[0].open,
      high: Math.max(...bucket.map((c) => c.high)),
      low: Math.min(...bucket.map((c) => c.low)),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// Synthesise intraday bars (1h/4h) from daily OHLC, bridging prev close → close.
function synthesizeIntraday(daily: Candle[], barsPerDay: number, rng: () => number): Candle[] {
  const out: Candle[] = [];
  for (const d of daily) {
    const prevClose = out.length ? out[out.length - 1].close : d.open;
    for (let b = 0; b < barsPerDay; b++) {
      const t = (b + 1) / barsPerDay;
      const target = prevClose + (d.close - prevClose) * t;
      const close = b === barsPerDay - 1 ? d.close : target + (rng() - 0.5) * d.close * 0.0015;
      const open = b === 0 ? prevClose : out[out.length - 1].close;
      const wick = d.close * 0.0008;
      out.push({
        ts: new Date(new Date(d.ts).getTime() + b * (3600 * 1000)).toISOString(),
        open: r2(open),
        high: r2(Math.max(open, close) + rng() * wick),
        low: r2(Math.min(open, close) - rng() * wick),
        close: r2(close),
        volume: Math.round(d.volume / barsPerDay),
      });
    }
  }
  return out;
}

function anchoredCloses(limit: number, price: number, perf: { w: number | null; m: number | null; m3: number | null; m6: number | null; y: number | null }, rng: () => number): number[] {
  const maxDays = limit - 1;
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
  const idxOf = (d: number) => limit - 1 - d;

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
    cur = cur / (1 + (rng() - 0.45) * 0.015);
    closes[k] = Math.max(0.1, cur);
  }
  return closes;
}

function sessionOpenTs(date: Date): number {
  const ist = date.getTime() + IST_OFFSET;
  const d = new Date(ist);
  const openUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 15, 0);
  return openUtc - IST_OFFSET;
}
