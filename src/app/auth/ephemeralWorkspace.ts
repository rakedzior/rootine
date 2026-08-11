import { createDefaultAffairsWorkspace, AFFAIRS_STORAGE_KEY } from "../data/affairsWorkspace";
import { createDefaultJdgWorkspace, JDG_STORAGE_KEY } from "../data/jdgWorkspace";
import { setWorkspacePayloadStoreForTests } from "../data/localRepository";
import { createDefaultNotesWorkspace, NOTES_STORAGE_KEY } from "../data/notesWorkspace";
import {
  createEmptyNutritionWorkspace,
  createNutritionReviewWorkspace,
  NUTRITION_STORAGE_KEY,
  type NutritionWorkspace,
} from "../data/nutritionWorkspace";
import { createDefaultSummaryNotes, isoWeekKey, SUMMARY_NOTES_STORAGE_KEY } from "../data/summaryNotes";
import { createDefaultTaskWorkspace, TASK_STORAGE_KEY } from "../data/taskWorkspace";
import { loadTravelWorkspace, TRAVEL_STORAGE_KEY } from "../data/travelWorkspace";
import { createDefaultWorkWorkspace, WORK_STORAGE_KEY } from "../data/workWorkspace";
import { createSeedGoalsWorkspace } from "../goals/goalsModel";
import { GOALS_STORAGE_KEY } from "../goals/goalsRepository";
import { createDefaultSportPlannerState, SPORT_PLANNER_STORAGE_KEY } from "../sport/plannerModel";
import {
  ACTIVITY_LOG_STORAGE_KEY,
  resetActivityLogCacheForWorkspaceSwitch,
  type ActivityEvent,
} from "../experience/activityLog";
import {
  createBrowserWorkspacePayloadStore,
  type WorkspacePayloadStore,
} from "../data/indexedDbWorkspaceStore";

type StorageName = "localStorage" | "sessionStorage";

type ActiveTestWorkspace = {
  restoreLocalStorage: () => void;
  restoreSessionStorage: () => void;
};

let activeWorkspace: ActiveTestWorkspace | null = null;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

function replaceWindowStorage(name: StorageName, storage: Storage) {
  const ownDescriptor = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, {
    configurable: true,
    enumerable: true,
    value: storage,
  });
  return () => {
    if (ownDescriptor) {
      Object.defineProperty(window, name, ownDescriptor);
      return;
    }
    delete (window as unknown as Record<StorageName, Storage>)[name];
  };
}

function createUnavailablePayloadStore(): WorkspacePayloadStore {
  const unavailable = async () => {
    throw new DOMException("Konto testowe używa wyłącznie pamięci sesji.", "NotSupportedError");
  };
  return {
    available: false,
    read: async () => null,
    list: async () => [],
    compareAndSwap: unavailable,
    remove: async () => undefined,
  };
}

function sampleNutritionWorkspace(): NutritionWorkspace {
  const base = createNutritionReviewWorkspace(createEmptyNutritionWorkspace());
  const timestamp = new Date().toISOString();
  return {
    ...base,
    customMeals: [
      {
        id: "test-meal-power-bowl",
        name: "Bowl z kurczakiem i ryżem",
        totalWeightG: 720,
        servings: 2,
        createdAt: timestamp,
        ingredients: [
          {
            id: "test-ingredient-chicken",
            name: "Pierś z kurczaka",
            amount: 260,
            unit: "g",
            per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
          },
          {
            id: "test-ingredient-rice",
            name: "Ryż basmati, ugotowany",
            amount: 320,
            unit: "g",
            per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
          },
          {
            id: "test-ingredient-vegetables",
            name: "Warzywa pieczone",
            amount: 220,
            unit: "g",
            per100g: { calories: 72, protein: 2.2, carbs: 11, fat: 2.4 },
          },
        ],
      },
      {
        id: "test-meal-breakfast",
        name: "Owsianka ze skyrem",
        totalWeightG: 430,
        servings: 1,
        createdAt: timestamp,
        ingredients: [
          {
            id: "test-ingredient-oats",
            name: "Płatki owsiane",
            amount: 70,
            unit: "g",
            per100g: { calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5 },
          },
          {
            id: "test-ingredient-skyr",
            name: "Skyr naturalny",
            amount: 200,
            unit: "g",
            per100g: { calories: 63, protein: 11, carbs: 4, fat: 0.2 },
          },
          {
            id: "test-ingredient-blueberries",
            name: "Borówki",
            amount: 100,
            unit: "g",
            per100g: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3 },
          },
        ],
      },
    ],
  };
}

function seedTestWorkspace(storage: Storage) {
  const summary = createDefaultSummaryNotes();
  summary.weeks[isoWeekKey()] = "<p><strong>Dobry tydzień:</strong> domknięte priorytety i spokojny plan na kolejne dni.</p>";
  const eventTime = (hour: number, minute: number) => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const activity: ActivityEvent[] = [
    { id: "test-activity-4", version: 1, occurredAt: eventTime(12, 10), moduleId: "nutrition", kind: "save", title: "Zapisano lunch", detail: "Kurczak z ryżem i warzywami" },
    { id: "test-activity-3", version: 1, occurredAt: eventTime(10, 40), moduleId: "work", kind: "status", title: "Nowa strona", detail: "Projekt pozostaje aktywny" },
    { id: "test-activity-2", version: 1, occurredAt: eventTime(9, 15), moduleId: "goals", kind: "save", title: "Powrót do pełnej sprawności kolana", detail: "Zapisano najnowszy pomiar" },
    { id: "test-activity-1", version: 1, occurredAt: eventTime(8, 5), moduleId: "tasks", kind: "complete", title: "Tomasz Karcz — zadzwonić", detail: "Oznaczono jako wykonane" },
  ];

  const entries: Array<[string, unknown]> = [
    [TASK_STORAGE_KEY, createDefaultTaskWorkspace()],
    [GOALS_STORAGE_KEY, createSeedGoalsWorkspace()],
    [SPORT_PLANNER_STORAGE_KEY, createDefaultSportPlannerState()],
    [NUTRITION_STORAGE_KEY, sampleNutritionWorkspace()],
    [WORK_STORAGE_KEY, createDefaultWorkWorkspace()],
    [TRAVEL_STORAGE_KEY, loadTravelWorkspace()],
    [NOTES_STORAGE_KEY, createDefaultNotesWorkspace()],
    [AFFAIRS_STORAGE_KEY, createDefaultAffairsWorkspace()],
    [JDG_STORAGE_KEY, createDefaultJdgWorkspace()],
    [SUMMARY_NOTES_STORAGE_KEY, summary],
    [ACTIVITY_LOG_STORAGE_KEY, activity],
  ];

  entries.forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
}

/**
 * Mounts a fully isolated Rootine workspace. Every existing repository keeps
 * its normal behavior, but both browser storage APIs resolve to in-memory maps.
 */
export function activateEphemeralTestWorkspace() {
  if (activeWorkspace || typeof window === "undefined") return;

  const local = createMemoryStorage();
  const session = createMemoryStorage();
  const restoreLocalStorage = replaceWindowStorage("localStorage", local);
  const restoreSessionStorage = replaceWindowStorage("sessionStorage", session);

  setWorkspacePayloadStoreForTests(createUnavailablePayloadStore());
  seedTestWorkspace(local);
  resetActivityLogCacheForWorkspaceSwitch();
  activeWorkspace = { restoreLocalStorage, restoreSessionStorage };
}

export function isEphemeralTestWorkspaceActive() {
  return activeWorkspace !== null;
}

/** Test-only escape hatch. The product exits demo mode through a full reload. */
export function deactivateEphemeralTestWorkspaceForTests() {
  if (!activeWorkspace || typeof window === "undefined") return;
  activeWorkspace.restoreSessionStorage();
  activeWorkspace.restoreLocalStorage();
  activeWorkspace = null;
  setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore());
}
