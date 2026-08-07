/**
 * THESIS: Sprawy is a responsibility register, not another task list; it refuses one undifferentiated inbox.
 * OWN-WORLD: Rootine's graphite workshop, compact ledgers, quiet borders, and precision blue for the active register.
 * STORY: See what carries risk, maintain recurring commitments, and give every złoty a place before the month starts.
 * FIRST VIEWPORT: A local register rail frames a dated agenda where private matters, renewals, and budget signals meet.
 * FORM: The seventh grounded structure — a monthly responsibility cockpit — selected with seed 54454916.
 */
import {
  Archive,
  Bell,
  CalendarClock,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  MapPin,
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
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatDate as formatPolishDate, pluralize } from "../formatters";
import {
  AFFAIRS_STORAGE_KEY,
  advancePaymentDateToFuture,
  createBudgetMonth,
  getMonthKey,
  loadAffairsWorkspace,
  saveAffairsWorkspace,
  setAffairAttentionState,
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
import { JDG_STORAGE_KEY, loadJdgWorkspace, saveJdgWorkspace } from "../data/jdgWorkspace";
import { TRAVEL_STORAGE_KEY, loadTravelWorkspace, saveTravelWorkspace } from "../data/travelWorkspace";
import { AffairsEditorFields } from "../affairs/AffairsEditorFields";
import { applyAffairsEditor } from "../affairs/affairsMutations";
import { buildAffairAttentionItems, resolveAffairAttentionItem, type AffairAttentionItem } from "../affairs/affairsAttention";
import { JdgWorkspace } from "./Jdg";
import Podroze from "./Podroze";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  CompletedSection,
  ContentHeader,
  ContextNavGroup,
  ContextNavItem,
  ModuleSidebar,
  DetailPanel,
  EmptyState,
  Input,
  Modal,
  ModuleMain,
  ModuleShell,
  Select,
  SectionSurface,
  SummaryStrip,
  AddToTasksButton,
} from "../ui";
import "../../styles/affairs.css";

import {
  AFFAIRS_VIEW_ARCHETYPE,
  BUDGET_KIND_LABELS,
  CADENCE_LABELS,
  CATEGORY_META,
  DOCUMENT_LABELS,
  EMPTY_DRAFT,
  NAV_ITEMS,
  NAV_GROUPS,
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
  reminderPresetFromMinutes,
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
  const [jdgWorkspace, setJdgWorkspace] = useState(loadJdgWorkspace);
  const [travelWorkspace, setTravelWorkspace] = useState(loadTravelWorkspace);
  const [view, setView] = useState<AffairsView>(getInitialView);
  const [statusFilter, setStatusFilter] = useState<"active" | MatterStatus>("active");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MatterCategory>("all");
  const [subscriptionCategoryFilter, setSubscriptionCategoryFilter] = useState("all");
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

  useEffect(() => subscribeToLocalWorkspace(JDG_STORAGE_KEY, () => {
    setJdgWorkspace(loadJdgWorkspace());
  }), []);

  useEffect(() => subscribeToLocalWorkspace(TRAVEL_STORAGE_KEY, () => {
    setTravelWorkspace(loadTravelWorkspace());
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
      .sort((a, b) => {
        if (!a.dueDate) return b.dueDate ? 1 : a.title.localeCompare(b.title, "pl");
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
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

  const subscriptionCategories = useMemo(
    () => [...new Set(workspace.subscriptions.map((subscription) => subscription.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pl")),
    [workspace.subscriptions],
  );

  const filteredSubscriptions = useMemo(
    () => workspace.subscriptions.filter((subscription) => (
      subscriptionCategoryFilter === "all" || subscription.category === subscriptionCategoryFilter
    )),
    [subscriptionCategoryFilter, workspace.subscriptions],
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

  const attentionItems = useMemo(
    () => buildAffairAttentionItems(workspace, jdgWorkspace, travelWorkspace),
    [jdgWorkspace, travelWorkspace, workspace],
  );
  const agendaItems = useMemo(() => {
    if (view === "all") return attentionItems;
    return attentionItems.filter((item) => {
      const days = daysUntil(item.dueDate);
      return view === "today" ? days <= 0 : days >= 0 && days <= 7;
    });
  }, [attentionItems, view]);
  const todayAttentionCount = useMemo(
    () => attentionItems.filter((item) => daysUntil(item.dueDate) <= 0).length,
    [attentionItems],
  );
  const weekAttentionCount = useMemo(
    () => attentionItems.filter((item) => {
      const days = daysUntil(item.dueDate);
      return days >= 0 && days <= 7;
    }).length,
    [attentionItems],
  );
  const dueSoon = attentionItems.length;

  const openMatterEditor = (matter?: Matter) => {
    setDraft(matter ? {
      ...EMPTY_DRAFT,
      title: matter.title,
      category: matter.category,
      priority: matter.priority,
      status: matter.status,
      dueDate: matter.dueDate,
      note: matter.note,
      matterKind: matter.kind ?? "task",
      time: matter.time ?? "",
      location: matter.location ?? "",
      reminderPreset: reminderPresetFromMinutes(matter.reminderMinutes),
      sourceAttentionKey: matter.sourceAttentionKey ?? "",
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
    const initialTime = params.get("godzina") ?? "";
    if (action === "nowa-sprawa") {
      setView("all");
      setDraft({
        ...EMPTY_DRAFT,
        title: initialTitle,
        dueDate: initialDate,
        priority: initialPriority,
        matterKind: initialTime ? "appointment" : "task",
        time: initialTime,
        reminderPreset: initialTime ? "day-and-two-hours" : "none",
      });
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

    const nextWorkspace = editor.kind === "matter" && editor.mode === "add" && draft.sourceAttentionKey
      ? setAffairAttentionState(submission.nextWorkspace, {
          key: draft.sourceAttentionKey,
          status: "resolved",
          snoozedUntil: "",
          updatedAt: new Date().toISOString(),
        })
      : submission.nextWorkspace;
    setWorkspace(nextWorkspace);
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
        <span className="affairs-payment-row__icon"><ReceiptText size={13} /></span>
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
            leadingIcon={payment.paid ? <RefreshCw size={13} /> : <Check size={13} />}
            onClick={() => toggleOneTimePayment(payment.id)}
          >
            {payment.paid ? "Przywróć" : "Opłacone"}
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.title}`} onClick={() => openOneTimeEditor(payment)}><Pencil size={13} /></Button>
          <Button
            variant="ghost"
                          className="ui-button--ghost-danger"
            size="sm"
            iconOnly
            aria-label={`Usuń ${payment.title}`}
            onClick={() => setDeleteState({ kind: "oneTime", id: payment.id, label: payment.title })}
          >
            <Trash2 size={13} />
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
    if (nextView !== "all") setSelectedMatterId("");
    const url = new URL(window.location.href);
    if (nextView === "today") {
      url.searchParams.delete("widok");
    } else {
      url.searchParams.set("widok", nextView);
    }
    if (url.href !== window.location.href) {
      window.history.pushState({}, "", url);
    }
  };

  const openAttentionSource = (item: AffairAttentionItem) => {
    selectView(item.view);
    if (item.kind === "matter") setSelectedMatterId(item.sourceId);
  };

  const scheduleAttention = (item: AffairAttentionItem) => {
    const category: MatterCategory = item.kind === "document"
      ? "dokumenty"
      : item.kind === "vehicle"
        ? "auto"
        : ["oneTime", "payment", "subscription", "jdg"].includes(item.kind)
          ? "finanse"
          : "dom";
    selectView("all");
    setDraft({
      ...EMPTY_DRAFT,
      title: item.title,
      category,
      dueDate: item.dueDate,
      note: `Źródło: ${item.meta}`,
      matterKind: item.time ? "appointment" : "task",
      time: item.time,
      reminderPreset: item.time ? "day-and-two-hours" : "none",
      sourceAttentionKey: item.key,
    });
    setEditorError("");
    setEditor({ kind: "matter", mode: "add" });
  };

  const snoozeAttention = (item: AffairAttentionItem) => {
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + 7);
    setWorkspace((current) => setAffairAttentionState(current, {
      key: item.key,
      status: "snoozed",
      snoozedUntil: snoozedUntil.toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    }));
  };

  const resolveAttention = (item: AffairAttentionItem) => {
    const resolved = resolveAffairAttentionItem(workspace, jdgWorkspace, travelWorkspace, item);
    setWorkspace(resolved.affairs);
    if (resolved.jdg !== jdgWorkspace) {
      setJdgWorkspace(resolved.jdg);
      if (!saveJdgWorkspace(resolved.jdg)) setStorageError(true);
    }
    if (resolved.travel !== travelWorkspace) {
      setTravelWorkspace(resolved.travel);
      if (!saveTravelWorkspace(resolved.travel)) setStorageError(true);
    }
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
    if (itemView === "today") return todayAttentionCount || undefined;
    if (itemView === "week") return weekAttentionCount || undefined;
    if (itemView === "all") return activeMatters.length;
    if (itemView === "oneTime") return workspace.oneTimePayments.filter((item) => !item.paid).length;
    if (itemView === "payments") return workspace.payments.filter((item) => item.active).length;
    if (itemView === "subscriptions") return workspace.subscriptions.filter((item) => item.active).length;
    if (itemView === "documents") return documentAlerts || undefined;
    if (itemView === "vehicles") return vehicleAlerts || undefined;
    return undefined;
  };

  const mobileViewOptions = NAV_ITEMS.map((item) => (
    item.view === "today"
      ? { value: item.view, label: item.label, description: "Terminy wymagające uwagi dzisiaj" }
      : { value: item.view, label: item.label }
  ));
  const viewArchetype = AFFAIRS_VIEW_ARCHETYPE[view];

  const contextSidebar = (
    <ModuleSidebar label="Widoki spraw" className="affairs-sidebar">
      <nav className="affairs-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <ContextNavGroup key={group.label} label={group.label}>
            {group.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <ContextNavItem
                  key={item.view}
                  active={view === item.view}
                  icon={<ItemIcon />}
                  label={item.label}
                  meta={navMeta(item.view)}
                  onClick={() => selectView(item.view)}
                />
              );
            })}
          </ContextNavGroup>
        ))}
      </nav>
      <div className="affairs-sidebar__footer">
        <Clock3 size={13} aria-hidden="true" />
        <span>{pluralize(dueSoon, "wpis wymaga uwagi", "wpisy wymagają uwagi", "wpisów wymaga uwagi")}</span>
      </div>
    </ModuleSidebar>
  );

  const detailPanel = selectedMatter && view === "all" ? (
    <DetailPanel
      label={`Szczegóły: ${selectedMatter.title}`}
      className="affairs-detail"
      onDismiss={() => setSelectedMatterId("")}
    >
      <header className="affairs-detail__header">
        <div>
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
          {selectedMatter.kind === "appointment" && <Badge tone="neutral"><CalendarClock size={11} /> Wizyta</Badge>}
          {selectedMatter.priority === "high" && <Badge tone="danger">Ważna</Badge>}
        </div>
        <dl className="affairs-detail__facts">
          <div><dt>Obszar</dt><dd>{CATEGORY_META[selectedMatter.category].label}</dd></div>
          <div><dt>{selectedMatter.kind === "appointment" ? "Wizyta" : "Termin"}</dt><dd>{selectedMatter.dueDate ? formatDate(selectedMatter.dueDate) : "Bez terminu"}{selectedMatter.time ? ` · ${selectedMatter.time}` : ""}</dd></div>
          {selectedMatter.location && <div><dt>Miejsce</dt><dd>{selectedMatter.location}</dd></div>}
          {selectedMatter.kind === "appointment" && (
            <div><dt>Powiadomienia</dt><dd>{selectedMatter.reminderMinutes?.length ? "Włączone" : "Wyłączone"}</dd></div>
          )}
          <div><dt>Dodano</dt><dd>{formatPolishDate(selectedMatter.createdAt)}</dd></div>
        </dl>
        <section className="affairs-detail__note">
          <h3>Notatka</h3>
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
        mobileNavigation={(
          <Select
            compact
            aria-label="Wybierz widok spraw"
            fieldClassName="context-mobile-select affairs-mobile-view-select"
            value={view}
            options={mobileViewOptions}
            onChange={(event) => selectView(event.target.value as AffairsView)}
          />
        )}
        layout={(content) => (
          <ModuleShell
            contextSidebar={contextSidebar}
            className="affairs-module affairs-module--workspace affairs-module--view-jdg"
            data-affairs-archetype="workspace"
            pageWidth="wide"
            ambient={{
              scene: "affairs",
              progress: workspace.matters.length
                ? workspace.matters.filter((matter) => matter.status === "done").length / workspace.matters.length
                : 0,
              signal: dueSoon,
            }}
          >
            <ModuleMain className="affairs-main affairs-main--workspace affairs-main--jdg" transitionKey={view}>{content}</ModuleMain>
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
        layout={(content) => (
          <ModuleShell
            contextSidebar={contextSidebar}
            className="affairs-module affairs-module--workspace affairs-module--view-travel affairs-module--travel"
            data-affairs-archetype="workspace"
            pageWidth="wide"
            ambient={{ scene: "travel", progress: 0, signal: dueSoon }}
          >
            {content}
          </ModuleShell>
        )}
      />
    );
  }

  return (
    <ModuleShell
      contextSidebar={contextSidebar}
      detailPanel={detailPanel}
      className={`affairs-module affairs-module--${viewArchetype} affairs-module--view-${view}`}
      data-affairs-archetype={viewArchetype}
      pageWidth="wide"
      ambient={{
        scene: "affairs",
        progress: workspace.matters.length
          ? workspace.matters.filter((matter) => matter.status === "done").length / workspace.matters.length
          : 0,
        signal: dueSoon,
      }}
    >
      <ModuleMain className={`affairs-main affairs-main--${viewArchetype}`} transitionKey={view}>
        <ContentHeader
          headingLevel={1}
          className={`affairs-toolbar affairs-toolbar--${viewArchetype} ${view === "today" || view === "week" || view === "budget" ? "affairs-toolbar--compact" : ""}`.trim()}
          title={NAV_ITEMS.find((item) => item.view === view)?.label ?? "Sprawy"}
          description={VIEW_COPY[view].description}
          meta={storageError ? <Badge tone="danger">Brak zapisu lokalnego</Badge> : undefined}
          mobileNavigation={<Select
            compact
            aria-label="Wybierz widok spraw"
            fieldClassName="context-mobile-select affairs-mobile-view-select"
            value={view}
            options={mobileViewOptions}
            onChange={(event) => selectView(event.target.value as AffairsView)}
          />}
          actions={<>
          {view === "all" && (
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
            <>
              <Select
                compact
                aria-label="Filtr kategorii subskrypcji"
                value={subscriptionCategoryFilter}
                options={[
                  { value: "all", label: "Wszystkie kategorie" },
                  ...subscriptionCategories.map((category) => ({ value: category, label: category })),
                ]}
                onChange={(event) => setSubscriptionCategoryFilter(event.target.value)}
              />
              <span className="affairs-toolbar__context">
                <CreditCard size={13} aria-hidden="true" />
                Aktywne <SensitiveValue label="Miesięczna kwota subskrypcji">{formatMoney(monthlySubscriptionTotal)}</SensitiveValue> / mies.
              </span>
            </>
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
              {pluralize(workspace.vehicles.length, "pojazd", "pojazdy", "pojazdów")} · {pluralize(vehicleAlerts, "bliski termin", "bliskie terminy", "bliskich terminów")}
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

        <div className={`affairs-canvas affairs-canvas--${viewArchetype} affairs-canvas--${view}`}>
          {(view === "today" || view === "week") && (
            <div className="affairs-overview">
              <SectionSurface className="affairs-agenda affairs-section-surface affairs-section-surface--agenda" aria-labelledby="affairs-radar-heading">
                <header className="affairs-section-heading">
                  <div>
                    <h2 id="affairs-radar-heading">{view === "today" ? "Dzisiejsze terminy" : "Terminy w tym tygodniu"}</h2>
                    <p>{view === "today" ? "Zaległe i dzisiejsze terminy wymagające reakcji" : "Najbliższe terminy, żeby tydzień był pod kontrolą"}</p>
                  </div>
                  <span className={`affairs-section-heading__meta ${agendaItems.length ? "is-warning" : ""}`}>
                    {pluralize(agendaItems.length, "termin", "terminy", "terminów")}
                  </span>
                </header>
                {agendaItems.length === 0 ? (
                  <EmptyState icon={<Archive size={18} />} title="Wszystko dopilnowane" description="Nie ma teraz żadnych terminów wymagających reakcji." />
                ) : (
                  <div className="affairs-agenda__list">
                    {agendaItems.map((item) => {
                      const due = dueCopy(item.dueDate);
                      const UpcomingIcon = UPCOMING_ICONS[item.kind as keyof typeof UPCOMING_ICONS];
                      return (
                        <div key={item.key} className={`affairs-agenda-row affairs-agenda-row--${item.kind}`}>
                          <button type="button" className="affairs-agenda-row__main" onClick={() => openAttentionSource(item)}>
                            <span className={`affairs-agenda-row__icon affairs-agenda-row__icon--${item.kind}`}>
                              <UpcomingIcon size={13} />
                            </span>
                            <span className="affairs-agenda-row__copy">
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                            </span>
                          </button>
                          {item.amount !== null && (
                            <span className="affairs-agenda-row__amount">
                              <SensitiveValue label={`Kwota: ${item.title}`}>{formatMoney(item.amount)}</SensitiveValue>
                            </span>
                          )}
                          <Badge tone={due.tone}>{due.text}</Badge>
                          <span className="affairs-agenda-row__actions">
                            {item.canSchedule && (
                              <Button variant="ghost" size="sm" iconOnly title="Zaplanuj jako sprawę" aria-label={`Zaplanuj: ${item.title}`} onClick={() => scheduleAttention(item)}>
                                <CalendarClock size={13} />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" iconOnly title="Przypomnij za 7 dni" aria-label={`Przypomnij za 7 dni: ${item.title}`} onClick={() => snoozeAttention(item)}>
                              <Bell size={13} />
                            </Button>
                            <Button variant="ghost" size="sm" iconOnly title="Oznacz jako załatwione" aria-label={`Oznacz jako załatwione: ${item.title}`} onClick={() => resolveAttention(item)}>
                              <Check size={13} />
                            </Button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionSurface>
            </div>
          )}

          {view === "all" && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--plan" aria-label="Lista spraw">
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
                      <strong>{matter.kind === "appointment" && <CalendarClock size={13} aria-hidden="true" />}{matter.title}</strong>
                      <small>
                        {matter.kind === "appointment"
                          ? <><span>{matter.time || "Bez godziny"}</span>{matter.location && <><span aria-hidden="true"> · </span><span><MapPin size={10} aria-hidden="true" /> {matter.location}</span></>}</>
                          : matter.note || "Bez dodatkowej notatki"}
                      </small>
                    </button>
                    <span className="affairs-matter-row__category"><CategoryIcon size={13} />{CATEGORY_META[matter.category].label}</span>
                    <Badge tone={due.tone}>{due.text}</Badge>
                    <Badge tone={matter.status === "done" ? "success" : matter.status === "waiting" ? "warning" : matter.priority === "high" ? "danger" : "primary"} dot>
                      {STATUS_LABELS[matter.status]}
                    </Badge>
                    <AddToTasksButton compact input={{
                      source: { kind: "affairs", entity: `${encodeURIComponent(matter.id)}/matter`, context: "Sprawy", href: "/sprawy?widok=all" },
                      text: matter.title,
                      done: matter.status === "done",
                      calendarDate: matter.dueDate || undefined,
                      date: matter.dueDate || undefined,
                      time: matter.time || undefined,
                      priority: matter.priority === "normal" ? undefined : matter.priority,
                      list: "sprawy",
                      tags: ["sprawy"],
                      notes: matter.note,
                    }} />
                  </div>
                );
              })}
            </SectionSurface>
          )}

          {view === "oneTime" && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--one-time" aria-label="Płatności jednorazowe">
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
                      <span className="affairs-payment-row__icon"><ReceiptText size={13} /></span>
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
                          leadingIcon={payment.paid ? <RefreshCw size={13} /> : <Check size={13} />}
                          onClick={() => toggleOneTimePayment(payment.id)}
                        >
                          {payment.paid ? "Przywróć" : "Opłacone"}
                        </Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.title}`} onClick={() => openOneTimeEditor(payment)}><Pencil size={13} /></Button>
                        <Button
                          variant="ghost"
                          className="ui-button--ghost-danger"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${payment.title}`}
                          onClick={() => setDeleteState({ kind: "oneTime", id: payment.id, label: payment.title })}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </SectionSurface>
          )}

          {view === "payments" && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--payments" aria-label="Płatności cykliczne">
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
                    <span className="affairs-payment-row__icon"><ReceiptText size={13} /></span>
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
                          leadingIcon={<Check size={13} />}
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
                      <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${payment.name}`} onClick={() => openPaymentEditor(payment.id)}><Pencil size={13} /></Button>
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
                        {payment.active ? <Archive size={13} /> : <RefreshCw size={13} />}
                      </Button>
                      <Button
                        variant="ghost"
                          className="ui-button--ghost-danger"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${payment.name}`}
                        onClick={() => setDeleteState({ kind: "payment", id: payment.id, label: payment.name })}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </SectionSurface>
          )}

          {view === "subscriptions" && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--subscriptions" aria-label="Subskrypcje i członkostwa">
              <div className="affairs-ledger__head affairs-ledger__head--payments">
                <span>Subskrypcja</span>
                <span>Cykl</span>
                <span>Następna</span>
                <span>Kwota</span>
                <span />
              </div>
              {filteredSubscriptions.length === 0 ? (
                <EmptyState
                  icon={<CreditCard size={18} />}
                  title={subscriptionCategoryFilter === "all" ? "Brak subskrypcji" : "Brak subskrypcji w tej kategorii"}
                  description={subscriptionCategoryFilter === "all"
                    ? "Dodaj usługę, członkostwo lub umowę, której koszt i odnowienie chcesz kontrolować."
                    : "Wybierz inną kategorię albo dodaj nową subskrypcję."}
                  action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openSubscriptionEditor()}>Dodaj subskrypcję</Button>}
                />
              ) : filteredSubscriptions
                .slice()
                .sort((a, b) => Number(b.active) - Number(a.active) || a.nextBillingDate.localeCompare(b.nextBillingDate))
                .map((subscription) => {
                  const due = dueCopy(subscription.nextBillingDate);
                  return (
                    <div key={subscription.id} className={`affairs-payment-row ${subscription.active ? "" : "is-paused"}`}>
                      <span className="affairs-payment-row__icon"><CreditCard size={13} /></span>
                      <span className="affairs-payment-row__title">
                        <strong>{subscription.name}</strong>
                        <small>
                          <span className="affairs-inline-tag">{subscription.category}</span>
                          <span aria-hidden="true"> · </span>{subscription.renewal === "automatic" ? "odnowienie automatyczne" : "odnowienie ręczne"}
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
                            leadingIcon={<Check size={13} />}
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
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${subscription.name}`} onClick={() => openSubscriptionEditor(subscription)}><Pencil size={13} /></Button>
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
                          {subscription.active ? <Archive size={13} /> : <RefreshCw size={13} />}
                        </Button>
                        <Button
                          variant="ghost"
                          className="ui-button--ghost-danger"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${subscription.name}`}
                          onClick={() => setDeleteState({ kind: "subscription", id: subscription.id, label: subscription.name })}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </SectionSurface>
          )}

          {view === "documents" && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--documents" aria-label="Ważność dokumentów">
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
                      <span className="affairs-payment-row__icon"><FileText size={13} /></span>
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
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${document.name}`} onClick={() => openDocumentEditor(document)}><Pencil size={13} /></Button>
                        <Button
                          variant="ghost"
                          className="ui-button--ghost-danger"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${document.name}`}
                          onClick={() => setDeleteState({ kind: "document", id: document.id, label: document.name })}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </div>
                  );
                })}
            </SectionSurface>
          )}

          {view === "vehicles" && (
            <div className="affairs-vehicle-list">
              {workspace.vehicles.length === 0 ? (
                <SectionSurface className="affairs-section-surface affairs-section-surface--vehicles affairs-vehicle-list__empty">
                  <EmptyState
                    icon={<Car size={18} />}
                    title="Brak pojazdów"
                    description="Dodaj samochód, motocykl lub inny pojazd, aby pilnować OC, przeglądów i serwisu."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}>Dodaj pojazd</Button>}
                  />
                </SectionSurface>
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
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openVehicleItemEditor(vehicle.id, item)}><Pencil size={13} /></Button>
                        <Button
                          variant="ghost"
                          className="ui-button--ghost-danger"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${item.title}`}
                          onClick={() => setDeleteState({ kind: "vehicleItem", id: item.id, label: item.title })}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </span>
                    </div>
                  );
                };
                return (
                  <SectionSurface key={vehicle.id} className="affairs-vehicle affairs-section-surface affairs-section-surface--vehicles">
                    <header className="affairs-vehicle__header">
                      <span className="affairs-vehicle__mark"><Car size={18} /></span>
                      <div>
                        <h2>{vehicle.name}</h2>
                        <p>{vehicle.registration || "Bez numeru rejestracyjnego"} · {formatMileage(vehicle.mileage)}</p>
                      </div>
                      <span className="affairs-vehicle__actions">
                        <Button variant="quiet" size="sm" leadingIcon={<Plus size={13} />} onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj termin</Button>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${vehicle.name}`} onClick={() => openVehicleEditor(vehicle)}><Pencil size={13} /></Button>
                        <Button
                          variant="ghost"
                          className="ui-button--ghost-danger"
                          size="sm"
                          iconOnly
                          aria-label={`Usuń ${vehicle.name}`}
                          onClick={() => setDeleteState({ kind: "vehicle", id: vehicle.id, label: vehicle.name })}
                        >
                          <Trash2 size={13} />
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
                                <Button variant="ghost" size="sm" iconOnly aria-label={`Edytuj ${item.title}`} onClick={() => openVehicleItemEditor(vehicle.id, item)}><Pencil size={13} /></Button>
                                <Button
                                  variant="ghost"
                          className="ui-button--ghost-danger"
                                  size="sm"
                                  iconOnly
                                  aria-label={`Usuń ${item.title}`}
                                  onClick={() => setDeleteState({ kind: "vehicleItem", id: item.id, label: item.title })}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SectionSurface>
                );
              })}
            </div>
          )}

          {view === "budget" && (
            <div className="affairs-budget">
              <SummaryStrip
                label="Podsumowanie budżetu"
                className="affairs-budget__summary"
                items={[
                  { label: "Planowane wpływy", value: <SensitiveValue label="Planowane wpływy">{formatMoney(budgetSummary.income)}</SensitiveValue>, note: "miesiąc" },
                  { label: "Przydzielone", value: <SensitiveValue label="Przydzielona kwota">{formatMoney(budgetSummary.plannedOut)}</SensitiveValue>, note: "plan" },
                  { label: "Rzeczywiste wydatki", value: <SensitiveValue label="Rzeczywiste wydatki">{formatMoney(budgetSummary.actualOut)}</SensitiveValue>, note: "wykonanie" },
                  { label: "Rzeczywiście zostaje", value: <SensitiveValue label="Pozostała kwota">{formatMoney(budgetSummary.actualAvailable)}</SensitiveValue>, note: "po wydatkach", tone: budgetSummary.actualAvailable < 0 ? "danger" : "success" },
                ]}
              />
              <SectionSurface className="affairs-budget-table affairs-section-surface affairs-section-surface--budget">
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
                      <label data-label="Plan">
                        <span className="ui-sr-only">Plan dla {line.label}</span>
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
                      <label data-label="Rzeczywiście">
                        <span className="ui-sr-only">Kwota rzeczywista dla {line.label}</span>
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
                          className="ui-button--ghost-danger"
                        size="sm"
                        iconOnly
                        aria-label={`Usuń ${line.label}`}
                        onClick={() => setDeleteState({ kind: "budget", id: line.id, label: line.label })}
                      >
                        <Trash2 size={13} />
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
              </SectionSurface>
            </div>
          )}
        </div>
      </ModuleMain>

      {editor && (
        <Modal
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
