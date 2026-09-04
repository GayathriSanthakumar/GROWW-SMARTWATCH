"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Instrument } from "@/lib/types";

const PROMPTS = [
  "Why did TCS change today?",
  "Explain the opportunity & risk scores",
  "Summarize Reliance",
  "What's the AI verdict on HDFCBANK?",
];

export default function AiPage() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    api.get<{ results: Instrument[] }>("/api/instruments/search?q=&limit=200").then((d) => setInstruments(d.results));
  }, []);

  async function send(text?: string) {
    const msg = text ?? input;
    if (!msg.trim()) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setBusy(true);
    try {
      const body: { message: string; instrumentId?: string } = { message: msg };
      if (selectedId) body.instrumentId = selectedId;
      const d = await api.post<{ response: string; disclaimer: string }>("/api/ai/chat", body);
      setMessages((m) => [...m, { role: "assistant", content: d.response }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Error" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col h-[calc(100vh-10rem)]">
      <h1 className="text-xl font-bold mb-1">AI Analyst</h1>
      <p className="text-sm text-gray-500 mb-4">Ask about any company — name it in your question (e.g. &quot;analyze TCS&quot;) or pick it below. Responses are grounded in live scores, fundamentals and news.</p>

      <div className="mb-3">
        <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Ask about any company (auto-detected from your question)</option>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.symbol} — {i.companyName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 card overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-400">Try one of these:</p>
            {PROMPTS.map((p) => (
              <button key={p} className="block text-sm text-brand hover:underline" onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm p-3 rounded-lg whitespace-pre-wrap ${m.role === "user" ? "bg-brand-light ml-10" : "bg-surface-muted mr-10"}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="text-sm text-gray-400">Thinking…</div>}
      </div>

      <div className="mt-3 flex gap-2">
        <input className="input" placeholder="Ask the AI analyst…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn-primary" disabled={busy} onClick={() => send()}>Send</button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Educational research tool — not financial advice. SMARTWATCH does not execute trades or guarantee returns.</p>
    </div>
  );
}
