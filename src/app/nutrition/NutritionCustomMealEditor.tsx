import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import { scaleNutrition, type FoodSuggestion } from "../data/nutritionCatalog";
import {
  createCustomMealId,
  customMealIngredientValues,
  customMealIngredientWeight,
  customMealPer100g,
  customMealPerServing,
  customMealTotals,
  type CustomMeal,
  type CustomMealIngredient,
} from "../data/nutritionMeals";
import { NutritionProductField } from "./NutritionProductField";
import { formatNumber, parseDraftNumber } from "./nutritionPresentationModel";

interface IngredientDraft {
  name: string;
  amount: string;
  unit: "g" | "ml";
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const EMPTY_DRAFT: IngredientDraft = {
  name: "",
  amount: "100",
  unit: "g",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
};

/** Per-100 values derived from what the user typed for a concrete amount. */
function per100From(draft: IngredientDraft, amount: number) {
  const per100 = (value: string) => Math.round((parseDraftNumber(value) / amount) * 100 * 100) / 100;
  return {
    calories: per100(draft.calories),
    protein: per100(draft.protein),
    carbs: per100(draft.carbs),
    fat: per100(draft.fat),
  };
}

/**
 * Create or edit a saved dish. Nutrition is never typed twice: ingredients carry
 * per-100 values, and every total, per-100 g and per-serving figure below is derived.
 */
export function NutritionCustomMealEditor({
  meal,
  onClose,
  onSubmit,
}: {
  meal?: CustomMeal;
  onClose: () => void;
  onSubmit: (meal: CustomMeal) => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [ingredients, setIngredients] = useState<CustomMealIngredient[]>(meal?.ingredients ?? []);
  const [totalWeight, setTotalWeight] = useState(meal?.totalWeightG ? String(meal.totalWeightG) : "");
  const [servings, setServings] = useState(meal?.servings ? String(meal.servings) : "");
  const [draft, setDraft] = useState<IngredientDraft | null>(meal?.ingredients.length ? null : { ...EMPTY_DRAFT });
  const [draftFood, setDraftFood] = useState<FoodSuggestion | null>(null);
  const [draftErrors, setDraftErrors] = useState<{ name?: string; amount?: string; calories?: string }>({});
  const [formError, setFormError] = useState("");

  const previewMeal = {
    ingredients,
    totalWeightG: parseDraftNumber(totalWeight) || undefined,
    servings: parseDraftNumber(servings) || undefined,
  };
  const totals = customMealTotals(previewMeal);
  const per100g = customMealPer100g(previewMeal);
  const perServing = customMealPerServing(previewMeal);
  const ingredientWeight = customMealIngredientWeight(previewMeal);

  const changeDraft = (field: keyof IngredientDraft, value: string) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    if (field === "calories" || field === "protein" || field === "carbs" || field === "fat") setDraftFood(null);
    setDraftErrors((current) => ({ ...current, [field]: undefined }));
  };

  const changeDraftAmount = (value: string) => {
    setDraft((current) => {
      if (!current) return current;
      if (!draftFood) return { ...current, amount: value };
      const scaled = scaleNutrition(draftFood.per100g, parseDraftNumber(value));
      return {
        ...current,
        amount: value,
        calories: String(scaled.calories),
        protein: String(scaled.protein),
        carbs: String(scaled.carbs),
        fat: String(scaled.fat),
      };
    });
    setDraftErrors((current) => ({ ...current, amount: undefined }));
  };

  const chooseFood = (food: FoodSuggestion) => {
    const scaled = scaleNutrition(food.per100g, food.defaultAmount);
    setDraftFood(food);
    setDraft({
      name: food.name,
      amount: String(food.defaultAmount),
      unit: food.unit,
      calories: String(scaled.calories),
      protein: String(scaled.protein),
      carbs: String(scaled.carbs),
      fat: String(scaled.fat),
    });
    setDraftErrors({});
  };

  const addIngredient = () => {
    if (!draft) return;
    const ingredientName = draft.name.trim();
    const amount = parseDraftNumber(draft.amount);
    const calories = parseDraftNumber(draft.calories);
    const errors = {
      name: ingredientName ? undefined : "Podaj nazwę produktu.",
      amount: amount > 0 ? undefined : "Podaj ilość większą od zera.",
      calories: calories > 0 ? undefined : "Podaj kaloryczność większą od zera.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.amount || errors.calories) return;

    setIngredients((current) => [...current, {
      id: createCustomMealId("ingredient"),
      name: ingredientName,
      brand: draftFood?.brand,
      amount,
      unit: draft.unit,
      per100g: draftFood ? draftFood.per100g : per100From(draft, amount),
      catalogId: draftFood?.id,
      catalogSource: draftFood?.source,
    }]);
    setDraft({ ...EMPTY_DRAFT });
    setDraftFood(null);
    setFormError("");
  };

  const changeIngredientAmount = (id: string, value: string) => {
    const amount = parseDraftNumber(value);
    setIngredients((current) => current.map((ingredient) => ingredient.id === id
      ? { ...ingredient, amount }
      : ingredient));
  };

  const removeIngredient = (id: string) => {
    setIngredients((current) => current.filter((ingredient) => ingredient.id !== id));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mealName = name.trim();
    if (!mealName) {
      setFormError("Podaj nazwę posiłku.");
      return;
    }
    if (!ingredients.length) {
      setFormError("Dodaj przynajmniej jeden składnik.");
      return;
    }
    if (ingredients.some((ingredient) => ingredient.amount <= 0)) {
      setFormError("Każdy składnik musi mieć ilość większą od zera.");
      return;
    }
    if (totalWeight.trim() && parseDraftNumber(totalWeight) <= 0) {
      setFormError("Masa gotowego dania musi być większa od zera.");
      return;
    }
    if (servings.trim() && parseDraftNumber(servings) <= 0) {
      setFormError("Liczba porcji musi być większa od zera.");
      return;
    }

    const timestamp = new Date().toISOString();
    onSubmit({
      id: meal?.id ?? createCustomMealId("meal"),
      name: mealName,
      ingredients,
      totalWeightG: parseDraftNumber(totalWeight) || undefined,
      servings: parseDraftNumber(servings) || undefined,
      createdAt: meal?.createdAt ?? timestamp,
      updatedAt: meal ? timestamp : undefined,
    });
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    addIngredient();
  };

  const renderLedger = (values: { calories: number; protein: number; carbs: number; fat: number }) => (
    <div className="nutrition-calculation-ledger">
      <div><span>Kalorie</span><strong>{formatNumber(values.calories)} kcal</strong></div>
      <div><span>Białko</span><strong>{formatNumber(values.protein)} g</strong></div>
      <div><span>Węglowodany</span><strong>{formatNumber(values.carbs)} g</strong></div>
      <div><span>Tłuszcze</span><strong>{formatNumber(values.fat)} g</strong></div>
    </div>
  );

  return (
    <Modal
      title={meal ? "Edytuj własny posiłek" : "Nowy własny posiłek"}
      eyebrow="Własne posiłki"
      description="Zapisz danie ze wszystkimi składnikami. Wartości odżywcze wyliczamy automatycznie."
      size="xl"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button type="submit" form="custom-meal-form" variant="primary" leadingIcon={<Save size={13} />}>
            {meal ? "Zapisz zmiany" : "Zapisz posiłek"}
          </Button>
        </>
      )}
    >
      <form id="custom-meal-form" className="nutrition-goal-form" onSubmit={submit}>
        <Input
          label="Nazwa posiłku"
          placeholder="np. Owsianka proteinowa"
          value={name}
          data-autofocus
          onChange={(event) => {
            setName(event.target.value);
            setFormError("");
          }}
        />

        <section className="nutrition-goal-manual" aria-labelledby="custom-meal-ingredients-title">
          <div className="nutrition-calculator-heading">
            <div>
              <h3 id="custom-meal-ingredients-title">Składniki</h3>
              <p>Wybierz produkt z bazy albo wpisz wartości ręcznie. Ilość możesz zmienić w każdej chwili.</p>
            </div>
            {!draft && (
              <Button type="button" variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                Dodaj składnik
              </Button>
            )}
          </div>

          {ingredients.length > 0 ? (
            <div className="nutrition-ingredient-list">
              {ingredients.map((ingredient) => {
                const values = customMealIngredientValues(ingredient);
                return (
                  <div key={ingredient.id} className="nutrition-ingredient-row">
                    <span className="nutrition-ingredient-row__identity">
                      <span className="nutrition-ingredient-row__name" title={ingredient.name}>{ingredient.name}</span>
                      {ingredient.brand && <span className="nutrition-product-brand">{ingredient.brand}</span>}
                    </span>
                    <span className="nutrition-ingredient-row__amount">
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        aria-label={`Ilość: ${ingredient.name}`}
                        value={String(ingredient.amount)}
                        onChange={(event) => changeIngredientAmount(ingredient.id, event.target.value)}
                      />
                      <small>{ingredient.unit}</small>
                    </span>
                    <span className="nutrition-ingredient-row__metric"><small>B</small>{formatNumber(values.protein)} g</span>
                    <span className="nutrition-ingredient-row__metric"><small>W</small>{formatNumber(values.carbs)} g</span>
                    <span className="nutrition-ingredient-row__metric"><small>T</small>{formatNumber(values.fat)} g</span>
                    <span className="nutrition-ingredient-row__metric is-calories"><small>kcal</small>{formatNumber(values.calories)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Usuń składnik: ${ingredient.name}`}
                      onClick={() => removeIngredient(ingredient.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="nutrition-calculation-empty">Nie dodano jeszcze żadnego składnika.</div>
          )}

          {draft && (
            <div className="nutrition-ingredient-draft" onKeyDown={handleDraftKeyDown}>
              <NutritionProductField
                label="Produkt"
                value={draft.name}
                error={draftErrors.name}
                hint={draftFood ? "Wartości przeliczają się wraz z ilością." : "Bez wyboru z bazy uzupełnij wartości dla podanej ilości."}
                onChange={(value) => changeDraft("name", value)}
                onPick={chooseFood}
              />
              <div className="nutrition-amount-grid">
                <Input
                  label="Ilość"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={draft.amount}
                  error={draftErrors.amount}
                  onChange={(event) => changeDraftAmount(event.target.value)}
                />
                <Select
                  label="Jednostka"
                  value={draft.unit}
                  options={[
                    { value: "g", label: "gramy (g)" },
                    { value: "ml", label: "mililitry (ml)" },
                  ]}
                  onChange={(event) => changeDraft("unit", event.target.value)}
                />
              </div>
              <div className="nutrition-entry-form-grid">
                <Input label="Kalorie" type="number" min="0" step="0.1" placeholder="0" value={draft.calories} error={draftErrors.calories} onChange={(event) => changeDraft("calories", event.target.value)} />
                <Input label="Białko (g)" type="number" min="0" step="0.1" placeholder="0" value={draft.protein} onChange={(event) => changeDraft("protein", event.target.value)} />
                <Input label="Węglowodany (g)" type="number" min="0" step="0.1" placeholder="0" value={draft.carbs} onChange={(event) => changeDraft("carbs", event.target.value)} />
                <Input label="Tłuszcze (g)" type="number" min="0" step="0.1" placeholder="0" value={draft.fat} onChange={(event) => changeDraft("fat", event.target.value)} />
              </div>
              <div className="nutrition-ingredient-draft__actions">
                {ingredients.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(null);
                      setDraftFood(null);
                      setDraftErrors({});
                    }}
                  >
                    Zamknij
                  </Button>
                )}
                <Button type="button" variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={addIngredient}>
                  Dodaj składnik
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="nutrition-goal-manual" aria-labelledby="custom-meal-portions-title">
          <div className="nutrition-calculator-heading">
            <div>
              <h3 id="custom-meal-portions-title">Gotowe danie</h3>
              <p>Masa po przygotowaniu bywa inna niż suma składników — wpisz ją, aby poznać wartości na 100 g.</p>
            </div>
          </div>
          <div className="nutrition-amount-grid">
            <Input
              label="Masa gotowego dania (g)"
              type="number"
              min="1"
              step="1"
              placeholder={ingredientWeight ? String(ingredientWeight) : "0"}
              hint={ingredientWeight ? `Bez tej wartości liczymy sumę składników: ${formatNumber(ingredientWeight)} g.` : "Opcjonalnie."}
              value={totalWeight}
              onChange={(event) => {
                setTotalWeight(event.target.value);
                setFormError("");
              }}
            />
            <Input
              label="Liczba porcji"
              type="number"
              min="1"
              step="1"
              placeholder="np. 2"
              hint="Opcjonalnie. Pozwala dodawać danie porcjami."
              value={servings}
              onChange={(event) => {
                setServings(event.target.value);
                setFormError("");
              }}
            />
          </div>
        </section>

        <section className="nutrition-goal-manual" aria-labelledby="custom-meal-summary-title">
          <div className="nutrition-calculator-heading">
            <div>
              <h3 id="custom-meal-summary-title">Podsumowanie</h3>
              <p>Wyliczamy je na bieżąco ze składników, masy dania i liczby porcji.</p>
            </div>
          </div>
          <div className="nutrition-meal-summary-panel" aria-live="polite">
            <div>
              <h4>Całe danie</h4>
              {renderLedger(totals)}
            </div>
            <div>
              <h4>Na 100 g</h4>
              {per100g ? renderLedger(per100g) : <p className="nutrition-meal-summary-panel__empty">Podaj masę gotowego dania.</p>}
            </div>
            <div>
              <h4>Na porcję</h4>
              {perServing ? renderLedger(perServing) : <p className="nutrition-meal-summary-panel__empty">Podaj liczbę porcji.</p>}
            </div>
          </div>
        </section>

        {formError && <p className="nutrition-goal-error" role="alert">{formError}</p>}
      </form>
    </Modal>
  );
}
