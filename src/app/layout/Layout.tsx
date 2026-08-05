import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  AudioLines,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  Keyboard,
  Search,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  SunMedium,
  UserRound,
  EyeOff,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createDefaultModulePreferences,
  getOrderedModules,
  getVisibleModules,
  loadModulePreferences,
  saveModulePreferences,
  subscribeToModulePreferences,
  type ModulePreferences,
} from "../data/modulePreferences";
import {
  getTodayWeatherLabel,
  loadTodayWeather,
  TODAY_WEATHER_LOCATION,
  type TodayWeather,
} from "../data/todayWeather";
import { toLocalDateKey } from "../data/localDate";
import {
  listLocalPersistenceIssues,
  subscribeToLocalPersistenceIssues,
} from "../data/localRepository";
import {
  APP_MODULES,
  findModuleForPath,
  isModulePath,
  type AppModule,
} from "../moduleRegistry";
import { RecoveryCenterButton } from "../recovery/RecoveryCenter";
import { RouteLoadingState } from "../RouteStates";
import { Modal } from "../ui";
import { maxWidthQuery } from "../ui/breakpoints";
import {
  applyAppTheme,
  loadAppTheme,
  subscribeToSystemTheme,
  type AppThemePreference,
} from "../theme/appTheme";
import { ThemeSettings } from "./ThemeSettings";
import { useActiveArea } from "../experience/activeArea";
import {
  ExperienceSettings,
  usePrivacy,
} from "../experience/preferences";
import { RouteTransition } from "../experience/transitions";
import { readModuleMemoryValue, writeModuleMemoryValue } from "../experience/moduleMemory";
import { useAssistantSettings } from "../../assistant/config/useAssistantSettings";
import { useAssistant } from "../../assistant/runtime/useAssistant";
import { AssistantEntryButton } from "../../assistant/ui/AssistantEntryButton";
import type { AssistantStageStatus } from "../../assistant/ui/AssistantStage";

const SIDEBAR_STORAGE_KEY = "rootine.sidebar.collapsed";
const LEGACY_SIDEBAR_STORAGE_KEY = "routine.sidebar.collapsed";

const CommandCenter = lazy(() => import("../experience/CommandCenter")
  .then((module) => ({ default: module.CommandCenter })));
const DayReplay = lazy(() => import("../experience/DayReplay")
  .then((module) => ({ default: module.DayReplay })));
const AssistantSettingsPanel = lazy(() => import("../../assistant/settings/AssistantSettingsPanel")
  .then((module) => ({ default: module.AssistantSettingsPanel })));
const AssistantStage = lazy(() => import("../../assistant/ui/AssistantStage")
  .then((module) => ({ default: module.AssistantStage })));
const AssistantUndoToast = lazy(() => import("../../assistant/ui/AssistantUndoToast")
  .then((module) => ({ default: module.AssistantUndoToast })));

type WeatherState =
  | { status: "loading" }
  | { status: "ready"; data: TodayWeather }
  | { status: "error"; message: string };

type OpenMenu = "settings" | "profile" | "mobileMore" | "mobileSettings" | "mobileProfile" | null;

const TRANSIENT_COMMAND_PARAMS = ["akcja", "tytul", "data", "godzina", "priorytet"] as const;

function rememberedModuleLocation(item: AppModule) {
  return readModuleMemoryValue(
    item.id,
    "location",
    (value): value is string => {
      if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
      const pathname = value.split(/[?#]/, 1)[0];
      return isModulePath(item, pathname);
    },
  );
}

const MOBILE_MENU_FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TIME_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const HELP_GUIDES = {
  today: {
    title: "Dzisiaj",
    steps: ["Sprawdź pogodę, plan dnia i najważniejsze wskaźniki.", "Uporządkuj zaległe sprawy, zanim dodasz nowe.", "Wybierz jeden priorytet i przejdź do właściwego modułu."],
  },
  tasks: {
    title: "Zadania",
    steps: ["Dodaj zadanie i od razu ustaw termin, listę lub priorytet.", "Filtruj po dacie, liście albo tagu — nie musisz pamiętać, gdzie zadanie trafiło.", "Użyj „Wybierz”, aby grupowo zakończyć, przełożyć lub usunąć zadania; operację możesz cofnąć."],
  },
  calendar: {
    title: "Kalendarz",
    steps: ["Zmień miesiąc strzałkami lub wróć przyciskiem „Dziś”.", "Wybierz dzień, aby zobaczyć jego zadania i wolne miejsce.", "Przeciągnij zadanie albo użyj Alt + strzałka, by zmienić termin."],
  },
  nutrition: {
    title: "Odżywianie",
    steps: ["Wybierz dzień i sprawdź bilans kalorii oraz makro.", "Dodaj produkt do właściwego posiłku i podaj rzeczywistą porcję.", "Porównaj dzień z celem; usunięty wpis możesz od razu przywrócić."],
  },
  sport: {
    title: "Sport",
    steps: ["Zaplanuj tydzień, rozkładając mocne i lekkie jednostki.", "Uruchom sesję i zapisuj serie lub czas bez opuszczania treningu.", "Po treningu sprawdź historię, analizę i gotowość do regeneracji."],
  },
  work: {
    title: "Praca",
    steps: ["Wybierz firmę, a potem projekt, nad którym teraz pracujesz.", "Dodaj następne konkretne zadanie i przypisz odpowiedzialność.", "Aktualizuj postęp projektu; ostatnią zmianę ukończenia możesz cofnąć."],
  },
  goals: {
    title: "Cele",
    steps: ["Zapisz mierzalny rezultat i realny termin.", "Podziel cel na etapy, które da się jednoznacznie zakończyć.", "Regularnie aktualizuj postęp i reaguj na kondycję celu „Zagrożony”."],
  },
  affairs: {
    title: "Sprawy",
    steps: ["Zacznij od radaru zobowiązań i najbliższych terminów.", "Przejdź do płatności, firmy albo podróży zależnie od kontekstu.", "Po wykonaniu sprawy sprawdź historię; ostatnią operację można cofnąć."],
  },
  travel: {
    title: "Podróże",
    steps: ["Otwórz najbliższy wyjazd i sprawdź jego gotowość.", "Uzupełnij checklistę, budżet i dokumenty w jednym dossier.", "Przed wyjazdem wyeksportuj kopię; usunięty wyjazd możesz przywrócić."],
  },
  notes: {
    title: "Notatki",
    steps: ["Zapisz myśl bez formatowania — porządek możesz dodać później.", "Użyj list i tagów, aby połączyć notatkę z obszarem życia.", "Wyszukuj po treści, a nie po zapamiętanym miejscu zapisu."],
  },
} as const;

type HelpGuideId = keyof typeof HELP_GUIDES;

function getInitialSidebarState() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    const legacySaved = saved === null
      ? window.localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY)
      : null;
    if (saved === null && legacySaved !== null) {
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, legacySaved);
      } catch {
        // Keep using the legacy preference if the new key cannot be written yet.
      }
    }
    return (saved ?? legacySaved) === "true";
  } catch {
    return false;
  }
}

function getInitialCompactViewport() {
  return window.matchMedia(maxWidthQuery("columns")).matches;
}

function getWeatherIcon(code = -1, isLoading = false): LucideIcon {
  if (isLoading) return RefreshCw;
  if (code === 0) return SunMedium;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return LocateFixed;
}

function PrimaryNavItem({
  item,
  mobile = false,
}: {
  item: AppModule;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  const location = useLocation();
  const { activeAreaId, setActiveAreaId } = useActiveArea();
  const active = isModulePath(item, location.pathname);
  const rememberedDestination = rememberedModuleLocation(item);
  const destination = active && location.pathname === item.to
    ? `${location.pathname}${location.search}`
    : active
      ? `${location.pathname}${location.search}`
      : rememberedDestination ?? item.to;
  return (
    <Link
      to={destination}
      viewTransition
      title={item.label}
      aria-current={active ? "page" : undefined}
      data-module-id={item.id}
      data-area-active={activeAreaId === item.id || undefined}
      className={[
        mobile ? "app-mobile-nav__item" : "app-nav-item",
        active ? "is-active" : "",
        activeAreaId === item.id ? "is-area-active" : "",
      ].filter(Boolean).join(" ")}
      onClick={(event) => {
        if (active) {
          event.preventDefault();
          return;
        }
      }}
      onPointerEnter={() => {
        setActiveAreaId(item.id);
      }}
      onPointerLeave={() => {
        setActiveAreaId(null);
      }}
      onFocus={() => {
        setActiveAreaId(item.id);
      }}
      onBlur={() => {
        setActiveAreaId(null);
      }}
    >
      <Icon size={mobile ? 18 : 15} strokeWidth={1.7} aria-hidden="true" />
      <span className={mobile ? "app-mobile-nav__label" : "app-nav-label"}>{item.label}</span>
    </Link>
  );
}

type ModuleSettingsProps = {
  orderedModules: AppModule[];
  enabledModuleCount: number;
  preferences: ModulePreferences;
  onMove: (moduleId: AppModule["id"], direction: -1 | 1) => void;
  onToggle: (moduleId: AppModule["id"]) => void;
  onReset: () => void;
  idPrefix: string;
};

function ModuleSettings({
  orderedModules,
  enabledModuleCount,
  preferences,
  onMove,
  onToggle,
  onReset,
  idPrefix,
}: ModuleSettingsProps) {
  const titleId = `${idPrefix}-module-settings-title`;
  return (
    <section className="app-module-settings" aria-labelledby={titleId}>
      <div className="app-module-settings__heading">
        <span>
          <strong id={titleId}>Moduły</strong>
          <small>Ustal kolejność i widoczność</small>
        </span>
        <small>{enabledModuleCount}/{APP_MODULES.length} aktywne</small>
      </div>

      <div className="app-module-settings__list">
        {orderedModules.map((item, index) => {
          const ModuleIcon = item.icon;
          const isEnabled = !preferences.disabled.includes(item.id);
          const isLastEnabledModule = isEnabled && enabledModuleCount === 1;

          return (
            <div
              key={item.id}
              className={`app-module-settings__row${isEnabled ? "" : " is-disabled"}`}
            >
              <ModuleIcon size={14} strokeWidth={1.7} aria-hidden="true" />
              <span className="app-module-settings__label">{item.label}</span>
              <label
                className="app-module-toggle"
                title={isLastEnabledModule ? "Co najmniej jeden moduł musi pozostać aktywny" : undefined}
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={isLastEnabledModule}
                  aria-label={`${isEnabled ? "Dezaktywuj" : "Aktywuj"} moduł ${item.label}`}
                  onChange={() => onToggle(item.id)}
                />
                <span aria-hidden="true" />
              </label>
              <span className="app-module-settings__move">
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Przenieś ${item.label} wyżej`}
                  title="Przenieś wyżej"
                  onClick={() => onMove(item.id, -1)}
                >
                  <ChevronUp size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={index === orderedModules.length - 1}
                  aria-label={`Przenieś ${item.label} niżej`}
                  title="Przenieś niżej"
                  onClick={() => onMove(item.id, 1)}
                >
                  <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <button type="button" className="app-module-settings__reset" onClick={onReset}>
        <RotateCcw size={13} strokeWidth={1.7} aria-hidden="true" />
        Przywróć domyślny układ
      </button>
    </section>
  );
}

function ProfileSummary() {
  const privacy = usePrivacy();
  return (
    <>
      <div className="app-sidebar-popover__profile">
        <span className="app-sidebar-profile__avatar" aria-hidden="true">
          <UserRound size={15} strokeWidth={1.8} />
        </span>
        <span>
          <strong>Użytkownik lokalny</strong>
          <small>Profil nie jest jeszcze połączony z kontem.</small>
        </span>
      </div>
      <p>Dane Rootine są obecnie zapisywane tylko na tym urządzeniu.</p>
      <button
        type="button"
        className={`app-profile-privacy${privacy.enabled ? " is-active" : ""}`}
        aria-pressed={privacy.enabled}
        onClick={privacy.toggle}
      >
        <EyeOff size={15} aria-hidden="true" />
        <span>
          <strong>{privacy.enabled ? "Privacy Mode włączony" : "Włącz Privacy Mode"}</strong>
          <small>Ukrywa kwoty, pomiary i prywatne treści. Skrót: Ctrl ⇧ P.</small>
        </span>
      </button>
      <div className="app-recovery-entry">
        <RecoveryCenterButton />
      </div>
    </>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const assistant = useAssistant();
  const { settings: assistantSettings } = useAssistantSettings();
  const { openAssistant, updateAppContext } = assistant;
  const privacy = usePrivacy();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarState);
  const [isCompactViewport, setIsCompactViewport] = useState(getInitialCompactViewport);
  const [modulePreferences, setModulePreferences] = useState(loadModulePreferences);
  const [appTheme, setAppTheme] = useState(loadAppTheme);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [dayReplayOpen, setDayReplayOpen] = useState(false);
  const [assistantUiRequested, setAssistantUiRequested] = useState(false);
  const [helpGuideId, setHelpGuideId] = useState<HelpGuideId>(() => {
    if (location.pathname.startsWith("/kalendarz")) return "calendar";
    if (location.pathname.startsWith("/podroze")) return "travel";
    return findModuleForPath(location.pathname)?.id ?? "today";
  });
  const [helpQuery, setHelpQuery] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<"error" | null>(null);
  const weatherRequestId = useRef(0);
  const weatherAbortController = useRef<AbortController | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(maxWidthQuery("columns"));
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // The preference is optional; the sidebar still works when storage is unavailable.
    }
  }, [isSidebarCollapsed]);

  useEffect(() => subscribeToModulePreferences(() => {
    setModulePreferences(loadModulePreferences());
  }), []);

  useEffect(() => subscribeToSystemTheme(appTheme), [appTheme]);

  useEffect(() => {
    const showSaved = () => {
      if (listLocalPersistenceIssues().length > 0) return;
      setSaveFeedback(null);
    };
    const showIssues = () => {
      setSaveFeedback(listLocalPersistenceIssues().length > 0 ? "error" : null);
    };
    window.addEventListener("rootine:workspace-change", showSaved);
    const unsubscribeIssues = subscribeToLocalPersistenceIssues(showIssues);
    showIssues();
    return () => {
      window.removeEventListener("rootine:workspace-change", showSaved);
      unsubscribeIssues();
    };
  }, []);

  const todayKey = toLocalDateKey(now);
  const requestWeather = useCallback((forceRefresh = false) => {
    const requestId = ++weatherRequestId.current;
    weatherAbortController.current?.abort();
    const controller = new AbortController();
    weatherAbortController.current = controller;
    setWeather({ status: "loading" });
    void loadTodayWeather(todayKey, controller.signal, { forceRefresh })
      .then((data) => {
        if (weatherRequestId.current === requestId) setWeather({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (weatherRequestId.current === requestId) {
          setWeather({ status: "error", message: "Pogoda jest chwilowo niedostępna" });
        }
      });
  }, [todayKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => requestWeather());
    return () => {
      window.cancelAnimationFrame(frame);
      weatherRequestId.current += 1;
      weatherAbortController.current?.abort();
    };
  }, [requestWeather]);

  useEffect(() => {
    if (!openMenu?.startsWith("mobile")) return;

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        window.requestAnimationFrame(() => mobileMoreButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !mobileMenuRef.current) return;
      const focusable = Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>(MOBILE_MENU_FOCUSABLE),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        mobileMenuRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element
        && !target.closest("[data-app-popover]")
        && !target.closest("[data-app-menu-trigger]")
      ) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("keydown", handleMenuKeyDown);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleMenuKeyDown);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu?.startsWith("mobile")) return;
    const frame = window.requestAnimationFrame(() => {
      mobileMenuRef.current
        ?.querySelector<HTMLElement>("[data-mobile-menu-focus]")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openMenu]);

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (assistant.isOpen) setAssistantUiRequested(true);
  }, [assistant.isOpen]);

  useEffect(() => {
    const module = findModuleForPath(location.pathname);
    if (!module) return;
    const params = new URLSearchParams(location.search);
    TRANSIENT_COMMAND_PARAMS.forEach((key) => params.delete(key));
    const search = params.toString();
    writeModuleMemoryValue(module.id, "location", `${location.pathname}${search ? `?${search}` : ""}`);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const openCommandCenter = () => setCommandCenterOpen(true);
    window.addEventListener("rootine:open-command-center", openCommandCenter);
    return () => window.removeEventListener("rootine:open-command-center", openCommandCenter);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((collapsed) => !collapsed);
    setOpenMenu(null);
  };

  const moveModule = (moduleId: AppModule["id"], direction: -1 | 1) => {
    const currentIndex = modulePreferences.order.indexOf(moduleId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= modulePreferences.order.length) return;

    const nextOrder = [...modulePreferences.order];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    const nextPreferences = { ...modulePreferences, order: nextOrder };
    setModulePreferences(nextPreferences);
    saveModulePreferences(nextPreferences);
  };

  const toggleModule = (moduleId: AppModule["id"]) => {
    const isDisabled = modulePreferences.disabled.includes(moduleId);
    if (!isDisabled && modulePreferences.disabled.length === modulePreferences.order.length - 1) return;

    const nextPreferences = {
      ...modulePreferences,
      disabled: isDisabled
        ? modulePreferences.disabled.filter((id) => id !== moduleId)
        : [...modulePreferences.disabled, moduleId],
    };
    setModulePreferences(nextPreferences);
    saveModulePreferences(nextPreferences);
  };

  const orderedNav = getOrderedModules(modulePreferences);
  const visibleNav = getVisibleModules(modulePreferences);
  const enabledModuleCount = visibleNav.length;
  const mobilePrimaryNav = [...visibleNav]
    .sort((left, right) => (
      (left.mobilePriority ?? Number.POSITIVE_INFINITY)
      - (right.mobilePriority ?? Number.POSITIVE_INFINITY)
    ))
    .slice(0, 4);
  const currentModule = findModuleForPath(location.pathname);
  const contextualHelpId: HelpGuideId = location.pathname.startsWith("/kalendarz")
    ? "calendar"
    : location.pathname.startsWith("/podroze")
      ? "travel"
      : currentModule?.id ?? "today";
  const activeHelpGuide = HELP_GUIDES[helpGuideId];
  const normalizedHelpQuery = helpQuery.trim().toLocaleLowerCase("pl-PL");
  const matchingHelpGuides = (Object.entries(HELP_GUIDES) as [HelpGuideId, typeof HELP_GUIDES[HelpGuideId]][])
    .filter(([, guide]) => !normalizedHelpQuery || [guide.title, ...guide.steps]
      .some((value) => value.toLocaleLowerCase("pl-PL").includes(normalizedHelpQuery)));
  const moreIsActive = Boolean(
    currentModule && !mobilePrimaryNav.some((item) => item.id === currentModule.id),
  );
  const showCollapsedBrandControl = isSidebarCollapsed && !isCompactViewport;
  const timeLabel = TIME_FORMATTER.format(now);
  const dateLabel = DATE_FORMATTER.format(now);
  const WeatherIcon = getWeatherIcon(
    weather.status === "ready" ? weather.data.weatherCode : -1,
    weather.status === "loading",
  );
  const weatherLabel = weather.status === "ready"
    ? getTodayWeatherLabel(weather.data.weatherCode)
    : weather.status === "loading"
      ? "Pobieranie prognozy"
      : weather.message;
  const closeMobileMenu = () => {
    setOpenMenu(null);
    window.requestAnimationFrame(() => mobileMoreButtonRef.current?.focus());
  };
  const resetModules = () => {
    const nextPreferences = createDefaultModulePreferences();
    setModulePreferences(nextPreferences);
    saveModulePreferences(nextPreferences);
  };
  const settingsProps = {
    orderedModules: orderedNav,
    enabledModuleCount,
    preferences: modulePreferences,
    onMove: moveModule,
    onToggle: toggleModule,
    onReset: resetModules,
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selectedEntityId = location.pathname.startsWith("/cele/")
      ? location.pathname.slice("/cele/".length).split("/", 1)[0]
      : location.pathname.startsWith("/podroze/")
        ? location.pathname.slice("/podroze/".length).split("/", 1)[0]
        : params.get("id") ?? undefined;
    updateAppContext({
      module: location.pathname.startsWith("/kalendarz")
        ? "calendar"
        : location.pathname.startsWith("/podroze")
          ? "travel"
          : currentModule?.id ?? "today",
      subview: params.get("widok") ?? params.get("tab") ?? undefined,
      selectedDate: params.get("data") ?? params.get("date") ?? undefined,
      selectedEntityId,
      activeFilter: params.get("filter") ?? params.get("filtr") ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw",
      locale: navigator.language || "pl-PL",
      privacyMode: privacy.enabled,
    });
  }, [currentModule?.id, location.pathname, location.search, privacy.enabled, updateAppContext]);

  const changeAppTheme = (preference: AppThemePreference) => {
    setAppTheme(preference);
    applyAppTheme(preference);
  };

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.matches("input, textarea, select")
        || target.isContentEditable
      );
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpenMenu(null);
        setHelpOpen(false);
        setCommandCenterOpen(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "Space" && !isTyping) {
        event.preventDefault();
        setOpenMenu(null);
        setHelpOpen(false);
        openAssistant();
        return;
      }
      if (isTyping) return;

      if (event.key === "?") {
        event.preventDefault();
        setOpenMenu(null);
        setHelpGuideId(contextualHelpId);
        setHelpQuery("");
        setHelpOpen(true);
        return;
      }

      if (!event.altKey || event.ctrlKey || event.metaKey || !/^\d$/.test(event.key)) return;
      const shortcutIndex = Number(event.key) - 1;
      const destination = visibleNav[shortcutIndex];
      if (!destination) return;
      event.preventDefault();
      navigate(destination.to);
    };

    document.addEventListener("keydown", handleGlobalShortcut);
    return () => document.removeEventListener("keydown", handleGlobalShortcut);
  }, [contextualHelpId, navigate, openAssistant, visibleNav]);

  const latestUserTranscript = [...assistant.state.transcript]
    .reverse()
    .find((entry) => entry.role === "user")?.text ?? "";
  const assistantStageStatus: AssistantStageStatus = assistant.state.status === "disabled"
    ? "idle"
    : assistant.state.status;

  return (
    <div className="app-layout app-shell">
      <a className="app-skip-link" href="#primary-workspace">Przejdź do treści</a>
      <aside
        id="primary-sidebar"
        className={`app-primary-sidebar app-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}
        aria-label="Główna nawigacja"
      >
        <div className="app-brand">
          {showCollapsedBrandControl ? (
            <button
              type="button"
              className="app-brand-collapsed-toggle"
              aria-controls="primary-sidebar"
              aria-expanded="false"
              aria-label="Rozwiń panel boczny"
              title="Rozwiń panel"
              onClick={toggleSidebar}
            >
              <span className="app-brand__mark" aria-hidden="true">R</span>
              <PanelLeftOpen
                className="app-brand-collapsed-toggle__icon"
                size={17}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </button>
          ) : (
            <>
              <div className="app-brand__mark" aria-hidden="true">R</div>
              <span className="app-brand-label">Rootine</span>
              <button
                type="button"
                className="app-sidebar-toggle"
                aria-controls="primary-sidebar"
                aria-expanded={!isSidebarCollapsed}
                aria-label={isSidebarCollapsed ? "Rozwiń panel boczny" : "Zwiń panel boczny"}
                title={isSidebarCollapsed ? "Rozwiń panel" : "Zwiń panel"}
                onClick={toggleSidebar}
              >
                {isSidebarCollapsed
                  ? <PanelLeftOpen size={16} strokeWidth={1.7} aria-hidden="true" />
                  : <PanelLeftClose size={16} strokeWidth={1.7} aria-hidden="true" />}
              </button>
            </>
          )}
        </div>

        <nav className="app-primary-nav" aria-label="Obszary aplikacji">
          {visibleNav.map((item) => (
            <PrimaryNavItem
              key={item.id}
              item={item}
            />
          ))}
        </nav>

        <AssistantEntryButton
          enabled={assistant.canOpen}
          active={assistant.isOpen}
          reason={assistant.availability.message}
          compact={isSidebarCollapsed || isCompactViewport}
          onClick={assistant.openAssistant}
        />

        <button
          type="button"
          className="app-command-trigger"
          aria-haspopup="dialog"
          aria-expanded={commandCenterOpen}
          onClick={() => setCommandCenterOpen(true)}
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>Dodaj</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="app-sidebar__bottom">
          <div className="app-sidebar-glance" aria-label="Data, godzina i pogoda">
            <button
              type="button"
              className="app-sidebar-glance__row app-sidebar-replay"
              title={`${timeLabel} · ${dateLabel} · otwórz Oś dnia`}
              aria-label={`${timeLabel}, ${dateLabel}. Otwórz Oś dnia`}
              onClick={() => setDayReplayOpen(true)}
            >
              <Clock3 size={16} strokeWidth={1.7} aria-hidden="true" />
              <span className="app-sidebar-glance__copy">
                <strong>{timeLabel}</strong>
                <small>{dateLabel}</small>
              </span>
            </button>

            <button
              type="button"
              className="app-sidebar-glance__row app-sidebar-weather"
              title={`${weatherLabel}${weather.status === "ready" ? ` · ${Math.round(weather.data.temperature)}°C` : ""}`}
              aria-label={`${weatherLabel}. Odśwież pogodę dla ${TODAY_WEATHER_LOCATION.label}`}
              disabled={weather.status === "loading"}
              onClick={() => requestWeather(true)}
            >
              <WeatherIcon
                className={weather.status === "loading" ? "is-spinning" : ""}
                size={16}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span className="app-sidebar-glance__copy">
                <strong>
                  {weather.status === "ready" ? `${Math.round(weather.data.temperature)}°C` : "Pogoda"}
                </strong>
                <small>{weatherLabel}</small>
              </span>
            </button>
          </div>

          <button
            type="button"
            className="app-sidebar-action"
            data-app-menu-trigger
            aria-haspopup="dialog"
            aria-expanded={openMenu === "settings"}
            title="Ustawienia"
            onClick={() => setOpenMenu((current) => current === "settings" ? null : "settings")}
          >
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className="app-sidebar-action__label">Ustawienia</span>
          </button>

          <button
            type="button"
            className="app-sidebar-action"
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
            title="Pomoc i skróty (?)"
            onClick={() => {
              setOpenMenu(null);
              setHelpGuideId(contextualHelpId);
              setHelpQuery("");
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className="app-sidebar-action__label">Pomoc i skróty</span>
          </button>

          <button
            type="button"
            className="app-sidebar-profile"
            data-app-menu-trigger
            aria-haspopup="dialog"
            aria-expanded={openMenu === "profile"}
            title="Profil użytkownika"
            onClick={() => setOpenMenu((current) => current === "profile" ? null : "profile")}
          >
            <span className="app-sidebar-profile__avatar" aria-hidden="true">U</span>
            <span className="app-sidebar-profile__copy">
              <strong>Użytkownik lokalny</strong>
              <small>Profil użytkownika</small>
            </span>
          </button>

          {openMenu === "settings" && (
            <Modal
              title="Ustawienia"
              description="Dostosuj wygląd, panel, kolejność obszarów i wspólną prognozę aplikacji."
              size="md"
              bodyClassName="app-settings-dialog"
              onClose={() => setOpenMenu(null)}
            >
              <button type="button" data-autofocus onClick={toggleSidebar}>
                {isSidebarCollapsed
                  ? <PanelLeftOpen size={15} strokeWidth={1.7} aria-hidden="true" />
                  : <PanelLeftClose size={15} strokeWidth={1.7} aria-hidden="true" />}
                <span>
                  <strong>{isSidebarCollapsed ? "Rozwiń panel" : "Zwiń panel"}</strong>
                  <small>Wybór zostanie zapamiętany</small>
                </span>
              </button>
              <button
                type="button"
                disabled={weather.status === "loading"}
                onClick={() => requestWeather(true)}
              >
                <RefreshCw
                  className={weather.status === "loading" ? "is-spinning" : ""}
                  size={15}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                <span>
                  <strong>Odśwież pogodę</strong>
                  <small>{TODAY_WEATHER_LOCATION.label} · wspólna prognoza aplikacji</small>
                </span>
              </button>
              <ThemeSettings
                idPrefix="sidebar"
                value={appTheme}
                onChange={changeAppTheme}
              />
              <ExperienceSettings />
              <Suspense fallback={null}>
                <AssistantSettingsPanel availability={assistant.availability} />
              </Suspense>
              <ModuleSettings {...settingsProps} idPrefix="sidebar" />
              <div className="app-recovery-entry">
                <RecoveryCenterButton />
              </div>
              <a
                className="app-sidebar-popover__source"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Dane pogodowe: Open-Meteo
              </a>
            </Modal>
          )}

          {openMenu === "profile" && (
            <Modal
              title="Profil lokalny"
              description="Informacje o profilu i sposobie przechowywania danych."
              size="sm"
              bodyClassName="app-profile-dialog"
              onClose={() => setOpenMenu(null)}
            >
              <ProfileSummary />
            </Modal>
          )}
        </div>
      </aside>

      {helpOpen && (
        <Modal
          title="Pomoc i szybkie przejście"
          description="Przejdź do obszaru bez szukania go w nawigacji albo sprawdź, jak bezpiecznie zarządzać lokalnymi danymi."
          size="md"
          bodyClassName="app-help-dialog"
          onClose={() => setHelpOpen(false)}
        >
          <section aria-labelledby="help-context-title">
            <div className="app-help-dialog__heading">
              <CircleHelp size={16} aria-hidden="true" />
              <div>
                <h3 id="help-context-title">Jak pracować: {activeHelpGuide.title}</h3>
                <p>Krótka ścieżka od pierwszego kroku do bezpiecznego zakończenia.</p>
              </div>
            </div>
            <ol className="app-help-dialog__steps">
              {activeHelpGuide.steps.map((step, index) => (
                <li key={step}><span aria-hidden="true">{index + 1}</span><p>{step}</p></li>
              ))}
            </ol>
            <label className="app-help-dialog__search">
              <Search size={14} aria-hidden="true" />
              <span className="ui-sr-only">Szukaj w pomocy</span>
              <input
                type="search"
                value={helpQuery}
                placeholder="Szukaj w pomocy…"
                onChange={(event) => setHelpQuery(event.target.value)}
              />
            </label>
            <div className="app-help-dialog__guide-list" aria-label="Przewodniki modułów">
              {matchingHelpGuides.map(([id, guide]) => (
                <button
                  key={id}
                  type="button"
                  className={id === helpGuideId ? "is-active" : ""}
                  aria-pressed={id === helpGuideId}
                  onClick={() => { setHelpGuideId(id); setHelpQuery(""); }}
                >
                  {guide.title}
                </button>
              ))}
              {matchingHelpGuides.length === 0 && <p>Brak wyniku. Spróbuj innego słowa.</p>}
            </div>
          </section>

          <section aria-labelledby="help-navigation-title">
            <div className="app-help-dialog__heading">
              <Keyboard size={16} aria-hidden="true" />
              <div>
                <h3 id="help-navigation-title">Szybkie przejście</h3>
                <p>Użyj przycisków albo skrótów Alt + numer.</p>
              </div>
            </div>
            <div className="app-help-dialog__modules">
              {visibleNav.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-autofocus={index === 0 ? "" : undefined}
                    onClick={() => {
                      navigate(item.to);
                      setHelpOpen(false);
                    }}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                    <kbd>Alt {index + 1}</kbd>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="help-shortcuts-title">
            <div className="app-help-dialog__heading">
              <CircleHelp size={16} aria-hidden="true" />
              <div>
                <h3 id="help-shortcuts-title">Skróty i bezpieczeństwo</h3>
                <p><kbd>Ctrl K</kbd> otwiera centrum dodawania, <kbd>?</kbd> pomoc, a <kbd>Esc</kbd> zamyka dialogi.</p>
              </div>
            </div>
            <div className="app-help-dialog__recovery">
              <p>Dane są zapisywane lokalnie. Kopię możesz wyeksportować i przywrócić bez opuszczania aplikacji.</p>
              <RecoveryCenterButton />
            </div>
          </section>
        </Modal>
      )}

      {saveFeedback && (
        <div className={`app-save-feedback is-${saveFeedback}`} role="status" aria-live="polite">
          <CircleHelp size={15} aria-hidden="true" />
          <span>Zapis wymaga uwagi — otwórz Centrum odzyskiwania</span>
        </div>
      )}

      <Suspense fallback={null}>
        {commandCenterOpen && (
          <CommandCenter
            open
            onClose={() => setCommandCenterOpen(false)}
            currentModuleId={currentModule?.id}
          />
        )}
        {dayReplayOpen && <DayReplay open onClose={() => setDayReplayOpen(false)} />}
      </Suspense>

      <div className="workspace-layout app-shell__body">
        <div
          id="primary-workspace"
          className={`main-content app-shell__content${assistant.isOpen ? " is-assistant-active" : ""}`}
          tabIndex={-1}
        >
          <Suspense fallback={<RouteLoadingState />}>
            <RouteTransition inactive={assistant.isOpen}><Outlet /></RouteTransition>
          </Suspense>
          {assistantUiRequested && (
            <Suspense fallback={null}>
          <AssistantStage
            open={assistant.isOpen}
            status={assistantStageStatus}
            transcript={latestUserTranscript}
            partialTranscript={assistant.state.partialTranscript}
            assistantText={assistant.state.assistantText}
            view={assistant.view}
            pendingConfirmation={assistant.pendingConfirmation}
            error={assistant.state.error?.message}
            microphoneEnabled={assistant.state.microphoneEnabled}
            microphoneMode={assistantSettings.microphoneMode}
            audioEnabled={assistant.state.audioEnabled}
            privacyMode={privacy.enabled}
            analyser={assistant.analyser}
            onStartVoice={() => { void assistant.startVoice(); }}
            onSendText={(text) => { void assistant.sendText(text); }}
            onCancelResponse={assistant.cancelResponse}
            onToggleAudio={assistant.toggleAudio}
            onStartPushToTalk={() => { void assistant.startPushToTalk(); }}
            onStopPushToTalk={assistant.stopPushToTalk}
            onCancelPushToTalk={assistant.cancelPushToTalk}
            onClose={() => { void assistant.closeAssistant(); }}
            onInteraction={assistant.handlePanelInteraction}
            onRetry={() => { void assistant.retry(); }}
          />
            </Suspense>
          )}
        </div>

        {openMenu?.startsWith("mobile") && (
          <section
            ref={mobileMenuRef}
            id="mobile-more-menu"
            className="app-mobile-menu"
            data-app-popover
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={
              openMenu === "mobileSettings"
                ? "Ustawienia aplikacji"
                : openMenu === "mobileProfile"
                  ? "Profil użytkownika"
                  : "Wszystkie obszary aplikacji"
            }
          >
            <header className="app-mobile-menu__header">
              {openMenu !== "mobileMore" ? (
                <button
                  type="button"
                  className="app-mobile-menu__icon-button"
                  data-mobile-menu-focus
                  aria-label="Wróć do wszystkich obszarów"
                  onClick={() => setOpenMenu("mobileMore")}
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                </button>
              ) : (
                <span className="app-mobile-menu__mark" aria-hidden="true">R</span>
              )}
              <span>
                <strong>
                  {openMenu === "mobileSettings"
                    ? "Ustawienia"
                    : openMenu === "mobileProfile"
                      ? "Profil"
                      : "Rootine"}
                </strong>
                <small>
                  {openMenu === "mobileSettings"
                    ? "Wygląd, nawigacja i prognoza"
                    : openMenu === "mobileProfile"
                      ? "Dane lokalne"
                      : "Wszystkie obszary"}
                </small>
              </span>
              <button
                type="button"
                className="app-mobile-menu__icon-button"
                aria-label="Zamknij menu"
                onClick={closeMobileMenu}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            {openMenu === "mobileMore" && (
              <>
                <nav className="app-mobile-menu__modules" aria-label="Wszystkie obszary">
                  {orderedNav.map((item, index) => {
                    const Icon = item.icon;
                    const hiddenByPreference = modulePreferences.disabled.includes(item.id);
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        aria-current={isModulePath(item, location.pathname) ? "page" : undefined}
                        data-mobile-menu-focus={index === 0 ? "" : undefined}
                        className={[
                          "app-mobile-menu__module",
                          isModulePath(item, location.pathname) ? "is-active" : "",
                          hiddenByPreference ? "is-preference-hidden" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                        <span>
                          <strong>{item.label}</strong>
                          {hiddenByPreference && <small>Ukryty w pasku nawigacji</small>}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
                <div className="app-mobile-menu__actions">
                  <button
                    type="button"
                    disabled={!assistant.canOpen}
                    onClick={() => {
                      closeMobileMenu();
                      mobileMoreButtonRef.current?.focus();
                      assistant.openAssistant();
                    }}
                  >
                    <AudioLines size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>
                      <strong>Asystent</strong>
                      <small>{assistant.canOpen ? "Głos i tekst w Assistant Stage" : assistant.availability.message}</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => { closeMobileMenu(); setHelpOpen(true); }}>
                    <CircleHelp size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>
                      <strong>Pomoc i skróty</strong>
                      <small>Szybkie przejście i bezpieczeństwo danych</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => setOpenMenu("mobileSettings")}>
                    <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>
                      <strong>Ustawienia</strong>
                      <small>Motyw, kolejność, widoczność i pogoda</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => setOpenMenu("mobileProfile")}>
                    <UserRound size={16} strokeWidth={1.7} aria-hidden="true" />
                    <span>
                      <strong>Profil lokalny</strong>
                      <small>Informacje o przechowywaniu danych</small>
                    </span>
                  </button>
                </div>
              </>
            )}

            {openMenu === "mobileSettings" && (
              <div className="app-mobile-menu__settings">
                <ThemeSettings
                  idPrefix="mobile"
                  value={appTheme}
                  onChange={changeAppTheme}
                />
                <ExperienceSettings compact />
                <Suspense fallback={null}>
                  <AssistantSettingsPanel availability={assistant.availability} compact />
                </Suspense>
                <button
                  type="button"
                  className="app-mobile-menu__weather"
                  disabled={weather.status === "loading"}
                  onClick={() => requestWeather(true)}
                >
                  <WeatherIcon
                    className={weather.status === "loading" ? "is-spinning" : ""}
                    size={16}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>Odśwież pogodę</strong>
                    <small>{TODAY_WEATHER_LOCATION.label} · {weatherLabel}</small>
                  </span>
                </button>
                <ModuleSettings {...settingsProps} idPrefix="mobile" />
                <div className="app-recovery-entry">
                  <RecoveryCenterButton />
                </div>
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Dane pogodowe: Open-Meteo
                </a>
              </div>
            )}

            {openMenu === "mobileProfile" && (
              <div className="app-mobile-menu__profile">
                <ProfileSummary />
              </div>
            )}
          </section>
        )}

        <nav className="app-mobile-nav" aria-label="Główna nawigacja mobilna">
          {mobilePrimaryNav.map((item) => <PrimaryNavItem key={item.id} item={item} mobile />)}
          <button
            ref={mobileMoreButtonRef}
            type="button"
            className={`app-mobile-nav__item${moreIsActive || openMenu?.startsWith("mobile") ? " is-active" : ""}`}
            data-app-menu-trigger
            aria-haspopup="dialog"
            aria-expanded={Boolean(openMenu?.startsWith("mobile"))}
            aria-controls="mobile-more-menu"
            onClick={() => setOpenMenu((current) => current?.startsWith("mobile") ? null : "mobileMore")}
          >
            <MoreHorizontal size={19} strokeWidth={1.7} aria-hidden="true" />
            <span className="app-mobile-nav__label">Więcej</span>
          </button>
        </nav>
      </div>
      {assistant.undoNotice && (
        <Suspense fallback={null}>
          <AssistantUndoToast
            notice={assistant.undoNotice}
            onUndo={(token) => { void assistant.undo(token); }}
            onDismiss={assistant.dismissUndo}
          />
        </Suspense>
      )}
    </div>
  );
}
