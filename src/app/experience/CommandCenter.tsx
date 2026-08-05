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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { AppModuleId } from "../moduleRegistry";
import { Button, Modal } from "../ui";
import {
  deterministicQuickCaptureParser,
  type QuickCaptureKind,
  type QuickCaptureResult,
} from "./quickCapture";

type CommandCenterActionId =
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

type CommandCenterAction = {
  id: CommandCenterActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  target: string;
};

export interface CommandCenterProps {
  open: boolean;
  onClose: () => void;
  currentModuleId: AppModuleId | null | undefined;
}

const ACTIONS: readonly CommandCenterAction[] = [
  {
    id: "task",
    label: "Zadanie",
    description: "Dodaj zadanie do planu dnia.",
    icon: CheckSquare2,
    target: "/zadania?widok=dzis&akcja=nowe-zadanie",
  },
  {
    id: "habit",
    label: "Nawyk",
    description: "Dodaj powtarzalny element dnia.",
    icon: Repeat2,
    target: "/zadania?widok=nawyki&akcja=nowy-nawyk",
  },
  {
    id: "meal",
    label: "Posiłek",
    description: "Otwórz zapis posiłku.",
    icon: Utensils,
    target: "/odzywianie?akcja=dodaj-posilek",
  },
  {
    id: "water",
    label: "Woda",
    description: "Zapisz porcję wody.",
    icon: GlassWater,
    target: "/odzywianie?akcja=dodaj-wode",
  },
  {
    id: "weight",
    label: "Waga",
    description: "Otwórz formularz pomiaru wagi.",
    icon: Scale,
    target: "/odzywianie?akcja=dodaj-wage",
  },
  {
    id: "workout",
    label: "Trening",
    description: "Zaplanuj lub rozpocznij trening.",
    icon: Dumbbell,
    target: "/sport?widok=today&akcja=dodaj-trening",
  },
  {
    id: "activity",
    label: "Aktywność",
    description: "Dodaj aktywność poza planem.",
    icon: Footprints,
    target: "/sport?widok=today&akcja=dodaj-aktywnosc",
  },
  {
    id: "note",
    label: "Notatka",
    description: "Otwórz czystą notatkę.",
    icon: NotebookPen,
    target: "/notatki?akcja=nowa-notatka",
  },
  {
    id: "goal",
    label: "Cel",
    description: "Zdefiniuj nowy cel.",
    icon: Target,
    target: "/cele?akcja=nowy-cel",
  },
  {
    id: "affair",
    label: "Sprawa",
    description: "Dodaj sprawę do dopilnowania.",
    icon: ShieldCheck,
    target: "/sprawy?widok=matters&akcja=nowa-sprawa",
  },
  {
    id: "work",
    label: "Element pracy",
    description: "Dodaj zadanie w bieżącym projekcie.",
    icon: BriefcaseBusiness,
    target: "/praca?akcja=nowe-zadanie",
  },
  {
    id: "payment",
    label: "Płatność",
    description: "Dodaj termin płatności.",
    icon: ReceiptText,
    target: "/sprawy?widok=payments&akcja=nowa-platnosc",
  },
  {
    id: "expense",
    label: "Wydatek",
    description: "Otwórz zapis wydatku.",
    icon: WalletCards,
    target: "/sprawy?widok=budget&akcja=nowy-wydatek",
  },
] as const;

const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));

const MODULE_PRIORITY: Record<AppModuleId, readonly CommandCenterActionId[]> = {
  today: ["task", "meal", "workout", "note", "affair"],
  tasks: ["task", "habit"],
  nutrition: ["meal", "water", "weight"],
  sport: ["workout", "activity"],
  work: ["work", "task", "note"],
  goals: ["goal", "task", "note"],
  affairs: ["affair", "expense", "payment"],
  notes: ["note", "task"],
};

const KIND_TO_ACTION: Record<QuickCaptureKind, CommandCenterActionId> = {
  task: "task",
  habit: "habit",
  meal: "meal",
  workout: "workout",
  note: "note",
  goal: "goal",
  affair: "affair",
  expense: "expense",
  payment: "payment",
};

const KIND_LABEL: Record<QuickCaptureKind, string> = {
  task: "zadanie",
  habit: "nawyk",
  meal: "posiłek",
  workout: "trening",
  note: "notatka",
  goal: "cel",
  affair: "sprawa",
  expense: "wydatek",
  payment: "płatność",
};

const PRIORITY_LABEL = {
  low: "niski priorytet",
  medium: "średni priorytet",
  high: "wysoki priorytet",
} as const;

const modalStackStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-4, 16px)",
};

const quickCaptureStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-2, 8px)",
  padding: "var(--space-3, 12px)",
  border: "1px solid var(--color-border, currentColor)",
  borderRadius: "var(--radius-lg, 12px)",
  background: "var(--color-surface-elevated, transparent)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 var(--space-3, 12px)",
  border: "1px solid var(--color-border-strong, var(--color-border, currentColor))",
  borderRadius: "var(--radius-md, 8px)",
  background: "var(--color-surface, transparent)",
  color: "var(--color-text, inherit)",
  font: "inherit",
};

const previewStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-2, 8px)",
  minHeight: 24,
  color: "var(--color-text-muted, inherit)",
  fontSize: "var(--font-size-sm, 0.875rem)",
};

const actionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: "var(--space-2, 8px)",
};

const actionContentStyle: CSSProperties = {
  display: "grid",
  justifyItems: "start",
  gap: 2,
  minWidth: 0,
  textAlign: "left",
};

function contextualPriority(moduleId: AppModuleId | null | undefined, search: string) {
  if (!moduleId) return MODULE_PRIORITY.today;
  if (moduleId !== "affairs") return MODULE_PRIORITY[moduleId];

  const view = new URLSearchParams(search).get("widok");
  if (view === "budget") return ["expense", "payment", "affair"] as const;
  if (view === "payments" || view === "subscriptions") return ["payment", "expense", "affair"] as const;
  return MODULE_PRIORITY.affairs;
}

function orderActions(priority: readonly CommandCenterActionId[]) {
  const prioritized = priority
    .map((id) => ACTION_BY_ID.get(id))
    .filter((action): action is CommandCenterAction => Boolean(action));
  const priorityIds = new Set(priority);
  return [...prioritized, ...ACTIONS.filter((action) => !priorityIds.has(action.id))];
}

function formatPreviewDate(date: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));
}

function actionTarget(action: CommandCenterAction, capture?: QuickCaptureResult) {
  if (!capture) return action.target;

  const [pathname, query = ""] = action.target.split("?");
  const params = new URLSearchParams(query);
  params.set("tytul", capture.title);
  if (capture.date) params.set("data", capture.date);
  if (capture.time) params.set("godzina", capture.time);
  if (capture.priority) params.set("priorytet", capture.priority);
  return `${pathname}?${params.toString()}`;
}

export function CommandCenter({ open, onClose, currentModuleId }: CommandCenterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [source, setSource] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const priority = useMemo(
    () => contextualPriority(currentModuleId, location.search),
    [currentModuleId, location.search],
  );
  const actions = useMemo(() => orderActions(priority), [priority]);
  const capture = useMemo(
    () => source.trim() ? deterministicQuickCaptureParser.parse(source) : null,
    [source],
  );
  const inferredAction = capture ? ACTION_BY_ID.get(KIND_TO_ACTION[capture.kind]) : undefined;

  useEffect(() => {
    if (!open) return;
    setSource("");
    setActiveIndex(0);
  }, [open, currentModuleId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [priority]);

  if (!open) return null;

  const moveActionFocus = (index: number) => {
    const nextIndex = (index + actions.length) % actions.length;
    setActiveIndex(nextIndex);
    actionRefs.current[nextIndex]?.focus();
  };

  const openAction = (action: CommandCenterAction, captureData = capture ?? undefined) => {
    onClose();
    void navigate(actionTarget(action, captureData), { viewTransition: true });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActionFocus(activeIndex);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActionFocus(actions.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const action = inferredAction ?? actions[activeIndex];
      if (action) openAction(action);
    }
  };

  const handleActionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveActionFocus(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveActionFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveActionFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveActionFocus(actions.length - 1);
    } else if (event.key === "/") {
      event.preventDefault();
      inputRef.current?.focus();
    }
  };

  const previewParts = capture
    ? [
        KIND_LABEL[capture.kind],
        capture.date ? formatPreviewDate(capture.date) : null,
        capture.time ? capture.time : null,
        capture.priority ? PRIORITY_LABEL[capture.priority] : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal
      title="Dodaj"
      description="Wybierz formularz albo opisz element jednym zdaniem. Rootine tylko rozpoznaje proste reguły i niczego nie zapisze bez Twojego potwierdzenia."
      size="lg"
      bodyClassName="command-center"
      onClose={onClose}
    >
      <div style={modalStackStyle}>
        <section style={quickCaptureStyle} aria-labelledby="command-center-quick-label">
          <label id="command-center-quick-label" htmlFor="command-center-quick-input">
            Szybki tekst
          </label>
          <input
            ref={inputRef}
            id="command-center-quick-input"
            type="text"
            value={source}
            autoComplete="off"
            spellCheck="true"
            placeholder="Np. Jutro o 16 odebrać garnitur"
            aria-describedby="command-center-preview command-center-keyboard-hint"
            onChange={(event) => setSource(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            style={inputStyle}
            data-autofocus
          />
          <output id="command-center-preview" style={previewStyle}>
            {capture ? (
              <>
                <span>Rozpoznano: {previewParts.join(" · ")}.</span>
                <strong>Nic jeszcze nie zapisano.</strong>
                {inferredAction && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openAction(inferredAction)}
                  >
                    Otwórz: {inferredAction.label}
                  </Button>
                )}
              </>
            ) : (
              <span>Rozpoznajemy datę, godzinę, typ i priorytet — deterministycznie, bez AI.</span>
            )}
          </output>
          <small id="command-center-keyboard-hint" style={{ color: "var(--color-text-muted, inherit)" }}>
            Enter otwiera sugerowany formularz. Strzałka w dół przechodzi do listy; „/” wraca do pola.
          </small>
        </section>

        <section aria-labelledby="command-center-actions-label">
          <h3 id="command-center-actions-label" style={{ margin: "0 0 var(--space-2, 8px)" }}>
            Formularze w tym kontekście
          </h3>
          <div id="command-center-actions" style={actionsStyle}>
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  ref={(node) => { actionRefs.current[index] = node; }}
                  variant={index === activeIndex ? "primary" : "quiet"}
                  fullWidth
                  leadingIcon={<Icon size={17} aria-hidden="true" />}
                  aria-describedby={`command-center-action-${action.id}-description`}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleActionKeyDown(event, index)}
                  onClick={() => openAction(action)}
                  style={{ justifyContent: "flex-start", minHeight: 56 }}
                >
                  <span style={actionContentStyle}>
                    <strong>{action.label}</strong>
                    <small id={`command-center-action-${action.id}-description`}>
                      {action.description}
                    </small>
                  </span>
                </Button>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
