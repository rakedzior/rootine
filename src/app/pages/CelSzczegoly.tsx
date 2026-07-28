import { useId, useRef, useState } from "react";
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
} from "../goals/goalsModel";
import { useGoalsStore } from "../goals/goalsContext";
import type { GoalStatus } from "../goals/goalsModel";
import { formatLocalDate } from "../data/localDate";
import { ConfirmDialog, GoalFormDialog, MilestoneDialog, ProgressDialog } from "../goals/GoalDialogs";
import type { GoalEditorData } from "../goals/GoalDialogs";
import { GoalNoteTextarea } from "../goals/GoalNoteTextarea";
import { Badge, Button, Card, EmptyState as UiEmptyState, Menu, MenuItem, ModuleMain, ModuleShell, PageHeader, Tabs } from "../ui";
import { C } from "../goals/goalPresentationModel";
import "../../styles/goals.css";

type TabId = "overview" | "progress" | "notes";

const fmtDate = (date: string) => formatLocalDate(date);

const statusColor = (goal: { status: GoalStatus; health: "ontrack" | "risk" }) => {
  if (goal.status === "completed") return C.seaGlass;
  if (goal.status === "paused" || goal.status === "planned" || goal.status === "archived") return C.textSecond;
  return goal.health === "risk" ? C.warning : C.iceBlueText;
};

function EmptyState({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return <UiEmptyState icon={<Target size={20} strokeWidth={1.2} />} title={text} action={<Button variant="quiet" size="sm" onClick={onAction} leadingIcon={<Plus size={12} />}>{action}</Button>} />;
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  if (!goal) {
    return <div className="flex flex-1 flex-col items-center justify-center gap-4" style={{ background: C.bg, color: C.textSecond }}><Target size={38} strokeWidth={1.2} /><h1 className="text-[22px] font-semibold" style={{ color: C.textPrimary }}>Nie znaleziono celu</h1><Button variant="primary" onClick={() => navigate("/cele")}>Wróć do celów</Button></div>;
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
    <ModuleShell>
      <ModuleMain>
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
        below={<Tabs id="goal-detail-tabs" ariaLabel="Sekcje celu" activeId={tab} onChange={(id) => setTab(id as TabId)} items={tabs.map(({ id, label, icon: Icon, count }) => ({ id, tabId: `goal-tab-${id}`, panelId: `goal-panel-${id}`, label: <span className="flex items-center gap-1.5"><Icon size={12} />{label}{count !== undefined && <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ background: C.inputBg }}>{count}</span>}</span> }))} />}
      />

      <div className="goals-content flex-1 overflow-y-auto px-7 py-5">
        <div className="mx-auto max-w-[1100px]">
          <div
            id={`goal-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`goal-tab-${tab}`}
            tabIndex={0}
          >
          {tab === "overview" && <div className="goal-full-overview grid grid-cols-[minmax(0,1fr)_320px] gap-5">
            <div className="space-y-5">
              <Card as="section" padding="spacious"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>Ogólny postęp</p><p className="mt-2 text-[22px] font-semibold" style={{ color: C.iceBlueText, fontFamily: "var(--font-data)" }}>{progress}%</p></div><p className="text-[11px]" style={{ color: C.textSecond }}>{getGoalMetric(goal)}</p></div><div className="h-2.5 overflow-hidden rounded-full" style={{ background: C.borderStrong }}><div className="h-full rounded-full" style={{ width: `${progress}%`, background: goal.color }} /></div></Card>
              {goal.progressMode === "milestones" ? (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Najbliższe kamienie milowe</h2><button type="button" onClick={() => setTab("progress")} className="text-[10px]" style={{ color: C.iceBlueText }}>Zobacz wszystkie</button></div>
                  {goal.milestones.length === 0 ? <EmptyState text="Nie dodano jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => setMilestoneOpen(true)} /> : <div className="space-y-2">{goal.milestones.slice().sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)).slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })} className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left" style={{ background: C.panel, borderColor: C.borderSubtle }}><span className="flex h-5 w-5 items-center justify-center rounded-full border" style={{ color: C.seaGlass, borderColor: item.done ? C.seaGlass : C.borderStrong, background: item.done ? "rgba(112,184,159,.12)" : "transparent" }}>{item.done && <Check size={11} />}</span><span className="flex-1 text-[11px]" style={{ color: item.done ? C.textMuted : C.textPrimary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span><span className="text-[9px]" style={{ color: C.textMuted }}>{fmtDate(item.dueDate)}</span></button>)}</div>}
                </section>
              ) : (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>Ostatnie aktualizacje</h2><button type="button" onClick={() => setTab("progress")} className="text-[10px]" style={{ color: C.iceBlueText }}>Zobacz historię</button></div>
                  {goal.progressEntries.length === 0 ? <EmptyState text="Nie zapisano jeszcze postępu" action="Dodaj aktualizację" onAction={openProgress} /> : <div className="space-y-2">{goal.progressEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }} className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left" style={{ background: C.panel, borderColor: C.borderSubtle }}><BarChart3 size={13} style={{ color: goal.color }} /><span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: C.textSecond }}>{item.note || "Aktualizacja postępu"}</span><span className="text-[10px] font-medium" style={{ color: C.textPrimary }}>{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")}</span><span className="text-[9px]" style={{ color: C.textMuted }}>{fmtDate(item.date)}</span></button>)}</div>}
                </section>
              )}
            </div>
            <aside className="space-y-3"><div className="grid grid-cols-2 gap-3">{[{ label: "Aktualna wartość", value: goal.progressMode === "milestones" ? `${completedMilestones}/${goal.milestones.length}` : current.toLocaleString("pl-PL"), color: C.textPrimary }, { label: "Postęp", value: `${progress}%`, color: C.iceBlueText }, { label: "Priorytet", value: goal.priority === "high" ? "Wysoki" : goal.priority === "medium" ? "Średni" : "Niski", color: C.textSecond }, { label: "Kondycja", value: goal.health === "risk" ? "Zagrożony" : "Na planie", color: goal.health === "risk" ? C.warning : C.seaGlass }].map((item) => <div key={item.label} className="rounded-xl border p-3.5" style={{ background: C.panel, borderColor: C.borderSubtle }}><p className="text-[13px] font-semibold" style={{ color: item.color }}>{item.value}</p><p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>{item.label}</p></div>)}</div><div className="rounded-xl border p-4" style={{ background: C.panel, borderColor: C.borderSubtle }}><h3 className="mb-3 text-[10px] uppercase tracking-wider" style={{ color: C.textMuted }}>Szczegóły</h3>{[{ icon: CalendarDays, label: "Termin", value: fmtDate(goal.dueDate) }, { icon: Flag, label: "Priorytet", value: goal.priority }].map(({ icon: Icon, label, value }) => <button key={label} type="button" onClick={() => setEditOpen(true)} className="flex w-full items-center gap-2 border-b py-3 text-left last:border-0" style={{ borderColor: C.borderSubtle }}><Icon size={12} style={{ color: C.textMuted }} /><span className="flex-1 text-[10px]" style={{ color: C.textMuted }}>{label}</span><span className="text-[10px]" style={{ color: C.textSecond }}>{value}</span></button>)}</div></aside>
          </div>}

          {tab === "progress" && goal.progressMode !== "milestones" && <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-[16px] font-semibold" style={{ color: C.textPrimary }}>Historia postępu</h2><p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>Każda zmiana wpływa na aktualną wartość celu.</p></div><Button type="button" variant="primary" size="sm" leadingIcon={<Plus size={12} />} onClick={openProgress}>Dodaj wpis</Button></div>{goal.progressEntries.length === 0 ? <EmptyState text="Brak zapisanych aktualizacji" action="Dodaj pierwszy postęp" onAction={openProgress} /> : <div className="space-y-2">{goal.progressEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div key={item.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5" style={{ background: C.panel, borderColor: C.borderSubtle }}><div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: goal.color, background: `${goal.color}18` }}><BarChart3 size={16} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[13px] font-semibold" style={{ color: C.textPrimary, fontFamily: "'DM Mono',monospace" }}>{item.kind === "delta" && item.value > 0 ? "+" : ""}{item.value.toLocaleString("pl-PL")} {goal.progressMode === "regularity" && goal.regularityMode === "frequency" ? "wykonań" : goal.unit}</span><span className="rounded px-1.5 py-0.5 text-[9px]" style={{ color: C.textMuted, background: C.inputBg }}>{item.kind === "absolute" ? "wartość" : "zmiana"}</span></div><p className="mt-1 truncate text-[10px]" style={{ color: C.textMuted }}>{item.note || "Bez notatki"}</p></div><span className="text-[9px]" style={{ color: C.textMuted }}>{fmtDate(item.date)}</span><button type="button" aria-label={`Edytuj wpis postępu z ${fmtDate(item.date)}`} onClick={() => { setEditingProgressId(item.id); setProgressOpen(true); }} className="p-2" style={{ color: C.textMuted }}><Pencil size={12} /></button><button type="button" aria-label={`Usuń wpis postępu z ${fmtDate(item.date)}`} onClick={() => setDeleteProgressId(item.id)} className="p-2" style={{ color: C.danger }}><Trash2 size={12} /></button></div>)}</div>}</section>}

          {tab === "progress" && goal.progressMode === "milestones" && <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-[16px] font-semibold" style={{ color: C.textPrimary }}>Kamienie milowe</h2><p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>{completedMilestones} z {goal.milestones.length} ukończonych</p></div><Button type="button" variant="primary" size="sm" leadingIcon={<Plus size={12} />} onClick={() => { setEditingMilestoneId(null); setMilestoneOpen(true); }}>Dodaj kamień</Button></div>{goal.milestones.length === 0 ? <EmptyState text="Ten cel nie ma jeszcze kamieni milowych" action="Dodaj pierwszy kamień" onAction={() => setMilestoneOpen(true)} /> : <div className="space-y-2">{goal.milestones.map((item, index) => <div key={item.id} className="flex items-center gap-4 rounded-xl border px-4 py-3.5" style={{ background: C.panel, borderColor: C.borderSubtle }}><button type="button" aria-label={`${item.done ? "Oznacz jako nieukończony" : "Oznacz jako ukończony"}: ${item.title}`} aria-pressed={item.done} onClick={() => store.updateMilestone(goal.id, item.id, { done: !item.done })} className="flex h-6 w-6 items-center justify-center rounded-full border" style={{ color: C.seaGlass, borderColor: item.done ? C.seaGlass : C.borderStrong, background: item.done ? "rgba(112,184,159,.12)" : "transparent" }}>{item.done && <Check size={12} />}</button><span className="text-[10px] tabular-nums" style={{ color: C.textMuted }}>{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-medium" style={{ color: item.done ? C.textMuted : C.textPrimary, textDecoration: item.done ? "line-through" : "none" }}>{item.title}</p><p className="mt-1 text-[9px]" style={{ color: C.textMuted }}>Termin: {fmtDate(item.dueDate)} · waga {item.weight}</p></div><button type="button" aria-label={`Edytuj kamień milowy ${item.title}`} onClick={() => { setEditingMilestoneId(item.id); setMilestoneOpen(true); }} className="p-2" style={{ color: C.textMuted }}><Pencil size={12} /></button><button type="button" aria-label={`Usuń kamień milowy ${item.title}`} onClick={() => setDeleteMilestoneId(item.id)} className="p-2" style={{ color: C.danger }}><Trash2 size={12} /></button></div>)}</div>}</section>}

          {tab === "notes" && <section className="mx-auto max-w-[760px]"><div className="mb-4"><h2 className="text-[16px] font-semibold" style={{ color: C.textPrimary }}>Notatka do celu</h2><p className="mt-1 text-[10px]" style={{ color: C.textMuted }}>Zmiany zapisują się automatycznie.</p></div><GoalNoteTextarea key={goal.id} aria-label="Notatka do celu" value={goal.note} onCommit={(value) => store.updateGoal(goal.id, { note: value }, { persistence: "immediate" })} rows={14} placeholder="Dodaj założenia, kolejne kroki i ważne informacje…" className="w-full resize-none rounded-2xl border p-5 text-[13px] leading-6 outline-none" style={{ color: C.textSecond, background: C.panel, borderColor: C.borderSubtle }} /></section>}
          </div>
        </div>
      </div>

      {editOpen && <GoalFormDialog goal={goal} categories={store.categories} onClose={() => setEditOpen(false)} onSubmit={submitEdit} />}
      {progressOpen && <ProgressDialog goal={goal} progress={goal.progressEntries.find((item) => item.id === editingProgressId)} onClose={() => { setProgressOpen(false); setEditingProgressId(null); }} onSubmit={(draft) => { const nextDraft = { ...draft, value: goal.progressMode === "manual" ? Math.max(0, Math.min(100, draft.value)) : draft.value }; if (editingProgressId) store.updateProgress(goal.id, editingProgressId, nextDraft); else store.addProgress(goal.id, nextDraft); setProgressOpen(false); setEditingProgressId(null); }} />}
      {milestoneOpen && <MilestoneDialog milestone={goal.milestones.find((item) => item.id === editingMilestoneId)} onClose={() => { setMilestoneOpen(false); setEditingMilestoneId(null); }} onSubmit={(draft) => { if (editingMilestoneId) store.updateMilestone(goal.id, editingMilestoneId, draft); else store.addMilestone(goal.id, draft); setMilestoneOpen(false); setEditingMilestoneId(null); }} />}
      {deleteProgressId && <ConfirmDialog title="Usunąć aktualizację?" message="Aktualna wartość i procent celu zostaną ponownie przeliczone na podstawie pozostałych wpisów." onClose={() => setDeleteProgressId(null)} onConfirm={() => { store.deleteProgress(goal.id, deleteProgressId); setDeleteProgressId(null); }} />}
      {deleteMilestoneId && <ConfirmDialog title="Usunąć kamień milowy?" message="Postęp celu zostanie automatycznie przeliczony po usunięciu tego etapu." onClose={() => setDeleteMilestoneId(null)} onConfirm={() => { store.deleteMilestone(goal.id, deleteMilestoneId); setDeleteMilestoneId(null); }} />}
      {deleteGoalOpen && <ConfirmDialog title="Usunąć cel?" message="Cel wraz z całą historią postępu i kamieniami milowymi zostanie usunięty." onClose={() => setDeleteGoalOpen(false)} onConfirm={() => { store.deleteGoal(goal.id); navigate("/cele"); }} />}
      </ModuleMain>
    </ModuleShell>
  );
}
