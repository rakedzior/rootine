export type SportPersistenceMode = "debounced" | "immediate";

export type SportPersistenceQueue<T> = {
  schedule: (value: T, mode?: SportPersistenceMode) => boolean;
  flush: () => boolean;
  hasPending: () => boolean;
  cancel: () => void;
};

type TimerAdapter = {
  set: (callback: () => void, delay: number) => number;
  clear: (timer: number) => void;
};

function browserTimers(): TimerAdapter {
  return {
    set: (callback, delay) => window.setTimeout(callback, delay),
    clear: (timer) => window.clearTimeout(timer),
  };
}

export function createSportPersistenceQueue<T>(
  save: (value: T) => boolean,
  delay = 250,
  timers: TimerAdapter = browserTimers(),
): SportPersistenceQueue<T> {
  let pending: T | undefined;
  let timer: number | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    timers.clear(timer);
    timer = null;
  };

  const flush = () => {
    clearTimer();
    if (pending === undefined) return true;
    const value = pending;
    pending = undefined;
    return save(value);
  };

  const schedule = (value: T, mode: SportPersistenceMode = "debounced") => {
    pending = value;
    if (mode === "immediate") return flush();
    clearTimer();
    timer = timers.set(flush, delay);
    return true;
  };

  return {
    schedule,
    flush,
    hasPending: () => pending !== undefined,
    cancel: () => {
      clearTimer();
      pending = undefined;
    },
  };
}
