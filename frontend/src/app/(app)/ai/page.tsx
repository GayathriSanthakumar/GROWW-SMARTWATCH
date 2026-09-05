"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Instrument } from "@/lib/types";
import { useMarket } from "@/store/market";

type Level = "beginner" | "intermediate" | "advanced";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const PROMPTS = [
  "Analyze TCS",
  "Why did TCS move today?",
  "Explain Wipro's current chart",
  "Explain the latest candle",
  "What does this candlestick mean?",
  "What is a Doji?",
  "Explain RSI",
  "Explain EMA 20",
  "Find support and resistance",
  "Explain volume",
  "Compare TCS and Infosys",
  "Give me a technical analysis",
  "Explain this stock like a beginner",
  "What are the risks?",
  "What could make this bullish?",
  "Should I buy this?",
  "What's the latest news on TCS?",
  "Show TCS fundamentals",
  "Is TCS undervalued or overvalued?",
  "How fast is TCS growing?",
  "Does ITC pay a dividend?",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
  learnTopic?: string | null;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const key = i;
    if (line.startsWith("### ")) {
      out.push(<div key={key} className="font-semibold text-gray-900 mt-1">{inline(line.slice(4))}</div>);
    } else if (line.startsWith("- ")) {
      out.push(<div key={key} className="pl-3 text-gray-700">• {inline(line.slice(2))}</div>);
    } else if (line.startsWith("  ") && line.trim().startsWith("- ")) {
      out.push(<div key={key} className="pl-6 text-gray-600">• {inline(line.trim().slice(2))}</div>);
    } else if (line.trim() === "") {
      out.push(<div key={key} className="h-1.5" />);
    } else {
      out.push(<div key={key} className="text-gray-700">{inline(line)}</div>);
    }
  });
  return out;
}

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}

export default function AiPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [level, setLevel] = useState<Level>("beginner");
  const [ctx, setCtx] = useState<{
    symbol: string;
    companyName: string;
    price: number;
    changePct: number;
    verdictLabel: string;
    status: string;
    conclusion: string;
  } | null>(null);
  const liveQuote = useMarket((s) => (selectedId ? s.quotes[selectedId] : undefined));

  useEffect(() => {
    api.get<{ results: Instrument[] }>("/api/instruments/search?q=&limit=400").then((d) => setInstruments(d.results)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setCtx(null);
      return;
    }
    const inst = instruments.find((i) => i.id === selectedId);
    if (!inst) return;
    api
      .get<{ insight: any }>(`/api/insights/${selectedId}`)
      .then((d) => {
        const g = d.insight;
        setCtx({
          symbol: g.company.symbol,
          companyName: g.company.companyName,
          price: g.market.price,
          changePct: g.market.changePct,
          verdictLabel: g.scores.verdictLabel,
          status: g.validation.status,
          conclusion: g.validation.correctedConclusion ?? g.validation.currentConclusion,
        });
      })
      .catch(() => {});
  }, [selectedId, instruments]);

  async function send(text?: string) {
    const msg = text ?? input;
    if (!msg.trim()) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setBusy(true);
    try {
      const body: { message: string; instrumentId?: string; experienceLevel: Level; context?: { symbol?: string } } = { message: msg, experienceLevel: level };
      if (selectedId) {
        const inst = instruments.find((i) => i.id === selectedId);
        body.instrumentId = selectedId;
        if (inst) body.context = { symbol: inst.symbol };
      }
      const d = await api.post<{ response: string; learnTopic?: string | null }>("/api/ai/chat", body);
      setMessages((m) => [...m, { role: "assistant", content: d.response, learnTopic: d.learnTopic }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Error" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col h-[calc(100vh-9rem)]">
      <h1 className="text-xl font-bold mb-1">AI Analyst</h1>
      <p className="text-sm text-gray-500 mb-4">
        Ask anything about stocks, companies, markets, charts or candlesticks. Name a company in your question or pick one below.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex rounded-lg bg-surface-muted p-0.5">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLevel(l.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${level === l.value ? "bg-white shadow text-gray-900" : "text-gray-500"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <select className="input max-w-[260px] !py-1.5 text-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Ask about any company (auto-detected)</option>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>{i.symbol} — {i.companyName}</option>
          ))}
        </select>
      </div>

      {ctx && (
        <div className="card p-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          <span>
            Company: <span className="font-semibold text-gray-900">{ctx.companyName} ({ctx.symbol})</span>
          </span>
          <span>
            Price: <span className="font-semibold tabular-nums">₹{(liveQuote?.ltp ?? ctx.price).toFixed(2)}</span>{" "}
            <span className={(liveQuote?.changePct ?? ctx.changePct) >= 0 ? "text-up" : "text-down"}>
              {(liveQuote?.changePct ?? ctx.changePct) >= 0 ? "+" : ""}{(liveQuote?.changePct ?? ctx.changePct).toFixed(2)}%
            </span>
          </span>
          <span>
            Current view: <span className="font-semibold">{ctx.verdictLabel}</span>
          </span>
          <span className={`pill ${ctx.status === "verified" ? "bg-up/10 text-up" : ctx.status === "corrected" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
            {ctx.status === "verified" ? "✅ Verified" : ctx.status === "corrected" ? `⚠️ Needs correction → ${ctx.conclusion}` : "Insufficient data"}
          </span>
        </div>
      )}

      <div className="flex-1 card overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-2">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <button key={p} className="text-xs px-2.5 py-1.5 rounded-full border border-surface-border text-gray-600 hover:bg-surface-muted" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm rounded-lg p-3 ${m.role === "user" ? "bg-brand-light ml-10" : "bg-surface-muted mr-6"}`}>
            <div className="whitespace-pre-wrap leading-relaxed">{m.role === "user" ? m.content : renderMarkdown(m.content)}</div>
            {m.role === "assistant" && m.learnTopic && (
              <Link href="/education" className="inline-block mt-2 text-xs text-brand hover:underline">
                Learn more →
              </Link>
            )}
          </div>
        ))}
        {busy && <div className="text-sm text-gray-400">Analyzing market data…</div>}
      </div>

      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="Ask the AI analyst…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn-primary" disabled={busy} onClick={() => send()}>Send</button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.</p>
    </div>
  );
}
