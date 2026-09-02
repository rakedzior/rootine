import Combine
import Foundation

private enum WorkspaceEncodingError: Error {
    case invalidValue(for: RootineStorageKey)
}

enum RootineWorkspaceArchiveError: LocalizedError, Equatable {
    case unsupportedVersion(Int)
    case unsupportedWorkspaceVersion(key: String, found: Int, supported: Int)
    case accountMismatch
    case noLocalStore

    var errorDescription: String? {
        switch self {
        case .unsupportedVersion(let version):
            return "Ta kopia danych pochodzi z nieobsługiwanej wersji \(version)."
        case .unsupportedWorkspaceVersion(let key, let found, let supported):
            return "Workspace \(key) ma wersję \(found), a ta aplikacja obsługuje wersję \(supported)."
        case .accountMismatch:
            return "Ta kopia należy do innego konta Rootine. Nie zmieniono lokalnych danych."
        case .noLocalStore:
            return "Kopia lokalna będzie dostępna po uruchomieniu sesji konta."
        }
    }
}

enum WorkspaceSyncStatus: Equatable, Sendable {
    case unavailable
    case localOnly(pending: Int)
    case syncing(pending: Int)
    case synced
    case conflict(storageKeys: [String])
}

@MainActor
final class AppEnvironment: ObservableObject {
    @Published private(set) var session: SupabaseSession?
    @Published private(set) var taskWorkspace = TaskWorkspace.empty
    @Published private(set) var nutritionWorkspace = NutritionWorkspace.empty
    @Published private(set) var notesWorkspace = NotesWorkspace.empty
    @Published private(set) var sportWorkspace = SportWorkspace.empty
    @Published private(set) var goalsWorkspace = GoalsWorkspace.empty
    @Published private(set) var workWorkspace = WorkWorkspace.empty
    @Published private(set) var travelWorkspace = TravelWorkspace.empty
    @Published private(set) var healthWorkspace = HealthWorkspace.empty
    @Published private(set) var affairsWorkspace = AffairsWorkspace.empty
    @Published private(set) var isWorking = false
    @Published private(set) var isLaunching = true
    @Published private(set) var isPasswordRecovery = false
    @Published private(set) var authCallbackError: String?
    @Published private(set) var foundationMessage = "Szkielet techniczny gotowy"
    @Published private(set) var workspaceSyncStatus = WorkspaceSyncStatus.unavailable
    @Published private(set) var realtimeLastRefresh: Date?
    @Published private(set) var recoveryFiles: [WorkspaceRecoveryFile] = []

    let configuration: RootineConfiguration
    private let api: RootineAPIClient
    private let keychain: KeychainSessionStore
    private var store: WorkspaceFileStore?
    private var syncEngine: WorkspaceSyncEngine?
    private var canonicalShadows: [RootineStorageKey: JSONValue] = [:]
    private var creationGate = WorkspaceCreationGate()
    private var refreshTask: Task<Void, Never>?
    private var isReconciling = false

    init(
        configuration: RootineConfiguration = .fromBundle(),
        keychain: KeychainSessionStore = KeychainSessionStore()
    ) {
        self.configuration = configuration
        self.keychain = keychain
        api = RootineAPIClient(configuration: configuration)
        let storedSession = keychain.load()
        session = storedSession
        if let storedSession {
            configureRuntime(userID: storedSession.user.id)
        }
    }

    func establishEmailSession(email: String, password: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        let signedIn = try await api.signIn(
            email: normalizedEmail(email),
            password: password
        )
        try await accept(signedIn)
    }

    func register(email: String, password: String) async throws -> Bool {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        switch try await api.signUp(email: normalizedEmail(email), password: password) {
        case .session(let newSession):
            try await accept(newSession)
            return false
        case .needsEmailConfirmation:
            return true
        }
    }

    func resendConfirmation(email: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        try await api.resendConfirmation(email: normalizedEmail(email))
    }

    func requestPasswordReset(email: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        try await api.requestPasswordReset(email: normalizedEmail(email))
    }

    func googleAuthorizationURL() throws -> URL {
        try api.googleAuthorizationURL()
    }

    func establishGoogleSession(callbackURL: URL) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        let result = try await api.session(from: callbackURL)
        try await accept(result.session, passwordRecovery: result.isPasswordRecovery)
    }

    func establishAppleSession(idToken: String, nonce: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        let signedIn = try await api.signInWithApple(idToken: idToken, nonce: nonce)
        try await accept(signedIn)
    }

    func handleAuthCallback(_ url: URL) async throws {
        guard url.scheme?.lowercased() == configuration.authCallbackScheme.lowercased(),
              url.host == "auth-callback" else { return }
        try await establishGoogleSession(callbackURL: url)
    }

    func receiveAuthCallback(_ url: URL) async {
        authCallbackError = nil
        do {
            try await handleAuthCallback(url)
        } catch {
            authCallbackError = error.localizedDescription
        }
    }

    func clearAuthCallbackError() {
        authCallbackError = nil
    }

    func completePasswordRecovery(password: String) async throws {
        guard let accessToken = session?.accessToken else { throw RootineAPIError.unauthorized }
        isWorking = true
        defer { isWorking = false }
        try await api.updatePassword(password, accessToken: accessToken)
        isPasswordRecovery = false
        await loadAndReconcile(accessToken: accessToken)
    }

    func cancelPasswordRecovery() {
        signOutFoundationSession()
        isPasswordRecovery = false
    }

    func start() async {
        defer { isLaunching = false }
        guard var activeSession = session else {
            workspaceSyncStatus = .unavailable
            foundationMessage = configuration.isAuthComplete
                ? "Zaloguj się, aby połączyć dane Rootine"
                : "Uzupełnij konfigurację logowania w Secrets.xcconfig"
            return
        }

        if activeSession.shouldRefresh && configuration.isAuthComplete {
            do {
                activeSession = try await api.refreshSession(refreshToken: activeSession.refreshToken)
                try keychain.save(activeSession)
                session = activeSession
                configureRuntime(userID: activeSession.user.id)
            } catch RootineAPIError.unauthorized {
                signOutFoundationSession()
                return
            } catch {
                await loadLocalCopies()
                await markLocalOnly()
                foundationMessage = "Offline — używam danych zapisanych na tym iPhonie"
                return
            }
        }
        await loadAndReconcile(accessToken: activeSession.accessToken)
        startRealtimeRefreshLoop()
        await refreshRecoveryFiles()
    }

#if DEBUG
    func loadPreviewData() async {
        let now = Date()
        let today = RootineDate.localDate(now)
        let yesterday = RootineDate.localDate(Calendar.current.date(byAdding: .day, value: -1, to: now) ?? now)
        let tomorrow = RootineDate.localDate(Calendar.current.date(byAdding: .day, value: 1, to: now) ?? now)
        let timestamp = RootineDate.isoTimestamp(now)

        session = SupabaseSession(
            accessToken: "rootine-preview",
            refreshToken: "rootine-preview",
            expiresIn: 3600,
            expiresAt: Int(now.timeIntervalSince1970) + 3600,
            tokenType: "bearer",
            user: SupabaseUser(id: "rootine-preview-user", email: "preview@rootine.app")
        )
        configureRuntime(userID: "rootine-preview-user")
        foundationMessage = "Podgląd lokalny"
        isLaunching = false
        isWorking = false

        taskWorkspace = TaskWorkspace(
            version: 2,
            updatedAt: timestamp,
            tasks: [
                WorkspaceTask(id: 1, text: "Przygotować prezentację", done: false, time: "09:00", view: "dzis", priority: .high, calendarDate: today),
                WorkspaceTask(id: 2, text: "Odpisać na najważniejsze wiadomości", done: true, completedAt: timestamp, time: "11:30", view: "dzis", priority: .medium, calendarDate: today),
                WorkspaceTask(id: 3, text: "Zamówić filtr do ekspresu", done: false, view: "dzis"),
                WorkspaceTask(id: 4, text: "Zarezerwować wizytę kontrolną", done: false, time: "15:00", view: "wszystkie", calendarDate: yesterday),
                WorkspaceTask(id: 5, text: "Przegląd tygodnia", done: false, time: "17:30", view: "wszystkie", calendarDate: tomorrow)
            ],
            habits: [
                WorkspaceHabit(id: 101, name: "Poranna szklanka wody", streak: 6, done: true, completedDates: [today], schedule: WorkspaceHabitSchedule(type: "daily", startDate: today), time: "07:30"),
                WorkspaceHabit(id: 102, name: "Spacer bez telefonu", streak: 3, done: false, completedDates: [], schedule: WorkspaceHabitSchedule(type: "weekly", weekdays: [1, 3, 5], startDate: today), priority: .medium, time: "18:30")
            ],
            lists: [],
            tags: []
        )

        let breakfast = NutritionEntry(id: "preview-breakfast", name: "Owsianka z bananem", portion: "1 miska", calories: 420, protein: 18, carbs: 62, fat: 12, createdAt: timestamp)
        let lunch = NutritionEntry(id: "preview-lunch", name: "Kurczak z ryżem", portion: "1 porcja", calories: 680, protein: 46, carbs: 72, fat: 18, createdAt: timestamp)
        let snack = NutritionEntry(id: "preview-snack", name: "Jogurt naturalny", portion: "150 g", calories: 160, protein: 20, carbs: 8, fat: 5, createdAt: timestamp)
        nutritionWorkspace = NutritionWorkspace(
            version: 6,
            updatedAt: timestamp,
            goals: NutritionGoals(calories: 2300, protein: 150, carbs: 270, fat: 75, waterMl: 2000),
            macroConfiguration: MacroConfiguration(mode: "grams", preset: "balanced", proteinPercent: 25, carbsPercent: 45, fatPercent: 30),
            weightMeasurements: [:],
            bodyMeasurements: [:],
            customMeals: [],
            days: [today: NutritionDay(date: today, waterMl: 1250, source: "preview", entries: NutritionMealEntries(breakfast: [breakfast], lunch: [lunch], snack: [snack], dinner: []))]
        )

        notesWorkspace = NotesWorkspace(
            version: 1,
            updatedAt: timestamp,
            lists: [NoteList(id: "preview-list", name: "Osobiste", createdAt: timestamp)],
            notes: [NoteRecord(id: "preview-note", title: "Pomysły na ten tydzień", body: "Trzy najważniejsze rzeczy do domknięcia.", kind: "text", items: [], tags: ["plan"], listId: "preview-list", color: .blue, pinned: true, archived: false, createdAt: timestamp, updatedAt: timestamp)]
        )

        sportWorkspace = SportWorkspace(
            version: 1,
            updatedAt: timestamp,
            workouts: [
                SportWorkout(id: "preview-workout-1", title: "Bieg spokojny", date: today, minutes: 38, kind: "Bieg", completed: true, createdAt: timestamp),
                SportWorkout(id: "preview-workout-2", title: "Siła całego ciała", date: today, minutes: 35, kind: "Siła", completed: false, createdAt: timestamp)
            ]
        )
        goalsWorkspace = GoalsWorkspace(
            version: 1,
            updatedAt: timestamp,
            goals: [
                GoalRecord(id: "preview-goal-1", title: "Forma", detail: "3 z 4 kroków", current: 3, target: 4, icon: "figure.walk", createdAt: timestamp, updatedAt: timestamp),
                GoalRecord(id: "preview-goal-2", title: "Finanse", detail: "Odkładanie w toku", current: 56, target: 100, icon: "banknote", createdAt: timestamp, updatedAt: timestamp),
                GoalRecord(id: "preview-goal-3", title: "Nauka", detail: "2 sesje w tym tygodniu", current: 2, target: 5, icon: "book.closed.fill", createdAt: timestamp, updatedAt: timestamp)
            ]
        )
        workWorkspace = WorkWorkspace(version: 1, updatedAt: timestamp, activeFocusStartedAt: nil, focusSessions: [])
        travelWorkspace = TravelWorkspace(
            version: 1,
            updatedAt: timestamp,
            trips: [
                TravelRecord(
                    id: "preview-trip-1",
                    destination: "Gdańsk",
                    dateRange: "12–15 września",
                    nights: 3,
                    itinerary: [
                        TravelItineraryItem(id: "preview-itinerary-1", day: "Pt", title: "Przyjazd i spacer po starówce", detail: "16:20"),
                        TravelItineraryItem(id: "preview-itinerary-2", day: "So", title: "Molo w Brzeźnie + kolacja", detail: "10:00"),
                        TravelItineraryItem(id: "preview-itinerary-3", day: "Nd", title: "Powrót do domu", detail: "14:45")
                    ],
                    createdAt: timestamp,
                    updatedAt: timestamp
                )
            ]
        )
        healthWorkspace = HealthWorkspace(
            version: 1,
            updatedAt: timestamp,
            checkIns: [today: HealthCheckIn(date: today, energy: 3, note: nil, updatedAt: timestamp)],
            reminders: [
                HealthReminder(id: "preview-reminder-outside", title: "Wyjdź na 10 minut na zewnątrz", detail: "Za 45 min", completedDates: []),
                HealthReminder(id: "preview-reminder-water", title: "Uzupełnij wodę", detail: "Brakuje 750 ml", completedDates: [])
            ]
        )
        affairsWorkspace = AffairsWorkspace(
            version: 2,
            matters: [
                AffairMatter(
                    id: "preview-matter",
                    title: "Sprawdzić ubezpieczenie mieszkania",
                    category: "dom",
                    priority: "high",
                    status: "open",
                    dueDate: tomorrow,
                    note: "Porównać zakres i termin płatności.",
                    createdAt: timestamp,
                    kind: "task",
                    time: nil,
                    location: nil,
                    reminderMinutes: nil,
                    sourceAttentionKey: nil
                )
            ],
            oneTimePayments: [],
            payments: [
                AffairRecurringPayment(
                    id: "preview-payment",
                    name: "Czynsz",
                    category: "Mieszkanie",
                    amount: 890,
                    cadence: "monthly",
                    nextDueDate: tomorrow,
                    automatic: false,
                    active: true,
                    note: "Do 10. dnia miesiąca."
                )
            ],
            subscriptions: [],
            documents: [],
            vehicles: [],
            vehicleItems: [],
            budgets: [],
            attentionStates: []
        )

        // Preview mode uses the same file-backed store as a signed-in user so
        // simulator interactions survive a relaunch. Missing snapshots keep
        // the deterministic sample data above.
        if let store {
            if let value = try? await store.load(TaskWorkspace.self, key: .tasks) { taskWorkspace = value }
            if let value = try? await store.load(NutritionWorkspace.self, key: .nutrition) { nutritionWorkspace = value }
            if let value = try? await store.load(NotesWorkspace.self, key: .notes) { notesWorkspace = value }
            if let value = try? await store.load(SportWorkspace.self, key: .sport) { sportWorkspace = value }
            if let value = try? await store.load(GoalsWorkspace.self, key: .goals) { goalsWorkspace = value }
            if let value = try? await store.load(WorkWorkspace.self, key: .work) { workWorkspace = value }
            if let value = try? await store.load(TravelWorkspace.self, key: .travel) { travelWorkspace = value }
            if let value = try? await store.load(HealthWorkspace.self, key: .health) { healthWorkspace = value }
            if let value = try? await store.load(AffairsWorkspace.self, key: .affairs) { affairsWorkspace = value }
            try? await store.save(taskWorkspace, key: .tasks)
            try? await store.save(nutritionWorkspace, key: .nutrition)
            try? await store.save(notesWorkspace, key: .notes)
            try? await store.save(sportWorkspace, key: .sport)
            try? await store.save(goalsWorkspace, key: .goals)
            try? await store.save(workWorkspace, key: .work)
            try? await store.save(travelWorkspace, key: .travel)
            try? await store.save(healthWorkspace, key: .health)
            try? await store.save(affairsWorkspace, key: .affairs)
        }
    }
#endif

    func signOutFoundationSession() {
        refreshTask?.cancel()
        refreshTask = nil
        keychain.clear()
        session = nil
        store = nil
        syncEngine = nil
        canonicalShadows.removeAll()
        taskWorkspace = .empty
        nutritionWorkspace = .empty
        notesWorkspace = .empty
        sportWorkspace = .empty
        goalsWorkspace = .empty
        workWorkspace = .empty
        travelWorkspace = .empty
        healthWorkspace = .empty
        affairsWorkspace = .empty
        realtimeLastRefresh = nil
        recoveryFiles = []
        foundationMessage = "Sesja usunięta z Keychain"
        workspaceSyncStatus = .unavailable
    }

    // MARK: Local data archive and recovery

    func exportWorkspaceArchive() throws -> Data {
        let archive = RootineWorkspaceExport(
            schemaVersion: RootineWorkspaceExport.currentVersion,
            exportedAt: RootineDate.isoTimestamp(),
            accountID: session?.user.id,
            accountEmail: session?.user.email,
            tasks: taskWorkspace,
            nutrition: nutritionWorkspace,
            notes: notesWorkspace,
            sport: sportWorkspace,
            goals: goalsWorkspace,
            work: workWorkspace,
            travel: travelWorkspace,
            health: healthWorkspace,
            affairs: normalizedAffairsWorkspace(affairsWorkspace)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(archive)
    }

    func importWorkspaceArchive(_ data: Data) async throws {
        guard let store, let syncEngine else { throw RootineWorkspaceArchiveError.noLocalStore }
        var archive = try JSONDecoder().decode(RootineWorkspaceExport.self, from: data)
        guard archive.schemaVersion == RootineWorkspaceExport.currentVersion else {
            throw RootineWorkspaceArchiveError.unsupportedVersion(archive.schemaVersion)
        }
        if let importedAccount = archive.accountID,
           let currentAccount = session?.user.id,
           importedAccount != currentAccount {
            throw RootineWorkspaceArchiveError.accountMismatch
        }

        archive.affairs = normalizedAffairsWorkspace(archive.affairs)
        try validateWorkspaceArchive(archive)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let canonicalInputs: [(RootineStorageKey, JSONValue)] = [
            (.sport, try encodeCanonical(archive.sport, key: .sport)),
            (.goals, try encodeCanonical(archive.goals, key: .goals)),
            (.work, try encodeCanonical(archive.work, key: .work)),
            (.travel, try encodeCanonical(archive.travel, key: .travel)),
            (.health, try encodeCanonical(archive.health, key: .health))
        ]
        let compactDocuments: [WorkspaceBatchDocument] = [
            WorkspaceBatchDocument(key: .tasks, data: try encoder.encode(archive.tasks)),
            WorkspaceBatchDocument(key: .nutrition, data: try encoder.encode(archive.nutrition)),
            WorkspaceBatchDocument(key: .notes, data: try encoder.encode(archive.notes)),
            WorkspaceBatchDocument(key: .sport, data: try encoder.encode(archive.sport)),
            WorkspaceBatchDocument(key: .goals, data: try encoder.encode(archive.goals)),
            WorkspaceBatchDocument(key: .work, data: try encoder.encode(archive.work)),
            WorkspaceBatchDocument(key: .travel, data: try encoder.encode(archive.travel)),
            WorkspaceBatchDocument(key: .health, data: try encoder.encode(archive.health)),
            WorkspaceBatchDocument(key: .affairs, data: try encoder.encode(archive.affairs))
        ]
        var documents = compactDocuments
        var syncPayloads: [WorkspaceSyncPayload] = [
            WorkspaceSyncPayload(storageKey: RootineStorageKey.tasks.rawValue, payload: try jsonPayload(archive.tasks, encoder: encoder)),
            WorkspaceSyncPayload(storageKey: RootineStorageKey.nutrition.rawValue, payload: try jsonPayload(archive.nutrition, encoder: encoder)),
            WorkspaceSyncPayload(storageKey: RootineStorageKey.notes.rawValue, payload: try jsonPayload(archive.notes, encoder: encoder)),
            WorkspaceSyncPayload(storageKey: RootineStorageKey.affairs.rawValue, payload: try jsonPayload(archive.affairs, encoder: encoder))
        ]
        for (key, canonical) in canonicalInputs {
            if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key) {
                documents.append(WorkspaceBatchDocument(key: shadowKey, data: try encoder.encode(canonical)))
            }
            syncPayloads.append(
                WorkspaceSyncPayload(
                    storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: key),
                    payload: canonical
                )
            )
        }

        // Create the safety copy and stage every file before publishing any
        // @Published value. Validation and encoding above are intentionally
        // complete before this write begins.
        _ = try await store.writeRecoveryCopy(try exportWorkspaceArchive(), label: "before-import")
        try await store.replaceWorkspaceBatch(documents)
        _ = try await syncEngine.enqueueBatch(syncPayloads)

        taskWorkspace = archive.tasks
        nutritionWorkspace = archive.nutrition
        notesWorkspace = archive.notes
        sportWorkspace = archive.sport
        goalsWorkspace = archive.goals
        workWorkspace = archive.work
        travelWorkspace = archive.travel
        healthWorkspace = archive.health
        affairsWorkspace = archive.affairs
        for (key, canonical) in canonicalInputs {
            canonicalShadows[key] = canonical
        }
        await refreshRecoveryFiles()
        await markLocalOnly()
        await flushPendingMutations()
        foundationMessage = "Zaimportowano kopię danych. Poprzedni stan jest w Recovery."
    }

    func restoreRecoveryFile(_ file: WorkspaceRecoveryFile) async throws {
        guard let store else { throw RootineWorkspaceArchiveError.noLocalStore }
        let files = try await store.recoveryFiles()
        guard files.contains(where: { $0.name == file.name && $0.url.standardizedFileURL == file.url.standardizedFileURL }) else {
            throw RootineWorkspaceArchiveError.noLocalStore
        }
        let data = try Data(contentsOf: file.url)
        try await importWorkspaceArchive(data)
        foundationMessage = "Przywrócono kopię \(file.name)."
    }

    func validateWorkspaceArchive(_ archive: RootineWorkspaceExport) throws {
        let versionChecks: [(RootineStorageKey, Int, Int)] = [
            (.tasks, archive.tasks.version, RootineStorageKey.tasks.supportedLocalVersion!),
            (.nutrition, archive.nutrition.version, RootineStorageKey.nutrition.supportedLocalVersion!),
            (.notes, archive.notes.version, RootineStorageKey.notes.supportedLocalVersion!),
            (.sport, archive.sport.version, RootineStorageKey.sport.supportedLocalVersion!),
            (.goals, archive.goals.version, RootineStorageKey.goals.supportedLocalVersion!),
            (.work, archive.work.version, RootineStorageKey.work.supportedLocalVersion!),
            (.travel, archive.travel.version, RootineStorageKey.travel.supportedLocalVersion!),
            (.health, archive.health.version, RootineStorageKey.health.supportedLocalVersion!),
            (.affairs, archive.affairs.version, RootineStorageKey.affairs.supportedLocalVersion!)
        ]
        for (key, found, supported) in versionChecks where found != supported {
            throw RootineWorkspaceArchiveError.unsupportedWorkspaceVersion(
                key: key.rawValue,
                found: found,
                supported: supported
            )
        }
    }

    func refreshRecoveryFiles() async {
        guard let store else {
            recoveryFiles = []
            return
        }
        recoveryFiles = (try? await store.recoveryFiles()) ?? []
    }

    func deleteRecoveryFile(_ file: WorkspaceRecoveryFile) async {
        guard let store else { return }
        try? await store.deleteRecoveryFile(file)
        await refreshRecoveryFiles()
    }

    func clearLocalDataAndSignOut() async throws {
        if let store {
            try await store.clearAllLocalData()
        }
        signOutFoundationSession()
    }

    /// Refreshes the active account when the app returns to the foreground.
    /// The local snapshot remains the source of truth while the request is in
    /// flight, so a slow network never blocks navigation or editing.
    func refreshActiveSession() async {
        guard let accessToken = session?.accessToken else { return }
        await loadAndReconcile(accessToken: accessToken)
        await refreshRecoveryFiles()
    }

    func toggleTaskCompletion(id: Int, on date: Date = Date()) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        let dateKey = RootineDate.localDate(date)
        if var schedule = next.tasks[index].schedule {
            // Recurring tasks are completed per local day. Keep the legacy
            // global flag in sync only for the current day so Today, Tasks and
            // Calendar never leak yesterday's state into another date.
            var completedDates = schedule.completedDates ?? []
            var completedAtByDate = schedule.completedAtByDate ?? [:]
            if completedDates.contains(dateKey) {
                completedDates.removeAll { $0 == dateKey }
                completedAtByDate[dateKey] = nil
            } else {
                completedDates.append(dateKey)
                completedDates.sort()
                completedAtByDate[dateKey] = RootineDate.isoTimestamp(date)
            }
            schedule.completedDates = completedDates
            schedule.completedAtByDate = completedAtByDate
            next.tasks[index].schedule = schedule
            let todayKey = RootineDate.localDate()
            next.tasks[index].done = rootineTaskIsDoneOnDate(next.tasks[index], dateKey: todayKey)
            next.tasks[index].completedAt = completedAtByDate[todayKey]
        } else {
            next.tasks[index].done.toggle()
            next.tasks[index].completedAt = next.tasks[index].done ? RootineDate.isoTimestamp(date) : nil
        }
        await persistTaskWorkspace(next)
    }

    func toggleHabitCompletion(id: Int, on date: Date = Date()) async {
        var next = taskWorkspace
        guard let index = next.habits.firstIndex(where: { $0.id == id }) else { return }
        let dateKey = RootineDate.localDate(date)
        var completedDates = next.habits[index].completedDates ?? []
        if completedDates.contains(dateKey) {
            completedDates.removeAll { $0 == dateKey }
        } else {
            completedDates.append(dateKey)
            completedDates.sort()
        }
        next.habits[index].completedDates = completedDates
        let todayKey = RootineDate.localDate()
        next.habits[index].done = rootineHabitIsScheduledOnDate(next.habits[index], dateKey: todayKey)
            && completedDates.contains(todayKey)
        next.habits[index].streak = rootineHabitCurrentStreak(next.habits[index], referenceDate: todayKey)
        await persistTaskWorkspace(next)
    }

    func updateTask(
        id: Int,
        text: String,
        time: String?,
        calendarDate: String?,
        priority: TaskPriority?
    ) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        next.tasks[index].text = trimmedText
        next.tasks[index].time = normalizedTime?.isEmpty == true ? nil : normalizedTime
        next.tasks[index].calendarDate = calendarDate
        let today = RootineDate.localDate()
        next.tasks[index].view = calendarDate == nil ? "bezterminu" : calendarDate == today ? "dzis" : "wszystkie"
        next.tasks[index].priority = priority
        await persistTaskWorkspace(next)
    }

    func deleteTask(id: Int) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        next.tasks[index].deleted = true
        await persistTaskWorkspace(next)
    }

    func restoreTask(id: Int) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted == true }) else { return }
        next.tasks[index].deleted = false
        await persistTaskWorkspace(next)
    }

    func addHabit(
        name: String,
        time: String?,
        priority: TaskPriority? = nil,
        schedule: WorkspaceHabitSchedule? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        let creationFingerprint = "habit|\(trimmedName)|\(time ?? "")|\(priority?.rawValue ?? "")"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = taskWorkspace
        let nextID = RootineLocalIdentifier.integer(namespace: "habit", operationID: operationID)
        guard !next.habits.contains(where: { $0.id == nextID }) else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedSchedule = schedule ?? WorkspaceHabitSchedule(type: "daily", startDate: RootineDate.localDate())
        next.habits.append(WorkspaceHabit(
            id: nextID,
            name: trimmedName,
            streak: 0,
            done: false,
            schedule: normalizedSchedule,
            priority: priority,
            time: normalizedTime?.isEmpty == true ? nil : normalizedTime
        ))
        await persistTaskWorkspace(next)
    }

    func updateHabit(
        id: Int,
        name: String,
        time: String?,
        priority: TaskPriority?,
        schedule: WorkspaceHabitSchedule? = nil
    ) async {
        var next = taskWorkspace
        guard let index = next.habits.firstIndex(where: { $0.id == id }) else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        next.habits[index].name = trimmedName
        next.habits[index].time = normalizedTime?.isEmpty == true ? nil : normalizedTime
        next.habits[index].priority = priority
        if let schedule { next.habits[index].schedule = schedule }
        let today = RootineDate.localDate()
        next.habits[index].done = rootineHabitIsScheduledOnDate(next.habits[index], dateKey: today)
            && rootineHabitIsDoneOnDate(next.habits[index], dateKey: today)
        next.habits[index].streak = rootineHabitCurrentStreak(next.habits[index], referenceDate: today)
        await persistTaskWorkspace(next)
    }

    func deleteHabit(id: Int) async {
        var next = taskWorkspace
        next.habits.removeAll { $0.id == id }
        await persistTaskWorkspace(next)
    }

    func addTodayTask(text: String, time: String?, operationID: String = UUID().uuidString) async {
        await addTask(
            text: text,
            time: time,
            calendarDate: RootineDate.localDate(),
            view: "dzis",
            operationID: operationID
        )
    }

    func addTask(
        text: String,
        time: String?,
        calendarDate: String?,
        view: String = "dzis",
        priority: TaskPriority? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        let creationFingerprint = "task|\(trimmedText)|\(time ?? "")|\(calendarDate ?? "")|\(view)|\(priority?.rawValue ?? "")"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = taskWorkspace
        let nextID = RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        guard !next.tasks.contains(where: { $0.id == nextID }) else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        next.tasks.append(WorkspaceTask(
            id: nextID,
            text: trimmedText,
            done: false,
            time: normalizedTime?.isEmpty == true ? nil : normalizedTime,
            view: view,
            priority: priority,
            calendarDate: calendarDate
        ))
        await persistTaskWorkspace(next)
    }

    func addWorkPriority(text: String, operationID: String = UUID().uuidString) async {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        let creationFingerprint = "work-priority|\(trimmedText)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = taskWorkspace
        let now = RootineDate.isoTimestamp()
        let nextID = RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        guard !next.tasks.contains(where: { $0.id == nextID }) else { return }
        next.tasks.append(WorkspaceTask(
            id: nextID,
            text: trimmedText,
            done: false,
            view: "wszystkie",
            priority: .high,
            source: CommitmentTaskSource(kind: "work", entity: "task", context: "work", href: "/work", originTaskId: nil, managed: "ios")
        ))
        next.updatedAt = now
        await persistTaskWorkspace(next)
    }

    func updateWorkPriority(id: Int, text: String) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }),
              next.tasks[index].source?.kind == "work" else { return }
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        next.tasks[index].text = trimmedText
        await persistTaskWorkspace(next)
    }

    func restoreWorkPriority(_ task: WorkspaceTask) async {
        var next = taskWorkspace
        guard task.source?.kind == "work",
              !next.tasks.contains(where: { $0.id == task.id }) else { return }
        var restored = task
        restored.deleted = false
        next.tasks.append(restored)
        await persistTaskWorkspace(next)
    }

    // MARK: More module actions

    func upsertNote(_ note: NoteRecord) async {
        var next = notesWorkspace
        var normalized = note
        normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines)
        normalized.body = normalized.body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.title.isEmpty || !normalized.body.isEmpty else { return }
        normalized.updatedAt = RootineDate.isoTimestamp()
        if normalized.listId.isEmpty {
            if let list = next.lists.first {
                normalized.listId = list.id
            } else {
                let list = NoteList(
                    id: RootineLocalIdentifier.string(namespace: "note-list", operationID: normalized.id),
                    name: "Osobiste",
                    createdAt: normalized.updatedAt
                )
                next.lists.append(list)
                normalized.listId = list.id
            }
        }
        if let index = next.notes.firstIndex(where: { $0.id == normalized.id }) {
            next.notes[index] = normalized
        } else {
            next.notes.insert(normalized, at: 0)
        }
        await persistNotesWorkspace(next)
    }

    func deleteNote(id: String) async {
        var next = notesWorkspace
        next.notes.removeAll { $0.id == id }
        await persistNotesWorkspace(next)
    }

    func toggleNotePinned(id: String) async {
        var next = notesWorkspace
        guard let index = next.notes.firstIndex(where: { $0.id == id }) else { return }
        next.notes[index].pinned.toggle()
        next.notes[index].updatedAt = RootineDate.isoTimestamp()
        await persistNotesWorkspace(next)
    }

    func archiveNote(id: String) async {
        var next = notesWorkspace
        guard let index = next.notes.firstIndex(where: { $0.id == id }) else { return }
        next.notes[index].archived = true
        next.notes[index].pinned = false
        next.notes[index].updatedAt = RootineDate.isoTimestamp()
        await persistNotesWorkspace(next)
    }

    func addWorkout(
        title: String,
        date: String,
        minutes: Int,
        kind: String,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        let creationFingerprint = "workout|\(trimmedTitle)|\(date)|\(minutes)|\(kind)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = sportWorkspace
        let now = RootineDate.isoTimestamp()
        let recordID = RootineLocalIdentifier.string(namespace: "workout", operationID: operationID)
        guard !next.workouts.contains(where: { $0.id == recordID }) else { return }
        next.workouts.append(SportWorkout(
            id: recordID,
            title: trimmedTitle,
            date: date,
            minutes: max(1, minutes),
            kind: kind.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Trening" : kind,
            completed: false,
            createdAt: now
        ))
        next.updatedAt = now
        await persistSportWorkspace(next)
    }

    func toggleWorkoutCompleted(id: String) async {
        var next = sportWorkspace
        guard let index = next.workouts.firstIndex(where: { $0.id == id }) else { return }
        next.workouts[index].completed.toggle()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistSportWorkspace(next)
    }

    func deleteWorkout(id: String) async {
        var next = sportWorkspace
        next.workouts.removeAll { $0.id == id }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistSportWorkspace(next)
    }

    func updateWorkout(id: String, title: String, date: String, minutes: Int, kind: String) async {
        var next = sportWorkspace
        guard let index = next.workouts.firstIndex(where: { $0.id == id }) else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        next.workouts[index].title = trimmedTitle
        next.workouts[index].date = date.trimmingCharacters(in: .whitespacesAndNewlines)
        next.workouts[index].minutes = max(1, minutes)
        next.workouts[index].kind = kind.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Trening" : kind
        next.updatedAt = RootineDate.isoTimestamp()
        await persistSportWorkspace(next)
    }

    func restoreWorkout(_ workout: SportWorkout) async {
        var next = sportWorkspace
        guard !next.workouts.contains(where: { $0.id == workout.id }) else { return }
        next.workouts.append(workout)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistSportWorkspace(next)
    }

    func addGoal(
        title: String,
        detail: String,
        target: Double,
        icon: String,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        let creationFingerprint = "goal|\(trimmedTitle)|\(detail)|\(target)|\(icon)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = goalsWorkspace
        let now = RootineDate.isoTimestamp()
        let recordID = RootineLocalIdentifier.string(namespace: "goal", operationID: operationID)
        guard !next.goals.contains(where: { $0.id == recordID }) else { return }
        next.goals.append(GoalRecord(
            id: recordID,
            title: trimmedTitle,
            detail: detail.trimmingCharacters(in: .whitespacesAndNewlines),
            current: 0,
            target: max(1, target),
            icon: icon.isEmpty ? "target" : icon,
            createdAt: now,
            updatedAt: now
        ))
        next.updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func advanceGoal(id: String, by amount: Double = 1) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        next.goals[index].current = min(next.goals[index].target, max(0, next.goals[index].current + amount))
        next.goals[index].updatedAt = RootineDate.isoTimestamp()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func deleteGoal(id: String) async {
        var next = goalsWorkspace
        next.goals.removeAll { $0.id == id }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func updateGoal(id: String, title: String, detail: String, target: Double, icon: String) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        next.goals[index].title = trimmedTitle
        next.goals[index].detail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        next.goals[index].target = max(1, target)
        next.goals[index].current = min(next.goals[index].current, next.goals[index].target)
        next.goals[index].icon = icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "target" : icon
        next.goals[index].updatedAt = RootineDate.isoTimestamp()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func restoreGoal(_ goal: GoalRecord) async {
        var next = goalsWorkspace
        guard !next.goals.contains(where: { $0.id == goal.id }) else { return }
        next.goals.append(goal)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func startFocusSession() async {
        guard workWorkspace.activeFocusStartedAt == nil else { return }
        var next = workWorkspace
        next.activeFocusStartedAt = RootineDate.isoTimestamp()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistWorkWorkspace(next)
    }

    func stopFocusSession() async {
        guard let startedAt = workWorkspace.activeFocusStartedAt,
              let startDate = RootineDate.date(from: startedAt) else {
            await resetFocusSession(message: "Uszkodzona sesja skupienia została przeniesiona do stanu odzyskiwania")
            return
        }
        var next = workWorkspace
        let now = Date()
        let minutes = max(1, Int(now.timeIntervalSince(startDate) / 60))
        let sessionID = RootineLocalIdentifier.string(namespace: "focus", operationID: startedAt)
        next.focusSessions.removeAll { $0.id == sessionID }
        next.focusSessions.insert(WorkFocusSession(id: sessionID, startedAt: startedAt, endedAt: RootineDate.isoTimestamp(now), minutes: minutes), at: 0)
        next.activeFocusStartedAt = nil
        next.updatedAt = RootineDate.isoTimestamp(now)
        await persistWorkWorkspace(next)
    }

    /// Clears an invalid or abandoned focus timestamp without fabricating a
    /// completed session. This is intentionally separate from `stop` so the
    /// UI can offer a safe recovery action when decoding fails.
    func resetFocusSession(message: String = "Sesja skupienia wyczyszczona") async {
        guard workWorkspace.activeFocusStartedAt != nil else { return }
        var next = workWorkspace
        next.activeFocusStartedAt = nil
        next.updatedAt = RootineDate.isoTimestamp()
        await persistWorkWorkspace(next)
        foundationMessage = message
    }

    func addTrip(
        destination: String,
        dateRange: String,
        nights: Int,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedDestination = destination.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDestination.isEmpty else { return }
        let creationFingerprint = "trip|\(trimmedDestination)|\(dateRange)|\(nights)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = travelWorkspace
        let now = RootineDate.isoTimestamp()
        let recordID = RootineLocalIdentifier.string(namespace: "trip", operationID: operationID)
        guard !next.trips.contains(where: { $0.id == recordID }) else { return }
        next.trips.insert(TravelRecord(id: recordID, destination: trimmedDestination, dateRange: dateRange, nights: max(1, nights), itinerary: [], createdAt: now, updatedAt: now), at: 0)
        next.updatedAt = now
        await persistTravelWorkspace(next)
    }

    func deleteTrip(id: String) async {
        var next = travelWorkspace
        next.trips.removeAll { $0.id == id }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistTravelWorkspace(next)
    }

    func updateTrip(id: String, destination: String, dateRange: String, nights: Int) async {
        var next = travelWorkspace
        guard let index = next.trips.firstIndex(where: { $0.id == id }) else { return }
        let trimmedDestination = destination.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDestination.isEmpty else { return }
        next.trips[index].destination = trimmedDestination
        next.trips[index].dateRange = dateRange.trimmingCharacters(in: .whitespacesAndNewlines)
        next.trips[index].nights = max(1, nights)
        next.trips[index].updatedAt = RootineDate.isoTimestamp()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistTravelWorkspace(next)
    }

    func restoreTrip(_ trip: TravelRecord) async {
        var next = travelWorkspace
        guard !next.trips.contains(where: { $0.id == trip.id }) else { return }
        next.trips.append(trip)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistTravelWorkspace(next)
    }

    func setHealthEnergy(_ energy: Int, date: Date = Date()) async {
        var next = healthWorkspace
        let now = RootineDate.isoTimestamp()
        let key = RootineDate.localDate(date)
        next.checkIns[key] = HealthCheckIn(date: key, energy: min(4, max(1, energy)), note: next.checkIns[key]?.note, updatedAt: now)
        next.updatedAt = now
        await persistHealthWorkspace(next)
    }

    func toggleHealthReminder(id: String, date: Date = Date()) async {
        var next = healthWorkspace
        guard let index = next.reminders.firstIndex(where: { $0.id == id }) else { return }
        let key = RootineDate.localDate(date)
        if next.reminders[index].completedDates.contains(key) {
            next.reminders[index].completedDates.removeAll { $0 == key }
        } else {
            next.reminders[index].completedDates.append(key)
        }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func addHealthReminder(
        title: String,
        detail: String,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        let creationFingerprint = "health-reminder|\(trimmedTitle)|\(detail)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = healthWorkspace
        let recordID = RootineLocalIdentifier.string(namespace: "health-reminder", operationID: operationID)
        guard !next.reminders.contains(where: { $0.id == recordID }) else { return }
        next.reminders.append(HealthReminder(id: recordID, title: trimmedTitle, detail: detail.trimmingCharacters(in: .whitespacesAndNewlines), completedDates: []))
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func deleteHealthReminder(id: String) async {
        var next = healthWorkspace
        next.reminders.removeAll { $0.id == id }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func updateHealthReminder(id: String, title: String, detail: String) async {
        var next = healthWorkspace
        guard let index = next.reminders.firstIndex(where: { $0.id == id }) else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        next.reminders[index].title = trimmedTitle
        next.reminders[index].detail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func restoreHealthReminder(_ reminder: HealthReminder) async {
        var next = healthWorkspace
        guard !next.reminders.contains(where: { $0.id == reminder.id }) else { return }
        next.reminders.append(reminder)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    // MARK: Pozostałe / Sprawy

    func addAffairMatter(
        title: String,
        category: String,
        priority: String,
        dueDate: String,
        note: String,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        let fingerprint = "affair|\(trimmedTitle)|\(category)|\(dueDate)"
        guard creationGate.claim(fingerprint) else { return }
        defer { creationGate.release(fingerprint) }
        var next = affairsWorkspace
        let id = RootineLocalIdentifier.string(namespace: "affair", operationID: operationID)
        guard !next.matters.contains(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        next.matters.insert(
            AffairMatter(
                id: id,
                title: trimmedTitle,
                category: AffairMatterCategory.canonical(category),
                priority: priority == "high" ? "high" : "normal",
                status: "open",
                dueDate: dueDate,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                createdAt: now
            ),
            at: 0
        )
        next.version = 2
        await persistAffairsWorkspace(next)
    }

    func updateAffairMatter(
        id: String,
        title: String,
        category: String,
        priority: String,
        dueDate: String,
        note: String
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }
        var next = affairsWorkspace
        guard let index = next.matters.firstIndex(where: { $0.id == id }) else { return }
        next.matters[index].title = trimmedTitle
        next.matters[index].category = AffairMatterCategory.canonical(category)
        next.matters[index].priority = priority == "high" ? "high" : "normal"
        next.matters[index].dueDate = dueDate
        next.matters[index].note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        await persistAffairsWorkspace(next)
    }

    func toggleAffairMatter(id: String) async {
        var next = affairsWorkspace
        guard let index = next.matters.firstIndex(where: { $0.id == id }) else { return }
        next.matters[index].status = next.matters[index].status == "done" ? "open" : "done"
        await persistAffairsWorkspace(next)
    }

    func deleteAffairMatter(id: String) async {
        var next = affairsWorkspace
        next.matters.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func restoreAffairMatter(_ matter: AffairMatter) async {
        var next = affairsWorkspace
        guard !next.matters.contains(where: { $0.id == matter.id }) else { return }
        next.matters.insert(matter, at: 0)
        await persistAffairsWorkspace(next)
    }

    func toggleOneTimePayment(id: String) async {
        var next = affairsWorkspace
        guard let index = next.oneTimePayments.firstIndex(where: { $0.id == id }) else { return }
        next.oneTimePayments[index].paid.toggle()
        next.oneTimePayments[index].paidAt = next.oneTimePayments[index].paid ? RootineDate.isoTimestamp() : ""
        await persistAffairsWorkspace(next)
    }

    func deleteOneTimePayment(id: String) async {
        var next = affairsWorkspace
        next.oneTimePayments.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    // MARK: Nutrition secondary records

    func updateNutritionGoals(_ goals: NutritionGoals) async {
        var next = nutritionWorkspace
        next.goals = NutritionGoals(
            calories: max(0, goals.calories),
            protein: max(0, goals.protein),
            carbs: max(0, goals.carbs),
            fat: max(0, goals.fat),
            waterMl: max(0, goals.waterMl)
        )
        await persistNutritionWorkspace(next)
    }

    func addWeightMeasurement(weightKg: Double, dateKey: String = RootineDate.localDate(), note: String? = nil) async {
        guard weightKg > 0 else { return }
        var next = nutritionWorkspace
        let now = RootineDate.isoTimestamp()
        next.weightMeasurements[dateKey] = WeightMeasurement(date: dateKey, weightKg: weightKg, note: note, createdAt: now, updatedAt: now)
        await persistNutritionWorkspace(next)
    }

    func upsertCustomMeal(_ meal: CustomMeal) async {
        let trimmedName = meal.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !meal.ingredients.isEmpty else { return }
        var next = nutritionWorkspace
        var value = meal
        value.name = trimmedName
        value.updatedAt = RootineDate.isoTimestamp()
        if let index = (next.customMeals ?? []).firstIndex(where: { $0.id == value.id }) {
            next.customMeals?[index] = value
        } else {
            next.customMeals = [value] + (next.customMeals ?? [])
        }
        await persistNutritionWorkspace(next)
    }

    func deleteCustomMeal(id: String) async {
        var next = nutritionWorkspace
        next.customMeals?.removeAll { $0.id == id }
        await persistNutritionWorkspace(next)
    }

    func addCustomMealToDay(
        _ meal: CustomMeal,
        dateKey: String,
        mealKind: String,
        operationID: String = UUID().uuidString
    ) async {
        let values = meal.ingredients.reduce(NutritionValues(calories: 0, protein: 0, carbs: 0, fat: 0)) { partial, ingredient in
            let multiplier = ingredient.unit.lowercased() == "g" || ingredient.unit.lowercased() == "ml" ? ingredient.amount / 100 : 1
            return NutritionValues(
                calories: partial.calories + ingredient.per100g.calories * multiplier,
                protein: partial.protein + ingredient.per100g.protein * multiplier,
                carbs: partial.carbs + ingredient.per100g.carbs * multiplier,
                fat: partial.fat + ingredient.per100g.fat * multiplier
            )
        }
        await addNutritionEntry(
            dateKey: dateKey,
            meal: mealKind,
            name: meal.name,
            portion: meal.servings.map { String(format: "%.0f porcji", $0) } ?? "1 porcja",
            calories: values.calories,
            protein: values.protein,
            carbs: values.carbs,
            fat: values.fat,
            amount: meal.totalWeightG,
            unit: "g",
            operationID: operationID
        )
    }

    func addNutritionEntry(
        dateKey: String,
        meal: String,
        name: String,
        portion: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        amount: Double? = nil,
        unit: String? = nil,
        brand: String? = nil,
        catalogId: String? = nil,
        catalogSource: String? = nil,
        per100g: NutritionValues? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        let creationFingerprint = "nutrition|\(dateKey)|\(meal)|\(trimmedName)|\(portion)|\(calories)|\(protein)|\(carbs)|\(fat)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = nutritionWorkspace
        var day = next.days[dateKey] ?? NutritionDay.empty(date: dateKey)
        let recordID = RootineLocalIdentifier.string(namespace: "nutrition-entry", operationID: operationID)
        let allEntries = day.entries.breakfast + day.entries.lunch + day.entries.snack + day.entries.dinner
        guard !allEntries.contains(where: { $0.id == recordID }) else { return }
        let entry = NutritionEntry(
            id: recordID,
            name: trimmedName,
            portion: portion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "1 porcja" : portion,
            amount: amount,
            unit: unit,
            calories: max(0, calories),
            protein: max(0, protein),
            carbs: max(0, carbs),
            fat: max(0, fat),
            brand: brand,
            catalogId: catalogId,
            catalogSource: catalogSource,
            per100g: per100g,
            createdAt: RootineDate.isoTimestamp()
        )
        switch meal {
        case "breakfast": day.entries.breakfast.append(entry)
        case "lunch": day.entries.lunch.append(entry)
        case "snack": day.entries.snack.append(entry)
        default: day.entries.dinner.append(entry)
        }
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
    }

    func lookupNutritionProduct(barcode: String) async -> NutritionProduct? {
        let normalized = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, let token = session?.accessToken else { return nil }
        do {
            return try await api.product(barcode: normalized, accessToken: token)
        } catch {
            foundationMessage = "Nie udało się pobrać produktu — możesz wpisać go ręcznie."
            return nil
        }
    }

    func updateNutritionEntry(
        dateKey: String,
        originalMeal: String,
        meal: String,
        id: String,
        name: String,
        portion: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        amount: Double? = nil,
        unit: String? = nil,
        brand: String? = nil,
        catalogId: String? = nil,
        catalogSource: String? = nil,
        per100g: NutritionValues? = nil
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        var next = nutritionWorkspace
        guard var day = next.days[dateKey] else { return }
        var existing: NutritionEntry?

        func remove(_ entries: inout [NutritionEntry]) {
            if let index = entries.firstIndex(where: { $0.id == id }) {
                existing = entries.remove(at: index)
            }
        }

        // Search every meal rather than trusting the caller's original section;
        // this keeps an edit safe after a concurrent meal move or reload.
        remove(&day.entries.breakfast)
        remove(&day.entries.lunch)
        remove(&day.entries.snack)
        remove(&day.entries.dinner)
        guard let previous = existing else { return }
        let now = RootineDate.isoTimestamp()
        let updated = NutritionEntry(
            id: id,
            name: trimmedName,
            portion: portion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "1 porcja" : portion,
            amount: amount,
            unit: unit,
            calories: max(0, calories),
            protein: max(0, protein),
            carbs: max(0, carbs),
            fat: max(0, fat),
            brand: brand,
            catalogId: catalogId,
            catalogSource: catalogSource,
            per100g: per100g,
            createdAt: previous.createdAt,
            updatedAt: now
        )
        switch meal {
        case "breakfast": day.entries.breakfast.append(updated)
        case "lunch": day.entries.lunch.append(updated)
        case "snack": day.entries.snack.append(updated)
        default: day.entries.dinner.append(updated)
        }
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
        _ = originalMeal // Kept in the API for explicit caller intent and telemetry.
    }

    func restoreNutritionEntry(dateKey: String, meal: String, entry: NutritionEntry) async {
        var next = nutritionWorkspace
        var day = next.days[dateKey] ?? NutritionDay.empty(date: dateKey)
        let allEntries = day.entries.breakfast + day.entries.lunch + day.entries.snack + day.entries.dinner
        guard !allEntries.contains(where: { $0.id == entry.id }) else { return }
        switch meal {
        case "breakfast": day.entries.breakfast.append(entry)
        case "lunch": day.entries.lunch.append(entry)
        case "snack": day.entries.snack.append(entry)
        default: day.entries.dinner.append(entry)
        }
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
    }

    func deleteNutritionEntry(dateKey: String, meal: String, id: String) async {
        var next = nutritionWorkspace
        guard var day = next.days[dateKey] else { return }
        switch meal {
        case "breakfast": day.entries.breakfast.removeAll { $0.id == id }
        case "lunch": day.entries.lunch.removeAll { $0.id == id }
        case "snack": day.entries.snack.removeAll { $0.id == id }
        default: day.entries.dinner.removeAll { $0.id == id }
        }
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
    }

    func addWater(dateKey: String, amountMl: Double) async {
        var next = nutritionWorkspace
        var day = next.days[dateKey] ?? NutritionDay.empty(date: dateKey)
        day.waterMl = max(0, day.waterMl + amountMl)
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
    }

    func toggleNutritionDayClosed(dateKey: String) async {
        var next = nutritionWorkspace
        var day = next.days[dateKey] ?? NutritionDay.empty(date: dateKey)
        day.closedAt = day.closedAt == nil ? RootineDate.isoTimestamp() : nil
        next.days[dateKey] = day
        await persistNutritionWorkspace(next)
    }

    private func persistTaskWorkspace(_ value: TaskWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        taskWorkspace = next
        guard let store, let syncEngine else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            try await store.save(next, key: .tasks)
            try await syncEngine.enqueue(next, key: .tasks)
            await markLocalOnly()
            await flushPendingMutations()
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func persistNutritionWorkspace(_ value: NutritionWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        nutritionWorkspace = next
        guard let store, let syncEngine else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            try await store.save(next, key: .nutrition)
            try await syncEngine.enqueue(next, key: .nutrition)
            await markLocalOnly()
            await flushPendingMutations()
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func persistNotesWorkspace(_ value: NotesWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        notesWorkspace = next
        guard let store, let syncEngine else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            try await store.save(next, key: .notes)
            try await syncEngine.enqueue(next, key: .notes)
            await markLocalOnly()
            await flushPendingMutations()
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func persistSportWorkspace(_ value: SportWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        sportWorkspace = next
        await persistCanonicalWorkspace(next, key: .sport, merge: RootineCanonicalWorkspaceMapping.mergedSportPayload)
    }

    private func persistGoalsWorkspace(_ value: GoalsWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        goalsWorkspace = next
        await persistCanonicalWorkspace(next, key: .goals, merge: RootineCanonicalWorkspaceMapping.mergedGoalsPayload)
    }

    private func persistWorkWorkspace(_ value: WorkWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        workWorkspace = next
        await persistCanonicalWorkspace(next, key: .work, merge: RootineCanonicalWorkspaceMapping.mergedWorkPayload)
    }

    private func persistTravelWorkspace(_ value: TravelWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        travelWorkspace = next
        await persistCanonicalWorkspace(next, key: .travel, merge: RootineCanonicalWorkspaceMapping.mergedTravelPayload)
    }

    private func persistHealthWorkspace(_ value: HealthWorkspace) async {
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        healthWorkspace = next
        await persistCanonicalWorkspace(next, key: .health, merge: RootineCanonicalWorkspaceMapping.mergedHealthPayload)
    }

    private func persistAffairsWorkspace(_ value: AffairsWorkspace) async {
        var next = value
        next.version = 2
        affairsWorkspace = next
        await persistWorkspace(next, key: .affairs)
    }

    private func persistWorkspace<T: Codable & Sendable>(_ value: T, key: RootineStorageKey) async {
        guard let store, let syncEngine else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            try await store.save(value, key: key)
            try await syncEngine.enqueue(value, key: key)
            await markLocalOnly()
            await flushPendingMutations()
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func persistCanonicalWorkspace<T: Codable & Sendable>(
        _ value: T,
        key: RootineStorageKey,
        merge: (T, JSONValue) throws -> JSONValue
    ) async {
        guard let store, let syncEngine else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            let base = canonicalShadows[key]
            let mapped = try base.map { try merge(value, $0) } ?? encodeCanonical(value, key: key)
            try await store.save(value, key: key)
            canonicalShadows[key] = mapped
            if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key) {
                try await store.save(mapped, key: shadowKey)
            }
            try await syncEngine.enqueue(
                payload: mapped,
                storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: key)
            )
            await markLocalOnly()
            await flushPendingMutations()
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func jsonPayload<T: Encodable>(_ value: T, encoder: JSONEncoder) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: encoder.encode(value))
    }

    private func encodeCanonical<T: Codable>(_ value: T, key: RootineStorageKey) throws -> JSONValue {
        switch key {
        case .sport:
            guard let value = value as? SportWorkspace else { throw WorkspaceEncodingError.invalidValue(for: key) }
            return try RootineCanonicalWorkspaceMapping.payload(for: value)
        case .goals:
            guard let value = value as? GoalsWorkspace else { throw WorkspaceEncodingError.invalidValue(for: key) }
            return try RootineCanonicalWorkspaceMapping.payload(for: value)
        case .work:
            guard let value = value as? WorkWorkspace else { throw WorkspaceEncodingError.invalidValue(for: key) }
            return try RootineCanonicalWorkspaceMapping.payload(for: value)
        case .travel:
            guard let value = value as? TravelWorkspace else { throw WorkspaceEncodingError.invalidValue(for: key) }
            return try RootineCanonicalWorkspaceMapping.payload(for: value)
        case .health:
            guard let value = value as? HealthWorkspace else { throw WorkspaceEncodingError.invalidValue(for: key) }
            return try RootineCanonicalWorkspaceMapping.payload(for: value)
        default: return try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
        }
    }

    func flushPendingMutations() async {
        guard let syncEngine else {
            workspaceSyncStatus = .unavailable
            return
        }
        let pending = (try? await syncEngine.pendingMutationCount()) ?? 0
        guard let accessToken = session?.accessToken else {
            workspaceSyncStatus = .localOnly(pending: pending)
            return
        }
        workspaceSyncStatus = .syncing(pending: pending)
        do {
            switch try await syncEngine.flush(accessToken: accessToken) {
            case .idle:
                workspaceSyncStatus = .synced
                foundationMessage = "Brak zmian oczekujących na synchronizację"
            case .applied(let count):
                workspaceSyncStatus = .synced
                foundationMessage = "Zsynchronizowano zmian: \(count)"
            case .conflict(let keys):
                workspaceSyncStatus = .conflict(storageKeys: keys)
                foundationMessage = "Konflikt CAS wymaga decyzji dla: \(keys.count)"
            }
        } catch {
            await markLocalOnly()
            foundationMessage = "Offline — kolejka pozostała na urządzeniu"
        }
    }

    private func markLocalOnly() async {
        let pending = (try? await syncEngine?.pendingMutationCount()) ?? 0
        workspaceSyncStatus = .localOnly(pending: pending)
    }

    private func configureRuntime(userID: String) {
        canonicalShadows.removeAll()
        let userStore = WorkspaceFileStore(userID: userID)
        store = userStore
        syncEngine = WorkspaceSyncEngine(store: userStore, remote: api)
    }

    /// Foreground refresh plus polling keeps local state current when no
    /// realtime subscription is available. It never replaces the local
    /// source of truth and is cancelled as soon as the session ends.
    private func startRealtimeRefreshLoop() {
        refreshTask?.cancel()
        guard configuration.isAuthComplete else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await _Concurrency.Task.sleep(for: .seconds(30))
                guard !Task.isCancelled, let self else { return }
                guard let token = self.session?.accessToken else { return }
                await self.loadAndReconcile(accessToken: token)
            }
        }
    }

    private func normalizedEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func accept(_ newSession: SupabaseSession, passwordRecovery: Bool = false) async throws {
        try keychain.save(newSession)
        session = newSession
        isPasswordRecovery = passwordRecovery
        configureRuntime(userID: newSession.user.id)
        guard !passwordRecovery else { return }
        await loadAndReconcile(accessToken: newSession.accessToken)
        startRealtimeRefreshLoop()
        await refreshRecoveryFiles()
    }

    private func loadLocalCopies() async {
        guard let store else { return }
        taskWorkspace = (try? await store.load(TaskWorkspace.self, key: .tasks)) ?? .empty
        nutritionWorkspace = (try? await store.load(NutritionWorkspace.self, key: .nutrition)) ?? .empty
        notesWorkspace = (try? await store.load(NotesWorkspace.self, key: .notes)) ?? .empty
        sportWorkspace = (try? await store.load(SportWorkspace.self, key: .sport)) ?? .empty
        goalsWorkspace = (try? await store.load(GoalsWorkspace.self, key: .goals)) ?? .empty
        let localWork = (try? await store.load(WorkWorkspace.self, key: .work)) ?? .empty
        workWorkspace = await sanitizedWorkWorkspace(localWork, store: store, syncEngine: syncEngine)
        travelWorkspace = (try? await store.load(TravelWorkspace.self, key: .travel)) ?? .empty
        healthWorkspace = (try? await store.load(HealthWorkspace.self, key: .health)) ?? .empty
        let localAffairs = (try? await store.load(AffairsWorkspace.self, key: .affairs)) ?? .empty
        affairsWorkspace = await sanitizedAffairsWorkspace(localAffairs, store: store, syncEngine: syncEngine)
        recoveryFiles = (try? await store.recoveryFiles()) ?? []
        for key in [RootineStorageKey.sport, .goals, .work, .travel, .health] {
            guard let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key),
                  let shadow = try? await store.load(JSONValue.self, key: shadowKey) else { continue }
            canonicalShadows[key] = shadow
        }
    }

    /// A timestamp is user data, not a reason to trap the Work screen in an
    /// endless “stop” state. Keep the original bytes in Recovery and clear
    /// only the invalid active marker; completed focus sessions remain intact.
    private func sanitizedWorkWorkspace(
        _ workspace: WorkWorkspace,
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine? = nil
    ) async -> WorkWorkspace {
        guard let rawStart = workspace.activeFocusStartedAt,
              RootineDate.date(from: rawStart) == nil else { return workspace }
        if let data = try? JSONEncoder().encode(workspace) {
            _ = try? await store.writeRecoveryCopy(data, label: "work-focus-corrupt")
        }
        var sanitized = workspace
        sanitized.activeFocusStartedAt = nil
        sanitized.updatedAt = RootineDate.isoTimestamp()
        try? await store.save(sanitized, key: .work)
        let mapped: JSONValue?
        if let shadow = canonicalShadows[.work] {
            mapped = try? RootineCanonicalWorkspaceMapping.mergedWorkPayload(for: sanitized, onto: shadow)
        } else {
            mapped = try? RootineCanonicalWorkspaceMapping.payload(for: sanitized)
        }
        if let syncEngine, let mapped {
            canonicalShadows[.work] = mapped
            if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: .work) {
                try? await store.save(mapped, key: shadowKey)
            }
            _ = try? await syncEngine.enqueue(
                payload: mapped,
                storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: .work)
            )
        }
        foundationMessage = "Uszkodzona sesja skupienia została zachowana w Recovery i wyczyszczona"
        return sanitized
    }

    private func normalizedAffairsWorkspace(_ workspace: AffairsWorkspace) -> AffairsWorkspace {
        var normalized = workspace
        normalized.matters = workspace.matters.map { matter in
            var matter = matter
            matter.category = AffairMatterCategory.canonical(matter.category)
            return matter
        }
        normalized.version = 2
        return normalized
    }

    private func sanitizedAffairsWorkspace(
        _ workspace: AffairsWorkspace,
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine? = nil
    ) async -> AffairsWorkspace {
        let normalized = normalizedAffairsWorkspace(workspace)
        guard normalized != workspace else { return workspace }
        try? await store.save(normalized, key: .affairs)
        if let syncEngine, let payload = try? jsonPayload(normalized, encoder: JSONEncoder()) {
            _ = try? await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.affairs.rawValue)
        }
        foundationMessage = "Znaleziono starszą kategorię sprawy i bezpiecznie ją zmigrowano"
        return normalized
    }

    private func loadAndReconcile(accessToken: String) async {
        guard let store, let syncEngine else { return }
        guard !isReconciling else { return }
        isReconciling = true
        defer { isReconciling = false }
        do {
            let localTasks = try await store.load(TaskWorkspace.self, key: .tasks)
            let localNutrition = try await store.load(NutritionWorkspace.self, key: .nutrition)
            let localNotes = try await store.load(NotesWorkspace.self, key: .notes)
            let localSport = try await store.load(SportWorkspace.self, key: .sport)
            let localGoals = try await store.load(GoalsWorkspace.self, key: .goals)
            let localWorkRaw = try await store.load(WorkWorkspace.self, key: .work)
            let localWork: WorkWorkspace?
            if let localWorkRaw {
                localWork = await sanitizedWorkWorkspace(localWorkRaw, store: store, syncEngine: syncEngine)
            } else {
                localWork = nil
            }
            let localTravel = try await store.load(TravelWorkspace.self, key: .travel)
            let localHealth = try await store.load(HealthWorkspace.self, key: .health)
            let localAffairsRaw = (try await store.load(AffairsWorkspace.self, key: .affairs)) ?? .empty
            let localAffairs = await sanitizedAffairsWorkspace(localAffairsRaw, store: store, syncEngine: syncEngine)
            let remoteRows = try await api.readSnapshots(accessToken: accessToken)
            // A malformed backend response must not crash the app through
            // Dictionary(uniqueKeysWithValues:). Keep the last row and surface
            // a conflict state below rather than losing the local snapshot.
            let remote = remoteRows.reduce(into: [String: RemoteWorkspaceSnapshot]()) { result, row in
                result[row.storageKey] = row
            }

            let taskResult = try await reconcile(localTasks, fallback: .empty, key: .tasks, remote: remote, store: store, syncEngine: syncEngine)
            let nutritionResult = try await reconcile(localNutrition, fallback: .empty, key: .nutrition, remote: remote, store: store, syncEngine: syncEngine)
            let notesResult = try await reconcile(localNotes, fallback: .empty, key: .notes, remote: remote, store: store, syncEngine: syncEngine)
            let sportResult = try await reconcileCanonical(localSport, fallback: .empty, key: .sport, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedSportPayload, decode: RootineCanonicalWorkspaceMapping.sportWorkspace(from:))
            let goalsResult = try await reconcileCanonical(localGoals, fallback: .empty, key: .goals, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedGoalsPayload, decode: RootineCanonicalWorkspaceMapping.goalsWorkspace(from:))
            let workResult = try await reconcileCanonical(localWork, fallback: .empty, key: .work, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedWorkPayload, decode: RootineCanonicalWorkspaceMapping.workWorkspace(from:))
            let travelResult = try await reconcileCanonical(localTravel, fallback: .empty, key: .travel, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedTravelPayload, decode: RootineCanonicalWorkspaceMapping.travelWorkspace(from:))
            let healthResult = try await reconcileCanonical(localHealth, fallback: .empty, key: .health, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedHealthPayload, decode: RootineCanonicalWorkspaceMapping.healthWorkspace(from:))
            let affairsResult = try await reconcile(localAffairs, fallback: .empty, key: .affairs, remote: remote, store: store, syncEngine: syncEngine)
            taskWorkspace = taskResult.value
            nutritionWorkspace = nutritionResult.value
            notesWorkspace = notesResult.value
            sportWorkspace = sportResult.value
            goalsWorkspace = goalsResult.value
            workWorkspace = await sanitizedWorkWorkspace(workResult.value, store: store, syncEngine: syncEngine)
            travelWorkspace = travelResult.value
            healthWorkspace = healthResult.value
            affairsWorkspace = await sanitizedAffairsWorkspace(affairsResult.value, store: store, syncEngine: syncEngine)
            let reconciliationResults: [(RootineStorageKey, Bool)] = [
                (.tasks, taskResult.conflict),
                (.nutrition, nutritionResult.conflict),
                (.notes, notesResult.conflict),
                (.sport, sportResult.conflict),
                (.goals, goalsResult.conflict),
                (.work, workResult.conflict),
                (.travel, travelResult.conflict),
                (.health, healthResult.conflict),
                (.affairs, affairsResult.conflict)
            ]
            let conflictKeys = reconciliationResults
                .filter(\.1)
                .map { $0.0.rawValue }

            if conflictKeys.isEmpty {
                foundationMessage = "Kontrakty lokalne i Supabase zostały uzgodnione"
                await flushPendingMutations()
                if case .conflict = workspaceSyncStatus {
                    foundationMessage = "Dane lokalne są bezpieczne, ale czekają na rozwiązanie konfliktu"
                } else {
                    realtimeLastRefresh = Date()
                }
            } else {
                workspaceSyncStatus = .conflict(storageKeys: conflictKeys)
                foundationMessage = "Konflikt pierwszego uzgodnienia: \(conflictKeys.count)"
            }
        } catch let error as RootineAPIError {
            await loadLocalCopies()
            switch error {
            case .network, .server:
                await markLocalOnly()
                foundationMessage = "Offline — warstwa danych używa lokalnych kopii"
            case .unauthorized:
                signOutFoundationSession()
                return
            default:
                workspaceSyncStatus = .conflict(storageKeys: ["remote"])
                foundationMessage = "Nie udało się odczytać danych z serwera. Lokalna kopia jest bezpieczna."
            }
        } catch {
            await loadLocalCopies()
            workspaceSyncStatus = .conflict(storageKeys: ["remote"])
            foundationMessage = "Nie udało się odczytać danych z serwera. Lokalna kopia jest bezpieczna."
        }
    }

    private func reconcile<T: Codable & Equatable & Sendable>(
        _ local: T?,
        fallback: T,
        key: RootineStorageKey,
        remote: [String: RemoteWorkspaceSnapshot],
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine
    ) async throws -> (value: T, conflict: Bool) {
        guard let remoteRow = remote[key.rawValue] else {
            if let local {
                try await syncEngine.enqueue(local, key: key)
                return (local, false)
            }
            return (fallback, false)
        }

        let remoteData = try JSONEncoder().encode(remoteRow.payload)
        let remoteValue = try JSONDecoder().decode(T.self, from: remoteData)
        guard let local else {
            try await store.save(remoteValue, key: key)
            try await store.setRevision(remoteRow.revision, for: key.rawValue)
            return (remoteValue, false)
        }
        if local == remoteValue {
            let revision = try await store.revision(for: key.rawValue)
            try await store.setRevision(max(revision, remoteRow.revision), for: key.rawValue)
            return (local, false)
        }
        let localRevision = try await store.revision(for: key.rawValue)
        let hasPendingMutation = try await store.pendingMutations().contains { $0.storageKey == key.rawValue }
        if !hasPendingMutation, remoteRow.revision > localRevision {
            try await store.save(remoteValue, key: key)
            try await store.setRevision(remoteRow.revision, for: key.rawValue)
            return (remoteValue, false)
        }
        if !hasPendingMutation, remoteRow.revision < localRevision {
            try await syncEngine.enqueue(local, key: key)
            return (local, false)
        }
        // A local mutation is authoritative while the server still reports
        // the revision it was based on. Only a strictly newer remote revision
        // is a true concurrent conflict.
        if hasPendingMutation, remoteRow.revision <= localRevision {
            return (local, false)
        }
        return (local, true)
    }

    private func reconcileCanonical<T: Codable & Equatable & Sendable>(
        _ local: T?,
        fallback: T,
        key: RootineStorageKey,
        remote: [String: RemoteWorkspaceSnapshot],
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine,
        encode: @Sendable (T) throws -> JSONValue,
        merge: @Sendable (T, JSONValue) throws -> JSONValue,
        decode: @Sendable (JSONValue) throws -> T
    ) async throws -> (value: T, conflict: Bool) {
        let result = try await WorkspaceCanonicalReconciler.reconcile(
            local,
            fallback: fallback,
            key: key,
            remote: remote,
            shadow: canonicalShadows[key],
            store: store,
            syncEngine: syncEngine,
            encode: encode,
            merge: merge,
            decode: decode
        )
        if let shadow = result.shadow {
            canonicalShadows[key] = shadow
        }
        return (result.value, result.conflict)
    }
}

struct CanonicalReconcileResult<T: Sendable>: Sendable {
    let value: T
    let conflict: Bool
    let shadow: JSONValue?
}

enum WorkspaceCanonicalReconciler {
    static func reconcile<T: Codable & Equatable & Sendable>(
        _ local: T?,
        fallback: T,
        key: RootineStorageKey,
        remote: [String: RemoteWorkspaceSnapshot],
        shadow: JSONValue?,
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine,
        encode: @Sendable (T) throws -> JSONValue,
        merge: @Sendable (T, JSONValue) throws -> JSONValue,
        decode: @Sendable (JSONValue) throws -> T
    ) async throws -> CanonicalReconcileResult<T> {
        let canonicalKey = RootineCanonicalWorkspaceMapping.storageKey(for: key)
        let remoteRow = remote[canonicalKey]
        let legacyRow = remoteRow == nil && canonicalKey != key.rawValue ? remote[key.rawValue] : nil
        guard let remoteRow = remoteRow ?? legacyRow else {
            if let local {
                let mapped = try shadow.map { try merge(local, $0) } ?? encode(local)
                if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key) {
                    try await store.save(mapped, key: shadowKey)
                }
                try await syncEngine.enqueue(payload: mapped, storageKey: canonicalKey)
                return CanonicalReconcileResult(value: local, conflict: false, shadow: mapped)
            }
            return CanonicalReconcileResult(value: fallback, conflict: false, shadow: shadow)
        }

        var isLegacy = legacyRow != nil || isLegacyNativeShape(remoteRow.payload, key: key)
        let remoteValue: T
        if isLegacy {
            remoteValue = try JSONDecoder().decode(T.self, from: JSONEncoder().encode(remoteRow.payload))
        } else {
            do {
                remoteValue = try decode(remoteRow.payload)
            } catch where key == .work || key == .travel {
                // Work and Travel kept their old key, so shape detection is
                // required while upgrading the v1 native payload in place.
                remoteValue = try JSONDecoder().decode(T.self, from: JSONEncoder().encode(remoteRow.payload))
                isLegacy = true
            }
        }
        let canonicalPayload = isLegacy ? try encode(remoteValue) : remoteRow.payload
        if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key) {
            try await store.save(canonicalPayload, key: shadowKey)
        }
        guard let local else {
            try await store.save(remoteValue, key: key)
            if isLegacy {
                if canonicalKey == key.rawValue {
                    // Work and Travel reused the canonical key for their
                    // compact v1 payload. The migration must CAS against the
                    // revision of that row, not the default revision zero.
                    try await store.setRevision(remoteRow.revision, for: canonicalKey)
                }
                try await syncEngine.enqueue(payload: canonicalPayload, storageKey: canonicalKey)
            } else {
                try await store.setRevision(remoteRow.revision, for: canonicalKey)
            }
            return CanonicalReconcileResult(value: remoteValue, conflict: false, shadow: canonicalPayload)
        }
        let localRevision = try await store.revision(for: canonicalKey)
        let hasPendingMutation = try await store.pendingMutations().contains { $0.storageKey == canonicalKey }
        let localMatchesRemote = try merge(local, canonicalPayload) == canonicalPayload
        if localMatchesRemote {
            if isLegacy {
                if canonicalKey == key.rawValue {
                    try await store.setRevision(remoteRow.revision, for: canonicalKey)
                }
                try await syncEngine.enqueue(payload: canonicalPayload, storageKey: canonicalKey)
            } else {
                try await store.setRevision(remoteRow.revision, for: canonicalKey)
            }
            return CanonicalReconcileResult(value: local, conflict: false, shadow: canonicalPayload)
        }
        if !hasPendingMutation, remoteRow.revision > localRevision {
            try await store.save(remoteValue, key: key)
            try await store.setRevision(remoteRow.revision, for: canonicalKey)
            return CanonicalReconcileResult(value: remoteValue, conflict: false, shadow: canonicalPayload)
        }
        if !hasPendingMutation, remoteRow.revision < localRevision {
            let mappedLocal = try merge(local, canonicalPayload)
            if let shadowKey = RootineCanonicalWorkspaceMapping.shadowKey(for: key) {
                try await store.save(mappedLocal, key: shadowKey)
            }
            try await syncEngine.enqueue(payload: mappedLocal, storageKey: canonicalKey)
            return CanonicalReconcileResult(value: local, conflict: false, shadow: mappedLocal)
        }
        if hasPendingMutation, remoteRow.revision <= localRevision {
            return CanonicalReconcileResult(value: local, conflict: false, shadow: canonicalPayload)
        }
        return CanonicalReconcileResult(value: local, conflict: true, shadow: canonicalPayload)
    }

    private static func isLegacyNativeShape(_ payload: JSONValue, key: RootineStorageKey) -> Bool {
        guard case .object(let object) = payload else { return false }
        guard case .number(let version) = object["version"] else { return false }
        switch key {
        case .work: return version == 1
        case .travel: return version == 1
        default: return false
        }
    }
}
