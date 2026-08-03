import type { PlannerView } from "./plannerModel";

export const SPORT_VIEW_LABELS: Record<PlannerView, { title: string; description: string }> = {
  today: {
    title: "Dzisiaj",
    description: "Treningi do wykonania i kontekst bieżącego tygodnia",
  },
  cycle: {
    title: "Plan treningowy",
    description: "Tydzień bazowy i zakres aktywnego planu",
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
    title: "Analiza",
    description: "Regularność, objętość i realizacja planu",
  },
};
