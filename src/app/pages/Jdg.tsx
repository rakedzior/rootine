/**
 * THESIS: JDG is a repeatable monthly close, not a loose tax checklist; it refuses tasks without sequence or evidence.
 * OWN-WORLD: Rootine's graphite register, three ordered ledgers, date-driven status, and one blue completion path.
 * STORY: Prepare documents, settle obligations, verify proof, and only then close the month with confidence.
 * FIRST VIEWPORT: The selected month, completion state, and every required checkpoint are visible without changing context.
 * FORM: The seventh grounded structure — a monthly responsibility cockpit — selected with seed 54454916.
 */
import {
  Archive,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Landmark,
  LayoutTemplate,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { calendarDaysBetween, todayLocalDateKey } from "../data/localDate";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatShortDate } from "../formatters";
import {
  applyJdgMonthTemplate,
  createJdgItemId,
  createJdgMonthForWorkspace,
  createJdgTemplateFromMonth,
  deleteJdgMonthItem,
  getJdgMonthKey,
  JDG_ACCOUNTING_MODE_OPTIONS as ACCOUNTING_MODE_OPTIONS,
  JDG_TAX_FORM_OPTIONS as TAX_FORM_OPTIONS,
  JDG_VAT_CADENCE_OPTIONS as VAT_CADENCE_OPTIONS,
  JDG_VAT_STATUS_OPTIONS as VAT_STATUS_OPTIONS,
  JDG_ZUS_SCHEME_OPTIONS as ZUS_SCHEME_OPTIONS,
  JDG_STORAGE_KEY,
  loadJdgWorkspace,
  resetJdgMonth,
  saveJdgWorkspace,
  setJdgDefaultTemplate,
  undoJdgAuditEvent,
  updateJdgTaxProfile,
  type JdgChecklistGroup,
  type JdgChecklistItem,
  type JdgMonth,
  type JdgTaxProfile,
} from "../data/jdgWorkspace";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  PageHeader,
  Select,
  WorkspaceToolbar,
  AddToTasksButton,
} from "../ui";
import "../../styles/affairs.css";

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

const EMPTY_JDG_ITEMS: JdgChecklistItem[] = [];

type PendingDestructiveAction =
  | { type: "reset"; month: JdgMonth }
  | { type: "delete"; monthKey: string; item: JdgChecklistItem }
  | { type: "replace-template"; monthKey: string; templateId: string; templateName: string };

type UndoableAction = {
  type: "reset" | "delete" | "replace-template";
  eventId: string;
  message: string;
};

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
  const target = `${year}-${String(monthNumber).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  const difference = calendarDaysBetween(todayLocalDateKey(), target) ?? 0;
  if (difference < 0) return { label: "Po terminie", tone: "danger" };
  if (difference <= 3) return { label: `Do ${day}. dnia`, tone: "warning" };
  return { label: `Do ${day}. dnia`, tone: "neutral" };
}

export function JdgWorkspace({
  layout,
}: {
  layout?: (header: ReactNode, content: ReactNode) => ReactNode;
} = {}) {
  const [workspace, setWorkspace] = useState(loadJdgWorkspace);
  const [monthKey, setMonthKey] = useState(getJdgMonthKey);
  const [profileDraft, setProfileDraft] = useState<JdgTaxProfile>(() => structuredClone(workspace.taxProfile));
  const [storageError, setStorageError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftGroup, setDraftGroup] = useState<JdgChecklistGroup>("documents");
  const [draftRequired, setDraftRequired] = useState(false);
  const [draftDueDay, setDraftDueDay] = useState("");
  const [editorError, setEditorError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<PendingDestructiveAction | null>(null);
  const [undoableAction, setUndoableAction] = useState<UndoableAction | null>(null);

  useEffect(() => {
    setStorageError(!saveJdgWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(JDG_STORAGE_KEY, () => {
    setWorkspace(loadJdgWorkspace());
  }), []);

  useEffect(() => {
    if (workspace.months.some((month) => month.month === monthKey)) return;
    setWorkspace((current) => createJdgMonthForWorkspace(current, monthKey));
  }, [monthKey, workspace.months]);

  const currentMonth = workspace.months.find((month) => month.month === monthKey);
  const items = currentMonth?.items ?? EMPTY_JDG_ITEMS;
  const requiredItems = items.filter((item) => item.required);
  const closeItem = items.find((item) => item.id === "control-close");
  const requiredBeforeClose = requiredItems.filter((item) => item.id !== "control-close");
  const readyToClose = requiredBeforeClose.every((item) => item.done);
  const closed = Boolean(closeItem?.done && readyToClose);
  const completedCount = items.filter((item) => item.done).length;
  const requiredCompleted = requiredItems.filter((item) => item.done).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;
  const taxFormLabel = TAX_FORM_OPTIONS.find((option) => option.value === workspace.taxProfile.taxForm)?.label
    ?? "Profil podatkowy";
  const profileNeedsSetup = Object.entries(workspace.taxProfile)
    .some(([key, value]) => key !== "updatedAt" && value === "unconfigured");

  const nextDeadline = useMemo(() => {
    return items
      .filter((item) => !item.done && item.dueDay !== null)
      .sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32))[0];
  }, [items]);

  const navigateMonth = (offset: number) => {
    const nextKey = shiftMonthKey(monthKey, offset);
    setWorkspace((current) => current.months.some((month) => month.month === nextKey)
      ? current
      : createJdgMonthForWorkspace(current, nextKey));
    setMonthKey(nextKey);
  };

  const toggleItem = (itemId: string) => {
    if (itemId === "control-close" && !readyToClose && !closeItem?.done) return;
    setUndoableAction(null);
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

  const requestMonthReset = () => {
    if (!currentMonth || completedCount === 0) return;
    setPendingDestructiveAction({ type: "reset", month: structuredClone(currentMonth) });
  };

  const resetMonth = (snapshot: JdgMonth) => {
    const previousEventIds = new Set(workspace.history.map((event) => event.id));
    const next = resetJdgMonth(workspace, snapshot.month);
    const eventId = next.history.find((event) => !previousEventIds.has(event.id))?.id ?? "";
    setWorkspace(next);
    setUndoableAction({
      type: "reset",
      eventId,
      message: `Wyczyszczono potwierdzenia za ${formatMonth(snapshot.month)}.`,
    });
    setPendingDestructiveAction(null);
  };

  const requestCustomItemDeletion = (itemId: string) => {
    if (!currentMonth) return;
    const index = currentMonth.items.findIndex((item) => item.id === itemId);
    const item = currentMonth.items[index];
    if (!item || index < 0) return;
    setPendingDestructiveAction({
      type: "delete",
      monthKey,
      item: structuredClone(item),
    });
  };

  const deleteCustomItem = (action: Extract<PendingDestructiveAction, { type: "delete" }>) => {
    const previousEventIds = new Set(workspace.history.map((event) => event.id));
    const next = deleteJdgMonthItem(workspace, action.monthKey, action.item.id);
    const eventId = next.history.find((event) => !previousEventIds.has(event.id))?.id ?? "";
    setWorkspace(next);
    setUndoableAction({
      type: "delete",
      eventId,
      message: `Usunięto punkt „${action.item.label}”.`,
    });
    setPendingDestructiveAction(null);
  };

  const undoLastAction = () => {
    if (!undoableAction) return;
    if (undoableAction.eventId) {
      setWorkspace((current) => undoJdgAuditEvent(current, undoableAction.eventId));
    }
    setUndoableAction(null);
  };

  const openEditor = () => {
    setDraftLabel("");
    setDraftGroup("documents");
    setDraftRequired(false);
    setDraftDueDay("");
    setEditorError("");
    setEditorOpen(true);
  };

  const openSettings = () => {
    setProfileDraft(structuredClone(workspace.taxProfile));
    setTemplateName("");
    setSettingsError("");
    setSettingsNotice("");
    setSettingsOpen(true);
  };

  const saveTaxProfile = () => {
    setWorkspace((current) => updateJdgTaxProfile(current, profileDraft));
    setSettingsNotice("Profil i jego szablon zaktualizowano. Checklista z profilu jest teraz domyślna dla nowych miesięcy.");
    setSettingsError("");
  };

  const saveCurrentMonthAsTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      setSettingsError("Podaj nazwę szablonu.");
      return;
    }
    setWorkspace((current) => createJdgTemplateFromMonth(current, monthKey, { name }));
    setTemplateName("");
    setSettingsError("");
    setSettingsNotice(`Zapisano szablon „${name}”.`);
  };

  const applyTemplate = (templateId: string, templateNameLabel: string) => {
    const next = applyJdgMonthTemplate(workspace, monthKey, templateId, "merge");
    setWorkspace(next);
    if (next !== workspace) setUndoableAction(null);
    setSettingsNotice(next === workspace
      ? `Miesiąc ma już wszystkie punkty z szablonu „${templateNameLabel}”.`
      : `Dodano brakujące punkty z szablonu „${templateNameLabel}”.`);
    setSettingsError("");
  };

  const replaceMonthWithTemplate = (
    action: Extract<PendingDestructiveAction, { type: "replace-template" }>,
  ) => {
    const previousEventIds = new Set(workspace.history.map((event) => event.id));
    const next = applyJdgMonthTemplate(workspace, action.monthKey, action.templateId, "replace");
    const eventId = next.history.find((event) => !previousEventIds.has(event.id))?.id ?? "";
    setWorkspace(next);
    setUndoableAction({
      type: "replace-template",
      eventId,
      message: `Zastosowano szablon „${action.templateName}” do ${formatMonth(action.monthKey)}.`,
    });
    setSettingsOpen(false);
    setPendingDestructiveAction(null);
  };

  const chooseDefaultTemplate = (templateId: string, templateNameLabel: string) => {
    setWorkspace((current) => setJdgDefaultTemplate(current, templateId));
    setSettingsNotice(`Szablon „${templateNameLabel}” będzie używany dla nowych miesięcy.`);
    setSettingsError("");
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
    setUndoableAction(null);
    setEditorOpen(false);
  };

  const header = (
    <PageHeader
        title="Sprawy"
        description="JDG · Miesięczne dokumenty, podatki i zamknięcie działalności"
        meta={(
          <div className="flex items-center gap-2">
            {storageError
              ? <Badge tone="danger">Brak zapisu lokalnego</Badge>
              : closed
                ? <Badge tone="success" dot>Miesiąc zamknięty</Badge>
                : <Badge tone="warning" dot>W toku</Badge>}
            <Badge tone={profileNeedsSetup ? "warning" : "neutral"}>
              {profileNeedsSetup ? "Uzupełnij profil podatkowy" : taxFormLabel}
            </Badge>
          </div>
        )}
        actions={(
          <>
            <Button variant="quiet" leadingIcon={<Settings2 size={13} />} onClick={openSettings}>
              <span className="header-action-label">Profil i szablony</span>
            </Button>
            <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={openEditor}>
              <span className="header-action-label">Dodaj punkt</span>
            </Button>
          </>
        )}
    />
  );

  const content = (
    <>
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
        <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={12} />} onClick={requestMonthReset} disabled={completedCount === 0}>
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
                      const dueDate = item.dueDay ? `${monthKey}-${String(item.dueDay).padStart(2, "0")}` : undefined;
                      return (
                        <div key={item.id} className={`jdg-check-row ${item.done ? "is-done" : ""} ${isClose ? "is-final" : ""}`}>
                          <Checkbox
                            size="sm"
                            checked={item.done}
                            aria-label={item.done ? `Cofnij: ${item.label}` : `Potwierdź: ${item.label}`}
                            disabled={closeLocked}
                            title={closeLocked ? "Najpierw ukończ pozostałe wymagane punkty." : undefined}
                            onChange={() => toggleItem(item.id)}
                          />
                          <button
                            type="button"
                            className="jdg-check-row__label"
                            disabled={closeLocked}
                            onClick={() => toggleItem(item.id)}
                          >
                            <strong>{item.label}</strong>
                            <small>
                              {item.doneAt
                                ? `Potwierdzono ${formatShortDate(item.doneAt)}`
                                : item.required ? "Punkt wymagany" : "Punkt kontrolny"}
                            </small>
                          </button>
                          <Badge tone={closeLocked ? "warning" : due.tone}>
                            {closeLocked ? "Po wymaganych" : due.label}
                          </Badge>
                          <AddToTasksButton compact input={{
                            source: {
                              kind: "affairs",
                              entity: `${encodeURIComponent(monthKey)}/${encodeURIComponent(item.id)}`,
                              context: `JDG · ${monthKey}`,
                              href: `/sprawy?widok=jdg&month=${encodeURIComponent(monthKey)}`,
                            },
                            text: item.label,
                            done: item.done,
                            calendarDate: dueDate,
                            date: dueDate,
                            list: "sprawy",
                            tags: ["sprawy", "jdg"],
                          }} />
                          {item.id.startsWith("custom-") && (
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Usuń ${item.label}`} onClick={() => requestCustomItemDeletion(item.id)}>
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
              onChange={(event) => {
                setUndoableAction(null);
                setWorkspace((current) => ({
                  ...current,
                  months: current.months.map((month) => month.month === monthKey ? { ...month, note: event.target.value } : month),
                }));
              }}
            />
          </Card>
      </div>

      {settingsOpen && (
        <Modal
          title="Profil podatkowy i szablony"
          description="Ustaw zgodnie z informacją od księgowości. Rootine organizuje obowiązki, ale nie wylicza podatku."
          onClose={() => setSettingsOpen(false)}
          width={680}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setSettingsOpen(false)}>Zamknij</Button>
              <Button variant="primary" onClick={saveTaxProfile}>Zapisz profil</Button>
            </>
          )}
        >
          <div className="jdg-settings">
            <div className="jdg-settings-intro">
              <LayoutTemplate size={18} aria-hidden="true" />
              <p>
                <strong>Profil buduje bezpieczny szablon obowiązków.</strong>
                Bieżący rejestr pozostaje bez zmian, dopóki nie zastosujesz do niego szablonu. Nowe miesiące użyją szablonu domyślnego.
              </p>
            </div>

            <section className="jdg-settings__section" aria-labelledby="jdg-profile-heading">
              <div className="jdg-settings__heading">
                <h3 id="jdg-profile-heading">Profil działalności</h3>
                <p>Nie zakładamy automatycznie ryczałtu, VAT ani konkretnego wariantu ZUS.</p>
              </div>
              <div className="jdg-settings__grid">
                <Select
                  label="Forma opodatkowania"
                  value={profileDraft.taxForm}
                  options={TAX_FORM_OPTIONS}
                  onChange={(event) => setProfileDraft((current) => ({
                    ...current,
                    taxForm: event.target.value as JdgTaxProfile["taxForm"],
                  }))}
                />
                <Select
                  label="Status VAT"
                  value={profileDraft.vatStatus}
                  options={VAT_STATUS_OPTIONS}
                  onChange={(event) => {
                    const vatStatus = event.target.value as JdgTaxProfile["vatStatus"];
                    setProfileDraft((current) => ({
                      ...current,
                      vatStatus,
                      vatCadence: vatStatus === "active" ? current.vatCadence ?? "monthly" : null,
                    }));
                  }}
                />
                <Select
                  label="Okres rozliczenia VAT"
                  value={profileDraft.vatCadence ?? "monthly"}
                  disabled={profileDraft.vatStatus !== "active"}
                  hint={profileDraft.vatStatus === "active" ? undefined : "Dostępne dla czynnego podatnika VAT."}
                  options={[...VAT_CADENCE_OPTIONS]}
                  onChange={(event) => setProfileDraft((current) => ({
                    ...current,
                    vatCadence: event.target.value as NonNullable<JdgTaxProfile["vatCadence"]>,
                  }))}
                />
                <Select
                  label="Schemat ZUS"
                  value={profileDraft.zusScheme}
                  options={ZUS_SCHEME_OPTIONS}
                  onChange={(event) => setProfileDraft((current) => ({
                    ...current,
                    zusScheme: event.target.value as JdgTaxProfile["zusScheme"],
                  }))}
                />
                <Select
                  label="Sposób prowadzenia księgowości"
                  value={profileDraft.accountingMode}
                  options={ACCOUNTING_MODE_OPTIONS}
                  onChange={(event) => setProfileDraft((current) => ({
                    ...current,
                    accountingMode: event.target.value as JdgTaxProfile["accountingMode"],
                  }))}
                />
              </div>
            </section>

            <section className="jdg-settings__section" aria-labelledby="jdg-templates-heading">
              <div className="jdg-settings__heading">
                <h3 id="jdg-templates-heading">Szablony miesiąca</h3>
                <p>Zapisz bieżący układ albo dodaj brakujące punkty z gotowego szablonu bez kasowania obecnych danych.</p>
              </div>
              <div className="jdg-template-create">
                <Input
                  label="Nazwa nowego szablonu"
                  placeholder={`np. ${formatMonth(monthKey)} po korektach`}
                  value={templateName}
                  error={settingsError || undefined}
                  onChange={(event) => {
                    setTemplateName(event.target.value);
                    if (settingsError) setSettingsError("");
                  }}
                />
                <Button variant="quiet" onClick={saveCurrentMonthAsTemplate}>Zapisz bieżący miesiąc</Button>
              </div>
              <div className="jdg-template-list">
                {workspace.templates.map((template) => {
                  const isDefault = workspace.defaultTemplateId === template.id;
                  return (
                    <div key={template.id} className="jdg-template-row">
                      <div>
                        <strong>{template.name}</strong>
                        <small>
                          {template.items.length} {template.items.length === 1 ? "punkt" : "punktów"}
                          {" · "}
                          {template.source === "profile" ? "z profilu podatkowego" : "własny"}
                        </small>
                      </div>
                      <div className="jdg-template-row__actions">
                        {isDefault && <Badge tone="primary">Domyślny</Badge>}
                        {!isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => chooseDefaultTemplate(template.id, template.name)}
                          >
                            Ustaw domyślny
                          </Button>
                        )}
                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => applyTemplate(template.id, template.name)}
                        >
                          Dodaj do miesiąca
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDestructiveAction({
                            type: "replace-template",
                            monthKey,
                            templateId: template.id,
                            templateName: template.name,
                          })}
                        >
                          Zastąp miesiąc
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div aria-live="polite" aria-atomic="true">
              {settingsNotice && <p className="jdg-settings__notice" role="status">{settingsNotice}</p>}
            </div>
          </div>
        </Modal>
      )}

      {pendingDestructiveAction && (
        <Modal
          title={pendingDestructiveAction.type === "reset"
            ? "Wyczyścić potwierdzenia miesiąca?"
            : pendingDestructiveAction.type === "delete"
              ? "Usunąć własny punkt?"
              : "Zastąpić układ miesiąca?"}
          description={pendingDestructiveAction.type === "reset"
            ? formatMonth(pendingDestructiveAction.month.month)
            : pendingDestructiveAction.type === "delete"
              ? pendingDestructiveAction.item.label
              : `${pendingDestructiveAction.templateName} · ${formatMonth(pendingDestructiveAction.monthKey)}`}
          onClose={() => setPendingDestructiveAction(null)}
          width={460}
          footer={(
            <>
              <Button variant="quiet" onClick={() => setPendingDestructiveAction(null)}>Anuluj</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (pendingDestructiveAction.type === "reset") resetMonth(pendingDestructiveAction.month);
                  else if (pendingDestructiveAction.type === "delete") deleteCustomItem(pendingDestructiveAction);
                  else replaceMonthWithTemplate(pendingDestructiveAction);
                }}
              >
                {pendingDestructiveAction.type === "reset"
                  ? "Wyczyść potwierdzenia"
                  : pendingDestructiveAction.type === "delete"
                    ? "Usuń punkt"
                    : "Zastąp miesiąc"}
              </Button>
            </>
          )}
        >
          <p className="text-[12px] leading-5" style={{ color: "var(--color-text-secondary)" }}>
            {pendingDestructiveAction.type === "reset"
              ? "Wszystkie oznaczenia wykonania i ich daty zostaną wyzerowane. Po operacji możesz przywrócić poprzedni stan."
              : pendingDestructiveAction.type === "delete"
                ? "Punkt zniknie z wybranego miesiąca wraz z jego potwierdzeniem. Po operacji możesz go przywrócić."
                : "Obecne punkty, potwierdzenia i daty zostaną zastąpione czystym układem z szablonu. Operacja zostanie zapisana w historii i będzie możliwa do cofnięcia."}
          </p>
        </Modal>
      )}

      {undoableAction && (
        <div className="jdg-undo">
          <span role="status" aria-live="polite">{undoableAction.message}</span>
          <Button variant="ghost" size="sm" onClick={undoLastAction}>Cofnij</Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Zamknij komunikat"
            onClick={() => setUndoableAction(null)}
          >
            <X size={12} aria-hidden="true" />
          </Button>
        </div>
      )}

      {editorOpen && (
        <Modal
          eyebrow={formatMonth(monthKey)}
          title="Własny punkt checklisty"
          description="Dodaj kontrolę specyficzną dla Twojej działalności. Bieżący układ możesz potem zapisać jako szablon."
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

  return layout ? layout(header, content) : <>{header}{content}</>;
}
