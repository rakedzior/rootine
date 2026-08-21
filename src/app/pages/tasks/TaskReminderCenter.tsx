import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { dueTaskReminders, type DueTaskReminder } from "../../data/taskSchedule";
import { isHabitDoneOnDate, isHabitScheduledOnDate, type WorkspaceHabit, type WorkspaceTask } from "../../data/taskWorkspace";
import { todayLocalDateKey } from "../../data/localDate";
import { getRootineStorageItem, removeRootineStorageItem, setRootineStorageItem } from "../../data/accountStorage";
import { Toast, ToastViewport } from "../../ui";
import "../../../styles/tasks.css";

type NotificationPermissionState = NotificationPermission | "unsupported";

const PERMISSION_PROMPT_DISMISS_KEY = "rootine.notification-permission-prompt-dismissed.v1";
const PERMISSION_PROMPT_DISMISS_EVENT = "rootine:notification-permission-prompt-dismissed";
const TASK_REMINDER_DISMISS_KEY = "rootine.task-reminder-dismissals.v1";
const REMINDER_DISMISS_VERSION = 1;
const MAX_REMINDER_DISMISSALS = 100;

type ReminderDismissal = {
  key: string;
  identity: string;
  day: string;
  dismissedAt: string;
};

type ReminderDismissalStore = {
  version: typeof REMINDER_DISMISS_VERSION;
  entries: ReminderDismissal[];
};

function permissionPromptWasDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PERMISSION_PROMPT_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistPermissionPromptDismissal() {
  try {
    window.sessionStorage.setItem(PERMISSION_PROMPT_DISMISS_KEY, "1");
  } catch {
    // Component state still keeps the prompt hidden for the current mount.
  }
  window.dispatchEvent(new Event(PERMISSION_PROMPT_DISMISS_EVENT));
}

function reminderIdentity(reminder: DueTaskReminder): string {
  return JSON.stringify([
    reminder.key,
    reminder.taskText,
    reminder.occurrenceDate,
    reminder.startsAt.toISOString(),
    reminder.triggersAt.toISOString(),
  ]);
}

function isReminderDismissal(value: unknown): value is ReminderDismissal {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReminderDismissal>;
  return typeof candidate.key === "string"
    && typeof candidate.identity === "string"
    && typeof candidate.day === "string"
    && typeof candidate.dismissedAt === "string";
}

function writeReminderDismissals(entries: ReminderDismissal[]) {
  const payload: ReminderDismissalStore = {
    version: REMINDER_DISMISS_VERSION,
    entries: entries.slice(-MAX_REMINDER_DISMISSALS),
  };
  try {
    setRootineStorageItem(TASK_REMINDER_DISMISS_KEY, JSON.stringify(payload));
  } catch {
    // A storage failure must not prevent dismissing the current in-app toast.
  }
}

function readReminderDismissals(day = todayLocalDateKey()): ReminderDismissal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getRootineStorageItem(TASK_REMINDER_DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ReminderDismissalStore>;
    const entries = parsed.version === REMINDER_DISMISS_VERSION && Array.isArray(parsed.entries)
      ? parsed.entries.filter(isReminderDismissal).filter((entry) => entry.day === day).slice(-MAX_REMINDER_DISMISSALS)
      : [];
    const normalized = JSON.stringify({ version: REMINDER_DISMISS_VERSION, entries });
    if (normalized !== raw) {
      try {
      setRootineStorageItem(TASK_REMINDER_DISMISS_KEY, normalized);
      } catch {
        // Keep valid current-day entries active even when pruning cannot persist.
      }
    }
    return entries;
  } catch {
    try {
      removeRootineStorageItem(TASK_REMINDER_DISMISS_KEY);
    } catch {
      // Storage is optional; malformed data is ignored in memory as well.
    }
    return [];
  }
}

function visibleUndismissedReminders(reminders: DueTaskReminder[]): DueTaskReminder[] {
  const dismissals = readReminderDismissals();
  const byKey = new Map(dismissals.map((entry) => [entry.key, entry]));
  let identityChanged = false;
  const visible = reminders.filter((reminder) => {
    const dismissed = byKey.get(reminder.key);
    if (!dismissed) return true;
    if (dismissed.identity === reminderIdentity(reminder)) return false;
    byKey.delete(reminder.key);
    identityChanged = true;
    return true;
  });
  if (identityChanged) writeReminderDismissals([...byKey.values()]);
  return visible;
}

function dismissReminderUntilTomorrow(reminder: DueTaskReminder) {
  const today = todayLocalDateKey();
  const current = readReminderDismissals(today).filter((entry) => entry.key !== reminder.key);
  writeReminderDismissals([...current, {
    key: reminder.key,
    identity: reminderIdentity(reminder),
    day: today,
    dismissedAt: new Date().toISOString(),
  }]);
}

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
  const [permissionPromptDismissed, setPermissionPromptDismissed] = useState(permissionPromptWasDismissed);
  const [announcement, setAnnouncement] = useState("");
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
      .filter((reminder) => !deliveredRef.current.has(reminderIdentity(reminder)));
    previousCheckRef.current = now;
    const visibleDue = visibleUndismissedReminders(due);
    if (!visibleDue.length) return;

    for (const reminder of visibleDue) {
      deliveredRef.current.add(reminderIdentity(reminder));
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
    setAnnouncement("");
    setReminders((current) => [
      ...current.filter((item) => !visibleDue.some((reminder) => reminder.key === item.key)),
      ...visibleDue,
    ].slice(-3));
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

  useEffect(() => {
    readReminderDismissals();
    const onPermissionPromptDismissed = () => setPermissionPromptDismissed(true);
    window.addEventListener(PERMISSION_PROMPT_DISMISS_EVENT, onPermissionPromptDismissed);
    return () => window.removeEventListener(PERMISSION_PROMPT_DISMISS_EVENT, onPermissionPromptDismissed);
  }, []);

  const requestSystemNotifications = async () => {
    if (!("Notification" in window)) return;
    try {
      const nextPermission = await window.Notification.requestPermission();
      setPermission(nextPermission);
    } catch {
      setPermission(notificationPermission());
    }
  };

  const hasVisibleStack = !(
    reminders.length === 0
    && (!hasConfiguredReminder && !hasConfiguredHabitReminder || permission !== "default" || permissionPromptDismissed)
  );
  if (!hasVisibleStack && !announcement) return null;

  return (
    <>
    {hasVisibleStack && <ToastViewport>
      {(hasConfiguredReminder || hasConfiguredHabitReminder) && permission === "default" && !permissionPromptDismissed && (
        <Toast
          durationMs={null}
          actionLabel="Włącz"
          onAction={() => void requestSystemNotifications()}
          dismissLabel="Ukryj informację o powiadomieniach"
          onDismiss={() => {
            persistPermissionPromptDismissal();
            setPermissionPromptDismissed(true);
            setAnnouncement("Prośba o włączenie powiadomień została ukryta do końca tej sesji.");
          }}
        >
          <span className="ui-toast__copy">
            <strong>Powiadomienia systemowe są wyłączone</strong>
            <span>Oba typy działają tylko przy otwartym Rootine; systemowe wymagają dodatkowo zgody.</span>
          </span>
        </Toast>
      )}
      {reminders.map((reminder) => (
        <Toast
          key={reminder.key}
          durationMs={null}
          dismissLabel={`Zamknij przypomnienie: ${reminder.taskText || "zadanie"}`}
          onDismiss={() => {
            dismissReminderUntilTomorrow(reminder);
            setReminders((current) => current.filter((item) => item.key !== reminder.key));
            setAnnouncement(`Przypomnienie „${reminder.taskText || "Zadanie"}” zostało ukryte do jutra.`);
          }}
        >
          <span className="ui-toast__copy">
            <strong><Bell size={13} aria-hidden="true" /> {reminder.taskText || "Zadanie"}</strong>
            <span>{reminderTiming(reminder)}</span>
          </span>
        </Toast>
      ))}
    </ToastViewport>}
    {announcement && <p className="ui-sr-only" role="status" aria-live="polite">{announcement}</p>}
    </>
  );
}
