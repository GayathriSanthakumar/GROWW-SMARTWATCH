"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { formatINR, formatPercent, formatCompact } from "@/lib/format";
import type { PortfolioPosition } from "@/lib/types";
import { VerdictBadge } from "@/components/VerdictBadge";

const PIE_COLORS = ["#5367ff", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316", "#84cc16"];

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  current: number;
  progress: number;
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<{ invested: number; currentValue: number; pnl: number; pnlPct: number; holdings: number } | null>(null);
  const [bySector, setBySector] = useState<{ label: string; value: number }[]>([]);
  const [byType, setByType] = useState<{ label: string; value: number }[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [days, setDays] = useState<{ date: string; pnl: number }[]>([]);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  async function load() {
    const [p, s, a, g, c] = await Promise.all([
      api.get<{ positions: PortfolioPosition[] }>("/api/portfolio"),
      api.get<{ summary: { invested: number; currentValue: number; pnl: number; pnlPct: number; holdings: number } }>("/api/portfolio/summary"),
      api.get<{ bySector: { label: string; value: number }[]; byType: { label: string; value: number }[] }>("/api/portfolio/allocation"),
      api.get<{ goals: Goal[] }>("/api/portfolio/goals"),
      api.get<{ days: { date: string; pnl: number }[] }>("/api/portfolio/calendar"),
    ]);
    setPositions(p.positions);
    setSummary(s.summary);
    setBySector(a.bySector);
    setByType(a.byType);
    setGoals(g.goals);
    setDays(c.days);
  }

  useEffect(() => {
    load();
  }, []);

  async function removePosition(id: string) {
    if (!confirm("Remove this position?")) return;
    await api.del(`/api/portfolio/${id}`);
    load();
  }

  async function createGoal() {
    if (!goalName.trim()) return;
    await api.post("/api/portfolio/goals", { name: goalName.trim(), targetAmount: Number(goalTarget) || 0 });
    setGoalName("");
    setGoalTarget("");
    load();
  }

  async function assignGoal(positionId: string, goalId: string) {
    await api.patch(`/api/portfolio/${positionId}`, { goalId: goalId || null });
    load();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Portfolio <span className="text-xs font-normal text-gray-400">(simulated tracking — not a brokerage)</span></h1>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card p-4"><div className="text-xs text-gray-500">Invested</div><div className="text-lg font-bold">{formatINR(summary.invested)}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Current value</div><div className="text-lg font-bold">{formatINR(summary.currentValue)}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">P&amp;L</div><div className={`text-lg font-bold ${summary.pnl >= 0 ? "text-up" : "text-down"}`}>{formatINR(summary.pnl)}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Return</div><div className={`text-lg font-bold ${summary.pnlPct >= 0 ? "text-up" : "text-down"}`}>{formatPercent(summary.pnlPct)}</div></div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2">Sector allocation</h2>
          {bySector.length ? <Donut data={bySector} /> : <EmptyAlloc />}
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2">Stock / ETF mix</h2>
          {byType.length ? <Donut data={byType} /> : <EmptyAlloc />}
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Goals &amp; progress</h2>
        </div>
        <div className="flex gap-2 mb-4">
          <input className="input max-w-[200px]" placeholder="Goal name (e.g. Emergency Fund)" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
          <input className="input max-w-[140px]" type="number" placeholder="Target ₹" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          <button className="btn-primary" onClick={createGoal}>Add goal</button>
        </div>
        {goals.length === 0 && <p className="text-sm text-gray-400">Add a goal and assign positions to it (from the table below).</p>}
        {goals.map((g) => (
          <div key={g.id} className="mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{g.name}</span>
              <span className="text-gray-500">{formatCompact(g.current)} / {formatCompact(g.targetAmount)} · {g.progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(g.progress, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {days.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Daily P&amp;L (last {days.length} days)</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1">
            {days.map((d) => {
              const max = Math.max(...days.map((x) => Math.abs(x.pnl)), 1);
              const intensity = Math.min(Math.abs(d.pnl) / max, 1);
              const color = d.pnl >= 0 ? `rgba(22,163,74,${0.2 + intensity * 0.8})` : `rgba(220,38,38,${0.2 + intensity * 0.8})`;
              return <div key={d.date} title={`${d.date} · ${formatINR(d.pnl)}`} className="aspect-square rounded-[3px]" style={{ background: color }} />;
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[11px] text-gray-500">
            <span>Green = profit day</span><span>Red = loss day</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-xs text-gray-500">
              <th className="py-2 px-3">Stock</th>
              <th className="py-2 px-3 text-right">Qty</th>
              <th className="py-2 px-3 text-right">LTP</th>
              <th className="py-2 px-3 text-right">P&amp;L</th>
              <th className="py-2 px-3">Verdict</th>
              <th className="py-2 px-3">Goal</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-surface-border hover:bg-surface-muted/50">
                <td className="py-2.5 px-3"><div className="font-semibold">{p.symbol}</div><div className="text-xs text-gray-500">{p.companyName}</div></td>
                <td className="py-2.5 px-3 text-right tabular-nums">{p.quantity}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{formatINR(p.ltp)}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{formatINR(p.pnl)} ({formatPercent(p.pnlPct)})</td>
                <td className="py-2.5 px-3"><VerdictBadge verdict={p.scores.aiVerdict} /></td>
                <td className="py-2.5 px-3">
                  <select className="input !py-1 !px-2 text-xs max-w-[140px]" value={p.goalId ?? ""} onChange={(e) => assignGoal(p.id, e.target.value)}>
                    <option value="">—</option>
                    {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td className="py-2.5 px-3 text-right"><button className="text-down text-xs" onClick={() => removePosition(p.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {positions.length === 0 && <div className="p-8 text-center text-gray-400">No positions yet. Open a stock and use &quot;Add to Portfolio&quot;.</div>}
      </div>
    </div>
  );
}

function Donut({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={40} outerRadius={70} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => formatINR(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold">{formatCompact(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyAlloc() {
  return <div className="text-sm text-gray-400 py-6 text-center">Add holdings to see allocation.</div>;
}
