"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Gap {
  label: string;
  suggested: number;
  actual: number;
  delta: number;
}
interface Blueprint {
  goals: string[];
  riskAppetite: string;
  knowledgeLevel: string;
  allocation: { label: string; pct: number; sectors: string[] }[];
  gaps: Gap[];
  checklist: string[];
  disclaimer: string;
}

const COLORS = ["#5367ff", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4"];

export default function BlueprintPage() {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [risk, setRisk] = useState<string>("moderate");

  useEffect(() => {
    api.get<{ blueprint: Blueprint }>("/api/blueprint").then((d) => setBlueprint(d.blueprint));
  }, []);

  async function setRiskAppetite(r: string) {
    setRisk(r);
    await api.post("/api/blueprint/risk-quiz", { riskAppetite: r });
    api.get<{ blueprint: Blueprint }>("/api/blueprint").then((d) => setBlueprint(d.blueprint));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Wealth Blueprint</h1>
      <p className="text-sm text-gray-500 mb-4">Your personalized roadmap, built from your goals and current portfolio.</p>

      <div className="card p-4 mb-4">
        <span className="text-xs font-semibold text-gray-500 uppercase">Risk appetite</span>
        <div className="flex gap-2 mt-2">
          {["conservative", "moderate", "aggressive"].map((r) => (
            <button key={r} className={`px-3 py-1.5 rounded-full text-sm capitalize ${risk === r ? "bg-brand text-white" : "bg-surface-muted text-gray-600"}`} onClick={() => setRiskAppetite(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {blueprint && (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <h2 className="text-sm font-semibold mb-3">Suggested allocation</h2>
              {blueprint.allocation.map((a, i) => (
                <div key={a.label} className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{a.label}</span>
                    <span className="font-semibold">{a.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted">
                    <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 mt-3">Illustrative, not advice.</p>
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-semibold mb-3">Gap analysis vs your portfolio</h2>
              {blueprint.gaps.map((g) => (
                <div key={g.label} className="flex items-center justify-between text-sm py-1.5 border-b border-surface-border last:border-0">
                  <span className="text-gray-600">{g.label}</span>
                  <span className={`font-semibold ${g.delta > 10 ? "text-down" : g.delta < -10 ? "text-up" : "text-gray-500"}`}>
                    {g.actual}% vs {g.suggested}% ({g.delta > 0 ? "+" : ""}{g.delta}pt)
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Your checklist</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              {blueprint.checklist.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
            <p className="text-[11px] text-gray-400 mt-3">{blueprint.disclaimer}</p>
          </div>
        </>
      )}
    </div>
  );
}
