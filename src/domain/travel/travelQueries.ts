import { loadTravelWorkspace, summarizeTravelBudget } from "../../app/data/travelWorkspace";
import { normalizeSearchQuery } from "../shared";
import { domainFailure, type DomainCandidate } from "../shared/result";
import { travelSearchSchema } from "./travelSchemas";

export function getTravelSummary(today: string) {
  const trips = loadTravelWorkspace().trips.filter((trip) => !trip.archivedAt);
  return trips.map((trip) => ({
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    active: trip.startDate <= today && trip.endDate >= today,
    openTasks: trip.tasks.filter((task) => !task.completed).length,
    budget: summarizeTravelBudget(trip),
  }));
}

export function searchTravelTasks(input: unknown) {
  const parsed = travelSearchSchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const query = normalizeSearchQuery(parsed.data.query);
  const matches = loadTravelWorkspace().trips.flatMap((trip) => trip.tasks
    .filter((task) => normalizeSearchQuery(task.title).includes(query))
    .map((task) => ({
      id: task.id, tripId: trip.id, title: task.title, tripName: trip.name,
      dueDate: task.dueDate || null, completed: task.completed, category: task.category,
    })));
  return { items: matches.slice(0, parsed.data.limit), total: matches.length };
}

export function resolveTravelTaskQuery(query: string): { tripId: string; taskId: string } | ReturnType<typeof domainFailure> {
  const result = searchTravelTasks({ query, limit: 8 });
  if (result.items.length === 0) return domainFailure("NOT_FOUND", "Nie znaleziono pasującego zadania podróży.");
  if (result.total !== 1) {
    const candidates: DomainCandidate[] = result.items.map((item) => ({
      id: item.id, title: item.title, module: "travel", status: item.completed ? "completed" : "open",
      date: item.dueDate ?? undefined, context: item.tripName,
    }));
    return domainFailure("AMBIGUOUS", "Znaleziono kilka pasujących zadań podróży.", candidates);
  }
  return { tripId: result.items[0].tripId, taskId: result.items[0].id };
}
