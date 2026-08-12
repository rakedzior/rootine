import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { AppModuleId } from "../moduleRegistry";
import { Button, Modal } from "../ui";
import {
  deterministicQuickCaptureParser,
  type QuickCaptureKind,
} from "./quickCapture";
import {
  COMMAND_CENTER_ACTIONS,
  actionTarget,
  payloadForAction,
  type CommandCenterAction,
  type CommandCenterActionId,
} from "./commandCenterActions";

export interface CommandCenterProps {
  open: boolean;
  onClose: () => void;
  currentModuleId: AppModuleId | null | undefined;
}

const ACTION_BY_ID = new Map(COMMAND_CENTER_ACTIONS.map((action) => [action.id, action]));

const MODULE_PRIORITY: Record<AppModuleId, readonly CommandCenterActionId[]> = {
  today: ["task", "note", "affair", "workout", "meal", "expense"],
  tasks: ["task", "habit"],
  nutrition: ["meal", "water", "weight"],
  sport: ["workout", "activity"],
  work: ["work", "task", "note"],
  goals: ["goal", "task", "note"],
  travel: ["task", "note", "affair"],
  affairs: ["affair", "expense", "payment"],
  notes: ["note", "task"],
};

const KIND_TO_ACTION: Record<QuickCaptureKind, CommandCenterActionId> = {
  task: "task",
  habit: "habit",
  meal: "meal",
  water: "water",
  weight: "weight",
  workout: "workout",
  activity: "activity",
  note: "note",
  goal: "goal",
  affair: "affair",
  work: "work",
  expense: "expense",
  payment: "payment",
};

const KIND_LABEL: Record<QuickCaptureKind, string> = {
  task: "zadanie",
  habit: "nawyk",
  meal: "posiłek",
  water: "woda",
  weight: "waga",
  workout: "trening",
  activity: "aktywność",
  note: "notatka",
  goal: "cel",
  affair: "sprawa",
  work: "element pracy",
  expense: "wydatek",
  payment: "płatność",
};

const PRIORITY_LABEL = {
  normal: "normalny priorytet",
  low: "niski priorytet",
  medium: "średni priorytet",
  high: "wysoki priorytet",
} as const;

function contextualPriority(moduleId: AppModuleId | null | undefined, search: string) {
  if (!moduleId) return MODULE_PRIORITY.today;
  if (moduleId !== "affairs") return MODULE_PRIORITY[moduleId];

  const view = new URLSearchParams(search).get("widok");
  if (view === "finances") return ["payment", "expense", "affair"] as const;
  return MODULE_PRIORITY.affairs;
}

function orderActions(priority: readonly CommandCenterActionId[]) {
  const prioritized = priority
    .map((id) => ACTION_BY_ID.get(id))
    .filter((action): action is CommandCenterAction => Boolean(action));
  const priorityIds = new Set(priority);
  return [...prioritized, ...COMMAND_CENTER_ACTIONS.filter((action) => !priorityIds.has(action.id))];
}

function formatPreviewDate(date: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));
}

export function CommandCenter({ open, onClose, currentModuleId }: CommandCenterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [source, setSource] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAllActions, setShowAllActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const priority = useMemo(
    () => contextualPriority(currentModuleId, location.search),
    [currentModuleId, location.search],
  );
  const actions = useMemo(() => orderActions(priority), [priority]);
  const visibleActions = showAllActions ? actions : actions.slice(0, 6);
  const capture = useMemo(
    () => source.trim() ? deterministicQuickCaptureParser.parse(source) : null,
    [source],
  );
  const inferredAction = capture ? ACTION_BY_ID.get(KIND_TO_ACTION[capture.kind]) : undefined;

  useEffect(() => {
    if (!open) return;
    setSource("");
    setActiveIndex(0);
    setShowAllActions(false);
  }, [open, currentModuleId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [priority]);

  if (!open) return null;

  const moveActionFocus = (index: number) => {
    const nextIndex = (index + visibleActions.length) % visibleActions.length;
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
      moveActionFocus(visibleActions.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const action = inferredAction ?? visibleActions[activeIndex];
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
      moveActionFocus(visibleActions.length - 1);
    } else if (event.key === "/") {
      event.preventDefault();
      inputRef.current?.focus();
    }
  };

  const previewPayload = capture && inferredAction
    ? payloadForAction(inferredAction, capture)
    : null;
  const previewParts = capture && previewPayload
    ? [
        KIND_LABEL[capture.kind],
        previewPayload.date ? formatPreviewDate(previewPayload.date) : null,
        previewPayload.time ? previewPayload.time : null,
        previewPayload.priority ? PRIORITY_LABEL[previewPayload.priority] : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal
      title="Dodaj"
      description="Wpisz, co chcesz dodać, albo wybierz typ poniżej."
      size="lg"
      width="860px"
      bodyClassName="command-center"
      onClose={onClose}
    >
      <div className="command-center__stack">
        <section className="command-center__quick" aria-labelledby="command-center-quick-label">
          <label className="command-center__quick-label" id="command-center-quick-label" htmlFor="command-center-quick-input">
            Szybkie dodawanie
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
            className="command-center__input"
            data-autofocus
          />
          <output id="command-center-preview" className="command-center__preview">
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
              <span>Rozpoznajemy np. termin, godzinę i priorytet.</span>
            )}
          </output>
          <small id="command-center-keyboard-hint" className="command-center__keyboard-hint">
            Enter otwiera sugerowany formularz · ↓ przechodzi do typów · „/” wraca do pola.
          </small>
        </section>

        <section className="command-center__actions-section" aria-labelledby="command-center-actions-label">
          <div className="command-center__section-header">
            <h3 id="command-center-actions-label">
              {showAllActions ? "Wszystkie typy" : "Najczęściej używane"}
            </h3>
            <span>{visibleActions.length} z {actions.length}</span>
          </div>
          <div id="command-center-actions" className="command-center__actions">
            {visibleActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  ref={(node) => { actionRefs.current[index] = node; }}
                  variant="quiet"
                  className={`command-center__action${index === activeIndex ? " is-active" : ""}`}
                  fullWidth
                  leadingIcon={<Icon size={16} aria-hidden="true" />}
                  trailingIcon={<ChevronRight size={15} aria-hidden="true" />}
                  aria-describedby={`command-center-action-${action.id}-description`}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleActionKeyDown(event, index)}
                  onClick={() => openAction(action)}
                >
                  <span className="command-center__action-content">
                    <strong>{action.label}</strong>
                    <small id={`command-center-action-${action.id}-description`}>
                      {action.description}
                    </small>
                  </span>
                </Button>
              );
            })}
          </div>
          <Button
            className="command-center__toggle"
            variant="ghost"
            size="sm"
            trailingIcon={<ChevronDown size={14} aria-hidden="true" />}
            aria-expanded={showAllActions}
            aria-controls="command-center-actions"
            onClick={() => {
              setShowAllActions((expanded) => !expanded);
              setActiveIndex(0);
            }}
          >
            {showAllActions ? "Pokaż mniej" : "Pokaż wszystkie typy"}
          </Button>
        </section>
      </div>
    </Modal>
  );
}
