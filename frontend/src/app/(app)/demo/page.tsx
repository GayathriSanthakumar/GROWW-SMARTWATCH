"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Scenario {
  id: string;
  name: string;
  description: string;
}

export default function DemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<{ scenarios: Scenario[] }>("/api/demo/status").then((d) => setScenarios(d.scenarios)).catch(() => {});
  }, []);

  async function trigger(id: string, name: string) {
    setBusy(id);
    setMsg("");
    try {
      await api.post("/api/demo/trigger", { scenarioId: id });
      setMsg(`Triggered: ${name} — watch the watchlist/notifications update live.`);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setMsg("");
    await api.post("/api/demo/reset");
    setMsg("Prices restored to seeded values.");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-bold mb-1">Demo Control Center</h1>
      <p className="text-sm text-gray-500 mb-4">Trigger seeded scenarios to see live updates, change detection and alerts in action.</p>

      <div className="space-y-2 mb-6">
        {scenarios.map((s) => (
          <button key={s.id} className="card w-full p-4 text-left hover:bg-surface-muted/50" disabled={busy === s.id} onClick={() => trigger(s.id, s.name)}>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray-500">{s.description}</div>
            {busy === s.id && <div className="text-xs text-brand mt-1">Triggering…</div>}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-brand mb-4">{msg}</p>}
      <button className="btn-secondary" onClick={reset}>Reset demo data</button>
    </div>
  );
}
