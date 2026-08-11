/**
 * THESIS: JDG is one predictable monthly close: six checks, one previous month, one clear finish.
 */
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileUp,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import {
  createJdgMonthForWorkspace,
  getJdgMonthKey,
  JDG_STORAGE_KEY,
  loadJdgWorkspace,
  saveJdgWorkspace,
  type JdgChecklistGroup,
  type JdgChecklistItem,
  type JdgWorkspace as JdgWorkspaceData,
} from "../data/jdgWorkspace";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  ContentHeader,
  ProgressBar,
  SectionSurface,
} from "../ui";
import "../../styles/affairs.css";

type SimpleChecklistDefinition = Pick<JdgChecklistItem, "id" | "label" | "group" | "required" | "dueDay"> & {
  description: string;
  legacyIds?: string[];
  icon: typeof ReceiptText;
};

const MONTHLY_CLOSE: SimpleChecklistDefinition[] = [
  {
    id: "simple-invoice",
    label: "Wystawiłem fakturę",
    description: "Faktura sprzedażowa za rozliczany miesiąc jest gotowa.",
    group: "documents",
    required: true,
    dueDay: 1,
    icon: ReceiptText,
  },
  {
    id: "simple-accounting-upload",
    label: "Wgrałem dokumenty do księgowości",
    description: "Faktura, ZUS z poprzedniego miesiąca i wszystkie koszty są przekazane.",
    group: "documents",
    required: true,
    dueDay: 5,
    legacyIds: ["documents-sales", "documents-costs", "documents-zus"],
    icon: FileUp,
  },
  {
    id: "simple-books-closed",
    label: "Zamknąłem miesiąc w księgowości",
    description: "Dokumenty zostały sprawdzone, a wynik miesiąca jest ostateczny.",
    group: "control",
    required: true,
    dueDay: 10,
    legacyIds: ["control-close", "settlements-accounting"],
    icon: ShieldCheck,
  },
  {
    id: "simple-pit-28",
    label: "Opłaciłem PIT-28",
    description: "Podatek dochodowy został opłacony i potwierdzony.",
    group: "settlements",
    required: true,
    dueDay: 20,
    legacyIds: ["settlements-income-tax"],
    icon: Landmark,
  },
  {
    id: "simple-vat-7",
    label: "Opłaciłem VAT-7",
    description: "VAT za rozliczany miesiąc został opłacony.",
    group: "settlements",
    required: true,
    dueDay: 25,
    legacyIds: ["settlements-vat"],
    icon: Landmark,
  },
  {
    id: "simple-zus",
    label: "Opłaciłem ZUS",
    description: "Składki za działalność zostały opłacone.",
    group: "settlements",
    required: true,
    dueDay: 20,
    legacyIds: ["settlements-zus"],
    icon: Landmark,
  },
];

function formatMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function shiftMonthKey(value: string, offset: number): string {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return getJdgMonthKey(date);
}

function previousMonthKey(date = new Date()): string {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1, 12);
  return getJdgMonthKey(previous);
}

function isMonthKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function normalizeSimpleMonth(workspace: JdgWorkspaceData, monthKey: string): JdgWorkspaceData {
  const withMonth = workspace.months.some((month) => month.month === monthKey)
    ? workspace
    : createJdgMonthForWorkspace(workspace, monthKey);
  const month = withMonth.months.find((candidate) => candidate.month === monthKey);
  if (!month) return withMonth;

  const items = MONTHLY_CLOSE.map((definition) => {
    const exact = month.items.find((item) => item.id === definition.id);
    const legacy = (definition.legacyIds ?? [])
      .map((id) => month.items.find((item) => item.id === id))
      .filter((item): item is JdgChecklistItem => Boolean(item));
    const legacyDone = legacy.length > 0 && legacy.every((item) => item.done);
    const done = exact?.done ?? legacyDone;
    const doneAt = exact?.doneAt
      ?? (legacyDone ? legacy.map((item) => item.doneAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString() : "");
    return {
      id: definition.id,
      label: definition.label,
      group: definition.group as JdgChecklistGroup,
      required: true,
      dueDay: definition.dueDay,
      done,
      doneAt: done ? doneAt : "",
    };
  });

  const unchanged = month.items.length === items.length
    && month.items.every((item, index) => JSON.stringify(item) === JSON.stringify(items[index]));
  if (unchanged) return withMonth;
  return {
    ...withMonth,
    months: withMonth.months.map((candidate) => candidate.month === monthKey ? { ...candidate, items } : candidate),
  };
}

export function JdgWorkspace({
  layout,
  mobileNavigation,
}: {
  layout?: (content: ReactNode) => ReactNode;
  mobileNavigation?: ReactNode;
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMonth = isMonthKey(searchParams.get("month")) ? searchParams.get("month")! : previousMonthKey();
  const [monthKey, setMonthKey] = useState(initialMonth);
  const [workspace, setWorkspace] = useState(() => normalizeSimpleMonth(loadJdgWorkspace(), initialMonth));
  const [storageError, setStorageError] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    setStorageError(!saveJdgWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(JDG_STORAGE_KEY, () => {
    setWorkspace((current) => normalizeSimpleMonth(loadJdgWorkspace(), current.months.some((month) => month.month === monthKey) ? monthKey : previousMonthKey()));
  }), [monthKey]);

  useEffect(() => {
    const requested = searchParams.get("month");
    if (isMonthKey(requested) && requested !== monthKey) {
      setMonthKey(requested);
      setWorkspace((current) => normalizeSimpleMonth(current, requested));
    } else if (requested && !isMonthKey(requested)) {
      const next = new URLSearchParams(searchParams);
      next.delete("month");
      setSearchParams(next, { replace: true });
    }
  }, [monthKey, searchParams, setSearchParams]);

  const currentMonth = workspace.months.find((month) => month.month === monthKey);
  const items = currentMonth?.items ?? [];
  const completedCount = items.filter((item) => item.done).length;
  const closed = items.length === MONTHLY_CLOSE.length && completedCount === MONTHLY_CLOSE.length;
  const progress = Math.round(completedCount / MONTHLY_CLOSE.length * 100);
  const nextItem = items.find((item) => !item.done);
  const executionMonth = shiftMonthKey(monthKey, 1);

  const navigateMonth = (offset: number) => {
    const nextMonth = shiftMonthKey(monthKey, offset);
    setMonthKey(nextMonth);
    setWorkspace((current) => normalizeSimpleMonth(current, nextMonth));
    const next = new URLSearchParams(searchParams);
    next.set("month", nextMonth);
    setSearchParams(next);
  };

  const toggleItem = (itemId: string) => {
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? {
            ...month,
            items: month.items.map((item) => item.id === itemId
              ? { ...item, done: !item.done, doneAt: item.done ? "" : new Date().toISOString() }
              : item),
          }
        : month),
    }));
  };

  const resetMonth = () => {
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? { ...month, items: month.items.map((item) => ({ ...item, done: false, doneAt: "" })) }
        : month),
    }));
    setResetOpen(false);
  };

  const content = (
    <>
      <ContentHeader
        headingLevel={1}
        className="jdg-toolbar jdg-toolbar--simple"
        title="JDG"
        description={`Rozliczenie ${formatMonth(monthKey)} wykonywane w ${formatMonth(executionMonth)}`}
        mobileNavigation={mobileNavigation}
        meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
        actions={(
          <>
            <div className="affairs-month-switcher">
              <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => navigateMonth(-1)}><ChevronLeft size={13} /></Button>
              <strong>{formatMonth(monthKey)}</strong>
              <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => navigateMonth(1)}><ChevronRight size={13} /></Button>
            </div>
            {completedCount > 0 && (
              <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={() => setResetOpen(true)}>Wyczyść</Button>
            )}
          </>
        )}
      />

      <div className="jdg-simple-canvas">
        <section className={`jdg-simple-status ${closed ? "is-closed" : ""}`} aria-live="polite">
          <span className="jdg-simple-status__icon">
            {closed ? <CalendarCheck size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}
          </span>
          <div className="jdg-simple-status__copy">
            <h2>{closed ? "Miesiąc zamknięty" : `${completedCount} z ${MONTHLY_CLOSE.length} kroków gotowe`}</h2>
            <p>{closed
              ? `Wszystkie obowiązki za ${formatMonth(monthKey)} są załatwione.`
              : nextItem
                ? `Następny krok: ${nextItem.label.toLocaleLowerCase("pl-PL")}.`
                : "Zacznij od wystawienia faktury."}</p>
          </div>
          <ProgressBar
            value={progress}
            tone={closed ? "success" : "default"}
            label={`Postęp zamknięcia ${formatMonth(monthKey)}`}
            valueLabel={`${progress}%`}
            className="jdg-simple-status__progress"
          />
        </section>

        <SectionSurface className="jdg-simple-checklist" aria-labelledby="jdg-simple-checklist-title">
          <header className="jdg-simple-checklist__header">
            <div>
              <h2 id="jdg-simple-checklist-title">Zamknięcie {formatMonth(monthKey)}</h2>
              <p>Wykonuj po kolei. Wszystkie sześć punktów zamyka miesiąc.</p>
            </div>
            <Badge tone={closed ? "success" : "neutral"}>{completedCount}/{MONTHLY_CLOSE.length}</Badge>
          </header>

          <div className="jdg-simple-checklist__rows">
            {MONTHLY_CLOSE.map((definition, index) => {
              const item = items.find((candidate) => candidate.id === definition.id);
              const done = Boolean(item?.done);
              const Icon = definition.icon;
              return (
                <label key={definition.id} className={`jdg-simple-row ${done ? "is-done" : ""}`}>
                  <span className="jdg-simple-row__step" aria-hidden="true">{index + 1}</span>
                  <Checkbox
                    checked={done}
                    aria-label={done ? `Przywróć: ${definition.label}` : `Oznacz jako wykonane: ${definition.label}`}
                    onChange={() => toggleItem(definition.id)}
                  />
                  <span className="jdg-simple-row__icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="jdg-simple-row__copy">
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                  <span className="jdg-simple-row__due">do {definition.dueDay}. dnia</span>
                  {done && <Check className="jdg-simple-row__done" size={16} aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </SectionSurface>
      </div>

      {resetOpen && (
        <ConfirmDialog
          title="Wyczyścić miesiąc?"
          description={formatMonth(monthKey)}
          confirmLabel="Wyczyść zaznaczenia"
          onConfirm={resetMonth}
          onCancel={() => setResetOpen(false)}
        >
          <p className="affairs-confirm-copy">Wszystkie sześć checkboxów wróci do stanu niewykonanego.</p>
        </ConfirmDialog>
      )}
    </>
  );

  return layout ? layout(content) : content;
}

export default function Jdg() {
  return <JdgWorkspace />;
}
