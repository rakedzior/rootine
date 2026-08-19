import "@testing-library/jest-dom/vitest";

const memoryStorageValues = new WeakMap<object, Map<string, string>>();

function installMemoryStoragePrototype() {
  const storagePrototype = window.Storage?.prototype;
  if (!storagePrototype || memoryStorageValues.has(storagePrototype)) return storagePrototype;

  memoryStorageValues.set(storagePrototype, new Map());
  const valuesFor = (storage: object) => {
    const values = memoryStorageValues.get(storage);
    if (values) return values;
    const created = new Map<string, string>();
    memoryStorageValues.set(storage, created);
    return created;
  };

  Object.defineProperties(storagePrototype, {
    clear: {
      configurable: true,
      value(this: object) {
        valuesFor(this).clear();
      },
    },
    getItem: {
      configurable: true,
      value(this: object, key: string) {
        return valuesFor(this).get(String(key)) ?? null;
      },
    },
    key: {
      configurable: true,
      value(this: object, index: number) {
        return [...valuesFor(this).keys()][index] ?? null;
      },
    },
    removeItem: {
      configurable: true,
      value(this: object, key: string) {
        valuesFor(this).delete(String(key));
      },
    },
    setItem: {
      configurable: true,
      value(this: object, key: string, value: string) {
        valuesFor(this).set(String(key), String(value));
      },
    },
    length: {
      configurable: true,
      get(this: object) {
        return valuesFor(this).size;
      },
    },
  });

  return storagePrototype;
}

function createMemoryStorage(): Storage {
  const storagePrototype = installMemoryStoragePrototype();
  if (storagePrototype) return Object.create(storagePrototype) as Storage;

  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(String(key)) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(String(key)); },
    setItem(key: string, value: string) { values.set(String(key), String(value)); },
  };
}

if (typeof window !== "undefined") {
  if (typeof window.localStorage === "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  }

  if (typeof window.sessionStorage === "undefined") {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  }
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
