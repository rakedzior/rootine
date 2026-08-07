import type { FormEvent } from "react";
import { ChevronDown, Save } from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import {
  MACRO_MODE_OPTIONS,
  MACRO_PRESET_OPTIONS,
  type MacroTargets,
  type NutritionCalculation,
} from "../data/nutritionCalculator";
import { CalculatorProfileFields } from "./NutritionCalculatorFields";
import {
  formatNumber,
  formatWater,
  parseDraftNumber,
  type ActivityDraft,
  type CalculationSyncState,
  type CalculatorDraft,
  type CalculatorErrors,
  type MacroDraft,
} from "./nutritionPresentationModel";

export interface GoalDraft {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  waterMl: string;
}

export type GoalDraftField = keyof GoalDraft;

/** Everything both dialogs need to drive the shared profile calculator. */
interface CalculatorBindings {
  calculatorDraft: CalculatorDraft;
  calculatorErrors: CalculatorErrors;
  calculatorResult: NutritionCalculation | null;
  onChangeCalculatorField: (field: Exclude<keyof CalculatorDraft, "activities">, value: string) => void;
  onAddActivity: () => void;
  onChangeActivity: (id: string, field: Exclude<keyof ActivityDraft, "id">, value: string) => void;
  onRemoveActivity: (id: string) => void;
}

interface GoalDialogBindings extends CalculatorBindings {
  goalDraft: GoalDraft;
  goalError: string;
  onChangeGoalField: (field: GoalDraftField, value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function NutritionGoalsDialog({
  goalDraft,
  goalError,
  calculatorDraft,
  calculatorErrors,
  calculatorResult,
  calculationSync,
  macroDraft,
  macroPreview,
  onChangeGoalField,
  onChangeCalculatorField,
  onAddActivity,
  onChangeActivity,
  onRemoveActivity,
  onChangeMacroField,
  onUseCalculatedCalories,
  onUseCalculatedMacros,
  onClose,
  onSubmit,
}: GoalDialogBindings & {
  calculationSync: CalculationSyncState;
  macroDraft: MacroDraft;
  macroPreview: MacroTargets | null;
  onChangeMacroField: (field: keyof MacroDraft, value: string) => void;
  onUseCalculatedCalories: () => void;
  onUseCalculatedMacros: () => void;
}) {
  return (
    <Modal
      title="Cele kalorii i makroskładników"
      eyebrow="Budżet dnia"
      description="Wylicz orientacyjne zapotrzebowanie albo wpisz własne wartości."
      size="xl"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="nutrition-goals-form" variant="primary" leadingIcon={<Save size={13} />}>Zapisz cele</Button>
        </>
      )}
    >
      <form id="nutrition-goals-form" onSubmit={onSubmit} className="nutrition-goal-form">
        <details className="nutrition-goal-advanced">
          <summary>
            <span>
              <strong>Wylicz cele automatycznie</strong>
              <small>Profil dnia, aktywność, wzór Mifflina–St Jeora i konfiguracja makro</small>
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <section className="nutrition-calculator-section" aria-labelledby="calorie-calculator-title">
            <div className="nutrition-calculator-heading">
              <div>
                <h3 id="calorie-calculator-title">Autowyliczenie kalorii</h3>
                <p>Praca opisuje zwykły dzień; sport dodajemy osobno, żeby go nie liczyć podwójnie.</p>
              </div>
              <span className="nutrition-calculator-method">Mifflin–St Jeor + MET</span>
            </div>
            <CalculatorProfileFields
              draft={calculatorDraft}
              errors={calculatorErrors}
              includeDietGoal
              onChange={onChangeCalculatorField}
              onAddActivity={onAddActivity}
              onChangeActivity={onChangeActivity}
              onRemoveActivity={onRemoveActivity}
            />
            {calculatorResult ? (
              <div className="nutrition-calculation-result" aria-live="polite">
                <div className="nutrition-calculation-ledger">
                  <div><span>Podstawowa przemiana materii</span><strong>{formatNumber(calculatorResult.bmr)} kcal</strong></div>
                  <div><span>Zwykły dzień i praca</span><strong>{formatNumber(calculatorResult.workDayCalories)} kcal</strong></div>
                  <div><span>Aktywność fizyczna · średnio / dzień</span><strong>+{formatNumber(calculatorResult.sportCalories)} kcal</strong></div>
                  <div><span>Aktywność fizyczna · cały tydzień</span><strong>{formatNumber(calculatorResult.weeklySportCalories)} kcal</strong></div>
                  <div><span>Utrzymanie masy</span><strong>{formatNumber(calculatorResult.maintenanceCalories)} kcal</strong></div>
                  <div><span>Korekta celu diety</span><strong>{calculatorResult.calorieAdjustment >= 0 ? "+" : ""}{formatNumber(calculatorResult.calorieAdjustment)} kcal</strong></div>
                  <div className="is-total"><span>Docelowa kaloryczność</span><strong>{formatNumber(calculatorResult.calorieTarget)} kcal</strong></div>
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  aria-pressed={calculationSync.calories}
                  onClick={onUseCalculatedCalories}
                >
                  {calculationSync.calories ? "Cel synchronizowany" : "Ustaw i synchronizuj"}
                </Button>
              </div>
            ) : (
              <div className="nutrition-calculation-empty">
                Uzupełnij płeć, wiek, wagę i wzrost, aby zobaczyć wynik.
              </div>
            )}
            <p className="nutrition-calculator-note">
              Estymacja dla osób dorosłych, nie diagnoza. Wzór może różnić się od rzeczywistego wydatku energii; obserwuj trend masy i koryguj cel.
              {" "}<a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noreferrer">Równanie Mifflina–St Jeora</a>
              {" · "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/" target="_blank" rel="noreferrer">Compendium MET 2024</a>
            </p>
          </section>

          <section className="nutrition-goal-manual" aria-labelledby="macro-calculator-title">
            <div className="nutrition-calculator-heading">
              <div>
                <h3 id="macro-calculator-title">Konfiguracja makroskładników</h3>
                <p>Wybierz autowyliczenie pod rodzaj treningu, udziały procentowe albo własne wartości w gramach.</p>
              </div>
            </div>
            <div className="nutrition-macro-config-grid">
              <Select
                label="Sposób ustawienia"
                value={macroDraft.mode}
                options={MACRO_MODE_OPTIONS}
                onChange={(event) => onChangeMacroField("mode", event.target.value)}
              />
              {macroDraft.mode === "auto" && (
                <Select
                  label="Profil"
                  value={macroDraft.preset}
                  options={MACRO_PRESET_OPTIONS}
                  onChange={(event) => onChangeMacroField("preset", event.target.value)}
                />
              )}
            </div>
            {macroDraft.mode === "percent" && (
              <div className="nutrition-macro-percent-grid">
                <Input label="Białko (%)" type="number" min="0" max="100" step="1" value={macroDraft.proteinPercent} onChange={(event) => onChangeMacroField("proteinPercent", event.target.value)} />
                <Input label="Węglowodany (%)" type="number" min="0" max="100" step="1" value={macroDraft.carbsPercent} onChange={(event) => onChangeMacroField("carbsPercent", event.target.value)} />
                <Input label="Tłuszcze (%)" type="number" min="0" max="100" step="1" value={macroDraft.fatPercent} onChange={(event) => onChangeMacroField("fatPercent", event.target.value)} />
              </div>
            )}
            {macroDraft.mode === "grams" ? (
              <div className="nutrition-calculation-empty">
                Wpisz docelowe gramy bezpośrednio w polach „Cele do zapisania” poniżej.
              </div>
            ) : macroPreview ? (
              <div className="nutrition-calculation-result" aria-live="polite">
                <div className="nutrition-calculation-ledger">
                  <div><span>Białko</span><strong>{formatNumber(macroPreview.protein)} g</strong></div>
                  <div><span>Węglowodany</span><strong>{formatNumber(macroPreview.carbs)} g</strong></div>
                  <div><span>Tłuszcze</span><strong>{formatNumber(macroPreview.fat)} g</strong></div>
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  aria-pressed={calculationSync.macros}
                  onClick={onUseCalculatedMacros}
                >
                  {calculationSync.macros ? "Makro synchronizowane" : "Ustaw i synchronizuj makro"}
                </Button>
              </div>
            ) : (
              <div className="nutrition-calculation-empty">
                {macroDraft.mode === "auto"
                  ? "Uzupełnij profil, wagę i cel kalorii, aby wyliczyć makroskładniki."
                  : "Udziały białka, węglowodanów i tłuszczów muszą razem dawać 100%."}
              </div>
            )}
            {macroDraft.mode === "auto" && (
              <p className="nutrition-calculator-note">
                Profile sportowe są punktami startowymi. Dla osób aktywnych literatura zwykle wskazuje około 1,4–2,0 g białka/kg/dzień; pozostała energia jest dzielona między tłuszcze i węglowodany.
                {" "}<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noreferrer">ISSN: białko i wysiłek</a>
              </p>
            )}
          </section>
        </details>

        <section className="nutrition-goal-manual" aria-labelledby="saved-goals-title">
          <div className="nutrition-calculator-heading">
            <div>
              <h3 id="saved-goals-title">Cele do zapisania</h3>
              <p>Aktywne autowyliczenia aktualizują te pola na bieżąco. Ręczna zmiana wyłącza synchronizację odpowiedniej grupy.</p>
            </div>
          </div>
          <div className="nutrition-goals-grid">
            <Input
              label="Kalorie"
              type="number"
              min="1"
              step="1"
              value={goalDraft.calories}
              hint={calculationSync.calories ? "Synchronizacja z kalkulatorem jest aktywna." : undefined}
              onChange={(event) => onChangeGoalField("calories", event.target.value)}
            />
            <Input
              label="Białko (g)"
              type="number"
              min="1"
              step="1"
              value={goalDraft.protein}
              hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
              onChange={(event) => onChangeGoalField("protein", event.target.value)}
            />
            <Input
              label="Węglowodany (g)"
              type="number"
              min="1"
              step="1"
              value={goalDraft.carbs}
              hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
              onChange={(event) => onChangeGoalField("carbs", event.target.value)}
            />
            <Input
              label="Tłuszcze (g)"
              type="number"
              min="1"
              step="1"
              value={goalDraft.fat}
              hint={calculationSync.macros ? "Synchronizacja makro jest aktywna." : undefined}
              onChange={(event) => onChangeGoalField("fat", event.target.value)}
            />
          </div>
        </section>
        {goalError && <p className="nutrition-goal-error" role="alert">{goalError}</p>}
      </form>
    </Modal>
  );
}

export function NutritionWaterGoalDialog({
  goalDraft,
  goalError,
  calculatorDraft,
  calculatorErrors,
  calculatorResult,
  waterCalculatorMode,
  waterSimpleWeight,
  simpleWaterMin,
  simpleWaterMax,
  onChangeWaterCalculatorMode,
  onChangeWaterSimpleWeight,
  onChangeGoalField,
  onChangeCalculatorField,
  onAddActivity,
  onChangeActivity,
  onRemoveActivity,
  onClose,
  onSubmit,
}: GoalDialogBindings & {
  waterCalculatorMode: "simple" | "advanced";
  waterSimpleWeight: string;
  simpleWaterMin: number;
  simpleWaterMax: number;
  onChangeWaterCalculatorMode: (mode: "simple" | "advanced") => void;
  onChangeWaterSimpleWeight: (value: string) => void;
}) {
  return (
    <Modal
      title="Cel nawodnienia"
      eyebrow="Nawodnienie"
      description="Wylicz orientacyjny cel z profilu dnia albo wpisz własną ilość."
      size="xl"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="water-goal-form" variant="primary" leadingIcon={<Save size={13} />}>Zapisz cel</Button>
        </>
      )}
    >
      <form id="water-goal-form" onSubmit={onSubmit} className="nutrition-goal-form">
        <div className="nutrition-water-calculator-switch" role="group" aria-label="Sposób wyliczenia celu wody">
          <Button type="button" variant={waterCalculatorMode === "simple" ? "primary" : "quiet"} size="sm" aria-pressed={waterCalculatorMode === "simple"} onClick={() => onChangeWaterCalculatorMode("simple")}>Prosty kalkulator</Button>
          <Button type="button" variant={waterCalculatorMode === "advanced" ? "primary" : "quiet"} size="sm" aria-pressed={waterCalculatorMode === "advanced"} onClick={() => onChangeWaterCalculatorMode("advanced")}>Zaawansowany</Button>
        </div>
        {waterCalculatorMode === "simple" ? (
          <section className="nutrition-water-simple-calculator" aria-labelledby="water-simple-calculator-title">
            <div className="nutrition-calculator-heading">
              <div>
                <h3 id="water-simple-calculator-title">Rekomendacja dzienna</h3>
                <p>Orientacyjnie 30–35 ml wody na kilogram masy ciała.</p>
              </div>
              <span className="nutrition-calculator-method">30–35 ml / kg</span>
            </div>
            <Input
              label="Masa ciała (kg)"
              type="text"
              inputMode="decimal"
              value={waterSimpleWeight}
              placeholder="np. 81,9"
              onChange={(event) => onChangeWaterSimpleWeight(event.target.value.replace(/\./g, ","))}
            />
            {simpleWaterMin && simpleWaterMax ? (
              <div className="nutrition-water-simple-result" aria-live="polite">
                <div>
                  <span>Rekomendowany zakres</span>
                  <strong>{formatWater(simpleWaterMin)} – {formatWater(simpleWaterMax)}</strong>
                </div>
                <small>Wybierz własny cel poniżej.</small>
              </div>
            ) : (
              <div className="nutrition-calculation-empty">Podaj masę ciała, aby zobaczyć wynik.</div>
            )}
          </section>
        ) : (
          <section className="nutrition-calculator-section" aria-labelledby="water-calculator-title">
            <div className="nutrition-calculator-heading">
              <div>
                <h3 id="water-calculator-title">Autowyliczenie wody</h3>
                <p>Waga, metabolizm, charakter pracy i średnia tygodniowa aktywność wpływają na wynik.</p>
              </div>
              <span className="nutrition-calculator-method">1 ml / kcal utrzymania</span>
            </div>
            <CalculatorProfileFields
              draft={calculatorDraft}
              errors={calculatorErrors}
              includeDietGoal={false}
              onChange={onChangeCalculatorField}
              onAddActivity={onAddActivity}
              onChangeActivity={onChangeActivity}
              onRemoveActivity={onRemoveActivity}
            />
            {calculatorResult ? (
              <div className="nutrition-calculation-result" aria-live="polite">
                <div className="nutrition-calculation-ledger">
                  <div><span>Szacunkowe utrzymanie</span><strong>{formatNumber(calculatorResult.maintenanceCalories)} kcal</strong></div>
                  <div><span>Przelicznik nawodnienia</span><strong>1 ml / kcal</strong></div>
                  <div className="is-total"><span>Orientacyjny cel płynów</span><strong>{formatWater(calculatorResult.waterTargetMl)}</strong></div>
                </div>
              </div>
            ) : (
              <div className="nutrition-calculation-empty">
                Uzupełnij płeć, wiek, wagę i wzrost, aby zobaczyć wynik.
              </div>
            )}
            <p className="nutrition-calculator-note">
              To punkt startowy, nie zalecenie medyczne. Estymacja nie zna temperatury, potliwości, ciąży, chorób ani leków; podczas wysiłku potrzeby są indywidualne.
              {" "}<a href="https://efsa.onlinelibrary.wiley.com/doi/abs/10.2903/j.efsa.2010.1459" target="_blank" rel="noreferrer">EFSA: woda</a>
              {" · "}<a href="https://pubmed.ncbi.nlm.nih.gov/22275331/" target="_blank" rel="noreferrer">ograniczenia wzorów</a>
              {" · "}<a href="https://pubmed.ncbi.nlm.nih.gov/17277604/" target="_blank" rel="noreferrer">ACSM: wysiłek i płyny</a>
            </p>
          </section>
        )}

        <section className="nutrition-goal-manual" aria-labelledby="saved-water-title">
          <div className="nutrition-calculator-heading">
            <div>
              <h3 id="saved-water-title">Cel do zapisania</h3>
              <p>Szybkie przyciski 150–500 ml pozostaną dostępne przy podsumowaniu dnia.</p>
            </div>
          </div>
          <Input
            label="Cel dzienny (ml)"
            type="number"
            min="250"
            max="20000"
            step="50"
            value={goalDraft.waterMl}
            error={goalError}
            hint={`Obecna wartość: ${formatWater(parseDraftNumber(goalDraft.waterMl))}`}
            onChange={(event) => onChangeGoalField("waterMl", event.target.value)}
          />
        </section>
      </form>
    </Modal>
  );
}
