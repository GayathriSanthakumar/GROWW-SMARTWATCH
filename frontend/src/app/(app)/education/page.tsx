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

export default function EducationPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [level, setLevel] = useState<string>("all");

  useEffect(() => {
    api.get<{ lessons: Lesson[] }>("/api/education").then((d) => setLessons(d.lessons));
  }, []);

  const filtered = lessons.filter((l) => level === "all" || l.level === level);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Learn</h1>

      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold mb-3">📊 How to read candlestick charts</h2>
        <CandleGuide />
      </div>

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
  );
}
