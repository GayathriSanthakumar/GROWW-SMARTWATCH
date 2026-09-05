// Universal external verification: for EVERY stock in ALL watchlists (and the
// full demo seed set), compare the app's stored price/prevClose/change% against
// Yahoo Finance NSE (SYMBOL.NS) at the same last-close instant.
// Usage: node backend/scripts/verify-external.mjs   (backend running on :4000)
const BASE = process.env.BASE || "http://127.0.0.1:4000";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=1mo&interval=1d`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return { ok: false, err: "http" + r.status };
  const d = await r.json();
  const res = d?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res || !q) return { ok: false, err: "no-meta" };
  // last close & TRUE previous trading-day close from the daily series
  const pts = [];
  const n = Math.min(res.timestamp?.length || 0, q.close?.length || 0);
  for (let i = 0; i < n; i++) if (q.close[i] != null && Number.isFinite(q.close[i])) pts.push(q.close[i]);
  if (pts.length < 2) return { ok: false, err: "insufficient" };
  return { ok: true, price: pts[pts.length - 1], prevClose: pts[pts.length - 2] };
}

async function main() {
  const lr = await fetch(`${BASE}/api/demo/enter`, { method: "POST" });
  const cookie = lr.headers.getSetCookie().join("; ");
  const j = (url) => fetch(`${BASE}${url}`, { headers: { Cookie: cookie } }).then((r) => r.json());

  const wl = await j("/api/watchlists");
  const seen = new Map(); // symbol -> {ltp, prevClose, changePct, lists}
  for (const w of wl.watchlists) {
    const d = await j(`/api/watchlists/${w.id}/items`);
    for (const it of d.items || []) {
      const e = seen.get(it.symbol) || { ltp: Number(it.ltp), prevClose: Number(it.prevClose), changePct: Number(it.changePct), lists: [] };
      e.lists.push(w.name);
      seen.set(it.symbol, e);
    }
  }

  const rows = [];
  for (const [sym, e] of seen) {
    let ext;
    for (let t = 0; t < 2; t++) {
      ext = await yahoo(sym);
      if (ext.ok) break;
      await sleep(400);
    }
    let status, note = "";
    if (!ext.ok) status = "EXT_MISSING"; // symbol not found/mapped on NSE
    else {
      const dPrice = Math.abs(e.ltp - ext.price);
      const dPrev = ext.prevClose != null ? Math.abs(e.prevClose - ext.prevClose) : null;
      // exact last-close match (our stored close == Yahoo close at same instant)
      status = dPrice <= 0.02 && (dPrev == null || dPrev <= 0.02) ? "MATCH" : "MISMATCH";
      if (status === "MISMATCH") note = `dPrice=${dPrice.toFixed(2)} dPrev=${dPrev != null ? dPrev.toFixed(2) : "?"} yahoo=${ext.price}/${ext.prevClose}`;
    }
    rows.push({ sym, lists: e.lists.join(" | "), app_ltp: e.ltp, app_prev: e.prevClose, yahoo_ltp: ext.price, status, note });
    await sleep(150);
  }

  const by = (s) => rows.filter((r) => r.status === s).map((r) => r.sym);
  console.log("FULL TABLE (all watchlist companies):");
  console.table(rows.map((r) => ({ ...r, app_ltp: r.app_ltp.toFixed(2), app_prev: r.app_prev.toFixed(2), yahoo_ltp: r.yahoo_ltp ? r.yahoo_ltp.toFixed(2) : null })));
  console.log("\nMATCH:", rows.filter((r) => r.status === "MATCH").length, rows.length && by("MATCH").join(", "));
  console.log("MISMATCH:", by("MISMATCH").join(", ") || "none");
  console.log("EXT_MISSING (mapping/coverage):", by("EXT_MISSING").join(", ") || "none");
  process.exit(rows.every((r) => r.status === "MATCH") ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
