export const APP_THEMES = [
  {
    id: "rootine-cobalt",
    name: "Rootine Midnight Instrument",
    description: "Neutralny grafit z precyzyjnym, kobaltowym światłem",
    role: "Domyślny · ciemny",
    scheme: "dark",
  },
  {
    id: "rootine-mineral-noir",
    name: "Rootine Mineral Noir",
    description: "Matowy onyks z dyskretnym mineralnym żyłkowaniem",
    role: "Opcjonalny · ciemny",
    scheme: "dark",
  },
  {
    id: "rootine-graphite-sea-glass",
    name: "Rootine Graphite Sea Glass",
    description: "Neutralny grafit z dyskretnym morskim akcentem",
    role: "Opcjonalny · ciemny",
    scheme: "dark",
  },
  {
    id: "rootine-warm-linen",
    name: "Rootine Warm Linen",
    description: "Ciepły, naturalny i spokojny",
    role: "Oficjalny · jasny",
    scheme: "light",
  },
  {
    id: "rootine-burgundy",
    name: "Rootine Burgundy",
    description: "Nastrojowy i bardziej wyrazisty",
    role: "Opcjonalny · ciemny",
    scheme: "dark",
  },
  {
    id: "rootine-olive",
    name: "Rootine Olive",
    description: "Organiczny, miękki i skupiony",
    role: "Opcjonalny · ciemny",
    scheme: "dark",
  },
] as const;

export type AppThemeId = typeof APP_THEMES[number]["id"];
export type AppThemePreference = AppThemeId | "system";

export const DEFAULT_APP_THEME_ID: AppThemeId = "rootine-cobalt";
export const LIGHT_APP_THEME_ID: AppThemeId = "rootine-warm-linen";
export const APP_THEME_STORAGE_KEY = "rootine.appearance.theme";

const LEGACY_THEME_MIGRATIONS: Record<string, AppThemeId> = {
  "olive-walnut-ivory": "rootine-olive",
  "deep-teal-smoked-oak-pearl": "rootine-graphite-sea-glass",
  "onyx-ebony-stone": "rootine-cobalt",
  "putty-natural-oak-calacatta": "rootine-warm-linen",
  "burgundy-soft-ivory": "rootine-burgundy",
};

export function isAppThemeId(value: string | null): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function isAppThemePreference(value: string | null): value is AppThemePreference {
  return value === "system" || isAppThemeId(value);
}

function getSystemThemeId(): AppThemeId {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return DEFAULT_APP_THEME_ID;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? LIGHT_APP_THEME_ID
    : DEFAULT_APP_THEME_ID;
}

export function resolveAppTheme(preference: AppThemePreference): AppThemeId {
  return preference === "system" ? getSystemThemeId() : preference;
}

export function loadAppTheme(): AppThemePreference {
  if (typeof window === "undefined") return DEFAULT_APP_THEME_ID;

  try {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (isAppThemePreference(storedTheme)) return storedTheme;

    const migratedTheme = storedTheme ? LEGACY_THEME_MIGRATIONS[storedTheme] : undefined;
    if (migratedTheme) {
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, migratedTheme);
      return migratedTheme;
    }

    return DEFAULT_APP_THEME_ID;
  } catch {
    return DEFAULT_APP_THEME_ID;
  }
}

export function applyAppTheme(preference: AppThemePreference, persist = true) {
  const themeId = resolveAppTheme(preference);

  if (typeof document !== "undefined") {
    const theme = APP_THEMES.find((candidate) => candidate.id === themeId);
    document.documentElement.dataset.theme = themeId;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme?.scheme ?? "dark";
  }

  if (!persist || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, preference);
  } catch {
    // Appearance still changes for this session when local storage is unavailable.
  }
}

export function subscribeToSystemTheme(preference: AppThemePreference) {
  if (
    preference !== "system"
    || typeof window === "undefined"
    || typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const updateTheme = () => applyAppTheme("system", false);
  mediaQuery.addEventListener("change", updateTheme);
  return () => mediaQuery.removeEventListener("change", updateTheme);
}

export function initializeAppTheme() {
  const preference = loadAppTheme();
  applyAppTheme(preference, false);
  return preference;
}
