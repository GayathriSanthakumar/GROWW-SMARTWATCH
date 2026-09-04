"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSocket, subscribeInstrument, unsubscribeInstrument } from "@/lib/socket";
import { formatINR, formatPercent, formatCompact } from "@/lib/format";
import type { Instrument, Candle } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";
import { ScorePill } from "./ScorePill";
import { RangeSlider52w } from "./RangeSlider52w";
import { CandlestickChart } from "./CandlestickChart";
import { CandleGuide } from "./CandleGuide";

const TIMEFRAMES: { value: "5m" | "15m" | "1h" | "1d" | "1w" | "1M"; label: string }[] = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1M", label: "1M" },
];

interface Memory {
  lastSeenPrice: number;
  lastSeenAt: string;
  baselineExists: boolean;
}

export function StockDetailPanel({ instrumentId, onClose }: { instrumentId: string; onClose: () => void }) {
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [changeInfo, setChangeInfo] = useState<{ pricePct: number; abs: number } | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [tab, setTab] = useState<"portfolio" | "alert">("portfolio");
  const [interval, setInterval] = useState<"5m" | "15m" | "1h" | "1d" | "1w" | "1M">("5m");
  const [showGuide, setShowGuide] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  // ai chat
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get<{ instrument: Instrument }>(`/api/instruments/${instrumentId}`).then((d) => {
      if (!mounted) return;
      setInstrument(d.instrument);
      setPrice(String(d.instrument.ltp));
      setAlertPrice(String(d.instrument.ltp));
    });
    api.get<{ summary: string }>(`/api/ai/summary/${instrumentId}`).then((d) => mounted && setSummary(d.summary));
    api
      .get<{ memory: Memory | null; change: { pricePct: number; abs: number }; current: { price: number } }>(`/api/memory/${instrumentId}`)
      .then((d) => {
        if (!mounted) return;
        setMemory(d.memory);
        setChangeInfo(d.change);
      });

    subscribeInstrument(instrumentId);
    const socket = getSocket();
    const onTick = (data: { instrumentId: string; ltp: number; changePct: number }) => {
      if (data.instrumentId !== instrumentId || !mounted) return;
      setInstrument((prev) => (prev ? { ...prev, ltp: data.ltp, changePct: data.changePct } : prev));
    };
    socket.on("tick", onTick);

    return () => {
      mounted = false;
      unsubscribeInstrument(instrumentId);
      socket.off("tick", onTick);
    };
  }, [instrumentId]);

  useEffect(() => {
    let mounted = true;
    const limit = interval === "5m" || interval === "15m" || interval === "1h" ? 75 : 90;
    api.get<{ candles: Candle[] }>(`/api/instruments/${instrumentId}/candles?interval=${interval}&limit=${limit}`).then((d) => mounted && setCandles(d.candles));
    return () => {
      mounted = false;
    };
  }, [instrumentId, interval]);

  async function addToPortfolio() {
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
      });
      setFormMsg("Added to portfolio ✓");
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setFormBusy(false);
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
    } finally {
      setAiBusy(false);
    }
  }

  const investmentValue = Number(qty || 0) * Number(price || 0);

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
                <p className="text-sm text-gray-500">
                  NSE {formatINR(instrument.ltp)} <span className={instrument.changePct >= 0 ? "text-up" : "text-down"}>({formatPercent(instrument.changePct)})</span>
                  {instrument.bseLtp ? <> · BSE {formatINR(instrument.bseLtp)} <span className={(instrument.bseChangePct ?? 0) >= 0 ? "text-up" : "text-down"}>({formatPercent(instrument.bseChangePct)})</span></> : null}
                  {" · "}{instrument.symbol}
                </p>
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
                  <div className="flex items-center gap-1">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.value}
                        onClick={() => setInterval(tf.value)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md ${interval === tf.value ? "bg-brand text-white" : "bg-surface-muted text-gray-500"}`}
                      >
                        {tf.label}
                      </button>
                    ))}
                    <button onClick={() => setShowGuide((v) => !v)} className="px-2 py-1 text-xs font-medium text-brand hover:underline" title="Learn to read candlesticks">
                      {showGuide ? "Hide guide" : "What do candles mean?"}
                    </button>
                    <button onClick={() => setExpanded(true)} className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700" title="Fullscreen chart">
                      ⛶
                    </button>
                  </div>
                  <span className="text-sm tabular-nums">Vol {formatCompact(instrument.volume)}</span>
                </div>
                {showGuide ? (
                  <div className="card p-4 bg-surface-muted/50">
                    <CandleGuide />
                  </div>
                ) : (
                  <div onClick={() => setExpanded(true)} className="cursor-zoom-in" title="Click to expand">
                    <CandlestickChart candles={candles} height={280} />
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

              {/* What changed since last view */}
              <div className="p-4 border-b border-surface-border">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">What changed since last view</h3>
                {memory?.baselineExists ? (
                  <div className="text-sm">
                    <p>
                      Last seen <span className="font-semibold">{formatINR(memory.lastSeenPrice)}</span> → now{" "}
                      <span className="font-semibold">{formatINR(instrument.ltp)}</span>
                    </p>
                    <p className={`font-semibold ${(changeInfo?.pricePct ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                      {changeInfo ? `${changeInfo.pricePct >= 0 ? "+" : ""}${changeInfo.pricePct.toFixed(2)}% (${formatINR(Math.abs(changeInfo.abs))})` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No baseline yet — open a stock to start tracking changes.</p>
                )}
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
                    <button className="btn-primary w-full" disabled={formBusy} onClick={addToPortfolio}>Add to Portfolio</button>
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
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border">
              <div>
                <span className="text-lg font-bold">{instrument.companyName}</span>
                <span className="ml-2 text-sm text-gray-500">
                  NSE {formatINR(instrument.ltp)} <span className={instrument.changePct >= 0 ? "text-up" : "text-down"}>({formatPercent(instrument.changePct)})</span>
                  {instrument.bseLtp ? <> · BSE {formatINR(instrument.bseLtp)}</> : null}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.value} onClick={() => setInterval(tf.value)} className={`px-3 py-1.5 text-xs font-medium rounded-md ${interval === tf.value ? "bg-brand text-white" : "bg-surface-muted text-gray-500"}`}>
                    {tf.label}
                  </button>
                ))}
                <button onClick={() => setExpanded(false)} className="ml-3 p-1.5 rounded-lg hover:bg-surface-muted text-gray-500">✕</button>
              </div>
            </div>
            <div className="flex-1 p-5 overflow-auto">
              <CandlestickChart candles={candles} height={Math.max(400, window.innerHeight * 0.7)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
