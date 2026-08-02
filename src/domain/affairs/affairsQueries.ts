import { loadAffairsWorkspace } from "../../app/data/affairsWorkspace";
import { normalizeSearchQuery } from "../shared";
import { domainFailure, type DomainCandidate } from "../shared/result";
import { affairsSearchSchema, financeSummarySchema } from "./affairsSchemas";

export function searchMatters(input: unknown) {
  const parsed = affairsSearchSchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const query = normalizeSearchQuery(parsed.data.query);
  const matches = loadAffairsWorkspace().matters.filter((matter) => (
    normalizeSearchQuery(`${matter.title} ${matter.note}`).includes(query)
  ));
  return {
    items: matches.slice(0, parsed.data.limit).map((matter) => ({
      id: matter.id, title: matter.title, status: matter.status,
      priority: matter.priority, dueDate: matter.dueDate, category: matter.category,
    })),
    total: matches.length,
  };
}

export function resolveMatterQuery(query: string): { matterId: string } | ReturnType<typeof domainFailure> {
  const result = searchMatters({ query, limit: 8 });
  if (result.items.length === 0) return domainFailure("NOT_FOUND", "Nie znaleziono pasującej sprawy.");
  if (result.total !== 1) {
    const candidates: DomainCandidate[] = result.items.map((item) => ({
      id: item.id, title: item.title, module: "affairs", status: item.status,
      date: item.dueDate, context: item.category,
    }));
    return domainFailure("AMBIGUOUS", "Znaleziono kilka pasujących spraw.", candidates);
  }
  return { matterId: result.items[0].id };
}

export function getMattersSummary(today: string) {
  const matters = loadAffairsWorkspace().matters;
  return {
    open: matters.filter((matter) => matter.status !== "done").map((matter) => ({
      id: matter.id, title: matter.title, status: matter.status,
      dueDate: matter.dueDate, priority: matter.priority, category: matter.category,
    })),
    overdue: matters.filter((matter) => matter.status !== "done" && matter.dueDate < today).map((matter) => ({
      id: matter.id, title: matter.title, status: matter.status,
      dueDate: matter.dueDate, priority: matter.priority, category: matter.category,
    })),
  };
}

export function getFinanceSummary(input: unknown) {
  const parsed = financeSummarySchema.safeParse(input);
  if (!parsed.success) return { items: [], total: 0, error: parsed.error.issues[0]?.message };
  const workspace = loadAffairsWorkspace();
  const oneTime = workspace.oneTimePayments.filter((payment) => !payment.paid).map((payment) => ({
    id: payment.id, title: payment.title, kind: "one_time" as const,
    dueDate: payment.dueDate, overdue: payment.dueDate < parsed.data.today,
    amount: parsed.data.includeAmounts ? payment.amount : null,
  }));
  const recurring = workspace.payments.filter((payment) => payment.active).map((payment) => ({
    id: payment.id, title: payment.name, kind: "recurring" as const,
    dueDate: payment.nextDueDate, overdue: payment.nextDueDate < parsed.data.today,
    amount: parsed.data.includeAmounts ? payment.amount : null,
  }));
  const subscriptions = workspace.subscriptions.filter((subscription) => subscription.active).map((subscription) => ({
    id: subscription.id, title: subscription.name, kind: "subscription" as const,
    dueDate: subscription.nextBillingDate, overdue: subscription.nextBillingDate < parsed.data.today,
    amount: parsed.data.includeAmounts ? subscription.amount : null,
  }));
  const items = [...oneTime, ...recurring, ...subscriptions].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  return {
    items,
    total: items.length,
    overdue: items.filter((item) => item.overdue).length,
    totalAmount: parsed.data.includeAmounts
      ? items.reduce((sum, item) => sum + (item.amount ?? 0), 0)
      : null,
    amountsRedacted: !parsed.data.includeAmounts,
  };
}
