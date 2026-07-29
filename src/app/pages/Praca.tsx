/**
 * THESIS: Praca is a personal outline, not a team dashboard; it refuses boards full of assignees and reporting chrome.
 * OWN-WORLD: Routine's graphite workshop, compact rows, quiet borders, and precision blue reserved for selection and action.
 * STORY: Scan all work, choose a company, then turn one project's work into a clear tree with unlimited branches.
 * FIRST VIEWPORT: One local rail holds overview and an expanded company-project tree; the task outline owns the canvas.
 * FORM: A two-navigation-layer personal workspace refined from seed c87cae68.
 */
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Flag,
  FolderKanban,
  LayoutDashboard,
  ListTree,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { subscribeToLocalWorkspace } from "../data/localRepository";
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
} from "../data/workWorkspace";
import { formatShortDate } from "../formatters";
import {
  Button,
  ContextNavItem,
  ContextSidebar,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  Select,
  WorkspaceToolbar,
  AddToTasksButton,
} from "../ui";
import "../../styles/work.css";

const COMPANY_COLORS = ["#7FA6C9", "#79A8A4", "#B9A171", "#9B8CE8", "#BC8EA5", "#8793A1"];

const PROJECT_STATUS_LABELS: Record<WorkProjectStatus, string> = {
  active: "Aktywny",
  paused: "Wstrzymany",
  completed: "Zakończony",
};

const PRIORITY_LABELS: Record<WorkTaskPriority, string> = {
  none: "Bez priorytetu",
  low: "Niski",
  medium: "Średni",
  high: "Wysoki",
};

type EditorState =
  | { kind: "company"; mode: "add" | "edit"; id?: string }
  | { kind: "project"; mode: "add" | "edit"; id?: string }
  | { kind: "task"; mode: "add" | "edit"; id?: string; parentId?: string | null };

type DeleteState = {
  kind: "company" | "project" | "task";
  id: string;
  name: string;
};

type CascadeState = {
  taskId: string;
  taskTitle: string;
  branchIds: string[];
};

type CompletionUndo = {
  label: string;
  previous: Array<{ id: string; completed: boolean }>;
};

type EditorDraft = {
  name: string;
  description: string;
  color: string;
  status: WorkProjectStatus;
  priority: WorkTaskPriority;
  dueDate: string;
  parentId: string;
};

const EMPTY_DRAFT: EditorDraft = {
  name: "",
  description: "",
  color: COMPANY_COLORS[0],
  status: "active",
  priority: "none",
  dueDate: "",
  parentId: "",
};

function formatDueDate(value: string): string {
  if (!value) return "";
  const formatted = formatShortDate(value);
  return formatted === "—" ? value : formatted;
}

function collectTaskBranch(tasks: WorkTask[], taskId: string): Set<string> {
  const branch = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach((task) => {
      if (task.parentId && branch.has(task.parentId) && !branch.has(task.id)) {
        branch.add(task.id);
        changed = true;
      }
    });
  }
  return branch;
}

function taskDepth(task: WorkTask, tasks: WorkTask[]): number {
  let depth = 0;
  let parentId = task.parentId;
  const visited = new Set<string>();
  while (parentId && depth < 24 && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = tasks.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId;
  }
  return depth;
}

function getInitialWorkUrlState() {
  if (typeof window === "undefined") {
    return { companyId: "", projectId: "", search: "", showCompleted: false };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    companyId: params.get("firma") ?? "",
    projectId: params.get("projekt") ?? "",
    search: params.get("q") ?? "",
    showCompleted: params.get("ukonczone") === "1",
  };
}

export default function Praca() {
  const [initialUrlState] = useState(getInitialWorkUrlState);
  const [workspace, setWorkspace] = useState(loadWorkWorkspace);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialUrlState.companyId);
  const [selectedProjectId, setSelectedProjectId] = useState(initialUrlState.projectId);
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<Set<string>>(
    () => new Set(workspace.companies.map((company) => company.id)),
  );
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState(initialUrlState.search);
  const [showCompleted, setShowCompleted] = useState(initialUrlState.showCompleted);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [cascadeState, setCascadeState] = useState<CascadeState | null>(null);
  const [completionUndo, setCompletionUndo] = useState<CompletionUndo | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setStorageError(!saveWorkWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(WORK_STORAGE_KEY, () => {
    setWorkspace(loadWorkWorkspace());
  }), []);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getInitialWorkUrlState();
      setSelectedCompanyId(next.companyId);
      setSelectedProjectId(next.projectId);
      setSearch(next.search);
      setShowCompleted(next.showCompleted);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedCompanyId) url.searchParams.set("firma", selectedCompanyId);
    else url.searchParams.delete("firma");
    if (selectedProjectId) url.searchParams.set("projekt", selectedProjectId);
    else url.searchParams.delete("projekt");
    if (search.trim()) url.searchParams.set("q", search);
    else url.searchParams.delete("q");
    if (showCompleted) url.searchParams.set("ukonczone", "1");
    else url.searchParams.delete("ukonczone");
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
  }, [search, selectedCompanyId, selectedProjectId, showCompleted]);

  useEffect(() => {
    if (!selectedCompanyId || workspace.companies.some((company) => company.id === selectedCompanyId)) return;
    setSelectedCompanyId("");
    setSelectedProjectId("");
  }, [selectedCompanyId, workspace.companies]);

  const companyProjects = useMemo(
    () => workspace.projects.filter((project) => project.companyId === selectedCompanyId),
    [selectedCompanyId, workspace.projects],
  );

  useEffect(() => {
    if (companyProjects.some((project) => project.id === selectedProjectId)) return;
    setSelectedProjectId(companyProjects[0]?.id ?? "");
  }, [companyProjects, selectedProjectId]);

  const selectedCompany = workspace.companies.find((company) => company.id === selectedCompanyId);
  const isOverview = !selectedCompany;
  const selectedProject = workspace.projects.find(
    (project) => project.id === selectedProjectId && project.companyId === selectedCompanyId,
  );
  const activeProjectId = selectedProject?.id ?? "";
  const projectTasks = useMemo(
    () => workspace.tasks.filter((task) => task.projectId === activeProjectId),
    [activeProjectId, workspace.tasks],
  );

  const tasksByParent = useMemo(() => {
    const map = new Map<string | null, WorkTask[]>();
    projectTasks.forEach((task) => {
      const parentId = projectTasks.some((candidate) => candidate.id === task.parentId) ? task.parentId : null;
      const bucket = map.get(parentId) ?? [];
      bucket.push(task);
      map.set(parentId, bucket);
    });
    map.forEach((tasks) => tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [projectTasks]);

  const visibleTaskIds = useMemo(() => {
    const result = new Set<string>();
    const query = search.trim().toLocaleLowerCase("pl-PL");

    const visit = (task: WorkTask): boolean => {
      let childVisible = false;
      (tasksByParent.get(task.id) ?? []).forEach((child) => {
        if (visit(child)) childVisible = true;
      });
      const passesCompletion = showCompleted || !task.completed;
      const passesSearch = !query || task.title.toLocaleLowerCase("pl-PL").includes(query);
      const visible = (passesCompletion && passesSearch) || childVisible;
      if (visible) result.add(task.id);
      return visible;
    };

    (tasksByParent.get(null) ?? []).forEach(visit);
    return result;
  }, [search, showCompleted, tasksByParent]);

  const completedCount = projectTasks.filter((task) => task.completed).length;
  const progress = projectTasks.length ? Math.round((completedCount / projectTasks.length) * 100) : 0;

  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, { completed: number; total: number }>();
    workspace.projects.forEach((project) => counts.set(project.id, { completed: 0, total: 0 }));
    workspace.tasks.forEach((task) => {
      const count = counts.get(task.projectId);
      if (!count) return;
      count.total += 1;
      if (task.completed) count.completed += 1;
    });
    return counts;
  }, [workspace.projects, workspace.tasks]);

  const activeProjectIds = useMemo(
    () => new Set(workspace.projects.filter((project) => project.status === "active").map((project) => project.id)),
    [workspace.projects],
  );
  const activeOpenTasks = useMemo(
    () => workspace.tasks.filter((task) => activeProjectIds.has(task.projectId) && !task.completed),
    [activeProjectIds, workspace.tasks],
  );

  const companyProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    workspace.companies.forEach((company) => counts.set(company.id, 0));
    workspace.projects.forEach((project) => counts.set(project.companyId, (counts.get(project.companyId) ?? 0) + 1));
    return counts;
  }, [workspace.companies, workspace.projects]);

  const companySummaries = useMemo(() => {
    return new Map(workspace.companies.map((company) => {
      const projects = workspace.projects.filter((project) => project.companyId === company.id);
      const projectIds = new Set(projects.filter((project) => project.status === "active").map((project) => project.id));
      const tasks = workspace.tasks.filter((task) => projectIds.has(task.projectId));
      const completed = tasks.filter((task) => task.completed).length;
      return [company.id, {
        projects,
        totalTasks: tasks.length,
        openTasks: tasks.length - completed,
        progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      }];
    }));
  }, [workspace.companies, workspace.projects, workspace.tasks]);

  const overviewTasks = useMemo(() => {
    const priorityRank: Record<WorkTaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
    return activeOpenTasks
      .slice()
      .sort((a, b) => {
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate !== b.dueDate) return a.dueDate ? -1 : 1;
        if (priorityRank[a.priority] !== priorityRank[b.priority]) {
          return priorityRank[a.priority] - priorityRank[b.priority];
        }
        return a.createdAt.localeCompare(b.createdAt);
      })
      .slice(0, 6);
  }, [activeOpenTasks]);

  const overviewProjects = useMemo(() => {
    return workspace.projects
      .filter((project) => project.status === "active")
      .sort((a, b) => {
        const aCount = projectTaskCounts.get(a.id) ?? { completed: 0, total: 0 };
        const bCount = projectTaskCounts.get(b.id) ?? { completed: 0, total: 0 };
        return (bCount.total - bCount.completed) - (aCount.total - aCount.completed);
      })
      .slice(0, 6);
  }, [projectTaskCounts, workspace.projects]);

  const openCompanyEditor = (company?: WorkCompany) => {
    setDraft(company
      ? { ...EMPTY_DRAFT, name: company.name, description: company.description, color: company.color }
      : { ...EMPTY_DRAFT, color: COMPANY_COLORS[workspace.companies.length % COMPANY_COLORS.length] });
    setEditorError("");
    setEditor({ kind: "company", mode: company ? "edit" : "add", id: company?.id });
  };

  const pushWorkLocation = (companyId: string, projectId: string) => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("firma", companyId);
    else url.searchParams.delete("firma");
    if (projectId) url.searchParams.set("projekt", projectId);
    else url.searchParams.delete("projekt");
    url.searchParams.delete("q");
    window.history.pushState({}, "", url);
  };

  const selectCompany = (companyId: string) => {
    const projectId = workspace.projects.find((project) => project.companyId === companyId)?.id ?? "";
    setSelectedCompanyId(companyId);
    setSelectedProjectId(projectId);
    setSearch("");
    pushWorkLocation(companyId, projectId);
  };

  const selectProject = (companyId: string, projectId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedProjectId(projectId);
    setSearch("");
    pushWorkLocation(companyId, projectId);
  };

  const toggleCompanyExpanded = (companyId: string) => {
    setExpandedCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const showOverview = () => {
    setSelectedCompanyId("");
    setSelectedProjectId("");
    setSearch("");
    pushWorkLocation("", "");
  };

  const openProjectEditor = (project?: WorkProject) => {
    setDraft(project
      ? {
          ...EMPTY_DRAFT,
          name: project.name,
          description: project.description,
          status: project.status,
        }
      : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "project", mode: project ? "edit" : "add", id: project?.id });
  };

  const openTaskEditor = (task?: WorkTask, parentId: string | null = null) => {
    setDraft(task
      ? {
          ...EMPTY_DRAFT,
          name: task.title,
          priority: task.priority,
          dueDate: task.dueDate,
          parentId: task.parentId ?? "",
        }
      : { ...EMPTY_DRAFT, parentId: parentId ?? "" });
    setEditorError("");
    setEditor({ kind: "task", mode: task ? "edit" : "add", id: task?.id, parentId });
  };

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

    if (editor.kind === "company") {
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          companies: current.companies.map((company) => company.id === editor.id
            ? { ...company, name, description: draft.description.trim(), color: draft.color }
            : company),
        }));
      } else {
        const id = createWorkId("company");
        setWorkspace((current) => ({
          ...current,
          companies: [...current.companies, { id, name, description: draft.description.trim(), color: draft.color }],
        }));
        setExpandedCompanyIds((current) => new Set(current).add(id));
        selectCompany(id);
      }
    }

    if (editor.kind === "project" && selectedCompanyId) {
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          projects: current.projects.map((project) => project.id === editor.id
            ? { ...project, name, description: draft.description.trim(), status: draft.status }
            : project),
        }));
      } else {
        const id = createWorkId("project");
        setWorkspace((current) => ({
          ...current,
          projects: [...current.projects, {
            id,
            companyId: selectedCompanyId,
            name,
            description: draft.description.trim(),
            status: draft.status,
          }],
        }));
        setSelectedProjectId(id);
      }
    }

    if (editor.kind === "task" && selectedProjectId) {
      if (editor.mode === "edit" && editor.id) {
        setWorkspace((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === editor.id
            ? {
                ...task,
                title: name,
                priority: draft.priority,
                dueDate: draft.dueDate,
                parentId: draft.parentId || null,
              }
            : task),
        }));
      } else {
        const id = createWorkId("task");
        setWorkspace((current) => ({
          ...current,
          tasks: [...current.tasks, {
            id,
            projectId: selectedProjectId,
            parentId: draft.parentId || null,
            title: name,
            completed: false,
            priority: draft.priority,
            dueDate: draft.dueDate,
            createdAt: new Date().toISOString(),
          }],
        }));
        if (draft.parentId) {
          setCollapsedTaskIds((current) => {
            const next = new Set(current);
            next.delete(draft.parentId);
            return next;
          });
        }
      }
    }

    closeEditor();
  };

  const confirmDelete = () => {
    if (!deleteState) return;

    if (deleteState.kind === "company") {
      const projectIds = new Set(
        workspace.projects.filter((project) => project.companyId === deleteState.id).map((project) => project.id),
      );
      setWorkspace((current) => ({
        ...current,
        companies: current.companies.filter((company) => company.id !== deleteState.id),
        projects: current.projects.filter((project) => !projectIds.has(project.id)),
        tasks: current.tasks.filter((task) => !projectIds.has(task.projectId)),
      }));
    }

    if (deleteState.kind === "project") {
      setWorkspace((current) => ({
        ...current,
        projects: current.projects.filter((project) => project.id !== deleteState.id),
        tasks: current.tasks.filter((task) => task.projectId !== deleteState.id),
      }));
    }

    if (deleteState.kind === "task") {
      const branch = collectTaskBranch(workspace.tasks, deleteState.id);
      setWorkspace((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => !branch.has(task.id)),
      }));
    }

    setDeleteState(null);
  };

  const applyTaskCompletion = (taskIds: string[], completed: boolean, label: string) => {
    const idSet = new Set(taskIds);
    const previous = workspace.tasks
      .filter((candidate) => idSet.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, completed: candidate.completed }));
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((candidate) => idSet.has(candidate.id)
        ? { ...candidate, completed }
        : candidate),
    }));
    setCompletionUndo({ label, previous });
  };

  const toggleTask = (task: WorkTask) => {
    if (task.completed) {
      applyTaskCompletion([task.id], false, `Przywrócono „${task.title}”`);
      return;
    }
    const branch = collectTaskBranch(projectTasks, task.id);
    if (branch.size > 1) {
      setCascadeState({
        taskId: task.id,
        taskTitle: task.title,
        branchIds: Array.from(branch),
      });
      return;
    }
    applyTaskCompletion([task.id], true, `Ukończono „${task.title}”`);
  };

  const confirmCascadeCompletion = () => {
    if (!cascadeState) return;
    applyTaskCompletion(
      cascadeState.branchIds,
      true,
      `Ukończono „${cascadeState.taskTitle}” i ${cascadeState.branchIds.length - 1} podzadań`,
    );
    setCascadeState(null);
  };

  const undoCompletionChange = () => {
    if (!completionUndo) return;
    const previous = new Map(completionUndo.previous.map((item) => [item.id, item.completed]));
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) => previous.has(task.id)
        ? { ...task, completed: previous.get(task.id) ?? task.completed }
        : task),
    }));
    setCompletionUndo(null);
  };

  const toggleCollapsed = (taskId: string) => {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const editorTitle = editor?.kind === "company"
    ? `${editor.mode === "edit" ? "Edytuj" : "Nowa"} firma`
    : editor?.kind === "project"
      ? `${editor.mode === "edit" ? "Edytuj" : "Nowy"} projekt`
      : `${editor?.mode === "edit" ? "Edytuj" : "Nowe"} zadanie`;

  const editorDescription = editor?.kind === "company"
    ? "Firma porządkuje powiązane projekty."
    : editor?.kind === "project"
      ? `Projekt zostanie przypisany do firmy ${selectedCompany?.name ?? ""}.`
      : editor?.parentId
        ? "Podzadanie pojawi się bezpośrednio pod wybranym zadaniem."
        : "Dodaj zadanie do bieżącego projektu.";

  const unavailableParentIds = editor?.kind === "task" && editor.id
    ? collectTaskBranch(projectTasks, editor.id)
    : new Set<string>();

  const parentOptions = [
    { value: "", label: "Brak — zadanie główne" },
    ...projectTasks
      .filter((task) => !unavailableParentIds.has(task.id))
      .map((task) => ({
        value: task.id,
        label: `${"— ".repeat(taskDepth(task, projectTasks))}${task.title}`,
      })),
  ];

  const renderTask = (task: WorkTask, depth: number): ReactNode => {
    if (!visibleTaskIds.has(task.id)) return null;
    const children = tasksByParent.get(task.id) ?? [];
    const visibleChildren = children.filter((child) => visibleTaskIds.has(child.id));
    const hasChildren = children.length > 0;
    const collapsed = collapsedTaskIds.has(task.id) && !search.trim();
    const rowStyle = { "--work-task-indent": `${depth * 24}px` } as CSSProperties;

    return (
      <div key={task.id} className="work-task-branch">
        <div className={`work-task-row ${task.completed ? "is-completed" : ""}`} style={rowStyle}>
          <button
            type="button"
            className="work-task-row__disclosure"
            aria-label={collapsed ? "Rozwiń podzadania" : "Zwiń podzadania"}
            aria-expanded={hasChildren ? !collapsed : undefined}
            disabled={!hasChildren}
            onClick={() => toggleCollapsed(task.id)}
          >
            {hasChildren && (collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />)}
          </button>
          <button
            type="button"
            className="work-task-check"
            aria-label={task.completed ? `Oznacz „${task.title}” jako niezrobione` : `Oznacz „${task.title}” jako zrobione`}
            aria-pressed={task.completed}
            onClick={() => toggleTask(task)}
          >
            {task.completed && <Check size={11} strokeWidth={2.4} />}
          </button>
          <button type="button" className="work-task-row__title" onClick={() => openTaskEditor(task)}>
            {task.title}
          </button>
          <div className="work-task-row__meta">
            {task.priority !== "none" && (
              <span className={`work-task-priority work-task-priority--${task.priority}`}>
                <Flag size={11} aria-hidden="true" />
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            {task.dueDate && (
              <span className="work-task-date">
                <CalendarDays size={11} aria-hidden="true" />
                {formatDueDate(task.dueDate)}
              </span>
            )}
          </div>
          <div className="work-task-row__actions">
            <AddToTasksButton
              compact
              input={{
                source: {
                  kind: "work",
                  entity: `${encodeURIComponent(task.projectId)}/${encodeURIComponent(task.id)}`,
                  context: `${selectedCompany?.name ?? "Praca"} · ${selectedProject?.name ?? "Projekt"}`,
                  href: `/praca?firma=${encodeURIComponent(selectedCompanyId)}&projekt=${encodeURIComponent(task.projectId)}`,
                },
                text: task.title,
                done: task.completed,
                calendarDate: task.dueDate || undefined,
                date: task.dueDate || undefined,
                priority: task.priority === "none" ? undefined : task.priority,
                list: "praca",
                tags: ["praca"],
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Dodaj podzadanie do „${task.title}”`}
              title="Dodaj podzadanie"
              onClick={() => openTaskEditor(undefined, task.id)}
            >
              <Plus size={13} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Edytuj „${task.title}”`}
              title="Edytuj zadanie"
              onClick={() => openTaskEditor(task)}
            >
              <Pencil size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Usuń „${task.title}”`}
              title="Usuń zadanie"
              onClick={() => setDeleteState({ kind: "task", id: task.id, name: task.title })}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
        {!collapsed && visibleChildren.map((child) => renderTask(child, depth + 1))}
      </div>
    );
  };

  return (
    <ModuleShell
      className="work-module"
      pageWidth="wide"
      header={(
        <PageHeader
          title="Praca"
          description="Firmy, projekty i zadania w jednym osobistym widoku"
          leading={<Building2 size={16} />}
          actions={selectedCompany ? (
            <>
              <Button variant="quiet" leadingIcon={<Plus size={13} />} onClick={() => openCompanyEditor()}>
                <span className="header-action-label">Dodaj firmę</span>
              </Button>
              <Button
                variant="primary"
                leadingIcon={<Plus size={13} />}
                onClick={() => openProjectEditor()}
              >
                <span className="header-action-label">Dodaj projekt</span>
              </Button>
            </>
          ) : (
            <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openCompanyEditor()}>
              <span className="header-action-label">Dodaj firmę</span>
            </Button>
          )}
        />
      )}
      contextSidebar={(
        <ContextSidebar label="Nawigacja pracy" className="work-company-sidebar">
          <nav className="work-company-list" aria-label="Widoki pracy i firmy">
            <p className="work-sidebar-section-label">Główne</p>
            <ContextNavItem
              active={isOverview}
              icon={<LayoutDashboard />}
              label="Przegląd"
              meta={workspace.companies.length}
              onClick={showOverview}
            />
            <p className="work-sidebar-section-label work-sidebar-section-label--spaced">Firmy</p>
            {workspace.companies.map((company) => {
              const projects = workspace.projects.filter((project) => project.companyId === company.id);
              const expanded = expandedCompanyIds.has(company.id);
              const active = company.id === selectedCompanyId;
              return (
                <div key={company.id} className="work-company-tree-group">
                  <ContextNavItem
                    active={active && !selectedProjectId}
                    aria-expanded={expanded}
                    aria-label={expanded ? `Zwiń firmę ${company.name}` : `Rozwiń firmę ${company.name}`}
                    icon={expanded ? <ChevronDown /> : <ChevronRight />}
                    label={company.name}
                    meta={companyProjectCounts.get(company.id) ?? 0}
                    onClick={() => toggleCompanyExpanded(company.id)}
                  />
                  {expanded && (
                    <div className="work-project-tree" role="group" aria-label={`Projekty firmy ${company.name}`}>
                      {projects.map((project, projectIndex) => {
                        const count = projectTaskCounts.get(project.id) ?? { completed: 0, total: 0 };
                        const shadeStrength = 92 - (projectIndex % 5) * 13;
                        return (
                          <ContextNavItem
                            key={project.id}
                            active={project.id === selectedProjectId}
                            aria-current={project.id === selectedProjectId ? "page" : undefined}
                            icon={(
                              <span
                                className="work-project-tree__status"
                                style={{
                                  background: `color-mix(in srgb, ${company.color} ${shadeStrength}%, var(--color-chalk-white))`,
                                }}
                              />
                            )}
                            label={project.name}
                            meta={`${count.completed}/${count.total}`}
                            onClick={() => selectProject(company.id, project.id)}
                          />
                        );
                      })}
                      {projects.length === 0 && (
                        <ContextNavItem
                          icon={<Plus />}
                          label="Dodaj projekt"
                          onClick={() => {
                            setSelectedCompanyId(company.id);
                            setSelectedProjectId("");
                            openProjectEditor();
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {workspace.companies.length === 0 && (
            <p className="work-sidebar-empty">Dodaj pierwszą firmę, aby rozpocząć pracę z projektami.</p>
          )}
          {selectedCompany && (
            <div className="work-sidebar-footer">
              <div>
                <span style={{ background: selectedCompany.color }} />
                <p>{selectedCompany.description || "Bez opisu"}</p>
              </div>
              <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj wybraną firmę" onClick={() => openCompanyEditor(selectedCompany)}>
                <Pencil size={12} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Usuń wybraną firmę"
                onClick={() => setDeleteState({ kind: "company", id: selectedCompany.id, name: selectedCompany.name })}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          )}
        </ContextSidebar>
      )}
    >
      <ModuleMain>
        {storageError && (
          <div className="work-storage-error" role="alert">
            Nie udało się zapisać zmian lokalnie. Sprawdź ustawienia pamięci przeglądarki.
          </div>
        )}

        {isOverview ? (
          <section className="work-overview" aria-labelledby="work-overview-title">
            <header className="work-overview__header">
              <div>
                <h2 id="work-overview-title">Przegląd pracy</h2>
                <p>
                  Firmy {workspace.companies.length} · Projekty {workspace.projects.length} · Otwarte zadania{" "}
                  {activeOpenTasks.length}
                </p>
              </div>
            </header>

            {workspace.companies.length === 0 ? (
              <EmptyState
                icon={<Building2 size={18} />}
                title="Dodaj pierwszą firmę"
                description="Przegląd zbierze tutaj wszystkie firmy, ich projekty i liczbę otwartych zadań."
                action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openCompanyEditor()}>Dodaj firmę</Button>}
              />
            ) : (
              <>
                <div className="work-overview-table">
                  <div className="work-overview-table__head" aria-hidden="true">
                    <span>Firma</span>
                    <span>Projekty</span>
                    <span>Otwarte</span>
                    <span>Postęp</span>
                    <span />
                  </div>
                  <div className="work-overview-table__body">
                    {workspace.companies.map((company) => {
                      const summary = companySummaries.get(company.id);
                      const projectNames = summary?.projects.map((project) => project.name) ?? [];
                      return (
                        <button
                          key={company.id}
                          type="button"
                          className="work-overview-row"
                          onClick={() => selectCompany(company.id)}
                        >
                          <span className="work-overview-row__company">
                            <i style={{ background: company.color }} />
                            <span>
                              <strong>{company.name}</strong>
                              <small>{company.description || "Bez opisu"}</small>
                            </span>
                          </span>
                          <span className="work-overview-row__projects">
                            <strong>{summary?.projects.length ?? 0}</strong>
                            <small>{projectNames.length ? projectNames.slice(0, 2).join(" · ") : "Brak projektów"}</small>
                          </span>
                          <span className="work-overview-row__open">
                            <strong>{summary?.openTasks ?? 0}</strong>
                            <small>z {summary?.totalTasks ?? 0} zadań</small>
                          </span>
                          <span
                            className="work-overview-row__progress"
                            role="progressbar"
                            aria-label={`Postęp firmy ${company.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={summary?.progress ?? 0}
                          >
                            <span><i style={{ width: `${summary?.progress ?? 0}%` }} /></span>
                            <strong>{summary?.progress ?? 0}%</strong>
                          </span>
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="work-overview-insights">
                  <section className="work-overview-panel" aria-labelledby="work-next-tasks-title">
                    <header>
                      <div>
                        <CalendarDays size={14} aria-hidden="true" />
                        <h3 id="work-next-tasks-title">Najbliższe i ważne</h3>
                      </div>
                      <span>{activeOpenTasks.length} w aktywnych projektach</span>
                    </header>
                    <div className="work-overview-task-list">
                      {overviewTasks.map((task) => {
                        const project = workspace.projects.find((candidate) => candidate.id === task.projectId);
                        const company = project
                          ? workspace.companies.find((candidate) => candidate.id === project.companyId)
                          : undefined;
                        if (!project || !company) return null;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => selectProject(company.id, project.id)}
                          >
                            <span className={`work-overview-task__priority work-overview-task__priority--${task.priority}`}>
                              <Flag size={11} aria-hidden="true" />
                            </span>
                            <span className="work-overview-task__copy">
                              <strong>{task.title}</strong>
                              <small>{company.name} · {project.name}</small>
                            </span>
                            <span className="work-overview-task__due">
                              {task.dueDate ? formatDueDate(task.dueDate) : PRIORITY_LABELS[task.priority]}
                            </span>
                            <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        );
                      })}
                      {overviewTasks.length === 0 && (
                        <p className="work-overview-panel__empty">Nie ma żadnych otwartych zadań.</p>
                      )}
                    </div>
                  </section>

                  <section className="work-overview-panel" aria-labelledby="work-active-projects-title">
                    <header>
                      <div>
                        <FolderKanban size={14} aria-hidden="true" />
                        <h3 id="work-active-projects-title">Aktywne projekty</h3>
                      </div>
                      <span>{workspace.projects.filter((project) => project.status === "active").length} aktywnych</span>
                    </header>
                    <div className="work-overview-project-list">
                      {overviewProjects.map((project) => {
                        const company = workspace.companies.find((candidate) => candidate.id === project.companyId);
                        const count = projectTaskCounts.get(project.id) ?? { completed: 0, total: 0 };
                        const projectProgress = count.total ? Math.round((count.completed / count.total) * 100) : 0;
                        if (!company) return null;
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => selectProject(company.id, project.id)}
                          >
                            <span className="work-overview-project__copy">
                              <strong>{project.name}</strong>
                              <small>{company.name} · {count.total - count.completed} otwartych</small>
                            </span>
                            <span
                              className="work-overview-project__progress"
                              role="progressbar"
                              aria-label={`Postęp projektu ${project.name}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={projectProgress}
                            >
                              <span><i style={{ width: `${projectProgress}%` }} /></span>
                              <strong>{projectProgress}%</strong>
                            </span>
                            <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        );
                      })}
                      {overviewProjects.length === 0 && (
                        <p className="work-overview-panel__empty">Brak aktywnych projektów.</p>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </section>
        ) : (
          <>
            <WorkspaceToolbar className="work-toolbar">
              <div className="work-desktop-context" aria-label="Bieżąca firma">
                <span className="work-company-dot" style={{ background: selectedCompany?.color }} />
                <strong>{selectedCompany?.name}</strong>
                {selectedCompany?.description && <small>{selectedCompany.description}</small>}
              </div>
              <div className="work-mobile-context">
                <Select
                  compact
                  aria-label="Wybierz widok lub firmę"
                  value={selectedCompanyId}
                  options={[
                    { value: "", label: "Przegląd" },
                    ...workspace.companies.map((company) => ({ value: company.id, label: company.name })),
                  ]}
                  onChange={(event) => event.target.value ? selectCompany(event.target.value) : showOverview()}
                />
                <Select
                  compact
                  aria-label="Wybierz projekt"
                  value={selectedProjectId}
                  disabled={companyProjects.length === 0}
                  options={companyProjects.map((project) => ({ value: project.id, label: project.name }))}
                  onChange={(event) => selectProject(selectedCompanyId, event.target.value)}
                />
              </div>
              <label className="work-search">
                <Search size={13} aria-hidden="true" />
                <span className="sr-only">Szukaj zadań</span>
                <input
                  value={search}
                  placeholder="Szukaj w projekcie"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={`work-completed-toggle ${showCompleted ? "is-active" : ""}`}
                aria-pressed={showCompleted}
                onClick={() => setShowCompleted((current) => !current)}
              >
                <Check size={12} aria-hidden="true" />
                Ukończone
              </button>
            </WorkspaceToolbar>

          <section className="work-task-canvas" aria-label="Zadania projektu">
            {!selectedProject ? (
              <EmptyState
                icon={<FolderKanban size={18} />}
                title="Utwórz projekt"
                description={`Dodaj pierwszy projekt dla firmy ${selectedCompany?.name ?? ""}.`}
                action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openProjectEditor()}>Dodaj projekt</Button>}
              />
            ) : (
              <>
                <header className="work-project-header">
                  <div className="work-project-header__identity">
                    <div className="work-project-header__icon">
                      <FolderKanban size={16} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="work-project-header__title">
                        <h2>{selectedProject.name}</h2>
                        <span className={`work-project-status work-project-status--${selectedProject.status}`}>
                          {PROJECT_STATUS_LABELS[selectedProject.status]}
                        </span>
                      </div>
                      <p>{selectedProject.description || "Dodaj krótki opis projektu, aby zachować kontekst."}</p>
                    </div>
                  </div>
                  <div className="work-project-header__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label="Edytuj projekt"
                      title="Edytuj projekt"
                      onClick={() => openProjectEditor(selectedProject)}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label="Usuń projekt"
                      title="Usuń projekt"
                      onClick={() => setDeleteState({ kind: "project", id: selectedProject.id, name: selectedProject.name })}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                  <div className="work-project-progress">
                    <div>
                      <span>Postęp</span>
                      <strong>{completedCount} z {projectTasks.length}</strong>
                    </div>
                    <div
                      className="work-project-progress__track"
                      role="progressbar"
                      aria-label={`Postęp projektu ${selectedProject.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                      aria-valuetext={`${completedCount} z ${projectTasks.length} zadań ukończonych`}
                    >
                      <span style={{ transform: `scaleX(${progress / 100})` }} />
                    </div>
                    <b>{progress}%</b>
                  </div>
                </header>

                <div className="work-task-list">
                  {completionUndo && (
                    <div className="work-completion-undo" role="status">
                      <span>{completionUndo.label}</span>
                      <Button variant="quiet" size="sm" onClick={undoCompletionChange}>Cofnij</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label="Zamknij komunikat"
                        onClick={() => setCompletionUndo(null)}
                      >
                        ×
                      </Button>
                    </div>
                  )}
                  <div className="work-task-list__heading">
                    <div>
                      <ListTree size={14} aria-hidden="true" />
                      <h3>Zadania</h3>
                      <span>{projectTasks.filter((task) => !task.completed).length} otwartych</span>
                    </div>
                    <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openTaskEditor()}>
                      Zadanie
                    </Button>
                  </div>

                  {projectTasks.length === 0 ? (
                    <EmptyState
                      icon={<ListTree size={18} />}
                      title="Pierwsze zadanie nada projektowi rytm"
                      description="Zacznij od większego kroku. Podzadania możesz dodawać na dowolnym poziomie."
                      action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openTaskEditor()}>Dodaj zadanie</Button>}
                    />
                  ) : visibleTaskIds.size === 0 ? (
                    <div className="work-no-results">
                      <Circle size={16} aria-hidden="true" />
                      <p>{search ? "Brak zadań pasujących do wyszukiwania." : "Wszystkie zadania w tym widoku są ukończone."}</p>
                      {!search && <button type="button" onClick={() => setShowCompleted(true)}>Pokaż ukończone</button>}
                    </div>
                  ) : (
                    <div className="work-task-tree">
                      {(tasksByParent.get(null) ?? []).map((task) => renderTask(task, 0))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
          </>
        )}
      </ModuleMain>

      {editor && (
        <Modal
          title={editorTitle}
          description={editorDescription}
          eyebrow={editor.kind === "company" ? "Firma" : editor.kind === "project" ? "Projekt" : "Zadanie"}
          onClose={closeEditor}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="work-editor-form">
                {editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"}
              </Button>
            </>
          )}
        >
          <form id="work-editor-form" className="work-editor-form" onSubmit={submitEditor}>
            <Input
              label={editor.kind === "task" ? "Nazwa zadania" : "Nazwa"}
              value={draft.name}
              placeholder={editor.kind === "company" ? "np. Studio North" : editor.kind === "project" ? "np. Nowa strona" : "Co trzeba zrobić?"}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />

            {editor.kind !== "task" && (
              <label className="ui-field">
                <span className="ui-field__label">Opis <span className="work-optional">opcjonalnie</span></span>
                <textarea
                  className="ui-field__control work-textarea"
                  value={draft.description}
                  placeholder="Krótki kontekst, który przyda się później"
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            )}

            {editor.kind === "company" && (
              <fieldset className="work-color-field">
                <legend>Kolor firmy</legend>
                <div>
                  {COMPANY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={draft.color === color ? "is-selected" : ""}
                      style={{ background: color }}
                      aria-label={`Wybierz kolor ${color}`}
                      aria-pressed={draft.color === color}
                      onClick={() => setDraft((current) => ({ ...current, color }))}
                    >
                      {draft.color === color && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {editor.kind === "project" && (
              <Select
                label="Status"
                value={draft.status}
                options={[
                  { value: "active", label: "Aktywny", description: "Projekt, nad którym pracujesz" },
                  { value: "paused", label: "Wstrzymany", description: "Tymczasowo bez działań" },
                  { value: "completed", label: "Zakończony", description: "Projekt zamknięty" },
                ]}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as WorkProjectStatus }))}
              />
            )}

            {editor.kind === "task" && (
              <>
                <Select
                  label="Poziom w drzewie"
                  value={draft.parentId}
                  options={parentOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))}
                />
                <div className="work-editor-grid">
                  <Select
                    label="Priorytet"
                    value={draft.priority}
                    options={[
                      { value: "none", label: "Bez priorytetu" },
                      { value: "low", label: "Niski" },
                      { value: "medium", label: "Średni" },
                      { value: "high", label: "Wysoki" },
                    ]}
                    onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as WorkTaskPriority }))}
                  />
                  <Input
                    type="date"
                    label="Termin"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  />
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {deleteState && (
        <Modal
          title={`Usuń ${deleteState.kind === "company" ? "firmę" : deleteState.kind === "project" ? "projekt" : "zadanie"}?`}
          description={deleteState.kind === "company"
            ? `Firma „${deleteState.name}” zostanie usunięta razem ze wszystkimi projektami i zadaniami.`
            : deleteState.kind === "project"
              ? `Projekt „${deleteState.name}” zostanie usunięty razem ze wszystkimi zadaniami.`
              : `Zadanie „${deleteState.name}” zostanie usunięte razem ze wszystkimi podzadaniami.`}
          eyebrow="Potwierdzenie"
          onClose={() => setDeleteState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setDeleteState(null)}>Anuluj</Button>
              <Button variant="danger" onClick={confirmDelete}>Usuń</Button>
            </>
          )}
        >
          <p className="work-delete-note">Tej operacji nie można cofnąć.</p>
        </Modal>
      )}

      {cascadeState && (
        <Modal
          title={`Ukończyć „${cascadeState.taskTitle}”?`}
          description={`To zadanie ma ${cascadeState.branchIds.length - 1} ${cascadeState.branchIds.length - 1 === 1 ? "podzadanie" : "podzadań"}. Wszystkie zostaną oznaczone jako ukończone.`}
          eyebrow="Zadanie nadrzędne"
          onClose={() => setCascadeState(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setCascadeState(null)}>Anuluj</Button>
              <Button variant="primary" onClick={confirmCascadeCompletion}>Ukończ całą gałąź</Button>
            </>
          )}
        >
          <p className="work-delete-note">Po zatwierdzeniu możesz cofnąć zmianę z komunikatu nad listą zadań.</p>
        </Modal>
      )}
    </ModuleShell>
  );
}
