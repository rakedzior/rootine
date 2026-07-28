import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select } from "../ui";
import {
  ACTIVITY_INTENSITY_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  DIET_ADJUSTMENT_MODE_OPTIONS,
  EQUATION_VARIANT_OPTIONS,
  WORK_ACTIVITY_OPTIONS,
} from "../data/nutritionCalculator";
import type {
  ActivityDraft,
  CalculatorDraft,
  CalculatorErrors,
} from "./nutritionPresentationModel";

export function CalculatorProfileFields({
  draft,
  errors,
  includeDietGoal,
  onChange,
  onAddActivity,
  onChangeActivity,
  onRemoveActivity,
}: {
  draft: CalculatorDraft;
  errors: CalculatorErrors;
  includeDietGoal: boolean;
  onChange: (field: Exclude<keyof CalculatorDraft, "activities">, value: string) => void;
  onAddActivity: () => void;
  onChangeActivity: (id: string, field: Exclude<keyof ActivityDraft, "id">, value: string) => void;
  onRemoveActivity: (id: string) => void;
}) {
  return (
    <>
      <div className="nutrition-calculator-profile-grid">
        <Select
          label="Płeć"
          value={draft.equationVariant}
          error={errors.equationVariant}
          options={[
            { value: "", label: "Wybierz", disabled: true },
            ...EQUATION_VARIANT_OPTIONS,
          ]}
          onChange={(event) => onChange("equationVariant", event.target.value)}
        />
        <Input
          label="Wiek"
          type="number"
          min="18"
          max="100"
          step="1"
          placeholder="np. 32"
          value={draft.age}
          error={errors.age}
          onChange={(event) => onChange("age", event.target.value)}
        />
        <Input
          label="Waga (kg)"
          type="number"
          min="30"
          max="300"
          step="0.1"
          placeholder="np. 78"
          value={draft.weightKg}
          error={errors.weightKg}
          onChange={(event) => onChange("weightKg", event.target.value)}
        />
        <Input
          label="Wzrost (cm)"
          type="number"
          min="120"
          max="230"
          step="1"
          placeholder="np. 180"
          value={draft.heightCm}
          error={errors.heightCm}
          onChange={(event) => onChange("heightCm", event.target.value)}
        />
      </div>
      <Select
        label="Charakter pracy"
        value={draft.workActivity}
        error={errors.workActivity}
        options={WORK_ACTIVITY_OPTIONS}
        onChange={(event) => onChange("workActivity", event.target.value)}
      />
      <div className="nutrition-weekly-activities">
        <div className="nutrition-weekly-activities__header">
          <div>
            <h4>Aktywność fizyczna</h4>
            <p>Dodaj każdy typ treningu osobno. Wynik tygodnia zostanie przeliczony na średnią dzienną.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" leadingIcon={<Plus size={12} />} onClick={onAddActivity}>Dodaj aktywność</Button>
        </div>
        {draft.activities.length ? (
          <div className="nutrition-weekly-activities__list">
            {draft.activities.map((activity, index) => (
              <div key={activity.id} className="nutrition-weekly-activity">
                <Select
                  label={`Rodzaj ${index + 1}`}
                  value={activity.type}
                  options={ACTIVITY_TYPE_OPTIONS}
                  onChange={(event) => onChangeActivity(activity.id, "type", event.target.value)}
                />
                <Select
                  label="Intensywność"
                  value={activity.intensity}
                  options={ACTIVITY_INTENSITY_OPTIONS}
                  onChange={(event) => onChangeActivity(activity.id, "intensity", event.target.value)}
                />
                <Input
                  label="Razy / tydz."
                  type="number"
                  min="1"
                  max="14"
                  step="1"
                  value={activity.timesPerWeek}
                  onChange={(event) => onChangeActivity(activity.id, "timesPerWeek", event.target.value)}
                />
                <Input
                  label="Min / trening"
                  type="number"
                  min="5"
                  max="360"
                  step="5"
                  value={activity.minutesPerSession}
                  onChange={(event) => onChangeActivity(activity.id, "minutesPerSession", event.target.value)}
                />
                <Button type="button" variant="ghost" size="sm" iconOnly aria-label={`Usuń aktywność ${index + 1}`} onClick={() => onRemoveActivity(activity.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="nutrition-weekly-activities__empty">Brak regularnych treningów.</div>
        )}
        {errors.activities && <p className="ui-field__error" role="alert">{errors.activities}</p>}
      </div>
      {includeDietGoal && (
        <div className="nutrition-diet-adjustment">
          <Select
            label="Cel diety"
            value={draft.dietAdjustmentMode}
            error={errors.dietAdjustmentMode}
            options={DIET_ADJUSTMENT_MODE_OPTIONS}
            onChange={(event) => onChange("dietAdjustmentMode", event.target.value)}
          />
          <Input
            label={draft.dietAdjustmentMode === "percent" ? "Korekta (%)" : "Korekta (kcal)"}
            type="number"
            min={draft.dietAdjustmentMode === "percent" ? "-40" : "-2000"}
            max={draft.dietAdjustmentMode === "percent" ? "40" : "2000"}
            step={draft.dietAdjustmentMode === "percent" ? "1" : "50"}
            placeholder={draft.dietAdjustmentMode === "percent" ? "np. −15 lub +10" : "np. −500 lub +250"}
            value={draft.dietAdjustmentValue}
            error={errors.dietAdjustmentValue}
            hint="Wartość ujemna oznacza redukcję, 0 utrzymanie, dodatnia przyrost."
            onChange={(event) => onChange("dietAdjustmentValue", event.target.value)}
          />
        </div>
      )}
    </>
  );
}
