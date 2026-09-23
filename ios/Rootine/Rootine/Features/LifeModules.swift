import SwiftUI

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
                    TextField("Nazwa", text: $title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kategoria", text: $category, prompt: Text("Kategoria").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kwota (PLN)", text: $amount, prompt: Text("Kwota (PLN)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    TextField("Termin (RRRR-MM-DD)", text: $dueDate, prompt: Text("Termin (RRRR-MM-DD)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
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
                    TextField("Nazwa", text: $name, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kategoria", text: $category, prompt: Text("Kategoria").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kwota (PLN)", text: $amount, prompt: Text("Kwota (PLN)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    Picker("Częstotliwość", selection: $cadence) {
                        Text("Co miesiąc").tag("monthly")
                        Text("Co kwartał").tag("quarterly")
                        Text("Co rok").tag("yearly")
                    }
                    TextField("Najbliższy termin (RRRR-MM-DD)", text: $nextDueDate, prompt: Text("Najbliższy termin (RRRR-MM-DD)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
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
                    TextField("Nazwa", text: $name, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kategoria", text: $category, prompt: Text("Kategoria").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kwota (PLN)", text: $amount, prompt: Text("Kwota (PLN)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    Picker("Częstotliwość", selection: $cadence) {
                        Text("Co miesiąc").tag("monthly")
                        Text("Co kwartał").tag("quarterly")
                        Text("Co rok").tag("yearly")
                    }
                    Picker("Odnowienie", selection: $renewal) {
                        Text("Automatyczne").tag("automatic")
                        Text("Ręczne").tag("manual")
                    }
                    TextField("Kolejne rozliczenie (RRRR-MM-DD)", text: $nextBillingDate, prompt: Text("Kolejne rozliczenie (RRRR-MM-DD)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
                    TextField("Koniec zobowiązania (opcjonalnie)", text: $commitmentEndDate, prompt: Text("Koniec zobowiązania (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
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
                    TextField("Nazwa", text: $name, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    Picker("Kategoria", selection: $category) {
                        Text("Tożsamość").tag("identity")
                        Text("Prawo jazdy").tag("driving")
                        Text("Ubezpieczenie").tag("insurance")
                        Text("Zdrowie").tag("health")
                        Text("Umowa").tag("agreement")
                        Text("Inne").tag("other")
                    }
                    TextField("Osoba / właściciel", text: $holder, prompt: Text("Osoba / właściciel").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Ważny do (RRRR-MM-DD)", text: $expiresAt, prompt: Text("Ważny do (RRRR-MM-DD)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
                    TextField("Przypomnienie (dni wcześniej)", text: $reminderDays, prompt: Text("Przypomnienie (dni wcześniej)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numberPad)
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
        _mileage = State(initialValue: vehicle.map { String(Int($0.mileage)) } ?? "0")
    }

    private var parsedMileage: Double? { Double(mileage.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")) }
    private var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && parsedMileage.map { $0.isFinite && $0 >= 0 } == true }

    var body: some View {
        NavigationStack {
            Form {
                Section("Pojazd") {
                    TextField("Nazwa", text: $name, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Numer rejestracyjny", text: $registration, prompt: Text("Numer rejestracyjny").foregroundColor(RootineTheme.ColorToken.secondaryText)).textInputAutocapitalization(.characters)
                    TextField("Przebieg (km)", text: $mileage, prompt: Text("Przebieg (km)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numberPad)
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
        _dueMileage = State(initialValue: item?.dueMileage.map { String(Int($0)) } ?? "")
        _note = State(initialValue: item?.note ?? "")
    }

    private var parsedDueMileage: Double? {
        let value = dueMileage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        return Double(value.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
    }
    private var valid: Bool {
        !vehicleID.isEmpty && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && AffairsWorkspaceRules.vehicleItemTypes.contains(type)
            && AffairDate.isValid(dueDate)
            && (parsedDueMileage == nil || (parsedDueMileage?.isFinite == true && parsedDueMileage! >= 0))
            && (!dueDate.isEmpty || parsedDueMileage != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Termin pojazdu") {
                    Picker("Pojazd", selection: $vehicleID) {
                        ForEach(vehicles) { vehicle in Text(vehicle.name).tag(vehicle.id) }
                    }
                    TextField("Nazwa", text: $title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    Picker("Typ", selection: $type) {
                        Text("Ubezpieczenie").tag("insurance")
                        Text("Przegląd").tag("inspection")
                        Text("Serwis").tag("service")
                        Text("Opony").tag("tires")
                        Text("Leasing").tag("lease")
                        Text("Gwarancja").tag("warranty")
                        Text("Inne").tag("other")
                    }
                    TextField("Termin (opcjonalnie, RRRR-MM-DD)", text: $dueDate, prompt: Text("Termin (opcjonalnie, RRRR-MM-DD)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
                    TextField("Przebieg graniczny (opcjonalnie)", text: $dueMileage, prompt: Text("Przebieg graniczny (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numberPad)
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

struct TravelModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingTripEditor = false
    @State private var selectedTrip: TravelRecord?
    @State private var editingTrip: TravelRecord?
    @State private var deletedTrip: TravelRecord?
    @State private var tripToDelete: TravelRecord?
    @State private var showingCompleted = false

    private var trips: [TravelRecord] { environment.travelWorkspace.trips }
    private var visibleTrips: [TravelRecord] {
        trips.filter { ($0.status == "completed") == showingCompleted && $0.archivedAt == nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Picker("Podróże", selection: $showingCompleted) {
                Text("Zaplanowane").tag(false)
                Text("Wspomnienia").tag(true)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("travel.filter")

            if visibleTrips.isEmpty {
                ModuleEmptyCard(title: showingCompleted ? "Miejsce na wspomnienia" : "Dokąd tym razem?", detail: showingCompleted ? "Ukończone podróże zachowają tutaj swój plan i listę bagażu." : "Dodaj kierunek. Plan podróży i pakowanie znajdziesz w jednym miejscu.", systemImage: showingCompleted ? "photo.on.rectangle.angled" : "airplane", tint: RootineTheme.ColorToken.action)
                if !showingCompleted {
                    ModuleActionButton(title: "Zaplanuj podróż", systemImage: "plus", tint: RootineTheme.ColorToken.action) { isShowingTripEditor = true }
                }
            } else {
                HStack {
                    Text(showingCompleted ? "ODBYTE PODRÓŻE" : "TWOJE KIERUNKI")
                        .font(.caption.weight(.semibold)).tracking(1.1)
                    Spacer()
                    Text("\(visibleTrips.count)").font(.caption.monospacedDigit())
                }
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                ForEach(visibleTrips) { trip in
                    TravelTripCard(
                        trip: trip,
                        onDelete: { tripToDelete = trip },
                        onEdit: { editingTrip = trip },
                        onSelect: { selectedTrip = trip },
                        onComplete: { Task { await environment.setTravelStatus(trip.status == "completed" ? "planning" : "completed", tripID: trip.id) } }
                    )
                }
            }
        }
        .rootineScreenChrome(title: "Podróże", addLabel: "Dodaj podróż", onAdd: { isShowingTripEditor = true })
        .sheet(isPresented: $isShowingTripEditor) {
            TripEditorSheet { destination, dateRange, nights in
                Task { await environment.addTrip(destination: destination, dateRange: dateRange, nights: nights) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingTrip) { trip in
            TripEditorSheet(existing: trip) { destination, dateRange, nights in
                Task { await environment.updateTrip(id: trip.id, destination: destination, dateRange: dateRange, nights: nights) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedTrip) { trip in
            TravelDetailSheet(
                trip: trip,
                onEdit: { editingTrip = trip },
                onDelete: {
                    selectedTrip = nil
                    delete(trip)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć podróż?",
            isPresented: Binding(
                get: { tripToDelete != nil },
                set: { isPresented in
                    if !isPresented { tripToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let tripToDelete {
                Button("Usuń podróż", role: .destructive) {
                    delete(tripToDelete)
                    self.tripToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedTrip {
                RootineUndoBanner(message: "Usunięto podróż do \(deletedTrip.destination)") {
                    let trip = deletedTrip
                    self.deletedTrip = nil
                    Task { await environment.restoreTrip(trip) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    private func delete(_ trip: TravelRecord) {
        deletedTrip = trip
        Task { await environment.deleteTrip(id: trip.id) }
    }
}

private struct TravelTripCard: View {
    let trip: TravelRecord
    let onDelete: () -> Void
    let onEdit: () -> Void
    let onSelect: () -> Void
    let onComplete: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Label(travelStatusLabel(trip.status), systemImage: trip.status == "completed" ? "checkmark.circle" : "airplane")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(RootineTheme.ColorToken.action)
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(trip.destination).font(.title2.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange)
                        .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Divider().overlay(RootineTheme.ColorToken.separator)
                HStack(spacing: 20) {
                    Label("\(trip.nights) nocy", systemImage: "moon")
                    Label("\(trip.itinerary.count) punktów", systemImage: "map")
                    Spacer(minLength: 0)
                }
                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                if !trip.packingItems.isEmpty {
                    HStack(spacing: 12) {
                        Image(systemName: "suitcase.rolling")
                        ProgressView(value: Double(trip.packingItems.filter(\.packed).count), total: Double(trip.packingItems.count))
                            .tint(RootineTheme.ColorToken.action)
                        Text("\(trip.packingItems.filter(\.packed).count)/\(trip.packingItems.count)")
                            .monospacedDigit()
                    }
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .accessibilityLabel("Spakowano \(trip.packingItems.filter(\.packed).count) z \(trip.packingItems.count)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .rootineSurface()
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("travel.trip.\(trip.id)")
        .rootineSwipeActions(leadingLabel: trip.status == "completed" ? "Przywróć" : "Ukończ", leadingIcon: "checkmark", onLeading: onComplete, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: onEdit)
        .contextMenu {
            Button(action: onEdit) { Label("Edytuj podróż", systemImage: "pencil") }
            Button(action: onComplete) { Label(trip.status == "completed" ? "Przywróć do planów" : "Podróż ukończona", systemImage: "checkmark.circle") }
            Button(role: .destructive, action: onDelete) {
                Label("Usuń podróż", systemImage: "trash")
            }
        }
    }
}

private struct TravelDetailSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let trip: TravelRecord
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false
    @State private var section = 0
    @State private var itineraryDraft: TravelItineraryItem?
    @State private var itineraryToDelete: TravelItineraryItem?
    @State private var packingToDelete: TravelPackingItem?
    @State private var showingPackingInput = false
    @State private var packingName = ""

    private var currentTrip: TravelRecord {
        environment.travelWorkspace.trips.first { $0.id == trip.id } ?? trip
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Label(trip.destination, systemImage: "airplane")
                            .font(.title2.weight(.bold))
                        Text(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }

                    HStack {
                        Menu {
                            ForEach(["idea", "planning", "ready", "completed"], id: \.self) { status in
                                Button(travelStatusLabel(status)) { Task { await environment.setTravelStatus(status, tripID: trip.id) } }
                            }
                        } label: {
                            Label(travelStatusLabel(currentTrip.status), systemImage: "chevron.up.chevron.down")
                                .font(.subheadline.weight(.medium))
                        }
                        Spacer()
                        Text("\(currentTrip.nights) nocy").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Picker("Szczegóły podróży", selection: $section) {
                        Text("Plan podróży").tag(0)
                        Text("Bagaż").tag(1)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("travel.detail.sections")
                    if section == 0 {
                        if currentTrip.itinerary.isEmpty {
                            ModuleEmptyCard(
                                title: "Pierwszy punkt podróży",
                                detail: "Zapisz dojazd, rezerwację lub miejsce, które chcesz odwiedzić.",
                                systemImage: "map",
                                tint: RootineTheme.ColorToken.action
                            )
                        } else {
                            ForEach(currentTrip.itinerary) { item in
                                itineraryRow(item)
                            }
                        }
                        ModuleActionButton(title: "Dodaj punkt planu", systemImage: "plus", tint: RootineTheme.ColorToken.action) { addItineraryItem() }
                    } else {
                        packingList
                    }
                }
                .padding(RootineTheme.Spacing.large)
            }
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły podróży")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Edytuj podróż", systemImage: "pencil") { onEdit(); dismiss() }
                        Button("Usuń podróż", systemImage: "trash", role: .destructive) { showDeleteConfirmation = true }
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("Opcje podróży")
                }
            }
            .confirmationDialog("Usunąć podróż?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń podróż", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
            .sheet(item: $itineraryDraft) { item in
                TravelItineraryEditor(item: item, trip: currentTrip) { updated in
                    Task { await environment.upsertTravelItineraryItem(tripID: trip.id, item: updated) }
                }
            }
            .alert("Dodaj do bagażu", isPresented: $showingPackingInput) {
                TextField("Co zabierasz?", text: $packingName, prompt: Text("Co zabierasz?").foregroundColor(RootineTheme.ColorToken.secondaryText))
                Button("Anuluj", role: .cancel) { packingName = "" }
                Button("Dodaj") {
                    let name = packingName
                    packingName = ""
                    Task { await environment.addTravelPackingItem(tripID: trip.id, label: name) }
                }.disabled(packingName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .confirmationDialog("Usunąć element?", isPresented: Binding(get: { itineraryToDelete != nil || packingToDelete != nil }, set: { if !$0 { itineraryToDelete = nil; packingToDelete = nil } }), titleVisibility: .visible) {
                Button("Usuń", role: .destructive) {
                    if let item = itineraryToDelete { Task { await environment.deleteTravelItineraryItem(tripID: trip.id, itemID: item.id) } }
                    if let item = packingToDelete { Task { await environment.deleteTravelPackingItem(tripID: trip.id, itemID: item.id) } }
                    itineraryToDelete = nil
                    packingToDelete = nil
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }

    private func addItineraryItem() {
        itineraryDraft = TravelItineraryItem(id: UUID().uuidString, date: currentTrip.startDate.isEmpty ? RootineDate.localDate() : currentTrip.startDate, time: "", title: "", location: "", kind: "activity", note: "", reserved: false)
    }

    private func itineraryRow(_ item: TravelItineraryItem) -> some View {
        Button { itineraryDraft = item } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 4) {
                    Text(item.time.isEmpty ? "—" : item.time).font(.caption.weight(.semibold)).monospacedDigit()
                    Image(systemName: item.reserved ? "checkmark.seal.fill" : "mappin")
                }
                .foregroundStyle(RootineTheme.ColorToken.action).frame(width: 48)
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text([lifeDateLabel(item.day), item.detail].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .lineLimit(3)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading).rootineSurface()
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("travel.itinerary.\(item.id)")
        .rootineSwipeActions(leadingLabel: item.reserved ? "Cofnij" : "Rezerwacja", leadingIcon: "checkmark.seal", onLeading: {
            var updated = item
            updated.reserved.toggle()
            Task { await environment.upsertTravelItineraryItem(tripID: trip.id, item: updated) }
        }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { itineraryDraft = item })
        .contextMenu {
            Button("Edytuj", systemImage: "pencil") { itineraryDraft = item }
            Button("Przesuń na początek", systemImage: "arrow.up.to.line") {
                if let first = currentTrip.itinerary.first { Task { await environment.moveTravelItineraryItem(tripID: trip.id, itemID: item.id, beforeID: first.id) } }
            }
            Button("Usuń punkt", systemImage: "trash", role: .destructive) { itineraryToDelete = item }
        }
        .draggable("travel-itinerary:\(trip.id):\(item.id)")
        .dropDestination(for: String.self) { values, _ in
            let prefix = "travel-itinerary:\(trip.id):"
            guard let value = values.first, value.hasPrefix(prefix) else { return false }
            let source = String(value.dropFirst(prefix.count))
            guard source != item.id else { return false }
            Task { await environment.moveTravelItineraryItem(tripID: trip.id, itemID: source, beforeID: item.id) }
            return true
        }
    }

    private var packingList: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Spakowane").font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(currentTrip.packingItems.filter(\.packed).count) z \(currentTrip.packingItems.count)")
                    .font(.subheadline.monospacedDigit()).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            if currentTrip.packingItems.isEmpty {
                Text("Dodaj rzeczy, które zabierasz. Odhaczaj je podczas pakowania.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ForEach(currentTrip.packingItems) { item in
                Button { Task { await environment.toggleTravelPackingItem(tripID: trip.id, itemID: item.id) } } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.packed ? "checkmark.square.fill" : "square")
                            .foregroundStyle(item.packed ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                        Text(item.label).strikethrough(item.packed).foregroundStyle(RootineTheme.ColorToken.primaryText)
                        Spacer()
                        if item.quantity > 1 { Text("×\(item.quantity)").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                    }.frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .opacity(item.packed ? 0.55 : 1)
                .accessibilityLabel("\(item.label), \(item.packed ? "spakowane" : "do spakowania")")
                .contextMenu { Button("Usuń z bagażu", systemImage: "trash", role: .destructive) { packingToDelete = item } }
            }
            ModuleActionButton(title: "Dodaj do bagażu", systemImage: "plus", tint: RootineTheme.ColorToken.action) { showingPackingInput = true }
        }
        .rootineSurface()
    }
}

private struct TravelItineraryEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var item: TravelItineraryItem
    let trip: TravelRecord
    let onSave: (TravelItineraryItem) -> Void

    init(item: TravelItineraryItem, trip: TravelRecord, onSave: @escaping (TravelItineraryItem) -> Void) {
        var draft = item
        // Legacy entries stored their description only in `detail`.
        // Make it editable before rebuilding that field when saving.
        if draft.location.isEmpty && draft.note.isEmpty && !draft.detail.isEmpty {
            draft.note = draft.detail
        }
        _item = State(initialValue: draft)
        self.trip = trip
        self.onSave = onSave
    }

    private var valid: Bool {
        guard !item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        var candidate = item
        candidate.date = item.day
        var updated = trip
        updated.itinerary.removeAll { $0.id == candidate.id }
        updated.itinerary.append(candidate)
        return rootineValidateTravelWorkspace(TravelWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), trips: [updated])).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Punkt planu") {
                    TextField("Nazwa", text: $item.title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Dzień lub data", text: $item.day, prompt: Text("Dzień lub data").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    if !trip.startDate.isEmpty {
                        Text("Data RRRR-MM-DD w zakresie \(lifeDateLabel(trip.startDate)) – \(lifeDateLabel(trip.endDate)).")
                            .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    TextField("Godzina (opcjonalnie)", text: $item.time, prompt: Text("Godzina (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
                    TextField("Miejsce", text: $item.location, prompt: Text("Miejsce").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    Toggle("Rezerwacja potwierdzona", isOn: $item.reserved)
                }
                Section("Notatka") { TextField("Dodatkowe informacje", text: $item.note, prompt: Text("Dodatkowe informacje").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical).lineLimit(3...6) }
            }
            .navigationTitle("Punkt podróży").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        item.date = item.day
                        item.detail = [item.location, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
                        onSave(item)
                        dismiss()
                    }.disabled(!valid)
                }
            }
        }
    }
}

private func travelStatusLabel(_ status: String) -> String {
    switch status {
    case "idea": return "Pomysł"
    case "ready": return "Gotowa do drogi"
    case "completed": return "Podróż ukończona"
    default: return "W planach"
    }
}

private func lifeDateLabel(_ value: String) -> String {
    guard RootineDate.isLocalDateKey(value) else { return value }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: value) else { return value }
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
}

private func healthEnergyLabel(_ value: Int) -> String {
    ["", "Dziś potrzebuję odpoczynku", "Spokojny, zwyczajny dzień", "Mam dobrą energię", "Dziś mam dużo energii"][min(max(value, 1), 4)]
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Podróż") {
                    LabeledContent("Miejsce") {
                        TextField("Miejsce", text: $destination, prompt: Text("Miejsce").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Miejsce")
                            .frame(minHeight: 44)
                    }
                    LabeledContent("Termin") {
                        TextField("Termin", text: $dateRange, prompt: Text("Termin").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Termin")
                            .frame(minHeight: 44)
                    }
                    LabeledContent("Liczba nocy") {
                        TextField("Liczba nocy", text: $nights, prompt: Text("Liczba nocy").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Liczba nocy")
                            .frame(minHeight: 44)
                    }
                }
            }
            .navigationTitle(existing == nil ? "Dodaj podróż" : "Edytuj podróż")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(destination, dateRange, Int(nights) ?? 1)
                        dismiss()
                    }
                    .disabled(destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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

struct HealthModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingReminderEditor = false
    @State private var selectedReminder: HealthReminder?
    @State private var editingReminder: HealthReminder?
    @State private var reminderToDelete: HealthReminder?
    @State private var deletedReminder: HealthReminder?
    @State private var editingCheckIn: HealthCheckIn?
    @State private var checkInToDelete: HealthCheckIn?
    @State private var deletedCheckIn: HealthCheckIn?
    @State private var showingHistory = false

    private var water: Double {
        let key = RootineDate.localDate()
        return environment.nutritionWorkspace.days[key]?.waterMl ?? 0
    }

    private var todayEnergy: Int? {
        environment.healthWorkspace.checkIns[RootineDate.localDate()]?.energy
    }

    private var todayEnergyLabel: String {
        guard let energy = todayEnergy else { return "Nieuzupełnione" }
        return "\(energy)/4"
    }

    private var todayCheckIn: HealthCheckIn? {
        environment.healthWorkspace.checkIns[RootineDate.localDate()]
    }

    private var checkInHistory: [HealthCheckIn] {
        environment.healthWorkspace.checkInHistory(limit: 7)
    }

    private var healthMetrics: HealthMetrics {
        environment.healthWorkspace.metrics(historyDays: 7)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack {
                    Text("Samopoczucie").font(.headline)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Spacer()
                    Button { editTodayCheckIn() } label: { Image(systemName: "square.and.pencil").frame(width: 44, height: 44) }
                        .buttonStyle(.plain).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .accessibilityLabel("Dodaj notatkę o samopoczuciu")
                }
                Text(todayEnergy.map { healthEnergyLabel($0) } ?? "Zatrzymaj się na chwilę")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                HStack(spacing: 8) {
                    ForEach(Array(["bed.double.fill", "minus.circle.fill", "face.smiling.fill", "bolt.fill"].enumerated()), id: \.element) { index, mood in
                        Button {
                            Task { await environment.setHealthEnergy(index + 1) }
                        } label: {
                            VStack(spacing: 9) {
                                Image(systemName: mood).font(.title3)
                                Text(["Niska", "Średnia", "Dobra", "Wysoka"][index]).font(.caption2.weight(.medium))
                            }
                            .foregroundStyle(todayEnergy == index + 1 ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                            .frame(maxWidth: .infinity, minHeight: 72)
                            .background(todayEnergy == index + 1 ? RootineTheme.ColorToken.action.opacity(0.22) : RootineTheme.ColorToken.elevated)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(todayEnergy == index + 1 ? RootineTheme.ColorToken.action : .clear, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Energia: \(index + 1) z 4")
                        .accessibilityValue(todayEnergy == index + 1 ? "Wybrano" : "Niewybrano")
                        .accessibilityAddTraits(todayEnergy == index + 1 ? [.isSelected] : [])
                        .accessibilityIdentifier("health.energy.\(index + 1)")
                    }
                }
                if let note = todayCheckIn?.note, !note.isEmpty {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    Text("Ostatnie 7 dni").font(.subheadline.weight(.semibold))
                    Spacer()
                    if let average = healthMetrics.averageEnergy {
                        Text("Śr. \(average, specifier: "%.1f")/4")
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                energyWeek
                if !checkInHistory.isEmpty {
                    DisclosureGroup("Historia i notatki", isExpanded: $showingHistory) {
                    ForEach(checkInHistory) { checkIn in
                        Button {
                            editingCheckIn = checkIn
                        } label: {
                            HStack(spacing: RootineTheme.Spacing.small) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lifeDateLabel(checkIn.date))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                    Text(checkIn.note?.isEmpty == false ? checkIn.note! : "Bez notatki")
                                        .font(.caption)
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                        .lineLimit(1)
                                }
                                Spacer()
                                Text("\(checkIn.energy)/4")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(MoreModule.health.tint)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .rootineSwipeActions(leadingLabel: "Edytuj", leadingIcon: "pencil", onLeading: { editingCheckIn = checkIn }, trailingLabel: "Usuń", trailingIcon: "trash", onTrailing: { checkInToDelete = checkIn })
                        .contextMenu {
                            Button("Edytuj wpis", systemImage: "pencil") { editingCheckIn = checkIn }
                            Button(role: .destructive) {
                                checkInToDelete = checkIn
                            } label: {
                                Label("Usuń check-in", systemImage: "trash")
                            }
                        }
                        if checkIn.id != checkInHistory.last?.id {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                    }
                    .font(.subheadline)
                    .tint(RootineTheme.ColorToken.secondaryText)
                }
            }
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    Text("Przypomnienia").font(.headline)
                    Spacer()
                    Text("\(environment.healthWorkspace.reminders.filter { $0.completedDates.contains(RootineDate.localDate()) }.count) z \(environment.healthWorkspace.reminders.count)")
                        .font(.caption.monospacedDigit()).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                if environment.healthWorkspace.reminders.isEmpty {
                    Text("Zapisz coś, o czym chcesz pamiętać każdego dnia.")
                        .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                } else {
                    ForEach(Array(environment.healthWorkspace.reminders.enumerated()), id: \.element.id) { index, reminder in
                        HealthReminderRow(
                            title: reminder.title,
                            detail: reminder.detail,
                            tint: RootineTheme.ColorToken.action,
                            isCompleted: reminder.completedDates.contains(RootineDate.localDate()),
                            onToggle: { Task { await environment.toggleHealthReminder(id: reminder.id) } },
                            onSelect: { selectedReminder = reminder }
                        )
                        .frame(minHeight: 52)
                        .opacity(reminder.completedDates.contains(RootineDate.localDate()) ? 0.55 : 1)
                        .accessibilityIdentifier("health.reminder.\(reminder.id)")
                        .contextMenu {
                            Button { selectedReminder = reminder } label: {
                                Label("Szczegóły przypomnienia", systemImage: "info.circle")
                            }
                            Button { editingReminder = reminder } label: {
                                Label("Edytuj przypomnienie", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                requestDelete(reminder)
                            } label: {
                                Label("Usuń przypomnienie", systemImage: "trash")
                            }
                        }
                        .rootineSwipeActions(leadingLabel: reminder.completedDates.contains(RootineDate.localDate()) ? "Cofnij" : "Wykonane", leadingIcon: "checkmark", onLeading: { Task { await environment.toggleHealthReminder(id: reminder.id) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editingReminder = reminder })
                        if index < environment.healthWorkspace.reminders.count - 1 {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
                ModuleActionButton(title: "Dodaj przypomnienie", systemImage: "plus", tint: RootineTheme.ColorToken.action) {
                    isShowingReminderEditor = true
                }
            }
            .rootineSurface()
        }
        .rootineScreenChrome(title: "Zdrowie", addLabel: "Dodaj przypomnienie", onAdd: { isShowingReminderEditor = true })
        .sheet(isPresented: $isShowingReminderEditor) {
            HealthReminderEditorSheet { title, detail in
                Task { await environment.addHealthReminder(title: title, detail: detail) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingReminder) { reminder in
            HealthReminderEditorSheet(existing: reminder) { title, detail in
                Task { await environment.updateHealthReminder(id: reminder.id, title: title, detail: detail) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingCheckIn) { checkIn in
            HealthCheckInEditorSheet(existing: checkIn) { energy, note in
                Task { await environment.updateHealthCheckIn(date: checkIn.date, energy: energy, note: note) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedReminder) { reminder in
            HealthReminderDetailSheet(
                reminder: reminder,
                isCompleted: reminder.completedDates.contains(RootineDate.localDate()),
                onToggle: {
                    Task { await environment.toggleHealthReminder(id: reminder.id) }
                },
                onEdit: {
                    selectedReminder = nil
                    editingReminder = reminder
                },
                onDelete: {
                    selectedReminder = nil
                    delete(reminder)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć przypomnienie?",
            isPresented: Binding(
                get: { reminderToDelete != nil },
                set: { isPresented in
                    if !isPresented { reminderToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let reminderToDelete {
                Button("Usuń przypomnienie", role: .destructive) {
                    delete(reminderToDelete)
                    self.reminderToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog(
            "Usunąć check-in?",
            isPresented: Binding(
                get: { checkInToDelete != nil },
                set: { isPresented in
                    if !isPresented { checkInToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let checkInToDelete {
                Button("Usuń check-in", role: .destructive) {
                    delete(checkInToDelete)
                    self.checkInToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: RootineTheme.Spacing.xSmall) {
                if let deletedReminder {
                    RootineUndoBanner(message: "Usunięto przypomnienie") {
                        let reminder = deletedReminder
                        self.deletedReminder = nil
                        Task { await environment.restoreHealthReminder(reminder) }
                    }
                }
                if let deletedCheckIn {
                    RootineUndoBanner(message: "Usunięto check-in") {
                        let checkIn = deletedCheckIn
                        self.deletedCheckIn = nil
                        Task { await environment.restoreHealthCheckIn(checkIn) }
                    }
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.small)
        }
    }

    private func requestDelete(_ reminder: HealthReminder) {
        reminderToDelete = reminder
    }

    private func editTodayCheckIn() {
        editingCheckIn = todayCheckIn ?? HealthCheckIn(date: RootineDate.localDate(), energy: todayEnergy ?? 3, note: nil, updatedAt: RootineDate.isoTimestamp())
    }

    private var energyWeek: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(0..<7) { offset in
                let date = Calendar.current.date(byAdding: .day, value: offset - 6, to: Date()) ?? Date()
                let key = RootineDate.localDate(date)
                let checkIn = environment.healthWorkspace.checkIns[key]
                Button {
                    editingCheckIn = checkIn ?? HealthCheckIn(date: key, energy: 3, note: nil, updatedAt: RootineDate.isoTimestamp())
                } label: {
                    VStack(spacing: 7) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 5).fill(RootineTheme.ColorToken.elevated)
                            if let checkIn {
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(RootineTheme.ColorToken.action.opacity(offset == 6 ? 1 : 0.48))
                                    .frame(height: CGFloat(checkIn.energy) * 12)
                            }
                        }
                        .frame(width: 22, height: 48)
                        Text(date.formatted(.dateTime.weekday(.narrow)).uppercased())
                            .font(.caption2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    .frame(maxWidth: .infinity, minHeight: 74)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(lifeDateLabel(key)), \(checkIn.map { "energia \($0.energy) z 4" } ?? "brak wpisu")")
            }
        }
        .padding(.vertical, 8)
    }

    private func delete(_ reminder: HealthReminder) {
        deletedReminder = reminder
        Task { await environment.deleteHealthReminder(id: reminder.id) }
    }

    private func delete(_ checkIn: HealthCheckIn) {
        deletedCheckIn = checkIn
        Task { await environment.deleteHealthCheckIn(date: checkIn.date) }
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
                    TextField("Treść", text: $title, prompt: Text("Treść").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Kiedy? (opcjonalnie)", text: $detail, prompt: Text("Kiedy? (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText))
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
                    TextField("Opcjonalnie", text: $note, prompt: Text("Opcjonalnie").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
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

struct AffairsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var view: AffairsModuleView = .overview
    @State private var showingMatterEditor = false
    @State private var selectedMatter: AffairMatter?
    @State private var matterToDelete: AffairMatter?
    @State private var deletedMatter: AffairMatter?
    @State private var editorTarget: AffairsEditorTarget?
    @State private var showingAddChoice = false
    @State private var deletionTarget: AffairsEditorTarget?
    @State private var showsCompleted = true
    @State private var budgetToEdit: AffairBudgetMonth?

    private var activeMatters: [AffairMatter] {
        environment.affairsWorkspace.matters
            .filter { $0.status != "done" }
            .sorted { lhs, rhs in
                if lhs.priority != rhs.priority { return lhs.priority == "high" }
                return lhs.dueDate < rhs.dueDate
            }
    }

    private var upcomingPayments: [AffairRecurringPayment] {
        environment.affairsWorkspace.payments
            .filter(\.active)
            .sorted { $0.nextDueDate < $1.nextDueDate }
    }

    private var openDocuments: [AffairDocument] {
        environment.affairsWorkspace.documents.sorted { $0.expiresAt < $1.expiresAt }
    }

    private var vehicleItems: [AffairVehicleItem] {
        environment.affairsWorkspace.vehicleItems
            .sorted { $0.dueDate < $1.dueDate }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(AffairsModuleView.allCases) { option in
                        Button { withAnimation(.easeInOut(duration: 0.2)) { view = option } } label: {
                            Text(option.title).font(.subheadline.weight(view == option ? .semibold : .regular))
                                .padding(.horizontal, 16).frame(minHeight: 44)
                                .foregroundStyle(view == option ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                                .background(view == option ? RootineTheme.ColorToken.elevated : .clear)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("affairs.section.\(option.rawValue)")
                        .accessibilityAddTraits(view == option ? [.isSelected] : [])
                    }
                }
            }
            .accessibilityLabel("Widok modułu Pozostałe")

            switch view {
            case .overview:
                overview
            case .matters:
                matters
            case .finances:
                finances
            case .documents:
                documents
            case .vehicles:
                vehicles
            }
        }
        .rootineScreenChrome(title: "Pozostałe", addLabel: "Dodaj do spraw", onAdd: { addForCurrentSection() })
        .confirmationDialog("Co chcesz dodać?", isPresented: $showingAddChoice, titleVisibility: .visible) {
            Button("Sprawę lub termin") { showingMatterEditor = true }
            Button("Płatność jednorazową") { editorTarget = .oneTime(nil) }
            Button("Płatność cykliczną") { editorTarget = .payment(nil) }
            Button("Subskrypcję") { editorTarget = .subscription(nil) }
            Button("Dokument") { editorTarget = .document(nil) }
            Button("Pojazd") { editorTarget = .vehicle(nil) }
            if let vehicle = environment.affairsWorkspace.vehicles.first {
                Button("Termin pojazdu") { editorTarget = .vehicleItem(nil, vehicle.id) }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog("Usunąć zapis?", isPresented: Binding(get: { deletionTarget != nil }, set: { if !$0 { deletionTarget = nil } }), titleVisibility: .visible) {
            Button("Usuń", role: .destructive) { deleteSelectedRecord() }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(deletionMessage)
        }
        .sheet(item: $budgetToEdit) { budget in
            AffairBudgetEditor(budget: budget, existingMonths: Set(environment.affairsWorkspace.budgets.map(\.month))) { updated in
                Task { await environment.upsertAffairBudgetMonth(updated) }
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
                    deletedMatter = matterToDelete
                    Task { await environment.deleteAffairMatter(id: matterToDelete.id) }
                    self.matterToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedMatter {
                RootineUndoBanner(message: "Usunięto sprawę") {
                    let matter = deletedMatter
                    self.deletedMatter = nil
                    Task { await environment.restoreAffairMatter(matter) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    @ViewBuilder
    private var overview: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack {
                Text("Do załatwienia").font(.headline)
                Spacer()
                Text("\(activeMatters.count)").font(.subheadline.monospacedDigit()).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            if activeMatters.isEmpty {
                Text("Wszystkie bieżące sprawy są załatwione.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else {
                ForEach(activeMatters.prefix(3)) { matter in
                    affairRow(matter)
                }
            }
            ModuleActionButton(title: "Dodaj sprawę", systemImage: "plus", tint: RootineTheme.ColorToken.action) {
                showingMatterEditor = true
            }
        }
        .rootineSurface()
        if !upcomingPayments.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Najbliższe płatności").font(.headline)
                    Spacer()
                    Button("Wszystkie") { view = .finances }.font(.caption.weight(.medium)).frame(minHeight: 44)
                }
                ForEach(upcomingPayments.prefix(3)) { payment in recurringPaymentRow(payment) }
            }
            .rootineSurface()
        }
        if !openDocuments.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Ważność dokumentów").font(.headline)
                    Spacer()
                    Button("Wszystkie") { view = .documents }.font(.caption.weight(.medium)).frame(minHeight: 44)
                }
                ForEach(openDocuments.prefix(2)) { document in documentRow(document) }
            }
            .rootineSurface()
        }
    }

    @ViewBuilder
    private var matters: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack {
                Text("Sprawy i terminy").font(.headline)
                Spacer()
                Menu {
                    Toggle("Pokaż zakończone", isOn: $showsCompleted)
                } label: { Image(systemName: "line.3.horizontal.decrease").frame(width: 44, height: 44) }
                .accessibilityLabel("Filtry spraw")
            }
            if environment.affairsWorkspace.matters.isEmpty {
                ModuleEmptyCard(title: "Ważne rzeczy w jednym miejscu", detail: "Zapisz termin, sprawę urzędową lub drobne zobowiązanie.", systemImage: "checklist.checked", tint: RootineTheme.ColorToken.action)
            } else {
                ForEach(environment.affairsWorkspace.matters.filter { showsCompleted || $0.status != "done" }.sorted { $0.dueDate < $1.dueDate }) { matter in
                    affairRow(matter)
                }
            }
            ModuleActionButton(title: "Dodaj sprawę", systemImage: "plus", tint: RootineTheme.ColorToken.action) {
                showingMatterEditor = true
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var finances: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Płatności jednorazowe").font(.headline)
                Spacer()
                Button { editorTarget = .oneTime(nil) } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                    .accessibilityLabel("Dodaj płatność jednorazową")
            }
            if environment.affairsWorkspace.oneTimePayments.isEmpty {
                Text("Rachunki i jednorazowe wydatki, które chcesz opłacić.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ForEach(environment.affairsWorkspace.oneTimePayments.sorted { $0.dueDate < $1.dueDate }) { payment in
                oneTimePaymentRow(payment)
            }
        }.rootineSurface()

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Stałe płatności").font(.headline)
                Spacer()
                Button { editorTarget = .payment(nil) } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                    .accessibilityLabel("Dodaj płatność cykliczną")
            }
            if environment.affairsWorkspace.payments.isEmpty {
                Text("Czynsz, rata, ubezpieczenie — zapisz ich kolejne terminy.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ForEach(environment.affairsWorkspace.payments.sorted { $0.nextDueDate < $1.nextDueDate }) { payment in
                recurringPaymentRow(payment)
            }
        }.rootineSurface()

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Subskrypcje").font(.headline)
                Spacer()
                Button { editorTarget = .subscription(nil) } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                    .accessibilityLabel("Dodaj subskrypcję")
            }
            if environment.affairsWorkspace.subscriptions.isEmpty {
                Text("Śledź odnowienia swoich usług.").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ForEach(environment.affairsWorkspace.subscriptions.sorted { $0.nextBillingDate < $1.nextBillingDate }) { subscription in
                Button { editorTarget = .subscription(subscription) } label: {
                    lifeMoneyRow(title: subscription.name, detail: subscription.active ? "Odnowienie \(lifeDateLabel(subscription.nextBillingDate))" : "Wstrzymana", amount: subscription.amount, image: "repeat")
                }
                .buttonStyle(.plain).opacity(subscription.active ? 1 : 0.5)
                .rootineSwipeActions(leadingLabel: subscription.active ? "Wstrzymaj" : "Wznów", leadingIcon: subscription.active ? "pause" : "play", onLeading: { Task { await environment.setAffairSubscriptionActive(id: subscription.id, active: !subscription.active) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editorTarget = .subscription(subscription) })
                .contextMenu {
                    Button("Edytuj", systemImage: "pencil") { editorTarget = .subscription(subscription) }
                    Button(subscription.active ? "Wstrzymaj" : "Wznów", systemImage: subscription.active ? "pause" : "play") { Task { await environment.setAffairSubscriptionActive(id: subscription.id, active: !subscription.active) } }
                    Button("Usuń", systemImage: "trash", role: .destructive) { deletionTarget = .subscription(subscription) }
                }
            }
        }.rootineSurface()

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Budżet miesięczny").font(.headline)
                Spacer()
                Button {
                    let month = String(RootineDate.localDate().prefix(7))
                    budgetToEdit = environment.affairsWorkspace.budgets.first { $0.month == month } ?? AffairBudgetMonth(month: month, lines: [])
                } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                .accessibilityLabel("Uzupełnij budżet miesiąca")
            }
            if environment.affairsWorkspace.budgets.isEmpty {
                Text("Zestaw planowane i rzeczywiste kwoty w swoich kategoriach.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ForEach(environment.affairsWorkspace.budgets.sorted { $0.month > $1.month }) { budget in
                Button { budgetToEdit = budget } label: { AffairsBudgetRow(budget: budget) }.buttonStyle(.plain)
            }
        }.rootineSurface()
    }

    @ViewBuilder
    private var documents: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Dokumenty", image: "doc.text")
            if openDocuments.isEmpty {
                ModuleEmptyCard(title: "Ważne daty pod ręką", detail: "Zapisz termin ważności dokumentu i wyprzedzenie przypomnienia.", systemImage: "doc.badge.plus", tint: RootineTheme.ColorToken.action)
            } else {
                ForEach(openDocuments) { document in
                    documentRow(document)
                }
            }
            ModuleActionButton(title: "Dodaj dokument", systemImage: "doc.badge.plus", tint: RootineTheme.ColorToken.action) {
                editorTarget = .document(nil)
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var vehicles: some View {
        if environment.affairsWorkspace.vehicles.isEmpty {
            ModuleEmptyCard(title: "Spokojna głowa za kierownicą", detail: "Dodaj pojazd, a potem jego przegląd, ubezpieczenie lub serwis.", systemImage: "car", tint: RootineTheme.ColorToken.action)
        }
        ForEach(environment.affairsWorkspace.vehicles) { vehicle in
            VStack(alignment: .leading, spacing: 14) {
                Button { editorTarget = .vehicle(vehicle) } label: {
                    AffairsInfoRow(title: vehicle.name, detail: "\(vehicle.registration) · \(Int(vehicle.mileage)) km", image: "car.fill", tint: RootineTheme.ColorToken.action)
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button("Edytuj pojazd", systemImage: "pencil") { editorTarget = .vehicle(vehicle) }
                    Button("Dodaj termin", systemImage: "calendar.badge.plus") { editorTarget = .vehicleItem(nil, vehicle.id) }
                    Button("Usuń pojazd", systemImage: "trash", role: .destructive) { deletionTarget = .vehicle(vehicle) }
                }
                Divider().overlay(RootineTheme.ColorToken.separator)
                ForEach(vehicleItems.filter { $0.vehicleId == vehicle.id }) { item in vehicleItemRow(item) }
                ModuleActionButton(title: "Dodaj termin", systemImage: "calendar.badge.plus", tint: RootineTheme.ColorToken.action) {
                    editorTarget = .vehicleItem(nil, vehicle.id)
                }
            }
            .rootineSurface()
        }
        ModuleActionButton(title: "Dodaj pojazd", systemImage: "plus", tint: RootineTheme.ColorToken.action) {
            editorTarget = .vehicle(nil)
        }
    }

    private func sectionHeader(_ title: String, image: String) -> some View {
        ModuleSectionTitle(title: title, systemImage: image)
    }

    private func affairRow(_ matter: AffairMatter) -> some View {
        AffairMatterRow(matter: matter, onSelect: { selectedMatter = matter }, onToggle: { Task { await environment.toggleAffairMatter(id: matter.id) } }, onDelete: { matterToDelete = matter })
    }

    private func addForCurrentSection() {
        switch view {
        case .overview, .finances: showingAddChoice = true
        case .matters: showingMatterEditor = true
        case .documents: editorTarget = .document(nil)
        case .vehicles: editorTarget = .vehicle(nil)
        }
    }

    private var deletionMessage: String {
        if case .vehicle = deletionTarget { return "Pojazd i powiązane z nim terminy zostaną usunięte." }
        return "Ten zapis zostanie trwale usunięty."
    }

    private func deleteSelectedRecord() {
        guard let target = deletionTarget else { return }
        deletionTarget = nil
        Task {
            switch target {
            case .oneTime(let value): if let value { await environment.deleteOneTimePayment(id: value.id) }
            case .payment(let value): if let value { await environment.deleteAffairPayment(id: value.id) }
            case .subscription(let value): if let value { await environment.deleteAffairSubscription(id: value.id) }
            case .document(let value): if let value { await environment.deleteAffairDocument(id: value.id) }
            case .vehicle(let value): if let value { await environment.deleteAffairVehicle(id: value.id) }
            case .vehicleItem(let value, _): if let value { await environment.deleteAffairVehicleItem(id: value.id) }
            }
        }
    }

    private func recurringPaymentRow(_ payment: AffairRecurringPayment) -> some View {
        Button { editorTarget = .payment(payment) } label: {
            lifeMoneyRow(title: payment.name, detail: payment.active ? "Termin \(lifeDateLabel(payment.nextDueDate))\(payment.automatic ? " · automatycznie" : "")" : "Wstrzymana", amount: payment.amount, image: "creditcard")
        }
        .buttonStyle(.plain).opacity(payment.active ? 1 : 0.5)
        .rootineSwipeActions(leadingLabel: payment.active ? "Wstrzymaj" : "Wznów", leadingIcon: payment.active ? "pause" : "play", onLeading: { Task { await environment.setAffairPaymentActive(id: payment.id, active: !payment.active) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editorTarget = .payment(payment) })
        .contextMenu {
            Button("Edytuj płatność", systemImage: "pencil") { editorTarget = .payment(payment) }
            Button(payment.active ? "Wstrzymaj" : "Wznów", systemImage: payment.active ? "pause" : "play") { Task { await environment.setAffairPaymentActive(id: payment.id, active: !payment.active) } }
            Button("Usuń", systemImage: "trash", role: .destructive) { deletionTarget = .payment(payment) }
        }
    }

    private func oneTimePaymentRow(_ payment: AffairOneTimePayment) -> some View {
        HStack(spacing: 4) {
            Button { Task { await environment.toggleOneTimePayment(id: payment.id) } } label: {
                Image(systemName: payment.paid ? "checkmark.square.fill" : "square")
                    .foregroundStyle(payment.paid ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                    .frame(width: 40, height: 44)
            }
            .buttonStyle(.plain).accessibilityLabel(payment.paid ? "Cofnij opłacenie" : "Oznacz jako opłacone")
            Button { editorTarget = .oneTime(payment) } label: {
                lifeMoneyRow(title: payment.title, detail: payment.paid ? "Opłacone" : "Do \(lifeDateLabel(payment.dueDate))", amount: payment.amount, image: nil)
            }.buttonStyle(.plain)
        }
        .opacity(payment.paid ? 0.55 : 1)
        .rootineSwipeActions(leadingLabel: payment.paid ? "Cofnij" : "Opłacone", leadingIcon: "checkmark", onLeading: { Task { await environment.toggleOneTimePayment(id: payment.id) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editorTarget = .oneTime(payment) })
        .contextMenu {
            Button("Edytuj płatność", systemImage: "pencil") { editorTarget = .oneTime(payment) }
            Button("Usuń", systemImage: "trash", role: .destructive) { deletionTarget = .oneTime(payment) }
        }
    }

    private func documentRow(_ document: AffairDocument) -> some View {
        Button { editorTarget = .document(document) } label: {
            AffairsInfoRow(title: document.name, detail: "\(document.holder) · \(document.expiresAt.isEmpty ? "bez terminu" : "do \(lifeDateLabel(document.expiresAt))")", image: "doc.text", tint: !document.expiresAt.isEmpty && document.expiresAt < RootineDate.localDate() ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.action)
        }
        .buttonStyle(.plain)
        .rootineSwipeActions(leadingLabel: "Edytuj", leadingIcon: "pencil", onLeading: { editorTarget = .document(document) }, trailingLabel: "Usuń", trailingIcon: "trash", onTrailing: { deletionTarget = .document(document) })
        .contextMenu {
            Button("Edytuj dokument", systemImage: "pencil") { editorTarget = .document(document) }
            Button("Usuń dokument", systemImage: "trash", role: .destructive) { deletionTarget = .document(document) }
        }
    }

    private func vehicleItemRow(_ item: AffairVehicleItem) -> some View {
        HStack(spacing: 8) {
            Button { Task { await environment.toggleAffairVehicleItem(id: item.id) } } label: {
                Image(systemName: item.done ? "checkmark.square.fill" : "square")
                    .foregroundStyle(item.done ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                    .frame(width: 40, height: 44)
            }.buttonStyle(.plain).accessibilityLabel(item.done ? "Cofnij wykonanie" : "Oznacz jako wykonane")
            Button { editorTarget = .vehicleItem(item, item.vehicleId) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(.subheadline.weight(.medium)).strikethrough(item.done)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text([lifeDateLabel(item.dueDate), item.dueMileage.map { "\(Int($0)) km" } ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }.buttonStyle(.plain)
        }
        .opacity(item.done ? 0.55 : 1)
        .rootineSwipeActions(leadingLabel: item.done ? "Cofnij" : "Wykonane", leadingIcon: "checkmark", onLeading: { Task { await environment.toggleAffairVehicleItem(id: item.id) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editorTarget = .vehicleItem(item, item.vehicleId) })
        .contextMenu {
            Button("Edytuj termin", systemImage: "pencil") { editorTarget = .vehicleItem(item, item.vehicleId) }
            Button("Usuń termin", systemImage: "trash", role: .destructive) { deletionTarget = .vehicleItem(item, item.vehicleId) }
        }
    }
}

private func lifeMoneyRow(title: String, detail: String, amount: Double, image: String?) -> some View {
    HStack(spacing: 12) {
        if let image { Image(systemName: image).foregroundStyle(RootineTheme.ColorToken.action).frame(width: 24) }
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(RootineTheme.ColorToken.primaryText)
            Text(detail).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        Spacer(minLength: 4)
        Text(affairCurrency(amount)).font(.subheadline.weight(.medium)).monospacedDigit()
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
    }.frame(minHeight: 56)
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
                Image(systemName: matter.status == "done" ? "checkmark.square.fill" : "square")
                    .foregroundStyle(matter.status == "done" ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(matter.status == "done" ? "Oznacz jako otwarte" : "Oznacz jako wykonane")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: RootineTheme.Spacing.xSmall) {
                        Text(matter.title).font(.subheadline.weight(.medium)).strikethrough(matter.status == "done")
                        if matter.priority == "high" { Image(systemName: "flag.fill").font(.caption2).foregroundStyle(RootineTheme.ColorToken.warning).accessibilityLabel("Wysoki priorytet") }
                    }
                    Text("\(AffairMatterCategory(rawValue: AffairMatterCategory.canonical(matter.category))?.label ?? matter.category) · \(lifeDateLabel(matter.dueDate))")
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły sprawy: \(matter.title)")

        }
        .frame(minHeight: 52)
        .opacity(matter.status == "done" ? 0.55 : 1)
        .accessibilityIdentifier("affairs.matter.\(matter.id)")
        .rootineSwipeActions(leadingLabel: matter.status == "done" ? "Cofnij" : "Wykonane", leadingIcon: "checkmark", onLeading: onToggle, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: onSelect)
        .contextMenu {
            Button("Edytuj", systemImage: "pencil", action: onSelect)
            Button(matter.status == "done" ? "Oznacz jako otwarte" : "Oznacz jako wykonane", systemImage: "checkmark", action: onToggle)
            Button("Usuń sprawę", systemImage: "trash", role: .destructive, action: onDelete)
        }
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

    private var planned: Double { AffairMoney.adding(budget.lines.filter { $0.kind != "income" }.map(\.planned)) }
    private var actual: Double { AffairMoney.adding(budget.lines.filter { $0.kind != "income" }.map(\.actual)) }

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: "chart.pie").foregroundStyle(RootineTheme.ColorToken.action).frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(budget.month).font(.subheadline.weight(.medium))
                Text("Wydatki \(affairCurrency(actual)) z \(affairCurrency(planned))")
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Budżet \(budget.month): plan \(affairCurrency(planned)), wykonanie \(affairCurrency(actual))")
    }
}

private struct AffairBudgetEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: AffairBudgetMonth
    let existingMonths: Set<String>
    let originalMonth: String?
    let onSave: (AffairBudgetMonth) -> Void

    init(budget: AffairBudgetMonth, existingMonths: Set<String>, onSave: @escaping (AffairBudgetMonth) -> Void) {
        _draft = State(initialValue: budget)
        self.existingMonths = existingMonths
        originalMonth = existingMonths.contains(budget.month) ? budget.month : nil
        self.onSave = onSave
    }

    private var valid: Bool {
        draft.month.count == 7 && RootineDate.isLocalDateKey(draft.month + "-01")
            && (originalMonth.map { draft.month == $0 } ?? !existingMonths.contains(draft.month))
            && draft.lines.allSatisfy { !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.planned.isFinite && $0.actual.isFinite && $0.planned >= 0 && $0.actual >= 0 }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Miesiąc") {
                    if let originalMonth {
                        LabeledContent("Miesiąc", value: originalMonth)
                    } else {
                        TextField("RRRR-MM", text: $draft.month, prompt: Text("RRRR-MM").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.numbersAndPunctuation)
                        if existingMonths.contains(draft.month) {
                            Text("Budżet tego miesiąca już istnieje. Otwórz go na liście, aby go zmienić.")
                                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                    }
                }
                ForEach($draft.lines) { $line in
                    Section {
                        TextField("Nazwa kategorii", text: $line.label, prompt: Text("Nazwa kategorii").foregroundColor(RootineTheme.ColorToken.secondaryText))
                        Picker("Rodzaj", selection: $line.kind) {
                            Text("Przychód").tag("income")
                            Text("Stały wydatek").tag("fixed")
                            Text("Zmienny wydatek").tag("flexible")
                            Text("Oszczędności").tag("savings")
                        }
                        HStack {
                            Text("Plan (PLN)")
                            Spacer()
                            TextField("0", value: $line.planned, format: .number, prompt: Text("0").foregroundColor(RootineTheme.ColorToken.secondaryText)).multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                        }
                        HStack {
                            Text("Rzeczywista kwota")
                            Spacer()
                            TextField("0", value: $line.actual, format: .number, prompt: Text("0").foregroundColor(RootineTheme.ColorToken.secondaryText)).multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                        }
                    }
                }
                .onDelete { draft.lines.remove(atOffsets: $0) }
                .onMove { draft.lines.move(fromOffsets: $0, toOffset: $1) }
                Section {
                    Button("Dodaj kategorię", systemImage: "plus") {
                        draft.lines.append(AffairBudgetLine(id: UUID().uuidString, label: "", kind: "flexible", planned: 0, actual: 0))
                    }
                }
            }
            .navigationTitle("Budżet miesiąca").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") { onSave(draft); dismiss() }.disabled(!valid)
                }
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
        }
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
    @State private var hasDueDate: Bool
    @State private var dueDate: String
    @State private var note: String

    init(matter: AffairMatter?, onSave: @escaping (AffairEditorDraft) -> Void, onDelete: (() -> Void)? = nil) {
        self.matter = matter
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: matter?.title ?? "")
        _category = State(initialValue: AffairMatterCategory.canonical(matter?.category ?? "dom"))
        _priority = State(initialValue: matter?.priority ?? "normal")
        let initialDueDate = matter?.dueDate ?? RootineDate.localDate()
        _hasDueDate = State(initialValue: !initialDueDate.isEmpty)
        _dueDate = State(initialValue: initialDueDate.isEmpty ? RootineDate.localDate() : initialDueDate)
        _note = State(initialValue: matter?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Sprawa") {
                    LabeledContent("Nazwa") {
                        TextField("Nazwa", text: $title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Nazwa")
                            .frame(minHeight: 44)
                    }
                    Picker("Kategoria", selection: $category) {
                        ForEach(AffairMatterCategory.allCases, id: \.rawValue) { category in
                            Text(category.label).tag(category.rawValue)
                        }
                    }
                    Picker("Priorytet", selection: $priority) {
                        Text("Normalny").tag("normal")
                        Text("Ważny").tag("high")
                    }
                    Toggle("Ustaw termin", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Termin", selection: Binding(
                            get: { rootineDate(from: dueDate) ?? Date() },
                            set: { dueDate = RootineDate.localDate($0) }
                        ), displayedComponents: .date)
                    }
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
                        onSave(AffairEditorDraft(title: title, category: category, priority: priority, dueDate: hasDueDate ? dueDate : "", note: note))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
