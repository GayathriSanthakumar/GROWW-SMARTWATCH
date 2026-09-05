"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CandleGuide } from "@/components/CandleGuide";

interface Lesson {
  id: string;
  level: string;
  title: string;
  category: string;
  minutes: number;
  body: string;
}

const UP = "#16a34a";
const DOWN = "#dc2626";

export default function EducationPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [level, setLevel] = useState<string>("all");

  useEffect(() => {
    api.get<{ lessons: Lesson[] }>("/api/education").then((d) => setLessons(d.lessons)).catch(() => {});
  }, []);

  const filtered = lessons.filter((l) => level === "all" || l.level === level);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Learn</h1>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">📊 Candlesticks — the complete beginner&apos;s guide</h2>
        <CandleGuide />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-3">🕘 Indian market hours (IST)</h2>
        <div className="relative pl-6 border-l-2 border-surface-border space-y-5">
          <TimelineRow time="09:00 AM" title="Pre-open session" desc="Orders are placed but not matched; helps discover an opening price." />
          <TimelineRow time="09:15 AM" title="Regular market opens" desc="Continuous trading begins — prices move freely." active />
          <TimelineRow time="03:30 PM" title="Regular market closes" desc="Closing auction determines the closing price." />
        </div>
        <p className="text-xs text-gray-400 mt-4">Markets are closed on Saturdays, Sundays and exchange holidays (e.g. Republic Day, Independence Day, Diwali, Holi). Times are always in Indian Standard Time (IST).</p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-3">🏛️ NSE vs BSE</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-muted p-4">
            <div className="font-semibold">NSE</div>
            <div className="text-xs text-gray-500">National Stock Exchange of India</div>
            <div className="text-xs mt-2">India&apos;s largest exchange by volume. Many companies are listed here.</div>
          </div>
          <div className="rounded-lg bg-surface-muted p-4">
            <div className="font-semibold">BSE</div>
            <div className="text-xs text-gray-500">BSE Ltd (Bombay Stock Exchange)</div>
            <div className="text-xs mt-2">Asia&apos;s oldest exchange. Many stocks trade on both NSE and BSE.</div>
          </div>
        </div>
        <ul className="text-xs text-gray-600 mt-3 space-y-1">
          <li>• A stock can be listed and traded on both exchanges.</li>
          <li>• Symbols/identifiers can differ (NSE uses a ticker like <code>RELIANCE</code>, BSE uses a numeric code like <code>500325</code>).</li>
          <li>• Prices can differ slightly because they are separate order books.</li>
          <li>• Choosing the right exchange matters for the quote you see.</li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-3">📈 Moving averages &amp; RSI</h2>
        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <span className="font-semibold">EMA (Exponential Moving Average)</span> — the average of the last N closing prices, weighted toward recent ones. <strong>EMA 20</strong> (short-term) and <strong>EMA 50</strong> (medium-term) are common. Price above a rising EMA = uptrend.
          </div>
          <div>
            <span className="font-semibold">SMA (Simple Moving Average)</span> — the plain average of the last N closes. Slower to react than EMA.
          </div>
          <div>
            <span className="font-semibold">RSI (Relative Strength Index, 0–100)</span> — measures momentum. Above <span className="text-down">70</span> = often overbought; below <span className="text-up">30</span> = often oversold.
          </div>
          <div className="flex items-center gap-4 pt-1">
            <svg width="200" height="50" viewBox="0 0 200 50">
              <polyline points="0,40 30,34 60,36 90,26 120,28 150,14 180,16 200,8" fill="none" stroke={UP} strokeWidth="2" />
              <polyline points="0,44 30,42 60,40 90,34 120,32 150,24 180,22 200,16" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
            <div className="text-xs text-gray-500">
              <div><span style={{ color: UP }}>— price</span></div>
              <div><span style={{ color: "#8b5cf6" }}>-- EMA</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-3">🧭 Support, resistance &amp; trend</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <div className="font-semibold mb-1">Support &amp; resistance</div>
            <p className="text-xs text-gray-500">Support is a price floor where buyers tend to step in; resistance is a ceiling where sellers appear.</p>
            <svg width="220" height="60" viewBox="0 0 220 60" className="mt-2">
              <line x1="0" y1="16" x2="220" y2="16" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="2" y="12" fontSize="8" fill="#b45309">resistance</text>
              <polyline points="0,40 40,26 80,34 120,18 160,26 200,12" fill="none" stroke={UP} strokeWidth="2" />
              <line x1="0" y1="44" x2="220" y2="44" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="2" y="58" fontSize="8" fill="#0e7490">support</text>
            </svg>
          </div>
          <div>
            <div className="font-semibold mb-1">Trend</div>
            <p className="text-xs text-gray-500">Higher highs + higher lows = uptrend. Lower highs + lower lows = downtrend.</p>
            <svg width="220" height="60" viewBox="0 0 220 60" className="mt-2">
              <polyline points="0,40 40,28 80,34 120,16 160,22 200,6" fill="none" stroke={UP} strokeWidth="2" />
              <text x="150" y="52" fontSize="8" fill={UP}>uptrend ▲</text>
            </svg>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-3">✅ How to read a chart (quick checklist)</h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1.5">
          <li>Pick a timeframe — shorter for intraday, longer for the big picture.</li>
          <li>Check the last price and today&apos;s change (green/red).</li>
          <li>Look at the trend (higher-highs or lower-lows).</li>
          <li>Watch volume — is the move backed by participation?</li>
          <li>Spot support/resistance and moving averages.</li>
          <li>Use patterns as context, never as a certainty.</li>
        </ol>
      </section>

      <div>
        <div className="flex gap-2 mb-4">
          {["all", "beginner", "intermediate", "advanced"].map((l) => (
            <button key={l} className={`px-3 py-1.5 rounded-full text-sm capitalize ${level === l ? "bg-brand text-white" : "bg-white border border-surface-border text-gray-600"}`} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filtered.map((l) => (
            <div key={l.id} className="card overflow-hidden">
              <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <div>
                  <div className="text-sm font-semibold">{l.title}</div>
                  <div className="text-xs text-gray-500">{l.category} · {l.minutes} min · <span className="capitalize">{l.level}</span></div>
                </div>
                <span className="text-gray-400">{open === l.id ? "−" : "+"}</span>
              </button>
              {open === l.id && <div className="px-4 pb-4 text-sm text-gray-700 leading-relaxed">{l.body}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ time, title, desc, active }: { time: string; title: string; desc: string; active?: boolean }) {
  return (
    <div className="relative">
      <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${active ? "bg-up" : "bg-surface-border"}`} />
      <div className="text-xs font-bold text-gray-400">{time}</div>
      <div className="font-semibold text-gray-800">{title}</div>
      <div className="text-xs text-gray-500">{desc}</div>
    </div>
  );
}
