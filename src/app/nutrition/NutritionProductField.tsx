import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button, Input } from "../ui";
import {
  OpenFoodFactsSearchError,
  searchGenericFoods,
  searchOpenFoodFacts,
  type FoodSuggestion,
} from "../data/nutritionCatalog";
import { formatNumber } from "./nutritionPresentationModel";
import { useSupabaseAuth } from "../../infrastructure/supabase/auth";

/**
 * Product lookup for one ingredient. It talks to the same two sources as the daily
 * journal — the built-in USDA list first, Open Food Facts only when asked — so a
 * saved meal is made of the same products a manual entry would be.
 */
export function NutritionProductField({
  label,
  value,
  error,
  hint,
  onChange,
  onPick,
}: {
  label: string;
  value: string;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
  onPick: (food: FoodSuggestion) => void;
}) {
  const { session } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<FoodSuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const query = value.trim();
  const generic = useMemo(() => searchGenericFoods(value), [value]);
  const remoteUnbranded = useMemo(() => results.filter((item) => !item.brand), [results]);
  const remoteBranded = useMemo(() => results.filter((item) => item.brand), [results]);
  const suggestions = useMemo(() => {
    const ids = new Set(generic.map((item) => item.id));
    return [...generic, ...results.filter((item) => !ids.has(item.id))];
  }, [generic, results]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const changeName = (next: string) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setResults([]);
    setPending(false);
    setSearchError("");
    setSearchedQuery("");
    setOpen(next.trim().length >= 2);
    onChange(next);
  };

  const choose = (food: FoodSuggestion) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    onPick(food);
  };

  const searchOnline = () => {
    if (query.length < 2 || pending || searchedQuery === query) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setOpen(true);
    setPending(true);
    setResults([]);
    setSearchError("");

    searchOpenFoodFacts(query, controller.signal, session?.access_token)
      .then((found) => {
        if (requestRef.current !== controller) return;
        setResults(found);
        setSearchedQuery(query);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestRef.current !== controller) return;
        setResults([]);
        if (cause instanceof OpenFoodFactsSearchError && cause.status === 429) {
          const retry = cause.retryAfterSeconds
            ? ` Spróbuj ponownie za ${cause.retryAfterSeconds} s.`
            : " Spróbuj ponownie za chwilę.";
          setSearchError(`Limit wyszukiwania online został osiągnięty.${retry}`);
          return;
        }
        setSearchError("Baza online jest chwilowo niedostępna. Możesz wybrać produkt podstawowy albo uzupełnić dane ręcznie.");
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setPending(false);
        }
      });
  };

  const renderGroup = (groupLabel: string, items: FoodSuggestion[]) => {
    if (!items.length) return null;
    return (
      <div className="nutrition-suggestion-group">
        <p className="nutrition-suggestion-group__label">{groupLabel}</p>
        {items.map((food) => (
          <button
            key={food.id}
            type="button"
            className="nutrition-suggestion"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(food)}
          >
            <span className="nutrition-suggestion__identity">
              <span className="nutrition-suggestion__name">{food.name}</span>
              <span className="nutrition-suggestion__meta">
                {food.brand ? `${food.brand} · ` : ""}
                {formatNumber(food.per100g.calories)} kcal / 100 {food.unit}
              </span>
            </span>
            <span className="nutrition-suggestion__macro">
              B {formatNumber(food.per100g.protein)} · W {formatNumber(food.per100g.carbs)} · T {formatNumber(food.per100g.fat)}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="nutrition-food-search">
      <Input
        label={label}
        placeholder="Zacznij wpisywać, np. płatki owsiane"
        value={value}
        error={error}
        hint={hint}
        autoComplete="off"
        data-autofocus
        onFocus={() => setOpen(query.length >= 2)}
        onBlur={() => setOpen(false)}
        onChange={(event) => changeName(event.target.value)}
      />
      {query.length >= 2 && (
        <div className="nutrition-food-search__online">
          <span>Produkty marek pobieramy dopiero na Twoje żądanie.</span>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="nutrition-food-search__online-action"
            disabled={pending || searchedQuery === query}
            leadingIcon={pending ? <LoaderCircle size={13} className="nutrition-search-spinner" /> : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={searchOnline}
          >
            {pending ? "Szukamy…" : searchedQuery === query ? "Wyniki pobrane" : "Szukaj online"}
          </Button>
        </div>
      )}
      {open && query.length >= 2 && (
        <div className="nutrition-suggestions nutrition-suggestions--below" aria-label="Podpowiedzi produktów">
          {renderGroup("Produkty podstawowe · USDA", generic)}
          {renderGroup("Produkty bez marki · Open Food Facts", remoteUnbranded)}
          {renderGroup("Produkty marek · Open Food Facts", remoteBranded)}
          {pending && (
            <div className="nutrition-suggestions__status">
              <LoaderCircle size={13} className="nutrition-search-spinner" />
              Szukamy w Open Food Facts…
            </div>
          )}
          {!pending && searchError && (
            <div className="nutrition-suggestions__status is-error" role="alert">{searchError}</div>
          )}
          {!pending && !searchError && !suggestions.length && (
            <div className="nutrition-suggestions__status">
              {searchedQuery === query
                ? "Nie znaleźliśmy produktu. Wpisz pełną nazwę i uzupełnij wartości ręcznie."
                : "Brak produktu podstawowego. Wybierz „Szukaj online” albo uzupełnij wartości ręcznie."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
