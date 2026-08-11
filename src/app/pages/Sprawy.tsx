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
  CalendarOff,
  Car,
  ChevronRight,
  Check,
  Clock3,
  CreditCard,
  FileText,
  HeartPulse,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { SensitiveValue } from "../experience/preferences";
import { recordActivity } from "../experience/activityLog";
import { subscribeToLocalWorkspace } from "../data/localRepository";
import { formatDate as formatPolishDate, pluralize } from "../formatters";
import {
  AFFAIRS_STORAGE_KEY,
  advancePaymentDateToFuture,
  loadAffairsWorkspace,
  saveAffairsWorkspace,
  setAffairAttentionState,
  setMatterCompletionState,
  setOneTimePaymentPaidState,
  type DocumentRecord,
  type Matter,
  type MatterCategory,
  type OneTimePayment,
  type Subscription,
  type Vehicle,
  type VehicleItem,
  monthlyEquivalent,
} from "../data/affairsWorkspace";
import {
  HEALTH_STORAGE_KEY,
  loadHealthWorkspace,
  saveHealthWorkspace,
  type HealthWorkspace,
} from "../data/healthWorkspace";
import { JDG_STORAGE_KEY, loadJdgWorkspace, saveJdgWorkspace } from "../data/jdgWorkspace";
import { TRAVEL_STORAGE_KEY, loadTravelWorkspace, saveTravelWorkspace } from "../data/travelWorkspace";
import { AffairsEditorFields } from "../affairs/AffairsEditorFields";
import { applyAffairsEditor } from "../affairs/affairsMutations";
import { buildAffairAttentionItems, resolveAffairAttentionItem, type AffairAttentionItem } from "../affairs/affairsAttention";
import { readSessionDraft, useDraftProtection } from "../ui/hooks/useDraftProtection";
import { JdgWorkspace } from "./Jdg";
import { HealthWorkspace as HealthArea } from "../health/HealthWorkspace";
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
  Menu,
  MenuItem,
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
  getAffairsEditorDraftKey,
  getEditorPresentation,
  getInitialView,
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
  const [healthWorkspace, setHealthWorkspace] = useState<HealthWorkspace>(loadHealthWorkspace);
  const [view, setView] = useState<AffairsView>(getInitialView);
  const [subscriptionCategoryFilter, setSubscriptionCategoryFilter] = useState("all");
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [financeAddOpen, setFinanceAddOpen] = useState(false);
  const financeAddButtonRef = useRef<HTMLButtonElement>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editorBaseline, setEditorBaseline] = useState<Draft>(EMPTY_DRAFT);
  const draftSnapshotRef = useRef(draft);
  draftSnapshotRef.current = draft;
  const [editorError, setEditorError] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const editorDraftKey = getAffairsEditorDraftKey(editor);

  useEffect(() => {
    if (!editorDraftKey) return;
    const baseline = draftSnapshotRef.current;
    setEditorBaseline(baseline);
    const recovered = readSessionDraft<Partial<Draft>>(editorDraftKey);
    if (recovered && typeof recovered === "object") setDraft({ ...baseline, ...recovered });
  }, [editorDraftKey]);

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

  useEffect(() => subscribeToLocalWorkspace(HEALTH_STORAGE_KEY, () => {
    setHealthWorkspace(loadHealthWorkspace());
  }), []);

  useEffect(() => {
    const requestedView = new URLSearchParams(location.search).get("widok");
    if (requestedView === "travel") {
      navigate("/podroze", { replace: true });
      return;
    }
    const canonicalView = getInitialView();
    setView(canonicalView);
    const params = new URLSearchParams(location.search);
    const canonicalParam = canonicalView === "overview" ? null : canonicalView;
    if (requestedView === canonicalParam) return;
    if (canonicalParam) params.set("widok", canonicalParam);
    else params.delete("widok");
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

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

  const selectedMatter = workspace.matters.find((matter) => matter.id === selectedMatterId);

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
  const orderedDocuments = useMemo(() => workspace.documents
    .slice()
    .sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt.localeCompare(b.expiresAt);
    }), [workspace.documents]);
  const documentsRequiringAttention = orderedDocuments.filter((document) => {
    const tone = documentDueCopy(document).tone;
    return tone === "danger" || tone === "warning";
  });
  const hasExpiredDocuments = documentsRequiringAttention.some((document) => documentDueCopy(document).tone === "danger");
  const stableDocuments = orderedDocuments.filter((document) => !documentsRequiringAttention.includes(document));

  const vehicleAlerts = workspace.vehicleItems.filter((item) => {
    if (item.done) return false;
    const vehicle = workspace.vehicles.find((candidate) => candidate.id === item.vehicleId);
    const dateNear = item.dueDate ? daysUntil(item.dueDate) <= 30 : false;
    const mileageNear = item.dueMileage !== null && vehicle
      ? item.dueMileage <= vehicle.mileage + 1_000
      : false;
    return dateNear || mileageNear;
  }).length;

  const attentionItems = useMemo(
    () => buildAffairAttentionItems(workspace, jdgWorkspace, travelWorkspace, new Date(), null, healthWorkspace),
    [healthWorkspace, jdgWorkspace, travelWorkspace, workspace],
  );
  const undatedMatterItems = useMemo<AffairAttentionItem[]>(() => workspace.matters
    .filter((matter) => matter.status !== "done" && !matter.dueDate)
    .map((matter) => ({
      key: `matter:${matter.id}:undated`,
      sourceId: matter.id,
      kind: "matter",
      view: "all",
      title: matter.title,
      meta: matter.note || "Sprawa bez terminu",
      dueDate: "",
      time: matter.time ?? "",
      amount: null,
      canSchedule: false,
    })), [workspace.matters]);
  const agendaItems = useMemo(() => {
    if (view === "all") return [...attentionItems, ...undatedMatterItems];
    return attentionItems.filter((item) => {
      const days = daysUntil(item.dueDate);
      return view === "today" ? days <= 0 : days >= 0 && days <= 7;
    });
  }, [attentionItems, undatedMatterItems, view]);
  const agendaGroups = useMemo(() => {
    const groups = {
      overdue: [] as AffairAttentionItem[],
      soon: [] as AffairAttentionItem[],
      later: [] as AffairAttentionItem[],
      undated: [] as AffairAttentionItem[],
    };

    agendaItems.forEach((item) => {
      if (!item.dueDate) {
        groups.undated.push(item);
        return;
      }
      const days = daysUntil(item.dueDate);
      if (days < 0) groups.overdue.push(item);
      else if (days <= 7) groups.soon.push(item);
      else groups.later.push(item);
    });

    return [
      { id: "overdue", label: "Po terminie", description: "Zaległe terminy wymagające decyzji.", tone: "danger" as const, icon: Bell, items: groups.overdue },
      { id: "soon", label: "Najbliższe", description: "Dzisiaj i kolejne 7 dni.", tone: "warning" as const, icon: CalendarClock, items: groups.soon },
      { id: "later", label: "W przyszłości", description: "Terminy późniejsze niż 7 dni.", tone: "neutral" as const, icon: Clock3, items: groups.later },
      { id: "undated", label: "Bez daty", description: "Do zaplanowania, gdy termin będzie znany.", tone: "neutral" as const, icon: CalendarOff, items: groups.undated },
    ].filter((group) => group.items.length > 0);
  }, [agendaItems]);
  const agendaHeadingTone = agendaItems.some((item) => item.dueDate && daysUntil(item.dueDate) < 0)
    ? "danger"
    : agendaItems.some((item) => item.dueDate && daysUntil(item.dueDate) <= 7)
      ? "warning"
      : "neutral";
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
  const healthOpenCount = healthWorkspace.entries.filter((entry) => entry.status !== "done").length;
  const healthDueCount = healthWorkspace.entries.filter((entry) => {
    if (entry.status === "done" || !entry.dueDate) return false;
    const days = daysUntil(entry.dueDate);
    return days <= 30;
  }).length;
  const isFinanceView = view === "finances" || view === "finance-one-time" || view === "finance-recurring";

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("akcja");
    const targetView: AffairsView | null = action === "nowa-sprawa"
      ? "all"
      : action === "nowa-platnosc" || action === "nowy-wydatek"
        ? "finances"
        : null;
    if (!targetView) return;

    const initialTitle = params.get("tytul")?.trim() ?? "";
    const initialDate = params.get("data") ?? "";
    const initialPriority = params.get("priorytet") === "high" ? "high" : "normal";
    const initialTime = params.get("godzina") ?? "";
    setView(targetView);
    if (action === "nowa-sprawa") {
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
      setDraft({ ...EMPTY_DRAFT, title: initialTitle, dueDate: initialDate, category: "Rachunki" });
      setEditorError("");
      setEditor({ kind: "payment", mode: "add" });
    } else {
      setDraft({ ...EMPTY_DRAFT, title: initialTitle, dueDate: initialDate, category: "Inne" });
      setEditorError("");
      setEditor({ kind: "oneTime", mode: "add" });
    }

    ["akcja", "tytul", "data", "godzina", "priorytet"].forEach((key) => params.delete(key));
    params.set("widok", targetView);
    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : "",
    }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const closeEditor = () => {
    setEditor(null);
    setEditorError("");
  };
  const editorDraftProtection = useDraftProtection({
    active: Boolean(editor),
    isDirty: Boolean(editor) && JSON.stringify(draft) !== JSON.stringify(editorBaseline),
    draft,
    storageKey: editorDraftKey,
    onDiscard: closeEditor,
  });

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;

    const submission = applyAffairsEditor({
      editor,
      draft,
      workspace,
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
    editorDraftProtection.clearDraft();
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
      return current;
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
            source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/one-time`, context: "Finanse", href: "/sprawy?widok=finance-one-time" },
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

  const renderDocumentRow = (document: DocumentRecord) => {
    const due = documentDueCopy(document);
    return (
      <article key={document.id} className={`affairs-document-row affairs-document-row--${document.category} is-${due.tone}`}>
        <span className="affairs-document-row__identity">
          <span className="affairs-payment-row__icon affairs-document-row__icon"><FileText size={13} /></span>
          <span>
            <strong>{document.name}</strong>
            <small>{document.holder} · {document.note || "Bez dodatkowej notatki"}</small>
          </span>
        </span>
        <span className="affairs-document-row__type">{DOCUMENT_LABELS[document.category]}</span>
        <span className="affairs-document-row__date">
          <strong>{document.expiresAt ? formatDate(document.expiresAt) : "Bezterminowy"}</strong>
          <small>{document.expiresAt ? `Alarm ${document.reminderDays} dni wcześniej` : "Bez przypomnienia"}</small>
        </span>
        <Badge tone={due.tone}>{due.text}</Badge>
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
      </article>
    );
  };

  const selectView = (nextView: AffairsView) => {
    setView(nextView);
    if (nextView !== "all") setSelectedMatterId("");
    const params = new URLSearchParams(location.search);
    if (nextView === "overview") {
      params.delete("widok");
    } else {
      params.set("widok", nextView);
    }
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
  };

  const openAttentionSource = (item: AffairAttentionItem) => {
    if (item.view === "travel") {
      navigate(item.containerId
        ? `/podroze/${encodeURIComponent(item.containerId)}?sekcja=tasks`
        : "/podroze");
      return;
    }
    selectView(item.view);
    if (item.kind === "matter") setSelectedMatterId(item.sourceId);
  };

  const scheduleAttention = (item: AffairAttentionItem) => {
    const category: MatterCategory = item.kind === "document"
      ? "dokumenty"
      : item.kind === "vehicle"
        ? "auto"
        : item.kind === "health"
          ? "zdrowie"
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
    const resolved = resolveAffairAttentionItem(workspace, jdgWorkspace, travelWorkspace, item, new Date(), healthWorkspace);
    setWorkspace(resolved.affairs);
    if (resolved.jdg !== jdgWorkspace) {
      setJdgWorkspace(resolved.jdg);
      if (!saveJdgWorkspace(resolved.jdg)) setStorageError(true);
    }
    if (resolved.travel !== travelWorkspace) {
      setTravelWorkspace(resolved.travel);
      if (!saveTravelWorkspace(resolved.travel)) setStorageError(true);
    }
    if (resolved.health && resolved.health !== healthWorkspace) {
      setHealthWorkspace(resolved.health);
      if (!saveHealthWorkspace(resolved.health)) setStorageError(true);
    }
  };

  const renderAgendaRow = (item: AffairAttentionItem) => {
    const due = dueCopy(item.dueDate);
    const UpcomingIcon = UPCOMING_ICONS[item.kind as keyof typeof UPCOMING_ICONS];
    const days = item.dueDate ? daysUntil(item.dueDate) : Number.POSITIVE_INFINITY;
    const timeState = !item.dueDate ? "undated" : days < 0 ? "overdue" : days <= 7 ? "soon" : "later";
    return (
      <div key={item.key} className={`affairs-agenda-row affairs-agenda-row--time-${timeState}`}>
        <button type="button" className="affairs-agenda-row__main" onClick={() => openAttentionSource(item)}>
          <span className="affairs-agenda-row__icon">
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
  };

  const renderPrimaryAction = () => {
    if (isFinanceView) {
      return (
        <div className="affairs-finance-add">
          <Button
            ref={financeAddButtonRef}
            variant="primary"
            className="ui-button--icon-mobile"
            leadingIcon={<Plus size={13} />}
            aria-haspopup="menu"
            aria-expanded={financeAddOpen}
            aria-controls="affairs-finance-add-menu"
            onClick={() => setFinanceAddOpen((current) => !current)}
          >
            <span className="header-action-label">Dodaj płatność</span>
          </Button>
          {financeAddOpen && (
            <Menu
              id="affairs-finance-add-menu"
              triggerRef={financeAddButtonRef}
              onDismiss={() => setFinanceAddOpen(false)}
              size="wide"
              className="affairs-finance-add__menu"
            >
              <MenuItem leadingIcon={<ReceiptText size={13} />} onClick={() => { setFinanceAddOpen(false); openOneTimeEditor(); }}>Jednorazowa</MenuItem>
              <MenuItem leadingIcon={<RefreshCw size={13} />} onClick={() => { setFinanceAddOpen(false); openPaymentEditor(); }}>Cykliczna</MenuItem>
              <MenuItem leadingIcon={<CreditCard size={13} />} onClick={() => { setFinanceAddOpen(false); openSubscriptionEditor(); }}>Subskrypcja</MenuItem>
            </Menu>
          )}
        </div>
      );
    }
    if (view === "documents") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}><span className="header-action-label">Dodaj dokument</span></Button>;
    }
    if (view === "vehicles") {
      return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openVehicleEditor()}><span className="header-action-label">Dodaj pojazd</span></Button>;
    }
    return <Button variant="primary" className="ui-button--icon-mobile" leadingIcon={<Plus size={13} />} onClick={() => openMatterEditor()}><span className="header-action-label">Dodaj sprawę</span></Button>;
  };

  const navMeta = (itemView: AffairsView) => {
    if (itemView === "overview") return undefined;
    if (itemView === "today") return todayAttentionCount || undefined;
    if (itemView === "week") return weekAttentionCount || undefined;
    if (itemView === "all") return attentionItems.length + undatedMatterItems.length;
    if (itemView === "finances") return workspace.oneTimePayments.filter((item) => !item.paid).length
      + workspace.payments.filter((item) => item.active).length
      + workspace.subscriptions.filter((item) => item.active).length;
    if (itemView === "finance-one-time") return workspace.oneTimePayments.filter((item) => !item.paid).length || undefined;
    if (itemView === "finance-recurring") return workspace.payments.filter((item) => item.active).length
      + workspace.subscriptions.filter((item) => item.active).length;
    if (itemView === "documents") return documentAlerts || undefined;
    if (itemView === "vehicles") return vehicleAlerts || undefined;
    if (itemView === "health") return healthDueCount || undefined;
    return undefined;
  };

  const mobileViewOptions = NAV_ITEMS.map((item) => {
    if (item.view === "overview") return { value: item.view, label: item.label, description: "Najważniejsze sygnały z całego modułu" };
    if (item.view === "today") return { value: item.view, label: item.label, description: "Terminy wymagające uwagi dzisiaj" };
    if (item.view === "finances") return { value: item.view, label: "Finanse — przegląd" };
    if (item.view === "finance-one-time") return { value: item.view, label: "Finanse — jednorazowe" };
    if (item.view === "finance-recurring") return { value: item.view, label: "Finanse — cykliczne" };
    return { value: item.view, label: item.label };
  });
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
                  depth={item.depth}
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

  const editorPresentation = getEditorPresentation(editor);

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
          >
            <ModuleMain className="affairs-main affairs-main--workspace affairs-main--jdg" transitionKey={view}>{content}</ModuleMain>
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
    >
      <ModuleMain className={`affairs-main affairs-main--${viewArchetype}`} transitionKey={view}>
        {view === "health" ? (
          <HealthArea
            onWorkspaceChange={setHealthWorkspace}
            mobileNavigation={<Select
              compact
              aria-label="Wybierz widok spraw"
              fieldClassName="context-mobile-select affairs-mobile-view-select"
              value={view}
              options={mobileViewOptions}
              onChange={(event) => selectView(event.target.value as AffairsView)}
            />}
          />
        ) : <>
        <ContentHeader
          headingLevel={1}
          className={`affairs-toolbar affairs-toolbar--${viewArchetype} ${viewArchetype === "agenda" ? "affairs-toolbar--compact" : ""}`.trim()}
          title={VIEW_COPY[view].title}
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
          {isFinanceView && (
            <span className="affairs-toolbar__context">
              <CreditCard size={13} aria-hidden="true" />
              <SensitiveValue label="Miesięczne koszty stałe">{formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)}</SensitiveValue> / mies.
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
              {pluralize(workspace.vehicles.length, "pojazd", "pojazdy", "pojazdów")} · {pluralize(vehicleAlerts, "bliski termin", "bliskie terminy", "bliskich terminów")}
            </span>
          )}
          {renderPrimaryAction()}
          </>}
        />

        <div className={`affairs-canvas affairs-canvas--${viewArchetype} affairs-canvas--${view}`}>
          {view === "overview" && (
            <div className="affairs-overview-home">
              <SectionSurface className="affairs-overview-hero" aria-labelledby="affairs-overview-heading">
                <div>
                  <span className="affairs-overview-hero__icon" aria-hidden="true"><ShieldCheck size={18} /></span>
                  <div>
                    <h2 id="affairs-overview-heading">Na radarze</h2>
                    <p>Jedno spokojne miejsce dla spraw, pieniędzy, rejestrów i ważnych obszarów.</p>
                  </div>
                </div>
                <span className="affairs-overview-hero__status">
                  {attentionItems.length ? `${attentionItems.length} ${attentionItems.length === 1 ? "wpis" : "wpisów"} wymaga uwagi` : "Wszystko dopilnowane"}
                </span>
              </SectionSurface>

              <SummaryStrip
                label="Podsumowanie pozostałych"
                className="affairs-overview-summary"
                items={[
                  { label: "Radar", value: attentionItems.length, note: "najbliższych terminów", tone: attentionItems.length ? "warning" : "success" },
                  { label: "Sprawy", value: workspace.matters.filter((matter) => matter.status !== "done").length, note: "otwartych", tone: "primary" },
                  { label: "Finanse", value: <SensitiveValue label="Jednorazowe do opłacenia">{formatMoney(unpaidOneTimeTotal)}</SensitiveValue>, note: "do opłacenia", tone: unpaidOneTimeTotal ? "warning" : "success" },
                  { label: "Zdrowie", value: healthOpenCount, note: "otwartych terminów", tone: healthDueCount ? "warning" : "neutral" },
                ]}
              />

              <div className="affairs-overview-home__grid">
                <SectionSurface className="affairs-overview-radar" aria-labelledby="affairs-overview-radar-heading">
                  <header className="affairs-overview-panel-heading">
                    <div>
                      <h2 id="affairs-overview-radar-heading">Najbliższe zobowiązania</h2>
                      <p>Terminy z różnych rejestrów ułożone według pilności.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => selectView("today")}>Zobacz sprawy</Button>
                  </header>
                  {attentionItems.length === 0 ? (
                    <EmptyState icon={<Archive size={18} />} title="Nic nie wymaga teraz reakcji" description="Możesz spokojnie przejrzeć jeden z rejestrów albo dodać nową sprawę." />
                  ) : (
                    <div className="affairs-overview-radar__list">
                      {attentionItems.slice(0, 6).map((item) => {
                        const due = dueCopy(item.dueDate);
                        const UpcomingIcon = UPCOMING_ICONS[item.kind as keyof typeof UPCOMING_ICONS];
                        return (
                          <button key={item.key} type="button" className="affairs-overview-radar__row" onClick={() => openAttentionSource(item)}>
                            <span className="affairs-overview-radar__type" aria-hidden="true"><UpcomingIcon size={14} /></span>
                            <span className="affairs-overview-radar__copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
                            <Badge tone={due.tone}>{due.text}</Badge>
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </SectionSurface>

                <div className="affairs-overview-links" aria-label="Główne sekcje Pozostałych">
                  <button type="button" className="affairs-overview-link affairs-overview-link--matters" onClick={() => selectView("all")}>
                    <span className="affairs-overview-link__icon" aria-hidden="true"><ShieldCheck size={16} /></span>
                    <span><strong>Sprawy</strong><small>{workspace.matters.filter((matter) => matter.status !== "done").length} otwartych spraw · {todayAttentionCount} dziś</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="affairs-overview-link affairs-overview-link--finance" onClick={() => selectView("finances")}>
                    <span className="affairs-overview-link__icon" aria-hidden="true"><CreditCard size={16} /></span>
                    <span><strong>Finanse</strong><small>{workspace.payments.filter((payment) => payment.active).length + workspace.subscriptions.filter((subscription) => subscription.active).length} stałych zobowiązań · {formatMoney(monthlyPaymentTotal + monthlySubscriptionTotal)} / mies.</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="affairs-overview-link affairs-overview-link--registers" onClick={() => selectView("documents")}>
                    <span className="affairs-overview-link__icon" aria-hidden="true"><FileText size={16} /></span>
                    <span><strong>Rejestry</strong><small>{workspace.documents.length} dokumentów · {workspace.vehicles.length} pojazdów</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="affairs-overview-link affairs-overview-link--other" onClick={() => selectView("health")}>
                    <span className="affairs-overview-link__icon" aria-hidden="true"><HeartPulse size={16} /></span>
                    <span><strong>Pozostałe</strong><small>Zdrowie · JDG · {healthDueCount ? `${healthDueCount} bliskich terminów` : "bez pilnych terminów"}</small></span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {(view === "today" || view === "week" || view === "all") && (
            <div className="affairs-overview">
              <SectionSurface className="affairs-agenda affairs-section-surface affairs-section-surface--agenda" aria-labelledby="affairs-radar-heading">
                <header className="affairs-section-heading">
                  <div>
                    <h2 id="affairs-radar-heading">{view === "today" ? "Dzisiejsze terminy" : view === "week" ? "Terminy w tym tygodniu" : "Wszystkie terminy i sprawy"}</h2>
                    <p>{view === "today" ? "Zaległe i dzisiejsze terminy wymagające reakcji" : view === "week" ? "Najbliższe terminy, żeby tydzień był pod kontrolą" : "Zobowiązania pogrupowane według pilności i terminu"}</p>
                  </div>
                  <span className={`affairs-section-heading__meta is-${agendaHeadingTone}`}>
                    {pluralize(agendaItems.length, "termin", "terminy", "terminów")}
                  </span>
                </header>
                {agendaItems.length === 0 ? (
                  <EmptyState icon={<Archive size={18} />} title="Wszystko dopilnowane" description="Nie ma teraz żadnych terminów wymagających reakcji." />
                ) : view === "all" ? (
                  <div className="affairs-agenda__groups">
                    {agendaGroups.map((group) => {
                      const GroupIcon = group.icon;
                      return (
                        <section key={group.id} className={`affairs-agenda-group affairs-agenda-group--${group.id}`} aria-labelledby={`affairs-agenda-group-${group.id}`}>
                          <header className="affairs-agenda-group__header">
                            <span className="affairs-agenda-group__icon" aria-hidden="true"><GroupIcon size={14} /></span>
                            <div>
                              <h3 id={`affairs-agenda-group-${group.id}`}>{group.label}</h3>
                              <p>{group.description}</p>
                            </div>
                            <Badge tone={group.tone}>{group.items.length}</Badge>
                          </header>
                          <div className="affairs-agenda-group__rows">{group.items.map(renderAgendaRow)}</div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="affairs-agenda__list">
                    {agendaItems.map(renderAgendaRow)}
                  </div>
                )}
              </SectionSurface>
            </div>
          )}

          {view === "finances" && (
            <SummaryStrip
              label="Przegląd finansów"
              className="affairs-finance-summary"
              items={[
                { label: "Do opłacenia", value: <SensitiveValue label="Jednorazowe do opłacenia">{formatMoney(unpaidOneTimeTotal)}</SensitiveValue>, note: "jednorazowe", tone: unpaidOneTimeTotal > 0 ? "warning" : "success" },
                { label: "Płatności stałe", value: <SensitiveValue label="Miesięczna kwota płatności stałych">{formatMoney(monthlyPaymentTotal)}</SensitiveValue>, note: "miesięcznie" },
                { label: "Subskrypcje", value: <SensitiveValue label="Miesięczna kwota subskrypcji">{formatMoney(monthlySubscriptionTotal)}</SensitiveValue>, note: "miesięcznie" },
              ]}
            />
          )}

          {(view === "finances" || view === "finance-one-time") && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--one-time" aria-label="Płatności jednorazowe">
              <header className="affairs-register-section__header">
                <div><ReceiptText size={16} aria-hidden="true" /><div><h2>Jednorazowe</h2><p>Opłaty i zobowiązania z jednym terminem.</p></div></div>
                <Badge tone={workspace.oneTimePayments.some((item) => !item.paid) ? "warning" : "success"}>{pluralize(workspace.oneTimePayments.filter((item) => !item.paid).length, "otwarta", "otwarte", "otwartych")}</Badge>
              </header>
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
                            source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/one-time`, context: "Finanse", href: "/sprawy?widok=finance-one-time" },
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

          {(view === "finances" || view === "finance-recurring") && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--payments" aria-label="Płatności cykliczne">
              <header className="affairs-register-section__header">
                <div><RefreshCw size={16} aria-hidden="true" /><div><h2>Rachunki i opłaty</h2><p>Stałe zobowiązania rozliczane w regularnym cyklu.</p></div></div>
                <Badge tone="neutral">{pluralize(workspace.payments.filter((item) => item.active).length, "aktywna", "aktywne", "aktywnych")}</Badge>
              </header>
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
                        <small><span className="affairs-inline-tag">Opłata stała</span><span aria-hidden="true"> · </span>{payment.category} · {payment.automatic ? "automatycznie" : "ręcznie"}</small>
                    </span>
                    <span className="affairs-payment-row__cadence">{CADENCE_LABELS[payment.cadence]}</span>
                    <Badge tone={payment.active ? due.tone : "neutral"}>{payment.active ? due.text : "Wstrzymana"}</Badge>
                    <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${payment.name}`}>{formatMoney(payment.amount)}</SensitiveValue></strong>
                    <span className="affairs-payment-row__actions">
                      <AddToTasksButton compact input={{
                        source: { kind: "affairs", entity: `${encodeURIComponent(payment.id)}/recurring`, context: "Finanse", href: "/sprawy?widok=finance-recurring" },
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

          {(view === "finances" || view === "finance-recurring") && (
            <SectionSurface className="affairs-ledger affairs-section-surface affairs-section-surface--subscriptions" aria-label="Subskrypcje i członkostwa">
              <header className="affairs-register-section__header">
                <div><CreditCard size={16} aria-hidden="true" /><div><h2>Subskrypcje i członkostwa</h2><p>Cykliczne usługi z kosztem, odnowieniem i końcem zobowiązania.</p></div></div>
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
              </header>
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
                          <span className="affairs-inline-tag">Subskrypcja</span>
                          <span aria-hidden="true"> · </span>{subscription.category} · {subscription.renewal === "automatic" ? "odnowienie automatyczne" : "odnowienie ręczne"}
                          {subscription.commitmentEndDate ? ` · umowa do ${formatDate(subscription.commitmentEndDate)}` : ""}
                        </small>
                      </span>
                      <span className="affairs-payment-row__cadence">{CADENCE_LABELS[subscription.cadence]}</span>
                      <Badge tone={subscription.active ? due.tone : "neutral"}>{subscription.active ? due.text : "Wstrzymana"}</Badge>
                      <strong className="affairs-payment-row__amount"><SensitiveValue label={`Kwota: ${subscription.name}`}>{formatMoney(subscription.amount)}</SensitiveValue></strong>
                      <span className="affairs-payment-row__actions">
                        <AddToTasksButton compact input={{
                          source: { kind: "affairs", entity: `${encodeURIComponent(subscription.id)}/subscription`, context: "Finanse", href: "/sprawy?widok=finance-recurring" },
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
            <div className="affairs-register-stack" aria-label="Ważność dokumentów">
              {workspace.documents.length === 0 ? (
                <SectionSurface className="affairs-section-surface affairs-section-surface--documents">
                  <EmptyState
                    icon={<FileText size={18} />}
                    title="Brak dokumentów"
                    description="Dodaj dowód, paszport, prawo jazdy, kartę, polisę, umowę lub gwarancję."
                    action={<Button variant="primary" leadingIcon={<Plus size={13} />} onClick={() => openDocumentEditor()}>Dodaj dokument</Button>}
                  />
                </SectionSurface>
              ) : (
                <>
                  {documentsRequiringAttention.length > 0 && (
                    <SectionSurface className="affairs-document-group affairs-section-surface affairs-section-surface--documents is-attention">
                      <header className="affairs-register-section__header">
                        <div><Bell size={16} aria-hidden="true" /><div><h2>Wymagają uwagi</h2><p>Najpierw odnowienia i kończące się ważności.</p></div></div>
                      <Badge tone={hasExpiredDocuments ? "danger" : "warning"}>{documentsRequiringAttention.length}</Badge>
                      </header>
                      <div className="affairs-document-group__rows">{documentsRequiringAttention.map(renderDocumentRow)}</div>
                    </SectionSurface>
                  )}
                  <SectionSurface className="affairs-document-group affairs-section-surface affairs-section-surface--documents">
                    <header className="affairs-register-section__header">
                      <div><FileText size={16} aria-hidden="true" /><div><h2>Pozostałe dokumenty</h2><p>Bezpieczne terminy i dokumenty bez daty końcowej.</p></div></div>
                      <Badge tone="neutral">{stableDocuments.length}</Badge>
                    </header>
                    <div className="affairs-document-group__rows">{stableDocuments.map(renderDocumentRow)}</div>
                  </SectionSurface>
                </>
              )}
            </div>
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
                    <div key={item.id} className={`affairs-vehicle-row is-${due.tone} ${item.done ? "is-done" : ""}`}>
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
                const completedItems = items.filter((item) => item.done);
                const attentionVehicleItems = items.filter((item) => {
                  if (item.done) return false;
                  const tone = vehicleItemDueCopy(item, vehicle).tone;
                  return tone === "danger" || tone === "warning";
                });
                const hasOverdueVehicleItems = attentionVehicleItems.some((item) => vehicleItemDueCopy(item, vehicle).tone === "danger");
                const plannedVehicleItems = items.filter((item) => !item.done && !attentionVehicleItems.includes(item));
                return (
                  <SectionSurface key={vehicle.id} className="affairs-vehicle affairs-section-surface affairs-section-surface--vehicles">
                    <header className="affairs-vehicle__header">
                      <span className="affairs-vehicle__mark"><Car size={18} /></span>
                      <div>
                        <h2>{vehicle.name}</h2>
                        <p>{vehicle.registration || "Bez numeru rejestracyjnego"} · {formatMileage(vehicle.mileage)}</p>
                      </div>
                      <div className="affairs-vehicle__header-tools">
                        <span className="affairs-vehicle__status">
                          <Badge tone={hasOverdueVehicleItems ? "danger" : attentionVehicleItems.length ? "warning" : "success"}>
                            {attentionVehicleItems.length ? `${attentionVehicleItems.length} wymaga uwagi` : "Terminy bezpieczne"}
                          </Badge>
                        </span>
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
                      </div>
                    </header>
                    {items.length === 0 ? (
                      <div className="affairs-vehicle__empty">
                        <span>Brak zapisanych terminów dla tego pojazdu.</span>
                        <Button variant="ghost" size="sm" onClick={() => openVehicleItemEditor(vehicle.id)}>Dodaj pierwszy</Button>
                      </div>
                    ) : (
                      <div className="affairs-vehicle__items">
                        {attentionVehicleItems.length > 0 && (
                          <section className={`affairs-vehicle-group is-attention ${hasOverdueVehicleItems ? "is-danger" : ""}`} aria-label="Terminy wymagające uwagi">
                            <header><span>Wymagają uwagi</span><strong>{attentionVehicleItems.length}</strong></header>
                            <div className="affairs-vehicle-row-list">{attentionVehicleItems.map(renderVehicleItem)}</div>
                          </section>
                        )}
                        {plannedVehicleItems.length > 0 && (
                          <section className="affairs-vehicle-group" aria-label="Zaplanowane terminy">
                            <header><span>Zaplanowane</span><strong>{plannedVehicleItems.length}</strong></header>
                            <div className="affairs-vehicle-row-list">{plannedVehicleItems.map(renderVehicleItem)}</div>
                          </section>
                        )}
                        {completedItems.length > 0 && (
                          <CompletedSection label="Ukończone terminy" count={completedItems.length} className="affairs-completed-section">
                            <div className="affairs-vehicle-row-list">{completedItems.map(renderVehicleItem)}</div>
                          </CompletedSection>
                        )}
                      </div>
                    )}
                  </SectionSurface>
                );
              })}
            </div>
          )}

        </div>
        </>}
      </ModuleMain>

      {editor && (
        <Modal
          title={editorPresentation?.title ?? ""}
          description={editorPresentation?.description}
          onClose={editorDraftProtection.requestClose}
          footer={(
            <>
              <Button variant="ghost" onClick={editorDraftProtection.requestClose}>Anuluj</Button>
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

      {editorDraftProtection.promptOpen && (
        <ConfirmDialog
          title="Odrzucić niezapisane zmiany?"
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Kontynuuj edycję"
          onCancel={editorDraftProtection.keepEditing}
          onConfirm={editorDraftProtection.confirmDiscard}
        >
          <p className="ui-confirm-dialog__note">Szkic wpisu pozostaje w tej karcie, dopóki go nie zapiszesz albo świadomie odrzucisz.</p>
        </ConfirmDialog>
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
