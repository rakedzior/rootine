import { Check } from "lucide-react";
import {
  APP_THEMES,
  type AppThemeId,
} from "../theme/appTheme";

type ThemeSettingsProps = {
  idPrefix: string;
  value: AppThemeId;
  onChange: (themeId: AppThemeId) => void;
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
        <small>Zmiana zapisuje się automatycznie</small>
      </div>

      <div className="app-theme-settings__grid" role="radiogroup" aria-labelledby={titleId}>
        {APP_THEMES.map((theme) => {
          const selected = theme.id === value;

          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`app-theme-option${selected ? " is-selected" : ""}`}
              onClick={() => onChange(theme.id)}
            >
              <span className="app-theme-option__swatches" aria-hidden="true">
                {theme.swatches.map((swatch) => (
                  <span key={swatch} style={{ backgroundColor: swatch }} />
                ))}
              </span>
              <span className="app-theme-option__copy">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
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
