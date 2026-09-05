// Trend/1D consistency sanity check.
// Asserts: for every stock, sign(sparkline_last - sparkline_first) === sign(1D %)
// where the sparkline series is built exactly like the UI does: real intraday
// (15m) closes, anchored at the actual previous close, last point = live price.
// Usage: node backend/scripts/trend-consistency.mjs   (backend running)
const BASE = process.env.BASE || "http://127.0.0.1:4000";

async function login() {
  const r = await fetch(`${BASE}/api/demo/enter`, { method: "POST" });
  return r.headers.getSetCookie().join("; ");
}
async function j(cookie, url, opts) {
  const r = await fetch(`${BASE}${url}`, { ...opts, headers: { Cookie: cookie, ...(opts && opts.headers) } });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.json();
}
const buildSeries = (closes, ltp, prevClose) => {
  if (closes && closes.length >= 2) {
    const s = [...closes];
    s[s.length - 1] = ltp;
    const gap = prevClose > 0 && Math.abs(s[0] - prevClose) / prevClose > 0.0005;
    if (gap) s.unshift(prevClose);
    return s;
  }
  if (prevClose > 0 && ltp > 0) return [prevClose, ltp];
  return null;
};
const sign = (x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0);

async function check(cookie, list, label) {
  const mismatches = [];
  let tested = 0;
  for (const it of list) {
    if (!it.prevClose || !it.ltp) continue;
    const batch = await j(cookie, "/api/instruments/candles/batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrumentIds: [it.id], interval: "5m", limit: 60 }),
    });
    const closes = (batch.candles[it.id] || []).map((c) => Number(c.close));
    const pts = buildSeries(closes, Number(it.ltp), Number(it.prevClose));
    if (!pts || pts.length < 2) continue;
    tested++;
    const net = pts[pts.length - 1] - pts[0];
    const changePct = Number(it.changePct || 0);
    const meaningful = Math.abs(changePct) >= 0.05; // ignore ~0.00% rounding noise
    const netRel = Math.abs(net) / (pts[0] || 1);
    let bad = false;
    if (meaningful && sign(net) !== sign(changePct)) bad = true;
    else if (!meaningful && netRel > 0.001) bad = true; // claimed flat but line visibly moves >0.1%
    if (bad) {
      mismatches.push({ symbol: it.symbol, changePct, first: pts[0], last: pts[pts.length - 1], net, n: pts.length });
    }
  }
  console.log(`\n${label}: tested=${tested} mismatches=${mismatches.length}`);
  for (const m of mismatches) console.log("   MISMATCH", JSON.stringify(m));
  return mismatches.length;
}

(async () => {
  const cookie = await login();
  const wl = await j(cookie, "/api/watchlists");
  const items = wl.watchlists.length ? (await j(cookie, `/api/watchlists/${wl.watchlists[0].id}/items`)).items : [];
  const m1 = await check(cookie, items, "Demo watchlist stocks");

  const search = await j(cookie, "/api/instruments/search?q=e&limit=30");
  const m2 = await check(cookie, (search.results || []).slice(0, 20), "Broader universe sample (20)");

  console.log(m1 + m2 === 0 ? "\nRESULT: PASS — sparkline direction matches 1D% everywhere." : "\nRESULT: FAIL");
  process.exit(m1 + m2 === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
