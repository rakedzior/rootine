import { useId, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Check, ChevronDown, Image as ImageIcon, Plus, Upload, X } from "lucide-react";
import {
  GOAL_ACCENT_OPTIONS,
  getGoalCurrentValue,
  normalizeGoalAccentColor,
} from "./goalsModel";
import { shiftLocalDateKey, todayLocalDateKey } from "../data/localDate";
import { Button, ConfirmDialog as UiConfirmDialog, DatePicker, Input, Modal, Select, Textarea, type ModalSize } from "../ui";
import { readSessionDraft, useDraftProtection } from "../ui/hooks/useDraftProtection";
import type {
  Goal,
  GoalCategory,
  GoalHealth,
  GoalIconKey,
  GoalMilestone,
  GoalPriority,
  GoalProgressEntry,
  GoalProgressMode,
  GoalRegularityMode,
  GoalRegularityPeriod,
  GoalStatus,
} from "./goalsModel";

type SelectOption = { value: string; label: string; description?: string };

export function ThemedSelect({
  value,
  onChange,
  options,
  ariaLabel,
  label,
  hint,
  error,
  compact = false,
  fieldClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  label?: string;
  hint?: string;
  error?: string;
  compact?: boolean;
  fieldClassName?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={options}
      aria-label={ariaLabel}
      label={label}
      hint={hint}
      error={error}
      compact={compact}
      fieldClassName={fieldClassName}
    />
  );
}
async function prepareTransparentIcon(file: File): Promise<string> {
  if (!["image/png", "image/webp"].includes(file.type)) throw new Error("Wybierz plik PNG lub WebP.");
  if (file.size > 2_000_000) throw new Error("Plik może mieć maksymalnie 2 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Nie udało się odczytać obrazu."));
      element.src = objectUrl;
    });
    const checkScale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const check = document.createElement("canvas");
    check.width = Math.max(1, Math.round(image.naturalWidth * checkScale));
    check.height = Math.max(1, Math.round(image.naturalHeight * checkScale));
    const checkContext = check.getContext("2d", { willReadFrequently: true });
    if (!checkContext) throw new Error("Nie udało się sprawdzić obrazu.");
    checkContext.drawImage(image, 0, 0, check.width, check.height);
    const pixels = checkContext.getImageData(0, 0, check.width, check.height).data;
    let transparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 250) transparentPixels += 1;
    }
    if (transparentPixels / (pixels.length / 4) < 0.01) {
      throw new Error("Ikona musi mieć wyraźnie przezroczyste tło.");
    }

    const output = document.createElement("canvas");
    output.width = 128;
    output.height = 128;
    const context = output.getContext("2d");
    if (!context) throw new Error("Nie udało się przygotować ikony.");
    const scale = Math.min(112 / image.naturalWidth, 112 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    return output.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
function DialogShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  returnFocusRef,
  size = "lg",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  size?: ModalSize;
}) {
  return (
    <Modal
      title={title}
      description={subtitle}
      onClose={onClose}
      size={size}
      bodyClassName="p-0"
      footer={footer}
      returnFocusRef={returnFocusRef}
    >
      {children}
    </Modal>
  );
}
function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
  error,
  wide = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  error?: string;
  wide?: boolean;
  maxLength?: number;
}) {
  return (
    <Textarea
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      maxLength={maxLength}
      hint={hint}
      error={error}
      fieldClassName={wide ? "col-span-2" : undefined}
      className={`resize-none${rows === 2 ? " goal-dialog-textarea--compact" : ""}`}
    />
  );
}
export type GoalEditorData = {
  title: string;
  description: string;
  categoryId: string;
  iconKey: GoalIconKey;
  customIcon?: string;
  color: string;
  status: GoalStatus;
  health: GoalHealth;
  priority: GoalPriority;
  startDate: string;
  dueDate: string;
  progressMode: GoalProgressMode;
  regularityMode: GoalRegularityMode;
  frequencyTarget: number;
  frequencyPeriod: GoalRegularityPeriod;
  targetValue: number;
  unit: string;
  manualProgress: number;
  note: string;
};

const ICONS: { value: GoalIconKey; label: string }[] = [
  { value: "target", label: "Cel" },
  { value: "laptop", label: "Komputer" },
  { value: "activity", label: "Aktywność" },
  { value: "dumbbell", label: "Sport" },
  { value: "languages", label: "Nauka" },
  { value: "piggy-bank", label: "Finanse" },
  { value: "trophy", label: "Osiągnięcie" },
  { value: "sparkles", label: "Osobiste" },
  { value: "no-smoking", label: "Zdrowie" },
];

function createGoalEditorData(
  goal: Goal | null | undefined,
  initialTitle: string | undefined,
  categories: GoalCategory[],
): GoalEditorData {
  const defaultCategory = categories[0];
  const today = todayLocalDateKey();
  return {
    title: goal?.title ?? initialTitle ?? "",
    description: goal?.description ?? "",
    categoryId: goal?.categoryId ?? defaultCategory?.id ?? "personal",
    iconKey: goal?.iconKey ?? "target",
    customIcon: goal?.customIcon,
    color: normalizeGoalAccentColor(goal?.color ?? defaultCategory?.color ?? GOAL_ACCENT_OPTIONS[0].value),
    status: goal?.status ?? "active",
    health: goal?.health ?? "ontrack",
    priority: goal?.priority ?? "medium",
    startDate: goal?.startDate ?? today,
    dueDate: goal?.dueDate ?? shiftLocalDateKey(today, 90),
    progressMode: goal?.progressMode ?? "milestones",
    regularityMode: goal?.regularityMode ?? "streak",
    frequencyTarget: goal?.frequencyTarget ?? 3,
    frequencyPeriod: goal?.frequencyPeriod ?? "week",
    targetValue: goal?.targetValue ?? 1,
    unit: goal?.unit ?? "",
    manualProgress: goal?.manualProgress ?? 0,
    note: goal?.note ?? "",
  };
}

// End of goal dialog contracts.
export function GoalFormDialog({
  goal,
  initialTitle,
  categories,
  onClose,
  onSubmit,
  returnFocusRef,
}: {
  goal?: Goal | null;
  initialTitle?: string;
  categories: GoalCategory[];
  onClose: () => void;
  onSubmit: (data: GoalEditorData) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const uploadId = useId();
  const advancedId = useId();
  const formId = useId();
  const [initialForm] = useState<GoalEditorData>(() => createGoalEditorData(goal, initialTitle, categories));
  const draftStorageKey = `rootine.goal-form-draft.${goal?.id ?? "new"}`;
  const [form, setForm] = useState<GoalEditorData>(() => {
    const recovered = readSessionDraft<Partial<GoalEditorData>>(draftStorageKey);
    if (!recovered || typeof recovered !== "object" || typeof recovered.title !== "string") return initialForm;
    return {
      ...initialForm,
      ...recovered,
      color: normalizeGoalAccentColor(recovered.color ?? initialForm.color),
    };
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [iconError, setIconError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const draftProtection = useDraftProtection({
    active: true,
    isDirty,
    draft: form,
    storageKey: draftStorageKey,
    onDiscard: onClose,
  });

  const set = <K extends keyof GoalEditorData>(key: K, value: GoalEditorData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const titleError = form.title.trim().length < 2 ? "Nazwa musi mieć co najmniej 2 znaki." : "";
  const startError = !form.startDate ? "Wybierz datę rozpoczęcia." : "";
  const dueError = !form.dueDate
    ? "Wybierz termin realizacji."
    : form.dueDate < form.startDate
      ? "Termin nie może przypadać przed datą rozpoczęcia."
      : "";
  const targetError = form.targetValue <= 0 ? "Wartość docelowa musi być większa od zera." : "";
  const frequencyError = form.frequencyTarget <= 0 ? "Częstotliwość musi być większa od zera." : "";
  const manualError = form.manualProgress < 0 || form.manualProgress > 100
    ? "Postęp musi mieścić się w zakresie 0–100%."
    : "";
  const measurementError = form.progressMode === "manual"
    ? manualError
    : form.progressMode === "milestones"
      ? ""
      : form.progressMode === "regularity" && form.regularityMode === "frequency"
        ? frequencyError
        : targetError;
  const valid = !titleError && !startError && !dueError && !measurementError;

  const submit = () => {
    setSubmitted(true);
    if (!valid) return;
    draftProtection.clearDraft();
    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      note: form.note.trim(),
      color: normalizeGoalAccentColor(form.color),
    });
  };

  return (
    <>
      <DialogShell
        title={goal ? "Edytuj cel" : "Nowy cel"}
        subtitle={goal ? "Zmień ustawienia i sposób mierzenia celu" : "Zdefiniuj rezultat i sposób mierzenia postępu"}
        onClose={draftProtection.requestClose}
        returnFocusRef={returnFocusRef}
        size="lg"
        footer={(
          <>
            <Button variant="quiet" onClick={draftProtection.requestClose}>Anuluj</Button>
            <Button variant="primary" type="submit" form={formId}>{goal ? "Zapisz zmiany" : "Dodaj cel"}</Button>
          </>
        )}
      >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="goal-dialog-form"
      >
        <div className="goal-dialog-grid grid grid-cols-2 gap-4 px-6 py-5">
          <Input
            autoFocus
            label="Nazwa celu"
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Co chcesz osiągnąć?"
            maxLength={240}
            error={submitted ? titleError : undefined}
            fieldClassName="col-span-2"
          />
          <TextareaField
            label="Opis"
            value={form.description}
            onChange={(value) => set("description", value)}
            placeholder="Dlaczego ten cel jest ważny?"
            rows={2}
            maxLength={4_000}
            wide
          />
          <ThemedSelect
            label="Kategoria"
            value={form.categoryId}
            onChange={(value) => {
              const category = categories.find((item) => item.id === value);
              setForm((current) => ({
                ...current,
                categoryId: value,
                color: normalizeGoalAccentColor(category?.color ?? current.color),
              }));
            }}
            options={categories.map((category) => ({ value: category.id, label: category.label }))}
            ariaLabel="Kategoria celu"
          />
          <ThemedSelect
            label="Ikona"
            value={form.iconKey}
            onChange={(value) => {
              set("iconKey", value as GoalIconKey);
              set("customIcon", undefined);
            }}
            options={ICONS}
            ariaLabel="Ikona celu"
          />

          <fieldset className="col-span-2">
            <legend className="ui-field__label">Własna ikona</legend>
            <div
              className={`goal-icon-upload flex items-center gap-3 rounded-xl border p-3 ${iconError ? "has-error" : ""}`}
            >
              <div
                className="goal-icon-upload__preview flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border"
                style={{ "--goal-icon-accent": form.color } as CSSProperties}
              >
                {form.customIcon
                  ? <img src={form.customIcon} alt="" className="h-7 w-7 object-contain" />
                  : <ImageIcon size={16} aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="goal-icon-upload__description">PNG lub WebP z przezroczystym tłem</p>
                <p
                  id={`${uploadId}-help`}
                  className={`goal-icon-upload__help mt-0.5 ${iconError ? "has-error" : ""}`}
                >
                  {iconError || "Maks. 2 MB · zapis do 128×128 px"}
                </p>
              </div>
              <input
                id={uploadId}
                type="file"
                accept="image/png,image/webp"
                className="ui-sr-only"
                aria-describedby={`${uploadId}-help`}
                aria-invalid={Boolean(iconError)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setIconError("");
                  prepareTransparentIcon(file)
                    .then((data) => set("customIcon", data))
                    .catch((error: unknown) => {
                      setIconError(error instanceof Error ? error.message : "Nie udało się wczytać ikony.");
                    });
                  event.currentTarget.value = "";
                }}
              />
              <label
                htmlFor={uploadId}
                className="file-upload-trigger goal-icon-upload__trigger flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2"
              >
                <Upload size={11} aria-hidden="true" />
                Wgraj
              </label>
              {form.customIcon && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Usuń własną ikonę"
                  onClick={() => set("customIcon", undefined)}
                >
                  <X size={13} aria-hidden="true" />
                </Button>
              )}
            </div>
            {iconError && <p className="ui-field__error" role="alert">{iconError}</p>}
          </fieldset>

          <ThemedSelect
            label="Priorytet"
            value={form.priority}
            onChange={(value) => set("priority", value as GoalPriority)}
            options={[
              { value: "high", label: "Wysoki" },
              { value: "medium", label: "Średni" },
              { value: "low", label: "Niski" },
            ]}
            ariaLabel="Priorytet celu"
          />
          <div aria-hidden="true" />
          <DatePicker
            label="Data rozpoczęcia"
            value={form.startDate}
            onChange={(value) => set("startDate", value)}
            error={submitted ? startError : undefined}
          />
          <DatePicker
            label="Termin"
            min={form.startDate}
            value={form.dueDate}
            onChange={(value) => set("dueDate", value)}
            error={submitted || dueError ? dueError : undefined}
          />
          <ThemedSelect
            label="Sposób mierzenia"
            value={form.progressMode}
            onChange={(value) => set("progressMode", value as GoalProgressMode)}
            options={[
              { value: "milestones", label: "Cel etapowy", description: "Postęp z ukończonych etapów" },
              { value: "numeric", label: "Wartość liczbowa", description: "Np. kwota, kilometry lub książki" },
              { value: "regularity", label: "Regularność", description: "Seria dni albo częstotliwość" },
              { value: "manual", label: "Procent ręczny", description: "Samodzielnie ustawiany procent" },
            ]}
            ariaLabel="Sposób mierzenia celu"
          />

          {form.progressMode === "manual" && (
            <Input
              label="Aktualny postęp (%)"
              type="number"
              min={0}
              max={100}
              value={form.manualProgress}
              onChange={(event) => set("manualProgress", Number(event.target.value))}
              error={submitted ? manualError : undefined}
            />
          )}
          {form.progressMode === "regularity" && (
            <ThemedSelect
              label="Rodzaj regularności"
              value={form.regularityMode}
              onChange={(value) => set("regularityMode", value as GoalRegularityMode)}
              options={[
                { value: "streak", label: "Seria dni", description: "Np. 90 dni bez przerwy" },
                { value: "frequency", label: "Częstotliwość", description: "Np. 3 razy w tygodniu" },
              ]}
              ariaLabel="Rodzaj regularności"
            />
          )}
          {form.progressMode === "numeric" && (
            <Input
              label="Wartość docelowa"
              type="number"
              min={0.01}
              step="any"
              value={form.targetValue}
              onChange={(event) => set("targetValue", Number(event.target.value))}
              error={submitted ? targetError : undefined}
            />
          )}
          {form.progressMode === "regularity" && form.regularityMode === "streak" && (
            <Input
              label="Długość serii (dni)"
              type="number"
              min={1}
              step={1}
              value={form.targetValue}
              onChange={(event) => set("targetValue", Number(event.target.value))}
              error={submitted ? targetError : undefined}
            />
          )}
          {form.progressMode === "regularity" && form.regularityMode === "frequency" && (
            <>
              <Input
                label="Ile razy"
                type="number"
                min={1}
                step={1}
                value={form.frequencyTarget}
                onChange={(event) => set("frequencyTarget", Number(event.target.value))}
                error={submitted ? frequencyError : undefined}
              />
              <ThemedSelect
                label="W okresie"
                value={form.frequencyPeriod}
                onChange={(value) => set("frequencyPeriod", value as GoalRegularityPeriod)}
                options={[
                  { value: "day", label: "Dziennie" },
                  { value: "week", label: "Tygodniowo" },
                  { value: "month", label: "Miesięcznie" },
                ]}
                ariaLabel="Okres częstotliwości"
              />
            </>
          )}
          {form.progressMode === "numeric" && (
            <Input
              label="Jednostka"
              value={form.unit}
              onChange={(event) => set("unit", event.target.value)}
              placeholder="np. PLN, km, dni"
              maxLength={80}
            />
          )}

          <div className="col-span-2">
            <Button
              variant="quiet"
              fullWidth
              aria-expanded={advancedOpen}
              aria-controls={advancedId}
              trailingIcon={(
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className={`goal-dialog-disclosure-icon ${advancedOpen ? "is-open" : ""}`}
                />
              )}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              Opcje dodatkowe
            </Button>
          </div>

          {advancedOpen && (
            <div id={advancedId} className="col-span-2 grid grid-cols-2 gap-4">
              <ThemedSelect
                label="Status"
                value={form.status}
                onChange={(value) => set("status", value as GoalStatus)}
                options={[
                  { value: "planned", label: "Zaplanowany" },
                  { value: "active", label: "Aktywny" },
                  { value: "paused", label: "Wstrzymany" },
                  { value: "completed", label: "Zakończony" },
                  { value: "archived", label: "Zarchiwizowany" },
                ]}
                ariaLabel="Status celu"
              />
              <ThemedSelect
                label="Kondycja celu"
                value={form.health}
                onChange={(value) => set("health", value as GoalHealth)}
                options={[
                  { value: "ontrack", label: "Na dobrej drodze" },
                  { value: "risk", label: "Zagrożony" },
                ]}
                ariaLabel="Kondycja celu"
              />
              <fieldset className="col-span-2">
                <legend className="ui-field__label">Kolor akcentu</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {GOAL_ACCENT_OPTIONS.map((option) => {
                    const selected = form.color === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => set("color", option.value)}
                        className={`goal-accent-option flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-left ${selected ? "is-selected" : ""}`}
                        style={{ "--goal-accent-option": option.value } as CSSProperties}
                      >
                        <span
                          aria-hidden="true"
                          className="goal-accent-option__swatch h-3 w-3 flex-none rounded-full"
                        />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <TextareaField
                label="Notatka"
                value={form.note}
                onChange={(value) => set("note", value)}
                rows={3}
                maxLength={10_000}
                wide
              />
            </div>
          )}
        </div>
      </form>
      </DialogShell>
      {draftProtection.promptOpen && (
        <UiConfirmDialog
          title="Odrzucić niezapisane zmiany?"
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          onCancel={draftProtection.keepEditing}
          onConfirm={draftProtection.confirmDiscard}
        >
          <p className="ui-confirm-dialog__note">Szkic zostanie usunięty. Tej operacji nie można cofnąć.</p>
        </UiConfirmDialog>
      )}
    </>
  );
}
export function ProgressDialog({
  goal,
  progress,
  onClose,
  onSubmit,
}: {
  goal: Goal;
  progress?: GoalProgressEntry | null;
  onClose: () => void;
  onSubmit: (draft: Omit<GoalProgressEntry, "id" | "createdAt">) => void;
}) {
  const currentValue = getGoalCurrentValue(goal);
  const isFrequency = goal.progressMode === "regularity" && goal.regularityMode === "frequency";
  const isStreak = goal.progressMode === "regularity" && goal.regularityMode !== "frequency";
  const isManual = goal.progressMode === "manual";
  const [initialDraft] = useState(() => ({
    date: progress?.date ?? todayLocalDateKey(),
    kind: progress?.kind ?? (isFrequency ? "delta" : "absolute") as GoalProgressEntry["kind"],
    value: progress?.value
      ?? (isFrequency ? 1 : isManual && !goal.progressEntries.length ? goal.manualProgress : currentValue),
    note: progress?.note ?? "",
  }));
  const progressDraftKey = `rootine.goal-progress-draft.${goal.id}.${progress?.id ?? "new"}`;
  const [restoredDraft] = useState(() => ({
    ...initialDraft,
    ...readSessionDraft<Partial<typeof initialDraft>>(progressDraftKey),
  }));
  const [date, setDate] = useState(restoredDraft.date);
  const [kind, setKind] = useState<GoalProgressEntry["kind"]>(restoredDraft.kind);
  const [value, setValue] = useState(restoredDraft.value);
  const [note, setNote] = useState(restoredDraft.note);
  const [submitted, setSubmitted] = useState(false);
  const currentDraft = { date, kind, value, note };
  const draftProtection = useDraftProtection({
    active: true,
    isDirty: JSON.stringify(currentDraft) !== JSON.stringify(initialDraft),
    draft: currentDraft,
    storageKey: progressDraftKey,
    onDiscard: onClose,
  });
  const dateError = date ? "" : "Wybierz datę aktualizacji.";
  const valueError = !Number.isFinite(value)
    ? "Podaj prawidłową wartość."
    : isManual && (value < 0 || value > 100)
      ? "Postęp musi mieścić się w zakresie 0–100%."
      : isStreak && value < 0
        ? "Seria nie może być ujemna."
        : isFrequency && value < 1
          ? "Liczba wykonań musi wynosić co najmniej 1."
          : "";

  return (
    <>
      <DialogShell
      title={progress ? "Edytuj aktualizację" : goal.progressMode === "numeric" ? "Zaktualizuj wartość" : goal.progressMode === "regularity" ? "Zapisz wykonanie" : goal.progressMode === "manual" ? "Zaktualizuj postęp" : "Etapy celu"}
      subtitle={goal.title}
      onClose={draftProtection.requestClose}
      size="sm"
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (dateError || valueError) return;
          draftProtection.clearDraft();
          onSubmit({
            date,
            kind: isManual || isStreak ? "absolute" : isFrequency ? "delta" : kind,
            value,
            note: note.trim(),
          });
        }}
      >
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Input
            autoFocus
            label={isManual ? "Postęp (%)" : isFrequency ? "Liczba wykonań" : isStreak ? "Aktualna seria (dni)" : "Wartość"}
            type="number"
            step={isFrequency || isStreak ? 1 : "any"}
            min={isManual || isStreak ? 0 : isFrequency ? 1 : undefined}
            max={isManual ? 100 : isStreak ? goal.targetValue : undefined}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            error={submitted ? valueError : undefined}
          />
          <DatePicker
            label="Data"
            
            value={date}
            onChange={(value) => setDate(value)}
            error={submitted ? dateError : undefined}
          />
          {!isManual && !isFrequency && !isStreak && (
            <fieldset className="col-span-2">
              <legend className="ui-field__label">Rodzaj zmiany</legend>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "absolute", label: "Ustaw wartość" },
                  { value: "delta", label: "Dodaj / odejmij" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={kind === option.value}
                    onClick={() => setKind(option.value)}
                    className={`goal-choice-button rounded-lg border px-3 py-2.5 ${kind === option.value ? "is-selected" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <TextareaField
            label="Notatka"
            value={note}
            onChange={setNote}
            rows={3}
            placeholder="Co się zmieniło?"
            maxLength={2_000}
            wide
          />
        </div>
        <div className="goal-dialog-footer flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="quiet" onClick={draftProtection.requestClose}>Anuluj</Button>
          <Button variant="primary" type="submit">Zapisz zmianę</Button>
        </div>
      </form>
      </DialogShell>
      {draftProtection.promptOpen && (
        <UiConfirmDialog
          title="Odrzucić niezapisane zmiany?"
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          onCancel={draftProtection.keepEditing}
          onConfirm={draftProtection.confirmDiscard}
        >
          <p className="ui-confirm-dialog__note">Niezapisana aktualizacja celu zostanie usunięta.</p>
        </UiConfirmDialog>
      )}
    </>
  );
}
// End of goal dialog contracts.
export function MilestoneDialog({
  milestone: current,
  draftKey,
  onClose,
  onSubmit,
}: {
  milestone?: GoalMilestone | null;
  draftKey?: string;
  onClose: () => void;
  onSubmit: (draft: Omit<GoalMilestone, "id">) => void;
}) {
  const [initialDraft] = useState(() => ({
    title: current?.title ?? "",
    dueDate: current?.dueDate ?? shiftLocalDateKey(todayLocalDateKey(), 30),
    note: current?.note ?? "",
    weight: current?.weight ?? 1,
    done: current?.done ?? false,
  }));
  const milestoneDraftKey = `rootine.goal-milestone-draft.${draftKey ?? "goal"}.${current?.id ?? "new"}`;
  const [restoredDraft] = useState(() => ({
    ...initialDraft,
    ...readSessionDraft<Partial<typeof initialDraft>>(milestoneDraftKey),
  }));
  const [title, setTitle] = useState(restoredDraft.title);
  const [dueDate, setDueDate] = useState(restoredDraft.dueDate);
  const [note, setNote] = useState(restoredDraft.note);
  const [weight, setWeight] = useState(restoredDraft.weight);
  const [done, setDone] = useState(restoredDraft.done);
  const [submitted, setSubmitted] = useState(false);
  const currentDraft = { title, dueDate, note, weight, done };
  const draftProtection = useDraftProtection({
    active: true,
    isDirty: JSON.stringify(currentDraft) !== JSON.stringify(initialDraft),
    draft: currentDraft,
    storageKey: milestoneDraftKey,
    onDiscard: onClose,
  });
  const titleError = title.trim() ? "" : "Podaj nazwę etapu.";
  const dueDateError = dueDate ? "" : "Wybierz termin.";
  const weightError = Number.isFinite(weight) && weight > 0 ? "" : "Wpływ etapu musi być większy od zera.";

  return (
    <>
      <DialogShell title={current ? "Edytuj etap" : "Dodaj etap"} onClose={draftProtection.requestClose} size="sm">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (titleError || dueDateError || weightError) return;
          draftProtection.clearDraft();
          onSubmit({ title: title.trim(), note: note.trim(), dueDate, weight, done });
        }}
      >
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Input
            autoFocus
            label="Nazwa etapu"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            error={submitted ? titleError : undefined}
            fieldClassName="col-span-2"
          />
          <DatePicker
            label="Termin"
            
            value={dueDate}
            onChange={(value) => setDueDate(value)}
            error={submitted ? dueDateError : undefined}
          />
          <TextareaField label="Notatka" value={note} onChange={setNote} placeholder="Opcjonalna notatka do etapu" rows={3} maxLength={2_000} wide />
          <Input
            fieldClassName={current ? "" : "hidden"}
            label="Waga"
            type="number"
            min={0.01}
            step="any"
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
            hint="Większa waga mocniej wpływa na postęp."
            error={submitted ? weightError : undefined}
          />
          <fieldset className="col-span-2">
            <legend className="ui-field__label">Stan</legend>
            <button
              type="button"
              aria-pressed={done}
              onClick={() => setDone((value) => !value)}
              className={`goal-choice-button goal-milestone-state flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 ${done ? "is-selected" : ""}`}
            >
              <span
                className="goal-milestone-state__indicator flex h-4 w-4 items-center justify-center rounded-full border"
                aria-hidden="true"
              >
                {done && <Check size={9} />}
              </span>
              {done ? "Ukończony" : "Do wykonania"}
            </button>
          </fieldset>
        </div>
        <div className="goal-dialog-footer flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="quiet" onClick={draftProtection.requestClose}>Anuluj</Button>
          <Button
            variant="primary"
            type="submit"
            leadingIcon={current ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          >
            {current ? "Zapisz zmiany" : "Dodaj etap"}
          </Button>
        </div>
      </form>
      </DialogShell>
      {draftProtection.promptOpen && (
        <UiConfirmDialog
          title="Odrzucić niezapisane zmiany?"
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          onCancel={draftProtection.keepEditing}
          onConfirm={draftProtection.confirmDiscard}
        >
          <p className="ui-confirm-dialog__note">Niezapisany etap celu zostanie usunięty.</p>
        </UiConfirmDialog>
      )}
    </>
  );
}
