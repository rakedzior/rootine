import {
  calendarDaysBetween,
  formatLocalDate,
  isLocalDateKey,
  parseLocalDateKey,
  shiftLocalDateKey,
  toLocalDateKey,
} from "./localDate";
import { setTaskDoneState, type TaskRecurrence, type WorkspaceTask } from "./taskWorkspace";

export type TaskOccurrenceMeta = {
  key: string;
  sourceTaskId: number;
  date: string;
  virtual: boolean;
};

export type TaskOccurrence = WorkspaceTask & {
  calendarDate: string;
  occurrence: TaskOccurrenceMeta;
};

export type DueTaskReminder = {
  key: string;
  taskId: number;
  taskText: string;
  occurrenceDate: string;
  startsAt: Date;
  triggersAt: Date;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function occurrenceKey(taskId: number, date: string) {
  return `${taskId}@${date}`;
}

function syntheticOccurrenceId(key: string) {
  // Runtime-only recurring occurrences use a fractional negative ID. Persisted and
  // projected source IDs are integers, so this namespace cannot overwrite either.
  let hash = 14_695_981_039_346_656_037n;
  const prime = 1_099_511_628_211n;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= BigInt(key.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  const safeHash = Number(hash % 4_000_000_000_000_000n);
  return -(safeHash + 1) - 0.5;
}

function dateParts(value: string) {
  const parsed = parseLocalDateKey(value);
  if (!parsed) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0, 12).getDate();
}

function recurrenceDates(
  anchorDate: string,
  recurrence: TaskRecurrence,
  rangeStart: string,
  rangeEnd: string,
) {
  const anchor = dateParts(anchorDate);
  const start = dateParts(rangeStart);
  const end = dateParts(rangeEnd);
  if (!anchor || !start || !end || rangeEnd < rangeStart || rangeEnd < anchorDate) return [];

  if (recurrence === "daily" || recurrence === "weekly") {
    const interval = recurrence === "daily" ? 1 : 7;
    const distanceToStart = Math.max(0, calendarDaysBetween(anchorDate, rangeStart) ?? 0);
    const firstOffset = Math.ceil(distanceToStart / interval) * interval;
    const dates: string[] = [];
    for (
      let candidate = shiftLocalDateKey(anchorDate, firstOffset);
      candidate <= rangeEnd;
      candidate = shiftLocalDateKey(candidate, interval)
    ) {
      if (candidate >= rangeStart) dates.push(candidate);
    }
    return dates;
  }

  if (recurrence === "monthly") {
    const anchorMonthIndex = anchor.year * 12 + anchor.month - 1;
    const startMonthIndex = start.year * 12 + start.month - 1;
    const endMonthIndex = end.year * 12 + end.month - 1;
    const dates: string[] = [];
    for (let monthIndex = Math.max(anchorMonthIndex, startMonthIndex); monthIndex <= endMonthIndex; monthIndex += 1) {
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const day = Math.min(anchor.day, daysInMonth(year, month));
      const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (candidate >= anchorDate && candidate >= rangeStart && candidate <= rangeEnd) dates.push(candidate);
    }
    return dates;
  }

  const dates: string[] = [];
  for (let year = Math.max(anchor.year, start.year); year <= end.year; year += 1) {
    const day = Math.min(anchor.day, daysInMonth(year, anchor.month));
    const candidate = `${year}-${String(anchor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate >= anchorDate && candidate >= rangeStart && candidate <= rangeEnd) dates.push(candidate);
  }
  return dates;
}

function occurrenceLabel(date: string) {
  return formatLocalDate(date, { weekday: "short", day: "numeric", month: "short" });
}

export function projectTaskOccurrences(
  tasks: readonly WorkspaceTask[],
  rangeStart: string,
  rangeEnd: string,
): TaskOccurrence[] {
  if (!isLocalDateKey(rangeStart) || !isLocalDateKey(rangeEnd) || rangeEnd < rangeStart) return [];
  const occurrences: TaskOccurrence[] = [];

  for (const task of tasks) {
    const anchorDate = task.calendarDate;
    if (!anchorDate || !isLocalDateKey(anchorDate)) continue;
    const recurrence = task.schedule?.recurrence;
    const dates = recurrence
      ? recurrenceDates(anchorDate, recurrence, rangeStart, rangeEnd)
      : anchorDate >= rangeStart && anchorDate <= rangeEnd
        ? [anchorDate]
        : [];

    for (const date of dates) {
      const virtual = date !== anchorDate;
      const key = occurrenceKey(task.id, date);
      const completedDates = task.schedule?.completedDates ?? [];
      occurrences.push({
        ...task,
        id: virtual ? syntheticOccurrenceId(key) : task.id,
        calendarDate: date,
        date: occurrenceLabel(date),
        time: task.schedule?.allDay ? undefined : task.schedule?.startTime || task.time,
        endTime: task.schedule?.allDay ? undefined : task.schedule?.endTime ?? task.endTime,
        done: virtual ? completedDates.includes(date) : task.done || completedDates.includes(date),
        occurrence: {
          key,
          sourceTaskId: task.id,
          date,
          virtual,
        },
      });
    }
  }

  return occurrences.sort((left, right) => (
    left.calendarDate.localeCompare(right.calendarDate)
    || (left.time ?? "").localeCompare(right.time ?? "")
    || left.occurrence.key.localeCompare(right.occurrence.key)
  ));
}

export function isTaskOccurrence(task: WorkspaceTask): task is TaskOccurrence {
  const value = task as Partial<TaskOccurrence>;
  return Boolean(
    value.occurrence
    && typeof value.occurrence.key === "string"
    && typeof value.occurrence.sourceTaskId === "number"
    && isLocalDateKey(value.occurrence.date),
  );
}

export function setTaskOccurrenceCompletion(
  sourceTask: WorkspaceTask,
  occurrenceDate: string,
  done: boolean,
): WorkspaceTask {
  if (!sourceTask.schedule?.recurrence || occurrenceDate === sourceTask.calendarDate) {
    return setTaskDoneState(sourceTask, done);
  }
  const completedDates = new Set(sourceTask.schedule.completedDates ?? []);
  const completedAtByDate = { ...(sourceTask.schedule.completedAtByDate ?? {}) };
  if (done) completedDates.add(occurrenceDate);
  else completedDates.delete(occurrenceDate);
  if (done) completedAtByDate[occurrenceDate] = new Date().toISOString();
  else delete completedAtByDate[occurrenceDate];
  return {
    ...sourceTask,
    schedule: {
      ...sourceTask.schedule,
      completedDates: [...completedDates].filter(isLocalDateKey).sort(),
      completedAtByDate: Object.keys(completedAtByDate).length ? completedAtByDate : undefined,
    },
  };
}

function currentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function supportedTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return currentTimezone();
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function partsAtInstant(timestamp: number, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function partsEpoch(parts: ZonedParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/**
 * Converts a wall-clock date in an IANA timezone to an instant. On a spring DST
 * gap, a nonexistent time is moved forward by the size of the gap. On an
 * autumn overlap, the earlier matching instant is selected.
 */
export function taskStartInstant(date: string, time: string, timezone: string): Date | null {
  const parsedDate = dateParts(date);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!parsedDate || !match) return null;
  const zone = supportedTimezone(timezone);
  const desired: ZonedParts = {
    ...parsedDate,
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
  const desiredEpoch = partsEpoch(desired);
  const offsets = new Set<number>();
  for (const probe of [desiredEpoch - DAY_MS, desiredEpoch, desiredEpoch + DAY_MS]) {
    offsets.add(partsEpoch(partsAtInstant(probe, zone)) - probe);
  }

  const candidates = [...offsets]
    .map((offset) => desiredEpoch - offset)
    .sort((left, right) => left - right);
  const exact = candidates.find((candidate) => partsEpoch(partsAtInstant(candidate, zone)) === desiredEpoch);
  if (exact !== undefined) return new Date(exact);

  const afterGap = candidates
    .map((candidate) => ({ candidate, wallClock: partsEpoch(partsAtInstant(candidate, zone)) }))
    .filter(({ wallClock }) => wallClock > desiredEpoch)
    .sort((left, right) => left.wallClock - right.wallClock)[0];
  if (afterGap) return new Date(afterGap.candidate);

  return candidates.length ? new Date(candidates[0]) : null;
}

export function dueTaskReminders(
  tasks: readonly WorkspaceTask[],
  fromExclusive: Date,
  throughInclusive: Date,
): DueTaskReminder[] {
  if (
    Number.isNaN(fromExclusive.getTime())
    || Number.isNaN(throughInclusive.getTime())
    || throughInclusive <= fromExclusive
  ) return [];

  const maximumReminder = Math.min(
    10_080,
    Math.max(0, ...tasks.map((task) => task.schedule?.reminderMinutes ?? 0)),
  );
  // The two-day margin covers timezones at both sides of the date line.
  const rangeStart = toLocalDateKey(new Date(fromExclusive.getTime() - 2 * DAY_MS));
  const rangeEnd = toLocalDateKey(new Date(throughInclusive.getTime() + (maximumReminder * MINUTE_MS) + 2 * DAY_MS));

  return projectTaskOccurrences(tasks, rangeStart, rangeEnd)
    .filter((occurrence) => {
      const schedule = occurrence.schedule;
      return !occurrence.deleted
        && !occurrence.done
        && Boolean(schedule)
        && !schedule!.allDay
        && schedule!.reminderMinutes !== undefined;
    })
    .map((occurrence) => {
      const schedule = occurrence.schedule!;
      const startsAt = taskStartInstant(
        occurrence.calendarDate,
        schedule.startTime,
        schedule.timezone,
      );
      if (!startsAt) return null;
      const triggersAt = new Date(startsAt.getTime() - schedule.reminderMinutes! * MINUTE_MS);
      if (triggersAt <= fromExclusive || triggersAt > throughInclusive) return null;
      return {
        key: `${occurrence.occurrence.key}:reminder:${schedule.reminderMinutes}`,
        taskId: occurrence.occurrence.sourceTaskId,
        taskText: occurrence.text,
        occurrenceDate: occurrence.calendarDate,
        startsAt,
        triggersAt,
      } satisfies DueTaskReminder;
    })
    .filter((reminder): reminder is DueTaskReminder => reminder !== null)
    .sort((left, right) => left.triggersAt.getTime() - right.triggersAt.getTime());
}
