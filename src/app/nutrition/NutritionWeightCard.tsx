import { Scale } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { WeightMeasurement } from "../data/nutritionWorkspace";
import { SensitiveValue } from "../experience/preferences";
import { Button, Card } from "../ui";
import { formatCompactDate, formatNumber } from "./nutritionPresentationModel";

interface WeightDraft {
  date: string;
  weightKg: string;
  note: string;
}

export function NutritionWeightCard({
  latestWeight,
  trend7d,
  inlineOpen,
  draft,
  error,
  disabled,
  setDraft,
  onRegister,
  onSubmit,
  onCancel,
  onClearError,
}: {
  latestWeight?: WeightMeasurement;
  trend7d: number | null;
  inlineOpen: boolean;
  draft: WeightDraft;
  error: string;
  disabled: boolean;
  setDraft: Dispatch<SetStateAction<WeightDraft>>;
  onRegister: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onClearError: () => void;
}) {
  return (
    <Card tone="panel" padding="default">
      {latestWeight ? (
        <div className="nutrition-weight-card nutrition-weight-card--compact">
          <div className="nutrition-weight-card__primary">
            <div className="nutrition-weight-card__identity">
              <Scale size={15} strokeWidth={1.5} />
              <div><p>Ostatni pomiar</p><span>{formatCompactDate(latestWeight.date)}</span></div>
            </div>
            <strong><SensitiveValue label="Masa ciała">{formatNumber(latestWeight.weightKg)} kg</SensitiveValue></strong>
          </div>
          <div className="nutrition-weight-card__trend">
            <span>Trend 7 dni</span>
            <strong>
              <SensitiveValue label="Trend masy ciała">
                {trend7d === null
                  ? "Za mało danych"
                  : `${trend7d > 0 ? "+" : trend7d < 0 ? "−" : ""}${formatNumber(Math.abs(trend7d))} kg`}
              </SensitiveValue>
            </strong>
          </div>
          <Button variant="quiet" size="sm" fullWidth onClick={onRegister}>Zarejestruj wagę</Button>
        </div>
      ) : (
        <div className="nutrition-weight-card nutrition-weight-card--empty">
          <Scale size={16} strokeWidth={1.5} />
          <div><strong>Brak pomiaru</strong><p>Dodaj wagę, aby rozpocząć śledzenie trendu.</p></div>
          <Button variant="quiet" size="sm" onClick={onRegister}>Zarejestruj wagę</Button>
        </div>
      )}
      {inlineOpen && (
        <form className="nutrition-weight-inline-form" onSubmit={onSubmit}>
          <div>
            <label htmlFor="nutrition-inline-weight">Waga (kg)</label>
            <input
              id="nutrition-inline-weight"
              autoFocus
              inputMode="decimal"
              type="text"
              placeholder="np. 81,9"
              value={draft.weightKg}
              onChange={(event) => {
                setDraft((current) => ({ ...current, weightKg: event.target.value.replace(/\./g, ",") }));
                onClearError();
              }}
            />
          </div>
          <Button type="submit" variant="quiet" size="sm" disabled={disabled || !draft.weightKg}>Zapisz</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Anuluj</Button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </Card>
  );
}
