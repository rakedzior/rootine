import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  flushLocalWorkspaceWrites,
  subscribeToLocalWorkspace,
  type LocalLoadResult,
} from "../../data/localRepository";
import { TRAVEL_STORAGE_KEY } from "../../data/travelWorkspace";
import { WORK_STORAGE_KEY } from "../../data/workWorkspace";
import {
  loadTaskWorkspaceResult,
  TASK_STORAGE_KEY,
  type TaskWorkspace,
  type WorkspaceHabit,
  type WorkspaceList,
  type WorkspaceTag,
  type WorkspaceTask,
} from "../../data/taskWorkspace";
import { loadInitialTaskPagePreferences, type TasksViewMode } from "./taskPageModel";

type WorkspaceSync = {
  workspaceRef: MutableRefObject<TaskWorkspace>;
  setTasks: Dispatch<SetStateAction<WorkspaceTask[]>>;
  setHabits: Dispatch<SetStateAction<WorkspaceHabit[]>>;
  setLists: Dispatch<SetStateAction<WorkspaceList[]>>;
  setTags: Dispatch<SetStateAction<WorkspaceTag[]>>;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  setHydrated: Dispatch<SetStateAction<boolean>>;
};

export function workspaceWithRecentTask(
  workspace: TaskWorkspace,
  rawRecentTask: string | null,
): TaskWorkspace {
  try {
    const recent = JSON.parse(rawRecentTask ?? "null") as WorkspaceTask | null;
    return recent && !workspace.tasks.some((task) => task.id === recent.id)
      ? { ...workspace, tasks: [...workspace.tasks, recent] }
      : workspace;
  } catch {
    return workspace;
  }
}

export function initialTaskPreferencesForWorkspace(
  initialLoad: LocalLoadResult<TaskWorkspace>,
  workspace: TaskWorkspace,
  href: string,
) {
  const preferences = loadInitialTaskPagePreferences(workspace.tasks);
  const requested = new URLSearchParams(href).get("zadanie");
  const pendingTaskId = requested && /^\d+$/.test(requested) ? Number(requested) : Number.NaN;
  if (initialLoad.status !== "missing" || !Number.isSafeInteger(pendingTaskId)) return preferences;
  return {
    ...preferences,
    taskView: "wszystkie",
    listFilter: null,
    tagFilter: null,
    viewMode: "list" as TasksViewMode,
    linkedTaskId: pendingTaskId,
    invalidTaskDeepLink: false,
    deepLinkPreferences: {
      taskView: preferences.sidebar.taskView,
      listFilter: preferences.sidebar.listFilter,
      tagFilter: preferences.sidebar.tagFilter,
      viewMode: preferences.viewMode,
    },
  };
}

export function useTaskWorkspaceSynchronization({
  workspaceRef,
  setTasks,
  setHabits,
  setLists,
  setTags,
  setSelectedId,
  setHydrated,
}: WorkspaceSync) {
  useEffect(() => {
    const syncWorkspace = () => {
      const result = loadTaskWorkspaceResult();
      const workspace = result.workspace;
      workspaceRef.current = workspace;
      setTasks(workspace.tasks);
      setHabits(workspace.habits);
      setLists(workspace.lists);
      setTags(workspace.tags);
      setSelectedId((current) => current !== null && (
        workspace.tasks.some((task) => task.id === current) || !Number.isInteger(current)
      ) ? current : null);
      return result.status;
    };
    const syncTaskWorkspace = () => {
      if (syncWorkspace() !== "missing") setHydrated(true);
    };
    const finishTaskHydration = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; origin?: string }>).detail;
      if (detail?.key !== TASK_STORAGE_KEY || !detail.origin?.endsWith("-hydrate")) return;
      syncWorkspace();
      setHydrated(true);
    };
    const unsubscribers = [
      subscribeToLocalWorkspace(TASK_STORAGE_KEY, syncTaskWorkspace),
      subscribeToLocalWorkspace(WORK_STORAGE_KEY, syncWorkspace),
      subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, syncWorkspace),
    ];
    window.addEventListener("rootine:workspace-change", finishTaskHydration);
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener("rootine:workspace-change", finishTaskHydration);
    };
  }, [setHabits, setHydrated, setLists, setSelectedId, setTags, setTasks, workspaceRef]);
}

export async function resolveTaskDeepLink(id: number): Promise<{
  workspace: TaskWorkspace;
  task: WorkspaceTask | undefined;
}> {
  await flushLocalWorkspaceWrites();
  const workspace = loadTaskWorkspaceResult().workspace;
  return { workspace, task: workspace.tasks.find((task) => task.id === id) };
}
