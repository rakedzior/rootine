import { useEffect, useMemo, useState } from "react";
import { Dumbbell, Plus } from "lucide-react";
import { useSearchParams } from "react-router";
import {
  EXERCISE_LIBRARY, INITIAL_IMPORTS, INITIAL_PLANS, INITIAL_TEMPLATES,
  addDays, cloneExercises, createInitialSessions, startOfWeekKey, toDateKey,
  type ExerciseLibraryItem, type PendingImport, type SportView, type TrainingPlan,
  type WorkoutSession, type WorkoutTemplate,
} from "../sport/model";
import { SportSidebar, VIEW_LABELS } from "../sport/SportSidebar";
import { FullWeekPlan, SportOverview } from "../sport/SportOverview";
import { ActiveConflictDialog, ActiveWorkout, WorkoutDetailPanel } from "../sport/SportWorkout";
import { ExercisesView, HistoryView, IntegrationsView, PlansView, ProgressView } from "../sport/SportViews";
import { AddWorkoutDialog, AIPlanDialog, NewExerciseDialog, NewPlanDialog, NewTemplateDialog, ScheduleCycleDialog, TemplateEditorDialog } from "../sport/SportDialogs";
import { SPORT_COLORS as C } from "../sport/theme";
import { Badge, Button, DetailPanel, ModuleMain, ModuleShell, PageHeader, WorkspaceToolbar } from "../ui";

type DialogName = "add" | "plan" | "ai" | "template" | "exercise" | "schedule" | null;

type PersistedSportState = {
  sessions: WorkoutSession[];
  plans: TrainingPlan[];
  templates: WorkoutTemplate[];
  exercises: ExerciseLibraryItem[];
  imports: PendingImport[];
  connections: Record<string, boolean>;
};

const STORAGE_KEY = "routine-sport-v3";
const VIEWS: SportView[] = ["overview", "week", "plans", "history", "progress", "exercises", "integrations"];

function isPersistedSportState(value: unknown): value is PersistedSportState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedSportState>;
  return Array.isArray(candidate.sessions)
    && candidate.sessions.every((session) => Boolean(session) && typeof session === "object" && typeof session.id === "string" && typeof session.title === "string" && typeof session.date === "string" && Array.isArray(session.exercises))
    && Array.isArray(candidate.plans)
    && candidate.plans.every((plan) => Boolean(plan) && typeof plan === "object" && typeof plan.id === "string" && typeof plan.name === "string" && Array.isArray(plan.templateIds) && Array.isArray(plan.blocks))
    && Array.isArray(candidate.templates)
    && candidate.templates.every((template) => Boolean(template) && typeof template === "object" && typeof template.id === "string" && typeof template.name === "string" && Array.isArray(template.exercises))
    && Array.isArray(candidate.exercises)
    && candidate.exercises.every((exercise) => Boolean(exercise) && typeof exercise === "object" && typeof exercise.id === "string" && typeof exercise.name === "string")
    && Array.isArray(candidate.imports)
    && candidate.imports.every((item) => Boolean(item) && typeof item === "object" && typeof item.id === "string" && typeof item.date === "string")
    && Boolean(candidate.connections)
    && typeof candidate.connections === "object"
    && !Array.isArray(candidate.connections)
    && Object.values(candidate.connections).every((connected) => typeof connected === "boolean");
}

function initialState(): PersistedSportState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isPersistedSportState(parsed)) return parsed;
    }
  } catch {
    // A broken local draft must not prevent Sport from opening.
  }
  return {
    sessions: createInitialSessions(),
    plans: INITIAL_PLANS,
    templates: INITIAL_TEMPLATES,
    exercises: EXERCISE_LIBRARY,
    imports: INITIAL_IMPORTS,
    connections: { Strava: true, Garmin: false, "Apple Health": false },
  };
}

export default function Sport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("widok") as SportView | null;
  const view: SportView = rawView && VIEWS.includes(rawView) ? rawView : "overview";
  const [state, setState] = useState<PersistedSportState>(initialState);
  const [weekStart, setWeekStart] = useState(startOfWeekKey());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [addDate, setAddDate] = useState(toDateKey(new Date()));
  const [activeMode, setActiveMode] = useState(false);
  const [requestedStartId, setRequestedStartId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [state]);

  useEffect(() => { setSelectedSessionId(null); }, [view]);

  const selectedSession = state.sessions.find((session) => session.id === selectedSessionId);
  const activeSession = state.sessions.find((session) => session.status === "in_progress");
  const requestedSession = state.sessions.find((session) => session.id === requestedStartId);
  const currentWeekSessions = state.sessions.filter((session) => session.date >= startOfWeekKey() && session.date <= addDays(startOfWeekKey(), 6));
  const completedThisWeek = currentWeekSessions.filter((session) => session.status === "completed").length;
  const completion = currentWeekSessions.length ? Math.round((completedThisWeek / currentWeekSessions.length) * 100) : 0;

  const changeView = (next: SportView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("widok"); else params.set("widok", next);
    setSearchParams(params, { replace: true });
  };

  const updateSession = (id: string, patch: Partial<WorkoutSession>) => setState((current) => ({ ...current, sessions: current.sessions.map((session) => session.id === id ? { ...session, ...patch } : session) }));
  const replaceSession = (next: WorkoutSession) => setState((current) => ({ ...current, sessions: current.sessions.map((session) => session.id === next.id ? next : session) }));
  const toggleSelectedSession = (id: string) => setSelectedSessionId((current) => current === id ? null : id);
  const deleteSession = (id: string) => { setState((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== id) })); setSelectedSessionId(null); };
  const moveSession = (id: string, date: string) => updateSession(id, { date, status: state.sessions.find((session) => session.id === id)?.status === "missed" ? "scheduled" : state.sessions.find((session) => session.id === id)?.status });
  const openAdd = (date = toDateKey(new Date())) => { setAddDate(date); setDialog("add"); };

  const startSession = (id: string) => {
    const active = state.sessions.find((session) => session.status === "in_progress");
    if (active && active.id !== id) { setRequestedStartId(id); return; }
    updateSession(id, { status: "in_progress" });
    setSelectedSessionId(null);
    setActiveMode(true);
  };

  const resolveConflict = (mode: "incomplete" | "discard") => {
    if (!activeSession || !requestedSession) return;
    if (mode === "incomplete") updateSession(activeSession.id, { status: "incomplete" });
    else updateSession(activeSession.id, { status: "scheduled" });
    updateSession(requestedSession.id, { status: "in_progress" });
    setRequestedStartId(null);
    setSelectedSessionId(null);
    setActiveMode(true);
  };

  const updateTemplateExercises = (templateId: string, exercises: WorkoutSession["exercises"]) => setState((current) => ({ ...current, templates: current.templates.map((template) => template.id === templateId ? { ...template, exercises: exercises.map((item) => ({ ...item, sets: item.sets.map((set) => ({ ...set, done: false })) })) } : template) }));

  const resolveImport = (importId: string, mode: "separate" | "assign", sessionId?: string) => setState((current) => {
    const item = current.imports.find((entry) => entry.id === importId);
    if (!item) return current;
    let sessions = current.sessions;
    if (mode === "assign" && sessionId) sessions = sessions.map((session) => session.id === sessionId ? { ...session, status: "completed" as const, importedFrom: item.source, durationMinutes: item.durationMinutes, metrics: { ...session.metrics, distanceKm: item.distanceKm, timeMinutes: item.durationMinutes } } : session);
    if (mode === "separate") sessions = [...sessions, { id: `imported-${Date.now()}`, title: item.title, discipline: item.discipline, date: item.date, durationMinutes: item.durationMinutes, status: "completed", exercises: [], importedFrom: item.source, metrics: { distanceKm: item.distanceKm, timeMinutes: item.durationMinutes } }];
    return { ...current, sessions, imports: current.imports.filter((entry) => entry.id !== importId) };
  });

  if (activeSession && activeMode) {
    return <ActiveWorkout session={activeSession} library={state.exercises} onBack={() => setActiveMode(false)} onUpdate={replaceSession} onFinish={() => { updateSession(activeSession.id, { status: "completed" }); setActiveMode(false); setSelectedSessionId(activeSession.id); }} onIncomplete={() => { updateSession(activeSession.id, { status: "incomplete" }); setActiveMode(false); setSelectedSessionId(activeSession.id); }} onUpdateTemplate={updateTemplateExercises} />;
  }

  const content = (() => {
    switch (view) {
      case "week": return <FullWeekPlan sessions={state.sessions} weekStart={weekStart} onWeekChange={setWeekStart} onMove={moveSession} onSelect={toggleSelectedSession} onAdd={openAdd} />;
      case "plans": return <PlansView plans={state.plans} templates={state.templates} onCreatePlan={() => setDialog("plan")} onCreateAIPlan={() => setDialog("ai")} onTogglePlan={(id) => setState((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, active: !plan.active } : plan) }))} onEditPlan={setEditingPlanId} onCreateTemplate={() => setDialog("template")} onEditTemplate={setEditingTemplateId} onSchedule={() => setDialog("schedule")} />;
      case "history": return <HistoryView sessions={state.sessions} onSelect={toggleSelectedSession} />;
      case "progress": return <ProgressView sessions={state.sessions} plans={state.plans} />;
      case "exercises": return <ExercisesView exercises={state.exercises} onAdd={() => setDialog("exercise")} />;
      case "integrations": return <IntegrationsView imports={state.imports} sessions={state.sessions} connections={state.connections} onToggleConnection={(name) => setState((current) => ({ ...current, connections: { ...current.connections, [name]: !current.connections[name] } }))} onResolve={resolveImport} />;
      default: return <SportOverview sessions={state.sessions} weekStart={weekStart} onWeekChange={setWeekStart} onMove={moveSession} onSelect={toggleSelectedSession} onStart={startSession} onAdd={openAdd} />;
    }
  })();

  const labels = VIEW_LABELS[view];
  const selectedPlan = selectedSession?.planId ? state.plans.find((plan) => plan.id === selectedSession.planId) : undefined;
  const selectedTemplate = selectedSession?.templateId ? state.templates.find((template) => template.id === selectedSession.templateId) : undefined;

  return (
    <ModuleShell className="sport-module">
      <SportSidebar view={view} onChange={changeView} importCount={state.imports.length} />
      <ModuleMain>
        <PageHeader
          title="Sport"
          description={`${labels.title} · ${labels.subtitle}`}
          leading={<Dumbbell size={18} strokeWidth={1.5} />}
          meta={storageFailed ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          actions={<Button className="ui-button--icon-mobile" variant="primary" onClick={() => openAdd()} leadingIcon={<Plus size={14} strokeWidth={1.7} />}><span className="header-action-label">Dodaj trening</span></Button>}
        />

        <WorkspaceToolbar>
          <div className="flex min-w-0 items-center gap-2">
            <select aria-label="Widok Sport" value={view} onChange={(event) => changeView(event.target.value as SportView)} className="context-mobile-select ui-field__control ui-select ui-select--compact">{VIEWS.map((item) => <option key={item} value={item}>{VIEW_LABELS[item].title}</option>)}</select>
            <span className="workspace-context-label">{labels.title}</span>
          </div>
          <div className="sport-toolbar-metrics flex items-center gap-1">
            <Button variant="quiet" size="sm" onClick={() => changeView("progress")}>Plan {completion}%</Button>
            <Button variant="quiet" size="sm" onClick={() => changeView("integrations")}>{state.imports.length ? `${state.imports.length} aktywności` : "Aktywności"}</Button>
          </div>
        </WorkspaceToolbar>

        {activeSession && <button type="button" onClick={() => setActiveMode(true)} className="flex min-h-10 items-center justify-between border-b px-7 text-left" style={{ background: C.warningBg, borderColor: "color-mix(in srgb, var(--color-warning-ochre) 25%, transparent)" }}><span className="text-[10px]" style={{ color: C.warning }}>Trening w toku: <strong>{activeSession.title}</strong></span><span className="text-[9px]" style={{ color: C.warning }}>Wznów →</span></button>}

        <div className={`min-h-0 flex-1 ${view === "week" || view === "exercises" ? "overflow-hidden" : "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}`}>
          <div className="sport-content h-full w-full px-7 py-5">{content}</div>
        </div>
      </ModuleMain>

      {selectedSession && <DetailPanel label="Szczegóły treningu"><WorkoutDetailPanel session={selectedSession} plan={selectedPlan} template={selectedTemplate} onClose={() => setSelectedSessionId(null)} onStart={() => startSession(selectedSession.id)} onUpdate={(patch) => updateSession(selectedSession.id, patch)} onDuplicate={() => { const id = `session-copy-${Date.now()}`; const copy: WorkoutSession = { ...selectedSession, id, title: `${selectedSession.title} — kopia`, status: "scheduled", exercises: selectedSession.exercises.map((item, itemIndex) => ({ ...item, id: `${id}-e${itemIndex}`, sets: item.sets.map((set, setIndex) => ({ ...set, id: `${id}-e${itemIndex}-s${setIndex}`, done: false })) })) }; setState((current) => ({ ...current, sessions: [...current.sessions, copy] })); setSelectedSessionId(id); }} onDelete={() => deleteSession(selectedSession.id)} /></DetailPanel>}

      {dialog === "add" && <AddWorkoutDialog templates={state.templates} initialDate={addDate} onClose={() => setDialog(null)} onSubmit={(session) => { setState((current) => ({ ...current, sessions: [...current.sessions, session] })); setDialog(null); setSelectedSessionId(session.id); }} />}
      {dialog === "plan" && <NewPlanDialog onClose={() => setDialog(null)} onSubmit={(plan) => { setState((current) => ({ ...current, plans: [...current.plans, plan] })); setDialog(null); }} />}
      {editingPlanId && state.plans.find((plan) => plan.id === editingPlanId) && <NewPlanDialog plan={state.plans.find((plan) => plan.id === editingPlanId)!} onClose={() => setEditingPlanId(null)} onSubmit={(plan) => { setState((current) => ({ ...current, plans: current.plans.map((item) => item.id === plan.id ? plan : item) })); setEditingPlanId(null); }} />}
      {dialog === "ai" && <AIPlanDialog onClose={() => setDialog(null)} onSubmit={(plan) => { setState((current) => ({ ...current, plans: [...current.plans, plan] })); setDialog(null); }} />}
      {dialog === "template" && <NewTemplateDialog onClose={() => setDialog(null)} onSubmit={(template) => { setState((current) => ({ ...current, templates: [...current.templates, template] })); setDialog(null); }} />}
      {dialog === "exercise" && <NewExerciseDialog onClose={() => setDialog(null)} onSubmit={(exercise) => { setState((current) => ({ ...current, exercises: [...current.exercises, exercise] })); setDialog(null); }} />}
      {dialog === "schedule" && <ScheduleCycleDialog plans={state.plans} templates={state.templates} onClose={() => setDialog(null)} onSubmit={(sessions) => { setState((current) => ({ ...current, sessions: [...current.sessions, ...sessions] })); setDialog(null); changeView("week"); }} />}
      {editingTemplateId && state.templates.find((template) => template.id === editingTemplateId) && <TemplateEditorDialog template={state.templates.find((template) => template.id === editingTemplateId)!} library={state.exercises} onClose={() => setEditingTemplateId(null)} onSubmit={(template) => { setState((current) => ({
        ...current,
        templates: current.templates.map((item) => item.id === template.id ? template : item),
        sessions: current.sessions.map((session) => session.templateId === template.id && session.status === "scheduled" ? {
          ...session,
          title: template.name,
          discipline: template.discipline,
          durationMinutes: template.durationMinutes,
          exercises: cloneExercises(template.exercises, session.id),
          stages: template.stages?.map((stage, index) => ({ ...stage, id: `${session.id}-stage-${index}`, done: false })),
        } : session),
      })); setEditingTemplateId(null); }} />}

      {activeSession && requestedSession && <ActiveConflictDialog active={activeSession} requested={requestedSession} onResume={() => { setRequestedStartId(null); setActiveMode(true); }} onSaveIncomplete={() => resolveConflict("incomplete")} onDiscard={() => resolveConflict("discard")} onClose={() => setRequestedStartId(null)} />}
    </ModuleShell>
  );
}
