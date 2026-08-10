import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CircleDot,
  Ellipsis,
  Flag,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import {
  getGoalCurrentValue,
  getGoalMetric,
  getGoalProgress,
} from "../goals/goalsModel";
import { useGoalsStore } from "../goals/goalsContext";
import type { GoalStatus } from "../goals/goalsModel";
import { formatLocalDate } from "../data/localDate";
import { GoalFormDialog, MilestoneDialog, ProgressDialog } from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";
import { GoalNoteTextarea } from "../goals/GoalNoteTextarea";
import { AddToTasksButton, Badge, Button, ConfirmDialog, ContentHeader, EmptyState as UiEmptyState, Menu, MenuItem, ModuleMain, ModuleShell } from "../ui";
import type { ExternalTaskInput } from "../data/taskLinks";
import { loadTaskWorkspace } from "../data/taskWorkspace";
import "../../styles/goals.css";

const fmtDate = (date: string) => formatLocalDate(date);
const statusLabels: Record<GoalStatus, string> = {
  planned: "Zaplanowany",
  active: "Aktywny",
  paused: "Wstrzymany",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};
const priorityLabels = { high: "Wysoki", medium: "Średni", low: "Niski" } as const;

function EmptyGoalState({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return <UiEmptyState icon={<Target size={18} strokeWidth={1.2} />} title={text} action={<Button variant="quiet" size="sm" onClick={onAction} leadingIcon={<Plus size={13} />}>{action}</Button>} />;
}

function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="goal-detail-section-heading">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export default function CelSzczegoly() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const store = useGoalsStore();
  const goal = store.goals.find((item) => item.id === goalId);
  const category = store.categories.find((item) => item.id === goal?.categoryId);
  const [showCompletedStages, setShowCompletedStages] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [dragStageId, setDragStageId] = useState<string | null>(null);
  const [stageMenuId, setStageMenuId] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [deleteProgressId, setDeleteProgressId] = useState<string | null>(null);
  const [deleteMilestoneId, setDeleteMilestoneId] = useState<string | null>(null);
  const [deleteGoalOpen, setDeleteGoalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const editReturnFocusRef = useRef<HTMLElement | null>(null);
  const menuId = useId();
  const taskGoalId = goal?.id;
  const linkedTasks = taskGoalId ? loadTaskWorkspace().tasks.filter((task) => task.source?.kind === "goals" && task.source.entity === `${encodeURIComponent(taskGoalId)}/goal`) : [];
  const requestedReturnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof requestedReturnTo === "string" && requestedReturnTo.startsWith("/cele")
    ? requestedReturnTo
    : "/cele";
  const openEdit = (returnFocus?: HTMLElement | null) => {
    editReturnFocusRef.current = returnFocus ?? null;
    setEditOpen(true);
  };

  if (!goal) {
    return (
      <ModuleShell pageWidth="standard">
        <ModuleMain>
          <div className="goal-detail-missing">
            <Target size={38} strokeWidth={1.2} />
            <h1>Nie znaleziono celu</h1>
            <Button variant="primary" onClick={() => navigate(returnTo)}>Wróć do celów</Button>
          </div>
        </ModuleMain>
      </ModuleShell>
    );
  }

  const progress = getGoalProgress(goal);
  const current = getGoalCurrentValue(goal);
  const completedMilestones = goal.milestones.filter((item) => item.done).length;
  const nextMilestone = goal.milestones
    .filter((item) => !item.done)
    .sort((a, b) => Number(Boolean(b.isNext)) - Number(Boolean(a.isNext)) || (a.order ?? 0) - (b.order ?? 0) || a.dueDate.localeCompare(b.dueDate))[0];
  const sortedMilestones = [...goal.milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.dueDate.localeCompare(b.dueDate));
  const sortedProgress = [...goal.progressEntries].sort((a, b) => b.date.localeCompare(a.date));
  const latestProgress = sortedProgress[0];
  const measurementLabel = goal.progressMode === "milestones"
    ? "Etapy"
    : goal.progressMode === "regularity"
      ? goal.regularityMode === "frequency" ? "Wykonania" : "Dni serii"
      : goal.progressMode === "manual" ? "Postęp" : "Wartość";
  const openProgress = () => {
    if (goal.progressMode === "milestones") { setEditingMilestoneId(null); setMilestoneOpen(true); }
    else { setEditingProgressId(null); setProgressOpen(true); }
  };

  const submitEdit = (data: GoalEditorData) => { store.updateGoal(goal.id, data); setEditOpen(false); };
  const openMilestone = (milestoneId: string | null = null) => { setEditingMilestoneId(milestoneId); setMilestoneOpen(true); };

  const renderFacts = () => (
    <section className="goal-detail-facts" aria-labelledby="goal-facts-heading">
      <SectionHeading title="Parametry celu" />
      <button type="button" onClick={(event) => openEdit(event.currentTarget)}><CalendarDays size={13} /><span>Termin</span><strong>{fmtDate(goal.dueDate)}</strong><Pencil size={11} /></button>
      <button type="button" onClick={(event) => openEdit(event.currentTarget)}><Flag size={13} /><span>Priorytet</span><strong>{priorityLabels[goal.priority]}</strong><Pencil size={11} /></button>
      <button type="button" onClick={(event) => openEdit(event.currentTarget)}><Target size={13} /><span>Kategoria</span><strong>{category?.label ?? "Bez kategorii"}</strong><Pencil size={11} /></button>
      <button type="button" onClick={(event) => openEdit(event.currentTarget)}><BarChart3 size={13} /><span>Metoda pomiaru</span><strong>{measurementLabel}</strong><Pencil size={11} /></button>
    </section>
  );

  const renderNextStep = (compact = false) => (
    <section className={`goal-detail-next ${compact ? "goal-detail-next--compact" : ""}`} aria-labelledby="goal-next-step-heading">
      <div className="goal-detail-next-icon" style={{ "--goal-accent": goal.color } as CSSProperties}><CircleDot size={16} /></div>
      <div className="min-w-0 flex-1">
        <h2 id="goal-next-step-heading">Następny krok</h2>
        {goal.progressMode === "milestones" ? (
          nextMilestone ? <><p className="goal-detail-next-title">{nextMilestone.title}</p><p>Termin: {fmtDate(nextMilestone.dueDate)} · {nextMilestone.note || "Najbliższy etap do wykonania"}</p></> : <><p className="goal-detail-next-title">Wszystkie etapy ukończone</p><p>Dodaj kolejny etap, jeśli cel ma być kontynuowany.</p></>
        ) : latestProgress ? <><p className="goal-detail-next-title">Zapisz kolejną aktualizację</p><p>Ostatni wpis: {latestProgress.note || "bez notatki"} · {fmtDate(latestProgress.date)}</p></> : <><p className="goal-detail-next-title">Zapisz pierwszy pomiar</p><p>Jedna aktualizacja wystarczy, żeby rozpocząć historię celu.</p></>}
      </div>
      <Button variant={goal.progressMode === "milestones" && nextMilestone ? "quiet" : "primary"} size="sm" onClick={() => {
        if (goal.progressMode === "milestones" && nextMilestone) store.updateMilestone(goal.id, nextMilestone.id, { done: true });
        else if (goal.progressMode === "milestones") openMilestone();
        else openProgress();
      }} leadingIcon={goal.progressMode === "milestones" && nextMilestone ? <Check size={13} /> : <Plus size={13} />}>
        {goal.progressMode === "milestones" && nextMilestone ? "Ukończ etap" : goal.progressMode === "milestones" ? "Dodaj etap" : goal.progressMode === "numeric" ? "Zaktualizuj wartość" : goal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}
      </Button>
    </section>
  );

  const renderMilestoneTimeline = () => {
    const activeStages = sortedMilestones.filter((item) => !item.done);
    const completedStages = sortedMilestones.filter((item) => item.done);
    const stages = [...activeStages, ...(showCompletedStages ? completedStages : [])];
    return goal.milestones.length === 0 ? (
      <EmptyGoalState text="Ten cel nie ma jeszcze etapów" action="Dodaj pierwszy etap" onAction={() => openMilestone()} />
    ) : (
      <div className="goal-detail-timeline" onDragOver={(event) => event.preventDefault()}>
        {stages.map((item) => {
          const isNext = nextMilestone?.id === item.id;
          const isOverdue = !item.done && item.dueDate < new Date().toISOString().slice(0, 10);
          return (
            <article
              key={item.id}
              draggable
              onDragStart={() => setDragStageId(item.id)}
              onDragEnd={() => setDragStageId(null)}
              onDrop={() => { if (dragStageId) store.reorderMilestones(goal.id, dragStageId, item.id); setDragStageId(null); }}
              className={`goal-detail-timeline-item ${item.done ? "is-complete" : ""} ${isNext ? "is-next" : ""} ${isOverdue ? "is-overdue" : ""}`}
            >
              <div className="goal-detail-timeline-rail">
                <button
                  type="button"
                  aria-label={`${item.done ? "Oznacz jako niewykonany" : "Ukończ etap"}: ${item.title}`}
                  aria-pressed={item.done}
                  onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })}
                  className={`goal-detail-check${item.done ? " is-complete" : ""}`}
                >
                  {item.done && <Check size={13} />}
                </button>
              </div>
              <div className="goal-detail-timeline-content">
                <div className="goal-detail-timeline-heading">
                  <p>{item.title}</p>
                  {isNext && <span className="goal-stage-next-label">Następny</span>}
                </div>
                {item.note && <span>{item.note}</span>}
                <span className={isOverdue ? "goal-stage-overdue" : ""}>Termin: {fmtDate(item.dueDate)} · {isOverdue ? "po terminie" : item.done ? "ukończony" : "do wykonania"}</span>
              </div>
              <div className="goal-detail-timeline-actions">
                <button type="button" aria-label={`Opcje etapu ${item.title}`} aria-expanded={stageMenuId === item.id} onClick={() => setStageMenuId(stageMenuId === item.id ? null : item.id)}><Ellipsis size={13} /></button>
                {stageMenuId === item.id && <Menu id={`stage-menu-${item.id}`} onDismiss={() => setStageMenuId(null)} layer="context" className="absolute right-2 top-10 w-44">
                  <MenuItem onClick={() => { openMilestone(item.id); setStageMenuId(null); }} leadingIcon={<Pencil />}>Edytuj etap</MenuItem>
                  <MenuItem onClick={() => { store.updateMilestone(goal.id, item.id, { isNext: true }); setStageMenuId(null); }} leadingIcon={<Target />}>Oznacz jako następny</MenuItem>
                  <MenuItem tone="danger" onClick={() => { setDeleteMilestoneId(item.id); setStageMenuId(null); }} leadingIcon={<Trash2 />}>Usuń etap</MenuItem>
                </Menu>}
              </div>
            </article>
          );
        })}
        {completedStages.length > 0 && <button type="button" className="goal-detail-text-action goal-stage-completed-toggle" onClick={() => setShowCompletedStages((open) => !open)}>{showCompletedStages ? "Zwiń" : "Pokaż"} ukończone ({completedStages.length})</button>}
      </div>
    );
  };

  const renderHistory = () => {
    const history = [
      ...goal.progressEntries.map((item) => ({ id: item.id, title: "Zmieniono postęp", detail: item.note || "Zapisano nową wartość", date: item.createdAt || `${item.date}T12:00:00.000Z`, icon: BarChart3 })),
      ...goal.milestones.filter((item) => item.done).map((item) => ({ id: `stage-${item.id}`, title: "Ukończono etap", detail: item.title, date: item.completedAt ?? goal.updatedAt, icon: Check })),
      { id: "goal-updated", title: "Zaktualizowano cel", detail: "Szczegóły celu zapisano lokalnie", date: goal.updatedAt, icon: Pencil },
    ].sort((a, b) => b.date.localeCompare(a.date));
    const visibleHistory = showAllHistory ? history : history.slice(0, 5);
    return (
      <div className="goal-detail-history-list">
        {visibleHistory.map((item) => { const HistoryIcon = item.icon; return <article key={item.id} className="goal-detail-history-row"><span className="goal-detail-history-icon" style={{ "--goal-accent": goal.color, "--goal-accent-soft": `${goal.color}18` } as CSSProperties}><HistoryIcon size={13} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time dateTime={item.date}>{fmtDate(item.date.slice(0, 10))}</time></article>; })}
        {history.length > 5 && <button type="button" className="goal-detail-text-action" onClick={() => setShowAllHistory((open) => !open)}>{showAllHistory ? "Pokaż mniej" : "Pokaż więcej"}</button>}
      </div>
    );
  };

  return (
    <ModuleShell
      pageWidth="fluid"
    >
      <ModuleMain>
        <ContentHeader
          headingLevel={1}
          className="goal-detail-content-header"
          leading={<Button variant="ghost" iconOnly aria-label="Wróć do celów" onClick={() => navigate(returnTo)}><ArrowLeft size={16} /></Button>}
          title={goal.title}
          description={`${category?.label ?? "Cel"} · Termin: ${fmtDate(goal.dueDate)} · ${getGoalMetric(goal)}`}
          meta={<div className="flex items-center gap-2"><Badge appearance="plain" dot tone={goal.status === "completed" ? "success" : goal.status === "active" ? goal.health === "risk" ? "warning" : "primary" : "neutral"}>{statusLabels[goal.status]}</Badge><Badge appearance="plain" dot tone={goal.health === "risk" ? "warning" : "success"}>{goal.health === "risk" ? "Zagrożony" : "Na planie"}</Badge>{store.storageFailed && <Badge tone="danger">Brak zapisu lokalnego</Badge>}</div>}
          actions={<>
            <Button className="ui-button--icon-mobile" variant="primary" onClick={openProgress} leadingIcon={<Plus size={13} />}><span className="header-action-label">{goal.progressMode === "milestones" ? "Dodaj etap" : goal.progressMode === "numeric" ? "Zaktualizuj wartość" : goal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</span></Button>
            <Button variant="quiet" onClick={(event) => openEdit(event.currentTarget)} leadingIcon={<Pencil size={13} />}><span className="header-action-label">Edytuj</span></Button>
            <div className="relative"><Button ref={menuTriggerRef} variant="ghost" iconOnly aria-label="Więcej opcji" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((open) => !open)}><Ellipsis size={16} /></Button>{menuOpen && <Menu id={menuId} triggerRef={menuTriggerRef} onDismiss={() => setMenuOpen(false)} layer="context" className="absolute right-0 top-11 w-48">
              <MenuItem onClick={() => { openProgress(); setMenuOpen(false); }} leadingIcon={<BarChart3 />}>{goal.progressMode === "milestones" ? "Dodaj etap" : goal.progressMode === "numeric" ? "Zaktualizuj wartość" : goal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</MenuItem>
              <MenuItem onClick={() => { openEdit(menuTriggerRef.current); setMenuOpen(false); }} leadingIcon={<Pencil />}>Edytuj cel</MenuItem>
              <MenuItem onClick={() => { store.duplicateGoal(goal.id); setMenuOpen(false); }} leadingIcon={<Plus />}>Duplikuj</MenuItem>
              <MenuItem onClick={() => { store.updateGoal(goal.id, { status: goal.status === "paused" ? "active" : "paused" }); setMenuOpen(false); }} leadingIcon={<RotateCcw />}>{goal.status === "paused" ? "Wznów" : "Wstrzymaj"}</MenuItem>
              <MenuItem onClick={() => { store.updateGoal(goal.id, { status: "completed" }); setMenuOpen(false); }} leadingIcon={<Check />}>Zakończ</MenuItem>
              <MenuItem onClick={() => { store.updateGoal(goal.id, { status: goal.status === "archived" ? "active" : "archived" }); setMenuOpen(false); }} leadingIcon={goal.status === "archived" ? <RotateCcw /> : <Archive />}>{goal.status === "archived" ? "Przywróć" : "Archiwizuj"}</MenuItem>
              <div className="goal-menu-divider" />
              <MenuItem tone="danger" onClick={() => { setDeleteGoalOpen(true); setMenuOpen(false); }} leadingIcon={<Trash2 />}>Usuń</MenuItem>
            </Menu>}</div>
          </>}
        />

        <div className="goals-content flex-1 overflow-y-auto px-7 py-5">
          <div className="goal-detail-page mx-auto max-w-[1180px]">
            <section className="goal-detail-hero" aria-labelledby="goal-progress-heading">
              <div className="goal-detail-hero-content">
                <div className="goal-detail-hero-main">
                  <div className="goal-detail-hero-icon" style={{ "--goal-accent": goal.color, "--goal-accent-soft": `${goal.color}18`, "--goal-accent-border": `${goal.color}55` } as CSSProperties}>
                    {goal.customIcon ? <img src={goal.customIcon} alt="" className="h-7 w-7 object-contain" /> : <Target size={22} strokeWidth={1.5} />}
                  </div>
                  <div className="min-w-0">
                    <h2 id="goal-progress-heading">Realizacja celu</h2>
                    <p>{getGoalMetric(goal)} · {statusLabels[goal.status]}</p>
                  </div>
                </div>
                <div className="goal-detail-hero-value"><strong>{progress}%</strong><span>ukończone</span></div>
                <div className="goal-detail-progress" role="progressbar" aria-label="Postęp celu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                  <div className="goal-detail-progress-meta"><span>Postęp</span><span>{getGoalMetric(goal)}</span></div>
                  <div className="goal-detail-progress-track" style={{ "--goal-detail-progress": progress / 100, "--goal-accent": goal.color } as CSSProperties}><div className="goal-detail-progress-fill" /></div>
                </div>
                <div className="goal-detail-summary-grid">
                  <div><strong>{goal.progressMode === "milestones" ? `${completedMilestones}/${goal.milestones.length}` : current.toLocaleString("pl-PL")}</strong><span>{measurementLabel}</span></div>
                  <div><strong>{fmtDate(goal.dueDate)}</strong><span>Termin</span></div>
                  <div><strong className={goal.health === "risk" ? "is-risk" : "is-on-track"}>{goal.health === "risk" ? "Zagrożony" : "Na planie"}</strong><span>Kondycja celu</span></div>
                </div>
              </div>
              <aside className="goal-detail-hero-details" aria-label="Szczegóły celu">
                {renderFacts()}
              </aside>
            </section>

            <div className="goal-detail-overview-grid">
              <div className="space-y-5">
                {renderNextStep()}
                <section id="etapy" className="goal-detail-timeline-panel">
                  <SectionHeading
                    title={goal.progressMode === "milestones" ? "Etapy celu" : "Historia postępu"}
                    action={<Button type="button" variant="primary" size="sm" leadingIcon={<Plus size={13} />} onClick={openProgress}>{goal.progressMode === "milestones" ? "Dodaj etap" : goal.progressMode === "numeric" ? "Zaktualizuj wartość" : goal.progressMode === "regularity" ? "Zapisz wykonanie" : "Zaktualizuj postęp"}</Button>}
                  />
                  <p className="goal-detail-supporting-copy">{goal.progressMode === "milestones" ? `${completedMilestones} z ${goal.milestones.length} etapów ukończonych · przeciągnij, aby zmienić kolejność.` : "Każda zmiana wpływa na aktualną wartość celu."}</p>
                  {goal.progressMode === "milestones" ? renderMilestoneTimeline() : (
                    <div className="goal-detail-progress-note">
                      <strong>{getGoalMetric(goal)}</strong>
                      <span>{goal.progressMode === "numeric" ? "Postęp liczony jako aktualna wartość względem celu." : goal.progressMode === "regularity" ? "Postęp wynika z zapisanych wykonań w wybranym okresie." : "Procent jest ustawiany bezpośrednio przez użytkownika."}</span>
                    </div>
                  )}
                </section>
                <section id="notatki" className="goal-detail-note-preview goal-detail-notes-section">
                  <SectionHeading title="Opis i notatki" action={<button type="button" className="goal-detail-text-action" onClick={() => setNoteEditing((editing) => !editing)}>{noteEditing ? "Zamknij" : "Edytuj"}</button>} />
                  {goal.description && <p>{goal.description}</p>}
                  <GoalNoteTextarea key={`${goal.id}-full-note`} aria-label="Notatki do celu" value={goal.note} onCommit={(value) => store.updateGoal(goal.id, { note: value }, { persistence: "immediate" })} rows={4} placeholder="Dodaj bieżące obserwacje i ustalenia…" className="goal-detail-notes-editor goal-detail-notes-editor--inline" />
                </section>
                <section className="goal-detail-note-preview" aria-labelledby="goal-linked-tasks-heading">
                  <SectionHeading title="Powiązane zadania" />
                  <p id="goal-linked-tasks-heading" className="goal-detail-supporting-copy">Zadania zapisane z tym celem zachowują jego kontekst i termin.</p>
                  {linkedTasks.length > 0 && <div className="goal-linked-task-list">{linkedTasks.map((task) => <a key={task.id} href={`/zadania?zadanie=${encodeURIComponent(task.id)}`} className="goal-linked-task"><span>{task.done ? "✓" : "○"}</span><strong>{task.text}</strong><small>Otwórz w zadaniach</small></a>)}</div>}
                  <AddToTasksButton input={({ source: { kind: "goals", entity: `${encodeURIComponent(goal.id)}/goal`, context: goal.title, href: `/cele/${encodeURIComponent(goal.id)}` }, text: goal.title, done: goal.status === "completed", calendarDate: goal.dueDate, date: goal.dueDate, priority: goal.priority, list: "cele", tags: ["cele"], notes: goal.note } satisfies ExternalTaskInput)} onAdded={(taskId) => { store.updateGoal(goal.id, { linkedTaskIds: [...new Set([...(goal.linkedTaskIds ?? []), taskId])] }, { persistence: "immediate" }); }} />
                </section>
                <section id="historia" className="goal-detail-timeline-panel">
                  <SectionHeading title="Historia" />
                  {renderHistory()}
                </section>
              </div>
            </div>
          </div>
        </div>

        {editOpen && <GoalFormDialog goal={goal} categories={store.categories} returnFocusRef={editReturnFocusRef} onClose={() => setEditOpen(false)} onSubmit={submitEdit} />}
        {progressOpen && <ProgressDialog goal={goal} progress={goal.progressEntries.find((item) => item.id === editingProgressId)} onClose={() => { setProgressOpen(false); setEditingProgressId(null); }} onSubmit={(draft) => { const nextDraft = { ...draft, value: goal.progressMode === "manual" ? Math.max(0, Math.min(100, draft.value)) : draft.value }; if (editingProgressId) store.updateProgress(goal.id, editingProgressId, nextDraft); else store.addProgress(goal.id, nextDraft); setProgressOpen(false); setEditingProgressId(null); }} />}
        {milestoneOpen && <MilestoneDialog draftKey={`goal-${goal.id}`} milestone={goal.milestones.find((item) => item.id === editingMilestoneId)} onClose={() => { setMilestoneOpen(false); setEditingMilestoneId(null); }} onSubmit={(draft) => { if (editingMilestoneId) store.updateMilestone(goal.id, editingMilestoneId, draft); else store.addMilestone(goal.id, draft); setMilestoneOpen(false); setEditingMilestoneId(null); }} />}
        {deleteProgressId && <ConfirmDialog title="Usuń aktualizację?" onCancel={() => setDeleteProgressId(null)} onConfirm={() => { store.deleteProgress(goal.id, deleteProgressId); setDeleteProgressId(null); }}><p className="ui-confirm-dialog__note">Aktualna wartość i procent celu zostaną ponownie przeliczone na podstawie pozostałych wpisów.</p></ConfirmDialog>}
        {deleteMilestoneId && <ConfirmDialog title="Usuń etap?" onCancel={() => setDeleteMilestoneId(null)} onConfirm={() => { store.deleteMilestone(goal.id, deleteMilestoneId); setDeleteMilestoneId(null); }}><p className="ui-confirm-dialog__note">Postęp celu zostanie automatycznie przeliczony po usunięciu tego etapu.</p></ConfirmDialog>}
        {deleteGoalOpen && <ConfirmDialog title="Usuń cel?" onCancel={() => setDeleteGoalOpen(false)} onConfirm={() => { store.deleteGoal(goal.id); navigate(returnTo); }}><p className="ui-confirm-dialog__note">Cel wraz z całą historią postępu i kamieniami milowymi zostanie usunięty.</p></ConfirmDialog>}
      </ModuleMain>
    </ModuleShell>
  );
}
