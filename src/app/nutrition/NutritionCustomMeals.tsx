import { useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  ContentHeader,
  EmptyState,
  Menu,
  MenuItem,
  SectionSurface,
} from "../ui";
import { pluralize } from "../formatters";
import type { MealSlot, NutritionEntry } from "../data/nutritionWorkspace";
import {
  customMealPer100g,
  customMealPerServing,
  customMealTotals,
  customMealWeight,
  type CustomMeal,
} from "../data/nutritionMeals";
import { NutritionCustomMealEditor } from "./NutritionCustomMealEditor";
import { NutritionCustomMealQuickAdd } from "./NutritionCustomMealQuickAdd";
import { formatDate, formatNumber } from "./nutritionPresentationModel";

function MealCard({
  meal,
  onAdd,
  onEdit,
  onDelete,
}: {
  meal: CustomMeal;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const totals = customMealTotals(meal);
  const per100g = customMealPer100g(meal);
  const perServing = customMealPerServing(meal);

  return (
    <SectionSurface className="nutrition-library-card">
      <div className="nutrition-library-card__header">
        <div className="nutrition-library-card__identity">
          <h3>{meal.name}</h3>
          <p>
            {pluralize(meal.ingredients.length, "składnik", "składniki", "składników")}
            {` · ${formatNumber(customMealWeight(meal))} g`}
            {meal.servings ? ` · ${pluralize(meal.servings, "porcja", "porcje", "porcji")}` : ""}
          </p>
        </div>
        <div className="nutrition-library-card__actions">
          <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={onAdd}>
            Dodaj do Dzisiaj
          </Button>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Opcje posiłku: ${meal.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Ellipsis size={13} />
          </Button>
          {menuOpen && (
            <Menu
              id={menuId}
              triggerRef={triggerRef}
              layer="detail"
              className="nutrition-library-card__menu"
              onDismiss={() => setMenuOpen(false)}
            >
              <MenuItem
                leadingIcon={<Pencil size={13} />}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                Edytuj
              </MenuItem>
              <MenuItem
                tone="danger"
                leadingIcon={<Trash2 size={13} />}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Usuń
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      <div className="nutrition-library-card__metrics">
        <span className="nutrition-library-card__metric is-calories"><small>kcal</small>{formatNumber(totals.calories)}</span>
        <span className="nutrition-library-card__metric is-protein"><small>B</small>{formatNumber(totals.protein)} g</span>
        <span className="nutrition-library-card__metric is-carbs"><small>W</small>{formatNumber(totals.carbs)} g</span>
        <span className="nutrition-library-card__metric is-fat"><small>T</small>{formatNumber(totals.fat)} g</span>
      </div>

      <p className="nutrition-library-card__derived">
        {per100g ? `Na 100 g: ${formatNumber(per100g.calories)} kcal · B ${formatNumber(per100g.protein)} · W ${formatNumber(per100g.carbs)} · T ${formatNumber(per100g.fat)}` : "Masa gotowego dania nie została podana."}
        {perServing ? ` · Porcja: ${formatNumber(perServing.calories)} kcal` : ""}
      </p>
    </SectionSurface>
  );
}

/**
 * The saved-dish library. Everything a meal knows lives in the workspace; this view
 * only opens the editor, the quick-add dialog and the delete confirmation.
 */
export function NutritionCustomMeals({
  meals,
  selectedDate,
  isDayClosed,
  mobileNavigation,
  onSave,
  onDelete,
  onAddToDay,
}: {
  meals: CustomMeal[];
  selectedDate: string;
  isDayClosed: (date: string) => boolean;
  mobileNavigation?: ReactNode;
  onSave: (meal: CustomMeal) => void;
  onDelete: (id: string) => void;
  onAddToDay: (date: string, slot: MealSlot, entry: NutritionEntry) => void;
}) {
  const [editor, setEditor] = useState<{ meal?: CustomMeal } | null>(null);
  const [quickAdd, setQuickAdd] = useState<CustomMeal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomMeal | null>(null);
  const [notice, setNotice] = useState("");

  const addButton = (
    <Button className="ui-button--icon-mobile" variant="primary" leadingIcon={<Plus size={13} />} onClick={() => setEditor({})}>
      <span className="header-action-label">Dodaj własny posiłek</span>
    </Button>
  );

  return (
    <>
      <ContentHeader
        headingLevel={1}
        className="nutrition-content-header"
        title="Własne posiłki"
        description="Zapisuj często jedzone posiłki i dodawaj je ponownie w kilka sekund"
        mobileNavigation={mobileNavigation}
        actions={addButton}
      />

      <div className="nutrition-content">
        {notice && (
          <Card tone="input" padding="dense" className="nutrition-library-notice" role="status">
            <span>{notice}</span>
            <Button variant="ghost" size="sm" onClick={() => setNotice("")}>Zamknij</Button>
          </Card>
        )}

        {meals.length ? (
          <div className="nutrition-library-list">
            {meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onAdd={() => setQuickAdd(meal)}
                onEdit={() => setEditor({ meal })}
                onDelete={() => setPendingDelete(meal)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            className="nutrition-library-empty"
            icon={<UtensilsCrossed size={20} strokeWidth={1.5} />}
            title="Nie masz jeszcze własnych posiłków"
            description="Zapisz danie z wieloma składnikami — na przykład owsiankę albo kurczaka z ryżem — a potem dodawaj je do dnia jednym kliknięciem."
            action={addButton}
          />
        )}
      </div>

      {editor && (
        <NutritionCustomMealEditor
          key={editor.meal?.id ?? "new"}
          meal={editor.meal}
          onClose={() => setEditor(null)}
          onSubmit={(meal) => {
            onSave(meal);
            setEditor(null);
            setNotice(editor.meal ? `Zapisano zmiany w posiłku „${meal.name}”.` : `Zapisano posiłek „${meal.name}”.`);
          }}
        />
      )}

      {quickAdd && (
        <NutritionCustomMealQuickAdd
          meal={quickAdd}
          defaultDate={selectedDate}
          isDayClosed={isDayClosed}
          onClose={() => setQuickAdd(null)}
          onSubmit={(date, slot, entry) => {
            onAddToDay(date, slot, entry);
            setQuickAdd(null);
            setNotice(`Dodano „${entry.name}” (${entry.portion}) do dnia: ${formatDate(date)}.`);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          eyebrow="Własne posiłki"
          title={`Usunąć posiłek „${pendingDelete.name}”?`}
          description="Posiłek zniknie z biblioteki. Wpisy już dodane do dziennika pozostaną bez zmian."
          confirmLabel="Usuń posiłek"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setNotice(`Usunięto posiłek „${pendingDelete.name}”.`);
            setPendingDelete(null);
          }}
        />
      )}
    </>
  );
}
