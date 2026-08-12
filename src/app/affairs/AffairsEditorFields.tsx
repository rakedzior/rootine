import type { Dispatch, SetStateAction } from "react";
import {
  CADENCE_LABELS,
  CATEGORY_META,
  DOCUMENT_LABELS,
  MATTER_REMINDER_LABELS,
  STATUS_LABELS,
  VEHICLE_ITEM_LABELS,
  type Draft,
  type EditorState,
} from "./affairsPresentation";
import type {
  AffairsWorkspace,
  MatterPriority,
  MatterStatus,
  PaymentCadence,
  SubscriptionRenewal,
  VehicleItemType,
} from "../data/affairsWorkspace";
import { HALF_HOUR_TIME_OPTIONS } from "../data/timeOptions";
import { Checkbox, DatePicker, Input, PriorityIcon, Select, Textarea, TimePicker, priorityOptionTone } from "../ui";

export interface AffairsEditorFieldsProps {
  editor: EditorState;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  workspace: AffairsWorkspace;
}

/**
 * Per-record fields for the Sprawy editor dialog. Extracted from Sprawy.tsx, which was
 * over the 1800-line page-entrypoint budget; the title field and dialog chrome stay with
 * the page because they are shared by every record kind.
 */
export function AffairsEditorFields({ editor, draft, setDraft, workspace }: AffairsEditorFieldsProps) {
  return (
    <>
  {editor.kind === "matter" && (
    <>
      <div className="affairs-form__grid">
        <Select
          label="Typ wpisu"
          value={draft.matterKind}
          options={[
            { value: "task", label: "Sprawa do załatwienia" },
            { value: "appointment", label: "Wizyta" },
          ]}
          onChange={(event) => setDraft((current) => {
            const matterKind = event.target.value === "appointment" ? "appointment" : "task";
            return {
              ...current,
              matterKind,
              time: matterKind === "appointment" ? current.time || "09:00" : "",
              location: matterKind === "appointment" ? current.location : "",
              reminderPreset: matterKind === "appointment"
                ? current.reminderPreset === "none" ? "day-and-two-hours" : current.reminderPreset
                : "none",
            };
          })}
        />
        <Select
          label="Obszar"
          value={draft.category}
          options={Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }))}
          onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
        />
      </div>
      <div className="affairs-form__grid">
        <DatePicker label={draft.matterKind === "appointment" ? "Data wizyty" : "Termin (opcjonalnie)"} value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
        {draft.matterKind === "appointment" && (
          <TimePicker
            label="Godzina"
            value={draft.time}
            options={HALF_HOUR_TIME_OPTIONS}
            onChange={(value) => setDraft((current) => ({ ...current, time: value }))}
          />
        )}
      </div>
      {draft.matterKind === "appointment" && (
        <div className="affairs-form__grid">
          <Input label="Miejsce" placeholder="np. Urząd Miasta, pokój 12" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
          <Select
            label="Powiadomienia"
            value={draft.reminderPreset}
            options={Object.entries(MATTER_REMINDER_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(event) => setDraft((current) => ({ ...current, reminderPreset: event.target.value as Draft["reminderPreset"] }))}
          />
        </div>
      )}
      <div className="affairs-form__grid">
        <Select
          label="Priorytet"
          value={draft.priority}
          options={[
            { value: "normal", label: "Normalny", leadingIcon: <PriorityIcon level="normal" />, tone: priorityOptionTone("normal") },
            { value: "high", label: "Ważny", leadingIcon: <PriorityIcon level="high" />, tone: priorityOptionTone("high") },
          ]}
          onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as MatterPriority }))}
        />
        <Select
          label="Status"
          value={draft.status}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MatterStatus }))}
        />
      </div>
    </>
  )}

  {editor.kind === "payment" && (
    <>
      <div className="affairs-form__grid">
        <Input label="Kategoria" placeholder="np. Mieszkanie" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
      </div>
      <div className="affairs-form__grid">
        <Select
          label="Cykl"
          value={draft.cadence}
          options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setDraft((current) => ({ ...current, cadence: event.target.value as PaymentCadence }))}
        />
        <DatePicker label="Następna płatność" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
      </div>
      <Checkbox
        className="affairs-form__check"
        size="sm"
        checked={draft.automatic}
        label="Płatność automatyczna"
        description="Nie będzie wymagała ręcznego oznaczania jako opłacona."
        onChange={(event) => setDraft((current) => ({ ...current, automatic: event.target.checked }))}
      />
    </>
  )}

  {editor.kind === "oneTime" && (
    <>
      <div className="affairs-form__grid">
        <Input label="Kategoria" placeholder="np. Dokumenty" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
      </div>
      <DatePicker label="Termin płatności" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
    </>
  )}

  {editor.kind === "subscription" && (
    <>
      <div className="affairs-form__grid">
        <Input label="Kategoria" placeholder="np. Rozrywka" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        <Input label="Kwota" inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
      </div>
      <div className="affairs-form__grid">
        <Select
          label="Cykl"
          value={draft.cadence}
          options={Object.entries(CADENCE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setDraft((current) => ({ ...current, cadence: event.target.value as PaymentCadence }))}
        />
        <DatePicker label="Następne rozliczenie" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
      </div>
      <div className="affairs-form__grid">
        <Select
          label="Odnowienie"
          value={draft.renewal}
          options={[
            { value: "automatic", label: "Automatyczne" },
            { value: "manual", label: "Ręczne" },
          ]}
          onChange={(event) => setDraft((current) => ({ ...current, renewal: event.target.value as SubscriptionRenewal }))}
        />
        <DatePicker label="Koniec zobowiązania (opcjonalnie)" value={draft.secondaryDate} onChange={(value) => setDraft((current) => ({ ...current, secondaryDate: value }))} />
      </div>
    </>
  )}

  {editor.kind === "document" && (
    <>
      <div className="affairs-form__grid">
        <Select
          label="Rodzaj dokumentu"
          value={draft.category}
          options={Object.entries(DOCUMENT_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
        />
        <Input label="Właściciel / obszar" placeholder="np. Ja, Dziecko, Dom" value={draft.holder} onChange={(event) => setDraft((current) => ({ ...current, holder: event.target.value }))} />
      </div>
      <div className="affairs-form__grid">
        <DatePicker label="Ważny do (opcjonalnie)" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
        <Input type="number" min="0" max="730" label="Przypomnij wcześniej (dni)" value={draft.reminderDays} onChange={(event) => setDraft((current) => ({ ...current, reminderDays: event.target.value }))} />
      </div>
    </>
  )}

  {editor.kind === "vehicle" && (
    <div className="affairs-form__grid">
      <Input label="Numer rejestracyjny" placeholder="np. KR 0000A" value={draft.registration} onChange={(event) => setDraft((current) => ({ ...current, registration: event.target.value }))} />
      <Input type="number" min="0" label="Aktualny przebieg (km)" placeholder="0" value={draft.mileage} onChange={(event) => setDraft((current) => ({ ...current, mileage: event.target.value }))} />
    </div>
  )}

  {editor.kind === "vehicleItem" && (
    <>
      <div className="affairs-form__grid">
        <Select
          label="Pojazd"
          value={draft.vehicleId}
          options={workspace.vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.name }))}
          onChange={(event) => setDraft((current) => ({ ...current, vehicleId: event.target.value }))}
        />
        <Select
          label="Rodzaj terminu"
          value={draft.vehicleType}
          options={Object.entries(VEHICLE_ITEM_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => setDraft((current) => ({ ...current, vehicleType: event.target.value as VehicleItemType }))}
        />
      </div>
      <div className="affairs-form__grid">
        <DatePicker label="Termin (opcjonalnie)" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
        <Input type="number" min="0" label="Przebieg graniczny (opcjonalnie)" placeholder="np. 90000" value={draft.dueMileage} onChange={(event) => setDraft((current) => ({ ...current, dueMileage: event.target.value }))} />
      </div>
    </>
  )}

  {editor.kind !== "vehicle" && (
    <Textarea
      label="Notatka (opcjonalnie)"
      className="affairs-textarea"
      placeholder="Dokumenty, decyzje albo kontekst do zachowania"
      value={draft.note}
      onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
    />
  )}
    </>
  );
}
