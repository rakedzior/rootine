import type { DISCIPLINE_META, STATUS_META } from "./theme";

export type Discipline = keyof typeof DISCIPLINE_META;
export type SessionStatus = keyof typeof STATUS_META;
export type SportView = "overview" | "week" | "plans" | "history" | "progress" | "exercises" | "integrations";

export type WorkoutSet = {
  id: string;
  plannedReps?: number;
  plannedSeconds?: number;
  plannedWeight?: number;
  actualReps?: number;
  actualSeconds?: number;
  actualWeight?: number;
  rir?: number;
  pain?: number;
  tempo?: string;
  note?: string;
  done: boolean;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  restSeconds: number;
  note?: string;
  sets: WorkoutSet[];
};

export type RunningStage = {
  id: string;
  label: string;
  kind: "warmup" | "steady" | "interval" | "recovery" | "cooldown";
  target: string;
  done?: boolean;
};

export type WorkoutSession = {
  id: string;
  cycleWorkoutId?: string;
  title: string;
  discipline: Discipline;
  date: string;
  time?: string;
  plannedDurationMinutes?: number;
  durationMinutes: number;
  status: SessionStatus;
  planId?: string;
  templateId?: string;
  note?: string;
  location?: string;
  exercises: WorkoutExercise[];
  stages?: RunningStage[];
  importedFrom?: string;
  startedAt?: number;
  completedAt?: number;
  restTimerRemaining?: number;
  restTimerRunning?: boolean;
  restTimerUpdatedAt?: number;
  metrics?: {
    distanceKm?: number;
    timeMinutes?: number;
    averagePace?: string;
    averageHeartRate?: number;
    maxHeartRate?: number;
    rpe?: number;
    pain?: number;
  };
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  discipline: Discipline;
  description: string;
  exercises: WorkoutExercise[];
  stages?: RunningStage[];
  durationMinutes: number;
};

export type TrainingPlan = {
  id: string;
  name: string;
  disciplines: Discipline[];
  weeks: number;
  currentWeek: number;
  active: boolean;
  sessionsPerWeek: number;
  completedSessions: number;
  totalSessions: number;
  templateIds: string[];
  source: "manual" | "ai";
  blocks?: {
    id: string;
    name: string;
    startWeek: number;
    endWeek: number;
    focus: string;
  }[];
};

export type ExerciseLibraryItem = {
  id: string;
  name: string;
  aliases: string[];
  discipline: Discipline;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instruction: string;
  custom?: boolean;
};

export type PendingImport = {
  id: string;
  source: "Strava" | "Garmin" | "Apple Health";
  title: string;
  discipline: Discipline;
  date: string;
  durationMinutes: number;
  distanceKm?: number;
  suggestedSessionId?: string;
  confidence: number;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function startOfWeekKey(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDateKey(monday);
}

export function formatShortDate(key: string) {
  return fromDateKey(key).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }).replace(".", "");
}

export function formatLongDate(key: string) {
  const value = fromDateKey(key).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const makeSets = (prefix: string, count: number, reps: number, weight?: number, seconds?: number): WorkoutSet[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-s${index + 1}`,
    plannedReps: seconds ? undefined : reps,
    plannedSeconds: seconds,
    plannedWeight: weight,
    actualReps: seconds ? undefined : reps,
    actualSeconds: seconds,
    actualWeight: weight,
    rir: 2,
    done: false,
  }));

const exercise = (id: string, exerciseId: string, name: string, count: number, reps: number, weight?: number, restSeconds = 90, seconds?: number): WorkoutExercise => ({
  id,
  exerciseId,
  name,
  restSeconds,
  sets: makeSets(id, count, reps, weight, seconds),
});

export const EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  { id: "bench-press", name: "Wyciskanie sztangi leżąc", aliases: ["ławka płaska", "bench", "bench press", "klata sztangą"], discipline: "strength", primaryMuscles: ["Klatka piersiowa"], secondaryMuscles: ["Triceps", "Barki"], equipment: ["Sztanga", "Ławka"], instruction: "Ustaw łopatki stabilnie, prowadź sztangę do dolnej części klatki i wypychaj bez odrywania pośladków." },
  { id: "barbell-row", name: "Wiosłowanie sztangą", aliases: ["wiosło", "barbell row", "wiosłowanie w opadzie"], discipline: "strength", primaryMuscles: ["Plecy"], secondaryMuscles: ["Biceps", "Tył barków"], equipment: ["Sztanga"], instruction: "Utrzymuj neutralny kręgosłup i prowadź łokcie blisko tułowia." },
  { id: "overhead-press", name: "Wyciskanie żołnierskie", aliases: ["ohp", "military press", "wyciskanie nad głowę"], discipline: "strength", primaryMuscles: ["Barki"], secondaryMuscles: ["Triceps", "Core"], equipment: ["Sztanga"], instruction: "Napnij brzuch i pośladki, prowadź sztangę pionowo nad środkiem stopy." },
  { id: "lat-pulldown", name: "Ściąganie drążka wyciągu", aliases: ["drążek na plecy", "lat pulldown", "wyciąg górny"], discipline: "strength", primaryMuscles: ["Plecy"], secondaryMuscles: ["Biceps"], equipment: ["Wyciąg"], instruction: "Ściągaj drążek do górnej części klatki, inicjując ruch łopatkami." },
  { id: "lateral-raise", name: "Unoszenie hantli bokiem", aliases: ["wznosy bokiem", "lateral raise", "barki hantle"], discipline: "strength", primaryMuscles: ["Barki"], secondaryMuscles: [], equipment: ["Hantle"], instruction: "Unoś ramiona kontrolowanym ruchem do wysokości barków." },
  { id: "triceps-pushdown", name: "Prostowanie ramion na wyciągu", aliases: ["triceps linka", "pushdown", "wyciąg na triceps"], discipline: "strength", primaryMuscles: ["Triceps"], secondaryMuscles: [], equipment: ["Wyciąg"], instruction: "Utrzymuj łokcie nieruchomo przy tułowiu." },
  { id: "squat", name: "Przysiad ze sztangą", aliases: ["przysiad", "back squat", "siady"], discipline: "strength", primaryMuscles: ["Czworogłowe uda", "Pośladki"], secondaryMuscles: ["Dwugłowe uda", "Core"], equipment: ["Sztanga", "Stojak"], instruction: "Prowadź kolana zgodnie z linią stóp i zachowaj stabilny tułów." },
  { id: "romanian-deadlift", name: "Martwy ciąg rumuński", aliases: ["rdl", "rumuński", "martwy na prostych"], discipline: "strength", primaryMuscles: ["Dwugłowe uda", "Pośladki"], secondaryMuscles: ["Plecy"], equipment: ["Sztanga"], instruction: "Cofaj biodra przy lekko ugiętych kolanach i trzymaj ciężar blisko nóg." },
  { id: "split-squat", name: "Przysiad bułgarski", aliases: ["bułgary", "bulgarian split squat"], discipline: "strength", primaryMuscles: ["Czworogłowe uda", "Pośladki"], secondaryMuscles: ["Core"], equipment: ["Hantle", "Ławka"], instruction: "Zachowaj stabilną miednicę i kontroluj zejście w dół." },
  { id: "knee-extension-rehab", name: "Wyprost kolana z gumą", aliases: ["tke", "terminal knee extension", "rehab kolana"], discipline: "rehab", primaryMuscles: ["Czworogłowe uda"], secondaryMuscles: [], equipment: ["Guma oporowa"], instruction: "Prostuj kolano bez bólu, zatrzymaj napięcie na końcu ruchu." },
  { id: "glute-bridge", name: "Most biodrowy", aliases: ["glute bridge", "mostek pośladkowy"], discipline: "rehab", primaryMuscles: ["Pośladki"], secondaryMuscles: ["Dwugłowe uda"], equipment: ["Mata"], instruction: "Unieś biodra bez przeprostu odcinka lędźwiowego." },
  { id: "hamstring-stretch", name: "Rozciąganie tylnej taśmy", aliases: ["hamstring stretch", "dwugłowe rozciąganie"], discipline: "mobility", primaryMuscles: ["Dwugłowe uda"], secondaryMuscles: ["Łydki"], equipment: ["Mata"], instruction: "Utrzymuj spokojny oddech i zakres bez ostrego bólu." },
  { id: "hip-flexor-stretch", name: "Rozciąganie zginaczy biodra", aliases: ["hip flexor stretch", "biodra wykrok"], discipline: "mobility", primaryMuscles: ["Zginacze biodra"], secondaryMuscles: ["Czworogłowe uda"], equipment: ["Mata"], instruction: "Podwiń miednicę i przesuń ciężar delikatnie do przodu." },
  { id: "cat-cow", name: "Koci grzbiet", aliases: ["cat cow", "mobilizacja kręgosłupa"], discipline: "mobility", primaryMuscles: ["Kręgosłup"], secondaryMuscles: ["Core"], equipment: ["Mata"], instruction: "Poruszaj kręgosłupem płynnie w rytmie oddechu." },
];

export function cloneExercises(items: WorkoutExercise[], prefix = String(Date.now())): WorkoutExercise[] {
  return items.map((item, itemIndex) => ({
    ...item,
    id: `${prefix}-e${itemIndex + 1}`,
    sets: item.sets.map((set, setIndex) => ({ ...set, id: `${prefix}-e${itemIndex + 1}-s${setIndex + 1}`, done: false })),
  }));
}

const strengthUpper: WorkoutExercise[] = [
  exercise("upper-bench", "bench-press", "Wyciskanie sztangi leżąc", 3, 8, 80, 120),
  exercise("upper-row", "barbell-row", "Wiosłowanie sztangą", 3, 8, 70, 120),
  exercise("upper-ohp", "overhead-press", "Wyciskanie żołnierskie", 3, 8, 42.5, 90),
  exercise("upper-lat", "lat-pulldown", "Ściąganie drążka wyciągu", 3, 10, 60, 90),
  exercise("upper-raise", "lateral-raise", "Unoszenie hantli bokiem", 3, 12, 10, 60),
  exercise("upper-triceps", "triceps-pushdown", "Prostowanie ramion na wyciągu", 3, 12, 25, 60),
];

const rehabKnee: WorkoutExercise[] = [
  exercise("rehab-tke", "knee-extension-rehab", "Wyprost kolana z gumą", 3, 15, undefined, 45),
  exercise("rehab-bridge", "glute-bridge", "Most biodrowy", 3, 12, undefined, 45),
  exercise("rehab-split", "split-squat", "Przysiad bułgarski bez ciężaru", 2, 10, undefined, 60),
];

const mobilityEvening: WorkoutExercise[] = [
  exercise("mob-ham", "hamstring-stretch", "Rozciąganie tylnej taśmy", 2, 0, undefined, 15, 45),
  exercise("mob-hip", "hip-flexor-stretch", "Rozciąganie zginaczy biodra", 2, 0, undefined, 15, 45),
  exercise("mob-cat", "cat-cow", "Koci grzbiet", 2, 8, undefined, 15),
];

const lowerBody: WorkoutExercise[] = [
  exercise("lower-squat", "squat", "Przysiad ze sztangą", 4, 6, 95, 150),
  exercise("lower-rdl", "romanian-deadlift", "Martwy ciąg rumuński", 3, 8, 80, 120),
  exercise("lower-split", "split-squat", "Przysiad bułgarski", 3, 10, 16, 90),
];

export const INITIAL_TEMPLATES: WorkoutTemplate[] = [
  { id: "tpl-upper-a", name: "Góra A", discipline: "strength", description: "Klatka, plecy, barki i ramiona", durationMinutes: 65, exercises: strengthUpper },
  { id: "tpl-lower-a", name: "Dół A", discipline: "strength", description: "Nogi i tylny łańcuch", durationMinutes: 60, exercises: lowerBody },
  { id: "tpl-rehab-knee", name: "Rehabilitacja kolana", discipline: "rehab", description: "Kontrolowana praca nad stabilnością kolana", durationMinutes: 15, exercises: rehabKnee },
  { id: "tpl-mobility", name: "Stretching wieczorny", discipline: "mobility", description: "Krótka sesja mobilności całego ciała", durationMinutes: 20, exercises: mobilityEvening },
  { id: "tpl-easy-run", name: "Easy Run 5 km", discipline: "running", description: "Spokojny bieg w strefie 2", durationMinutes: 35, exercises: [], stages: [
    { id: "run-warm", label: "Rozgrzewka", kind: "warmup", target: "8 min · swobodnie" },
    { id: "run-main", label: "Bieg ciągły", kind: "steady", target: "5 km · tempo 6:10–6:35/km" },
    { id: "run-cool", label: "Schłodzenie", kind: "cooldown", target: "5 min · marsz" },
  ] },
];

export const INITIAL_PLANS: TrainingPlan[] = [
  { id: "plan-strength", name: "Siła i sprawność", disciplines: ["strength"], weeks: 8, currentWeek: 3, active: true, sessionsPerWeek: 3, completedSessions: 7, totalSessions: 24, templateIds: ["tpl-upper-a", "tpl-lower-a"], source: "manual", blocks: [{ id: "block-strength-base", name: "Budowanie bazy", startWeek: 1, endWeek: 4, focus: "Technika i stabilna objętość" }, { id: "block-strength-progress", name: "Progresja siłowa", startWeek: 5, endWeek: 8, focus: "Stopniowe zwiększanie obciążenia" }] },
  { id: "plan-run", name: "Powrót do biegania", disciplines: ["running"], weeks: 6, currentWeek: 2, active: true, sessionsPerWeek: 2, completedSessions: 3, totalSessions: 12, templateIds: ["tpl-easy-run"], source: "ai", blocks: [{ id: "block-run-base", name: "Baza tlenowa", startWeek: 1, endWeek: 6, focus: "Spokojna odbudowa kilometrażu" }] },
  { id: "plan-rehab", name: "Rehabilitacja kolana", disciplines: ["rehab", "mobility"], weeks: 6, currentWeek: 4, active: true, sessionsPerWeek: 4, completedSessions: 13, totalSessions: 24, templateIds: ["tpl-rehab-knee", "tpl-mobility"], source: "manual", blocks: [{ id: "block-rehab", name: "Stabilizacja", startWeek: 1, endWeek: 6, focus: "Regularność i kontrola bólu" }] },
];

export function createInitialSessions(todayKey = toDateKey(new Date())): WorkoutSession[] {
  const week = startOfWeekKey(fromDateKey(todayKey));
  const fromTemplate = (id: string, templateId: string, date: string, time: string, status: SessionStatus, planId: string): WorkoutSession => {
    const template = INITIAL_TEMPLATES.find((item) => item.id === templateId)!;
    const exercises = cloneExercises(template.exercises, id).map((item, itemIndex) => ({
      ...item,
      sets: item.sets.map((set, setIndex) => ({
        ...set,
        done: status === "completed" || (status === "incomplete" && itemIndex === 0 && setIndex < Math.ceil(item.sets.length / 2)),
      })),
    }));
    const stages = template.stages?.map((stage, stageIndex) => ({
      ...stage,
      id: `${id}-${stage.id}`,
      done: status === "completed" || (status === "incomplete" && stageIndex === 0),
    }));
    return {
      id,
      title: template.name,
      discipline: template.discipline,
      date,
      time,
      plannedDurationMinutes: template.durationMinutes,
      durationMinutes: template.durationMinutes,
      status,
      planId,
      templateId,
      exercises,
      stages,
    };
  };

  const sessions: WorkoutSession[] = [
    fromTemplate("sess-mon-upper", "tpl-upper-a", week, "18:30", "completed", "plan-strength"),
    fromTemplate("sess-mon-mob", "tpl-mobility", week, "21:15", "completed", "plan-rehab"),
    fromTemplate("sess-tue-run", "tpl-easy-run", addDays(week, 1), "07:00", "completed", "plan-run"),
    fromTemplate("sess-tue-rehab", "tpl-rehab-knee", addDays(week, 1), "19:30", "completed", "plan-rehab"),
    fromTemplate("sess-today-upper", "tpl-upper-a", todayKey, "18:30", "scheduled", "plan-strength"),
    fromTemplate("sess-today-rehab", "tpl-rehab-knee", todayKey, "16:30", "scheduled", "plan-rehab"),
    fromTemplate("sess-today-mob", "tpl-mobility", todayKey, "21:15", "scheduled", "plan-rehab"),
    fromTemplate("sess-thu-lower", "tpl-lower-a", addDays(todayKey, 1), "18:30", "scheduled", "plan-strength"),
    fromTemplate("sess-fri-run", "tpl-easy-run", addDays(todayKey, 2), "07:00", "scheduled", "plan-run"),
    fromTemplate("sess-sat-rehab", "tpl-rehab-knee", addDays(todayKey, 3), "11:00", "scheduled", "plan-rehab"),
    fromTemplate("sess-sun-mob", "tpl-mobility", addDays(todayKey, 4), "20:30", "scheduled", "plan-rehab"),
  ];

  for (let weekOffset = 1; weekOffset <= 3; weekOffset += 1) {
    const oldWeek = addDays(week, -7 * weekOffset);
    sessions.push(
      fromTemplate(`history-${weekOffset}-upper`, "tpl-upper-a", oldWeek, "18:30", "completed", "plan-strength"),
      fromTemplate(`history-${weekOffset}-run`, "tpl-easy-run", addDays(oldWeek, 2), "07:00", weekOffset === 2 ? "incomplete" : "completed", "plan-run"),
      fromTemplate(`history-${weekOffset}-rehab`, "tpl-rehab-knee", addDays(oldWeek, 4), "19:30", weekOffset === 3 ? "missed" : "completed", "plan-rehab"),
    );
  }
  return sessions;
}

export const INITIAL_IMPORTS: PendingImport[] = [
  { id: "import-strava-1", source: "Strava", title: "Morning Run", discipline: "running", date: toDateKey(new Date()), durationMinutes: 34, distanceKm: 5.1, suggestedSessionId: "sess-fri-run", confidence: 62 },
];

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("pl-PL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
