import {
  Activity, BarChart3, CalendarRange, Dumbbell, History,
  Library, Link2, type LucideIcon,
} from "lucide-react";
import type { SportView } from "./model";
import { SPORT_COLORS as C } from "./theme";
import { ContextNavItem, ContextSidebar, SectionHeader } from "../ui";

const GROUPS: { label: string; items: { id: SportView; label: string; icon: LucideIcon }[] }[] = [
  { label: "Główne", items: [
    { id: "overview", label: "Przegląd", icon: Activity },
    { id: "week", label: "Plan tygodnia", icon: CalendarRange },
  ] },
  { label: "Trening", items: [
    { id: "plans", label: "Plany treningowe", icon: Dumbbell },
    { id: "exercises", label: "Ćwiczenia", icon: Library },
  ] },
  { label: "Analiza", items: [
    { id: "history", label: "Historia", icon: History },
    { id: "progress", label: "Postępy", icon: BarChart3 },
  ] },
];

export const VIEW_LABELS: Record<SportView, { title: string; subtitle: string }> = {
  overview: { title: "Przegląd", subtitle: "Dzisiejsze sesje i plan bieżącego tygodnia" },
  week: { title: "Plan tygodnia", subtitle: "Układaj i przenoś treningi między dniami" },
  plans: { title: "Plany treningowe", subtitle: "Plany, bloki i powtarzalne szablony" },
  history: { title: "Historia", subtitle: "Wyniki wykonanych i niedokończonych sesji" },
  progress: { title: "Postępy", subtitle: "Realizacja planu oraz regularność dyscyplin" },
  exercises: { title: "Ćwiczenia", subtitle: "Biblioteka ćwiczeń, synonimy i własne pozycje" },
  integrations: { title: "Integracje", subtitle: "Źródła aktywności i dopasowanie do planu" },
};

function SidebarItem({ id, label, icon: Icon, activeView, onChange, count }: { id: SportView; label: string; icon: LucideIcon; activeView: SportView; onChange: (view: SportView) => void; count?: number }) {
  const active = id === activeView;
  return (
    <ContextNavItem
      active={active}
      icon={<Icon />}
      label={label}
      meta={count}
      onClick={() => onChange(id)}
    />
  );
}

export function SportSidebar({ view, onChange, importCount }: { view: SportView; onChange: (view: SportView) => void; importCount: number }) {
  return (
    <ContextSidebar label="Widoki Sportu">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group) => (
          <section key={group.label} className="mb-6">
            <SectionHeader title={group.label} level={3} variant="label" className="px-1.5" />
            <div className="space-y-px">
              {group.items.map((item) => <SidebarItem key={item.id} {...item} activeView={view} onChange={onChange} />)}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t p-2.5" style={{ borderColor: C.border }}>
        <SidebarItem id="integrations" label="Integracje" icon={Link2} activeView={view} onChange={onChange} count={importCount || undefined} />
      </div>
    </ContextSidebar>
  );
}
