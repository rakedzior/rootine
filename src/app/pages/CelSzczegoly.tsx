import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CircleDot,
  Ellipsis,
  Flag,
  ListChecks,
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
import { ConfirmDialog, GoalFormDialog, MilestoneDialog, ProgressDialog } from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";
import { GoalNoteTextarea } from "../goals/GoalNoteTextarea";
import { Badge, Button, EmptyState as UiEmptyState, Menu, MenuItem, ModuleMain, ModuleShell, PageHeader, WorkspaceToolbar } from "../ui";
import { C } from "../goals/goalPresentationModel";
import "../../styles/goals.css";

type GoalViewMode = "summary" | "execution";

const fmtDate = (date: string) => formatLocalDate(date);
const statusLabels: Record<GoalStatus, string> = {
  planned: "Zaplanowany",
  active: "Aktywny",
  paused: "Wstrzymany",
  completed: "Zakończony",
  archived: "Zarchiwizowany",
};
const priorityLabels = { high: "Wysoki", medium: "Średni", low: "Niski" } as const;

const statusColor = (goal: { status: GoalStatus; health: "ontrack" | "risk" }) => {
  if (goal.status === "completed") return C.seaGlass;
  if (goal.status === "paused" || goal.status === "planned" || goal.status === "archived") return C.textSecond;
  return goal.health === "risk" ? C.warning : C.iceBlueText;
};

function EmptyGoalState({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return <UiEmptyState icon={<Target size={20} strokeWidth={1.2} />} title={text} action={<Button variant="quiet" size="sm" onClick={onAction} leadingIcon={<Plus size={12} />}>{action}</Button>} />;
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
  const store = useGoalsStore();
  const goal = store.goals.find((item) => item.id === goalId);
  const category = store.categories.find((item) => item.id === goal?.categoryId);
  const [viewMode, setViewMode] = useState<GoalViewMode>("summary");
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
  const [hydratedGoalId, setHydratedGoalId] = useState<string | null>(null);
  const menuId = useId();

  useEffect(() => {
    setHydratedGoalId(null);
    if (!goalId) return;
    const fallback: GoalViewMode = goal?.progressMode === "milestones" ? "execution" : "summary";
    try {
      const saved = localStorage.getItem(`rootine.goal-detail-view:${goalId}`);
      setViewMode(saved === "execution" || saved === "summary" ? saved : fallback);
    } catch {
      setViewMode(fallback);
    }
    setHydratedGoalId(goalId);
  }, [goalId, goal?.progressMode]);

  useEffect(() => {
    if (!goalId || hydratedGoalId !== goalId) return;
    try {
      localStorage.setItem(`rootine.goal-detail-view:${goalId}`, viewMode);
    } catch {
      // View preference persistence is best-effort.
    }
  }, [goalId, hydratedGoalId, viewMode]);

  if (!goal) {
    return (
      <ModuleShell pageWidth="reading" ambient="quiet">
        <ModuleMain>
          <div className="flex flex-1 flex-col items-center justify-center gap-4" style={{ background: C.bg, color: C.textSecond }}>
            <Target size={38} strokeWidth={1.2} />
            <h1 className="text-[22px] font-semibold" style={{ color: C.textPrimary }}>Nie znaleziono celu</h1>
            <Button variant="primary" onClick={() => navigate("/cele")}>Wróć do celów</Button>
          </div>
        </ModuleMain>
      </ModuleShell>
    );
  }

  const progress = getGoalProgress(goal);
  const current = getGoalCurrentValue(goal);
  const completedMilestones = goal.milestones.filter((item) => item.done).length;
  const semanticStatusColor = statusColor(goal);
  const nextMilestone = goal.milestones
    .filter((item) => !item.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const sortedMilestones = [...goal.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sortedProgress = [...goal.progressEntries].sort((a, b) => b.date.localeCompare(a.date));
  const latestProgress = sortedProgress[0];
  const measurementLabel = goal.progressMode === "milestones"
    ? "Kamienie milowe"
    : goal.progressMode === "regularity"
      ? goal.regularityMode === "frequency" ? "Wykonania" : "Dni serii"
      : goal.progressMode === "manual" ? "Postęp" : "Wartość";

  const openProgress = () => {
    if (goal.progressMode === "milestones") { setEditingMilestoneId(null); setMilestoneOpen(true); }
    else { setEditingProgressId(null); setProgressOpen(true); }
  };

  const submitEdit = (data: GoalEditorData) => { store.updateGoal(goal.id, data); setEditOpen(false); };
  const openMilestone = (milestoneId: string | null = null) => { setEditingMilestoneId(milestoneId); setMilestoneOpen(true); };
  const switchView = (mode: GoalViewMode) => {
    setViewMode(mode);
    setNoteEditing(false);
  };

  const renderFacts = () => (
    <section className="goal-detail-facts" aria-labelledby="goal-facts-heading">
      <SectionHeading title="Parametry celu" />
      <button type="button" onClick={() => setEditOpen(true)}><CalendarDays size={13} /><span>Termin</span><strong>{fmtDate(goal.dueDate)}</strong><Pencil size={11} /></button>
      <button type="button" onClick={() => setEditOpen(true)}><Flag size={13} /><span>Priorytet</span><strong>{priorityLabels[goal.priority]}</strong><Pencil size={11} /></button>
      <button type="button" onClick={() => setEditOpen(true)}><Target size={13} /><span>Kategoria</span><strong>{category?.label ?? "Bez kategorii"}</strong><Pencil size={11} /></button>
      <button type="button" onClick={() => setEditOpen(true)}><BarChart3 size={13} /><span>Metoda pomiaru</span><strong>{measurementLabel}</strong><Pencil size={11} /></button>
    </section>
  );

  const renderNote = () => (
    <section className="goal-detail-note-preview" aria-labelledby="goal-note-preview-heading">
      <SectionHeading
        title="Notatka"
        action={<button type="button" className="goal-detail-text-action" onClick={() => setNoteEditing((editing) => !editing)}>{noteEditing ? "Zamknij" : goal.note ? "Edytuj" : "Dodaj"}</button>}
      />
      {noteEditing ? (
        <GoalNoteTextarea
          key={`${goal.id}-inline-note`}
          aria-label="Notatka do celu"
          value={goal.note}
          onCommit={(value) => store.updateGoal(goal.id, { note: value }, { persistence: "immediate" })}
          rows={viewMode === "execution" ? 5 : 7}
          placeholder="Dodaj założenia, kolejne kroki i ważne informacje…"
          className="goal-detail-notes-editor goal-detail-notes-editor--inline"
        />
      ) : goal.note ? (
        <p>{goal.note}</p>
      ) : (
        <p className="is-empty">Dodaj założenia, kolejne kroki i ważne informacje.</p>
      )}
    </section>
  );

  const renderNextStep = (compact = false) => (
    <section className={`goal-detail-next ${compact ? "goal-detail-next--compact" : ""}`} aria-labelledby="goal-next-step-heading">
      <div className="goal-detail-next-icon" style={{ color: goal.color }}><CircleDot size={17} /></div>
      <div className="min-w-0 flex-1">
        <h2 id="goal-next-step-heading">Następny krok</h2>
        {goal.progressMode === "milestones" ? (
          nextMilestone ? <><p className="goal-detail-next-title">{nextMilestone.title}</p><p>Termin: {fmtDate(nextMilestone.dueDate)} · waga {nextMilestone.weight}</p></> : <><p className="goal-detail-next-title">Dodaj pierwszy etap tego celu</p><p>Etapy pomagają rozłożyć większy cel na mniejsze kroki.</p></>
        ) : latestProgress ? <><p className="goal-detail-next-title">Zapisz kolejną aktualizację</p><p>Ostatni wpis: {latestProgress.note || "bez notatki"} · {fmtDate(latestProgress.date)}</p></> : <><p className="goal-detail-next-title">Zapisz pierwszy pomiar</p><p>Jedna aktualizacja wystarczy, żeby rozpocząć historię celu.</p></>}
      </div>
      <Button variant={goal.progressMode === "milestones" && nextMilestone ? "quiet" : "primary"} size="sm" onClick={() => {
        if (goal.progressMode === "milestones" && nextMilestone) store.updateMilestone(goal.id, nextMilestone.id, { done: true });
        else if (goal.progressMode === "milestones") openMilestone();
        else openProgress();
      }} leadingIcon={goal.progressMode === "milestones" && nextMilestone ? <Check size={12} /> : <Plus size={12} />}>
        {goal.progressMode === "milestones" && nextMilestone ? "Ukończ etap" : goal.progressMode === "milestones" ? "Dodaj etap" : "Dodaj postęp"}
      </Button>
    </section>
  );

  const renderMilestoneTimeline = () => (
    goal.milestones.length === 0 ? (
      <EmptyGoalState text="Ten cel nie ma jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => openMilestone()} />
    ) : (
      <div className="goal-detail-timeline">
        {sortedMilestones.map((item, index) => (
          <article key={item.id} className={`goal-detail-timeline-item ${item.done ? "is-complete" : ""}`}>
            <div className="goal-detail-timeline-rail">
              <button
                type="button"
                aria-label={`${item.done ? "Oznacz jako nieukończony" : "Oznacz jako ukończony"}: ${item.title}`}
                aria-pressed={item.done}
                onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })}
                className="goal-detail-check"
                style={{ color: C.seaGlass, borderColor: item.done ? C.seaGlass : C.borderStrong, background: item.done ? "var(--color-success-subtle)" : C.panel }}
              >
                {item.done && <Check size={12} />}
              </button>
            </div>
            <div className="goal-detail-timeline-content">
              <div className="goal-detail-timeline-heading">
                <p style={{ color: item.done ? C.textMuted : C.textPrimary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</p>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <span>Termin: {fmtDate(item.dueDate)} · waga {item.weight}</span>
            </div>
            <div className="goal-detail-timeline-actions">
              <button type="button" aria-label={`Edytuj kamień milowy ${item.title}`} onClick={() => openMilestone(item.id)}><Pencil size={12} /></button>
              <button type="button" aria-label={`Usuń kamień milowy ${item.title}`} onClick={() => setDeleteMilestoneId(item.id)}><Trash2 size={12} /></button>
            </div>
          </article>
        ))}
      </div>
    )
  );

  const renderProgressTimeline = () => (
    goal.progressEntries.length === 0 ? (
      <EmptyGoalState text="Brak zapisanych aktualizacji" action="Dodaj pierwszy postęp" onAction={openProgress} />
    ) : (
      <div className="goal-detail-timeline">
        {sortedProgress.map((item) => (
          <article key={item.id} className="goal-detail-timeline-item goal-detail-timeline-item--history">
            <div className="goal-detail-timeline-rail">
              <span className="goal-detail-timeline-marker" style={{ color: goal.color, background: `${goal.color}18` }}><BarChart3 size={15} /></span>
            </div>
            <div className="goal-detail-timeline-content">
              <div className="goal-detail-timeline-heading">
                <p className="goal-detail-history-value">{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")} {goal.progressMode === "regularity" && goal.regularityMode === "frequency" ? "wykonań" : goal.unit}</p>
                <time dateTime={item.date}>{fmtDate(item.date)}</time>
              </div>
              <span>{item.note || "Bez notatki"} · {item.kind === "absolute" ? "wartość" : "zmiana"}</span>
            </div>
            <div className="goal-detail-timeline-actions">
              <button type="button" aria-label={`Edytuj wpis postępu z ${fmtDate(item.date)}`} onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }}><Pencil size={12} /></button>
              <button type="button" aria-label={`Usuń wpis postępu z ${fmtDate(item.date)}`} onClick={() => setDeleteProgressId(item.id)}><Trash2 size={12} /></button>
            </div>
          </article>
        ))}
      </div>
    )
  );

  const pageHeader = (
    <PageHeader
      title={goal.title}
      description={`${category?.label ?? "Cel"} · Termin: ${fmtDate(goal.dueDate)} · ${getGoalMetric(goal)}`}
      leading={<Button variant="ghost" iconOnly aria-label="Wróć do celów" onClick={() => navigate("/cele")}><ArrowLeft size={15} /></Button>}
      meta={<div className="flex items-center gap-2"><Badge appearance="plain" dot style={{ color: semanticStatusColor }}>{statusLabels[goal.status]}</Badge>{store.storageFailed && <Badge tone="danger">Brak zapisu lokalnego</Badge>}</div>}
      actions={<>
        <Button className="ui-button--icon-mobile" variant="primary" onClick={openProgress} leadingIcon={<Plus size={13} />}><span className="header-action-label">{goal.progressMode === "milestones" ? "Dodaj etap" : "Dodaj postęp"}</span></Button>
        <Button variant="quiet" onClick={() => setEditOpen(true)} leadingIcon={<Pencil size={12} />}><span className="header-action-label">Edytuj</span></Button>
        <div className="relative"><Button ref={menuTriggerRef} variant="ghost" iconOnly aria-label="Więcej opcji" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((open) => !open)}><Ellipsis size={15} /></Button>{menuOpen && <Menu id={menuId} triggerRef={menuTriggerRef} onDismiss={() => setMenuOpen(false)} className="absolute right-0 top-11 z-30 w-44"><MenuItem onClick={() => { store.updateGoal(goal.id, { status: goal.status === "archived" ? "active" : "archived" }); setMenuOpen(false); }} leadingIcon={goal.status === "archived" ? <RotateCcw /> : <Archive />}>{goal.status === "archived" ? "Przywróć" : "Archiwizuj"}</MenuItem><MenuItem onClick={() => { store.duplicateGoal(goal.id); setMenuOpen(false); }} leadingIcon={<Plus />}>Duplikuj</MenuItem><MenuItem tone="danger" onClick={() => { setDeleteGoalOpen(true); setMenuOpen(false); }} leadingIcon={<Trash2 />}>Usuń</MenuItem></Menu>}</div>
      </>}
    />
  );

  return (
    <ModuleShell
      pageWidth="canvas"
      header={pageHeader}
      ambient="quiet"
    >
      <ModuleMain>
        <WorkspaceToolbar>
          <div className="goal-detail-view-controls" role="group" aria-label="Tryb widoku celu">
            <span className="goal-detail-view-controls__label">Widok</span>
            <div className="ui-view-switch">
              <Button variant="ghost" size="sm" leadingIcon={<BarChart3 size={13} />} aria-pressed={viewMode === "summary"} onClick={() => switchView("summary")}>Podsumowanie</Button>
              <Button variant="ghost" size="sm" leadingIcon={<ListChecks size={13} />} aria-pressed={viewMode === "execution"} onClick={() => switchView("execution")}>Realizacja</Button>
            </div>
          </div>
        </WorkspaceToolbar>

        <div className="goals-content flex-1 overflow-y-auto px-7 py-5">
          <div className="goal-detail-page mx-auto max-w-[1180px]">
            <section className="goal-detail-hero" aria-labelledby="goal-progress-heading">
              <div className="goal-detail-hero-content">
                <div className="goal-detail-hero-main">
                  <div className="goal-detail-hero-icon" style={{ color: goal.color, background: `${goal.color}18`, borderColor: `${goal.color}55` }}>
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
                  <div className="goal-detail-progress-track"><div className="goal-detail-progress-fill" style={{ width: `${progress}%`, background: goal.color }} /></div>
                </div>
                <div className="goal-detail-summary-grid">
                  <div><strong>{goal.progressMode === "milestones" ? `${completedMilestones}/${goal.milestones.length}` : current.toLocaleString("pl-PL")}</strong><span>{measurementLabel}</span></div>
                  <div><strong>{fmtDate(goal.dueDate)}</strong><span>Termin</span></div>
                  <div><strong style={{ color: goal.health === "risk" ? C.warning : C.seaGlass }}>{goal.health === "risk" ? "Zagrożony" : "Na planie"}</strong><span>Kondycja celu</span></div>
                </div>
              </div>
              <aside className="goal-detail-hero-details" aria-label="Szczegóły celu">
                {renderFacts()}
                {renderNote()}
              </aside>
            </section>

            {viewMode === "summary" ? (
              <div className="goal-detail-overview-grid">
                <div className="space-y-5">
                  {renderNextStep()}

                  {goal.progressMode === "milestones" ? (
                    <section>
                      <SectionHeading title="Najbliższe kamienie milowe" action={<button type="button" className="goal-detail-text-action" onClick={() => switchView("execution")}>Otwórz realizację</button>} />
                      {goal.milestones.length === 0 ? <EmptyGoalState text="Nie dodano jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => openMilestone()} /> : <div className="goal-detail-list">{goal.milestones.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)).slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })} className="goal-detail-list-row"><span className="goal-detail-check" style={{ color: C.seaGlass, borderColor: item.done ? C.seaGlass : C.borderStrong, background: item.done ? "var(--color-success-subtle)" : "transparent" }}>{item.done && <Check size={11} />}</span><span className="min-w-0 flex-1" style={{ color: item.done ? C.textMuted : C.textPrimary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span><span>{fmtDate(item.dueDate)}</span></button>)}</div>}
                    </section>
                  ) : (
                    <section>
                      <SectionHeading title="Ostatnie aktualizacje" action={<button type="button" className="goal-detail-text-action" onClick={() => switchView("execution")}>Otwórz realizację</button>} />
                      {goal.progressEntries.length === 0 ? <EmptyGoalState text="Nie zapisano jeszcze postępu" action="Dodaj aktualizację" onAction={openProgress} /> : <div className="goal-detail-list">{sortedProgress.slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }} className="goal-detail-list-row"><BarChart3 size={14} style={{ color: goal.color }} /><span className="min-w-0 flex-1 truncate" style={{ color: C.textSecond }}>{item.note || "Aktualizacja postępu"}</span><strong>{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")}</strong><span>{fmtDate(item.date)}</span></button>)}</div>}
                    </section>
                  )}
                </div>

              </div>
            ) : (
              <div className="goal-detail-execution-grid">
                <div className="space-y-5">
                  {renderNextStep(true)}
                  <section className="goal-detail-timeline-panel">
                    <SectionHeading
                      title={goal.progressMode === "milestones" ? "Oś realizacji" : "Historia postępu"}
                      action={<Button type="button" variant="primary" size="sm" leadingIcon={<Plus size={12} />} onClick={openProgress}>{goal.progressMode === "milestones" ? "Dodaj etap" : "Dodaj wpis"}</Button>}
                    />
                    <p className="goal-detail-supporting-copy">{goal.progressMode === "milestones" ? `${completedMilestones} z ${goal.milestones.length} ukończonych · kliknij kółko, żeby zmienić status.` : "Każda zmiana wpływa na aktualną wartość celu."}</p>
                    {goal.progressMode === "milestones" ? renderMilestoneTimeline() : renderProgressTimeline()}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>

        {editOpen && <GoalFormDialog goal={goal} categories={store.categories} onClose={() => setEditOpen(false)} onSubmit={submitEdit} />}
        {progressOpen && <ProgressDialog goal={goal} progress={goal.progressEntries.find((item) => item.id === editingProgressId)} onClose={() => { setProgressOpen(false); setEditingProgressId(null); }} onSubmit={(draft) => { const nextDraft = { ...draft, value: goal.progressMode === "manual" ? Math.max(0, Math.min(100, draft.value)) : draft.value }; if (editingProgressId) store.updateProgress(goal.id, editingProgressId, nextDraft); else store.addProgress(goal.id, nextDraft); setProgressOpen(false); setEditingProgressId(null); }} />}
        {milestoneOpen && <MilestoneDialog milestone={goal.milestones.find((item) => item.id === editingMilestoneId)} onClose={() => { setMilestoneOpen(false); setEditingMilestoneId(null); }} onSubmit={(draft) => { if (editingMilestoneId) store.updateMilestone(goal.id, editingMilestoneId, draft); else store.addMilestone(goal.id, draft); setMilestoneOpen(false); setEditingMilestoneId(null); }} />}
        {deleteProgressId && <ConfirmDialog title="Usuń aktualizację?" message="Aktualna wartość i procent celu zostaną ponownie przeliczone na podstawie pozostałych wpisów." onClose={() => setDeleteProgressId(null)} onConfirm={() => { store.deleteProgress(goal.id, deleteProgressId); setDeleteProgressId(null); }} />}
        {deleteMilestoneId && <ConfirmDialog title="Usuń kamień milowy?" message="Postęp celu zostanie automatycznie przeliczony po usunięciu tego etapu." onClose={() => setDeleteMilestoneId(null)} onConfirm={() => { store.deleteMilestone(goal.id, deleteMilestoneId); setDeleteMilestoneId(null); }} />}
        {deleteGoalOpen && <ConfirmDialog title="Usuń cel?" message="Cel wraz z całą historią postępu i kamieniami milowymi zostanie usunięty." onClose={() => setDeleteGoalOpen(false)} onConfirm={() => { store.deleteGoal(goal.id); navigate("/cele"); }} />}
      </ModuleMain>
    </ModuleShell>
  );
}
