import { Check, MonitorCog } from "lucide-react";
import {
  APP_THEMES,
  type AppThemePreference,
} from "../theme/appTheme";

type ThemeSettingsProps = {
  idPrefix: string;
  value: AppThemePreference;
  onChange: (themeId: AppThemePreference) => void;
};

export function ThemeSettings({ idPrefix, value, onChange }: ThemeSettingsProps) {
  const titleId = `${idPrefix}-theme-settings-title`;

  return (
    <section className="app-theme-settings" aria-labelledby={titleId}>
      <div className="app-theme-settings__heading">
        <span>
          <strong id={titleId}>Motyw aplikacji</strong>
          <small>Kolory interfejsu, powierzchni i akcentów</small>
        </span>
        <small>Zmiana działa od razu i zapisuje się automatycznie</small>
      </div>

      <div className="app-theme-settings__grid" role="radiogroup" aria-labelledby={titleId}>
        <button
          type="button"
          role="radio"
          aria-checked={value === "system"}
          className={`app-theme-option app-theme-option--system${value === "system" ? " is-selected" : ""}`}
          onClick={() => onChange("system")}
        >
          <span className="app-theme-option__system-icon" aria-hidden="true">
            <MonitorCog size={16} strokeWidth={1.7} />
          </span>
          <span className="app-theme-option__copy">
            <strong>Automatycznie</strong>
            <small>Warm Linen w trybie jasnym, Midnight Instrument w ciemnym</small>
          </span>
          <span className="app-theme-option__status" aria-hidden="true">
            {value === "system" && <Check size={13} strokeWidth={2.2} />}
          </span>
        </button>

        {APP_THEMES.map((theme) => {
          const selected = theme.id === value;

          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-theme-option={theme.id}
              className={`app-theme-option${selected ? " is-selected" : ""}`}
              onClick={() => onChange(theme.id)}
            >
              <span className="app-theme-option__swatches" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="app-theme-option__copy">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
                <em>{theme.role}</em>
              </span>
              <span className="app-theme-option__status" aria-hidden="true">
                {selected && <Check size={13} strokeWidth={2.2} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
