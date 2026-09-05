// Unified live-market contract + Groww-style computational change logic.
// The UI never calculates; metrics are derived here from real inputs only.

export type Direction = "up" | "down" | "flat";

export interface LiveMarketTick {
  symbol: string; // e.g. "NSE:3MINDIA"
  ltp: number;
  prevClose: number;
  dayChange: number;
  dayChangePercent: number;
  volume: number;
}

export interface MarketMetrics {
  dayChange: number;
  dayChangePercent: number;
  direction: Direction;
  color: "up" | "down" | "neutral"; // semantic tokens: up(green) down(red) neutral
}

// Centralized parser — never performed inline in components.
export function calculateMarketMetrics(currentPrice: number, previousClosePrice: number): MarketMetrics {
  const dayChange = +(currentPrice - previousClosePrice).toFixed(4);
  const dayChangePercent = previousClosePrice > 0 ? +((dayChange / previousClosePrice) * 100).toFixed(4) : 0;
  const direction: Direction = dayChange > 0 ? "up" : dayChange < 0 ? "down" : "flat";
  const color = direction === "up" ? "up" : direction === "down" ? "down" : "neutral";
  return { dayChange, dayChangePercent, direction, color };
}

// Tailwind color classes from a semantic descriptor (uses the app design tokens).
export function changeColorClass(color: MarketMetrics["color"]): string {
  return color === "up" ? "text-up" : color === "down" ? "text-down" : "text-gray-400";
}

export function toLiveTick(id: string, rawSymbol: string, ltp: number, prevClose: number, volume: number): LiveMarketTick {
  const { dayChange, dayChangePercent } = calculateMarketMetrics(ltp, prevClose);
  return { symbol: /^(NSE|BSE):/.test(rawSymbol) ? rawSymbol : `NSE:${rawSymbol}`, ltp, prevClose, dayChange, dayChangePercent, volume };
}
