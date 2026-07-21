import { Salad, Plus, Droplets } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", seaGlass: "#70B89F", warning: "#D4AA68", danger: "#CF777C",
};

const MACROS = [
  { label: "Kalorie",  value: 1840, max: 2400, unit: "kcal", color: C.iceBlue   },
  { label: "Białko",   value: 112,  max: 160,  unit: "g",    color: C.seaGlass  },
  { label: "Węgle",    value: 195,  max: 280,  unit: "g",    color: C.warning   },
  { label: "Tłuszcze", value: 58,   max: 80,   unit: "g",    color: C.danger    },
];

const MEALS = [
  { id: 1, name: "Śniadanie", time: "08:15", items: ["Owsianka z owocami", "Jajka sadzone (2 szt.)"], kcal: 520 },
  { id: 2, name: "Obiad",     time: "13:00", items: ["Kurczak z ryżem", "Sałatka"],                  kcal: 780 },
  { id: 3, name: "Przekąska", time: "16:30", items: ["Jogurt grecki", "Garść orzechów"],             kcal: 280 },
  { id: 4, name: "Kolacja",   time: null,    items: [],                                               kcal: 0   },
];

const WATER = 5, WATER_MAX = 8;

export default function Odzywanie() {
  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Odżywianie</h1>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.iceBlue, color: "#242424" }}>
            <Plus size={13} strokeWidth={2} />Dodaj posiłek
          </button>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {MACROS.map((m) => (
            <div key={m.label} className="rounded-2xl p-3.5" style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-[20px] font-semibold leading-none" style={{ fontFamily: "'DM Mono', monospace", color: m.color }}>{m.value}</span>
                <span className="text-[9px]" style={{ color: C.textDisabled }}>/{m.max}{m.unit}</span>
              </div>
              <div className="text-[10px] mb-2 font-medium" style={{ color: C.textMuted }}>{m.label}</div>
              <div className="h-[3px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((m.value / m.max) * 100))}%`, background: m.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Water */}
        <div className="rounded-2xl p-4 mb-4 flex items-center gap-4" style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Droplets size={15} strokeWidth={1.5} style={{ color: C.iceBlue }} />
            <span className="text-[12px] font-medium" style={{ color: C.textSecond }}>Nawodnienie</span>
          </div>
          <div className="flex gap-1.5 flex-1">
            {Array.from({ length: WATER_MAX }).map((_, i) => (
              <div key={i} className="h-4 flex-1 rounded-md transition-all" style={{ background: i < WATER ? C.iceBlue : C.elevated, opacity: i < WATER ? 0.8 : 1 }} />
            ))}
          </div>
          <span className="text-[12px] flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{WATER}/{WATER_MAX}</span>
        </div>

        {/* Meals */}
        <div className="space-y-2">
          {MEALS.map((meal) => (
            <div key={meal.id} className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.borderSubtle }}>
                <div className="flex items-center gap-2">
                  <Salad size={13} strokeWidth={1.5} style={{ color: C.seaGlass }} />
                  <span className="text-[12px] font-semibold" style={{ color: C.textSecond }}>{meal.name}</span>
                  {meal.time && <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{meal.time}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {meal.kcal > 0 && <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: C.textDisabled }}>{meal.kcal} kcal</span>}
                  <button style={{ color: C.textDisabled }}><Plus size={13} strokeWidth={1.5} /></button>
                </div>
              </div>
              {meal.items.length > 0 ? (
                <div className="px-4 py-2">
                  {meal.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <div className="w-1 h-1 rounded-full" style={{ background: C.borderStrong ?? C.borderSubtle }} />
                      <span className="text-[12px]" style={{ color: C.textMuted }}>{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-[12px]" style={{ color: C.textDisabled }}>Brak produktów — kliknij +</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
