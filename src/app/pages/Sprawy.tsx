/**
 * THESIS: Sprawy is a responsibility register, not another task list; it refuses one undifferentiated inbox.
 * OWN-WORLD: Rootine's graphite workshop, compact ledgers, quiet borders, and precision blue for the active register.
 * STORY: See what carries risk, maintain recurring commitments, and give every złoty a place before the month starts.
 * FIRST VIEWPORT: A local register rail frames a dated agenda where private matters, renewals, and budget signals meet.
 * FORM: The seventh grounded structure — a monthly responsibility cockpit — selected with seed 54454916.
 */
import {
  Archive,
  Building2,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Map,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { SensitiveValue } from "../experience/preferences";
import { recordActivity } from "../experience/activityLog";
import { writeModuleMemoryValue } from "../experience/moduleMemory";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatDate as formatPolishDate } from "../formatters";
import {
  AFFAIRS_STORAGE_KEY,
  advancePaymentDateToFuture,
  createBudgetMonth,
  getMonthKey,
  loadAffairsWorkspace,
  saveAffairsWorkspace,
  setMatterCompletionState,
  setOneTimePaymentPaidState,
  type DocumentRecord,
  type Matter,
  type MatterCategory,
  type MatterStatus,
  type OneTimePayment,
  type Subscription,
  type Vehicle,
  type VehicleItem,
  monthlyEquivalent,
} from "../data/affairsWorkspace";
import { AffairsEditorFields } from "../affairs/AffairsEditorFields";
import { applyAffairsEditor } from "../affairs/affairsMutations";
import { JdgWorkspace } from "./Jdg";
import Podroze from "./Podroze";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  CompletedSection,
  ContentHeader,
  ContextNavItem,
  ModuleSidebar,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  ProgressBar,
  Select,
  AddToTasksButton,
} from "../ui";
import "../../styles/affairs.css";

import {
  BUDGET_KIND_LABELS,
  CADENCE_LABELS,
  CATEGORY_META,
  DOCUMENT_LABELS,
  EMPTY_DRAFT,
  NAV_ITEMS,
  STATUS_LABELS,
  UPCOMING_ICONS,
  VEHICLE_ITEM_LABELS,
  VIEW_COPY,
  daysUntil,
  documentDueCopy,
  dueCopy,
  formatDate,
  formatMileage,
  formatMoney,
  formatMonth,
  getEditorPresentation,
  getInitialView,
  shiftMonthKey,
  vehicleItemDueCopy,
  type AffairsView,
  type DeleteState,
  type Draft,
  type EditorState,
} from "../affairs/affairsPresentation";

export default function Sprawy() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState(loadAffairsWorkspace);
  const [view, setView] = useState<AffairsView>(getInitialView);
  const [statusFilter, setStatusFilter] = useState<"active" | MatterStatus>("active");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MatterCategory>("all");
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [budgetMonthKey, setBudgetMonthKey] = useState(getMonthKey);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setStorageError(!saveAffairsWorkspace(workspace));
  }, [workspace]);

  useEffect(() => subscribeToLocalWorkspace(AFFAIRS_STORAGE_KEY, () => {
    setWorkspace(loadAffairsWorkspace());
  }), []);

  useEffect(() => {
    const onPopState = () => setView(getInitialView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setWorkspace((current) => {
      let changed = false;
      const payments = current.payments.map((payment) => {
        if (!payment.active || !payment.automatic) return payment;
        const nextDueDate = advancePaymentDateToFuture(payment.nextDueDate, payment.cadence);
        if (nextDueDate === payment.nextDueDate) return payment;
        changed = true;
        return { ...payment, nextDueDate };
      });
      const subscriptions = current.subscriptions.map((subscription) => {
        if (!subscription.active || subscription.renewal !== "automatic") return subscription;
        const nextBillingDate = advancePaymentDateToFuture(subscription.nextBillingDate, subscription.cadence);
        if (nextBillingDate === subscription.nextBillingDate) return subscription;
        changed = true;
        return { ...subscription, nextBillingDate };
      });
      return changed ? { ...current, payments, subscriptions } : current;
    });
  }, []);

  useEffect(() => {
    if (workspace.budgets.some((budget) => budget.month === budgetMonthKey)) return;
    setWorkspace((current) => ({
      ...current,
      budgets: [...current.budgets, createBudgetMonth(budgetMonthKey, current.budgets.at(-1))],
    }));
  }, [budgetMonthKey, workspace.budgets]);

  const activeMatters = workspace.matters.filter((matter) => matter.status !== "done");
  const selectedMatter = workspace.matters.find((matter) => matter.id === selectedMatterId);
  const currentBudget = workspace.budgets.find((budget) => budget.month === budgetMonthKey);

  const filteredMatters = useMemo(() => {
    return workspace.matters
      .filter((matter) => statusFilter === "active" ? matter.status !== "done" : matter.status === statusFilter)
      .filter((matter) => categoryFilter === "all" || matter.category === categoryFilter)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [categoryFilter, statusFilter, workspace.matters]);

  const monthlyPaymentTotal = useMemo(
    () => workspace.payments
      .filter((payment) => payment.active)
      .reduce((sum, payment) => sum + monthlyEquivalent(payment.amount, payment.cadence), 0),
    [workspace.payments],
  );

  const monthlySubscriptionTotal = useMemo(
    () => workspace.subscriptions
      .filter((subscription) => subscription.active)
      .reduce((sum, subscription) => sum + monthlyEquivalent(subscription.amount, subscription.cadence), 0),
    [workspace.subscriptions],
  );

  const unpaidOneTimeTotal = workspace.oneTimePayments
    .filter((payment) => !payment.paid)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const documentAlerts = workspace.documents.filter((document) => (
    document.expiresAt && daysUntil(document.expiresAt) <= document.reminderDays
  )).length;

  const vehicleAlerts = workspace.vehicleItems.filter((item) => {
    if (item.done) return false;
    const vehicle = workspace.vehicles.find((candidate) => candidate.id === item.vehicleId);
    const dateNear = item.dueDate ? daysUntil(item.dueDate) <= 30 : false;
    const mileageNear = item.dueMileage !== null && vehicle
      ? item.dueMileage <= vehicle.mileage + 1_000
      : false;
    return dateNear || mileageNear;
  }).length;

  const budgetSummary = useMemo(() => {
    const lines = currentBudget?.lines ?? [];
    const income = lines.filter((line) => line.kind === "income").reduce((sum, line) => sum + line.planned, 0);
    const plannedOut = lines.filter((line) => line.kind !== "income").reduce((sum, line) => sum + line.planned, 0);
    const actualIncome = lines.filter((line) => line.kind === "income").reduce((sum, line) => sum + line.actual, 0);
    const actualOut = lines.filter((line) => line.kind !== "income").reduce((sum, line) => sum + line.actual, 0);
    return {
      income,
      plannedOut,
      actualIncome,
      actualOut,
      plannedAvailable: income - plannedOut,
      actualAvailable: actualIncome - actualOut,
    };
  }, [currentBudget]);

  const upcoming = useMemo(() => {
    const matters = activeMatters.map((matter) => ({
      id: matter.id,
      view: "matters" as AffairsView,
      kind: "matter",
      title: matter.title,
      meta: CATEGORY_META[matter.category].label,
      dueDate: matter.dueDate,
      amount: null as number | null,
    }));
    const payments = workspace.payments.filter((payment) => payment.active).map((payment) => ({
      id: payment.id,
      view: "payments" as AffairsView,
      kind: "payment",
      title: payment.name,
      meta: payment.automatic ? "Płatność automatyczna" : "Do opłacenia ręcznie",
      dueDate: payment.nextDueDate,
      amount: payment.amount,
    }));
    const oneTime = workspace.oneTimePayments.filter((payment) => !payment.paid).map((payment) => ({
      id: payment.id,
      view: "oneTime" as AffairsView,
      kind: "oneTime",
      title: payment.title,
      meta: `Płatność jednorazowa · ${payment.category}`,
      dueDate: payment.dueDate,
      amount: payment.amount,
    }));
    const subscriptions = workspace.subscriptions.filter((subscription) => subscription.active).map((subscription) => ({
      id: subscription.id,
      view: "subscriptions" as AffairsView,
      kind: "subscription",
      title: subscription.name,
      meta: subscription.renewal === "automatic" ? "Odnowienie automatyczne" : "Odnowienie ręczne",
      dueDate: subscription.nextBillingDate,
      amount: subscription.amount,
    }));
    const documents = workspace.documents.filter((document) => document.expiresAt).map((document) => ({
      id: document.id,
      view: "documents" as AffairsView,
      kind: "document",
      title: document.name,
      meta: `${document.holder} · ${DOCUMENT_LABELS[document.category]}`,
      dueDate: document.expiresAt,
      amount: null as number | null,
    }));
    const vehicleItems = workspace.vehicleItems.filter((item) => !item.done && item.dueDate).map((item) => {
      const vehicle = workspace.vehicles.find((candidate) => candidate.id === item.vehicleId);
      return {
        id: item.id,
        view: "vehicles" as AffairsView,
        kind: "vehicle",
        title: item.title,
        meta: `${vehicle?.name ?? "Pojazd"} · ${VEHICLE_ITEM_LABELS[item.type]}`,
        dueDate: item.dueDate,
        amount: null as number | null,
      };
    });
    return [...matters, ...oneTime, ...payments, ...subscriptions, ...documents, ...vehicleItems]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 10);
  }, [
    activeMatters,
    workspace.documents,
    workspace.oneTimePayments,
    workspace.payments,
    workspace.subscriptions,
    workspace.vehicleItems,
    workspace.vehicles,
  ]);

  const isWithinNext30Days = (date: string) => {
    const days = daysUntil(date);
    return days >= 0 && days <= 30;
  };
  const dueSoon = activeMatters.filter((matter) => isWithinNext30Days(matter.dueDate)).length
    + workspace.oneTimePayments.filter((payment) => !payment.paid && isWithinNext30Days(payment.dueDate)).length
    + workspace.payments.filter((payment) => payment.active && isWithinNext30Days(payment.nextDueDate)).length
    + workspace.subscriptions.filter((subscription) => subscription.active && isWithinNext30Days(subscription.nextBillingDate)).length
    + workspace.documents.filter((document) => document.expiresAt && isWithinNext30Days(document.expiresAt)).length
    + workspace.vehicleItems.filter((item) => !item.done && item.dueDate && isWithinNext30Days(item.dueDate)).length;
  const dueThisWeek = upcoming.filter((item) => daysUntil(item.dueDate) <= 7).length;

  const openMatterEditor = (matter?: Matter) => {
    setDraft(matter ? {
      ...EMPTY_DRAFT,
      title: matter.title,
      category: matter.category,
      priority: matter.priority,
      status: matter.status,
      dueDate: matter.dueDate,
      note: matter.note,
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "matter", mode: matter ? "edit" : "add", id: matter?.id });
  };

  const openPaymentEditor = (paymentId?: string) => {
    const payment = workspace.payments.find((item) => item.id === paymentId);
    setDraft(payment ? {
      ...EMPTY_DRAFT,
      title: payment.name,
      category: payment.category,
      dueDate: payment.nextDueDate,
      note: payment.note,
      amount: String(payment.amount),
      cadence: payment.cadence,
      automatic: payment.automatic,
    } : { ...EMPTY_DRAFT, category: "Rachunki" });
    setEditorError("");
    setEditor({ kind: "payment", mode: payment ? "edit" : "add", id: payment?.id });
  };

  const openOneTimeEditor = (payment?: OneTimePayment) => {
    setDraft(payment ? {
      ...EMPTY_DRAFT,
      title: payment.title,
      category: payment.category,
      amount: String(payment.amount),
      dueDate: payment.dueDate,
      note: payment.note,
    } : { ...EMPTY_DRAFT, category: "Inne" });
    setEditorError("");
    setEditor({ kind: "oneTime", mode: payment ? "edit" : "add", id: payment?.id });
  };

  const openSubscriptionEditor = (subscription?: Subscription) => {
    setDraft(subscription ? {
      ...EMPTY_DRAFT,
      title: subscription.name,
      category: subscription.category,
      amount: String(subscription.amount),
      cadence: subscription.cadence,
      dueDate: subscription.nextBillingDate,
      secondaryDate: subscription.commitmentEndDate,
      renewal: subscription.renewal,
      note: subscription.note,
    } : { ...EMPTY_DRAFT, category: "Rozrywka", renewal: "automatic" });
    setEditorError("");
    setEditor({ kind: "subscription", mode: subscription ? "edit" : "add", id: subscription?.id });
  };

  const openDocumentEditor = (document?: DocumentRecord) => {
    setDraft(document ? {
      ...EMPTY_DRAFT,
      title: document.name,
      category: document.category,
      holder: document.holder,
      dueDate: document.expiresAt,
      reminderDays: String(document.reminderDays),
      note: document.note,
    } : { ...EMPTY_DRAFT, category: "identity", holder: "Ja", reminderDays: "90" });
    setEditorError("");
    setEditor({ kind: "document", mode: document ? "edit" : "add", id: document?.id });
  };

  const openVehicleEditor = (vehicle?: Vehicle) => {
    setDraft(vehicle ? {
      ...EMPTY_DRAFT,
      title: vehicle.name,
      registration: vehicle.registration,
      mileage: String(vehicle.mileage),
    } : EMPTY_DRAFT);
    setEditorError("");
    setEditor({ kind: "vehicle", mode: vehicle ? "edit" : "add", id: vehicle?.id });
  };

  const openVehicleItemEditor = (vehicleId: string, item?: VehicleItem) => {
    setDraft(item ? {
      ...EMPTY_DRAFT,
      title: item.title,
      vehicleId: item.vehicleId,
      vehicleType: item.type,
      dueDate: item.dueDate,
      dueMileage: item.dueMileage === null ? "" : String(item.dueMileage),
      note: item.note,
    } : { ...EMPTY_DRAFT, vehicleId, vehicleType: "service" });
    setEditorError("");
    setEditor({ kind: "vehicleItem", mode: item ? "edit" : "add", id: item?.id, vehicleId });
  };

  const openBudgetEditor = () => {
    setDraft({ ...EMPTY_DRAFT, category: "", budgetKind: "fixed" });
    setEditorError("");
    setEditor({ kind: "budget", mode: "add" });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("akcja");
    if (!action || !["nowa-sprawa", "nowa-platnosc", "nowy-wydatek"].includes(action)) return;

    const initialTitle = params.get("tytul")?.trim() ?? "";
    const initialDate = params.get("data") ?? "";
    const initialPriority = params.get("priorytet") === "high" ? "high" : "normal";
    if (action === "nowa-sprawa") {
      setView("matters");
      setDraft({ ...EMPTY_DRAFT, title: initialTitle, dueDate: initialDate, priority: initialPriority });
      setEditorError("");
      setEditor({ kind: "matter", mode: "add" });
    } else if (action === "nowa-platnosc") {
      setView("payments");
      setDraft({ ...EMPTY_DRAFT, title: initialTitle, dueDate: initialDate, category: "Rachunki" });
      setEditorError("");
      setEditor({ kind: "payment", mode: "add" });
    } else {
      setView("budget");
      setDraft({ ...EMPTY_DRAFT, title: initialTitle, category: "", budgetKind: "fixed" });
      setEditorError("");
      setEditor({ kind: "budget", mode: "add" });
    }

    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => params.delete(key));
    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : "",
    }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;

    const submission = applyAffairsEditor({
      editor,
      draft,
      workspace,
      budgetMonthKey,
    });
    if ("error" in submission) {
      setEditorError(submission.error);
      return;
    }

    setWorkspace(submission.nextWorkspace);
    if (submission.selectedMatterId) setSelectedMatterId(submission.selectedMatterId);
    recordActivity({
      moduleId: "affairs",
      kind: editor.mode === "edit" ? "save" : "create",
      title: submission.title,
      detail: editor.mode === "edit" ? "Zaktualizowano wpis" : "Dodano wpis",
    });
    closeEditor();
  };


  const confirmDelete = () => {
    if (!deleteState) return;
    setWorkspace((current) => {
      if (deleteState.kind === "matter") {
        return { ...current, matters: current.matters.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "payment") {
        return { ...current, payments: current.payments.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "oneTime") {
        return { ...current, oneTimePayments: current.oneTimePayments.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "subscription") {
        return { ...current, subscriptions: current.subscriptions.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "document") {
        return { ...current, documents: current.documents.filter((item) => item.id !== deleteState.id) };
      }
      if (deleteState.kind === "vehicle") {
        return {
          ...current,
          vehicles: current.vehicles.filter((item) => item.id !== deleteState.id),
          vehicleItems: current.vehicleItems.filter((item) => item.vehicleId !== deleteState.id),
        };
      }
      if (deleteState.kind === "vehicleItem") {
        return { ...current, vehicleItems: current.vehicleItems.filter((item) => item.id !== deleteState.id) };
      }
      return {
        ...current,
        budgets: current.budgets.map((budget) => budget.month === budgetMonthKey
          ? { ...budget, lines: budget.lines.filter((item) => item.id !== deleteState.id) }
          : budget),
      };
    });
    if (deleteState.id === selectedMatterId) setSelectedMatterId("");
    setDeleteState(null);
  };

  const toggleMatter = (matterId: string) => {
    const matter = workspace.matters.find((item) => item.id === matterId);
    if (matter) recordActivity({
      moduleId: "affairs",
      kind: matter.status === "done" ? "reopen" : "complete",
      title: matter.title,
      detail: matter.status === "done" ? "Przywrócono sprawę" : "Domknięto sprawę",
    });
    setWorkspace((current) => setMatterCompletionState(
      current,
      matterId,
      matter?.status !== "done",
    ));
  };

  const toggleOneTimePayment = (paymentId: string) => {
    const payment = workspace.oneTimePayments.find((item) => item.id === paymentId);
    if (payment) recordActivity({
      moduleId: "affairs",
      kind: payment.paid ? "reopen" : "complete",
      title: payment.title,
      detail: payment.paid ? "Przywrócono płatność" : "Oznaczono płatność jako opłaconą",
    });
    const paid = !payment?.paid;
    const paidAt = paid ? new Date().toISOString() : "";
    setWorkspace((current) => setOneTimePaymentPaidState(current, paymentId, paid, paidAt));
  };

  const sortedOneTimePayments = useMemo(
    () => workspace.oneTimePayments
      .slice()
      .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDate.localeCompare(b.dueDate)),
    [workspace.oneTimePayments],
  );

  const renderOneTimePayment = (payment: OneTimePayment) => {
    const due = dueCopy(payment.dueDate);
    return (
      <div key={payment.id} className={`affairs-payment-row ${payment.paid ? "is-done" : ""}`}>
        <span className="affairs-payment-row__icon"><ReceiptText size={14} /></span>
        <span className="affairs-payment-row__title">
          <strong>{payment.title}</strong>
          <small>{payment.note || "Jednorazowe zobowiązanie"}</small>
        </span>
        <span className="affairs-payment-row__cadence">{payment.category}</span>
        <Badge tone={payment.paid ? "success" : due.tone}>{payment.paid ? "Opłacone" : due.text}</Badge>
        <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${payment.title}`}>{formatMoney(payment.amount)}</SensitiveValue></strong>
        <span className="affairs-payment-row__actions">
          <AddToTasksButton compact input={{
            source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/one-time`, context: "Sprawy", href: "/sprawy?widok=oneTime" },
            text: payment.title,
            done: payment.paid,
            calendarDate: payment.dueDate,
            date: payment.dueDate,
            list: "sprawy",
            tags: ["sprawy", "płatność"],
            notes: payment.note,
          }} />
          <Button
            variant="quiet"
            size="sm"
            leadingIcon={payment.paid ? <RefreshCw size={12} /> : <Check size={12} />}
            onClick={() => toggleOneTimePayment(payment.id)}
          >
            {payment.paid ? "Przywróć" : "Opłacone"}
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.title}`} onClick={() => openOneTimeEditor(payment)}><Pencil size={12} /></Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Usuń ${payment.title}`}
            onClick={() => setDeleteState({ kind: "oneTime", id: payment.id, label: payment.title })}
          >
            <Trash2 size={12} />
          </Button>
        </span>
      </div>
    );
  };

  const budgetDraftKey = (lineId: string, field: "planned" | "actual") => `${lineId}:${field}`;

  const updateBudgetDraft = (lineId: string, field: "planned" | "actual", value: string) => {
    const key = budgetDraftKey(lineId, field);
    setBudgetDrafts((current) => ({ ...current, [key]: value }));
  };

  const commitBudgetValue = (lineId: string, field: "planned" | "actual") => {
    const key = budgetDraftKey(lineId, field);
    const rawValue = budgetDrafts[key];
    if (rawValue === undefined) return;
    const value = Number(rawValue.replace(",", "."));
    setBudgetDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (!rawValue.trim() || !Number.isFinite(value) || value < 0) return;
    setWorkspace((current) => ({
      ...current,
      budgets: current.budgets.map((budget) => budget.month === budgetMonthKey
        ? {
            ...budget,
            lines: budget.lines.map((line) => line.id === lineId ? { ...line, [field]: value } : line),
          }
        : budget),
    }));
  };

  const changeBudgetMonth = (offset: number) => {
    setBudgetMonthKey((current) => shiftMonthKey(current, offset));
  };

  const selectView = (nextView: AffairsView) => {
    setView(nextView);
    if (nextView !== "matters") setSelectedMatterId("");
    const url = new URL(window.location.href);
    if (nextView === "overview") {
      url.searchParams.delete("widok");
    } else {
      url.searchParams.set("widok", nextView);
    }
    if (url.href !== window.location.href) {
      window.history.pushState({}, "", url);
    }
    writeModuleMemoryValue("affairs", "location", `${url.pathname}${url.search}`);
  };

  const renderPrimaryAction = () => {
    if (view === "oneTime") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openOneTimeEditor()}><span className="header-action-label">Dodaj płatność</span></Button>;
    }
    if (view === "payments") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openPaymentEditor()}><span className="header-action-label">Dodaj cykliczną</span></Button>;
    }
    if (view === "subscriptions") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openSubscriptionEditor()}><span className="header-action-label">Dodaj subskrypcję</span></Button>;
    }
    if (view === "documents") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}><span className="header-action-label">Dodaj dokument</span></Button>;
    }
    if (view === "vehicles") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}><span className="header-action-label">Dodaj pojazd</span></Button>;
    }
    if (view === "budget") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openBudgetEditor()}><span className="header-action-label">Dodaj pozycję</span></Button>;
    }
    return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openMatterEditor()}><span className="header-action-label">Dodaj sprawę</span></Button>;
  };

  const navMeta = (itemView: AffairsView) => {
    if (itemView === "matters") return activeMatters.length;
    if (itemView === "oneTime") return workspace.oneTimePayments.filter((item) => !item.paid).length;
    if (itemView === "payments") return workspace.payments.filter((item) => item.active).length;
    if (itemView === "subscriptions") return workspace.subscriptions.filter((item) => item.active).length;
    if (itemView === "documents") return documentAlerts || undefined;
    if (itemView === "vehicles") return vehicleAlerts || undefined;
    return undefined;
  };

  const mobileViewOptions = [
    { value: "overview", label: "Przegląd", description: "Radar zobowiązań i plan miesiąca" },
    ...NAV_ITEMS.map((item) => ({ value: item.view, label: item.label })),
  ];

  const contextSidebar = (
    <ModuleSidebar label="Widoki spraw" className="affairs-sidebar">
      <nav className="affairs-sidebar__nav">
        <section>
          <p className="affairs-sidebar__label">Główne</p>
          <div>
            <ContextNavItem active={view === "overview"} icon={<LayoutDashboard />} label="Przegląd" onClick={() => selectView("overview")} />
            <ContextNavItem active={view === "matters"} icon={<ShieldCheck />} label="Do załatwienia" meta={navMeta("matters")} onClick={() => selectView("matters")} />
          </div>
        </section>
        <section>
          <p className="affairs-sidebar__label">Finanse</p>
          <div>
            <ContextNavItem active={view === "oneTime"} icon={<ReceiptText />} label="Jednorazowe" meta={navMeta("oneTime")} onClick={() => selectView("oneTime")} />
            <ContextNavItem active={view === "payments"} icon={<RefreshCw />} label="Cykliczne" meta={navMeta("payments")} onClick={() => selectView("payments")} />
            <ContextNavItem active={view === "subscriptions"} icon={<CreditCard />} label="Subskrypcje" meta={navMeta("subscriptions")} onClick={() => selectView("subscriptions")} />
            <ContextNavItem active={view === "budget"} icon={<WalletCards />} label="Budżet" onClick={() => selectView("budget")} />
          </div>
        </section>
        <section>
          <p className="affairs-sidebar__label">Dokumenty i pojazdy</p>
          <div>
            <ContextNavItem active={view === "documents"} icon={<FileText />} label="Dokumenty" meta={navMeta("documents")} onClick={() => selectView("documents")} />
            <ContextNavItem active={view === "vehicles"} icon={<Car />} label="Pojazdy" meta={navMeta("vehicles")} onClick={() => selectView("vehicles")} />
          </div>
        </section>
        <section>
          <p className="affairs-sidebar__label">Firma i podróże</p>
          <div>
            <ContextNavItem active={view === "jdg"} icon={<Building2 />} label="JDG" onClick={() => selectView("jdg")} />
            <ContextNavItem active={view === "travel"} icon={<Map />} label="Podróże" onClick={() => selectView("travel")} />
          </div>
        </section>
      </nav>
      <div className="affairs-sidebar__footer">
        <Clock3 size={13} aria-hidden="true" />
        <span>{dueSoon} w ciągu 30 dni</span>
      </div>
    </ModuleSidebar>
  );

  const detailPanel = selectedMatter && view === "matters" ? (
    <DetailPanel
      label={`Szczegóły: ${selectedMatter.title}`}
      className="affairs-detail"
      onDismiss={() => setSelectedMatterId("")}
    >
      <header className="affairs-detail__header">
        <div>
          <span>Szczegóły sprawy</span>
          <strong>{selectedMatter.title}</strong>
        </div>
        <Button variant="ghost" size="sm" iconOnly aria-label="Zamknij szczegóły" onClick={() => setSelectedMatterId("")}>
          <X size={13} />
        </Button>
      </header>
      <div className="affairs-detail__body">
        <div className="affairs-detail__status">
          <Badge tone={selectedMatter.status === "done" ? "success" : selectedMatter.status === "waiting" ? "warning" : "primary"} dot>
            {STATUS_LABELS[selectedMatter.status]}
          </Badge>
          {selectedMatter.priority === "high" && <Badge tone="danger">Ważna</Badge>}
        </div>
        <dl className="affairs-detail__facts">
          <div><dt>Obszar</dt><dd>{CATEGORY_META[selectedMatter.category].label}</dd></div>
          <div><dt>Termin</dt><dd>{formatDate(selectedMatter.dueDate)}</dd></div>
          <div><dt>Dodano</dt><dd>{formatPolishDate(selectedMatter.createdAt)}</dd></div>
        </dl>
        <section className="affairs-detail__note">
          <h3>Kontekst</h3>
          <p>{selectedMatter.note || "Brak dodatkowej notatki."}</p>
        </section>
      </div>
      <footer className="affairs-detail__actions">
        <Button variant="quiet" leadingIcon={<Check size={13} />} onClick={() => toggleMatter(selectedMatter.id)}>
          {selectedMatter.status === "done" ? "Przywróć" : "Oznacz jako załatwione"}
        </Button>
        <Button variant="ghost" size="sm" iconOnly aria-label="Edytuj sprawę" onClick={() => openMatterEditor(selectedMatter)}>
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Usuń sprawę"
          onClick={() => setDeleteState({ kind: "matter", id: selectedMatter.id, label: selectedMatter.title })}
        >
          <Trash2 size={13} />
        </Button>
      </footer>
    </DetailPanel>
  ) : undefined;

  const editorPresentation = getEditorPresentation(editor, budgetMonthKey);

  if (view === "jdg") {
    return (
      <JdgWorkspace
        layout={(header, content) => (
          <ModuleShell
            contextSidebar={contextSidebar}
            className="affairs-module"
            pageWidth="wide"
            title="JDG"
            ambient={{
              scene: "affairs",
              progress: workspace.matters.length
                ? workspace.matters.filter((matter) => matter.status === "done").length / workspace.matters.length
                : 0,
              signal: dueSoon,
            }}
            header={header}
          >
            <ModuleMain transitionKey={view}>{content}</ModuleMain>
          </ModuleShell>
        )}
      />
    );
  }

  if (view === "travel") {
    return (
      <Podroze
        embeddedViewSelect={(
          <Select
            compact
            aria-label="Wybierz widok spraw"
            fieldClassName="context-mobile-select affairs-mobile-view-select"
            value={view}
            options={mobileViewOptions}
            onChange={(event) => selectView(event.target.value as AffairsView)}
          />
        )}
        layout={(_header, content) => (
          <ModuleShell
            contextSidebar={contextSidebar}
            className="affairs-module affairs-module--travel"
            pageWidth="wide"
            title="Podróże"
            ambient={{ scene: "travel", progress: 0, signal: dueSoon }}
            header={(
              <PageHeader
                title="Sprawy"
                description="Zobowiązania, finanse i ważne rejestry"
                meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
              />
            )}
          >
            {content}
          </ModuleShell>
        )}
      />
    );
  }

  const pageHeader = (
    <PageHeader
      title="Sprawy"
      description="Zobowiązania, finanse i ważne rejestry"
      meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
    />
  );

  return (
    <ModuleShell
      contextSidebar={contextSidebar}
      detailPanel={detailPanel}
      className="affairs-module"
      pageWidth="wide"
      title={NAV_ITEMS.find((item) => item.view === view)?.label ?? "Sprawy"}
      ambient={{
        scene: "affairs",
        progress: workspace.matters.length
          ? workspace.matters.filter((matter) => matter.status === "done").length / workspace.matters.length
          : 0,
        signal: dueSoon,
      }}
      header={pageHeader}
    >
      <ModuleMain transitionKey={view}>
        <ContentHeader
          headingLevel={false}
          className={`affairs-toolbar ${view === "overview" || view === "budget" ? "affairs-toolbar--compact" : ""}`.trim()}
          title={NAV_ITEMS.find((item) => item.view === view)?.label ?? "Sprawy"}
          description={VIEW_COPY[view].description}
          mobileNavigation={<Select
            compact
            aria-label="Wybierz widok spraw"
            fieldClassName="context-mobile-select affairs-mobile-view-select"
            value={view}
            options={mobileViewOptions}
            onChange={(event) => selectView(event.target.value as AffairsView)}
          />}
          actions={<>
          {view === "matters" && (
            <>
              <Select
                compact
                aria-label="Filtr statusu"
                value={statusFilter}
                options={[
                  { value: "active", label: "Aktywne" },
                  { value: "open", label: "Do zrobienia" },
                  { value: "waiting", label: "Oczekujące" },
                  { value: "done", label: "Załatwione" },
                ]}
                onChange={(event) => setStatusFilter(event.target.value as "active" | MatterStatus)}
              />
              <Select
                compact
                aria-label="Filtr kategorii"
                value={categoryFilter}
                options={[
                  { value: "all", label: "Wszystkie obszary" },
                  ...Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
                onChange={(event) => setCategoryFilter(event.target.value as "all" | MatterCategory)}
              />
              <span className="affairs-toolbar__count">{filteredMatters.length} pozycji</span>
            </>
          )}
          {view === "payments" && (
            <span className="affairs-toolbar__context">
              <CreditCard size={13} aria-hidden="true" />
              Szacunkowo <SensitiveValue label="Miesięczna kwota płatności">{formatMoney(monthlyPaymentTotal)}</SensitiveValue> / mies.
            </span>
          )}
          {view === "oneTime" && (
            <span className="affairs-toolbar__context">
              <ReceiptText size={13} aria-hidden="true" />
              Do opłacenia <SensitiveValue label="Kwota do opłacenia">{formatMoney(unpaidOneTimeTotal)}</SensitiveValue>
            </span>
          )}
          {view === "subscriptions" && (
            <span className="affairs-toolbar__context">
              <CreditCard size={13} aria-hidden="true" />
              Aktywne <SensitiveValue label="Miesięczna kwota subskrypcji">{formatMoney(monthlySubscriptionTotal)}</SensitiveValue> / mies.
            </span>
          )}
          {view === "documents" && (
            <span className="affairs-toolbar__context">
              <FileText size={13} aria-hidden="true" />
              {documentAlerts ? `${documentAlerts} wymaga uwagi` : "Wszystkie terminy bezpieczne"}
            </span>
          )}
          {view === "vehicles" && (
            <span className="affairs-toolbar__context">
              <Car size={13} aria-hidden="true" />
              {workspace.vehicles.length} {workspace.vehicles.length === 1 ? "pojazd" : "pojazdy"} · {vehicleAlerts} bliskich terminów
            </span>
          )}
          {view === "budget" && (
            <div className="affairs-month-switcher">
              <Button variant="ghost" size="sm" iconOnly aria-label="Poprzedni miesiąc" onClick={() => changeBudgetMonth(-1)}><ChevronLeft size={13} /></Button>
              <strong>{formatMonth(budgetMonthKey)}</strong>
              <Button variant="ghost" size="sm" iconOnly aria-label="Następny miesiąc" onClick={() => changeBudgetMonth(1)}><ChevronRight size={13} /></Button>
            </div>
          )}
          {renderPrimaryAction()}
          </>}
        />

        <div className="affairs-canvas">
          {view === "overview" && (
            <div className="affairs-overview">
              <section className="affairs-radar-summary" aria-labelledby="affairs-radar-heading">
                <header className="affairs-radar-summary__heading">
                  <div>
                    <h2 id="affairs-radar-heading">Radar odpowiedzialności</h2>
                    <p>Najbliższe rzeczy, które mogą wymagać Twojej uwagi.</p>
                  </div>
                  <span className={`affairs-radar-summary__window ${dueSoon ? "is-warning" : ""}`}>
                    {dueSoon} w ciągu 30 dni
                  </span>
                </header>
                <dl className="affairs-radar-summary__signals">
                  <div>
                    <dt>Najpilniejsze</dt>
                    <dd>{dueThisWeek}</dd>
                    <dd className="affairs-radar-summary__signal-note">do 7 dni</dd>
                  </div>
                  <div>
                    <dt>Do opłacenia</dt>
                    <dd><SensitiveValue label="Kwota płatności jednorazowych">{formatMoney(unpaidOneTimeTotal)}</SensitiveValue></dd>
                    <dd className="affairs-radar-summary__signal-note">jednorazowe</dd>
                  </div>
                  <div>
                    <dt>Alerty rejestrów</dt>
                    <dd>{documentAlerts + vehicleAlerts}</dd>
                    <dd className="affairs-radar-summary__signal-note">{documentAlerts} dok. · {vehicleAlerts} poj.</dd>
                  </div>
                  <div>
                    <dt>Stałe zobowiązania</dt>
                    <dd><SensitiveValue label="Kwota stałych zobowiązań">{formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)}</SensitiveValue></dd>
                    <dd className="affairs-radar-summary__signal-note">miesięcznie</dd>
                  </div>
                </dl>
              </section>

              <div className="affairs-overview__grid">
                <Card as="section" tone="panel" padding="none" className="affairs-agenda">
                  <header className="affairs-section-heading">
                    <div>
                      <h2>Najbliżej na radarze</h2>
                      <p>Jeden porządek terminów dla spraw i płatności</p>
                    </div>
                    <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={12} />} onClick={() => selectView("matters")}>Wszystkie</Button>
                  </header>
                  {upcoming.length === 0 ? (
                    <EmptyState icon={<Archive size={18} />} title="Radar jest pusty" description="Dodaj sprawę albo płatność z terminem." />
                  ) : (
                    <div className="affairs-agenda__list">
                      {upcoming.map((item) => {
                        const due = dueCopy(item.dueDate);
                        const UpcomingIcon = UPCOMING_ICONS[item.kind as keyof typeof UPCOMING_ICONS];
                        return (
                          <button
                            key={`${item.kind}-${item.id}`}
                            type="button"
                            className="affairs-agenda-row"
                            onClick={() => {
                              selectView(item.view);
                              if (item.kind === "matter") setSelectedMatterId(item.id);
                            }}
                          >
                            <span className={`affairs-agenda-row__icon affairs-agenda-row__icon--${item.kind}`}>
                              <UpcomingIcon size={14} />
                            </span>
                            <span className="affairs-agenda-row__copy">
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                            </span>
                            {item.amount !== null && (
                              <span className="affairs-agenda-row__amount">
                                <SensitiveValue label={`Kwota: ${item.title}`}>{formatMoney(item.amount)}</SensitiveValue>
                              </span>
                            )}
                            <Badge tone={due.tone}>{due.text}</Badge>
                            <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card as="section" tone="panel" padding="none" className="affairs-budget-snapshot">
                  <header className="affairs-section-heading">
                    <div>
                      <h2>Koszty stałe</h2>
                      <p>Cykliczne rachunki i aktywne usługi</p>
                    </div>
                    <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={12} />} onClick={() => selectView("subscriptions")}>Subskrypcje</Button>
                  </header>
                  <div className="affairs-budget-snapshot__body">
                    <div className="affairs-budget-balance">
                      <span>Miesięcznie zarezerwowane</span>
                      <strong><SensitiveValue label="Miesięcznie zarezerwowana kwota">{formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)}</SensitiveValue></strong>
                    </div>
                    <ProgressBar
                      label="Udział stałych zobowiązań w planowanych wpływach"
                      value={budgetSummary.income
                        ? ((monthlyPaymentTotal + monthlySubscriptionTotal) / budgetSummary.income) * 100
                        : 0}
                    />
                    <dl>
                      <div><dt>Cykliczne</dt><dd><SensitiveValue label="Kwota płatności cyklicznych">{formatMoney(monthlyPaymentTotal)}</SensitiveValue></dd></div>
                      <div><dt>Subskrypcje</dt><dd><SensitiveValue label="Kwota subskrypcji">{formatMoney(monthlySubscriptionTotal)}</SensitiveValue></dd></div>
                      <div><dt>Jednorazowe</dt><dd><SensitiveValue label="Kwota płatności jednorazowych">{formatMoney(unpaidOneTimeTotal)}</SensitiveValue></dd></div>
                    </dl>
                    <p>Kwoty roczne i kwartalne są przeliczone na miesięczny odpowiednik.</p>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {view === "matters" && (
            <section className="affairs-ledger" aria-label="Lista spraw">
              <div className="affairs-ledger__head affairs-ledger__head--matters">
                <span>Sprawa</span>
                <span>Obszar</span>
                <span>Termin</span>
                <span>Status</span>
                <span />
              </div>
              {filteredMatters.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck size={18} />}
                  title="Brak spraw w tym widoku"
                  description="Zmień filtry albo dodaj nową ważną sprawę."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openMatterEditor()}>Dodaj sprawę</Button>}
                />
              ) : filteredMatters.map((matter) => {
                const CategoryIcon = CATEGORY_META[matter.category].icon;
                const due = dueCopy(matter.dueDate);
                return (
                  <div key={matter.id} className={`affairs-matter-row ${selectedMatterId === matter.id ? "is-selected" : ""} ${matter.status === "done" ? "is-done" : ""}`}>
                    <Checkbox
                      size="sm"
                      checked={matter.status === "done"}
                      aria-label={matter.status === "done" ? `Przywróć: ${matter.title}` : `Oznacz jako załatwione: ${matter.title}`}
                      onChange={() => toggleMatter(matter.id)}
                    />
                    <button type="button" className="affairs-matter-row__title" onClick={() => setSelectedMatterId(matter.id)}>
                      <strong>{matter.title}</strong>
                      <small>{matter.note || "Bez dodatkowej notatki"}</small>
                    </button>
                    <span className="affairs-matter-row__category"><CategoryIcon size={12} />{CATEGORY_META[matter.category].label}</span>
                    <Badge tone={due.tone}>{due.text}</Badge>
                    <Badge tone={matter.status === "done" ? "success" : matter.status === "waiting" ? "warning" : matter.priority === "high" ? "danger" : "primary"} dot>
                      {STATUS_LABELS[matter.status]}
                    </Badge>
                    <AddToTasksButton compact input={{
                      source: { kind: "affairs", entity: `${encodeURIComponent(matter.id)}/matter`, context: "Sprawy", href: "/sprawy?widok=matters" },
                      text: matter.title,
                      done: matter.status === "done",
                      calendarDate: matter.dueDate || undefined,
                      date: matter.dueDate || undefined,
                      priority: matter.priority === "normal" ? undefined : matter.priority,
                      list: "sprawy",
                      tags: ["sprawy"],
                      notes: matter.note,
                    }} />
                  </div>
                );
              })}
            </section>
          )}

          {view === "oneTime" && (
            <section className="affairs-ledger" aria-label="Płatności jednorazowe">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Zobowiązanie</span>
                <span>Kategoria</span>
                <span>Termin</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.oneTimePayments.length === 0 ? (
                <EmptyState
                  icon={<ReceiptText size={18} />}
                  title="Brak jednorazowych płatności"
                  description="Dodaj opłatę urzędową, ratę, rachunek albo większy zakup z terminem."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openOneTimeEditor()}>Dodaj płatność</Button>}
                />
              ) : sortedOneTimePayments
                .slice()
                .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDate.localeCompare(b.dueDate))
                .map((payment, index, sortedPayments) => {
                  if (payment.paid) {
                    if (sortedPayments[index - 1]?.paid) return null;
                    const completedPayments = sortedPayments.filter((item) => item.paid);
                    return (
                      <CompletedSection key="completed-payments" label="Opłacone" count={completedPayments.length} className="affairs-completed-section">
                        <div className="affairs-ledger__completed-list">
                          {completedPayments.map(renderOneTimePayment)}
                        </div>
                      </CompletedSection>
                    );
                  }
                  const due = dueCopy(payment.dueDate);
                  return (
                    <div key={payment.id} className={`affairs-payment-row ${payment.paid ? "is-done" : ""}`}>
                      <span className="affairs-payment-row__icon"><ReceiptText size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{payment.title}</strong>
                        <small>{payment.note || "Jednorazowe zobowiązanie"}</small>
                      </span>
                      <span className="affairs-payment-row__cadence">{payment.category}</span>
                      <Badge tone={payment.paid ? "success" : due.tone}>{payment.paid ? "Opłacone" : due.text}</Badge>
                      <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${payment.title}`}>{formatMoney(payment.amount)}</SensitiveValue></strong>
                      <span className="affairs-payment-row__actions">
                        <AddToTasksButton compact input={{
                          source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/one-time`, context: "Sprawy", href: "/sprawy?widok=oneTime" },
                          text: payment.title,
                          done: payment.paid,
                          calendarDate: payment.dueDate,
                          date: payment.dueDate,
                          list: "sprawy",
                          tags: ["sprawy", "płatność"],
                          notes: payment.note,
                        }} />
                        <Button
                          variant="quiet"
                          size="sm"
                          leadingIcon={payment.paid ? <RefreshCw size={12} /> : <Check size={12} />}
                          onClick={() => toggleOneTimePayment(payment.id)}
                        >
                          {payment.paid ? "Przywróć" : "Opłacone"}
                        </Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.title}`} onClick={() => openOneTimeEditor(payment)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${payment.title}`}
                          onClick={() => setDeleteState({ kind: "oneTime", id: payment.id, label: payment.title })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "payments" && (
            <section className="affairs-ledger" aria-label="Płatności cykliczne">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Płatność</span>
                <span>Cykl</span>
                <span>Następna</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.payments.length === 0 ? (
                <EmptyState
                  icon={<RefreshCw size={18} />}
                  title="Brak płatności cyklicznych"
                  description="Dodaj czynsz, media, polisę albo inne regularne zobowiązanie."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openPaymentEditor()}>Dodaj płatność</Button>}
                />
              ) : workspace.payments.map((payment) => {
                const due = dueCopy(payment.nextDueDate);
                return (
                  <div key={payment.id} className={`affairs-payment-row ${payment.active ? "" : "is-paused"}`}>
                    <span className="affairs-payment-row__icon"><ReceiptText size={14} /></span>
                    <span className="affairs-payment-row__title">
                      <strong>{payment.name}</strong>
                      <small>{payment.category} · {payment.automatic ? "automatycznie" : "ręcznie"}</small>
                    </span>
                    <span className="affairs-payment-row__cadence">{CADENCE_LABELS[payment.cadence]}</span>
                    <Badge tone={payment.active ? due.tone : "neutral"}>{payment.active ? due.text : "Wstrzymana"}</Badge>
                    <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${payment.name}`}>{formatMoney(payment.amount)}</SensitiveValue></strong>
                    <span className="affairs-payment-row__actions">
                      <AddToTasksButton compact input={{
                        source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/recurring`, context: "Sprawy", href: "/sprawy?widok=payments" },
                        text: payment.name,
                        done: false,
                        calendarDate: payment.nextDueDate,
                        date: payment.nextDueDate,
                        list: "sprawy",
                        tags: ["sprawy", "płatność"],
                      }} />
                      {payment.active && !payment.automatic && (
                        <Button
                          variant="quiet"
                          size="sm"
                          leadingIcon={<Check size={12} />}
                          onClick={() => setWorkspace((current) => ({
                            ...current,
                            payments: current.payments.map((item) => item.id === payment.id
                              ? { ...item, nextDueDate: advancePaymentDateToFuture(item.nextDueDate, item.cadence) }
                              : item),
                          }))}
                        >
                          Opłacone
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.name}`} onClick={() => openPaymentEditor(payment.id)}><Pencil size={12} /></Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={payment.active ? `Wstrzymaj ${payment.name}` : `Wznów ${payment.name}`}
                        onClick={() => setWorkspace((current) => ({
                          ...current,
                          payments: current.payments.map((item) => item.id === payment.id ? { ...item, active: !item.active } : item),
                        }))}
                      >
                        {payment.active ? <Archive size={12} /> : <RefreshCw size={12} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${payment.name}`}
                        onClick={() => setDeleteState({ kind: "payment", id: payment.id, label: payment.name })}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </section>
          )}

          {view === "subscriptions" && (
            <section className="affairs-ledger" aria-label="Subskrypcje i członkostwa">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Subskrypcja</span>
                <span>Cykl</span>
                <span>Następna</span>
                <span>Kwota</span>
                <span />
              </div>
              {workspace.subscriptions.length === 0 ? (
                <EmptyState
                  icon={<CreditCard size={18} />}
                  title="Brak subskrypcji"
                  description="Dodaj usługę, członkostwo lub umowę, której koszt i odnowienie chcesz kontrolować."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openSubscriptionEditor()}>Dodaj subskrypcję</Button>}
                />
              ) : workspace.subscriptions
                .slice()
                .sort((a, b) => Number(b.active) - Number(a.active) || a.nextBillingDate.localeCompare(b.nextBillingDate))
                .map((subscription) => {
                  const due = dueCopy(subscription.nextBillingDate);
                  return (
                    <div key={subscription.id} className={`affairs-payment-row ${subscription.active ? "" : "is-paused"}`}>
                      <span className="affairs-payment-row__icon"><CreditCard size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{subscription.name}</strong>
                        <small>
                          {subscription.category} · {subscription.renewal === "automatic" ? "odnowienie automatyczne" : "odnowienie ręczne"}
                          {subscription.commitmentEndDate ? ` · umowa do ${formatDate(subscription.commitmentEndDate)}` : ""}
                        </small>
                      </span>
                      <span className="affairs-payment-row__cadence">{CADENCE_LABELS[subscription.cadence]}</span>
                      <Badge tone={subscription.active ? due.tone : "neutral"}>{subscription.active ? due.text : "Wstrzymana"}</Badge>
                      <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${subscription.name}`}>{formatMoney(subscription.amount)}</SensitiveValue></strong>
                      <span className="affairs-payment-row__actions">
                        <AddToTasksButton compact input={{
                          source: { kind: "affairs", entity: `${encodeURIComponent(subscription.id)}/subscription`, context: "Sprawy", href: "/sprawy?widok=subscriptions" },
                          text: subscription.name,
                          done: false,
                          calendarDate: subscription.nextBillingDate,
                          date: subscription.nextBillingDate,
                          list: "sprawy",
                          tags: ["sprawy", "subskrypcja"],
                        }} />
                        {subscription.active && subscription.renewal === "manual" && (
                          <Button
                            variant="quiet"
                            size="sm"
                            leadingIcon={<Check size={12} />}
                            onClick={() => setWorkspace((current) => ({
                              ...current,
                              subscriptions: current.subscriptions.map((item) => item.id === subscription.id
                                ? { ...item, nextBillingDate: advancePaymentDateToFuture(item.nextBillingDate, item.cadence) }
                                : item),
                            }))}
                          >
                            Odnowione
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${subscription.name}`} onClick={() => openSubscriptionEditor(subscription)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={subscription.active ? `Wstrzymaj ${subscription.name}` : `Wznów ${subscription.name}`}
                          onClick={() => setWorkspace((current) => ({
                            ...current,
                            subscriptions: current.subscriptions.map((item) => item.id === subscription.id ? { ...item, active: !item.active } : item),
                          }))}
                        >
                          {subscription.active ? <Archive size={12} /> : <RefreshCw size={12} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${subscription.name}`}
                          onClick={() => setDeleteState({ kind: "subscription", id: subscription.id, label: subscription.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "documents" && (
            <section className="affairs-ledger" aria-label="Ważność dokumentów">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Dokument</span>
                <span>Typ</span>
                <span>Ważność</span>
                <span>Alarm</span>
                <span />
              </div>
              {workspace.documents.length === 0 ? (
                <EmptyState
                  icon={<FileText size={18} />}
                  title="Brak dokumentów"
                  description="Dodaj dowód, paszport, prawo jazdy, kartę, polisę, umowę lub gwarancję."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}>Dodaj dokument</Button>}
                />
              ) : workspace.documents
                .slice()
                .sort((a, b) => {
                  if (!a.expiresAt) return 1;
                  if (!b.expiresAt) return -1;
                  return a.expiresAt.localeCompare(b.expiresAt);
                })
                .map((document) => {
                  const due = documentDueCopy(document);
                  return (
                    <div key={document.id} className="affairs-payment-row">
                      <span className="affairs-payment-row__icon"><FileText size={14} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{document.name}</strong>
                        <small>{document.holder} · {document.note || "Bez dodatkowej notatki"}</small>
                      </span>
                      <span className="affairs-payment-row__cadence">{DOCUMENT_LABELS[document.category]}</span>
                      <Badge tone={due.tone}>{due.text}</Badge>
                      <span className="affairs-record-value">
                        {document.expiresAt ? `${document.reminderDays} dni wcześniej` : "—"}
                      </span>
                      <span className="affairs-payment-row__actions">
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${document.name}`} onClick={() => openDocumentEditor(document)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${document.name}`}
                          onClick={() => setDeleteState({ kind: "document", id: document.id, label: document.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </section>
          )}

          {view === "vehicles" && (
            <div className="affairs-vehicle-list">
              {workspace.vehicles.length === 0 ? (
                <EmptyState
                  icon={<Car size={18} />}
                  title="Brak pojazdów"
                  description="Dodaj samochód, motocykl lub inny pojazd, aby pilnować OC, przeglądów i serwisu."
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}>Dodaj pojazd</Button>}
                />
              ) : workspace.vehicles.map((vehicle) => {
                const items = workspace.vehicleItems
                  .filter((item) => item.vehicleId === vehicle.id)
                  .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
                const renderVehicleItem = (item: VehicleItem) => {
                  const due = vehicleItemDueCopy(item, vehicle);
                  return (
                    <div key={item.id} className={`affairs-vehicle-row ${item.done ? "is-done" : ""}`}>
                      <Checkbox
                        size="sm"
                        checked={item.done}
                        aria-label={item.done ? `Przywróć ${item.title}` : `Oznacz jako zrobione: ${item.title}`}
                        onChange={() => setWorkspace((current) => ({
                          ...current,
                          vehicleItems: current.vehicleItems.map((candidate) => candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate),
                        }))}
                      />
                      <span className="affairs-vehicle-row__title">
                        <strong>{item.title}</strong>
                        <small>{VEHICLE_ITEM_LABELS[item.type]}{item.note ? ` · ${item.note}` : ""}</small>
                      </span>
                      <span className="affairs-vehicle-row__target">
                        {item.dueDate && <span>{formatDate(item.dueDate)}</span>}
                        {item.dueMileage !== null && <span>{formatMileage(item.dueMileage)}</span>}
                      </span>
                      <Badge tone={due.tone}>{due.text}</Badge>
                      <span className="affairs-vehicle-row__actions">
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openVehicleItemEditor(vehicle.id, item)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${item.title}`}
                          onClick={() => setDeleteState({ kind: "vehicleItem", id: item.id, label: item.title })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </div>
                  );
                };
                return (
                  <Card key={vehicle.id} as="section" tone="panel" padding="none" className="affairs-vehicle">
                    <header className="affairs-vehicle__header">
                      <span className="affairs-vehicle__mark"><Car size={18} /></span>
                      <div>
                        <h2>{vehicle.name}</h2>
                        <p>{vehicle.registration || "Bez numeru rejestracyjnego"} · {formatMileage(vehicle.mileage)}</p>
                      </div>
                      <span className="affairs-vehicle__actions">
                        <Button variant="quiet" size="sm" leadingIcon={<Plus size={12} />} onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj termin</Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${vehicle.name}`} onClick={() => openVehicleEditor(vehicle)}><Pencil size={12} /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${vehicle.name}`}
                          onClick={() => setDeleteState({ kind: "vehicle", id: vehicle.id, label: vehicle.name })}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </span>
                    </header>
                    {items.length === 0 ? (
                      <div className="affairs-vehicle__empty">
                        <span>Brak zapisanych terminów dla tego pojazdu.</span>
                        <Button variant="ghost" size="sm" onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj pierwszy</Button>
                      </div>
                    ) : (
                      <div className="affairs-vehicle__items">
                        {items.map((item, index, sortedItems) => {
                          if (item.done) {
                            if (sortedItems[index - 1]?.done) return null;
                            const completedItems = sortedItems.filter((candidate) => candidate.done);
                            return (
                              <CompletedSection key="completed-vehicle-items" label="Ukończone terminy" count={completedItems.length} className="affairs-completed-section">
                                <div className="affairs-vehicle-row-list">
                                  {completedItems.map(renderVehicleItem)}
                                </div>
                              </CompletedSection>
                            );
                          }
                          const due = vehicleItemDueCopy(item, vehicle);
                          return (
                            <div key={item.id} className={`affairs-vehicle-row ${item.done ? "is-done" : ""}`}>
                              <Checkbox
                                size="sm"
                                checked={item.done}
                                aria-label={item.done ? `Przywróć ${item.title}` : `Oznacz jako zrobione: ${item.title}`}
                                onChange={() => setWorkspace((current) => ({
                                  ...current,
                                  vehicleItems: current.vehicleItems.map((candidate) => candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate),
                                }))}
                              />
                              <span className="affairs-vehicle-row__title">
                                <strong>{item.title}</strong>
                                <small>{VEHICLE_ITEM_LABELS[item.type]}{item.note ? ` · ${item.note}` : ""}</small>
                              </span>
                              <span className="affairs-vehicle-row__target">
                                {item.dueDate && <span>{formatDate(item.dueDate)}</span>}
                                {item.dueMileage !== null && <span>{formatMileage(item.dueMileage)}</span>}
                              </span>
                              <Badge tone={due.tone}>{due.text}</Badge>
                              <span className="affairs-vehicle-row__actions">
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openVehicleItemEditor(vehicle.id, item)}><Pencil size={12} /></Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  aria-label={`Usuń ${item.title}`}
                                  onClick={() => setDeleteState({ kind: "vehicleItem", id: item.id, label: item.title })}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {view === "budget" && (
            <div className="affairs-budget">
              <section className="affairs-budget__summary" aria-label="Podsumowanie budżetu">
                <div><span>Planowane wpływy</span><strong><SensitiveValue label="Planowane wpływy">{formatMoney(budgetSummary.income)}</SensitiveValue></strong></div>
                <div><span>Przydzielone</span><strong><SensitiveValue label="Przydzielona kwota">{formatMoney(budgetSummary.plannedOut)}</SensitiveValue></strong></div>
                <div><span>Rzeczywiste wydatki</span><strong><SensitiveValue label="Rzeczywiste wydatki">{formatMoney(budgetSummary.actualOut)}</SensitiveValue></strong></div>
                <div><span>Rzeczywiście zostaje</span><strong className={budgetSummary.actualAvailable < 0 ? "is-negative" : ""}><SensitiveValue label="Pozostała kwota">{formatMoney(budgetSummary.actualAvailable)}</SensitiveValue></strong></div>
              </section>
              <section className="affairs-budget-table">
                <div className="affairs-budget-table__head">
                  <span>Kategoria</span>
                  <span>Typ</span>
                  <span>Plan</span>
                  <span>Rzeczywiście</span>
                  <span />
                </div>
                {(currentBudget?.lines ?? []).map((line) => {
                  const ratio = line.planned > 0 ? Math.min(100, (line.actual / line.planned) * 100) : 0;
                  return (
                    <div key={line.id} className="affairs-budget-row">
                      <span className="affairs-budget-row__identity">
                        <strong>{line.label}</strong>
                        {line.kind !== "income" && (
                          <span className="affairs-budget-row__track"><i style={{ width: `${ratio}%` }} /></span>
                        )}
                      </span>
                      <Badge tone={line.kind === "income" ? "success" : line.kind === "savings" ? "primary" : "neutral"}>
                        {BUDGET_KIND_LABELS[line.kind]}
                      </Badge>
                      <label>
                        <span className="sr-only">Plan dla {line.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={budgetDrafts[budgetDraftKey(line.id, "planned")] ?? String(line.planned)}
                          onChange={(event) => updateBudgetDraft(line.id, "planned", event.target.value)}
                          onBlur={() => commitBudgetValue(line.id, "planned")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                        <span>zł</span>
                      </label>
                      <label>
                        <span className="sr-only">Kwota rzeczywista dla {line.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={budgetDrafts[budgetDraftKey(line.id, "actual")] ?? String(line.actual)}
                          onChange={(event) => updateBudgetDraft(line.id, "actual", event.target.value)}
                          onBlur={() => commitBudgetValue(line.id, "actual")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                        <span>zł</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${line.label}`}
                        onClick={() => setDeleteState({ kind: "budget", id: line.id, label: line.label })}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  );
                })}
                {!currentBudget?.lines.length && (
                  <EmptyState
                    icon={<WalletCards size={18} />}
                    title="Ten miesiąc nie ma jeszcze planu"
                    description="Dodaj wpływy, koszty stałe, elastyczne i cel oszczędności."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openBudgetEditor()}>Dodaj pozycję</Button>}
                  />
                )}
              </section>
            </div>
          )}
        </div>
      </ModuleMain>

      {editor && (
        <Modal
          eyebrow={editorPresentation?.eyebrow}
          title={editorPresentation?.title ?? ""}
          description={editorPresentation?.description}
          onClose={closeEditor}
          footer={(
            <>
              <Button variant="ghost" onClick={closeEditor}>Anuluj</Button>
              <Button variant="primary" type="submit" form="affairs-editor-form">
                {editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"}
              </Button>
            </>
          )}
        >
          <form id="affairs-editor-form" className="affairs-form" onSubmit={submitEditor}>
            <Input
              label={editorPresentation?.label}
              placeholder={editorPresentation?.placeholder}
              value={draft.title}
              error={editorError}
              autoFocus
              onChange={(event) => {
                setDraft((current) => ({ ...current, title: event.target.value }));
                if (editorError) setEditorError("");
              }}
            />

            <AffairsEditorFields editor={editor} draft={draft} setDraft={setDraft} workspace={workspace} />
          </form>
        </Modal>
      )}

      {deleteState && (
        <ConfirmDialog
          title={`Usunąć „${deleteState.label}”?`}
          description="Ta pozycja zniknie z lokalnego rejestru."
          onCancel={() => setDeleteState(null)}
          onConfirm={confirmDelete}
        />
      )}
    </ModuleShell>
  );
}
