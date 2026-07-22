import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router";
import {
  EXERCISE_LIBRARY, INITIAL_IMPORTS, INITIAL_PLANS, INITIAL_TEMPLATES,
  addDays, createInitialSessions, startOfWeekKey, toDateKey,
  type ExerciseLibraryItem, type PendingImport, type SportView, type TrainingPlan,
  type WorkoutSession, type WorkoutTemplate,
} from "../sport/model";
import { SportSidebar, VIEW_LABELS } from "../sport/SportSidebar";
import { FullWeekPlan, SportOverview } from "../sport/SportOverview";
import { ActiveConflictDialog, ActiveWorkout, WorkoutDetailPanel } from "../sport/SportWorkout";
import { ExercisesView, HistoryView, IntegrationsView, PlansView, ProgressView } from "../sport/SportViews";
import { AddWorkoutDialog, AIPlanDialog, NewExerciseDialog, NewPlanDialog, NewTemplateDialog, ScheduleCycleDialog, TemplateEditorDialog } from "../sport/SportDialogs";
import { ProgressBar } from "../sport/Shared";
import { SPORT_COLORS as C } from "../sport/theme";

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

function initialState(): PersistedSportState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as PersistedSportState;
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* local persistence is best-effort */ }
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
      case "week": return <FullWeekPlan sessions={state.sessions} weekStart={weekStart} onWeekChange={setWeekStart} onMove={moveSession} onSelect={setSelectedSessionId} onAdd={openAdd} />;
      case "plans": return <PlansView plans={state.plans} templates={state.templates} onCreatePlan={() => setDialog("plan")} onCreateAIPlan={() => setDialog("ai")} onTogglePlan={(id) => setState((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === id ? { ...plan, active: !plan.active } : plan) }))} onCreateTemplate={() => setDialog("template")} onEditTemplate={setEditingTemplateId} onSchedule={() => setDialog("schedule")} />;
      case "history": return <HistoryView sessions={state.sessions} onSelect={setSelectedSessionId} />;
      case "progress": return <ProgressView sessions={state.sessions} plans={state.plans} />;
      case "exercises": return <ExercisesView exercises={state.exercises} onAdd={() => setDialog("exercise")} />;
      case "integrations": return <IntegrationsView imports={state.imports} sessions={state.sessions} connections={state.connections} onToggleConnection={(name) => setState((current) => ({ ...current, connections: { ...current.connections, [name]: !current.connections[name] } }))} onResolve={resolveImport} />;
      default: return <SportOverview sessions={state.sessions} weekStart={weekStart} onWeekChange={setWeekStart} onMove={moveSession} onSelect={setSelectedSessionId} onStart={startSession} onAdd={openAdd} />;
    }
  })();

  const labels = VIEW_LABELS[view];
  const selectedPlan = selectedSession?.planId ? state.plans.find((plan) => plan.id === selectedSession.planId) : undefined;
  const selectedTemplate = selectedSession?.templateId ? state.templates.find((template) => template.id === selectedSession.templateId) : undefined;

  return (
    <div className="sport-module relative flex h-full min-w-0 flex-1 overflow-hidden" style={{ background: C.bg }}>
      <SportSidebar view={view} onChange={changeView} importCount={state.imports.length} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[70px] items-center justify-between gap-4 border-b px-6 py-3.5" style={{ borderColor: C.border }}>
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold" style={{ color: C.text }}>{labels.title}</h1>
            <p className="mt-0.5 truncate text-[10px]" style={{ color: C.textMuted }}>{labels.subtitle}</p>
            <select aria-label="Widok Sport" value={view} onChange={(event) => changeView(event.target.value as SportView)} className="sport-mobile-nav mt-2 hidden rounded-md border px-2 py-1 text-[10px] outline-none" style={{ background: C.input, color: C.textSecond, borderColor: C.border }}>{VIEWS.map((item) => <option key={item} value={item}>{VIEW_LABELS[item].title}</option>)}</select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => changeView("progress")} className="sport-header-metric hidden h-9 min-w-[116px] rounded-lg border px-2.5 text-left xl:block" style={{ background: C.input, borderColor: C.border }}><div className="flex items-center justify-between gap-2"><span className="text-[7px]" style={{ color: C.textMuted }}>Realizacja planu</span><span className="text-[9px]" style={{ color: C.green, fontFamily: "'DM Mono', monospace" }}>{completedThisWeek}/{currentWeekSessions.length} · {completion}%</span></div><div className="mt-1.5"><ProgressBar value={completion} color={C.green} /></div></button>
            <button type="button" onClick={() => changeView("integrations")} className="sport-header-metric hidden h-9 min-w-[116px] rounded-lg border px-2.5 text-left xl:block" style={{ background: C.input, borderColor: C.border }}><p className="text-[7px]" style={{ color: C.textMuted }}>Aktywności</p><p className="mt-1 text-[9px]" style={{ color: state.imports.length ? C.warning : C.textSecond }}>{state.imports.length ? `${state.imports.length} do przypisania` : "Wszystko przypisane"}</p></button>
            <button type="button" onClick={() => openAdd()} className="sport-quiet-button flex items-center gap-1.5"><Plus size={10} strokeWidth={1.6} /> Dodaj trening</button>
          </div>
        </header>

        {activeSession && <button type="button" onClick={() => setActiveMode(true)} className="flex min-h-10 items-center justify-between border-b px-7 text-left" style={{ background: C.warningBg, borderColor: "rgba(212,170,104,.2)" }}><span className="text-[10px]" style={{ color: C.warning }}>Trening w toku: <strong>{activeSession.title}</strong></span><span className="text-[9px]" style={{ color: C.warning }}>Wznów →</span></button>}

        <div className={`min-h-0 flex-1 ${view === "week" || view === "exercises" ? "overflow-hidden" : "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}`}>
          <div className={`h-full w-full ${view === "week" ? "px-5 py-5" : "px-6 py-5"}`}>{content}</div>
        </div>
      </main>

      {selectedSession && <WorkoutDetailPanel session={selectedSession} plan={selectedPlan} template={selectedTemplate} onClose={() => setSelectedSessionId(null)} onStart={() => startSession(selectedSession.id)} onUpdate={(patch) => updateSession(selectedSession.id, patch)} onDuplicate={() => { const id = `session-copy-${Date.now()}`; const copy: WorkoutSession = { ...selectedSession, id, title: `${selectedSession.title} — kopia`, status: "scheduled", exercises: selectedSession.exercises.map((item, itemIndex) => ({ ...item, id: `${id}-e${itemIndex}`, sets: item.sets.map((set, setIndex) => ({ ...set, id: `${id}-e${itemIndex}-s${setIndex}`, done: false })) })) }; setState((current) => ({ ...current, sessions: [...current.sessions, copy] })); setSelectedSessionId(id); }} onDelete={() => deleteSession(selectedSession.id)} />}

      {dialog === "add" && <AddWorkoutDialog templates={state.templates} initialDate={addDate} onClose={() => setDialog(null)} onSubmit={(session) => { setState((current) => ({ ...current, sessions: [...current.sessions, session] })); setDialog(null); setSelectedSessionId(session.id); }} />}
      {dialog === "plan" && <NewPlanDialog onClose={() => setDialog(null)} onSubmit={(plan) => { setState((current) => ({ ...current, plans: [...current.plans, plan] })); setDialog(null); }} />}
      {dialog === "ai" && <AIPlanDialog onClose={() => setDialog(null)} onSubmit={(plan) => { setState((current) => ({ ...current, plans: [...current.plans, plan] })); setDialog(null); }} />}
      {dialog === "template" && <NewTemplateDialog onClose={() => setDialog(null)} onSubmit={(template) => { setState((current) => ({ ...current, templates: [...current.templates, template] })); setDialog(null); }} />}
      {dialog === "exercise" && <NewExerciseDialog onClose={() => setDialog(null)} onSubmit={(exercise) => { setState((current) => ({ ...current, exercises: [...current.exercises, exercise] })); setDialog(null); }} />}
      {dialog === "schedule" && <ScheduleCycleDialog plans={state.plans} templates={state.templates} onClose={() => setDialog(null)} onSubmit={(sessions) => { setState((current) => ({ ...current, sessions: [...current.sessions, ...sessions] })); setDialog(null); changeView("week"); }} />}
      {editingTemplateId && state.templates.find((template) => template.id === editingTemplateId) && <TemplateEditorDialog template={state.templates.find((template) => template.id === editingTemplateId)!} library={state.exercises} onClose={() => setEditingTemplateId(null)} onSubmit={(template) => { setState((current) => ({ ...current, templates: current.templates.map((item) => item.id === template.id ? template : item) })); setEditingTemplateId(null); }} />}

      {activeSession && requestedSession && <ActiveConflictDialog active={activeSession} requested={requestedSession} onResume={() => { setRequestedStartId(null); setActiveMode(true); }} onSaveIncomplete={() => resolveConflict("incomplete")} onDiscard={() => resolveConflict("discard")} onClose={() => setRequestedStartId(null)} />}
    </div>
  );
}
