import {
  BriefcaseBusiness,
  CheckSquare2,
  Dumbbell,
  Footprints,
  GlassWater,
  NotebookPen,
  ReceiptText,
  Repeat2,
  Scale,
  ShieldCheck,
  Target,
  Utensils,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { QuickCaptureResult } from "./quickCapture";

export type CommandCenterActionId =
  | "task"
  | "habit"
  | "meal"
  | "water"
  | "weight"
  | "workout"
  | "activity"
  | "note"
  | "goal"
  | "affair"
  | "work"
  | "payment"
  | "expense";

export type CommandCenterPayloadCapabilities = Readonly<{
  title: true;
  date: boolean;
  time: boolean;
  priority: false | "three-level" | "binary";
}>;

export type CommandCenterAction = {
  id: CommandCenterActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  target: string;
  capabilities: CommandCenterPayloadCapabilities;
};

const CAPABILITIES = {
  titleOnly: { title: true, date: false, time: false, priority: false },
  datedTitle: { title: true, date: true, time: false, priority: false },
  scheduledTitle: { title: true, date: true, time: true, priority: "three-level" },
  binaryScheduledTitle: { title: true, date: true, time: true, priority: "binary" },
  prioritizedDatedTitle: { title: true, date: true, time: false, priority: "three-level" },
} as const satisfies Record<string, CommandCenterPayloadCapabilities>;

export const COMMAND_CENTER_ACTIONS: readonly CommandCenterAction[] = [
  {
    id: "task",
    label: "Zadanie",
    description: "Dodaj zadanie do planu dnia.",
    icon: CheckSquare2,
    target: "/zadania?widok=dzis&akcja=nowe-zadanie",
    capabilities: CAPABILITIES.scheduledTitle,
  },
  {
    id: "habit",
    label: "Nawyk",
    description: "Dodaj powtarzalny element dnia.",
    icon: Repeat2,
    target: "/zadania?widok=nawyki&akcja=nowy-nawyk",
    capabilities: CAPABILITIES.titleOnly,
  },
  {
    id: "meal",
    label: "Posiłek",
    description: "Otwórz zapis posiłku.",
    icon: Utensils,
    target: "/odzywianie?akcja=dodaj-posilek",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "water",
    label: "Woda",
    description: "Zapisz porcję wody.",
    icon: GlassWater,
    target: "/odzywianie?akcja=dodaj-wode",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "weight",
    label: "Waga",
    description: "Otwórz formularz pomiaru wagi.",
    icon: Scale,
    target: "/odzywianie?akcja=dodaj-wage",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "workout",
    label: "Trening",
    description: "Zaplanuj lub rozpocznij trening.",
    icon: Dumbbell,
    target: "/sport?widok=today&akcja=dodaj-trening",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "activity",
    label: "Aktywność",
    description: "Dodaj aktywność poza planem.",
    icon: Footprints,
    target: "/sport?widok=today&akcja=dodaj-aktywnosc",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "note",
    label: "Notatka",
    description: "Otwórz czystą notatkę.",
    icon: NotebookPen,
    target: "/notatki?akcja=nowa-notatka",
    capabilities: CAPABILITIES.titleOnly,
  },
  {
    id: "goal",
    label: "Cel",
    description: "Zdefiniuj nowy cel.",
    icon: Target,
    target: "/cele?akcja=nowy-cel",
    capabilities: CAPABILITIES.prioritizedDatedTitle,
  },
  {
    id: "affair",
    label: "Sprawa",
    description: "Dodaj sprawę do dopilnowania.",
    icon: ShieldCheck,
    target: "/sprawy?widok=all&akcja=nowa-sprawa",
    capabilities: CAPABILITIES.binaryScheduledTitle,
  },
  {
    id: "work",
    label: "Zadanie pracy",
    description: "Dodaj zadanie pracy z terminem i godziną.",
    icon: BriefcaseBusiness,
    target: "/praca?akcja=nowe-zadanie",
    capabilities: CAPABILITIES.scheduledTitle,
  },
  {
    id: "payment",
    label: "Płatność",
    description: "Dodaj termin płatności.",
    icon: ReceiptText,
    target: "/sprawy?widok=finances&akcja=nowa-platnosc",
    capabilities: CAPABILITIES.datedTitle,
  },
  {
    id: "expense",
    label: "Wydatek",
    description: "Dodaj jednorazowy wydatek z terminem.",
    icon: WalletCards,
    target: "/sprawy?widok=finances&akcja=nowy-wydatek",
    capabilities: CAPABILITIES.datedTitle,
  },
] as const;

export type CommandCenterPayload = {
  title: string;
  date?: string;
  time?: string;
  priority?: QuickCaptureResult["priority"] | "normal";
};

function priorityForAction(
  capability: CommandCenterPayloadCapabilities["priority"],
  priority: QuickCaptureResult["priority"],
): CommandCenterPayload["priority"] {
  if (!capability || !priority) return undefined;
  if (capability === "three-level") return priority;
  return priority === "low" ? "normal" : "high";
}

export function payloadForAction(
  action: Pick<CommandCenterAction, "capabilities">,
  capture: QuickCaptureResult,
): CommandCenterPayload {
  const priority = priorityForAction(action.capabilities.priority, capture.priority);
  return {
    title: capture.title,
    ...(action.capabilities.date && capture.date ? { date: capture.date } : {}),
    ...(action.capabilities.time && capture.time ? { time: capture.time } : {}),
    ...(priority ? { priority } : {}),
  };
}

export function actionTarget(action: CommandCenterAction, capture?: QuickCaptureResult) {
  if (!capture) return action.target;

  const [pathname, query = ""] = action.target.split("?");
  const params = new URLSearchParams(query);
  const payload = payloadForAction(action, capture);
  params.set("tytul", payload.title);
  if (payload.date) params.set("data", payload.date);
  if (payload.time) params.set("godzina", payload.time);
  if (payload.priority) params.set("priorytet", payload.priority);
  return `${pathname}?${params.toString()}`;
}
