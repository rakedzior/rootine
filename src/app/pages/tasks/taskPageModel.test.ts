import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PRIMARY_SMART_VIEWS,
  groupTasksForListView,
  isTaskUndated,
  loadTasksViewMode,
  saveTasksViewMode,
  scheduleFromDateValue,
  smartDateViewRange,
  normalizeTaskView,
  tasksForCalendarView,
  tasksForSmartDateView,
  taskViewSupportsCalendar,
  defaultDateValueForTaskView,
  loadInitialTaskPagePreferences,
  type Task,
} from "./taskPageModel";
import { toCalendarDateKey } from "../../data/taskWorkspace";

const today = "2026-08-04";
const task = (overrides: Partial<Task>): Task => ({
  id: 0,
  text: "Zadanie",
  done: false,
  view: "wszystkie",
  ...overrides,
});

describe("task presentation model", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("uses one persisted mode for list and calendar", () => {
    expect(loadTasksViewMode()).toBe("list");
    saveTasksViewMode("calendar");
    expect(loadTasksViewMode()).toBe("calendar");
    saveTasksViewMode("list");
    expect(loadTasksViewMode()).toBe("list");
  });

  it("opens the bare task route on the first subview", () => {
    saveTasksViewMode("calendar");
    window.localStorage.setItem("rootine.tasks.sidebar.v2", JSON.stringify({
      taskView: "nawyki",
      listFilter: "praca",
      tagFilter: "pilne",
      listyOpen: true,
      tagiOpen: true,
    }));

    expect(loadInitialTaskPagePreferences([], "")).toMatchObject({
      taskView: "dzis",
      listFilter: null,
      tagFilter: null,
      viewMode: "list",
    });
  });

  it("uses the active task view to choose the next task date", () => {
    const viewedToday = "2026-08-04";
    const dateKey = (view: string) => {
      const value = defaultDateValueForTaskView(view, viewedToday);
      return value.date ? toCalendarDateKey(value.date) : null;
    };

    expect(dateKey("dzis")).toBe("2026-08-04");
    expect(dateKey("jutro")).toBe("2026-08-05");
    expect(dateKey("7dni")).toBe("2026-08-11");
    expect(dateKey("30dni")).toBe("2026-09-04");
    expect(dateKey("wszystkie")).toBe("2026-08-04");
    expect(dateKey("bezterminu")).toBeNull();
  });

  it("keeps a cross-day duration and the timezone selected in the picker", () => {
    const schedule = scheduleFromDateValue({
      date: new Date("2026-08-12T12:00:00"),
      endDate: new Date("2026-08-14T12:00:00"),
      time: "",
      reminder: "30",
      repeat: "",
      startTime: "23:30",
      endTime: "01:00",
      duration: true,
      allDay: false,
      timezone: "America/New_York",
    });

    expect(schedule).toMatchObject({
      allDay: false,
      startTime: "23:30",
      endTime: "01:00",
      endDate: "2026-08-14",
      reminderMinutes: 30,
      timezone: "America/New_York",
    });
  });

  it("keeps both dates when a duration is switched to all day", () => {
    expect(scheduleFromDateValue({
      date: new Date("2026-08-12T12:00:00"),
      endDate: new Date("2026-08-13T12:00:00"),
      time: "",
      reminder: "",
      repeat: "",
      startTime: "",
      endTime: "",
      duration: true,
      allDay: true,
      timezone: "Europe/Warsaw",
    })).toMatchObject({
      allDay: true,
      startTime: "",
      endDate: "2026-08-13",
      timezone: "Europe/Warsaw",
    });
  });

  it("keeps the requested primary navigation order and migrates the old inbox id", () => {
    expect(PRIMARY_SMART_VIEWS.map((view) => view.id)).toEqual([
      "dzis",
      "jutro",
      "7dni",
      "30dni",
      "bezterminu",
      "wszystkie",
    ]);
    expect(normalizeTaskView("skrzynka")).toBe("bezterminu");
  });

  it("groups dated, overdue, undated and completed tasks without empty sections", () => {
    const groups = groupTasksForListView([
      task({ id: 1, text: "Zaległe", calendarDate: "2026-08-03" }),
      task({ id: 2, text: "Dzisiaj", calendarDate: today }),
      task({ id: 3, text: "Jutro", calendarDate: "2026-08-05" }),
      task({ id: 4, text: "Bez terminu" }),
      task({ id: 5, text: "Gotowe", done: true, calendarDate: today }),
    ], today);

    expect(groups.map((group) => group.label)).toEqual([
      "Po terminie",
      "Dziś",
      "Jutro",
      "Bez terminu",
      "Ukończone",
    ]);
    expect(groups.find((group) => group.kind === "completed")?.defaultCollapsed).toBe(true);
    expect(groups.every((group) => group.tasks.length > 0)).toBe(true);
  });

  it("keeps the calendar global and excludes undated or completed tasks", () => {
    const tasks = [
      task({ id: 1, calendarDate: today }),
      task({ id: 2, calendarDate: "2026-08-05" }),
      task({ id: 3, calendarDate: "2026-08-12" }),
      task({ id: 4, calendarDate: "2026-08-03" }),
      task({ id: 5, calendarDate: "2026-08-06", done: true }),
      task({ id: 6 }),
    ];

    expect(tasksForCalendarView(tasks, "dzis", today).map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(tasksForCalendarView(tasks, "jutro", today).map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(tasksForCalendarView(tasks, "bezterminu", today).map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it("defines the 7-day and 30-day ranges from the same start date", () => {
    expect(smartDateViewRange("7dni", today)).toEqual([today, "2026-08-10"]);
    expect(smartDateViewRange("30dni", today)).toEqual([today, "2026-09-02"]);
  });

  it("keeps undated tasks out of dated smart views", () => {
    const tasks = [
      task({ id: 1, view: "7dni", calendarDate: "2026-08-06" }),
      task({ id: 2, view: "7dni" }),
      task({ id: 3, view: "bezterminu", calendarDate: "" }),
    ];

    expect(tasksForSmartDateView(tasks, "7dni", today).tasks.map((item) => item.id)).toEqual([1]);
    expect(tasks.filter(isTaskUndated).map((item) => item.id)).toEqual([2, 3]);
  });

  it("groups all open tasks into date ranges before the undated section", () => {
    const groups = groupTasksForListView([
      task({ id: 1, calendarDate: "2026-08-04" }),
      task({ id: 2, calendarDate: "2026-08-05" }),
      task({ id: 3, calendarDate: "2026-08-07" }),
      task({ id: 4, calendarDate: "2026-08-15" }),
      task({ id: 5, calendarDate: "2026-09-05" }),
      task({ id: 6 }),
    ], today);

    expect(groups.map((group) => group.label)).toEqual([
      "Dziś",
      "Jutro",
      "Następne 7 dni",
      "Następne 30 dni",
      "Później",
      "Bez terminu",
    ]);
    expect(groups.at(-1)?.kind).toBe("undated");
  });

  it("allows every main task subview to open the single global calendar", () => {
    expect(taskViewSupportsCalendar("dzis")).toBe(true);
    expect(taskViewSupportsCalendar("7dni")).toBe(true);
    expect(taskViewSupportsCalendar("30dni")).toBe(true);
    expect(taskViewSupportsCalendar("bezterminu")).toBe(true);
    expect(taskViewSupportsCalendar("nawyki")).toBe(false);
    expect(taskViewSupportsCalendar("podsumowanie")).toBe(false);
    expect(taskViewSupportsCalendar("ukonczone")).toBe(false);
    expect(taskViewSupportsCalendar("kosz")).toBe(false);
  });
});
