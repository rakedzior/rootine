import { AlertTriangle, Check, ChevronRight, Clock3, RotateCcw, ShieldCheck } from "lucide-react";
import type { AssistantPanelSpec } from "../panels/panel-schemas";

export type AssistantPanelInteraction =
  | { action: "select" | "open"; panelId: string; entityId: string }
  | { action: "confirm" | "cancel"; panelId: string; confirmationId: string }
  | { action: "undo"; panelId: string; undoToken: string }
  | { action: "retry"; panelId: string };

const PANEL_LABELS: Record<AssistantPanelSpec["type"], string> = {
  today_overview: "Dzisiaj",
  priority_tasks: "Priorytety",
  urgent_tasks: "Pilne",
  overdue_items: "Zaległe",
  task_candidates: "Wybierz zadanie",
  habits_summary: "Nawyki",
  nutrition_summary: "Odżywianie",
  meal_draft: "Szkic posiłku",
  water_summary: "Woda",
  body_summary: "Dane ciała",
  sport_summary: "Sport",
  upcoming_workouts: "Najbliższe treningi",
  work_summary: "Praca",
  goal_summary: "Cele",
  matter_summary: "Sprawy",
  note_results: "Notatki",
  finance_summary: "Finanse",
  confirmation: "Potwierdzenie",
  clarification: "Doprecyzowanie",
  action_result: "Wynik operacji",
  error: "Błąd",
};

export function AssistantPanelRenderer({
  panel,
  index,
  onInteraction,
}: {
  panel: AssistantPanelSpec;
  index: number;
  onInteraction: (interaction: AssistantPanelInteraction) => void;
}) {
  const title = panel.title ?? PANEL_LABELS[panel.type];
  const isDecision = panel.type === "confirmation";
  const isError = panel.type === "error";

  return (
    <article
      className={`assistant-panel is-${panel.emphasis ?? "normal"} type-${panel.type}`}
      style={{ "--assistant-panel-order": index } as React.CSSProperties}
      aria-labelledby={`${panel.id}-title`}
      aria-busy={false}
    >
      <header className="assistant-panel__header">
        <span className="assistant-panel__marker" aria-hidden="true">
          {isDecision ? <ShieldCheck size={15} /> : isError ? <AlertTriangle size={15} /> : <span />}
        </span>
        <h3 id={`${panel.id}-title`}>{title}</h3>
        {panel.data.total !== undefined && <span className="assistant-panel__count">{panel.data.total}</span>}
      </header>

      {panel.data.summary && <p className="assistant-panel__summary">{panel.data.summary}</p>}

      {panel.data.metrics.length > 0 && (
        <dl className="assistant-panel__metrics">
          {panel.data.metrics.map((metric) => (
            <div key={metric.id} className={`is-${metric.tone ?? "neutral"}`}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}{metric.unit && <small> {metric.unit}</small>}</dd>
            </div>
          ))}
        </dl>
      )}

      {panel.type === "meal_draft" && panel.data.ingredients && (
        <div className="assistant-panel__meal">
          <p><strong>{panel.data.meal}</strong>{panel.data.requiresConfirmation && <span>Wymaga zatwierdzenia</span>}</p>
          <ul>
            {panel.data.ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <span>{ingredient.name}</span>
                <small>{ingredient.grams ? `${ingredient.grams} g` : "Porcja do ustalenia"}</small>
                <span className={ingredient.matched ? "is-matched" : "is-unmatched"}>
                  {ingredient.matched ? "Dopasowano" : "Wybierz produkt"}
                </span>
              </li>
            ))}
          </ul>
          {panel.data.totals && (
            <p className="assistant-panel__meal-totals">
              {panel.data.totals.kcal} kcal · B {panel.data.totals.protein} g · W {panel.data.totals.carbs} g · T {panel.data.totals.fat} g
            </p>
          )}
        </div>
      )}

      {panel.data.items.length > 0 && (
        <ul className="assistant-panel__items">
          {panel.data.items.map((item) => (
            <li key={item.id} className={item.status ? `is-${item.status}` : undefined}>
              <button
                type="button"
                onClick={() => onInteraction({ action: "select", panelId: panel.id, entityId: item.id })}
                aria-label={`Wybierz: ${item.label}`}
              >
                <span className="assistant-panel__item-state" aria-hidden="true">
                  {item.status === "done" ? <Check size={13} /> : item.status === "overdue" ? <Clock3 size={13} /> : <span />}
                </span>
                <span className="assistant-panel__item-copy">
                  <strong>{item.label}</strong>
                  {item.meta && <small>{item.meta}</small>}
                </span>
                {item.value && <span className="assistant-panel__item-value">{item.value}</span>}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel.data.items.length === 0 && panel.data.emptyMessage && (
        <p className="assistant-panel__empty">{panel.data.emptyMessage}</p>
      )}

      {panel.type === "clarification" && panel.data.prompt && (
        <p className="assistant-panel__prompt">{panel.data.prompt}</p>
      )}

      {panel.type === "confirmation" && panel.data.confirmationId && (
        <div className="assistant-panel__confirmation">
          <dl>
            <div><dt>Operacja</dt><dd>{panel.data.operation}</dd></div>
            {panel.data.record && <div><dt>Rekord</dt><dd>{panel.data.record}</dd></div>}
            {panel.data.previousValue && <div><dt>Było</dt><dd>{panel.data.previousValue}</dd></div>}
            {panel.data.nextValue && <div><dt>Będzie</dt><dd>{panel.data.nextValue}</dd></div>}
          </dl>
          <div className="assistant-panel__decision-actions">
            <button type="button" className="is-secondary" onClick={() => onInteraction({ action: "cancel", panelId: panel.id, confirmationId: panel.data.confirmationId! })}>Anuluj</button>
            <button type="button" className="is-primary" autoFocus onClick={() => onInteraction({ action: "confirm", panelId: panel.id, confirmationId: panel.data.confirmationId! })}>Potwierdź</button>
          </div>
        </div>
      )}

      {(panel.type === "action_result" || panel.type === "error") && panel.data.message && (
        <div className="assistant-panel__result" role={panel.type === "error" ? "alert" : "status"}>
          <p>{panel.data.message}</p>
          {panel.data.recovery && <small>{panel.data.recovery}</small>}
          <div>
            {panel.data.undoToken && (
              <button type="button" onClick={() => onInteraction({ action: "undo", panelId: panel.id, undoToken: panel.data.undoToken! })}>
                <RotateCcw size={13} aria-hidden="true" /> Cofnij
              </button>
            )}
            {panel.data.retryable && (
              <button type="button" onClick={() => onInteraction({ action: "retry", panelId: panel.id })}>Spróbuj ponownie</button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
