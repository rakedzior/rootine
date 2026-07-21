import { Plus, FileText } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", seaGlass: "#70B89F", warning: "#D4AA68",
};

const NOTES = [
  { id: 1, title: "Pomysły na projekt",           preview: "Redesign onboardingu — uprościć do 3 kroków. Dodać progress bar na górze strony...", tag: "praca",   tagColor: C.iceBlue,  date: "Dziś"         },
  { id: 2, title: "Przepis — owsianka",            preview: "50g płatki, 30g białko waniliowe, garść jagód, łyżka masła orzechowego...",         tag: "zdrowie", tagColor: C.seaGlass, date: "Wczoraj"      },
  { id: 3, title: "Książki do przeczytania",        preview: "Atomic Habits ✓, Deep Work ✓, The Psychology of Money, Sapiens...",                tag: "hobby",   tagColor: "#A0A0A0",  date: "Wtorek"       },
  { id: 4, title: "Spotkanie z Tomkiem",            preview: "Ustalić termin rezerwacji sali. Sprawdzić dostępność Starej Zajezdni...",          tag: "praca",   tagColor: C.iceBlue,  date: "Poniedziałek" },
  { id: 5, title: "Cele finansowe 2026",            preview: "Oszczędności: 20k zł. Inwestycje: ETF + lokaty. Przejrzeć ubezpieczenie...",       tag: "finanse", tagColor: C.warning,  date: "Niedziela"    },
];

export default function Notatki() {
  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[820px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Notatki</h1>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.iceBlue, color: "#242424" }}>
            <Plus size={13} strokeWidth={2} />Nowa notatka
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {NOTES.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl p-5 cursor-pointer transition-colors"
              style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <span className="text-[13px] font-semibold leading-snug" style={{ color: C.textPrimary }}>{n.title}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 mt-0.5 uppercase tracking-wide"
                  style={{ color: n.tagColor, background: n.tagColor + "18" }}
                >
                  {n.tag}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed mb-4" style={{ color: C.textMuted }}>
                {n.preview.length > 90 ? n.preview.slice(0, 90) + "…" : n.preview}
              </p>
              <div className="flex items-center gap-1.5">
                <FileText size={10} strokeWidth={1.5} style={{ color: C.textDisabled }} />
                <span className="text-[10px]" style={{ color: C.textDisabled }}>{n.date}</span>
              </div>
            </div>
          ))}

          {/* New note ghost card */}
          <div
            className="rounded-2xl p-5 cursor-pointer flex items-center justify-center gap-2 min-h-[120px] transition-colors"
            style={{ background: "transparent", border: `1px dashed ${C.borderSubtle}` }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.inputBg)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <Plus size={14} strokeWidth={1.5} style={{ color: C.textDisabled }} />
            <span className="text-[12px]" style={{ color: C.textDisabled }}>Nowa notatka</span>
          </div>
        </div>
      </div>
    </div>
  );
}
