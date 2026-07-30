import {
  BriefcaseBusiness,
  CheckSquare,
  Dumbbell,
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

export const APP_MODULES: readonly AppModule[] = [
  { id: "today", label: "Dzisiaj", icon: SunMedium, to: "/dzisiaj", mobilePriority: 0 },
  { id: "tasks", label: "Zadania", icon: CheckSquare, to: "/zadania", ownedPaths: ["/kalendarz"], mobilePriority: 1 },
  { id: "nutrition", label: "Odżywianie", icon: Salad, to: "/odzywianie", mobilePriority: null },
  { id: "sport", label: "Sport", icon: Dumbbell, to: "/sport", mobilePriority: null },
  { id: "work", label: "Praca", icon: BriefcaseBusiness, to: "/praca", mobilePriority: 2 },
  { id: "goals", label: "Cele", icon: Target, to: "/cele", mobilePriority: null },
  { id: "affairs", label: "Sprawy", icon: ShieldCheck, to: "/sprawy", ownedPaths: ["/podroze"], mobilePriority: null },
  { id: "notes", label: "Notatki", icon: NotebookPen, to: "/notatki", mobilePriority: 3 },
];

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
