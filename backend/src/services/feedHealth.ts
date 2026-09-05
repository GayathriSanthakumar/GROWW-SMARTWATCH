// Tracks live-feed health so /api/market/status and per-instrument badges
// reflect the true source & freshness of data instead of assumptions.
//
//   source "tv"  → a successful TradingView (near-real-time NSE/BSE) sync
//   source "sim" → TradingView unreachable; deterministic simulator is running
//                  (data is clearly labelled DELAYED / DEMO DATA in the UI)

export type FeedSource = "tv" | "sim";

interface FeedState {
  source: FeedSource | null;
  lastLiveAt: number;
  lastUpdateAt: number;
}

const state: FeedState = { source: null, lastLiveAt: 0, lastUpdateAt: 0 };

export const feedHealth = {
  markLive(): void {
    state.source = "tv";
    state.lastLiveAt = Date.now();
    state.lastUpdateAt = Date.now();
  },
  markSim(): void {
    state.source = "sim";
    state.lastUpdateAt = Date.now();
  },
  // Market is closed: represent the frozen "last close" feed truthfully. source
  // stays "tv", lastUpdateAt = when quotes were actually last refreshed.
  markLastClose(atMs: number): void {
    state.source = "tv";
    state.lastLiveAt = state.lastLiveAt || atMs;
    state.lastUpdateAt = atMs;
  },
  get(): { source: FeedSource | null; lastLiveAt: number; lastUpdateAt: number; liveAgeMs: number | null; updateAgeMs: number | null } {
    return {
      source: state.source,
      lastLiveAt: state.lastLiveAt,
      lastUpdateAt: state.lastUpdateAt,
      liveAgeMs: state.lastLiveAt ? Date.now() - state.lastLiveAt : null,
      updateAgeMs: state.lastUpdateAt ? Date.now() - state.lastUpdateAt : null,
    };
  },
};
