import { shiftLocalDateKey } from "../../app/data/localDate";
import {
  cycleWorkoutDate,
  isWorkoutScheduledOnDate,
  loadSportPlannerState,
} from "../../app/sport/plannerModel";
import { normalizeSearchQuery } from "../shared";
import { domainFailure, type DomainCandidate } from "../shared/result";
import { searchWorkoutsSchema } from "./sportSchemas";

export interface WorkoutSummary {
  id: string;
  title: string;
  discipline: string;
  date: string;
  time: string | null;
  durationMinutes: number;
  status: string;
  cycleId: string;
}

export function getUpcomingWorkouts(startDate: string, days = 14): WorkoutSummary[] {
  const state = loadSportPlannerState();
  const cycle = state.activeCycle;
  if (!cycle) return [];
  const span = Math.max(1, Math.min(60, days));
  const results: WorkoutSummary[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const date = shiftLocalDateKey(startDate, offset);
    cycle.workouts.filter((workout) => isWorkoutScheduledOnDate(cycle, workout, date)).forEach((workout) => {
      results.push({
        id: workout.id,
        title: workout.title,
        discipline: workout.discipline,
        date,
        time: workout.time ?? null,
        durationMinutes: workout.durationMinutes,
        status: state.workoutOutcomes[workout.id]?.status ?? "scheduled",
        cycleId: cycle.id,
      });
    });
  }
  return results;
}

export function searchWorkouts(input: unknown) {
  const parsed = searchWorkoutsSchema.safeParse(input);
  if (!parsed.success) return { items: [] as WorkoutSummary[], total: 0, error: parsed.error.issues[0]?.message };
  const state = loadSportPlannerState();
  const cycle = state.activeCycle;
  if (!cycle) return { items: [] as WorkoutSummary[], total: 0 };
  const query = normalizeSearchQuery(parsed.data.query);
  const matches = cycle.workouts.filter((workout) => normalizeSearchQuery(workout.title).includes(query));
  return {
    items: matches.slice(0, parsed.data.limit).map((workout) => ({
      id: workout.id, title: workout.title, discipline: workout.discipline,
      date: cycleWorkoutDate(cycle, workout), time: workout.time ?? null,
      durationMinutes: workout.durationMinutes,
      status: state.workoutOutcomes[workout.id]?.status ?? "scheduled", cycleId: cycle.id,
    })),
    total: matches.length,
  };
}

export function resolveWorkoutQuery(query: string): { workoutId: string; date: string } | ReturnType<typeof domainFailure> {
  const result = searchWorkouts({ query, limit: 8 });
  if (result.items.length === 0) return domainFailure("NOT_FOUND", "Nie znaleziono pasującego treningu.");
  if (result.total !== 1) {
    const candidates: DomainCandidate[] = result.items.map((item) => ({
      id: item.id, title: item.title, module: "sport", status: item.status, date: item.date,
      context: `${item.discipline}, ${item.durationMinutes} min`,
    }));
    return domainFailure("AMBIGUOUS", "Znaleziono kilka pasujących treningów.", candidates);
  }
  return { workoutId: result.items[0].id, date: result.items[0].date };
}

export function getSportSummary(today: string) {
  const state = loadSportPlannerState();
  return {
    today: getUpcomingWorkouts(today, 1),
    upcoming: getUpcomingWorkouts(today, 14),
    recentHistory: state.history.slice(0, 5),
    activeCycle: state.activeCycle ? {
      id: state.activeCycle.id,
      name: state.activeCycle.name,
      startDate: state.activeCycle.startDate,
      endDate: state.activeCycle.endDate ?? null,
    } : null,
  };
}
