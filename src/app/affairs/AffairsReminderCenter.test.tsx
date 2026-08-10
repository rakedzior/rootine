import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AffairAttentionItem } from "./affairsAttention";
import { AffairsReminderCenter } from "./AffairsReminderCenter";

const testState = vi.hoisted(() => ({
  item: null as AffairAttentionItem | null,
}));

vi.mock("../data/affairsWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/affairsWorkspace")>();
  return {
    ...actual,
    loadAffairsWorkspace: () => ({ matters: [] }),
  };
});

vi.mock("../data/localRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/localRepository")>();
  return {
    ...actual,
    subscribeToLocalWorkspace: () => () => undefined,
  };
});

vi.mock("./affairsAttention", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./affairsAttention")>();
  return {
    ...actual,
    buildAffairAttentionItems: () => testState.item ? [testState.item] : [],
  };
});

function createAttentionItem(title = "Opłać polisę", dueDate = "2026-08-10"): AffairAttentionItem {
  return {
    key: "oneTime:policy:stable",
    sourceId: "policy",
    kind: "oneTime",
    view: "oneTime",
    title,
    meta: "Płatność jednorazowa · Ubezpieczenie",
    dueDate,
    time: "",
    amount: 240,
    canSchedule: true,
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

describe("AffairsReminderCenter dismissal lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    window.localStorage.clear();
    window.sessionStorage.clear();
    installDefaultNotificationPermission();
    testState.item = createAttentionItem();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Reflect.deleteProperty(window, "Notification");
  });

  it("keeps the permission prompt dismissed across remounts in the same browser session", () => {
    const { unmount } = render(<AffairsReminderCenter />);

    fireEvent.click(screen.getByLabelText("Ukryj prośbę o włączenie powiadomień"));

    expect(window.sessionStorage.getItem("rootine.notification-permission-prompt-dismissed.v1")).toBe("1");
    expect(screen.getByText(/ukryta do końca tej sesji/, { selector: "p[role='status']" })).toBeInTheDocument();
    unmount();

    const sameSession = render(<AffairsReminderCenter />);
    expect(screen.queryByLabelText("Ukryj prośbę o włączenie powiadomień")).not.toBeInTheDocument();
    sameSession.unmount();

    window.sessionStorage.clear();
    render(<AffairsReminderCenter />);
    expect(screen.getByLabelText("Ukryj prośbę o włączenie powiadomień")).toBeInTheDocument();
  });

  it("snoozes a reminder through same-day reload and prunes it on the next local day", async () => {
    const firstMount = render(<AffairsReminderCenter />);
    await runReminderCheck();
    fireEvent.click(screen.getByLabelText("Zamknij przypomnienie: Opłać polisę"));

    expect(screen.getByText(/ukryte do jutra/, { selector: "p[role='status']" })).toBeInTheDocument();
    expect(window.localStorage.getItem("rootine.affairs-reminder-dismissals.v1")).toContain("2026-08-10");
    firstMount.unmount();

    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    const sameDayReload = render(<AffairsReminderCenter />);
    await runReminderCheck();
    expect(screen.queryByLabelText("Zamknij przypomnienie: Opłać polisę")).not.toBeInTheDocument();
    sameDayReload.unmount();

    vi.setSystemTime(new Date(2026, 7, 11, 8, 59, 50));
    testState.item = createAttentionItem("Opłać polisę", "2026-08-11");
    render(<AffairsReminderCenter />);
    await act(async () => undefined);
    expect(window.localStorage.getItem("rootine.affairs-reminder-dismissals.v1")).toBe(JSON.stringify({ version: 1, entries: [] }));
    await runReminderCheck();
    expect(screen.getByLabelText("Zamknij przypomnienie: Opłać polisę")).toBeInTheDocument();
  });

  it("shows the reminder again when its material identity changes on the same day", async () => {
    const firstMount = render(<AffairsReminderCenter />);
    await runReminderCheck();
    fireEvent.click(screen.getByLabelText("Zamknij przypomnienie: Opłać polisę"));
    firstMount.unmount();

    vi.setSystemTime(new Date(2026, 7, 10, 8, 59, 50));
    testState.item = createAttentionItem("Opłać poprawioną polisę");
    render(<AffairsReminderCenter />);
    await runReminderCheck();

    expect(screen.getByLabelText("Zamknij przypomnienie: Opłać poprawioną polisę")).toBeInTheDocument();
    expect(window.localStorage.getItem("rootine.affairs-reminder-dismissals.v1")).toBe(JSON.stringify({ version: 1, entries: [] }));
  });
});
