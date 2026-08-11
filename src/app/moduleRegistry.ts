import {
  BriefcaseBusiness,
  CheckSquare,
  Dumbbell,
  Map,
  NotebookPen,
  Salad,
  ShieldCheck,
  SunMedium,
  Target,
  type LucideIcon,
} from "lucide-react";

export type AppModuleId =
  | "today"
  | "tasks"
  | "nutrition"
  | "sport"
  | "work"
  | "goals"
  | "travel"
  | "affairs"
  | "notes";

export type AppModule = {
  id: AppModuleId;
  label: string;
  icon: LucideIcon;
  to: string;
  ownedPaths?: readonly string[];
  mobilePriority: number | null;
};

/*
 * `as const satisfies` rather than a plain annotation: the literal `to` values
 * are what makes the route-prefetch table in routePrefetch.ts exhaustive at
 * compile time. Widening this back to `readonly AppModule[]` would turn "new
 * module ships without a prefetch entry" from a type error into a silently
 * slower tab.
 */
export const APP_MODULES = [
  { id: "today", label: "Dzisiaj", icon: SunMedium, to: "/dzisiaj", mobilePriority: 0 },
  { id: "tasks", label: "Zadania", icon: CheckSquare, to: "/zadania", ownedPaths: ["/kalendarz"], mobilePriority: 1 },
  { id: "nutrition", label: "Odżywianie", icon: Salad, to: "/odzywianie", mobilePriority: null },
  { id: "sport", label: "Sport", icon: Dumbbell, to: "/sport", mobilePriority: null },
  { id: "work", label: "Praca", icon: BriefcaseBusiness, to: "/praca", mobilePriority: 2 },
  { id: "goals", label: "Cele", icon: Target, to: "/cele", mobilePriority: null },
  { id: "travel", label: "Podróże", icon: Map, to: "/podroze", mobilePriority: null },
  { id: "affairs", label: "Pozostałe", icon: ShieldCheck, to: "/sprawy", mobilePriority: null },
  { id: "notes", label: "Notatki", icon: NotebookPen, to: "/notatki", mobilePriority: 3 },
] as const satisfies readonly AppModule[];

export type AppModulePath = (typeof APP_MODULES)[number]["to"];

export const APP_MODULE_BY_ID = Object.fromEntries(
  APP_MODULES.map((module) => [module.id, module]),
) as Record<AppModuleId, AppModule>;

export function isModulePath(module: AppModule, pathname: string) {
  return [module.to, ...(module.ownedPaths ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function findModuleForPath(pathname: string) {
  return APP_MODULES.find((module) => isModulePath(module, pathname));
}
