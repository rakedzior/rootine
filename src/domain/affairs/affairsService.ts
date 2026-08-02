import {
  AFFAIRS_STORAGE_KEY,
  loadAffairsWorkspace,
  saveAffairsWorkspace,
  setMatterCompletionState,
  setOneTimePaymentPaidState,
  type AffairsWorkspace,
  type Matter,
  type OneTimePayment,
} from "../../app/data/affairsWorkspace";
import { domainFailure } from "../shared";
import { commitDomainMutation } from "../shared/mutation";
import type { DomainMutationResult } from "../shared/result";
import { createWorkspaceUndo } from "../shared/workspaceUndo";
import { matterCompletionSchema, paymentPaidSchema, rescheduleMatterSchema } from "./affairsSchemas";

function replaceMatter(workspace: AffairsWorkspace, value: Matter | null, id: string): AffairsWorkspace {
  return { ...workspace, matters: value === null ? workspace.matters.filter((item) => item.id !== id) : workspace.matters.map((item) => item.id === id ? value : item) };
}

function replacePayment(workspace: AffairsWorkspace, value: OneTimePayment | null, id: string): AffairsWorkspace {
  return { ...workspace, oneTimePayments: value === null ? workspace.oneTimePayments.filter((item) => item.id !== id) : workspace.oneTimePayments.map((item) => item.id === id ? value : item) };
}

function matterUndo(before: Matter, after: Matter, message: string) {
  return createWorkspaceUndo({
    storageKey: AFFAIRS_STORAGE_KEY, read: loadAffairsWorkspace, save: saveAffairsWorkspace,
    select: (workspace) => workspace.matters.find((matter) => matter.id === after.id) ?? null,
    apply: (workspace, value) => replaceMatter(workspace, value, after.id),
    expected: after, restore: before, message,
  });
}

export async function setMatterCompletion(input: unknown): Promise<DomainMutationResult<Matter>> {
  const parsed = matterCompletionSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowa sprawa.");
  const workspace = loadAffairsWorkspace();
  const before = workspace.matters.find((matter) => matter.id === parsed.data.matterId);
  if (!before) return domainFailure("NOT_FOUND", "Sprawa nie istnieje.");
  const completed = before.status === "done";
  if (completed === parsed.data.completed) return domainFailure("CONFLICT", "Sprawa ma już wybrany status.");
  const after: Matter = { ...before, status: parsed.data.completed ? "done" : "open" };
  const next = setMatterCompletionState(workspace, before.id, parsed.data.completed);
  return commitDomainMutation({
    entityId: before.id, storageKey: AFFAIRS_STORAGE_KEY,
    event: { type: "affairs.matter_completed", domain: "affairs", entityId: before.id, payload: { completed: parsed.data.completed } },
    save: () => saveAffairsWorkspace(next), read: loadAffairsWorkspace,
    verify: (current) => current.matters.find((matter) => matter.id === before.id)?.status === after.status,
    selectSnapshot: (current) => current.matters.find((matter) => matter.id === before.id) ?? after,
    message: parsed.data.completed ? "Oznaczono sprawę jako wykonaną." : "Cofnięto wykonanie sprawy.",
    compensation: matterUndo(before, after, parsed.data.completed ? "Cofnięto wykonanie sprawy." : "Przywrócono wykonanie sprawy."),
  });
}

export async function rescheduleMatter(input: unknown): Promise<DomainMutationResult<Matter>> {
  const parsed = rescheduleMatterSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowy termin.");
  const workspace = loadAffairsWorkspace();
  const before = workspace.matters.find((matter) => matter.id === parsed.data.matterId);
  if (!before) return domainFailure("NOT_FOUND", "Sprawa nie istnieje.");
  if (before.dueDate === parsed.data.date) return domainFailure("CONFLICT", "Sprawa ma już ten termin.");
  const after = { ...before, dueDate: parsed.data.date };
  const next = replaceMatter(workspace, after, before.id);
  return commitDomainMutation({
    entityId: before.id, storageKey: AFFAIRS_STORAGE_KEY,
    event: { type: "affairs.matter_rescheduled", domain: "affairs", entityId: before.id, payload: { previousDate: before.dueDate, nextDate: after.dueDate } },
    save: () => saveAffairsWorkspace(next), read: loadAffairsWorkspace,
    verify: (current) => current.matters.find((matter) => matter.id === before.id)?.dueDate === after.dueDate,
    selectSnapshot: (current) => current.matters.find((matter) => matter.id === before.id) ?? after,
    message: "Zmieniono termin sprawy.", compensation: matterUndo(before, after, "Przywrócono poprzedni termin sprawy."),
  });
}

export async function markPaymentPaid(input: unknown): Promise<DomainMutationResult<OneTimePayment>> {
  const parsed = paymentPaidSchema.safeParse(input);
  if (!parsed.success) return domainFailure("VALIDATION", parsed.error.issues[0]?.message ?? "Nieprawidłowa płatność.");
  const workspace = loadAffairsWorkspace();
  const before = workspace.oneTimePayments.find((payment) => payment.id === parsed.data.paymentId);
  if (!before) return domainFailure("NOT_FOUND", "Płatność jednorazowa nie istnieje.");
  if (before.paid === parsed.data.paid) return domainFailure("CONFLICT", "Płatność ma już wybrany status.");
  const after: OneTimePayment = {
    ...before,
    paid: parsed.data.paid,
    paidAt: parsed.data.paid ? new Date().toISOString() : "",
  };
  const next = setOneTimePaymentPaidState(workspace, before.id, after.paid, after.paidAt);
  const compensation = createWorkspaceUndo({
    storageKey: AFFAIRS_STORAGE_KEY, read: loadAffairsWorkspace, save: saveAffairsWorkspace,
    select: (current) => current.oneTimePayments.find((payment) => payment.id === before.id) ?? null,
    apply: (current, value) => replacePayment(current, value, before.id),
    expected: after, restore: before,
    message: parsed.data.paid ? "Cofnięto oznaczenie płatności jako opłaconej." : "Przywrócono status opłacenia płatności.",
  });
  return commitDomainMutation({
    entityId: before.id, storageKey: AFFAIRS_STORAGE_KEY,
    event: { type: "affairs.payment_paid", domain: "finance", entityId: before.id, payload: { paid: after.paid, amount: after.amount } },
    save: () => saveAffairsWorkspace(next), read: loadAffairsWorkspace,
    verify: (current) => current.oneTimePayments.find((payment) => payment.id === before.id)?.paid === after.paid,
    selectSnapshot: (current) => current.oneTimePayments.find((payment) => payment.id === before.id) ?? after,
    message: after.paid ? "Oznaczono płatność jako opłaconą." : "Cofnięto opłacenie płatności.", compensation,
  });
}
