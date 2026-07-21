import { Briefcase, Plus, Clock } from "lucide-react";
import { useState } from "react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", iceBlueBg: "rgba(71,114,250,0.11)", seaGlass: "#70B89F",
};

const PROJECTS = [
  { id: 1, name: "Redesign strony",    color: C.iceBlue,  tasks: 8, done: 5 },
  { id: 2, name: "Raport Q2",          color: C.seaGlass, tasks: 4, done: 4 },
  { id: 3, name: "Onboarding klienta", color: "#D4AA68",  tasks: 6, done: 1 },
];

const SESSIONS = [
  { id: 1, project: "Redesign strony", duration: "1h 45min", time: "10:00–11:45" },
  { id: 2, project: "Raport Q2",       duration: "2h 00min", time: "13:00–15:00" },
];

export default function Praca() {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Praca</h1>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.iceBlue, color: "#242424" }}>
            <Plus size={13} strokeWidth={2} />Nowy projekt
          </button>
        </div>

        {/* Focus timer */}
        <div className="rounded-2xl p-6 mb-4 flex items-center justify-between"
          style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: C.textDisabled }}>Sesja fokus</p>
            <div className="text-[38px] font-semibold tracking-tight" style={{ fontFamily: "'DM Mono', monospace", color: running ? C.iceBlue : C.textPrimary }}>
              {mm}:{ss}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunning((v) => !v)}
              className="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
              style={{
                background: running ? C.iceBlueBg : C.iceBlue,
                color: running ? C.iceBlue : "#242424",
                border: running ? `1px solid rgba(71,114,250,0.11)` : "none",
              }}
            >
              {running ? "Pauza" : "Start"}
            </button>
          </div>
        </div>

        {/* Projects */}
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: C.textDisabled }}>Projekty</p>
        <div className="space-y-2 mb-6">
          {PROJECTS.map((p) => {
            const pct = Math.round((p.done / p.tasks) * 100);
            return (
              <div key={p.id} className="flex items-center gap-4 rounded-2xl px-4 py-3.5 cursor-pointer transition-colors"
                style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <span className="flex-1 text-[13px] font-medium" style={{ color: C.textPrimary }}>{p.name}</span>
                <div className="flex items-center gap-3">
                  <div className="w-28 h-[3px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? C.seaGlass : p.color }} />
                  </div>
                  <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: pct === 100 ? C.seaGlass : C.textDisabled }}>
                    {p.done}/{p.tasks}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sessions */}
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: C.textDisabled }}>Sesje dziś</p>
        <div className="space-y-2">
          {SESSIONS.map((s) => (
            <div key={s.id} className="flex items-center gap-4 rounded-2xl px-4 py-3" style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}>
              <Clock size={14} strokeWidth={1.5} style={{ color: C.textDisabled }} />
              <span className="flex-1 text-[13px]" style={{ color: C.textSecond }}>{s.project}</span>
              <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: C.textDisabled }}>{s.time}</span>
              <span className="text-[11px] font-medium" style={{ fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{s.duration}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
