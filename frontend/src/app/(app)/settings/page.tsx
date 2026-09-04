"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
  authProvider: string;
  knowledgeLevel: string;
  goals: string[];
  riskAppetite: string;
  isDemo: boolean;
}
interface Session {
  id: string;
  device_label: string | null;
  created_at: string;
  revoked: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [fullName, setFullName] = useState("");
  const [knowledge, setKnowledge] = useState("beginner");
  const [risk, setRisk] = useState("moderate");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [entitlements, setEntitlements] = useState<{ plan: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ user: Me }>("/api/me").then((d) => {
      setMe(d.user);
      setFullName(d.user.fullName);
      setKnowledge(d.user.knowledgeLevel);
      setRisk(d.user.riskAppetite);
    });
    api.get<{ sessions: Session[] }>("/api/auth/sessions").then((d) => setSessions(d.sessions));
    api.get<{ plan: string }>("/api/me/entitlements").then((d) => setEntitlements(d));
  }, []);

  async function save() {
    await api.patch("/api/me", { fullName, knowledgeLevel: knowledge, riskAppetite: risk });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function revokeSession(id: string) {
    await api.del(`/api/auth/sessions/${id}`);
    api.get<{ sessions: Session[] }>("/api/auth/sessions").then((d) => setSessions(d.sessions));
  }

  async function deleteAccount() {
    if (!confirm("Delete your account? This soft-deletes your data (30-day grace period).")) return;
    await api.del("/api/me");
    await logout();
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Profile</h2>
        <div className="text-xs text-gray-400">{me?.email} · {me?.authProvider} · plan: {entitlements?.plan}</div>
        <label className="text-xs text-gray-500 block">Full name
          <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500 block">Knowledge level
          <select className="input mt-1" value={knowledge} onChange={(e) => setKnowledge(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="text-xs text-gray-500 block">Risk appetite
          <select className="input mt-1" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
        <button className="btn-primary" onClick={save}>{saved ? "Saved ✓" : "Save changes"}</button>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-3">Active sessions</h2>
        <div className="space-y-2">
          {sessions.filter((s) => !s.revoked).map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{s.device_label || "web"} · {new Date(s.created_at).toLocaleDateString()}</span>
              <button className="text-down text-xs" onClick={() => revokeSession(s.id)}>Revoke</button>
            </div>
          ))}
        </div>
      </div>

      <NewsEmailCard />

      <div className="card p-5 border-down/30">
        <h2 className="text-sm font-semibold text-down">Danger zone</h2>
        <button className="mt-3 text-sm text-down hover:underline" onClick={deleteAccount}>Delete account</button>
      </div>
    </div>
  );
}

function NewsEmailCard() {
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [smtp, setSmtp] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ subscription: { email: string; enabled: boolean; frequency: string }; smtpConfigured: boolean }>("/api/news/subscription").then((d) => {
      setEmail(d.subscription.email);
      setEnabled(d.subscription.enabled);
      setFrequency(d.subscription.frequency === "weekly" ? "weekly" : "daily");
      setSmtp(d.smtpConfigured);
    });
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await api.put("/api/news/subscription", { email, enabled, frequency });
      setMsg("Saved ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true);
    setMsg("");
    setPreview(null);
    try {
      const d = await api.post<{ ok: boolean; mode: string; preview?: string; count: number }>("/api/news/send-digest");
      if (d.mode === "preview" && d.preview) {
        setPreview(d.preview);
        setMsg(`Digest ready (${d.count} items) — SMTP not configured, showing preview instead of sending.`);
      } else {
        setMsg(`Digest emailed ✓ (${d.count} items)`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <h2 className="text-sm font-semibold">Email news digest</h2>
      <p className="text-xs text-gray-400">
        Get watchlist news and top movers by email. {!smtp && "SMTP isn't configured yet, so sending shows a preview until you set SMTP_HOST in the backend .env."}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Email me news
      </label>
      <label className="text-xs text-gray-500 block">Email
        <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="text-xs text-gray-500 block">Frequency
        <select className="input mt-1" value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
        <button className="btn-secondary" disabled={busy} onClick={sendNow}>Send me today&apos;s digest</button>
      </div>
      {msg && <p className="text-sm text-brand">{msg}</p>}
      {preview && <pre className="text-xs text-gray-600 bg-surface-muted rounded p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{preview}</pre>}
    </div>
  );
}
