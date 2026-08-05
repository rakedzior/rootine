import type { Dispatch, SetStateAction } from "react";
import {
  BUDGET_KIND_LABELS,
  CADENCE_LABELS,
  CATEGORY_META,
  DOCUMENT_LABELS,
  STATUS_LABELS,
  VEHICLE_ITEM_LABELS,
  type Draft,
  type EditorState,
} from "./affairsPresentation";
import type {
  AffairsWorkspace,
  BudgetLineKind,
  MatterPriority,
  MatterStatus,
  PaymentCadence,
  SubscriptionRenewal,
  VehicleItemType,
} from "../data/affairsWorkspace";
import { DatePicker, Input, Select } from "../ui";

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
          label="Obszar"
          value={draft.category}
          options={Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }))}
          onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
        />
        <DatePicker label="Termin" value={draft.dueDate} onChange={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
      </div>
      <div className="affairs-form__grid">
        <Select
          label="Priorytet"
          value={draft.priority}
          options={[
            { value: "normal", label: "Normalny" },
            { value: "high", label: "Ważny" },
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
      <label className="affairs-form__check">
        <input type="checkbox" checked={draft.automatic} onChange={(event) => setDraft((current) => ({ ...current, automatic: event.target.checked }))} />
        <span><strong>Płatność automatyczna</strong><small>Nie będzie wymagała ręcznego oznaczania jako opłacona.</small></span>
      </label>
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

  {editor.kind === "budget" && (
    <>
      <Select
        label="Typ pozycji"
        value={draft.budgetKind}
        options={Object.entries(BUDGET_KIND_LABELS).map(([value, label]) => ({ value, label }))}
        onChange={(event) => setDraft((current) => ({ ...current, budgetKind: event.target.value as BudgetLineKind }))}
      />
      <div className="affairs-form__grid">
        <Input label="Kwota planowana" inputMode="decimal" placeholder="0,00" value={draft.planned} onChange={(event) => setDraft((current) => ({ ...current, planned: event.target.value }))} />
        <Input label="Kwota rzeczywista" inputMode="decimal" placeholder="0,00" value={draft.actual} onChange={(event) => setDraft((current) => ({ ...current, actual: event.target.value }))} />
      </div>
    </>
  )}

  {editor.kind !== "budget" && editor.kind !== "vehicle" && (
    <label className="ui-field">
      <span className="ui-field__label">Notatka <span className="affairs-optional">opcjonalnie</span></span>
      <textarea
        className="ui-field__control affairs-textarea"
        placeholder="Dokumenty, decyzje albo kontekst do zachowania"
        value={draft.note}
        onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
      />
    </label>
  )}
    </>
  );
}
