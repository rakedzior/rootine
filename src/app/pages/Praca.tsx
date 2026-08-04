/**
 * Praca is Rootine's work cockpit: time first, hierarchy second.
 * One helper sidebar owns navigation. Companies open their overview in the canvas;
 * projects and tasks never compete for a second permanent rail.
 */
import {
  Archive,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Circle,
  CircleAlert,
  CircleDot,
  Clock3,
  CornerDownRight,
  Flag,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { recordActivity } from "../experience/activityLog";
import { writeModuleMemoryValue } from "../experience/moduleMemory";
import {
  createWorkId,
  loadWorkWorkspace,
  saveWorkWorkspace,
  WORK_STORAGE_KEY,
  type WorkCompany,
  type WorkProject,
  type WorkProjectStatus,
  type WorkTask,
  type WorkTaskPriority,
  type WorkTaskStatus,
} from "../data/workWorkspace";
import {
  Badge,
  Button,
  ContentHeader,
  ContextNavItem,
  ContextSidebar,
  DatePicker,
  DetailPanel,
  EmptyState,
  Input,
  ListRow,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
} from "../ui";
import { TaskInlineMenu, WorkProjectActionsMenu } from "./PracaMenus";
import "../../styles/work.css";
import {
  COMPANY_COLORS,
  EMPTY_DRAFT,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  addDays,
  collectTaskBranch,
  collectTaskDescendantRows,
  formatDate,
  formatDateRange,
  formatLongDate,
  formatOpenTaskCount,
  formatProjectProgress,
  formatSubtaskProgress,
  formatTaskCount,
  getInitialWorkLocation,
  getTaskStatus,
  isTaskOpen,
  localDateKey,
  normalize,
  projectStatusTone,
  taskAnchorDate,
  taskCountLabel,
  taskDepth,
  taskStatusIcon,
  taskStatusTone,
  type CompanyProjectSort,
  type CompanyProjectStatusFilter,
  type CompletionUndo,
  type DeleteState,
  type EditorDraft,
  type EditorState,
  type PriorityFilter,
  type SaveStatus,
  type TaskStatusFilter,
  type WorkView,
} from "../work/workPresentation";

export default function Praca() {
  const [commandParams, setCommandParams] = useSearchParams();
  const [initialLocation] = useState(getInitialWorkLocation);
  const [workspace, setWorkspace] = useState(loadWorkWorkspace);
  const [view, setView] = useState<WorkView>(initialLocation.view);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialLocation.companyId);
  const [selectedProjectId, setSelectedProjectId] = useState(initialLocation.projectId);
  const [search, setSearch] = useState(initialLocation.search);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [companySearch, setCompanySearch] = useState("");
  const [companyStatusFilter, setCompanyStatusFilter] = useState<CompanyProjectStatusFilter>("all");
  const [companySort, setCompanySort] = useState<CompanyProjectSort>("name");
  const [expandedCompanyProjectIds, setExpandedCompanyProjectIds] = useState<Set<string>>(() => new Set());
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailSubtasksExpanded, setDetailSubtasksExpanded] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [completionUndo, setCompletionUndo] = useState<CompletionUndo | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const saveNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setStorageError(!saveWorkWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(WORK_STORAGE_KEY, () => {
    setWorkspace(loadWorkWorkspace());
  }), []);

  useEffect(() => () => {
    if (saveNoticeTimerRef.current) window.clearTimeout(saveNoticeTimerRef.current);
  }, []);

  const showSaveNotice = () => {
    setSaveStatus("saving");
    if (saveNoticeTimerRef.current) window.clearTimeout(saveNoticeTimerRef.current);
    saveNoticeTimerRef.current = window.setTimeout(() => {
      setSaveStatus("saved");
      saveNoticeTimerRef.current = window.setTimeout(() => setSaveStatus("idle"), 1800);
    }, 180);
  };

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getInitialWorkLocation();
      setView(next.view);
      setSelectedCompanyId(next.companyId);
      setSelectedProjectId(next.projectId);
      setSearch(next.search);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "today") url.searchParams.delete("widok");
    else url.searchParams.set("widok", view);
    if (selectedCompanyId) url.searchParams.set("firma", selectedCompanyId);
    else url.searchParams.delete("firma");
    if (selectedProjectId) url.searchParams.set("projekt", selectedProjectId);
    else url.searchParams.delete("projekt");
    if (search.trim()) url.searchParams.set("q", search);
    else url.searchParams.delete("q");
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
    writeModuleMemoryValue("work", "location", `${url.pathname}${url.search}`);
  }, [search, selectedCompanyId, selectedProjectId, view]);

  useEffect(() => {
    if (selectedCompanyId && !workspace.companies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId("");
      setSelectedProjectId("");
      setView("today");
    }
  }, [selectedCompanyId, workspace.companies]);

  useEffect(() => {
    setDetailSubtasksExpanded(false);
  }, [detailTaskId]);

  const companyById = useMemo(() => new Map(workspace.companies.map((company) => [company.id, company])), [workspace.companies]);
  const projectById = useMemo(() => new Map(workspace.projects.map((project) => [project.id, project])), [workspace.projects]);
  const selectedCompany = selectedCompanyId ? companyById.get(selectedCompanyId) : undefined;
  const selectedProject = selectedProjectId ? projectById.get(selectedProjectId) : undefined;
  const activeProjects = useMemo(
    () => workspace.projects.filter((project) => project.status === "active" || project.status === "paused"),
    [workspace.projects],
  );
  const activeProjectIds = useMemo(() => new Set(activeProjects.map((project) => project.id)), [activeProjects]);
  const companyProjects = useMemo(
    () => workspace.projects.filter((project) => project.companyId === selectedCompanyId),
    [selectedCompanyId, workspace.projects],
  );
  const projectTasks = useMemo(
    () => workspace.tasks.filter((task) => task.projectId === selectedProjectId),
    [selectedProjectId, workspace.tasks],
  );
  const taskById = useMemo(() => new Map(workspace.tasks.map((task) => [task.id, task])), [workspace.tasks]);

  const projectCounts = useMemo(() => {
    const counts = new Map<string, { total: number; completed: number; open: number }>();
    workspace.projects.forEach((project) => counts.set(project.id, { total: 0, completed: 0, open: 0 }));
    workspace.tasks.forEach((task) => {
      const count = counts.get(task.projectId);
      if (!count) return;
      count.total += 1;
      if (getTaskStatus(task) === "completed") count.completed += 1;
      else count.open += 1;
    });
    return counts;
  }, [workspace.projects, workspace.tasks]);

  const visibleCompanyProjects = useMemo(() => {
    const query = normalize(companySearch.trim());
    return companyProjects
      .filter((project) => project.status !== "completed")
      .filter((project) => companyStatusFilter === "all" || project.status === companyStatusFilter)
      .filter((project) => !query || normalize([project.name, project.description, project.note ?? ""].join(" ")).includes(query))
      .sort((a, b) => {
        if (companySort === "progress") {
          const countA = projectCounts.get(a.id) ?? { total: 0, completed: 0, open: 0 };
          const countB = projectCounts.get(b.id) ?? { total: 0, completed: 0, open: 0 };
          const progressA = countA.total ? countA.completed / countA.total : 0;
          const progressB = countB.total ? countB.completed / countB.total : 0;
          return progressB - progressA || a.name.localeCompare(b.name, "pl");
        }
        if (companySort === "endDate") {
          return (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31") || a.name.localeCompare(b.name, "pl");
        }
        return a.name.localeCompare(b.name, "pl");
      });
  }, [companyProjects, companySearch, companySort, companyStatusFilter, projectCounts]);

  const currentTaskMatches = (task: WorkTask, includeCompleted = true): boolean => {
    const taskStatus = getTaskStatus(task);
    const project = projectById.get(task.projectId);
    const company = project ? companyById.get(project.companyId) : undefined;
    const haystack = normalize([task.title, task.note ?? "", project?.name ?? "", company?.name ?? ""].join(" "));
    if (search.trim() && !haystack.includes(normalize(search.trim()))) return false;
    if (statusFilter !== "all" && taskStatus !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    if (!includeCompleted && taskStatus === "completed") return false;
    return true;
  };

  const relevantOpenTasks = useMemo(
    () => workspace.tasks.filter((task) => {
      const project = projectById.get(task.projectId);
      const belongsToActiveWorkspace = !project || activeProjectIds.has(project.id);
      return belongsToActiveWorkspace && isTaskOpen(task);
    }),
    [activeProjectIds, projectById, workspace.tasks],
  );
  const relevantTasks = useMemo(
    () => workspace.tasks.filter((task) => {
      const project = projectById.get(task.projectId);
      return !project || activeProjectIds.has(project.id);
    }),
    [activeProjectIds, projectById, workspace.tasks],
  );

  const today = localDateKey();
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);

  const filterTaskList = (tasks: WorkTask[], includeCompleted = statusFilter === "completed") => tasks.filter((task) => currentTaskMatches(task, includeCompleted));

  const navigate = (nextView: WorkView, companyId = "", projectId = "") => {
    setView(nextView);
    setSelectedCompanyId(companyId);
    setSelectedProjectId(projectId);
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCompanySearch("");
    setCompanyStatusFilter("all");
    setCompanySort("name");
    setExpandedCompanyProjectIds(new Set());
    setDetailTaskId(null);
    const url = new URL(window.location.href);
    if (nextView === "today") url.searchParams.delete("widok");
    else url.searchParams.set("widok", nextView);
    if (companyId) url.searchParams.set("firma", companyId);
    else url.searchParams.delete("firma");
    if (projectId) url.searchParams.set("projekt", projectId);
    else url.searchParams.delete("projekt");
    url.searchParams.delete("q");
    window.history.pushState({}, "", url);
  };

  const openCompanyEditor = (company?: WorkCompany) => {
    setDraft(company
      ? { ...EMPTY_DRAFT, name: company.name, description: company.description, color: company.color }
      : { ...EMPTY_DRAFT, color: COMPANY_COLORS[workspace.companies.length % COMPANY_COLORS.length] });
    setEditorError("");
    setDetailTaskId(null);
    setEditor({ kind: "company", mode: company ? "edit" : "add", id: company?.id });
  };

  const openProjectEditor = (project?: WorkProject) => {
    setDraft(project
      ? {
          ...EMPTY_DRAFT,
          name: project.name,
          description: project.description,
          note: project.note ?? "",
          companyId: project.companyId,
          projectStatus: project.status,
          startDate: project.startDate ?? "",
          endDate: project.endDate ?? "",
        }
      : {
          ...EMPTY_DRAFT,
          companyId: selectedCompanyId || workspace.companies[0]?.id || "",
        });
    setEditorError("");
    setDetailTaskId(null);
    setEditor({ kind: "project", mode: project ? "edit" : "add", id: project?.id });
  };

  const openTaskEditor = (task?: WorkTask, parentId: string | null = null, initialDate = "") => {
    setDraft(task
      ? {
          ...EMPTY_DRAFT,
          name: task.title,
          note: task.note ?? "",
          projectId: task.projectId,
          parentId: task.parentId ?? "",
          taskStatus: getTaskStatus(task),
          priority: task.priority,
          startDate: task.startDate ?? "",
          endDate: task.dueDate,
        }
      : {
          ...EMPTY_DRAFT,
          projectId: selectedProjectId || "",
          parentId: parentId ?? "",
          endDate: initialDate,
        });
    setEditorError("");
    setEditor({ kind: "task", mode: task ? "edit" : "add", id: task?.id, parentId });
  };

  useEffect(() => {
    if (commandParams.get("akcja") !== "nowe-zadanie") return;
    const next = new URLSearchParams(commandParams);
    ["akcja", "tytul", "data", "priorytet"].forEach((key) => next.delete(key));
    setDraft({
      ...EMPTY_DRAFT,
      name: commandParams.get("tytul")?.trim() ?? "",
      projectId: selectedProjectId,
      endDate: commandParams.get("data") ?? "",
      priority: ["low", "medium", "high"].includes(commandParams.get("priorytet") ?? "")
        ? commandParams.get("priorytet") as WorkTaskPriority
        : "none",
    });
    setEditorError("");
    setEditor({ kind: "task", mode: "add", parentId: null });
    setCommandParams(next, { replace: true });
  }, [commandParams, selectedProjectId, setCommandParams]);

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const name = draft.name.trim();
    if (!name) {
      setEditorError(editor.kind === "task" ? "Wpisz nazwę zadania." : "Wpisz nazwę.");
      return;
    }
    if ((editor.kind === "project" || editor.kind === "task") && draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      setEditorError("Data rozpoczęcia nie może być późniejsza niż termin końcowy.");
      return;
    }

    if (editor.kind === "company") {
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          companies: current.companies.map((company) => company.id === editor.id
            ? { ...company, name, description: draft.description.trim(), color: draft.color }
            : company),
        }));
        if (selectedCompanyId === editor.id && view !== "company") navigate("company", editor.id);
      } else {
        const id = createWorkId("company");
        setWorkspace((current) => ({
          ...current,
          companies: [...current.companies, { id, name, description: draft.description.trim(), color: draft.color }],
        }));
        navigate("company", id);
      }
    }

    if (editor.kind === "project") {
      const companyId = draft.companyId || selectedCompanyId;
      if (!companyId) {
        setEditorError("Wybierz firmę dla projektu.");
        return;
      }
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          projects: current.projects.map((project) => project.id === editor.id
            ? {
                ...project,
                companyId,
                name,
                description: draft.description.trim(),
                note: draft.note.trim(),
                status: draft.projectStatus,
                startDate: draft.startDate,
                endDate: draft.endDate,
              }
            : project),
        }));
        navigate("project", companyId, editor.id);
      } else {
        const id = createWorkId("project");
        setWorkspace((current) => ({
          ...current,
          projects: [...current.projects, {
            id,
            companyId,
            name,
            description: draft.description.trim(),
            note: draft.note.trim(),
            status: draft.projectStatus,
            startDate: draft.startDate,
            endDate: draft.endDate,
          }],
        }));
        navigate("project", companyId, id);
      }
    }

    if (editor.kind === "task") {
      const projectId = draft.projectId;
      const parentId = projectId ? draft.parentId || null : null;
      const completed = draft.taskStatus === "completed";
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === editor.id
            ? {
                ...task,
                title: name,
                projectId,
                parentId,
                note: draft.note.trim(),
                status: draft.taskStatus,
                completed,
                priority: draft.priority,
                startDate: draft.startDate,
                dueDate: draft.endDate,
              }
            : task),
        }));
        recordActivity({ moduleId: "work", kind: "save", title: name, detail: "Zaktualizowano zadanie pracy" });
      } else {
        const id = createWorkId("task");
        setWorkspace((current) => ({
          ...current,
          tasks: [...current.tasks, {
            id,
            projectId,
            parentId,
            title: name,
            completed,
            status: draft.taskStatus,
            priority: draft.priority,
            startDate: draft.startDate,
            dueDate: draft.endDate,
            note: draft.note.trim(),
            createdAt: new Date().toISOString(),
          }],
        }));
        recordActivity({ moduleId: "work", kind: "create", title: name, detail: "Dodano zadanie pracy" });
      }
      setDetailTaskId(null);
    }

    showSaveNotice();
    closeEditor();
  };

  const confirmDelete = () => {
    if (!deleteState) return;
    if (deleteState.kind === "company") {
      const projectIds = new Set(workspace.projects.filter((project) => project.companyId === deleteState.id).map((project) => project.id));
      setWorkspace((current) => ({
        ...current,
        companies: current.companies.filter((company) => company.id !== deleteState.id),
        projects: current.projects.filter((project) => !projectIds.has(project.id)),
        tasks: current.tasks.filter((task) => !projectIds.has(task.projectId)),
      }));
      navigate("today");
    }
    if (deleteState.kind === "project") {
      const project = projectById.get(deleteState.id);
      setWorkspace((current) => ({
        ...current,
        projects: current.projects.filter((candidate) => candidate.id !== deleteState.id),
        tasks: current.tasks.filter((task) => task.projectId !== deleteState.id),
      }));
      navigate("company", project?.companyId ?? selectedCompanyId);
    }
    if (deleteState.kind === "task") {
      const branch = collectTaskBranch(workspace.tasks, deleteState.id);
      setWorkspace((current) => ({ ...current, tasks: current.tasks.filter((task) => !branch.has(task.id)) }));
      setDetailTaskId(null);
    }
    showSaveNotice();
    setDeleteState(null);
  };

  const applyTaskStatuses = (taskIds: string[], status: WorkTaskStatus, label: string) => {
    const ids = new Set(taskIds);
    const previous = workspace.tasks
      .filter((task) => ids.has(task.id))
      .map((task) => ({ id: task.id, completed: task.completed, status: task.status }));
    const completed = status === "completed";
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => ids.has(task.id)
        ? { ...task, status, completed }
        : task),
    }));
    setCompletionUndo({ label, previous });
    showSaveNotice();
    workspace.tasks.filter((task) => ids.has(task.id)).forEach((task) => {
      recordActivity({ moduleId: "work", kind: completed ? "complete" : "save", title: task.title, detail: completed ? "Ukończono zadanie pracy" : "Zmieniono status zadania pracy" });
    });
  };

  const updateTaskValues = (taskId: string, patch: Partial<Pick<WorkTask, "priority" | "dueDate">>) => {
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task),
    }));
    showSaveNotice();
  };

  const updateProjectValues = (projectId: string, patch: Partial<Pick<WorkProject, "status" | "endDate">>) => {
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, ...patch } : project),
    }));
    showSaveNotice();
  };

  const toggleTask = (task: WorkTask) => {
    const currentStatus = getTaskStatus(task);
    if (currentStatus === "completed") {
      applyTaskStatuses([task.id], "todo", `Przywrócono „${task.title}”`);
      return;
    }
    const branch = collectTaskBranch(workspace.tasks.filter((candidate) => candidate.projectId === task.projectId), task.id);
    applyTaskStatuses(Array.from(branch), "completed", branch.size > 1
      ? `Ukończono „${task.title}” i ${branch.size - 1} podzadań`
      : `Ukończono „${task.title}”`);
  };

  const undoCompletionChange = () => {
    if (!completionUndo) return;
    const previous = new Map(completionUndo.previous.map((item) => [item.id, item]));
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        const before = previous.get(task.id);
        return before ? { ...task, completed: before.completed, status: before.status } : task;
      }),
    }));
    showSaveNotice();
    setCompletionUndo(null);
  };

  const canDropTaskOn = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return false;
    const source = workspace.tasks.find((task) => task.id === sourceId);
    const target = workspace.tasks.find((task) => task.id === targetId);
    if (!source || !target || source.projectId !== target.projectId) return false;
    return !collectTaskBranch(workspace.tasks, sourceId).has(targetId);
  };

  const reparentTask = (sourceId: string, parentId: string | null) => {
    const source = workspace.tasks.find((task) => task.id === sourceId);
    if (!source || source.parentId === parentId) return;
    if (parentId && !canDropTaskOn(sourceId, parentId)) return;
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === sourceId ? { ...task, parentId } : task),
    }));
    if (parentId) {
      setCollapsedTaskIds((current) => {
        if (!current.has(parentId)) return current;
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
    showSaveNotice();
    recordActivity({ moduleId: "work", kind: "save", title: source.title, detail: parentId ? "Zagnieżdżono zadanie w innym zadaniu" : "Przeniesiono zadanie na główny poziom projektu" });
  };

  const handleTaskDragStart = (event: DragEvent, task: WorkTask) => {
    if (view !== "project" || task.projectId !== selectedProject?.id) return;
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  };

  const handleTaskDragOver = (event: DragEvent, task: WorkTask) => {
    if (!draggedTaskId || !canDropTaskOn(draggedTaskId, task.id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTaskId(task.id);
  };

  const handleTaskDrop = (event: DragEvent, task: WorkTask) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    if (sourceId && canDropTaskOn(sourceId, task.id)) reparentTask(sourceId, task.id);
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const toggleCollapsed = (taskId: string) => {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleTaskDetails = (taskId: string) => {
    setDetailTaskId((current) => current === taskId ? null : taskId);
  };

  const detailTask = detailTaskId ? workspace.tasks.find((task) => task.id === detailTaskId) : undefined;
  const detailTaskProject = detailTask ? projectById.get(detailTask.projectId) : undefined;
  const detailTaskCompany = detailTaskProject ? companyById.get(detailTaskProject.companyId) : undefined;

  const editorTitle = editor?.kind === "company"
    ? `${editor.mode === "edit" ? "Edytuj" : "Nowa"} firma`
    : editor?.kind === "project"
      ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} projekt`
      : `${editor?.mode === "edit" ? "Edytuj" : "Nowe"} zadanie`;

  const editorDescription = editor?.kind === "company"
    ? "Firma porządkuje powiązane projekty."
    : editor?.kind === "project"
      ? "Projekt dostaje status, zakres dat i prostą notatkę."
      : "Zadanie może zostać przypisane do projektu albo pozostać nieprzypisane.";

  const editorProjectTasks = draft.projectId
    ? workspace.tasks.filter((task) => task.projectId === draft.projectId && task.id !== editor?.id)
    : [];
  const unavailableParentIds = editor?.kind === "task" && editor.id
    ? collectTaskBranch(workspace.tasks, editor.id)
    : new Set<string>();
  const parentOptions = [
    { value: "", label: "Brak — zadanie główne" },
    ...editorProjectTasks
      .filter((task) => !unavailableParentIds.has(task.id))
      .map((task) => ({ value: task.id, label: `${"— ".repeat(Math.min(taskDepth(task, editorProjectTasks), 4))}${task.title}` })),
  ];
  const projectOptions = [
    { value: "", label: "Nieprzypisane" },
    ...workspace.projects
      .filter((project) => project.status !== "completed")
      .map((project) => ({
        value: project.id,
        label: `${project.name} · ${companyById.get(project.companyId)?.name ?? "Firma"}`,
      })),
  ];

  const taskContext = (task: WorkTask) => {
    const project = projectById.get(task.projectId);
    const company = project ? companyById.get(project.companyId) : undefined;
    const parentChain: string[] = [];
    const visited = new Set<string>();
    let parentId = task.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = taskById.get(parentId);
      if (!parent) break;
      parentChain.unshift(parent.title);
      parentId = parent.parentId;
    }
    return {
      project,
      company,
      parentLabel: parentChain.join(" › "),
    };
  };

  const detailTaskContext = detailTask ? taskContext(detailTask) : undefined;
  const detailTaskParent = detailTask?.parentId ? taskById.get(detailTask.parentId) : undefined;
  const detailTaskDescendantRows = detailTask
    ? collectTaskDescendantRows(workspace.tasks, detailTask.id)
    : [];
  const detailTaskDescendants = detailTaskDescendantRows.map(({ task }) => task);
  const detailTaskCompletedDescendants = detailTaskDescendants.filter((task) => getTaskStatus(task) === "completed").length;
  const detailTaskProgress = detailTaskDescendants.length
    ? Math.round((detailTaskCompletedDescendants / detailTaskDescendants.length) * 100)
    : null;

  const taskMatches = (task: WorkTask, includeCompleted = true) => currentTaskMatches(task, includeCompleted);

  const renderTaskRow = (task: WorkTask, depth = 0, showContext = true) => {
    const status = getTaskStatus(task);
    const context = taskContext(task);
    const companyName = context.company?.name ?? "Nieprzypisane";
    const projectName = context.project?.name ?? "Bez projektu";
    const hasChildren = workspace.tasks.some((candidate) => candidate.parentId === task.id);
    const rowStyle = {
      "--work-task-depth": depth,
      "--work-company-accent": context.company?.color ?? "#8793A1",
    } as CSSProperties;
    const isProjectTreeTask = view === "project" && task.projectId === selectedProject?.id;
    const dateLabel = task.dueDate
      ? task.startDate ? `${formatDate(task.startDate)} → ${formatDate(task.dueDate)}` : formatDate(task.dueDate)
      : task.startDate ? `od ${formatDate(task.startDate)}` : "Bez terminu";
    return (
      <ListRow
        key={task.id}
         className={`work-task-row ${depth ? "work-task-row--nested" : ""} ${showContext ? "work-task-row--with-context" : ""}`}
         style={rowStyle}
         draggable={isProjectTreeTask}
         onDragStart={(event) => handleTaskDragStart(event, task)}
         onDragOver={(event) => handleTaskDragOver(event, task)}
         onDrop={(event) => handleTaskDrop(event, task)}
         onDragEnd={handleTaskDragEnd}
         onClick={(event) => {
           const target = event.target as HTMLElement;
           if (target.closest("button, input, select, textarea, [role=\"button\"]")) return;
           toggleTaskDetails(task.id);
         }}
         data-drag-over={dragOverTaskId === task.id ? "true" : undefined}
        leading={(
          <button
            type="button"
            className={`work-task-check ${status === "completed" ? "is-completed" : ""}`}
            aria-label={status === "completed" ? `Przywróć „${task.title}”` : `Ukończ „${task.title}”`}
            aria-pressed={status === "completed"}
            onClick={() => toggleTask(task)}
          >
            {status === "completed" && <Check size={11} strokeWidth={2.4} />}
          </button>
        )}
        title={<span>{task.title}</span>}
        titleLabel={detailTaskId === task.id ? `Zamknij szczegóły zadania „${task.title}”` : `Otwórz szczegóły zadania „${task.title}”`}
        onTitleClick={() => toggleTaskDetails(task.id)}
        selected={detailTaskId === task.id}
        subtitle={task.note ? <span className="work-task-row__subtitle-copy"><span className="work-task-row__note">{task.note}</span></span> : undefined}
        trailing={(
          <div className={`work-task-row__controls ${showContext ? "work-task-row__controls--with-context" : ""}`}>
            {showContext && (
              <>
                <span className="work-task-row__context-column work-task-row__company-column" title={companyName}>
                  <span className="work-task-row__company-dot" aria-hidden="true" />
                  <span>{companyName}</span>
                </span>
                <span className="work-task-row__context-column work-task-row__project-column" title={projectName}>{projectName}</span>
              </>
            )}
            <span className="work-task-row__disclosure-slot">
              {isProjectTreeTask && hasChildren && (
                <button
                  type="button"
                  className="work-task-row__disclosure"
                  aria-label={collapsedTaskIds.has(task.id) ? "Rozwiń podzadania" : "Zwiń podzadania"}
                  aria-expanded={!collapsedTaskIds.has(task.id)}
                  onClick={() => toggleCollapsed(task.id)}
                >
                  {collapsedTaskIds.has(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </span>
            <TaskInlineMenu
              value={status}
              ariaLabel={`Zmień status zadania „${task.title}”`}
              triggerClassName={`work-task-status ${taskStatusTone(status)}`}
              options={TASK_STATUS_ORDER.map((candidate) => ({
                value: candidate,
                label: TASK_STATUS_LABELS[candidate],
                leadingIcon: taskStatusIcon(candidate),
                selected: candidate === status,
                className: `work-inline-menu__item--${candidate}`,
              }))}
              onChange={(value) => {
                const nextStatus = value as WorkTaskStatus;
                if (nextStatus === "completed" && status !== "completed") {
                  toggleTask(task);
                  return;
                }
                applyTaskStatuses([task.id], nextStatus, `Status: ${TASK_STATUS_LABELS[nextStatus]}`);
              }}
            >
              {taskStatusIcon(status)}
              {TASK_STATUS_LABELS[status]}
            </TaskInlineMenu>
            <TaskInlineMenu
              value={task.priority}
              ariaLabel={`Zmień priorytet zadania „${task.title}”`}
              triggerClassName={`work-task-priority work-task-priority--${task.priority}`}
              options={PRIORITY_ORDER.map((priority) => ({
                value: priority,
                label: PRIORITY_LABELS[priority],
                leadingIcon: <Flag size={11} aria-hidden="true" />,
                selected: priority === task.priority,
                className: `work-inline-menu__item--${priority}`,
              }))}
              onChange={(value) => updateTaskValues(task.id, { priority: value as WorkTaskPriority })}
            >
              <Flag size={11} aria-hidden="true" />
              {PRIORITY_LABELS[task.priority]}
            </TaskInlineMenu>
            <DatePicker
              value={task.dueDate}
              displayValue={dateLabel}
              min={task.startDate || undefined}
              aria-label={`Zmień termin zadania „${task.title}”`}
              fieldClassName="work-task-inline-date"
              portalZIndex={260}
              onChange={(value) => updateTaskValues(task.id, { dueDate: value })}
            />
          </div>
        )}
        completed={status === "completed"}
        density="comfortable"
        divided
      />
    );
  };

  const renderTaskSection = (title: string, tasks: WorkTask[], icon: ReactNode, emptyText?: string, emptyAction?: ReactNode) => (
    <section className="work-task-section" aria-label={title}>
      <header className="work-task-section__header">
        <div>
          {icon}
          <h3>{title}</h3>
          <span>{tasks.length}</span>
        </div>
      </header>
      {tasks.length ? (
        <div className="work-task-list">{tasks.map((task) => renderTaskRow(task))}</div>
      ) : emptyText ? (
        <div className={`work-task-section__empty ${emptyAction ? "work-task-section__empty--compact" : ""}`}>
          {emptyAction ? <span className="work-task-section__empty-icon" aria-hidden="true">{icon}</span> : null}
          <span>{emptyText}</span>
          {emptyAction}
        </div>
      ) : null}
    </section>
  );

  const renderWeekGroups = (tasks: WorkTask[], includeOverdue = true) => {
    const overdue = includeOverdue ? tasks.filter((task) => taskAnchorDate(task) && taskAnchorDate(task) < today) : [];
    const remaining = tasks.filter((task) => !overdue.includes(task));
    return (
      <>
        {overdue.length > 0 && renderTaskSection("Po terminie", overdue, <CircleAlert size={14} aria-hidden="true" />)}
        {weekDates.map((date, index) => {
          const dayTasks = remaining.filter((task) => taskAnchorDate(task) === date);
          if (!dayTasks.length) return null;
          return (
            <Fragment key={date}>
              {renderTaskSection(
                index === 0 ? "Dzisiaj" : formatLongDate(date),
                dayTasks,
                <CalendarDays size={14} aria-hidden="true" />,
              )}
            </Fragment>
          );
        })}
        {tasks.filter((task) => !taskAnchorDate(task)).length > 0
          && renderTaskSection("Bez terminu", tasks.filter((task) => !taskAnchorDate(task)), <Circle size={14} aria-hidden="true" />)}
      </>
    );
  };

  const renderTaskTree = () => {
    const tasks = projectTasks.filter((task) => taskMatches(task));
    const byParent = new Map<string | null, WorkTask[]>();
    projectTasks.forEach((task) => {
      const parentId = projectTasks.some((candidate) => candidate.id === task.parentId) ? task.parentId : null;
      const bucket = byParent.get(parentId) ?? [];
      bucket.push(task);
      byParent.set(parentId, bucket);
    });
    const visibleIds = new Set<string>();
    const visit = (task: WorkTask): boolean => {
      const childMatch = (byParent.get(task.id) ?? []).some(visit);
      const matches = tasks.some((candidate) => candidate.id === task.id);
      if (matches || childMatch) visibleIds.add(task.id);
      return matches || childMatch;
    };
    (byParent.get(null) ?? []).forEach(visit);
    const renderBranch = (task: WorkTask, depth: number): ReactNode => {
      if (!visibleIds.has(task.id)) return null;
      const children = byParent.get(task.id) ?? [];
      return (
        <div key={task.id} className="work-task-branch">
          {renderTaskRow(task, depth, false)}
          {!collapsedTaskIds.has(task.id) && children.map((child) => renderBranch(child, depth + 1))}
        </div>
      );
    };
    if (!visibleIds.size) {
      return (
        <EmptyState
          icon={<ListTree size={18} />}
          title={projectTasks.length ? "Brak zadań pasujących do filtrów" : "Pierwsze zadanie nada projektowi rytm"}
          description={projectTasks.length ? "Zmień wyszukiwanie albo filtr statusu." : "Dodaj zadanie, aby rozpocząć pracę nad projektem."}
          action={!projectTasks.length ? <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTaskEditor()}>Dodaj zadanie</Button> : undefined}
        />
      );
    }
    return (
      <div
        className="work-task-tree"
        onDragOver={(event) => {
          if (!draggedTaskId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer.getData("text/plain") || draggedTaskId;
          if (sourceId) reparentTask(sourceId, null);
          setDraggedTaskId(null);
          setDragOverTaskId(null);
        }}
        onDragEnd={handleTaskDragEnd}
      >
        {(byParent.get(null) ?? []).map((task) => renderBranch(task, 0))}
      </div>
    );
  };

  const renderTodayView = () => {
    const tasks = filterTaskList(relevantTasks);
    const overdue = tasks.filter((task) => taskAnchorDate(task) && taskAnchorDate(task) < today);
    const todayTasks = tasks.filter((task) => taskAnchorDate(task) === today);
    const upcoming = tasks.filter((task) => {
      const anchor = taskAnchorDate(task);
      return anchor > today && weekDates.includes(anchor);
    });
    const withoutDate = tasks.filter((task) => !taskAnchorDate(task));
    return (
      <div className="work-screen work-screen--focus">
        <div className="work-focus-stack">
          {renderTaskSection("Po terminie", overdue, <CircleAlert size={14} aria-hidden="true" />, "Brak zadań po terminie")}
          {renderTaskSection(
            "Dzisiaj",
            todayTasks,
            <Clock3 size={14} aria-hidden="true" />,
            "Nie masz zadań z terminem na dziś",
            <Button variant="quiet" size="sm" onClick={() => openTaskEditor(undefined, null, today)}>Zaplanuj zadanie</Button>,
          )}
          {upcoming.length > 0 && (
            <section className="work-task-section work-task-section--week-preview" aria-label="Najbliższe dni">
              <header className="work-task-section__header">
                <div><CalendarDays size={14} aria-hidden="true" /><h3>Ten tydzień</h3><span>{upcoming.length}</span></div>
                <Button variant="quiet" size="sm" onClick={() => navigate("week")}>Otwórz widok</Button>
              </header>
              <div className="work-task-list">{upcoming.sort((a, b) => taskAnchorDate(a).localeCompare(taskAnchorDate(b))).map((task) => renderTaskRow(task))}</div>
            </section>
          )}
          {renderTaskSection("Bez terminu", withoutDate, <Circle size={14} aria-hidden="true" />, "Nie ma otwartych zadań bez terminu")}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const tasks = filterTaskList(relevantTasks);
    return (
      <div className="work-screen work-screen--focus">
        <div className="work-focus-stack">{renderWeekGroups(tasks)}</div>
      </div>
    );
  };

  const renderActiveView = () => {
    const tasks = filterTaskList(relevantTasks);
    const sorted = tasks.slice().sort((a, b) => {
      const projectA = projectById.get(a.projectId)?.name ?? "";
      const projectB = projectById.get(b.projectId)?.name ?? "";
      return projectA.localeCompare(projectB, "pl") || taskAnchorDate(a).localeCompare(taskAnchorDate(b)) || a.createdAt.localeCompare(b.createdAt);
    });
    return (
      <div className="work-screen work-screen--table">
        <section className="work-task-section" aria-label="Wszystkie aktywne zadania">
          {sorted.length ? <div className="work-task-list">{sorted.map((task) => renderTaskRow(task))}</div> : <EmptyState icon={<Check size={18} />} title="Brak aktywnych zadań" description="Wszystko jest zamknięte albo nie ma jeszcze zadań." />}
        </section>
      </div>
    );
  };

  const renderUnassignedView = () => {
    const tasks = filterTaskList(workspace.tasks.filter((task) => !task.projectId));
    return (
      <div className="work-screen">
        <section className="work-task-section" aria-label="Nieprzypisane zadania">
          {tasks.length ? <div className="work-task-list">{tasks.map((task) => renderTaskRow(task))}</div> : <EmptyState icon={<Inbox size={18} />} title="Brak nieprzypisanych zadań" description="Nowe zadanie możesz przypisać później albo zostawić bez projektu." />}
        </section>
      </div>
    );
  };

  const renderArchiveView = () => {
    const projects = workspace.projects.filter((project) => project.status === "completed");
    return (
      <div className="work-screen">
        <section className="work-project-list" aria-label="Zakończone projekty">
          {projects.length ? projects.map((project) => {
            const company = companyById.get(project.companyId);
            const count = projectCounts.get(project.id) ?? { total: 0, completed: 0, open: 0 };
            return (
              <article key={project.id} className="work-project-record work-project-record--archived">
                <button type="button" className="work-project-record__main" onClick={() => navigate("project", project.companyId, project.id)}>
                  <span className="work-project-record__identity"><FolderKanban size={15} /><span><strong>{project.name}</strong><small>{company?.name ?? "Bez firmy"} · {count.completed}/{count.total} ukończonych</small></span></span>
                  <Badge tone="success">Zakończony</Badge>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </article>
            );
          }) : <EmptyState icon={<Archive size={18} />} title="Archiwum jest puste" description="Zakończone projekty pojawią się tutaj." />}
        </section>
      </div>
    );
  };

  const renderCompanyView = () => {
    if (!selectedCompany) return null;
    const projects = visibleCompanyProjects;
    const allProjects = companyProjects.filter((project) => project.status !== "completed");
    return (
      <div className="work-screen work-screen--table">
        <section className="work-project-list work-project-list--company" aria-labelledby="work-company-projects-title">
          <header className="work-section-heading">
            <div><h3 id="work-company-projects-title">Projekty</h3><span>{projects.length}</span></div>
            <div className="work-section-heading__actions">
              <div className="work-project-list__bulk-actions" aria-label="Sterowanie rozwinięciem projektów">
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<ChevronsDown size={13} />}
                  disabled={!projects.length}
                  onClick={() => setExpandedCompanyProjectIds(new Set(projects.map((project) => project.id)))}
                >
                  Rozwiń wszystkie
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<ChevronsUp size={13} />}
                  disabled={!expandedCompanyProjectIds.size}
                  onClick={() => setExpandedCompanyProjectIds(new Set())}
                >
                  Zwiń wszystkie
                </Button>
              </div>
              <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openProjectEditor()}>Projekt</Button>
            </div>
          </header>
          <div className="work-project-columns" aria-hidden="true">
            <span>Projekt</span>
            <span>Status</span>
            <span>Termin</span>
            <span>Otwarte</span>
            <span>Postęp</span>
            <span>Akcje</span>
            <span />
          </div>
          {projects.length ? projects.map((project) => {
            const count = projectCounts.get(project.id) ?? { total: 0, completed: 0, open: 0 };
            const progress = count.total ? Math.round((count.completed / count.total) * 100) : 0;
            const projectOpenTasks = workspace.tasks
              .filter((task) => task.projectId === project.id && isTaskOpen(task))
              .sort((a, b) => (taskAnchorDate(a) || "9999-12-31").localeCompare(taskAnchorDate(b) || "9999-12-31") || a.createdAt.localeCompare(b.createdAt));
            const isExpanded = expandedCompanyProjectIds.has(project.id);
            return (
              <article key={project.id} className={`work-project-record ${isExpanded ? "is-expanded" : ""}`}>
                <div
                  className="work-project-record__main"
                  onDoubleClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, input, select, textarea, [role=\"button\"]")) return;
                    navigate("project", project.companyId, project.id);
                  }}
                >
                  <button
                    type="button"
                    className="work-project-record__identity work-project-record__identity-trigger"
                    aria-expanded={isExpanded}
                    aria-controls={`work-project-preview-${project.id}`}
                    aria-label={`${isExpanded ? "Zwiń" : "Rozwiń"} podgląd projektu ${project.name}`}
                    title="Kliknij, aby rozwinąć · kliknij dwukrotnie, aby otworzyć projekt"
                    onClick={() => setExpandedCompanyProjectIds((current) => {
                      const next = new Set(current);
                      if (next.has(project.id)) next.delete(project.id);
                      else next.add(project.id);
                      return next;
                    })}
                    onDoubleClick={() => navigate("project", project.companyId, project.id)}
                  >
                    <FolderKanban size={15} aria-hidden="true" />
                    <span><strong>{project.name}</strong><small>{project.description || "Bez opisu projektu"}</small></span>
                  </button>
                  <div className="work-project-record__status">
                    <TaskInlineMenu
                      value={project.status}
                      ariaLabel={`Zmień status projektu „${project.name}”`}
                      triggerClassName={`work-project-status-control work-project-status-control--${project.status}`}
                      options={PROJECT_STATUS_ORDER.map((candidate) => ({
                        value: candidate,
                        label: PROJECT_STATUS_LABELS[candidate],
                        selected: candidate === project.status,
                        className: `work-inline-menu__item--${candidate}`,
                      }))}
                      onChange={(value) => updateProjectValues(project.id, { status: value as WorkProjectStatus })}
                    >
                      <span>{PROJECT_STATUS_LABELS[project.status]}</span>
                      <ChevronDown size={11} aria-hidden="true" />
                    </TaskInlineMenu>
                  </div>
                  <DatePicker
                    value={project.endDate ?? ""}
                    displayValue={formatDateRange(project.startDate, project.endDate)}
                    min={project.startDate || undefined}
                    aria-label={`Zmień termin projektu „${project.name}”`}
                    fieldClassName="work-project-inline-date"
                    portalZIndex={260}
                    onChange={(value) => updateProjectValues(project.id, { endDate: value })}
                  />
                  <span className="work-project-record__open-count" title={formatTaskCount(count.open)}><strong>{count.open}</strong><small>{taskCountLabel(count.open)}</small></span>
                  <span className="work-project-record__progress"><span className="work-progress"><i style={{ width: `${progress}%` }} /></span><strong>{progress}%</strong></span>
                  <span className="work-project-record__action-space" aria-hidden="true" />
                  <button
                    type="button"
                    className="work-project-record__expand-icon"
                    aria-expanded={isExpanded}
                    aria-controls={`work-project-preview-${project.id}`}
                    aria-label={`${isExpanded ? "Zwiń" : "Rozwiń"} projekt`}
                    onClick={() => setExpandedCompanyProjectIds((current) => {
                      const next = new Set(current);
                      if (next.has(project.id)) next.delete(project.id);
                      else next.add(project.id);
                      return next;
                    })}
                  >
                    {isExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  </button>
                </div>
                <div className="work-project-record__actions">
                  <WorkProjectActionsMenu
                    projectId={project.id}
                    projectName={project.name}
                    onEdit={() => openProjectEditor(project)}
                    onDelete={() => setDeleteState({ kind: "project", id: project.id, name: project.name })}
                  />
                </div>
                {project.note && <p className="work-project-record__note">{project.note}</p>}
                {isExpanded && (
                  <div id={`work-project-preview-${project.id}`} className="work-project-record__preview">
                    <div className="work-project-record__preview-heading">
                      <span>Zadania</span>
                      <span>{projectOpenTasks.length ? formatOpenTaskCount(projectOpenTasks.length) : "Brak otwartych zadań"}</span>
                    </div>
                    {projectOpenTasks.length ? (
                      <div className="work-project-record__preview-list">
                        {projectOpenTasks.map((task) => {
                          const taskStatus = getTaskStatus(task);
                          return (
                            <button key={task.id} type="button" className="work-project-record__preview-task" onClick={() => toggleTaskDetails(task.id)}>
                              <span className={`work-project-record__preview-status ${taskStatusTone(taskStatus)}`}>{taskStatusIcon(taskStatus)}</span>
                              <span className="work-project-record__preview-title">{task.title}</span>
                              <span className="work-project-record__preview-date">{formatDate(task.dueDate ?? task.startDate ?? "")}</span>
                              <ChevronRight size={13} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    ) : <p className="work-project-record__preview-empty">Projekt nie ma jeszcze otwartych zadań.</p>}
                    <div className="work-project-record__preview-footer">
                      <Button variant="quiet" size="sm" onClick={() => navigate("project", project.companyId, project.id)}>Otwórz projekt <ChevronRight size={13} aria-hidden="true" /></Button>
                    </div>
                  </div>
                )}
              </article>
            );
          }) : allProjects.length ? <EmptyState icon={<Search size={18} />} title="Brak projektów pasujących do filtrów" description="Zmień wyszukiwanie, status albo sortowanie." /> : <EmptyState icon={<FolderKanban size={18} />} title="Dodaj pierwszy projekt" description="Projekty pomagają oddzielić większe strumienie pracy." action={<Button variant="quiet" leadingIcon={<Plus size={13} />} onClick={() => openProjectEditor()}>Dodaj projekt</Button>} />}
        </section>
      </div>
    );
  };

  const renderProjectView = () => {
    if (!selectedProject) return null;
    const selectedProjectCompany = companyById.get(selectedProject.companyId);
    const count = projectCounts.get(selectedProject.id) ?? { total: 0, completed: 0, open: 0 };
    const progress = count.total ? Math.round((count.completed / count.total) * 100) : 0;
    const openProjectTasks = projectTasks
      .filter(isTaskOpen)
      .sort((a, b) => (taskAnchorDate(a) || "9999-12-31").localeCompare(taskAnchorDate(b) || "9999-12-31") || a.createdAt.localeCompare(b.createdAt));
    const nextProjectTask = openProjectTasks[0];
    const overdueProjectTaskCount = openProjectTasks.filter((task) => {
      const anchor = taskAnchorDate(task);
      return Boolean(anchor) && anchor < today;
    }).length;
    return (
      <div className="work-screen work-screen--project">
        <section className="work-project-summary" aria-label="Podsumowanie projektu">
          <div className="work-project-summary__progress">
            <div className="work-project-summary__heading"><span><ListTree size={13} aria-hidden="true" /> Postęp projektu</span><b>{progress}%</b></div>
            <div className="work-progress" role="progressbar" aria-label="Postęp projektu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
            <p>{formatProjectProgress(count)}</p>
          </div>
          <dl className="work-project-summary__facts">
            <div><dt>Firma</dt><dd>{selectedProjectCompany?.name ?? "Bez firmy"}</dd></div>
            <div><dt>Termin końcowy</dt><dd>{selectedProject.endDate ? formatDate(selectedProject.endDate) : "Bez terminu"}</dd></div>
            <div><dt>Otwarte zadania</dt><dd>{count.open}</dd><small>{taskCountLabel(count.open)}</small></div>
          </dl>
        </section>
        <div className="work-project-layout">
          <section className="work-project-task-panel" aria-labelledby="work-project-tasks-title">
            <header className="work-section-heading"><div><ListTree size={14} aria-hidden="true" /><h3 id="work-project-tasks-title">Zadania projektu</h3><span>{formatOpenTaskCount(count.open)}</span></div><div className="work-section-heading__actions"><span className="work-task-tree__hint">Przeciągnij, aby zagnieździć</span><Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openTaskEditor()}>Zadanie</Button></div></header>
            {completionUndo && <div className="work-completion-undo" role="status"><span>{completionUndo.label}</span><Button variant="quiet" size="sm" onClick={undoCompletionChange}>Cofnij</Button><button type="button" aria-label="Zamknij komunikat" onClick={() => setCompletionUndo(null)}><X size={13} /></button></div>}
            {renderTaskTree()}
          </section>
          <aside className="work-project-context" aria-label="Kontekst projektu">
            <section className="work-project-context__section">
              <header className="work-project-context__header"><h3>Kontekst projektu</h3><Button variant="ghost" size="sm" onClick={() => openProjectEditor(selectedProject)}>Edytuj</Button></header>
              <p className="work-project-context__description">{selectedProject.description || "Dodaj opis projektu, aby przy kolejnym wejściu od razu wiedzieć, czego dotyczy."}</p>
            </section>
            <section className="work-project-context__section">
              <header className="work-project-context__header"><h3>Najbliższe zadanie</h3>{overdueProjectTaskCount > 0 && <span className="work-project-context__warning"><CircleAlert size={12} aria-hidden="true" /> {overdueProjectTaskCount} po terminie</span>}</header>
              {nextProjectTask ? (
                <button type="button" className="work-project-next-task" onClick={() => toggleTaskDetails(nextProjectTask.id)}>
                  <span className={`work-project-next-task__status ${taskStatusTone(getTaskStatus(nextProjectTask))}`}>{taskStatusIcon(getTaskStatus(nextProjectTask))}</span>
                  <span className="work-project-next-task__copy"><strong>{nextProjectTask.title}</strong><small>{taskAnchorDate(nextProjectTask) ? formatDate(taskAnchorDate(nextProjectTask)) : "Bez terminu"}</small></span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ) : <p className="work-project-context__empty">Brak otwartych zadań. Możesz dodać pierwsze zadanie do projektu.</p>}
            </section>
            <section className="work-project-context__section work-project-context__section--note">
              <header className="work-project-context__header"><h3>Notatka projektu</h3></header>
              {selectedProject.note ? <p className="work-project-context__note">{selectedProject.note}</p> : <button type="button" className="work-project-add-note" onClick={() => openProjectEditor(selectedProject)}>Dodaj notatkę <ChevronRight size={13} aria-hidden="true" /></button>}
            </section>
          </aside>
        </div>
      </div>
    );
  };

  const renderToolbar = () => {
    const labels: Record<WorkView, string> = {
      today: "Dzisiaj w pracy",
      week: "Ten tydzień",
      active: "Wszystkie aktywne",
      unassigned: "Nieprzypisane",
      archive: "Archiwum",
      company: selectedCompany?.name ?? "Firma",
      project: selectedProject?.name ?? "Projekt",
    };
    const showTaskFilters = view !== "company" && view !== "archive";
    const showProjectFilters = view === "company";
    return (
      <ContentHeader
        className={view === "company" || view === "active" ? "work-content-header work-content-header--table" : "work-content-header"}
        title={labels[view]}
        description={view === "today"
          ? "Najważniejsze rzeczy na teraz"
          : view === "project"
            ? selectedCompany?.name ?? "Zadania i kontekst projektu"
            : view === "company"
              ? "Projekty, postęp i najbliższe terminy"
              : "Widok roboczy"}
        meta={view === "project" && selectedProject
          ? <><Badge tone={projectStatusTone(selectedProject.status)}>{PROJECT_STATUS_LABELS[selectedProject.status]}</Badge><span>{formatDateRange(selectedProject.startDate, selectedProject.endDate)}</span></>
          : view === "company" && selectedCompany
            ? <span className="work-company-marker" style={{ background: selectedCompany.color }} />
            : undefined}
        actions={<>
          {showTaskFilters && (
          <div className="work-toolbar__controls">
            <label className="work-search"><Search size={13} aria-hidden="true" /><span className="sr-only">Szukaj w pracy</span><input value={search} placeholder="Szukaj w pracy" onChange={(event) => setSearch(event.target.value)} /></label>
            <Select compact aria-label="Filtruj po statusie" value={statusFilter} options={[{ value: "all", label: "Każdy status" }, ...TASK_STATUS_ORDER.map((status) => ({ value: status, label: TASK_STATUS_LABELS[status] }))]} onChange={(event) => setStatusFilter(event.target.value as TaskStatusFilter)} />
            <Select compact aria-label="Filtruj po priorytecie" value={priorityFilter} options={[{ value: "all", label: "Każdy priorytet" }, ...PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }))]} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)} />
          </div>
          )}
          {showProjectFilters && (
          <div className="work-toolbar__controls">
            <label className="work-search"><Search size={13} aria-hidden="true" /><span className="sr-only">Szukaj projektów</span><input value={companySearch} placeholder="Szukaj projektów" onChange={(event) => setCompanySearch(event.target.value)} /></label>
            <Select compact aria-label="Filtruj projekty po statusie" value={companyStatusFilter} options={[{ value: "all", label: "Każdy status" }, ...Object.entries(PROJECT_STATUS_LABELS).filter(([value]) => value !== "completed").map(([value, label]) => ({ value, label }))]} onChange={(event) => setCompanyStatusFilter(event.target.value as CompanyProjectStatusFilter)} />
            <Select compact aria-label="Sortuj projekty" value={companySort} options={[{ value: "name", label: "Sortuj: nazwa" }, { value: "progress", label: "Sortuj: postęp" }, { value: "endDate", label: "Sortuj: termin" }]} onChange={(event) => setCompanySort(event.target.value as CompanyProjectSort)} />
          </div>
          )}
          {view === "company" && selectedCompany && <>
            <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj firmę" title="Edytuj firmę" onClick={() => openCompanyEditor(selectedCompany)}><Pencil size={12} /></Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Usuń firmę" title="Usuń firmę" onClick={() => setDeleteState({ kind: "company", id: selectedCompany.id, name: selectedCompany.name })}><Trash2 size={12} /></Button>
          </>}
          {view === "project" && selectedProject && <>
            <Button variant="ghost" size="sm" leadingIcon={<ChevronRight size={13} className="is-back" />} onClick={() => navigate("company", selectedProject.companyId)}>{companyById.get(selectedProject.companyId)?.name ?? "Firma"}</Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj projekt" title="Edytuj projekt" onClick={() => openProjectEditor(selectedProject)}><Pencil size={12} /></Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Usuń projekt" title="Usuń projekt" onClick={() => setDeleteState({ kind: "project", id: selectedProject.id, name: selectedProject.name })}><Trash2 size={12} /></Button>
          </>}
        </>}
      />
    );
  };

  const renderMainView = () => {
    if (view === "today") return renderTodayView();
    if (view === "week") return renderWeekView();
    if (view === "active") return renderActiveView();
    if (view === "unassigned") return renderUnassignedView();
    if (view === "archive") return renderArchiveView();
    if (view === "company") return renderCompanyView();
    return renderProjectView();
  };

  const sidebar = (
    <ContextSidebar label="Widoki pracy" className="work-context-sidebar">
      <nav className="work-sidebar-nav" aria-label="Widoki pracy">
        <p className="work-sidebar-section-label">Widoki</p>
        <ContextNavItem active={view === "today"} icon={<Clock3 />} label="Dzisiaj" meta={filterTaskList(relevantOpenTasks).filter((task) => taskAnchorDate(task) === today).length} onClick={() => navigate("today")} />
        <ContextNavItem active={view === "week"} icon={<CalendarDays />} label="Ten tydzień" meta={filterTaskList(relevantOpenTasks).filter((task) => weekDates.includes(taskAnchorDate(task))).length} onClick={() => navigate("week")} />
        <ContextNavItem active={view === "active"} icon={<LayoutDashboard />} label="Wszystkie aktywne" meta={relevantOpenTasks.length} onClick={() => navigate("active")} />

        <p className="work-sidebar-section-label work-sidebar-section-label--spaced">Firmy</p>
        {workspace.companies.map((company) => {
          const projectCount = workspace.projects.filter((project) => project.companyId === company.id && project.status !== "completed").length;
          return <ContextNavItem key={company.id} active={view === "company" && selectedCompanyId === company.id} icon={<span className="work-company-dot" style={{ background: company.color }} />} label={company.name} meta={projectCount} onClick={() => navigate("company", company.id)} />;
        })}
        {!workspace.companies.length && <p className="work-sidebar-empty">Dodaj firmę, aby uporządkować projekty.</p>}

        <p className="work-sidebar-section-label work-sidebar-section-label--spaced">Pozostałe</p>
        <ContextNavItem active={view === "unassigned"} icon={<Inbox />} label="Nieprzypisane" meta={workspace.tasks.filter((task) => !task.projectId && isTaskOpen(task)).length} onClick={() => navigate("unassigned")} />
        <ContextNavItem active={view === "archive"} icon={<Archive />} label="Archiwum" meta={workspace.projects.filter((project) => project.status === "completed").length} onClick={() => navigate("archive")} />
      </nav>
      <div className="work-sidebar-footer"><CircleDot size={12} aria-hidden="true" /><span>Dane zapisują się lokalnie</span></div>
    </ContextSidebar>
  );

  const renderMobileContextNav = () => {
    const items = [
      { key: "today", label: "Dzisiaj", icon: <Clock3 />, meta: filterTaskList(relevantOpenTasks).filter((task) => taskAnchorDate(task) === today).length, onClick: () => navigate("today") },
      { key: "week", label: "Ten tydzień", icon: <CalendarDays />, meta: filterTaskList(relevantOpenTasks).filter((task) => weekDates.includes(taskAnchorDate(task))).length, onClick: () => navigate("week") },
      { key: "active", label: "Aktywne", icon: <LayoutDashboard />, meta: relevantOpenTasks.length, onClick: () => navigate("active") },
      ...(selectedProject ? [{ key: `project-${selectedProject.id}`, label: selectedProject.name, icon: <FolderKanban />, meta: undefined, onClick: () => navigate("project", selectedProject.companyId, selectedProject.id) }] : []),
      ...workspace.companies.map((company) => ({
        key: `company-${company.id}`,
        label: company.name,
        icon: <span className="work-company-dot" style={{ background: company.color }} />,
        meta: workspace.projects.filter((project) => project.companyId === company.id && project.status !== "completed").length,
        onClick: () => navigate("company", company.id),
      })),
      { key: "unassigned", label: "Nieprzypisane", icon: <Inbox />, meta: workspace.tasks.filter((task) => !task.projectId && isTaskOpen(task)).length, onClick: () => navigate("unassigned") },
      { key: "archive", label: "Archiwum", icon: <Archive />, meta: workspace.projects.filter((project) => project.status === "completed").length, onClick: () => navigate("archive") },
    ];
    return (
      <nav className="work-mobile-nav" aria-label="Skróty widoków pracy">
        <div className="work-mobile-nav__scroll">
          {items.map((item) => {
            const active = item.key === view || (item.key === `company-${selectedCompanyId}` && view === "company") || (item.key === `project-${selectedProjectId}` && view === "project");
            return (
              <button key={item.key} type="button" className={`work-mobile-nav__item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={item.onClick}>
                <span className="work-mobile-nav__icon">{item.icon}</span>
                <span className="work-mobile-nav__label">{item.label}</span>
                {item.meta !== undefined && <span className="work-mobile-nav__meta">{item.meta}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    );
  };

  return (
    <ModuleShell
      className="work-module"
      pageWidth="wide"
      ambient={{ scene: "work", progress: workspace.tasks.length ? workspace.tasks.filter((task) => getTaskStatus(task) === "completed").length / workspace.tasks.length : 0 }}
      header={(
        <PageHeader
          title="Praca"
          description="Dzisiaj, terminy i projekty w jednym miejscu"
          actions={(
            <div className="work-add-menu">
              <MenuTrigger ref={addTriggerRef} open={addMenuOpen} menuId="work-add-menu" className="ui-button ui-button--primary" onClick={() => setAddMenuOpen((current) => !current)}><Plus size={13} /> Dodaj</MenuTrigger>
              {addMenuOpen && (
                <Menu id="work-add-menu" className="work-add-menu__panel" triggerRef={addTriggerRef} onDismiss={() => setAddMenuOpen(false)}>
                  <MenuItem leadingIcon={<Building2 size={14} />} onClick={() => { setAddMenuOpen(false); openCompanyEditor(); }}>Nowa firma</MenuItem>
                  <MenuItem leadingIcon={<FolderKanban size={14} />} onClick={() => { setAddMenuOpen(false); openProjectEditor(); }}>Nowy projekt</MenuItem>
                  <MenuItem leadingIcon={<ListTree size={14} />} onClick={() => { setAddMenuOpen(false); openTaskEditor(); }}>Nowe zadanie</MenuItem>
                </Menu>
              )}
            </div>
          )}
        />
      )}
      contextSidebar={sidebar}
      detailPanel={detailTask ? (
        <DetailPanel label="Szczegóły zadania" onDismiss={() => setDetailTaskId(null)} className="work-detail-panel">
          <header className="work-detail-header"><div><span className="work-detail-kicker">Zadanie</span><h2>{detailTask.title}</h2></div><Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={() => setDetailTaskId(null)}><X size={14} /></Button></header>
          <div className="work-detail-body">
            <div className="work-detail-context">
              <span>{detailTaskCompany?.name ?? "Nieprzypisane"}</span>
              <strong>{detailTaskProject?.name ?? "Bez projektu"}</strong>
              {detailTaskContext?.parentLabel && (
                <span className="work-detail-context__parent"><CornerDownRight size={13} aria-hidden="true" />{detailTaskContext.parentLabel}</span>
              )}
              {detailTaskProject && (
                <Button
                  className="work-detail-project-link"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  leadingIcon={<FolderKanban size={13} aria-hidden="true" />}
                  trailingIcon={<ChevronRight size={13} aria-hidden="true" />}
                  onClick={() => navigate("project", detailTaskProject.companyId, detailTaskProject.id)}
                >
                  Otwórz projekt
                </Button>
              )}
            </div>
            <div className="work-detail-facts" aria-label="Informacje o zadaniu">
              <div><span>Typ</span><strong>{detailTaskParent ? "Podzadanie" : "Zadanie główne"}</strong></div>
              <div><span>Utworzono</span><strong>{formatDate(detailTask.createdAt.slice(0, 10))}</strong></div>
            </div>
            <div className="work-detail-fields">
              <Select label="Status" value={getTaskStatus(detailTask)} options={TASK_STATUS_ORDER.map((status) => ({ value: status, label: TASK_STATUS_LABELS[status] }))} onChange={(event) => applyTaskStatuses([detailTask.id], event.target.value as WorkTaskStatus, `Status: ${TASK_STATUS_LABELS[event.target.value as WorkTaskStatus]}`)} />
              <Select label="Priorytet" value={detailTask.priority} options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }))} onChange={(event) => { setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === detailTask.id ? { ...task, priority: event.target.value as WorkTaskPriority } : task) })); showSaveNotice(); }} />
              <div className="work-detail-date-grid"><Input type="date" label="Start" value={detailTask.startDate ?? ""} max={detailTask.dueDate || undefined} onChange={(event) => { setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === detailTask.id ? { ...task, startDate: event.target.value } : task) })); showSaveNotice(); }} /><Input type="date" label="Termin" value={detailTask.dueDate} min={detailTask.startDate || undefined} onChange={(event) => { setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === detailTask.id ? { ...task, dueDate: event.target.value } : task) })); showSaveNotice(); }} /></div>
              <label className="ui-field"><span className="ui-field__label">Notatka</span><textarea className="ui-field__control work-detail-note" value={detailTask.note ?? ""} placeholder="Krótka notatka" onChange={(event) => { setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === detailTask.id ? { ...task, note: event.target.value } : task) })); showSaveNotice(); }} /></label>
            </div>
            {detailTaskDescendantRows.length > 0 && detailTaskProgress !== null && (
              <section className="work-detail-subtasks" aria-label="Podzadania">
                <button
                  type="button"
                  className="work-detail-subtasks__header"
                  aria-expanded={detailSubtasksExpanded}
                  aria-controls="work-detail-subtask-list"
                  onClick={() => setDetailSubtasksExpanded((current) => !current)}
                >
                  <span className="work-detail-subtasks__header-copy"><span>Podzadania</span><strong>{formatSubtaskProgress(detailTaskCompletedDescendants, detailTaskDescendants.length)}</strong></span>
                  <span className="work-detail-subtasks__header-side"><span>{detailTaskProgress}%</span>{detailSubtasksExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</span>
                </button>
                <div id="work-detail-subtask-list">
                  {detailSubtasksExpanded && (
                    <>
                      <div className="work-detail-subtasks__progress" role="progressbar" aria-label="Postęp podzadań" aria-valuemin={0} aria-valuemax={100} aria-valuenow={detailTaskProgress}>
                        <span style={{ width: `${detailTaskProgress}%` }} />
                      </div>
                      <div className="work-detail-subtask-list">
                        {detailTaskDescendantRows.map(({ task: child, depth }) => {
                          const childStatus = getTaskStatus(child);
                          const childDate = child.dueDate || child.startDate;
                          return (
                            <button
                              key={child.id}
                              type="button"
                              className="work-detail-subtask"
                              style={{ "--work-subtask-depth": depth } as CSSProperties}
                              title={child.title}
                              onClick={() => toggleTaskDetails(child.id)}
                            >
                              <span className={`work-detail-subtask__status ${taskStatusTone(childStatus)}`}>{taskStatusIcon(childStatus)}</span>
                              <span className="work-detail-subtask__title">{child.title}</span>
                              <span className={`work-detail-subtask__label ${taskStatusTone(childStatus)}`}>{TASK_STATUS_LABELS[childStatus]}</span>
                              <span className={`work-detail-subtask__date ${childDate ? "is-set" : "is-empty"}`}>{childDate ? formatDate(childDate) : "Bez terminu"}</span>
                              <ChevronRight size={13} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
          <footer className="work-detail-footer">
            <span className={`work-detail-save-status ${saveStatus === "saved" ? "is-saved" : saveStatus === "saving" ? "is-saving" : ""}`} role="status" aria-live="polite">
              {saveStatus === "saving" ? "Zapisywanie…" : saveStatus === "saved" ? <><Check size={12} aria-hidden="true" /> Zapisano</> : "Autozapis lokalny"}
            </span>
            <Button className="work-detail-delete" variant="danger" leadingIcon={<Trash2 size={13} />} onClick={() => setDeleteState({ kind: "task", id: detailTask.id, name: detailTask.title })}>Usuń</Button>
          </footer>
        </DetailPanel>
      ) : undefined}
    >
      <ModuleMain>
        {storageError && <div className="work-storage-error" role="alert">Nie udało się zapisać zmian lokalnie. Sprawdź ustawienia pamięci przeglądarki.</div>}
        {renderToolbar()}
        {renderMobileContextNav()}
        <div className="work-main-scroll">{renderMainView()}</div>
      </ModuleMain>

      {editor && (
        <Modal title={editorTitle} description={editorDescription} eyebrow={editor.kind === "company" ? "Firma" : editor.kind === "project" ? "Projekt" : "Zadanie"} onClose={closeEditor} footer={<><Button variant="ghost" onClick={closeEditor}>Anuluj</Button><Button variant="primary" type="submit" form="work-editor-form">{editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"}</Button></>}>
          <form id="work-editor-form" className="work-editor-form" onSubmit={submitEditor}>
            <Input label={editor.kind === "task" ? "Nazwa zadania" : "Nazwa"} value={draft.name} error={editorError} autoFocus placeholder={editor.kind === "company" ? "np. Studio North" : editor.kind === "project" ? "np. Nowa strona" : "Co trzeba zrobić?"} onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); if (editorError) setEditorError(""); }} />

            {editor.kind === "company" && <><label className="ui-field"><span className="ui-field__label">Opis <span className="work-optional">opcjonalnie</span></span><textarea className="ui-field__control work-textarea" value={draft.description} placeholder="Czym zajmuje się ta firma?" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><fieldset className="work-color-field"><legend>Kolor firmy</legend><div>{COMPANY_COLORS.map((color) => <button key={color} type="button" className={draft.color === color ? "is-selected" : ""} style={{ background: color }} aria-label={`Wybierz kolor ${color}`} aria-pressed={draft.color === color} onClick={() => setDraft((current) => ({ ...current, color }))}>{draft.color === color && <Check size={12} />}</button>)}</div></fieldset></>}

            {editor.kind === "project" && (
              <>
                <Select
                  label="Firma"
                  value={draft.companyId}
                  options={workspace.companies.map((company) => ({ value: company.id, label: company.name }))}
                  onChange={(event) => setDraft((current) => ({ ...current, companyId: event.target.value }))}
                />
                <label className="ui-field">
                  <span className="ui-field__label">Opis <span className="work-optional">opcjonalnie</span></span>
                  <textarea className="ui-field__control work-textarea" value={draft.description} placeholder="Krótki opis widoczny na liście projektów" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                  <p className="ui-field__hint">Krótki opis widoczny na liście projektów.</p>
                </label>
                <Select
                  label="Status"
                  value={draft.projectStatus}
                  options={Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={(event) => setDraft((current) => ({ ...current, projectStatus: event.target.value as WorkProjectStatus }))}
                />
                <div className="work-editor-grid work-editor-grid--dates">
                  <Input type="date" label="Start" value={draft.startDate} max={draft.endDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
                  <Input type="date" label="Termin końcowy" value={draft.endDate} min={draft.startDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
                </div>
                <label className="ui-field">
                  <span className="ui-field__label">Notatka wewnętrzna <span className="work-optional">opcjonalnie</span></span>
                  <textarea className="ui-field__control work-textarea" value={draft.note} placeholder="Informacje niewidoczne w skróconym widoku" onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
                  <p className="ui-field__hint">Dodatkowy kontekst dostępny po otwarciu projektu.</p>
                </label>
              </>
            )}

            {editor.kind === "task" && <><Select label="Projekt" value={draft.projectId} options={projectOptions} onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value, parentId: "" }))} /><Select label="Podzadanie" value={draft.parentId} options={parentOptions} disabled={!draft.projectId} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))} /><div className="work-editor-grid"><Select label="Status" value={draft.taskStatus} options={TASK_STATUS_ORDER.map((status) => ({ value: status, label: TASK_STATUS_LABELS[status] }))} onChange={(event) => setDraft((current) => ({ ...current, taskStatus: event.target.value as WorkTaskStatus }))} /><Select label="Priorytet" value={draft.priority} options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }))} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as WorkTaskPriority }))} /><Input type="date" label="Start" value={draft.startDate} max={draft.endDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} /><Input type="date" label="Termin" value={draft.endDate} min={draft.startDate || undefined} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} /></div><label className="ui-field"><span className="ui-field__label">Notatka <span className="work-optional">opcjonalnie</span></span><textarea className="ui-field__control work-textarea" value={draft.note} placeholder="Zwykła notatka do zadania" onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label></>}
          </form>
        </Modal>
      )}

      {deleteState && <Modal title={`Usuń ${deleteState.kind === "company" ? "firmę" : deleteState.kind === "project" ? "projekt" : "zadanie"}?`} description={deleteState.kind === "company" ? `Firma „${deleteState.name}” zostanie usunięta razem ze wszystkimi projektami i zadaniami.` : deleteState.kind === "project" ? `Projekt „${deleteState.name}” zostanie usunięty razem ze wszystkimi zadaniami.` : `Zadanie „${deleteState.name}” zostanie usunięte razem ze wszystkimi podzadaniami.`} eyebrow="Potwierdzenie" onClose={() => setDeleteState(null)} footer={<><Button variant="ghost" onClick={() => setDeleteState(null)}>Anuluj</Button><Button variant="danger" onClick={confirmDelete}>Usuń</Button></>}><p className="work-delete-note">Tej operacji nie można cofnąć.</p></Modal>}
    </ModuleShell>
  );
}
