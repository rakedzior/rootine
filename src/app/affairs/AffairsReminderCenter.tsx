import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AFFAIRS_STORAGE_KEY,
  loadAffairsWorkspace,
  type AffairsWorkspace,
} from "../data/affairsWorkspace";
import { JDG_STORAGE_KEY, loadJdgWorkspace } from "../data/jdgWorkspace";
import { HEALTH_STORAGE_KEY, loadHealthWorkspace } from "../data/healthWorkspace";
import { todayLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { TRAVEL_STORAGE_KEY, loadTravelWorkspace } from "../data/travelWorkspace";
import { Toast, ToastViewport } from "../ui";
import { buildAffairAttentionItems, type AffairAttentionItem } from "./affairsAttention";
import "../../styles/affairs.css";

type NotificationPermissionState = NotificationPermission | "unsupported";

type DueAffairReminder = {
  key: string;
  title: string;
  body: string;
  triggersAt: Date;
};

const PERMISSION_PROMPT_DISMISS_KEY = "rootine.notification-permission-prompt-dismissed.v1";
const PERMISSION_PROMPT_DISMISS_EVENT = "rootine:notification-permission-prompt-dismissed";
const AFFAIRS_REMINDER_DISMISS_KEY = "rootine.affairs-reminder-dismissals.v1";
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

function reminderIdentity(reminder: DueAffairReminder): string {
  return JSON.stringify([
    reminder.key,
    reminder.title,
    reminder.body,
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
    window.localStorage.setItem(AFFAIRS_REMINDER_DISMISS_KEY, JSON.stringify(payload));
  } catch {
    // A storage failure must not prevent dismissing the current in-app toast.
  }
}

function readReminderDismissals(day = todayLocalDateKey()): ReminderDismissal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AFFAIRS_REMINDER_DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ReminderDismissalStore>;
    const entries = parsed.version === REMINDER_DISMISS_VERSION && Array.isArray(parsed.entries)
      ? parsed.entries.filter(isReminderDismissal).filter((entry) => entry.day === day).slice(-MAX_REMINDER_DISMISSALS)
      : [];
    const normalized = JSON.stringify({ version: REMINDER_DISMISS_VERSION, entries });
    if (normalized !== raw) {
      try {
        window.localStorage.setItem(AFFAIRS_REMINDER_DISMISS_KEY, normalized);
      } catch {
        // Keep valid current-day entries active even when pruning cannot persist.
      }
    }
    return entries;
  } catch {
    try {
      window.localStorage.removeItem(AFFAIRS_REMINDER_DISMISS_KEY);
    } catch {
      // Storage is optional; malformed data is ignored in memory as well.
    }
    return [];
  }
}

function visibleUndismissedReminders(reminders: DueAffairReminder[]): DueAffairReminder[] {
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

function dismissReminderUntilTomorrow(reminder: DueAffairReminder) {
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

function dateOnlyReminderDays(item: AffairAttentionItem): number[] {
  if (["document", "vehicle"].includes(item.kind)) return [30, 7, 1];
  if (["oneTime", "payment", "subscription", "jdg"].includes(item.kind)) return [3, 0];
  if (item.kind === "travel") return [7, 1];
  if (item.kind === "health") return [7, 1, 0];
  return [];
}

function appointmentReminders(workspace: AffairsWorkspace): DueAffairReminder[] {
  return workspace.matters.flatMap((matter) => {
    if (matter.status === "done" || matter.kind !== "appointment" || !matter.dueDate || !matter.time) return [];
    const startsAt = new Date(`${matter.dueDate}T${matter.time}:00`);
    if (Number.isNaN(startsAt.getTime())) return [];
    return (matter.reminderMinutes ?? []).map((minutes) => ({
      key: `appointment:${matter.id}:${matter.dueDate}:${matter.time}:${minutes}`,
      title: matter.title,
      body: minutes === 1_440
        ? `Jutro o ${matter.time}${matter.location ? ` · ${matter.location}` : ""}`
        : minutes === 120
          ? `Za 2 godziny${matter.location ? ` · ${matter.location}` : ""}`
          : `Rozpoczyna się teraz${matter.location ? ` · ${matter.location}` : ""}`,
      triggersAt: new Date(startsAt.getTime() - minutes * 60_000),
    }));
  });
}

function attentionReminders(items: readonly AffairAttentionItem[]): DueAffairReminder[] {
  return items.flatMap((item) => dateOnlyReminderDays(item).map((days) => {
    const trigger = new Date(`${item.dueDate}T09:00:00`);
    trigger.setDate(trigger.getDate() - days);
    return {
      key: `attention:${item.key}:${days}`,
      title: item.title,
      body: days === 0 ? `Termin przypada dzisiaj · ${item.meta}` : `Termin za ${days} ${days === 1 ? "dzień" : "dni"} · ${item.meta}`,
      triggersAt: trigger,
    };
  }));
}

export function AffairsReminderCenter() {
  const [affairs, setAffairs] = useState(loadAffairsWorkspace);
  const [jdg, setJdg] = useState(loadJdgWorkspace);
  const [travel, setTravel] = useState(loadTravelWorkspace);
  const [health, setHealth] = useState(loadHealthWorkspace);
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission);
  const [permissionPromptDismissed, setPermissionPromptDismissed] = useState(permissionPromptWasDismissed);
  const [announcement, setAnnouncement] = useState("");
  const [reminders, setReminders] = useState<DueAffairReminder[]>([]);
  const previousCheckRef = useRef(new Date());
  const deliveredRef = useRef(new Set<string>());

  useEffect(() => subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => setAffairs(loadAffairsWorkspace())), []);
  useEffect(() => subscribeToLocalWorkspace(JDG_STORAGE_KEY, () => setJdg(loadJdgWorkspace())), []);
  useEffect(() => subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => setTravel(loadTravelWorkspace())), []);
  useEffect(() => subscribeToLocalWorkspace(HEALTH_STORAGE_KEY, () => setHealth(loadHealthWorkspace())), []);

  const attentionItems = useMemo(() => buildAffairAttentionItems(affairs, jdg, travel, new Date(), 30, health), [affairs, health, jdg, travel]);
  const candidates = useMemo(
    () => [...appointmentReminders(affairs), ...attentionReminders(attentionItems)],
    [affairs, attentionItems],
  );
  const hasConfiguredReminder = candidates.length > 0;

  const checkReminders = useCallback(() => {
    const now = new Date();
    const due = candidates.filter((reminder) => (
      reminder.triggersAt > previousCheckRef.current
      && reminder.triggersAt <= now
      && !deliveredRef.current.has(reminderIdentity(reminder))
    ));
    previousCheckRef.current = now;
    const visibleDue = visibleUndismissedReminders(due);
    if (!visibleDue.length) return;

    visibleDue.forEach((reminder) => {
      deliveredRef.current.add(reminderIdentity(reminder));
      if (notificationPermission() !== "granted") return;
      try {
        new window.Notification(reminder.title, { body: reminder.body, tag: reminder.key });
      } catch {
        // The in-app toast below is the reliable fallback while Rootine is open.
      }
    });
    setAnnouncement("");
    setReminders((current) => [
      ...current.filter((item) => !visibleDue.some((reminder) => reminder.key === item.key)),
      ...visibleDue,
    ].slice(-3));
  }, [candidates]);

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
      setPermission(await window.Notification.requestPermission());
    } catch {
      setPermission(notificationPermission());
    }
  };

  const hasVisibleStack = !(reminders.length === 0 && (!hasConfiguredReminder || permission !== "default" || permissionPromptDismissed));
  if (!hasVisibleStack && !announcement) return null;

  return (
    <>
    {hasVisibleStack && <ToastViewport>
      {hasConfiguredReminder && permission === "default" && !permissionPromptDismissed && (
        <Toast
          durationMs={null}
          actionLabel="Włącz"
          onAction={() => void requestSystemNotifications()}
          dismissLabel="Ukryj prośbę o włączenie powiadomień"
          onDismiss={() => {
            persistPermissionPromptDismissal();
            setPermissionPromptDismissed(true);
            setAnnouncement("Prośba o włączenie powiadomień została ukryta do końca tej sesji.");
          }}
        >
          <span className="ui-toast__copy">
            <strong><Bell size={13} aria-hidden="true" /> Włącz powiadomienia o terminach</strong>
            <span>Powiadomienia systemowe działają przy otwartym Rootine; Przegląd pozostaje trwałym zabezpieczeniem.</span>
          </span>
        </Toast>
      )}
      {reminders.map((reminder) => (
        <Toast
          key={reminder.key}
          durationMs={null}
          dismissLabel={`Zamknij przypomnienie: ${reminder.title}`}
          onDismiss={() => {
            dismissReminderUntilTomorrow(reminder);
            setReminders((current) => current.filter((item) => item.key !== reminder.key));
            setAnnouncement(`Przypomnienie „${reminder.title}” zostało ukryte do jutra.`);
          }}
        >
          <span className="ui-toast__copy">
            <strong><Bell size={13} aria-hidden="true" /> {reminder.title}</strong>
            <span>{reminder.body}</span>
          </span>
        </Toast>
      ))}
    </ToastViewport>}
    {announcement && <p className="ui-sr-only" role="status" aria-live="polite">{announcement}</p>}
    </>
  );
}
