import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  Ellipsis,
  Flag,
  ListChecks,
  NotebookPen,
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
  useGoalsStore,
} from "../goals/goalsStore";
import type { GoalStatus } from "../goals/goalsStore";
import { ConfirmDialog, GoalFormDialog, MilestoneDialog, ProgressDialog } from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";

const C = {
  bg: "#242424", panel: "#2E2E2E", input: "#202020", border: "#383838", strong: "#484848",
  primary: "#F0F0F0", second: "#A0A0A0", muted: "#707070", blue: "#4772FA", green: "#70B89F", warning: "#D4AA68", danger: "#CF777C",
};

type TabId = "overview" | "progress" | "notes";

const fmtDate = (date: string) => new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));

const statusColor = (goal: { status: GoalStatus; health: "ontrack" | "risk" }) => {
  if (goal.status === "completed") return C.green;
  if (goal.status === "paused" || goal.status === "planned" || goal.status === "archived") return C.second;
  return goal.health === "risk" ? C.warning : C.blue;
};

function EmptyState({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return <div className="flex flex-col items-center justify-center gap-3 rounded-xl border py-14" style={{ borderColor: C.border, color: C.muted }}><Target size={28} strokeWidth={1.2} /><p className="text-[12px]">{text}</p><button type="button" onClick={onAction} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.blue }}><Plus size={12} />{action}</button></div>;
}

export default function CelSzczegoly() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const store = useGoalsStore();
  const goal = store.goals.find((item) => item.id === goalId);
  const category = store.categories.find((item) => item.id === goal?.categoryId);
  const [tab, setTab] = useState<TabId>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [deleteProgressId, setDeleteProgressId] = useState<string | null>(null);
  const [deleteMilestoneId, setDeleteMilestoneId] = useState<string | null>(null);
  const [deleteGoalOpen, setDeleteGoalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!goal) {
    return <div className="flex flex-1 flex-col items-center justify-center gap-4" style={{ background: C.bg, color: C.second }}><Target size={38} strokeWidth={1.2} /><h1 className="text-[18px] font-semibold" style={{ color: C.primary }}>Nie znaleziono celu</h1><button type="button" onClick={() => navigate("/cele")} className="rounded-lg px-4 py-2.5 text-[11px]" style={{ background: C.blue, color: "white" }}>Wróć do celów</button></div>;
  }

  const progress = getGoalProgress(goal);
  const current = getGoalCurrentValue(goal);
  const completedMilestones = goal.milestones.filter((item) => item.done).length;
  const semanticStatusColor = statusColor(goal);
  const statusLabels: Record<GoalStatus, string> = { planned: "Zaplanowany", active: "Aktywny", paused: "Wstrzymany", completed: "Zakończony", archived: "Zarchiwizowany" };
  const tabs: { id: TabId; label: string; icon: typeof Target; count?: number }[] = [
    { id: "overview", label: "Przegląd", icon: BarChart3 },
    { id: "progress", label: goal.progressMode === "milestones" ? "Kamienie milowe" : "Postęp", icon: ListChecks, count: goal.progressMode === "milestones" ? goal.milestones.length : goal.progressEntries.length },
    { id: "notes", label: "Notatka", icon: NotebookPen },
  ];

  const openProgress = () => {
    if (goal.progressMode === "milestones") { setEditingMilestoneId(null); setMilestoneOpen(true); }
    else { setEditingProgressId(null); setProgressOpen(true); }
  };

  const submitEdit = (data: GoalEditorData) => { store.updateGoal(goal.id, data); setEditOpen(false); };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: C.bg }}>
      <header className="border-b px-8 pb-0 pt-6" style={{ borderColor: C.border }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <button type="button" onClick={() => navigate("/cele")} className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border" style={{ color: C.second, borderColor: C.border }}><ArrowLeft size={15} /></button>
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border" style={{ color: C.second, background: C.input, borderColor: C.strong }}>{goal.customIcon ? <img src={goal.customIcon} alt="" className="h-8 w-8 object-contain" /> : <Target size={21} strokeWidth={1.6} />}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-[21px] font-semibold" style={{ color: C.primary }}>{goal.title}</h1><span className="rounded-md border px-2 py-1 text-[9px]" style={{ color: semanticStatusColor, borderColor: `${semanticStatusColor}40`, background: `${semanticStatusColor}0A` }}>{statusLabels[goal.status]}</span></div>
              <p className="mt-1 max-w-2xl text-[11px] leading-5" style={{ color: C.muted }}>{goal.description || "Brak opisu celu"}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[9px]" style={{ color: C.muted }}><span style={{ color: C.second }}>{category?.label}</span><span>•</span><span>Termin: {fmtDate(goal.dueDate)}</span><span>•</span><span>{getGoalMetric(goal)}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={openProgress} className="flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[11px] font-semibold" style={{ background: C.blue, color: "white" }}><Plus size={13} />{goal.progressMode === "milestones" ? "Dodaj etap" : "Dodaj postęp"}</button>
            <button type="button" onClick={() => setEditOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px]" style={{ borderColor: C.border, color: C.second }}><Pencil size={12} />Edytuj</button>
            <div className="relative"><button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-lg border" style={{ borderColor: C.border, color: C.second }}><Ellipsis size={15} /></button>{menuOpen && <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border py-1 shadow-2xl" style={{ background: C.input, borderColor: C.strong }}><button type="button" onClick={() => { store.updateGoal(goal.id, { status: goal.status === "archived" ? "active" : "archived" }); setMenuOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[10px]" style={{ color: C.second }}>{goal.status === "archived" ? <RotateCcw size={12} /> : <Archive size={12} />}{goal.status === "archived" ? "Przywróć" : "Archiwizuj"}</button><button type="button" onClick={() => { store.duplicateGoal(goal.id); setMenuOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[10px]" style={{ color: C.second }}><Plus size={12} />Duplikuj</button><button type="button" onClick={() => { setDeleteGoalOpen(true); setMenuOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[10px]" style={{ color: C.danger }}><Trash2 size={12} />Usuń</button></div>}</div>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" onClick={() => setTab(id)} className="flex items-center gap-1.5 border-b-2 px-3 py-3 text-[10px]" style={{ color: tab === id ? C.blue : C.muted, borderColor: tab === id ? C.blue : "transparent" }}><Icon size={12} />{label}{count !== undefined && <span className="rounded px-1.5 py-0.5 text-[8px]" style={{ background: C.input }}>{count}</span>}</button>)}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-[1100px]">
          {tab === "overview" && <div className="goal-full-overview grid grid-cols-[minmax(0,1fr)_320px] gap-5">
            <div className="space-y-5">
              <section className="rounded-2xl border p-5" style={{ background: C.panel, borderColor: C.border }}><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Ogólny postęp</p><p className="mt-2 text-[30px] font-semibold" style={{ color: C.blue, fontFamily: "'DM Mono',monospace" }}>{progress}%</p></div><p className="text-[11px]" style={{ color: C.second }}>{getGoalMetric(goal)}</p></div><div className="h-2.5 overflow-hidden rounded-full" style={{ background: C.strong }}><div className="h-full rounded-full" style={{ width: `${progress}%`, background: C.blue }} /></div></section>
              {goal.progressMode === "milestones" ? (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Najbliższe kamienie milowe</h2><button type="button" onClick={() => setTab("progress")} className="text-[10px]" style={{ color: C.blue }}>Zobacz wszystkie</button></div>
                  {goal.milestones.length === 0 ? <EmptyState text="Nie dodano jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => setMilestoneOpen(true)} /> : <div className="space-y-2">{goal.milestones.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)).slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })} className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left" style={{ background: C.panel, borderColor: C.border }}><span className="flex h-5 w-5 items-center justify-center rounded-full border" style={{ color: C.green, borderColor: item.done ? C.green : C.strong, background: item.done ? "rgba(112,184,159,.12)" : "transparent" }}>{item.done && <Check size={11} />}</span><span className="flex-1 text-[11px]" style={{ color: item.done ? C.muted : C.primary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span><span className="text-[9px]" style={{ color: C.muted }}>{fmtDate(item.dueDate)}</span></button>)}</div>}
                </section>
              ) : (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Ostatnie aktualizacje</h2><button type="button" onClick={() => setTab("progress")} className="text-[10px]" style={{ color: C.blue }}>Zobacz historię</button></div>
                  {goal.progressEntries.length === 0 ? <EmptyState text="Nie zapisano jeszcze postępu" action="Dodaj aktualizację" onAction={openProgress} /> : <div className="space-y-2">{goal.progressEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }} className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left" style={{ background: C.panel, borderColor: C.border }}><BarChart3 size={13} style={{ color: C.blue }} /><span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: C.second }}>{item.note || "Aktualizacja postępu"}</span><span className="text-[10px] font-medium" style={{ color: C.primary }}>{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")}</span><span className="text-[9px]" style={{ color: C.muted }}>{fmtDate(item.date)}</span></button>)}</div>}
                </section>
              )}
            </div>
            <aside className="space-y-3"><div className="grid grid-cols-2 gap-3">{[{ label: "Aktualna wartość", value: goal.progressMode === "milestones" ? `${completedMilestones}/${goal.milestones.length}` : current.toLocaleString("pl-PL"), color: C.primary }, { label: "Postęp", value: `${progress}%`, color: C.blue }, { label: "Priorytet", value: goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski", color: C.second }, { label: "Kondycja", value: goal.health === "risk" ? "Zagrożony" : "Na planie", color: goal.health === "risk" ? C.warning : C.green }].map((item) => <div key={item.label} className="rounded-xl border p-3.5" style={{ background: C.panel, borderColor: C.border }}><p className="text-[13px] font-semibold" style={{ color: item.color }}>{item.value}</p><p className="mt-1 text-[9px]" style={{ color: C.muted }}>{item.label}</p></div>)}</div><div className="rounded-xl border p-4" style={{ background: C.panel, borderColor: C.border }}><h3 className="mb-3 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Szczegóły</h3>{[{ icon: CalendarDays, label: "Termin", value: fmtDate(goal.dueDate) }, { icon: Flag, label: "Priorytet", value: goal.priority }].map(({ icon: Icon, label, value }) => <button key={label} type="button" onClick={() => setEditOpen(true)} className="flex w-full items-center gap-2 border-b py-3 text-left last:border-0" style={{ borderColor: C.border }}><Icon size={12} style={{ color: C.muted }} /><span className="flex-1 text-[10px]" style={{ color: C.muted }}>{label}</span><span className="text-[10px]" style={{ color: C.second }}>{value}</span></button>)}</div></aside>
          </div>}

          {tab === "progress" && goal.progressMode !== "milestones" && <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold" style={{ color: C.primary }}>Historia postępu</h2><p className="mt-1 text-[10px]" style={{ color: C.muted }}>Każda zmiana wpływa na aktualną wartość celu.</p></div><button type="button" onClick={openProgress} className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[10px]" style={{ background: C.blue, color: "white" }}><Plus size={12} />Dodaj wpis</button></div>{goal.progressEntries.length === 0 ? <EmptyState text="Brak zapisanych aktualizacji" action="Dodaj pierwszy postęp" onAction={openProgress} /> : <div className="space-y-2">{goal.progressEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div key={item.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5" style={{ background: C.panel, borderColor: C.border }}><div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: C.blue, background: "rgba(71,114,250,.08)" }}><BarChart3 size={16} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: C.primary, fontFamily: "'DM Mono',monospace" }}>{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")} {goal.progressMode === "regularity" && goal.regularityMode === "frequency" ? "wykonań" : goal.unit}</span><span className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: C.muted, background: C.input }}>{item.kind === "absolute" ? "wartość" : "zmiana"}</span></div><p className="mt-1 truncate text-[10px]" style={{ color: C.muted }}>{item.note || "Bez notatki"}</p></div><span className="text-[9px]" style={{ color: C.muted }}>{fmtDate(item.date)}</span><button type="button" onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }} className="p-2" style={{ color: C.muted }}><Pencil size={12} /></button><button type="button" onClick={() => setDeleteProgressId(item.id)} className="p-2" style={{ color: C.danger }}><Trash2 size={12} /></button></div>)}</div>}</section>}

          {tab === "progress" && goal.progressMode === "milestones" && <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold" style={{ color: C.primary }}>Kamienie milowe</h2><p className="mt-1 text-[10px]" style={{ color: C.muted }}>{completedMilestones} z {goal.milestones.length} ukończonych</p></div><button type="button" onClick={() => { setEditingMilestoneId(null); setMilestoneOpen(true); }} className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[10px]" style={{ background: C.blue, color: "white" }}><Plus size={12} />Dodaj kamień</button></div>{goal.milestones.length === 0 ? <EmptyState text="Ten cel nie ma jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => setMilestoneOpen(true)} /> : <div className="space-y-2">{goal.milestones.map((item, index) => <div key={item.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5" style={{ background: C.panel, borderColor: C.border }}><button type="button" onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })} className="flex h-6 w-6 items-center justify-center rounded-full border" style={{ color: C.green, borderColor: item.done ? C.green : C.strong, background: item.done ? "rgba(112,184,159,.12)" : "transparent" }}>{item.done && <Check size={12} />}</button><span className="text-[10px] tabular-nums" style={{ color: C.muted }}>{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-medium" style={{ color: item.done ? C.muted : C.primary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</p><p className="mt-1 text-[9px]" style={{ color: C.muted }}>Termin: {fmtDate(item.dueDate)} · waga {item.weight}</p></div><button type="button" onClick={() => { setEditingMilestoneId(item.id); setMilestoneOpen(true); }} className="p-2" style={{ color: C.muted }}><Pencil size={12} /></button><button type="button" onClick={() => setDeleteMilestoneId(item.id)} className="p-2" style={{ color: C.danger }}><Trash2 size={12} /></button></div>)}</div>}</section>}

          {tab === "notes" && <section className="mx-auto max-w-[760px]"><div className="mb-4"><h2 className="text-[15px] font-semibold" style={{ color: C.primary }}>Notatka do celu</h2><p className="mt-1 text-[10px]" style={{ color: C.muted }}>Zmiany zapisują się automatycznie.</p></div><textarea value={goal.note} onChange={(event) => store.updateGoal(goal.id, { note: event.target.value })} rows={14} placeholder="Dodaj założenia, kolejne kroki i ważne informacje…" className="w-full resize-none rounded-2xl border p-5 text-[13px] leading-6 outline-none" style={{ color: C.second, background: C.panel, borderColor: C.border }} /></section>}
        </div>
      </main>

      {editOpen && <GoalFormDialog goal={goal} categories={store.categories} onClose={() => setEditOpen(false)} onSubmit={submitEdit} />}
      {progressOpen && <ProgressDialog goal={goal} progress={goal.progressEntries.find((item) => item.id === editingProgressId)} onClose={() => { setProgressOpen(false); setEditingProgressId(null); }} onSubmit={(draft) => { const nextDraft = { ...draft, value: goal.progressMode === "manual" ? Math.max(0, Math.min(100, draft.value)) : draft.value }; if (editingProgressId) store.updateProgress(goal.id, editingProgressId, nextDraft); else store.addProgress(goal.id, nextDraft); setProgressOpen(false); setEditingProgressId(null); }} />}
      {milestoneOpen && <MilestoneDialog milestone={goal.milestones.find((item) => item.id === editingMilestoneId)} onClose={() => { setMilestoneOpen(false); setEditingMilestoneId(null); }} onSubmit={(draft) => { if (editingMilestoneId) store.updateMilestone(goal.id, editingMilestoneId, draft); else store.addMilestone(goal.id, draft); setMilestoneOpen(false); setEditingMilestoneId(null); }} />}
      {deleteProgressId && <ConfirmDialog title="Usunąć aktualizację?" message="Aktualna wartość i procent celu zostaną ponownie przeliczone na podstawie pozostałych wpisów." onClose={() => setDeleteProgressId(null)} onConfirm={() => { store.deleteProgress(goal.id, deleteProgressId); setDeleteProgressId(null); }} />}
      {deleteMilestoneId && <ConfirmDialog title="Usunąć kamień milowy?" message="Postęp celu zostanie automatycznie przeliczony po usunięciu tego etapu." onClose={() => setDeleteMilestoneId(null)} onConfirm={() => { store.deleteMilestone(goal.id, deleteMilestoneId); setDeleteMilestoneId(null); }} />}
      {deleteGoalOpen && <ConfirmDialog title="Usunąć cel?" message="Cel wraz z całą historią postępu i kamieniami milowymi zostanie usunięty." onClose={() => setDeleteGoalOpen(false)} onConfirm={() => { store.deleteGoal(goal.id); navigate("/cele"); }} />}
    </div>
  );
}
