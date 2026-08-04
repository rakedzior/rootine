import {
  createAffairsId,
  type AffairsWorkspace,
  type DocumentCategory,
  type DocumentRecord,
  type Matter,
  type MatterCategory,
  type OneTimePayment,
  type Subscription,
  type Vehicle,
  type VehicleItem,
} from "../data/affairsWorkspace";
import type { Draft, EditorState } from "./affairsPresentation";

export type AffairsEditorSubmission =
  | { title: string; nextWorkspace: AffairsWorkspace; selectedMatterId?: string }
  | { title: string; error: string };

type AffairsEditorSubmissionInput = {
  editor: EditorState;
  draft: Draft;
  workspace: AffairsWorkspace;
  budgetMonthKey: string;
};

function invalid(title: string, error: string): AffairsEditorSubmission {
  return { title, error };
}

export function applyAffairsEditor({ editor, draft, workspace, budgetMonthKey }: AffairsEditorSubmissionInput): AffairsEditorSubmission {
  const title = draft.title.trim();
  if (!title) return invalid(title, "Wpisz nazwę.");

  if (editor.kind === "matter") {
    if (!draft.dueDate) return invalid(title, "Wybierz termin sprawy.");
    const matter: Matter = {
      id: editor.id ?? createAffairsId("matter"),
      title,
      category: draft.category as MatterCategory,
      priority: draft.priority,
      status: draft.status,
      dueDate: draft.dueDate,
      note: draft.note.trim(),
      createdAt: workspace.matters.find((item) => item.id === editor.id)?.createdAt ?? new Date().toISOString(),
    };
    return {
      title,
      selectedMatterId: matter.id,
      nextWorkspace: {
        ...workspace,
        matters: editor.mode === "edit"
          ? workspace.matters.map((item) => item.id === editor.id ? matter : item)
          : [...workspace.matters, matter],
      },
    };
  }

  if (editor.kind === "payment") {
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
      return invalid(title, "Podaj prawidłową kwotę i najbliższy termin.");
    }
    const payment = {
      id: editor.id ?? createAffairsId("payment"),
      name: title,
      category: draft.category.trim() || "Inne",
      amount,
      cadence: draft.cadence,
      nextDueDate: draft.dueDate,
      automatic: draft.automatic,
      active: workspace.payments.find((item) => item.id === editor.id)?.active ?? true,
      note: draft.note.trim(),
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        payments: editor.mode === "edit"
          ? workspace.payments.map((item) => item.id === editor.id ? payment : item)
          : [...workspace.payments, payment],
      },
    };
  }

  if (editor.kind === "oneTime") {
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
      return invalid(title, "Podaj prawidłową kwotę i termin płatności.");
    }
    const existing = workspace.oneTimePayments.find((item) => item.id === editor.id);
    const payment: OneTimePayment = {
      id: editor.id ?? createAffairsId("one-time"),
      title,
      category: draft.category.trim() || "Inne",
      amount,
      dueDate: draft.dueDate,
      paid: existing?.paid ?? false,
      paidAt: existing?.paidAt ?? "",
      note: draft.note.trim(),
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        oneTimePayments: editor.mode === "edit"
          ? workspace.oneTimePayments.map((item) => item.id === editor.id ? payment : item)
          : [...workspace.oneTimePayments, payment],
      },
    };
  }

  if (editor.kind === "subscription") {
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.dueDate || !Number.isFinite(amount) || amount < 0) {
      return invalid(title, "Podaj prawidłową kwotę i datę kolejnego rozliczenia.");
    }
    const subscription: Subscription = {
      id: editor.id ?? createAffairsId("subscription"),
      name: title,
      category: draft.category.trim() || "Inne",
      amount,
      cadence: draft.cadence,
      nextBillingDate: draft.dueDate,
      renewal: draft.renewal,
      commitmentEndDate: draft.secondaryDate,
      active: workspace.subscriptions.find((item) => item.id === editor.id)?.active ?? true,
      note: draft.note.trim(),
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        subscriptions: editor.mode === "edit"
          ? workspace.subscriptions.map((item) => item.id === editor.id ? subscription : item)
          : [...workspace.subscriptions, subscription],
      },
    };
  }

  if (editor.kind === "document") {
    const reminderDays = Number(draft.reminderDays);
    if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 730) {
      return invalid(title, "Wyprzedzenie przypomnienia musi mieścić się między 0 a 730 dni.");
    }
    const document: DocumentRecord = {
      id: editor.id ?? createAffairsId("document"),
      name: title,
      category: draft.category as DocumentCategory,
      holder: draft.holder.trim() || "Ja",
      expiresAt: draft.dueDate,
      reminderDays,
      note: draft.note.trim(),
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        documents: editor.mode === "edit"
          ? workspace.documents.map((item) => item.id === editor.id ? document : item)
          : [...workspace.documents, document],
      },
    };
  }

  if (editor.kind === "vehicle") {
    const mileage = Number(draft.mileage.replace(/\s/g, ""));
    if (!Number.isFinite(mileage) || mileage < 0) return invalid(title, "Podaj prawidłowy przebieg pojazdu.");
    const vehicle: Vehicle = {
      id: editor.id ?? createAffairsId("vehicle"),
      name: title,
      registration: draft.registration.trim().toLocaleUpperCase("pl-PL"),
      mileage,
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        vehicles: editor.mode === "edit"
          ? workspace.vehicles.map((item) => item.id === editor.id ? vehicle : item)
          : [...workspace.vehicles, vehicle],
      },
    };
  }

  if (editor.kind === "vehicleItem") {
    const dueMileage = draft.dueMileage.trim() ? Number(draft.dueMileage.replace(/\s/g, "")) : null;
    if (!draft.dueDate && dueMileage === null) return invalid(title, "Podaj termin lub przebieg graniczny.");
    if (dueMileage !== null && (!Number.isFinite(dueMileage) || dueMileage < 0)) {
      return invalid(title, "Podaj prawidłowy przebieg graniczny.");
    }
    const existing = workspace.vehicleItems.find((item) => item.id === editor.id);
    const item: VehicleItem = {
      id: editor.id ?? createAffairsId("vehicle-item"),
      vehicleId: draft.vehicleId || editor.vehicleId,
      title,
      type: draft.vehicleType,
      dueDate: draft.dueDate,
      dueMileage,
      done: existing?.done ?? false,
      note: draft.note.trim(),
    };
    return {
      title,
      nextWorkspace: {
        ...workspace,
        vehicleItems: editor.mode === "edit"
          ? workspace.vehicleItems.map((candidate) => candidate.id === editor.id ? item : candidate)
          : [...workspace.vehicleItems, item],
      },
    };
  }

  const planned = Number(draft.planned.replace(",", "."));
  const actual = Number(draft.actual.replace(",", ".") || "0");
  if (!Number.isFinite(planned) || planned < 0 || !Number.isFinite(actual) || actual < 0) {
    return invalid(title, "Podaj prawidłowe kwoty.");
  }
  return {
    title,
    nextWorkspace: {
      ...workspace,
      budgets: workspace.budgets.map((budget) => budget.month === budgetMonthKey
        ? {
            ...budget,
            lines: [...budget.lines, {
              id: createAffairsId("budget"),
              label: title,
              kind: draft.budgetKind,
              planned,
              actual,
            }],
          }
        : budget),
    },
  };
}
