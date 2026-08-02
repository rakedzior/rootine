export const APP_THEMES = [
  {
    id: "olive-walnut-ivory",
    name: "Olive · Walnut · Ivory",
    description: "Organiczny, ciepły i spokojny",
    scheme: "dark",
    swatches: ["#73734a", "#4a2f1f", "#eee3ca"],
  },
  {
    id: "deep-teal-smoked-oak-pearl",
    name: "Deep Teal · Smoked Oak · Pearl",
    description: "Głęboki, elegancki i skupiony",
    scheme: "dark",
    swatches: ["#315f62", "#3a2c25", "#e8dfcf"],
  },
  {
    id: "onyx-ebony-stone",
    name: "Onyx · Ebony · Stone",
    description: "Minimalistyczny, neutralny i precyzyjny",
    scheme: "dark",
    swatches: ["#20201f", "#10100f", "#c8bca9"],
  },
  {
    id: "putty-natural-oak-calacatta",
    name: "Putty · Natural Oak · Calacatta",
    description: "Jasny, miękki i naturalny",
    scheme: "light",
    swatches: ["#b8aa94", "#b88e5f", "#f2eadb"],
  },
  {
    id: "burgundy-soft-ivory",
    name: "Burgundy · Soft Ivory",
    description: "Nastrojowy, szlachetny i ciepły",
    scheme: "dark",
    swatches: ["#641f2b", "#34231e", "#eee3d0"],
  },
] as const;

export type AppThemeId = typeof APP_THEMES[number]["id"];

export const DEFAULT_APP_THEME_ID: AppThemeId = "onyx-ebony-stone";
export const APP_THEME_STORAGE_KEY = "rootine.appearance.theme";

export function isAppThemeId(value: string | null): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function loadAppTheme(): AppThemeId {
  if (typeof window === "undefined") return DEFAULT_APP_THEME_ID;

  try {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isAppThemeId(storedTheme) ? storedTheme : DEFAULT_APP_THEME_ID;
  } catch {
    return DEFAULT_APP_THEME_ID;
  }
}

export function applyAppTheme(themeId: AppThemeId, persist = true) {
  if (typeof document !== "undefined") {
    const theme = APP_THEMES.find((candidate) => candidate.id === themeId);
    document.documentElement.dataset.theme = themeId;
    document.documentElement.style.colorScheme = theme?.scheme ?? "dark";
  }

  if (!persist || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
  } catch {
    // Appearance still changes for this session when local storage is unavailable.
  }
}

export function initializeAppTheme() {
  const themeId = loadAppTheme();
  applyAppTheme(themeId, false);
  return themeId;
}
