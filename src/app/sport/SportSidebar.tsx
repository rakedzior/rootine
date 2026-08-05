import {
  Activity,
  ChartNoAxesCombined,
  CalendarRange,
  Dumbbell,
  History,
  Library,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Button, ContextNavItem, ModuleSidebar, SectionHeader } from "../ui";
import type { WorkoutSession } from "./model";
import type { PlannerView } from "./plannerModel";

const GROUPS: Array<{
  label: string;
  items: Array<{ id: PlannerView; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Główne",
    items: [{ id: "today", label: "Dzisiaj", icon: Activity }],
  },
  {
    label: "Planowanie",
    items: [
      { id: "cycle", label: "Plan treningowy", icon: CalendarRange },
      { id: "templates", label: "Szablony", icon: Library },
      { id: "exercises", label: "Ćwiczenia", icon: Dumbbell },
    ],
  },
  {
    label: "Pozostałe",
    items: [
      { id: "analysis", label: "Analiza", icon: ChartNoAxesCombined },
      { id: "history", label: "Historia", icon: History },
    ],
  },
];

export function SportSidebar({
  view,
  templateCount,
  historyCount,
  activeSession,
  onChange,
  onResume,
}: {
  view: PlannerView;
  templateCount: number;
  historyCount: number;
  activeSession?: WorkoutSession;
  onChange: (view: PlannerView) => void;
  onResume: () => void;
}) {
  const activeProgress = activeSession?.stages?.length
    ? `${activeSession.stages.filter((stage) => stage.done).length}/${activeSession.stages.length} etapów`
    : activeSession?.exercises.flatMap((exercise) => exercise.sets).length
      ? `${activeSession.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.done).length}/${activeSession.exercises.flatMap((exercise) => exercise.sets).length} serii`
      : activeSession
        ? `${activeSession.durationMinutes} min w planie`
        : "";
  const metaFor = (id: PlannerView) => {
    if (id === "templates") return templateCount;
    if (id === "history") return historyCount;
    return undefined;
  };

  return (
    <ModuleSidebar label="Widoki Sportu" className="sport-context-sidebar">
      <div className="sport-context-sidebar__nav">
        {GROUPS.map((group) => (
          <section key={group.label}>
            <SectionHeader title={group.label} level={2} variant="label" />
            <div>
              {group.items.map((item) => (
                <ContextNavItem
                  key={item.id}
                  active={view === item.id}
                  icon={<item.icon />}
                  label={item.label}
                  meta={metaFor(item.id)}
                  onClick={() => onChange(item.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {activeSession && (
        <div className="sport-context-sidebar__active">
          <span>Trening w toku</span>
          <strong>{activeSession.title}</strong>
          <small>{activeProgress}</small>
          <Button variant="primary" size="sm" fullWidth leadingIcon={<Play size={13} />} onClick={onResume}>
            Wznów trening
          </Button>
        </div>
      )}
    </ModuleSidebar>
  );
}
