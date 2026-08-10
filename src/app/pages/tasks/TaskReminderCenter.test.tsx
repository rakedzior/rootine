import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DueTaskReminder } from "../../data/taskSchedule";
import type { WorkspaceTask } from "../../data/taskWorkspace";
import { TaskReminderCenter } from "./TaskReminderCenter";

const testState = vi.hoisted(() => ({
  reminder: null as DueTaskReminder | null,
}));

vi.mock("../../data/taskSchedule", () => ({
  dueTaskReminders: () => testState.reminder ? [testState.reminder] : [],
}));

const configuredTask: WorkspaceTask = {
  id: 7,
  text: "Przygotuj raport",
  done: false,
  view: "dzis",
  schedule: {
    allDay: false,
    startTime: "09:15",
    reminderMinutes: 15,
    timezone: "Europe/Warsaw",
  },
};

function createReminder(taskText = "Przygotuj raport"): DueTaskReminder {
  return {
    key: "7@2026-08-10:reminder:15",
    taskId: 7,
    taskText,
    occurrenceDate: "2026-08-10",
    startsAt: new Date(2026, 7, 10, 9, 15),
    triggersAt: new Date(2026, 7, 10, 9, 0),
  };
}

function installDefaultNotificationPermission() {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: class NotificationStub {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn(async () => "default" as NotificationPermission);
    },
  });
}

async function runReminderCheck() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
}

describe("TaskReminderCenter dismissal lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    window.localStorage.clear();
    window.sessionStorage.clear();
    installDefaultNotificationPermission();
    testState.reminder = createReminder();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Reflect.deleteProperty(window, "Notification");
  });

  it("keeps the permission prompt dismissed across remounts in the same browser session", () => {
    const { unmount } = render(<TaskReminderCenter tasks={[configuredTask]} />);

    fireEvent.click(screen.getByLabelText("Ukryj informację o powiadomieniach"));

    expect(window.sessionStorage.getItem("rootine.notification-permission-prompt-dismissed.v1")).toBe("1");
    expect(screen.getByText(/ukryta do końca tej sesji/, { selector: "p[role='status']" })).toBeInTheDocument();
    unmount();

    const sameSession = render(<TaskReminderCenter tasks={[configuredTask]} />);
    expect(screen.queryByLabelText("Ukryj informację o powiadomieniach")).not.toBeInTheDocument();
    sameSession.unmount();

    window.sessionStorage.clear();
    render(<TaskReminderCenter tasks={[configuredTask]} />);
    expect(screen.getByLabelText("Ukryj informację o powiadomieniach")).toBeInTheDocument();
  });

  it("snoozes a reminder through same-day reload and prunes it on the next local day", async () => {
    const firstMount = render(<TaskReminderCenter tasks={[configuredTask]} />);
    await runReminderCheck();
    fireEvent.click(screen.getByLabelText("Zamknij przypomnienie: Przygotuj raport"));

    expect(screen.getByText(/ukryte do jutra/, { selector: "p[role='status']" })).toBeInTheDocument();
    expect(window.localStorage.getItem("rootine.task-reminder-dismissals.v1")).toContain("2026-08-10");
    firstMount.unmount();

    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    const sameDayReload = render(<TaskReminderCenter tasks={[configuredTask]} />);
    await runReminderCheck();
    expect(screen.queryByLabelText("Zamknij przypomnienie: Przygotuj raport")).not.toBeInTheDocument();
    sameDayReload.unmount();

    vi.setSystemTime(new Date(2026, 7, 11, 8, 59, 50));
    render(<TaskReminderCenter tasks={[configuredTask]} />);
    await act(async () => undefined);
    expect(window.localStorage.getItem("rootine.task-reminder-dismissals.v1")).toBe(JSON.stringify({ version: 1, entries: [] }));
    await runReminderCheck();
    expect(screen.getByLabelText("Zamknij przypomnienie: Przygotuj raport")).toBeInTheDocument();
  });

  it("shows the reminder again when its material identity changes on the same day", async () => {
    const firstMount = render(<TaskReminderCenter tasks={[configuredTask]} />);
    await runReminderCheck();
    fireEvent.click(screen.getByLabelText("Zamknij przypomnienie: Przygotuj raport"));
    firstMount.unmount();

    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    testState.reminder = createReminder("Przygotuj poprawiony raport");
    render(<TaskReminderCenter tasks={[configuredTask]} />);
    await runReminderCheck();

    expect(screen.getByLabelText("Zamknij przypomnienie: Przygotuj poprawiony raport")).toBeInTheDocument();
    expect(window.localStorage.getItem("rootine.task-reminder-dismissals.v1")).toBe(JSON.stringify({ version: 1, entries: [] }));
  });
});
