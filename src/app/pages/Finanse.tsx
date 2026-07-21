import { Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  borderSubtle: "#383838", textPrimary: "#F0F0F0", textSecond: "#A0A0A0",
  textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", seaGlass: "#70B89F", warning: "#D4AA68", danger: "#CF777C",
};

const TRANSACTIONS = [
  { id: 1, desc: "Żabka",            amount: -18.40,  cat: "Jedzenie",    date: "Dziś"         },
  { id: 2, desc: "Spotify",          amount: -22.99,  cat: "Subskrypcje", date: "Wczoraj"      },
  { id: 3, desc: "Przelew – praca",  amount: 8500.00, cat: "Przychód",    date: "Poniedziałek" },
  { id: 4, desc: "Biedronka",        amount: -143.20, cat: "Jedzenie",    date: "Poniedziałek" },
  { id: 5, desc: "Siłownia",         amount: -99.00,  cat: "Sport",       date: "Niedziela"    },
];

const CATS = [
  { label: "Jedzenie",    spent: 860,  budget: 1200, color: C.warning   },
  { label: "Transport",   spent: 180,  budget: 300,  color: C.iceBlue   },
  { label: "Rozrywka",    spent: 340,  budget: 400,  color: "#A0A0A0"   },
  { label: "Subskrypcje", spent: 89,   budget: 150,  color: C.seaGlass  },
];

export default function Finanse() {
  const income  = TRANSACTIONS.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = TRANSACTIONS.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = income - expense;

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Finanse</h1>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium" style={{ background: C.iceBlue, color: "#242424" }}>
            <Plus size={13} strokeWidth={2} />Dodaj transakcję
          </button>
        </div>

        {/* Balance row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-2xl p-5 col-span-1" style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: C.textDisabled }}>Saldo miesięczne</p>
            <div className="text-[26px] font-semibold tracking-tight" style={{ fontFamily: "'DM Mono', monospace", color: C.seaGlass }}>
              +{balance.toFixed(0)} zł
            </div>
          </div>
          {[
            { label: "Przychody", value: income,   color: C.seaGlass, Icon: ArrowUpRight   },
            { label: "Wydatki",   value: expense,  color: C.danger,   Icon: ArrowDownRight },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.borderSubtle}`, boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon size={13} strokeWidth={1.5} style={{ color }} />
                <p className="text-[10px] uppercase tracking-widest" style={{ color: C.textDisabled }}>{label}</p>
              </div>
              <div className="text-[20px] font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: C.textPrimary }}>
                {value.toFixed(0)} zł
              </div>
            </div>
          ))}
        </div>

        {/* Budget */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: C.textDisabled }}>Budżet kategorii</p>
          <div className="space-y-4">
            {CATS.map((cat) => {
              const pct = Math.min(100, Math.round((cat.spent / cat.budget) * 100));
              return (
                <div key={cat.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium" style={{ color: C.textSecond }}>{cat.label}</span>
                    <span className="text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: pct >= 90 ? C.danger : C.textDisabled }}>
                      {cat.spent} / {cat.budget} zł
                    </span>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? C.danger : cat.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transactions */}
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: C.textDisabled }}>Ostatnie transakcje</p>
        <div className="space-y-1.5">
          {TRANSACTIONS.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer transition-colors"
              style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
            >
              <div className="flex-1">
                <div className="text-[13px]" style={{ color: C.textPrimary }}>{t.desc}</div>
                <div className="text-[10px]" style={{ color: C.textDisabled }}>{t.cat} · {t.date}</div>
              </div>
              <span className="text-[13px] font-medium" style={{ fontFamily: "'DM Mono', monospace", color: t.amount > 0 ? C.seaGlass : C.danger }}>
                {t.amount > 0 ? "+" : ""}{t.amount.toFixed(2)} zł
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
