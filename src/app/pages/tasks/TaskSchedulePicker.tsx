import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Bell,
  Calendar,
  CalendarDays,
  ChevronRight,
  Clock,
  Moon,
  RotateCcw,
  Sun,
  Sunrise,
  X,
} from "lucide-react";
import {
  DatePicker,
  Select,
  Tabs,
} from "../../ui";
import { toCalendarDateKey } from "../../data/taskWorkspace";
import {
  C,
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  browserTimezone,
  type DateVal,
} from "./taskPageModel";

function CustomSelect({ value, onChange, options, placeholder = "Wybierz…", disabled = false, hint }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Select
      compact
      aria-label={placeholder}
      value={value}
      disabled={disabled}
      hint={hint}
      options={options}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

// Native time input keeps keyboard entry, validation, and the platform picker
// in one control instead of maintaining a second time-selection model.
function TimePicker({
  value,
  onChange,
  label = "Godzina",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 10px", borderRadius: "var(--radius-lg)",
      border: `1px solid ${C.borderStrong}`,
      background: C.inputBg,
    }}>
      <Clock size={13} strokeWidth={1.5} aria-hidden="true" style={{ color: C.iceBlue, flexShrink: 0 }} />
      <input
        type="time"
        step={1800}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          flex: 1, minWidth: 0, padding: "4px 6px",
          border: "none", borderRadius: 6, background: "transparent",
          color: C.iceBlue, fontSize: "13px",
          fontFamily: "'DM Mono', monospace",
        }}
      />
      {value && (
        <button
          type="button"
          aria-label={`Wyczyść: ${label.toLocaleLowerCase("pl-PL")}`}
          onClick={() => onChange("")}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 4 }}
        >
          <X size={12} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Date Picker Popup ─────────────────────────────────────
export function DatePickerPopup({
  value, onConfirm, onClose, anchorEl, placementAnchorEl, dateOnly = false,
}: {
  value: DateVal;
  onConfirm: (v: DateVal) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
  placementAnchorEl?: HTMLElement | null;
  dateOnly?: boolean;
}) {
  const [tab,     setTab]     = useState<"data" | "duracja">(!dateOnly && value.duration ? "duracja" : "data");
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [selDate,    setSelDate]    = useState<Date | null>(() => {
    if (value.date) return value.date;
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  });
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
  const [showDurRem,     setShowDurRem]     = useState(false);
  const [showDurRep,     setShowDurRep]     = useState(false);
  const scheduleError = !dateOnly && tab === "data" && selDate && !allDay && !time
    ? "Podaj godzinę zadania albo wybierz cały dzień."
    : !dateOnly && tab === "duracja" && !selDate
    ? "Wybierz datę dla przedziału czasu."
    : !dateOnly && tab === "duracja" && !allDay && (!startTime || !endTime)
      ? "Podaj godzinę rozpoczęcia i zakończenia."
      : !dateOnly && tab === "duracja" && !allDay && endTime <= startTime
        ? "Godzina zakończenia musi być późniejsza niż rozpoczęcia."
        : "";

  const popRef = useRef<HTMLDivElement>(null);
  const popWidth = 292;
  const [popupPosition, setPopupPosition] = useState({ top: 8, left: 8 });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const selected = popRef.current?.querySelector<HTMLElement>("[aria-pressed='true']");
      (selected ?? popRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const confirmAndClose = useCallback(() => {
    if (scheduleError) return;
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
    requestAnimationFrame(() => anchorEl.focus());
  }, [allDay, anchorEl, endTime, onClose, onConfirm, reminder, repeat, scheduleError, selDate, startTime, tab, time]);

  const cancelAndClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => anchorEl.focus());
  }, [anchorEl, onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const insideAnchor = anchorEl.contains(e.target as Node) || Boolean(placementAnchorEl?.contains(e.target as Node));
      if (e.target instanceof Element && e.target.closest(".ui-date-picker, .ui-select-menu")) return;
      if (popRef.current && !popRef.current.contains(e.target as Node) && !insideAnchor) {
        onClose();
        requestAnimationFrame(() => anchorEl.focus());
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      requestAnimationFrame(() => anchorEl.focus());
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose, placementAnchorEl]);

  const isSame = (d: Date | null, y: number, m: number, n: number) =>
    d ? d.getFullYear() === y && d.getMonth() === m && d.getDate() === n : false;

  const tmrw = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
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
    setStartTime("09:00"); setEndTime("10:00"); setAllDay(true);
  };

  const rowBtn = {
    width: "100%", display: "flex" as const, alignItems: "center" as const,
    gap: "10px", padding: "9px 2px", background: "none", border: "none",
    cursor: "pointer", color: C.textMuted,
  };

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-modal="false"
      aria-label="Ustaw termin zadania"
      aria-describedby={scheduleError ? "task-schedule-error" : undefined}
      tabIndex={-1}
      style={{
        position: "fixed", top: popupPosition.top, left: popupPosition.left, width: `${popWidth}px`, zIndex: 9999,
        background: C.elevated,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: C.floatingShadow,
        overflow: "hidden",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Top tabs ── */}
      {!dateOnly && (
        <Tabs
          className="task-schedule-tabs"
          ariaLabel="Sposób planowania terminu"
          activeId={tab}
          onChange={(id) => setTab(id as "data" | "duracja")}
          items={[
            { id: "data", label: "Data", panelId: "task-date-data-panel", tabId: "task-date-data-tab" },
            { id: "duracja", label: "Czas trwania", panelId: "task-date-duracja-panel", tabId: "task-date-duracja-tab" },
          ]}
        />
      )}

      {tab === "data" ? (
        <div
          id="task-date-data-panel"
          role={dateOnly ? "group" : "tabpanel"}
          aria-label={dateOnly ? "Data zadania" : undefined}
          aria-labelledby={dateOnly ? undefined : "task-date-data-tab"}
          style={{ padding: "12px" }}
        >
          {/* ── Quick shortcuts ── */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {quickDates.map(({ label, icon: Icon, date: qd }) => {
              const active = isSame(selDate, qd.getFullYear(), qd.getMonth(), qd.getDate());
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelDate(new Date(qd))}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: "5px", padding: "9px 4px", borderRadius: "var(--radius-md)",
                    background: active ? C.iceBlueBg : C.elevated,
                    color: active ? C.iceBlue : C.textMuted,
                    border: `1px solid ${active ? C.blueBorder : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span style={{ fontSize: "9px", lineHeight: 1, whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </div>

          <DatePicker
            label="Data zadania"
            value={selDate ? toCalendarDateKey(selDate) : ""}
            onChange={(dateKey) => setSelDate(dateKey ? new Date(`${dateKey}T12:00:00`) : null)}
          />

          {dateOnly ? (
            <p style={{ margin: "10px 0 0", color: C.textMuted, fontSize: 10, lineHeight: 1.45 }}>
              Godzinę, przypomnienie i powtarzanie edytuj w module źródłowym.
            </p>
          ) : (
          <>
          {/* ── Expandable rows ── */}
          {[
            {
              key: "time", label: "Czas", Icon: Clock,
              show: showTime, toggle: () => setShowTime(v => !v),
              content: <TimePicker label="Godzina zadania" value={time} onChange={v => { setTime(v); setStartTime(v); if (v) setAllDay(false); }} />,
            },
            {
              key: "reminder", label: "Przypomnienie", Icon: Bell,
              show: showRem, toggle: () => setShowRem(v => !v),
              content: (
                <CustomSelect
                  value={reminder}
                  onChange={setReminder}
                  options={REMINDER_OPTIONS}
                  placeholder="Przypomnienie"
                  disabled={allDay}
                  hint={allDay
                    ? "Przypomnienie wymaga godziny."
                    : "Rootine musi pozostać otwarte; powiadomienie systemowe wymaga dodatkowo zgody przeglądarki."}
                />
              ),
            },
            {
              key: "repeat", label: "Powtarzaj", Icon: RotateCcw,
              show: showRep, toggle: () => setShowRep(v => !v),
              content: <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} placeholder="Powtarzanie" />,
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
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => { setAllDay(v => !v); setShowTime(false); }}
              style={{ ...rowBtn, justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px" }}>Cały dzień</span>
              <span style={{
                width: "34px", height: "18px", borderRadius: "var(--radius-pill)", position: "relative", display: "block",
                background: allDay ? C.iceBlueSolid : C.elevated, transition: "background .2s",
              }}>
                <span style={{
                  position: "absolute", top: "3px", left: allDay ? "17px" : "3px", width: "12px", height: "12px",
                  borderRadius: "50%", background: C.textPrimary, transition: "left .2s",
                }} />
              </span>
            </button>
          </div>
          <p style={{ margin: "8px 0 0", color: C.textMuted, fontSize: 10 }}>
            Strefa urządzenia: <span style={{ color: C.textSecond, fontFamily: "var(--font-data)" }}>{browserTimezone()}</span>
          </p>
          </>
          )}
        </div>
      ) : (
        /* ── Czas trwania tab ── */
        <div id="task-date-duracja-panel" role="tabpanel" aria-labelledby="task-date-duracja-tab">
          {/* Cały dzień — ustawione przed godziną rozpoczęcia */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
            <span style={{ fontSize: "13px", color: C.textSecond }}>Cały dzień</span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              aria-label="Cały dzień"
              onClick={() => { setAllDay(v => !v); setOpenTimeField(null); }}
              style={{
                width: "36px", height: "20px", borderRadius: "var(--radius-pill)", border: "none",
                background: allDay ? C.iceBlueSolid : C.elevated,
                cursor: "pointer", position: "relative" as const, transition: "background .2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute" as const, top: "3px",
                left: allDay ? "17px" : "3px",
                width: "14px", height: "14px", borderRadius: "50%",
                background: C.textPrimary, transition: "left .2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>

          <div style={{ height: "1px", background: C.borderSubtle, margin: "2px 0" }} />

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            margin: "8px 12px 2px", padding: "8px 10px",
            borderRadius: 8, background: C.inputBg, border: `1px solid ${C.borderSubtle}`,
          }}>
            <Calendar size={13} aria-hidden="true" style={{ color: C.iceBlue, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: C.textSecond }}>
              {selDate
                ? selDate.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })
                : "Nie wybrano daty"}
            </span>
            <span style={{ fontSize: 10, color: C.textMuted }}>ten sam dzień</span>
          </div>

          {/* Rozpocznij / Koniec rows */}
          {([
            { label: "Rozpocznij", timeVal: startTime, field: "start" as const },
            { label: "Koniec", timeVal: endTime, field: "koniec" as const },
          ]).map(({ label, timeVal, field }) => {
            const open    = openTimeField === field;
            return (
              <div key={field}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 12px" }}>
                  <span style={{ width: "68px", fontSize: "12px", color: C.textSecond, flexShrink: 0 }}>{label}</span>
                  {/* Time chip — toggles picker */}
                  <button
                    type="button"
                    disabled={allDay}
                    onClick={() => { if (!allDay) setOpenTimeField(open ? null : field); }}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: "8px", textAlign: "center" as const,
                      background: open ? C.iceBlueBg : C.inputBg,
                      border: `1px solid ${open ? C.blueBorder : C.borderSubtle}`,
                      color: open ? C.iceBlue : timeVal ? C.textPrimary : C.textMuted,
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
                      label={field === "start" ? "Godzina rozpoczęcia" : "Godzina zakończenia"}
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
            padding: "9px 12px",
          }}>
            <span style={{ fontSize: "12px", color: C.textSecond }}>{browserTimezone()}</span>
            <span style={{ fontSize: "10px", color: C.textMuted }}>strefa urządzenia</span>
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
                <CustomSelect
                  value={reminder}
                  onChange={setReminder}
                  options={REMINDER_OPTIONS}
                  placeholder="Przypomnienie"
                  disabled={allDay}
                  hint={allDay
                    ? "Przypomnienie wymaga godziny."
                    : "Rootine musi pozostać otwarte; powiadomienie systemowe wymaga dodatkowo zgody przeglądarki."}
                />
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
                <CustomSelect value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} placeholder="Powtarzanie" />
              </div>
            )}
          </div>
        </div>
      )}

      {scheduleError && (
        <p
          id="task-schedule-error"
          role="alert"
          style={{ margin: 0, padding: "8px 12px", color: C.danger, fontSize: 11, lineHeight: 1.45 }}
        >
          {scheduleError}
        </p>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: "flex", gap: "8px", padding: "10px 12px",
        borderTop: `1px solid ${C.borderSubtle}`,
      }}>
        <button type="button" onClick={handleClear} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: "transparent", border: `1px solid ${C.borderSubtle}`,
          color: C.textSecond, fontSize: "12px", fontWeight: 500, cursor: "pointer",
        }}>
          Wyczyść
        </button>
        <button type="button" onClick={cancelAndClose} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: "transparent", border: `1px solid ${C.borderSubtle}`,
          color: C.textSecond, fontSize: "12px", fontWeight: 500, cursor: "pointer",
        }}>
          Anuluj
        </button>
        <button type="button" onClick={handleOk} disabled={Boolean(scheduleError)} style={{
          flex: 1, padding: "8px", borderRadius: "8px",
          background: C.iceBlueSolid, border: "none",
          color: C.textPrimary, fontSize: "var(--text-body)", fontWeight: 600,
          cursor: scheduleError ? "not-allowed" : "pointer", opacity: scheduleError ? 0.55 : 1,
        }}>
          Zastosuj
        </button>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────
