import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, Plus, Target, Upload, X } from "lucide-react";
import { getGoalCurrentValue } from "./goalsStore";
import { Input, Modal, Select, uiColors } from "../ui";
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
} from "./goalsStore";

const C = {
  surface: uiColors.graphiteCanvas, panel: uiColors.graphiteCard, input: uiColors.graphiteInput, border: uiColors.borderSubtle, borderStrong: uiColors.borderStrong,
  primary: uiColors.chalkWhite, second: uiColors.textSecondary, muted: uiColors.textMuted, blue: uiColors.precisionBlue, green: uiColors.success, danger: uiColors.danger,
};

const inputStyle = { color: C.primary, background: C.input, borderColor: C.border, colorScheme: "dark" as const };

export function ThemedSelect({ value, onChange, options, ariaLabel, compact = false }: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  ariaLabel: string;
  compact?: boolean;
}) {
  return <Select value={value} onChange={(event) => onChange(event.target.value)} options={options} aria-label={ariaLabel} compact={compact} />;
}

async function prepareTransparentIcon(file: File): Promise<string> {
  if (!(["image/png", "image/webp"].includes(file.type))) throw new Error("Wybierz plik PNG lub WebP.");
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
    if (transparentPixels / (pixels.length / 4) < 0.01) throw new Error("Ikona musi mieć wyraźnie przezroczyste tło.");

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

function DialogShell({ title, subtitle, onClose, children, width = 700 }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return <Modal title={title} description={subtitle} onClose={onClose} width={width} bodyClassName="p-0">{children}</Modal>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 block" : "block"}>
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider" style={{ color: C.muted }}>{label}</span>
      {children}
    </div>
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
  { value: "target", label: "Cel" }, { value: "laptop", label: "Komputer" }, { value: "activity", label: "Aktywność" },
  { value: "dumbbell", label: "Sport" }, { value: "languages", label: "Nauka" }, { value: "piggy-bank", label: "Finanse" },
  { value: "trophy", label: "Osiągnięcie" }, { value: "sparkles", label: "Osobiste" }, { value: "no-smoking", label: "Zdrowie" },
];

export function GoalFormDialog({ goal, categories, onClose, onSubmit }: { goal?: Goal | null; categories: GoalCategory[]; onClose: () => void; onSubmit: (data: GoalEditorData) => void }) {
  const defaultCategory = categories[0];
  const [form, setForm] = useState<GoalEditorData>(() => ({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    categoryId: goal?.categoryId ?? defaultCategory?.id ?? "personal",
    iconKey: goal?.iconKey ?? "target",
    customIcon: goal?.customIcon,
    color: goal?.color ?? defaultCategory?.color ?? C.blue,
    status: goal?.status ?? "active",
    health: goal?.health ?? "ontrack",
    priority: goal?.priority ?? "medium",
    startDate: goal?.startDate ?? new Date().toISOString().slice(0, 10),
    dueDate: goal?.dueDate ?? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    progressMode: goal?.progressMode ?? "milestones",
    regularityMode: goal?.regularityMode ?? "streak",
    frequencyTarget: goal?.frequencyTarget ?? 3,
    frequencyPeriod: goal?.frequencyPeriod ?? "week",
    targetValue: goal?.targetValue ?? 1,
    unit: goal?.unit ?? "",
    manualProgress: goal?.manualProgress ?? 0,
    note: goal?.note ?? "",
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [iconError, setIconError] = useState("");

  const set = <K extends keyof GoalEditorData>(key: K, value: GoalEditorData[K]) => setForm((current) => ({ ...current, [key]: value }));
  const measurementValid = form.progressMode === "manual"
    || form.progressMode === "milestones"
    || (form.progressMode === "regularity" && form.regularityMode === "frequency" ? form.frequencyTarget > 0 : form.targetValue > 0);
  const valid = form.title.trim().length > 1 && Boolean(form.dueDate) && form.dueDate >= form.startDate && measurementValid;

  return (
    <DialogShell title={goal ? "Edytuj cel" : "Nowy cel"} subtitle={goal ? "Zmień ustawienia i sposób mierzenia celu" : "Zdefiniuj rezultat i sposób mierzenia postępu"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ ...form, title: form.title.trim() }); }} className="flex max-h-[calc(90vh-84px)] flex-col">
        <div className="goal-dialog-grid grid flex-1 grid-cols-2 gap-4 overflow-y-auto px-6 py-5">
          <Field label="Nazwa celu" wide>
            <Input autoFocus value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Co chcesz osiągnąć?" />
          </Field>
          <Field label="Opis" wide>
            <textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={2} placeholder="Dlaczego ten cel jest ważny?" className="w-full resize-none rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Kategoria">
            <ThemedSelect value={form.categoryId} onChange={(value) => { const category = categories.find((item) => item.id === value); setForm((current) => ({ ...current, categoryId: value, color: category?.color ?? current.color })); }} options={categories.map((category) => ({ value: category.id, label: category.label }))} ariaLabel="Kategoria celu" />
          </Field>
          <Field label="Ikona">
            <ThemedSelect value={form.iconKey} onChange={(value) => { set("iconKey", value as GoalIconKey); set("customIcon", undefined); }} options={ICONS} ariaLabel="Ikona celu" />
          </Field>
          <Field label="Własna ikona" wide>
            <div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: C.input, borderColor: iconError ? C.danger : C.border }}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: C.border, background: `${form.color}12` }}>{form.customIcon ? <img src={form.customIcon} alt="Podgląd własnej ikony" className="h-7 w-7 object-contain" /> : <ImageIcon size={16} style={{ color: C.muted }} />}</div>
              <div className="min-w-0 flex-1"><p className="text-[10px]" style={{ color: C.second }}>PNG lub WebP z przezroczystym tłem</p><p className="mt-0.5 text-[9px]" style={{ color: iconError ? C.danger : C.muted }}>{iconError || "Maks. 2 MB · zapis do 128×128 px"}</p></div>
              <label
                tabIndex={0}
                className="file-upload-trigger flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px]"
                style={{ color: C.blue, borderColor: "rgba(71,114,250,.35)" }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.currentTarget.querySelector("input")?.click();
                }}
              ><Upload size={11} />Wgraj<input type="file" accept="image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setIconError(""); prepareTransparentIcon(file).then((data) => set("customIcon", data)).catch((error: unknown) => setIconError(error instanceof Error ? error.message : "Nie udało się wczytać ikony.")); event.currentTarget.value = ""; }} /></label>
              {form.customIcon && <button type="button" onClick={() => set("customIcon", undefined)} aria-label="Usuń własną ikonę" style={{ color: C.danger }}><X size={13} /></button>}
            </div>
          </Field>
          <Field label="Priorytet">
            <ThemedSelect value={form.priority} onChange={(value) => set("priority", value as GoalPriority)} options={[{ value: "high", label: "Wysoki" }, { value: "medium", label: "Średni" }, { value: "low", label: "Niski" }]} ariaLabel="Priorytet celu" />
          </Field>
          <Field label="Data rozpoczęcia"><input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Termin"><input type="date" min={form.startDate} value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Sposób mierzenia">
            <ThemedSelect value={form.progressMode} onChange={(value) => set("progressMode", value as GoalProgressMode)} options={[{ value: "milestones", label: "Kamienie milowe", description: "Postęp z ukończonych etapów" }, { value: "numeric", label: "Wartość liczbowa", description: "Np. kwota, kilometry lub książki" }, { value: "regularity", label: "Regularność", description: "Seria dni albo częstotliwość" }, { value: "manual", label: "Procent ręczny", description: "Samodzielnie ustawiany procent" }]} ariaLabel="Sposób mierzenia celu" />
          </Field>
          {form.progressMode === "manual" ? (
            <Field label="Aktualny postęp (%)"><input type="number" min={0} max={100} value={form.manualProgress} onChange={(event) => set("manualProgress", Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          ) : form.progressMode === "regularity" ? (
            <Field label="Rodzaj regularności"><ThemedSelect value={form.regularityMode} onChange={(value) => set("regularityMode", value as GoalRegularityMode)} options={[{ value: "streak", label: "Seria dni", description: "Np. 90 dni bez przerwy" }, { value: "frequency", label: "Częstotliwość", description: "Np. 3 razy w tygodniu" }]} ariaLabel="Rodzaj regularności" /></Field>
          ) : form.progressMode === "milestones" ? (
            <Field label="Kamienie milowe"><div className="rounded-lg border px-3 py-2.5 text-[11px]" style={{ ...inputStyle, color: C.muted }}>Etapy dodasz po utworzeniu celu.</div></Field>
          ) : <Field label="Wartość docelowa"><input type="number" min={1} value={form.targetValue} onChange={(event) => set("targetValue", Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>}
          {form.progressMode === "regularity" && form.regularityMode === "streak" && <Field label="Długość serii (dni)"><input type="number" min={1} value={form.targetValue} onChange={(event) => set("targetValue", Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>}
          {form.progressMode === "regularity" && form.regularityMode === "frequency" && <><Field label="Ile razy"><input type="number" min={1} value={form.frequencyTarget} onChange={(event) => set("frequencyTarget", Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field><Field label="W okresie"><ThemedSelect value={form.frequencyPeriod} onChange={(value) => set("frequencyPeriod", value as GoalRegularityPeriod)} options={[{ value: "day", label: "Dziennie" }, { value: "week", label: "Tygodniowo" }, { value: "month", label: "Miesięcznie" }]} ariaLabel="Okres częstotliwości" /></Field></>}
          {form.progressMode === "numeric" && (
            <Field label="Jednostka"><input value={form.unit} onChange={(event) => set("unit", event.target.value)} placeholder="np. PLN, km, dni" className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          )}
          <div className="col-span-2"><button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-[10px]" style={{ color: C.second, borderColor: C.border, background: C.input }}>Opcje dodatkowe <ChevronDown size={12} style={{ transform: advancedOpen ? "rotate(180deg)" : "none" }} /></button></div>
          {advancedOpen && <><Field label="Status"><ThemedSelect value={form.status} onChange={(value) => set("status", value as GoalStatus)} options={[{ value: "planned", label: "Zaplanowany" }, { value: "active", label: "Aktywny" }, { value: "paused", label: "Wstrzymany" }, { value: "completed", label: "Zakończony" }, { value: "archived", label: "Zarchiwizowany" }]} ariaLabel="Status celu" /></Field><Field label="Kondycja celu"><ThemedSelect value={form.health} onChange={(value) => set("health", value as GoalHealth)} options={[{ value: "ontrack", label: "Na dobrej drodze" }, { value: "risk", label: "Zagrożony" }]} ariaLabel="Kondycja celu" /></Field><Field label="Kolor akcentu"><div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={inputStyle}><input type="color" value={form.color} onChange={(event) => set("color", event.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[11px] uppercase" style={{ color: C.second }}>{form.color}</span></div></Field>
          <Field label="Notatka" wide><textarea value={form.note} onChange={(event) => set("note", event.target.value)} rows={3} className="w-full resize-none rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field></>}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: C.border }}>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-[11px]" style={{ color: C.second, borderColor: C.border }}>Anuluj</button>
          <button type="submit" disabled={!valid} className="rounded-lg px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ color: "white", background: C.blue }}>{goal ? "Zapisz zmiany" : "Utwórz cel"}</button>
        </div>
      </form>
    </DialogShell>
  );
}

export function ProgressDialog({ goal, progress, onClose, onSubmit }: { goal: Goal; progress?: GoalProgressEntry | null; onClose: () => void; onSubmit: (draft: Omit<GoalProgressEntry, "id" | "createdAt">) => void }) {
  const currentValue = getGoalCurrentValue(goal);
  const isFrequency = goal.progressMode === "regularity" && goal.regularityMode === "frequency";
  const isStreak = goal.progressMode === "regularity" && goal.regularityMode !== "frequency";
  const [date, setDate] = useState(progress?.date ?? new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<GoalProgressEntry["kind"]>(progress?.kind ?? (isFrequency ? "delta" : "absolute"));
  const [value, setValue] = useState(progress?.value ?? (isFrequency ? 1 : goal.progressMode === "manual" && !goal.progressEntries.length ? goal.manualProgress : currentValue));
  const [note, setNote] = useState(progress?.note ?? "");
  const isManual = goal.progressMode === "manual";

  return (
    <DialogShell title={progress ? "Edytuj aktualizację" : "Dodaj postęp"} subtitle={goal.title} onClose={onClose} width={480}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit({ date, kind: isManual || isStreak ? "absolute" : isFrequency ? "delta" : kind, value, note: note.trim() }); }}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Field label={isManual ? "Postęp (%)" : isFrequency ? "Liczba wykonań" : isStreak ? "Aktualna seria (dni)" : "Wartość"}><input autoFocus type="number" step={isFrequency || isStreak ? 1 : "any"} min={isManual || isStreak ? 0 : isFrequency ? 1 : undefined} max={isManual ? 100 : isStreak ? goal.targetValue : undefined} value={value} onChange={(event) => setValue(Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Data"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          {!isManual && !isFrequency && !isStreak && <Field label="Rodzaj zmiany" wide><div className="grid grid-cols-2 gap-2">{([{ value: "absolute", label: "Ustaw wartość" }, { value: "delta", label: "Dodaj / odejmij" }] as const).map((option) => <button key={option.value} type="button" onClick={() => setKind(option.value)} className="rounded-lg border px-3 py-2.5 text-[11px]" style={{ color: kind === option.value ? C.blue : C.second, borderColor: kind === option.value ? C.blue : C.border, background: kind === option.value ? "rgba(71,114,250,.08)" : C.input }}>{option.label}</button>)}</div></Field>}
          <Field label="Notatka" wide><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Co się zmieniło?" className="w-full resize-none rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: C.border }}><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-[11px]" style={{ color: C.second, borderColor: C.border }}>Anuluj</button><button type="submit" className="rounded-lg px-4 py-2.5 text-[11px] font-semibold" style={{ color: "white", background: C.blue }}>Zapisz postęp</button></div>
      </form>
    </DialogShell>
  );
}

export function MilestoneDialog({ milestone: current, onClose, onSubmit }: { milestone?: GoalMilestone | null; onClose: () => void; onSubmit: (draft: Omit<GoalMilestone, "id">) => void }) {
  const [title, setTitle] = useState(current?.title ?? "");
  const [dueDate, setDueDate] = useState(current?.dueDate ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [weight, setWeight] = useState(current?.weight ?? 1);
  const [done, setDone] = useState(current?.done ?? false);
  return (
    <DialogShell title={current ? "Edytuj kamień milowy" : "Nowy kamień milowy"} onClose={onClose} width={460}>
      <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), dueDate, weight: Math.max(1, weight), done }); }}>
        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          <Field label="Nazwa" wide><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Termin"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Waga"><input type="number" min={1} value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="w-full rounded-lg border px-3 py-2.5 text-[12px] outline-none" style={inputStyle} /></Field>
          <Field label="Stan" wide><button type="button" onClick={() => setDone((value) => !value)} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-[11px]" style={{ color: done ? C.green : C.second, borderColor: done ? "rgba(112,184,159,.45)" : C.border, background: C.input }}><span className="flex h-4 w-4 items-center justify-center rounded-full border" style={{ borderColor: done ? C.green : C.borderStrong }}>{done && <Check size={9} />}</span>{done ? "Ukończony" : "Do wykonania"}</button></Field>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: C.border }}><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-[11px]" style={{ color: C.second, borderColor: C.border }}>Anuluj</button><button type="submit" disabled={!title.trim()} className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ color: "white", background: C.blue }}>{current ? <Check size={12} /> : <Plus size={12} />}{current ? "Zapisz" : "Dodaj"}</button></div>
      </form>
    </DialogShell>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Usuń", danger = true, onClose, onConfirm }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <DialogShell title={title} onClose={onClose} width={420}>
      <div className="px-6 py-5"><div className="flex items-start gap-3 rounded-xl border p-4" style={{ background: C.input, borderColor: danger ? "rgba(207,119,124,.3)" : C.border }}><Target size={18} style={{ color: danger ? C.danger : C.blue }} /><p className="text-[12px] leading-5" style={{ color: C.second }}>{message}</p></div></div>
      <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: C.border }}><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-[11px]" style={{ color: C.second, borderColor: C.border }}>Anuluj</button><button type="button" onClick={onConfirm} className="rounded-lg px-4 py-2.5 text-[11px] font-semibold" style={{ color: "white", background: danger ? C.danger : C.blue }}>{confirmLabel}</button></div>
    </DialogShell>
  );
}
