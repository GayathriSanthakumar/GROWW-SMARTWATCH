"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

const GOALS = [
  { id: "start_investing", label: "Start investing", emoji: "🚀" },
  { id: "find_growth", label: "Find growth opportunities", emoji: "📈" },
  { id: "build_dividend_income", label: "Build dividend income", emoji: "💰" },
  { id: "analyze_ai", label: "Analyze stocks with AI", emoji: "🤖" },
  { id: "follow_smart_money", label: "Follow institutional/smart money", emoji: "🏦" },
  { id: "track_portfolio", label: "Track a portfolio I own", emoji: "🧾" },
  { id: "learn", label: "Learn how stocks work", emoji: "🎓" },
  { id: "screen", label: "Compare & screen the market", emoji: "🔍" },
];

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, initialized } = useAuth();
  const fetchMe = useAuth((s) => s.fetchMe);
  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState<string[]>([]);
  const [level, setLevel] = useState<string>("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Onboarding requires an authenticated session (it persists goals/level to the
  // account). Hydrate the session on mount so the UI doesn't sit on a splash:
  // if there is no token yet (e.g. deep-linked before the auth cookie was
  // written) fetchMe resolves to user=null and we redirect home instead of
  // firing a PUT that would 401 into a crash.
  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-gray-400">
        Checking your session…
      </div>
    );
  }

  if (!user) {
    // No session -> return to landing (login/signup/demo) instead of crashing.
    return (
      <div className="min-h-screen grid place-items-center text-sm text-gray-400">
        <button
          className="text-brand font-medium hover:underline"
          onClick={() => {
            router.replace("/");
          }}
        >
          Your session ended — go back to log in →
        </button>
      </div>
    );
  }

  function toggleGoal(id: string) {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  async function finish() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await api.put("/api/auth/onboarding", { goals, knowledgeLevel: level, riskAppetite: "moderate" });
      await fetchMe();
      router.push("/watchlist");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (err instanceof Error && "status" in err && (err as { status?: number }).status === 401) {
        setError("Your session expired. Please log in again.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl card p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold">Set up SMARTWATCH</h1>
          <span className="text-sm text-gray-400">Step {step} / 2</span>
        </div>

        <div className="h-1.5 rounded-full bg-surface-muted mb-8">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: step === 1 ? "50%" : "100%" }} />
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-down">{error}</div>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold mb-1">What do you want SMARTWATCH to help you do?</h2>
            <p className="text-sm text-gray-500 mb-5">Pick all that apply — this personalizes your home.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGoal(g.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    goals.includes(g.id) ? "border-brand bg-brand-light text-brand-dark" : "border-surface-border hover:bg-surface-muted"
                  }`}
                >
                  <span>{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
            <button className="btn-primary w-full mt-6" disabled={goals.length === 0} onClick={() => setStep(2)}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold mb-1">How would you describe your investing experience?</h2>
            <p className="text-sm text-gray-500 mb-5">This sets which explanations and lessons appear first.</p>
            <div className="space-y-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm capitalize ${
                    level === l ? "border-brand bg-brand-light text-brand-dark" : "border-surface-border hover:bg-surface-muted"
                  }`}
                >
                  {l === "beginner" ? "Beginner — I'm learning the basics" : l === "intermediate" ? "Intermediate — I understand stocks & ratios" : "Advanced — I follow fundamentals, valuation & flows"}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" disabled={busy} onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn-primary flex-1" disabled={busy} onClick={finish}>
                {busy ? "Finishing…" : "Get started"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
