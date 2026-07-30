import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { dueTaskReminders, type DueTaskReminder } from "../../data/taskSchedule";
import { isHabitDoneOnDate, isHabitScheduledOnDate, type WorkspaceHabit, type WorkspaceTask } from "../../data/taskWorkspace";
import { todayLocalDateKey } from "../../data/localDate";
import { Button } from "../../ui";
import "../../../styles/tasks.css";

type NotificationPermissionState = NotificationPermission | "unsupported";

function notificationPermission(): NotificationPermissionState {
  return typeof window !== "undefined" && "Notification" in window
    ? window.Notification.permission
    : "unsupported";
}

function reminderTiming(reminder: DueTaskReminder) {
  const minutes = Math.max(0, Math.round((reminder.startsAt.getTime() - reminder.triggersAt.getTime()) / 60_000));
  if (minutes === 0) return "Rozpoczyna się teraz";
  if (minutes === 60) return "Rozpoczyna się za godzinę";
  if (minutes === 1_440) return "Rozpoczyna się za dzień";
  return `Rozpoczyna się za ${minutes} min`;
}

function dueHabitReminders(habits: readonly WorkspaceHabit[], fromExclusive: Date, throughInclusive: Date): DueTaskReminder[] {
  const todayKey = todayLocalDateKey();
  return habits.flatMap((habit) => {
    if (!habit.time || habit.reminderMinutes === undefined || isHabitDoneOnDate(habit, todayKey) || !isHabitScheduledOnDate(habit, todayKey)) return [];
    const startsAt = new Date(`${todayKey}T${habit.time}:00`);
    if (Number.isNaN(startsAt.getTime())) return [];
    const triggersAt = new Date(startsAt.getTime() - habit.reminderMinutes * 60_000);
    if (triggersAt <= fromExclusive || triggersAt > throughInclusive) return [];
    return [{
      key: `habit:${habit.id}:${todayKey}:${habit.reminderMinutes}`,
      taskId: habit.id,
      taskText: habit.name,
      occurrenceDate: todayKey,
      startsAt,
      triggersAt,
    }];
  });
}

export function TaskReminderCenter({ tasks, habits = [] }: { tasks: readonly WorkspaceTask[]; habits?: readonly WorkspaceHabit[] }) {
  const [reminders, setReminders] = useState<DueTaskReminder[]>([]);
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission);
  const [permissionPromptDismissed, setPermissionPromptDismissed] = useState(false);
  const previousCheckRef = useRef(new Date());
  const deliveredRef = useRef(new Set<string>());
  const hasConfiguredReminder = tasks.some((task) => (
    !task.deleted
    && !task.schedule?.allDay
    && task.schedule?.reminderMinutes !== undefined
  ));
  const hasConfiguredHabitReminder = habits.some((habit) => habit.time !== undefined && habit.reminderMinutes !== undefined);

  const checkReminders = useCallback(() => {
    const now = new Date();
    const due = [...dueTaskReminders(tasks, previousCheckRef.current, now), ...dueHabitReminders(habits, previousCheckRef.current, now)]
      .filter((reminder) => !deliveredRef.current.has(reminder.key));
    previousCheckRef.current = now;
    if (!due.length) return;

    for (const reminder of due) {
      deliveredRef.current.add(reminder.key);
      if (notificationPermission() !== "granted") continue;
      try {
        new window.Notification(reminder.taskText || "Przypomnienie o zadaniu", {
          body: reminderTiming(reminder),
          tag: reminder.key,
        });
      } catch {
        // The in-app reminder below remains the reliable fallback.
      }
    }
    setReminders((current) => [...current, ...due].slice(-3));
  }, [habits, tasks]);

  useEffect(() => {
    const timer = window.setInterval(checkReminders, 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkReminders();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkReminders]);

  const requestSystemNotifications = async () => {
    if (!("Notification" in window)) return;
    try {
      const nextPermission = await window.Notification.requestPermission();
      setPermission(nextPermission);
    } catch {
      setPermission(notificationPermission());
    }
  };

  if (
    reminders.length === 0
    && (!hasConfiguredReminder && !hasConfiguredHabitReminder || permission !== "default" || permissionPromptDismissed)
  ) return null;

  return (
    <aside className="task-reminder-stack" aria-label="Przypomnienia o zadaniach">
      {(hasConfiguredReminder || hasConfiguredHabitReminder) && permission === "default" && !permissionPromptDismissed && (
        <div className="task-reminder-toast">
          <div>
            <strong>Powiadomienia systemowe są wyłączone</strong>
            <span>Oba typy działają tylko przy otwartym Rootine; systemowe wymagają dodatkowo zgody.</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="quiet" onClick={requestSystemNotifications}>
              Włącz
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Ukryj informację o powiadomieniach"
              onClick={() => setPermissionPromptDismissed(true)}
            >
              <X size={13} />
            </Button>
          </div>
        </div>
      )}
      {reminders.map((reminder) => (
        <div key={reminder.key} className="task-reminder-toast" role="status">
          <div>
            <strong><Bell size={12} aria-hidden="true" /> {reminder.taskText || "Zadanie"}</strong>
            <span>{reminderTiming(reminder)}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={`Zamknij przypomnienie: ${reminder.taskText || "zadanie"}`}
            onClick={() => setReminders((current) => current.filter((item) => item.key !== reminder.key))}
          >
            <X size={13} />
          </Button>
        </div>
      ))}
    </aside>
  );
}
