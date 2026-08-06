import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AFFAIRS_STORAGE_KEY,
  loadAffairsWorkspace,
  type AffairsWorkspace,
} from "../data/affairsWorkspace";
import { JDG_STORAGE_KEY, loadJdgWorkspace } from "../data/jdgWorkspace";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { TRAVEL_STORAGE_KEY, loadTravelWorkspace } from "../data/travelWorkspace";
import { Button } from "../ui";
import { buildAffairAttentionItems, type AffairAttentionItem } from "./affairsAttention";
import "../../styles/affairs.css";

type NotificationPermissionState = NotificationPermission | "unsupported";

type DueAffairReminder = {
  key: string;
  title: string;
  body: string;
  triggersAt: Date;
};

function notificationPermission(): NotificationPermissionState {
  return typeof window !== "undefined" && "Notification" in window
    ? window.Notification.permission
    : "unsupported";
}

function dateOnlyReminderDays(item: AffairAttentionItem): number[] {
  if (["document", "vehicle"].includes(item.kind)) return [30, 7, 1];
  if (["oneTime", "payment", "subscription", "jdg"].includes(item.kind)) return [3, 0];
  if (item.kind === "travel") return [7, 1];
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
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission);
  const [permissionPromptDismissed, setPermissionPromptDismissed] = useState(false);
  const [reminders, setReminders] = useState<DueAffairReminder[]>([]);
  const previousCheckRef = useRef(new Date());
  const deliveredRef = useRef(new Set<string>());

  useEffect(() => subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => setAffairs(loadAffairsWorkspace())), []);
  useEffect(() => subscribeToLocalWorkspace(JDG_STORAGE_KEY, () => setJdg(loadJdgWorkspace())), []);
  useEffect(() => subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => setTravel(loadTravelWorkspace())), []);

  const attentionItems = useMemo(() => buildAffairAttentionItems(affairs, jdg, travel), [affairs, jdg, travel]);
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
      && !deliveredRef.current.has(reminder.key)
    ));
    previousCheckRef.current = now;
    if (!due.length) return;

    due.forEach((reminder) => {
      deliveredRef.current.add(reminder.key);
      if (notificationPermission() !== "granted") return;
      try {
        new window.Notification(reminder.title, { body: reminder.body, tag: reminder.key });
      } catch {
        // The in-app toast below is the reliable fallback while Rootine is open.
      }
    });
    setReminders((current) => [...current, ...due].slice(-3));
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

  const requestSystemNotifications = async () => {
    if (!("Notification" in window)) return;
    try {
      setPermission(await window.Notification.requestPermission());
    } catch {
      setPermission(notificationPermission());
    }
  };

  if (reminders.length === 0 && (!hasConfiguredReminder || permission !== "default" || permissionPromptDismissed)) return null;

  return (
    <aside className="affairs-reminder-stack" aria-label="Przypomnienia o sprawach i wizytach">
      {hasConfiguredReminder && permission === "default" && !permissionPromptDismissed && (
        <div className="affairs-reminder-toast">
          <div>
            <strong><Bell size={13} aria-hidden="true" /> Włącz powiadomienia o terminach</strong>
            <span>Powiadomienia systemowe działają przy otwartym Rootine; Przegląd pozostaje trwałym zabezpieczeniem.</span>
          </div>
          <div className="affairs-reminder-toast__actions">
            <Button size="sm" variant="quiet" onClick={requestSystemNotifications}>Włącz</Button>
            <Button size="sm" variant="ghost" iconOnly aria-label="Ukryj prośbę o włączenie powiadomień" onClick={() => setPermissionPromptDismissed(true)}><X size={13} /></Button>
          </div>
        </div>
      )}
      {reminders.map((reminder) => (
        <div key={reminder.key} className="affairs-reminder-toast" role="status">
          <div>
            <strong><Bell size={13} aria-hidden="true" /> {reminder.title}</strong>
            <span>{reminder.body}</span>
          </div>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Zamknij przypomnienie: ${reminder.title}`} onClick={() => setReminders((current) => current.filter((item) => item.key !== reminder.key))}><X size={13} /></Button>
        </div>
      ))}
    </aside>
  );
}
