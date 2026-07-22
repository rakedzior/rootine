/**
 * THESIS: Odżywianie jest dziennym arkuszem budżetu, nie galerią kafli KPI.
 * OWN-WORLD: Grafitowe powierzchnie, jedna precyzyjna niebieska akcja, dane w DM Mono i semantyczne paski postępu.
 * STORY: Użytkownik wybiera dzień, zapisuje produkt w posiłku, widzi bilans i koryguje cele lub nawodnienie.
 * FIRST VIEWPORT: Pod nagłówkiem i datą szeroki rejestr posiłków stoi obok wąskiego panelu budżetu dnia.
 * FORM: Kandydat 6 — arkusz składników pogrupowany według posiłków, z nieruchomą logiką kolumn i oddzielonym podsumowaniem.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Apple,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Droplets,
  Minus,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Salad,
  Save,
  Trash2,
  Utensils,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionHeader,
  Select,
  Tabs,
  uiColors,
} from "../ui";
import {
  createDemoNutritionDay,
  createEmptyNutritionDay,
  createEmptyNutritionWorkspace,
  loadNutritionWorkspace,
  nutritionDateKey,
  saveNutritionWorkspace,
  type MealSlot,
  type NutritionEntry,
  type NutritionGoals,
  type NutritionWorkspace,
} from "../data/nutritionWorkspace";

const MEAL_META = [
  { id: "breakfast" as const, label: "Śniadanie", icon: Coffee },
  { id: "lunch" as const, label: "Obiad", icon: Utensils },
  { id: "snack" as const, label: "Przekąska", icon: Apple },
  { id: "dinner" as const, label: "Kolacja", icon: Moon },
];

const NUTRIENT_META = [
  { key: "calories" as const, label: "Kalorie", color: uiColors.precisionBlueText },
  { key: "protein" as const, label: "Białko", unit: "g", color: uiColors.success },
  { key: "carbs" as const, label: "Węglowodany", unit: "g", color: uiColors.warning },
  { key: "fat" as const, label: "Tłuszcze", unit: "g", color: uiColors.danger },
];

type NutritionView = "journal" | "targets";
type EntryField = "calories" | "protein" | "carbs" | "fat";

interface EntryDraft {
  meal: MealSlot;
  name: string;
  portion: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const createEntryDraft = (meal: MealSlot = "breakfast"): EntryDraft => ({
  meal,
  name: "",
  portion: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
});

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return nutritionDateKey(date);
}

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function sumEntries(entries: NutritionEntry[]) {
  return entries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function parseDraftNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatEntryCount(count: number) {
  if (count === 1) return "1 pozycja";
  const lastTwo = count % 100;
  const last = count % 10;
  return `${count} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "pozycje" : "pozycji"}`;
}

export default function Odzywanie() {
  const [initialLoad] = useState(loadNutritionWorkspace);
  const [workspace, setWorkspace] = useState(initialLoad.workspace);
  const [loadStatus, setLoadStatus] = useState(initialLoad.status);
  const [savePending, setSavePending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(nutritionDateKey);
  const [view, setView] = useState<NutritionView>("journal");
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(createEntryDraft);
  const [editingEntry, setEditingEntry] = useState<{ meal: MealSlot; entry: NutritionEntry } | null>(null);
  const [entryErrors, setEntryErrors] = useState<{ name?: string; calories?: string }>({});
  const [goalDraft, setGoalDraft] = useState(() => ({
    calories: String(workspace.goals.calories),
    protein: String(workspace.goals.protein),
    carbs: String(workspace.goals.carbs),
    fat: String(workspace.goals.fat),
    water: String(workspace.goals.water),
  }));
  const [goalError, setGoalError] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [undoEntry, setUndoEntry] = useState<{ meal: MealSlot; entry: NutritionEntry } | null>(null);

  const today = nutritionDateKey();
  const day = workspace.days[selectedDate] ?? createEmptyNutritionDay(selectedDate);
  const allEntries = useMemo(() => Object.values(day.entries).flat(), [day.entries]);
  const totals = useMemo(() => sumEntries(allEntries), [allEntries]);
  const recentEntries = useMemo(() => {
    const unique = new Map<string, NutritionEntry>();
    Object.values(workspace.days)
      .filter((candidate) => candidate.source !== "demo")
      .flatMap((candidate) => Object.values(candidate.entries).flat())
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .forEach((entry) => {
        const key = `${entry.name.trim().toLocaleLowerCase("pl-PL")}|${entry.portion.trim().toLocaleLowerCase("pl-PL")}`;
        if (!unique.has(key)) unique.set(key, entry);
      });
    return Array.from(unique.values()).slice(0, 4);
  }, [workspace.days]);

  useEffect(() => {
    if (!savePending) return;
    const saved = saveNutritionWorkspace(workspace);
    setStorageFailed(!saved);
    if (saved) setLoadStatus("ok");
    setSavePending(false);
  }, [savePending, workspace]);

  useEffect(() => {
    setUndoEntry(null);
  }, [selectedDate]);

  const closeEntryDialog = useCallback(() => {
    setEntryDialogOpen(false);
    setEntryErrors({});
    setEditingEntry(null);
  }, []);

  const openEntryDialog = (meal: MealSlot = "breakfast") => {
    setEntryDraft(createEntryDraft(meal));
    setEditingEntry(null);
    setEntryErrors({});
    setEntryDialogOpen(true);
  };

  const openEditDialog = (meal: MealSlot, entry: NutritionEntry) => {
    setEntryDraft({
      meal,
      name: entry.name,
      portion: entry.portion,
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    });
    setEditingEntry({ meal, entry });
    setEntryErrors({});
    setEntryDialogOpen(true);
  };

  const commitWorkspace = (updater: (current: NutritionWorkspace) => NutritionWorkspace) => {
    setWorkspace(updater);
    setSavePending(true);
  };

  const updateDay = (updater: (current: ReturnType<typeof createEmptyNutritionDay>) => ReturnType<typeof createEmptyNutritionDay>) => {
    commitWorkspace((current) => {
      const currentDay = current.days[selectedDate] ?? createEmptyNutritionDay(selectedDate);
      return { ...current, days: { ...current.days, [selectedDate]: updater(currentDay) } };
    });
  };

  const submitEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = entryDraft.name.trim();
    const calories = parseDraftNumber(entryDraft.calories);
    const errors = {
      name: name ? undefined : "Podaj nazwę produktu lub dania.",
      calories: calories > 0 ? undefined : "Podaj kaloryczność większą od zera.",
    };
    setEntryErrors(errors);
    if (errors.name || errors.calories) return;

    const timestamp = new Date().toISOString();
    const entry: NutritionEntry = {
      id: editingEntry?.entry.id ?? `nutrition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      portion: entryDraft.portion.trim() || "1 porcja",
      calories,
      protein: parseDraftNumber(entryDraft.protein),
      carbs: parseDraftNumber(entryDraft.carbs),
      fat: parseDraftNumber(entryDraft.fat),
      createdAt: editingEntry?.entry.createdAt ?? timestamp,
      updatedAt: editingEntry ? timestamp : undefined,
    };
    updateDay((current) => {
      const entries = { ...current.entries };
      if (editingEntry) {
        entries[editingEntry.meal] = entries[editingEntry.meal].filter((candidate) => candidate.id !== editingEntry.entry.id);
      }
      const targetEntries = entries[entryDraft.meal].filter((candidate) => candidate.id !== entry.id);
      entries[entryDraft.meal] = [...targetEntries, entry];
      return { ...current, entries };
    });
    closeEntryDialog();
  };

  const applyRecentEntry = (entry: NutritionEntry) => {
    setEntryDraft((current) => ({
      ...current,
      name: entry.name,
      portion: entry.portion,
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    }));
    setEntryErrors({});
  };

  const removeEntry = (meal: MealSlot, id: string) => {
    const entry = day.entries[meal].find((candidate) => candidate.id === id);
    if (entry) setUndoEntry({ meal, entry });
    updateDay((current) => ({
      ...current,
      entries: { ...current.entries, [meal]: current.entries[meal].filter((entry) => entry.id !== id) },
    }));
  };

  const restoreEntry = () => {
    if (!undoEntry) return;
    updateDay((current) => ({
      ...current,
      entries: {
        ...current.entries,
        [undoEntry.meal]: [...current.entries[undoEntry.meal], undoEntry.entry],
      },
    }));
    setUndoEntry(null);
  };

  const changeWater = (delta: number) => {
    updateDay((current) => ({ ...current, water: Math.max(0, Math.min(30, current.water + delta)) }));
  };

  const saveGoals = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Object.fromEntries(Object.entries(goalDraft).map(([key, value]) => [key, parseDraftNumber(value)])) as unknown as NutritionGoals;
    if (Object.values(next).some((value) => value <= 0)) {
      setGoalError("Każdy cel musi być liczbą większą od zera.");
      return;
    }
    commitWorkspace((current) => ({ ...current, goals: next }));
    setGoalError("");
    setView("journal");
  };

  const loadDemoDay = () => {
    commitWorkspace((current) => ({
      ...current,
      days: { ...current.days, [selectedDate]: createDemoNutritionDay(selectedDate) },
    }));
  };

  const clearDemoDay = () => {
    commitWorkspace((current) => ({
      ...current,
      days: { ...current.days, [selectedDate]: createEmptyNutritionDay(selectedDate) },
    }));
    setUndoEntry(null);
  };

  const retryLoad = () => {
    const result = loadNutritionWorkspace();
    setLoadStatus(result.status);
    setStorageFailed(false);
    if (result.status === "ok") setWorkspace(result.workspace);
  };

  const startFreshAfterCorruption = () => {
    setWorkspace(createEmptyNutritionWorkspace());
    setLoadStatus("missing");
    setStorageFailed(false);
    setSavePending(true);
  };

  const headerMeta = storageFailed ? (
    <Badge tone="danger">Brak zapisu lokalnego</Badge>
  ) : loadStatus === "corrupt" ? (
    <Badge tone="danger">Zapis wymaga decyzji</Badge>
  ) : day.source === "demo" ? (
    <Badge tone="violet">Dane przykładowe</Badge>
  ) : (
    <Badge tone="neutral">Dane lokalne</Badge>
  );

  return (
    <main className="nutrition-module flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: uiColors.graphiteCanvas, color: uiColors.chalkWhite }}>
      <PageHeader
        title="Odżywianie"
        description="Dzienny rejestr posiłków, makroskładników i nawodnienia"
        leading={<Salad size={18} strokeWidth={1.5} />}
        meta={headerMeta}
        actions={loadStatus !== "corrupt" && view === "journal" ? (
          <Button variant="primary" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openEntryDialog()}>
            Dodaj produkt
          </Button>
        ) : undefined}
        below={loadStatus !== "corrupt" ? (
          <Tabs
            ariaLabel="Widok Odżywiania"
            activeId={view}
            onChange={(id) => setView(id as NutritionView)}
            items={[
              { id: "journal", label: "Dziennik" },
              { id: "targets", label: "Cele dzienne" },
            ]}
          />
        ) : undefined}
      />

      {loadStatus === "corrupt" ? (
        <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5">
          <Card as="section" tone="panel" padding="spacious" className="mx-auto max-w-[680px]" role="alert">
            <SectionHeader
              title="Nie udało się odczytać lokalnego dziennika"
              description="Nie nadpisaliśmy zapisanych danych. Możesz ponowić odczyt albo świadomie rozpocząć nowy, pusty dziennik."
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="quiet" leadingIcon={<RefreshCw size={13} />} onClick={retryLoad}>
                Spróbuj ponownie
              </Button>
              <Button variant="danger" onClick={startFreshAfterCorruption}>
                Rozpocznij pusty dziennik
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <>
      {view === "journal" && <div className="nutrition-toolbar flex flex-wrap items-center justify-between gap-3 border-b px-7 py-3" style={{ borderColor: uiColors.borderSubtle, background: uiColors.graphiteCanvas }}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni dzień" onClick={() => setSelectedDate((current) => shiftDate(current, -1))}>
            <ChevronLeft size={14} />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value || today)}
            aria-label="Wybrany dzień"
            className="nutrition-date-input"
          />
          <Button variant="ghost" size="sm" iconOnly aria-label="Następny dzień" onClick={() => setSelectedDate((current) => shiftDate(current, 1))}>
            <ChevronRight size={14} />
          </Button>
          {selectedDate !== today && <Button variant="quiet" size="sm" onClick={() => setSelectedDate(today)}>Dzisiaj</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CalendarDays size={13} style={{ color: uiColors.textMuted }} />
          <span className="capitalize" style={{ color: uiColors.textSecondary, fontSize: "var(--text-meta)" }}>{formatDate(selectedDate)}</span>
          {day.source === "demo" && (
            <Button variant="quiet" size="sm" onClick={clearDemoDay}>Wyczyść przykład</Button>
          )}
        </div>
      </div>}

      <div className="nutrition-content min-h-0 flex-1 overflow-y-auto px-7 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {view === "journal" ? (
          <div id="panel-journal" role="tabpanel" aria-labelledby="tab-journal" className="nutrition-layout mx-auto w-full max-w-[1320px]">
            <section className="min-w-0">
              <SectionHeader
                title="Rejestr posiłków"
                description={`${formatEntryCount(allEntries.length)} · ${totals.calories.toLocaleString("pl-PL")} kcal`}
                action={<Button variant="ghost" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openEntryDialog()}>Dodaj</Button>}
              />

              {allEntries.length === 0 ? (
                <EmptyState
                  icon={<Utensils size={17} />}
                  title="Brak zapisanych posiłków"
                  description="Dodaj pierwszy produkt albo wczytaj jawnie oznaczony przykład, aby poznać układ dziennika."
                  action={(
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openEntryDialog()}>Dodaj produkt</Button>
                      <Button variant="quiet" size="sm" onClick={loadDemoDay}>Wczytaj przykład</Button>
                    </div>
                  )}
                />
              ) : (
                <Card padding="none" tone="panel" className="overflow-hidden">
                  <div className="nutrition-ledger-scroll overflow-x-auto [scrollbar-width:thin]">
                    <table className="nutrition-ledger-table">
                      <caption className="sr-only">Produkty i makroskładniki dla dnia {formatDate(selectedDate)}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Produkt</th>
                          <th scope="col">Porcja</th>
                          <th scope="col">Kalorie</th>
                          <th scope="col">Białko</th>
                          <th scope="col">Węglowodany</th>
                          <th scope="col">Tłuszcze</th>
                          <th scope="col"><span className="sr-only">Akcje</span></th>
                        </tr>
                      </thead>

                      {MEAL_META.map(({ id, label, icon: Icon }) => {
                        const mealEntries = day.entries[id];
                        const mealTotals = sumEntries(mealEntries);
                        return (
                          <tbody key={id} className="nutrition-meal-group">
                            <tr>
                              <th id={`meal-${id}`} scope="rowgroup" colSpan={7} className="nutrition-meal-header-cell">
                                <div className="flex min-h-11 items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Icon size={13} strokeWidth={1.5} style={{ color: uiColors.textSecondary }} />
                                    <span className="text-[12px] font-semibold" style={{ color: uiColors.chalkWhite }}>{label}</span>
                                    <Badge tone="neutral">{mealEntries.length}</Badge>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px]" style={{ color: uiColors.textMuted, fontFamily: "var(--font-data)" }}>{mealTotals.calories} kcal</span>
                                    <Button variant="ghost" size="sm" iconOnly aria-label={`Dodaj produkt: ${label}`} onClick={() => openEntryDialog(id)}>
                                      <Plus size={12} />
                                    </Button>
                                  </div>
                                </div>
                              </th>
                            </tr>

                            {mealEntries.length ? mealEntries.map((entry) => (
                              <tr key={entry.id} className="nutrition-entry-record">
                                <td className="nutrition-product-cell" data-label="Produkt">
                                  <span className="truncate text-[12px] font-medium" title={entry.name} style={{ color: uiColors.textSecondary }}>{entry.name}</span>
                                </td>
                                <td className="nutrition-portion-cell" data-label="Porcja">
                                  <span className="truncate" title={entry.portion}>{entry.portion}</span>
                                </td>
                                <td className="nutrition-number-cell" data-label="Kalorie">{entry.calories}</td>
                                <td className="nutrition-number-cell" data-label="Białko">{entry.protein} g</td>
                                <td className="nutrition-number-cell" data-label="Węglowodany">{entry.carbs} g</td>
                                <td className="nutrition-number-cell" data-label="Tłuszcze">{entry.fat} g</td>
                                <td className="nutrition-entry-actions">
                                  <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${entry.name}`} onClick={() => openEditDialog(id, entry)}>
                                    <Pencil size={12} />
                                  </Button>
                                  <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${entry.name}`} onClick={() => removeEntry(id, entry.id)}>
                                    <Trash2 size={12} />
                                  </Button>
                                </td>
                              </tr>
                            )) : (
                              <tr className="nutrition-empty-record">
                                <td colSpan={7} className="nutrition-empty-cell">
                                  <span>Brak produktów w tym posiłku</span>
                                  <Button variant="ghost" size="sm" onClick={() => openEntryDialog(id)}>Dodaj</Button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                </Card>
              )}
              {undoEntry && (
                <Card tone="input" padding="dense" className="mt-3 flex items-center justify-between gap-3" role="status">
                  <span className="truncate text-[10px]" style={{ color: uiColors.textSecondary }}>Usunięto: {undoEntry.entry.name}</span>
                  <Button variant="ghost" size="sm" onClick={restoreEntry}>Cofnij</Button>
                </Card>
              )}
            </section>

            <aside className="nutrition-summary min-w-0">
              <section>
                <SectionHeader title="Budżet dnia" variant="label" />
                <Card tone="card" padding="default">
                  <div className="space-y-4">
                    {NUTRIENT_META.map(({ key, label, unit, color }) => {
                      const current = totals[key];
                      const goal = workspace.goals[key];
                      const ratio = goal > 0 ? current / goal : 0;
                      const remaining = goal - current;
                      return (
                        <div key={key}>
                          <div className="mb-1.5 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-medium" style={{ color: uiColors.textSecondary }}>{label}</p>
                              <p className="mt-0.5" style={{ color: remaining < 0 ? uiColors.danger : uiColors.textMuted, fontSize: "var(--text-micro)" }}>
                                {remaining < 0 ? `Przekroczono o ${Math.abs(remaining).toLocaleString("pl-PL")} ${unit ?? "kcal"}` : `Pozostało ${remaining.toLocaleString("pl-PL")} ${unit ?? "kcal"}`}
                              </p>
                            </div>
                            <span className="flex-shrink-0" style={{ color: ratio > 1 ? uiColors.danger : uiColors.chalkWhite, fontFamily: "var(--font-data)", fontSize: "var(--text-meta)" }}>
                              {current.toLocaleString("pl-PL")} / {goal.toLocaleString("pl-PL")}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(current, goal)} style={{ background: uiColors.graphiteInput }}>
                            <div className="h-full w-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, ratio)})`, background: ratio > 1 ? uiColors.danger : color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>

              <section>
                <SectionHeader title="Nawodnienie" variant="label" />
                <Card tone="panel" padding="default">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Droplets size={15} strokeWidth={1.5} style={{ color: uiColors.precisionBlueText }} />
                      <div>
                        <p className="text-[12px] font-medium" style={{ color: uiColors.textSecondary }}>Szklanki wody</p>
                        <p className="mt-0.5" style={{ color: uiColors.textMuted, fontSize: "var(--text-micro)" }}>Cel dzienny: {workspace.goals.water}</p>
                      </div>
                    </div>
                    <span className="font-semibold" style={{ color: uiColors.precisionBlueText, fontFamily: "var(--font-data)", fontSize: "var(--text-title)" }}>{day.water}</span>
                  </div>
                  <div className="my-3 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Nawodnienie" aria-valuemin={0} aria-valuemax={workspace.goals.water} aria-valuenow={Math.min(day.water, workspace.goals.water)} style={{ background: uiColors.graphiteInput }}>
                    <div className="h-full w-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, day.water / workspace.goals.water)})`, background: uiColors.precisionBlueText }} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="quiet" size="sm" iconOnly aria-label="Odejmij szklankę" disabled={day.water === 0} onClick={() => changeWater(-1)}><Minus size={12} /></Button>
                    <span className="text-[10px]" style={{ color: uiColors.textMuted }}>{day.water} z {workspace.goals.water} szklanek</span>
                    <Button variant="quiet" size="sm" iconOnly aria-label="Dodaj szklankę" onClick={() => changeWater(1)}><Plus size={12} /></Button>
                  </div>
                </Card>
              </section>
            </aside>
          </div>
        ) : (
          <section id="panel-targets" role="tabpanel" aria-labelledby="tab-targets" className="mx-auto w-full max-w-[760px]">
            <SectionHeader title="Cele dzienne" description="Ustal limity używane do obliczania budżetu każdego dnia." />
            <Card as="section" tone="panel" padding="spacious">
              <form onSubmit={saveGoals}>
                <div className="nutrition-goals-grid">
                  <Input label="Kalorie" type="number" min="1" step="1" value={goalDraft.calories} onChange={(event) => setGoalDraft((current) => ({ ...current, calories: event.target.value }))} />
                  <Input label="Białko (g)" type="number" min="1" step="1" value={goalDraft.protein} onChange={(event) => setGoalDraft((current) => ({ ...current, protein: event.target.value }))} />
                  <Input label="Węglowodany (g)" type="number" min="1" step="1" value={goalDraft.carbs} onChange={(event) => setGoalDraft((current) => ({ ...current, carbs: event.target.value }))} />
                  <Input label="Tłuszcze (g)" type="number" min="1" step="1" value={goalDraft.fat} onChange={(event) => setGoalDraft((current) => ({ ...current, fat: event.target.value }))} />
                  <Input label="Woda (szklanki)" type="number" min="1" step="1" value={goalDraft.water} onChange={(event) => setGoalDraft((current) => ({ ...current, water: event.target.value }))} />
                </div>
                {goalError && <p className="mt-3 text-[10px]" role="alert" style={{ color: uiColors.danger }}>{goalError}</p>}
                <div className="mt-5 flex justify-end">
                  <Button type="submit" variant="primary" leadingIcon={<Save size={13} />}>Zapisz cele</Button>
                </div>
              </form>
            </Card>
          </section>
        )}
      </div>
        </>
      )}

      {loadStatus !== "corrupt" && entryDialogOpen && (
        <Modal
          title={editingEntry ? "Edytuj produkt" : "Dodaj produkt"}
          eyebrow={editingEntry ? "Korekta wpisu" : "Dziennik żywienia"}
          description={editingEntry
            ? `Zmieniasz wpis z dnia: ${formatDate(selectedDate)}.`
            : `Wpis zostanie dodany do dnia: ${formatDate(selectedDate)}.`}
          width={620}
          onClose={closeEntryDialog}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEntryDialog}>Anuluj</Button>
              <Button
                type="submit"
                form="nutrition-entry-form"
                variant="primary"
                leadingIcon={editingEntry ? <Save size={13} /> : <Plus size={13} />}
              >
                {editingEntry ? "Zapisz zmiany" : "Dodaj do dziennika"}
              </Button>
            </>
          )}
        >
          <form id="nutrition-entry-form" onSubmit={submitEntry} className="space-y-4">
            {!editingEntry && recentEntries.length > 0 && (
              <section aria-label="Ostatnie produkty">
                <SectionHeader title="Ostatnie produkty" level={3} variant="label" />
                <div className="nutrition-recent-products">
                  {recentEntries.map((entry) => (
                    <Button
                      key={`${entry.name}-${entry.portion}`}
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="nutrition-recent-product"
                      onClick={() => applyRecentEntry(entry)}
                    >
                      <span className="truncate">{entry.name}</span>
                      <span className="nutrition-recent-product-meta">{entry.calories} kcal</span>
                    </Button>
                  ))}
                </div>
              </section>
            )}
            <Select
              label="Posiłek"
              value={entryDraft.meal}
              onChange={(event) => setEntryDraft((current) => ({ ...current, meal: event.target.value as MealSlot }))}
              options={MEAL_META.map((meal) => ({ value: meal.id, label: meal.label }))}
            />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Input
                label="Produkt lub danie"
                placeholder="np. Kanapka z twarożkiem"
                value={entryDraft.name}
                error={entryErrors.name}
                data-autofocus
                onChange={(event) => setEntryDraft((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                label="Porcja"
                placeholder="np. 250 g"
                value={entryDraft.portion}
                onChange={(event) => setEntryDraft((current) => ({ ...current, portion: event.target.value }))}
              />
            </div>
            <div className="nutrition-entry-form-grid">
              {([
                { key: "calories" as EntryField, label: "Kalorie", placeholder: "0", error: entryErrors.calories },
                { key: "protein" as EntryField, label: "Białko (g)", placeholder: "0" },
                { key: "carbs" as EntryField, label: "Węglowodany (g)", placeholder: "0" },
                { key: "fat" as EntryField, label: "Tłuszcze (g)", placeholder: "0" },
              ]).map((field) => (
                <Input
                  key={field.key}
                  label={field.label}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder={field.placeholder}
                  value={entryDraft[field.key]}
                  error={field.error}
                  onChange={(event) => setEntryDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              ))}
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
