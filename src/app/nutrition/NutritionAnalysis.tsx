import {
  CalendarDays,
  Droplets,
  Flame,
  Info,
  Scale,
  Sparkles,
  Sprout,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { NutritionDay, NutritionGoals, WeightMeasurement } from "../data/nutritionWorkspace";
import { SensitiveValue, usePrivacy } from "../experience/preferences";
import { DatePicker } from "../ui";

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

interface ChartPoint {
  startDate: string;
  endDate: string;
  calories: number | null;
  hasDietEntry: boolean;
  dietSamples: number;
  weightKg?: number;
  weightSamples: number;
}

type InsightTone = "info" | "warning" | "danger" | "positive" | "neutral";

const RANGE_OPTIONS = [
  { id: "7", label: "7 dni" },
  { id: "14", label: "14 dni" },
  { id: "30", label: "30 dni" },
  { id: "90", label: "3 miesiące" },
  { id: "custom", label: "Własny zakres" },
] as const;

const CHART = { width: 720, left: 48, right: 28, top: 24 };

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

function chartBucketDays(totalDays: number) {
  if (totalDays <= 14) return 1;
  if (totalDays <= 45) return 3;
  return 7;
}

function chartFrequencyLabel(bucketDays: number) {
  if (bucketDays === 1) return "Dziennie";
  if (bucketDays === 3) return "Średnia 3-dniowa";
  return "Średnia tygodniowa";
}

function aggregateChartPoints(points: AnalysisPoint[], bucketDays: number): ChartPoint[] {
  return Array.from({ length: Math.ceil(points.length / bucketDays) }, (_, index) => {
    const bucket = points.slice(index * bucketDays, (index + 1) * bucketDays);
    const dietPoints = bucket.filter((point) => point.hasDietEntry);
    const weights = bucket.flatMap((point) => point.weightKg === undefined ? [] : [point.weightKg]);
    return {
      startDate: bucket[0].date,
      endDate: bucket.at(-1)!.date,
      calories: dietPoints.length ? average(dietPoints.map((point) => point.calories)) : null,
      hasDietEntry: dietPoints.length > 0,
      dietSamples: dietPoints.length,
      weightKg: weights.length ? average(weights) : undefined,
      weightSamples: weights.length,
    };
  });
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits });
}

function formatDateShort(dateKey: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}

function formatDateRange(startDate: string, endDate: string) {
  const end = new Date(`${endDate}T12:00:00`);
  const year = new Intl.DateTimeFormat("pl-PL", { year: "numeric" }).format(end);
  return `${formatDateShort(startDate)} – ${formatDateShort(endDate)} ${year}`;
}

function formatChartDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return {
    date: new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" }).format(date).replace(".", ""),
    weekday: new Intl.DateTimeFormat("pl-PL", { weekday: "short" }).format(date).replace(".", ""),
  };
}

function formatChartRange(point: Pick<ChartPoint, "startDate" | "endDate">) {
  return point.startDate === point.endDate
    ? formatDateShort(point.startDate)
    : `${formatDateShort(point.startDate)}–${formatDateShort(point.endDate)}`;
}

function signed(value: number, unit: string) {
  if (Math.abs(value) < 0.05) return `0 ${unit}`;
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))} ${unit}`;
}

function percentage(value: number, goal: number) {
  return goal > 0 ? Math.round(value / goal * 100) : 0;
}

function progress(value: number, goal: number) {
  return goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
}

function StatusChip({ tone, children }: { tone: InsightTone; children: string }) {
  return <span className={`nutrition-analysis-v2__status is-${tone}`}>{children}</span>;
}

function InfoButton({ label }: { label: string }) {
  return (
    <button type="button" className="nutrition-analysis-v2__info" aria-label={label} title={label}>
      <Info size={13} strokeWidth={1.7} />
    </button>
  );
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
  const [customStartDate, setCustomStartDate] = useState(() => shiftDateKey(endDate, -6));
  const [customEndDate, setCustomEndDate] = useState(endDate);

  useEffect(() => {
    setCustomEndDate(endDate);
    setCustomStartDate(shiftDateKey(endDate, -6));
  }, [endDate]);

  const standardRange = range === "custom" ? 7 : range;
  const activeStartDate = range === "custom" ? customStartDate : shiftDateKey(endDate, -standardRange + 1);
  const activeEndDate = range === "custom" ? customEndDate : endDate;
  const points = useMemo(
    () => buildPoints(activeStartDate, activeEndDate, days, weightMeasurements),
    [activeEndDate, activeStartDate, days, weightMeasurements],
  );
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
  const calorieShare = percentage(averageCalories, goals.calories);
  const proteinShare = percentage(averageProtein, goals.protein);
  const fatOverDays = dietPoints.filter((point) => point.fat > goals.fat).length;
  const proteinBelowDays = dietPoints.filter((point) => point.protein < goals.protein).length;
  const calorieStatus = !dietPoints.length
    ? { tone: "neutral" as const, label: "Brak wpisów" }
    : averageCalories > goals.calories
      ? { tone: "danger" as const, label: "Powyżej celu" }
      : calorieShare >= 90
        ? { tone: "positive" as const, label: "Blisko celu" }
        : { tone: "info" as const, label: "Poniżej celu" };
  const proteinStatus = !dietPoints.length
    ? { tone: "neutral" as const, label: "Brak wpisów" }
    : proteinShare >= 100
      ? { tone: "positive" as const, label: "Cel osiągnięty" }
      : proteinShare >= 90
        ? { tone: "positive" as const, label: "Białko: blisko celu" }
        : { tone: "warning" as const, label: "Białko: do uzupełnienia" };
  const waterStatus = !waterPoints.length
    ? { tone: "neutral" as const, label: "Brak wpisów" }
    : averageWater >= goals.waterMl
      ? { tone: "positive" as const, label: "Cel osiągnięty" }
      : { tone: "info" as const, label: "Do uzupełnienia" };
  const customRangeInvalid = range === "custom" && customStartDate > customEndDate;

  const insights = useMemo(() => {
    const result: Array<{ tone: InsightTone; text: string }> = [];
    result.push({
      tone: "info",
      text: dietPoints.length && goals.calories > 0
        ? `Średnie kalorie wynoszą ${calorieShare}% celu w dniach z wpisem.`
        : "Brak wpisów kalorii w wybranym okresie.",
    });
    result.push({
      tone: "warning",
      text: dietPoints.length && goals.protein > 0
        ? proteinBelowDays > dietPoints.length / 2
          ? "Białko było poniżej celu w większości dni z wpisem."
          : "Białko było poniżej celu w części dni z wpisem."
        : "Brak wystarczających danych o białku.",
    });
    result.push({
      tone: "danger",
      text: fatOverDays > 0
        ? `Tłuszcze przekroczyły cel w ${fatOverDays} ${fatOverDays === 1 ? "dniu" : "dniach"}.`
        : "Tłuszcze nie przekroczyły celu w dniach z wpisem.",
    });
    if (privacyMode) {
      result.push({ tone: "neutral", text: "Trend masy jest ukryty w Privacy Mode." });
    } else if (weightChange !== null) {
      result.push({
        tone: "positive",
        text: Math.abs(weightChange) < 0.05
          ? "Masa pozostała bez większej zmiany w wybranym okresie."
          : `Masa ${weightChange > 0 ? "wzrosła" : "spadła"} o ${formatNumber(Math.abs(weightChange))} kg w wybranym okresie.`,
      });
    } else {
      result.push({ tone: "positive", text: "Do pokazania trendu masy potrzebne są co najmniej 2 pomiary." });
    }
    result.push({
      tone: "info",
      text: points.length
        ? waterPoints.length === points.length
          ? `Nawodnienie zapisano w każdym z ${points.length} dni.`
          : `Nawodnienie zapisano tylko w ${waterPoints.length} z ${points.length} dni.`
        : "Brak wpisów nawodnienia w wybranym okresie.",
    });
    result.push({ tone: "neutral", text: "Braki wpisów nie są liczone jako zero." });
    return result;
  }, [calorieShare, dietPoints.length, fatOverDays, goals.calories, goals.protein, points.length, privacyMode, proteinBelowDays, waterPoints.length, weightChange]);

  const bucketDays = chartBucketDays(points.length);
  const chartFrequency = chartFrequencyLabel(bucketDays);
  const chartPoints = aggregateChartPoints(points, bucketDays);
  const chartDietPoints = chartPoints.filter((point) => point.hasDietEntry && point.calories !== null);
  const chartWeightPoints = chartPoints.filter((point): point is ChartPoint & { weightKg: number } => point.weightKg !== undefined);
  const chartHeight = chartPoints.length <= 3 ? 190 : 280;
  const chartBottom = chartPoints.length <= 3 ? 150 : 230;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = chartBottom - CHART.top;
  const pointX = (index: number) => CHART.left + (chartPoints.length <= 1 ? plotWidth / 2 : index / (chartPoints.length - 1) * plotWidth);
  const tickIndexes = [...new Set([0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => Math.max(0, Math.round((chartPoints.length - 1) * ratio))))]
    .filter((index) => Boolean(chartPoints[index]));
  const calorieMax = Math.max(goals.calories, ...chartDietPoints.flatMap((point) => point.calories === null ? [] : [point.calories]), 1);
  const calorieY = (value: number) => chartBottom - value / calorieMax * plotHeight;
  const calorieBarWidth = Math.max(8, Math.min(28, plotWidth / Math.max(chartPoints.length, 1) * 0.58));
  const weightValues = chartWeightPoints.map((point) => point.weightKg);
  const weightMin = weightValues.length ? Math.min(...weightValues) - Math.max(0.5, (Math.max(...weightValues) - Math.min(...weightValues)) * 0.2) : 0;
  const weightMax = weightValues.length ? Math.max(...weightValues) + Math.max(0.5, (Math.max(...weightValues) - Math.min(...weightValues)) * 0.2) : 1;
  const weightY = (value: number) => chartBottom - (value - weightMin) / Math.max(0.1, weightMax - weightMin) * plotHeight;
  const weightPolyline = chartWeightPoints.map((point) => {
    const index = chartPoints.findIndex((candidate) => candidate.startDate === point.startDate);
    return `${pointX(index)},${weightY(point.weightKg)}`;
  }).join(" ");
  const firstWeightIndex = chartWeightPoints.length
    ? chartPoints.findIndex((point) => point.startDate === chartWeightPoints[0].startDate)
    : -1;
  const lastWeightIndex = chartWeightPoints.length
    ? chartPoints.findIndex((point) => point.startDate === chartWeightPoints.at(-1)!.startDate)
    : -1;
  const weightArea = chartWeightPoints.length
    ? `${pointX(firstWeightIndex)},${chartBottom} ${weightPolyline} ${pointX(lastWeightIndex)},${chartBottom}`
    : "";
  const weightTicks = weightValues.length
    ? [0, 0.5, 1].map((ratio) => weightMin + (weightMax - weightMin) * ratio)
    : [];

  return (
    <div className="nutrition-analysis-v2">
      <div className="nutrition-analysis-v2__toolbar">
        <div className={`nutrition-analysis-v2__date-summary ${range === "custom" ? "is-custom" : ""}`.trim()}>
          <span>Zakres:</span>
          {range === "custom" ? (
            <div className="nutrition-analysis-v2__date-edit">
              <span>Od</span>
              <DatePicker
                aria-label="Data początkowa zakresu"
                value={customStartDate}
                max={customEndDate}
                displayValue={formatDateShort(customStartDate)}
                fieldClassName="nutrition-analysis-v2__date-picker"
                triggerClassName="nutrition-analysis-v2__date-trigger"
                onChange={setCustomStartDate}
              />
              <span>Do</span>
              <DatePicker
                aria-label="Data końcowa zakresu"
                value={customEndDate}
                min={customStartDate}
                max={endDate}
                displayValue={formatDateShort(customEndDate)}
                fieldClassName="nutrition-analysis-v2__date-picker"
                triggerClassName="nutrition-analysis-v2__date-trigger"
                onChange={setCustomEndDate}
              />
            </div>
          ) : (
            <strong>{formatDateRange(activeStartDate, activeEndDate)}</strong>
          )}
          {range !== "custom" && <CalendarDays size={16} strokeWidth={1.6} aria-hidden="true" />}
          {customRangeInvalid && <span className="nutrition-analysis-v2__range-error" role="alert">Nieprawidłowy zakres</span>}
        </div>
        <fieldset className="nutrition-analysis-v2__range">
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

      <div className="nutrition-analysis-v2__overview">
        <div className="nutrition-analysis-v2__kpis" aria-label="Podsumowanie wybranego okresu">
          <article className="nutrition-analysis-v2__metric-card is-calories">
            <div className="nutrition-analysis-v2__metric-top">
              <span className="nutrition-analysis-v2__metric-icon"><Flame size={18} strokeWidth={1.8} /></span>
              <span>Średnie kcal</span>
            </div>
            <div className="nutrition-analysis-v2__metric-value-row">
              <strong><SensitiveValue label="Średnie kalorie">{dietPoints.length ? `${formatNumber(averageCalories, 0)} kcal` : "—"}</SensitiveValue></strong>
              <span>Cel {formatNumber(goals.calories, 0)} kcal</span>
            </div>
            <div className="nutrition-analysis-v2__metric-support">
              <span>{dietPoints.length ? `${calorieShare}% celu` : "Brak posiłków"}</span>
              <i role="progressbar" aria-label="Realizacja celu kalorii" aria-valuemin={0} aria-valuemax={goals.calories} aria-valuenow={averageCalories} style={{ transform: `scaleX(${progress(averageCalories, goals.calories)})` }} />
            </div>
            <StatusChip tone={calorieStatus.tone}>{calorieStatus.label}</StatusChip>
          </article>

          <article className="nutrition-analysis-v2__metric-card is-macros">
            <div className="nutrition-analysis-v2__metric-top">
              <span className="nutrition-analysis-v2__metric-icon"><Sprout size={18} strokeWidth={1.8} /></span>
              <span>Średnie makro</span>
            </div>
            {dietPoints.length ? (
              <div className="nutrition-analysis-v2__macro-values">
                <strong className="is-protein">B <SensitiveValue label="Średnie białko">{formatNumber(averageProtein)} g</SensitiveValue></strong>
                <strong className="is-carbs">W <SensitiveValue label="Średnie węglowodany">{formatNumber(averageCarbs)} g</SensitiveValue></strong>
                <strong className="is-fat">T <SensitiveValue label="Średnie tłuszcze">{formatNumber(averageFat)} g</SensitiveValue></strong>
              </div>
            ) : <strong className="nutrition-analysis-v2__metric-empty">—</strong>}
            <span className="nutrition-analysis-v2__metric-note">na dzień z wpisem</span>
            <StatusChip tone={proteinStatus.tone}>{proteinStatus.label}</StatusChip>
          </article>

          <article className="nutrition-analysis-v2__metric-card is-weight">
            <div className="nutrition-analysis-v2__metric-top">
              <span className="nutrition-analysis-v2__metric-icon"><Scale size={18} strokeWidth={1.8} /></span>
              <span>Średnia masa</span>
            </div>
            <div className="nutrition-analysis-v2__metric-value-row">
              <strong><SensitiveValue label="Średnia masa">{weightPoints.length ? `${formatNumber(averageWeight)} kg` : "—"}</SensitiveValue></strong>
            </div>
            <div className="nutrition-analysis-v2__metric-note">
              {privacyMode ? "Dane ukryte w Privacy Mode" : weightChange === null ? "Potrzebne 2 pomiary" : <>Zmiana w okresie: <SensitiveValue label="Zmiana masy">{signed(weightChange, "kg")}</SensitiveValue></>}
            </div>
            <StatusChip tone={privacyMode || weightChange === null ? "neutral" : weightChange > 0.05 ? "danger" : "positive"}>
              {privacyMode ? "Dane ukryte" : weightChange === null ? "Brak pełnego trendu" : weightChange > 0.05 ? "Trend wzrostowy" : weightChange < -0.05 ? "Trend spadkowy" : "Trend stabilny"}
            </StatusChip>
          </article>

          <article className="nutrition-analysis-v2__metric-card is-water">
            <div className="nutrition-analysis-v2__metric-top">
              <span className="nutrition-analysis-v2__metric-icon"><Droplets size={18} strokeWidth={1.8} /></span>
              <span>Średnie nawodnienie</span>
            </div>
            <div className="nutrition-analysis-v2__metric-value-row">
              <strong>{waterPoints.length ? `${formatNumber(averageWater, 0)} ml` : "—"}</strong>
              <span>Cel {formatNumber(goals.waterMl, 0)} ml</span>
            </div>
            <div className="nutrition-analysis-v2__metric-support">
              <span>{waterPoints.length ? `z ${waterPoints.length} zapisanych dni` : "Brak wpisów wody"}</span>
              <i role="progressbar" aria-label="Realizacja celu nawodnienia" aria-valuemin={0} aria-valuemax={goals.waterMl} aria-valuenow={averageWater} style={{ transform: `scaleX(${progress(averageWater, goals.waterMl)})` }} />
            </div>
            <StatusChip tone={waterStatus.tone}>{waterStatus.label}</StatusChip>
          </article>
        </div>

        <section className="nutrition-analysis-v2__insights" aria-labelledby="nutrition-analysis-v2-insights-title">
          <div className="nutrition-analysis-v2__insights-heading">
            <h3 id="nutrition-analysis-v2-insights-title"><Sparkles size={18} strokeWidth={1.8} /> Wnioski</h3>
          </div>
          <ul>
            {insights.map((insight) => (
              <li key={insight.text}>
                <span className={`nutrition-analysis-v2__insight-dot is-${insight.tone}`} aria-hidden="true" />
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="nutrition-analysis-v2__charts">
        <section className="nutrition-analysis-v2__chart-panel" aria-labelledby="nutrition-analysis-v2-calories-title">
          <div className="nutrition-analysis-v2__chart-heading">
            <h3 id="nutrition-analysis-v2-calories-title">Kalorie w czasie <InfoButton label="Dni bez wpisu nie są liczone do średniej. Przy dłuższych zakresach wykres pokazuje średnie z kilku dni." /></h3>
            <span className="nutrition-analysis-v2__chart-frequency">{chartFrequency}</span>
          </div>
          <div className="nutrition-analysis-v2__legend">
            <span><i className="is-goal" /> Cel {formatNumber(goals.calories, 0)} kcal</span>
            <span><i className="is-average" /> Średnia {formatNumber(averageCalories, 0)} kcal</span>
          </div>
          {chartDietPoints.length ? (
            <svg className="nutrition-analysis-v2__chart" viewBox={`0 0 ${CHART.width} ${chartHeight}`} role="img" aria-label={`Kalorie w czasie, ${chartFrequency.toLowerCase()}`}>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const value = calorieMax * ratio;
                const y = calorieY(value);
                return (
                  <g key={ratio}>
                    <line className="nutrition-analysis-v2__grid-line" x1={CHART.left} y1={y} x2={CHART.width - CHART.right} y2={y} />
                    <text className="nutrition-analysis-v2__axis-label" x={CHART.left - 10} y={y + 4} textAnchor="end">{formatNumber(value, 0)}</text>
                  </g>
                );
              })}
              <line className="nutrition-analysis-v2__goal-line" x1={CHART.left} y1={calorieY(goals.calories)} x2={CHART.width - CHART.right} y2={calorieY(goals.calories)} />
              <line className="nutrition-analysis-v2__average-line" x1={CHART.left} y1={calorieY(averageCalories)} x2={CHART.width - CHART.right} y2={calorieY(averageCalories)} />
              {chartPoints.map((point, index) => {
                const x = pointX(index);
                const barHeight = point.calories === null ? 0 : chartBottom - calorieY(point.calories);
                return point.calories !== null ? (
                  <g key={point.startDate}>
                    <rect
                      className={point.calories > goals.calories ? "nutrition-analysis-v2__bar is-over" : "nutrition-analysis-v2__bar"}
                      x={x - calorieBarWidth / 2}
                      y={calorieY(point.calories)}
                      width={calorieBarWidth}
                      height={barHeight}
                      rx={3}
                      tabIndex={0}
                    >
                      <title>{formatChartRange(point)}: {bucketDays === 1 ? "" : "średnia "}{formatNumber(point.calories, 0)} kcal{bucketDays === 1 ? "" : ` (z ${point.dietSamples} dni z wpisem)`}</title>
                    </rect>
                    <text className="nutrition-analysis-v2__value-label" x={x} y={Math.max(CHART.top + 12, calorieY(point.calories) - 8)} textAnchor="middle">{formatNumber(point.calories, 0)}</text>
                  </g>
                ) : (
                  <text key={point.startDate} className="nutrition-analysis-v2__missing-label" x={x} y={chartBottom - 6} textAnchor="middle">—</text>
                );
              })}
              {tickIndexes.map((index) => {
                const point = chartPoints[index];
                const label = bucketDays === 1 ? formatChartDate(point.startDate) : { date: formatChartRange(point), weekday: "" };
                return (
                  <text key={point.startDate} className="nutrition-analysis-v2__date-label" x={pointX(index)} y={chartBottom + 24} textAnchor="middle">
                    <tspan x={pointX(index)}>{label.date}</tspan>
                    {label.weekday && <tspan x={pointX(index)} dy="14">{label.weekday}</tspan>}
                  </text>
                );
              })}
            </svg>
          ) : <div className="nutrition-analysis-v2__empty">Brak wpisów kalorii w wybranym okresie.</div>}
          <div className="nutrition-analysis-v2__chart-footer">
            <span><i className="is-in-range" /> {bucketDays === 1 ? "W normie" : "Średnia w normie"} (≤ {formatNumber(goals.calories, 0)} kcal)</span>
            <span><i className="is-over" /> Powyżej celu (&gt; {formatNumber(goals.calories, 0)} kcal)</span>
            <span><i className="is-missing" /> Brak wpisu</span>
          </div>
        </section>

        <section className="nutrition-analysis-v2__chart-panel" aria-labelledby="nutrition-analysis-v2-weight-title">
          <div className="nutrition-analysis-v2__chart-heading">
            <h3 id="nutrition-analysis-v2-weight-title">Masa ciała w czasie <InfoButton label="Wykres pokazuje zapisane pomiary masy. Przy dłuższych zakresach punkty są uśredniane w kilku dniach." /></h3>
            <span className="nutrition-analysis-v2__chart-frequency">{chartFrequency}</span>
          </div>
          <div className="nutrition-analysis-v2__chart-axis-caption">kg</div>
          {privacyMode ? (
            <div className="nutrition-analysis-v2__empty" role="status">Wartości masy ciała są ukryte w Privacy Mode.</div>
          ) : weightPoints.length ? (
            <svg className="nutrition-analysis-v2__chart" viewBox={`0 0 ${CHART.width} ${chartHeight}`} role="img" aria-label={`Masa ciała w czasie, ${chartFrequency.toLowerCase()}`}>
              {weightTicks.map((value) => {
                const y = weightY(value);
                return (
                  <g key={value}>
                    <line className="nutrition-analysis-v2__grid-line" x1={CHART.left} y1={y} x2={CHART.width - CHART.right} y2={y} />
                    <text className="nutrition-analysis-v2__axis-label" x={CHART.left - 10} y={y + 4} textAnchor="end">{formatNumber(value)} </text>
                  </g>
                );
              })}
              <polygon className="nutrition-analysis-v2__weight-area" points={weightArea} />
              <polyline className="nutrition-analysis-v2__weight-line" points={weightPolyline} />
              {chartWeightPoints.map((point) => {
                const index = chartPoints.findIndex((candidate) => candidate.startDate === point.startDate);
                const x = pointX(index);
                return (
                  <g key={point.startDate}>
                    <circle className="nutrition-analysis-v2__weight-point" cx={x} cy={weightY(point.weightKg)} r={4} tabIndex={0}>
                      <title>{formatChartRange(point)}: {bucketDays === 1 ? "" : "średnia "}{formatNumber(point.weightKg)} kg{bucketDays === 1 ? "" : ` (z ${point.weightSamples} pomiarów)`}</title>
                    </circle>
                    <text className="nutrition-analysis-v2__value-label is-weight" x={x} y={weightY(point.weightKg) - 10} textAnchor="middle">{formatNumber(point.weightKg)}</text>
                  </g>
                );
              })}
              {tickIndexes.map((index) => {
                const point = chartPoints[index];
                const label = bucketDays === 1 ? formatChartDate(point.startDate) : { date: formatChartRange(point), weekday: "" };
                return (
                  <text key={point.startDate} className="nutrition-analysis-v2__date-label" x={pointX(index)} y={chartBottom + 24} textAnchor="middle">
                    <tspan x={pointX(index)}>{label.date}</tspan>
                    {label.weekday && <tspan x={pointX(index)} dy="14">{label.weekday}</tspan>}
                  </text>
                );
              })}
            </svg>
          ) : <div className="nutrition-analysis-v2__empty">Brak pomiarów masy w wybranym okresie.</div>}
          <div className="nutrition-analysis-v2__chart-summary">
            <span>Ostatni pomiar: <strong><SensitiveValue label="Ostatni pomiar masy">{weightPoints.length ? `${formatNumber(weightPoints.at(-1)!.weightKg)} kg` : "—"}</SensitiveValue></strong></span>
            <span>Zmiana w okresie: <strong className={weightChange !== null && weightChange > 0.05 ? "is-danger" : ""}><SensitiveValue label="Zmiana masy">{weightChange === null ? "—" : signed(weightChange, "kg")}</SensitiveValue></strong></span>
            <span>Średnia masa: <strong><SensitiveValue label="Średnia masa">{weightPoints.length ? `${formatNumber(averageWeight)} kg` : "—"}</SensitiveValue></strong></span>
          </div>
        </section>
      </div>
    </div>
  );
}
