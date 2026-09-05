// Indian equity market status (NSE/BSE), computed in IST (UTC+05:30, no DST).
// Uses a fixed offset so the result never depends on the server's local timezone.

import { feedHealth } from "./feedHealth.js";
import { config } from "../config.js";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

// NSE equity trading holidays (approximate; extend for full accuracy).
const HOLIDAYS = new Set<string>([
  "2025-01-01", "2025-01-26", "2025-02-26", "2025-03-14", "2025-03-31",
  "2025-04-10", "2025-04-14", "2025-04-18", "2025-05-01", "2025-08-15",
  "2025-08-27", "2025-10-02", "2025-10-21", "2025-10-22", "2025-11-05",
  "2025-12-25",
  "2026-01-01", "2026-01-26", "2026-02-17", "2026-03-04", "2026-03-20",
  "2026-04-03", "2026-04-06", "2026-04-10", "2026-05-01", "2026-08-15",
  "2026-09-25", "2026-10-02", "2026-10-20", "2026-11-10", "2026-12-25",
]);

export type MarketStatus = "PRE_OPEN" | "REGULAR" | "CLOSED";

interface IST {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  weekday: number; // 0 = Sunday
}

function getIST(date = new Date()): IST {
  const ms = date.getTime() + IST_OFFSET_MS;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

function fmt(d: { year: number; month: number; day: number }) {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function isHoliday(date: Date): boolean {
  const ist = getIST(date);
  return HOLIDAYS.has(fmt(ist));
}

function isWeekend(date: Date): boolean {
  const ist = getIST(date);
  return ist.weekday === 0 || ist.weekday === 6;
}

function isTradingDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

// Timestamp (ms) of the market-open instant (09:15 IST) on a given trading day.
function openTimeOfDay(date: Date): number {
  const ist = getIST(date);
  // build a UTC timestamp corresponding to 09:15 IST on that calendar day
  const utc = Date.UTC(ist.year, ist.month - 1, ist.day, 9, 15, 0);
  return utc - IST_OFFSET_MS; // subtract offset to get the epoch ms of that IST wall time
}

// Timestamp (ms) of the market-close instant (15:30 IST) on a given trading day.
function closeTimeOfDay(date: Date): number {
  const ist = getIST(date);
  const utc = Date.UTC(ist.year, ist.month - 1, ist.day, 15, 30, 0);
  return utc - IST_OFFSET_MS;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The most recent ACTUAL session close (15:30 IST on the last trading day,
// walking back over weekends/holidays). This is a real timestamp — the correct
// answer for "when did the market last close", independent of any UI polling or
// server refresh cycles.
export function lastClose(from = new Date()): { close: Date; label: string } {
  for (let back = 0; back < 40; back++) {
    const d = new Date(from.getTime() - back * 24 * 3600 * 1000);
    if (!isTradingDay(d)) continue;
    const t = closeTimeOfDay(d);
    if (t <= from.getTime()) {
      const ist = getIST(new Date(t));
      const label = `${WEEKDAYS[ist.weekday]}, ${String(ist.day).padStart(2, "0")}/${String(ist.month).padStart(2, "0")}, 3:30 PM IST`;
      return { close: new Date(t), label };
    }
  }
  const ist = getIST(from);
  return { close: from, label: `${fmt(ist)}, 3:30 PM IST` };
}

export function nextSessionOpen(from = new Date()): { open: Date; label: string } {
  const start = new Date(from.getTime() + IST_OFFSET_MS);
  let d = new Date(start);
  for (let i = 0; i < 30; i++) {
    if (isTradingDay(d)) {
      const t = openTimeOfDay(d);
      if (t > from.getTime()) {
        const ist = getIST(new Date(t));
        const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][getIST(new Date(t)).weekday];
        return { open: new Date(t), label: `${wd}, ${String(ist.day).padStart(2, "0")}/${String(ist.month).padStart(2, "0")} at 09:15 AM IST` };
      }
    }
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  const ist = getIST(from);
  return { open: from, label: `${fmt(ist)} 09:15 AM IST` };
}

export function getMarketStatus(): {
  status: MarketStatus;
  label: string;
  isOpen: boolean;
  isPreOpen: boolean;
  closesAt: string | null;
  nextOpen: string | null;
  nextOpenLabel: string | null;
  lastCloseAt: string | null;
  lastCloseLabel: string | null;
  dataMode: "demo" | "live" | "delayed";
  feedSource: "tv" | "sim" | null;
  lastUpdated: string | null;
  lastLiveAt: string | null;
} {
  const now = new Date();
  const ist = getIST(now);
  const minutes = ist.hours * 60 + ist.minutes;

  let status: MarketStatus;
  let label: string;
  let closesAt: string | null = null;

  if (isWeekend(now) || isHoliday(now)) {
    status = "CLOSED";
    label = "Market Closed";
  } else if (minutes >= 9 * 60 && minutes < 9 * 60 + 15) {
    status = "PRE_OPEN";
    label = "Pre-Open";
  } else if (minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30) {
    status = "REGULAR";
    label = "Market Open";
    closesAt = new Date(Date.UTC(ist.year, ist.month - 1, ist.day, 15, 30, 0) - IST_OFFSET_MS).toISOString();
  } else {
    status = "CLOSED";
    label = "Market Closed";
  }

  const next = nextSessionOpen(now);
  const lc = lastClose(now);

  // Optional testing/demo override: SIMULATE_MARKET_OPEN=true forces REGULAR so
  // the open-market behaviour (live ticks) can be exercised outside trading hours.
  if (config.simulateMarketOpen && status !== "REGULAR") {
    status = "REGULAR";
    label = "Market Open";
    closesAt = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();
  }

  // Data mode reflects BOTH the session state AND whether a genuinely licensed
  // real-time feed is configured. Without a licensed feed the app must never
  // claim LIVE — free/delayed sources are labelled DELAYED / DEMO accurately.
  //   market open + licensed feed fresh → "live"
  //   anything else                       → "delayed" (real but lagging) or
  //                                         "demo"   (simulator, offline)
  const health = feedHealth.get();
  const sessionLive = status === "REGULAR";
  let dataMode: "demo" | "live" | "delayed" = "demo";
  if (health.source === "tv") {
    dataMode = sessionLive && config.liveFeedLicensed && health.liveAgeMs != null && health.liveAgeMs <= 10_000 ? "live" : "delayed";
  }

  return {
    status,
    label,
    isOpen: status === "REGULAR",
    isPreOpen: status === "PRE_OPEN",
    closesAt,
    nextOpen: next.open.toISOString(),
    nextOpenLabel: next.label,
    lastCloseAt: lc.close.toISOString(),
    lastCloseLabel: lc.label,
    dataMode,
    feedSource: health.source,
    lastUpdated: health.lastUpdateAt ? new Date(health.lastUpdateAt).toISOString() : null,
    lastLiveAt: health.lastLiveAt ? new Date(health.lastLiveAt).toISOString() : null,
  };
}

export { getIST };
