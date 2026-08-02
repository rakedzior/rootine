import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  subscribeToLocalWorkspace,
  type LocalLoadStatus,
} from "../data/localRepository";
import {
  GOALS_STORAGE_KEY,
  loadGoalsWorkspaceResult,
  saveGoalsWorkspace,
} from "../../domain/goals/goalsRepository";
import {
  appendGoalProgress,
  patchGoalMilestone,
} from "../../domain/goals/goalMutations";
import {
  GOALS_STORE_VERSION,
  inspectGoalsImport,
  normalizeGoal,
  normalizeGoalAccentColor,
  normalizeGoalCategory,
  parseGoalsImport,
  type Goal,
  type GoalCategory,
  type GoalsWorkspace,
} from "./goalsModel";
import {
  GoalsStoreContext,
  type GoalsPersistence,
  type GoalsStoreValue,
} from "./goalsContext";

const STORAGE_KEY = GOALS_STORAGE_KEY;
const nowIso = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function GoalsProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(loadGoalsWorkspaceResult, []);
  const [goals, setGoals] = useState<Goal[]>(initial.workspace.goals);
  const [categories, setCategories] = useState<GoalCategory[]>(initial.workspace.categories);
  const [storageFailed, setStorageFailed] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LocalLoadStatus>(initial.status);
  const [recoveryId, setRecoveryId] = useState(initial.recoveryId);
  const goalsRef = useRef(initial.workspace.goals);
  const categoriesRef = useRef(initial.workspace.categories);
  const lastSerializedRef = useRef(JSON.stringify(initial.workspace));
  const pendingWorkspaceRef = useRef<GoalsWorkspace | null>(null);
  const persistTimeoutRef = useRef<number | null>(null);

  const persistWorkspace = useCallback((workspace: GoalsWorkspace) => {
    const serialized = JSON.stringify(workspace);
    if (serialized === lastSerializedRef.current) return true;

    const previous = lastSerializedRef.current;
    lastSerializedRef.current = serialized;
    const saved = saveGoalsWorkspace(workspace);
    if (!saved) lastSerializedRef.current = previous;
    setStorageFailed(!saved);
    if (saved) setLoadStatus("ok");
    return saved;
  }, []);

  const flushPersistence = useCallback(() => {
    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    const pending = pendingWorkspaceRef.current;
    pendingWorkspaceRef.current = null;
    return pending ? persistWorkspace(pending) : true;
  }, [persistWorkspace]);

  const schedulePersistence = useCallback((persistence: GoalsPersistence = "debounced") => {
    pendingWorkspaceRef.current = {
      version: GOALS_STORE_VERSION,
      goals: goalsRef.current,
      categories: categoriesRef.current,
    };
    if (persistence === "immediate") {
      flushPersistence();
      return;
    }
    if (persistTimeoutRef.current !== null) window.clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = window.setTimeout(flushPersistence, 250);
  }, [flushPersistence]);

  const applyWorkspace = useCallback((
    updater: (current: GoalsWorkspace) => GoalsWorkspace,
    persistence: GoalsPersistence = "debounced",
  ) => {
    const current: GoalsWorkspace = {
      version: GOALS_STORE_VERSION,
      goals: goalsRef.current,
      categories: categoriesRef.current,
    };
    const next = updater(current);
    goalsRef.current = next.goals;
    categoriesRef.current = next.categories;
    setGoals(next.goals);
    setCategories(next.categories);
    schedulePersistence(persistence);
    return next;
  }, [schedulePersistence]);

  useEffect(() => {
    const flushPendingWorkspace = () => flushPersistence();
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPersistence();
    };
    window.addEventListener("pagehide", flushPendingWorkspace);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushPendingWorkspace);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flushPersistence();
    };
  }, [flushPersistence]);

  useEffect(() => subscribeToLocalWorkspace(STORAGE_KEY, () => {
    if (pendingWorkspaceRef.current) return;
    const loaded = loadGoalsWorkspaceResult();
    const serialized = JSON.stringify(loaded.workspace);
    setLoadStatus(loaded.status);
    setRecoveryId(loaded.recoveryId);
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;
    goalsRef.current = loaded.workspace.goals;
    categoriesRef.current = loaded.workspace.categories;
    setGoals(loaded.workspace.goals);
    setCategories(loaded.workspace.categories);
    setStorageFailed(false);
  }), []);

  const value = useMemo<GoalsStoreValue>(() => ({
    goals,
    categories,
    storageFailed,
    loadStatus,
    recoveryId,
    createGoal: (draft) => {
      const id = uid();
      const stamp = nowIso();
      applyWorkspace((current) => ({
        ...current,
        goals: [...current.goals, {
          ...draft,
          id,
          color: normalizeGoalAccentColor(draft.color),
          milestones: draft.milestones ?? [],
          progressEntries: draft.progressEntries ?? [],
          createdAt: stamp,
          updatedAt: stamp,
        }],
      }));
      return id;
    },
    updateGoal: (id, patch, options) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === id ? {
        ...goal,
        ...patch,
        ...(patch.color ? { color: normalizeGoalAccentColor(patch.color) } : {}),
        id: goal.id,
        updatedAt: nowIso(),
      } : goal),
    }), options?.persistence ?? (patch.status !== undefined ? "immediate" : "debounced")),
    deleteGoal: (id) => {
      const deleted = goalsRef.current.find((goal) => goal.id === id) ?? null;
      if (deleted) {
        applyWorkspace((current) => ({
          ...current,
          goals: current.goals.filter((goal) => goal.id !== id),
        }), "immediate");
      }
      return deleted;
    },
    restoreGoal: (goal) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.some((item) => item.id === goal.id)
        ? current.goals
        : [...current.goals, normalizeGoal(goal)],
    }), "immediate"),
    duplicateGoal: (id) => {
      const source = goalsRef.current.find((goal) => goal.id === id);
      if (!source) return null;
      const duplicateId = uid();
      const stamp = nowIso();
      applyWorkspace((current) => ({
        ...current,
        goals: [...current.goals, {
          ...source,
          id: duplicateId,
          title: `${source.title} — kopia`,
          status: "planned",
          milestones: source.milestones.map((item) => ({ ...item, id: uid(), done: false })),
          progressEntries: [],
          createdAt: stamp,
          updatedAt: stamp,
        }],
      }));
      return duplicateId;
    },
    addProgress: (goalId, draft) => applyWorkspace((current) => {
      const createdAt = nowIso();
      return appendGoalProgress(current, goalId, {
        ...draft,
        id: uid(),
        createdAt,
      });
    }),
    updateProgress: (goalId, progressId, patch) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === goalId ? {
        ...goal,
        progressEntries: goal.progressEntries.map((item) => (
          item.id === progressId ? { ...item, ...patch, id: item.id } : item
        )),
        updatedAt: nowIso(),
      } : goal),
    })),
    deleteProgress: (goalId, progressId) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === goalId ? {
        ...goal,
        progressEntries: goal.progressEntries.filter((item) => item.id !== progressId),
        updatedAt: nowIso(),
      } : goal),
    }), "immediate"),
    addMilestone: (goalId, draft) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === goalId ? {
        ...goal,
        milestones: [...goal.milestones, { ...draft, id: uid() }],
        updatedAt: nowIso(),
      } : goal),
    })),
    updateMilestone: (goalId, milestoneId, patch) => applyWorkspace((current) => (
      patchGoalMilestone(current, goalId, milestoneId, patch, nowIso())
    )),
    deleteMilestone: (goalId, milestoneId) => applyWorkspace((current) => ({
      ...current,
      goals: current.goals.map((goal) => goal.id === goalId ? {
        ...goal,
        milestones: goal.milestones.filter((item) => item.id !== milestoneId),
        updatedAt: nowIso(),
      } : goal),
    }), "immediate"),
    createCategory: (draft) => applyWorkspace((current) => ({
      ...current,
      categories: [...current.categories, normalizeGoalCategory({ ...draft, id: uid() })],
    })),
    updateCategory: (id, patch) => applyWorkspace((current) => ({
      ...current,
      categories: current.categories.map((category) => (
        category.id === id
          ? normalizeGoalCategory({ ...category, ...patch, id: category.id })
          : category
      )),
    })),
    deleteCategory: (id) => {
      if (id === "personal") return;
      applyWorkspace((current) => ({
        ...current,
        categories: current.categories.filter((category) => category.id !== id),
        goals: current.goals.map((goal) => (
          goal.categoryId === id
            ? { ...goal, categoryId: "personal", updatedAt: nowIso() }
            : goal
        )),
      }), "immediate");
    },
    inspectImport: inspectGoalsImport,
    importStore: (raw) => {
      const parsed = parseGoalsImport(raw);
      if ("error" in parsed) return { ok: false, error: parsed.error };

      flushPersistence();
      const previousSerialized = lastSerializedRef.current;
      const serialized = JSON.stringify(parsed.workspace);
      lastSerializedRef.current = serialized;
      if (!saveGoalsWorkspace(parsed.workspace)) {
        lastSerializedRef.current = previousSerialized;
        setStorageFailed(true);
        return { ok: false, error: "Nie udało się zapisać importowanych danych w pamięci przeglądarki." };
      }

      goalsRef.current = parsed.workspace.goals;
      categoriesRef.current = parsed.workspace.categories;
      setGoals(parsed.workspace.goals);
      setCategories(parsed.workspace.categories);
      setStorageFailed(false);
      setLoadStatus("ok");
      setRecoveryId(undefined);
      return { ok: true };
    },
    exportStore: () => JSON.stringify({
      version: GOALS_STORE_VERSION,
      exportedAt: nowIso(),
      goals: goalsRef.current,
      categories: categoriesRef.current,
    }, null, 2),
  }), [goals, categories, storageFailed, loadStatus, recoveryId, applyWorkspace, flushPersistence]);

  return <GoalsStoreContext.Provider value={value}>{children}</GoalsStoreContext.Provider>;
}
