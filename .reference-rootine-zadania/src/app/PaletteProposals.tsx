import { Check, Flame } from "lucide-react";

// ── Fixed anchors — same in every option ──────────────────
const BLUE  = "#4772FA";
const BLUE2 = "#6B8FFB";
const BLUEBG= "rgba(71,114,250,0.11)";
const SEA   = "#70B89F";
const WARN  = "#D4AA68";
const DNGR  = "#CF777C";

// ── Palette options ────────────────────────────────────────
const PALETTES = [
  {
    id: "A",
    name: "Deep Contrast",
    desc: "Bardzo ciemny sidebar (#111), wyraźna separacja warstw. Maksymalny kontrast.",
    sidebar:  "#111111",
    mini:     "#1A1A1A",
    main:     "#242424",
    card:     "#2C2C2C",
    elevated: "#343434",
    input:    "#202020",
    bSubtle:  "#363636",
    bStrong:  "#424242",
    tPrimary: "#F2F2F2",
    tSecond:  "#A8A8A8",
    tMuted:   "#686868",
    tDisabled:"#444444",
  },
  {
    id: "B",
    name: "Cohesive Stack",
    desc: "Sidebar bliżej contentu (#1C1C1C), bardziej jednolite odczucie. Płynne przejścia.",
    sidebar:  "#1C1C1C",
    mini:     "#202020",
    main:     "#242424",
    card:     "#2E2E2E",
    elevated: "#363636",
    input:    "#222222",
    bSubtle:  "#383838",
    bStrong:  "#484848",
    tPrimary: "#F0F0F0",
    tSecond:  "#A0A0A0",
    tMuted:   "#646464",
    tDisabled:"#404040",
  },
  {
    id: "C",
    name: "High Surface",
    desc: "Karty wyraźnie jaśniejsze (#323232), mocny kontrast między bgiem a kartami. Przestrzennie.",
    sidebar:  "#131313",
    mini:     "#1B1B1B",
    main:     "#242424",
    card:     "#323232",
    elevated: "#3C3C3C",
    input:    "#1E1E1E",
    bSubtle:  "#3A3A3A",
    bStrong:  "#505050",
    tPrimary: "#F4F4F4",
    tSecond:  "#ACACAC",
    tMuted:   "#6C6C6C",
    tDisabled:"#484848",
  },
  {
    id: "D",
    name: "Warm Graphite",
    desc: "Subtelny ciepły podton (węgiel drzewny). Neutralna baza z minimalnym ociepleniem.",
    sidebar:  "#141210",
    mini:     "#1D1A18",
    main:     "#252220",
    card:     "#2E2B28",
    elevated: "#363330",
    input:    "#201D1B",
    bSubtle:  "#3C3834",
    bStrong:  "#4A4642",
    tPrimary: "#F2EFEC",
    tSecond:  "#A8A09A",
    tMuted:   "#6A6260",
    tDisabled:"#484040",
  },
] as const;

// ── Mini mockup ────────────────────────────────────────────
function MiniMockup({ p }: { p: typeof PALETTES[number] }) {
  const tasks = [
    { text: "Ogród – Zarezerwowane", time: "18:00", done: false },
    { text: "ZAKO Drinkbar",          time: null,    done: false },
    { text: "Tomasz – zadzwonić",     time: null,    done: true  },
  ];
  const habits = [
    { name: "Medytacja", done: true,  streak: 5  },
    { name: "Woda",      done: false, streak: 2  },
    { name: "Czytanie",  done: false, streak: 12 },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden flex"
      style={{ background: p.main, border: `1px solid ${p.bSubtle}`, height: "236px" }}
    >
      {/* Sidebar */}
      <div
        className="w-[100px] flex-shrink-0 flex flex-col p-2.5 gap-0.5 border-r"
        style={{ background: p.sidebar, borderColor: p.bSubtle }}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-2 mb-1.5">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: BLUE, boxShadow: `0 2px 6px ${BLUE}55` }}
          >
            <span className="text-[8px] font-bold text-white">R</span>
          </div>
          <span className="text-[10px] font-semibold" style={{ color: p.tPrimary }}>Routine</span>
        </div>
        {[
          { label: "Dzisiaj",  active: false },
          { label: "Zadania",  active: true  },
          { label: "Cele",     active: false },
          { label: "Finanse",  active: false },
          { label: "Sport",    active: false },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[9px]"
            style={{
              background: item.active ? BLUEBG : "transparent",
              color: item.active ? BLUE : p.tMuted,
              borderLeft: item.active ? `2px solid ${BLUE}` : "2px solid transparent",
              fontWeight: item.active ? 500 : 400,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
              style={{ background: item.active ? BLUE : p.tDisabled }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color: p.tPrimary }}>Zadania</span>
          <div className="px-2 py-0.5 rounded text-[8px] font-semibold"
            style={{ background: BLUE, color: "#fff" }}>
            + Dodaj
          </div>
        </div>

        {tasks.map((t) => (
          <div
            key={t.text}
            className="flex items-center gap-2 px-2.5 py-[5px] rounded-lg"
            style={{
              background: t.done ? "transparent" : p.card,
              border: `1px solid ${t.done ? "transparent" : p.bSubtle}`,
            }}
          >
            <div
              className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                border: `1.5px solid ${t.done ? SEA : p.bStrong}`,
                background: t.done ? `${SEA}22` : "transparent",
              }}
            >
              {t.done && <Check size={6} strokeWidth={3} style={{ color: SEA }} />}
            </div>
            <span
              className="flex-1 text-[9px] truncate"
              style={{ color: t.done ? p.tDisabled : p.tPrimary, textDecoration: t.done ? "line-through" : "none" }}
            >
              {t.text}
            </span>
            {t.time && (
              <span className="text-[8px] font-mono flex-shrink-0" style={{ color: BLUE }}>{t.time}</span>
            )}
          </div>
        ))}

        <div className="mt-auto pt-1">
          <div className="flex justify-between mb-1">
            <span className="text-[8px]" style={{ color: p.tMuted }}>Postęp dnia</span>
            <span className="text-[8px] font-mono" style={{ color: BLUE }}>33%</span>
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: p.bSubtle }}>
            <div className="h-full rounded-full w-1/3" style={{ background: BLUE }} />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div
        className="w-[90px] flex-shrink-0 p-2.5 flex flex-col gap-2 border-l"
        style={{ background: p.mini, borderColor: p.bSubtle }}
      >
        <span className="text-[7.5px] uppercase tracking-widest font-semibold" style={{ color: p.tMuted }}>
          Nawyki
        </span>
        {habits.map((h) => (
          <div key={h.name} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{
                border: `1.5px solid ${h.done ? SEA : p.bStrong}`,
                background: h.done ? `${SEA}22` : "transparent",
              }}
            >
              {h.done && <Check size={5} strokeWidth={3} style={{ color: SEA }} />}
            </div>
            <span className="text-[8px] truncate flex-1" style={{ color: h.done ? p.tDisabled : p.tSecond }}>
              {h.name}
            </span>
            {h.streak > 0 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <Flame size={7} strokeWidth={1.5} style={{ color: WARN }} />
                <span className="text-[7px] font-mono" style={{ color: p.tDisabled }}>{h.streak}</span>
              </div>
            )}
          </div>
        ))}

        <div className="mt-auto">
          <div className="h-px mb-2" style={{ background: p.bSubtle }} />
          <span className="text-[7.5px] uppercase tracking-widest font-semibold block mb-2" style={{ color: p.tMuted }}>
            Ten tydzień
          </span>
          <div className="grid grid-cols-7 gap-0.5">
            {["P","W","Ś","C","P","S","N"].map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-[6px]" style={{ color: p.tDisabled }}>{d}</span>
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: "10px",
                    background: i < 4 ? (i === 3 ? `${BLUE}CC` : `${BLUE}66`) : p.bSubtle,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Swatch strip ───────────────────────────────────────────
function SwatchRow({ p }: { p: typeof PALETTES[number] }) {
  const swatches = [
    { color: p.sidebar,  label: "Sidebar"  },
    { color: p.mini,     label: "Mini"     },
    { color: p.main,     label: "Main bg"  },
    { color: p.card,     label: "Card"     },
    { color: p.elevated, label: "Elevated" },
    { color: p.bSubtle,  label: "Border"   },
    { color: BLUE,       label: "Blue"     },
    { color: p.tPrimary, label: "Text"     },
    { color: p.tSecond,  label: "Text 2"   },
    { color: p.tMuted,   label: "Muted"    },
  ];
  return (
    <div className="flex gap-2 mt-3">
      {swatches.map((s) => (
        <div key={s.label} className="flex-1 flex flex-col gap-1.5">
          <div className="h-5 rounded-md" style={{ background: s.color, border: "1px solid rgba(255,255,255,0.05)" }} />
          <div>
            <div className="text-[8.5px]" style={{ color: "#505A64" }}>{s.label}</div>
            <div className="text-[7.5px] font-mono" style={{ color: "#343E48" }}>{s.color}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────
export default function PaletteProposals() {
  return (
    <div
      className="min-h-screen px-10 py-10 overflow-y-auto"
      style={{ background: "#141414", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <div className="max-w-[1060px] mx-auto">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#3A4248" }}>
            Routine OS · Propozycje palety
          </p>
          <h1 className="text-[22px] font-semibold mb-2.5" style={{ color: "#F0F0F0" }}>
            Pure Graphite · 4 warianty
          </h1>
          <p className="text-[13px] leading-relaxed max-w-[520px]" style={{ color: "#666666" }}>
            Wszystkie warianty mają stałe{" "}
            <span style={{ color: "#D0D0D0", fontFamily: "'DM Mono', monospace" }}>#242424</span>{" "}
            jako tło contentu i{" "}
            <span style={{ color: BLUE, fontFamily: "'DM Mono', monospace" }}>#4772FA</span>{" "}
            jako jedyny akcent. Różni się głębokość sidebara i kontrast kart.
          </p>
        </div>

        {/* Shared accents */}
        <div
          className="rounded-2xl px-5 py-4 mb-10 flex flex-wrap gap-5"
          style={{ background: "#1C1C1C", border: "1px solid #2A2A2A" }}
        >
          <span className="text-[10px] uppercase tracking-widest font-semibold self-center whitespace-nowrap" style={{ color: "#3A4248" }}>
            Stałe akcenty →
          </span>
          {[
            { color: BLUE,  label: "Accent Blue",  sub: "#4772FA · primary"  },
            { color: BLUE2, label: "Blue Hover",   sub: "#6B8FFB · hover"    },
            { color: SEA,   label: "Sea Glass",    sub: "#70B89F · done"     },
            { color: WARN,  label: "Warning",      sub: "#D4AA68 · streak"   },
            { color: DNGR,  label: "Danger",       sub: "#CF777C · priority" },
          ].map((a) => (
            <div key={a.color} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex-shrink-0" style={{ background: a.color }} />
              <div>
                <div className="text-[11px] font-medium" style={{ color: "#C0C0C0" }}>{a.label}</div>
                <div className="text-[9px] font-mono" style={{ color: "#484848" }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Palette options */}
        <div className="space-y-14">
          {PALETTES.map((p) => (
            <div key={p.id}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: "#1C1C1C", color: BLUE, border: "1px solid #2A2A2A" }}
                >
                  {p.id}
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "#F0F0F0" }}>{p.name}</h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "#686868" }}>{p.desc}</p>
                </div>
              </div>
              <MiniMockup p={p} />
              <SwatchRow p={p} />
              {p.id !== "D" && <div className="mt-14 border-t" style={{ borderColor: "#1E1E1E" }} />}
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t" style={{ borderColor: "#1E1E1E" }}>
          <p className="text-[12px]" style={{ color: "#3A4248" }}>
            Wybierz literę (A / B / C / D) — zaktualizuję theme.css i wszystkie strony jednocześnie.
          </p>
        </div>
      </div>
    </div>
  );
}
