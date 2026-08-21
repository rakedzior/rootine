import { useEffect, type RefObject } from "react";
import { getRootineStorageItem, setRootineStorageItem } from "../data/accountStorage";

const MODULE_MEMORY_STORAGE_KEY = "rootine.module-memory.v1";
const VERSION = 1 as const;

type MemoryStore = {
  version: typeof VERSION;
  modules: Record<string, { scroll: Record<string, number>; state?: Record<string, unknown> }>;
};

const EMPTY_STORE: MemoryStore = { version: VERSION, modules: {} };

function loadStore(): MemoryStore {
  try {
    const parsed = JSON.parse(getRootineStorageItem(MODULE_MEMORY_STORAGE_KEY) ?? "null") as Partial<MemoryStore> | null;
    if (parsed?.version !== VERSION || !parsed.modules || typeof parsed.modules !== "object") return EMPTY_STORE;
    return { version: VERSION, modules: parsed.modules };
  } catch {
    return EMPTY_STORE;
  }
}

function saveStore(store: MemoryStore) {
  try {
    setRootineStorageItem(MODULE_MEMORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Scroll restoration remains an enhancement when storage is unavailable.
  }
}

function scrollKey(root: HTMLElement, element: HTMLElement) {
  const explicit = element.dataset.moduleScrollKey;
  if (explicit) return explicit;
  const className = [...element.classList].find((name) => /(?:scroll|content|list|workspace|main)/.test(name));
  const base = className ? `.${className}` : element.tagName.toLocaleLowerCase();
  const matches = Array.from(root.querySelectorAll<HTMLElement>(base));
  return matches.length > 1 ? `${base}:${Math.max(0, matches.indexOf(element))}` : base;
}

function findByKey(root: HTMLElement, key: string) {
  const explicitlyKeyed = Array.from(root.querySelectorAll<HTMLElement>("[data-module-scroll-key]"))
    .find((element) => element.dataset.moduleScrollKey === key);
  if (explicitlyKeyed) return explicitlyKeyed;
  const match = key.match(/^(.*):(\d+)$/);
  if (match) return root.querySelectorAll<HTMLElement>(match[1])[Number(match[2])] ?? null;
  try {
    return root.querySelector<HTMLElement>(key);
  } catch {
    return null;
  }
}

export function useModuleMemory(rootRef: RefObject<HTMLElement | null>, moduleKey: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const store = loadStore();
    const saved = store.modules[moduleKey]?.scroll ?? {};
    let restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        Object.entries(saved).forEach(([key, scrollTop]) => {
          const element = findByKey(root, key);
          if (element && Number.isFinite(scrollTop)) element.scrollTop = scrollTop;
        });
      });
    });
    let writeFrame = 0;
    const pending: Record<string, number> = { ...saved };
    const flush = () => {
      writeFrame = 0;
      const current = loadStore();
      saveStore({
        version: VERSION,
        modules: {
          ...current.modules,
          [moduleKey]: { ...current.modules[moduleKey], scroll: pending },
        },
      });
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;
      pending[scrollKey(root, target)] = target.scrollTop;
      if (!writeFrame) writeFrame = window.requestAnimationFrame(flush);
    };
    root.addEventListener("scroll", handleScroll, true);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (writeFrame) window.cancelAnimationFrame(writeFrame);
      flush();
      root.removeEventListener("scroll", handleScroll, true);
    };
  }, [moduleKey, rootRef]);
}

export function readModuleMemoryValue<T>(
  moduleKey: string,
  field: string,
  validate: (value: unknown) => value is T,
): T | null {
  const value = loadStore().modules[moduleKey]?.state?.[field];
  return value !== undefined && validate(value) ? value : null;
}

export function writeModuleMemoryValue(moduleKey: string, field: string, value: unknown) {
  const store = loadStore();
  const current = store.modules[moduleKey] ?? { scroll: {} };
  saveStore({
    version: VERSION,
    modules: {
      ...store.modules,
      [moduleKey]: {
        ...current,
        state: { ...current.state, [field]: value },
      },
    },
  });
}

export const MODULE_MEMORY_KEY = MODULE_MEMORY_STORAGE_KEY;
