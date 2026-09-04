"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Alert {
  id: string;
  instrument_id: string | null;
  condition_json: Record<string, unknown>;
  notify_mode: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered_at: string | null;
  symbol: string | null;
  company_name: string | null;
}
interface Notification {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  symbol: string | null;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  function load() {
    api.get<{ alerts: Alert[] }>("/api/alerts").then((d) => setAlerts(d.alerts));
    api.get<{ notifications: Notification[] }>("/api/notifications").then((d) => setNotifications(d.notifications));
  }

  useEffect(load, []);

  async function toggleAlert(id: string, isActive: boolean) {
    await api.patch(`/api/alerts/${id}`, { isActive });
    load();
  }
  async function deleteAlert(id: string) {
    await api.del(`/api/alerts/${id}`);
    load();
  }
  async function markAllRead() {
    await api.post("/api/notifications/read-all");
    load();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 grid md:grid-cols-2 gap-6">
      <div>
        <h1 className="text-xl font-bold mb-4">Alerts</h1>
        <div className="space-y-3">
          {alerts.length === 0 && <p className="text-gray-400 text-sm">No alerts yet. Open a stock and use &quot;Set Alert&quot;.</p>}
          {alerts.map((a) => (
            <div key={a.id} className="card p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{a.symbol || "—"}</div>
                <div className="text-xs text-gray-500">{describeCondition(a.condition_json)} · {a.notify_mode}</div>
                <div className="text-xs text-gray-400 mt-1">Triggered {a.trigger_count} time{a.trigger_count === 1 ? "" : "s"}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className={`pill ${a.is_active ? "bg-up/10 text-up" : "bg-gray-100 text-gray-500"}`} onClick={() => toggleAlert(a.id, !a.is_active)}>
                  {a.is_active ? "Active" : "Paused"}
                </button>
                <button className="text-down text-xs" onClick={() => deleteAlert(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Notifications</h1>
          <button className="text-sm text-brand" onClick={markAllRead}>Mark all read</button>
        </div>
        <div className="space-y-2">
          {notifications.length === 0 && <p className="text-gray-400 text-sm">No notifications yet.</p>}
          {notifications.map((n) => (
            <div key={n.id} className={`card p-3 ${n.is_read ? "opacity-60" : ""}`}>
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{n.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function describeCondition(c: Record<string, unknown>): string {
  if (c.type === "price_above") return `Price above ₹${c.price}`;
  if (c.type === "price_below") return `Price below ₹${c.price}`;
  if (c.type === "price_move") return `±${c.pct}% move (${c.direction})`;
  if (c.type === "volume_spike") return `Volume spike ${c.ratio}x`;
  return "Custom";
}
