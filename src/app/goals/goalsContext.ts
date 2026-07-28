import { createContext, useContext } from "react";
import type { LocalLoadStatus } from "../data/localRepository";
import type {
  Goal,
  GoalCategory,
  GoalDraft,
  GoalMilestone,
  GoalProgressEntry,
  GoalsImportInspection,
  GoalsImportResult,
} from "./goalsModel";

export type GoalsPersistence = "debounced" | "immediate";

export type GoalUpdateOptions = {
  persistence?: GoalsPersistence;
};

export type GoalsStoreValue = {
  goals: Goal[];
  categories: GoalCategory[];
  storageFailed: boolean;
  loadStatus: LocalLoadStatus;
  recoveryId?: string;
  createGoal: (draft: GoalDraft) => string;
  updateGoal: (id: string, patch: Partial<Goal>, options?: GoalUpdateOptions) => void;
  deleteGoal: (id: string) => Goal | null;
  restoreGoal: (goal: Goal) => void;
  duplicateGoal: (id: string) => string | null;
  addProgress: (goalId: string, draft: Omit<GoalProgressEntry, "id" | "createdAt">) => void;
  updateProgress: (goalId: string, progressId: string, patch: Partial<GoalProgressEntry>) => void;
  deleteProgress: (goalId: string, progressId: string) => void;
  addMilestone: (goalId: string, draft: Omit<GoalMilestone, "id">) => void;
  updateMilestone: (goalId: string, milestoneId: string, patch: Partial<GoalMilestone>) => void;
  deleteMilestone: (goalId: string, milestoneId: string) => void;
  createCategory: (draft: Omit<GoalCategory, "id">) => void;
  updateCategory: (id: string, patch: Partial<GoalCategory>) => void;
  deleteCategory: (id: string) => void;
  inspectImport: (raw: string) => GoalsImportInspection;
  importStore: (raw: string) => GoalsImportResult;
  exportStore: () => string;
};

export const GoalsStoreContext = createContext<GoalsStoreValue | null>(null);

export function useGoalsStore() {
  const context = useContext(GoalsStoreContext);
  if (!context) throw new Error("useGoalsStore must be used inside GoalsProvider");
  return context;
}
