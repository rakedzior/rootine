/**
 * THESIS: JDG is a repeatable monthly close, not a loose tax checklist; it refuses tasks without sequence or evidence.
 * OWN-WORLD: Routine's graphite register, three ordered ledgers, date-driven status, and one blue completion path.
 * STORY: Prepare documents, settle obligations, verify proof, and only then close the month with confidence.
 * FIRST VIEWPORT: The selected month, completion state, and every required checkpoint are visible without changing context.
 * FORM: The seventh grounded structure — a monthly responsibility cockpit — selected with seed 54454916.
 */
import {
  Archive,
  Building2,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Landmark,
  LockKeyhole,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createJdgItemId,
  createJdgMonth,
  getJdgMonthKey,
  loadJdgWorkspace,
  saveJdgWorkspace,
  type JdgChecklistGroup,
} from "../data/jdgWorkspace";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  WorkspaceToolbar,
} from "../ui";

const GROUPS: Array<{
  id: JdgChecklistGroup;
  title: string;
  description: string;
  icon: typeof FileCheck2;
}> = [
  {
    id: "documents",
    title: "Dokumenty",
    description: "Materiały przekazane do księgowości i zgodne z kontem.",
    icon: FileCheck2,
  },
  {
    id: "settlements",
    title: "Rozliczenia",
    description: "Księgowość, składki i podatki opłacone w terminie.",
    icon: Landmark,
  },
  {
    id: "control",
    title: "Kontrola i zamknięcie",
    description: "Dowody wysyłki, należności i kompletne archiwum miesiąca.",
    icon: Archive,
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

function dueStatus(month: string, day: number | null, done: boolean): {
  label: string;
  tone: "neutral" | "warning" | "danger" | "success";
} {
  if (done) return { label: "Gotowe", tone: "success" };
  if (!day) return { label: "Bez terminu", tone: "neutral" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const target = new Date(year, monthNumber - 1, Math.min(day, lastDay), 12);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const difference = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (difference < 0) return { label: "Po terminie", tone: "danger" };
  if (difference <= 3) return { label: `Do ${day}. dnia`, tone: "warning" };
  return { label: `Do ${day}. dnia`, tone: "neutral" };
}

export function JdgWorkspace() {
  const [workspace, setWorkspace] = useState(loadJdgWorkspace);
  const [monthKey, setMonthKey] = useState(getJdgMonthKey);
  const [storageError, setStorageError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftGroup, setDraftGroup] = useState<JdgChecklistGroup>("documents");
  const [draftRequired, setDraftRequired] = useState(false);
  const [draftDueDay, setDraftDueDay] = useState("");
  const [editorError, setEditorError] = useState("");

  useEffect(() => {
    setStorageError(!saveJdgWorkspace(workspace));
  }, [workspace]);

  useEffect(() => {
    if (workspace.months.some((month) => month.month === monthKey)) return;
    setWorkspace((current) => ({
      ...current,
      months: [...current.months, createJdgMonth(monthKey, current.months.at(-1))],
    }));
  }, [monthKey, workspace.months]);

  const currentMonth = workspace.months.find((month) => month.month === monthKey);
  const items = currentMonth?.items ?? [];
  const requiredItems = items.filter((item) => item.required);
  const closeItem = items.find((item) => item.id === "control-close");
  const requiredBeforeClose = requiredItems.filter((item) => item.id !== "control-close");
  const readyToClose = requiredBeforeClose.every((item) => item.done);
  const closed = Boolean(closeItem?.done && readyToClose);
  const completedCount = items.filter((item) => item.done).length;
  const requiredCompleted = requiredItems.filter((item) => item.done).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;

  const nextDeadline = useMemo(() => {
    return items
      .filter((item) => !item.done && item.dueDay !== null)
      .sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32))[0];
  }, [items]);

  const navigateMonth = (offset: number) => {
    const nextKey = shiftMonthKey(monthKey, offset);
    setWorkspace((current) => current.months.some((month) => month.month === nextKey)
      ? current
      : {
          ...current,
          months: [...current.months, createJdgMonth(nextKey, currentMonth)],
        });
    setMonthKey(nextKey);
  };

  const toggleItem = (itemId: string) => {
    if (itemId === "control-close" && !readyToClose && !closeItem?.done) return;
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? {
            ...month,
            items: month.items.map((item) => item.id === itemId
              ? {
                  ...item,
                  done: !item.done,
                  doneAt: item.done ? "" : new Date().toISOString(),
                }
              : item),
          }
        : month),
    }));
  };

  const resetMonth = () => {
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? {
            ...month,
            items: month.items.map((item) => ({ ...item, done: false, doneAt: "" })),
          }
        : month),
    }));
  };

  const deleteCustomItem = (itemId: string) => {
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? { ...month, items: month.items.filter((item) => item.id !== itemId) }
        : month),
    }));
  };

  const openEditor = () => {
    setDraftLabel("");
    setDraftGroup("documents");
    setDraftRequired(false);
    setDraftDueDay("");
    setEditorError("");
    setEditorOpen(true);
  };

  const submitCustomItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = draftLabel.trim();
    const parsedDueDay = draftDueDay ? Number(draftDueDay) : null;
    if (!label) {
      setEditorError("Wpisz nazwę punktu.");
      return;
    }
    if (parsedDueDay !== null && (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31)) {
      setEditorError("Dzień terminu musi mieścić się między 1 a 31.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      months: current.months.map((month) => month.month === monthKey
        ? {
            ...month,
            items: [...month.items, {
              id: createJdgItemId(),
              label,
              group: draftGroup,
              required: draftRequired,
              dueDay: parsedDueDay,
              done: false,
              doneAt: "",
            }],
          }
        : month),
    }));
    setEditorOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Sprawy"
        description="JDG · Miesięczne dokumenty, podatki i zamknięcie działalności"
        leading={<Building2 size={17} />}
        meta={storageError
          ? <Badge tone="danger">Brak zapisu lokalnego</Badge>
          : closed
            ? <Badge tone="success" dot>Miesiąc zamknięty</Badge>
            : <Badge tone="warning" dot>W toku</Badge>}
        actions={(
          <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={openEditor}>
            <span className="header-action-label">Dodaj punkt</span>
          </Button>
        )}
      />
      <WorkspaceToolbar className="jdg-toolbar">
        <div className="jdg-month-switcher">
          <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => navigateMonth(-1)}><ChevronLeft size={13} /></Button>
          <div>
            <span>Rozliczenie za</span>
            <strong>{formatMonth(monthKey)}</strong>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => navigateMonth(1)}><ChevronRight size={13} /></Button>
        </div>
        <div className="jdg-toolbar__status">
          <span>{requiredCompleted}/{requiredItems.length} wymaganych</span>
          <span className="jdg-toolbar__divider" />
          <span>{completedCount}/{items.length} wszystkich</span>
        </div>
        <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={12} />} onClick={resetMonth} disabled={completedCount === 0}>
          Wyczyść miesiąc
        </Button>
      </WorkspaceToolbar>

      <div className="jdg-canvas">
          <section className={`jdg-month-state ${closed ? "is-closed" : ""}`}>
            <div className="jdg-month-state__identity">
              <span className="jdg-month-state__icon">
                {closed ? <CalendarCheck size={18} /> : <CalendarCheck size={18} />}
              </span>
              <div>
                <h2>{closed ? "Miesiąc zamknięty" : "Zamknięcie miesiąca w toku"}</h2>
                <p>
                  {closed
                    ? `Wszystkie wymagane punkty za ${formatMonth(monthKey)} są potwierdzone.`
                    : nextDeadline
                      ? `Najbliższy punkt: ${nextDeadline.label.toLocaleLowerCase("pl-PL")}.`
                      : "Uzupełnij rejestr i zamknij miesiąc po wykonaniu wymaganych punktów."}
                </p>
              </div>
            </div>
            <div className="jdg-month-state__progress">
              <span><i style={{ transform: `scaleX(${progress / 100})` }} /></span>
              <strong>{progress}%</strong>
            </div>
          </section>

          <div className="jdg-checklist">
            {GROUPS.map((group, groupIndex) => {
              const groupItems = items.filter((item) => item.group === group.id);
              const groupDone = groupItems.filter((item) => item.done).length;
              const GroupIcon = group.icon;
              return (
                <Card key={group.id} as="section" tone="panel" padding="none" className="jdg-stage">
                  <header className="jdg-stage__header">
                    <span className="jdg-stage__number">{groupIndex + 1}</span>
                    <span className="jdg-stage__icon"><GroupIcon size={15} /></span>
                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>
                    <Badge tone={groupDone === groupItems.length && groupItems.length > 0 ? "success" : "neutral"}>
                      {groupDone}/{groupItems.length}
                    </Badge>
                  </header>

                  <div className="jdg-stage__items">
                    {groupItems.map((item) => {
                      const due = dueStatus(monthKey, item.dueDay, item.done);
                      const isClose = item.id === "control-close";
                      const closeLocked = isClose && !readyToClose && !item.done;
                      return (
                        <div key={item.id} className={`jdg-check-row ${item.done ? "is-done" : ""} ${isClose ? "is-final" : ""}`}>
                          <button
                            type="button"
                            className="jdg-check"
                            aria-pressed={item.done}
                            aria-label={item.done ? `Cofnij: ${item.label}` : `Potwierdź: ${item.label}`}
                            disabled={closeLocked}
                            title={closeLocked ? "Najpierw ukończ pozostałe wymagane punkty." : undefined}
                            onClick={() => toggleItem(item.id)}
                          >
                            {item.done ? <Check size={10} /> : closeLocked ? <LockKeyhole size={9} /> : null}
                          </button>
                          <button
                            type="button"
                            className="jdg-check-row__label"
                            disabled={closeLocked}
                            onClick={() => toggleItem(item.id)}
                          >
                            <strong>{item.label}</strong>
                            <small>
                              {item.doneAt
                                ? `Potwierdzono ${new Date(item.doneAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`
                                : item.required ? "Punkt wymagany" : "Punkt kontrolny"}
                            </small>
                          </button>
                          <Badge tone={closeLocked ? "warning" : due.tone}>
                            {closeLocked ? "Po wymaganych" : due.label}
                          </Badge>
                          {item.id.startsWith("custom-") && (
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${item.label}`} onClick={() => deleteCustomItem(item.id)}>
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {groupItems.length === 0 && (
                      <div className="jdg-stage__empty">
                        <span>Brak punktów w tym etapie.</span>
                        <button type="button" onClick={openEditor}>Dodaj własny</button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {!readyToClose && (
            <div className="jdg-close-hint">
              <CircleAlert size={14} aria-hidden="true" />
              <p>
                <strong>Miesiąc można zamknąć po wymaganych punktach.</strong>
                Zostało {requiredBeforeClose.filter((item) => !item.done).length}; punkty kontrolne są pomocnicze i nie blokują zamknięcia.
              </p>
            </div>
          )}

          <Card as="section" tone="input" padding="default" className="jdg-note">
            <div>
              <ReceiptText size={14} aria-hidden="true" />
              <span>
                <strong>Notatka do miesiąca</strong>
                <small>Wyjątki, kwoty do sprawdzenia albo pytania do księgowości.</small>
              </span>
            </div>
            <textarea
              aria-label={`Notatka do rozliczenia za ${formatMonth(monthKey)}`}
              placeholder="np. Brakuje korekty faktury za hosting…"
              value={currentMonth?.note ?? ""}
              onChange={(event) => setWorkspace((current) => ({
                ...current,
                months: current.months.map((month) => month.month === monthKey ? { ...month, note: event.target.value } : month),
              }))}
            />
          </Card>
      </div>

      {editorOpen && (
        <Modal
          eyebrow={formatMonth(monthKey)}
          title="Własny punkt checklisty"
          description="Dodaj kontrolę specyficzną dla Twojej działalności. Trafi do kolejnych nowo tworzonych miesięcy."
          onClose={() => setEditorOpen(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setEditorOpen(false)}>Anuluj</Button>
              <Button variant="primary" type="submit" form="jdg-item-form">Dodaj punkt</Button>
            </>
          )}
        >
          <form id="jdg-item-form" className="jdg-form" onSubmit={submitCustomItem}>
            <Input
              label="Nazwa punktu"
              placeholder="np. Sprawdziłem limit zwolnienia"
              value={draftLabel}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraftLabel(event.target.value);
                if (editorError) setEditorError("");
              }}
            />
            <div className="jdg-form__grid">
              <Select
                label="Etap"
                value={draftGroup}
                options={GROUPS.map((group) => ({ value: group.id, label: group.title }))}
                onChange={(event) => setDraftGroup(event.target.value as JdgChecklistGroup)}
              />
              <Input
                type="number"
                min="1"
                max="31"
                label="Termin — dzień miesiąca"
                placeholder="opcjonalnie"
                value={draftDueDay}
                onChange={(event) => setDraftDueDay(event.target.value)}
              />
            </div>
            <label className="affairs-form__check">
              <input type="checkbox" checked={draftRequired} onChange={(event) => setDraftRequired(event.target.checked)} />
              <span>
                <strong>Wymagany do zamknięcia</strong>
                <small>Nie pozwoli oznaczyć miesiąca jako zamknięty, dopóki nie będzie gotowy.</small>
              </span>
            </label>
          </form>
        </Modal>
      )}
    </>
  );
}
