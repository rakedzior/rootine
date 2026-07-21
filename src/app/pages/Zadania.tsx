import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  Plus, Check, Inbox, Flame, Trash2, RotateCcw,
  ChevronDown, ChevronLeft, ChevronRight,
  Tag, TrendingUp, Calendar, CalendarDays, LayoutGrid,
  Clock, AlignLeft, Star, X, Circle,
  Sun, Sunrise, Moon, Bell,
  Flag, MessageSquare, Smile, Image as ImageIcon,
  MoreHorizontal, Search, Paperclip, Pin, Copy,
  Link, Printer, Bookmark, Activity, ListPlus, XCircle,
  FileText, PenLine, BarChart2, Hash, List,
} from "lucide-react";
import { CALENDAR_TASKS } from "../data/calendarTasks";
import { hydrateTaskCompletion, persistTaskCompletion } from "../data/taskCompletion";

const C = {
  bg:           "#242424",
  subSidebar:   "#1E1E1E",
  elevated:     "#363636",
  card:         "#2E2E2E",
  cardHover:    "#343434",
  inputBg:      "#222222",
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
  danger:       "#CF777C",
  dangerBg:     "rgba(207,119,124,0.11)",
} as const;

type Priority = "high" | "medium" | "low";
export type Subtask = { id: number; text: string; done: boolean };
export type Task = {
  id: number; text: string; done: boolean;
  time?: string; endTime?: string; tags?: string[]; list?: string;
  view: string; priority?: Priority; notes?: string; deleted?: boolean; calendarDate?: string;
  date?: string; subtasks?: Subtask[];
};
type Habit = { id: number; name: string; streak: number; done: boolean };
export type ListItem = { id: string; label: string; color: string };
export type TagItem  = { id: string; label: string; color: string };

const PRIORITY_COLOR: Record<Priority, string> = {
  high: C.danger, medium: C.warning, low: C.iceBlue,
};

const SMART_VIEWS = [
  { id: "wszystkie",   label: "Wszystkie",      icon: Circle     },
  { id: "skrzynka",   label: "Skrzynka",       icon: Inbox      },
  { id: "dzis",       label: "Dziś",            icon: LayoutGrid },
  { id: "jutro",      label: "Jutro",           icon: Calendar   },
  { id: "7dni",       label: "Następne 7 dni",  icon: TrendingUp },
  { id: "podsumowanie", label: "Podsumowanie",  icon: BarChart2  },
];

const VIEW_LABELS: Record<string, string> = {
  wszystkie:    "Wszystkie zadania",
  skrzynka:     "Skrzynka zadań",
  dzis:         "Dziś",
  jutro:        "Jutro",
  "7dni":       "Następne 7 dni",
  podsumowanie: "Podsumowanie",
  ukonczone:    "Ukończone",
  kosz:         "Kosz",
};

const PALETTE = [
  "#4772FA","#70B89F","#D4AA68","#CF777C",
  "#A8BCD4","#A0A0A0","#9B8CE8","#E8A07A",
];
const VISIBLE_TAG_LIMIT = 6;


const INIT_TASKS: Task[] = [
  { id: 1,  text: "Ogród – Piłsudskiego – Zarezerwowane", done: false, time: "18:00", tags: ["hobby"],   list: "hobby",  view: "dzis",     priority: "medium" },
  { id: 2,  text: "ZAKO Drinkbar – zarezerwowane",        done: false,               tags: ["hobby"],   list: "hobby",  view: "dzis",     priority: "low"    },
  { id: 3,  text: "Klub RE – rezerwacja sala paląca",     done: false,               tags: ["dom"],     list: "dom",    view: "dzis"                         },
  { id: 4,  text: "Przejrzeć raporty finansowe Q2",       done: false, time: "14:00", tags: ["praca"],   list: "praca",  view: "jutro",    priority: "high"   },
  { id: 5,  text: "Kupić bilety na koncert",              done: false,               tags: ["hobby"],   list: "hobby",  view: "7dni"                         },
  { id: 6,  text: "Przegląd samochodu",                  done: false, time: "10:00", tags: ["dom"],     list: "dom",    view: "7dni",     priority: "medium" },
  { id: 7,  text: "Wysłać ofertę do klienta",             done: false, time: "09:00", tags: ["praca"],   list: "praca",  view: "skrzynka", priority: "high"   },
  { id: 8,  text: "Zamówić suplementy",                  done: false,               tags: ["zdrowie"], list: "zdrowie",view: "skrzynka"                      },
  { id: 9,  text: "Tomasz Karcz – zadzwonić",             done: true,                tags: ["praca"],   list: "praca",  view: "dzis"                         },
  { id: 10, text: "Black Gallery Pub – nie odbierają",    done: true,                tags: ["hobby"],   list: "hobby",  view: "dzis"                         },
  { id: 11, text: "Stara Zajezdnia – rezerwacja",         done: true,                tags: ["dom"],     list: "dom",    view: "skrzynka"                      },
];

const INIT_CALENDAR_TASKS: Task[] = CALENDAR_TASKS.map(({ dateLabel, ...task }) => ({
  ...task,
  date: dateLabel,
  view: "kalendarz",
}));
const INITIAL_TASKS: Task[] = [...INIT_TASKS, ...INIT_CALENDAR_TASKS];

const INIT_HABITS: Habit[] = [
  { id: 1, name: "Medytacja rano",  streak: 5,  done: true  },
  { id: 2, name: "8 szklanek wody", streak: 2,  done: false },
  { id: 3, name: "30 min czytania", streak: 12, done: false },
  { id: 4, name: "Spacer 20 min",   streak: 0,  done: false },
];

const PL_MONTHS = [
  "styczeń","luty","marzec","kwiecień","maj","czerwiec",
  "lipiec","sierpień","wrzesień","październik","listopad","grudzień",
];
const PL_MONTHS_SHORT = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];

function getWeekRangeLabel(): string {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7));
  const sun = new Date(mon);  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
  return `${fmt(mon)} - ${fmt(sun)}`;
}

function fmtTaskDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
}

type DateVal = {
  date: Date | null;
  time: string;
  reminder: string;
  repeat: string;
  startTime: string;
  endTime: string;
  duration: boolean;
  allDay: boolean;
};

const DEFAULT_DATE_VAL: DateVal = {
  date: null, time: "", reminder: "", repeat: "",
  startTime: "09:00", endTime: "10:00", duration: false, allDay: false,
};

function buildCalendarGrid(viewYear: number, viewMonth: number) {
  const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
  const offset     = (firstDow + 6) % 7;
  const inMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays   = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { d: number; m: number; y: number; cur: boolean }[] = [];

  for (let i = offset - 1; i >= 0; i--) {
    const m = viewMonth === 0  ? 11 : viewMonth - 1;
    const y = viewMonth === 0  ? viewYear - 1 : viewYear;
    cells.push({ d: prevDays - i, m, y, cur: false });
  }
  for (let d = 1; d <= inMonth; d++) cells.push({ d, m: viewMonth, y: viewYear, cur: true });
  let nd = 1;
  while (cells.length < 42) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ d: nd++, m, y, cur: false });
  }
  return cells;
}

function formatDateLabel(val: DateVal): string {
  if (!val.date) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmrw  = new Date(today.getTime() + 86400000);
  const d     = new Date(val.date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Dziś";
  if (d.getTime() === tmrw.getTime())  return "Jutro";
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

function todayStr() {
  const d = new Date();
  const w = d.toLocaleDateString("pl-PL", { weekday: "long" });
  const r = d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  return (w[0].toUpperCase() + w.slice(1)) + ", " + r;
}

function getMiniWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { n: d.getDate(), today: d.toDateString() === today.toDateString() };
  });
}

// ── Shared dropdown options ───────────────────────────────
const REMINDER_OPTIONS = [
  { value: "",     label: "Brak"           },
  { value: "0",    label: "W momencie"     },
  { value: "5",    label: "5 minut przed"  },
  { value: "10",   label: "10 minut przed" },
  { value: "30",   label: "30 minut przed" },
  { value: "60",   label: "1 godzina przed"},
  { value: "1440", label: "1 dzień przed"  },
];

const REPEAT_OPTIONS = [
  { value: "",        label: "Nie powtarzaj" },
  { value: "daily",   label: "Codziennie"    },
  { value: "weekly",  label: "Co tydzień"    },
  { value: "monthly", label: "Co miesiąc"    },
  { value: "yearly",  label: "Co rok"        },
];

// ── Custom select (themed) ────────────────────────────────
function CustomSelect({ value, onChange, options, placeholder = "Wybierz…" }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [rect, setRect]   = useState<DOMRect | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          btnRef.current  && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const current = options.find(o => o.value === value);

  const handleToggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(v => !v);
  };

  return (
    <>
      <button ref={btnRef} onClick={handleToggle} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 11px", borderRadius: 8, cursor: "pointer",
        background: "#191919", border: `1px solid ${open ? "rgba(71,114,250,0.4)" : C.borderSubtle}`,
        boxShadow: open ? "0 0 0 2px rgba(71,114,250,0.08)" : "none",
        transition: "border-color .15s, box-shadow .15s",
      }}>
        <span style={{ fontSize: 12, color: value ? C.textPrimary : C.textDisabled }}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={11} strokeWidth={1.5}
          style={{ color: C.textDisabled, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
      </button>

      {open && rect && (
        <div ref={listRef} style={{
          position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width,
          background: "#1E1E1E", border: "1px solid #333",
          borderRadius: 10, overflow: "hidden", zIndex: 10000,
          boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "none", border: "none", cursor: "pointer" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
              >
                <span style={{ fontSize: 12, color: active ? C.iceBlue : C.textSecond }}>{opt.label}</span>
                {active && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Time Picker ───────────────────────────────────────────
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState(value);
  const listRef  = useRef<HTMLDivElement>(null);
  const selRef   = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, []);

  const commit = (v: string) => { onChange(v); setInput(v); };

  return (
    <div style={{
      borderRadius: "10px", overflow: "hidden",
      border: `1px solid ${C.borderStrong}`,
      background: "#191919",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 10px",
        borderBottom: `1px solid ${C.borderSubtle}`,
      }}>
        <Clock size={13} strokeWidth={1.5} style={{ color: C.iceBlue, flexShrink: 0 }} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={() => { if (TIME_SLOTS.includes(input)) commit(input); else setInput(value); }}
          onKeyDown={e => { if (e.key === "Enter" && TIME_SLOTS.includes(input)) commit(input); }}
          placeholder="--:--"
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: C.iceBlue, fontSize: "13px",
            fontFamily: "'DM Mono', monospace",
          }}
        />
        {value && (
          <button onClick={() => commit("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textDisabled, display: "flex", padding: 0 }}>
            <X size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Slot list */}
      <div ref={listRef} style={{
        maxHeight: "168px", overflowY: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: `${C.borderStrong} transparent`,
      }}>
        {TIME_SLOTS.map(slot => {
          const active = slot === value;
          return (
            <button
              key={slot}
              ref={active ? selRef : null}
              onClick={() => commit(slot)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "7px 12px",
                background: active ? "rgba(71,114,250,0.07)" : "none",
                border: "none", cursor: "pointer",
                color: active ? C.iceBlue : C.textSecond,
                fontSize: "13px", fontFamily: "'DM Mono', monospace",
                textAlign: "left",
              }}
            >
              {slot}
              {active && <Check size={12} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
            </button>
          );
        })}
      </div>

      {/* Timezone */}
      <div style={{
        borderTop: `1px solid ${C.borderSubtle}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 12px", cursor: "pointer",
      }}>
        <span style={{ fontSize: "11px", color: C.textMuted }}>Warszawa, GMT+2</span>
        <ChevronDown size={11} strokeWidth={1.5} style={{ color: C.textDisabled }} />
      </div>
    </div>
  );
}

// ── Date Picker Popup ─────────────────────────────────────
function DatePickerPopup({
  value, onConfirm, onClose, anchorEl, placementAnchorEl,
}: {
  value: DateVal;
  onConfirm: (v: DateVal) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
  placementAnchorEl?: HTMLElement | null;
}) {
  const [tab,     setTab]     = useState<"data" | "duracja">("data");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [selDate,    setSelDate]    = useState<Date | null>(() => {
    if (value.date) return value.date;
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  });
  const [viewYear,   setViewYear]   = useState((value.date ?? today).getFullYear());
  const [viewMonth,  setViewMonth]  = useState((value.date ?? today).getMonth());
  const [time,       setTime]       = useState(value.time || (value.duration ? value.startTime : ""));
  const [reminder,   setReminder]   = useState(value.reminder);
  const [repeat,     setRepeat]     = useState(value.repeat);
  const [startTime,  setStartTime]  = useState(value.startTime || "09:00");
  const [endTime,    setEndTime]    = useState(value.endTime   || "10:00");
  const [showTime,       setShowTime]       = useState(false);
  const [showRem,        setShowRem]        = useState(false);
  const [showRep,        setShowRep]        = useState(false);
  const [openTimeField,  setOpenTimeField]  = useState<"start" | "koniec" | null>(null);
  const [allDay,         setAllDay]         = useState(value.allDay);
  const [startDate,      setStartDate]      = useState<Date>(() => new Date(value.date ?? today));
  const [endDate,        setEndDate]        = useState<Date>(() => new Date(value.date ?? today));
  const [showDurRem,     setShowDurRem]     = useState(false);
  const [showDurRep,     setShowDurRep]     = useState(false);

  const popRef = useRef<HTMLDivElement>(null);
  const popWidth = 292;
  const [popupPosition, setPopupPosition] = useState({ top: 8, left: 8 });

  useLayoutEffect(() => {
    const target = placementAnchorEl ?? anchorEl;
    const rect = target.getBoundingClientRect();
    const popupHeight = popRef.current?.getBoundingClientRect().height ?? (placementAnchorEl ? 650 : 420);
    let left = placementAnchorEl ? rect.right + 8 : rect.right - popWidth;
    let top = placementAnchorEl ? rect.top : rect.bottom + 6;

    if (placementAnchorEl && left + popWidth > window.innerWidth - 8) {
      left = rect.left - popWidth - 8;
    }
    if (top + popupHeight > window.innerHeight - 8) {
      top = placementAnchorEl ? rect.bottom - popupHeight : window.innerHeight - popupHeight - 8;
    }

    setPopupPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - popWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - popupHeight - 8)),
    });
  }, [anchorEl, placementAnchorEl, tab, showTime, showRem, showRep, showDurRem, showDurRep, allDay]);

  useEffect(() => {
    const reposition = () => {
      const target = placementAnchorEl ?? anchorEl;
      const rect = target.getBoundingClientRect();
      const popupHeight = popRef.current?.getBoundingClientRect().height ?? 650;
      let left = placementAnchorEl ? rect.right + 8 : rect.right - popWidth;
      let top = placementAnchorEl ? rect.top : rect.bottom + 6;
      if (placementAnchorEl && left + popWidth > window.innerWidth - 8) left = rect.left - popWidth - 8;
      if (top + popupHeight > window.innerHeight - 8) top = placementAnchorEl ? rect.bottom - popupHeight : window.innerHeight - popupHeight - 8;
      setPopupPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - popWidth - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - popupHeight - 8)),
      });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [anchorEl, placementAnchorEl]);

  const confirmAndClose = () => {
    onConfirm({
      date: selDate,
      time: allDay ? "" : tab === "data" ? time : "",
      reminder,
      repeat,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      duration: tab === "duracja" && !allDay,
      allDay,
    });
    onClose();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const insideAnchor = anchorEl.contains(e.target as Node) || Boolean(placementAnchorEl?.contains(e.target as Node));
      if (popRef.current && !popRef.current.contains(e.target as Node) && !insideAnchor) {
        confirmAndClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorEl, confirmAndClose]);

  const cells = buildCalendarGrid(viewYear, viewMonth);

  const isSame = (d: Date | null, y: number, m: number, n: number) =>
    d ? d.getFullYear() === y && d.getMonth() === m && d.getDate() === n : false;
  const isToday = (y: number, m: number, n: number) =>
    today.getFullYear() === y && today.getMonth() === m && today.getDate() === n;

  const selectDate = (y: number, m: number, d: number) => {
    setSelDate(new Date(y, m, d));
    if (m !== viewMonth) { setViewYear(y); setViewMonth(m); }
  };

  const prevMonth = () => viewMonth === 0  ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0),  setViewYear(y => y + 1)) : setViewMonth(m => m + 1);
  const goToday   = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const tmrw = new Date(today.getTime() + 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  const nextMonth_ = new Date(today); nextMonth_.setMonth(nextMonth_.getMonth() + 1);

  const quickDates = [
    { label: "Dziś",   icon: Sun,         date: today       },
    { label: "Jutro",  icon: Sunrise,     date: tmrw        },
    { label: "Tydzień",icon: CalendarDays,date: nextWeek    },
    { label: "Miesiąc",icon: Moon,        date: nextMonth_  },
  ];

  const handleOk = confirmAndClose;

  const handleClear = () => {
    setSelDate(null); setTime(""); setReminder(""); setRepeat("");
    setStartTime("09:00"); setEndTime("10:00"); setAllDay(false);
  };

  const rowBtn = {
    width: "100%", display: "flex" as const, alignItems: "center" as const,
    gap: "10px", padding: "9px 2px", background: "none", border: "none",
    cursor: "pointer", color: C.textMuted,
  };

  return (
    <div
      ref={popRef}
      style={{
        position: "fixed", top: popupPosition.top, left: popupPosition.left, width: `${popWidth}px`, zIndex: 9999,
        background: "#2A2A2A",
        border: `1px solid ${C.borderStrong}`,
        borderRadius: "14px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        overflow: "hidden",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Top tabs ── */}
      <div style={{
        display: "flex", padding: "10px 10px 0",
        borderBottom: `1px solid ${C.borderSubtle}`,
      }}>
        {([["data","Data"],["duracja","Czas trwania"]] as [string,string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as "data" | "duracja")}
            style={{
              flex: 1, padding: "7px 8px", borderRadius: "8px 8px 0 0",
              background: tab === id ? C.bg : "transparent",
              color: tab === id ? C.textPrimary : C.textMuted,
              border: "none", cursor: "pointer",
              fontSize: "12px", fontWeight: tab === id ? 500 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "data" ? (
        <div style={{ padding: "12px" }}>
          {/* ── Quick shortcuts ── */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {quickDates.map(({ label, icon: Icon, date: qd }) => {
              const active = isSame(selDate, qd.getFullYear(), qd.getMonth(), qd.getDate());
              return (
                <button
                  key={label}
                  onClick={() => { setSelDate(new Date(qd)); setViewYear(qd.getFullYear()); setViewMonth(qd.getMonth()); }}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: "5px", padding: "9px 4px", borderRadius: "10px",
                    background: active ? C.iceBlueBg : C.elevated,
                    color: active ? C.iceBlue : C.textMuted,
                    border: `1px solid ${active ? "rgba(71,114,250,0.3)" : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span style={{ fontSize: "9px", lineHeight: 1, whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Month navigation ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 500, color: C.textPrimary }}>
              {PL_MONTHS[viewMonth]} {viewYear}
            </span>
            <div style={{ display: "flex", gap: "2px" }}>
              {[
                { icon: ChevronLeft,  action: prevMonth },
                { icon: Circle,       action: goToday   },
                { icon: ChevronRight, action: nextMonth },
              ].map(({ icon: Icon, action }, i) => (
                <button key={i} onClick={action} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: C.textMuted, padding: "4px 5px", borderRadius: "6px",
                  display: "flex", alignItems: "center",
                }}>
                  <Icon size={i === 1 ? 7 : 13} strokeWidth={i === 1 ? 2.5 : 1.75} />
                </button>
              ))}
            </div>
          </div>

          {/* ── Day headers ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: "2px" }}>
            {["P","W","Ś","C","P","S","N"].map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: "10px", color: C.textDisabled, padding: "3px 0", fontWeight: 600 }}>
                {d}
              </div>
            ))}
          </div>

          {/* ── Calendar grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "1px" }}>
            {cells.map((cell, i) => {
              const sel = isSame(selDate, cell.y, cell.m, cell.d);
              const tod = isToday(cell.y, cell.m, cell.d);
              return (
                <button
                  key={i}
                  onClick={() => selectDate(cell.y, cell.m, cell.d)}
                  style={{
                    aspectRatio: "1", display: "flex", alignItems: "center",
                    justifyContent: "center", borderRadius: "50%",
                    fontSize: "11px",
                    fontFamily: "'DM Mono', monospace",
                    background: sel ? C.iceBlue : "transparent",
                    color: sel ? "#fff" : tod ? C.iceBlue : cell.cur ? C.textPrimary : C.textDisabled,
                    fontWeight: tod && !sel ? 700 : 400,
                    border: `1.5px solid ${tod && !sel ? "rgba(71,114,250,0.45)" : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  {cell.d}
                </button>
              );
            })}
          </div>

          {/* ── Expandable rows ── */}
          {[
            {
              key: "time", label: "Czas", Icon: Clock,
              show: showTime, toggle: () => setShowTime(v => !v),
              content: <TimePicker value={time} onChange={v => { setTime(v); setStartTime(v); }} />,
            },
            {
              key: "reminder", label: "Przypomnienie", Icon: Bell,
              show: showRem, toggle: () => setShowRem(v => !v),
              content: <CustomSelect value={reminder} onChange={setReminder} options={REMINDER_OPTIONS} />,
            },
            {
              key: "repeat", label: "Powtarzaj", Icon: RotateCcw,
              show: showRep, toggle: () => setShowRep(v => !v),
              content: <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />,
            },
          ].map(({ key, label, Icon, show, toggle, content }) => (
            <div key={key} style={{ borderTop: `1px solid ${C.borderSubtle}`, marginTop: "8px" }}>
              <button onClick={toggle} style={rowBtn}>
                <Icon size={13} strokeWidth={1.5} />
                <span style={{ flex: 1, textAlign: "left", fontSize: "12px" }}>{label}</span>
                {key === "time" && time && !allDay && (
                  <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: C.iceBlue }}>{time}</span>
                )}
                <ChevronRight size={11} strokeWidth={1.5}
                  style={{ transform: show ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.textDisabled }} />
              </button>
              {show && <div style={{ paddingBottom: "8px" }}>{content}</div>}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, marginTop: "8px" }}>
            <button
              onClick={() => { setAllDay(v => !v); setShowTime(false); }}
              style={{ ...rowBtn, justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px" }}>Cały dzień</span>
              <span style={{
                width: "34px", height: "18px", borderRadius: "10px", position: "relative", display: "block",
                background: allDay ? C.iceBlue : C.elevated, transition: "background .2s",
              }}>
                <span style={{
                  position: "absolute", top: "3px", left: allDay ? "17px" : "3px", width: "12px", height: "12px",
                  borderRadius: "50%", background: "#fff", transition: "left .2s",
                }} />
              </span>
            </button>
          </div>
        </div>
      ) : (
        /* ── Czas trwania tab ── */
        <div>
          {/* Cały dzień — ustawione przed godziną rozpoczęcia */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
            <span style={{ fontSize: "13px", color: C.textSecond }}>Cały dzień</span>
            <button
              onClick={() => { setAllDay(v => !v); setOpenTimeField(null); }}
              style={{
                width: "36px", height: "20px", borderRadius: "10px", border: "none",
                background: allDay ? C.iceBlue : C.elevated,
                cursor: "pointer", position: "relative" as const, transition: "background .2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute" as const, top: "3px",
                left: allDay ? "17px" : "3px",
                width: "14px", height: "14px", borderRadius: "50%",
                background: "#fff", transition: "left .2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>

          <div style={{ height: "1px", background: C.borderSubtle, margin: "2px 0" }} />

          {/* Rozpocznij / Koniec rows */}
          {([
            { label: "Rozpocznij", date: startDate, timeVal: startTime, field: "start"  as const },
            { label: "Koniec",     date: endDate,   timeVal: endTime,   field: "koniec" as const },
          ]).map(({ label, date, timeVal, field }) => {
            const open    = openTimeField === field;
            const isSelectedStart = field === "start" && Boolean(time) && !allDay;
            const dateStr = date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" }).replace(".", "");
            return (
              <div key={field}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 12px" }}>
                  <span style={{ width: "68px", fontSize: "12px", color: C.textSecond, flexShrink: 0 }}>{label}</span>
                  {/* Date chip */}
                  <div style={{
                    flex: 1, padding: "6px 10px", borderRadius: "8px", textAlign: "center" as const,
                    background: C.inputBg, border: `1px solid ${C.borderSubtle}`,
                    fontSize: "12px", fontFamily: "'DM Mono', monospace", color: C.textPrimary,
                  }}>
                    {dateStr}
                  </div>
                  {/* Time chip — toggles picker */}
                  <button
                    disabled={allDay}
                    onClick={() => { if (!allDay) setOpenTimeField(open ? null : field); }}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: "8px", textAlign: "center" as const,
                      background: open || isSelectedStart ? C.iceBlueBg : C.inputBg,
                      border: `1px solid ${open || isSelectedStart ? "rgba(71,114,250,0.35)" : C.borderSubtle}`,
                      color: open || isSelectedStart ? C.iceBlue : timeVal ? C.textPrimary : C.textDisabled,
                      fontSize: "12px", fontFamily: "'DM Mono', monospace",
                      cursor: allDay ? "default" : "pointer", opacity: allDay ? 0.55 : 1,
                    }}
                  >
                    {timeVal || "--:--"}
                  </button>
                </div>
                {/* Inline time picker */}
                {open && !allDay && (
                  <div style={{ padding: "0 12px 8px" }}>
                    <TimePicker
                      value={timeVal}
                      onChange={v => {
                        if (field === "start") { setStartTime(v); setTime(v); }
                        else setEndTime(v);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Timezone */}
          <div style={{
            margin: "0 12px 4px",
            borderRadius: "8px", background: C.inputBg, border: `1px solid ${C.borderSubtle}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 12px", cursor: "pointer",
          }}>
            <span style={{ fontSize: "12px", color: C.textSecond }}>Warsaw, GMT+2</span>
            <ChevronDown size={12} strokeWidth={1.5} style={{ color: C.textDisabled }} />
          </div>

          {/* O godzinie (przypomnienie) */}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, margin: "8px 12px 0" }}>
            <button onClick={() => { setShowDurRem(v => !v); setShowDurRep(false); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 0", background: "none", border: "none", cursor: "pointer",
            }}>
              <Bell size={13} strokeWidth={1.5} style={{ color: reminder ? C.iceBlue : C.iceBlue }} />
              <span style={{ flex: 1, textAlign: "left" as const, fontSize: "12px", color: C.iceBlue }}>
                {reminder ? (REMINDER_OPTIONS.find(o => o.value === reminder)?.label ?? "O godzinie") : "O godzinie"}
              </span>
              <ChevronRight size={11} strokeWidth={1.5}
                style={{ color: C.textDisabled, transform: showDurRem ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showDurRem && (
              <div style={{ paddingBottom: 10 }}>
                <CustomSelect value={reminder} onChange={setReminder} options={REMINDER_OPTIONS} />
              </div>
            )}
          </div>

          {/* Powtarzaj */}
          <div style={{ borderTop: `1px solid ${C.borderSubtle}`, margin: "0 12px" }}>
            <button onClick={() => { setShowDurRep(v => !v); setShowDurRem(false); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 0", background: "none", border: "none", cursor: "pointer",
            }}>
              <RotateCcw size={13} strokeWidth={1.5} style={{ color: repeat ? C.iceBlue : C.textMuted }} />
              <span style={{ flex: 1, textAlign: "left" as const, fontSize: "12px", color: repeat ? C.iceBlue : C.textMuted }}>
                {repeat ? (REPEAT_OPTIONS.find(o => o.value === repeat)?.label ?? "Powtarzaj") : "Powtarzaj"}
              </span>
              <ChevronRight size={11} strokeWidth={1.5}
                style={{ color: C.textDisabled, transform: showDurRep ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showDurRep && (
              <div style={{ paddingBottom: 10 }}>
                <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: "flex", gap: "8px", padding: "10px 12px",
        borderTop: `1px solid ${C.borderSubtle}`,
      }}>
        <button onClick={handleClear} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: "transparent", border: `1px solid ${C.borderSubtle}`,
          color: C.textSecond, fontSize: "12px", fontWeight: 500, cursor: "pointer",
        }}>
          Wyczyść
        </button>
        <button onClick={handleOk} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: C.iceBlue, border: "none",
          color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer",
        }}>
          OK
        </button>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────
function TaskRow({
  task, selected, onToggle, onSelect, onUpdate, tagi,
}: {
  task: Task; selected: boolean;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  tagi: TagItem[];
}) {
  const taskTags = (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const priorityColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.seaGlass : null;
  const timeLabel = task.time ? `${task.time}${task.endTime ? `–${task.endTime}` : ""}` : null;

  return (
    <div
      onClick={() => onSelect(task.id)}
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-100 group"
      style={{
        background: selected ? C.card : "transparent",
        borderLeft: selected ? `2px solid ${C.iceBlue}` : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = C.card + "88"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div
        onClick={e => { e.stopPropagation(); onToggle(task.id); }}
        className="mt-[2px] w-[13px] h-[11px] rounded-[3px] flex items-center justify-center flex-shrink-0 transition-all duration-200 cursor-pointer"
        style={{
          border: `1.5px solid ${task.done ? C.seaGlass : priorityColor ?? C.borderStrong}`,
          background: task.done ? C.seaGlassBg : priorityColor ? priorityColor + "14" : "transparent",
        }}
      >
        {task.done && <Check size={7} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] leading-snug block" style={{
          color: task.done ? C.textDisabled : C.textPrimary,
          textDecoration: task.done ? "line-through" : "none",
        }}>
          {task.text}
        </span>
        {task.date && (
          <div className="flex items-center gap-1 mt-1">
            <Calendar size={9} strokeWidth={1.5} style={{ color: C.textMuted }} />
            <span style={{ fontSize: "10px", color: C.textMuted }}>{task.date}</span>
          </div>
        )}
      </div>
      {(taskTags.length > 0 || timeLabel) && (
        <div className="flex items-center gap-1.5 flex-shrink-0 self-center ml-2">
          {taskTags.map(td => (
            <button
              key={td.id}
              onClick={e => { e.stopPropagation(); onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) }); }}
              title={`Usuń tag #${td.label}`}
              className="flex items-center gap-0.5 rounded-md"
              style={{
                fontSize: "9px", color: td.color + "C0", background: td.color + "12",
                border: `1px solid ${td.color}22`, padding: "2px 4px 2px 5px", cursor: "pointer", whiteSpace: "nowrap",
              }}>
              #{td.label}
              <X size={7} strokeWidth={2.2} />
            </button>
          ))}
          {timeLabel && (
            <div className="flex items-center gap-1" style={{ paddingLeft: taskTags.length > 0 ? 4 : 0 }}>
              <Clock size={9} strokeWidth={1.5} style={{ color: C.iceBlue }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: C.iceBlue, whiteSpace: "nowrap" }}>
                {timeLabel}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Priority dropdown ─────────────────────────────────────
const PRIORITY_FLAGS = [
  { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
  { p: "medium" as Priority, label: "Średni", color: C.warning },
  { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
  { p: null,                 label: "Brak",   color: C.textDisabled },
] as const;

function PriorityDropdown({ current, anchorEl, onSelect, onClose }: {
  current: Priority | null; anchorEl: HTMLElement;
  onSelect: (p: Priority | null) => void; onClose: () => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);
  return (
    <div ref={ref} style={{
      position: "fixed", top: rect.bottom + 4, right: window.innerWidth - rect.right,
      width: 148, background: "#1E1E1E", border: "1px solid #333",
      borderRadius: 12, overflow: "hidden", zIndex: 9999,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {PRIORITY_FLAGS.map(({ p, label, color }) => (
        <button key={String(p)} onClick={() => onSelect(p as Priority | null)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 14px", background: "none", border: "none", cursor: "pointer",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Flag size={13} strokeWidth={1.5} fill={p ? color : "none"} style={{ color }} />
            <span style={{ fontSize: 12, color: C.textSecond }}>{label}</span>
          </div>
          {current === p && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
        </button>
      ))}
    </div>
  );
}

// ── List picker dropdown ───────────────────────────────────
function ListPicker({ current, anchorEl, onSelect, onClose, listy }: {
  current: string | null; anchorEl: HTMLElement;
  onSelect: (id: string | null) => void; onClose: () => void;
  listy: ListItem[];
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);

  const all = [
    { id: null as string | null, label: "Skrzynka zadań", color: C.textMuted },
    ...listy.map(l => ({ id: l.id as string | null, label: l.label, color: l.color })),
  ].filter(l => l.label.toLowerCase().includes(q.toLowerCase()));

  const currentLabel = listy.find(l => l.id === current)?.label ?? "Skrzynka zadań";

  return (
    <div ref={ref} style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left,
      width: 210, background: "#1E1E1E", border: "1px solid #333",
      borderRadius: 12, overflow: "hidden", zIndex: 9999,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{ padding: "8px", borderBottom: "1px solid #2A2A2A" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#111", borderRadius: 7, padding: "5px 9px" }}>
          <Search size={11} strokeWidth={1.5} style={{ color: C.textDisabled, flexShrink: 0 }} />
          <input autoFocus placeholder="Szukaj" value={q} onChange={e => setQ(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: C.textPrimary, flex: 1, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }} />
        </div>
      </div>
      {all.map(l => (
        <button key={String(l.id)} onClick={() => onSelect(l.id)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: current === l.id ? C.iceBlue : C.textSecond }}>{l.label}</span>
          </div>
          {current === l.id && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
        </button>
      ))}
      <div style={{ borderTop: "1px solid #2A2A2A", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
        <Inbox size={11} strokeWidth={1.5} style={{ color: C.textDisabled }} />
        <span style={{ fontSize: 11, color: C.textMuted }}>{currentLabel}</span>
      </div>
    </div>
  );
}

// ── More menu ─────────────────────────────────────────────
const MORE_ITEMS: ({ action: string; label: string; icon: React.ComponentType<{size?:number;strokeWidth?:number;style?:React.CSSProperties}>; danger?: boolean } | null)[] = [
  { action: "subtask",   label: "Dodaj podzadanie",   icon: ListPlus   },
  { action: "pin",       label: "Przypnij",            icon: Pin        },
  { action: "wontdo",    label: "Nie zrobię",           icon: XCircle    },
  { action: "tags",      label: "Tagi",                 icon: Tag        },
  { action: "attach",    label: "Prześlij załącznik",   icon: Paperclip  },
  null,
  { action: "activity",  label: "Aktywności zadań",    icon: Activity   },
  { action: "template",  label: "Zapisz jako szablon", icon: Bookmark   },
  { action: "duplicate", label: "Duplikuj",             icon: Copy       },
  { action: "link",      label: "Kopiuj link",          icon: Link       },
  { action: "note",      label: "Konwertuj na notatkę", icon: FileText   },
  null,
  { action: "print",     label: "Drukuj",               icon: Printer    },
  { action: "delete",    label: "Usuń",                 icon: Trash2, danger: true },
];

function MoreMenu({ anchorEl, onAction, onClose }: {
  anchorEl: HTMLElement;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);
  return (
    <div ref={ref} style={{
      position: "fixed", bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right,
      width: 210, background: "#1E1E1E", border: "1px solid #333",
      borderRadius: 12, overflow: "hidden", zIndex: 9999,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {MORE_ITEMS.map((item, i) =>
        item === null
          ? <div key={i} style={{ height: 1, background: "#2A2A2A", margin: "3px 0" }} />
          : (
            <button key={item.action} onClick={() => onAction(item.action)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
            >
              <item.icon size={13} strokeWidth={1.5} style={{ color: item.danger ? C.danger : C.textMuted }} />
              <span style={{ fontSize: 12, color: item.danger ? C.danger : C.textSecond }}>{item.label}</span>
            </button>
          )
      )}
    </div>
  );
}

// ── Task detail panel ─────────────────────────────────────
const FORMAT_ACTIONS = [
  { label: "H",    title: "Nagłówek"     },
  { label: "B",    title: "Pogrubienie", bold: true },
  { label: "A",    title: "Kolor",       colored: true },
  { label: "I",    title: "Kursywa",     italic: true },
  { label: "U",    title: "Podkreślenie"},
  { label: "S̶",    title: "Przekreślenie"},
  { label: "•",    title: "Lista"        },
  { label: "1.",   title: "Numeracja"    },
  { label: "</>",  title: "Kod"          },
];

export function TaskDetail({ task, onClose, onUpdate, onDelete, listy, tagi, calendarAnchorEl, surface }: {
  task: Task; onClose: () => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
  listy: ListItem[];
  tagi: TagItem[];
  calendarAnchorEl?: HTMLElement | null;
  surface?: "default" | "calendar";
}) {
  const [showPriority,  setShowPriority]  = useState(false);
  const [showListPick,  setShowListPick]  = useState(false);
  const [showMore,      setShowMore]      = useState(false);
  const [showFormat,    setShowFormat]    = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [newComment,    setNewComment]    = useState("");
  const [comments,      setComments]      = useState<{ id: number; author: string; text: string; time: string }[]>([]);
  const [editTitle,     setEditTitle]     = useState(task.text);
  const [editNotes,     setEditNotes]     = useState(task.notes ?? "");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const taskCalendarDate = (task as Task & { calendarDate?: string }).calendarDate;
  const parsedTaskDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
  const [taskDateVal,    setTaskDateVal]    = useState<DateVal>({
    date: parsedTaskDate && !Number.isNaN(parsedTaskDate.getTime()) ? parsedTaskDate : null, time: task.endTime ? "" : task.time ?? "", reminder: "", repeat: "", startTime: task.time ?? "09:00", endTime: task.endTime ?? "10:00", duration: Boolean(task.endTime), allDay: true,
  });
  useEffect(() => {
    const nextDate = taskCalendarDate ? new Date(`${taskCalendarDate}T12:00:00`) : null;
    setTaskDateVal((current) => ({
      ...current,
      date: nextDate && !Number.isNaN(nextDate.getTime()) ? nextDate : null,
      time: task.endTime ? "" : task.time ?? "",
      startTime: task.time ?? "09:00",
      endTime: task.endTime ?? "10:00",
      duration: Boolean(task.endTime),
    }));
  }, [task.id, taskCalendarDate, task.time, task.endTime]);

  const flagBtnRef = useRef<HTMLButtonElement>(null);
  const listBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);

  // Sync title/notes when task changes
  useEffect(() => { setEditTitle(task.text); }, [task.text]);
  useEffect(() => { setEditNotes(task.notes ?? ""); }, [task.notes]);

  const closeAll = () => { setShowPriority(false); setShowListPick(false); setShowMore(false); };

  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const flagColor = task.priority === "high" ? C.danger : task.priority === "medium" ? C.warning : task.priority === "low" ? C.iceBlue : C.textDisabled;
  const listLabel = listy.find(l => l.id === task.list)?.label ?? "Skrzynka zadań";
  const listColor = listy.find(l => l.id === task.list)?.color ?? C.textMuted;
  const taskTagDefs = (task.tags ?? []).map(id => tagi.find(t => t.id === id)).filter(Boolean) as TagItem[];
  const dateStr   = task.date ?? "Dziś, 16 lip";
  const timeStr   = task.time ? `, ${task.time}${task.endTime ? `–${task.endTime}` : ""}` : "";

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments(p => [...p, { id: Date.now(), author: "Mateusz", text: newComment.trim(), time: "teraz" }]);
    setNewComment("");
  };

  const toggleSubtask = (subId: number) => {
    const updated = (task.subtasks ?? []).map(s => s.id === subId ? { ...s, done: !s.done } : s);
    onUpdate(task.id, { subtasks: updated });
  };

  const D = {
    bg:     surface === "calendar" ? "#2A2A2A" : "#131313",
    bar:    surface === "calendar" ? "#303030" : "#181818",
    border: surface === "calendar" ? "rgba(255,255,255,0.08)" : "#232323",
    hover:  surface === "calendar" ? "#353535" : "#222222",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        {/* Done checkbox (square) */}
        <button
          onClick={() => onUpdate(task.id, { done: !task.done })}
          style={{ width: 17, height: 17, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1.5px solid ${task.done ? C.seaGlass : "#484848"}`, background: task.done ? C.seaGlassBg : "transparent" }}
        >
          {task.done && <Check size={9} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: D.border, flexShrink: 0 }} />

        {/* Date chip — opens DatePickerPopup */}
        <button
          ref={dateBtnRef}
          onClick={() => { setShowDatePicker(v => !v); closeAll(); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflow: "hidden", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <Calendar size={12} strokeWidth={1.5} style={{ color: C.iceBlue, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.iceBlue, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dateStr}{timeStr}
          </span>
        </button>

        {/* Priority flag */}
        <button
          ref={flagBtnRef}
          onClick={() => { setShowPriority(v => !v); setShowListPick(false); setShowMore(false); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex", flexShrink: 0 }}
        >
          <Flag size={15} strokeWidth={1.5} fill={task.priority ? flagColor : "none"} style={{ color: flagColor }} />
        </button>

        <button
          type="button"
          aria-label="Zamknij szczegóły zadania"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex", flexShrink: 0, color: C.textDisabled }}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "14px 14px 8px", display: "flex", flexDirection: "column" }}>

        {/* Title row — auto-height */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8, flexShrink: 0 }}>
          <textarea
            value={editTitle}
            placeholder="Co chciałbyś zrobić?"
            onChange={e => {
              setEditTitle(e.target.value);
              onUpdate(task.id, { text: e.target.value });
              const t = e.target;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            onBlur={() => onUpdate(task.id, { text: editTitle })}
            ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none", resize: "none", overflow: "hidden",
              fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
              textDecoration: task.done ? "line-through" : "none",
            }}
          />
          <button style={{ background: "none", border: "none", cursor: "pointer", color: C.textDisabled, padding: 2, flexShrink: 0, marginTop: 3 }}>
            <AlignLeft size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Notes — fills remaining space */}
        <textarea
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          onBlur={() => onUpdate(task.id, { notes: editNotes })}
          placeholder="Wpisz treść lub wpisz /, aby wyświetlić menu"
          style={{
            flex: 1, minHeight: 80, width: "100%", background: "none", border: "none", outline: "none", resize: "none",
            fontSize: 13, color: C.textSecond, lineHeight: 1.65,
            fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 0,
          }}
        />

        {/* Tags */}
        {(taskTagDefs.length > 0 || showTagInput) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" }}>
            {taskTagDefs.map(td => (
              <span key={td.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20,
                color: td.color, background: td.color + "1A",
              }}>
                #{td.label}
                <button
                  onClick={() => onUpdate(task.id, { tags: (task.tags ?? []).filter(id => id !== td.id) })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: td.color, display: "flex", padding: 0, lineHeight: 1 }}>
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {showTagInput ? (
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const raw = tagInput.replace(/^#/, "").trim().toLowerCase();
                    if (raw) {
                      const exists = tagi.find(t => t.id === raw || t.label.toLowerCase() === raw);
                      const tagId = exists ? exists.id : raw;
                      if (!(task.tags ?? []).includes(tagId)) {
                        onUpdate(task.id, { tags: [...(task.tags ?? []), tagId] });
                      }
                    }
                    setTagInput(""); setShowTagInput(false);
                  }
                  if (e.key === "Escape") { setTagInput(""); setShowTagInput(false); }
                }}
                onBlur={() => { setTagInput(""); setShowTagInput(false); }}
                placeholder="#tag"
                style={{
                  background: "#1E1E1E", border: `1px solid ${C.iceBlue}55`, borderRadius: 20,
                  outline: "none", fontSize: 11, color: C.textSecond, padding: "3px 8px",
                  fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", width: 72,
                }}
              />
            ) : (
              <button
                onClick={() => setShowTagInput(true)}
                style={{ background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: 20, cursor: "pointer", fontSize: 11, color: C.textDisabled, padding: "3px 8px", display: "flex", alignItems: "center", gap: 3 }}>
                <Plus size={9} strokeWidth={2} /> tag
              </button>
            )}
          </div>
        )}
        {taskTagDefs.length === 0 && !showTagInput && (
          <button
            onClick={() => setShowTagInput(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, background: "none", border: "none", cursor: "pointer", color: C.textDisabled, fontSize: 11, padding: 0 }}>
            <Tag size={11} strokeWidth={1.5} /> Dodaj tag
          </button>
        )}

        {/* Subtasks */}
        {(task.subtasks ?? []).length > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${D.border}`, paddingTop: 12 }}>
            {(task.subtasks ?? []).map(st => (
              <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <button
                  onClick={() => toggleSubtask(st.id)}
                  style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1.5px solid ${st.done ? C.seaGlass : "#484848"}`, background: st.done ? C.seaGlassBg : "transparent" }}
                >
                  {st.done && <Check size={7} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
                </button>
                <span style={{ fontSize: 12, color: st.done ? C.textDisabled : C.textSecond, textDecoration: st.done ? "line-through" : "none" }}>{st.text || "Nowe podzadanie"}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid #2A2A2A`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.textDisabled }}>Naciśnij klawisz "Enter", aby dodać pozycję do listy</span>
            </div>
          </div>
        )}

        {/* Comments section */}
        {showComments && comments.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 12 }}>Komentarze {comments.length}</p>
            {comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: C.iceBlueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.iceBlue }}>
                  {c.author[0]}
                </div>
                <div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{c.author}</span>
                    <span style={{ fontSize: 10, color: C.textDisabled }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Format bar ── */}
      {showFormat && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "5px 8px", display: "flex", gap: 1, flexWrap: "wrap", background: D.bar, flexShrink: 0 }}>
          {FORMAT_ACTIONS.map(f => (
            <button key={f.label} title={f.title}
              style={{ padding: "4px 7px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: f.colored ? C.iceBlue : C.textMuted, fontSize: 11, fontWeight: f.bold ? 700 : f.italic ? 400 : 400, fontStyle: f.italic ? "italic" : "normal" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Comment input ── */}
      {showComments && (
        <div style={{ borderTop: `1px solid ${D.border}`, padding: "8px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${newComment ? C.iceBlue : "#333"}`, borderRadius: 8, padding: "7px 10px", transition: "border-color .2s" }}>
            <input
              placeholder="Napisz komentarz"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
            />
            <Smile size={13} strokeWidth={1.5} style={{ color: C.textDisabled, flexShrink: 0 }} />
            <ImageIcon size={13} strokeWidth={1.5} style={{ color: C.textDisabled, flexShrink: 0 }} />
          </div>
        </div>
      )}

      {/* ── Footer bar ── */}
      <div style={{ borderTop: `1px solid ${D.border}`, display: "flex", alignItems: "center", padding: "7px 10px", flexShrink: 0, gap: 4 }}>
        {/* List picker */}
        <button ref={listBtnRef}
          onClick={() => { setShowListPick(v => !v); setShowMore(false); setShowPriority(false); }}
          style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0, padding: "2px 0" }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: listColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listLabel}</span>
        </button>

        <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          {/* Format toggle (A) */}
          <button onClick={() => setShowFormat(v => !v)}
            style={{ padding: "5px 7px", borderRadius: 6, background: showFormat ? C.iceBlueBg : "none", border: "none", cursor: "pointer", color: showFormat ? C.iceBlue : C.textDisabled, fontSize: 12, fontWeight: 700 }}>
            A
          </button>
          {/* Comments toggle */}
          <button onClick={() => setShowComments(v => !v)}
            style={{ padding: "4px 6px", borderRadius: 6, background: showComments ? C.iceBlueBg : "none", border: "none", cursor: "pointer", color: showComments ? C.iceBlue : C.textDisabled, display: "flex", alignItems: "center", gap: 3 }}>
            <MessageSquare size={13} strokeWidth={1.5} />
            {comments.length > 0 && <span style={{ fontSize: 9, color: C.iceBlue, fontWeight: 700 }}>{comments.length}</span>}
          </button>
          {/* More (...) */}
          <button ref={moreBtnRef}
            onClick={() => { setShowMore(v => !v); setShowListPick(false); setShowPriority(false); }}
            style={{ padding: "4px 5px", borderRadius: 6, background: showMore ? "#2A2A2A" : "none", border: "none", cursor: "pointer", color: C.textDisabled, display: "flex", alignItems: "center" }}>
            <MoreHorizontal size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Floating menus ── */}
      {showDatePicker && dateBtnRef.current && (
        <DatePickerPopup
          value={taskDateVal}
          onConfirm={v => {
            setTaskDateVal(v);
            const label = formatDateLabel(v);
            onUpdate(task.id, {
              date: label || undefined,
              time: v.duration ? v.startTime : v.time || undefined,
              endTime: v.duration ? v.endTime : undefined,
              ...(taskCalendarDate !== undefined && v.date ? {
                calendarDate: `${v.date.getFullYear()}-${String(v.date.getMonth() + 1).padStart(2, "0")}-${String(v.date.getDate()).padStart(2, "0")}`,
              } : {}),
            });
            setShowDatePicker(false);
          }}
          onClose={() => setShowDatePicker(false)}
          anchorEl={dateBtnRef.current}
          placementAnchorEl={calendarAnchorEl}
        />
      )}
      {showPriority && flagBtnRef.current && (
        <PriorityDropdown
          current={task.priority ?? null}
          anchorEl={flagBtnRef.current}
          onSelect={p => { onUpdate(task.id, { priority: p ?? undefined }); setShowPriority(false); }}
          onClose={() => setShowPriority(false)}
        />
      )}
      {showListPick && listBtnRef.current && (
        <ListPicker
          current={task.list ?? null}
          anchorEl={listBtnRef.current}
          onSelect={id => { onUpdate(task.id, { list: id ?? undefined }); setShowListPick(false); }}
          onClose={() => setShowListPick(false)}
          listy={listy}
        />
      )}
      {showMore && moreBtnRef.current && (
        <MoreMenu
          anchorEl={moreBtnRef.current}
          onAction={action => {
            if (action === "delete") { onDelete(task.id); }
            if (action === "subtask") {
              const sub: Subtask = { id: Date.now(), text: "Nowe podzadanie", done: false };
              onUpdate(task.id, { subtasks: [...(task.subtasks ?? []), sub] });
            }
            setShowMore(false);
          }}
          onClose={() => setShowMore(false)}
        />
      )}
    </div>
  );
}

// ── Summary right panel ───────────────────────────────────
function SummaryPanel({ tasks, habits, onToggleHabit }: {
  tasks: Task[]; habits: Habit[]; onToggleHabit: (id: number) => void;
}) {
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const doneH = habits.filter(h => h.done).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const week  = getMiniWeek();
  const todayIdx = week.findIndex(d => d.today);
  const panelBg = "#2C2C2C";
  const panelBorder = "#3C3C3C";
  const headingColor = "#929292";
  const secondaryText = "#858585";
  const DL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 py-5 space-y-6">
      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Podsumowanie dnia</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Zadania", done, total, accent: done > 0 ? C.seaGlass : C.textPrimary },
            { label: "Nawyki", done: doneH, total: habits.length, accent: doneH > 0 ? C.seaGlass : C.textPrimary },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
              <div className="font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: s.accent }}>
                <span className="text-[22px]">{s.done}</span>
                <span className="text-[22px]" style={{ color: secondaryText }}>/{s.total}</span>
              </div>
              <div className="text-[9px] mt-1.5 uppercase tracking-widest" style={{ color: secondaryText }}>{s.label} · wykonane</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px]" style={{ color: headingColor }}>Postęp dnia</span>
            <span className="text-[15px] font-semibold leading-none" style={{ fontFamily: "'DM Mono',monospace", color: pct === 100 ? C.seaGlass : C.iceBlue }}>{pct}%</span>
          </div>
          <div className="h-[4px] rounded-full overflow-hidden" style={{ background: C.borderSubtle }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct === 100 ? C.seaGlass : C.iceBlue }} />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: headingColor }}>Nawyki na dziś</p>
          <span className="text-[10px]" style={{ fontFamily: "'DM Mono',monospace", color: secondaryText }}>{doneH}/{habits.length}</span>
        </div>
        <div className="space-y-1.5">
          {habits.map(h => (
            <div key={h.id} onClick={() => onToggleHabit(h.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150"
              style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = panelBg)}>
              <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{ border: `1.5px solid ${h.done ? C.seaGlass : C.borderStrong}`, background: h.done ? C.seaGlassBg : "transparent" }}>
                {h.done && <Check size={7} strokeWidth={2.5} style={{ color: C.seaGlass }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] leading-none" style={{ color: h.done ? "#767676" : "#D0D0D0", textDecoration: h.done ? "line-through" : "none" }}>{h.name}</div>
                {h.streak > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame size={9} strokeWidth={1.5} style={{ color: C.warning }} />
                    <span className="text-[10px]" style={{ color: secondaryText }}>{h.streak} dni</span>
                  </div>
                )}
              </div>
              {h.done && <Star size={10} strokeWidth={1.5} style={{ color: C.warning, flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: headingColor }}>Ten tydzień</p>
        <div className="rounded-xl p-3.5" style={{ background: panelBg, border: `1px solid ${panelBorder}` }}>
          <div className="flex gap-1.5">
            {week.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-center justify-center rounded-lg text-[10px] font-medium transition-all"
                  style={{
                    aspectRatio: "1",
                    background: d.today ? C.iceBlueBg : i < todayIdx ? C.seaGlassBg : "transparent",
                    color: d.today ? C.iceBlue : i < todayIdx ? C.seaGlass : secondaryText,
                    border: `1px solid ${d.today ? "rgba(71,114,250,0.3)" : "transparent"}`,
                  }}>
                  {i < todayIdx ? <Check size={8} strokeWidth={2.5} /> : d.n}
                </div>
                <span className="text-[9px]" style={{ color: d.today ? C.iceBlue : secondaryText }}>{DL[i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: panelBorder }}>
            <span className="text-[11px]" style={{ color: headingColor }}>Seria aktywna</span>
            <div className="flex items-center gap-1">
              <Flame size={11} strokeWidth={1.5} style={{ color: C.warning }} />
              <span className="text-[11px] font-medium" style={{ fontFamily: "'DM Mono',monospace", color: C.warning }}>{todayIdx} dni</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Podsumowanie: document main area ──────────────────────
function SummaryDocument({ tasks, listy }: { tasks: Task[]; listy: ListItem[] }) {
  const done   = tasks.filter(t => t.done);
  const undone = tasks.filter(t => !t.done);
  const weekLabel = getWeekRangeLabel();

  const tbBtns = [
    "H1","H2","H3","|","B","I","U","S","|","🔗","</>","«»",
  ];

  function Line({ task, showDate }: { task: Task; showDate: boolean }) {
    const col = listy.find(l => l.id === task.list)?.color ?? C.danger;
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3.5px 0" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 6, opacity: 0.9 }} />
        {showDate && task.date && (
          <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>[{fmtTaskDate(task.date)}]</span>
        )}
        <span style={{ fontSize: 13.5, color: C.textSecond, lineHeight: 1.55 }}>{task.text}</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>
      {/* Header */}
      <div style={{ padding: "18px 26px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3.5, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: C.textMuted, borderRadius: 1 }} />)}
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
              Podsumowanie
            </span>
          </div>
          <span style={{ fontSize: 13, color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{weekLabel}</span>
        </div>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 1,
          padding: "5px 8px", marginBottom: 18,
          background: C.card, borderRadius: 10,
          border: `1px solid ${C.borderSubtle}`,
        }}>
          {tbBtns.map((b, i) => b === "|" ? (
            <div key={i} style={{ width: 1, height: 13, background: C.borderStrong, margin: "0 4px" }} />
          ) : (
            <button key={i} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "3px 7px", borderRadius: 5,
              fontSize: 10.5, fontWeight: 700, color: C.textMuted,
              fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", lineHeight: 1,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.elevated)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Date range hero */}
      <div style={{ padding: "0 26px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
          {weekLabel}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 26px 16px", scrollbarWidth: "none" }}>
        {/* Ukończone */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.seaGlass, marginBottom: 8, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
            Ukończone
          </div>
          {done.length === 0
            ? <p style={{ fontSize: 12, color: C.textDisabled, paddingLeft: 14 }}>Brak ukończonych zadań w tym okresie.</p>
            : done.map(t => <Line key={t.id} task={t} showDate={true} />)
          }
        </div>
        {/* Niewykonane */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.danger, marginBottom: 8, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
            Niewykonane
          </div>
          {undone.length === 0
            ? <p style={{ fontSize: 12, color: C.textDisabled, paddingLeft: 14 }}>Brak niewykonanych. Świetna robota!</p>
            : undone.map(t => <Line key={t.id} task={t} showDate={false} />)
          }
        </div>
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, padding: "12px 26px", borderTop: `1px solid ${C.borderSubtle}` }}>
        {[
          { icon: <Bookmark size={13} strokeWidth={1.5} />, label: "Zapisz jako" },
          { icon: <Copy size={13} strokeWidth={1.5} />,     label: "Kopiuj" },
        ].map(({ icon, label }) => (
          <button key={label} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            background: C.card, border: `1px solid ${C.borderSubtle}`,
            cursor: "pointer", fontSize: 12, color: C.textMuted,
            fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = C.card)}>
            {icon}{label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Podsumowanie: right options panel ─────────────────────
function SummaryOptions() {
  const [nextPeriod, setNextPeriod] = useState(true);

  function DropRow({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ padding: "5px 14px" }}>
        <div style={{ fontSize: 10, color: C.textDisabled, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.card, border: `1px solid ${C.borderSubtle}`,
          borderRadius: 8, padding: "5px 9px", cursor: "pointer",
          fontSize: 11, color: C.textSecond,
          fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.cardHover)}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = C.card)}>
          <span style={{ textAlign: "left", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{value}</span>
          <ChevronDown size={11} strokeWidth={2} style={{ color: C.textDisabled, flexShrink: 0, marginLeft: 4 }} />
        </button>
      </div>
    );
  }

  const Divider = () => <div style={{ height: 1, background: C.borderSubtle, margin: "8px 14px" }} />;
  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{ padding: "10px 14px 6px", fontSize: 10.5, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{text}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", scrollbarWidth: "none" as const }}>
      {/* Szablon */}
      <div style={{ padding: "16px 14px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel text="Szablon" />
          <button style={{ background: "none", border: "none", cursor: "pointer", color: C.textDisabled, display: "flex", padding: "10px 14px 6px" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textDisabled)}>
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      <Divider />
      <SectionLabel text="Filtruj" />
      <DropRow label="Data" value={`Ten tydzień (${getWeekRangeLabel()})`} />
      <DropRow label="Listy" value="Wszystkie listy" />
      <DropRow label="Status" value="Wszystkie statusy" />
      <DropRow label="Więcej" value="Brak" />

      <Divider />
      <SectionLabel text="Opcje wyświetlania" />
      <DropRow label="Grupowanie" value="Według statusu ukończenia" />
      <DropRow label="Pola" value="3 wybranych" />

      <Divider />
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: C.textSecond, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>
          Zadania na następny okres
        </span>
        <button onClick={() => setNextPeriod(v => !v)} style={{
          width: 34, height: 19, borderRadius: 10, flexShrink: 0,
          background: nextPeriod ? C.iceBlue : C.borderStrong,
          border: "none", cursor: "pointer", position: "relative" as const, transition: "background .2s",
        }}>
          <div style={{
            position: "absolute" as const, top: 2,
            left: nextPeriod ? 17 : 2,
            width: 15, height: 15, borderRadius: "50%",
            background: "#fff", transition: "left .2s",
          }} />
        </button>
      </div>
    </div>
  );
}

// ── Lightweight floating menu for input bar dropdowns ─────
function InputFloatMenu({ anchorEl, onClose, children }: {
  anchorEl: HTMLElement; onClose: () => void; children: React.ReactNode;
}) {
  const ref  = useRef<HTMLDivElement>(null);
  const rect = anchorEl.getBoundingClientRect();
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [anchorEl, onClose]);
  return (
    <div ref={ref} style={{
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      minWidth: 170,
      background: "#1E1E1E",
      border: "1px solid #333",
      borderRadius: 12,
      overflow: "hidden",
      zIndex: 9999,
      boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      paddingBlock: 4,
    }}>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────
const INIT_LISTY: ListItem[] = [
  { id: "praca",   label: "Praca",   color: "#4772FA" },
  { id: "dom",     label: "Dom",     color: "#D4AA68" },
  { id: "hobby",   label: "Hobby",   color: "#A0A0A0" },
  { id: "zdrowie", label: "Zdrowie", color: "#70B89F" },
];
const INIT_TAGI: TagItem[] = [
  { id: "praca",   label: "praca",   color: "#4772FA" },
  { id: "trening", label: "trening", color: "#70B89F" },
  { id: "dom",     label: "dom",     color: "#D4AA68" },
  { id: "finanse", label: "finanse", color: "#A0A0A0" },
  { id: "zdrowie", label: "zdrowie", color: "#70B89F" },
  { id: "hobby",   label: "hobby",   color: "#A8BCD4" },
];

export default function Zadania() {
  const [taskView,      setTaskView]      = useState("dzis");
  const [listFilter,    setListFilter]    = useState<string | null>(null);
  const [tagFilter,     setTagFilter]     = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tasks,         setTasks]         = useState<Task[]>(() => hydrateTaskCompletion(INITIAL_TASKS));
  const [habits,        setHabits]        = useState<Habit[]>(INIT_HABITS);
  const [listy,         setListy]         = useState<ListItem[]>(INIT_LISTY);
  const [tagi,          setTagi]          = useState<TagItem[]>(INIT_TAGI);
  const [selectedId,    setSelectedId]    = useState<number | null>(null);
  const [newTask,       setNewTask]       = useState("");
  const [newTaskTags,   setNewTaskTags]   = useState<string[]>([]);
  const [newTaskList,   setNewTaskList]   = useState<string | null>(null);
  const [inputFocused,  setInputFocused]  = useState(false);
  const [newPriority,   setNewPriority]   = useState<Priority | null>(null);
  const [newDateVal,    setNewDateVal]    = useState<DateVal>(DEFAULT_DATE_VAL);
  const [inputDropdown, setInputDropdown] = useState<"priority" | "list" | "tags" | null>(null);
  const [showDone,      setShowDone]      = useState(true);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Sidebar collapse state
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [listyOpen,     setListyOpen]     = useState(false);
  const [tagiOpen,      setTagiOpen]      = useState(false);

  // Sidebar CRUD state
  const [addingList,    setAddingList]    = useState(false);
  const [newListLabel,  setNewListLabel]  = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListLabel, setEditListLabel] = useState("");
  const [listSearchOpen, setListSearchOpen] = useState(false);
  const [listSearch,    setListSearch]    = useState("");
  const [addingTag,     setAddingTag]     = useState(false);
  const [newTagLabel,   setNewTagLabel]   = useState("");
  const [editingTagId,  setEditingTagId]  = useState<string | null>(null);
  const [editTagLabel,  setEditTagLabel]  = useState("");
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagSearch,     setTagSearch]     = useState("");

  const inputRef        = useRef<HTMLInputElement>(null);
  const dateButtonRef   = useRef<HTMLButtonElement>(null);
  const flagBtnInputRef = useRef<HTMLButtonElement>(null);
  const listBtnInputRef = useRef<HTMLButtonElement>(null);
  const hashBtnInputRef = useRef<HTMLButtonElement>(null);

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null;
  const tagUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {});
  const listUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.list) counts[task.list] = (counts[task.list] ?? 0) + 1;
    return counts;
  }, {});
  const normalizedListSearch = listSearch.trim().toLowerCase();
  const visibleLists = listy
    .filter(list => !normalizedListSearch || list.label.toLowerCase().includes(normalizedListSearch))
    .sort((a, b) => (listUsage[b.id] ?? 0) - (listUsage[a.id] ?? 0))
    .slice(0, normalizedListSearch ? undefined : VISIBLE_TAG_LIMIT);
  const normalizedTagSearch = tagSearch.trim().toLowerCase().replace(/^#/, "");
  const visibleTags = tagi
    .filter(tag => !normalizedTagSearch || tag.label.includes(normalizedTagSearch))
    .sort((a, b) => (tagUsage[b.id] ?? 0) - (tagUsage[a.id] ?? 0))
    .slice(0, normalizedTagSearch ? undefined : VISIBLE_TAG_LIMIT);

  const visible = tasks.filter(t => {
    if (taskView === "kosz") return Boolean(t.deleted);
    if (t.deleted) return false;
    if (taskView === "ukonczone") return t.done;
    const viewMatch = taskView === "wszystkie" || taskView === "skrzynka" || taskView === "podsumowanie"
      ? true : t.view === taskView;
    const listMatch = listFilter ? t.list === listFilter : true;
    const tagMatch  = tagFilter  ? (t.tags ?? []).includes(tagFilter) : true;
    const prioMatch = priorityFilter ? t.priority === priorityFilter : true;
    return viewMatch && listMatch && tagMatch && prioMatch;
  });
  const pending   = visible.filter(t => !t.done);
  const completed = visible.filter(t => t.done);

  const viewCounts = Object.fromEntries(
    SMART_VIEWS.map(v => [
      v.id,
      tasks.filter(t => !t.deleted && !t.done && (
        v.id === "wszystkie" || v.id === "skrzynka" || v.id === "podsumowanie" ? true : t.view === v.id
      )).length,
    ])
  );

  // Hashtag parsing
  const handleTaskInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const match = v.match(/#(\w+)\s$/);
    if (match) {
      const raw = match[1].toLowerCase();
      if (!newTaskTags.includes(raw)) setNewTaskTags(prev => [...prev, raw]);
      setNewTask(v.replace(/#(\w+)\s$/, "").trimEnd());
    } else {
      setNewTask(v);
    }
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { addTask(); return; }
    if (e.key === "Backspace" && newTask === "" && newTaskTags.length > 0) {
      setNewTaskTags(prev => prev.slice(0, -1));
    }
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    const id = Date.now();
    const dateLabel = formatDateLabel(newDateVal);
    setTagi(existing => {
      const known = new Set(existing.map(tag => tag.id));
      const missing = newTaskTags.filter(tag => !known.has(tag));
      return missing.length === 0
        ? existing
        : [...existing, ...missing.map((tag, index) => ({
            id: tag,
            label: tag,
            color: PALETTE[(existing.length + index) % PALETTE.length],
          }))];
    });
    setTasks(p => [...p, {
      id, text, done: false, view: taskView === "wszystkie" || taskView === "podsumowanie" || taskView === "kosz" ? "dzis" : taskView,
      tags: newTaskTags.length > 0 ? newTaskTags : undefined,
      list: newTaskList ?? undefined,
      priority: newPriority ?? undefined,
      time: newDateVal.duration ? newDateVal.startTime : newDateVal.time || undefined,
      endTime: newDateVal.duration ? newDateVal.endTime : undefined,
      date: dateLabel || undefined,
    }]);
    setNewTask(""); setNewPriority(null); setNewTaskTags([]); setNewTaskList(null);
    setNewDateVal(DEFAULT_DATE_VAL); setInputDropdown(null);
    setSelectedId(id);
  };

  // List CRUD
  const addList = () => {
    const label = newListLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, "-");
    const color = PALETTE[listy.length % PALETTE.length];
    setListy(p => [...p, { id, label, color }]);
    setNewListLabel(""); setAddingList(false);
  };
  const saveList = (id: string) => {
    const label = editListLabel.trim();
    if (label) setListy(p => p.map(l => l.id === id ? { ...l, label } : l));
    setEditingListId(null);
  };
  const deleteList = (id: string) => {
    setListy(p => p.filter(l => l.id !== id));
    if (listFilter === id) setListFilter(null);
  };

  // Tag CRUD
  const addTagItem = () => {
    const label = newTagLabel.trim().toLowerCase().replace(/^#/, "");
    if (!label) return;
    const id = label.replace(/\s+/g, "-");
    const color = PALETTE[(tagi.length) % PALETTE.length];
    setTagi(p => [...p, { id, label, color }]);
    setNewTagLabel(""); setAddingTag(false);
  };
  const saveTag = (id: string) => {
    const label = editTagLabel.trim().toLowerCase();
    if (label) setTagi(p => p.map(t => t.id === id ? { ...t, label } : t));
    setEditingTagId(null);
  };
  const deleteTag = (id: string) => {
    setTagi(p => p.filter(t => t.id !== id));
    if (tagFilter === id) setTagFilter(null);
  };

  const updateTask = (id: number, patch: Partial<Task>) => {
    if (typeof patch.done === "boolean") persistTaskCompletion(id, patch.done);
    setTasks(p => p.map(t => t.id === id ? { ...t, ...patch } : t));
  };
  const deleteTask = (id: number) => { updateTask(id, { deleted: true }); setSelectedId(null); };
  const toggleHabit = (id: number) => setHabits(p => p.map(h => h.id === id ? { ...h, done: !h.done } : h));

  const closeDatePicker = useCallback(() => setDatePickerOpen(false), []);

  useEffect(() => { setSelectedId(null); }, [taskView, listFilter, tagFilter]);

  const getPlaceholder = () => {
    if (listFilter) return `Dodaj zadanie do "${listy.find(l => l.id === listFilter)?.label}"`;
    if (tagFilter)  return `Dodaj zadanie z #${tagFilter}`;
    return `Dodaj zadanie do "${VIEW_LABELS[taskView] ?? taskView}"`;
  };

  const dateLabel = formatDateLabel(newDateVal);
  const flagColor = newPriority === "high" ? C.danger : newPriority === "medium" ? C.warning : newPriority === "low" ? C.iceBlue : null;

  return (
    <div className="flex flex-1 overflow-hidden h-full">

      {/* ── Sub-sidebar ── */}
      <div className="task-sub-sidebar w-[200px] flex-shrink-0 border-r flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ background: C.subSidebar, borderColor: C.borderSubtle }}>

        {/* Smart views */}
        <div className="px-2.5 pt-4 pb-2 space-y-px">
          {SMART_VIEWS.map(v => {
            const Icon = v.icon;
            const active = taskView === v.id && !listFilter && !tagFilter;
            const count = viewCounts[v.id];
            return (
              <button key={v.id}
                onClick={() => { setTaskView(v.id); setListFilter(null); setTagFilter(null); }}
                className="sidebar-item w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[11px] transition-all duration-150"
                style={{
                  background: active ? C.iceBlueBg : "transparent",
                  color: active ? C.iceBlue : C.textMuted,
                  fontSize: "var(--sidebar-font-size)",
                  fontWeight: active ? 500 : 400,
                  borderLeft: active ? `2px solid ${C.iceBlue}` : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                <Icon size={12} strokeWidth={1.6} className="flex-shrink-0" />
                <span className="flex-1 text-left leading-none">{v.label}</span>
                {v.id !== "podsumowanie" && count > 0 && (
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "8px", color: active ? C.iceBlue : C.textDisabled }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Filtry */}
        <div className="px-2.5 mb-2">
          <button onClick={() => setFiltersOpen(open => !open)}
            className="flex items-center gap-1.5 px-1.5 mb-1.5"
            style={{ background: "none", border: "none", cursor: "pointer", paddingTop: 0, paddingBottom: 0 }}>
            <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: filtersOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>Filtry</span>
          </button>
          {filtersOpen && <div className="space-y-px mt-1.5">
            {([
              { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
              { p: "medium" as Priority, label: "Średni", color: C.warning },
              { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
            ] as const).map(({ p, label, color }) => {
              const active = priorityFilter === p;
              return (
                <button key={p}
                  onClick={() => setPriorityFilter(active ? null : p)}
                  className="w-full flex items-center gap-2.5 px-3 py-[6px] rounded-lg transition-all"
                  style={{
                    background: active ? color + "14" : "transparent",
                    color: active ? color : C.textMuted,
                    borderLeft: active ? `2px solid ${color}` : "2px solid transparent",
                    fontSize: "11px",
                    fontWeight: active ? 500 : 400,
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, opacity: active ? 1 : 0.7, flexShrink: 0 }} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>}
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Listy */}
        <div className="px-2.5 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setListyOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: listyOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>Listy</span>
            </button>
            {listyOpen && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setListSearchOpen(open => !open); setListSearch(""); }}
                  aria-label="Szukaj listy"
                  title="Szukaj listy"
                  style={{ background: "none", border: "none", cursor: "pointer", color: listSearchOpen ? C.iceBlue : C.textDisabled, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textDisabled; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingList(true); setAddingTag(false); setListSearchOpen(false); }}
                  aria-label="Dodaj listę"
                  title="Dodaj listę"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textDisabled, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textDisabled)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {listyOpen && <div className="space-y-px">
            {listSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Szukaj listy"
                  aria-label="Szukaj listy"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {listy.length === 0 && !addingList && (
              <p style={{ fontSize: 11, color: C.textDisabled, padding: "4px 12px" }}>Brak list. Kliknij + aby dodać.</p>
            )}
            {listy.length > 0 && visibleLists.length === 0 && (
              <p style={{ fontSize: 10, color: C.textDisabled, padding: "4px 12px" }}>Brak pasujących list.</p>
            )}
            {visibleLists.map(l => {
              const active = listFilter === l.id;
              const count = tasks.filter(t => !t.done && t.list === l.id).length;
              return (
                <div key={l.id} className="group relative">
                  {editingListId === l.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                      <input autoFocus value={editListLabel} onChange={e => setEditListLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveList(l.id); if (e.key === "Escape") setEditingListId(null); }}
                        onBlur={() => saveList(l.id)}
                        style={{ flex: 1, background: "#1A1A1A", border: `1px solid ${C.iceBlue}55`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }} />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setListFilter(active ? null : l.id); setTagFilter(null); }}
                      className="sidebar-item w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[11px] transition-all"
                      style={{
                        background: active ? l.color+"14" : "transparent",
                        color: active ? l.color : C.textMuted,
                        fontSize: "var(--sidebar-font-size)",
                        fontWeight: active ? 500 : 400,
                        borderLeft: active ? `2px solid ${l.color}` : "2px solid transparent",
                      }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                      <span className="flex-1 text-left leading-none truncate">{l.label}</span>
                      {count > 0 && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "8px", color: active ? l.color : C.textDisabled }}>{count}</span>}
                    </button>
                  )}
                  {/* Hover actions */}
                  {editingListId !== l.id && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      <button onClick={e => { e.stopPropagation(); setEditingListId(l.id); setEditListLabel(l.label); }}
                        style={{ background: "#2A2A2A", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteList(l.id); }}
                        style={{ background: "#2A2A2A", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingList && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[listy.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="Nazwa listy" value={newListLabel} onChange={e => setNewListLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addList(); if (e.key === "Escape") { setAddingList(false); setNewListLabel(""); } }}
                  onBlur={() => { if (newListLabel.trim()) addList(); else { setAddingList(false); setNewListLabel(""); } }}
                  style={{ flex: 1, background: "#1A1A1A", border: `1px solid ${C.iceBlue}55`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Tagi */}
        <div className="px-2.5 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setTagiOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: tagiOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.textMuted }}>Tagi</span>
            </button>
            {tagiOpen && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setTagSearchOpen(open => !open); setTagSearch(""); }}
                  aria-label="Szukaj tagu"
                  title="Szukaj tagu"
                  style={{ background: "none", border: "none", cursor: "pointer", color: tagSearchOpen ? C.iceBlue : C.textDisabled, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textDisabled; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingTag(true); setAddingList(false); setTagSearchOpen(false); }}
                  aria-label="Dodaj tag"
                  title="Dodaj tag"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textDisabled, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textDisabled)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {tagiOpen && <div className="space-y-px">
            {tagSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  placeholder="Szukaj tagu"
                  aria-label="Szukaj tagu"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {tagi.length === 0 && !addingTag && (
              <p style={{ fontSize: 11, color: C.textDisabled, padding: "4px 12px" }}>Brak tagów.</p>
            )}
            {tagi.length > 0 && visibleTags.length === 0 && (
              <p style={{ fontSize: 10, color: C.textDisabled, padding: "4px 12px" }}>Brak pasujących tagów.</p>
            )}
            {visibleTags.map(t => {
              const active = tagFilter === t.id;
              return (
                <div key={t.id} className="group relative">
                  {editingTagId === t.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <input autoFocus value={editTagLabel} onChange={e => setEditTagLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveTag(t.id); if (e.key === "Escape") setEditingTagId(null); }}
                        onBlur={() => saveTag(t.id)}
                        style={{ flex: 1, background: "#1A1A1A", border: `1px solid ${C.iceBlue}55`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }} />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTagFilter(active ? null : t.id); setListFilter(null); }}
                      className="sidebar-item w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[11px] transition-all"
                      style={{
                        background: active ? t.color+"14" : "transparent",
                        color: active ? t.color : C.textMuted,
                        fontSize: "var(--sidebar-font-size)",
                        fontWeight: active ? 500 : 400,
                        borderLeft: active ? `2px solid ${t.color}` : "2px solid transparent",
                      }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                      <span className="flex-1 text-left leading-none">#{t.label}</span>
                    </button>
                  )}
                  {editingTagId !== t.id && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      <button onClick={e => { e.stopPropagation(); setEditingTagId(t.id); setEditTagLabel(t.label); }}
                        style={{ background: "#2A2A2A", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteTag(t.id); }}
                        style={{ background: "#2A2A2A", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingTag && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[tagi.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="#tag" value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTagItem(); if (e.key === "Escape") { setAddingTag(false); setNewTagLabel(""); } }}
                  onBlur={() => { if (newTagLabel.trim()) addTagItem(); else { setAddingTag(false); setNewTagLabel(""); } }}
                  style={{ flex: 1, background: "#1A1A1A", border: `1px solid ${C.iceBlue}55`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="flex-1" />
        <div className="px-2.5 py-3 border-t space-y-px" style={{ borderColor: C.borderSubtle }}>
          {([
            { icon: RotateCcw, label: "Ukończone", view: "ukonczone" },
            { icon: Trash2,    label: "Kosz",      view: "kosz" },
          ] as const).map(({ icon: Icon, label, view }) => {
            const active = taskView === view && !listFilter && !tagFilter;
            return (
              <button key={label}
                onClick={() => { setTaskView(view); setListFilter(null); setTagFilter(null); }}
                className="sidebar-item w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[11px] transition-colors"
                style={{
                  color: active ? C.iceBlue : C.textDisabled,
                  fontSize: "var(--sidebar-font-size)",
                  background: active ? C.iceBlueBg : "transparent",
                  borderLeft: active ? `2px solid ${C.iceBlue}` : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.color = C.textMuted; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.textDisabled; } }}>
                <Icon size={12} strokeWidth={1.5} /><span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Summary document (replaces task list in podsumowanie mode) ── */}
      {taskView === "podsumowanie" && <SummaryDocument tasks={tasks.filter(t => !t.deleted)} listy={listy} />}

      {/* ── Task list ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{ background: C.bg, display: taskView === "podsumowanie" ? "none" : undefined }}>
        <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b" style={{ borderColor: C.borderSubtle }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[16px] font-semibold" style={{ color: C.textPrimary }}>
                {listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]}
              </h1>
              <p className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>{todayStr()}</p>
            </div>
            {pending.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-md mt-0.5" style={{ background: C.card, color: C.textMuted }}>
                {pending.length} zadań
              </span>
            )}
          </div>
          {(listFilter || tagFilter || priorityFilter) && (
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {listFilter && (
                <button onClick={() => setListFilter(null)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                  style={{ background: (listy.find(l => l.id === listFilter)?.color ?? C.iceBlue)+"18", color: listy.find(l => l.id === listFilter)?.color ?? C.iceBlue }}>
                  {listy.find(l => l.id === listFilter)?.label} <X size={9} strokeWidth={2} />
                </button>
              )}
              {tagFilter && (
                <button onClick={() => setTagFilter(null)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                  style={{ background: (tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue)+"18", color: tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue }}>
                  #{tagFilter} <X size={9} strokeWidth={2} />
                </button>
              )}
              {priorityFilter && (
                <button onClick={() => setPriorityFilter(null)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                  style={{ background: PRIORITY_COLOR[priorityFilter]+"18", color: PRIORITY_COLOR[priorityFilter] }}>
                  {priorityFilter === "high" ? "Wysoki" : priorityFilter === "medium" ? "Średni" : "Niski"} <X size={9} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-3 py-3">
          {/* Add task input */}
          <div className="task-entry mx-1 mb-3 rounded-xl transition-all duration-200"
            style={{
              background: C.inputBg,
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: "none",
            }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap">
              <Plus size={13} strokeWidth={1.75} style={{ color: inputFocused ? C.iceBlue : C.textDisabled, flexShrink: 0 }} />
              {/* Tag chips in input */}
              {newTaskTags.map(tagId => {
                const td = tagi.find(t => t.id === tagId);
                const color = td?.color ?? C.iceBlue;
                return (
                  <span key={tagId} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 20,
                    color, background: color + "1A", flexShrink: 0,
                  }}>
                    #{td?.label ?? tagId}
                    <button onMouseDown={e => { e.preventDefault(); setNewTaskTags(p => p.filter(id => id !== tagId)); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex", padding: 0 }}>
                      <X size={8} strokeWidth={2.5} />
                    </button>
                  </span>
                );
              })}
              <input
                ref={inputRef} type="text"
                placeholder={newTaskTags.length === 0 ? getPlaceholder() : "Dodaj więcej…"}
                value={newTask}
                onChange={handleTaskInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={handleTaskKeyDown}
                className="task-entry-input flex-1 bg-transparent outline-none text-[13px] min-w-0"
                style={{ color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", minWidth: 80 }}
              />

              {/* Controls */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* Flag — priority */}
                <button
                  ref={flagBtnInputRef}
                  onMouseDown={e => { e.preventDefault(); setInputDropdown(d => d === "priority" ? null : "priority"); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Priorytet"
                  style={{
                    background: flagColor ? flagColor + "18" : inputDropdown === "priority" ? "#2A2A2A" : "transparent",
                    color: flagColor ?? C.textDisabled,
                    border: `1px solid ${flagColor ? flagColor + "40" : "transparent"}`,
                  }}>
                  <Flag size={12} strokeWidth={1.5} fill={flagColor ?? "none"} />
                </button>

                {/* List */}
                <button
                  ref={listBtnInputRef}
                  onMouseDown={e => { e.preventDefault(); setInputDropdown(d => d === "list" ? null : "list"); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Lista"
                  style={{
                    background: newTaskList ? listy.find(l => l.id === newTaskList)?.color + "18" : inputDropdown === "list" ? "#2A2A2A" : "transparent",
                    color: newTaskList ? listy.find(l => l.id === newTaskList)?.color : C.textDisabled,
                    border: `1px solid ${newTaskList ? (listy.find(l => l.id === newTaskList)?.color ?? C.iceBlue) + "40" : "transparent"}`,
                  }}>
                  <List size={12} strokeWidth={1.5} />
                </button>

                {/* Hash — tags */}
                <button
                  ref={hashBtnInputRef}
                  onMouseDown={e => { e.preventDefault(); setInputDropdown(d => d === "tags" ? null : "tags"); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Tagi"
                  style={{
                    background: newTaskTags.length > 0 ? C.iceBlueBg : inputDropdown === "tags" ? "#2A2A2A" : "transparent",
                    color: newTaskTags.length > 0 ? C.iceBlue : C.textDisabled,
                    border: `1px solid ${newTaskTags.length > 0 ? "rgba(71,114,250,0.3)" : "transparent"}`,
                  }}>
                  <Hash size={12} strokeWidth={1.5} />
                </button>

                {/* Date */}
                <button
                  ref={dateButtonRef}
                  onMouseDown={e => { e.preventDefault(); setDatePickerOpen(o => !o); setInputDropdown(null); }}
                  className="flex items-center gap-1 px-1.5 h-7 rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: dateLabel ? C.iceBlueBg : "transparent",
                    color: dateLabel ? C.iceBlue : C.textDisabled,
                    border: `1px solid ${dateLabel ? "rgba(71,114,250,0.3)" : "transparent"}`,
                  }}>
                  <Calendar size={12} strokeWidth={1.5} />
                  {dateLabel && (
                    <span style={{ fontSize: "10px", fontWeight: 500 }}>{dateLabel}</span>
                  )}
                </button>

                {(newTask || newTaskTags.length > 0 || newPriority || newTaskList) && (
                  <button
                    onMouseDown={e => { e.preventDefault(); addTask(); }}
                    className="text-[10px] font-semibold px-2 h-7 rounded-md flex-shrink-0"
                    style={{ background: C.iceBlue, color: "#fff" }}>
                    ↵
                  </button>
                )}
              </div>
            </div>
          </div>

          {taskView === "ukonczone" ? (
            /* Ukończone view — flat list of all done tasks */
            <div className="space-y-px">
              {visible.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textDisabled }}>
                  <RotateCcw size={28} strokeWidth={1} />
                  <span className="text-[13px]">Brak ukończonych zadań</span>
                </div>
              )}
              {visible.map(t => (
                <TaskRow key={t.id} task={t} tagi={tagi}
                  selected={selectedId === t.id}
                  onToggle={id => updateTask(id, { done: false })}
                  onUpdate={updateTask}
                  onSelect={id => setSelectedId(selectedId === id ? null : id)} />
              ))}
            </div>
          ) : taskView === "kosz" ? (
            <div className="space-y-px">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textDisabled }}>
                  <Trash2 size={28} strokeWidth={1} />
                  <span className="text-[13px]">Kosz jest pusty</span>
                </div>
              ) : visible.map(t => (
                <TaskRow key={t.id} task={t} tagi={tagi}
                  selected={selectedId === t.id}
                  onToggle={() => {}}
                  onUpdate={updateTask}
                  onSelect={id => setSelectedId(selectedId === id ? null : id)} />
              ))}
            </div>
          ) : (
            <>
              {/* Pending tasks */}
              {pending.length > 0 && (
                <div className="space-y-px mb-2">
                  {pending.map(t => (
                    <TaskRow key={t.id} task={t} tagi={tagi}
                      selected={selectedId === t.id}
                      onToggle={id => updateTask(id, { done: true })}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                  ))}
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setShowDone(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors mb-1"
                    style={{ color: C.textDisabled }}>
                    <ChevronDown size={12} strokeWidth={1.5}
                      style={{ transform: showDone ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }} />
                    Ukończone · {completed.length}
                  </button>
                  {showDone && (
                    <div style={{ opacity: 0.5 }} className="space-y-px">
                      {completed.map(t => (
                        <TaskRow key={t.id} task={t} tagi={tagi}
                          selected={selectedId === t.id}
                          onToggle={id => updateTask(id, { done: false })}
                          onUpdate={updateTask}
                          onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {taskView !== "kosz" && pending.length === 0 && completed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textDisabled }}>
              <Circle size={28} strokeWidth={1} />
              <span className="text-[13px]">Brak zadań</span>
              <button onClick={() => inputRef.current?.focus()} className="text-[11px] mt-1" style={{ color: C.iceBlue }}>
                Dodaj pierwsze zadanie →
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Right panel ── */}
      <div className="summary-sidebar w-[288px] flex-shrink-0 border-l flex flex-col overflow-hidden"
        style={{ background: C.subSidebar, borderColor: C.borderSubtle }}>
        {selectedTask ? (
          <TaskDetail task={selectedTask} onClose={() => setSelectedId(null)} onUpdate={updateTask} onDelete={deleteTask} listy={listy} tagi={tagi} />
        ) : taskView === "podsumowanie" ? (
          <SummaryOptions />
        ) : (
          <SummaryPanel tasks={visible} habits={habits} onToggleHabit={toggleHabit} />
        )}
      </div>

      {/* ── Date picker popup (fixed) ── */}
      {datePickerOpen && dateButtonRef.current && (
        <DatePickerPopup
          value={newDateVal}
          onConfirm={v => { setNewDateVal(v); }}
          onClose={closeDatePicker}
          anchorEl={dateButtonRef.current}
        />
      )}

      {/* ── Input priority dropdown ── */}
      {inputDropdown === "priority" && flagBtnInputRef.current && (
        <InputFloatMenu anchorEl={flagBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {([
            { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
            { p: "medium" as Priority, label: "Średni", color: C.warning },
            { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
            { p: null,                 label: "Brak",   color: C.textDisabled },
          ] as const).map(({ p, label, color }) => (
            <button key={String(p)}
              onMouseDown={e => { e.preventDefault(); setNewPriority(p as Priority | null); setInputDropdown(null); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 13px", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Flag size={12} strokeWidth={1.5} fill={p ? color : "none"} style={{ color }} />
                <span style={{ fontSize: 12, color: C.textSecond }}>{label}</span>
              </div>
              {newPriority === p && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
            </button>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input list dropdown ── */}
      {inputDropdown === "list" && listBtnInputRef.current && (
        <InputFloatMenu anchorEl={listBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {[{ id: null as string | null, label: "Skrzynka zadań", color: C.textMuted }, ...listy.map(l => ({ ...l, id: l.id as string | null }))].map(l => (
            <button key={String(l.id)}
              onMouseDown={e => { e.preventDefault(); setNewTaskList(l.id); setInputDropdown(null); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 13px", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.textSecond }}>{l.label}</span>
              </div>
              {newTaskList === l.id && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
            </button>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input tags dropdown ── */}
      {inputDropdown === "tags" && hashBtnInputRef.current && (
        <InputFloatMenu anchorEl={hashBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {tagi.map(t => {
            const active = newTaskTags.includes(t.id);
            return (
              <button key={t.id}
                onMouseDown={e => { e.preventDefault(); setNewTaskTags(p => active ? p.filter(id => id !== t.id) : [...p, t.id]); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 13px", background: "none", border: "none", cursor: "pointer" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#2A2A2A")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.textSecond }}>#{t.label}</span>
                </div>
                {active && <Check size={11} strokeWidth={2.5} style={{ color: C.iceBlue }} />}
              </button>
            );
          })}
        </InputFloatMenu>
      )}
    </div>
  );
}
