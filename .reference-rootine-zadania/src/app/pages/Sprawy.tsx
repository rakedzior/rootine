import { useState } from "react";
import { Inbox, Plus, Check, ChevronDown } from "lucide-react";

const C = {
  bg: "#242424", card: "#2E2E2E", cardHover: "#363636", inputBg: "#222222",
  elevated: "#363636", borderSubtle: "#383838", borderStrong: "#484848",
  textPrimary: "#F0F0F0", textSecond: "#A0A0A0", textMuted: "#646464", textDisabled: "#404040",
  iceBlue: "#4772FA", iceBlueBg: "rgba(71,114,250,0.11)", seaGlass: "#70B89F",
  seaGlassBg: "rgba(112,184,159,0.12)", danger: "#CF777C",
};

type Sprawa = { id: number; text: string; done: boolean; priority: "high" | "normal" };

const INIT: Sprawa[] = [
  { id: 1, text: "Umówić wizytę u dentysty",         done: false, priority: "high"   },
  { id: 2, text: "Przedłużyć OC samochodu",          done: false, priority: "high"   },
  { id: 3, text: "Zwrócić książkę do biblioteki",    done: false, priority: "normal" },
  { id: 4, text: "Kupić prezent urodzinowy dla mamy",done: false, priority: "normal" },
  { id: 5, text: "Sprawdzić oferty ubezpieczeń",     done: false, priority: "normal" },
  { id: 6, text: "Opłacić czynsz",                   done: true,  priority: "normal" },
  { id: 7, text: "Zamówić nowe okulary",              done: true,  priority: "normal" },
];

export default function Sprawy() {
  const [items,    setItems]    = useState<Sprawa[]>(INIT);
  const [showDone, setShowDone] = useState(true);
  const [newItem,  setNewItem]  = useState("");
  const [focused,  setFocused]  = useState(false);

  const pending   = items.filter((i) => !i.done);
  const completed = items.filter((i) => i.done);

  const toggle = (id: number) => setItems((p) => p.map((i) => i.id === id ? { ...i, done: !i.done } : i));
  const add = () => {
    const text = newItem.trim();
    if (!text) return;
    setItems((p) => [...p, { id: Date.now(), text, done: false, priority: "normal" }]);
    setNewItem("");
  };

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: C.bg }}>
      <div className="max-w-[640px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.textPrimary }}>Sprawy</h1>
            <p className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>Wszystko co trzeba załatwić</p>
          </div>
          <span className="text-[12px]" style={{ fontFamily: "'DM Mono', monospace", color: C.textDisabled }}>
            {completed.length}/{items.length}
          </span>
        </div>

        {/* Add input */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 transition-all"
          style={{
            background: C.inputBg,
            border: `1px solid ${focused ? "rgba(71,114,250,0.5)" : C.borderSubtle}`,
            boxShadow: focused ? "0 0 0 3px rgba(71,114,250,0.11)" : "none",
          }}
        >
          <Plus size={13} strokeWidth={1.75} style={{ color: focused ? C.iceBlue : C.textDisabled }} />
          <input
            type="text"
            placeholder="Nowa sprawa…"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: C.textPrimary, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          />
        </div>

        {/* Pending */}
        <div className="space-y-1.5">
          {pending.map((item) => (
            <div
              key={item.id}
              onClick={() => toggle(item.id)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
              style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = C.card)}
            >
              {item.priority === "high" && (
                <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.danger }} />
              )}
              <div className="w-[16px] h-[16px] rounded-full border flex-shrink-0" style={{ borderColor: C.borderStrong }} />
              <span className="text-[13px]" style={{ color: C.textPrimary }}>{item.text}</span>
              {item.priority === "high" && (
                <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded font-medium" style={{ color: C.danger, background: C.danger + "18" }}>
                  ważne
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Completed */}
        {completed.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] mb-2 transition-colors"
              style={{ color: C.textDisabled }}
            >
              <ChevronDown size={13} strokeWidth={1.5} style={{ transform: showDone ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }} />
              Ukończone {completed.length}
            </button>
            {showDone && (
              <div className="space-y-1.5" style={{ opacity: 0.5 }}>
                {completed.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
                    style={{ background: C.card, border: `1px solid ${C.borderSubtle}` }}
                  >
                    <div className="w-[16px] h-[16px] rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${C.seaGlass}`, background: C.seaGlassBg }}>
                      <Check size={8} strokeWidth={2.5} style={{ color: C.seaGlass }} />
                    </div>
                    <span className="text-[13px] line-through" style={{ color: C.textDisabled }}>{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pending.length === 0 && completed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: C.textDisabled }}>
            <Inbox size={28} strokeWidth={1.25} />
            <span className="text-[13px]">Brak spraw — dodaj pierwszą powyżej</span>
          </div>
        )}
      </div>
    </div>
  );
}
