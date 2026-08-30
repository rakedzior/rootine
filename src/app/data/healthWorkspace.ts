import {
  readLocalWorkspace,
  writeLocalWorkspace,
  type LocalLoadResult,
} from "./localRepository";

export type HealthEntryKind = "appointment" | "examination" | "prescription" | "vaccination" | "other";
export type HealthEntryStatus = "open" | "done";

export type HealthEntry = {
  id: string;
  title: string;
  kind: HealthEntryKind;
  dueDate: string;
  time: string;
  location: string;
  note: string;
  status: HealthEntryStatus;
  createdAt: string;
};

export type HealthWorkspace = {
  version: 1;
  entries: HealthEntry[];
  updatedAt: string;
  /** Optional cross-platform fields written by the native energy surface. */
  checkIns?: Record<string, { date: string; energy: number; note?: string | null; updatedAt: string }>;
  reminders?: Array<{ id: string; title: string; detail: string; completedDates: string[] }>;
};

export const HEALTH_STORAGE_KEY = "rootine.health.workspace.v1";

export const HEALTH_ENTRY_KIND_LABELS: Record<HealthEntryKind, string> = {
  appointment: "Wizyta",
  examination: "Badanie",
  prescription: "Recepta",
  vaccination: "Szczepienie",
  other: "Inne",
};

function isoDateOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestamp() {
  return new Date().toISOString();
}

function isHealthEntryKind(value: unknown): value is HealthEntryKind {
  return ["appointment", "examination", "prescription", "vaccination", "other"].includes(String(value));
}

function isHealthEntry(value: unknown): value is HealthEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HealthEntry>;
  return typeof entry.id === "string"
    && typeof entry.title === "string"
    && entry.title.trim().length > 0
    && isHealthEntryKind(entry.kind)
    && typeof entry.dueDate === "string"
    && typeof entry.time === "string"
    && typeof entry.location === "string"
    && typeof entry.note === "string"
    && ["open", "done"].includes(String(entry.status))
    && typeof entry.createdAt === "string";
}

export function isHealthWorkspace(value: unknown): value is HealthWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<HealthWorkspace>;
  return workspace.version === 1
    && Array.isArray(workspace.entries)
    && workspace.entries.every(isHealthEntry)
    && typeof workspace.updatedAt === "string"
    && (workspace.checkIns === undefined || (
      typeof workspace.checkIns === "object"
      && workspace.checkIns !== null
      && !Array.isArray(workspace.checkIns)
      && Object.values(workspace.checkIns).every((checkIn) => (
        typeof checkIn === "object"
        && checkIn !== null
        && typeof checkIn.date === "string"
        && Number.isInteger(checkIn.energy)
        && checkIn.energy >= 1
        && checkIn.energy <= 4
        && (checkIn.note === undefined || checkIn.note === null || typeof checkIn.note === "string")
        && typeof checkIn.updatedAt === "string"
      ))
    ))
    && (workspace.reminders === undefined || (
      Array.isArray(workspace.reminders)
      && workspace.reminders.every((reminder) => (
        typeof reminder === "object"
        && reminder !== null
        && typeof reminder.id === "string"
        && typeof reminder.title === "string"
        && typeof reminder.detail === "string"
        && Array.isArray(reminder.completedDates)
        && reminder.completedDates.every((date) => typeof date === "string")
      ))
    ));
}

export function createDefaultHealthWorkspace(): HealthWorkspace {
  const createdAt = timestamp();
  return {
    version: 1,
    updatedAt: createdAt,
    entries: [
      {
        id: "health-dentist",
        title: "Wizyta kontrolna u dentysty",
        kind: "appointment",
        dueDate: isoDateOffset(14),
        time: "09:30",
        location: "Gabinet przychodni",
        note: "Zabrać aktualne zdjęcie RTG.",
        status: "open",
        createdAt,
      },
      {
        id: "health-bloodwork",
        title: "Badanie krwi",
        kind: "examination",
        dueDate: isoDateOffset(28),
        time: "07:45",
        location: "Punkt pobrań",
        note: "Sprawdzić, czy potrzebne jest skierowanie.",
        status: "open",
        createdAt,
      },
      {
        id: "health-prescription",
        title: "Odnowić receptę",
        kind: "prescription",
        dueDate: isoDateOffset(6),
        time: "",
        location: "",
        note: "Skontaktować się z przychodnią przed końcem opakowania.",
        status: "open",
        createdAt,
      },
      {
        id: "health-vaccination",
        title: "Przypomnienie o szczepieniu",
        kind: "vaccination",
        dueDate: isoDateOffset(90),
        time: "",
        location: "Przychodnia",
        note: "Sprawdzić termin kolejnej dawki.",
        status: "open",
        createdAt,
      },
    ],
  };
}

export function createEmptyHealthWorkspace(): HealthWorkspace {
  return {
    version: 1,
    entries: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function loadHealthWorkspaceResult(): LocalLoadResult<HealthWorkspace> {
  return readLocalWorkspace({
    key: HEALTH_STORAGE_KEY,
    fallback: createEmptyHealthWorkspace,
    validate: isHealthWorkspace,
  });
}

export function loadHealthWorkspace(): HealthWorkspace {
  return loadHealthWorkspaceResult().workspace;
}

export function saveHealthWorkspace(workspace: HealthWorkspace): boolean {
  return isHealthWorkspace(workspace) && writeLocalWorkspace(HEALTH_STORAGE_KEY, {
    ...workspace,
    updatedAt: timestamp(),
  });
}

export function createHealthEntryId() {
  return `health-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function setHealthEntryCompletionState(
  workspace: HealthWorkspace,
  entryId: string,
  done: boolean,
): HealthWorkspace {
  return {
    ...workspace,
    entries: workspace.entries.map((entry) => entry.id === entryId
      ? { ...entry, status: done ? "done" : "open" }
      : entry),
  };
}
