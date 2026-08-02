import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppExperienceProviders,
  EXPERIENCE_PREFERENCES_STORAGE_KEY,
  SensitiveValue,
  useDensity,
  useMotionPreferences,
  usePrivacy,
} from "./preferences";

function PreferencesProbe() {
  const motion = useMotionPreferences();
  const density = useDensity();
  const privacy = usePrivacy();

  return (
    <div>
      <output data-testid="motion">{motion.preference}</output>
      <output data-testid="reduced">{String(motion.reduced)}</output>
      <output data-testid="density">{density.density}</output>
      <output data-testid="privacy">{String(privacy.enabled)}</output>
      <SensitiveValue placeholder="hidden">PLN 1 234</SensitiveValue>
      <button type="button" onClick={() => motion.setPreference("reduced")}>Reduce motion</button>
      <button type="button" onClick={() => density.setDensity("compact")}>Compact density</button>
      <button type="button" onClick={privacy.toggle}>Toggle privacy</button>
    </div>
  );
}

function renderPreferences() {
  return render(
    <AppExperienceProviders>
      <PreferencesProbe />
    </AppExperienceProviders>,
  );
}

function matchMedia(matches: boolean) {
  return (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

describe("AppExperienceProviders", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.motion;
    delete document.documentElement.dataset.density;
    delete document.documentElement.dataset.privacy;
    delete document.documentElement.dataset.dayPhase;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["missing data", null],
    ["malformed JSON", "{broken"],
    ["an unsupported version", JSON.stringify({ version: 2, motion: "reduced", density: "compact", privacy: true })],
  ])("falls back to safe defaults for %s", async (_case, raw) => {
    if (raw !== null) window.localStorage.setItem(EXPERIENCE_PREFERENCES_STORAGE_KEY, raw);

    renderPreferences();

    expect(screen.getByTestId("motion")).toHaveTextContent("system");
    expect(screen.getByTestId("density")).toHaveTextContent("standard");
    expect(screen.getByTestId("privacy")).toHaveTextContent("false");
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-motion", "full");
      expect(document.documentElement).toHaveAttribute("data-density", "standard");
      expect(document.documentElement).toHaveAttribute("data-privacy", "off");
    });
  });

  it("sanitizes invalid enum values without discarding valid privacy choices", async () => {
    window.localStorage.setItem(EXPERIENCE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: 1,
      motion: "cinematic",
      density: "tiny",
      privacy: true,
    }));

    renderPreferences();

    expect(screen.getByTestId("motion")).toHaveTextContent("system");
    expect(screen.getByTestId("density")).toHaveTextContent("standard");
    expect(screen.getByTestId("privacy")).toHaveTextContent("true");
    expect(screen.queryByText("PLN 1 234")).not.toBeInTheDocument();
    expect(screen.getByText("hidden")).toHaveAccessibleName(/ukryta/);
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-privacy", "on");
    });
  });

  it("updates datasets and persists user-controlled settings", async () => {
    renderPreferences();

    fireEvent.click(screen.getByRole("button", { name: "Reduce motion" }));
    fireEvent.click(screen.getByRole("button", { name: "Compact density" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle privacy" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
      expect(document.documentElement).toHaveAttribute("data-density", "compact");
      expect(document.documentElement).toHaveAttribute("data-privacy", "on");
    });
    expect(JSON.parse(window.localStorage.getItem(EXPERIENCE_PREFERENCES_STORAGE_KEY) ?? "{}")).toEqual({
      version: 1,
      motion: "reduced",
      density: "compact",
      privacy: true,
    });
  });

  it("toggles Privacy Mode with Ctrl+Shift+P and ignores the unmodified key", async () => {
    renderPreferences();

    fireEvent.keyDown(document, { key: "p" });
    expect(screen.getByTestId("privacy")).toHaveTextContent("false");

    fireEvent.keyDown(document, { key: "P", ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId("privacy")).toHaveTextContent("true");
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-privacy", "on");
    });
  });

  it("honors the operating-system reduced-motion preference in system mode", () => {
    vi.stubGlobal("matchMedia", matchMedia(true));

    renderPreferences();

    expect(screen.getByTestId("motion")).toHaveTextContent("system");
    expect(screen.getByTestId("reduced")).toHaveTextContent("true");
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });
});
