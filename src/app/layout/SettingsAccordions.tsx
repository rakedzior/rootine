import { useState, type ReactNode } from "react";
import {
  CircleHelp,
  ChevronRight,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { RecoveryCenterButton } from "../recovery/RecoveryCenter";
import { usePrivacy } from "../experience/preferences";
import { TODAY_WEATHER_LOCATION } from "../data/todayWeather";

export type SectionKey = "panel" | "comfort" | "theme" | "modules" | "rest";

type SettingsAccordionsProps = {
  idPrefix: string;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  weatherStatus: "loading" | "ready" | "error";
  weatherLabel: string;
  weatherIcon: LucideIcon;
  onRefreshWeather: () => void;
  comfortContent: ReactNode;
  themeContent: ReactNode;
  modulesContent: ReactNode;
  onOpenHelp: () => void;
  compact?: boolean;
};

type SettingsAccordionProps = {
  idPrefix: string;
  section: SectionKey;
  title: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function SettingsAccordion({
  idPrefix,
  section,
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  children,
}: SettingsAccordionProps) {
  const triggerId = `${idPrefix}-${section}-trigger`;
  const panelId = `${idPrefix}-${section}-panel`;

  return (
    <section className={`app-settings-accordion__section${open ? " is-open" : ""}`}>
      <h3 className="app-settings-accordion__heading">
        <button
          id={triggerId}
          type="button"
          className="app-settings-accordion__trigger"
          aria-label={`${title}: ${description}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="app-settings-accordion__icon" aria-hidden="true">
            <Icon size={23} strokeWidth={1.7} />
          </span>
          <span className="app-settings-accordion__copy">
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <ChevronRight
            className="app-settings-accordion__chevron"
            size={20}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </button>
      </h3>

      <div
        id={panelId}
        className="app-settings-accordion__panel"
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="app-settings-accordion__panel-inner">{children}</div>
      </div>
    </section>
  );
}

export function SettingsAccordions({
  idPrefix,
  isSidebarCollapsed,
  onToggleSidebar,
  weatherStatus,
  weatherLabel,
  weatherIcon: WeatherIcon,
  onRefreshWeather,
  comfortContent,
  themeContent,
  modulesContent,
  onOpenHelp,
  compact = false,
}: SettingsAccordionsProps) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const privacy = usePrivacy();
  const SidebarIcon = isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const weatherLoading = weatherStatus === "loading";

  const toggleSection = (section: SectionKey) => {
    setOpenSection((current) => current === section ? null : section);
  };

  return (
    <div className={`app-settings-accordion${compact ? " is-compact" : ""}`}>
      <SettingsAccordion
        idPrefix={idPrefix}
        section="panel"
        title="Panel"
        description="Panel boczny i lokalizacja pogody"
        icon={PanelLeftOpen}
        open={openSection === "panel"}
        onToggle={() => toggleSection("panel")}
      >
        <div className="app-settings-accordion__rows">
          <button
            type="button"
            className="app-settings-accordion__row app-settings-accordion__row--button"
            aria-label={isSidebarCollapsed ? "Rozwiń panel boczny" : "Zwiń panel boczny"}
            onClick={onToggleSidebar}
          >
            <span className="app-settings-accordion__row-icon" aria-hidden="true">
              <SidebarIcon size={18} strokeWidth={1.7} />
            </span>
            <span className="app-settings-accordion__row-copy">
              <strong>Panel boczny</strong>
              <small>{isSidebarCollapsed ? "Panel jest zwinięty" : "Panel jest rozwinięty"} · stan zapamiętany</small>
            </span>
            <span className="app-settings-accordion__row-trailing" aria-hidden="true">
              <ChevronRight size={17} strokeWidth={1.7} />
            </span>
          </button>

          <button
            type="button"
            className="app-settings-accordion__row app-settings-accordion__row--button"
            disabled={weatherLoading}
            aria-label={`Odśwież pogodę dla ${TODAY_WEATHER_LOCATION.label}`}
            onClick={onRefreshWeather}
          >
            <span className="app-settings-accordion__row-icon" aria-hidden="true">
              <WeatherIcon size={18} strokeWidth={1.7} />
            </span>
            <span className="app-settings-accordion__row-copy">
              <strong>Lokalizacja pogody</strong>
              <small>{TODAY_WEATHER_LOCATION.label} · {weatherLabel}</small>
            </span>
            <RefreshCw
              className={`app-settings-accordion__row-refresh${weatherLoading ? " is-spinning" : ""}`}
              size={16}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </button>
        </div>
        <a
          className="app-settings-accordion__source"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
        >
          Dane pogodowe: Open-Meteo
        </a>
      </SettingsAccordion>

      <SettingsAccordion
        idPrefix={idPrefix}
        section="comfort"
        title="Komfort interfejsu"
        description="Ruch i gęstość interfejsu"
        icon={Waves}
        open={openSection === "comfort"}
        onToggle={() => toggleSection("comfort")}
      >
        {comfortContent}
      </SettingsAccordion>

      <SettingsAccordion
        idPrefix={idPrefix}
        section="theme"
        title="Motyw aplikacji"
        description="Automatyczny wybór i dostępne motywy"
        icon={Palette}
        open={openSection === "theme"}
        onToggle={() => toggleSection("theme")}
      >
        {themeContent}
      </SettingsAccordion>

      <SettingsAccordion
        idPrefix={idPrefix}
        section="modules"
        title="Moduły"
        description="Widoczność i kolejność modułów"
        icon={LayoutGrid}
        open={openSection === "modules"}
        onToggle={() => toggleSection("modules")}
      >
        {modulesContent}
      </SettingsAccordion>

      <SettingsAccordion
        idPrefix={idPrefix}
        section="rest"
        title="Reszta"
        description="Pozostałe ustawienia"
        icon={MoreHorizontal}
        open={openSection === "rest"}
        onToggle={() => toggleSection("rest")}
      >
        <div className="app-settings-accordion__rows">
          <button
            type="button"
            className={`app-settings-accordion__row app-settings-accordion__row--privacy${privacy.enabled ? " is-active" : ""}`}
            aria-pressed={privacy.enabled}
            onClick={privacy.toggle}
          >
            <span className="app-settings-accordion__row-icon" aria-hidden="true">
              <EyeOff size={18} strokeWidth={1.7} />
            </span>
            <span className="app-settings-accordion__row-copy">
              <strong>{privacy.enabled ? "Tryb prywatny włączony" : "Tryb prywatny"}</strong>
              <small>Ukrywa kwoty, pomiary i prywatne treści · Ctrl ⇧ P</small>
            </span>
            <span className="app-settings-accordion__switch" aria-hidden="true"><span /></span>
          </button>

          <div className="app-settings-accordion__action">
            <RecoveryCenterButton
              label="Kopie zapasowe"
              className="app-settings-accordion__action-button"
              trailingIcon={<ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" />}
            />
          </div>

          <button
            type="button"
            className="app-settings-accordion__row app-settings-accordion__row--button"
            onClick={onOpenHelp}
          >
            <span className="app-settings-accordion__row-icon" aria-hidden="true">
              <CircleHelp size={18} strokeWidth={1.7} />
            </span>
            <span className="app-settings-accordion__row-copy">
              <strong>Skróty klawiszowe</strong>
              <small>Przeglądaj dostępne skróty</small>
            </span>
            <span className="app-settings-accordion__row-trailing" aria-hidden="true">
              <ChevronRight size={17} strokeWidth={1.7} />
            </span>
          </button>
        </div>
      </SettingsAccordion>
    </div>
  );
}
