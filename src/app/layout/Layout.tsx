import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Dumbbell,
  LocateFixed,
  Map,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Salad,
  Settings,
  ShieldCheck,
  SunMedium,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const SIDEBAR_STORAGE_KEY = "routine.sidebar.collapsed";
const MODULES_STORAGE_KEY = "routine.sidebar.modules";

type NavItem = { id: string; label: string; icon: LucideIcon; to: string };

const NAV: NavItem[] = [
  { id: "today", label: "Dzisiaj", icon: SunMedium, to: "/dzisiaj" },
  { id: "tasks", label: "Zadania", icon: CheckSquare, to: "/zadania" },
  { id: "calendar", label: "Kalendarz", icon: CalendarDays, to: "/kalendarz" },
  { id: "nutrition", label: "Odżywianie", icon: Salad, to: "/odzywianie" },
  { id: "sport", label: "Sport", icon: Dumbbell, to: "/sport" },
  { id: "work", label: "Praca", icon: BriefcaseBusiness, to: "/praca" },
  { id: "goals", label: "Cele", icon: Target, to: "/cele" },
  { id: "affairs", label: "Sprawy", icon: ShieldCheck, to: "/sprawy" },
  { id: "notes", label: "Notatki", icon: NotebookPen, to: "/notatki" },
  { id: "travel", label: "Podróże", icon: Map, to: "/podroze" },
];

type ModulePreferences = {
  order: string[];
  disabled: string[];
};

type WeatherState = {
  status: "idle" | "loading" | "success" | "error";
  temperature?: number;
  code?: number;
  isDay?: boolean;
  message?: string;
};

const TIME_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function getInitialSidebarState() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getDefaultModulePreferences(): ModulePreferences {
  return { order: NAV.map((item) => item.id), disabled: [] };
}

function normalizeModulePreferences(value: unknown): ModulePreferences {
  const defaults = getDefaultModulePreferences();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as { order?: unknown; disabled?: unknown };
  const validIds = new Set(defaults.order);
  const savedOrder = Array.isArray(candidate.order)
    ? candidate.order.filter((id): id is string => typeof id === "string" && validIds.has(id))
    : [];
  const order = [...new Set(savedOrder)];

  defaults.order.forEach((id) => {
    if (!order.includes(id)) {
      order.push(id);
    }
  });

  const savedDisabled = Array.isArray(candidate.disabled)
    ? candidate.disabled.filter((id): id is string => typeof id === "string" && validIds.has(id))
    : [];
  const disabled = [...new Set(savedDisabled)];

  return {
    order,
    disabled: disabled.length < order.length ? disabled : [],
  };
}

function getInitialModulePreferences(): ModulePreferences {
  try {
    const stored = window.localStorage.getItem(MODULES_STORAGE_KEY);
    return stored ? normalizeModulePreferences(JSON.parse(stored) as unknown) : getDefaultModulePreferences();
  } catch {
    return getDefaultModulePreferences();
  }
}

function getInitialCompactViewport() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function getWeatherMeta(code = -1, isDay = true): { icon: LucideIcon; label: string } {
  if (code === 0) {
    return { icon: isDay ? SunMedium : CloudSun, label: "Bezchmurnie" };
  }

  if ([1, 2].includes(code)) {
    return { icon: CloudSun, label: "Małe zachmurzenie" };
  }

  if (code === 3) {
    return { icon: Cloud, label: "Pochmurno" };
  }

  if ([45, 48].includes(code)) {
    return { icon: CloudFog, label: "Mgła" };
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: CloudRain, label: "Opady deszczu" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: CloudSnow, label: "Opady śniegu" };
  }

  if ([95, 96, 99].includes(code)) {
    return { icon: CloudLightning, label: "Burza" };
  }

  return { icon: LocateFixed, label: "Włącz pogodę" };
}

function PrimaryNavItem({ label, icon: Icon, to, mobile = false }: { label: string; icon: LucideIcon; to: string; mobile?: boolean }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) => [
        mobile ? "app-mobile-nav__item" : "app-nav-item",
        isActive ? "is-active" : "",
      ].filter(Boolean).join(" ")}
    >
      <Icon size={mobile ? 18 : 15} strokeWidth={1.7} aria-hidden="true" />
      <span className={mobile ? "app-mobile-nav__label" : "app-nav-label"}>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarState);
  const [isCompactViewport, setIsCompactViewport] = useState(getInitialCompactViewport);
  const [modulePreferences, setModulePreferences] = useState(getInitialModulePreferences);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState>({ status: "idle" });
  const [openMenu, setOpenMenu] = useState<"settings" | "profile" | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 980px)");
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

  useEffect(() => {
    try {
      window.localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modulePreferences));
    } catch {
      // Module preferences remain available until the current page is closed.
    }
  }, [modulePreferences]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element
        && !target.closest("[data-sidebar-popover]")
        && !target.closest("[data-sidebar-menu-trigger]")
      ) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [openMenu]);

  const requestWeather = useCallback(() => {
    if (!navigator.geolocation) {
      setWeather({ status: "error", message: "Lokalizacja jest niedostępna" });
      return;
    }

    setWeather({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const params = new URLSearchParams({
            latitude: coords.latitude.toFixed(4),
            longitude: coords.longitude.toFixed(4),
            current: "temperature_2m,weather_code,is_day",
            timezone: "auto",
          });
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

          if (!response.ok) {
            throw new Error("Weather request failed");
          }

          const payload = await response.json() as {
            current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
          };
          const current = payload.current;

          if (
            typeof current?.temperature_2m !== "number"
            || typeof current.weather_code !== "number"
          ) {
            throw new Error("Weather response is incomplete");
          }

          setWeather({
            status: "success",
            temperature: Math.round(current.temperature_2m),
            code: current.weather_code,
            isDay: current.is_day !== 0,
          });
        } catch {
          setWeather({ status: "error", message: "Nie udało się pobrać pogody" });
        }
      },
      (error) => {
        setWeather({
          status: "error",
          message: error.code === error.PERMISSION_DENIED
            ? "Zezwól na lokalizację"
            : "Nie udało się ustalić lokalizacji",
        });
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (!navigator.permissions) {
      return;
    }

    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (permission.state === "granted") {
        requestWeather();
      }
    }).catch(() => {
      // Permission querying is not supported consistently; manual activation remains available.
    });
  }, [requestWeather]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((collapsed) => !collapsed);
    setOpenMenu(null);
  };

  const moveModule = (moduleId: string, direction: -1 | 1) => {
    setModulePreferences((current) => {
      const currentIndex = current.order.indexOf(moduleId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.order.length) {
        return current;
      }

      const nextOrder = [...current.order];
      [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
      return { ...current, order: nextOrder };
    });
  };

  const toggleModule = (moduleId: string) => {
    setModulePreferences((current) => {
      const isDisabled = current.disabled.includes(moduleId);
      if (!isDisabled && current.disabled.length === current.order.length - 1) {
        return current;
      }

      return {
        ...current,
        disabled: isDisabled
          ? current.disabled.filter((id) => id !== moduleId)
          : [...current.disabled, moduleId],
      };
    });
  };

  const orderedNav = modulePreferences.order
    .map((id) => NAV.find((item) => item.id === id))
    .filter((item): item is NavItem => Boolean(item));
  const visibleNav = orderedNav.filter((item) => !modulePreferences.disabled.includes(item.id));
  const enabledModuleCount = visibleNav.length;
  const showCollapsedBrandControl = isSidebarCollapsed && !isCompactViewport;
  const weatherMeta = getWeatherMeta(weather.code, weather.isDay);
  const WeatherIcon = weather.status === "loading" ? RefreshCw : weatherMeta.icon;
  const timeLabel = TIME_FORMATTER.format(now);
  const dateLabel = DATE_FORMATTER.format(now);
  const weatherLabel = weather.status === "success"
    ? weatherMeta.label
    : weather.message ?? weatherMeta.label;

  return (
    <div className="app-shell">
      <aside
        id="primary-sidebar"
        className={`app-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}
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
              <span className="app-brand-label">Routine</span>
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
          {visibleNav.map((item) => <PrimaryNavItem key={item.id} {...item} />)}
        </nav>

        <div className="app-sidebar__bottom">
          <div className="app-sidebar-glance" aria-label="Data, godzina i pogoda" aria-live="polite">
            <div
              className="app-sidebar-glance__row"
              title={`${timeLabel} · ${dateLabel}`}
            >
              <Clock3 size={16} strokeWidth={1.7} aria-hidden="true" />
              <span className="app-sidebar-glance__copy">
                <strong>{timeLabel}</strong>
                <small>{dateLabel}</small>
              </span>
            </div>

            <button
              type="button"
              className="app-sidebar-glance__row app-sidebar-weather"
              title={`${weatherLabel}${weather.temperature !== undefined ? ` · ${weather.temperature}°C` : ""}`}
              aria-label={weather.status === "loading" ? "Pobieranie pogody" : `${weatherLabel}. Pobierz aktualną pogodę`}
              disabled={weather.status === "loading"}
              onClick={requestWeather}
            >
              <WeatherIcon
                className={weather.status === "loading" ? "is-spinning" : ""}
                size={16}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span className="app-sidebar-glance__copy">
                <strong>
                  {weather.temperature !== undefined ? `${weather.temperature}°C` : "Pogoda"}
                </strong>
                <small>{weatherLabel}</small>
              </span>
            </button>
          </div>

          <button
            type="button"
            className="app-sidebar-action"
            data-sidebar-menu-trigger
            aria-expanded={openMenu === "settings"}
            aria-controls="sidebar-settings"
            title="Ustawienia"
            onClick={() => setOpenMenu((current) => current === "settings" ? null : "settings")}
          >
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
            <span className="app-sidebar-action__label">Ustawienia</span>
          </button>

          <button
            type="button"
            className="app-sidebar-profile"
            data-sidebar-menu-trigger
            aria-expanded={openMenu === "profile"}
            aria-controls="sidebar-profile"
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
            <div
              id="sidebar-settings"
              className="app-sidebar-popover app-sidebar-popover--settings"
              data-sidebar-popover
              role="group"
              aria-label="Ustawienia panelu"
            >
              <div className="app-sidebar-popover__heading">
                <Settings size={15} strokeWidth={1.7} aria-hidden="true" />
                <strong>Ustawienia</strong>
              </div>
              <button type="button" onClick={toggleSidebar}>
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
                onClick={() => {
                  requestWeather();
                  setOpenMenu(null);
                }}
              >
                <LocateFixed size={15} strokeWidth={1.7} aria-hidden="true" />
                <span>
                  <strong>{weather.status === "success" ? "Odśwież pogodę" : "Włącz pogodę"}</strong>
                  <small>Używa lokalizacji tego urządzenia</small>
                </span>
              </button>
              <section className="app-module-settings" aria-labelledby="module-settings-title">
                <div className="app-module-settings__heading">
                  <span>
                    <strong id="module-settings-title">Moduły</strong>
                    <small>Ustal kolejność i widoczność</small>
                  </span>
                  <small>{enabledModuleCount}/{NAV.length} aktywne</small>
                </div>

                <div className="app-module-settings__list">
                  {orderedNav.map((item, index) => {
                    const ModuleIcon = item.icon;
                    const isEnabled = !modulePreferences.disabled.includes(item.id);
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
                            onChange={() => toggleModule(item.id)}
                          />
                          <span aria-hidden="true" />
                        </label>
                        <span className="app-module-settings__move">
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label={`Przenieś ${item.label} wyżej`}
                            title="Przenieś wyżej"
                            onClick={() => moveModule(item.id, -1)}
                          >
                            <ChevronUp size={13} strokeWidth={1.8} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={index === orderedNav.length - 1}
                            aria-label={`Przenieś ${item.label} niżej`}
                            title="Przenieś niżej"
                            onClick={() => moveModule(item.id, 1)}
                          >
                            <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="app-module-settings__reset"
                  onClick={() => setModulePreferences(getDefaultModulePreferences())}
                >
                  <RotateCcw size={13} strokeWidth={1.7} aria-hidden="true" />
                  Przywróć domyślny układ
                </button>
              </section>
              <a
                className="app-sidebar-popover__source"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Dane pogodowe: Open-Meteo
              </a>
            </div>
          )}

          {openMenu === "profile" && (
            <div
              id="sidebar-profile"
              className="app-sidebar-popover app-sidebar-popover--profile"
              data-sidebar-popover
              role="group"
              aria-label="Profil użytkownika"
            >
              <div className="app-sidebar-popover__profile">
                <span className="app-sidebar-profile__avatar" aria-hidden="true">
                  <UserRound size={15} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>Użytkownik lokalny</strong>
                  <small>Profil nie jest jeszcze połączony z kontem.</small>
                </span>
              </div>
              <p>Dane Routine są obecnie zapisywane tylko na tym urządzeniu.</p>
            </div>
          )}
        </div>
      </aside>

      <div className="app-shell__body">
        <div className="app-shell__content">
          <Outlet />
        </div>
        <nav className="app-mobile-nav" aria-label="Główna nawigacja mobilna">
          {visibleNav.map((item) => <PrimaryNavItem key={item.id} {...item} mobile />)}
        </nav>
      </div>
    </div>
  );
}
