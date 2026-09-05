"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatPercent, formatCompact } from "@/lib/format";
import type { Instrument, Candle } from "@/lib/types";
import { useMarket } from "@/store/market";
import { isPriceVerificationPending } from "@/lib/verification";
import { VerdictBadge } from "./VerdictBadge";
import { ScorePill } from "./ScorePill";
import { RangeSlider52w } from "./RangeSlider52w";
import { CandlestickChart } from "./CandlestickChart";
import { CandleGuide } from "./CandleGuide";
import { GoToModal } from "./GoToModal";

export type CandleInterval = "1m" | "2m" | "3m" | "5m" | "10m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";

// Period ranges. Each maps to the app's real candle interval +
// fetch limit so 1D→intraday, weekly/monthly/years→daily or weekly candles.
const RANGES: { label: string; value: CandleInterval; limit: number }[] = [
  { label: "1D", value: "5m", limit: 90 },
  { label: "1W", value: "1d", limit: 6 },
  { label: "1M", value: "1d", limit: 24 },
  { label: "3M", value: "1d", limit: 66 },
  { label: "6M", value: "1d", limit: 130 },
  { label: "1Y", value: "1d", limit: 260 },
  { label: "3Y", value: "1w", limit: 160 },
  { label: "5Y", value: "1w", limit: 260 },
  { label: "All", value: "1M", limit: 180 },
];

interface Memory {
  lastSeenPrice: number;
  lastSeenAt: string;
  baselineExists: boolean;
}

interface ComparisonRow {
  metric: string;
  label: string;
  previous: number | string | null;
  current: number | string | null;
  change: number | string | null;
}

interface Insight {
  company: { symbol: string; companyName: string; sector: string };
  market: { price: number; prevClose: number; changeAbs: number; changePct: number; sourceLabel: string; asOf: string };
  scores: { opportunity: number; risk: number; alpha: number; smartMoney: number; verdict: string; verdictLabel: string };
  technical: { available: boolean; rsi: number | null; trendLabel: string | null; support: number | null; resistance: number | null; volumeRatio: number | null };
  snapshot: { exists: boolean; previous: { snapshotAt: string; price: number | null; opportunity: number | null; risk: number | null; alpha: number | null; smartMoney: number | null; pe: number | null; fairValueStatus: string | null } | null };
  firstView: boolean;
  comparison: ComparisonRow[] | null;
  changeNarrative: string | null;
  classifications: { previous: string | null; current: string };
  validation: {
    status: "verified" | "corrected" | "insufficient_data";
    previousConclusion: string | null;
    currentConclusion: string | null;
    correctedConclusion: string | null;
    reason: string;
    supportingSignals: string[];
    contradictingSignals: string[];
    corrections: string[];
    confidence: string;
  };
  explanations: { metric: string; label: string; value: string; explanation: string }[];
}

function dataStatusPill(status?: string | null) {
  const s = (status || "").toUpperCase();
  const map: Record<string, string> = {
    STALE: "bg-red-100 text-down",
    CONFLICT: "bg-purple-100 text-purple-700",
  };
  if (!map[s]) return null;
  return <span className={`pill ${map[s]}`}>{s}</span>;
}

export function StockDetailPanel({ instrumentId, onClose }: { instrumentId: string; onClose: () => void }) {
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [changeInfo, setChangeInfo] = useState<{ pricePct: number; abs: number } | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [insight, setInsight] = useState<Insight | null>(null);
  const [showInsight, setShowInsight] = useState(true);
  const [tab, setTab] = useState<"portfolio" | "alert">("portfolio");
  const [interval, setInterval] = useState<CandleInterval>("5m");
  const [rangeSel, setRangeSel] = useState("1D");
  const [candleLimit, setCandleLimit] = useState(90);
  const [exchange, setExchange] = useState<"NSE" | "BSE">("NSE");
  const [showGuide, setShowGuide] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [focusTs, setFocusTs] = useState<string | null>(null);
  const [focusRange, setFocusRange] = useState<[string, string] | null>(null);
  const [gotoError, setGotoError] = useState("");

  // portfolio form
  const [status, setStatus] = useState<"holding" | "watching_only" | "sold">("holding");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState("");

  // alert form
  const [alertType, setAlertType] = useState<"move" | "volume" | "price" | "ema" | "rsi">("move");
  const [alertPct, setAlertPct] = useState("5");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertEmaPeriod, setAlertEmaPeriod] = useState<"20" | "50">("50");
  const [alertRsiVal, setAlertRsiVal] = useState("70");

  // Simulated paper order entry (Buy/Sell). Clearly NOT a real brokerage order.
  const DEMO_BALANCE = 100000;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"delivery" | "intraday">("delivery");
  const [oqty, setOqty] = useState("1");
  const [olimit, setOlimit] = useState("");
  const [orderMsg, setOrderMsg] = useState("");

  // ai chat
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const storeQuote = useMarket((s) => s.quotes[instrumentId]);
  const pushQuote = useMarket((s) => s.setQuote);

  // Portfolios = the user-created portfolio goals (Portfolio page). Watchlists
  // are a separate concept (monitoring); we never conflate the two here.
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([]);
  const [portfolioSel, setPortfolioSel] = useState<string | null>(null);
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioBusy, setPortfolioBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ goals: { id: string; name: string }[] }>("/api/portfolio/goals")
      .then((d) => {
        setPortfolios(d.goals || []);
        // one → use it; 2+ → preselect most recent (changeable), never silent
        if (d.goals.length === 1) setPortfolioSel(d.goals[0].id);
        else if (d.goals.length >= 2) setPortfolioSel(d.goals[d.goals.length - 1].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ instrument: Instrument }>(`/api/instruments/${instrumentId}`)
      .then((d) => {
        if (!mounted) return;
        setInstrument(d.instrument);
        setPrice(String(d.instrument.ltp));
        setAlertPrice(String(d.instrument.ltp));
        // Publish to the shared store so the watchlist row shows the same value.
        pushQuote(instrumentId, {
          ltp: Number(d.instrument.ltp),
          prevClose: Number(d.instrument.prevClose),
          changeAbs: Number(d.instrument.change),
          changePct: Number(d.instrument.changePct),
          volume: Number(d.instrument.volume),
        });
      })
      .catch(() => {});
    api.get<{ summary: string }>(`/api/ai/summary/${instrumentId}`).then((d) => mounted && setSummary(d.summary)).catch(() => {});
    api
      .get<{ memory: Memory | null; change: { pricePct: number; abs: number }; current: { price: number } }>(`/api/memory/${instrumentId}`)
      .then((d) => {
        if (!mounted) return;
        setMemory(d.memory);
        setChangeInfo(d.change);
      })
      .catch(() => {});
    api.get<{ insight: Insight }>(`/api/insights/${instrumentId}`).then((d) => mounted && setInsight(d.insight)).catch(() => {});

    return () => {
      mounted = false;
    };
  }, [instrumentId]);

  // Capture a new "last seen" baseline when the panel is dismissed, so the
  // next visit compares against what the user actually looked at this time.
  // Also appends a company snapshot (historical, append-only) for the panel's
  // "what changed since last view" comparison.
  useEffect(() => {
    return () => {
      api.post(`/api/memory/${instrumentId}/review`).catch(() => {});
      api.post(`/api/insights/${instrumentId}`).catch(() => {});
    };
  }, [instrumentId]);

  useEffect(() => {
    let mounted = true;
    api.get<{ candles: Candle[] }>(`/api/instruments/${instrumentId}/candles?interval=${interval}&limit=${candleLimit}`).then((d) => mounted && setCandles(d.candles)).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [instrumentId, interval, candleLimit]);

  async function addToPortfolio() {
    if (portfolios.length === 0 || (portfolios.length >= 2 && !portfolioSel)) return;
    setFormBusy(true);
    setFormMsg("");
    try {
      await api.post("/api/portfolio", {
        instrumentId,
        status,
        quantity: Number(qty),
        buyPrice: Number(price),
        buyDate,
        thesisNotes: notes || undefined,
        goalId: portfolios.length === 1 ? portfolios[0].id : portfolioSel,
      });
      setFormMsg(`Added to "${portfolios.find((g) => g.id === (portfolios.length === 1 ? portfolios[0].id : portfolioSel))?.name}" ✓`);
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setFormBusy(false);
    }
  }

  async function createPortfolioInline() {
    if (!portfolioName.trim()) return;
    setPortfolioBusy(true);
    setFormMsg("");
    try {
      const d = await api.post<{ id: string }>("/api/portfolio/goals", { name: portfolioName.trim(), targetAmount: 0 });
      setPortfolios((prev) => [...prev, { id: d.id, name: portfolioName.trim() }]);
      setPortfolioSel(d.id);
      setPortfolioName("");
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Failed to create portfolio");
    } finally {
      setPortfolioBusy(false);
    }
  }

  async function createAlert() {
    setFormBusy(true);
    setFormMsg("");
    try {
      const condition =
        alertType === "move"
          ? { type: "price_move", direction: "up", pct: Number(alertPct) }
          : alertType === "volume"
            ? { type: "volume_spike", ratio: 2 }
            : alertType === "ema"
              ? { type: "price_cross_ema", period: Number(alertEmaPeriod), direction: "above" }
              : alertType === "rsi"
                ? { type: "rsi_above", value: Number(alertRsiVal) }
                : { type: "price_above", price: Number(alertPrice) };
      await api.post("/api/alerts", { instrumentId, conditionJson: condition, notifyMode: "immediate" });
      setFormMsg("Alert created ✓");
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setFormBusy(false);
    }
  }

  async function askAi() {
    if (!aiInput.trim()) return;
    const text = aiInput;
    setAiInput("");
    setAiMessages((m) => [...m, { role: "user", content: text }]);
    setAiBusy(true);
    try {
      const d = await api.post<{ response: string }>("/api/ai/chat", { message: text, instrumentId });
      setAiMessages((m) => [...m, { role: "assistant", content: d.response }]);
    } catch (e) {
      setAiMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Failed to reach the analyst. Please try again." }]);
    } finally {
      setAiBusy(false);
    }
  }

  const investmentValue = Number(qty || 0) * Number(price || 0);

  const loadedRange = candles.length >= 2 ? [candles[0].ts, candles[candles.length - 1].ts] : null;

  function handleGoToDate(date: Date) {
    const t = date.getTime();
    if (!loadedRange || t < new Date(loadedRange[0]).getTime() || t > new Date(loadedRange[1]).getTime()) {
      setGotoError("Historical data unavailable for this range.");
      return;
    }
    setGotoError("");
    setFocusRange(null);
    setFocusTs(date.toISOString());
    setGotoOpen(false);
  }

  function handleGoToRange(start: Date, end: Date) {
    if (!loadedRange) {
      setGotoError("Historical data unavailable for this range.");
      return;
    }
    const s = start.getTime();
    const e = end.getTime();
    const lo = new Date(loadedRange[0]).getTime();
    const hi = new Date(loadedRange[1]).getTime();
    if (e < lo || s > hi) {
      setGotoError("Historical data unavailable for this range.");
      return;
    }
    setGotoError("");
    setFocusTs(null);
    setFocusRange([start.toISOString(), end.toISOString()]);
    setGotoOpen(false);
  }

  const effLtp = exchange === "BSE" ? (instrument?.bseLtp ?? instrument?.ltp ?? 0) : (storeQuote?.ltp ?? instrument?.ltp ?? 0);
  const effChangePct = exchange === "BSE" ? (instrument?.bseChangePct ?? instrument?.changePct ?? 0) : (storeQuote?.changePct ?? instrument?.changePct ?? 0);
  const effVolume = storeQuote?.volume ?? instrument?.volume ?? 0;
  const effChangeAbs = storeQuote?.changeAbs ?? instrument?.change ?? 0;
  const effPrevClose = storeQuote?.prevClose ?? instrument?.prevClose ?? effLtp;
  const dispPrice = exchange === "BSE" && instrument?.bseLtp ? instrument.bseLtp : effLtp;
  const dispChange = exchange === "BSE" && instrument?.bseChangePct != null ? instrument.bseChangePct : effChangePct;
  const baseQty = Math.max(0, parseInt(oqty, 10) || 0);
  const basePrice = Math.max(0, parseFloat(olimit) || 0);
  const effPrice = basePrice > 0 ? basePrice : dispPrice;
  const approxRequired = baseQty * effPrice;
  const marginRequired = orderType === "intraday" ? approxRequired * 0.2 : approxRequired;
  const validOrder = baseQty > 0 && effPrice > 0 && marginRequired <= DEMO_BALANCE;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {!instrument ? (
          <div className="p-6 text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between p-4 border-b border-surface-border">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{instrument.companyName}</h2>
                  <VerdictBadge verdict={instrument.scores.aiVerdict} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex rounded-md overflow-hidden border border-surface-border text-xs">
                    {(["NSE", "BSE"] as const).map((ex) => (
                      <button key={ex} onClick={() => setExchange(ex)} className={`px-2 py-0.5 font-medium ${exchange === ex ? "bg-brand text-white" : "bg-white text-gray-500"}`}>
                        {ex}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatINR(dispPrice)}</span>
                  <span className={`text-sm tabular-nums ${dispChange >= 0 ? "text-up" : "text-down"}`}>({formatPercent(dispChange)})</span>
                  {dataStatusPill(instrument.dataStatus)}
                  {isPriceVerificationPending(instrument.symbol) && (
                    <span className="pill bg-amber-50 text-amber-600" title="No external source could verify this stored quote at submission time">
                      verification pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {instrument.symbol} · NSE {formatINR(effLtp)}{instrument.bseLtp ? <> · BSE {formatINR(instrument.bseLtp)}</> : null}
                </p>
                {instrument.prevClose > 0 && instrument.changePct !== undefined && (
                  <p className={`text-xs mt-0.5 font-medium ${effChangeAbs >= 0 ? "text-up" : "text-down"}`}>
                    1D: {effChangeAbs >= 0 ? "+" : "−"}
                    {formatINR(Math.abs(effChangeAbs))} ({formatPercent(dispChange)})
                    {effChangeAbs >= 0 ? " 🟢" : " 🔴"}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-muted text-gray-500">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {summary && (
                <div className="p-4 bg-brand-light/50 border-b border-surface-border text-sm text-gray-700">
                  <span className="text-xs font-semibold text-brand">AI SUMMARY</span>
                  <p className="mt-1">{summary}</p>
                </div>
              )}

              <div className="p-4 border-b border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 mr-2">
                    {RANGES.map((r) => (
                      <button
                        key={r.label}
                        onClick={() => { setRangeSel(r.label); setInterval(r.value); setCandleLimit(r.limit); }}
                        className={`shrink-0 px-2 py-1 text-xs font-medium rounded-md ${rangeSel === r.label ? "bg-brand text-white" : "bg-surface-muted text-gray-500"}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm tabular-nums shrink-0">Vol {formatCompact(effVolume)}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setShowGuide((v) => !v)} className="text-xs font-medium text-brand hover:underline">
                    {showGuide ? "Hide guide" : "What do candles mean?"}
                  </button>
                  <button onClick={() => setGotoOpen(true)} className="text-xs font-medium text-gray-600 hover:text-gray-900" title="Go to date / range">
                    📅 Go to
                  </button>
                  <button onClick={() => setExpanded(true)} className="text-xs font-medium text-gray-500 hover:text-gray-700" title="Fullscreen chart">
                    ⛶ Expand
                  </button>
                </div>
                {gotoError && (
                  <div className="mb-2 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">{gotoError}</div>
                )}
                {showGuide ? (
                  <div className="card p-4 bg-surface-muted/50">
                    <CandleGuide />
                  </div>
                ) : (
                  <div onClick={() => setExpanded(true)} className="cursor-zoom-in" title="Click to expand">
                    <CandlestickChart candles={candles} height={280} focusTs={focusTs} focusRange={focusRange} />
                  </div>
                )}
              </div>

              {/* Scores */}
              <div className="p-4 border-b border-surface-border">
                <div className="flex flex-wrap gap-2">
                  <ScorePill label="Opportunity" value={instrument.scores.opportunity} />
                  <ScorePill label="Risk" value={instrument.scores.risk} invert />
                  <ScorePill label="Alpha" value={instrument.scores.alphaGrowth} />
                  <ScorePill label="Smart $" value={instrument.scores.smartMoney} />
                </div>
                <div className="mt-3">
                  <RangeSlider52w low={instrument.week52Low} high={instrument.week52High} current={instrument.ltp} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div>P/E <span className="font-semibold text-gray-800">{instrument.fundamentals.pe || "—"}</span></div>
                  <div>Div yield <span className="font-semibold text-gray-800">{instrument.fundamentals.dividendYield.toFixed(1)}%</span></div>
                  <div>Fair value <span className="font-semibold text-gray-800 capitalize">{instrument.scores.fairValueStatus}</span></div>
                </div>
              </div>

              {/* AI Analysis + validation + What changed since last view */}
              <div className="p-4 border-b border-surface-border">
                {insight ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase">AI Analysis &amp; validation</h3>
                      <button onClick={() => setShowInsight((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600">
                        {showInsight ? "Collapse" : "Expand"}
                      </button>
                    </div>

                    {showInsight && (
                      <>
                        <ValidationBanner v={insight.validation} />
                        {insight.validation.status === "corrected" && insight.validation.correctedConclusion && (
                          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                            <span className="font-semibold text-amber-800">Corrected view: {insight.validation.correctedConclusion}</span>
                          </div>
                        )}
                        {(insight.validation.supportingSignals.length > 0 || insight.validation.contradictingSignals.length > 0) && (
                          <div className="text-xs text-gray-600 space-y-0.5">
                            {insight.validation.supportingSignals.map((s, i) => (
                              <div key={i} className="text-up">▲ {s}</div>
                            ))}
                            {insight.validation.contradictingSignals.map((s, i) => (
                              <div key={i} className="text-down">▼ {s}</div>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">What changed since last view</div>
                          {insight.firstView ? (
                            <div className="text-sm text-gray-700">
                              <p className="font-medium">First tracked view</p>
                              <p className="text-xs text-gray-500">
                                Current price ₹{effLtp.toFixed(2)} · 1-day market change{" "}
                                <span className={dispChange >= 0 ? "text-up" : "text-down"}>
                                  {dispChange >= 0 ? "+" : ""}
                                  {dispChange.toFixed(2)}%
                                </span>{" "}
                                (previous close ₹{effPrevClose.toFixed(2)}).
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                No earlier application snapshot exists yet, so score changes vs a previous view aren't available — this view is now being tracked.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-400">
                                Snapshot: {insight.snapshot.previous ? new Date(insight.snapshot.previous.snapshotAt).toLocaleString() : "earlier"}
                              </p>
                              <div className="divide-y divide-surface-border text-sm">
                                {(insight.comparison ?? []).map((r) => (
                                  <div key={r.metric} className="flex items-center justify-between py-1.5 text-xs">
                                    <span className="text-gray-500">{r.label}</span>
                                    <span className="tabular-nums">
                                      <span className="text-gray-400">{r.previous == null ? "—" : r.previous}</span>
                                      <span className="mx-1 text-gray-300">→</span>
                                      <span className="font-semibold text-gray-900">{r.current == null ? "—" : r.current}</span>
                                      {typeof r.change === "number" && r.change !== 0 ? (
                                        <span className={`ml-1.5 font-semibold ${r.change > 0 ? "text-up" : "text-down"}`}>
                                          {r.change > 0 ? "↑" : "↓"} {Math.abs(r.change)}
                                        </span>
                                      ) : r.change === null ? (
                                        <span className="ml-1.5 text-gray-400">no change</span>
                                      ) : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {insight.changeNarrative && <p className="text-xs text-gray-600 leading-relaxed">{insight.changeNarrative}</p>}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Metric explanations</div>
                          <div className="space-y-2">
                            {insight.explanations.slice(0, 5).map((e) => (
                              <div key={e.metric} className="text-xs">
                                <span className="font-semibold text-gray-900">{e.label}: {e.value}</span>
                                <p className="text-gray-600 mt-0.5">{e.explanation}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : memory?.baselineExists ? (
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase">What changed since last view</h3>
                    </div>
                    <p className="mt-2">
                      Last seen <span className="font-semibold">{formatINR(memory.lastSeenPrice)}</span> → now{" "}
                      <span className="font-semibold">{formatINR(instrument.ltp)}</span>
                    </p>
                    <p className={`font-semibold ${(changeInfo?.pricePct ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                      {changeInfo ? `${changeInfo.pricePct >= 0 ? "+" : ""}${changeInfo.pricePct.toFixed(2)}% (${formatINR(Math.abs(changeInfo.abs))})` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">This view is now being tracked — return later to see what changed.</p>
                )}
              </div>

              {/* Simulated paper order entry (Buy/Sell). NOT a real brokerage. */}
              <div className="p-4 border-b border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase">Buy / Sell</h3>
                  <span className="pill bg-sky-100 text-sky-700">Simulated paper order — not routed to any exchange</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => { setSide("buy"); setOrderMsg(""); }}
                    className={`py-2 rounded-lg font-semibold text-sm ${side === "buy" ? "bg-up text-white" : "bg-surface-muted text-gray-500"}`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => { setSide("sell"); setOrderMsg(""); }}
                    className={`py-2 rounded-lg font-semibold text-sm ${side === "sell" ? "bg-down text-white" : "bg-surface-muted text-gray-500"}`}
                  >
                    Sell
                  </button>
                </div>

                <div className="flex rounded-lg bg-surface-muted p-0.5 mb-3 text-xs">
                  {(["delivery", "intraday"] as const).map((t) => (
                    <button key={t} onClick={() => setOrderType(t)} className={`flex-1 py-1.5 rounded-md font-medium capitalize ${orderType === t ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
                      {t === "delivery" ? "Delivery" : "Intraday"}
                      {t === "intraday" && <span className="ml-1 text-[9px] text-gray-400">(20% margin)</span>}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <label className="text-xs text-gray-500 block">
                    Qty {exchange}
                    <input className="input mt-1" type="number" min={1} step={1} value={oqty} onChange={(e) => setOqty(e.target.value)} />
                  </label>
                  <label className="text-xs text-gray-500 block">
                    Price Limit
                    <input className="input mt-1" type="number" min={0} step={0.05} placeholder={String(dispPrice || "")} value={olimit} onChange={(e) => setOlimit(e.target.value)} />
                  </label>
                </div>

                <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Balance (demo)</span>
                    <span className="font-semibold tabular-nums">₹{DEMO_BALANCE.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Approx. required {orderType === "intraday" ? "(intraday margin)" : ""}</span>
                    <span className="font-semibold tabular-nums">₹{approxRequired.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                {marginRequired > DEMO_BALANCE && baseQty > 0 && effPrice > 0 && (
                  <p className="text-[11px] text-down mt-1.5">Insufficient demo balance for this {orderType === "intraday" ? "margin requirement" : "order"}.</p>
                )}

                <button
                  disabled={!validOrder}
                  onClick={() =>
                    setOrderMsg(
                      `Simulated ${side === "buy" ? "BUY" : "SELL"} accepted (paper): ${baseQty} × ${instrument?.symbol} @ ${exchange} ₹${effPrice.toFixed(2)} · ${orderType === "delivery" ? "Delivery" : "Intraday"}. No real order was placed.`,
                    )
                  }
                  className={`mt-3 w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-40 ${side === "buy" ? "bg-up" : "bg-down"}`}
                >
                  {side === "buy" ? `Buy ${instrument?.symbol ?? ""}` : `Sell ${instrument?.symbol ?? ""}`}
                </button>
                {orderMsg && <p className="mt-2 text-xs text-up">{orderMsg}</p>}
                <p className="mt-2 text-[10px] text-gray-400">Educational paper-trading preview only — SMARTWATCH does not execute trades.</p>
              </div>

              {/* Tabs: Add to portfolio / Set alert */}
              <div className="p-4">
                <div className="flex rounded-lg bg-surface-muted p-1 mb-4">
                  <button onClick={() => setTab("portfolio")} className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab === "portfolio" ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
                    Add to Portfolio
                  </button>
                  <button onClick={() => setTab("alert")} className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab === "alert" ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
                    Set Alert
                  </button>
                </div>

                {tab === "portfolio" ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase">Portfolio</span>
                        <span className="text-[10px] text-gray-400">Watchlists are separate — this is where the purchase is logged</span>
                      </div>
                      {portfolios.length === 0 ? (
                        <div className="mt-2 flex gap-2">
                          <input className="input flex-1" placeholder="Name your portfolio (e.g. Long-term Holdings)" value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createPortfolioInline()} />
                          <button className="btn-secondary" disabled={portfolioBusy || !portfolioName.trim()} onClick={createPortfolioInline}>{portfolioBusy ? "…" : "Create"}</button>
                        </div>
                      ) : portfolios.length === 1 ? (
                        <p className="mt-1.5 text-sm text-gray-600">Adding to <span className="font-semibold">{portfolios[0].name}</span></p>
                      ) : (
                        <select className="input mt-1.5" value={portfolioSel ?? ""} onChange={(e) => setPortfolioSel(e.target.value)}>
                          <option value="" disabled>Select portfolio…</option>
                          {portfolios.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      )}
                      {portfolios.length >= 2 && !portfolioSel && <p className="text-[11px] text-down mt-1">Select a portfolio to continue.</p>}
                    </div>

                    <div className="flex rounded-lg overflow-hidden border border-surface-border">
                      {(["holding", "watching_only", "sold"] as const).map((s) => (
                        <button key={s} onClick={() => setStatus(s)} className={`flex-1 py-2 text-xs font-medium ${status === s ? "bg-brand text-white" : "bg-white text-gray-500"}`}>
                          {s === "holding" ? "Bought" : s === "watching_only" ? "Watching only" : "Sold"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs text-gray-500">Qty <input className="input mt-1" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
                      <label className="text-xs text-gray-500">Price (limit) <input className="input mt-1" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                    </div>
                    <label className="text-xs text-gray-500 block">Purchase date <input className="input mt-1" type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} /></label>
                    <label className="text-xs text-gray-500 block">Notes (reason for investment) <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Investment value</span>
                      <span className="font-semibold">{formatINR(investmentValue)}</span>
                    </div>
                    {formMsg && <p className="text-sm text-brand">{formMsg}</p>}
                    <button className="btn-primary w-full" disabled={formBusy || portfolios.length === 0 || (portfolios.length >= 2 && !portfolioSel)} onClick={addToPortfolio}>Add to Portfolio</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {(["move", "volume", "price", "ema", "rsi"] as const).map((t) => (
                        <label key={t} className="flex items-center gap-2 text-sm">
                          <input type="radio" className="accent-brand" checked={alertType === t} onChange={() => setAlertType(t)} />
                          {t === "move" ? "Notify me on ±X% move" : t === "volume" ? "Notify on volume spike (2x)" : t === "ema" ? "Alert when price crosses EMA" : t === "rsi" ? "Alert on RSI level" : "Notify at price ₹___"}
                        </label>
                      ))}
                    </div>
                    {alertType === "move" && <input className="input" type="number" value={alertPct} onChange={(e) => setAlertPct(e.target.value)} placeholder="% move" />}
                    {alertType === "price" && <input className="input" type="number" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} placeholder="Target price" />}
                    {alertType === "ema" && (
                      <div className="flex items-center gap-2">
                        <select className="input" value={alertEmaPeriod} onChange={(e) => setAlertEmaPeriod(e.target.value as "20" | "50")}>
                          <option value="20">20-EMA</option>
                          <option value="50">50-EMA</option>
                        </select>
                        <span className="text-xs text-gray-500">crosses above</span>
                      </div>
                    )}
                    {alertType === "rsi" && (
                      <div className="flex items-center gap-2">
                        <input className="input" type="number" value={alertRsiVal} onChange={(e) => setAlertRsiVal(e.target.value)} placeholder="70" />
                        <span className="text-xs text-gray-500">RSI above</span>
                      </div>
                    )}
                    {formMsg && <p className="text-sm text-brand">{formMsg}</p>}
                    <button className="btn-primary w-full" disabled={formBusy} onClick={createAlert}>Create Alert</button>
                  </div>
                )}
              </div>

              {/* AI chat */}
              <div className="p-4 border-t border-surface-border">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ask AI about {instrument.symbol}</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
                  {aiMessages.map((m, i) => (
                    <div key={i} className={`text-sm p-2 rounded-lg ${m.role === "user" ? "bg-brand-light ml-6" : "bg-surface-muted mr-6"}`}>
                      {m.content}
                    </div>
                  ))}
                  {aiBusy && <div className="text-xs text-gray-400">Thinking…</div>}
                </div>
                <div className="flex gap-2">
                  <input className="input" placeholder="Why did this change?" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAi()} />
                  <button className="btn-primary shrink-0" onClick={askAi}>Ask</button>
                </div>
                <p className="mt-2 text-[10px] text-gray-400">Educational research tool — not financial advice.</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Fullscreen candlestick chart */}
      {expanded && instrument && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setExpanded(false)}>
          <div className="w-full max-w-6xl h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border gap-3">
              <div className="shrink-0">
                <span className="text-lg font-bold">{instrument.companyName}</span>
                <span className="ml-2 text-sm text-gray-500">
                  {exchange} {formatINR(dispPrice)} <span className={dispChange >= 0 ? "text-up" : "text-down"}>({formatPercent(dispChange)})</span>
                </span>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {RANGES.map((r) => (
                  <button key={r.label} onClick={() => { setRangeSel(r.label); setInterval(r.value); setCandleLimit(r.limit); }} className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md ${rangeSel === r.label ? "bg-brand text-white" : "bg-surface-muted text-gray-500"}`}>
                    {r.label}
                  </button>
                ))}
                <button onClick={() => setExpanded(false)} className="ml-3 p-1.5 rounded-lg hover:bg-surface-muted text-gray-500 shrink-0">✕</button>
              </div>
            </div>
            <div className="flex-1 p-5 overflow-auto">
              <CandlestickChart candles={candles} height={Math.max(400, window.innerHeight * 0.7)} focusTs={focusTs} focusRange={focusRange} />
            </div>
          </div>
        </div>
      )}

      {gotoOpen && <GoToModal onClose={() => setGotoOpen(false)} onGoToDate={handleGoToDate} onGoToRange={handleGoToRange} />}
    </div>
  );
}

function ValidationBanner({ v }: { v: Insight["validation"] }) {
  const map = {
    verified: { label: "✅ Analysis Verified", cls: "bg-up/10 text-up border-up/30" },
    corrected: { label: "⚠️ Analysis Needs Correction", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    insufficient_data: { label: "Insufficient Data", cls: "bg-gray-100 text-gray-600 border-surface-border" },
  } as const;
  const m = map[v.status] ?? map.insufficient_data;
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${m.cls}`}>
      <div className="font-semibold">{m.label}</div>
      <p className="text-xs mt-0.5 opacity-90">
        Existing analysis: <span className="font-semibold">{v.previousConclusion ?? "—"}</span> · Latest validated view:{" "}
        <span className="font-semibold">{v.correctedConclusion ?? v.currentConclusion}</span>
      </p>
      {v.reason && <p className="text-xs mt-1">{v.reason}</p>}
      {v.status !== "insufficient_data" && <p className="text-[10px] mt-1 opacity-70">Validation confidence: {v.confidence}</p>}
    </div>
  );
}
