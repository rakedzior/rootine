import { useEffect, useId, useMemo, useState } from "react";
import type { NutritionDay, NutritionGoals, WeightMeasurement } from "../data/nutritionWorkspace";
import { SensitiveValue, usePrivacy } from "../experience/preferences";

export type NutritionAnalysisRange = 7 | 14 | 30 | 90 | "custom";

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
  waterMl: number;
  hasDietEntry: boolean;
  weightKg?: number;
}

type ChartMode = "weight" | "calories";

const RANGE_OPTIONS = [
  { id: "7", label: "7 dni" },
  { id: "14", label: "14 dni" },
  { id: "30", label: "30 dni" },
  { id: "90", label: "3 miesiące" },
];

RANGE_OPTIONS.push({ id: "custom", label: "Własny zakres" });

const CHART = { width: 760, height: 260, left: 42, right: 58, top: 24, bottom: 210 };

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sumDay(day?: NutritionDay) {
  if (!day) return { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0, hasDietEntry: false };
  const entries = Object.values(day.entries).flat();
  return entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories,
    protein: sum.protein + entry.protein,
    carbs: sum.carbs + entry.carbs,
    fat: sum.fat + entry.fat,
    waterMl: day.waterMl,
    hasDietEntry: true,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: day.waterMl, hasDietEntry: false });
}

function dateKeysBetween(startDate: string, endDate: string) {
  if (startDate > endDate) return [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const days = Math.min(366, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return Array.from({ length: days }, (_, index) => shiftDateKey(startDate, index));
}

function buildPoints(startDate: string, endDate: string, days: Record<string, NutritionDay>, weights: Record<string, WeightMeasurement>) {
  return dateKeysBetween(startDate, endDate).map((date): AnalysisPoint => ({
    date,
    ...sumDay(days[date]),
    weightKg: weights[date]?.weightKg,
  }));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits });
}

function formatDateShort(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}

function signed(value: number, unit: string) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)} ${unit}`;
}

export function NutritionAnalysis({
  endDate,
  days,
  goals,
  weightMeasurements,
  range,
  onRangeChange,
}: NutritionAnalysisProps) {
  const { enabled: privacyMode } = usePrivacy();
  const rangeName = useId();
  const [chartMode, setChartMode] = useState<ChartMode>("weight");
  const [customStartDate, setCustomStartDate] = useState(() => shiftDateKey(endDate, -29));
  const [customEndDate, setCustomEndDate] = useState(endDate);
  useEffect(() => {
    setCustomEndDate(endDate);
    setCustomStartDate(shiftDateKey(endDate, -29));
  }, [endDate]);
  const standardRange = range === "custom" ? 30 : range;
  const activeStartDate = range === "custom" ? customStartDate : shiftDateKey(endDate, -standardRange + 1);
  const activeEndDate = range === "custom" ? customEndDate : endDate;
  const points = useMemo(() => buildPoints(activeStartDate, activeEndDate, days, weightMeasurements), [activeEndDate, activeStartDate, days, weightMeasurements]);
  const dietPoints = points.filter((point) => point.hasDietEntry);
  const weightPoints = points.filter((point): point is AnalysisPoint & { weightKg: number } => point.weightKg !== undefined);
  const waterPoints = points.filter((point) => point.waterMl > 0);
  const averageCalories = average(dietPoints.map((point) => point.calories));
  const averageProtein = average(dietPoints.map((point) => point.protein));
  const averageCarbs = average(dietPoints.map((point) => point.carbs));
  const averageFat = average(dietPoints.map((point) => point.fat));
  const averageWater = average(waterPoints.map((point) => point.waterMl));
  const averageWeight = average(weightPoints.map((point) => point.weightKg));
  const weightChange = weightPoints.length > 1 ? weightPoints.at(-1)!.weightKg - weightPoints[0].weightKg : null;
  const hasChartData = chartMode === "weight" ? weightPoints.length > 0 : dietPoints.length > 0;

  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.bottom - CHART.top;
  const pointX = (index: number, count = points.length) => CHART.left + (count <= 1 ? plotWidth / 2 : index / (count - 1) * plotWidth);
  const weights = weightPoints.map((point) => point.weightKg);
  const weightMin = weights.length ? Math.min(...weights) - Math.max(0.4, (Math.max(...weights) - Math.min(...weights)) * 0.2) : 0;
  const weightMax = weights.length ? Math.max(...weights) + Math.max(0.4, (Math.max(...weights) - Math.min(...weights)) * 0.2) : 1;
  const weightY = (value: number) => CHART.bottom - (value - weightMin) / Math.max(0.1, weightMax - weightMin) * plotHeight;
  const weightPolyline = weightPoints.map((point) => `${pointX(points.findIndex((candidate) => candidate.date === point.date))},${weightY(point.weightKg)}`).join(" ");
  const maxCalories = Math.max(goals.calories, ...dietPoints.map((point) => point.calories), 1);
  const calorieY = (value: number) => CHART.bottom - value / maxCalories * plotHeight;
  const calorieBarWidth = Math.max(4, Math.min(18, plotWidth / points.length * 0.58));
  const tickIndexes = [...new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.max(0, Math.round((points.length - 1) * ratio))))];
  const customRangeInvalid = range === "custom" && customStartDate > customEndDate;

  return (
    <div className="nutrition-analysis">
      <div className="nutrition-analysis__range-bar">
        <div>
          <strong>Zakres danych</strong>
          <span>{formatDateShort(points[0]?.date ?? activeStartDate)} — {formatDateShort(activeEndDate)}</span>
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
                onChange={() => onRangeChange(option.id === "custom" ? "custom" : Number(option.id) as NutritionAnalysisRange)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {range === "custom" && (
        <div className="nutrition-analysis__custom-range">
          <label>
            <span>Od</span>
            <input type="date" value={customStartDate} max={customEndDate} onChange={(event) => setCustomStartDate(event.target.value)} />
          </label>
          <label>
            <span>Do</span>
            <input type="date" value={customEndDate} min={customStartDate} max={endDate} onChange={(event) => setCustomEndDate(event.target.value)} />
          </label>
          {customRangeInvalid && <p role="alert">Data początkowa musi być wcześniejsza od końcowej.</p>}
        </div>
      )}

      <div className="nutrition-analysis__kpis" aria-label="Podsumowanie wybranego okresu">
        <div className="nutrition-analysis__kpi is-calories"><span>Średnie kcal</span><strong>{dietPoints.length ? `${formatNumber(averageCalories, 0)} kcal` : "—"}</strong><small>{dietPoints.length ? `${formatNumber(averageCalories / goals.calories * 100, 0)}% celu` : "Brak posiłków"}</small></div>
        <div className="nutrition-analysis__kpi is-macros">
          <span>Średnie makro</span>
          {dietPoints.length ? (
            <div className="nutrition-analysis__macro-kpi-values">
              <strong className="is-protein">B {formatNumber(averageProtein)} g</strong>
              <strong className="is-carbs">W {formatNumber(averageCarbs)} g</strong>
              <strong className="is-fat">T {formatNumber(averageFat)} g</strong>
            </div>
          ) : <strong>—</strong>}
          <small>na dzień z wpisem</small>
        </div>
        <div className="nutrition-analysis__kpi is-weight">
          <span>Średnia masa</span>
          <strong><SensitiveValue label="Średnia masa">{weightPoints.length ? `${formatNumber(averageWeight)} kg` : "—"}</SensitiveValue></strong>
          <small>{privacyMode ? "Dane ukryte w Privacy Mode" : weightChange === null ? "Potrzebne 2 pomiary" : `Zmiana ${signed(weightChange, "kg")}`}</small>
        </div>
        <div className="nutrition-analysis__kpi is-water"><span>Średnie nawodnienie</span><strong>{waterPoints.length ? `${formatNumber(averageWater, 0)} ml` : "—"}</strong><small>{waterPoints.length ? `z ${waterPoints.length} zapisanych dni` : "Brak wpisów wody"}</small></div>
      </div>

      <section className="nutrition-analysis__chart-panel" aria-label="Wykres trendu">
        <div className="nutrition-analysis__chart-heading">
          <div>
            <h3>{chartMode === "weight" ? "Masa ciała w czasie" : "Kalorie w czasie"}</h3>
            <p>{chartMode === "weight" ? "Zapisane pomiary w wybranym okresie." : "Dni z posiłkami względem celu kalorii."}</p>
          </div>
          <div className="nutrition-analysis__chart-switch" role="group" aria-label="Widok wykresu">
            <button type="button" className={chartMode === "weight" ? "is-active" : ""} onClick={() => setChartMode("weight")}>Masa</button>
            <button type="button" className={chartMode === "calories" ? "is-active" : ""} onClick={() => setChartMode("calories")}>Kalorie</button>
          </div>
        </div>
        {privacyMode && chartMode === "weight" ? (
          <div className="nutrition-analysis__empty" role="status">Wartości masy ciała są ukryte w Privacy Mode.</div>
        ) : hasChartData ? (
          <svg className="nutrition-analysis__chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={chartMode === "weight" ? "Wykres masy ciała" : "Wykres kalorii z celem"}>
            <line className="nutrition-analysis__axis" x1={CHART.left} y1={CHART.bottom} x2={CHART.width - CHART.right} y2={CHART.bottom} />
            {chartMode === "weight" ? (
              <>
                <polyline className="nutrition-analysis__weight-line" points={weightPolyline} />
                {weightPoints.map((point) => {
                  const index = points.findIndex((candidate) => candidate.date === point.date);
                  return <circle key={point.date} className="nutrition-analysis__weight-point" cx={pointX(index)} cy={weightY(point.weightKg)} r={4}><title>{formatDateShort(point.date)}: {formatNumber(point.weightKg)} kg</title></circle>;
                })}
                <text className="nutrition-analysis__weight-label" x={CHART.width - CHART.right + 8} y={CHART.top + 4}>{formatNumber(weightMax)} kg</text>
                <text className="nutrition-analysis__weight-label" x={CHART.width - CHART.right + 8} y={CHART.bottom}>{formatNumber(weightMin)} kg</text>
              </>
            ) : (
              <>
                <line className="nutrition-analysis__goal-line" x1={CHART.left} y1={calorieY(goals.calories)} x2={CHART.width - CHART.right} y2={calorieY(goals.calories)} />
                <text className="nutrition-analysis__axis-label" x={CHART.left} y={calorieY(goals.calories) - 7}>cel {formatNumber(goals.calories, 0)} kcal</text>
                {points.map((point, index) => point.hasDietEntry && (
                  <rect key={point.date} className={point.calories > goals.calories ? "nutrition-analysis__bar is-over" : "nutrition-analysis__bar"} x={pointX(index) - calorieBarWidth / 2} y={calorieY(point.calories)} width={calorieBarWidth} height={CHART.bottom - calorieY(point.calories)} rx={3}>
                    <title>{formatDateShort(point.date)}: {formatNumber(point.calories, 0)} kcal</title>
                  </rect>
                ))}
              </>
            )}
            {tickIndexes.map((index) => (
              <text key={points[index].date} className="nutrition-analysis__date-label" x={pointX(index)} y={CHART.bottom + 25} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{formatDateShort(points[index].date)}</text>
            ))}
          </svg>
        ) : (
          <div className="nutrition-analysis__empty">Brak danych dla tego widoku w wybranym okresie.</div>
        )}
      </section>

      <p className="nutrition-analysis__note">Brak wpisu nie jest liczony jako zero. Średnie dotyczą wyłącznie dni z odpowiednim zapisem.</p>
    </div>
  );
}
