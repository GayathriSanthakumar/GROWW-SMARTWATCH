"use client";

import { useState } from "react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GoToModal({
  onClose,
  onGoToDate,
  onGoToRange,
}: {
  onClose: () => void;
  onGoToDate: (date: Date) => void;
  onGoToRange: (start: Date, end: Date) => void;
}) {
  const [tab, setTab] = useState<"date" | "range">("date");
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));
  const [time, setTime] = useState("00:00");
  const [startDate, setStartDate] = useState(() => fmtDate(new Date()));
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState(() => fmtDate(new Date()));
  const [endTime, setEndTime] = useState("23:59");

  const monthLabel = viewDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function selectDay(day: number) {
    setSelected(new Date(year, month, day));
  }

  function goDate() {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(selected);
    d.setHours(h || 0, m || 0, 0, 0);
    onGoToDate(d);
  }

  function goRange() {
    const parse = (dateStr: string, timeStr: string) => {
      const [y, mo, d] = dateStr.split("-").map(Number);
      const [h, mi] = timeStr.split(":").map(Number);
      return new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
    };
    onGoToRange(parse(startDate, startTime), parse(endDate, endTime));
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <span className="font-semibold">Go to</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-muted text-gray-500">✕</button>
        </div>

        <div className="flex border-b border-surface-border">
          {(["date", "range"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium ${tab === t ? "text-brand border-b-2 border-brand" : "text-gray-500"}`}
            >
              {t === "date" ? "Date" : "Custom range"}
            </button>
          ))}
        </div>

        {tab === "date" ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="px-2 py-1 rounded hover:bg-surface-muted text-gray-600">‹</button>
              <span className="text-sm font-medium capitalize">{monthLabel}</span>
              <button onClick={nextMonth} className="px-2 py-1 rounded hover:bg-surface-muted text-gray-600">›</button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSel = selected.getDate() === day && selected.getMonth() === month && selected.getFullYear() === year;
                return (
                  <button
                    key={day}
                    onClick={() => selectDay(day)}
                    className={`h-8 rounded-md text-sm ${isSel ? "bg-brand text-white" : "hover:bg-surface-muted text-gray-700"}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center justify-between mt-4 text-sm">
              <span className="text-gray-500">Time</span>
              <input type="time" className="input max-w-[120px]" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={goDate}>Go to</button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Start</div>
              <div className="flex gap-2">
                <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="time" className="input max-w-[120px]" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="text-xs text-gray-500">End</div>
              <div className="flex gap-2">
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <input type="time" className="input max-w-[120px]" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={goRange}>Go to</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
