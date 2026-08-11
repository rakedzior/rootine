import {
  AFFAIRS_STORAGE_KEY,
  createDefaultAffairsWorkspace,
  type AffairsWorkspace,
} from "../data/affairsWorkspace";
import {
  HEALTH_STORAGE_KEY,
  createDefaultHealthWorkspace,
  type HealthWorkspace,
} from "../data/healthWorkspace";
import {
  createDefaultJdgWorkspace,
  createJdgMonth,
  getJdgMonthKey,
  JDG_STORAGE_KEY,
  type JdgWorkspace,
} from "../data/jdgWorkspace";
import { createDefaultModulePreferences, MODULE_PREFERENCES_STORAGE_KEY } from "../data/modulePreferences";
import {
  createEmptyNutritionWorkspace,
  createNutritionReviewWorkspace,
  NUTRITION_STORAGE_KEY,
  type NutritionWorkspace,
} from "../data/nutritionWorkspace";
import { createDefaultNotesWorkspace, NOTES_STORAGE_KEY, type NoteRecord, type NotesWorkspace } from "../data/notesWorkspace";
import { createDefaultSummaryNotes, isoWeekKey, SUMMARY_NOTES_STORAGE_KEY } from "../data/summaryNotes";
import {
  createDefaultTaskWorkspace,
  taskViewForCalendarDate,
  TASK_STORAGE_KEY,
  toCalendarDateKey,
  type TaskWorkspace,
  type WorkspaceHabit,
  type WorkspaceTask,
} from "../data/taskWorkspace";
import { TASK_COMPLETION_STORAGE_KEY } from "../data/taskCompletion";
import { loadTravelWorkspace, TRAVEL_STORAGE_KEY, type TravelWorkspace } from "../data/travelWorkspace";
import { createDefaultWorkWorkspace, WORK_STORAGE_KEY, type WorkProject, type WorkTask, type WorkWorkspace } from "../data/workWorkspace";
import { createSeedGoalsWorkspace, type Goal, type GoalsWorkspace } from "../goals/goalsModel";
import { GOALS_STORAGE_KEY } from "../goals/goalsRepository";
import { createDefaultSportPlannerState, SPORT_PLANNER_STORAGE_KEY, type SportPlannerState } from "../sport/plannerModel";
import type { Exercise, WorkoutExercise } from "../sport/model";
import { ACTIVITY_LOG_STORAGE_KEY, type ActivityEvent } from "../experience/activityLog";

export type DemoWorkspaceEntry = [key: string, value: unknown];

type DemoDomain = "tasks" | "goals" | "sport" | "nutrition" | "work" | "travel" | "notes" | "affairs" | "health" | "jdg";
type JsonRecord = Record<string, unknown>;

const COPY: Record<DemoDomain, { title: string[]; detail: string[]; place: string[] }> = {
  tasks: {
    title: ["Zadanie Aurora", "Przegląd modułu Vega", "Pakiet Sigma", "Kontrola ścieżki Delta", "Porządek w Atlasie", "Test przepływu Nova"],
    detail: ["Dane przygotowane do sprawdzenia interakcji.", "Krok demonstracyjny z pełnym stanem.", "Przykład do swobodnej edycji."],
    place: ["Strefa Aurora", "Punkt Delta", "Pracownia Nova"],
  },
  goals: {
    title: ["Uruchomić projekt Aurora", "Utrzymać rytm Vega", "Zbudować rezerwę Sigma", "Rozwinąć kompetencję Nova", "Domknąć ścieżkę Atlas", "Przetestować kierunek Delta"],
    detail: ["Cel demonstracyjny z kilkoma sposobami liczenia postępu.", "Przykład do filtrowania po statusie i priorytecie.", "Sztuczny opis do sprawdzenia widoku szczegółów."],
    place: ["Moduł planowania", "Ścieżka rozwoju", "Obszar osobisty"],
  },
  sport: {
    title: ["Sesja Aurora", "Tor Sigma", "Mobilność Vega", "Interwał Delta", "Regeneracja Nova", "Blok Atlas"],
    detail: ["Trening demonstracyjny z kompletem parametrów.", "Przykład do edycji serii, etapów i wyniku.", "Sztuczny wpis historii."],
    place: ["Studio A", "Sala B", "Plener C"],
  },
  nutrition: {
    title: ["Miska Aurora", "Talerz Vega", "Koktajl Sigma", "Kolacja Nova", "Przekąska Delta", "Kompozycja Atlas"],
    detail: ["Wpis demonstracyjny do dziennika i analizy.", "Sztuczny skład zapisany dla przykładu.", "Przykład do ponownego dodania."],
    place: ["Kuchnia testowa", "Barometr energii", "Dziennik Nova"],
  },
  work: {
    title: ["Projekt Aurora", "Sprint Vega", "Pakiet Sigma", "Kampania Nova", "Przegląd Delta", "Zespół Atlas"],
    detail: ["Sztuczny projekt do sprawdzenia statusów.", "Przykład z zadaniami i terminami.", "Dane demonstracyjne do edycji."],
    place: ["Pracownia Aurora", "Studio Nova", "Zespół Delta"],
  },
  travel: {
    title: ["Trasa Aurora", "Kierunek Vega", "Wyprawa Sigma", "Plan Nova", "Przystanek Delta", "Baza Atlas"],
    detail: ["Sztuczny plan podróży z rezerwacjami.", "Przykład do sprawdzenia budżetu i dokumentów.", "Dane demonstracyjne bez prawdziwych osób."],
    place: ["Terminal Aurora", "Dzielnica Vega", "Punkt Sigma"],
  },
  notes: {
    title: ["Tablica Aurora", "Pomysły Vega", "Lista Sigma", "Brief Nova", "Archiwum Delta", "Plan Atlas"],
    detail: ["Sztuczna treść do sprawdzenia edytora.", "Przykład z listą i tagami.", "Notatka demonstracyjna do archiwizacji."],
    place: ["Osobiste", "Projekt", "Pomysły"],
  },
  affairs: {
    title: ["Sprawa Aurora", "Płatność Vega", "Dokument Sigma", "Przegląd Nova", "Umowa Delta", "Auto Atlas"],
    detail: ["Sztuczna sprawa do sprawdzenia przypomnień.", "Przykład z terminem i statusem.", "Dane demonstracyjne do edycji."],
    place: ["Strefa formalności", "Panel budżetu", "Rejestr Delta"],
  },
  health: {
    title: ["Wizyta Aurora", "Badanie Vega", "Plan Sigma", "Szczepienie Nova", "Pomiar Delta", "Recepta Atlas"],
    detail: ["Sztuczny wpis zdrowotny do sprawdzenia filtrów.", "Przykład z terminem i notatką.", "Dane demonstracyjne, bez prawdziwych danych medycznych."],
    place: ["Punkt Aurora", "Gabinet Vega", "Centrum Sigma"],
  },
  jdg: {
    title: ["Dokument Aurora", "Rozliczenie Vega", "Kontrola Sigma", "Szablon Nova", "Zdarzenie Delta", "Profil Atlas"],
    detail: ["Sztuczna checklista do sprawdzenia cyklu.", "Przykład historii zmian i szablonów.", "Dane demonstracyjne bez danych firmy."],
    place: ["Panel JDG", "Rejestr Sigma", "Biuro Nova"],
  },
};

const CONTENT_KEYS = new Set([
  "title", "name", "label", "text", "body", "description", "note", "detail", "summary",
  "location", "address", "city", "destination", "from", "to", "owner", "holder", "author", "brand",
]);
const DATE_KEYS = new Set([
  "date", "startDate", "endDate", "dueDate", "checkIn", "checkOut", "departure", "arrival", "expiresAt",
  "nextDueDate", "nextBillingDate", "commitmentEndDate", "createdAt", "updatedAt", "occurredAt", "completedAt",
  "doneAt", "closedAt", "snoozedUntil", "month",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dateAt(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dateKey(offset: number) {
  return toCalendarDateKey(dateAt(offset));
}

function timestampAt(offset: number, hour = 9) {
  const date = dateAt(offset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function monthKey(offset: number) {
  const date = dateAt(offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function copyFor(domain: DemoDomain, key: string, index: number) {
  const source = COPY[domain];
  if (["location", "address", "city", "destination", "from", "to"].includes(key)) {
    return source.place[index % source.place.length];
  }
  if (["description", "body", "note", "detail", "summary"].includes(key)) {
    return source.detail[index % source.detail.length];
  }
  return source.title[index % source.title.length];
}

function rewriteDemoData<T>(value: T, domain: DemoDomain): T {
  let textIndex = 0;
  let dateIndex = 0;

  const rewrite = (input: unknown, parentKey = ""): unknown => {
    if (Array.isArray(input)) {
      if (parentKey === "travelers") return input.map((_, index) => `Osoba demo ${index + 1}`);
      if (parentKey === "instructions") return input.map((_, index) => `Krok demonstracyjny ${index + 1}`);
      return input.map((item) => rewrite(item, parentKey));
    }
    if (!isRecord(input)) return input;

    const result: JsonRecord = {};
    Object.entries(input).forEach(([key, child]) => {
      if (typeof child === "string" && DATE_KEYS.has(key) && child) {
        const offset = (dateIndex++ % 11) - 4;
        result[key] = key === "month"
          ? monthKey(offset)
          : child.includes("T") ? timestampAt(offset, 8 + (dateIndex % 8)) : dateKey(offset);
        return;
      }
      if (typeof child === "string" && CONTENT_KEYS.has(key) && child.trim()) {
        result[key] = copyFor(domain, key, textIndex++);
        return;
      }
      if (key === "bookingRef" && typeof child === "string") {
        result[key] = `DEMO-${String(textIndex++).padStart(3, "0")}`;
        return;
      }
      result[key] = rewrite(child, key);
    });
    return result;
  };

  return rewrite(value) as T;
}

function createDemoTasks(): TaskWorkspace {
  const workspace = rewriteDemoData(createDefaultTaskWorkspace(), "tasks");
  const taskDates = [-1, 0, 0, 1, 3, 5, 8, 14, 0, -3, 30, 2, 7, 21, 45, 60];
  const listIds = ["praca", "dom", "hobby", "zdrowie"];
  const tasks: WorkspaceTask[] = workspace.tasks.map((task, index): WorkspaceTask => {
    const calendarDate = dateKey(taskDates[index % taskDates.length]);
    return {
      ...task,
      text: COPY.tasks.title[index % COPY.tasks.title.length],
      done: [false, false, true, false, false, true][index % 6] === true,
      completedAt: index % 6 === 2 ? timestampAt(-1, 16) : undefined,
      calendarDate,
      date: calendarDate,
      view: taskViewForCalendarDate(calendarDate),
      list: listIds[index % listIds.length],
      tags: [listIds[index % listIds.length], index % 2 === 0 ? "demo" : "kontrola"],
      priority: (index % 4 === 0 ? "high" : index % 3 === 0 ? "low" : "medium") as WorkspaceTask["priority"],
      time: index % 3 === 0 ? `${String(8 + (index % 8)).padStart(2, "0")}:30` : undefined,
      notes: COPY.tasks.detail[index % COPY.tasks.detail.length],
      subtasks: index < 3
        ? [
            { id: 1, text: "Przygotować wariant demonstracyjny", done: index === 1 },
            { id: 2, text: "Sprawdzić stan po zapisaniu", done: index === 2 },
          ]
        : undefined,
      comments: index === 0
        ? [{ id: 1, author: "Użytkownik demo", text: "Przykład komentarza do zadania.", time: timestampAt(0, 9) }]
        : undefined,
      schedule: index === 1
        ? {
            allDay: false,
            startTime: "09:00",
            endTime: "09:30",
            reminderMinutes: 15,
            recurrence: "weekly",
            completedDates: [dateKey(-7)],
            timezone: "Europe/Warsaw",
          }
        : task.schedule,
    };
  });

  tasks.push({
    id: 9001,
    text: "Archiwum Sigma",
    done: false,
    deleted: true,
    view: "bezterminu",
    list: "hobby",
    tags: ["demo"],
  });
  tasks.push(...Array.from({ length: 12 }, (_, index): WorkspaceTask => {
    const calendarDate = dateKey((index % 10) - 2);
    const list = listIds[(index + 1) % listIds.length];
    return {
      id: 9100 + index,
      text: `Zadanie rozszerzone ${["Aurora", "Vega", "Sigma", "Nova"][index % 4]}`,
      done: index % 5 === 0,
      completedAt: index % 5 === 0 ? timestampAt(-1, 15) : undefined,
      calendarDate,
      date: calendarDate,
      view: taskViewForCalendarDate(calendarDate),
      list,
      tags: [list, "demo"],
      priority: (index % 4 === 0 ? "high" : index % 3 === 0 ? "low" : "medium") as WorkspaceTask["priority"],
      time: index % 2 === 0 ? `${String(8 + (index % 9)).padStart(2, "0")}:00` : undefined,
      notes: "Dodatkowy wpis do sprawdzenia sortowania i filtrów.",
    };
  }));

  const habits: WorkspaceHabit[] = workspace.habits.map((habit, index): WorkspaceHabit => ({
    ...habit,
    name: ["Rytuał Aurora", "Woda Vega", "Czytanie Sigma", "Spacer Nova"][index % 4],
    streak: [4, 2, 9, 1][index % 4],
    done: index === 0,
    completedDates: Array.from({ length: index + 1 }, (_, day) => dateKey(-day)),
    time: `${String(7 + index * 3).padStart(2, "0")}:15`,
    timeOfDay: (index < 2 ? "morning" : index === 2 ? "afternoon" : "evening") as WorkspaceHabit["timeOfDay"],
    schedule: {
      type: (index === 2 ? "weekly" : "daily") as NonNullable<WorkspaceHabit["schedule"]>["type"],
      weekdays: index === 2 ? [1, 3, 5] : undefined,
      startDate: dateKey(-21),
    },
    pausePeriods: index === 3 ? [{ startDate: dateKey(5), endDate: dateKey(7) }] : [],
  }));
  habits.push(...Array.from({ length: 6 }, (_, index): WorkspaceHabit => ({
    id: 100 + index,
    name: `Rytuał rozszerzony ${["Atlas", "Echo", "Flux", "Orbit", "Pulse", "Zen"][index]}`,
    streak: index + 1,
    done: index % 3 === 0,
    completedDates: Array.from({ length: Math.max(1, index - 1) }, (_, day) => dateKey(-day)),
    priority: index % 2 === 0 ? "medium" : "low",
    time: `${String(6 + index).padStart(2, "0")}:45`,
    timeOfDay: index < 2 ? "morning" : index < 4 ? "afternoon" : "evening",
    schedule: { type: index % 2 === 0 ? "daily" : "weekly", weekdays: index % 2 === 0 ? undefined : [2, 4, 6], startDate: dateKey(-30) },
    pausePeriods: [],
  })));

  return {
    ...workspace,
    updatedAt: timestampAt(0),
    tasks,
    habits,
    lists: [
      { id: "praca", label: "Pracownia", color: "#7FA6C9" },
      { id: "dom", label: "Baza", color: "#B9A171" },
      { id: "hobby", label: "Eksperymenty", color: "#8793A1" },
      { id: "zdrowie", label: "Rytm", color: "#79A8A4" },
    ],
    tags: [
      { id: "praca", label: "moduł", color: "#7FA6C9" },
      { id: "trening", label: "ruch", color: "#79A8A4" },
      { id: "dom", label: "baza", color: "#B9A171" },
      { id: "finanse", label: "liczby", color: "#8793A1" },
      { id: "zdrowie", label: "rytm", color: "#79A8A4" },
      { id: "hobby", label: "eksperyment", color: "#7D7FA8" },
    ],
  };
}

function createDemoGoals(): GoalsWorkspace {
  const workspace = rewriteDemoData(createSeedGoalsWorkspace(), "goals");
  const titles = COPY.goals.title;
  const result: GoalsWorkspace = {
    ...workspace,
    categories: workspace.categories.map((category, index) => ({ ...category, label: ["Ruch", "Rytm", "Praca", "Finanse", "Rozwój", "Relacje", "Baza"][index] ?? "Moduł" })),
    goals: workspace.goals.map((goal, index) => ({
      ...goal,
      title: titles[index % titles.length],
      description: COPY.goals.detail[index % COPY.goals.detail.length],
      note: `Notatka do celu ${["Aurora", "Vega", "Sigma", "Nova"][index % 4]}.`,
      startDate: dateKey(-30 + index * 4),
      dueDate: dateKey(12 + index * 18),
      status: (["active", "active", "paused", "completed", "planned"] as const)[index % 5],
      health: index === 2 ? "risk" : "ontrack",
      milestones: goal.milestones.map((milestone, milestoneIndex) => ({
        ...milestone,
        title: `Etap ${index + 1}.${milestoneIndex + 1} — ${["start", "przegląd", "wynik"][milestoneIndex % 3]}`,
        note: milestoneIndex === 0 ? "Punkt kontrolny do sprawdzenia." : undefined,
        dueDate: dateKey(5 + milestoneIndex * 9),
        done: milestoneIndex < index % 3,
        completedAt: milestoneIndex < index % 3 ? timestampAt(-milestoneIndex - 1, 17) : undefined,
      })),
      progressEntries: [
        ...(goal.progressEntries.length ? goal.progressEntries : [{ id: `demo-progress-${index}`, date: dateKey(-2), value: 20 + index * 7, kind: "absolute" as const, note: "Pomiar demonstracyjny.", createdAt: timestampAt(-2, 18) }]),
      ].map((entry, entryIndex) => ({ ...entry, date: dateKey(-entryIndex - 1), note: "Pomiar demonstracyjny.", createdAt: timestampAt(-entryIndex - 1, 18) })),
      history: [
        { id: `demo-history-${index}-1`, type: "updated" as const, label: "Zaktualizowano cel", detail: "Zmiana demonstracyjna.", createdAt: timestampAt(-2, 12) },
        { id: `demo-history-${index}-2`, type: "progress" as const, label: "Zapisano postęp", detail: "Dodano pomiar testowy.", createdAt: timestampAt(-1, 12) },
      ],
    })),
  };
  result.goals.push(...[0, 1].map((index): Goal => ({
    ...result.goals[index],
    id: `demo-extra-goal-${index}`,
    title: `Cel dodatkowy ${["Echo", "Orbit"][index]}`,
    categoryId: index === 0 ? "personal" : "growth",
    status: index === 0 ? "active" : "planned",
    priority: "low",
    startDate: dateKey(-10 - index * 4),
    dueDate: dateKey(45 + index * 20),
    milestones: [{ id: `demo-extra-milestone-${index}`, title: "Pierwszy punkt kontrolny", dueDate: dateKey(14 + index * 5), done: index === 0, weight: 1 }],
    progressEntries: [{ id: `demo-extra-progress-${index}`, date: dateKey(-3), value: 15 + index * 10, kind: "absolute", note: "Pomiar demonstracyjny.", createdAt: timestampAt(-3, 18) }],
    history: [{ id: `demo-extra-history-${index}`, type: "updated", label: "Utworzono cel", detail: "Cel dodatkowy do sprawdzenia.", createdAt: timestampAt(-3, 12) }],
  })));
  return result;
}

function createDemoSport(): SportPlannerState {
  const state = rewriteDemoData(createDefaultSportPlannerState(), "sport");
  const titles = COPY.sport.title;
  const rewriteExercise = (exercise: Exercise, index: number): Exercise => ({
    ...exercise,
    name: titles[index % titles.length],
    description: COPY.sport.detail[index % COPY.sport.detail.length],
    instructions: "Ustaw spokojny zakres ruchu. Wykonaj serię zgodnie z tempem. Zapisz wynik po zakończeniu.",
    note: "Wpis demonstracyjny do edycji.",
  });
  const rewriteWorkoutExercise = (exercise: WorkoutExercise, index: number): WorkoutExercise => ({
    ...exercise,
    name: titles[index % titles.length],
    note: "Wpis demonstracyjny do edycji.",
  });
  const exercises = (state.exercises ?? []).map(rewriteExercise);
  const templates = state.templates.map((template, index) => ({
    ...template,
    name: `Plan ${titles[index % titles.length]}`,
    description: COPY.sport.detail[index % COPY.sport.detail.length],
    exercises: template.exercises.map((exercise, exerciseIndex) => rewriteWorkoutExercise(exercise, exerciseIndex + index)),
  }));
  const mapCycle = (cycle: NonNullable<SportPlannerState["activeCycle"]>, index: number) => ({
    ...cycle,
    name: `Cykl ${["Aurora", "Vega", "Sigma"][index % 3]}`,
    startDate: dateKey(-7),
    workouts: cycle.workouts.map((workout, workoutIndex) => ({
      ...workout,
      title: titles[workoutIndex % titles.length],
      note: "Notatka demonstracyjna do sesji.",
    })),
  });
  const cycles = state.cycles.map(mapCycle);
  const result: SportPlannerState = {
    ...state,
    templates,
    exercises,
    activeCycle: state.activeCycle ? mapCycle(state.activeCycle, 0) : null,
    cycles,
    sessions: state.sessions.map((session, index) => ({ ...session, title: titles[index % titles.length], date: dateKey(-index - 1), note: "Sesja demonstracyjna." })),
    history: state.history.map((entry, index) => ({ ...entry, title: titles[index % titles.length], date: dateKey(-index - 1) })),
  };
  result.exercises?.push(...Array.from({ length: 8 }, (_, index): Exercise => ({
    ...result.exercises![index % result.exercises!.length],
    id: `exercise-demo-extra-${index}`,
    name: `Ćwiczenie dodatkowe ${["Orbit", "Pulse", "Echo", "Flux"][index % 4]}`,
    description: "Dodatkowy wpis biblioteki ćwiczeń.",
    instructions: "Wykonaj spokojnie i zapisz wynik.",
  })));
  result.sessions.push(...Array.from({ length: 8 }, (_, index) => ({
    ...result.sessions[index % result.sessions.length],
    id: `session-demo-extra-${index}`,
    title: `Sesja dodatkowa ${["Orbit", "Pulse", "Echo", "Flux"][index % 4]}`,
    date: dateKey(-index - 8),
    status: (index % 4 === 0 ? "incomplete" : "completed") as SportPlannerState["sessions"][number]["status"],
    note: "Dodatkowa sesja demonstracyjna.",
  })));
  result.history.push(...Array.from({ length: 8 }, (_, index) => ({
    ...result.history[index % result.history.length],
    id: `history-demo-extra-${index}`,
    title: `Sesja historyczna ${["Orbit", "Pulse", "Echo", "Flux"][index % 4]}`,
    date: dateKey(-index - 8),
    status: (index % 4 === 0 ? "missed" : "completed") as SportPlannerState["history"][number]["status"],
  })));
  return result;
}

function createDemoNutrition(): NutritionWorkspace {
  const workspace = rewriteDemoData(createNutritionReviewWorkspace(createEmptyNutritionWorkspace()), "nutrition");
  const mealNames = {
    breakfast: "Miska Aurora",
    lunch: "Talerz Vega",
    snack: "Koktajl Sigma",
    dinner: "Kolacja Nova",
  } as const;
  const sourceDays = Object.values(workspace.days);
  const days = Object.fromEntries(Array.from({ length: 30 }, (_, index) => {
    const date = dateKey(index - 29);
    const sourceDay = sourceDays[index % sourceDays.length];
    return [date, {
      date,
      waterMl: 1650 + ((index * 137) % 900),
      source: "demo" as const,
      entries: Object.fromEntries(Object.entries(sourceDay.entries).map(([slot, entries]) => [slot, entries.map((entry, entryIndex) => ({
        ...entry,
        id: `demo-nutrition-${date}-${slot}-${entryIndex}`,
        name: mealNames[slot as keyof typeof mealNames],
        portion: `${240 + ((index + entryIndex) % 3) * 80} g`,
        brand: "Marka demo",
        calories: Math.round(entry.calories * (0.92 + (index % 4) * 0.04)),
        createdAt: `${date}T08:00:00.000Z`,
      }))])) as NutritionWorkspace["days"][string]["entries"],
    }];
  }));
  const timestamp = timestampAt(0, 8);
  const weightOffsets = Array.from({ length: 15 }, (_, index) => -29 + index * 2).concat(0);
  return {
    ...workspace,
    updatedAt: timestamp,
    goals: { calories: 2200, protein: 140, carbs: 245, fat: 72, waterMl: 2100 },
    days,
    weightMeasurements: Object.fromEntries(weightOffsets.map((offset, index) => {
      const date = dateKey(offset);
      return [date, { date, weightKg: 79.4 - index * 0.12, note: "Pomiar demonstracyjny.", createdAt: `${date}T07:30:00.000Z` }];
    })),
    bodyMeasurements: {
      [dateKey(-21)]: [{ id: "demo-body-1", date: dateKey(-21), type: "talia", valueCm: 85.2, note: "Pomiar testowy.", createdAt: timestampAt(-21, 7) }],
      [dateKey(-14)]: [{ id: "demo-body-2", date: dateKey(-14), type: "talia", valueCm: 84.8, note: "Pomiar testowy.", createdAt: timestampAt(-14, 7) }],
      [dateKey(-7)]: [{ id: "demo-body-3", date: dateKey(-7), type: "talia", valueCm: 84.5, note: "Pomiar testowy.", createdAt: timestampAt(-7, 7) }],
      [dateKey(0)]: [{ id: "demo-body-4", date: dateKey(0), type: "talia", valueCm: 83.8, note: "Pomiar testowy.", createdAt: timestamp }],
    },
    customMeals: [
      {
        id: "demo-meal-aurora",
        name: "Kompozycja Aurora",
        totalWeightG: 620,
        servings: 2,
        createdAt: timestamp,
        ingredients: [
          { id: "demo-ing-a", name: "Baza Vega", amount: 240, unit: "g", per100g: { calories: 130, protein: 5, carbs: 24, fat: 2 } },
          { id: "demo-ing-b", name: "Warzywa Sigma", amount: 220, unit: "g", per100g: { calories: 45, protein: 2, carbs: 8, fat: 0.5 } },
          { id: "demo-ing-c", name: "Źródło Nova", amount: 160, unit: "g", per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } },
        ],
      },
      {
        id: "demo-meal-delta",
        name: "Koktajl Delta",
        totalWeightG: 420,
        servings: 1,
        createdAt: timestamp,
        ingredients: [
          { id: "demo-ing-d", name: "Napój Atlas", amount: 250, unit: "ml", per100g: { calories: 48, protein: 3.4, carbs: 5, fat: 1.5 } },
          { id: "demo-ing-e", name: "Owoc Nova", amount: 170, unit: "g", per100g: { calories: 57, protein: 0.7, carbs: 14, fat: 0.3 } },
        ],
      },
    ],
  };
}

function createDemoWork(): WorkWorkspace {
  const workspace = rewriteDemoData(createDefaultWorkWorkspace(), "work");
  const extraProjects: WorkProject[] = ["Orbit", "Pulse", "Echo"].map((name, index) => ({
    id: `project-demo-${name.toLowerCase()}`,
    companyId: workspace.companies[index % workspace.companies.length].id,
    name: `Strumień ${name}`,
    description: "Dodatkowy projekt demonstracyjny.",
    status: index === 2 ? "paused" : "active",
    startDate: dateKey(-14 + index * 3),
    endDate: dateKey(30 + index * 14),
    note: "Przykład do filtrowania projektów.",
  }));
  const extraTasks: WorkTask[] = Array.from({ length: 8 }, (_, index) => ({
    ...workspace.tasks[index % workspace.tasks.length],
    id: `task-demo-${index}`,
    projectId: extraProjects[index % extraProjects.length].id,
    parentId: null,
    title: `Zadanie dodatkowe ${["Orbit", "Pulse", "Echo", "Flux"][index % 4]}`,
    completed: index % 4 === 0,
    status: (index % 4 === 0 ? "completed" : index % 3 === 0 ? "in_progress" : "todo") as WorkTask["status"],
    dueDate: dateKey(index - 2),
    note: "Dodatkowe dane do sprawdzenia statusu.",
    createdAt: timestampAt(-index - 3, 10),
    updatedAt: timestampAt(-index, 16),
  }));
  const result: WorkWorkspace = {
    ...workspace,
    updatedAt: timestampAt(0),
    companies: workspace.companies.map((company, index) => ({ ...company, name: `Pracownia ${["Aurora", "Vega"][index % 2]}`, description: "Sztuczna organizacja do sprawdzenia widoku pracy." })),
    projects: workspace.projects.map((project, index) => ({ ...project, name: `Strumień ${["Sigma", "Nova", "Delta"][index % 3]}`, description: "Projekt demonstracyjny z kilkoma stanami." })),
    tasks: workspace.tasks.map((task, index) => ({ ...task, title: `Zadanie pracy ${["Aurora", "Vega", "Sigma", "Nova"][index % 4]}`, dueDate: dateKey(index - 1), note: "Notatka demonstracyjna." })),
  };
  result.projects.push(...extraProjects);
  result.tasks.push(...extraTasks);
  return result;
}

function createDemoTravel(): TravelWorkspace {
  const workspace = rewriteDemoData(loadTravelWorkspace(), "travel");
  const tripNames = ["Trasa Aurora", "Kierunek Vega", "Wyprawa Sigma"];
  return {
    ...workspace,
    updatedAt: timestampAt(0),
    trips: workspace.trips.map((trip, tripIndex) => {
      const startOffset = tripIndex === 2 ? -28 : tripIndex === 0 ? 18 : 6;
      const startDate = dateKey(startOffset);
      const endDate = dateKey(startOffset + (tripIndex === 2 ? 5 : 4));
      return {
        ...trip,
        name: tripNames[tripIndex],
        destination: ["Miasto Aurora · Wybrzeże Vega", "Region Sigma · Dolina Nova", "Pasmo Delta · Baza Atlas"][tripIndex],
        startDate,
        endDate,
        travelers: tripIndex === 1 ? ["Osoba demo 1"] : ["Osoba demo 1", "Osoba demo 2"],
        note: COPY.travel.detail[tripIndex % COPY.travel.detail.length],
        archivedAt: tripIndex === 2 ? timestampAt(-27, 12) : null,
        stays: trip.stays.map((stay, index) => ({ ...stay, name: `Nocleg ${["Aurora", "Vega", "Sigma"][index % 3]}`, city: `Miasto ${index + 1}`, address: `Aleja demo ${index + 10}`, checkIn: dateKey(startOffset + index), checkOut: dateKey(startOffset + index + 2), bookingRef: `DEMO-STAY-${tripIndex}${index}`, amount: 920 + index * 640 })),
        transports: trip.transports.map((transport, index) => ({ ...transport, title: `Przejazd ${["Aurora", "Vega", "Sigma"][index % 3]}`, from: `DEM${index}A`, to: `DEM${index}B`, departure: `${dateKey(startOffset + index)}T07:20`, arrival: `${dateKey(startOffset + index)}T10:25`, bookingRef: `DEMO-TRIP-${tripIndex}${index}` })),
        itinerary: trip.itinerary.map((item, index) => ({ ...item, date: dateKey(startOffset + index), title: `Punkt programu ${index + 1}`, location: `Punkt ${["Aurora", "Vega", "Sigma"][index % 3]}`, note: index === 0 ? "Przykład rezerwacji." : "" })),
        documents: trip.documents.map((document, index) => ({ ...document, name: `Dokument ${["A", "B", "C"][index % 3]}`, owner: "Osoba demo 1", expiresAt: dateKey(120 + index * 30), note: "Dokument demonstracyjny." })),
        tasks: trip.tasks.map((task, index) => ({ ...task, title: `Przygotowanie ${["Aurora", "Vega", "Sigma"][index % 3]}`, dueDate: dateKey(startOffset - index - 1) })),
        budget: trip.budget.map((line, index) => ({ ...line, label: `Budżet ${["transport", "baza", "program", "rezerwa"][index % 4]}`, planned: 900 + index * 450, actual: index % 2 === 0 ? 720 + index * 280 : 0 })),
      };
    }),
  };
}

function createDemoNotes(): NotesWorkspace {
  const workspace = rewriteDemoData(createDefaultNotesWorkspace(), "notes");
  const result: NotesWorkspace = {
    ...workspace,
    updatedAt: timestampAt(0),
    lists: workspace.lists.map((list, index) => ({ ...list, name: ["Baza", "Projekt", "Pomysły"][index % 3] })),
    notes: workspace.notes.map((note, index) => ({
      ...note,
      title: COPY.notes.title[index % COPY.notes.title.length],
      body: COPY.notes.detail[index % COPY.notes.detail.length],
      tags: [["demo", "ważne"], ["projekt", "moduł"], ["checklista"], ["archiwum"]][index % 4],
      items: note.items.map((item, itemIndex) => ({ ...item, text: `Punkt ${index + 1}.${itemIndex + 1} — sprawdź stan` })),
      createdAt: timestampAt(-index - 4, 10),
      updatedAt: timestampAt(-index, 16),
    })),
  };
  result.notes.push(...Array.from({ length: 4 }, (_, index): NoteRecord => ({
    id: `demo-note-extra-${index}`,
    title: `Notatka dodatkowa ${["Orbit", "Pulse", "Echo", "Flux"][index]}`,
    body: "Dodatkowa treść demonstracyjna do wyszukiwania, tagów i archiwum.",
    kind: index % 2 === 0 ? "text" : "checklist",
    items: index % 2 === 0 ? [] : [{ id: `demo-note-extra-item-${index}`, text: "Sprawdź punkt demonstracyjny", checked: index === 1 }],
    tags: ["demo", index % 2 === 0 ? "dodatkowe" : "checklista"],
    listId: result.lists[index % result.lists.length].id,
    color: ["blue", "green", "amber", "violet"][index] as NoteRecord["color"],
    pinned: index === 0,
    archived: index === 3,
    createdAt: timestampAt(-index - 8, 11),
    updatedAt: timestampAt(-index - 1, 17),
  })));
  return result;
}

function createDemoAffairs(): AffairsWorkspace {
  const workspace = rewriteDemoData(createDefaultAffairsWorkspace(), "affairs");
  const result: AffairsWorkspace = {
    ...workspace,
    matters: workspace.matters.map((matter, index) => ({ ...matter, title: COPY.affairs.title[index], note: COPY.affairs.detail[index % 3], dueDate: dateKey(index * 7), location: matter.kind === "appointment" ? "Punkt obsługi demo" : matter.location })),
    oneTimePayments: workspace.oneTimePayments.map((payment, index) => ({ ...payment, title: `Płatność jednorazowa ${index + 1}`, category: "Demo", dueDate: dateKey(index + 2), note: "Wydatek demonstracyjny." })),
    payments: workspace.payments.map((payment, index) => ({ ...payment, name: `Płatność cykliczna ${index + 1}`, category: "Demo", nextDueDate: dateKey(index + 4), note: "Stała pozycja demonstracyjna." })),
    subscriptions: workspace.subscriptions.map((subscription, index) => ({ ...subscription, name: `Subskrypcja ${index + 1}`, category: "Demo", nextBillingDate: dateKey(index + 9), commitmentEndDate: dateKey(90 + index * 30), note: "Abonament demonstracyjny." })),
    documents: workspace.documents.map((document, index) => ({ ...document, name: `Dokument rejestru ${index + 1}`, holder: "Osoba demo", expiresAt: dateKey(60 + index * 30), note: "Dokument demonstracyjny." })),
    vehicles: workspace.vehicles.map((vehicle, index) => ({ ...vehicle, name: `Pojazd demo ${index + 1}`, registration: `WX ${String(1000 + index)}D` })),
    vehicleItems: workspace.vehicleItems.map((item, index) => ({ ...item, title: `Serwis ${["Aurora", "Vega", "Sigma"][index % 3]}`, dueDate: dateKey(index + 10), note: "Pozycja demonstracyjna." })),
    budgets: [{ month: monthKey(0), lines: workspace.budgets[0]?.lines.map((line, index) => ({ ...line, label: `Budżet ${["wpływy", "stałe", "elastyczne", "rezerwa"][index % 4]}`, actual: index % 2 === 0 ? line.planned * 0.7 : line.planned * 0.4 })) ?? [] }],
  };
  result.matters.push(...Array.from({ length: 6 }, (_, index) => ({
    ...result.matters[index % result.matters.length],
    id: `matter-demo-extra-${index}`,
    title: `Sprawa dodatkowa ${["Orbit", "Pulse", "Echo", "Flux"][index % 4]}`,
    status: (index % 4 === 0 ? "done" : index % 3 === 0 ? "waiting" : "open") as AffairsWorkspace["matters"][number]["status"],
    dueDate: dateKey(index + 1),
    note: "Dodatkowa sprawa demonstracyjna.",
  })));
  result.payments.push(...Array.from({ length: 4 }, (_, index) => ({
    ...result.payments[index % result.payments.length],
    id: `payment-demo-extra-${index}`,
    name: `Płatność dodatkowa ${index + 1}`,
    nextDueDate: dateKey(index + 3),
    amount: 120 + index * 75,
  })));
  result.subscriptions.push(...Array.from({ length: 4 }, (_, index) => ({
    ...result.subscriptions[index % result.subscriptions.length],
    id: `subscription-demo-extra-${index}`,
    name: `Abonament dodatkowy ${index + 1}`,
    nextBillingDate: dateKey(index + 6),
    commitmentEndDate: dateKey(120 + index * 20),
  })));
  result.documents.push(...Array.from({ length: 4 }, (_, index) => ({
    ...result.documents[index % result.documents.length],
    id: `document-demo-extra-${index}`,
    name: `Dokument dodatkowy ${index + 1}`,
    expiresAt: dateKey(80 + index * 20),
  })));
  result.vehicleItems.push(...Array.from({ length: 4 }, (_, index) => ({
    ...result.vehicleItems[index % result.vehicleItems.length],
    id: `vehicle-item-demo-extra-${index}`,
    title: `Kontrola dodatkowa ${index + 1}`,
    dueDate: dateKey(index + 12),
    done: index === 0,
  })));
  return result;
}

function createDemoHealth(): HealthWorkspace {
  const workspace = rewriteDemoData(createDefaultHealthWorkspace(), "health");
  return {
    ...workspace,
    updatedAt: timestampAt(0),
    entries: [
      ...workspace.entries.map((entry, index) => ({ ...entry, title: COPY.health.title[index], note: COPY.health.detail[index % 3], dueDate: dateKey(index * 10), location: entry.location ? `Punkt ${["Aurora", "Vega", "Sigma"][index % 3]}` : "", status: index === 1 ? "done" as const : "open" as const })),
      { id: "health-demo-vaccine", title: "Szczepienie Nova", kind: "vaccination", dueDate: dateKey(21), time: "11:15", location: "Centrum Delta", note: "Wpis demonstracyjny.", status: "open", createdAt: timestampAt(0) },
      { id: "health-demo-other", title: "Pomiar Atlas", kind: "other", dueDate: dateKey(-2), time: "08:10", location: "Punkt Sigma", note: "Wpis demonstracyjny.", status: "done", createdAt: timestampAt(-2) },
    ],
  };
}

function createDemoJdg(): JdgWorkspace {
  const workspace = rewriteDemoData(createDefaultJdgWorkspace(), "jdg");
  const profile = { ...workspace.taxProfile, taxForm: "linear" as const, vatStatus: "active" as const, vatCadence: "monthly" as const, zusScheme: "preferential" as const, accountingMode: "online" as const, updatedAt: timestampAt(0) };
  const month = (monthValue: string, index: number) => ({
    ...createJdgMonth(monthValue, workspace.templates[0]),
    note: "Notatka do miesiąca demonstracyjnego.",
    items: workspace.months[0].items.map((item, itemIndex) => ({ ...item, id: `demo-${monthValue}-${itemIndex}`, label: `Pozycja ${index + 1}.${itemIndex + 1}`, done: itemIndex < 2, doneAt: itemIndex < 2 ? timestampAt(-1, 17) : "" })),
  });
  const currentMonth = month(getJdgMonthKey(), 0);
  const previousMonth = month(monthKey(-31), 1);
  const customTemplate = {
    ...workspace.templates[0],
    id: "demo-template-custom",
    name: "Szablon Nova",
    description: "Sztuczny szablon do testowania aplikowania checklisty.",
    source: "custom" as const,
    items: workspace.templates[0].items.map((item, index) => ({ ...item, id: `demo-template-item-${index}`, label: `Szablonowa pozycja ${index + 1}` })),
    createdAt: timestampAt(-3),
    updatedAt: timestampAt(0),
  };
  return {
    ...workspace,
    taxProfile: profile,
    months: [previousMonth, currentMonth],
    templates: [workspace.templates[0], customTemplate],
    defaultTemplateId: customTemplate.id,
    history: [
      { id: "demo-audit-1", occurredAt: timestampAt(-2), type: "profile-updated", summary: "Zapisano profil demonstracyjny", targetId: "profile" },
      { id: "demo-audit-2", occurredAt: timestampAt(-1), type: "template-created", summary: "Utworzono szablon Nova", targetId: customTemplate.id },
      { id: "demo-audit-3", occurredAt: timestampAt(0), type: "template-applied", summary: "Zastosowano szablon Nova", targetId: customTemplate.id },
    ],
  };
}

function createDemoSummary() {
  const summary = createDefaultSummaryNotes();
  summary.updatedAt = timestampAt(0);
  summary.weeks[isoWeekKey()] = "<p><strong>Przegląd Aurora:</strong> dane demonstracyjne obejmują zadania, cele i rytm modułów do swobodnego testowania.</p>";
  summary.weeks[isoWeekKey(dateAt(-7))] = "<p>Poprzedni tydzień testowy: zakończone i odroczone elementy do sprawdzenia historii.</p>";
  return summary;
}

function createDemoActivity(): ActivityEvent[] {
  return [
    { id: "demo-activity-6", version: 1, occurredAt: timestampAt(0, 12), moduleId: "nutrition", kind: "save", title: "Zapisano Miskę Aurora", detail: "Dodano sztuczny posiłek do dziennika." },
    { id: "demo-activity-5", version: 1, occurredAt: timestampAt(0, 11), moduleId: "sport", kind: "complete", title: "Zakończono Sesję Vega", detail: "Zapisano demonstracyjny wynik." },
    { id: "demo-activity-4", version: 1, occurredAt: timestampAt(0, 10), moduleId: "work", kind: "status", title: "Zmieniono status Projektu Sigma", detail: "Przykład historii pracy." },
    { id: "demo-activity-3", version: 1, occurredAt: timestampAt(-1, 16), moduleId: "goals", kind: "save", title: "Zapisano postęp celu Nova", detail: "Dodano sztuczny pomiar." },
    { id: "demo-activity-2", version: 1, occurredAt: timestampAt(-1, 13), moduleId: "travel", kind: "create", title: "Dodano Trasę Aurora", detail: "Przykład rezerwacji i budżetu." },
    { id: "demo-activity-1", version: 1, occurredAt: timestampAt(-2, 9), moduleId: "tasks", kind: "complete", title: "Ukończono Zadanie Vega", detail: "Oznaczono sztuczne zadanie jako wykonane." },
  ];
}

export function createGeneratedDemoEntries(): DemoWorkspaceEntry[] {
  const tasks = createDemoTasks();
  return [
    [TASK_STORAGE_KEY, tasks],
    [TASK_COMPLETION_STORAGE_KEY, {
      version: 2,
      updatedAt: timestampAt(0),
      completion: Object.fromEntries(tasks.tasks.filter((task) => task.done).map((task) => [String(task.id), { done: true, completedAt: task.completedAt ?? timestampAt(-1) }])),
    }],
    [GOALS_STORAGE_KEY, createDemoGoals()],
    [SPORT_PLANNER_STORAGE_KEY, createDemoSport()],
    [NUTRITION_STORAGE_KEY, createDemoNutrition()],
    [WORK_STORAGE_KEY, createDemoWork()],
    [TRAVEL_STORAGE_KEY, createDemoTravel()],
    [NOTES_STORAGE_KEY, createDemoNotes()],
    ["rootine.notes-tags.v1", ["demo", "ważne", "projekt", "moduł", "checklista", "archiwum"]],
    [AFFAIRS_STORAGE_KEY, createDemoAffairs()],
    [HEALTH_STORAGE_KEY, createDemoHealth()],
    [JDG_STORAGE_KEY, createDemoJdg()],
    [MODULE_PREFERENCES_STORAGE_KEY, { ...createDefaultModulePreferences(), updatedAt: timestampAt(0) }],
    [SUMMARY_NOTES_STORAGE_KEY, createDemoSummary()],
    [ACTIVITY_LOG_STORAGE_KEY, createDemoActivity()],
  ];
}
