/* eslint-disable react-refresh/only-export-components -- Preference selectors stay beside their independent contexts to keep the public API coherent. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const EXPERIENCE_STORAGE_KEY = "rootine.experience.preferences.v1";
const EXPERIENCE_VERSION = 1 as const;

export type MotionPreference = "system" | "full" | "reduced";
export type DensityPreference = "calm" | "standard" | "compact";

type ExperiencePreferences = {
  version: typeof EXPERIENCE_VERSION;
  motion: MotionPreference;
  density: DensityPreference;
  privacy: boolean;
};

const DEFAULT_PREFERENCES: ExperiencePreferences = {
  version: EXPERIENCE_VERSION,
  motion: "system",
  density: "standard",
  privacy: false,
};

type MotionContextValue = {
  preference: MotionPreference;
  reduced: boolean;
  setPreference: (value: MotionPreference) => void;
};

type PrivacyContextValue = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
};

type DensityContextValue = {
  density: DensityPreference;
  setDensity: (value: DensityPreference) => void;
};

const MotionContext = createContext<MotionContextValue | null>(null);
const PrivacyContext = createContext<PrivacyContextValue | null>(null);
const DensityContext = createContext<DensityContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function loadPreferences(): ExperiencePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(EXPERIENCE_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== EXPERIENCE_VERSION) return DEFAULT_PREFERENCES;
    return {
      version: EXPERIENCE_VERSION,
      motion: ["system", "full", "reduced"].includes(String(value.motion))
        ? value.motion as MotionPreference
        : DEFAULT_PREFERENCES.motion,
      density: ["calm", "standard", "compact"].includes(String(value.density))
        ? value.density as DensityPreference
        : DEFAULT_PREFERENCES.density,
      privacy: typeof value.privacy === "boolean" ? value.privacy : DEFAULT_PREFERENCES.privacy,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function getDayPhase(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 18 || hour < 5) return "evening";
  return "day";
}

export function AppExperienceProviders({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [systemReduced, setSystemReduced] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const reduced = preferences.motion === "reduced"
    || (preferences.motion === "system" && systemReduced);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? "reduced" : "full";
    root.dataset.density = preferences.density;
    root.dataset.privacy = preferences.privacy ? "on" : "off";
    if (!root.dataset.dayPhase) root.dataset.dayPhase = getDayPhase();
    try {
      window.localStorage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences are progressive enhancement; the session remains fully usable.
    }
  }, [preferences, reduced]);

  const setMotion = useCallback((motion: MotionPreference) => {
    setPreferences((current) => ({ ...current, motion }));
  }, []);
  const setDensity = useCallback((density: DensityPreference) => {
    setPreferences((current) => ({ ...current, density }));
  }, []);
  const setPrivacy = useCallback((privacy: boolean) => {
    setPreferences((current) => ({ ...current, privacy }));
  }, []);
  const togglePrivacy = useCallback(() => {
    setPreferences((current) => ({ ...current, privacy: !current.privacy }));
  }, []);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      togglePrivacy();
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [togglePrivacy]);

  const motionValue = useMemo<MotionContextValue>(() => ({
    preference: preferences.motion,
    reduced,
    setPreference: setMotion,
  }), [preferences.motion, reduced, setMotion]);
  const privacyValue = useMemo<PrivacyContextValue>(() => ({
    enabled: preferences.privacy,
    setEnabled: setPrivacy,
    toggle: togglePrivacy,
  }), [preferences.privacy, setPrivacy, togglePrivacy]);
  const densityValue = useMemo<DensityContextValue>(() => ({
    density: preferences.density,
    setDensity,
  }), [preferences.density, setDensity]);
  return (
    <MotionContext.Provider value={motionValue}>
      <PrivacyContext.Provider value={privacyValue}>
        <DensityContext.Provider value={densityValue}>
          {children}
        </DensityContext.Provider>
      </PrivacyContext.Provider>
    </MotionContext.Provider>
  );
}

export function useMotionPreferences() {
  const value = useContext(MotionContext);
  if (!value) throw new Error("useMotionPreferences must be used inside AppExperienceProviders");
  return value;
}

export function usePrivacy() {
  const value = useContext(PrivacyContext);
  if (!value) throw new Error("usePrivacy must be used inside AppExperienceProviders");
  return value;
}

export function useDensity() {
  const value = useContext(DensityContext);
  if (!value) throw new Error("useDensity must be used inside AppExperienceProviders");
  return value;
}

export function SensitiveValue({
  children,
  placeholder = "••••",
  label = "Wartość prywatna",
  className = "",
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  label?: string;
  className?: string;
}) {
  const { enabled } = usePrivacy();
  return (
    <span className={`rootine-sensitive-value${enabled ? " is-hidden" : ""}${className ? ` ${className}` : ""}`}>
      {enabled ? <span aria-label={`${label} ukryta`}>{placeholder}</span> : children}
    </span>
  );
}

export function ExperienceSettings({ compact = false }: { compact?: boolean }) {
  const motion = useMotionPreferences();
  const privacy = usePrivacy();
  const density = useDensity();

  return (
    <section className={`experience-settings${compact ? " is-compact" : ""}`} aria-labelledby={`experience-settings-title${compact ? "-compact" : ""}`}>
      <div className="experience-settings__heading">
        <strong id={`experience-settings-title${compact ? "-compact" : ""}`}>Komfort pracy</strong>
        <small>Ruch, gęstość i prywatność są zapisywane lokalnie.</small>
      </div>
      <label>
        <span>Ruch</span>
        <select value={motion.preference} onChange={(event) => motion.setPreference(event.target.value as MotionPreference)}>
          <option value="system">Zgodnie z systemem</option>
          <option value="full">Pełny</option>
          <option value="reduced">Ograniczony</option>
        </select>
      </label>
      <label>
        <span>Gęstość</span>
        <select value={density.density} onChange={(event) => density.setDensity(event.target.value as DensityPreference)}>
          <option value="calm">Calm</option>
          <option value="standard">Standard</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label className="experience-settings__toggle">
        <input type="checkbox" checked={privacy.enabled} onChange={(event) => privacy.setEnabled(event.target.checked)} />
        <span>Privacy Mode <kbd>Ctrl ⇧ P</kbd></span>
      </label>
    </section>
  );
}

export const EXPERIENCE_PREFERENCES_STORAGE_KEY = EXPERIENCE_STORAGE_KEY;
