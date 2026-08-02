import {
  loadCalendarOccurrenceSources,
  selectCalendarOccurrences,
  type CalendarOccurrence,
} from "../../app/data/calendarOccurrences";
import { shiftLocalDateKey } from "../../app/data/localDate";

export interface CalendarWeek {
  startDate: string;
  endDate: string;
  occurrences: CalendarOccurrence[];
}

export interface CalendarConflict {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  kind: "same_start" | "overlap";
  occurrences: CalendarOccurrence[];
}

function minuteOfDay(value: string | undefined) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function occurrencesOverlap(left: CalendarOccurrence, right: CalendarOccurrence) {
  if (left.calendarDate !== right.calendarDate) return false;
  const leftStart = minuteOfDay(left.time);
  const rightStart = minuteOfDay(right.time);
  if (leftStart === null || rightStart === null) return false;
  if (leftStart === rightStart) return true;

  const leftEnd = minuteOfDay(left.endTime);
  const rightEnd = minuteOfDay(right.endTime);
  const normalizedLeftEnd = leftEnd !== null && leftEnd > leftStart ? leftEnd : leftStart;
  const normalizedRightEnd = rightEnd !== null && rightEnd > rightStart ? rightEnd : rightStart;

  if (normalizedLeftEnd === leftStart) {
    return leftStart > rightStart && leftStart < normalizedRightEnd;
  }
  if (normalizedRightEnd === rightStart) {
    return rightStart > leftStart && rightStart < normalizedLeftEnd;
  }
  return leftStart < normalizedRightEnd && rightStart < normalizedLeftEnd;
}

export function getCalendarWeek(startDate: string): CalendarWeek {
  const endDate = shiftLocalDateKey(startDate, 6);
  return {
    startDate,
    endDate,
    occurrences: selectCalendarOccurrences(loadCalendarOccurrenceSources(), startDate, endDate),
  };
}

export function findCalendarConflicts(occurrences: readonly CalendarOccurrence[]): CalendarConflict[] {
  const timed = occurrences.filter((occurrence) => minuteOfDay(occurrence.time) !== null);
  const adjacency = timed.map(() => new Set<number>());

  for (let left = 0; left < timed.length; left += 1) {
    for (let right = left + 1; right < timed.length; right += 1) {
      if (!occurrencesOverlap(timed[left], timed[right])) continue;
      adjacency[left].add(right);
      adjacency[right].add(left);
    }
  }

  const visited = new Set<number>();
  const conflicts: CalendarConflict[] = [];
  for (let index = 0; index < timed.length; index += 1) {
    if (visited.has(index) || adjacency[index].size === 0) continue;
    const queue = [index];
    const component: number[] = [];
    visited.add(index);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      adjacency[current].forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }

    const grouped = component.map((itemIndex) => timed[itemIndex]).sort((left, right) => (
      (left.time ?? "").localeCompare(right.time ?? "") || left.key.localeCompare(right.key)
    ));
    const starts = grouped.map((occurrence) => occurrence.time!).sort();
    const ends = grouped.flatMap((occurrence) => {
      const start = minuteOfDay(occurrence.time);
      const end = minuteOfDay(occurrence.endTime);
      return start !== null && end !== null && end > start ? [occurrence.endTime!] : [];
    }).sort();
    const sameStart = new Set(starts).size === 1;
    conflicts.push({
      id: `conflict:${grouped[0].calendarDate}:${conflicts.length + 1}`,
      date: grouped[0].calendarDate,
      startTime: starts[0],
      endTime: ends.at(-1) ?? null,
      kind: sameStart ? "same_start" : "overlap",
      occurrences: grouped,
    });
  }

  return conflicts.sort((left, right) => (
    left.date.localeCompare(right.date)
    || left.startTime.localeCompare(right.startTime)
    || left.id.localeCompare(right.id)
  ));
}
