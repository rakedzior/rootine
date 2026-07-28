import type { PlannerView } from "./plannerModel";

export const SPORT_VIEW_LABELS: Record<PlannerView, { title: string; description: string }> = {
  today: {
    title: "Plan na dziś",
    description: "Treningi do wykonania i kontekst bieżącego tygodnia",
  },
  cycle: {
    title: "Cykl treningowy",
    description: "Prosty plan tygodni aktywnego cyklu",
  },
  templates: {
    title: "Szablony",
    description: "Powtarzalne jednostki według kategorii sportu",
  },
  history: {
    title: "Historia",
    description: "Wyniki wykonanych i pominiętych treningów",
  },
  analysis: {
    title: "Postępy",
    description: "Regularność, objętość i realizacja planu",
  },
};
