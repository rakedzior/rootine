import { Activity, ChartNoAxesCombined, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { ContextNavItem, ModuleSidebar, SectionHeader } from "../ui";

export type NutritionSidebarItem = "today" | "meals" | "analysis";

const GROUPS: Array<{
  label: string;
  items: Array<{ id: NutritionSidebarItem; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Główne",
    items: [{ id: "today", label: "Dzisiaj", icon: Activity }],
  },
  {
    label: "Biblioteka",
    items: [{ id: "meals", label: "Własne posiłki", icon: UtensilsCrossed }],
  },
  {
    label: "Pozostałe",
    items: [{ id: "analysis", label: "Analiza", icon: ChartNoAxesCombined }],
  },
];

/**
 * Local navigation for Odżywianie. Deliberately built like the Sport sidebar —
 * same components, same grouping, same active marker — so the two modules read
 * as one product rather than two takes on a sidebar.
 */
export function NutritionSidebar({
  active,
  mealCount,
  onSelect,
}: {
  active: NutritionSidebarItem;
  mealCount: number;
  onSelect: (item: NutritionSidebarItem) => void;
}) {
  return (
    <ModuleSidebar label="Widoki Odżywiania" className="nutrition-context-sidebar">
      <div className="nutrition-context-sidebar__nav">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <SectionHeader title={group.label} level={2} variant="label" />
            <div>
              {group.items.map((item) => (
                <ContextNavItem
                  key={item.id}
                  active={active === item.id}
                  icon={<item.icon />}
                  label={item.label}
                  meta={item.id === "meals" && mealCount > 0 ? mealCount : undefined}
                  onClick={() => onSelect(item.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </ModuleSidebar>
  );
}
