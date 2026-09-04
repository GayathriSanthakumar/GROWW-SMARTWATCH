"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LandingPage() {
  const router = useRouter();
  const { user, initialized, setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialized && user) router.replace("/watchlist");
  }, [initialized, user, router]);

  const passwordHint = () => {
    if (!password) return null;
    const okLen = password.length >= 8;
    const okNum = /\d/.test(password);
    const okLetter = /[A-Za-z]/.test(password);
    return (
      <div className="mt-1 flex gap-2 text-xs">
        <span className={okLen ? "text-up" : "text-gray-400"}>8+ chars</span>
        <span className={okNum ? "text-up" : "text-gray-400"}>1 number</span>
        <span className={okLetter ? "text-up" : "text-gray-400"}>1 letter</span>
      </div>
    );
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await api.post("/api/auth/signup", { fullName, email, password });
        router.push("/onboarding");
      } else {
        await api.post("/api/auth/login", { email, password });
        router.push("/watchlist");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      const data = await api.post<{ user: { id: string; email: string; fullName: string; authProvider: string; isDemo: boolean; knowledgeLevel: string } }>("/api/demo/enter");
      setUser(data.user);
      router.push("/watchlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex flex-1 flex-col lg:flex-row items-center justify-center gap-12 px-6 py-12">
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-xl bg-brand text-white grid place-items-center font-bold text-lg">S</div>
            <span className="text-xl font-bold tracking-tight">SMARTWATCH</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
            Don&apos;t watch everything.
            <br />
            <span className="text-brand">Know what changed.</span>
          </h1>
          <p className="mt-4 text-gray-500 text-lg">
            A stock watchlist with personal market memory, deterministic opportunity &amp; risk scoring, and AI verdicts — built Groww-style, powered by Warifin-style intelligence.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-gray-600">
            <li>• Your own live-updating watchlists, isolated per user</li>
            <li>• AI verdict badges, Alpha Growth &amp; Smart Money scores</li>
            <li>• Wealth Blueprint, ETF &amp; Sharia screening</li>
          </ul>
        </div>

        <div className="w-full max-w-md card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{mode === "login" ? "Welcome back" : "Create your account"}</h2>

          <GoogleButton onDone={(isNew) => router.push(isNew ? "/onboarding" : "/watchlist")} />

          <div className="flex items-center gap-3 my-4 text-xs text-gray-400">
            <div className="h-px bg-surface-border flex-1" />
            or
            <div className="h-px bg-surface-border flex-1" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input className="input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            )}
            <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {mode === "signup" && (
              <>
                {passwordHint()}
                <input className="input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </>
            )}
            {error && <p className="text-sm text-down">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="mt-3 text-sm text-gray-500 text-center">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button className="text-brand font-medium" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button className="text-brand font-medium" onClick={() => setMode("login")}>
                  Log in
                </button>
              </>
            )}
          </p>

          <button onClick={enterDemo} disabled={busy} className="mt-4 w-full text-sm text-brand font-medium hover:underline">
            Just exploring? Try Demo Mode →
          </button>
        </div>
      </main>

      <footer className="border-t border-surface-border py-4 text-center text-xs text-gray-400">
        <div className="flex justify-center gap-4">
          <span>Terms</span>
          <span>Privacy</span>
          <span>Educational tool — not investment advice</span>
        </div>
      </footer>
    </div>
  );
}
