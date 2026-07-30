import {
  APP_MODULES,
  type AppModule,
  type AppModuleId,
} from "../moduleRegistry";
import {
  readLocalWorkspace,
  subscribeToLocalWorkspace,
  writeLocalWorkspace,
} from "./localRepository";

export const MODULE_PREFERENCES_STORAGE_KEY = "rootine.sidebar.modules";
const MODULE_PREFERENCES_VERSION = 1 as const;
const MODULE_PREFERENCES_CHANGE_EVENT = "rootine:module-preferences-change";

export type ModulePreferences = {
  version: typeof MODULE_PREFERENCES_VERSION;
  updatedAt: string;
  order: AppModuleId[];
  disabled: AppModuleId[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultOrder(): AppModuleId[] {
  return APP_MODULES.map((module) => module.id);
}

export function createDefaultModulePreferences(): ModulePreferences {
  return {
    version: MODULE_PREFERENCES_VERSION,
    updatedAt: new Date(0).toISOString(),
    order: defaultOrder(),
    disabled: [],
  };
}

function isModuleId(value: unknown): value is AppModuleId {
  return typeof value === "string" && APP_MODULES.some((module) => module.id === value);
}

function normalizeModulePreferences(value: unknown): ModulePreferences {
  const defaults = createDefaultModulePreferences();
  if (!isRecord(value)) return defaults;

  const savedOrder = Array.isArray(value.order)
    ? value.order.filter(isModuleId)
    : [];
  const order = [...new Set(savedOrder)];
  defaults.order.forEach((moduleId) => {
    if (!order.includes(moduleId)) order.push(moduleId);
  });

  const savedDisabled = Array.isArray(value.disabled)
    ? value.disabled.filter(isModuleId)
    : [];
  const disabled = [...new Set(savedDisabled)];

  return {
    version: MODULE_PREFERENCES_VERSION,
    updatedAt: typeof value.updatedAt === "string"
      ? value.updatedAt
      : defaults.updatedAt,
    order,
    disabled: disabled.length < order.length ? disabled : [],
  };
}

function isCurrentModulePreferences(value: unknown): value is ModulePreferences {
  if (
    !isRecord(value)
    || value.version !== MODULE_PREFERENCES_VERSION
    || typeof value.updatedAt !== "string"
    || !Array.isArray(value.order)
    || !Array.isArray(value.disabled)
    || !value.order.every(isModuleId)
    || !value.disabled.every(isModuleId)
  ) return false;

  const expectedIds = defaultOrder();
  const order = value.order as AppModuleId[];
  const disabled = value.disabled as AppModuleId[];
  return new Set(order).size === expectedIds.length
    && expectedIds.every((moduleId) => order.includes(moduleId))
    && new Set(disabled).size === disabled.length
    && disabled.length < order.length;
}

function migrateModulePreferences(value: unknown): ModulePreferences | null {
  if (!isRecord(value) || !Array.isArray(value.order) || !Array.isArray(value.disabled)) {
    return null;
  }
  return normalizeModulePreferences(value);
}

export function loadModulePreferences(): ModulePreferences {
  return readLocalWorkspace({
    key: MODULE_PREFERENCES_STORAGE_KEY,
    fallback: createDefaultModulePreferences,
    validate: isCurrentModulePreferences,
    migrate: migrateModulePreferences,
  }).workspace;
}

export function saveModulePreferences(preferences: ModulePreferences): boolean {
  const saved = writeLocalWorkspace(MODULE_PREFERENCES_STORAGE_KEY, {
    ...normalizeModulePreferences(preferences),
    updatedAt: new Date().toISOString(),
  });
  if (saved && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MODULE_PREFERENCES_CHANGE_EVENT));
  }
  return saved;
}

export function getOrderedModules(preferences: ModulePreferences): AppModule[] {
  return preferences.order
    .map((moduleId) => APP_MODULES.find((module) => module.id === moduleId))
    .filter((module): module is AppModule => Boolean(module));
}

export function getVisibleModules(preferences: ModulePreferences): AppModule[] {
  const disabled = new Set(preferences.disabled);
  return getOrderedModules(preferences).filter((module) => !disabled.has(module.id));
}

export function subscribeToModulePreferences(listener: () => void) {
  const unsubscribeWorkspace = subscribeToLocalWorkspace(MODULE_PREFERENCES_STORAGE_KEY, listener);
  if (typeof window === "undefined") return unsubscribeWorkspace;
  window.addEventListener(MODULE_PREFERENCES_CHANGE_EVENT, listener);
  return () => {
    unsubscribeWorkspace();
    window.removeEventListener(MODULE_PREFERENCES_CHANGE_EVENT, listener);
  };
}
