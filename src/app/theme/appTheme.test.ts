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
    document.documentElement.style.colorScheme = "";
  });

  it("uses the onyx palette when no valid preference exists", () => {
    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME_ID);

    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "unknown-theme");
    expect(loadAppTheme()).toBe(DEFAULT_APP_THEME_ID);
  });

  it("applies and persists a selected theme", () => {
    applyAppTheme("putty-natural-oak-calacatta");

    expect(document.documentElement.dataset.theme).toBe("putty-natural-oak-calacatta");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("putty-natural-oak-calacatta");
    expect(loadAppTheme()).toBe("putty-natural-oak-calacatta");
  });
});
