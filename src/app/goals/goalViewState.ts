export type GoalFilterId =
  | "overview"
  | "next"
  | "week"
  | "all"
  | "active"
  | "ontrack"
  | "risk"
  | "paused"
  | "completed"
  | "planned"
  | "archived"
  | `category:${string}`;

export type GoalLayout = "list" | "grid";
export type GoalSortKey = "priority" | "due" | "progress" | "updated" | "name";

export type GoalViewState = {
  filter: GoalFilterId;
  layout: GoalLayout;
  sort: GoalSortKey;
  selectedId: string | null;
};

const STATIC_FILTERS = new Set<GoalFilterId>([
  "overview",
  "next",
  "week",
  "all",
  "active",
  "ontrack",
  "risk",
  "paused",
  "completed",
  "planned",
  "archived",
]);

const SORT_KEYS = new Set<GoalSortKey>(["priority", "due", "progress", "updated", "name"]);

function readFilter(value: string | null, categoryIds: ReadonlySet<string>): GoalFilterId {
  if (!value) return "next";
  if (STATIC_FILTERS.has(value as GoalFilterId)) return value as GoalFilterId;
  if (!value.startsWith("category:")) return "next";
  const categoryId = value.slice("category:".length);
  return categoryId && categoryIds.has(categoryId) ? `category:${categoryId}` : "next";
}

export function readGoalViewState(
  params: URLSearchParams,
  categoryIds: ReadonlySet<string>,
  defaults: Pick<GoalViewState, "layout" | "sort">,
): GoalViewState {
  const layoutParam = params.get("uklad");
  const sortParam = params.get("sort");
  const selectedParam = params.get("cel")?.trim() ?? "";

  return {
    filter: readFilter(params.get("widok"), categoryIds),
    layout: layoutParam === "list" || layoutParam === "grid" ? layoutParam : defaults.layout,
    sort: sortParam && SORT_KEYS.has(sortParam as GoalSortKey) ? sortParam as GoalSortKey : defaults.sort,
    selectedId: selectedParam || null,
  };
}

export function writeGoalViewState(
  current: URLSearchParams,
  state: GoalViewState,
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (state.filter === "next") next.delete("widok");
  else next.set("widok", state.filter);

  next.set("uklad", state.layout);
  next.set("sort", state.sort);

  if (state.selectedId) next.set("cel", state.selectedId);
  else next.delete("cel");

  return next;
}
