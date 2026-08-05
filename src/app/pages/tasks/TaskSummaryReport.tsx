import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  calendarDaysBetween,
  parseLocalDateKey,
  shiftLocalDateKey,
  toLocalDateKey,
  todayLocalDateKey,
} from "../../data/localDate";
import { pluralize } from "../../formatters";
import { Badge, Button, DatePicker, EmptyState, Tabs } from "../../ui";
import { SummaryEditor } from "./SummaryEditor";
import { PL_MONTHS_SHORT, PRIORITY_COLOR, type ListItem, type Priority, type Task } from "./taskPageModel";

type RangeMode = "day" | "week" | "month" | "custom";

const RANGE_TABS = [
  { id: "day", label: "Dzień" },
  { id: "week", label: "Tydzień" },
  { id: "month", label: "Miesiąc" },
  { id: "custom", label: "Własny zakres" },
] as const;

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Wysoki",
  medium: "Średni",
  low: "Niski",
};

const WEEKDAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

/** Monday-based start of the ISO week containing `key`. */
function startOfWeek(key: string) {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  const weekday = (date.getDay() + 6) % 7;
  return shiftLocalDateKey(key, -weekday);
}

function startOfMonth(key: string) {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(key: string) {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function formatDay(key: string) {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  return `${date.getDate()} ${PL_MONTHS_SHORT[date.getMonth()]}`;
}

function formatRangeLabel(mode: RangeMode, start: string, end: string) {
  const startDate = parseLocalDateKey(start);
  const endDate = parseLocalDateKey(end);
  if (!startDate || !endDate) return "";
  if (mode === "day") {
    return `${WEEKDAY_SHORT[(startDate.getDay() + 6) % 7]}, ${startDate.getDate()} ${PL_MONTHS_SHORT[startDate.getMonth()]} ${startDate.getFullYear()}`;
  }
  if (mode === "month") {
    return `${PL_MONTHS_SHORT[startDate.getMonth()]} ${startDate.getFullYear()}`;
  }
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const left = `${startDate.getDate()} ${PL_MONTHS_SHORT[startDate.getMonth()]}${sameYear ? "" : ` ${startDate.getFullYear()}`}`;
  const right = `${endDate.getDate()} ${PL_MONTHS_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`;
  return `${left} – ${right}`;
}

type Bucket = { key: string; label: string; planned: number; done: number };

/**
 * Task-completion report for a chosen period.
 *
 * A task belongs to a period by its `calendarDate` — the day it is planned for. The workspace
 * stores no completion timestamp (`taskCompletion` keeps a plain id → boolean map), so the
 * report cannot claim "ukończono tego dnia" and does not pretend to: it reports how many of
 * the tasks *planned* in the period are done. Undated tasks are counted separately rather
 * than silently folded into whichever period is on screen.
 */
export function TaskSummaryReport({ tasks, listy }: { tasks: Task[]; listy: ListItem[] }) {
  const today = todayLocalDateKey();
  const [mode, setMode] = useState<RangeMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(() => shiftLocalDateKey(today, -13));
  const [customEnd, setCustomEnd] = useState(today);

  const { start, end } = useMemo(() => {
    if (mode === "day") return { start: anchor, end: anchor };
    if (mode === "week") {
      const weekStart = startOfWeek(anchor);
      return { start: weekStart, end: shiftLocalDateKey(weekStart, 6) };
    }
    if (mode === "month") return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }, [mode, anchor, customStart, customEnd]);

  const stats = useMemo(() => {
    const live = tasks.filter((task) => !task.deleted);
    const inRange = live.filter((task) => Boolean(task.calendarDate)
      && task.calendarDate! >= start
      && task.calendarDate! <= end);
    const done = inRange.filter((task) => task.done);
    const open = inRange.filter((task) => !task.done);
    const overdue = open.filter((task) => task.calendarDate! < today);
    const undated = live.filter((task) => !task.calendarDate && !task.done).length;
    /*
     * Still-open tasks dated before the range. They are not part of the period's own numbers,
     * but leaving them out entirely made the report read "brak zadań" while a pile of overdue
     * work sat one day outside the window — the exact thing the user opens this screen for.
     */
    const carried = live
      .filter((task) => !task.done && Boolean(task.calendarDate) && task.calendarDate! < start)
      .sort((left, right) => left.calendarDate!.localeCompare(right.calendarDate!));

    // `calendarDaysBetween` returns null for a malformed key; a one-day span is the safe read.
    const span = Math.max(0, calendarDaysBetween(start, end) ?? 0) + 1;
    // Above ~10 weeks a per-day axis is unreadable, so long ranges roll up to weeks.
    const groupByWeek = span > 70;
    const buckets: Bucket[] = [];
    if (groupByWeek) {
      let cursor = startOfWeek(start);
      while (cursor <= end) {
        const bucketEnd = shiftLocalDateKey(cursor, 6);
        const slice = inRange.filter((task) => task.calendarDate! >= cursor && task.calendarDate! <= bucketEnd);
        buckets.push({
          key: cursor,
          label: formatDay(cursor),
          planned: slice.length,
          done: slice.filter((task) => task.done).length,
        });
        cursor = shiftLocalDateKey(cursor, 7);
      }
    } else {
      for (let index = 0; index < span; index += 1) {
        const key = shiftLocalDateKey(start, index);
        const slice = inRange.filter((task) => task.calendarDate === key);
        const date = parseLocalDateKey(key);
        buckets.push({
          key,
          label: span <= 8 && date ? WEEKDAY_SHORT[(date.getDay() + 6) % 7] : String(date?.getDate() ?? ""),
          planned: slice.length,
          done: slice.filter((task) => task.done).length,
        });
      }
    }

    const byList = listy
      .map((list) => {
        const slice = inRange.filter((task) => task.list === list.id);
        return { id: list.id, label: list.label, color: list.color, total: slice.length, done: slice.filter((t) => t.done).length };
      })
      .filter((row) => row.total > 0)
      .sort((left, right) => right.total - left.total);

    const unlisted = inRange.filter((task) => !task.list || !listy.some((list) => list.id === task.list));
    if (unlisted.length > 0) {
      byList.push({ id: "__none", label: "Bez listy", color: "#8793A1", total: unlisted.length, done: unlisted.filter((t) => t.done).length });
    }

    const byPriority = (["high", "medium", "low"] as const)
      .map((priority) => {
        const slice = inRange.filter((task) => task.priority === priority);
        return { id: priority, label: PRIORITY_LABEL[priority], color: PRIORITY_COLOR[priority], total: slice.length, done: slice.filter((t) => t.done).length };
      })
      .filter((row) => row.total > 0);

    return {
      inRange,
      done,
      open,
      overdue,
      carried,
      undated,
      buckets,
      groupByWeek,
      byList,
      byPriority,
      rate: inRange.length > 0 ? Math.round((done.length / inRange.length) * 100) : 0,
    };
  }, [tasks, listy, start, end, today]);

  const step = (direction: 1 | -1) => {
    if (mode === "day") setAnchor((current) => shiftLocalDateKey(current, direction));
    else if (mode === "week") setAnchor((current) => shiftLocalDateKey(current, direction * 7));
    else if (mode === "month") {
      setAnchor((current) => {
        const date = parseLocalDateKey(current);
        if (!date) return current;
        return toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + direction, 1));
      });
    }
  };

  const peak = Math.max(1, ...stats.buckets.map((bucket) => bucket.planned));
  const listPeak = Math.max(1, ...stats.byList.map((row) => row.total));
  const priorityPeak = Math.max(1, ...stats.byPriority.map((row) => row.total));

  const renderRow = (task: Task) => {
    const list = listy.find((item) => item.id === task.list);
    return (
      <li key={task.id} className="task-report__row">
        <span className="task-report__row-dot" style={{ background: list?.color ?? "var(--color-text-muted)" }} aria-hidden="true" />
        <span className="task-report__row-text">{task.text}</span>
        {task.priority && (
          <span className="task-report__row-priority" style={{ color: PRIORITY_COLOR[task.priority] }}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        )}
        <time className="task-report__row-date" dateTime={task.calendarDate}>{formatDay(task.calendarDate!)}</time>
      </li>
    );
  };

  return (
    <div className="task-report">
      <div className="task-report__controls">
        <Tabs
          items={RANGE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          activeId={mode}
          onChange={(id) => setMode(id as RangeMode)}
          ariaLabel="Zakres podsumowania"
        />
        {mode === "custom" ? (
          <div className="task-report__custom">
            <DatePicker value={customStart} onChange={setCustomStart} aria-label="Początek zakresu" max={customEnd} />
            <span className="task-report__custom-dash" aria-hidden="true">–</span>
            <DatePicker value={customEnd} onChange={setCustomEnd} aria-label="Koniec zakresu" min={customStart} />
          </div>
        ) : (
          <div className="task-report__stepper">
            <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni okres" onClick={() => step(-1)}>
              <ChevronLeft size={13} />
            </Button>
            <strong>{formatRangeLabel(mode, start, end)}</strong>
            <Button variant="ghost" size="sm" iconOnly aria-label="Następny okres" onClick={() => step(1)}>
              <ChevronRight size={13} />
            </Button>
            {anchor !== today && (
              <Button variant="quiet" size="sm" onClick={() => setAnchor(today)}>Dzisiaj</Button>
            )}
          </div>
        )}
      </div>

      <div className="task-report__metrics">
        <article className="task-report__metric">
          <span>Ukończone</span>
          <strong>{stats.done.length}</strong>
          <small>{pluralize(stats.inRange.length, "zaplanowane zadanie", "zaplanowane zadania", "zaplanowanych zadań")}</small>
        </article>
        <article className="task-report__metric">
          <span>Do zrobienia</span>
          <strong>{stats.open.length}</strong>
          <small>
            {stats.overdue.length > 0
              ? `w tym ${stats.overdue.length} po terminie`
              : stats.undated > 0 ? `${stats.undated} bez terminu poza zakresem` : "wszystko na czas"}
          </small>
        </article>
        <article className={`task-report__metric ${stats.carried.length > 0 ? "is-warning" : ""}`.trim()}>
          <span>Zaległe</span>
          <strong>{stats.carried.length}</strong>
          <small>{stats.carried.length > 0 ? "sprzed tego zakresu" : "nic nie zalega"}</small>
        </article>
        <article className="task-report__metric">
          <span>Realizacja</span>
          <strong>{stats.rate}%</strong>
          <div
            className="task-report__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stats.rate}
            aria-label="Realizacja zadań w zakresie"
            style={{ "--task-report-meter": stats.rate / 100 } as CSSProperties}
          >
            <i />
          </div>
        </article>
      </div>

      {stats.carried.length > 0 && (
        <section className="task-report__panel">
          <header className="task-report__panel-head">
            <h2>Zaległe sprzed zakresu</h2>
            <Badge tone="danger">{stats.carried.length}</Badge>
          </header>
          <p className="task-report__note">
            Otwarte zadania z terminem wcześniejszym niż {formatDay(start)}. Nie wliczają się do liczb tego okresu.
          </p>
          <ul className="task-report__list">{stats.carried.map(renderRow)}</ul>
        </section>
      )}

      {stats.inRange.length === 0 ? (
        <EmptyState
          className="task-report__empty"
          title="Brak zadań w tym zakresie"
          description="Nic nie było zaplanowane na te dni. Zmień okres albo zaplanuj zadania, żeby zobaczyć rozkład."
        />
      ) : (
        <>
          <section className="task-report__panel">
            <header className="task-report__panel-head">
              <h2>{stats.groupByWeek ? "Rozkład tygodniowy" : "Rozkład dzienny"}</h2>
              <span className="task-report__legend">
                <i className="is-done" aria-hidden="true" /> ukończone
                <i className="is-planned" aria-hidden="true" /> zaplanowane
              </span>
            </header>
            <div className="task-report__chart" role="list">
              {stats.buckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="task-report__bar"
                  role="listitem"
                  aria-label={`${bucket.label}: ${bucket.done} z ${bucket.planned} ukończonych`}
                  title={`${bucket.label}: ${bucket.done}/${bucket.planned}`}
                >
                  <span className="task-report__bar-track">
                    <span className="task-report__bar-planned" style={{ height: `${(bucket.planned / peak) * 100}%` }}>
                      <span className="task-report__bar-done" style={{ height: bucket.planned > 0 ? `${(bucket.done / bucket.planned) * 100}%` : "0%" }} />
                    </span>
                  </span>
                  <span className="task-report__bar-label">{bucket.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="task-report__split">
            <section className="task-report__panel">
              <header className="task-report__panel-head"><h2>Według listy</h2></header>
              <ul className="task-report__breakdown">
                {stats.byList.map((row) => (
                  <li key={row.id}>
                    <span className="task-report__breakdown-label">
                      <i style={{ background: row.color }} aria-hidden="true" />
                      {row.label}
                    </span>
                    <span className="task-report__breakdown-track" style={{ "--task-report-bar": row.total / listPeak } as CSSProperties}>
                      <i style={{ background: row.color }} />
                    </span>
                    <span className="task-report__breakdown-value">{row.done}/{row.total}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="task-report__panel">
              <header className="task-report__panel-head"><h2>Według priorytetu</h2></header>
              {stats.byPriority.length === 0 ? (
                <p className="task-report__note">Żadne zadanie w tym zakresie nie ma priorytetu.</p>
              ) : (
                <ul className="task-report__breakdown">
                  {stats.byPriority.map((row) => (
                    <li key={row.id}>
                      <span className="task-report__breakdown-label">
                        <i style={{ background: row.color }} aria-hidden="true" />
                        {row.label}
                      </span>
                      <span
                        className="task-report__breakdown-track"
                        style={{ "--task-report-bar": row.total / priorityPeak } as CSSProperties}
                      >
                        <i style={{ background: row.color }} />
                      </span>
                      <span className="task-report__breakdown-value">{row.done}/{row.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="task-report__split">
            <section className="task-report__panel">
              <header className="task-report__panel-head">
                <h2>Ukończone</h2>
                <Badge tone="success">{stats.done.length}</Badge>
              </header>
              {stats.done.length === 0
                ? <p className="task-report__note">Nic jeszcze nie zostało odhaczone w tym okresie.</p>
                : <ul className="task-report__list">{stats.done.map(renderRow)}</ul>}
            </section>
            <section className="task-report__panel">
              <header className="task-report__panel-head">
                <h2>Do zrobienia</h2>
                <Badge tone={stats.overdue.length > 0 ? "danger" : "neutral"}>{stats.open.length}</Badge>
              </header>
              {stats.open.length === 0
                ? <p className="task-report__note">Cały zakres domknięty.</p>
                : <ul className="task-report__list">{stats.open.map(renderRow)}</ul>}
            </section>
          </div>
        </>
      )}

      <section className="task-report__panel">
        <header className="task-report__panel-head">
          <h2>Notatka tygodnia</h2>
          <span className="task-report__note-hint">zapisywana dla bieżącego tygodnia, niezależnie od wybranego zakresu</span>
        </header>
        <SummaryEditor />
      </section>
    </div>
  );
}
