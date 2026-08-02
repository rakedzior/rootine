import {
  TRAVEL_STORAGE_KEY,
  loadTravelWorkspace,
  saveTravelWorkspace,
  setTravelTaskCompletionState,
  type TravelTask,
  type TravelWorkspace,
} from "../../app/data/travelWorkspace";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { travelTaskCompletionSchema } from "./travelSchemas";

function selectTask(workspace: TravelWorkspace, tripId: string, taskId: string) {
  return workspace.trips.find((trip) => trip.id === tripId)?.tasks.find((task) => task.id === taskId) ?? null;
}

function replaceTask(workspace: TravelWorkspace, tripId: string, taskId: string, value: TravelTask | null): TravelWorkspace {
  return {
    ...workspace,
    trips: workspace.trips.map((trip) => trip.id !== tripId ? trip : {
      ...trip,
      tasks: value === null
        ? trip.tasks.filter((task) => task.id !== taskId)
        : trip.tasks.map((task) => task.id === taskId ? value : task),
    }),
  };
}

export async function setTravelTaskCompletion(input: unknown): Promise<DomainMutationResult<TravelTask>> {
  const parsed = travelTaskCompletionSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowe zadanie podróży.");
  const workspace = loadTravelWorkspace();
  const trip = workspace.trips.find((candidate) => candidate.id === parsed.data.tripId);
  if (!trip || trip.archivedAt) return domainFailure("NOT_FOUND", "Aktywna podróż nie istnieje.");
  const before = trip.tasks.find((task) => task.id === parsed.data.taskId);
  if (!before) return domainFailure("NOT_FOUND", "Zadanie podróży nie istnieje.");
  if (before.completed === parsed.data.completed) return domainFailure("CONFLICT", "Zadanie ma już wybrany status.");
  const after = { ...before, completed: parsed.data.completed };
  const next = setTravelTaskCompletionState(workspace, trip.id, before.id, after.completed);
  const compensation = createWorkspaceUndo({
    storageKey: TRAVEL_STORAGE_KEY, read: loadTravelWorkspace, save: saveTravelWorkspace,
    select: (current) => selectTask(current, trip.id, before.id),
    apply: (current, value) => replaceTask(current, trip.id, before.id, value),
    expected: after, restore: before,
    message: parsed.data.completed ? "Cofnięto wykonanie zadania podróży." : "Przywrócono wykonanie zadania podróży.",
  });
  return commitDomainMutation({
    entityId: before.id, storageKey: TRAVEL_STORAGE_KEY,
    event: { type: "travel.task_completed", domain: "travel", entityId: before.id, payload: { tripId: trip.id, completed: after.completed } },
    save: () => saveTravelWorkspace(next), read: loadTravelWorkspace,
    verify: (current) => selectTask(current, trip.id, before.id)?.completed === after.completed,
    selectSnapshot: (current) => selectTask(current, trip.id, before.id) ?? after,
    message: after.completed ? "Oznaczono zadanie podróży jako wykonane." : "Cofnięto wykonanie zadania podróży.",
    compensation,
  });
}
