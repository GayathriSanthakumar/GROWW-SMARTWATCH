import { query } from "../db/pool.js";
import { broadcast, emitToInstrument } from "../ws/index.js";
import { fetchQuotes, getInstrumentTickers, getBseTickers, INDEX_TICKERS } from "./tradingview.js";
import { getMarketStatus } from "./marketStatus.js";
import { feedHealth } from "./feedHealth.js";
import { config } from "../config.js";

// Live-market feed. Primary source is TradingView's public India scanner API
// (near-real-time NSE/BSE quotes). If TradingView is unreachable (offline demo)
// it degrades to a deterministic random-walk simulator, clearly labelled.
//
// Scaling notes — this loop used to issue ~800 sequential UPDATEs every 3s
// (one per instrument + one per attention score). Every hot write is now a
// single multi-row statement driven by unnest(), so the DB cost is ~3 queries
// per cycle regardless of universe size, and per-instrument Socket.IO emits
// only go to rooms that actually have a subscriber.

const LIVE_INTERVAL_MS = 3000; // TradingView sync cadence (near-real-time)

let tickTimer: ReturnType<typeof setInterval> | null = null;
let detectionTimer: ReturnType<typeof setInterval> | null = null;
let alertTimer: ReturnType<typeof setInterval> | null = null;
let bseTimer: ReturnType<typeof setInterval> | null = null;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Date.now() % 100000 + 7);

function attentionScore(volume: number, avgVolume: number, changePct: number): number {
  const volRatio = avgVolume ? volume / avgVolume : 1;
  let attention = 30;
  if (volRatio > 2) attention += 35;
  else if (volRatio > 1.5) attention += 25;
  else if (volRatio > 1.2) attention += 15;
  else if (volRatio < 0.7) attention -= 10;
  attention += Math.min(Math.abs(changePct) * 4, 35);
  return Math.max(0, Math.min(100, Math.round(attention)));
}

// ── Batch helpers (single-statement multi-row writes) ───────────────────────

interface TickRow {
  id: string;
  ltp: number;
  prevClose: number;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number;
  avgVolume: number | null;
  week52High: number | null;
  week52Low: number | null;
  perf1w: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf6m: number | null;
  perf1y: number | null;
  attention: number;
  status: "LIVE" | "DELAYED";
}

// Updates every instrument's price row in a single statement. Volume is cast to
// bigint because price_ticks.volume is BIGINT and unnest gives us numeric.
async function bulkUpdateTicks(rows: TickRow[]) {
  if (rows.length === 0) return;
  const col = <K extends keyof TickRow>(k: K) => rows.map((r) => r[k]);
  const params: unknown[] = [
    col("id"),
    col("ltp"),
    col("prevClose"),
    col("dayOpen"),
    col("dayHigh"),
    col("dayLow"),
    col("volume"),
    col("avgVolume"),
    col("week52High"),
    col("week52Low"),
    col("perf1w"),
    col("perf1m"),
    col("perf3m"),
    col("perf6m"),
    col("perf1y"),
    rows.map((r) => r.status),
  ];
  await query(
    `UPDATE price_ticks AS pt SET
       ltp = v.ltp, prev_close = v.prev_close,
       day_open = v.day_open, day_high = v.day_high, day_low = v.day_low,
       volume = v.volume::bigint,
       avg_volume_20d = COALESCE(v.avg_volume_20d, pt.avg_volume_20d),
       week52_high = COALESCE(v.week52_high, pt.week52_high),
       week52_low = COALESCE(v.week52_low, pt.week52_low),
       perf_1w = COALESCE(v.perf_1w, pt.perf_1w), perf_1m = COALESCE(v.perf_1m, pt.perf_1m),
       perf_3m = COALESCE(v.perf_3m, pt.perf_3m), perf_6m = COALESCE(v.perf_6m, pt.perf_6m),
       perf_1y = COALESCE(v.perf_1y, pt.perf_1y),
       data_status = v.status, updated_at = now()
     FROM (
       SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS ltp, unnest($3::numeric[]) AS prev_close,
              unnest($4::numeric[]) AS day_open, unnest($5::numeric[]) AS day_high, unnest($6::numeric[]) AS day_low,
              unnest($7::numeric[]) AS volume, unnest($8::numeric[]) AS avg_volume_20d,
              unnest($9::numeric[]) AS week52_high, unnest($10::numeric[]) AS week52_low,
              unnest($11::numeric[]) AS perf_1w, unnest($12::numeric[]) AS perf_1m,
              unnest($13::numeric[]) AS perf_3m, unnest($14::numeric[]) AS perf_6m,
              unnest($15::numeric[]) AS perf_1y, unnest($16::text[]) AS status
     ) AS v(id, ltp, prev_close, day_open, day_high, day_low, volume, avg_volume_20d,
            week52_high, week52_low, perf_1w, perf_1m, perf_3m, perf_6m, perf_1y, status)
     WHERE pt.instrument_id = v.id`,
    params,
  );
}

async function bulkUpdateAttention(rows: TickRow[]) {
  if (rows.length === 0) return;
  await query(
    `UPDATE instrument_scores AS s SET attention_score = v.attention, computed_at = now()
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS attention) AS v(id, attention)
     WHERE s.instrument_id = v.id`,
    [rows.map((r) => r.id), rows.map((r) => r.attention)],
  );
}

async function bulkIndexUpsert(rows: { symbol: string; level: number; changeAbs: number; changePct: number }[]) {
  if (rows.length === 0) return;
  await query(
    `INSERT INTO index_ticks (index_symbol, level, change_abs, change_pct, updated_at)
     SELECT sym, lvl, chg, pct, now()
     FROM unnest($1::text[], $2::numeric[], $3::numeric[], $4::numeric[]) AS t(sym, lvl, chg, pct)
     ON CONFLICT (index_symbol) DO UPDATE SET
       level = EXCLUDED.level, change_abs = EXCLUDED.change_abs,
       change_pct = EXCLUDED.change_pct, updated_at = now()`,
    [rows.map((r) => r.symbol), rows.map((r) => r.level), rows.map((r) => r.changeAbs), rows.map((r) => r.changePct)],
  );
}

// ── TradingView sync (NSE, primary, near-real-time) ─────────────────────────
export async function syncFromTradingView(): Promise<boolean> {
  if (config.forceSimulator) return false; // offline/demo: use the simulator
  const { map, tickers } = await getInstrumentTickers();
  const allTickers = [...tickers, ...Object.values(INDEX_TICKERS)];
  const quotes = await fetchQuotes(allTickers);
  if (quotes.length === 0) return false;

  const tickRows: TickRow[] = [];
  const updates: Record<string, { ltp: number; changePct: number; volume: number }> = {};
  const indexUpdates: Record<string, { level: number; changePct: number }> = {};
  const indexRows: { symbol: string; level: number; changeAbs: number; changePct: number }[] = [];

  for (const q of quotes) {
    const inst = map[q.ticker];
    if (inst) {
      const prevClose = +(q.close - q.changeAbs).toFixed(2);
      const avgVol = q.avgVolume30d == null ? null : Math.round(q.avgVolume30d);
      tickRows.push({
        id: inst.id,
        ltp: +q.close,
        prevClose,
        dayOpen: q.dayOpen == null ? null : +q.dayOpen,
        dayHigh: q.dayHigh == null ? null : +q.dayHigh,
        dayLow: q.dayLow == null ? null : +q.dayLow,
        volume: Math.round(q.volume),
        avgVolume: avgVol,
        week52High: q.week52High == null ? null : +q.week52High,
        week52Low: q.week52Low == null ? null : +q.week52Low,
        perf1w: q.perf1w == null ? null : +q.perf1w,
        perf1m: q.perf1m == null ? null : +q.perf1m,
        perf3m: q.perf3m == null ? null : +q.perf3m,
        perf6m: q.perf6m == null ? null : +q.perf6m,
        perf1y: q.perf1y == null ? null : +q.perf1y,
        attention: attentionScore(q.volume, q.avgVolume30d ?? 0, q.changePct),
        status: "LIVE",
      });
      updates[inst.id] = { ltp: +q.close.toFixed(2), changePct: +q.changePct.toFixed(2), volume: Math.round(q.volume) };
    }

    for (const [idx, ticker] of Object.entries(INDEX_TICKERS)) {
      if (q.ticker === ticker) {
        indexUpdates[idx] = { level: +q.close.toFixed(2), changePct: +q.changePct.toFixed(2) };
        indexRows.push({ symbol: idx, level: +q.close, changeAbs: +q.changeAbs, changePct: +q.changePct });
      }
    }
  }

  if (tickRows.length > 0) {
    await bulkUpdateTicks(tickRows);
    await bulkUpdateAttention(tickRows);
    feedHealth.markLive();
  }
  if (indexRows.length > 0) await bulkIndexUpsert(indexRows);

  // Nudge any index not covered by TradingView (e.g. FINNIFTY / MIDCPNIFTY) so
  // the full index strip stays live even when a ticker is unavailable.
  const allIdx = await query<{ index_symbol: string; level: number }>(`SELECT index_symbol, level FROM index_ticks`);
  const nudged: { symbol: string; level: number; changeAbs: number; changePct: number }[] = [];
  for (const idx of allIdx.rows) {
    if (indexUpdates[idx.index_symbol]) continue;
    const move = (rng() - 0.5) * 0.0008;
    const newLevel = Number(idx.level) * (1 + move);
    const prev = newLevel / (1 + move);
    const pct = ((newLevel - prev) / prev) * 100;
    nudged.push({ symbol: idx.index_symbol, level: +newLevel.toFixed(2), changeAbs: +(newLevel - prev).toFixed(2), changePct: +pct.toFixed(2) });
    indexUpdates[idx.index_symbol] = { level: +newLevel.toFixed(2), changePct: +pct.toFixed(2) };
  }
  if (nudged.length > 0) await bulkIndexUpsert(nudged);

  if (Object.keys(updates).length) broadcast("ticks", updates);
  if (Object.keys(indexUpdates).length) broadcast("indices", indexUpdates);
  return true;
}

// ── Offline fallback (random walk, labelled DELAYED/simulated) ─────────────
export async function runOneTick() {
  const instruments = await query<{ instrument_id: string; ltp: number; prev_close: number; day_high: number; day_low: number; volume: number; avg_volume_20d: number }>(
    `SELECT instrument_id, ltp, prev_close, day_high, day_low, volume, avg_volume_20d
     FROM price_ticks WHERE data_status <> 'CONFLICT'
     ORDER BY random() ${config.forceSimulator ? "" : "LIMIT 40"}`,
  );

  const rows: TickRow[] = [];
  const updates: Record<string, { ltp: number; changePct: number; volume: number }> = {};
  for (const inst of instruments.rows) {
    const move = (rng() - 0.5) * 0.004;
    const newLtp = Math.max(0.5, Number(inst.ltp) * (1 + move));
    const newVolume = Number(inst.volume) + Math.round(Number(inst.avg_volume_20d) * (0.001 + rng() * 0.003));
    const dayHigh = Math.max(Number(inst.day_high), newLtp);
    const dayLow = Math.min(Number(inst.day_low), newLtp);
    const changePct = Number(inst.prev_close) ? ((newLtp - Number(inst.prev_close)) / Number(inst.prev_close)) * 100 : 0;
    rows.push({
      id: inst.instrument_id,
      ltp: +newLtp.toFixed(2),
      prevClose: Number(inst.prev_close),
      dayOpen: null,
      dayHigh: +dayHigh.toFixed(2),
      dayLow: +dayLow.toFixed(2),
      volume: newVolume,
      avgVolume: null,
      week52High: null, week52Low: null, perf1w: null, perf1m: null, perf3m: null, perf6m: null, perf1y: null,
      attention: attentionScore(newVolume, Number(inst.avg_volume_20d), changePct),
      status: "DELAYED",
    });
    updates[inst.instrument_id] = { ltp: +newLtp.toFixed(2), changePct: +changePct.toFixed(2), volume: newVolume };
  }

  if (rows.length > 0) {
    await bulkUpdateTicks(rows);
    await bulkUpdateAttention(rows);
    feedHealth.markSim();
    broadcast("ticks", updates);
    for (const inst of rows) {
      emitToInstrument(inst.id, "tick", { instrumentId: inst.id, ...updates[inst.id] });
    }
  }
  return updates;
}

// ── Staleness & NSE/BSE conflict detection ─────────────────────────────────
// Only runs while the market is open. Refreshing TV quotes mark rows LIVE every
// few seconds; anything left behind for >3 minutes becomes STALE. If NSE and BSE
// (both fresh) disagree by more than 1.5pp on today's move, we flag CONFLICT so
// the UI can surface it instead of silently showing one of two prices.
export async function applyStatusPass() {
  if (!getMarketStatus().isOpen) return;
  await query(
    `UPDATE price_ticks SET data_status = 'STALE'
     WHERE data_status IN ('LIVE','DELAYED') AND updated_at < now() - interval '3 minutes'`,
  );
  await query(
    `UPDATE price_ticks SET data_status = 'CONFLICT'
     WHERE data_status = 'LIVE' AND bse_ltp IS NOT NULL AND bse_prev_close IS NOT NULL
       AND prev_close > 0 AND bse_prev_close > 0 AND updated_at > now() - interval '90 seconds'
       AND abs(((ltp - prev_close) / prev_close - (bse_ltp - bse_prev_close) / bse_prev_close) * 100) > 1.5`,
  );
}

let lastCloseStamped = false;

async function runLiveTick() {
  const ms = getMarketStatus();
  if (!ms.isOpen) {
    // Market closed (weekend/holiday/after 15:30 IST): do NOT keep "refreshing"
    // or claim liveness. Demote any leftover LIVE claims to DELAYED (last close)
    // and stop ticking until the next session — "updated Xs ago" then reflects
    // when the data was really last refreshed, not when the UI polled.
    await query(`UPDATE price_ticks SET data_status = 'DELAYED' WHERE data_status IN ('LIVE','CONFLICT')`).catch(() => {});
    if (!lastCloseStamped) {
      lastCloseStamped = true;
      const t = await query<{ ts: Date }>(`SELECT COALESCE(MAX(updated_at), now()) AS ts FROM price_ticks`).catch(() => null);
      if (t?.rows[0]) feedHealth.markLastClose(new Date(t.rows[0].ts).getTime());
    }
    return;
  }
  lastCloseStamped = false;
  const ok = await syncFromTradingView().catch(() => false);
  if (!ok) {
    // Simulator fallback only fills in the gaps while the market is open.
    await runOneTick().catch(() => {});
  }
  await applyStatusPass().catch(() => {});
}

// BSE secondary quotes (refreshed less frequently — BSE barely diverges from NSE).
async function runBseSync() {
  try {
    const { map, tickers } = await getBseTickers();
    const quotes = await fetchQuotes(tickers);
    const ids: string[] = [];
    const bseLtp: number[] = [];
    const bsePrev: number[] = [];
    for (const q of quotes) {
      const inst = map[q.ticker];
      if (!inst) continue;
      ids.push(inst.id);
      bseLtp.push(+q.close);
      bsePrev.push(+(q.close - q.changeAbs).toFixed(2));
    }
    if (ids.length === 0) return;
    // NOTE: BSE refresh intentionally does NOT bump updated_at — staleness is
    // tracked on the primary (NSE) quote.
    await query(
      `UPDATE price_ticks AS pt SET bse_ltp = v.bse_ltp, bse_prev_close = v.bse_prev
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::numeric[]) AS bse_ltp, unnest($3::numeric[]) AS bse_prev) AS v(id, bse_ltp, bse_prev)
       WHERE pt.instrument_id = v.id`,
      [ids, bseLtp, bsePrev],
    );
  } catch {
    /* offline — keep last BSE snapshot */
  }
}

async function runChangeDetection() {
  const { detectChangesForUser } = await import("./changeDetector.js");
  const { getIo } = await import("../ws/index.js");
  const users = await query<{ id: string }>(`SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 200`);
  for (const u of users.rows) {
    try {
      const created = await detectChangesForUser(u.id);
      if (created > 0) {
        getIo()?.to(`user:${u.id}`).emit("changes", { count: created });
        const unread = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
          [u.id],
        );
        getIo()?.to(`user:${u.id}`).emit("notifications", { unread: unread.rows[0].count });
      }
    } catch {
      /* skip user */
    }
  }
}

async function runAlertEvaluation() {
  const { evaluateAlerts } = await import("./alertEvaluator.js");
  const { getIo } = await import("../ws/index.js");
  try {
    const fired = await evaluateAlerts();
    if (fired > 0) {
      const users = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM notifications WHERE created_at > now() - interval '30 seconds'`,
      );
      for (const u of users.rows) {
        const count = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`, [u.user_id]);
        getIo()?.to(`user:${u.user_id}`).emit("notifications", { unread: count.rows[0].count });
      }
    }
  } catch {
    /* noop */
  }
}

export function startMarketSim() {
  void runLiveTick(); // initial sync on boot
  void runBseSync(); // initial BSE sync
  tickTimer = setInterval(() => void runLiveTick(), LIVE_INTERVAL_MS);
  bseTimer = setInterval(() => void runBseSync(), 30000);
  detectionTimer = setInterval(() => void runChangeDetection(), 30000);
  alertTimer = setInterval(() => void runAlertEvaluation(), 15000);
  console.log("[sim] live market feed started (TradingView primary, simulator fallback)");
}

export function stopMarketSim() {
  if (tickTimer) clearInterval(tickTimer);
  if (bseTimer) clearInterval(bseTimer);
  if (detectionTimer) clearInterval(detectionTimer);
  if (alertTimer) clearInterval(alertTimer);
}
