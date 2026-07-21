import { Target, Plus } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", seaGlass: "#70B89F", warning: "#D4AA68", danger: "#CF777C",
};

const GOALS = [
  { id: 1, label: "Przebiec półmaraton",       progress: 62, color: C.seaGlass, due: "Grudzień 2026", note: "Ostatni trening: 8 km" },
  { id: 2, label: "Zaoszczędzić 20 000 zł",    progress: 38, color: C.iceBlue,  due: "Grudzień 2026", note: "7 600 / 20 000 zł" },
  { id: 3, label: "Przeczytać 24 książki",      progress: 50, color: C.warning,  due: "Grudzień 2026", note: "12 z 24 ukończone" },
  { id: 4, label: "Zdobyć certyfikat AWS",      progress: 15, color: C.danger,   due: "Wrzesień 2026", note: "Moduł 2 / 13" },
];

export default function Cele() {
  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: C.textDisabled }}>2026</p>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Cele</h1>
          </div>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-all"
            style={{ background: C.iceBlue, color: "#242424" }}
          >
            <Plus size={13} strokeWidth={2} />Nowy cel
          </button>
        </div>

        <div className="space-y-3">
          {GOALS.map((g) => (
            <div
              key={g.id}
              className="rounded-2xl p-5 transition-colors cursor-pointer"
              style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: g.color + "18", border: `1px solid ${g.color}30` }}>
                    <Target size={15} strokeWidth={1.5} style={{ color: g.color }} />
                  </div>
                  <div>
                    <span className="text-[14px] font-medium" style={{ color: C.textPrimary }}>{g.label}</span>
                    <p className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>{g.note}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-[20px] font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: g.color }}>
                    {g.progress}%
                  </div>
                  <div className="text-[10px]" style={{ color: C.textDisabled }}>{g.due}</div>
                </div>
              </div>
              <div className="h-[4px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${g.progress}%`, background: g.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
