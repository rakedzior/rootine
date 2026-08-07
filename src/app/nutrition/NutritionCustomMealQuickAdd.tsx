import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, DatePicker, Input, Modal, Select } from "../ui";
import { pluralize } from "../formatters";
import type { MealSlot, NutritionEntry } from "../data/nutritionWorkspace";
import {
  customMealPer100g,
  customMealSelectionGrams,
  customMealSelectionValues,
  customMealWeight,
  type CustomMeal,
  type CustomMealAmountMode,
} from "../data/nutritionMeals";
import { formatNumber, MEAL_META, parseDraftNumber } from "./nutritionPresentationModel";

/**
 * Adds a saved dish to a day. The result is an ordinary journal entry — the daily
 * register has no idea it came from the library, and shows it like any other product.
 */
export function NutritionCustomMealQuickAdd({
  meal,
  defaultDate,
  isDayClosed,
  onClose,
  onSubmit,
}: {
  meal: CustomMeal;
  defaultDate: string;
  isDayClosed: (date: string) => boolean;
  onClose: () => void;
  onSubmit: (date: string, slot: MealSlot, entry: NutritionEntry) => void;
}) {
  const hasServings = Boolean(meal.servings && meal.servings > 0);
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<MealSlot>("lunch");
  const [mode, setMode] = useState<CustomMealAmountMode>(hasServings ? "servings" : "grams");
  const [servingsValue, setServingsValue] = useState("1");
  const [gramsValue, setGramsValue] = useState(() => String(Math.round(customMealWeight(meal)) || 100));
  const [error, setError] = useState("");

  const rawValue = mode === "servings" ? servingsValue : gramsValue;
  const selection = { mode, value: parseDraftNumber(rawValue) };
  const values = customMealSelectionValues(meal, selection);
  const grams = customMealSelectionGrams(meal, selection);
  const dayClosed = isDayClosed(date);

  const submit = () => {
    if (dayClosed) {
      setError("Ten dzień jest zamknięty. Otwórz go ponownie, aby dodać posiłek.");
      return;
    }
    if (!values) {
      setError(mode === "servings"
        ? "Podaj liczbę porcji większą od zera."
        : "Podaj liczbę gramów większą od zera.");
      return;
    }

    onSubmit(date, slot, {
      id: `nutrition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: meal.name,
      portion: mode === "servings"
        ? pluralize(selection.value, "porcja", "porcje", "porcji")
        : `${formatNumber(selection.value)} g`,
      amount: grams ?? undefined,
      unit: grams ? "g" : undefined,
      calories: values.calories,
      protein: values.protein,
      carbs: values.carbs,
      fat: values.fat,
      per100g: customMealPer100g(meal) ?? undefined,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Modal
      title={`Dodaj: ${meal.name}`}
      eyebrow="Własne posiłki"
      description="Wybierz dzień, kategorię i ilość. Posiłek trafi do dziennika jak każdy inny produkt."
      size="md"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button variant="primary" leadingIcon={<Plus size={13} />} onClick={submit}>Dodaj do dziennika</Button>
        </>
      )}
    >
      <div className="nutrition-quick-add">
        <div className="nutrition-amount-grid">
          <DatePicker
            label="Dzień"
            value={date}
            onChange={(value) => {
              setDate(value || defaultDate);
              setError("");
            }}
          />
          <Select
            label="Kategoria"
            value={slot}
            options={MEAL_META.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(event) => setSlot(event.target.value as MealSlot)}
          />
        </div>

        <div className="nutrition-quick-add__mode">
          <span className="ui-field__label">Sposób określenia ilości</span>
          <div className="nutrition-water-calculator-switch" role="group" aria-label="Sposób określenia ilości">
            <Button
              type="button"
              variant={mode === "servings" ? "primary" : "quiet"}
              size="sm"
              disabled={!hasServings}
              aria-pressed={mode === "servings"}
              title={hasServings ? undefined : "Ten posiłek nie ma zapisanej liczby porcji."}
              onClick={() => {
                setMode("servings");
                setError("");
              }}
            >
              Porcja
            </Button>
            <Button
              type="button"
              variant={mode === "grams" ? "primary" : "quiet"}
              size="sm"
              aria-pressed={mode === "grams"}
              onClick={() => {
                setMode("grams");
                setError("");
              }}
            >
              Gramy gotowego dania
            </Button>
          </div>
        </div>

        {mode === "servings" ? (
          <Input
            label="Liczba porcji"
            type="number"
            min="0.5"
            step="0.5"
            value={servingsValue}
            hint={`Zapisane porcje: ${meal.servings}. ${grams ? `Wybrana ilość to około ${formatNumber(grams)} g.` : ""}`.trim()}
            data-autofocus
            onChange={(event) => {
              setServingsValue(event.target.value);
              setError("");
            }}
          />
        ) : (
          <Input
            label="Gramy gotowego dania"
            type="number"
            min="1"
            step="10"
            value={gramsValue}
            hint={`Całe danie waży ${formatNumber(customMealWeight(meal))} g.`}
            data-autofocus
            onChange={(event) => {
              setGramsValue(event.target.value);
              setError("");
            }}
          />
        )}

        <div className="nutrition-meal-summary-panel" aria-live="polite">
          <div>
            <h4>Do dodania</h4>
            {values ? (
              <div className="nutrition-calculation-ledger">
                <div><span>Kalorie</span><strong>{formatNumber(values.calories)} kcal</strong></div>
                <div><span>Białko</span><strong>{formatNumber(values.protein)} g</strong></div>
                <div><span>Węglowodany</span><strong>{formatNumber(values.carbs)} g</strong></div>
                <div><span>Tłuszcze</span><strong>{formatNumber(values.fat)} g</strong></div>
              </div>
            ) : (
              <p className="nutrition-meal-summary-panel__empty">Podaj ilość, aby zobaczyć podgląd.</p>
            )}
          </div>
        </div>

        {dayClosed && !error && (
          <p className="nutrition-goal-error" role="status">Wybrany dzień jest zamknięty. Otwórz go ponownie, aby dodać posiłek.</p>
        )}
        {error && <p className="nutrition-goal-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
