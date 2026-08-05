import { isLocalDateKey, toLocalDateKey, todayLocalDateKey } from "../../data/localDate";
import type { Task } from "./taskPageModel";

function localDateFromTimestamp(timestamp?: string) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : toLocalDateKey(date);
}

export function taskCompletionDates(task: Task) {
  const dates = new Set((task.schedule?.completedDates ?? []).filter(isLocalDateKey));
  if (task.done) dates.add(localDateFromTimestamp(task.completedAt) ?? task.calendarDate ?? "");
  return [...dates].filter(isLocalDateKey).sort();
}

export function latestTaskActivityDate(tasks: Task[], fallback = todayLocalDateKey()) {
  const dates = tasks
    .filter((task) => !task.deleted)
    .flatMap((task) => [task.calendarDate, ...taskCompletionDates(task)])
    .filter((date): date is string => Boolean(date) && isLocalDateKey(date) && date <= fallback)
    .sort();
  return dates.at(-1) ?? fallback;
}
