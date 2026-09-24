/**
 * THESIS: Widok Dzisiaj prowadzi od jednego bilansu dnia do szczegółowych sygnałów modułów.
 * OWN-WORLD: Grafitowe powierzchnie, precyzyjny błękit dla postępu i morskie szkło dla domkniętych obszarów.
 * STORY: Użytkownik najpierw widzi liczbę pozostałych rzeczy, potem skanuje zwarte wiersze źródłowych modułów.
 * FIRST VIEWPORT: Jeden dominujący bilans dnia i pionowy rejestr modułów wymagających reakcji.
 * FORM: Operacyjny dzienny bilans — seed 55ea3e9c.
 */
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  Check,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  createEmptyTaskWorkspace,
  loadTaskWorkspace,
  saveTaskWorkspace,
  setHabitCompletionOnDate,
  setTaskDoneState,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { APP_MODULE_BY_ID } from "../moduleRegistry";
import {
  Button,
  ContentHeader,
  ModuleMain,
  ModuleShell,
} from "../ui";
import "../../styles/today.css";

type TodayTimelineItem = {
  id: string;
  kind: "task" | "habit";
  section: "overdue" | "today" | "untimed";
  time?: string;
  title: string;
  subtitle?: string;
  to: string;
  done: boolean;
  priority?: boolean;
  overdueDays?: number;
  taskId?: number;
  habitId?: number;
};

const shortLandscapeQuery = "(max-width: 900px) and (max-height: 480px) and (orientation: landscape)";

function useShortLandscape() {
  const [isShortLandscape, setIsShortLandscape] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(shortLandscapeQuery).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(shortLandscapeQuery);
    const update = () => setIsShortLandscape(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isShortLandscape;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFullDate(date: Date) {
  return capitalize(new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date));
}

function polishForm(value: number, one: string, few: string, many: string) {
  const absolute = Math.abs(value);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  return value === 1
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? few
      : many;
}

function percentage(done: number, total: number, emptyValue = 100) {
  return total > 0 ? Math.min(100, Math.round(done / total * 100)) : emptyValue;
}

function taskIsForToday(task: WorkspaceTask, todayKey: string) {
  if (task.deleted) return false;
  if (task.calendarDate) return task.calendarDate === todayKey;
  return task.view === "dzis";
}

function daysSince(dateKey: string, todayKey: string) {
  const start = new Date(`${dateKey}T12:00:00`).getTime();
  const end = new Date(`${todayKey}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function wasCompletedOnDate(timestamp: string | undefined, dateKey: string) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && toCalendarDateKey(date) === dateKey;
}

function normalizedTime(value?: string) {
  return value && /^\d{1,2}:\d{2}$/.test(value)
    ? value.padStart(5, "0")
    : undefined;
}

function formatOverdueLabel(days: number) {
  if (days === 1) return "1 dzień temu";
  return `${days} dni temu`;
}

export default function Dzisiaj() {
  const navigate = useNavigate();
  const isShortLandscape = useShortLandscape();
  const [today, setToday] = useState(() => new Date());
  const todayKey = useMemo(() => toCalendarDateKey(today), [today]);
  const [taskWorkspace, setTaskWorkspace] = useState(createEmptyTaskWorkspace);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [todayAddOpen, setTodayAddOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTaskWorkspace(loadTaskWorkspace());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeTasks = subscribeToLocalWorkspace(TASK_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
    });
    const unsubscribeTravel = subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
      setTaskWorkspace(loadTaskWorkspace());
    });
    return () => {
      unsubscribeTasks();
      unsubscribeTravel();
    };
  }, []);

  const habitsForToday = taskWorkspace.habits.filter((habit) => isHabitScheduledOnDate(habit, todayKey));
  const habitDoneToday = (habit: WorkspaceHabit) => isHabitDoneOnDate(habit, todayKey);
  const completedHabits = habitsForToday.filter(habitDoneToday).length;

  const todayTasks = useMemo(
    () => taskWorkspace.tasks.filter((task) => (
      task.source?.kind !== "work" && taskIsForToday(task, todayKey)
    )),
    [taskWorkspace.tasks, todayKey],
  );
  const completedTodayTasks = todayTasks.filter((task) => task.done).length;
  const overdueTimelineTasks = taskWorkspace.tasks.filter((task) => (
    task.source?.kind !== "work"
    && !task.deleted
    && Boolean(task.calendarDate)
    && task.calendarDate! < todayKey
    && (!task.done || wasCompletedOnDate(task.completedAt, todayKey))
  ));
  const todayTimeline = useMemo<TodayTimelineItem[]>(() => {
    const overdue = [...overdueTimelineTasks]
      .sort((left, right) => (
        left.calendarDate!.localeCompare(right.calendarDate!)
        || (normalizedTime(left.time) ?? "99:99").localeCompare(normalizedTime(right.time) ?? "99:99")
      ))
      .map((task): TodayTimelineItem => ({
        id: `overdue-task-${task.id}`,
        kind: "task",
        section: "overdue",
        time: normalizedTime(task.time),
        title: task.text,
        to: `/zadania?widok=dzis&zadanie=${task.id}`,
        done: task.done,
        priority: Boolean(task.priority),
        overdueDays: daysSince(task.calendarDate!, todayKey),
        taskId: task.id,
      }));
    const scheduledToday = [
      ...todayTasks.map((task): TodayTimelineItem => ({
        id: `today-task-${task.id}`,
        kind: "task",
        section: normalizedTime(task.time) ? "today" : "untimed",
        time: normalizedTime(task.time),
        title: task.text,
        to: `/zadania?widok=dzis&zadanie=${task.id}`,
        done: task.done,
        priority: Boolean(task.priority),
        taskId: task.id,
      })),
      ...habitsForToday.map((habit): TodayTimelineItem => ({
        id: `today-habit-${habit.id}`,
        kind: "habit",
        section: normalizedTime(habit.time) ? "today" : "untimed",
        time: normalizedTime(habit.time),
        title: habit.name,
        subtitle: "Nawyk",
        to: `${APP_MODULE_BY_ID.tasks.to}?widok=nawyki`,
        done: isHabitDoneOnDate(habit, todayKey),
        priority: Boolean(habit.priority),
        habitId: habit.id,
      })),
    ];
    return [
      ...overdue,
      ...scheduledToday.filter((item) => item.section === "today").sort((left, right) => (
        (left.time ?? "99:99").localeCompare(right.time ?? "99:99")
        || left.title.localeCompare(right.title, "pl-PL")
      )),
      ...scheduledToday.filter((item) => item.section === "untimed").sort((left, right) => (
        left.title.localeCompare(right.title, "pl-PL")
      )),
    ];
  }, [habitsForToday, overdueTimelineTasks, todayKey, todayTasks]);
  const visibleTimeline = useMemo(
    () => hideCompleted ? todayTimeline.filter((item) => !item.done) : todayTimeline,
    [hideCompleted, todayTimeline],
  );
  const completedTimelineItems = todayTimeline.filter((item) => item.done).length;
  const currentTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const nextTimelineItemId = todayTimeline.find((item) => (
    item.section === "today"
    && !item.done
    && Boolean(item.time)
    && item.time! >= currentTime
  ))?.id ?? todayTimeline.find((item) => item.section === "today" && !item.done)?.id;
  const totalDailyItems = todayTasks.length + habitsForToday.length;
  const completedDailyItems = completedTodayTasks + completedHabits;
  const priorityItems = todayTasks.filter((task) => Boolean(task.priority)).length
    + habitsForToday.filter((habit) => Boolean(habit.priority)).length;

  const dailyProgress = percentage(completedDailyItems, totalDailyItems, 0);

  const toggleTimelineItem = (item: TodayTimelineItem) => {
    if (item.kind === "task" && item.taskId !== undefined) {
      const nextWorkspace = {
        ...taskWorkspace,
        tasks: taskWorkspace.tasks.map((task) => (
          task.id === item.taskId ? setTaskDoneState(task, !task.done) : task
        )),
      };
      saveTaskWorkspace(nextWorkspace);
      setTaskWorkspace(nextWorkspace);
      return;
    }
    if (item.kind === "habit" && item.habitId !== undefined) {
      const nextWorkspace = {
        ...taskWorkspace,
        habits: taskWorkspace.habits.map((habit) => (
          habit.id === item.habitId
            ? setHabitCompletionOnDate(habit, todayKey, !habitDoneToday(habit))
            : habit
        )),
      };
      saveTaskWorkspace(nextWorkspace);
      setTaskWorkspace(nextWorkspace);
    }
  };

  return (
    <ModuleShell
      className={`today-module${isShortLandscape ? " is-short-landscape" : ""}`}
      pageWidth="standard"
    >
      <ModuleMain>
        <ContentHeader
          headingLevel={1}
          title="Dzisiaj"
          description={formatFullDate(today)}
          actions={(
            <div className="today-add-menu">
              <Button
                className="today-primary-action"
                variant="primary"
                leadingIcon={<Plus size={28} strokeWidth={1.7} aria-hidden="true" />}
                aria-label="Dodaj zadanie do dzisiejszego planu"
                aria-haspopup="menu"
                aria-expanded={todayAddOpen}
                onClick={() => setTodayAddOpen((open) => !open)}
              />
              {todayAddOpen && (
                <div className="today-add-menu__popover" role="menu" aria-label="Dodaj do dzisiejszego planu">
                  <button type="button" role="menuitem" onClick={() => navigate("/zadania?widok=dzis&akcja=nowe-zadanie")}>Zadanie</button>
                  <button type="button" role="menuitem" onClick={() => navigate("/zadania?widok=nawyki&akcja=nowy-nawyk")}>Nawyk</button>
                </div>
              )}
            </div>
          )}
        />
        <div className="today-scroll">
          <div className="today-content">
            <section className="today-overview" aria-label="Podsumowanie dnia">
              <div className="today-overview__copy">
                <span><strong>{completedDailyItems}</strong> z {totalDailyItems} wykonane</span>
                <span><strong>{priorityItems}</strong> {polishForm(priorityItems, "priorytet", "priorytety", "priorytetów")}</span>
              </div>
              <div
                className="today-overview__progress"
                role="progressbar"
                aria-label="Postęp planu dnia"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dailyProgress}
              >
                <i style={{ transform: `scaleX(${dailyProgress / 100})` }} />
              </div>
            </section>

            <section className="today-plan" aria-labelledby="today-plan-title">
              <div className="today-plan__header">
                <h2 id="today-plan-title">Plan dnia</h2>
              </div>
              {visibleTimeline.length > 0 ? (
                <ol className="today-timeline" aria-label="Oś czasu planu dnia">
                  {visibleTimeline.map((item, index) => {
                    const previous = visibleTimeline[index - 1];
                    const isNewSection = !previous || previous.section !== item.section;
                    const groupLabel = item.section === "overdue"
                      ? "Zaległości"
                      : item.section === "untimed"
                        ? "Bez godziny"
                        : "Dzisiaj";
                    const isNext = item.id === nextTimelineItemId;
                    return (
                      <li key={item.id} className={`today-timeline__item is-${item.section}`}>
                        {isNewSection && <h3 className="today-timeline__section-label">{groupLabel}</h3>}
                        <div className={`today-timeline__row${item.done ? " is-done" : ""}${isNext ? " is-next" : ""}`}>
                          <div className="today-timeline__time">
                            {item.section === "overdue" ? (
                              <span>{formatOverdueLabel(item.overdueDays ?? 1)}</span>
                            ) : item.time ? (
                              <time dateTime={`T${item.time}`}>{item.time}</time>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="today-timeline__check"
                            aria-label={`${item.done ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}: ${item.title}`}
                            aria-pressed={item.done}
                            onClick={() => toggleTimelineItem(item)}
                          >
                            {item.done && <Check size={19} strokeWidth={2.6} aria-hidden="true" />}
                          </button>
                          <Link className="today-timeline__content" to={item.to}>
                            {isNext && <span className="today-timeline__next-label">Najbliższe</span>}
                            <span className="today-timeline__title">{item.title}</span>
                            {item.subtitle && <span className="today-timeline__subtitle">{item.subtitle}</span>}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="today-plan__empty">Brak zaplanowanych elementów. Dodaj pierwsze zadanie, aby zbudować plan dnia.</p>
              )}
              {completedTimelineItems > 0 && (
                <div className="today-plan__footer">
                  <button type="button" className="today-plan__hide-completed" onClick={() => setHideCompleted((value) => !value)}>
                    {hideCompleted ? <Eye size={21} strokeWidth={1.8} aria-hidden="true" /> : <EyeOff size={21} strokeWidth={1.8} aria-hidden="true" />}
                    <span>{hideCompleted ? "Pokaż zakończone" : "Ukryj zakończone"}</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </ModuleMain>
    </ModuleShell>
  );
}
