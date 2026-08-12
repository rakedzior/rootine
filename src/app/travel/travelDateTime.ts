export interface LocalDateTimeParts {
  date: string;
  time: string;
}

export function splitLocalDateTime(value: string): LocalDateTimeParts {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? { date: match[1], time: match[2] } : { date: "", time: "" };
}

export function joinLocalDateTime(date: string, time: string) {
  return date && time ? `${date}T${time}` : "";
}

export function clampTimeToDateRange(date: string, time: string, min?: string, max?: string) {
  const minimum = splitLocalDateTime(min ?? "");
  const maximum = splitLocalDateTime(max ?? "");
  let nextTime = time || (date === minimum.date && minimum.time ? minimum.time : "00:00");

  if (date === minimum.date && minimum.time && nextTime < minimum.time) nextTime = minimum.time;
  if (date === maximum.date && maximum.time && nextTime > maximum.time) nextTime = maximum.time;
  return nextTime;
}
