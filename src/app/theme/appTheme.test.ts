import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME_ID,
  applyAppTheme,
  loadAppTheme,
} from "./appTheme";

describe("app theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    document.documentElement.style.colorScheme = "";
  });

  it("uses Midnight Instrument when no valid preference exists", () => {
    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME_ID);

    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "unknown-theme");
    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME_ID);
  });

  it("applies and persists a selected theme", () => {
    applyAppTheme("rootine-warm-linen");

    expect(document.documentElement.dataset.theme).toBe("rootine-warm-linen");
    expect(document.documentElement.dataset.themePreference).toBe("rootine-warm-linen");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("rootine-warm-linen");
    expect(loadAppTheme()).toBe("rootine-warm-linen");
  });

  it("migrates a removed theme to the remaining dark theme", () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "deep-teal-smoked-oak-pearl");

    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME_ID);
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe(DEFAULT_APP_THEME_ID);
  });

  it("supports a system preference without making it the product default", () => {
    applyAppTheme("system");

    expect(document.documentElement.dataset.theme).toBe("rootine-cobalt");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("system");
  });
});
