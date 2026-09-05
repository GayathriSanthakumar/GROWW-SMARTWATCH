// Exchange-qualified symbol formatting for Indian equities.
// TradingView scanner / backend resolves NSE listings via fully-qualified
// tickers like "NSE:HDFCBANK". This guarantees a raw symbol can never be
// ambiguous between exchanges.

export type Exchange = "NSE" | "BSE";

export function formatTradingViewSymbol(symbol: string, exchange: Exchange = "NSE"): string {
  const s = (symbol || "").trim().toUpperCase();
  if (!s) return "";
  if (/^NSE:|^BSE:/.test(s)) return s; // already qualified
  return `${exchange}:${s}`;
}

export function nseSymbol(symbol: string): string {
  return formatTradingViewSymbol(symbol, "NSE");
}
export function bseSymbol(symbol: string): string {
  return formatTradingViewSymbol(symbol, "BSE");
}
