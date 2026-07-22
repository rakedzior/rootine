import {
  Activity, BarChart3, CalendarRange, Dumbbell, History,
  Library, Link2, type LucideIcon,
} from "lucide-react";
import type { SportView } from "./model";
import { SPORT_COLORS as C } from "./theme";

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
    <button type="button" onClick={() => onChange(id)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[11px] transition-colors" style={{ color: active ? C.blue : C.textMuted, background: active ? C.blueBg : "transparent", borderLeft: `2px solid ${active ? C.blue : "transparent"}` }}>
      <Icon size={12} strokeWidth={1.65} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined && <span className="text-[8px] tabular-nums" style={{ color: active ? C.blue : C.textDisabled, fontFamily: "'DM Mono', monospace" }}>{count}</span>}
    </button>
  );
}

export function SportSidebar({ view, onChange, importCount }: { view: SportView; onChange: (view: SportView) => void; importCount: number }) {
  return (
    <aside className="task-sub-sidebar flex w-[200px] flex-shrink-0 flex-col overflow-hidden border-r" style={{ background: C.subSidebar, borderColor: C.border }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group) => (
          <section key={group.label} className="mb-6">
            <p className="mb-2 px-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.textMuted }}>{group.label}</p>
            <div className="space-y-px">
              {group.items.map((item) => <SidebarItem key={item.id} {...item} activeView={view} onChange={onChange} />)}
            </div>
          </section>
        ))}
      </div>
      <div className="border-t p-2.5" style={{ borderColor: C.border }}>
        <SidebarItem id="integrations" label="Integracje" icon={Link2} activeView={view} onChange={onChange} count={importCount || undefined} />
      </div>
    </aside>
  );
}
