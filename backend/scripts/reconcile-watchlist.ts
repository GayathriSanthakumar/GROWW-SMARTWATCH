import { query } from "../src/db/pool.js";
const UA = { "User-Agent": "Mozilla/5.0" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function yahoo(sym: string) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.NS?range=3mo&interval=1d`;
  const r = await fetch(u, { headers: UA });
  if (!r.ok) return null;
  const d = (await r.json()) as any;
  const res = d?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res || !q) return null;
  const n = Math.min(res.timestamp?.length || 0, q.close?.length || 0);
  if (n < 2) return null;
  const pts: { ts: number; close: number; open: number; high: number; low: number; vol: number }[] = [];
  for (let i = 0; i < n; i++) {
    const c = q.close[i];
    if (c != null && Number.isFinite(c)) pts.push({ ts: res.timestamp[i], close: c, open: q.open?.[i] ?? c, high: q.high?.[i] ?? c, low: q.low?.[i] ?? c, vol: q.volume?.[i] ?? 0 });
  }
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  return { ltp: last.close, prev: prev.close, open: last.open, high: last.high, low: last.low, vol: last.vol, ts: last.ts };
}
async function main() {
  const wl = await query(`SELECT w.id FROM watchlists w JOIN users u ON u.id=w.user_id AND u.is_demo_account=true`);
  const ids = new Set<string>();
  for (const w of wl.rows) {
    const r = await query(`SELECT DISTINCT instrument_id FROM watchlist_items WHERE watchlist_id=$1`, [w.id]);
    for (const x of r.rows) ids.add(x.instrument_id as string);
  }
  const set = ids;
  const ins = await query(`SELECT id, symbol FROM instruments WHERE is_active=true`);
  let ok = 0, missing = 0; const err: string[] = [];
  for (const it of ins.rows) {
    if (!set.has(it.id)) continue;
    let y: any = null;
    for (let t = 0; t < 3 && !y; t++) { y = await yahoo(it.symbol); if (!y) await sleep(300); }
    if (!y) { missing++; err.push(it.symbol); continue; }
    await query(
      `UPDATE price_ticks SET ltp=$1, prev_close=$2, day_open=COALESCE($3,day_open), day_high=COALESCE($4,day_high), day_low=COALESCE($5,day_low), volume=COALESCE($6,volume), data_status='DELAYED', updated_at=to_timestamp($7::double precision/1000) WHERE instrument_id=$8`,
      [y.ltp, y.prev, y.open, y.high, y.low, y.vol, Number.isFinite(y.ts) ? y.ts : Date.now(), it.id],
    );
    ok++; await sleep(110);
  }
  console.log(`reconciled ${ok} watchlist instruments from Yahoo NSE last close; missing ${missing}: ${err.join(",") || "none"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
