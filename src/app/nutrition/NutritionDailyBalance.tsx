import { Settings } from "lucide-react";
import { type NutritionValues } from "../data/nutritionCatalog";
import type { NutritionGoals } from "../data/nutritionWorkspace";
import { Button, Card, SectionHeader, SectionSurface, uiColors } from "../ui";
import { NUTRIENT_META, formatNumber } from "./nutritionPresentationModel";

export function NutritionDailyBalance({
  totals,
  goals,
  onOpenGoals,
}: {
  totals: NutritionValues;
  goals: NutritionGoals;
  onOpenGoals: () => void;
}) {
  const calorieGoal = goals.calories;
  const calorieRatio = calorieGoal > 0 ? totals.calories / calorieGoal : 0;
  const calorieRemaining = calorieGoal - totals.calories;
  const calorieStatus = calorieRemaining < 0
    ? `Przekroczono o ${formatNumber(Math.abs(calorieRemaining))} kcal`
    : calorieRatio >= 0.9 ? "Blisko celu" : `Pozostało ${formatNumber(calorieRemaining)} kcal`;

  return (
    <SectionSurface elevated padding="default" className="nutrition-summary-card">
      <SectionHeader
        title="Bilans dnia"
        variant="label"
        action={(
          <Button variant="ghost" size="sm" iconOnly aria-label="Ustaw cele kalorii i makroskładników" onClick={onOpenGoals}>
            <Settings size={13} />
          </Button>
        )}
      />
      <Card tone="card" padding="default" className="nutrition-budget-card">
        <div className="nutrition-budget-card__primary">
          <div><span>Kalorie</span><strong>{formatNumber(totals.calories)} / {formatNumber(calorieGoal)} kcal</strong></div>
          <p className={calorieRemaining < 0 ? "is-over" : ""}>{calorieStatus}</p>
          <div className="nutrition-budget-card__bar" role="progressbar" aria-label="Kalorie" aria-valuemin={0} aria-valuemax={Math.max(calorieGoal, totals.calories, 1)} aria-valuenow={totals.calories}>
            <i style={{ transform: `scaleX(${Math.min(1, calorieRatio)})` }} />
          </div>
        </div>
        <div className="nutrition-budget-card__macro-list">
          {NUTRIENT_META.filter(({ key }) => key !== "calories").map(({ key, label, unit, color }) => {
            const current = totals[key];
            const goal = goals[key];
            const remaining = goal - current;
            const ratio = goal > 0 ? current / goal : 0;
            const status = key === "protein"
              ? ratio >= 1 ? "Cel osiągnięty" : ratio >= 0.9 ? "Cel prawie osiągnięty" : `Pozostało ${formatNumber(remaining)} ${unit}`
              : remaining < 0 ? `Przekroczono o ${formatNumber(Math.abs(remaining))} ${unit}` : `Pozostało ${formatNumber(remaining)} ${unit}`;
            return (
              <div key={key} className="nutrition-budget-card__macro">
                <div className="nutrition-budget-card__macro-head"><span>{label}</span><strong>{formatNumber(current)} / {formatNumber(goal)} {unit}</strong></div>
                <p className={key === "fat" && remaining < 0 ? "is-over" : ""}>{status}</p>
                <div className="nutrition-budget-card__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(goal, current, 1)} aria-valuenow={current}>
                  <i style={{ transform: `scaleX(${Math.min(1, ratio)})`, background: ratio > 1 ? uiColors.danger : color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </SectionSurface>
  );
}
