import type { ReactNode } from "react";
import type { NutritionValues } from "../data/nutritionCatalog";
import type { NutritionGoals } from "../data/nutritionWorkspace";
import { Button, SectionSurface } from "../ui";
import { NUTRIENT_META, formatNumber } from "./nutritionPresentationModel";

export function NutritionDailyBalance({
  totals,
  goals,
  onOpenGoals,
  waterPanel,
}: {
  totals: NutritionValues;
  goals: NutritionGoals;
  onOpenGoals: () => void;
  waterPanel?: ReactNode;
}) {
  const calorieGoal = Math.max(0, goals.calories);
  const calorieRatio = calorieGoal > 0 ? totals.calories / calorieGoal : 0;
  const calorieRemaining = calorieGoal - totals.calories;
  const hasNutritionGoal = calorieGoal > 0 && [goals.protein, goals.carbs, goals.fat].every((value) => value > 0);
  const calorieStatus = calorieGoal <= 0
    ? "Brak celu kalorii"
    : calorieRemaining < 0
      ? `${formatNumber(Math.abs(calorieRemaining))} kcal ponad cel`
      : `${formatNumber(calorieRemaining)} kcal pozostało`;

  return (
    <SectionSurface elevated padding="default" className="nutrition-summary-card nutrition-daily-balance">
      <div className="nutrition-budget-card">
        {!hasNutritionGoal && (
          <div className="nutrition-no-goal" role="status">
            <span>Ustaw cel żywieniowy, aby śledzić bilans dnia.</span>
            <Button variant="quiet" size="sm" onClick={onOpenGoals}>Ustaw cel</Button>
          </div>
        )}
        <div className="nutrition-budget-card__top">
          <div className={`nutrition-budget-card__primary${calorieRemaining < 0 ? " is-over" : ""}`}>
            <div><span>Kalorie</span><strong className="nutrition-budget-card__amount"><b>{formatNumber(totals.calories)}</b><span> / {formatNumber(calorieGoal)} kcal</span></strong></div>
            <div className="nutrition-budget-card__bar" role="progressbar" aria-label="Kalorie" aria-valuemin={0} aria-valuemax={Math.max(calorieGoal, totals.calories, 1)} aria-valuenow={totals.calories}>
              <i style={{ transform: `scaleX(${Math.min(1, calorieRatio)})` }} />
            </div>
            <p className={calorieRemaining < 0 ? "is-over" : ""}>{calorieStatus}</p>
          </div>
          {waterPanel && <div className="nutrition-daily-balance__water-panel">{waterPanel}</div>}
        </div>
        <div className="nutrition-budget-card__macro-list" aria-label="Makroskładniki">
          {NUTRIENT_META.filter(({ key }) => key !== "calories").map(({ key, label: nutrientLabel, unit }) => {
            const label = key === "carbs" ? "Węgle" : key === "fat" ? "Tłuszcz" : nutrientLabel;
            return (
            <div key={key} className="nutrition-budget-card__macro">
              <span>{label}</span>
              <strong>{formatNumber(totals[key])} / {formatNumber(goals[key])} {unit}</strong>
            </div>
            );
          })}
        </div>
      </div>
    </SectionSurface>
  );
}
