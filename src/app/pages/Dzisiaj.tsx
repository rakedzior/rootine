import { useState } from "react";
import { Check, Flame, ChevronRight, Plus } from "lucide-react";

const C = {
  bg:           "#242424",
  elevated:     "#363636",
  card:         "#2E2E2E",
  cardHover:    "#363636",
  borderSubtle: "#383838",
  borderStrong: "#484848",
  textPrimary:  "#F0F0F0",
  textSecond:   "#A0A0A0",
  textMuted:    "#646464",
  textDisabled: "#404040",
  iceBlue:      "#4772FA",
  iceBlueBg:    "rgba(71,114,250,0.11)",
  seaGlass:     "#70B89F",
  seaGlassBg:   "rgba(112,184,159,0.12)",
  warning:      "#D4AA68",
} as const;

const TASKS = [
  { id: 1, text: "Ogród – Piłsudskiego",     time: "18:00", tag: "hobby",   tagColor: "#8EA5C8", done: false },
  { id: 2, text: "ZAKO Drinkbar",             time: null,    tag: "hobby",   tagColor: "#8EA5C8", done: false },
  { id: 3, text: "Klub RE – rezerwacja",      time: null,    tag: "dom",     tagColor: "#D4AA68", done: false },
  { id: 4, text: "Tomasz Karcz – zadzwonić", time: null,    tag: "praca",   tagColor: "#4772FA", done: true  },
];

const HABITS = [
  { id: 1, name: "Medytacja rano",  streak: 5,  done: true  },
  { id: 2, name: "8 szklanek wody", streak: 2,  done: false },
  { id: 3, name: "30 min czytania", streak: 12, done: false },
  { id: 4, name: "Spacer 20 min",   streak: 0,  done: false },
];

function greeting() {
  const h = new Date().getHours();
  return h < 18 ? "Dzień dobry" : "Dobry wieczór";
}
function todayFull() {
  const d = new Date();
  const s = d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Dzisiaj() {
  const [tasks,  setTasks]  = useState(TASKS);
  const [habits, setHabits] = useState(HABITS);

  const toggleTask  = (id: number) => setTasks((p)  => p.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const toggleHabit = (id: number) => setHabits((p) => p.map((h) => h.id === id ? { ...h, done: !h.done } : h));

  const doneT = tasks.filter((t) => t.done).length;
  const doneH = habits.filter((h) => h.done).length;
  const totalProgress = Math.round(((doneT + doneH) / (tasks.length + habits.length)) * 100);

  const STATS = [
    { label: "Zadania dziś",  value: `${doneT}/${tasks.length}`,   sub: `${tasks.length - doneT} pozostałe`,  ice: false },
    { label: "Nawyki",        value: `${doneH}/${habits.length}`,  sub: `${habits.length - doneH} pozostałe`, ice: false },
    { label: "Seria dni",     value: "5",                          sub: "dni z rzędu",                        ice: false },
    { label: "Ten tydzień",   value: "68%",                        sub: "ukończone",                          ice: false },
  ];

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[860px] mx-auto px-8 py-8">

        {/* Greeting */}
        <div className="mb-8">
          <p className="text-[11px] mb-1.5 uppercase tracking-widest font-medium" style={{ color: C.textDisabled }}>{todayFull()}</p>
          <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>
            {greeting()}, Mateusz.
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {STATS.map((s, i) => (
            <div
              key={i}
              className="rounded-2xl p-4"
              style={{
                background: C.card,
                border: `1px solid ${C.borderSubtle}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div
                className="text-[24px] font-semibold leading-none mb-2"
                style={{ fontFamily: "'DM Mono', monospace", color: s.ice ? C.iceBlue : C.textPrimary }}
              >
                {s.value}
              </div>
              <div className="text-[11px] font-medium mb-0.5" style={{ color: C.textSecond }}>{s.label}</div>
              <div className="text-[10px]" style={{ color: C.textDisabled }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Tasks */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.borderSubtle }}>
              <span className="text-[12px] font-semibold" style={{ color: C.textSecond }}>Zadania na dziś</span>
              <button className="flex items-center gap-1 text-[11px] transition-colors" style={{ color: C.textDisabled }}>
                Wszystkie <ChevronRight size={11} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-2">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => toggleTask(t.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <div
                    className="w-[15px] h-[15px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      border: `1.5px solid ${t.done ? C.seaGlass : C.borderStrong}`,
                      background: t.done ? C.seaGlassBg : "transparent",
                    }}
                  >
                    {t.done && <Check size={8} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
                  </div>
                  <span className="flex-1 text-[13px]" style={{ color: t.done ? C.textDisabled : C.textPrimary, textDecoration: t.done ? "line-through" : "none" }}>
                    {t.text}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {t.time && (
                      <span className="text-[10px]" style={{ fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{t.time}</span>
                    )}
                    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ color: C.textSecond, background: C.elevated }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.tagColor }} />{t.tag}
                    </span>
                  </div>
                </div>
              ))}
              <button
                className="flex items-center gap-2 px-3 py-2 mt-1 rounded-xl w-full text-[12px] transition-colors"
                style={{ color: C.textDisabled }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <Plus size={12} strokeWidth={1.75} />Dodaj zadanie
              </button>
            </div>
          </div>

          {/* Habits */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.borderSubtle }}>
              <span className="text-[12px] font-semibold" style={{ color: C.textSecond }}>Nawyki na dziś</span>
              <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: C.textDisabled }}>
                {doneH}/{habits.length}
              </span>
            </div>
            <div className="p-2">
              {habits.map((h) => (
                <div
                  key={h.id}
                  onClick={() => toggleHabit(h.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <div
                    className="w-[15px] h-[15px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      border: `1.5px solid ${h.done ? C.seaGlass : C.borderStrong}`,
                      background: h.done ? C.seaGlassBg : "transparent",
                    }}
                  >
                    {h.done && <Check size={8} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
                  </div>
                  <span className="flex-1 text-[13px]" style={{ color: h.done ? C.textDisabled : C.textPrimary, textDecoration: h.done ? "line-through" : "none" }}>
                    {h.name}
                  </span>
                  {h.streak > 0 && (
                    <div className="flex items-center gap-1">
                      <Flame size={10} strokeWidth={1.5} style={{ color: C.textMuted }} />
                      <span className="text-[10px]" style={{ fontFamily: "'DM Mono', monospace", color: C.textDisabled }}>{h.streak}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium" style={{ color: C.textSecond }}>Postęp dnia</span>
            <span className="text-[12px]" style={{ fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>
              {totalProgress}%
            </span>
          </div>
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${totalProgress}%`, background: C.iceBlue }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
