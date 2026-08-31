import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Plus, Check, Trash2, RotateCcw,
  ChevronDown, ChevronRight,
  CalendarDays, X, Circle,
  CornerDownLeft,
  Search,
  PenLine, Hash, List, Printer,
} from "lucide-react";
import { persistTaskCompletion } from "../data/taskCompletion";
import { shiftLocalDateKey, todayLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
  type TaskOccurrence,
} from "../data/taskSchedule";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { WORK_STORAGE_KEY } from "../data/workWorkspace";
import {
  isHabitDoneOnDate,
  isHabitScheduledOnDate,
  emptyTaskTrash,
  normalizeHabitState,
  loadTaskWorkspace,
  purgeTask,
  restoreTask,
  saveTaskWorkspace,
  setTaskDoneState,
  setHabitCompletionOnDate,
  trashTask,
  toggleHabitOnDate,
  taskViewForCalendarDate,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
} from "../data/taskWorkspace";
import {
  Badge,
  Button,
  ConfirmDialog,
  ContentHeader,
  ContextNavItem,
  ModuleSidebar,
  DetailPanel,
  EmptyState,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PropertyMenu,
  PriorityIcon,
  QuickComposer,
  SectionHeader,
  Select,
  Toast,
  ToastViewport,
} from "../ui";
import { TaskReminderCenter } from "./tasks/TaskReminderCenter";
import { recordActivity } from "../experience/activityLog";
import { TaskSummaryReport } from "./tasks/TaskSummaryReport";
import "../../styles/tasks.css";
import "../../styles/task-habits.css";
import {
  C,
  DEFAULT_DATE_VAL,
  PALETTE,
  SMART_VIEWS,
  PRIMARY_SMART_VIEWS,
  SPECIAL_SMART_VIEWS,
  VIEW_LABELS,
  VISIBLE_TAG_LIMIT,
  buildTaskPreferenceRestoreRoute,
  defaultDateValueForTaskView,
  formatOpenTaskCount,
  formatDateLabel,
  groupTasksForListView,
  initialTaskView,
  loadInitialTaskPagePreferences,
  isTaskUndated,
  saveTasksViewMode,
  saveTaskSidebarState,
  overdueRailLabel,
  scheduleFromDateValue,
  smartDateViewRange,
  taskViewSupportsCalendar,
  tasksForSmartDateView,
  todayStr,
  type DateVal,
  type Habit,
  type ListItem,
  type Priority,
  type TagItem,
  type Task,
  type TasksViewMode,
} from "./tasks/taskPageModel";
import { DatePickerPopup } from "./tasks/TaskSchedulePicker";
import { TaskDetail, TaskRow } from "./tasks/TaskViews";
import {
  HabitsWorkspace,
  HabitDetail,
  InputFloatMenu,
} from "./tasks/TaskSecondaryViews";
import type { HabitMetaDraft } from "./tasks/TaskSecondaryViews";

type TaskDetailHistoryState = {
  rootineOverlay?: "task-detail" | "habit-detail";
  rootineHabitId?: number;
};

export default function Zadania() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialWorkspace] = useState(loadTaskWorkspace);
  const [initialTaskPreferences] = useState(() => loadInitialTaskPagePreferences(initialWorkspace.tasks));
  const [tasksViewMode, setTasksViewMode] = useState<TasksViewMode>(initialTaskPreferences.viewMode);
  const workspaceRef = useRef(initialWorkspace);
  const [taskView,      setTaskView]      = useState(initialTaskPreferences.taskView);
  const [listFilter,    setListFilter]    = useState<string | null>(initialTaskPreferences.listFilter);
  const [tagFilter,     setTagFilter]     = useState<string | null>(initialTaskPreferences.tagFilter);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tasks,         setTasks]         = useState<Task[]>(initialWorkspace.tasks);
  const [habits,        setHabits]        = useState<Habit[]>(initialWorkspace.habits);
  const [listy,         setListy]         = useState<ListItem[]>(initialWorkspace.lists);
  const [tagi,          setTagi]          = useState<TagItem[]>(initialWorkspace.tags);
  const [selectedId,    setSelectedId]    = useState<number | null>(initialTaskPreferences.linkedTaskId);
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(null);
  const [taskLinkNotice, setTaskLinkNotice] = useState<string | null>(initialTaskPreferences.invalidTaskDeepLink ? "Nie znaleziono wskazanego zadania. Pokazujemy bieżącą listę zadań." : null);
  const [newTask,       setNewTask]       = useState("");
  const [habitQuickCapture, setHabitQuickCapture] = useState({ title: "", revision: 0 });
  const [newTaskTags,   setNewTaskTags]   = useState<string[]>([]);
  const [newTaskList,   setNewTaskList]   = useState<string | null>(null);
  const [newPriority,   setNewPriority]   = useState<Priority | null>(null);
  const [newDateVal,    setNewDateVal]    = useState<DateVal>(() => (
    defaultDateValueForTaskView(initialTaskView())
  ));
  const [inputDropdown, setInputDropdown] = useState<"priority" | "list" | "tags" | null>(null);
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<Record<string, boolean>>({});
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [taxonomyDelete, setTaxonomyDelete] = useState<{
    kind: "list" | "tag";
    id: string;
    label: string;
    affected: number;
  } | null>(null);
  const [purgeTaskId, setPurgeTaskId] = useState<number | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkUndo, setBulkUndo] = useState<{
    tasks: Task[];
    message: string;
    completionIds?: number[];
  } | null>(null);
  const selectionContextRef = useRef({ taskView, listFilter, tagFilter });
  const deepLinkSelectionRef = useRef(initialTaskPreferences.linkedTaskId !== null);
  const taskDeepLinkPreferencesRef = useRef(initialTaskPreferences.deepLinkPreferences);
  const setTaskSelection = useCallback((selectionId: number | null, queryTaskId: number | null = selectionId) => {
    taskDeepLinkPreferencesRef.current = null;
    deepLinkSelectionRef.current = false;
    setSelectedId(selectionId);
    if (selectionId !== null) setSelectedHabitId(null);
    setTaskLinkNotice(null);
    const url = new URL(window.location.href);
    if (queryTaskId !== null && Number.isSafeInteger(queryTaskId)) url.searchParams.set("zadanie", String(queryTaskId));
    else url.searchParams.delete("zadanie");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const openTaskSelection = useCallback((selectionId: number) => {
    taskDeepLinkPreferencesRef.current = null;
    deepLinkSelectionRef.current = false;
    setSelectedId(selectionId);
    setSelectedHabitId(null);
    setTaskLinkNotice(null);
    const url = new URL(window.location.href);
    url.searchParams.set("zadanie", String(selectionId));
    navigate(`${url.pathname}${url.search}${url.hash}`, {
      state: {
        ...(location.state && typeof location.state === "object" ? location.state : {}),
        rootineOverlay: "task-detail",
      } satisfies TaskDetailHistoryState,
    });
  }, [location.state, navigate]);

  const openHabitSelection = useCallback((habitId: number) => {
    setSelectedId(null);
    setSelectedHabitId(habitId);
    setTaskLinkNotice(null);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      state: {
        ...(location.state && typeof location.state === "object" ? location.state : {}),
        rootineOverlay: "habit-detail",
        rootineHabitId: habitId,
      } satisfies TaskDetailHistoryState,
    });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const dismissTaskSelection = useCallback(() => {
    if ((location.state as TaskDetailHistoryState | null)?.rootineOverlay === "task-detail") {
      navigate(-1);
      return;
    }
    const preferences = taskDeepLinkPreferencesRef.current;
    if (!preferences) {
      setTaskSelection(null);
      return;
    }

    taskDeepLinkPreferencesRef.current = null;
    deepLinkSelectionRef.current = false;
    setSelectedId(null);
    setTaskLinkNotice(null);
    setTaskView(preferences.taskView);
    setListFilter(preferences.listFilter);
    setTagFilter(preferences.tagFilter);
    setTasksViewMode(preferences.viewMode);
    navigate(buildTaskPreferenceRestoreRoute(window.location.href, preferences), { replace: true });
  }, [location.state, navigate, setTaskSelection]);

  const dismissHabitSelection = useCallback(() => {
    if ((location.state as TaskDetailHistoryState | null)?.rootineOverlay === "habit-detail") {
      navigate(-1);
      return;
    }
    setSelectedHabitId(null);
  }, [location.state, navigate]);

  useEffect(() => {
    const overlayState = location.state as TaskDetailHistoryState | null;
    if (overlayState?.rootineOverlay !== "habit-detail") {
      setSelectedHabitId(null);
      return;
    }
    const habitId = overlayState.rootineHabitId;
    const validHabitId = typeof habitId === "number"
      && Number.isSafeInteger(habitId)
      && habits.some((habit) => habit.id === habitId);
    setSelectedHabitId(validHabitId
      ? habitId
      : null);
  }, [habits, location.state]);

  useEffect(() => {
    const nextWorkspace = { ...workspaceRef.current, tasks, habits, lists: listy, tags: tagi };
    workspaceRef.current = nextWorkspace;
    setStorageFailed(!saveTaskWorkspace(nextWorkspace));
  }, [habits, listy, tagi, tasks]);

  useEffect(() => {
    const syncWorkspace = () => {
      const nextWorkspace = loadTaskWorkspace();
      workspaceRef.current = nextWorkspace;
      setTasks(nextWorkspace.tasks);
      setHabits(nextWorkspace.habits);
      setListy(nextWorkspace.lists);
      setTagi(nextWorkspace.tags);
      setSelectedId((current) => current !== null && (
        nextWorkspace.tasks.some((task) => task.id === current)
        || !Number.isInteger(current)
      ) ? current : null);
    };
    const unsubscribers = [
      subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(WORK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, syncWorkspace),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (tasksViewMode === "calendar" || location.pathname !== "/zadania") return;
    const url = new URL(`${location.pathname}${location.search}${location.hash}`, window.location.origin);
    if (taskView === "dzis") url.searchParams.delete("widok");
    else url.searchParams.set("widok", taskView);
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const currentHref = `${location.pathname}${location.search}${location.hash}`;
    if (nextHref !== currentHref) {
      navigate(nextHref, { replace: true, state: location.state });
    }
  }, [location.hash, location.pathname, location.search, location.state, navigate, taskView, tasksViewMode]);

  const taskRoute = (view: string, base = "/zadania") => (
    view === "dzis" ? base : `${base}?widok=${encodeURIComponent(view)}`
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const explicitListContext = url.searchParams.has("widok") || url.searchParams.has("zadanie");
    if (tasksViewMode === "calendar" && url.pathname === "/zadania" && !explicitListContext) {
      navigate(taskView === "dzis" ? "/kalendarz" : `/kalendarz?widok=${encodeURIComponent(taskView)}`, { replace: true });
    }
  }, [navigate, taskView, tasksViewMode]);

  const openTaskView = (view: string, resetFilters = true) => {
    setTaskViewWithDefault(view);
    if (resetFilters) {
      setListFilter(null);
      setTagFilter(null);
    }
    saveTaskSidebarState(resetFilters
      ? { taskView: view, listFilter: null, tagFilter: null }
      : { taskView: view });

    if (tasksViewMode === "calendar" && taskViewSupportsCalendar(view)) {
      navigate(taskRoute(view, "/kalendarz"));
    } else if (tasksViewMode === "calendar" && !taskViewSupportsCalendar(view)) {
      navigate(taskRoute(view));
    }
  };

  const openTaskFilter = (kind: "list" | "tag", id: string | null) => {
    if (!id) {
      setListFilter(null);
      setTagFilter(null);
      saveTaskSidebarState({ taskView, listFilter: null, tagFilter: null });
      if (tasksViewMode === "calendar" && taskViewSupportsCalendar(taskView)) {
        navigate(taskRoute(taskView, "/kalendarz"));
      }
      return;
    }
    const nextState = {
      taskView: "wszystkie",
      listFilter: kind === "list" ? id : null,
      tagFilter: kind === "tag" ? id : null,
    } as const;
    setTaskViewWithDefault(nextState.taskView);
    setListFilter(nextState.listFilter);
    setTagFilter(nextState.tagFilter);
    saveTaskSidebarState(nextState);
    if (tasksViewMode === "calendar") navigate(taskRoute("wszystkie", "/kalendarz"));
  };

  const switchTasksViewMode = (mode: TasksViewMode) => {
    if (mode === "calendar") {
      saveTasksViewMode("calendar");
      setTasksViewMode("calendar");
      setTaskViewWithDefault("wszystkie");
      setListFilter(null);
      setTagFilter(null);
      saveTaskSidebarState({ taskView: "wszystkie", listFilter: null, tagFilter: null });
      navigate("/kalendarz");
      return;
    }

    saveTasksViewMode(mode);
    setTasksViewMode(mode);
    saveTaskSidebarState({ taskView, listFilter, tagFilter });
    navigate(taskRoute(taskView, "/zadania"));
  };

  // Sidebar collapse state
  const [listyOpen,     setListyOpen]     = useState(initialTaskPreferences.sidebar.listyOpen);
  const [tagiOpen,      setTagiOpen]      = useState(initialTaskPreferences.sidebar.tagiOpen);
  const [showAllLists,  setShowAllLists]  = useState(false);
  const [showAllTags,   setShowAllTags]   = useState(false);

  // Sidebar CRUD state
  const [addingList,    setAddingList]    = useState(false);
  const [newListLabel,  setNewListLabel]  = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListLabel, setEditListLabel] = useState("");
  const [listSearchOpen, setListSearchOpen] = useState(false);
  const [listSearch,    setListSearch]    = useState("");
  const [listEditMode,  setListEditMode]  = useState(false);
  const [addingTag,     setAddingTag]     = useState(false);
  const [newTagLabel,   setNewTagLabel]   = useState("");
  const [editingTagId,  setEditingTagId]  = useState<string | null>(null);
  const [editTagLabel,  setEditTagLabel]  = useState("");
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagSearch,     setTagSearch]     = useState("");
  const [tagEditMode,   setTagEditMode]   = useState(false);

  useEffect(() => {
    if (listFilter) setListyOpen(true);
    if (tagFilter) setTagiOpen(true);
  }, [listFilter, tagFilter]);

  useEffect(() => {
    if (taskDeepLinkPreferencesRef.current) return;
    saveTaskSidebarState({ taskView, listFilter, tagFilter, listyOpen, tagiOpen });
  }, [listFilter, listyOpen, tagFilter, tagiOpen, taskView]);

  const inputRef        = useRef<HTMLInputElement>(null);
  const dateButtonRef   = useRef<HTMLButtonElement>(null);
  const hashBtnInputRef = useRef<HTMLButtonElement>(null);

  const setTaskViewWithDefault = useCallback((view: string) => {
    setTaskView(view);
    if (view !== taskView) setNewDateVal(defaultDateValueForTaskView(view));
  }, [taskView]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("akcja");
    if (action !== "nowe-zadanie" && action !== "nowy-nawyk") return;
    const title = url.searchParams.get("tytul") ?? "";
    if (action === "nowy-nawyk") {
      if (taskView !== "nawyki") setTaskViewWithDefault("nawyki");
      setHabitQuickCapture((current) => ({ title, revision: current.revision + 1 }));
    } else {
      if (taskView !== "dzis") setTaskViewWithDefault("dzis");
      setNewTask(title);
      const priority = url.searchParams.get("priorytet");
      setNewPriority(["low", "medium", "high"].includes(priority ?? "") ? priority as Priority : null);
      const dateKey = url.searchParams.get("data");
      const time = url.searchParams.get("godzina") ?? "";
      const parsedDate = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
      setNewDateVal(parsedDate && !Number.isNaN(parsedDate.getTime())
        ? { ...DEFAULT_DATE_VAL, date: parsedDate, time, allDay: !time }
        : defaultDateValueForTaskView("dzis"));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    url.searchParams.delete("akcja");
    url.searchParams.delete("tytul");
    url.searchParams.delete("data");
    url.searchParams.delete("godzina");
    url.searchParams.delete("priorytet");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [setTaskViewWithDefault, taskView]);

  const todayKey = todayLocalDateKey();
  const todayLongLabel = todayStr();
  const todayShortLabel = new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${todayKey}T12:00:00`));
  const taskHeaderDescription = (prefix: string) => (
    <>{prefix}<span aria-hidden="true"> · </span>
      <time dateTime={todayKey} title={todayLongLabel} aria-label={todayLongLabel}>{todayShortLabel}</time>
    </>
  );
  const smartDateTasks = useMemo(
    () => tasksForSmartDateView(tasks, taskView, todayKey),
    [taskView, tasks, todayKey],
  );
  const completedOccurrences = useMemo(() => {
    if (taskView !== "ukonczone") return [] as TaskOccurrence[];
    return tasks.flatMap((task) => (
      task.schedule?.completedDates ?? []
    ).flatMap((date) => (
      projectTaskOccurrences([task], date, date)
        .filter((occurrence) => occurrence.occurrence.virtual && occurrence.done)
    )));
  }, [taskView, tasks]);
  const visibleOccurrences = [...smartDateTasks.occurrences, ...completedOccurrences];
  const occurrenceById = new Map(visibleOccurrences.map((occurrence) => [occurrence.id, occurrence]));
  const selectedOccurrence = selectedId === null ? null : occurrenceById.get(selectedId) ?? null;
  const selectedVirtualOccurrence = selectedOccurrence?.occurrence.virtual ? selectedOccurrence : null;
  const selectedSourceId = selectedOccurrence?.occurrence.sourceTaskId ?? selectedId;
  const selectedTask = selectedSourceId === null
    ? null
    : tasks.find((task) => task.id === selectedSourceId) ?? null;
  const selectedHabit = selectedHabitId === null
    ? null
    : habits.find((habit) => habit.id === selectedHabitId) ?? null;

  useEffect(() => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("zadanie");
    if (requested === null) {
      if (deepLinkSelectionRef.current) {
        deepLinkSelectionRef.current = false;
        setSelectedId(null);
      }
      return;
    }
    const parsed = /^\d+$/.test(requested) ? Number(requested) : Number.NaN;
    const linkedTask = Number.isSafeInteger(parsed) ? tasks.find((task) => task.id === parsed) : undefined;
    if (!linkedTask) {
      deepLinkSelectionRef.current = false;
      setSelectedId(null);
      setTaskLinkNotice("Nie znaleziono wskazanego zadania. Pokazujemy bieżącą listę zadań.");
      url.searchParams.delete("zadanie");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    deepLinkSelectionRef.current = true;
    setSelectedId(linkedTask.id);
    setSelectedHabitId(null);
    setTaskLinkNotice(null);
    if (requested !== String(linkedTask.id)) {
      url.searchParams.set("zadanie", String(linkedTask.id));
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [location.search, tasks]);
  const tagUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.deleted) return counts;
    for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {});
  const listUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.deleted) return counts;
    if (task.list) counts[task.list] = (counts[task.list] ?? 0) + 1;
    return counts;
  }, {});
  const normalizedListSearch = listSearch.trim().toLowerCase();
  const visibleLists = listy
    .filter(list => !normalizedListSearch || list.label.toLowerCase().includes(normalizedListSearch))
    .sort((a, b) => (listUsage[b.id] ?? 0) - (listUsage[a.id] ?? 0))
    .slice(0, normalizedListSearch || showAllLists ? undefined : VISIBLE_TAG_LIMIT);
  const normalizedTagSearch = tagSearch.trim().toLowerCase().replace(/^#/, "");
  const visibleTags = tagi
    .filter(tag => !normalizedTagSearch || tag.label.includes(normalizedTagSearch))
    .sort((a, b) => (tagUsage[b.id] ?? 0) - (tagUsage[a.id] ?? 0))
    .slice(0, normalizedTagSearch || showAllTags ? undefined : VISIBLE_TAG_LIMIT);

  const hasSmartDateRange = smartDateViewRange(taskView, todayKey) !== null;
  const taskPool = useMemo(() => hasSmartDateRange
    ? smartDateTasks.tasks
    : taskView === "ukonczone"
      ? [...tasks, ...completedOccurrences]
      : tasks, [completedOccurrences, hasSmartDateRange, smartDateTasks.tasks, taskView, tasks]);
  const matchesTaskFilters = useCallback((task: Task) => {
    const listMatch = listFilter ? task.list === listFilter : true;
    const tagMatch  = tagFilter  ? (task.tags ?? []).includes(tagFilter) : true;
    const prioMatch = priorityFilter ? task.priority === priorityFilter : true;
    return listMatch && tagMatch && prioMatch;
  }, [listFilter, priorityFilter, tagFilter]);
  const scopedVisible = useMemo(() => taskPool.filter(t => {
    if (taskView === "kosz") return Boolean(t.deleted);
    if (t.deleted) return false;
    if (taskView === "ukonczone") return t.done;
    if (taskView === "bezterminu") return !t.done && isTaskUndated(t) && matchesTaskFilters(t);
    const viewMatch = hasSmartDateRange
      ? !isTaskUndated(t)
        : taskView === "wszystkie" || taskView === "podsumowanie" || taskView === "nawyki"
        ? true
        : t.view === taskView;
    return !t.done && viewMatch && matchesTaskFilters(t);
  }), [hasSmartDateRange, matchesTaskFilters, taskPool, taskView]);
  const visible = scopedVisible;
  const pending   = visible.filter(t => !t.done);
  const completed = visible.filter(t => t.done);
  const overdue = pending.filter(t => Boolean(t.calendarDate) && t.calendarDate! < todayKey);
  const taskGroups = useMemo(() => groupTasksForListView(visible, todayKey, taskView), [taskView, todayKey, visible]);
  const selectableVisibleIds = Array.from(new Set(
    visible
      .filter((task) => !task.done && !occurrenceById.get(task.id)?.occurrence.virtual)
      .map((task) => task.id),
  ));

  // Single source for the habit count. The sidebar badge and the view header used to derive it
  // separately, so one showed what is left and the other showed everything scheduled.
  const remainingHabitsToday = habits.filter(
    (habit) => isHabitScheduledOnDate(habit, todayKey) && !isHabitDoneOnDate(habit, todayKey),
  ).length;

  const viewCounts = Object.fromEntries(
    SMART_VIEWS.map(v => {
      const countTasks = smartDateViewRange(v.id, todayKey)
        ? tasksForSmartDateView(tasks, v.id, todayKey).tasks
        : tasks;
      return [
        v.id,
        v.id === "nawyki"
        ? remainingHabitsToday
        : v.id === "bezterminu"
          ? tasks.filter((task) => !task.deleted && !task.done && isTaskUndated(task)).length
          : countTasks.filter(t => !t.deleted && !t.done && (
            v.id === "wszystkie" || v.id === "podsumowanie" || smartDateViewRange(v.id, todayKey)
              ? true
              : t.view === v.id
          )).length,
      ];
    }),
  );

  // Hashtag parsing
  const handleTaskInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const match = v.match(/#([\p{L}\p{N}_-]+)\s$/u);
    if (match) {
      const raw = match[1].toLocaleLowerCase("pl-PL");
      if (!newTaskTags.includes(raw)) setNewTaskTags(prev => [...prev, raw]);
      setNewTask(v.replace(/#([\p{L}\p{N}_-]+)\s$/u, "").trimEnd());
    } else {
      setNewTask(v);
    }
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && newTask === "" && newTaskTags.length > 0) {
      setNewTaskTags(prev => prev.slice(0, -1));
    }
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    const id = Date.now();
    const dateLabel = formatDateLabel(newDateVal);
    const calendarDate = newDateVal.date ? toCalendarDateKey(newDateVal.date) : undefined;
    const fallbackView = calendarDate ? taskViewForCalendarDate(calendarDate) : "bezterminu";
    const task: Task = {
      id, text, done: false, view: calendarDate ? taskViewForCalendarDate(calendarDate) : fallbackView,
      tags: newTaskTags.length > 0 ? newTaskTags : undefined,
      list: newTaskList ?? undefined,
      priority: newPriority ?? undefined,
      time: newDateVal.allDay ? undefined : newDateVal.duration ? newDateVal.startTime : newDateVal.time || undefined,
      endTime: !newDateVal.allDay && newDateVal.duration ? newDateVal.endTime : undefined,
      schedule: scheduleFromDateValue(newDateVal),
      date: dateLabel || undefined,
      calendarDate,
    };
    setTagi((existing) => {
      const known = new Set(existing.map((tag) => tag.id));
      const missing = newTaskTags.filter((tag) => !known.has(tag));
      return missing.length === 0
        ? existing
        : [...existing, ...missing.map((tag, index) => ({
            id: tag,
            label: tag,
            color: PALETTE[(existing.length + index) % PALETTE.length],
          }))];
    });
    setTasks((current) => [...current, task]);
    recordActivity({
      moduleId: "tasks",
      kind: "create",
      title: task.text,
      detail: task.calendarDate ? `Zaplanowano na ${task.calendarDate}` : "Dodano zadanie",
    });
    setTaskSelection(null);
    setNewTask(""); setNewPriority(null); setNewTaskTags([]); setNewTaskList(null);
    setNewDateVal(defaultDateValueForTaskView(taskView)); setInputDropdown(null);
  };

  // List CRUD
  const addList = () => {
    const label = newListLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, "-");
    const color = PALETTE[listy.length % PALETTE.length];
    setListy(p => [...p, { id, label, color }]);
    setNewListLabel(""); setAddingList(false);
  };
  const saveList = (id: string) => {
    const label = editListLabel.trim();
    if (label) setListy(p => p.map(l => l.id === id ? { ...l, label } : l));
    setEditingListId(null);
  };
  const deleteList = (id: string) => {
    const list = listy.find((candidate) => candidate.id === id);
    if (!list) return;
    setTaxonomyDelete({ kind: "list", id, label: list.label, affected: listUsage[id] ?? 0 });
  };

  // Tag CRUD
  const addTagItem = () => {
    const label = newTagLabel.trim().toLowerCase().replace(/^#/, "");
    if (!label) return;
    const id = label.replace(/\s+/g, "-");
    const color = PALETTE[(tagi.length) % PALETTE.length];
    setTagi(p => [...p, { id, label, color }]);
    setNewTagLabel(""); setAddingTag(false);
  };
  const saveTag = (id: string) => {
    const label = editTagLabel.trim().toLowerCase();
    if (label) setTagi(p => p.map(t => t.id === id ? { ...t, label } : t));
    setEditingTagId(null);
  };
  const deleteTag = (id: string) => {
    const tag = tagi.find((candidate) => candidate.id === id);
    if (!tag) return;
    setTaxonomyDelete({ kind: "tag", id, label: `#${tag.label}`, affected: tagUsage[id] ?? 0 });
  };

  const confirmTaxonomyDelete = () => {
    if (!taxonomyDelete) return;
    if (taxonomyDelete.kind === "list") {
      setListy((current) => current.filter((list) => list.id !== taxonomyDelete.id));
      setTasks((current) => current.map((task) => task.list === taxonomyDelete.id
        ? { ...task, list: undefined }
        : task));
      if (listFilter === taxonomyDelete.id) setListFilter(null);
    } else {
      setTagi((current) => current.filter((tag) => tag.id !== taxonomyDelete.id));
      setTasks((current) => current.map((task) => (task.tags ?? []).includes(taxonomyDelete.id)
        ? { ...task, tags: task.tags?.filter((tag) => tag !== taxonomyDelete.id) }
        : task));
      if (tagFilter === taxonomyDelete.id) setTagFilter(null);
    }
    setTaxonomyDelete(null);
  };

  const updateTask = (id: number, patch: Partial<Task>) => {
    const occurrence = occurrenceById.get(id);
    const sourceId = occurrence?.occurrence.sourceTaskId ?? id;
    const completedAt = patch.done === true ? new Date().toISOString() : undefined;
    if (typeof patch.done === "boolean" && !occurrence?.occurrence.virtual) {
      persistTaskCompletion(sourceId, patch.done, completedAt);
    }
    setTasks((current) => current.map((task) => {
      if (task.id !== sourceId) return task;
      if (!occurrence?.occurrence.virtual || typeof patch.done !== "boolean") {
        const withCompletion = typeof patch.done === "boolean"
          ? setTaskDoneState(task, patch.done, completedAt)
          : task;
        return { ...withCompletion, ...patch };
      }
      const { done, ...sourcePatch } = patch;
      return {
        ...setTaskOccurrenceCompletion(task, occurrence.occurrence.date, done),
        ...sourcePatch,
      };
    }));
  };
  const workspaceWithTasks = (nextTasks: Task[]) => ({
    ...workspaceRef.current,
    tasks: nextTasks,
    habits,
    lists: listy,
    tags: tagi,
  });
  const deleteTask = (id: number) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (task) {
      recordActivity({
        moduleId: "tasks",
        kind: "delete",
        title: task.text,
        detail: "Przeniesiono do kosza",
      });
    }
    setTasks((current) => trashTask(workspaceWithTasks(current), id).tasks);
    // A deletion from the detail menu must consume that overlay history entry. Leaving its
    // `zadanie` query and `rootineOverlay` state behind made the next Trash detail's Back land
    // on a still-open, now invisible predecessor instead of returning to the archive list.
    dismissTaskSelection();
  };
  const restoreTaskFromTrash = (id: number) => {
    setTasks((current) => restoreTask(workspaceWithTasks(current), id).tasks);
    setTaskSelection(null);
  };
  const permanentlyDeleteTask = (id: number) => {
    setTasks((current) => purgeTask(workspaceWithTasks(current), id).tasks);
    setPurgeTaskId(null);
    setTaskSelection(null);
  };
  const emptyTrash = () => {
    setTasks((current) => emptyTaskTrash(workspaceWithTasks(current)).tasks);
    setEmptyTrashOpen(false);
    setTaskSelection(null);
  };
  const setHabitCompletion = (id: number, dateKey: string, done: boolean) => setHabits((current) => current.map((habit) => (
    habit.id === id ? setHabitCompletionOnDate(habit, dateKey, done) : habit
  )));
  const toggleHabit = (id: number) => {
    const today = toCalendarDateKey(new Date());
    const habit = habits.find((item) => item.id === id);
    if (habit) {
      const wasDone = isHabitDoneOnDate(habit, today);
      recordActivity({
        moduleId: "tasks",
        kind: wasDone ? "reopen" : "complete",
        title: habit.name,
        detail: wasDone ? "Cofnięto wykonanie nawyku" : "Wykonano nawyk",
      });
    }
    setHabits((current) => current.map((habit) => (
      habit.id === id ? toggleHabitOnDate(habit, today) : habit
    )));
  };
  const toggleBulkMode = () => {
    setBulkMode((current) => !current);
    setBulkSelectedIds(new Set());
    setTaskSelection(null);
  };
  const toggleBulkTask = (id: number) => setBulkSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectedBulkSourceIds = () => Array.from(new Set(Array.from(bulkSelectedIds)
    .filter((id) => !occurrenceById.get(id)?.occurrence.virtual)
    .map((id) => occurrenceById.get(id)?.occurrence.sourceTaskId ?? id)));
  const bulkTaskNoun = (count: number) => count === 1 ? "zadanie" : count < 5 ? "zadania" : "zadań";
  const finishBulkAction = (previous: Task[], message: string, completionIds?: number[]) => {
    setBulkUndo({ tasks: previous, message, completionIds });
    setBulkSelectedIds(new Set());
    setBulkMode(false);
  };
  const completeSelectedTasks = () => {
    const sourceIds = new Set(selectedBulkSourceIds());
    if (!sourceIds.size) return;
    const previous = tasks;
    const completedAt = new Date().toISOString();
    sourceIds.forEach((id) => persistTaskCompletion(id, true, completedAt));
    setTasks((current) => current.map((task) => sourceIds.has(task.id)
      ? setTaskDoneState(task, true, completedAt)
      : task));
    finishBulkAction(
      previous,
      `Ukończono ${sourceIds.size} ${bulkTaskNoun(sourceIds.size)}.`,
      Array.from(sourceIds),
    );
  };
  const moveSelectedTasksToTomorrow = () => {
    const sourceIds = new Set(selectedBulkSourceIds());
    if (!sourceIds.size) return;
    const previous = tasks;
    const tomorrow = shiftLocalDateKey(todayKey, 1);
    setTasks((current) => current.map((task) => sourceIds.has(task.id) ? {
      ...task,
      calendarDate: tomorrow,
      date: "Jutro",
      view: "jutro",
    } : task));
    finishBulkAction(previous, `Przeniesiono ${sourceIds.size} ${bulkTaskNoun(sourceIds.size)} na jutro.`);
  };
  const deleteSelectedTasks = () => {
    const sourceIds = selectedBulkSourceIds();
    if (!sourceIds.length) return;
    const previous = tasks;
    setTasks((current) => sourceIds.reduce(
      (next, id) => trashTask(workspaceWithTasks(next), id).tasks,
      current,
    ));
    finishBulkAction(previous, `Przeniesiono ${sourceIds.length} ${bulkTaskNoun(sourceIds.length)} do Kosza.`);
  };
  const undoBulkAction = () => {
    if (!bulkUndo) return;
    bulkUndo.completionIds?.forEach((id) => {
      const previousTask = bulkUndo.tasks.find((task) => task.id === id);
      if (previousTask) persistTaskCompletion(id, previousTask.done);
    });
    setTasks(bulkUndo.tasks);
    setBulkUndo(null);
  };
  const dismissBulkUndo = useCallback(() => setBulkUndo(null), []);
  const updateHabit = (id: number, patch: Partial<Habit>) => setHabits((current) => current.map((habit) => (
    habit.id === id ? normalizeHabitState({ ...habit, ...patch }) : habit
  )));
  const addHabit = (name: string, draft: HabitMetaDraft) => setHabits((current) => [
    ...current,
    normalizeHabitState({
      id: Date.now(),
      name,
      streak: 0,
      done: false,
      completedDates: [],
      schedule: draft.schedule,
      priority: draft.priority,
      time: draft.time,
      timeOfDay: draft.timeOfDay,
      reminderMinutes: draft.reminderMinutes,
    }),
  ]);
  const deleteHabit = (id: number) => {
    setHabits((current) => current.filter((habit) => habit.id !== id));
    setSelectedHabitId(null);
  };

  const rescheduleOverdue = () => {
    const ids = new Set(overdue.map(task => task.id));
    setTasks(existing => existing.map(task => ids.has(task.id)
      ? {
          ...task,
          calendarDate: todayKey,
          date: "Dziś",
          view: "dzis",
          ...(task.schedule?.recurrence
            ? { schedule: { ...task.schedule, completedDates: undefined, completedAtByDate: undefined } }
            : {}),
        }
      : task));
    setRescheduleOpen(false);
  };

  const closeDatePicker = useCallback(() => setDatePickerOpen(false), []);

  useEffect(() => {
    const previous = selectionContextRef.current;
    selectionContextRef.current = { taskView, listFilter, tagFilter };
    if (previous.taskView === taskView && previous.listFilter === listFilter && previous.tagFilter === tagFilter) return;
    setTaskSelection(null);
    setSelectedHabitId(null);
  }, [listFilter, setTaskSelection, tagFilter, taskView]);

  const getPlaceholder = () => {
    if (listFilter) return `Dodaj zadanie do "${listy.find(l => l.id === listFilter)?.label}"`;
    if (tagFilter)  return `Dodaj zadanie z #${tagFilter}`;
    return `Dodaj zadanie do "${VIEW_LABELS[taskView] ?? taskView}"`;
  };

  // Kosz and Ukończone are read-only archives. `startNewTask` already refuses to add there and
  // bounces the user to "Dziś", so offering the composer only promised something it never did.
  const canAddTaskInView = taskView !== "kosz" && taskView !== "ukonczone";

  const dateLabel = formatDateLabel(newDateVal);

  const startNewTask = () => {
    if (taskView === "podsumowanie" || taskView === "nawyki" || taskView === "ukonczone" || taskView === "kosz") {
      setTaskViewWithDefault("dzis");
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const isTaskGroupCollapsed = (groupId: string, defaultCollapsed: boolean) => (
    collapsedTaskGroups[groupId] ?? defaultCollapsed
  );

  const toggleTaskGroup = (groupId: string) => {
    setCollapsedTaskGroups((current) => ({
      ...current,
      [groupId]: !isTaskGroupCollapsed(groupId, groupId === "completed"),
    }));
  };

  const renderTaskRow = (task: Task, groupKind: "overdue" | "date" | "undated" | "completed") => (
    <TaskRow
      key={task.id}
      task={task}
      tagi={tagi}
      listy={listy}
      railLabel={groupKind === "overdue"
        ? overdueRailLabel(task.calendarDate ?? "")
        : groupKind === "undated" ? "Bez terminu" : task.time || ""}
      selected={selectedId === task.id}
      bulkMode={bulkMode}
      bulkSelected={bulkSelectedIds.has(task.id)}
      bulkDisabled={Boolean(occurrenceById.get(task.id)?.occurrence.virtual)}
      onBulkToggle={toggleBulkTask}
      onToggle={id => updateTask(id, { done: !task.done })}
      onUpdate={updateTask}
      onSelect={(id) => {
        const nextId = selectedId === id ? null : id;
        if (nextId !== null && Number.isInteger(nextId)) openTaskSelection(nextId);
        else dismissTaskSelection();
      }}
    />
  );

  return (
    <ModuleShell
      pageWidth="fluid"
      className="task-module"
    >

      {/* ── Sub-sidebar ── */}
      <ModuleSidebar label="Widoki i listy zadań" className="task-context-sidebar">

        {/* Smart views */}
        <div className="task-nav__primary-section">
          <SectionHeader title="Główne" level={2} variant="label" className="task-nav__section-heading" />
          <div className="task-nav__items">
            {PRIMARY_SMART_VIEWS.map(v => {
            const Icon = v.icon;
            const active = taskView === v.id && !listFilter && !tagFilter;
            const count = viewCounts[v.id];
            return (
              <ContextNavItem
                key={v.id}
                active={active}
                onClick={() => openTaskView(v.id)}
                icon={<Icon />}
                label={v.label}
                meta={v.id !== "podsumowanie" && count > 0 ? count : undefined}
              />
            );
            })}
          </div>
        </div>

        <div className="task-nav__divider" />

        <div className="task-nav__special-section">
          <SectionHeader title="Widoki specjalne" level={2} variant="label" className="task-nav__section-heading" />
          <div className="task-nav__items">
            {SPECIAL_SMART_VIEWS.map(v => {
              const Icon = v.icon;
              const active = taskView === v.id && !listFilter && !tagFilter;
              const count = viewCounts[v.id];
              return (
                <ContextNavItem
                  key={v.id}
                  active={active}
                  onClick={() => openTaskView(v.id)}
                  icon={<Icon />}
                  label={v.label}
                  meta={v.id !== "podsumowanie" && count > 0 ? count : undefined}
                />
              );
            })}
          </div>
        </div>

        <div className="task-nav__divider" />

        {/* Listy */}
        <div className="task-nav__taxonomy-section">
          <div className="task-nav__taxonomy-header">
            <button type="button" onClick={() => setListyOpen(v => !v)}
              aria-expanded={listyOpen}
              aria-controls="tasks-lists-panel"
              className="task-nav__group-toggle">
              <ChevronRight size={11} strokeWidth={2} className={listyOpen ? "is-open" : undefined} />
              <span className="task-nav__group-label">Listy</span>
            </button>
            <div className="task-taxonomy-header-actions">
                <button
                  type="button"
                  onClick={() => { setListyOpen(true); setListSearchOpen(open => !open); setListSearch(""); }}
                  aria-label="Szukaj listy"
                  title="Szukaj listy"
                  className={`task-nav__group-action${listSearchOpen ? " is-active" : ""}`}
                >
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => { setListyOpen(true); setListEditMode((open) => {
                    if (open) setEditingListId(null);
                    return !open;
                  }); }}
                  aria-label={listEditMode ? "Zakończ edycję list" : "Edytuj listy"}
                  aria-pressed={listEditMode}
                  title={listEditMode ? "Zakończ edycję list" : "Edytuj listy"}
                  className={`task-nav__group-action${listEditMode ? " is-active" : ""}`}>
                  <PenLine size={11} strokeWidth={1.8} />
                </button>
                <button type="button" onClick={() => { setListyOpen(true); setAddingList(true); setAddingTag(false); setListSearchOpen(false); }}
                  aria-label="Dodaj listę"
                  title="Dodaj listę"
                  className="task-nav__group-action"
                >
                  <Plus size={11} strokeWidth={2} />
                </button>
            </div>
          </div>
          {listyOpen && <div id="tasks-lists-panel" className="task-nav__items">
            {listSearchOpen && (
              <div className="task-nav__search">
                <Search size={11} strokeWidth={1.7} />
                <input
                  autoFocus
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Szukaj listy"
                  aria-label="Szukaj listy"
                  className="tag-search-input"

                />
              </div>
            )}
            {listy.length === 0 && !addingList && (
              <p className="task-nav__empty">Brak list. Kliknij + aby dodać.</p>
            )}
            {listy.length > 0 && visibleLists.length === 0 && (
              <p className="task-nav__empty">Brak pasujących list.</p>
            )}
            {visibleLists.map(l => {
              const active = listFilter === l.id;
              const count = tasks.filter(t => !t.done && t.list === l.id).length;
              return (
                <div key={l.id} className={`task-nav__taxonomy-row group${listEditMode ? " is-editing" : ""}`}>
                  {editingListId === l.id ? (
                    <div className="task-nav__edit-row">
                      <span className="task-nav__dot" style={{ background: l.color }} />
                      <input autoFocus value={editListLabel} onChange={e => setEditListLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveList(l.id); if (e.key === "Escape") setEditingListId(null); }}
                        onBlur={() => saveList(l.id)}
                        className="task-nav__edit-input" />
                    </div>
                  ) : (
                    <ContextNavItem
                      className={`task-nav__taxonomy-item${listEditMode ? " task-nav__taxonomy-item--editing" : ""}`}
                      active={active}
                      onClick={() => {
                        openTaskFilter("list", active ? null : l.id);
                      }}
                      icon={<span className={`task-nav__color-dot${active ? " is-active" : ""}`} style={{ background: l.color }} />}
                      label={l.label}
                      meta={count}
                    />
                  )}
                  {/* Hover actions */}
                  {listEditMode && editingListId !== l.id && (
                    <div className="task-taxonomy-actions">
                      <button type="button" aria-label={`Edytuj listę „${l.label}”`} onClick={e => { e.stopPropagation(); setEditingListId(l.id); setEditListLabel(l.label); }}
                        className="task-nav__row-action">
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń listę „${l.label}”`} onClick={e => { e.stopPropagation(); deleteList(l.id); }}
                        className="task-nav__row-action task-nav__row-action--danger">
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingList && (
              <div className="task-nav__edit-row">
                <span className="task-nav__dot" style={{ background: PALETTE[listy.length % PALETTE.length] }} />
                <input autoFocus placeholder="Nazwa listy" value={newListLabel} onChange={e => setNewListLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addList(); if (e.key === "Escape") { setAddingList(false); setNewListLabel(""); } }}
                  onBlur={() => { if (newListLabel.trim()) addList(); else { setAddingList(false); setNewListLabel(""); } }}
                  className="task-nav__edit-input" />
              </div>
            )}
            {!normalizedListSearch && listy.length > VISIBLE_TAG_LIMIT && (
              <button
                type="button"
                className="task-nav__show-all"
                onClick={() => setShowAllLists(open => !open)}
              >
                {showAllLists ? "Pokaż mniej" : "Pokaż wszystkie"}
              </button>
            )}
          </div>}
        </div>

        <div className="task-nav__divider" />

        {/* Tagi */}
        <div className="task-nav__taxonomy-section">
          <div className="task-nav__taxonomy-header">
            <button type="button" onClick={() => setTagiOpen(v => !v)}
              aria-expanded={tagiOpen}
              aria-controls="tasks-tags-panel"
              className="task-nav__group-toggle">
              <ChevronRight size={11} strokeWidth={2} className={tagiOpen ? "is-open" : undefined} />
              <span className="task-nav__group-label">Tagi</span>
            </button>
            <div className="task-taxonomy-header-actions">
                <button
                  type="button"
                  onClick={() => { setTagiOpen(true); setTagSearchOpen(open => !open); setTagSearch(""); }}
                  aria-label="Szukaj tagu"
                  title="Szukaj tagu"
                  className={`task-nav__group-action${tagSearchOpen ? " is-active" : ""}`}
                >
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => { setTagiOpen(true); setTagEditMode((open) => {
                    if (open) setEditingTagId(null);
                    return !open;
                  }); }}
                  aria-label={tagEditMode ? "Zakończ edycję tagów" : "Edytuj tagi"}
                  aria-pressed={tagEditMode}
                  title={tagEditMode ? "Zakończ edycję tagów" : "Edytuj tagi"}
                  className={`task-nav__group-action${tagEditMode ? " is-active" : ""}`}>
                  <PenLine size={11} strokeWidth={1.8} />
                </button>
                <button type="button" onClick={() => { setTagiOpen(true); setAddingTag(true); setAddingList(false); setTagSearchOpen(false); }}
                  aria-label="Dodaj tag"
                  title="Dodaj tag"
                  className="task-nav__group-action"
                >
                  <Plus size={11} strokeWidth={2} />
                </button>
            </div>
          </div>
          {tagiOpen && <div id="tasks-tags-panel" className="task-nav__items">
            {tagSearchOpen && (
              <div className="task-nav__search">
                <Search size={11} strokeWidth={1.7} />
                <input
                  autoFocus
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  placeholder="Szukaj tagu"
                  aria-label="Szukaj tagu"
                  className="tag-search-input"

                />
              </div>
            )}
            {tagi.length === 0 && !addingTag && (
              <p className="task-nav__empty">Brak tagów.</p>
            )}
            {tagi.length > 0 && visibleTags.length === 0 && (
              <p className="task-nav__empty">Brak pasujących tagów.</p>
            )}
            {visibleTags.map(t => {
              const active = tagFilter === t.id;
              return (
                <div key={t.id} className={`task-nav__taxonomy-row group${tagEditMode ? " is-editing" : ""}`}>
                  {editingTagId === t.id ? (
                    <div className="task-nav__edit-row">
                      <span className="task-nav__dot" style={{ background: t.color }} />
                      <input autoFocus value={editTagLabel} onChange={e => setEditTagLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveTag(t.id); if (e.key === "Escape") setEditingTagId(null); }}
                        onBlur={() => saveTag(t.id)}
                        className="task-nav__edit-input" />
                    </div>
                  ) : (
                    <ContextNavItem
                      className={`task-nav__taxonomy-item${tagEditMode ? " task-nav__taxonomy-item--editing" : ""}`}
                      active={active}
                      onClick={() => {
                        openTaskFilter("tag", active ? null : t.id);
                      }}
                      icon={<span className={`task-nav__color-dot${active ? " is-active" : ""}`} style={{ background: t.color }} />}
                      label={`#${t.label}`}
                      meta={tagUsage[t.id] ?? 0}
                    />
                  )}
                  {tagEditMode && editingTagId !== t.id && (
                    <div className="task-taxonomy-actions">
                      <button type="button" aria-label={`Edytuj tag „#${t.label}”`} onClick={e => { e.stopPropagation(); setEditingTagId(t.id); setEditTagLabel(t.label); }}
                        className="task-nav__row-action">
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń tag „#${t.label}”`} onClick={e => { e.stopPropagation(); deleteTag(t.id); }}
                        className="task-nav__row-action task-nav__row-action--danger">
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingTag && (
              <div className="task-nav__edit-row">
                <span className="task-nav__dot" style={{ background: PALETTE[tagi.length % PALETTE.length] }} />
                <input autoFocus placeholder="#tag" value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTagItem(); if (e.key === "Escape") { setAddingTag(false); setNewTagLabel(""); } }}
                  onBlur={() => { if (newTagLabel.trim()) addTagItem(); else { setAddingTag(false); setNewTagLabel(""); } }}
                  className="task-nav__edit-input" />
              </div>
            )}
            {!normalizedTagSearch && tagi.length > VISIBLE_TAG_LIMIT && (
              <button
                type="button"
                className="task-nav__show-all"
                onClick={() => setShowAllTags(open => !open)}
              >
                {showAllTags ? "Pokaż mniej" : "Pokaż wszystkie"}
              </button>
            )}
          </div>}
        </div>

        <div className="task-nav__spacer" />
        <div className="task-nav__footer">
          {([
            { icon: RotateCcw, label: "Ukończone", view: "ukonczone" },
            { icon: Trash2,    label: "Kosz",      view: "kosz" },
          ] as const).map(({ icon: Icon, label, view }) => {
            const active = taskView === view && !listFilter && !tagFilter;
            return (
              <ContextNavItem
                key={label}
                active={active}
                onClick={() => openTaskView(view)}
                icon={<Icon />}
                label={label}
              />
            );
          })}
        </div>
      </ModuleSidebar>

      {/* ── Summary document (replaces task list in podsumowanie mode) ── */}
      {taskView === "podsumowanie" && (
        <ModuleMain className="task-module-main task-summary-main">
          <ContentHeader
            headingLevel={1}
            title="Podsumowanie"
            description={taskHeaderDescription("Przegląd realizacji zadań")}
            mobileNavigation={<Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskViewWithDefault(event.target.value); setListFilter(null); setTagFilter(null); }}
            />}
          />
          <TaskSummaryReport tasks={tasks.filter(t => !t.deleted)} listy={listy} />
        </ModuleMain>
      )}

      {taskView === "nawyki" && (
        <ModuleMain className="task-module-main">
          <ContentHeader
            headingLevel={1}
            title="Nawyki"
            description={taskHeaderDescription("Codzienny rytm")}
            meta={<span>{remainingHabitsToday} do zrobienia</span>}
            mobileNavigation={<Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskViewWithDefault(event.target.value); setListFilter(null); setTagFilter(null); }}
            />}
          />
          <HabitsWorkspace
            habits={habits}
            onToggleHabit={toggleHabit}
            selectedHabitId={selectedHabitId}
            onSelectHabit={(id) => {
              if (selectedHabitId === id) dismissHabitSelection();
              else openHabitSelection(id);
            }}
            onAddHabit={addHabit}
            quickCaptureTitle={habitQuickCapture.title}
            quickCaptureRevision={habitQuickCapture.revision}
          />
        </ModuleMain>
      )}

      {/* ── Task list ── */}
      <ModuleMain
        className={`task-module-main${taskView === "podsumowanie" || taskView === "nawyki" ? " is-task-view-hidden" : ""}`}>
        <ContentHeader
          headingLevel={1}
          className="task-workspace-toolbar"
          title={listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]}
          description={taskHeaderDescription(formatOpenTaskCount(pending.length))}
          mobileNavigation={<Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskViewWithDefault(event.target.value); setListFilter(null); setTagFilter(null); }}
            />}
          meta={(storageFailed || listFilter || tagFilter) ? (
              <div className="task-header-meta">
              {storageFailed && <Badge tone="danger">Brak zapisu lokalnego</Badge>}
              {listFilter && (
                <Button variant="quiet" size="sm" onClick={() => setListFilter(null)}
                  style={{ background: (listy.find(l => l.id === listFilter)?.color ?? C.iceBlue)+"18", color: listy.find(l => l.id === listFilter)?.color ?? C.iceBlue }}>
                  {listy.find(l => l.id === listFilter)?.label} <X size={9} strokeWidth={2} />
                </Button>
              )}
              {tagFilter && (
                <Button variant="quiet" size="sm" onClick={() => setTagFilter(null)}
                  style={{ background: (tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue)+"18", color: tagi.find(t => t.id === tagFilter)?.color ?? C.iceBlue }}>
                  #{tagFilter} <X size={9} strokeWidth={2} />
                </Button>
              )}
            </div>
          ) : undefined}
          actions={<>
            {taskViewSupportsCalendar(taskView) && (
              <div className="task-list-navigation" aria-label="Szybka nawigacja zadań">
                <Button variant={taskView === "dzis" ? "quiet" : "ghost"} size="sm" onClick={() => openTaskView("dzis")}>
                  Dziś
                </Button>
                {viewCounts.bezterminu > 0 && (
                  <Button variant={taskView === "bezterminu" ? "quiet" : "ghost"} size="sm" onClick={() => openTaskView("bezterminu")}>
                    Bez terminu · {viewCounts.bezterminu}
                  </Button>
                )}
              </div>
            )}
            <div className="task-toolbar-actions">
              <div className="task-priority-filters" aria-label="Filtr priorytetu">
                {([
                  { id: "high" as Priority, label: "Wysoki", color: C.danger },
                  { id: "medium" as Priority, label: "Średni", color: C.warning },
                  { id: "low" as Priority, label: "Niski", color: C.iceBlue },
                ]).map((item) => (
                  <Button
                    key={item.id}
                    className="task-priority-filter"
                    variant="ghost"
                    size="sm"
                    aria-pressed={priorityFilter === item.id}
                    onClick={() => setPriorityFilter(priorityFilter === item.id ? null : item.id)}
                    style={{ color: priorityFilter === item.id ? item.color : C.textMuted, background: priorityFilter === item.id ? `${item.color}14` : undefined }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" iconOnly aria-label="Drukuj zadania" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={1.5} />
              </Button>
              {taskView !== "kosz" && (
                <Button
                  variant={bulkMode ? "quiet" : "ghost"}
                  size="sm"
                  aria-pressed={bulkMode}
                  onClick={toggleBulkMode}
                >
                  {bulkMode ? "Anuluj wybór" : "Wybierz"}
                </Button>
              )}
              {taskViewSupportsCalendar(taskView) && (
                <div className="ui-view-switch" role="group" aria-label="Sposób wyświetlania zadań">
                  <Button
                    variant={tasksViewMode === "list" ? "quiet" : "ghost"}
                    size="sm"
                    iconOnly
                    aria-label="Widok listy"
                    aria-pressed={tasksViewMode === "list"}
                    title="Lista"
                    onClick={() => switchTasksViewMode("list")}
                  >
                    <List size={13} strokeWidth={1.7} />
                  </Button>
                  <Button
                    variant={tasksViewMode === "calendar" ? "quiet" : "ghost"}
                    size="sm"
                    iconOnly
                    aria-label="Widok kalendarza"
                    aria-pressed={tasksViewMode === "calendar"}
                    title="Kalendarz"
                    onClick={() => switchTasksViewMode("calendar")}
                  >
                    <CalendarDays size={13} aria-hidden="true" />
                  </Button>
                </div>
              )}
              {taskView === "kosz" && visible.length > 0 ? (
                <Button variant="danger" leadingIcon={<Trash2 size={13} />} onClick={() => setEmptyTrashOpen(true)}>
                  Opróżnij kosz
                </Button>
              ) : (
                <Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={13} />} onClick={startNewTask}>
                  <span className="header-action-label">Dodaj zadanie</span>
                </Button>
              )}
            </div>
          </>}
        />

        {taskLinkNotice && (
          <p className="task-deep-link-notice" role="status">{taskLinkNotice}</p>
        )}

        {bulkMode && (
          <div className="task-bulk-bar" role="toolbar" aria-label="Operacje zbiorcze na zadaniach">
            <strong aria-live="polite">Zaznaczono: {bulkSelectedIds.size}</strong>
            <Button variant="ghost" size="sm" onClick={() => setBulkSelectedIds(new Set(selectableVisibleIds))}>
              Zaznacz widoczne
            </Button>
            <span className="task-bulk-bar__spacer" />
            <Button variant="quiet" size="sm" disabled={!bulkSelectedIds.size} onClick={completeSelectedTasks}>
              Zakończ
            </Button>
            <Button variant="ghost" size="sm" disabled={!bulkSelectedIds.size} onClick={moveSelectedTasksToTomorrow}>
              Na jutro
            </Button>
            <Button variant="danger" size="sm" disabled={!bulkSelectedIds.size} onClick={deleteSelectedTasks}>
              Usuń
            </Button>
          </div>
        )}

        {bulkUndo && (
          <ToastViewport>
            <Toast
              tone="neutral"
              actionLabel="Cofnij"
              onAction={undoBulkAction}
              onDismiss={dismissBulkUndo}
            >
              {bulkUndo.message}
            </Toast>
          </ToastViewport>
        )}

        <div className="task-content">
          <div className="task-content__inner">
          {/* Add task input */}
          {canAddTaskInView && (
          <QuickComposer
            className="task-entry"
            density="compact"
            aria-label="Dodaj zadanie"
            onSubmit={(event) => {
              event.preventDefault();
              addTask();
            }}
            leadingAction={(
              <button
                type="submit"
                className="task-entry__lead"
                aria-label="Dodaj zadanie"
              >
                <Plus size={13} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
            editor={(
              <div className="task-entry__field">
              {/* Tag chips in input */}
              {newTaskTags.map(tagId => {
                const td = tagi.find(t => t.id === tagId);
                const color = td?.color ?? C.iceBlue;
                return (
                  <span key={tagId} className="task-entry__tag" style={{ color, background: color + "1A" }}>
                    #{td?.label ?? tagId}
                    <button
                      type="button"
                      aria-label={`Usuń tag #${td?.label ?? tagId} z nowego zadania`}
                      onClick={() => setNewTaskTags(p => p.filter(id => id !== tagId))}
                    >
                      <X size={9} strokeWidth={2.5} />
                    </button>
                  </span>
                );
              })}
              <input
                ref={inputRef} type="text"
                aria-label="Nazwa nowego zadania"
                placeholder={newTaskTags.length === 0 ? getPlaceholder() : "Dodaj więcej…"}
                value={newTask}
                onChange={handleTaskInput}
                onKeyDown={handleTaskKeyDown}
                className="task-entry-input task-entry__input"
              />

              </div>
            )}
            controlsLabel="Właściwości nowego zadania"
            propertyControls={(
              <>
                {/* Priority */}
                <PropertyMenu
                  value={newPriority ?? ""}
                  ariaLabel="Ustaw priorytet nowego zadania"
                  options={[
                    { value: "high", label: "Wysoki", tone: "danger", className: "task-entry-priority-option--high", leadingIcon: <PriorityIcon level="high" /> },
                    { value: "medium", label: "Średni", className: "task-entry-priority-option--medium", leadingIcon: <PriorityIcon level="medium" /> },
                    { value: "low", label: "Niski", tone: "primary", className: "task-entry-priority-option--low", leadingIcon: <PriorityIcon level="low" /> },
                    { value: "", label: "Brak", leadingIcon: <PriorityIcon level="none" /> },
                  ]}
                  onChange={(value) => setNewPriority(value ? value as Priority : null)}
                  triggerClassName={`task-entry-control${newPriority ? ` task-entry-control--priority-${newPriority}` : ""}`}
                  title="Priorytet">
                  <PriorityIcon level={newPriority ?? "none"} />
                </PropertyMenu>

                {/* List */}
                <PropertyMenu
                  value={newTaskList ?? ""}
                  ariaLabel="Wybierz listę nowego zadania"
                  options={[
                    { value: "", label: "Bez listy", leadingIcon: <span className="task-entry__option-dot task-entry__option-dot--muted" /> },
                    ...listy.map((list) => ({ value: list.id, label: list.label, leadingIcon: <span className="task-entry__option-dot" style={{ background: list.color }} /> })),
                  ]}
                  onChange={(value) => setNewTaskList(value || null)}
                  triggerClassName={`task-entry-control${newTaskList ? " is-active" : ""}`}
                  title="Lista">
                  <List size={13} strokeWidth={1.5} />
                </PropertyMenu>

                {/* Hash — tags */}
                <button
                  ref={hashBtnInputRef}
                  type="button"
                  aria-label="Dodaj tagi do nowego zadania"
                  aria-haspopup="menu"
                  aria-expanded={inputDropdown === "tags"}
                  aria-controls={inputDropdown === "tags" ? "task-entry-tags-menu" : undefined}
                  onClick={() => setInputDropdown(d => d === "tags" ? null : "tags")}
                  className={`task-entry-control${newTaskTags.length > 0 ? " is-active" : ""}${inputDropdown === "tags" ? " is-open" : ""}`}
                  title="Tagi"
                >
                  <Hash size={13} strokeWidth={1.5} />
                </button>
              </>
            )}
            scheduleControl={(
              <button
                  ref={dateButtonRef}
                  type="button"
                  aria-label="Ustaw termin nowego zadania"
                  aria-haspopup="dialog"
                  aria-expanded={datePickerOpen}
                  onClick={() => { setDatePickerOpen(o => !o); setInputDropdown(null); }}
                  className={`task-entry-control task-entry-control--date${dateLabel ? " is-active" : ""}`}>
                  <CalendarDays size={13} aria-hidden="true" />
                  {dateLabel && (
                    <span className="task-entry-control__label">{dateLabel}</span>
                  )}
              </button>
            )}
            submitAction={(newTask || newTaskTags.length > 0 || newPriority || newTaskList) ? (
              <button
                type="submit"
                aria-label="Dodaj zadanie"
                className="task-entry__submit">
                <CornerDownLeft size={13} aria-hidden="true" />
              </button>
            ) : undefined}
          />
          )}

          {taskView === "kosz" ? (
            <div className="task-list">
              {visible.length === 0 ? (
                <EmptyState
                  className="task-empty-state"
                  icon={<Trash2 size={18} />}
                  title="Kosz jest pusty"
                  description="Usunięte zadania pozostaną tutaj do czasu przywrócenia albo trwałego usunięcia."
                />
              ) : visible.map(t => (
                <div key={t.id} className="task-trash-row">
                  <div className="task-trash-row__content">
                    <TaskRow task={t} tagi={tagi} listy={listy}
                      selected={selectedId === t.id}
                      onToggle={() => restoreTaskFromTrash(t.id)}
                      onUpdate={updateTask}
                      onSelect={(id) => {
                        const nextId = selectedId === id ? null : id;
                        if (nextId !== null && Number.isInteger(nextId)) openTaskSelection(nextId);
                        else dismissTaskSelection();
                      }} />
                  </div>
                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={<RotateCcw size={13} />}
                    onClick={() => restoreTaskFromTrash(t.id)}
                  >
                    Przywróć
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    aria-label={`Usuń zadanie „${t.text}” trwale`}
                    onClick={() => setPurgeTaskId(t.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          ) : taskView === "ukonczone" && visible.length === 0 ? (
            <EmptyState
              className="task-empty-state"
              icon={<RotateCcw size={18} />}
              title="Nie ma jeszcze ukończonych zadań"
              description="Zadania oznaczone jako wykonane pojawią się tutaj w jednym spokojnym archiwum."
            />
          ) : (
            <section className="task-groups" aria-label="Grupy zadań">
              {taskGroups.map((group) => {
                const collapsed = isTaskGroupCollapsed(group.id, group.defaultCollapsed);
                const headingId = `task-group-heading-${group.id.replace(/[^a-z0-9-]/gi, "-")}`;
                const listId = `${headingId}-list`;
                return (
                  <section key={group.id} className={`task-group task-group--${group.kind}`} aria-labelledby={headingId}>
                    <div className="task-group-heading">
                      <button
                        type="button"
                        className="task-group-heading__toggle"
                        aria-label={`${collapsed ? "Rozwiń" : "Zwiń"} grupę ${group.label}`}
                        aria-expanded={!collapsed}
                        aria-controls={listId}
                        onClick={() => toggleTaskGroup(group.id)}
                      >
                        <ChevronDown size={13} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                      <h2 id={headingId} className="task-group-heading__title">{group.label}</h2>
                      <span className="task-group-heading__count">{group.tasks.length}</span>
                      {group.kind === "overdue" && (
                        <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(true)}>
                          Przełóż
                        </Button>
                      )}
                    </div>
                    {!collapsed && (
                      <div id={listId} className="task-list">
                        {group.tasks.map((task) => renderTaskRow(task, group.kind))}
                      </div>
                    )}
                  </section>
                );
              })}
            </section>
          )}

          {taskView !== "kosz" && taskView !== "ukonczone" && pending.length === 0 && completed.length === 0 && (
            <EmptyState
              className="task-empty-state"
              icon={<Circle size={18} />}
              title="Dodaj pierwszy konkretny krok"
              description="Zapisz zadanie, które chcesz wykonać, a potem przypisz mu termin, listę albo priorytet."
              action={(
                <Button variant="primary" size="sm" leadingIcon={<Plus size={13} />} onClick={() => inputRef.current?.focus()}>
                  Dodaj zadanie
                </Button>
              )}
            />
          )}
          </div>
        </div>
      </ModuleMain>

      <TaskReminderCenter tasks={tasks} habits={habits} />

      {/* ── Right panel ── */}
      {(selectedTask || selectedHabit) && (
        <DetailPanel
          className={selectedTask ? "task-detail-panel" : "task-habit-detail-panel"}
          label={selectedTask
            ? selectedVirtualOccurrence
              ? "Szczegóły wystąpienia"
              : "Szczegóły zadania"
            : "Szczegóły nawyku"}
          onDismiss={() => selectedTask ? dismissTaskSelection() : dismissHabitSelection()}
        >
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            occurrence={selectedVirtualOccurrence
              ? {
                  date: selectedVirtualOccurrence.occurrence.date,
                  done: selectedVirtualOccurrence.done,
                }
              : undefined}
            onClose={dismissTaskSelection}
            onToggleCompletion={(done) => updateTask(
              selectedVirtualOccurrence?.id ?? selectedTask.id,
              { done },
            )}
            onUpdate={updateTask}
            onDelete={selectedTask.deleted ? (id) => setPurgeTaskId(id) : deleteTask}
            listy={listy}
            tagi={tagi}
          />
        ) : selectedHabit ? (
          <HabitDetail
            habit={selectedHabit}
            onClose={dismissHabitSelection}
            onUpdate={updateHabit}
            onSetCompletion={setHabitCompletion}
            onDelete={deleteHabit}
          />
        ) : null}
        </DetailPanel>
      )}

      {/* ── Date picker popup (fixed) ── */}
      {datePickerOpen && dateButtonRef.current && (
        <DatePickerPopup
          value={newDateVal}
          onConfirm={v => { setNewDateVal(v); }}
          onClose={closeDatePicker}
          anchorEl={dateButtonRef.current}
          focusAfterConfirm={inputRef.current}
        />
      )}

      {rescheduleOpen && (
        <Modal
          title="Przełożyć zaległe zadania na dziś?"
          onClose={() => setRescheduleOpen(false)}
          size="sm"
          footer={(
            <>
              <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>Anuluj</Button>
              <Button variant="primary" onClick={rescheduleOverdue}>Przełóż na dziś</Button>
            </>
          )}
        >
          <p className="task-reschedule-copy">
            Wszystkie zadania z sekcji „Po terminie” dostaną dzisiejszą datę.
            Pozostałe informacje pozostaną bez zmian.
          </p>
        </Modal>
      )}

      {taxonomyDelete && (
        <ConfirmDialog
          title={`Usunąć ${taxonomyDelete.kind === "list" ? "listę" : "tag"} „${taxonomyDelete.label}”?`}
          description={taxonomyDelete.affected > 0
            ? `${taxonomyDelete.affected} ${taxonomyDelete.affected === 1 ? "zadanie korzysta" : "zadań korzysta"} z tej klasyfikacji. Zadania pozostaną, a odwołania zostaną bezpiecznie usunięte.`
            : "Ta klasyfikacja nie jest używana przez żadne zadanie."}
          confirmLabel={taxonomyDelete.kind === "list" ? "Usuń listę" : "Usuń tag"}
          onCancel={() => setTaxonomyDelete(null)}
          onConfirm={confirmTaxonomyDelete}
        >
          <p className="task-confirm-copy">
            Tej operacji nie można cofnąć, dlatego zależności zostaną zaktualizowane w tym samym zapisie.
          </p>
        </ConfirmDialog>
      )}

      {purgeTaskId !== null && (
        <ConfirmDialog
          title={`Usunąć zadanie „${tasks.find((task) => task.id === purgeTaskId)?.text}” trwale?`}
          description="Zadanie zniknie z Kosza i nie będzie można go przywrócić."
          confirmLabel="Usuń zadanie trwale"
          onCancel={() => setPurgeTaskId(null)}
          onConfirm={() => permanentlyDeleteTask(purgeTaskId)}
        >
          <p className="task-confirm-copy">Tej operacji nie można cofnąć.</p>
        </ConfirmDialog>
      )}

      {emptyTrashOpen && (
        <ConfirmDialog
          title="Opróżnić Kosz?"
          description={`${tasks.filter((task) => task.deleted).length} zadań zostanie usuniętych trwale.`}
          confirmLabel="Opróżnij Kosz"
          onCancel={() => setEmptyTrashOpen(false)}
          onConfirm={emptyTrash}
        >
          <p className="task-confirm-copy">
            Jeśli chcesz zachować wybrane pozycje, przywróć je przed opróżnieniem.
          </p>
        </ConfirmDialog>
      )}

      {/* ── Input tags dropdown ── */}
      {inputDropdown === "tags" && hashBtnInputRef.current && (
        <InputFloatMenu id="task-entry-tags-menu" anchorEl={hashBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {tagi.map(t => {
            const active = newTaskTags.includes(t.id);
            return (
              <MenuItem key={t.id}
                selected={active}
                onClick={() => setNewTaskTags(p => active ? p.filter(id => id !== t.id) : [...p, t.id])}
                leadingIcon={<span className="task-nav__dot" style={{ background: t.color }} />}
                trailingIcon={active ? <Check /> : undefined}>
                #{t.label}
              </MenuItem>
            );
          })}
        </InputFloatMenu>
      )}
    </ModuleShell>
  );
}
