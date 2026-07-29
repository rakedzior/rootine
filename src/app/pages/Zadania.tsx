import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Check, Flame, Trash2, RotateCcw,
  ChevronDown, ChevronRight,
  Calendar, X, Circle,
  Flag, Search,
  PenLine, Hash, List, CheckSquare,
} from "lucide-react";
import { persistTaskCompletion } from "../data/taskCompletion";
import {
  assignTaskToWorkProject,
  workProjectIdForTask,
} from "../data/commitmentRepository";
import { todayLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
  type TaskOccurrence,
} from "../data/taskSchedule";
import { TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import {
  loadWorkWorkspace,
  WORK_STORAGE_KEY,
} from "../data/workWorkspace";
import {
  isHabitDoneOnDate,
  emptyTaskTrash,
  loadTaskWorkspace,
  purgeTask,
  restoreTask,
  saveTaskWorkspace,
  trashTask,
  toggleHabitOnDate,
  taskViewForCalendarDate,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
} from "../data/taskWorkspace";
import {
  Badge,
  Button,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  SectionHeader,
  Select,
  WorkspaceToolbar,
} from "../ui";
import { TaskReminderCenter } from "./tasks/TaskReminderCenter";
import "../../styles/tasks.css";
import "../../styles/task-habits.css";

import {
  C,
  DEFAULT_DATE_VAL,
  PALETTE,
  PRIORITY_COLOR,
  SMART_VIEWS,
  VIEW_LABELS,
  VISIBLE_TAG_LIMIT,
  formatDateLabel,
  initialTaskView,
  overdueDateLabel,
  scheduleFromDateValue,
  smartDateViewRange,
  tasksForSmartDateView,
  todayStr,
  viewedTaskDayHeading,
  type DateVal,
  type Habit,
  type ListItem,
  type Priority,
  type TagItem,
  type Task,
} from "./tasks/taskPageModel";
import { DatePickerPopup } from "./tasks/TaskSchedulePicker";
import { TaskDetail, TaskRow } from "./tasks/TaskViews";
import {
  HabitsWorkspace,
  InputFloatMenu,
  SummaryDocument,
  SummaryPanel,
} from "./tasks/TaskSecondaryViews";

export default function Zadania() {
  const [initialWorkspace] = useState(loadTaskWorkspace);
  const [workWorkspace, setWorkWorkspace] = useState(loadWorkWorkspace);
  const workspaceRef = useRef(initialWorkspace);
  const [taskView,      setTaskView]      = useState(initialTaskView);
  const [listFilter,    setListFilter]    = useState<string | null>(null);
  const [tagFilter,     setTagFilter]     = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const [tasks,         setTasks]         = useState<Task[]>(initialWorkspace.tasks);
  const [habits,        setHabits]        = useState<Habit[]>(initialWorkspace.habits);
  const [listy,         setListy]         = useState<ListItem[]>(initialWorkspace.lists);
  const [tagi,          setTagi]          = useState<TagItem[]>(initialWorkspace.tags);
  const [selectedId,    setSelectedId]    = useState<number | null>(null);
  const [newTask,       setNewTask]       = useState("");
  const [newTaskTags,   setNewTaskTags]   = useState<string[]>([]);
  const [newTaskList,   setNewTaskList]   = useState<string | null>(null);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [inputFocused,  setInputFocused]  = useState(false);
  const [newPriority,   setNewPriority]   = useState<Priority | null>(null);
  const [newDateVal,    setNewDateVal]    = useState<DateVal>(DEFAULT_DATE_VAL);
  const [inputDropdown, setInputDropdown] = useState<"priority" | "list" | "tags" | null>(null);
  const [showDone,      setShowDone]      = useState(true);
  const [showOverdue,   setShowOverdue]   = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [newTaskAssignmentError, setNewTaskAssignmentError] = useState("");
  const [detailAssignmentError, setDetailAssignmentError] = useState("");
  const [taxonomyDelete, setTaxonomyDelete] = useState<{
    kind: "list" | "tag";
    id: string;
    label: string;
    affected: number;
  } | null>(null);
  const [purgeTaskId, setPurgeTaskId] = useState<number | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);

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
    const syncWorkWorkspace = () => {
      setWorkWorkspace(loadWorkWorkspace());
      syncWorkspace();
    };
    const unsubscribers = [
      subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(WORK_STORAGE_KEY, syncWorkWorkspace),
      subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, syncWorkspace),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (taskView === "dzis") url.searchParams.delete("widok");
    else url.searchParams.set("widok", taskView);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [taskView]);

  // Sidebar collapse state
  const [listyOpen,     setListyOpen]     = useState(false);
  const [tagiOpen,      setTagiOpen]      = useState(false);

  // Sidebar CRUD state
  const [addingList,    setAddingList]    = useState(false);
  const [newListLabel,  setNewListLabel]  = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListLabel, setEditListLabel] = useState("");
  const [listSearchOpen, setListSearchOpen] = useState(false);
  const [listSearch,    setListSearch]    = useState("");
  const [addingTag,     setAddingTag]     = useState(false);
  const [newTagLabel,   setNewTagLabel]   = useState("");
  const [editingTagId,  setEditingTagId]  = useState<string | null>(null);
  const [editTagLabel,  setEditTagLabel]  = useState("");
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagSearch,     setTagSearch]     = useState("");

  const inputRef        = useRef<HTMLInputElement>(null);
  const dateButtonRef   = useRef<HTMLButtonElement>(null);
  const flagBtnInputRef = useRef<HTMLButtonElement>(null);
  const listBtnInputRef = useRef<HTMLButtonElement>(null);
  const hashBtnInputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("akcja") !== "nowe-zadanie") return;
    if (taskView !== "dzis") setTaskView("dzis");
    window.setTimeout(() => inputRef.current?.focus(), 0);
    url.searchParams.delete("akcja");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [taskView]);

  const todayKey = todayLocalDateKey();
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
  const workProjectOptions = useMemo(() => {
    const companies = new Map(workWorkspace.companies.map((company) => [company.id, company]));
    return [
      { value: "", label: "Bez firmy i projektu" },
      ...workWorkspace.projects
        .filter((project) => project.status === "active" && companies.has(project.companyId))
        .map((project) => ({
          value: project.id,
          label: `${companies.get(project.companyId)!.name} · ${project.name}`,
        })),
    ];
  }, [workWorkspace.companies, workWorkspace.projects]);
  const tagUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  }, {});
  const listUsage = tasks.reduce<Record<string, number>>((counts, task) => {
    if (task.list) counts[task.list] = (counts[task.list] ?? 0) + 1;
    return counts;
  }, {});
  const normalizedListSearch = listSearch.trim().toLowerCase();
  const visibleLists = listy
    .filter(list => !normalizedListSearch || list.label.toLowerCase().includes(normalizedListSearch))
    .sort((a, b) => (listUsage[b.id] ?? 0) - (listUsage[a.id] ?? 0))
    .slice(0, normalizedListSearch ? undefined : VISIBLE_TAG_LIMIT);
  const normalizedTagSearch = tagSearch.trim().toLowerCase().replace(/^#/, "");
  const visibleTags = tagi
    .filter(tag => !normalizedTagSearch || tag.label.includes(normalizedTagSearch))
    .sort((a, b) => (tagUsage[b.id] ?? 0) - (tagUsage[a.id] ?? 0))
    .slice(0, normalizedTagSearch ? undefined : VISIBLE_TAG_LIMIT);

  const hasSmartDateRange = smartDateViewRange(taskView, todayKey) !== null;
  const taskPool = hasSmartDateRange
    ? smartDateTasks.tasks
    : taskView === "ukonczone"
      ? [...tasks, ...completedOccurrences]
      : tasks;
  const visible = taskPool.filter(t => {
    if (taskView === "kosz") return Boolean(t.deleted);
    if (t.deleted) return false;
    if (taskView === "ukonczone") return t.done;
    const viewMatch = taskView === "wszystkie" || taskView === "podsumowanie" || taskView === "nawyki"
      ? true : hasSmartDateRange || t.view === taskView;
    const listMatch = listFilter ? t.list === listFilter : true;
    const tagMatch  = tagFilter  ? (t.tags ?? []).includes(tagFilter) : true;
    const prioMatch = priorityFilter ? t.priority === priorityFilter : true;
    return viewMatch && listMatch && tagMatch && prioMatch;
  });
  const pending   = visible.filter(t => !t.done);
  const completed = visible.filter(t => t.done);
  const overdue = taskView === "dzis"
    ? pending.filter(t => Boolean(t.calendarDate) && t.calendarDate! < todayKey)
    : [];
  const overdueIds = new Set(overdue.map(task => task.id));
  const currentPending = pending.filter(task => !overdueIds.has(task.id));
  const dayHeading = viewedTaskDayHeading(taskView);
  const dayHeadingCount = currentPending.length + completed.length;

  const viewCounts = Object.fromEntries(
    SMART_VIEWS.map(v => {
      const countTasks = smartDateViewRange(v.id, todayKey)
        ? tasksForSmartDateView(tasks, v.id, todayKey).tasks
        : tasks;
      return [
        v.id,
        v.id === "nawyki"
        ? habits.filter((habit) => !isHabitDoneOnDate(habit, todayKey)).length
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
    setNewTaskAssignmentError("");
    const id = Date.now();
    const dateLabel = formatDateLabel(newDateVal);
    const calendarDate = newDateVal.date ? toCalendarDateKey(newDateVal.date) : undefined;
    const fallbackView = taskView === "wszystkie"
      || taskView === "podsumowanie"
      || taskView === "nawyki"
      || taskView === "kosz"
      || taskView === "ukonczone"
      ? "dzis"
      : taskView;
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
    if (newTaskProjectId) {
      const assignment = assignTaskToWorkProject(task, newTaskProjectId);
      if (assignment.status !== "ok") {
        setStorageFailed(assignment.status === "save-failed");
        setNewTaskAssignmentError(
          assignment.status === "invalid-project"
            ? "Projekt nie jest już aktywny. Wybierz inny projekt i spróbuj ponownie."
            : "Nie udało się przypisać zadania. Dane formularza zostały zachowane.",
        );
        return;
      }
      const nextWorkspace = loadTaskWorkspace();
      workspaceRef.current = nextWorkspace;
      setTasks(nextWorkspace.tasks);
      setHabits(nextWorkspace.habits);
      setListy(nextWorkspace.lists);
      setTagi(nextWorkspace.tags);
      setWorkWorkspace(loadWorkWorkspace());
      setSelectedId(
        nextWorkspace.tasks.find((candidate) => candidate.source?.entity === assignment.entity)?.id ?? null,
      );
    } else {
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
      setSelectedId(id);
    }
    setNewTask(""); setNewPriority(null); setNewTaskTags([]); setNewTaskList(null);
    setNewTaskProjectId("");
    setNewDateVal(DEFAULT_DATE_VAL); setInputDropdown(null);
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
    if (typeof patch.done === "boolean" && !occurrence?.occurrence.virtual) {
      persistTaskCompletion(sourceId, patch.done);
    }
    setTasks((current) => current.map((task) => {
      if (task.id !== sourceId) return task;
      if (!occurrence?.occurrence.virtual || typeof patch.done !== "boolean") {
        return { ...task, ...patch };
      }
      const { done, ...sourcePatch } = patch;
      return {
        ...setTaskOccurrenceCompletion(task, occurrence.occurrence.date, done),
        ...sourcePatch,
      };
    }));
  };
  const assignExistingTaskToProject = (id: number, projectId: string) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task || !projectId) return;
    setDetailAssignmentError("");
    const assignment = assignTaskToWorkProject(task, projectId);
    if (assignment.status !== "ok") {
      setStorageFailed(assignment.status === "save-failed");
      setDetailAssignmentError(
        assignment.status === "invalid-project"
          ? "Projekt nie jest już aktywny. Wybierz inny projekt."
          : "Nie udało się zmienić przypisania. Spróbuj ponownie.",
      );
      return;
    }
    const nextWorkspace = loadTaskWorkspace();
    workspaceRef.current = nextWorkspace;
    setTasks(nextWorkspace.tasks);
    setHabits(nextWorkspace.habits);
    setListy(nextWorkspace.lists);
    setTagi(nextWorkspace.tags);
    setWorkWorkspace(loadWorkWorkspace());
    setSelectedId(
      nextWorkspace.tasks.find((candidate) => candidate.source?.entity === assignment.entity)?.id ?? null,
    );
  };
  const workspaceWithTasks = (nextTasks: Task[]) => ({
    ...workspaceRef.current,
    tasks: nextTasks,
    habits,
    lists: listy,
    tags: tagi,
  });
  const deleteTask = (id: number) => {
    setTasks((current) => trashTask(workspaceWithTasks(current), id).tasks);
    setSelectedId(null);
  };
  const restoreTaskFromTrash = (id: number) => {
    setTasks((current) => restoreTask(workspaceWithTasks(current), id).tasks);
    setSelectedId(null);
  };
  const permanentlyDeleteTask = (id: number) => {
    setTasks((current) => purgeTask(workspaceWithTasks(current), id).tasks);
    setPurgeTaskId(null);
    setSelectedId(null);
  };
  const emptyTrash = () => {
    setTasks((current) => emptyTaskTrash(workspaceWithTasks(current)).tasks);
    setEmptyTrashOpen(false);
    setSelectedId(null);
  };
  const toggleHabit = (id: number) => setHabits((current) => current.map((habit) => (
    habit.id === id ? toggleHabitOnDate(habit, toCalendarDateKey(new Date())) : habit
  )));
  const addHabit = (name: string) => setHabits((current) => [
    ...current,
    { id: Date.now(), name, streak: 0, done: false, completedDates: [] },
  ]);

  const rescheduleOverdue = () => {
    const ids = new Set(overdue.map(task => task.id));
    setTasks(existing => existing.map(task => ids.has(task.id)
      ? {
          ...task,
          calendarDate: todayKey,
          date: "Dziś",
          view: "dzis",
          ...(task.schedule?.recurrence
            ? { schedule: { ...task.schedule, completedDates: undefined } }
            : {}),
        }
      : task));
    setRescheduleOpen(false);
  };

  const closeDatePicker = useCallback(() => setDatePickerOpen(false), []);

  useEffect(() => { setSelectedId(null); }, [taskView, listFilter, tagFilter]);
  useEffect(() => { setDetailAssignmentError(""); }, [selectedId]);

  const getPlaceholder = () => {
    if (listFilter) return `Dodaj zadanie do "${listy.find(l => l.id === listFilter)?.label}"`;
    if (tagFilter)  return `Dodaj zadanie z #${tagFilter}`;
    return `Dodaj zadanie do "${VIEW_LABELS[taskView] ?? taskView}"`;
  };

  const dateLabel = formatDateLabel(newDateVal);
  const flagColor = newPriority === "high" ? C.danger : newPriority === "medium" ? C.warning : newPriority === "low" ? C.iceBlue : null;

  const startNewTask = () => {
    if (taskView === "podsumowanie" || taskView === "nawyki" || taskView === "ukonczone" || taskView === "kosz") {
      setTaskView("dzis");
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pageHeader = taskView === "podsumowanie" ? (
    <PageHeader
      title="Zadania"
      description={`Podsumowanie · ${todayStr()}`}
      leading={<CheckSquare size={18} strokeWidth={1.5} />}
      meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
      actions={<Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={14} />} onClick={startNewTask}><span className="header-action-label">Dodaj zadanie</span></Button>}
    />
  ) : taskView === "nawyki" ? (
    <PageHeader
      title="Zadania"
      description={`Nawyki · ${todayStr()}`}
      leading={<Flame size={18} strokeWidth={1.5} />}
      meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
    />
  ) : (
    <PageHeader
      title="Zadania"
      description={`${listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]} · ${todayStr()}`}
      leading={<CheckSquare size={18} strokeWidth={1.5} />}
      meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
      actions={(
        taskView === "kosz" && visible.length > 0 ? (
          <Button variant="danger" leadingIcon={<Trash2 size={14} />} onClick={() => setEmptyTrashOpen(true)}>
            Opróżnij kosz
          </Button>
        ) : (
          <Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={14} />} onClick={startNewTask}>
            <span className="header-action-label">Dodaj zadanie</span>
          </Button>
        )
      )}
    />
  );

  return (
    <ModuleShell pageWidth="wide" header={pageHeader}>

      {/* ── Sub-sidebar ── */}
      <ContextSidebar label="Widoki i listy zadań" className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

        {/* Smart views */}
        <div className="px-2 pb-4 pt-4">
          <SectionHeader title="Główne" level={3} variant="label" className="px-1.5" />
          <div className="space-y-px">
            {SMART_VIEWS.map(v => {
            const Icon = v.icon;
            const active = taskView === v.id && !listFilter && !tagFilter;
            const count = viewCounts[v.id];
            return (
              <ContextNavItem
                key={v.id}
                active={active}
                onClick={() => { setTaskView(v.id); setListFilter(null); setTagFilter(null); }}
                icon={<Icon />}
                label={v.label}
                meta={v.id !== "podsumowanie" && count > 0 ? count : undefined}
              />
            );
            })}
          </div>
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Listy */}
        <div className="px-2 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setListyOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: listyOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: C.textMuted }}>Listy</span>
            </button>
            {listyOpen && (
              <div className="task-taxonomy-header-actions flex items-center gap-1">
                <button
                  onClick={() => { setListSearchOpen(open => !open); setListSearch(""); }}
                  aria-label="Szukaj listy"
                  title="Szukaj listy"
                  style={{ background: "none", border: "none", cursor: "pointer", color: listSearchOpen ? C.iceBlue : C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!listSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingList(true); setAddingTag(false); setListSearchOpen(false); }}
                  aria-label="Dodaj listę"
                  title="Dodaj listę"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {listyOpen && <div className="space-y-px">
            {listSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Szukaj listy"
                  aria-label="Szukaj listy"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {listy.length === 0 && !addingList && (
              <p style={{ fontSize: 11, color: C.textMuted, padding: "4px 12px" }}>Brak list. Kliknij + aby dodać.</p>
            )}
            {listy.length > 0 && visibleLists.length === 0 && (
              <p style={{ fontSize: 10, color: C.textMuted, padding: "4px 12px" }}>Brak pasujących list.</p>
            )}
            {visibleLists.map(l => {
              const active = listFilter === l.id;
              const count = tasks.filter(t => !t.done && t.list === l.id).length;
              return (
                <div key={l.id} className="group relative">
                  {editingListId === l.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                      <input autoFocus value={editListLabel} onChange={e => setEditListLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveList(l.id); if (e.key === "Escape") setEditingListId(null); }}
                        onBlur={() => saveList(l.id)}
                        style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
                    </div>
                  ) : (
                    <ContextNavItem
                      active={active}
                      onClick={() => {
                        if (taskView === "podsumowanie" || taskView === "nawyki") setTaskView("wszystkie");
                        setListFilter(active ? null : l.id);
                        setTagFilter(null);
                      }}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: l.color, opacity: active ? 1 : 0.7 }} />}
                      label={l.label}
                      meta={count > 0 ? count : undefined}
                    />
                  )}
                  {/* Hover actions */}
                  {editingListId !== l.id && (
                    <div className="task-taxonomy-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Edytuj listę ${l.label}`} onClick={e => { e.stopPropagation(); setEditingListId(l.id); setEditListLabel(l.label); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń listę ${l.label}`} onClick={e => { e.stopPropagation(); deleteList(l.id); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingList && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[listy.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="Nazwa listy" value={newListLabel} onChange={e => setNewListLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addList(); if (e.key === "Escape") { setAddingList(false); setNewListLabel(""); } }}
                  onBlur={() => { if (newListLabel.trim()) addList(); else { setAddingList(false); setNewListLabel(""); } }}
                  style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="mx-3 my-2 h-px" style={{ background: C.borderSubtle }} />

        {/* Tagi */}
        <div className="px-2 mb-2">
          <div className="flex items-center justify-between px-1.5 mb-1.5">
            <button onClick={() => setTagiOpen(v => !v)}
              className="flex items-center gap-1.5 flex-1"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronRight size={10} strokeWidth={2} style={{ color: C.textDisabled, transform: tagiOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
              <span className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: C.textMuted }}>Tagi</span>
            </button>
            {tagiOpen && (
              <div className="task-taxonomy-header-actions flex items-center gap-1">
                <button
                  onClick={() => { setTagSearchOpen(open => !open); setTagSearch(""); }}
                  aria-label="Szukaj tagu"
                  title="Szukaj tagu"
                  style={{ background: "none", border: "none", cursor: "pointer", color: tagSearchOpen ? C.iceBlue : C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
                  onMouseLeave={e => { if (!tagSearchOpen) (e.currentTarget as HTMLElement).style.color = C.textMuted; }}>
                  <Search size={11} strokeWidth={1.8} />
                </button>
                <button onClick={() => { setAddingTag(true); setAddingList(false); setTagSearchOpen(false); }}
                  aria-label="Dodaj tag"
                  title="Dodaj tag"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, display: "flex", padding: 2 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = C.textMuted)}>
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
          {tagiOpen && <div className="space-y-px">
            {tagSearchOpen && (
              <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 rounded-md" style={{ background: C.inputBg, border: `1px solid ${C.borderSubtle}` }}>
                <Search size={11} strokeWidth={1.7} style={{ color: C.textDisabled, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  placeholder="Szukaj tagu"
                  aria-label="Szukaj tagu"
                  className="tag-search-input flex-1 min-w-0 bg-transparent outline-none"
                  style={{ border: "none", fontSize: 10, color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}
                />
              </div>
            )}
            {tagi.length === 0 && !addingTag && (
              <p style={{ fontSize: 11, color: C.textMuted, padding: "4px 12px" }}>Brak tagów.</p>
            )}
            {tagi.length > 0 && visibleTags.length === 0 && (
              <p style={{ fontSize: 10, color: C.textMuted, padding: "4px 12px" }}>Brak pasujących tagów.</p>
            )}
            {visibleTags.map(t => {
              const active = tagFilter === t.id;
              return (
                <div key={t.id} className="group relative">
                  {editingTagId === t.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <input autoFocus value={editTagLabel} onChange={e => setEditTagLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveTag(t.id); if (e.key === "Escape") setEditingTagId(null); }}
                        onBlur={() => saveTag(t.id)}
                        style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
                    </div>
                  ) : (
                    <ContextNavItem
                      active={active}
                      onClick={() => {
                        if (taskView === "podsumowanie" || taskView === "nawyki") setTaskView("wszystkie");
                        setTagFilter(active ? null : t.id);
                        setListFilter(null);
                      }}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: t.color, opacity: active ? 1 : 0.7 }} />}
                      label={`#${t.label}`}
                    />
                  )}
                  {editingTagId !== t.id && (
                    <div className="task-taxonomy-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Edytuj tag #${t.label}`} onClick={e => { e.stopPropagation(); setEditingTagId(t.id); setEditTagLabel(t.label); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.textMuted, display: "flex" }}>
                        <PenLine size={9} strokeWidth={1.5} />
                      </button>
                      <button type="button" aria-label={`Usuń tag #${t.label}`} onClick={e => { e.stopPropagation(); deleteTag(t.id); }}
                        style={{ background: C.elevated, border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 4px", color: C.danger, display: "flex" }}>
                        <Trash2 size={9} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {addingTag && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE[tagi.length % PALETTE.length], flexShrink: 0 }} />
                <input autoFocus placeholder="#tag" value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTagItem(); if (e.key === "Escape") { setAddingTag(false); setNewTagLabel(""); } }}
                  onBlur={() => { if (newTagLabel.trim()) addTagItem(); else { setAddingTag(false); setNewTagLabel(""); } }}
                  style={{ flex: 1, background: C.inputBg, border: `1px solid ${C.blueBorder}`, borderRadius: 6, outline: "none", fontSize: 12, color: C.textPrimary, padding: "3px 7px", fontFamily: "var(--font-sans)" }} />
              </div>
            )}
          </div>}
        </div>

        <div className="flex-1" />
        <div className="px-2 py-3 border-t space-y-px" style={{ borderColor: C.borderSubtle }}>
          {([
            { icon: RotateCcw, label: "Ukończone", view: "ukonczone" },
            { icon: Trash2,    label: "Kosz",      view: "kosz" },
          ] as const).map(({ icon: Icon, label, view }) => {
            const active = taskView === view && !listFilter && !tagFilter;
            return (
              <ContextNavItem
                key={label}
                active={active}
                onClick={() => { setTaskView(view); setListFilter(null); setTagFilter(null); }}
                icon={<Icon />}
                label={label}
              />
            );
          })}
        </div>
      </ContextSidebar>

      {/* ── Summary document (replaces task list in podsumowanie mode) ── */}
      {taskView === "podsumowanie" && (
        <ModuleMain>
          <WorkspaceToolbar>
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">Podsumowanie</span>
          </WorkspaceToolbar>
          <SummaryDocument tasks={tasks.filter(t => !t.deleted)} listy={listy} />
        </ModuleMain>
      )}

      {taskView === "nawyki" && (
        <ModuleMain>
          <WorkspaceToolbar>
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">Nawyki</span>
          </WorkspaceToolbar>
          <HabitsWorkspace habits={habits} onToggleHabit={toggleHabit} onAddHabit={addHabit} />
        </ModuleMain>
      )}

      {/* ── Task list ── */}
      <ModuleMain
        style={{
          background: C.bg,
          display: taskView === "podsumowanie" || taskView === "nawyki" ? "none" : undefined,
        }}>
        <WorkspaceToolbar className="task-workspace-toolbar">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              aria-label="Widok zadań"
              fieldClassName="context-mobile-select"
              compact
              value={taskView}
              options={[
                ...SMART_VIEWS.map((item) => ({ value: item.id, label: item.label })),
                { value: "ukonczone", label: "Ukończone" },
                { value: "kosz", label: "Kosz" },
              ]}
              onChange={(event) => { setTaskView(event.target.value); setListFilter(null); setTagFilter(null); }}
            />
            <span className="workspace-context-label">
              {listFilter ? listy.find(l => l.id === listFilter)?.label : tagFilter ? `#${tagFilter}` : VIEW_LABELS[taskView]}
            </span>
            {(listFilter || tagFilter || priorityFilter) && (
              <div className="flex flex-wrap items-center gap-1.5">
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
              {priorityFilter && (
                <Button variant="quiet" size="sm" onClick={() => setPriorityFilter(null)}
                  style={{ background: PRIORITY_COLOR[priorityFilter]+"18", color: PRIORITY_COLOR[priorityFilter] }}>
                  {priorityFilter === "high" ? "Wysoki" : priorityFilter === "medium" ? "Średni" : "Niski"} <X size={9} strokeWidth={2} />
                </Button>
              )}
              </div>
            )}
          </div>
          <div className="task-priority-filters flex items-center gap-1" aria-label="Filtr priorytetu">
            {([
              { id: "high" as Priority, label: "Wysoki", color: C.danger },
              { id: "medium" as Priority, label: "Średni", color: C.warning },
              { id: "low" as Priority, label: "Niski", color: C.iceBlue },
            ]).map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                aria-pressed={priorityFilter === item.id}
                onClick={() => setPriorityFilter(priorityFilter === item.id ? null : item.id)}
                style={{ color: priorityFilter === item.id ? item.color : C.textMuted, background: priorityFilter === item.id ? `${item.color}14` : undefined }}
              >
                {item.label}
              </Button>
            ))}
            {pending.length > 0 && <Badge tone="neutral">{pending.length} otwartych</Badge>}
          </div>
        </WorkspaceToolbar>

        <div className="task-content flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-7 py-5">
          {/* Add task input */}
          <form
            className="task-entry mx-1 mb-3 rounded-xl transition-all duration-200"
            aria-label="Dodaj zadanie"
            onSubmit={(event) => {
              event.preventDefault();
              addTask();
            }}
            style={{
              background: C.inputBg,
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: "none",
            }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap">
              <Plus size={13} strokeWidth={1.75} style={{ color: inputFocused ? C.iceBlue : C.textMuted, flexShrink: 0 }} />
              {/* Tag chips in input */}
              {newTaskTags.map(tagId => {
                const td = tagi.find(t => t.id === tagId);
                const color = td?.color ?? C.iceBlue;
                return (
                  <span key={tagId} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 20,
                    color, background: color + "1A", flexShrink: 0,
                  }}>
                    #{td?.label ?? tagId}
                    <button
                      type="button"
                      aria-label={`Usuń tag #${td?.label ?? tagId} z nowego zadania`}
                      onClick={() => setNewTaskTags(p => p.filter(id => id !== tagId))}
                      style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex", padding: 0 }}>
                      <X size={8} strokeWidth={2.5} />
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
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={handleTaskKeyDown}
                className="task-entry-input flex-1 bg-transparent outline-none text-[13px] min-w-0"
                style={{ color: C.textPrimary, fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", minWidth: 80 }}
              />

              {/* Controls */}
              <div className="task-entry-controls flex items-center gap-0.5 flex-shrink-0">
                <Select
                  aria-label="Firma i projekt nowego zadania"
                  fieldClassName="task-work-project-field"
                  compact
                  value={newTaskProjectId}
                  options={workProjectOptions}
                  disabled={workProjectOptions.length === 1}
                  onChange={(event) => {
                    setNewTaskProjectId(event.target.value);
                    setNewTaskAssignmentError("");
                  }}
                />

                {/* Flag — priority */}
                <button
                  ref={flagBtnInputRef}
                  type="button"
                  aria-label="Ustaw priorytet nowego zadania"
                  aria-expanded={inputDropdown === "priority"}
                  onClick={() => setInputDropdown(d => d === "priority" ? null : "priority")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Priorytet"
                  style={{
                    background: flagColor ? flagColor + "18" : inputDropdown === "priority" ? C.elevated : "transparent",
                    color: flagColor ?? C.textMuted,
                    border: `1px solid ${flagColor ? flagColor + "40" : "transparent"}`,
                  }}>
                  <Flag size={12} strokeWidth={1.5} fill={flagColor ?? "none"} />
                </button>

                {/* List */}
                <button
                  ref={listBtnInputRef}
                  type="button"
                  aria-label="Wybierz listę nowego zadania"
                  aria-expanded={inputDropdown === "list"}
                  onClick={() => setInputDropdown(d => d === "list" ? null : "list")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Lista"
                  style={{
                    background: newTaskList ? listy.find(l => l.id === newTaskList)?.color + "18" : inputDropdown === "list" ? C.elevated : "transparent",
                    color: newTaskList ? listy.find(l => l.id === newTaskList)?.color : C.textMuted,
                    border: `1px solid ${newTaskList ? (listy.find(l => l.id === newTaskList)?.color ?? C.iceBlue) + "40" : "transparent"}`,
                  }}>
                  <List size={12} strokeWidth={1.5} />
                </button>

                {/* Hash — tags */}
                <button
                  ref={hashBtnInputRef}
                  type="button"
                  aria-label="Dodaj tagi do nowego zadania"
                  aria-expanded={inputDropdown === "tags"}
                  onClick={() => setInputDropdown(d => d === "tags" ? null : "tags")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                  title="Tagi"
                  style={{
                    background: newTaskTags.length > 0 ? C.iceBlueBg : inputDropdown === "tags" ? C.elevated : "transparent",
                    color: newTaskTags.length > 0 ? C.iceBlue : C.textMuted,
                    border: `1px solid ${newTaskTags.length > 0 ? C.blueBorder : "transparent"}`,
                  }}>
                  <Hash size={12} strokeWidth={1.5} />
                </button>

                {/* Date */}
                <button
                  ref={dateButtonRef}
                  type="button"
                  aria-label="Ustaw termin nowego zadania"
                  aria-expanded={datePickerOpen}
                  onClick={() => { setDatePickerOpen(o => !o); setInputDropdown(null); }}
                  className="flex items-center gap-1 px-1.5 h-7 rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: dateLabel ? C.iceBlueBg : "transparent",
                    color: dateLabel ? C.iceBlue : C.textMuted,
                    border: `1px solid ${dateLabel ? C.blueBorder : "transparent"}`,
                  }}>
                  <Calendar size={12} strokeWidth={1.5} />
                  {dateLabel && (
                    <span style={{ fontSize: "10px", fontWeight: 500 }}>{dateLabel}</span>
                  )}
                </button>

                {(newTask || newTaskTags.length > 0 || newPriority || newTaskList) && (
                  <button
                    type="submit"
                    aria-label="Dodaj zadanie"
                    className="text-[10px] font-semibold px-2 h-7 rounded-md flex-shrink-0"
                    style={{ background: C.iceBlueSolid, color: C.textPrimary }}>
                    ↵
                  </button>
                )}
              </div>
            </div>
            {newTaskAssignmentError && (
              <p className="task-assignment-error" role="alert">{newTaskAssignmentError}</p>
            )}
          </form>

          {overdue.length > 0 && (
            <section className="task-overdue-section" aria-labelledby="task-overdue-heading">
              <div className="task-overdue-header">
                <div className="task-overdue-heading">
                  <button
                    type="button"
                    className="task-overdue-toggle"
                    aria-label={showOverdue ? "Zwiń zadania po terminie" : "Rozwiń zadania po terminie"}
                    aria-expanded={showOverdue}
                    aria-controls="task-overdue-list"
                    onClick={() => setShowOverdue(open => !open)}
                  >
                    <ChevronDown
                      size={13}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      style={{ transform: showOverdue ? "none" : "rotate(-90deg)" }}
                    />
                  </button>
                  <h2 id="task-overdue-heading" className="task-overdue-title">Po terminie</h2>
                  <span className="task-overdue-count">{overdue.length}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(true)}>
                  Przełóż
                </Button>
              </div>
              {showOverdue && (
                <div id="task-overdue-list" className="space-y-px">
                  {overdue.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      tagi={tagi}
                      deadlineLabel={overdueDateLabel(task.calendarDate!)}
                      selected={selectedId === task.id}
                      onToggle={id => updateTask(id, { done: true })}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {dayHeading && dayHeadingCount > 0 && (
            <div className="task-day-heading" aria-label={`${dayHeading}. ${dayHeadingCount} zadań`}>
              <ChevronDown size={13} strokeWidth={1.6} aria-hidden="true" />
              <h2 className="task-day-heading__title">{dayHeading}</h2>
              <span className="task-day-heading__count">{dayHeadingCount}</span>
            </div>
          )}

          {taskView === "ukonczone" ? (
            /* Ukończone view — flat list of all done tasks */
            <div className="space-y-px">
              {visible.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
                  <RotateCcw size={28} strokeWidth={1} />
                  <span className="text-[13px]">Brak ukończonych zadań</span>
                </div>
              )}
              {visible.map(t => (
                <TaskRow key={t.id} task={t} tagi={tagi}
                  selected={selectedId === t.id}
                  onToggle={id => updateTask(id, { done: false })}
                  onUpdate={updateTask}
                  onSelect={id => setSelectedId(selectedId === id ? null : id)} />
              ))}
            </div>
          ) : taskView === "kosz" ? (
            <div className="space-y-px">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
                  <Trash2 size={28} strokeWidth={1} />
                  <span className="text-[13px]">Kosz jest pusty</span>
                </div>
              ) : visible.map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <TaskRow task={t} tagi={tagi}
                      selected={selectedId === t.id}
                      onToggle={() => restoreTaskFromTrash(t.id)}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                  </div>
                  <Button
                    variant="quiet"
                    size="sm"
                    leadingIcon={<RotateCcw size={12} />}
                    onClick={() => restoreTaskFromTrash(t.id)}
                  >
                    Przywróć
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    aria-label={`Usuń trwale zadanie ${t.text}`}
                    onClick={() => setPurgeTaskId(t.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Pending tasks */}
              {currentPending.length > 0 && (
                <div className="space-y-px mb-2">
                  {currentPending.map(t => (
                    <TaskRow key={t.id} task={t} tagi={tagi}
                      selected={selectedId === t.id}
                      onToggle={id => updateTask(id, { done: true })}
                      onUpdate={updateTask}
                      onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                  ))}
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setShowDone(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors mb-1"
                    style={{ color: C.textMuted }}>
                    <ChevronDown size={12} strokeWidth={1.5}
                      style={{ transform: showDone ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }} />
                    Ukończone · {completed.length}
                  </button>
                  {showDone && (
                    <div className="space-y-px">
                      {completed.map(t => (
                        <TaskRow key={t.id} task={t} tagi={tagi}
                          selected={selectedId === t.id}
                          onToggle={id => updateTask(id, { done: false })}
                          onUpdate={updateTask}
                          onSelect={id => setSelectedId(selectedId === id ? null : id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {taskView !== "kosz" && pending.length === 0 && completed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-2" style={{ color: C.textMuted }}>
              <Circle size={28} strokeWidth={1} />
              <span className="text-[13px]">Brak zadań</span>
              <button onClick={() => inputRef.current?.focus()} className="text-[11px] mt-1" style={{ color: C.iceBlue }}>
                Dodaj pierwsze zadanie →
              </button>
            </div>
          )}
        </div>
      </ModuleMain>

      <TaskReminderCenter tasks={tasks} />

      {/* ── Right panel ── */}
      {(selectedTask || taskView === "podsumowanie") && (
        <DetailPanel
          className={selectedTask ? "" : "task-summary-detail"}
          label={selectedTask
            ? selectedVirtualOccurrence
              ? "Szczegóły wystąpienia"
              : "Szczegóły zadania"
            : "Podsumowanie zadań"}
          onDismiss={() => selectedTask ? setSelectedId(null) : setTaskView("dzis")}
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
            onClose={() => setSelectedId(null)}
            onToggleCompletion={(done) => updateTask(
              selectedVirtualOccurrence?.id ?? selectedTask.id,
              { done },
            )}
            onUpdate={updateTask}
            onDelete={selectedTask.deleted ? (id) => setPurgeTaskId(id) : deleteTask}
            listy={listy}
            tagi={tagi}
            workProjectOptions={workProjectOptions}
            workProjectId={workProjectIdForTask(selectedTask) ?? ""}
            workAssignmentError={detailAssignmentError}
            onWorkProjectChange={(projectId) => assignExistingTaskToProject(selectedTask.id, projectId)}
          />
        ) : (
          <SummaryPanel tasks={visible} habits={habits} onToggleHabit={toggleHabit} />
        )}
        </DetailPanel>
      )}

      {/* ── Date picker popup (fixed) ── */}
      {datePickerOpen && dateButtonRef.current && (
        <DatePickerPopup
          value={newDateVal}
          onConfirm={v => { setNewDateVal(v); }}
          onClose={closeDatePicker}
          anchorEl={dateButtonRef.current}
        />
      )}

      {rescheduleOpen && (
        <Modal
          title="Przełożyć zaległe zadania na dziś?"
          onClose={() => setRescheduleOpen(false)}
          width={480}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setRescheduleOpen(false)}>Anuluj</Button>
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
        <Modal
          title={`Usunąć ${taxonomyDelete.kind === "list" ? "listę" : "tag"} „${taxonomyDelete.label}”?`}
          description={taxonomyDelete.affected > 0
            ? `${taxonomyDelete.affected} ${taxonomyDelete.affected === 1 ? "zadanie korzysta" : "zadań korzysta"} z tej klasyfikacji. Zadania pozostaną, a odwołania zostaną bezpiecznie usunięte.`
            : "Ta klasyfikacja nie jest używana przez żadne zadanie."}
          onClose={() => setTaxonomyDelete(null)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setTaxonomyDelete(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmTaxonomyDelete}>Usuń i uporządkuj zadania</Button>
            </>
          )}
        >
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Tej operacji nie można cofnąć, dlatego zależności zostaną zaktualizowane w tym samym zapisie.
          </p>
        </Modal>
      )}

      {purgeTaskId !== null && (
        <Modal
          title="Usunąć zadanie trwale?"
          description="Zadanie zniknie z Kosza i nie będzie można go przywrócić."
          onClose={() => setPurgeTaskId(null)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setPurgeTaskId(null)}>Anuluj</Button>
              <Button variant="danger" onClick={() => permanentlyDeleteTask(purgeTaskId)}>Usuń trwale</Button>
            </>
          )}
        >
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {tasks.find((task) => task.id === purgeTaskId)?.text}
          </p>
        </Modal>
      )}

      {emptyTrashOpen && (
        <Modal
          title="Opróżnić Kosz?"
          description={`${tasks.filter((task) => task.deleted).length} zadań zostanie usuniętych trwale.`}
          onClose={() => setEmptyTrashOpen(false)}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setEmptyTrashOpen(false)}>Anuluj</Button>
              <Button variant="danger" onClick={emptyTrash}>Opróżnij Kosz</Button>
            </>
          )}
        >
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            Jeśli chcesz zachować wybrane pozycje, przywróć je przed opróżnieniem.
          </p>
        </Modal>
      )}

      {/* ── Input priority dropdown ── */}
      {inputDropdown === "priority" && flagBtnInputRef.current && (
        <InputFloatMenu anchorEl={flagBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {([
            { p: "high"   as Priority, label: "Wysoki", color: C.danger  },
            { p: "medium" as Priority, label: "Średni", color: C.warning },
            { p: "low"    as Priority, label: "Niski",  color: C.iceBlue },
            { p: null,                 label: "Brak",   color: C.textMuted },
          ] as const).map(({ p, label, color }) => (
            <MenuItem key={String(p)}
              selected={newPriority === p}
              onClick={() => {
                setNewPriority(p as Priority | null);
                setInputDropdown(null);
                requestAnimationFrame(() => flagBtnInputRef.current?.focus());
              }}
              leadingIcon={<Flag fill={p ? color : "none"} style={{ color }} />}
              trailingIcon={newPriority === p ? <Check /> : undefined}>
              {label}
            </MenuItem>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input list dropdown ── */}
      {inputDropdown === "list" && listBtnInputRef.current && (
        <InputFloatMenu anchorEl={listBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {[{ id: null as string | null, label: "Skrzynka zadań", color: C.textMuted }, ...listy.map(l => ({ ...l, id: l.id as string | null }))].map(l => (
            <MenuItem key={String(l.id)}
              selected={newTaskList === l.id}
              onClick={() => {
                setNewTaskList(l.id);
                setInputDropdown(null);
                requestAnimationFrame(() => listBtnInputRef.current?.focus());
              }}
              leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: l.color }} />}
              trailingIcon={newTaskList === l.id ? <Check /> : undefined}>
              {l.label}
            </MenuItem>
          ))}
        </InputFloatMenu>
      )}

      {/* ── Input tags dropdown ── */}
      {inputDropdown === "tags" && hashBtnInputRef.current && (
        <InputFloatMenu anchorEl={hashBtnInputRef.current} onClose={() => setInputDropdown(null)}>
          {tagi.map(t => {
            const active = newTaskTags.includes(t.id);
            return (
              <MenuItem key={t.id}
                selected={active}
                onClick={() => setNewTaskTags(p => active ? p.filter(id => id !== t.id) : [...p, t.id])}
                leadingIcon={<span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
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
