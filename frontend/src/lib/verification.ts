// Tickers whose stored quote could not be verified against an external source
// at submission time (Yahoo/TradingView returned no data). We never fake a
// number for these — surfaces show a small "verification pending" flag instead
// of presenting the value with false confidence. Remove entries as soon as a
// licensed feed (Kite/Upstox) verifies them.
export const PRICE_VERIFY_PENDING = new Set<string>(["TATAMOTORS"]);

export function isPriceVerificationPending(symbol: string): boolean {
  return PRICE_VERIFY_PENDING.has(symbol.toUpperCase());
}
