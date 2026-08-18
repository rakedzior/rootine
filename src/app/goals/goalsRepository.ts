import { readLocalWorkspace, writeLocalWorkspace } from "../data/localRepository";
import {
  createEmptyGoalsWorkspace,
  isGoalsWorkspace,
  normalizeGoalsWorkspace,
  type GoalsWorkspace,
} from "./goalsModel";

export const GOALS_STORAGE_KEY = "rootine.goals.v1";

export function loadGoalsWorkspaceResult() {
  const loaded = readLocalWorkspace<GoalsWorkspace>({
    key: GOALS_STORAGE_KEY,
    fallback: createEmptyGoalsWorkspace,
    validate: isGoalsWorkspace,
  });
  return { ...loaded, workspace: normalizeGoalsWorkspace(loaded.workspace) };
}

export function loadGoalsWorkspace() {
  return loadGoalsWorkspaceResult().workspace;
}

export function saveGoalsWorkspace(workspace: GoalsWorkspace) {
  return isGoalsWorkspace(workspace) && writeLocalWorkspace(GOALS_STORAGE_KEY, workspace);
}
