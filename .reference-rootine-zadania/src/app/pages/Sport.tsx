import { Dumbbell, Plus, Flame } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", seaGlass: "#70B89F", seaGlassBg: "rgba(112,184,159,0.12)",
  iceBlueBg: "rgba(71,114,250,0.11)", warning: "#D4AA68",
};

const WEEK = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];
const ACTIVITY = [1, 0, 1, 1, 0, 0, 0];

const WORKOUTS = [
  { id: 1, name: "Bieg 5 km",         date: "Wczoraj",     duration: "28 min", kcal: 320, color: C.seaGlass },
  { id: 2, name: "Siłownia – górne",   date: "Wtorek",      duration: "55 min", kcal: 410, color: C.iceBlue  },
  { id: 3, name: "Bieg 8 km",          date: "Poniedziałek",duration: "45 min", kcal: 520, color: C.seaGlass },
];

const STATS = [
  { label: "Treningi",   value: "3", unit: "/ 5 plan." },
  { label: "Kilometry",  value: "13", unit: "km"       },
  { label: "Kcal",       value: "1 250", unit: "kcal"  },
];

export default function Sport() {
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Sport</h1>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium"
            style={{ background: C.iceBlue, color: "#242424" }}
          >
            <Plus size={13} strokeWidth={2} />Dodaj trening
          </button>
        </div>

        {/* Week activity */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: C.textDisabled }}>Ten tydzień</p>
          <div className="flex gap-2">
            {WEEK.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full rounded-xl flex items-center justify-center text-[11px] font-medium"
                  style={{
                    aspectRatio: "1",
                    background: i === todayIdx ? C.iceBlueBg : ACTIVITY[i] ? C.seaGlassBg : C.elevated,
                    color: i === todayIdx ? C.iceBlue : ACTIVITY[i] ? C.seaGlass : C.textDisabled,
                    border: `1px solid ${i === todayIdx ? "rgba(71,114,250,0.5)" : C.borderSubtle}`,
                  }}
                >
                  {ACTIVITY[i] ? <Flame size={13} strokeWidth={1.5} /> : ""}
                </div>
                <span className="text-[10px]" style={{ color: i === todayIdx ? C.iceBlue : C.textDisabled }}>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {STATS.map((s, i) => (
            <div key={i} className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
              <div className="text-[22px] font-semibold leading-none mb-1" style={{ fontFamily: "'DM Mono', monospace", color: C.textPrimary }}>
                {s.value}
              </div>
              <div className="text-[11px] font-medium" style={{ color: C.textSecond }}>{s.label}</div>
              <div className="text-[10px]" style={{ color: C.textDisabled }}>{s.unit}</div>
            </div>
          ))}
        </div>

        {/* Recent */}
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: C.textDisabled }}>Ostatnie treningi</p>
        <div className="space-y-2">
          {WORKOUTS.map((w) => (
            <div key={w.id} className="flex items-center gap-4 rounded-2xl px-4 py-3.5 cursor-pointer transition-colors"
              style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: w.color + "18", border: `1px solid ${w.color}30` }}>
                <Dumbbell size={15} strokeWidth={1.5} style={{ color: w.color }} />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium" style={{ color: C.textPrimary }}>{w.name}</div>
                <div className="text-[11px]" style={{ color: C.textMuted }}>{w.date}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-medium" style={{ fontFamily: "'DM Mono', monospace", color: C.textSecond }}>{w.duration}</div>
                <div className="text-[10px]" style={{ color: C.textDisabled }}>{w.kcal} kcal</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
