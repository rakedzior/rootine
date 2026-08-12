import { type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FolderKanban,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { WorkTask, WorkTaskPriority, WorkTaskStatus, WorkWorkspace } from "../data/workWorkspace";
import { HALF_HOUR_TIME_OPTIONS } from "../data/timeOptions";
import { Button, DatePicker, DetailPanel, Select, Textarea, TimePicker } from "../ui";
import {
  TASK_STATUS_LABELS,
  collectTaskBranch,
  collectTaskDescendantRows,
  formatDate,
  formatSubtaskProgress,
  getTaskStatus,
  taskDepth,
  taskStatusIcon,
  taskStatusTone,
  workTaskStatusSelectOptions,
  workPrioritySelectOptions,
  type SaveStatus,
} from "./workPresentation";

type TaskPatch = Partial<Pick<WorkTask, "companyId" | "priority" | "dueDate" | "dueTime" | "projectId" | "parentId">>;

interface WorkDetailPanelProps {
  expanded: boolean;
  onAddSubtask: (taskId: string) => void;
  onApplyStatus: (taskIds: string[], status: WorkTaskStatus, label: string) => void;
  onDelete: () => void;
  onDismiss: () => void;
  onNavigateProject: (companyId: string, projectId: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleExpanded: () => void;
  onToggleTask: (task: WorkTask) => void;
  onUpdateNote: (taskId: string, note: string) => void;
  onUpdateTask: (taskId: string, patch: TaskPatch) => void;
  saveStatus: SaveStatus;
  task: WorkTask;
  workspace: WorkWorkspace;
}

export function WorkDetailPanel({
  expanded,
  onAddSubtask,
  onApplyStatus,
  onDelete,
  onDismiss,
  onNavigateProject,
  onOpenTask,
  onToggleExpanded,
  onToggleTask,
  onUpdateNote,
  onUpdateTask,
  saveStatus,
  task,
  workspace,
}: WorkDetailPanelProps) {
  const project = workspace.projects.find((candidate) => candidate.id === task.projectId);
  const company = (task.companyId ? workspace.companies.find((candidate) => candidate.id === task.companyId) : undefined)
    ?? (project ? workspace.companies.find((candidate) => candidate.id === project.companyId) : undefined);
  const parent = task.parentId ? workspace.tasks.find((candidate) => candidate.id === task.parentId) : undefined;
  const taskById = new Map(workspace.tasks.map((candidate) => [candidate.id, candidate]));
  const parentChain: string[] = [];
  const visited = new Set<string>();
  let parentId = task.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const candidate = taskById.get(parentId);
    if (!candidate) break;
    parentChain.unshift(candidate.title);
    parentId = candidate.parentId;
  }

  const projectOptions = [
    { value: "", label: "Nieprzypisane" },
    ...workspace.projects
      .filter((candidate) => candidate.status !== "completed")
      .filter((candidate) => {
        const companyScope = task.companyId ?? project?.companyId;
        return !companyScope || candidate.companyId === companyScope;
      })
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];
  const unavailableParentIds = collectTaskBranch(workspace.tasks, task.id);
  const parentOptions = [
    { value: "", label: "Brak — poziom główny" },
    ...workspace.tasks
      .filter((candidate) => candidate.projectId === task.projectId && candidate.id !== task.id && !unavailableParentIds.has(candidate.id))
      .map((candidate) => ({ value: candidate.id, label: `${"— ".repeat(Math.min(taskDepth(candidate, workspace.tasks), 4))}${candidate.title}` })),
  ];
  const descendantRows = collectTaskDescendantRows(workspace.tasks, task.id);
  const completedDescendants = descendantRows.filter(({ task: descendant }) => getTaskStatus(descendant) === "completed").length;
  const progress = descendantRows.length ? Math.round((completedDescendants / descendantRows.length) * 100) : 0;

  return (
    <DetailPanel label="Szczegóły zadania" onDismiss={onDismiss} className="work-detail-panel">
      <header className="work-detail-header"><div><h2>{task.title}</h2></div><Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={onDismiss}><X size={13} /></Button></header>
      <div className="work-detail-body">
        <div className="work-detail-context">
          <span>{company?.name ?? "Nieprzypisane"}</span>
          <strong>{project?.name ?? "Bez projektu"}</strong>
          {parentChain.length > 0 && <span className="work-detail-context__parent"><CornerDownRight size={13} aria-hidden="true" />{parentChain.join(" › ")}</span>}
          {project && (
            <Button className="work-detail-project-link" variant="ghost" size="sm" fullWidth leadingIcon={<FolderKanban size={13} aria-hidden="true" />} trailingIcon={<ChevronRight size={13} aria-hidden="true" />} onClick={() => onNavigateProject(project.companyId, project.id)}>
              Otwórz projekt
            </Button>
          )}
        </div>
        <div className="work-detail-facts" aria-label="Informacje o zadaniu">
          <div><span>Typ</span><strong>{parent ? "Podzadanie" : "Zadanie główne"}</strong></div>
          <div><span>Utworzono</span><strong>{formatDate(task.createdAt.slice(0, 10))}</strong></div>
        </div>
        <div className="work-detail-fields">
          <Select label="Firma" value={task.companyId ?? project?.companyId ?? ""} options={[{ value: "", label: "Nieprzypisana" }, ...workspace.companies.filter((candidate) => !candidate.archived).map((candidate) => ({ value: candidate.id, label: candidate.name }))]} onChange={(event) => {
            const companyId = event.target.value;
            const nextProject = workspace.projects.find((candidate) => candidate.companyId === companyId && candidate.status !== "completed");
            onUpdateTask(task.id, { companyId: companyId || undefined, projectId: nextProject?.id ?? "", parentId: null });
          }} />
          <Select label="Projekt" value={task.projectId} options={projectOptions} onChange={(event) => {
            const projectId = event.target.value;
            const nextProject = workspace.projects.find((candidate) => candidate.id === projectId);
            onUpdateTask(task.id, { companyId: nextProject?.companyId ?? task.companyId, projectId, parentId: null });
          }} />
          <Select label="Zadanie nadrzędne" value={task.parentId ?? ""} options={parentOptions} disabled={!task.projectId} onChange={(event) => onUpdateTask(task.id, { parentId: event.target.value || null })} />
          <Select label="Status" value={getTaskStatus(task)} options={workTaskStatusSelectOptions()} onChange={(event) => onApplyStatus([task.id], event.target.value as WorkTaskStatus, `Status: ${TASK_STATUS_LABELS[event.target.value as WorkTaskStatus]}`)} />
          <Select label="Priorytet" value={task.priority} options={workPrioritySelectOptions()} onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as WorkTaskPriority })} />
          <div className="work-detail-schedule">
            <DatePicker label="Termin" value={task.dueDate} onChange={(value) => onUpdateTask(task.id, { dueDate: value, ...(!value ? { dueTime: "" } : {}) })} />
            <TimePicker
              label="Godzina"
              value={task.dueTime ?? task.linkedTask?.schedule?.startTime ?? task.linkedTask?.time ?? ""}
              options={HALF_HOUR_TIME_OPTIONS}
              disabled={!task.dueDate}
              onChange={(value) => onUpdateTask(task.id, { dueTime: value })}
            />
          </div>
          <Textarea label="Notatka" className="work-detail-note" value={task.note ?? ""} placeholder="Krótka notatka" onChange={(event) => onUpdateNote(task.id, event.target.value)} />
        </div>
        <section className="work-detail-subtasks" aria-label="Podzadania">
          <button type="button" className="work-detail-subtasks__header" aria-expanded={expanded} aria-controls="work-detail-subtask-list" onClick={onToggleExpanded}>
            <span className="work-detail-subtasks__header-copy"><span>Podzadania</span><strong>{formatSubtaskProgress(completedDescendants, descendantRows.length)}</strong></span>
            <span className="work-detail-subtasks__header-side"><span>{progress}%</span>{expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}</span>
          </button>
          <div className="work-detail-subtasks__progress" role="progressbar" aria-label="Postęp podzadań" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ "--work-subtask-progress": progress / 100 } as CSSProperties} />
          </div>
          <Button className="work-detail-subtasks__add" variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => onAddSubtask(task.id)}>Dodaj podzadanie</Button>
          <div id="work-detail-subtask-list">
            {expanded && descendantRows.length > 0 && (
              <div className="work-detail-subtask-list">
                {descendantRows.map(({ task: child, depth }) => {
                  const childStatus = getTaskStatus(child);
                  const childDate = child.dueDate;
                  return (
                    <div key={child.id} className="work-detail-subtask" style={{ "--work-subtask-depth": depth } as CSSProperties}>
                      <button type="button" className="work-detail-subtask__open" title={child.title} onClick={() => onOpenTask(child.id)}><span className={`work-detail-subtask__status ${taskStatusTone(childStatus)}`}>{taskStatusIcon(childStatus)}</span><span className="work-detail-subtask__title">{child.title}</span></button>
                      <span className={`work-detail-subtask__label ${taskStatusTone(childStatus)}`}>{TASK_STATUS_LABELS[childStatus]}</span>
                      <span className={`work-detail-subtask__date ${childDate ? "is-set" : "is-empty"}`}>{childDate ? formatDate(childDate) : "Bez terminu"}</span>
                      <button type="button" className={`work-detail-subtask__quick-check ${childStatus === "completed" ? "is-completed" : ""}`} aria-label={childStatus === "completed" ? `Przywróć „${child.title}”` : `Ukończ „${child.title}”`} onClick={() => onToggleTask(child)}>{childStatus === "completed" && <Check size={11} />}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="work-detail-footer">
        <span className={`work-detail-save-status ${saveStatus === "saved" ? "is-saved" : saveStatus === "saving" ? "is-saving" : ""}`} role="status" aria-live="polite">
          {saveStatus === "saving" ? "Zapisywanie…" : saveStatus === "saved" ? <><Check size={13} aria-hidden="true" /> Zapisano</> : saveStatus === "error" ? "Błąd zapisu" : "Autozapis lokalny"}
        </span>
        <Button className="work-detail-delete" variant="danger" leadingIcon={<Trash2 size={13} />} onClick={onDelete}>Usuń</Button>
      </footer>
    </DetailPanel>
  );
}
