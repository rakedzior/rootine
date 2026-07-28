import { useId, useMemo } from "react";
import type {
  NutritionDay,
  NutritionGoals,
  WeightMeasurement,
} from "../data/nutritionWorkspace";

export type NutritionAnalysisRange = 7 | 30 | 90;

interface NutritionAnalysisProps {
  endDate: string;
  days: Record<string, NutritionDay>;
  goals: NutritionGoals;
  weightMeasurements: Record<string, WeightMeasurement>;
  range: NutritionAnalysisRange;
  onRangeChange: (range: NutritionAnalysisRange) => void;
}

interface AnalysisPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  hasDietEntry: boolean;
  weightKg?: number;
}

const RANGE_OPTIONS = [
  { id: "7", label: "7 dni" },
  { id: "30", label: "30 dni" },
  { id: "90", label: "3 miesiące" },
];

const CHART = {
  width: 720,
  height: 224,
  left: 34,
  right: 46,
  top: 20,
  bottom: 184,
};

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sumDay(day?: NutritionDay) {
  if (!day) return { calories: 0, protein: 0, carbs: 0, fat: 0, hasDietEntry: false };
  const entries = Object.values(day.entries).flat();
  return entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories,
    protein: sum.protein + entry.protein,
    carbs: sum.carbs + entry.carbs,
    fat: sum.fat + entry.fat,
    hasDietEntry: true,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, hasDietEntry: false });
}

export function buildNutritionAnalysis(
  endDate: string,
  range: NutritionAnalysisRange,
  days: Record<string, NutritionDay>,
  weightMeasurements: Record<string, WeightMeasurement>,
) {
  return Array.from({ length: range }, (_, index): AnalysisPoint => {
    const date = shiftDateKey(endDate, index - range + 1);
    return {
      date,
      ...sumDay(days[date]),
      weightKg: weightMeasurements[date]?.weightKg,
    };
  });
}

function formatDateShort(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits });
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function signedWeight(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)} kg`;
}

export function NutritionAnalysis({
  endDate,
  days,
  goals,
  weightMeasurements,
  range,
  onRangeChange,
}: NutritionAnalysisProps) {
  const rangeName = useId();
  const points = useMemo(
    () => buildNutritionAnalysis(endDate, range, days, weightMeasurements),
    [days, endDate, range, weightMeasurements],
  );
  const dietPoints = points.filter((point) => point.hasDietEntry);
  const weightPoints = points.filter((point): point is AnalysisPoint & { weightKg: number } => point.weightKg !== undefined);
  const latestWeight = weightPoints.at(-1);
  const weightChange = weightPoints.length > 1
    ? weightPoints[weightPoints.length - 1].weightKg - weightPoints[0].weightKg
    : null;
  const averageCalories = average(dietPoints.map((point) => point.calories));
  const macroAverages = [
    { label: "Białko", value: average(dietPoints.map((point) => point.protein)), goal: goals.protein, className: "is-protein" },
    { label: "Węglowodany", value: average(dietPoints.map((point) => point.carbs)), goal: goals.carbs, className: "is-carbs" },
    { label: "Tłuszcze", value: average(dietPoints.map((point) => point.fat)), goal: goals.fat, className: "is-fat" },
  ];

  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.bottom - CHART.top;
  const pointX = (index: number) => CHART.left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
  const calorieY = (calories: number) => CHART.bottom - Math.min(calories / goals.calories, 1.25) / 1.25 * plotHeight;
  const goalY = calorieY(goals.calories);
  const barWidth = Math.max(2, Math.min(14, plotWidth / points.length * 0.58));

  const weights = weightPoints.map((point) => point.weightKg);
  const rawWeightMin = weights.length ? Math.min(...weights) : 0;
  const rawWeightMax = weights.length ? Math.max(...weights) : 1;
  const weightPadding = Math.max(0.4, (rawWeightMax - rawWeightMin) * 0.2);
  const weightMin = rawWeightMin - weightPadding;
  const weightMax = rawWeightMax + weightPadding;
  const weightY = (weight: number) => CHART.bottom - (weight - weightMin) / Math.max(0.1, weightMax - weightMin) * plotHeight;
  const weightPolyline = weightPoints
    .map((point) => {
      const index = points.findIndex((candidate) => candidate.date === point.date);
      return `${pointX(index)},${weightY(point.weightKg)}`;
    })
    .join(" ");
  const tickIndexes = [...new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round((points.length - 1) * ratio)))];
  const hasAnyData = dietPoints.length > 0 || weightPoints.length > 0;

  return (
    <div className="nutrition-analysis">
      <div className="nutrition-analysis__toolbar">
        <div>
          <h3>Trend diety i masy</h3>
          <p>Okres kończy się {formatDateShort(endDate)}. Brak wpisu nie jest liczony jako zero.</p>
        </div>
        <fieldset className="nutrition-analysis__range">
          <legend className="ui-sr-only">Zakres analizy</legend>
          {RANGE_OPTIONS.map((option) => (
            <label key={option.id}>
              <input
                className="ui-sr-only"
                type="radio"
                name={rangeName}
                value={option.id}
                checked={String(range) === option.id}
                onChange={() => onRangeChange(Number(option.id) as NutritionAnalysisRange)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="nutrition-analysis__summary" aria-label="Podsumowanie wybranego okresu">
        <div>
          <span>Ostatnia waga</span>
          <strong>{latestWeight ? `${formatNumber(latestWeight.weightKg)} kg` : "Brak pomiaru"}</strong>
          <small>{latestWeight ? formatDateShort(latestWeight.date) : "Dodaj pierwszy wpis"}</small>
        </div>
        <div>
          <span>Zmiana wagi</span>
          <strong className={weightChange === null ? "" : weightChange > 0 ? "is-up" : weightChange < 0 ? "is-down" : ""}>
            {weightChange === null ? "—" : signedWeight(weightChange)}
          </strong>
          <small>{weightPoints.length > 1 ? `${weightPoints.length} pomiarów` : "Potrzebne 2 pomiary"}</small>
        </div>
        <div>
          <span>Średnie kalorie</span>
          <strong>{dietPoints.length ? `${formatNumber(averageCalories, 0)} kcal` : "—"}</strong>
          <small>{dietPoints.length ? `${formatNumber(averageCalories / goals.calories * 100, 0)}% celu` : "Brak wpisów"}</small>
        </div>
        <div>
          <span>Zapisane dni</span>
          <strong>{dietPoints.length} / {range}</strong>
          <small>z posiłkami</small>
        </div>
      </div>

      {hasAnyData ? (
        <div className="nutrition-analysis__chart-wrap">
          <div className="nutrition-analysis__legend" aria-hidden="true">
            <span><i className="is-calories" />Kalorie</span>
            <span><i className="is-weight" />Masa ciała</span>
          </div>
          <svg
            className="nutrition-analysis__chart"
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            role="img"
            aria-label={`Wykres kalorii i masy ciała z ostatnich ${range} dni`}
          >
            <line className="nutrition-analysis__axis" x1={CHART.left} y1={CHART.bottom} x2={CHART.width - CHART.right} y2={CHART.bottom} />
            <line className="nutrition-analysis__goal-line" x1={CHART.left} y1={goalY} x2={CHART.width - CHART.right} y2={goalY} />
            <text className="nutrition-analysis__axis-label" x={CHART.left} y={goalY - 6}>cel kcal</text>

            {points.map((point, index) => point.hasDietEntry && (
              <rect
                key={`calories-${point.date}`}
                className="nutrition-analysis__bar"
                x={pointX(index) - barWidth / 2}
                y={calorieY(point.calories)}
                width={barWidth}
                height={CHART.bottom - calorieY(point.calories)}
                rx={Math.min(2, barWidth / 2)}
              >
                <title>{formatDateShort(point.date)}: {formatNumber(point.calories, 0)} kcal</title>
              </rect>
            ))}

            {weightPolyline && <polyline className="nutrition-analysis__weight-line" points={weightPolyline} />}
            {weightPoints.map((point) => {
              const index = points.findIndex((candidate) => candidate.date === point.date);
              return (
                <circle
                  key={`weight-${point.date}`}
                  className="nutrition-analysis__weight-point"
                  cx={pointX(index)}
                  cy={weightY(point.weightKg)}
                  r={3.5}
                >
                  <title>{formatDateShort(point.date)}: {formatNumber(point.weightKg)} kg</title>
                </circle>
              );
            })}

            {weights.length > 0 && (
              <>
                <text className="nutrition-analysis__weight-label" x={CHART.width - CHART.right + 8} y={CHART.top + 4}>
                  {formatNumber(weightMax)} kg
                </text>
                <text className="nutrition-analysis__weight-label" x={CHART.width - CHART.right + 8} y={CHART.bottom}>
                  {formatNumber(weightMin)} kg
                </text>
              </>
            )}

            {tickIndexes.map((index) => (
              <text
                key={`tick-${points[index].date}`}
                className="nutrition-analysis__date-label"
                x={pointX(index)}
                y={CHART.bottom + 24}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              >
                {formatDateShort(points[index].date)}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="nutrition-analysis__empty">
          Brak pomiarów wagi i zapisanych posiłków w tym okresie. Dodaj dane w dzienniku, aby zobaczyć trend.
        </div>
      )}

      <section className="nutrition-analysis__macros" aria-labelledby="nutrition-analysis-macros">
        <div>
          <h4 id="nutrition-analysis-macros">Średnia realizacja makro</h4>
          <p>Średnia jest liczona wyłącznie z dni zawierających posiłki.</p>
        </div>
        <div className="nutrition-analysis__macro-list">
          {macroAverages.map((macro) => {
            const ratio = macro.goal > 0 ? macro.value / macro.goal : 0;
            return (
              <div key={macro.label} className="nutrition-analysis__macro-row">
                <span>{macro.label}</span>
                <div className="nutrition-analysis__macro-track" aria-hidden="true">
                  <i className={macro.className} style={{ transform: `scaleX(${Math.min(1, ratio)})` }} />
                </div>
                <strong>{dietPoints.length ? `${formatNumber(macro.value)} / ${formatNumber(macro.goal)} g` : "—"}</strong>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
