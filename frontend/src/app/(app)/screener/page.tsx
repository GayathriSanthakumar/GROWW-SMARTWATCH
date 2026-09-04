"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatPercent, marketCapLabel } from "@/lib/format";
import type { Instrument } from "@/lib/types";
import { VerdictBadge } from "@/components/VerdictBadge";
import { ScorePill } from "@/components/ScorePill";
import { StockDetailPanel } from "@/components/StockDetailPanel";

const SECTORS = ["Banking", "IT", "FMCG", "Auto", "Energy", "Metals", "Pharma", "Power", "Cement", "Consumer", "Telecom", "Infrastructure", "Conglomerate", "NBFC", "Index ETF", "Sector ETF", "Commodity ETF"];

interface Preset {
  id: string;
  name: string;
  params: Record<string, string>;
}

export default function ScreenerPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [results, setResults] = useState<Instrument[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({ sort: "opportunity", order: "desc" });
  const [sectors, setSectors] = useState<string[]>([]);
  const [shariaOnly, setShariaOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const run = useCallback(async (f: Record<string, string>) => {
    const params = new URLSearchParams(f);
    if (sectors.length) params.set("sectors", sectors.join(","));
    if (shariaOnly) params.set("sharia", "compliant");
    const d = await api.get<{ results: Instrument[] }>(`/api/screener?${params.toString()}`);
    setResults(d.results);
  }, [sectors, shariaOnly]);

  useEffect(() => {
    api.get<{ presets: Preset[] }>("/api/screener/presets").then((d) => setPresets(d.presets));
  }, []);

  useEffect(() => {
    run(filters);
  }, [run, filters]);

  function setFilter(k: string, v: string) {
    const next = { ...filters, [k]: v };
    if (!v) delete next[k];
    setFilters(next);
  }

  async function saveScreen() {
    const name = prompt("Name this screen:");
    if (!name) return;
    await api.post("/api/screens", { name, filters: { ...filters, sectors, shariaOnly } });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Screener</h1>
        <button className="btn-secondary" onClick={saveScreen}>Save screen</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {presets.map((p) => (
          <button key={p.id} className="btn-secondary !py-1.5 text-sm" onClick={() => setFilters((f) => ({ ...f, ...p.params }))}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs text-gray-500">Instrument type
          <select className="input mt-1" value={filters.type || ""} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="">All</option>
            <option value="stock">Stocks</option>
            <option value="etf">ETFs</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">AI verdict
          <select className="input mt-1" value={filters.aiVerdict || ""} onChange={(e) => setFilter("aiVerdict", e.target.value)}>
            <option value="">Any</option>
            <option value="buy_lean">BUY-lean</option>
            <option value="hold">HOLD</option>
            <option value="watch">WATCH</option>
            <option value="avoid_lean">AVOID-lean</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">Min opportunity
          <input className="input mt-1" type="number" value={filters.minOpportunity || ""} onChange={(e) => setFilter("minOpportunity", e.target.value)} placeholder="0" />
        </label>
        <label className="text-xs text-gray-500">Max risk
          <input className="input mt-1" type="number" value={filters.maxRisk || ""} onChange={(e) => setFilter("maxRisk", e.target.value)} placeholder="100" />
        </label>
        <label className="text-xs text-gray-500">Min dividend %
          <input className="input mt-1" type="number" value={filters.minDividendYield || ""} onChange={(e) => setFilter("minDividendYield", e.target.value)} placeholder="0" />
        </label>
        <label className="text-xs text-gray-500">Sort by
          <select className="input mt-1" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
            <option value="opportunity">Opportunity</option>
            <option value="risk">Risk</option>
            <option value="alpha">Alpha Growth</option>
            <option value="smartMoney">Smart Money</option>
            <option value="financialStrength">Financial Strength</option>
            <option value="dividendYield">Dividend Yield</option>
            <option value="marketCap">Market Cap</option>
          </select>
        </label>
        <label className="text-xs text-gray-500 col-span-2 flex items-end gap-2 pb-1">
          <input type="checkbox" className="accent-brand" checked={shariaOnly} onChange={(e) => setShariaOnly(e.target.checked)} />
          Sharia-compliant only
        </label>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {SECTORS.map((s) => (
          <button key={s} className={`text-xs px-2.5 py-1 rounded-full border ${sectors.includes(s) ? "bg-brand text-white border-brand" : "border-surface-border text-gray-600 hover:bg-surface-muted"}`} onClick={() => setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}>
            {s}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs text-gray-500">
              <th className="py-2 px-3">Company</th>
              <th className="py-2 px-3 text-right">LTP</th>
              <th className="py-2 px-3 text-right">1D %</th>
              <th className="py-2 px-3">Opp</th>
              <th className="py-2 px-3">Risk</th>
              <th className="py-2 px-3">Alpha</th>
              <th className="py-2 px-3">Verdict</th>
              <th className="py-2 px-3">Mkt Cap</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b border-surface-border hover:bg-surface-muted/50 cursor-pointer" onClick={() => setDetailId(r.id)}>
                <td className="py-2.5 px-3">
                  <div className="font-semibold">{r.symbol}</div>
                  <div className="text-xs text-gray-500">{r.companyName}</div>
                </td>
                <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{formatINR(r.ltp)}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums ${r.changePct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(r.changePct)}</td>
                <td className="py-2.5 px-3"><ScorePill label="" value={r.scores.opportunity} /></td>
                <td className="py-2.5 px-3"><ScorePill label="" value={r.scores.risk} invert /></td>
                <td className="py-2.5 px-3"><ScorePill label="" value={r.scores.alphaGrowth} /></td>
                <td className="py-2.5 px-3"><VerdictBadge verdict={r.scores.aiVerdict} /></td>
                <td className="py-2.5 px-3 text-xs text-gray-500">{marketCapLabel(r.fundamentals.marketCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <div className="p-8 text-center text-gray-400">No matches. Try widening filters.</div>}
      </div>

      {detailId && <StockDetailPanel instrumentId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
