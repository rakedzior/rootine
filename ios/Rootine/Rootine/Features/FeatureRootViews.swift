import SwiftUI

/// Internal-only diagnostic surface. It proves the app target, configuration,
/// environment object, dark tokens, and async bootstrap work without pretending
/// that any product screen has already been designed or accepted.
struct FoundationStatusView: View {
    let configured: Bool
    let hasStoredSession: Bool
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            Text("Rootine iOS")
                .font(.largeTitle.bold())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            Text("Szkielet techniczny")
                .font(.title2.weight(.semibold))

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                status("Konfiguracja klienta", ready: configured)
                status("Sesja w Keychain", ready: hasStoredSession)
                status("Kontrakty Codable", ready: true)
                status("Persistence i kolejka CAS", ready: true)
            }
            .rootineSurface()

            Text(message)
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            Text("Natywne ekrany Rootine są gotowe do ręcznego przeglądu.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.success)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(RootineTheme.Spacing.large)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }

    private func status(_ label: String, ready: Bool) -> some View {
        Label(label, systemImage: ready ? "checkmark.circle.fill" : "circle.dashed")
            .foregroundStyle(ready ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
    }
}

// MARK: - More module designs

/// Native surfaces for the spaces exposed from the "Więcej" hub. Every module
/// reads and writes through `AppEnvironment`, which owns the local snapshot
/// and the shared offline mutation queue.
struct MoreModuleView: View {
    let module: MoreModule
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            switch module {
            case .notes: NotesModuleContent()
            case .sport: SportModuleContent()
            case .goals: GoalsModuleContent()
            case .work: WorkModuleContent()
            case .travel: TravelModuleContent()
            case .health: HealthModuleContent()
            case .affairs: AffairsModuleContent()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

}

private func affairAmountText(_ amount: Double) -> String {
    let number = AffairMoney.normalized(amount)
    return String(format: "%.2f", number)
}

private struct AffairOneTimeDraft {
    var title: String
    var category: String
    var amount: Double
    var dueDate: String
    var note: String
}

private struct AffairOneTimeEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let payment: AffairOneTimePayment?
    let onSave: (AffairOneTimeDraft) -> Void
    @State private var title: String
    @State private var category: String
    @State private var amount: String
    @State private var dueDate: String
    @State private var note: String

    init(payment: AffairOneTimePayment?, onSave: @escaping (AffairOneTimeDraft) -> Void) {
        self.payment = payment
        self.onSave = onSave
        _title = State(initialValue: payment?.title ?? "")
        _category = State(initialValue: payment?.category ?? "Inne")
        _amount = State(initialValue: affairAmountText(payment?.amount ?? 0))
        _dueDate = State(initialValue: payment?.dueDate ?? RootineDate.localDate())
        _note = State(initialValue: payment?.note ?? "")
    }

    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairMoney.parse(amount) != nil
            && AffairDate.isValid(dueDate, allowingEmpty: false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Płatność jednorazowa") {
                    TextField("Nazwa", text: $title)
                    TextField("Kategoria", text: $category)
                    TextField("Kwota (PLN)", text: $amount).keyboardType(.decimalPad)
                    TextField("Termin (RRRR-MM-DD)", text: $dueDate).keyboardType(.numbersAndPunctuation)
                }
                Section("Notatka") { TextEditor(text: $note).frame(minHeight: 80) }
            }
            .navigationTitle(payment == nil ? "Nowa płatność" : "Edytuj płatność")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard let parsed = AffairMoney.parse(amount), valid else { return }
                        onSave(AffairOneTimeDraft(title: title, category: category, amount: NSDecimalNumber(decimal: parsed).doubleValue, dueDate: dueDate, note: note))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct AffairPaymentDraft {
    var name: String
    var category: String
    var amount: Double
    var cadence: String
    var nextDueDate: String
    var automatic: Bool
    var note: String
}

private struct AffairPaymentEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let payment: AffairRecurringPayment?
    let onSave: (AffairPaymentDraft) -> Void
    @State private var name: String
    @State private var category: String
    @State private var amount: String
    @State private var cadence: String
    @State private var nextDueDate: String
    @State private var automatic: Bool
    @State private var note: String

    init(payment: AffairRecurringPayment?, onSave: @escaping (AffairPaymentDraft) -> Void) {
        self.payment = payment
        self.onSave = onSave
        _name = State(initialValue: payment?.name ?? "")
        _category = State(initialValue: payment?.category ?? "Inne")
        _amount = State(initialValue: affairAmountText(payment?.amount ?? 0))
        _cadence = State(initialValue: payment?.cadence ?? "monthly")
        _nextDueDate = State(initialValue: payment?.nextDueDate ?? RootineDate.localDate())
        _automatic = State(initialValue: payment?.automatic ?? false)
        _note = State(initialValue: payment?.note ?? "")
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairMoney.parse(amount) != nil
            && AffairsWorkspaceRules.cadences.contains(cadence)
            && AffairDate.isValid(nextDueDate, allowingEmpty: false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Płatność cykliczna") {
                    TextField("Nazwa", text: $name)
                    TextField("Kategoria", text: $category)
                    TextField("Kwota (PLN)", text: $amount).keyboardType(.decimalPad)
                    Picker("Częstotliwość", selection: $cadence) {
                        Text("Co miesiąc").tag("monthly")
                        Text("Co kwartał").tag("quarterly")
                        Text("Co rok").tag("yearly")
                    }
                    TextField("Najbliższy termin (RRRR-MM-DD)", text: $nextDueDate).keyboardType(.numbersAndPunctuation)
                    Toggle("Płatność automatyczna", isOn: $automatic)
                }
                Section("Notatka") { TextEditor(text: $note).frame(minHeight: 80) }
            }
            .navigationTitle(payment == nil ? "Nowa płatność" : "Edytuj płatność")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard let parsed = AffairMoney.parse(amount), valid else { return }
                        onSave(AffairPaymentDraft(name: name, category: category, amount: NSDecimalNumber(decimal: parsed).doubleValue, cadence: cadence, nextDueDate: nextDueDate, automatic: automatic, note: note))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct AffairSubscriptionDraft {
    var name: String
    var category: String
    var amount: Double
    var cadence: String
    var nextBillingDate: String
    var renewal: String
    var commitmentEndDate: String
    var note: String
}

private struct AffairSubscriptionEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let subscription: AffairSubscription?
    let onSave: (AffairSubscriptionDraft) -> Void
    @State private var name: String
    @State private var category: String
    @State private var amount: String
    @State private var cadence: String
    @State private var nextBillingDate: String
    @State private var renewal: String
    @State private var commitmentEndDate: String
    @State private var note: String

    init(subscription: AffairSubscription?, onSave: @escaping (AffairSubscriptionDraft) -> Void) {
        self.subscription = subscription
        self.onSave = onSave
        _name = State(initialValue: subscription?.name ?? "")
        _category = State(initialValue: subscription?.category ?? "Inne")
        _amount = State(initialValue: affairAmountText(subscription?.amount ?? 0))
        _cadence = State(initialValue: subscription?.cadence ?? "monthly")
        _nextBillingDate = State(initialValue: subscription?.nextBillingDate ?? RootineDate.localDate())
        _renewal = State(initialValue: subscription?.renewal ?? "manual")
        _commitmentEndDate = State(initialValue: subscription?.commitmentEndDate ?? "")
        _note = State(initialValue: subscription?.note ?? "")
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairMoney.parse(amount) != nil
            && AffairsWorkspaceRules.cadences.contains(cadence)
            && ["automatic", "manual"].contains(renewal)
            && AffairDate.isValid(nextBillingDate, allowingEmpty: false)
            && AffairDate.isValid(commitmentEndDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Subskrypcja") {
                    TextField("Nazwa", text: $name)
                    TextField("Kategoria", text: $category)
                    TextField("Kwota (PLN)", text: $amount).keyboardType(.decimalPad)
                    Picker("Częstotliwość", selection: $cadence) {
                        Text("Co miesiąc").tag("monthly")
                        Text("Co kwartał").tag("quarterly")
                        Text("Co rok").tag("yearly")
                    }
                    Picker("Odnowienie", selection: $renewal) {
                        Text("Automatyczne").tag("automatic")
                        Text("Ręczne").tag("manual")
                    }
                    TextField("Kolejne rozliczenie (RRRR-MM-DD)", text: $nextBillingDate).keyboardType(.numbersAndPunctuation)
                    TextField("Koniec zobowiązania (opcjonalnie)", text: $commitmentEndDate).keyboardType(.numbersAndPunctuation)
                }
                Section("Notatka") { TextEditor(text: $note).frame(minHeight: 80) }
            }
            .navigationTitle(subscription == nil ? "Nowa subskrypcja" : "Edytuj subskrypcję")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard let parsed = AffairMoney.parse(amount), valid else { return }
                        onSave(AffairSubscriptionDraft(name: name, category: category, amount: NSDecimalNumber(decimal: parsed).doubleValue, cadence: cadence, nextBillingDate: nextBillingDate, renewal: renewal, commitmentEndDate: commitmentEndDate, note: note))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct AffairDocumentDraft {
    var name: String
    var category: String
    var holder: String
    var expiresAt: String
    var reminderDays: Int
    var note: String
}

private struct AffairDocumentEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let document: AffairDocument?
    let onSave: (AffairDocumentDraft) -> Void
    @State private var name: String
    @State private var category: String
    @State private var holder: String
    @State private var expiresAt: String
    @State private var reminderDays: String
    @State private var note: String

    init(document: AffairDocument?, onSave: @escaping (AffairDocumentDraft) -> Void) {
        self.document = document
        self.onSave = onSave
        _name = State(initialValue: document?.name ?? "")
        _category = State(initialValue: document?.category ?? "other")
        _holder = State(initialValue: document?.holder ?? "Ja")
        _expiresAt = State(initialValue: document?.expiresAt ?? RootineDate.localDate())
        _reminderDays = State(initialValue: String(document?.reminderDays ?? 30))
        _note = State(initialValue: document?.note ?? "")
    }

    private var parsedReminderDays: Int? { Int(reminderDays.trimmingCharacters(in: .whitespacesAndNewlines)) }
    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairsWorkspaceRules.documentCategories.contains(category)
            && AffairDate.isValid(expiresAt)
            && parsedReminderDays.map({ (0...730).contains($0) }) == true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Dokument") {
                    TextField("Nazwa", text: $name)
                    Picker("Kategoria", selection: $category) {
                        Text("Tożsamość").tag("identity")
                        Text("Prawo jazdy").tag("driving")
                        Text("Ubezpieczenie").tag("insurance")
                        Text("Zdrowie").tag("health")
                        Text("Umowa").tag("agreement")
                        Text("Inne").tag("other")
                    }
                    TextField("Osoba / właściciel", text: $holder)
                    TextField("Ważny do (RRRR-MM-DD)", text: $expiresAt).keyboardType(.numbersAndPunctuation)
                    TextField("Przypomnienie (dni wcześniej)", text: $reminderDays).keyboardType(.numberPad)
                }
                Section("Notatka") {
                    Text("Nie wpisuj pełnych numerów dokumentów ani innych danych wrażliwych.")
                        .font(.footnote).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    TextEditor(text: $note).frame(minHeight: 80)
                }
            }
            .navigationTitle(document == nil ? "Nowy dokument" : "Edytuj dokument")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard let parsedReminderDays, valid else { return }
                        onSave(AffairDocumentDraft(name: name, category: category, holder: holder, expiresAt: expiresAt, reminderDays: parsedReminderDays, note: note))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct AffairVehicleDraft {
    var name: String
    var registration: String
    var mileage: Double
}

private struct AffairVehicleEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let vehicle: AffairVehicle?
    let onSave: (AffairVehicleDraft) -> Void
    @State private var name: String
    @State private var registration: String
    @State private var mileage: String

    init(vehicle: AffairVehicle?, onSave: @escaping (AffairVehicleDraft) -> Void) {
        self.vehicle = vehicle
        self.onSave = onSave
        _name = State(initialValue: vehicle?.name ?? "")
        _registration = State(initialValue: vehicle?.registration ?? "")
        _mileage = State(initialValue: vehicle.map { String($0.mileage) } ?? "0")
    }

    private var parsedMileage: Double? { Double(mileage.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")) }
    private var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && parsedMileage.map { $0.isFinite && $0 >= 0 } == true }

    var body: some View {
        NavigationStack {
            Form {
                Section("Pojazd") {
                    TextField("Nazwa", text: $name)
                    TextField("Numer rejestracyjny", text: $registration).textInputAutocapitalization(.characters)
                    TextField("Przebieg (km)", text: $mileage).keyboardType(.numberPad)
                }
            }
            .navigationTitle(vehicle == nil ? "Nowy pojazd" : "Edytuj pojazd")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard let parsedMileage, valid else { return }
                        onSave(AffairVehicleDraft(name: name, registration: registration, mileage: parsedMileage))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct AffairVehicleItemDraft {
    var vehicleID: String
    var title: String
    var type: String
    var dueDate: String
    var dueMileage: Double?
    var note: String
}

private struct AffairVehicleItemEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: AffairVehicleItem?
    let onSave: (AffairVehicleItemDraft) -> Void
    let vehicles: [AffairVehicle]
    @State private var vehicleID: String
    @State private var title: String
    @State private var type: String
    @State private var dueDate: String
    @State private var dueMileage: String
    @State private var note: String

    init(item: AffairVehicleItem?, vehicleID: String, vehicles: [AffairVehicle], onSave: @escaping (AffairVehicleItemDraft) -> Void) {
        self.item = item
        self.onSave = onSave
        self.vehicles = vehicles
        _vehicleID = State(initialValue: item?.vehicleId ?? vehicleID)
        _title = State(initialValue: item?.title ?? "")
        _type = State(initialValue: item?.type ?? "service")
        _dueDate = State(initialValue: item?.dueDate ?? "")
        _dueMileage = State(initialValue: item?.dueMileage.map { String($0) } ?? "")
        _note = State(initialValue: item?.note ?? "")
    }

    private var parsedDueMileage: Double? {
        let value = dueMileage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        return rootineAffairMileage(value)
    }
    private var valid: Bool {
        !vehicleID.isEmpty && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairsWorkspaceRules.vehicleItemTypes.contains(type)
            && AffairDate.isValid(dueDate)
            && rootineAffairOptionalMileageIsValid(dueMileage)
            && (!dueDate.isEmpty || parsedDueMileage != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Termin pojazdu") {
                    Picker("Pojazd", selection: $vehicleID) {
                        ForEach(vehicles) { vehicle in Text(vehicle.name).tag(vehicle.id) }
                    }
                    TextField("Nazwa", text: $title)
                    Picker("Typ", selection: $type) {
                        Text("Ubezpieczenie").tag("insurance")
                        Text("Przegląd").tag("inspection")
                        Text("Serwis").tag("service")
                        Text("Opony").tag("tires")
                        Text("Leasing").tag("lease")
                        Text("Gwarancja").tag("warranty")
                        Text("Inne").tag("other")
                    }
                    TextField("Termin (opcjonalnie, RRRR-MM-DD)", text: $dueDate).keyboardType(.numbersAndPunctuation)
                    TextField("Przebieg graniczny (opcjonalnie)", text: $dueMileage).keyboardType(.numberPad)
                }
                Section("Notatka") { TextEditor(text: $note).frame(minHeight: 80) }
            }
            .navigationTitle(item == nil ? "Nowy termin" : "Edytuj termin")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard valid else { return }
                        onSave(AffairVehicleItemDraft(vehicleID: vehicleID, title: title, type: type, dueDate: dueDate, dueMileage: parsedDueMileage, note: note))
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct ModuleSyncStatusBanner: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            if case .conflict = environment.workspaceSyncStatus {
                RootineErrorState(
                    title: "Konflikt synchronizacji",
                    message: "Zmiany w tym module są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                    onRetry: { Task { await environment.flushPendingMutations() } }
                )
            } else if case .localOnly(let pending) = environment.workspaceSyncStatus {
                RootineOfflineBanner(message: offlineMessage(pending: pending))
            }
        }
    }

    private func offlineMessage(pending: Int) -> String {
        switch pending {
        case 1: return "Tryb offline · 1 zmiana czeka na synchronizację"
        case 2...4: return "Tryb offline · \(pending) zmiany czekają na synchronizację"
        case 5...: return "Tryb offline · \(pending) zmian czeka na synchronizację"
        default: return "Tryb offline · zmiany zapisują się na tym iPhonie"
        }
    }
}

private struct ModuleSectionTitle: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
    }
}

private struct ModuleActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
        .frame(minHeight: 48)
        .accessibilityHint("Otwiera formularz dodawania")
    }
}

// MARK: Notes

private struct NotesModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var editorTarget: NoteEditorTarget?
    @State private var listEditorTarget: NoteListEditorTarget?
    @State private var searchText = ""
    @State private var showingArchive = false
    @State private var selectedListID: String?
    @State private var selectedTag: String?
    @State private var pinnedOnly = false
    @State private var sort: RootineNotesSort = .updated
    @State private var noteToDelete: NoteRecord?
    @State private var deletedNote: RootineModuleUndo<NoteRecord>?
    @State private var listToDelete: NoteList?
    @State private var undoMessage: String?

    private var query: RootineNotesQuery {
        RootineNotesQuery(search: searchText, listID: selectedListID, tag: selectedTag,
            showingArchive: showingArchive, pinnedOnly: pinnedOnly, sort: sort)
    }
    private var notes: [NoteRecord] { rootineNotes(environment.notesWorkspace, matching: query) }
    var body: some View {
        List {
            Section {
                HStack {
                    Image(systemName: "magnifyingglass").accessibilityHidden(true)
                    TextField("Szukaj w notatkach", text: $searchText)
                    if !searchText.isEmpty { Button("Wyczyść", systemImage: "xmark.circle") { searchText = "" }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44) }
                }
                filters
            }
            Section(showingArchive ? "Archiwum" : "Twoje notatki") {
                if let emptyState = rootineNotesEmptyState(environment.notesWorkspace, query: query) {
                    Text(emptyState.message)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    if emptyState.offersClearFilters {
                        Button("Wyczyść filtry") { searchText = ""; selectedListID = nil; selectedTag = nil; pinnedOnly = false }
                    }
                }
                ForEach(notes) { note in
                    HStack(alignment: .top) {
                        Button { editorTarget = NoteEditorTarget(note: note) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text(note.title.isEmpty ? "Bez tytułu" : note.title).font(.headline); if note.pinned { Image(systemName: "pin.fill").accessibilityLabel("Przypięta") } }
                                Text(note.body.isEmpty ? (note.items.first?.text ?? "Bez dodatkowej treści") : note.body)
                                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText).lineLimit(3)
                                if !note.items.isEmpty { Text("\(note.items.filter(\.checked).count) z \(note.items.count) ukończonych").font(.caption) }
                            }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.buttonStyle(.plain)
                        Menu { actions(note) } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                            .accessibilityLabel("Akcje notatki \(note.title)")
                    }
                    .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { noteToDelete = note }; Button("Edytuj") { editorTarget = NoteEditorTarget(note: note) } }
                    .accessibilityAction(named: "Edytuj") { editorTarget = NoteEditorTarget(note: note) }
                    .accessibilityAction(named: "Usuń") { noteToDelete = note }
                }
            }
            Section { ModuleSyncStatusBanner() }
        }
        .modifier(ModuleIndexStyle())
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Nowa notatka", systemImage: "square.and.pencil") { editorTarget = NoteEditorTarget(note: nil) } } }
        .sheet(item: $editorTarget) { target in
            NoteEditorSheet(note: target.note, lists: environment.notesWorkspace.lists, onSave: { note in Task { await environment.upsertNote(note) } }, onDelete: { noteToDelete = $0 })
        }
        .sheet(item: $listEditorTarget) { target in
            NoteListEditorSheet(list: target.list) { name in
                Task { if let list = target.list { await environment.renameNoteList(id: list.id, name: name) } else { await environment.createNoteList(name: name) } }
            }
        }
        .confirmationDialog("Usunąć notatkę?", isPresented: Binding(get: { noteToDelete != nil }, set: { if !$0 { noteToDelete = nil } }), titleVisibility: .visible) {
            if let noteToDelete { Button("Usuń notatkę", role: .destructive) { Task { await environment.deleteNoteWithUndo(id: noteToDelete.id) { deletedNote = $0 } }; self.noteToDelete = nil } }
            Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog("Usunąć folder? Notatki pozostaną bez folderu.", isPresented: Binding(get: { listToDelete != nil }, set: { if !$0 { listToDelete = nil } }), titleVisibility: .visible) {
            if let listToDelete { Button("Usuń folder", role: .destructive) { Task { await environment.deleteNoteList(id: listToDelete.id) }; if selectedListID == listToDelete.id { selectedListID = nil }; self.listToDelete = nil } }
            Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let deletedNote { RootineUndoBanner(message: "Usunięto notatkę", usesAdaptiveLayout: true) { self.deletedNote = nil; Task { if !(await environment.undoNoteDeletion(deletedNote)) { undoMessage = environment.foundationMessage } } }.padding(.horizontal) }
        }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
    }
    private var filters: some View {
        HStack {
            Menu {
                Button("Wszystkie foldery") { selectedListID = nil }
                Button("Bez folderu") { selectedListID = "" }
                ForEach(environment.notesWorkspace.lists) { list in
                    Menu(list.name) {
                        Button("Pokaż notatki") { selectedListID = list.id }
                        Button("Zmień nazwę") { listEditorTarget = NoteListEditorTarget(list: list) }
                        Button("Usuń folder", role: .destructive) { listToDelete = list }
                    }
                }
                Button("Nowy folder", systemImage: "folder.badge.plus") { listEditorTarget = NoteListEditorTarget(list: nil) }
            } label: { Label(selectedListID == nil ? "Wszystkie foldery" : environment.notesWorkspace.lists.first(where: { $0.id == selectedListID })?.name ?? "Bez folderu", systemImage: "folder").frame(minHeight: 44) }
            Spacer()
            Menu {
                Toggle("Archiwum", isOn: $showingArchive)
                Toggle("Tylko przypięte", isOn: $pinnedOnly)
                Picker("Kolejność", selection: $sort) { Text("Ostatnio zmienione").tag(RootineNotesSort.updated); Text("Ostatnio utworzone").tag(RootineNotesSort.created); Text("Tytuł").tag(RootineNotesSort.title) }
                Button("Wszystkie tagi") { selectedTag = nil }
                ForEach(Array(Set(environment.notesWorkspace.notes.flatMap(\.tags))).sorted(), id: \.self) { tag in Button("#\(tag)") { selectedTag = tag } }
            } label: { Label("Filtry", systemImage: "line.3.horizontal.decrease").frame(minHeight: 44) }
        }
    }
    @ViewBuilder private func actions(_ note: NoteRecord) -> some View {
        Button("Edytuj", systemImage: "pencil") { editorTarget = NoteEditorTarget(note: note) }
        Button(note.pinned ? "Odepnij" : "Przypnij", systemImage: "pin") { Task { await environment.toggleNotePinned(id: note.id) } }
        Button(note.archived ? "Przywróć" : "Archiwizuj", systemImage: "archivebox") { Task { if note.archived { await environment.restoreArchivedNote(id: note.id) } else { await environment.archiveNote(id: note.id) } } }
        Button("Usuń", systemImage: "trash", role: .destructive) { noteToDelete = note }
    }
}

private struct NoteEditorTarget: Identifiable {
    let id: String
    let note: NoteRecord?

    init(note: NoteRecord?) {
        self.note = note
        id = note?.id ?? "new-\(UUID().uuidString)"
    }
}

private struct NoteEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let note: NoteRecord?
    let lists: [NoteList]
    let onSave: (NoteRecord) -> Void
    let onDelete: (NoteRecord) -> Void
    @State private var title: String
    @State private var newNoteID = UUID().uuidString
    @State private var bodyText: String
    @State private var tags: String
    @State private var pinned: Bool
    @State private var kind: String
    @State private var items: [NoteChecklistItem]
    @State private var listID: String
    @State private var color: NoteColor

    init(note: NoteRecord?, lists: [NoteList], onSave: @escaping (NoteRecord) -> Void, onDelete: @escaping (NoteRecord) -> Void) {
        self.note = note
        self.lists = lists
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: note?.title ?? "")
        _bodyText = State(initialValue: note?.body ?? "")
        _tags = State(initialValue: note?.tags.joined(separator: ", ") ?? "")
        _pinned = State(initialValue: note?.pinned ?? false)
        // Preserve a future/web kind until the user explicitly changes it;
        // the native picker still offers the two currently supported modes.
        _kind = State(initialValue: note?.kind ?? "text")
        _items = State(initialValue: note?.items ?? [])
        _listID = State(initialValue: note?.listId ?? "")
        _color = State(initialValue: note?.color ?? .blue)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Treść") {
                    TextField("Tytuł", text: $title)
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 120)
                    TextField("Tagi (opcjonalnie)", text: $tags)
                    Picker("Typ", selection: $kind) {
                        if kind != "text" && kind != "checklist" { Text("Inny typ").tag(kind) }
                        Text("Tekst").tag("text")
                        Text("Lista kontrolna").tag("checklist")
                    }
                    Picker("Folder", selection: $listID) {
                        Text("Bez folderu").tag("")
                        ForEach(lists) { list in
                            Text(list.name).tag(list.id)
                        }
                    }
                    Picker("Kolor", selection: $color) {
                        ForEach(NoteColor.allCases, id: \.self) { value in
                            Text(value.localizedName).tag(value)
                        }
                    }
                    Toggle("Przypnij na górze", isOn: $pinned)
                }
                if kind == "checklist" {
                    Section("Lista kontrolna") {
                        ForEach(items) { item in
                            HStack(spacing: RootineTheme.Spacing.xSmall) {
                                Button {
                                    toggleItem(item.id)
                                } label: {
                                    Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(item.checked ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                                }
                                .buttonStyle(.plain)
                                .frame(minWidth: 44, minHeight: 44)
                                .accessibilityLabel(item.checked ? "Oznacz jako nieukończone" : "Oznacz jako ukończone")
                                TextField("Element listy", text: itemBinding(item.id))
                                Button(role: .destructive) {
                                    items.removeAll { $0.id == item.id }
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                                .buttonStyle(.plain)
                                .frame(minWidth: 44, minHeight: 44)
                                .accessibilityLabel("Usuń element listy")
                            }
                        }
                        Button {
                            items.append(NoteChecklistItem(id: UUID().uuidString, text: "", checked: false))
                        } label: {
                            Label("Dodaj element", systemImage: "plus.circle")
                        }
                    }
                }
                if let note {
                    Section {
                        Button("Usuń notatkę", role: .destructive) {
                            onDelete(note)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(note == nil ? "Nowa notatka" : "Edytuj notatkę")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        let now = RootineDate.isoTimestamp()
                        let saved = NoteRecord(
                            id: note?.id ?? newNoteID,
                            title: title,
                            body: bodyText,
                            kind: kind,
                            items: kind == "checklist" ? items.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } : items,
                            tags: tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                            listId: listID,
                            color: color,
                            pinned: pinned,
                            archived: note?.archived ?? false,
                            createdAt: note?.createdAt ?? now,
                            updatedAt: now
                        )
                        onSave(saved)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        && bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        && items.allSatisfy { $0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                }
            }
        }
    }

    private func toggleItem(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].checked.toggle()
    }

    private func itemBinding(_ id: String) -> Binding<String> {
        Binding(
            get: { items.first(where: { $0.id == id })?.text ?? "" },
            set: { value in
                guard let index = items.firstIndex(where: { $0.id == id }) else { return }
                items[index].text = value
            }
        )
    }
}

private struct NoteListEditorTarget: Identifiable {
    let id: String
    let list: NoteList?

    init(list: NoteList?) {
        self.list = list
        id = list?.id ?? "new-note-list-\(UUID().uuidString)"
    }
}

private struct NoteListEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let list: NoteList?
    let onSave: (String) -> Void
    @State private var name: String

    init(list: NoteList?, onSave: @escaping (String) -> Void) {
        self.list = list
        self.onSave = onSave
        _name = State(initialValue: list?.name ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nazwa folderu", text: $name)
            }
            .navigationTitle(list == nil ? "Nowy folder" : "Zmień nazwę folderu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(name)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private func noteColor(_ color: NoteColor) -> Color {
    switch color {
    case .graphite: return RootineTheme.ColorToken.secondaryText
    case .blue: return MoreModule.notes.tint
    case .green: return RootineTheme.ColorToken.success
    case .amber: return RootineTheme.ColorToken.warning
    case .violet: return MoreModule.travel.tint
    case .coral: return RootineTheme.ColorToken.destructive
    }
}

private extension NoteColor {
    var localizedName: String {
        switch self {
        case .graphite: return "Grafitowy"
        case .blue: return "Niebieski"
        case .green: return "Zielony"
        case .amber: return "Bursztynowy"
        case .violet: return "Fioletowy"
        case .coral: return "Koralowy"
        }
    }
}

// MARK: Sport

private struct SportModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingWorkoutEditor = false
    @State private var selectedWorkout: SportWorkout?
    @State private var editingWorkout: SportWorkout?
    @State private var workoutToDelete: SportWorkout?
    @State private var deletedWorkout: RootineModuleUndo<SportWorkout>?
    private let weekdays = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]

    private var workouts: [SportWorkout] {
        environment.sportWorkspace.workouts.sorted { $0.date > $1.date }
    }

    private var weekRange: (Date, Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let mondayOffset = (calendar.component(.weekday, from: today) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -mondayOffset, to: today) ?? today
        let sunday = calendar.date(byAdding: .day, value: 7, to: monday) ?? today
        return (monday, sunday)
    }

    private var weekWorkouts: [SportWorkout] {
        let (monday, sunday) = weekRange
        return workouts.filter { workout in
            guard let date = rootineDate(from: workout.date) else { return false }
            return date >= monday && date < sunday
        }
    }

    private var weekTotalMinutes: Int { weekWorkouts.reduce(0) { $0 + $1.minutes } }
    private var weekCompletedWorkouts: Int { weekWorkouts.filter(\.completed).count }
    private var weekAverageMinutes: Int {
        guard !weekWorkouts.isEmpty else { return 0 }
        return Int((Double(weekTotalMinutes) / Double(weekWorkouts.count)).rounded())
    }

    private var upcomingWorkouts: [SportWorkout] {
        let today = RootineDate.localDate()
        return workouts
            .filter { !$0.completed && $0.date >= today }
            .sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }

    private var chartMinutes: [Int] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        // Calendar.weekday is Sunday-first; convert it to a Monday-first offset
        // so the chart labels and bars always line up in Polish locales.
        let mondayOffset = (calendar.component(.weekday, from: today) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -mondayOffset, to: today) ?? today
        return (0..<7).map { offset in
            let date = calendar.date(byAdding: .day, value: offset, to: monday) ?? monday
            let key = RootineDate.localDate(date)
            return min(120, weekWorkouts.filter { $0.date == key }.reduce(0) { $0 + $1.minutes })
        }
    }

    private var chartScale: CGFloat {
        CGFloat(max(60, chartMinutes.max() ?? 0))
    }

    @State private var undoMessage: String?
    private var agenda: RootineSportAgenda { RootineSportAgenda(workouts, today: RootineDate.localDate()) }
    var body: some View {
        List {
            Section("Najbliższy trening") {
                if let next = agenda.upcoming.first { trainingRow(next) }
                else { Text("Nie masz zaplanowanego treningu.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
            }
            if agenda.upcoming.count > 1 { Section("Dalej w planie") { ForEach(Array(agenda.upcoming.dropFirst())) { trainingRow($0) } } }
            if !agenda.overdue.isEmpty { Section("Zaległe treningi") { ForEach(agenda.overdue) { trainingRow($0) } } }
            Section("Historia") {
                if agenda.history.isEmpty { Text("Ukończone treningi pojawią się tutaj.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                ForEach(agenda.history) { trainingRow($0) }
            }
            Section {
                DisclosureGroup("Ten tydzień") {
                    Text("\(weekTotalMinutes) min · \(weekCompletedWorkouts) ukończonych · średnio \(weekAverageMinutes) min")
                    HStack(alignment: .bottom, spacing: 8) {
                        ForEach(Array(chartMinutes.enumerated()), id: \.offset) { index, minutes in
                            VStack { RoundedRectangle(cornerRadius: 3).fill(MoreModule.sport.tint).frame(height: max(2, CGFloat(minutes) / 2)); Text(["P", "W", "Ś", "C", "P", "S", "N"][index]).font(.caption) }
                        }
                    }.accessibilityElement(children: .ignore).accessibilityLabel("Minuty treningu od poniedziałku").accessibilityValue(chartMinutes.map(String.init).joined(separator: ", "))
                }
                ModuleSyncStatusBanner()
            }
        }
        .modifier(ModuleIndexStyle())
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Zaplanuj trening", systemImage: "plus") { isShowingWorkoutEditor = true } } }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
        .sheet(isPresented: $isShowingWorkoutEditor) {
            WorkoutEditorSheet { title, kind, minutes, date in
                Task { await environment.addWorkout(title: title, date: date, minutes: minutes, kind: kind) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedWorkout) { workout in
            WorkoutDetailSheet(
                workout: workout,
                onEdit: { editingWorkout = environment.sportWorkspace.workouts.first(where: { $0.id == workout.id }) },
                onDelete: { requestDelete(workout) }
            )
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingWorkout) { workout in
            WorkoutEditorSheet(existing: workout) { title, kind, minutes, date in
                Task { await environment.updateWorkout(id: workout.id, title: title, date: date, minutes: minutes, kind: kind) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć trening?",
            isPresented: Binding(
                get: { workoutToDelete != nil },
                set: { isPresented in
                    if !isPresented { workoutToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let workoutToDelete {
                Button("Usuń trening", role: .destructive) {
                    delete(workoutToDelete)
                    self.workoutToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let deletedWorkout {
                RootineUndoBanner(message: "Usunięto trening \(deletedWorkout.record.title)", usesAdaptiveLayout: true) {
                    let workout = deletedWorkout
                    self.deletedWorkout = nil
                    Task { if !(await environment.undoWorkoutDeletion(workout)) { undoMessage = environment.foundationMessage } }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }


    private func trainingRow(_ workout: SportWorkout) -> some View {
        HStack(alignment: .top) {
            Button { selectedWorkout = workout } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(workout.title).font(.headline)
                    Text("\(workout.date) · \(workout.kind) · \(workout.minutes) min").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
            Button { Task { await environment.toggleWorkoutCompleted(id: workout.id) } } label: { Image(systemName: workout.completed ? "checkmark.circle.fill" : "circle").frame(width: 44, height: 44) }
                .buttonStyle(.borderless).accessibilityLabel(workout.completed ? "Cofnij wykonanie \(workout.title)" : "Wykonaj \(workout.title)")
            Menu { Button("Edytuj") { editingWorkout = workout }; Button("Usuń", role: .destructive) { requestDelete(workout) } } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Akcje treningu \(workout.title)")
        }
        .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { requestDelete(workout) }; Button("Edytuj") { editingWorkout = workout } }
    }

    private func delete(_ workout: SportWorkout) {
        Task { await environment.deleteWorkoutWithUndo(id: workout.id) { deletedWorkout = $0 } }
    }

    private func requestDelete(_ workout: SportWorkout) {
        workoutToDelete = workout
    }
}

private func rootineDate(from key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          String(format: "%04d-%02d-%02d", parts[0], parts[1], parts[2]) == key else { return nil }
    let calendar = Calendar.current
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
    guard let date = calendar.date(from: components) else { return nil }
    let normalized = calendar.dateComponents([.year, .month, .day], from: date)
    guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
    return date
}

private struct WorkoutEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: SportWorkout?
    let onSave: (String, String, Int, String) -> Void
    @State private var title: String
    @State private var kind: String
    @State private var minutes: String
    @State private var date: String

    init(existing: SportWorkout? = nil, onSave: @escaping (String, String, Int, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _kind = State(initialValue: existing?.kind ?? "Trening")
        _minutes = State(initialValue: String(existing?.minutes ?? 30))
        _date = State(initialValue: existing?.date ?? RootineDate.localDate())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Trening") {
                    TextField("Nazwa", text: $title)
                    TextField("Rodzaj", text: $kind)
                    TextField("Minuty", text: $minutes)
                        .keyboardType(.numberPad)
                    TextField("Data (RRRR-MM-DD)", text: $date)
                }
            }
            .navigationTitle(existing == nil ? "Zaplanuj trening" : "Edytuj trening")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, kind, Int(minutes) ?? 30, date)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct WorkoutDetailSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let workout: SportWorkout
    let onEdit: () -> Void
    let onDelete: () -> Void
    var body: some View {
        NavigationStack {
            List {
                if let current = environment.sportWorkspace.workouts.first(where: { $0.id == workout.id }) {
                    Section { Text(current.title).font(.headline); Text(current.date); Text("\(current.kind) · \(current.minutes) min") }
                    Section {
                        Button(current.completed ? "Cofnij wykonanie" : "Oznacz jako wykonany", systemImage: "checkmark.circle") { Task { await environment.toggleWorkoutCompleted(id: current.id) } }
                        Button("Edytuj trening", systemImage: "pencil") { onEdit(); dismiss() }
                        Button("Usuń trening", role: .destructive) { onDelete(); dismiss() }
                    }
                } else { Text("Ten trening nie jest już dostępny.") }
            }.modifier(ModuleIndexStyle()).navigationTitle("Szczegóły treningu").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } } }
        }
    }
}

// MARK: Goals

private struct GoalsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingGoalEditor = false
    @State private var selectedGoal: GoalRecord?
    @State private var editingGoal: GoalRecord?
    @State private var goalToDelete: GoalRecord?
    @State private var deletedGoal: RootineModuleUndo<GoalRecord>?
    @State private var showingArchive = false
    @State private var categoryFilter: String?

    private var goals: [GoalRecord] {
        environment.goalsWorkspace.goals
            .filter { showingArchive ? $0.status == .archived : $0.status != .archived }
            .filter { categoryFilter == nil || $0.categoryId == categoryFilter }
            .sorted { lhs, rhs in
                if lhs.status != rhs.status { return lhs.status.rawValue < rhs.status.rawValue }
                if lhs.dueDate != rhs.dueDate { return lhs.dueDate < rhs.dueDate }
                let comparison = lhs.title.localizedCaseInsensitiveCompare(rhs.title)
                return comparison == .orderedSame ? lhs.id < rhs.id : comparison == .orderedAscending
            }
    }
    private var averageProgress: Double {
        guard !goals.isEmpty else { return 0 }
        return goals.reduce(0) { $0 + $1.progress } / Double(goals.count)
    }

    @State private var undoMessage: String?
    var body: some View {
        List {
            Section {
                Menu {
                    Button("Wszystkie kategorie") { categoryFilter = nil }
                    ForEach(environment.goalsWorkspace.categories) { category in Button(category.label) { categoryFilter = category.id } }
                    Toggle("Archiwum", isOn: $showingArchive)
                } label: { Label(showingArchive ? "Archiwum" : "Kategorie i status", systemImage: "line.3.horizontal.decrease").frame(minHeight: 44) }
            }
            if goals.isEmpty { Text(showingArchive ? "Nie masz celów w archiwum." : "Brak celów w tym widoku.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
            ForEach([GoalStatus.active, .planned, .paused, .completed, .archived], id: \.self) { status in
                let records = goals.filter { $0.status == status }
                if !records.isEmpty { Section(goalStatusLabel(status)) { ForEach(records) { goal in goalIndexRow(goal) } } }
            }
            Section { ModuleSyncStatusBanner() }
        }
        .modifier(ModuleIndexStyle())
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Dodaj cel", systemImage: "plus") { isShowingGoalEditor = true } } }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
        .sheet(isPresented: $isShowingGoalEditor) {
            GoalEditorSheet(categories: environment.goalsWorkspace.categories) { draft in
                Task { _ = await environment.createGoal(
                    title: draft.title,
                    description: draft.detail,
                    categoryId: draft.categoryId,
                    iconKey: draft.icon,
                    status: draft.status,
                    priority: draft.priority,
                    startDate: draft.startDate,
                    dueDate: draft.dueDate,
                    progressMode: draft.progressMode,
                    targetValue: draft.target,
                    unit: draft.unit,
                    note: draft.note
                ) }
            }
        }
        .sheet(item: $selectedGoal) { goal in
            GoalDetailSheet(
                goal: goal,
                onEdit: { editingGoal = environment.goalsWorkspace.goals.first(where: { $0.id == goal.id }) },
                onDelete: { requestDelete(goal) }
            )
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingGoal) { goal in
            GoalEditorSheet(existing: goal, categories: environment.goalsWorkspace.categories) { draft in
                Task { await environment.updateGoal(
                    id: goal.id,
                    title: draft.title,
                    description: draft.detail,
                    categoryId: draft.categoryId,
                    status: draft.status,
                    priority: draft.priority,
                    startDate: draft.startDate,
                    dueDate: draft.dueDate,
                    progressMode: draft.progressMode,
                    targetValue: draft.target,
                    unit: draft.unit,
                    note: draft.note,
                    iconKey: draft.icon
                ) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć cel?",
            isPresented: Binding(
                get: { goalToDelete != nil },
                set: { isPresented in
                    if !isPresented { goalToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let goalToDelete {
                Button("Usuń cel", role: .destructive) {
                    delete(goalToDelete)
                    self.goalToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let deletedGoal {
                RootineUndoBanner(message: "Usunięto cel \(deletedGoal.record.title)", usesAdaptiveLayout: true) {
                    let goal = deletedGoal
                    self.deletedGoal = nil
                    Task { if !(await environment.undoGoalDeletion(goal)) { undoMessage = environment.foundationMessage } }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }


    private func goalIndexRow(_ goal: GoalRecord) -> some View {
        HStack(alignment: .top) {
            Button { selectedGoal = goal } label: {
                VStack(alignment: .leading, spacing: 8) {
                    Text(goal.title).font(.headline)
                    Text(rootineGoalNextStep(goal)).font(.subheadline)
                    ProgressView(value: goal.progress).accessibilityHidden(true)
                    Text("\(RootineGoalProgressLabel(goal).value) · \(goal.progressPercent)%\(goal.dueDate.isEmpty ? "" : " · " + goal.dueDate)").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(goal.title). \(rootineGoalNextStep(goal))")
                .accessibilityValue(RootineGoalProgressLabel(goal).accessibilityValue + (goal.dueDate.isEmpty ? "" : ". Termin " + goal.dueDate))
            if goal.status == .active { Button { Task { await environment.advanceGoal(id: goal.id) } } label: { Image(systemName: "plus.circle").frame(width: 44, height: 44) }.buttonStyle(.borderless).accessibilityLabel("Dodaj postęp do \(goal.title)") }
            Menu {
                Button("Edytuj") { editingGoal = goal }
                Button(goal.status == .archived ? "Przywróć" : "Archiwizuj") { Task { if goal.status == .archived { await environment.restoreArchivedGoal(id: goal.id) } else { await environment.archiveGoal(id: goal.id) } } }
                Button("Usuń", role: .destructive) { requestDelete(goal) }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Akcje celu \(goal.title)")
        }
        .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { requestDelete(goal) }; Button("Edytuj") { editingGoal = goal } }
    }

    private func delete(_ goal: GoalRecord) {
        Task { await environment.deleteGoalWithUndo(id: goal.id) { deletedGoal = $0 } }
    }

    private func requestDelete(_ goal: GoalRecord) {
        goalToDelete = goal
    }
}

private struct GoalEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: GoalRecord?
    let categories: [GoalCategory]
    let onSave: (GoalEditorDraft) -> Void
    @State private var title: String
    @State private var detail: String
    @State private var target: String
    @State private var icon: String
    @State private var categoryId: String
    @State private var status: GoalStatus
    @State private var priority: GoalPriority
    @State private var startDate: String
    @State private var dueDate: String
    @State private var progressMode: GoalProgressMode
    @State private var unit: String
    @State private var note: String

    init(existing: GoalRecord? = nil, categories: [GoalCategory] = [], onSave: @escaping (GoalEditorDraft) -> Void) {
        self.existing = existing
        self.categories = categories.isEmpty ? [GoalCategory(id: "personal", label: "Osobiste", color: "#8793A1", iconKey: "circle")] : categories
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _detail = State(initialValue: existing?.detail ?? "")
        _target = State(initialValue: String(existing?.target ?? 10))
        _icon = State(initialValue: existing?.icon ?? "target")
        _categoryId = State(initialValue: existing?.categoryId ?? "personal")
        _status = State(initialValue: existing?.status ?? .active)
        _priority = State(initialValue: existing?.priority ?? .medium)
        _startDate = State(initialValue: existing?.startDate ?? RootineDate.localDate())
        _dueDate = State(initialValue: existing?.dueDate ?? RootineDate.localDate())
        _progressMode = State(initialValue: existing?.progressMode ?? .numeric)
        _unit = State(initialValue: existing?.unit ?? "kroków")
        _note = State(initialValue: existing?.note ?? existing?.detail ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cel") {
                    TextField("Nazwa", text: $title)
                    TextField("Opis", text: $detail)
                    TextField("Liczba kroków", text: $target)
                        .keyboardType(.decimalPad)
                    TextField("Ikona SF Symbol", text: $icon)
                    Picker("Kategoria", selection: $categoryId) {
                        ForEach(categories) { category in
                            Text(category.label).tag(category.id)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(GoalStatus.allCases, id: \.self) { value in Text(value.rawValue).tag(value) }
                    }
                    Picker("Priorytet", selection: $priority) {
                        ForEach(GoalPriority.allCases, id: \.self) { value in Text(value.rawValue).tag(value) }
                    }
                    Picker("Typ postępu", selection: $progressMode) {
                        ForEach(GoalProgressMode.allCases, id: \.self) { value in Text(value.rawValue).tag(value) }
                    }
                    TextField("Jednostka", text: $unit)
                    TextField("Start (RRRR-MM-DD)", text: $startDate)
                    TextField("Termin (RRRR-MM-DD)", text: $dueDate)
                    TextField("Notatka", text: $note, axis: .vertical)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj cel" : "Edytuj cel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(GoalEditorDraft(
                            title: title,
                            detail: detail,
                            target: Double(target.replacingOccurrences(of: ",", with: ".")) ?? 10,
                            icon: icon,
                            categoryId: categoryId,
                            status: status,
                            priority: priority,
                            startDate: startDate,
                            dueDate: dueDate,
                            progressMode: progressMode,
                            unit: unit,
                            note: note
                        ))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct GoalEditorDraft {
    let title: String
    let detail: String
    let target: Double
    let icon: String
    let categoryId: String
    let status: GoalStatus
    let priority: GoalPriority
    let startDate: String
    let dueDate: String
    let progressMode: GoalProgressMode
    let unit: String
    let note: String
}

private struct GoalDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var environment: AppEnvironment
    let goal: GoalRecord
    let onEdit: () -> Void
    let onDelete: () -> Void
    var body: some View {
        NavigationStack {
            List {
                if let current = environment.goalsWorkspace.goals.first(where: { $0.id == goal.id }) {
                    Section {
                        Text(current.title).font(.headline)
                        if !current.detail.isEmpty { Text(current.detail) }
                        ProgressView(value: current.progress).accessibilityLabel("Postęp celu").accessibilityValue("\(current.progressPercent) procent")
                        Text("\(rootineGoalCurrentValue(current).formatted()) z \(current.targetValue.formatted()) \(current.unit)")
                        Text(rootineGoalNextStep(current))
                        Text("\(goalStatusLabel(current.status)) · \(current.dueDate)").font(.subheadline)
                    }
                    if !current.milestones.isEmpty {
                        Section("Etapy") { ForEach(current.milestones) { step in
                            Button { Task { await environment.updateGoalMilestone(id: current.id, milestoneID: step.id, done: !step.done) } } label: {
                                Label(step.title, systemImage: step.done ? "checkmark.circle.fill" : "circle").frame(minHeight: 44)
                            }.accessibilityValue(step.done ? "Ukończony" : "Do wykonania")
                        } }
                    }
                    if !current.linkedTaskIds.isEmpty { Section("Powiązane zadania") { ForEach(current.linkedTaskIds, id: \.self) { id in Text(environment.taskWorkspace.tasks.first(where: { $0.id == id })?.text ?? "Zadanie \(id)") } } }
                    if !current.history.isEmpty { Section("Historia") { ForEach(current.history) { entry in Text("\(entry.label) · \(entry.createdAt.prefix(10))") } } }
                    Section {
                        Button("Edytuj cel", systemImage: "pencil") { onEdit(); dismiss() }
                        Button(current.status == .archived ? "Przywróć cel" : "Archiwizuj cel", systemImage: "archivebox") { Task { if current.status == .archived { await environment.restoreArchivedGoal(id: current.id) } else { await environment.archiveGoal(id: current.id) } }; dismiss() }
                        Button("Usuń cel", role: .destructive) { onDelete(); dismiss() }
                    }
                } else { Text("Ten cel nie jest już dostępny.") }
            }
            .modifier(ModuleIndexStyle()).navigationTitle("Szczegóły celu").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } } }
        }
    }
}

// MARK: Work

private struct WorkModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingProjectEditor = false
    @State private var isShowingWorkItemEditor = false
    @State private var editingWorkItem: WorkItem?
    @State private var workItemToDelete: WorkItem?
    @State private var isShowingPriorityEditor = false
    @State private var editingPriority: WorkspaceTask?
    @State private var priorityToDelete: WorkspaceTask?
    @State private var deletedPriority: RootineModuleUndo<WorkspaceTask>?

    private var workTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true && $0.source?.kind == "work" }
    }

    private var workProjects: [WorkProject] {
        environment.workWorkspace.projects.filter { $0.status != .archived }
    }

    private var workItems: [WorkItem] {
        environment.workWorkspace.tasks.sorted { lhs, rhs in
            if lhs.completed != rhs.completed { return !lhs.completed }
            if lhs.priority != rhs.priority { return workPriorityRank(lhs.priority) > workPriorityRank(rhs.priority) }
            return lhs.id < rhs.id
        }
    }

    private func workPriorityRank(_ priority: WorkItemPriority) -> Int {
        switch priority {
        case .urgent: return 4
        case .high: return 3
        case .medium: return 2
        case .low: return 1
        case .none: return 0
        }
    }

    private func workItemMeta(_ item: WorkItem) -> String {
        let projectName = item.projectId.flatMap { projectID in
            workProjects.first(where: { $0.id == projectID })?.name
        }
        let priority = item.priority == .none ? nil : item.priority.rawValue
        return [projectName, priority].compactMap { $0 }.joined(separator: " · ").isEmpty
            ? "Bez projektu"
            : [projectName, priority].compactMap { $0 }.joined(separator: " · ")
    }

    private var isFocusRunning: Bool { focusStartDate != nil }

    private var isFocusPaused: Bool {
        !isFocusRunning && environment.workWorkspace.pausedFocusSessionID != nil
    }

    private var focusStartDate: Date? {
        guard let startedAt = environment.workWorkspace.activeFocusStartedAt else { return nil }
        return RootineDate.date(from: startedAt)
    }

    private var hasCorruptFocusSession: Bool {
        environment.workWorkspace.activeFocusStartedAt != nil && focusStartDate == nil
    }

    private func elapsedText(at date: Date) -> String {
        guard let start = focusStartDate else { return "—" }
        let elapsed = max(0, Int(date.timeIntervalSince(start)))
        return String(format: "%02d:%02d", elapsed / 60, elapsed % 60)
    }

    private func focusProgress(at date: Date) -> Double {
        guard let start = focusStartDate else { return 0 }
        return min(1, max(0, date.timeIntervalSince(start) / (25 * 60)))
    }

    @State private var showingRegister = false
    @State private var undoMessage: String?
    var body: some View {
        List {
            if !showingRegister {
                Section("Skupienie") { focusContent }
                Section("Zadania na dziś") {
                    let items = rootineWorkDayItems(workItems, today: RootineDate.localDate())
                    if items.isEmpty { Text("Na dziś nie ma otwartych zadań.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                    ForEach(items) { itemRow($0) }
                    Button("Dodaj zadanie", systemImage: "plus") { isShowingWorkItemEditor = true }
                }
                Section("Priorytety pracy") {
                    if workTasks.isEmpty { Text("Wybierz to, co jest dziś najważniejsze.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                    ForEach(workTasks) { task in priorityRow(task) }
                    Button("Dodaj priorytet", systemImage: "plus") { isShowingPriorityEditor = true }
                }
                Section { Button("Rejestr pracy", systemImage: "list.bullet.rectangle") { showingRegister = true } }
            } else {
                Section { Button("Wróć do skupienia", systemImage: "arrow.left") { showingRegister = false } }
                Section("Projekty") {
                    if workProjects.isEmpty { Text("Nie masz jeszcze projektów.") }
                    ForEach(workProjects) { project in VStack(alignment: .leading, spacing: 6) { Text(project.name).font(.headline); if !project.description.isEmpty { Text(project.description).font(.subheadline) } } }
                    Button("Dodaj projekt", systemImage: "plus") { isShowingProjectEditor = true }
                }
                Section("Wszystkie zadania pracy") {
                    if workItems.isEmpty { Text("Dodane zadania pojawią się tutaj.") }
                    ForEach(workItems) { itemRow($0) }
                    Button("Dodaj zadanie", systemImage: "plus") { isShowingWorkItemEditor = true }
                }
                Section("Historia skupienia") {
                    if environment.workWorkspace.focusSessions.isEmpty { Text("Nie masz jeszcze zapisanych sesji.") }
                    ForEach(rootineFocusHistory(environment.workWorkspace.focusSessions, limit: environment.workWorkspace.focusSessions.count)) { session in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(session.startedAt.prefix(10)) · \(session.minutes) min").font(.headline)
                            if let id = session.taskId, let item = environment.workWorkspace.tasks.first(where: { $0.id == id }) { Text(item.title).font(.subheadline) }
                            else if let id = session.projectId, let project = environment.workWorkspace.projects.first(where: { $0.id == id }) { Text(project.name).font(.subheadline) }
                        }
                    }
                }
            }
            Section { ModuleSyncStatusBanner() }
        }
        .modifier(ModuleIndexStyle())
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
        .task { await environment.recoverFocusSession() }
        .sheet(isPresented: $isShowingProjectEditor) {
            WorkProjectEditorSheet { name, description in
                Task { await environment.addWorkProject(name: name, description: description) }
            }
        }
        .sheet(isPresented: $isShowingWorkItemEditor) {
            WorkItemEditorSheet(projects: workProjects) { title, projectID, priority, status in
                Task { await environment.addWorkItem(title: title, projectID: projectID, priority: priority, status: status) }
            }
        }
        .sheet(item: $editingWorkItem) { item in
            WorkItemEditorSheet(existing: item, projects: workProjects) { title, projectID, priority, status in
                Task { await environment.editWorkItemBasics(id: item.id, title: title, projectID: projectID, priority: priority, status: status) }
            }
        }
        .confirmationDialog(
            "Usunąć zadanie, jego podzadania i powiązane sesje skupienia?",
            isPresented: Binding(get: { workItemToDelete != nil }, set: { if !$0 { workItemToDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Usuń zadanie", role: .destructive) {
                if let workItemToDelete {
                    Task { await environment.deleteWorkItem(id: workItemToDelete.id) }
                }
                workItemToDelete = nil
            }
            Button("Anuluj", role: .cancel) {}
        }
        .sheet(isPresented: $isShowingPriorityEditor) {
            WorkPriorityEditorSheet { title in
                Task { await environment.addWorkPriority(text: title) }
            }
        }
        .sheet(item: $editingPriority) { task in
            WorkPriorityEditorSheet(existing: task, onSave: { title in
                Task { await environment.updateWorkPriority(id: task.id, text: title) }
            }, onDelete: {
                requestDelete(task)
            })
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć priorytet?",
            isPresented: Binding(
                get: { priorityToDelete != nil },
                set: { isPresented in
                    if !isPresented { priorityToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let priorityToDelete {
                Button("Usuń priorytet", role: .destructive) {
                    delete(priorityToDelete)
                    self.priorityToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let deletedPriority {
                RootineUndoBanner(message: "Usunięto priorytet", usesAdaptiveLayout: true) {
                    let task = deletedPriority
                    self.deletedPriority = nil
                    Task { if !(await environment.undoWorkPriorityDeletion(task)) { undoMessage = environment.foundationMessage } }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }


    private var focusContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let start = focusStartDate {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(start, style: .timer).font(.title2.monospacedDigit()).accessibilityLabel("Czas skupienia")
                }
                Button("Wstrzymaj", systemImage: "pause") { Task { await environment.pauseFocusSession() } }.frame(minHeight: 44)
                Button("Zakończ", systemImage: "stop") { Task { await environment.stopFocusSession() } }.frame(minHeight: 44)
            } else if isFocusPaused {
                Text("Sesja wstrzymana").font(.headline)
                Button("Wznów skupienie", systemImage: "play") { Task { await environment.resumeFocusSession() } }.frame(minHeight: 44)
                Button("Zakończ", systemImage: "stop") { Task { await environment.stopFocusSession() } }.frame(minHeight: 44)
            } else if environment.workWorkspace.activeFocusStartedAt != nil {
                Text("Nie można odczytać czasu tej sesji.")
                Button("Wyczyść sesję") { Task { await environment.resetFocusSession() } }.frame(minHeight: 44)
            } else {
                Text("Czas na jedno zadanie").font(.headline)
                Button("Rozpocznij skupienie", systemImage: "play") { Task { await environment.startFocusSession() } }.frame(minHeight: 44)
            }
        }.buttonStyle(.borderless)
    }
    private func itemRow(_ item: WorkItem) -> some View {
        HStack(alignment: .top) {
            Button { editingWorkItem = item } label: {
                VStack(alignment: .leading, spacing: 6) { Text(item.title).font(.headline); Text(item.dueDate ?? "Bez terminu").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText) }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
            Button { Task { await environment.toggleWorkItemCompletion(id: item.id) } } label: { Image(systemName: item.completed ? "checkmark.circle.fill" : "circle").frame(width: 44, height: 44) }.buttonStyle(.borderless).accessibilityLabel(item.completed ? "Cofnij wykonanie \(item.title)" : "Wykonaj \(item.title)")
            Menu {
                Button("Edytuj") { editingWorkItem = item }
                if !isFocusRunning && !isFocusPaused { Button("Skup się na zadaniu") { Task { await environment.startFocusSession(projectID: item.projectId, taskID: item.id) } } }
                Button("Usuń", role: .destructive) { workItemToDelete = item }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Akcje zadania \(item.title)")
        }
        .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { workItemToDelete = item }; Button("Edytuj") { editingWorkItem = item } }
    }
    private func priorityRow(_ task: WorkspaceTask) -> some View {
        HStack(alignment: .top) {
            Button { editingPriority = task } label: { Text(task.text).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }.buttonStyle(.plain)
            Button { Task { await environment.toggleTaskCompletion(id: task.id) } } label: { Image(systemName: task.done ? "checkmark.circle.fill" : "circle").frame(width: 44, height: 44) }.buttonStyle(.borderless).accessibilityLabel(task.done ? "Cofnij wykonanie \(task.text)" : "Wykonaj \(task.text)")
            Menu { Button("Edytuj") { editingPriority = task }; Button("Usuń", role: .destructive) { requestDelete(task) } } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Akcje priorytetu \(task.text)")
        }
        .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { requestDelete(task) } }
    }

    private func delete(_ task: WorkspaceTask) {
        Task { await environment.deleteWorkPriorityWithUndo(id: task.id) { deletedPriority = $0 } }
    }

    private func requestDelete(_ task: WorkspaceTask) {
        priorityToDelete = task
    }
}

private struct WorkProjectEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String) -> Void
    @State private var name = ""
    @State private var description = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Projekt") {
                    TextField("Nazwa projektu", text: $name)
                    TextField("Opis (opcjonalnie)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("Dodaj projekt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(name, description)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct WorkItemEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: WorkItem?
    let projects: [WorkProject]
    let onSave: (String, String?, WorkItemPriority, WorkItemStatus) -> Void
    @State private var title: String
    @State private var projectID: String
    @State private var priority: WorkItemPriority
    @State private var status: WorkItemStatus

    init(existing: WorkItem? = nil, projects: [WorkProject], onSave: @escaping (String, String?, WorkItemPriority, WorkItemStatus) -> Void) {
        self.existing = existing
        self.projects = projects
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _projectID = State(initialValue: existing?.projectId ?? "")
        _priority = State(initialValue: existing?.priority ?? .none)
        _status = State(initialValue: existing?.status ?? .todo)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Zadanie") {
                    TextField("Co trzeba zrobić?", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                    Picker("Projekt", selection: $projectID) {
                        Text("Bez projektu").tag("")
                        ForEach(projects) { project in
                            Text(project.name).tag(project.id)
                        }
                    }
                    Picker("Priorytet", selection: $priority) {
                        ForEach(WorkItemPriority.allCases, id: \.self) { value in
                            Text(workItemPriorityLabel(value)).tag(value)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(WorkItemStatus.allCases, id: \.self) { value in
                            Text(workItemStatusLabel(value)).tag(value)
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "Dodaj zadanie" : "Edytuj zadanie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, projectID.isEmpty ? nil : projectID, priority, status)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func workItemPriorityLabel(_ value: WorkItemPriority) -> String {
        switch value {
        case .none: return "Brak"
        case .low: return "Niski"
        case .medium: return "Średni"
        case .high: return "Wysoki"
        case .urgent: return "Pilny"
        }
    }

    private func workItemStatusLabel(_ value: WorkItemStatus) -> String {
        switch value {
        case .todo: return "Do zrobienia"
        case .inProgress: return "W toku"
        case .blocked: return "Zablokowane"
        case .waiting: return "Oczekuje"
        case .completed: return "Ukończone"
        case .cancelled: return "Anulowane"
        }
    }
}

private struct WorkPriorityEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: WorkspaceTask?
    let onSave: (String) -> Void
    let onDelete: (() -> Void)?
    @State private var title: String

    init(existing: WorkspaceTask? = nil, onSave: @escaping (String) -> Void, onDelete: (() -> Void)? = nil) {
        self.existing = existing
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: existing?.text ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Priorytet") {
                    TextField("Co jest najważniejsze?", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                }
                if existing != nil, let onDelete {
                    Section {
                        Button("Usuń priorytet", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "Dodaj priorytet" : "Edytuj priorytet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

// MARK: Travel

private struct TravelModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var undoMessage: String?
    @State private var adding = false
    @State private var selectedTrip: TravelRecord?
    @State private var editingTrip: TravelRecord?
    @State private var tripToDelete: TravelRecord?
    @State private var undo: RootineModuleUndo<TravelRecord>?
    private var agenda: RootineTravelAgenda { RootineTravelAgenda(environment.travelWorkspace.trips, today: RootineDate.localDate()) }

    var body: some View {
        List {
            ModuleSyncStatusBanner()
            Section(agenda.current.isEmpty ? "Najbliższa podróż" : "W podróży") {
                if let trip = agenda.featured {
                    tripRow(trip)
                    let plan = trip.itinerary.filter { $0.date >= RootineDate.localDate() }.sorted { $0.date == $1.date ? $0.time < $1.time : $0.date < $1.date }
                    ForEach(Array(plan.prefix(3))) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title).font(.subheadline)
                            Text([item.date, item.time, item.location].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }.accessibilityElement(children: .combine)
                    }
                } else {
                    Text(environment.travelWorkspace.trips.isEmpty ? "Zapisz miejsce i termin pierwszej podróży." : "Nie ma teraz zaplanowanej podróży. Pozostałe zapisy znajdziesz poniżej.")
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            tripSection("Pozostałe plany", trips: (agenda.current + agenda.upcoming).filter { $0.id != agenda.featured?.id })
            tripSection("Termin do ustalenia", trips: agenda.undated)
            tripSection("Historia", trips: agenda.history)
            tripSection("Archiwum", trips: agenda.archived)
        }
        .modifier(ModuleIndexStyle())
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Dodaj podróż", systemImage: "plus") { adding = true } } }
        .sheet(isPresented: $adding) { TripEditorSheet { destination, dateRange, nights in
            Task { await environment.addTrip(destination: destination, dateRange: dateRange, nights: nights) }
        } }
        .sheet(item: $editingTrip) { trip in TripEditorSheet(existing: trip) { destination, dateRange, nights in
            Task { await environment.updateTrip(id: trip.id, destination: destination, dateRange: dateRange, nights: nights) }
        } }
        .sheet(item: $selectedTrip) { trip in TravelDetailSheet(tripID: trip.id) {
            selectedTrip = nil
            requestDelete(trip)
        } }
        .confirmationDialog("Usunąć podróż i jej plan?", isPresented: Binding(get: { tripToDelete != nil }, set: { if !$0 { tripToDelete = nil } }), titleVisibility: .visible) {
            Button("Usuń podróż", role: .destructive) {
                if let trip = tripToDelete { Task { await environment.deleteTripWithUndo(id: trip.id) { undo = $0 } } }
                tripToDelete = nil
            }
            Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let token = undo { RootineUndoBanner(message: "Usunięto podróż", usesAdaptiveLayout: true) {
                undo = nil; Task { if !(await environment.undoTripDeletion(token)) { undoMessage = environment.foundationMessage } }
            } }
        }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
    }
    private func requestDelete(_ trip: TravelRecord) { tripToDelete = trip }
    @ViewBuilder private func tripSection(_ title: String, trips: [TravelRecord]) -> some View {
        if !trips.isEmpty { Section(title) { ForEach(trips) { tripRow($0) } } }
    }
    private func tripRow(_ trip: TravelRecord) -> some View {
        HStack(alignment: .top) {
            Button { selectedTrip = trip } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(trip.destination).font(.headline).foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange).font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text("\(trip.nights) nocy").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
            Menu {
                Button("Edytuj", systemImage: "pencil") { editingTrip = trip }
                Button("Usuń", systemImage: "trash", role: .destructive) { requestDelete(trip) }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                .accessibilityLabel("Opcje podróży: \(trip.destination)")
        }
        .swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { requestDelete(trip) } }
    }
}

private struct TravelDetailSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    let onDelete: () -> Void
    @State private var editing = false
    private var trip: TravelRecord? { environment.travelWorkspace.trips.first { $0.id == tripID } }
    var body: some View {
        NavigationStack {
            List {
                if let trip {
                    Section {
                        Text(trip.destination).font(.headline)
                        Text(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange)
                        LabeledContent("Status", value: ["idea": "Pomysł", "planning": "Planowana", "ready": "Gotowa", "completed": "Zakończona"][trip.status] ?? trip.status)
                        if !trip.note.isEmpty { Text(trip.note) }
                        if !trip.travelers.isEmpty { LabeledContent("Uczestnicy", value: trip.travelers.joined(separator: ", ")) }
                        if let timezone = trip.timezone { LabeledContent("Strefa czasowa", value: timezone) }
                    }
                    Section("Plan") {
                        if trip.itinerary.isEmpty { Text("Nie zapisano jeszcze punktów planu.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                        ForEach(trip.itinerary.sorted { $0.date == $1.date ? $0.time < $1.time : $0.date < $1.date }) { item in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title).font(.headline)
                                Text([item.date, item.time, item.location].filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline)
                                if !item.note.isEmpty { Text(item.note).font(.caption) }
                                if item.reserved { Text("Zarezerwowane").font(.caption) }
                            }.accessibilityElement(children: .combine)
                        }
                    }
                    dossier(trip)
                    Section {
                        Button("Edytuj podróż", systemImage: "pencil") { editing = true }
                        Button("Usuń podróż", systemImage: "trash", role: .destructive) { onDelete() }
                    }
                } else { Text("Ta podróż nie jest już dostępna.") }
            }
            .modifier(ModuleIndexStyle())
            .navigationTitle("Szczegóły podróży").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } } }
            .sheet(isPresented: $editing) { if let trip { TripEditorSheet(existing: trip) { destination, dateRange, nights in
                Task { await environment.updateTrip(id: tripID, destination: destination, dateRange: dateRange, nights: nights) }
            } } }
        }
    }
    @ViewBuilder private func dossier(_ trip: TravelRecord) -> some View {
        Section("Dokumentacja podróży") {
            DisclosureGroup("Noclegi i przejazdy") {
                ForEach(trip.stays) { stay in
                    VStack(alignment: .leading) { Text(stay.name); Text([stay.city, stay.address, stay.checkIn, stay.checkOut, stay.bookingRef].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption) }
                }
                ForEach(trip.transports) { item in
                    VStack(alignment: .leading) { Text(item.title); Text([item.from, item.to, item.departure, item.arrival, item.bookingRef].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption) }
                }
                ForEach(trip.bookings) { item in
                    VStack(alignment: .leading) { Text(item.provider); Text([item.bookingReference, item.status, item.startsAt ?? "", item.endsAt ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption) }
                }
                if trip.stays.isEmpty && trip.transports.isEmpty && trip.bookings.isEmpty { Text("Brak zapisanych rezerwacji.") }
            }
            DisclosureGroup("Dokumenty") {
                ForEach(trip.documents) { item in
                    VStack(alignment: .leading) { Text(item.name); Text([item.owner, item.status, item.expiresAt, item.note].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption) }
                }
                if trip.documents.isEmpty { Text("Brak dokumentów podróży.") }
            }
            DisclosureGroup("Zadania i pakowanie") {
                ForEach(trip.tasks) { item in
                    Label([item.title, item.dueDate].filter { !$0.isEmpty }.joined(separator: " · "), systemImage: item.completed ? "checkmark.circle" : "circle")
                }
                ForEach(trip.packingItems) { item in
                    Label("\(item.label) · \(item.quantity)", systemImage: item.packed ? "checkmark.circle" : "circle")
                }
                if trip.tasks.isEmpty && trip.packingItems.isEmpty { Text("Brak zapisanych zadań i rzeczy do spakowania.") }
            }
            DisclosureGroup("Budżet i kwoty") {
                ForEach(trip.budget) { line in
                    VStack(alignment: .leading) { Text(line.label); Text("Plan \(line.planned, specifier: "%.2f") · Wykonanie \(line.actual, specifier: "%.2f") \(line.currency ?? trip.baseCurrency)").font(.caption) }
                }
                ForEach(trip.stays) { item in Text("\(item.name): \(item.amount, specifier: "%.2f") \(item.currency ?? trip.baseCurrency)") }
                ForEach(trip.transports) { item in Text("\(item.title): \(item.amount, specifier: "%.2f") \(item.currency ?? trip.baseCurrency)") }
                if trip.budget.isEmpty && trip.stays.isEmpty && trip.transports.isEmpty { Text("Brak zapisanych kwot.") }
            }
        }
    }
}

private struct TripEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: TravelRecord?
    let onSave: (String, String, Int) -> Void
    @State private var destination: String
    @State private var dateRange: String
    @State private var nights: String

    init(existing: TravelRecord? = nil, onSave: @escaping (String, String, Int) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _destination = State(initialValue: existing?.destination ?? "")
        _dateRange = State(initialValue: existing?.dateRange ?? "")
        _nights = State(initialValue: String(existing?.nights ?? 3))
    }

    private var valid: Bool {
        guard !destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let count = Int(nights), count > 0 else { return false }
        let dates = dateRange.components(separatedBy: "–").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if dates.count == 2, rootineHealthLocalDateIsValid(dates[0]), rootineHealthLocalDateIsValid(dates[1]) { return dates[0] <= dates[1] }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Podróż") {
                    TextField("Miejsce", text: $destination)
                    TextField("Termin", text: $dateRange)
                    TextField("Liczba nocy", text: $nights)
                        .keyboardType(.numberPad)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj podróż" : "Edytuj podróż")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard valid, let count = Int(nights) else { return }
                        onSave(destination, dateRange, count)
                        dismiss()
                    }
                    .disabled(!valid)
                }
            }
        }
    }
}

private struct TravelChip: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.medium))
            .foregroundStyle(MoreModule.travel.tint)
            .padding(.horizontal, RootineTheme.Spacing.small)
            .padding(.vertical, RootineTheme.Spacing.xSmall)
            .background(MoreModule.travel.tint.opacity(0.14))
            .clipShape(Capsule())
    }
}

private struct TravelTimelineRow: View {
    let day: String
    let title: String
    let detail: String
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: RootineTheme.Spacing.small) {
            VStack(spacing: 0) {
                Text(day)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(MoreModule.travel.tint)
                    .frame(width: 28, height: 28)
                    .background(MoreModule.travel.tint.opacity(0.16))
                    .clipShape(Circle())
                if !isLast {
                    Rectangle()
                        .fill(RootineTheme.ColorToken.separator)
                        .frame(width: 1, height: 34)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            .padding(.top, RootineTheme.Spacing.xSmall)
            Spacer(minLength: 0)
        }
    }
}

// MARK: Health

private struct HealthModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var undoMessage: String?
    @State private var addingReminder = false
    @State private var editingReminder: HealthReminder?
    @State private var selectedReminder: HealthReminder?
    @State private var editingCheckIn: HealthCheckIn?
    @State private var reminderToDelete: HealthReminder?
    @State private var checkInToDelete: HealthCheckIn?
    @State private var reminderUndo: RootineModuleUndo<HealthReminder>?
    @State private var checkInUndo: RootineModuleUndo<HealthCheckIn>?
    private var today: String { RootineDate.localDate() }
    private var checkIn: HealthCheckIn? { environment.healthWorkspace.checkIns[today] }
    private var history: [HealthCheckIn] { environment.healthWorkspace.checkInHistory(limit: environment.healthWorkspace.checkIns.count) }

    var body: some View {
        List {
            ModuleSyncStatusBanner()
            Section("Dzisiejszy zapis") {
                Text(checkIn.map { "Energia: \($0.energy) z 4" } ?? "Jak oceniasz dziś swoją energię?").font(.headline)
                HStack {
                    ForEach(1...4, id: \.self) { energy in
                        Button {
                            let day = today
                            let note = environment.healthWorkspace.checkIns[day]?.note
                            Task { await environment.updateHealthCheckIn(date: day, energy: energy, note: note) }
                        } label: {
                            Text("\(energy)").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                                .background(checkIn?.energy == energy ? RootineTheme.ColorToken.action.opacity(0.18) : RootineTheme.ColorToken.elevated)
                                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control))
                        }.buttonStyle(.plain)
                            .accessibilityLabel("Energia \(energy) z 4")
                            .accessibilityValue(checkIn?.energy == energy ? "Wybrano" : "Niewybrano")
                    }
                }
                if let note = checkIn?.note { Text(note) }
                Button(checkIn == nil ? "Dodaj zapis z notatką" : "Edytuj zapis i notatkę", systemImage: "pencil") {
                    editingCheckIn = checkIn ?? HealthCheckIn(date: today, energy: 3, note: nil, updatedAt: RootineDate.isoTimestamp())
                }
            }
            Section("Przypomnienia") {
                if environment.healthWorkspace.reminders.isEmpty { Text("Nie masz jeszcze przypomnień.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                ForEach(environment.healthWorkspace.reminders) { reminder in reminderRow(reminder) }
            }
            Section("Rejestr energii") {
                if history.isEmpty { Text("Historia pojawi się po pierwszym zapisie.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                ForEach(history) { item in
                    HStack {
                        Button { editingCheckIn = item } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(item.date) · \(item.energy) z 4").font(.headline)
                                Text(item.note ?? "Bez notatki").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.buttonStyle(.plain)
                        Menu { Button("Usuń zapis", systemImage: "trash", role: .destructive) { checkInToDelete = item } } label: {
                            Image(systemName: "ellipsis").frame(width: 44, height: 44)
                        }.accessibilityLabel("Opcje zapisu z \(item.date)")
                    }.swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { checkInToDelete = item } }
                }
            }
            Section {
                DisclosureGroup("Dane z ostatnich dni") {
                    if let average = environment.healthWorkspace.metrics(for: today).averageEnergy {
                        Text("Średnia energii z 7 dni: \(average, specifier: "%.1f") z 4")
                    } else { Text("Brak zapisów z ostatnich 7 dni.") }
                    Text("Woda dzisiaj: \(Int(environment.nutritionWorkspace.days[today]?.waterMl ?? 0)) ml")
                }
            }
        }.modifier(ModuleIndexStyle())
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("Dodaj przypomnienie", systemImage: "plus") { addingReminder = true } } }
        .sheet(isPresented: $addingReminder) { HealthReminderEditorSheet { title, detail in Task { await environment.addHealthReminder(title: title, detail: detail) } } }
        .sheet(item: $editingReminder) { item in HealthReminderEditorSheet(existing: item) { title, detail in Task { await environment.updateHealthReminder(id: item.id, title: title, detail: detail) } } }
        .sheet(item: $editingCheckIn) { item in HealthCheckInEditorSheet(existing: item) { energy, note in Task { await environment.updateHealthCheckIn(date: item.date, energy: energy, note: note) } } }
        .sheet(item: $selectedReminder) { item in HealthLiveReminderDetail(reminderID: item.id) }
        .confirmationDialog("Usunąć przypomnienie?", isPresented: Binding(get: { reminderToDelete != nil }, set: { if !$0 { reminderToDelete = nil } }), titleVisibility: .visible) {
            Button("Usuń przypomnienie", role: .destructive) {
                if let item = reminderToDelete { Task { await environment.deleteHealthReminderWithUndo(id: item.id) { reminderUndo = $0; checkInUndo = nil } } }
                reminderToDelete = nil
            }; Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog("Usunąć zapis energii?", isPresented: Binding(get: { checkInToDelete != nil }, set: { if !$0 { checkInToDelete = nil } }), titleVisibility: .visible) {
            Button("Usuń zapis", role: .destructive) {
                if let item = checkInToDelete { Task { await environment.deleteHealthCheckInWithUndo(date: item.date) { checkInUndo = $0; reminderUndo = nil } } }
                checkInToDelete = nil
            }; Button("Anuluj", role: .cancel) {}
        }
        .safeAreaInset(edge: .bottom) {
            if let token = reminderUndo { RootineUndoBanner(message: "Usunięto przypomnienie", usesAdaptiveLayout: true) { reminderUndo = nil; Task { if !(await environment.undoHealthReminderDeletion(token)) { undoMessage = environment.foundationMessage } } } }
            if let token = checkInUndo { RootineUndoBanner(message: "Usunięto zapis energii", usesAdaptiveLayout: true) { checkInUndo = nil; Task { if !(await environment.undoHealthCheckInDeletion(token)) { undoMessage = environment.foundationMessage } } } }
        }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
    }
    private func reminderRow(_ reminder: HealthReminder) -> some View {
        HStack {
            Button {
                let date = Date()
                Task { await environment.toggleHealthReminder(id: reminder.id, date: date) }
            } label: { Image(systemName: reminder.completedDates.contains(today) ? "checkmark.circle.fill" : "circle").frame(width: 44, height: 44) }
                .buttonStyle(.plain).accessibilityLabel("\(reminder.title): \(reminder.completedDates.contains(today) ? "cofnij wykonanie" : "oznacz wykonanie")")
            Button { selectedReminder = reminder } label: {
                VStack(alignment: .leading) { Text(reminder.title); Text(reminder.detail).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText) }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
            Menu {
                Button("Edytuj", systemImage: "pencil") { editingReminder = reminder }
                Button("Usuń", systemImage: "trash", role: .destructive) { reminderToDelete = reminder }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Opcje przypomnienia: \(reminder.title)")
        }.swipeActions(allowsFullSwipe: false) { Button("Usuń", role: .destructive) { reminderToDelete = reminder } }
    }
}

private struct HealthLiveReminderDetail: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let reminderID: String
    var body: some View {
        NavigationStack {
            List {
                if let item = environment.healthWorkspace.reminders.first(where: { $0.id == reminderID }) {
                    Text(item.title).font(.headline)
                    Text(item.detail)
                    Button(item.completedDates.contains(RootineDate.localDate()) ? "Cofnij dzisiejsze wykonanie" : "Oznacz wykonanie dzisiaj") {
                        let date = Date(); Task { await environment.toggleHealthReminder(id: reminderID, date: date) }
                    }
                    Section("Zapisane wykonania") { ForEach(item.completedDates.sorted().reversed(), id: \.self) { Text($0) } }
                } else { Text("Przypomnienie nie jest już dostępne.") }
            }.modifier(ModuleIndexStyle()).navigationTitle("Przypomnienie").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } } }
        }
    }
}

private struct HealthReminderDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let reminder: HealthReminder
    let isCompleted: Bool
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    Label(reminder.title, systemImage: isCompleted ? "checkmark.circle.fill" : "bell.badge")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(reminder.detail.isEmpty ? "Bez dodatkowej informacji" : reminder.detail)
                        .font(.body)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    HStack(spacing: RootineTheme.Spacing.small) {
                        Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(isCompleted ? RootineTheme.ColorToken.success : MoreModule.health.tint)
                        Text(isCompleted ? "Ukończone dzisiaj" : "Do zrobienia dzisiaj")
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityElement(children: .combine)

                    RootinePrimaryButton(
                        isCompleted ? "Oznacz jako nieukończone" : "Oznacz jako ukończone",
                        systemImage: isCompleted ? "arrow.uturn.backward" : "checkmark"
                    ) {
                        onToggle()
                        dismiss()
                    }
                    RootineSecondaryButton("Edytuj przypomnienie", systemImage: "pencil") {
                        onEdit()
                        dismiss()
                    }
                    Button("Usuń przypomnienie", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .padding(RootineTheme.Spacing.large)
            }
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły przypomnienia")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
            }
            .confirmationDialog("Usunąć przypomnienie?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń przypomnienie", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }
}

private struct HealthReminderEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: HealthReminder?
    let onSave: (String, String) -> Void
    @State private var title: String
    @State private var detail: String

    init(existing: HealthReminder? = nil, onSave: @escaping (String, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _detail = State(initialValue: existing?.detail ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Przypomnienie") {
                    TextField("Treść", text: $title)
                    TextField("Kiedy? (opcjonalnie)", text: $detail)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj przypomnienie" : "Edytuj przypomnienie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, detail)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct HealthCheckInEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: HealthCheckIn
    let onSave: (Int, String?) -> Void
    @State private var energy: Int
    @State private var note: String

    init(existing: HealthCheckIn, onSave: @escaping (Int, String?) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _energy = State(initialValue: existing.energy)
        _note = State(initialValue: existing.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Energia") {
                    Picker("Poziom energii", selection: $energy) {
                        ForEach(1...4, id: \.self) { value in
                            Text("\(value) z 4").tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Notatka") {
                    TextField("Opcjonalnie", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle("Edytuj check-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(energy, note)
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct HealthMetric: View {
    let value: String
    let label: String
    let systemImage: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 72, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

private struct HealthReminderRow: View {
    let title: String
    let detail: String
    let tint: Color
    let isCompleted: Bool
    let onToggle: () -> Void
    let onSelect: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Circle()
                    .fill(tint.opacity(0.18))
                    .frame(width: 36, height: 36)
                    .overlay {
                        Image(systemName: isCompleted ? "checkmark" : "bell")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isCompleted ? "Oznacz przypomnienie jako nieukończone" : "Oznacz przypomnienie jako ukończone")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .strikethrough(isCompleted)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(detail.isEmpty ? "Bez dodatkowej informacji" : detail)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły przypomnienia: \(title)")

            Button(action: onSelect) {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Otwórz szczegóły przypomnienia: \(title)")
        }
        .padding(.vertical, RootineTheme.Spacing.xSmall)
        .frame(minHeight: 52)
    }
}

private struct ModuleEmptyCard: View {
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 72, alignment: .leading)
        .rootineSurface()
        .accessibilityElement(children: .combine)
    }
}

// MARK: Pozostałe / Sprawy

private struct AffairsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var undoMessage: String?
    @State private var view: AffairsModuleView = .matters
    @State private var showCompleted = false
    @State private var destructiveAction: (() async -> Void)?
    @State private var deleteLabel = ""
    @State private var showingMatterEditor = false
    @State private var selectedMatter: AffairMatter?
    @State private var matterToDelete: AffairMatter?
    @State private var deletedMatter: RootineModuleUndo<AffairMatter>?
    @State private var editorTarget: AffairsEditorTarget?

    var body: some View {
        List {
            ModuleSyncStatusBanner()
            switch view {
            case .overview, .matters: matters
            case .finances: finances
            case .documents: documents
            case .vehicles: vehicles
            }
        }
        .modifier(ModuleIndexStyle())
        .toolbar {
            ToolbarItem(placement: .principal) {
                Menu {
                    Picker("Obszar", selection: $view) {
                        Text("Sprawy").tag(AffairsModuleView.matters)
                        Text("Finanse").tag(AffairsModuleView.finances)
                        Text("Dokumenty").tag(AffairsModuleView.documents)
                        Text("Pojazdy").tag(AffairsModuleView.vehicles)
                    }
                } label: { Label(view.title, systemImage: "chevron.down").frame(minHeight: 44) }
                .accessibilityLabel("Obszar Spraw i finansów: \(view.title)")
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    switch view {
                    case .overview, .matters: Button("Dodaj sprawę") { showingMatterEditor = true }
                    case .finances:
                        Button("Płatność jednorazowa") { editorTarget = .oneTime(nil) }
                        Button("Płatność cykliczna") { editorTarget = .payment(nil) }
                        Button("Subskrypcja") { editorTarget = .subscription(nil) }
                    case .documents: Button("Dodaj dokument") { editorTarget = .document(nil) }
                    case .vehicles:
                        Button("Dodaj pojazd") { editorTarget = .vehicle(nil) }
                        if let vehicle = environment.affairsWorkspace.vehicles.first { Button("Dodaj termin pojazdu") { editorTarget = .vehicleItem(nil, vehicle.id) } }
                    }
                } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.accessibilityLabel("Dodaj: \(view.title)")
            }
        }
        .sheet(isPresented: $showingMatterEditor) {
            AffairEditorSheet(matter: nil) { draft in
                Task { await environment.addAffairMatter(title: draft.title, category: draft.category, priority: draft.priority, dueDate: draft.dueDate, note: draft.note) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedMatter) { matter in
            AffairEditorSheet(matter: matter) { draft in
                Task { await environment.updateAffairMatter(id: matter.id, title: draft.title, category: draft.category, priority: draft.priority, dueDate: draft.dueDate, note: draft.note) }
            } onDelete: {
                matterToDelete = matter
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editorTarget) { target in
            Group {
                switch target {
                case .oneTime(let payment):
                    AffairOneTimeEditorSheet(payment: payment) { draft in
                        if let payment {
                            Task { await environment.updateAffairOneTimePayment(id: payment.id, title: draft.title, category: draft.category, amount: draft.amount, dueDate: draft.dueDate, note: draft.note) }
                        } else {
                            Task { await environment.addAffairOneTimePayment(title: draft.title, category: draft.category, amount: draft.amount, dueDate: draft.dueDate, note: draft.note) }
                        }
                    }
                case .payment(let payment):
                    AffairPaymentEditorSheet(payment: payment) { draft in
                        if let payment {
                            Task { await environment.updateAffairPayment(id: payment.id, name: draft.name, category: draft.category, amount: draft.amount, cadence: draft.cadence, nextDueDate: draft.nextDueDate, automatic: draft.automatic, note: draft.note) }
                        } else {
                            Task { await environment.addAffairPayment(name: draft.name, category: draft.category, amount: draft.amount, cadence: draft.cadence, nextDueDate: draft.nextDueDate, automatic: draft.automatic, note: draft.note) }
                        }
                    }
                case .subscription(let subscription):
                    AffairSubscriptionEditorSheet(subscription: subscription) { draft in
                        if let subscription {
                            Task { await environment.updateAffairSubscription(id: subscription.id, name: draft.name, category: draft.category, amount: draft.amount, cadence: draft.cadence, nextBillingDate: draft.nextBillingDate, renewal: draft.renewal, commitmentEndDate: draft.commitmentEndDate, note: draft.note) }
                        } else {
                            Task { await environment.addAffairSubscription(name: draft.name, category: draft.category, amount: draft.amount, cadence: draft.cadence, nextBillingDate: draft.nextBillingDate, renewal: draft.renewal, commitmentEndDate: draft.commitmentEndDate, note: draft.note) }
                        }
                    }
                case .document(let document):
                    AffairDocumentEditorSheet(document: document) { draft in
                        if let document {
                            Task { await environment.updateAffairDocument(id: document.id, name: draft.name, category: draft.category, holder: draft.holder, expiresAt: draft.expiresAt, reminderDays: draft.reminderDays, note: draft.note) }
                        } else {
                            Task { await environment.addAffairDocument(name: draft.name, category: draft.category, holder: draft.holder, expiresAt: draft.expiresAt, reminderDays: draft.reminderDays, note: draft.note) }
                        }
                    }
                case .vehicle(let vehicle):
                    AffairVehicleEditorSheet(vehicle: vehicle) { draft in
                        if let vehicle {
                            Task { await environment.updateAffairVehicle(id: vehicle.id, name: draft.name, registration: draft.registration, mileage: draft.mileage) }
                        } else {
                            Task { await environment.addAffairVehicle(name: draft.name, registration: draft.registration, mileage: draft.mileage) }
                        }
                    }
                case .vehicleItem(let item, let vehicleID):
                    AffairVehicleItemEditorSheet(item: item, vehicleID: vehicleID, vehicles: environment.affairsWorkspace.vehicles) { draft in
                        if let item {
                            Task { await environment.updateAffairVehicleItem(id: item.id, vehicleID: draft.vehicleID, title: draft.title, type: draft.type, dueDate: draft.dueDate, dueMileage: draft.dueMileage, note: draft.note) }
                        } else {
                            Task { await environment.addAffairVehicleItem(vehicleID: draft.vehicleID, title: draft.title, type: draft.type, dueDate: draft.dueDate, dueMileage: draft.dueMileage, note: draft.note) }
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć sprawę?",
            isPresented: Binding(
                get: { matterToDelete != nil },
                set: { if !$0 { matterToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let matterToDelete {
                Button("Usuń sprawę", role: .destructive) {
                    Task { await environment.deleteAffairMatterWithUndo(id: matterToDelete.id) { deletedMatter = $0 } }
                    self.matterToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog("Usunąć \(deleteLabel)?", isPresented: Binding(get: { destructiveAction != nil }, set: { if !$0 { destructiveAction = nil } }), titleVisibility: .visible) {
            Button("Usuń", role: .destructive) { if let action = destructiveAction { Task { await action() } }; destructiveAction = nil }
            Button("Anuluj", role: .cancel) { destructiveAction = nil }
        }
        .safeAreaInset(edge: .bottom) {
            if let deletedMatter {
                RootineUndoBanner(message: "Usunięto sprawę", usesAdaptiveLayout: true) {
                    let matter = deletedMatter
                    self.deletedMatter = nil
                    Task { if !(await environment.undoAffairMatterDeletion(matter)) { undoMessage = environment.foundationMessage } }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
        .alert("Nie można cofnąć", isPresented: Binding(get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } })) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
    }

    private var matters: some View {
        Section(showCompleted ? "Zakończone sprawy" : "Sprawy i terminy") {
            Toggle("Pokaż zakończone", isOn: $showCompleted)
            let values = rootineAffairMatters(environment.affairsWorkspace.matters, completed: showCompleted)
            if values.isEmpty { Text(showCompleted ? "Nie masz zakończonych spraw." : "Nie masz otwartych spraw. Dodaj nową lub sprawdź zakończone.").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
            ForEach(values) { matter in affairRow(matter) }
        }
    }
    private var finances: some View {
        Group {
            Section("Jednorazowe") {
                if environment.affairsWorkspace.oneTimePayments.isEmpty { Text("Brak płatności jednorazowych.") }
                ForEach(environment.affairsWorkspace.oneTimePayments.sorted { $0.dueDate == $1.dueDate ? $0.id < $1.id : $0.dueDate < $1.dueDate }) { item in
                    financeRow(name: item.title, date: item.dueDate, amount: item.amount, status: item.paid ? "Zapłacone" : "Do zapłaty", edit: { editorTarget = .oneTime(item) }, delete: { confirmDelete("płatność jednorazową") { await environment.deleteOneTimePayment(id: item.id) } }) {
                        Button(item.paid ? "Cofnij opłacenie" : "Oznacz jako opłacone") { Task { await environment.toggleOneTimePayment(id: item.id) } }
                    }
                }
            }
            Section("Cykliczne") {
                if environment.affairsWorkspace.payments.isEmpty { Text("Brak płatności cyklicznych.") }
                ForEach(environment.affairsWorkspace.payments.sorted { $0.nextDueDate == $1.nextDueDate ? $0.id < $1.id : $0.nextDueDate < $1.nextDueDate }) { item in
                    financeRow(name: item.name, date: item.nextDueDate, amount: item.amount, status: item.active ? "Aktywna" : "Nieaktywna", edit: { editorTarget = .payment(item) }, delete: { confirmDelete("płatność cykliczną") { await environment.deleteAffairPayment(id: item.id) } }) {
                        Button(item.active ? "Dezaktywuj" : "Aktywuj") { Task { await environment.setAffairPaymentActive(id: item.id, active: !item.active) } }
                        Button("Przesuń do następnego terminu") { let date = Date(); Task { await environment.advanceAffairPayment(id: item.id, reference: date) } }
                    }
                }
            }
            Section("Subskrypcje") {
                if environment.affairsWorkspace.subscriptions.isEmpty { Text("Brak subskrypcji.") }
                ForEach(environment.affairsWorkspace.subscriptions.sorted { $0.nextBillingDate == $1.nextBillingDate ? $0.id < $1.id : $0.nextBillingDate < $1.nextBillingDate }) { item in
                    financeRow(name: item.name, date: item.nextBillingDate, amount: item.amount, status: item.active ? "Aktywna" : "Nieaktywna", edit: { editorTarget = .subscription(item) }, delete: { confirmDelete("subskrypcję") { await environment.deleteAffairSubscription(id: item.id) } }) {
                        Button(item.active ? "Dezaktywuj" : "Aktywuj") { Task { await environment.setAffairSubscriptionActive(id: item.id, active: !item.active) } }
                        Button("Przesuń do następnego terminu") { let date = Date(); Task { await environment.advanceAffairSubscription(id: item.id, reference: date) } }
                    }
                }
            }
            Section {
                DisclosureGroup("Budżety miesięczne") {
                    if environment.affairsWorkspace.budgets.isEmpty { Text("Nie zapisano budżetu miesięcznego.") }
                    ForEach(environment.affairsWorkspace.budgets) { budget in
                        DisclosureGroup(budget.month) {
                            ForEach(budget.lines) { line in
                                VStack(alignment: .leading) { Text(line.label); Text("Plan \(affairCurrency(line.planned)) · Wykonanie \(affairCurrency(line.actual))").font(.caption) }
                            }
                        }
                    }
                }
            }
        }
    }
    private func financeRow<Actions: View>(name: String, date: String, amount: Double, status: String, edit: @escaping () -> Void, delete: @escaping () -> Void, @ViewBuilder actions: @escaping () -> Actions) -> some View {
        DisclosureGroup {
            Text(RootineAffairAmountPresentation(date: date, amount: amount, revealed: true).detail)
            actions()
            Button("Edytuj", systemImage: "pencil", action: edit)
            Button("Usuń", systemImage: "trash", role: .destructive, action: delete)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.headline)
                Text(RootineAffairAmountPresentation(date: date, amount: amount, revealed: false).detail + " · " + status)
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }.frame(minHeight: 44).accessibilityElement(children: .combine)
        }
    }
    private var documents: some View {
        Section("Dokumenty i ważność") {
            if environment.affairsWorkspace.documents.isEmpty { Text("Nie masz zapisanych dokumentów. Dodaj dokument z menu powyżej.") }
            ForEach(environment.affairsWorkspace.documents.sorted { $0.expiresAt == $1.expiresAt ? $0.id < $1.id : $0.expiresAt < $1.expiresAt }) { item in
                HStack {
                    Button { editorTarget = .document(item) } label: {
                        VStack(alignment: .leading) { Text(item.name).font(.headline); Text(item.holder + " · " + (item.expiresAt.isEmpty ? "Bez terminu ważności" : item.expiresAt)).font(.caption) }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }.buttonStyle(.plain)
                    Menu { Button("Usuń", systemImage: "trash", role: .destructive) { confirmDelete("dokument") { await environment.deleteAffairDocument(id: item.id) } } } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Opcje dokumentu: \(item.name)")
                }
            }
        }
    }
    private var vehicles: some View {
        Group {
            Section("Pojazdy") {
                if environment.affairsWorkspace.vehicles.isEmpty { Text("Dodaj pojazd, aby zapisać jego terminy.") }
                ForEach(environment.affairsWorkspace.vehicles) { item in
                    HStack {
                        Button { editorTarget = .vehicle(item) } label: {
                            VStack(alignment: .leading) { Text(item.name).font(.headline); Text("\(item.registration) · \(item.mileage, specifier: "%g") km").font(.caption) }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.buttonStyle(.plain)
                        Menu {
                            Button("Dodaj termin", systemImage: "calendar.badge.plus") { editorTarget = .vehicleItem(nil, item.id) }
                            Button("Usuń", systemImage: "trash", role: .destructive) { confirmDelete("pojazd wraz ze wszystkimi jego terminami") { await environment.deleteAffairVehicle(id: item.id) } }
                        } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Opcje pojazdu: \(item.name)")
                    }
                }
            }
            Section("Terminy pojazdów") {
                if environment.affairsWorkspace.vehicleItems.isEmpty { Text("Nie ma zapisanych terminów pojazdów.") }
                ForEach(environment.affairsWorkspace.vehicleItems.sorted { $0.dueDate == $1.dueDate ? $0.id < $1.id : $0.dueDate < $1.dueDate }) { item in
                    HStack {
                        Button { Task { await environment.toggleAffairVehicleItem(id: item.id) } } label: { Image(systemName: item.done ? "checkmark.circle.fill" : "circle").frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel("\(item.title): \(item.done ? "cofnij wykonanie" : "oznacz wykonanie")")
                        Button { editorTarget = .vehicleItem(item, item.vehicleId) } label: {
                            VStack(alignment: .leading) {
                                Text(item.title)
                                Text(item.dueDate.isEmpty ? "Bez terminu kalendarzowego" : item.dueDate).font(.caption)
                                if let mileage = item.dueMileage { Text("Przy \(mileage, specifier: "%g") km").font(.caption) }
                            }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.buttonStyle(.plain)
                        Menu { Button("Usuń", systemImage: "trash", role: .destructive) { confirmDelete("termin pojazdu") { await environment.deleteAffairVehicleItem(id: item.id) } } } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }.accessibilityLabel("Opcje terminu: \(item.title)")
                    }
                }
            }
        }
    }
    private func confirmDelete(_ label: String, action: @escaping () async -> Void) { deleteLabel = label; destructiveAction = action }
    private func affairRow(_ matter: AffairMatter) -> some View {
        AffairMatterRow(matter: matter, onSelect: { selectedMatter = matter }, onToggle: { Task { await environment.toggleAffairMatter(id: matter.id) } }, onDelete: { matterToDelete = matter })
    }
}

private enum AffairsModuleView: String, CaseIterable, Identifiable {
    case overview
    case matters
    case finances
    case documents
    case vehicles

    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Przegląd"
        case .matters: return "Sprawy"
        case .finances: return "Finanse"
        case .documents: return "Dokumenty"
        case .vehicles: return "Pojazdy"
        }
    }
}

private enum AffairsEditorTarget: Identifiable {
    case oneTime(AffairOneTimePayment?)
    case payment(AffairRecurringPayment?)
    case subscription(AffairSubscription?)
    case document(AffairDocument?)
    case vehicle(AffairVehicle?)
    case vehicleItem(AffairVehicleItem?, String)

    var id: String {
        switch self {
        case .oneTime(let value): return "one-time-\(value?.id ?? "new")"
        case .payment(let value): return "payment-\(value?.id ?? "new")"
        case .subscription(let value): return "subscription-\(value?.id ?? "new")"
        case .document(let value): return "document-\(value?.id ?? "new")"
        case .vehicle(let value): return "vehicle-\(value?.id ?? "new")"
        case .vehicleItem(let value, let vehicleID): return "vehicle-item-\(value?.id ?? "new")-\(vehicleID)"
        }
    }
}

private struct AffairsMetric: View {
    let value: Int
    let label: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.title3.weight(.bold)).foregroundStyle(tint).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

private struct AffairMatterRow: View {
    let matter: AffairMatter
    let onSelect: () -> Void
    let onToggle: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: matter.status == "done" ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(matter.status == "done" ? RootineTheme.ColorToken.success : MoreModule.affairs.tint)
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(matter.title): \(matter.status == "done" ? "oznacz jako otwarte" : "oznacz jako wykonane")")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: RootineTheme.Spacing.xSmall) {
                        Text(matter.title).font(.subheadline.weight(.medium)).strikethrough(matter.status == "done")
                        if matter.priority == "high" { Text("Ważne").font(.caption2.weight(.bold)).foregroundStyle(RootineTheme.ColorToken.warning) }
                    }
                    Text("\(AffairMatterCategory(rawValue: matter.category)?.label ?? matter.category) · \(matter.dueDate.isEmpty ? "Bez terminu" : matter.dueDate)")
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(matter.title), \(matter.dueDate.isEmpty ? "bez terminu" : matter.dueDate), \(matter.status == "done" ? "zakończona" : "otwarta")")

            Button(action: onDelete) {
                Image(systemName: "trash")
                    .foregroundStyle(RootineTheme.ColorToken.destructive)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Usuń sprawę: \(matter.title)")
        }
        .frame(minHeight: 52)
    }
}

private struct AffairsPaymentRow: View {
    let payment: AffairRecurringPayment

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: payment.automatic ? "arrow.triangle.2.circlepath" : "creditcard")
                .foregroundStyle(RootineTheme.ColorToken.warning)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(payment.name).font(.subheadline.weight(.medium))
                Text("Następna płatność: \(payment.nextDueDate) · \(affairCurrency(payment.amount))")
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}

private struct AffairsInfoRow: View {
    let title: String
    let detail: String
    let image: String
    let tint: Color

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: image).foregroundStyle(tint).frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(detail).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}

private struct AffairsBudgetRow: View {
    let budget: AffairBudgetMonth

    private var planned: Double { AffairMoney.adding(budget.lines.map(\.planned)) }
    private var actual: Double { AffairMoney.adding(budget.lines.map(\.actual)) }

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: "chart.pie").foregroundStyle(RootineTheme.ColorToken.action).frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(budget.month).font(.subheadline.weight(.medium))
                Text("Plan \(affairCurrency(planned)) · Wykonanie \(affairCurrency(actual))")
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Budżet \(budget.month): plan \(affairCurrency(planned)), wykonanie \(affairCurrency(actual))")
    }
}

private func affairCurrency(_ amount: Double) -> String {
    AffairMoney.formatted(amount)
}

private struct AffairEditorDraft {
    var title: String
    var category: String
    var priority: String
    var dueDate: String
    var note: String
}

private struct AffairEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let matter: AffairMatter?
    let onSave: (AffairEditorDraft) -> Void
    let onDelete: (() -> Void)?
    @State private var title: String
    @State private var category: String
    @State private var priority: String
    @State private var dueDate: String
    @State private var note: String

    init(matter: AffairMatter?, onSave: @escaping (AffairEditorDraft) -> Void, onDelete: (() -> Void)? = nil) {
        self.matter = matter
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: matter?.title ?? "")
        _category = State(initialValue: AffairMatterCategory.canonical(matter?.category ?? "dom"))
        _priority = State(initialValue: matter?.priority ?? "normal")
        _dueDate = State(initialValue: matter?.dueDate ?? RootineDate.localDate())
        _note = State(initialValue: matter?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Sprawa") {
                    TextField("Nazwa", text: $title)
                    Picker("Kategoria", selection: $category) {
                        ForEach(AffairMatterCategory.allCases, id: \.rawValue) { category in
                            Text(category.label).tag(category.rawValue)
                        }
                    }
                    Picker("Priorytet", selection: $priority) {
                        Text("Normalny").tag("normal")
                        Text("Ważny").tag("high")
                    }
                    TextField("Termin (RRRR-MM-DD)", text: $dueDate)
                        .keyboardType(.numbersAndPunctuation)
                }
                Section("Notatka") {
                    TextEditor(text: $note).frame(minHeight: 96)
                }
                if let onDelete, matter != nil {
                    Section {
                        Button("Usuń sprawę", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(matter == nil ? "Nowa sprawa" : "Edytuj sprawę")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(AffairEditorDraft(title: title, category: category, priority: priority, dueDate: dueDate, note: note))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !AffairDate.isValid(dueDate.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
            }
        }
    }
}


private struct ModuleIndexStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.listStyle(.plain).scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 44)
            .background(RootineTheme.ColorToken.canvas)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .tint(RootineTheme.ColorToken.action)
    }
}

private func goalStatusLabel(_ status: GoalStatus) -> String {
    switch status { case .planned: return "Planowane"; case .active: return "Aktywne cele"; case .paused: return "Wstrzymane"; case .completed: return "Ukończone"; case .archived: return "Archiwum" }
}
