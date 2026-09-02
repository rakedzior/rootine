import Combine
import Foundation
import UIKit
import BackgroundTasks
import Network

private enum WorkspaceEncodingError: Error {
    case invalidValue(for: RootineStorageKey)
}

enum RootineWorkspaceArchiveError: LocalizedError, Equatable {
    case invalidArchive
    case unsupportedVersion(Int)
    case unsupportedWorkspaceVersion(key: String, found: Int, supported: Int)
    case accountMismatch
    case noLocalStore
    case diagnosticRecoveryNotRestorable
    case importInProgress

    var errorDescription: String? {
        switch self {
        case .invalidArchive:
            return "Nieprawidłowa kopia Rootine. Wybierz pełny plik JSON wyeksportowany z aplikacji; bieżących danych nie zmieniono."
        case .unsupportedVersion(let version):
            return "Ta kopia danych pochodzi z nieobsługiwanej wersji \(version)."
        case .unsupportedWorkspaceVersion(let key, let found, let supported):
            return "Workspace \(key) ma wersję \(found), a ta aplikacja obsługuje wersję \(supported)."
        case .accountMismatch:
            return "Ta kopia należy do innego konta Rootine. Nie zmieniono lokalnych danych."
        case .noLocalStore:
            return "Kopia lokalna będzie dostępna po uruchomieniu sesji konta."
        case .diagnosticRecoveryNotRestorable:
            return "Ten plik Recovery zawiera diagnostykę, a nie pełną kopię danych. Możesz go usunąć lub przekazać do wsparcia."
        case .importInProgress:
            return "Import danych już trwa. Poczekaj na jego zakończenie i spróbuj ponownie."
        }
    }
}

enum WorkspaceSyncStatus: Equatable, Sendable {
    case unavailable
    case localOnly(pending: Int)
    case syncing(pending: Int)
    case synced
    case conflict(storageKeys: [String])
    case schemaMismatch
    case unauthorized
    case error
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
    /// Import is a foreground data operation, not an authentication launch
    /// state. The shell keeps the current screen visible while its writes are
    /// temporarily gated.
    @Published private(set) var isImportingWorkspace = false
    @Published private(set) var isLaunching = true
    @Published private(set) var isPasswordRecovery = false
    @Published private(set) var authCallbackError: String?
    @Published private(set) var foundationMessage = "Szkielet techniczny gotowy"
    @Published private(set) var workspaceSyncStatus = WorkspaceSyncStatus.unavailable
    @Published private(set) var realtimeLastRefresh: Date?
    @Published private(set) var realtimeStatus: RootineRealtimeStatus = .stopped
    @Published private(set) var syncCoordinatorStatus: RootineSyncCoordinatorStatus = .stopped
    @Published private(set) var recoveryFiles: [WorkspaceRecoveryFile] = []
    @Published private(set) var deviceRegistration: RootineDeviceRegistration?
    @Published private(set) var notificationPermissionState: RootineNotificationPermissionState = .notDetermined
    @Published private(set) var normalizedReadEnabled = false
    @Published private(set) var normalizedReadFallbackReason: String?

    let configuration: RootineConfiguration
    private let api: RootineAPIClient
    private let normalizedReadClient: any RootineRelationalReadClient
    private let readFeatureFlags: any RootineReadFeatureFlagStore
    private let keychain: KeychainSessionStore
    private let deviceIdentity: RootineDeviceIdentityStore
    private var store: WorkspaceFileStore?
    private var syncEngine: WorkspaceSyncEngine?
    /// Local reminders consume the same task aggregate as the sync boundary.
    /// The scheduler is optional so permission/API failures never gate local
    /// persistence or the sync queue.
    private var localNotificationScheduler: RootineLocalNotificationScheduler?
    /// B08 can replace this in-memory value with the profile payload once its
    /// normalized read is available. It intentionally has no SQLite shadow in
    /// B10, matching the single aggregate-cache decision in the main plan.
    private var notificationPreferences = RootineNotificationPreferences()
    private var canonicalShadows: [RootineStorageKey: JSONValue] = [:]
    private var creationGate = WorkspaceCreationGate()
    private var refreshTask: Task<Void, Never>?
    private var realtimeClient: RootineRealtimeClient?
    private var syncCoordinator: RootineSyncCoordinator?
    private var networkMonitor: NWPathMonitor?
    private var networkMonitorQueue: DispatchQueue?
    private var didRegisterBackgroundTask = false
    private var isReconciling = false
    /// Main-actor methods can still interleave at an `await`. Keep an import
    /// from racing a UI write by letting already-started persistence finish
    /// and dropping writes that began while the import was in flight.
    private var archiveImportInProgress = false
    private var archiveImportWaiters: [CheckedContinuation<Void, Never>] = []
    private var signOutAfterArchiveImport = false
    private var activeWorkspacePersists = 0
    private var workspacePersistenceWaiters: [CheckedContinuation<Void, Never>] = []
    private var activeMutationFlushes = 0
    private var mutationFlushWaiters: [CheckedContinuation<Void, Never>] = []
    private var reconciliationWaiters: [CheckedContinuation<Void, Never>] = []
    private var deviceRegistrationTask: Task<Void, Never>?
    private var lastDeviceRegistrationFingerprint: String?

    init(
        configuration: RootineConfiguration = .fromBundle(),
        keychain: KeychainSessionStore = KeychainSessionStore(),
        normalizedReadClient: (any RootineRelationalReadClient)? = nil,
        readFeatureFlags: (any RootineReadFeatureFlagStore)? = nil
    ) {
        self.configuration = configuration
        self.keychain = keychain
        let configuredAPI = RootineAPIClient(configuration: configuration)
        self.api = configuredAPI
        self.deviceIdentity = RootineDeviceIdentityStore()
        self.normalizedReadClient = normalizedReadClient ?? configuredAPI
        self.readFeatureFlags = readFeatureFlags ?? UserDefaultsRootineReadFeatureFlagStore()
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
                await recoverOrphanedTransactions()
                await loadLocalCopies()
                await markLocalOnly()
                foundationMessage = "Offline — używam danych zapisanych na tym iPhonie"
                return
            }
        }
        await recoverOrphanedTransactions()
        await loadAndReconcile(accessToken: activeSession.accessToken)
        await flushPendingMutations()
        startRealtimeRuntime()
        startRealtimeRefreshLoop()
        scheduleDeviceRegistration()
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
                WorkspaceTask(id: 5, text: "Przegląd tygodnia", done: false, time: "17:30", view: "wszystkie", calendarDate: tomorrow),
                WorkspaceTask(
                    id: 6,
                    text: "Zamknąć brief produktu",
                    done: false,
                    view: "wszystkie",
                    priority: .high,
                    source: CommitmentTaskSource(
                        kind: "work",
                        entity: "task",
                        context: "work",
                        href: "/work",
                        originTaskId: nil,
                        managed: "ios"
                    )
                )
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
        workWorkspace = WorkWorkspace(
            version: 1,
            updatedAt: timestamp,
            activeFocusStartedAt: nil,
            focusSessions: [
                WorkFocusSession(
                    id: "preview-focus-1",
                    startedAt: timestamp,
                    endedAt: timestamp,
                    minutes: 25
                )
            ]
        )
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
            if let value = try? await store.load(AffairsWorkspace.self, key: .affairs) {
                affairsWorkspace = AffairsWorkspaceRules.normalized(value)
            }
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
        guard !archiveImportInProgress else {
            // Keep the user's intent, but finish the in-flight file
            // operation first so it cannot publish an imported snapshot into
            // a freshly signed-out environment.
            signOutAfterArchiveImport = true
            return
        }
        let accessToken = session?.accessToken
        let currentDeviceID = deviceIdentity.loadOrCreate()
        deviceRegistrationTask?.cancel()
        deviceRegistrationTask = nil
        lastDeviceRegistrationFingerprint = nil
        if let accessToken {
            // Sign-out is synchronous at the UI boundary. Revoke with the
            // captured token before dropping local session state; failures
            // are deliberately best effort so an offline user can still
            // leave the account without losing local data.
            let api = api
            Task {
                try? await api.revokeDevice(deviceID: currentDeviceID, accessToken: accessToken)
            }
        }
        refreshTask?.cancel()
        refreshTask = nil
        stopRealtimeRuntime()
        keychain.clear()
        session = nil
        store = nil
        syncEngine = nil
        let scheduler = localNotificationScheduler
        localNotificationScheduler = nil
        Task { await scheduler?.cancelAll() }
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
        realtimeStatus = .stopped
        syncCoordinatorStatus = .stopped
        recoveryFiles = []
        deviceRegistration = nil
        notificationPermissionState = .notDetermined
        normalizedReadEnabled = false
        normalizedReadFallbackReason = nil
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
        // A second import is not allowed to interleave with this one. The
        // import lock is set before decoding so validation and disk staging
        // are one serialized operation from the UI's point of view.
        guard !archiveImportInProgress else {
            throw RootineWorkspaceArchiveError.importInProgress
        }
        archiveImportInProgress = true
        let wasWorking = isWorking
        isWorking = true
        isImportingWorkspace = true
        defer {
            isWorking = wasWorking
            isImportingWorkspace = false
            finishArchiveImport()
        }
        var archive: RootineWorkspaceExport
        do {
            archive = try JSONDecoder().decode(RootineWorkspaceExport.self, from: data)
        } catch {
            throw RootineWorkspaceArchiveError.invalidArchive
        }
        guard archive.schemaVersion == RootineWorkspaceExport.currentVersion else {
            throw RootineWorkspaceArchiveError.unsupportedVersion(archive.schemaVersion)
        }
        if let importedAccount = archive.accountID,
           let currentAccount = session?.user.id,
           importedAccount != currentAccount {
            throw RootineWorkspaceArchiveError.accountMismatch
        }
        guard let store, let syncEngine else { throw RootineWorkspaceArchiveError.noLocalStore }

        // Affairs v1 is still readable and is migrated to the current v2
        // category contract. Any other future version must be rejected before
        // normalization; otherwise blindly setting `version = 2` would make
        // an unsupported archive look valid and fail only after relaunch.
        let importedAffairsVersion = archive.affairs.version
        guard importedAffairsVersion == 1
            || importedAffairsVersion == RootineStorageKey.affairs.supportedLocalVersion
        else {
            throw RootineWorkspaceArchiveError.unsupportedWorkspaceVersion(
                key: RootineStorageKey.affairs.rawValue,
                found: importedAffairsVersion,
                supported: RootineStorageKey.affairs.supportedLocalVersion!
            )
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

        // Create a safety copy and stage every file before publishing any
        // @Published value. The transaction covers both workspace documents
        // and the pending queue, so a queue failure cannot leave an imported
        // local snapshot paired with the previous upload intent.
        await waitForReconciliationToFinish()
        await waitForWorkspacePersistenceToFinish()
        await waitForMutationFlushToFinish()
        let transaction = try await store.beginBatchTransaction()
        do {
            _ = try await store.writeRecoveryCopy(
                try exportWorkspaceArchive(),
                label: "before-import",
                kind: .workspaceArchive
            )
            try await store.replaceWorkspaceBatch(documents)
            _ = try await syncEngine.enqueueBatch(syncPayloads)
            try await store.commitBatchTransaction(transaction)
        } catch {
            try? await store.rollbackBatchTransaction(transaction)
            throw error
        }

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
        await flushPendingMutations(allowingImport: true)
        foundationMessage = "Zaimportowano kopię danych. Poprzedni stan jest w Recovery."
    }

    func restoreRecoveryFile(_ file: WorkspaceRecoveryFile) async throws {
        guard let store else { throw RootineWorkspaceArchiveError.noLocalStore }
        guard file.isRestorable else {
            throw RootineWorkspaceArchiveError.diagnosticRecoveryNotRestorable
        }
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
        // The compact archive has no separate schema validator. Reject an
        // Affairs payload that still violates the native contract after its
        // explicit v1 -> v2 migration/normalization, rather than publishing a
        // snapshot that can only fail when a later editor opens it.
        guard AffairsWorkspaceRules.validate(archive.affairs).isEmpty else {
            throw RootineWorkspaceArchiveError.invalidArchive
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
        guard await beginWorkspacePersistence() else {
            try await clearLocalDataAndSignOut()
            return
        }
        defer { endWorkspacePersistence() }
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
        scheduleDeviceRegistration()
        if let syncCoordinator {
            _ = await syncCoordinator.syncNow(reason: .manual)
        } else {
            await loadAndReconcile(accessToken: accessToken)
            await flushPendingMutations()
        }
        await refreshRecoveryFiles()
    }

    /// Profile sync (B08) can feed notification preferences without coupling
    /// the local scheduler to a transport or persistence implementation.
    func updateNotificationPreferences(_ preferences: RootineNotificationPreferences) async {
        notificationPreferences = preferences
        if let userID = session?.user.id {
            RootineNotificationPreferencesStore.save(preferences, userID: userID)
        }
        await reconcileLocalNotifications()
    }

    /// Permission UX remains outside B10. This method is intentionally safe to
    /// call from login/foreground flows: a denial or OS error is a value, not
    /// a thrown error that could interrupt sync.
    func requestNotificationAuthorization() async -> RootineNotificationAuthorization {
        guard let scheduler = localNotificationScheduler else { return .unavailable }
        return await scheduler.requestAuthorization()
    }

    /// B08 rollout control. The flag is scoped to the signed-in account and
    /// environment; turning it off never clears the relational shadow,
    /// cursor, local drafts, or pending commands.
    func setNormalizedReadEnabled(_ enabled: Bool, accountID: String? = nil) {
        let account = accountID ?? session?.user.id
        guard let account, !account.isEmpty else { return }
        readFeatureFlags.setNormalizedReadEnabled(
            enabled,
            accountID: account,
            environment: configuration.environment
        )
        if account == session?.user.id { normalizedReadEnabled = enabled }
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
        guard task.source?.kind == "work" else { return }
        if let index = next.tasks.firstIndex(where: { $0.id == task.id }) {
            // Deletion is a soft tombstone. Undo must revive that same row;
            // appending a second copy would break the shared task ID contract.
            guard next.tasks[index].source?.kind == "work" else { return }
            next.tasks[index].deleted = false
        } else {
            var restored = task
            restored.deleted = false
            next.tasks.append(restored)
        }
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
            createdAt: now,
            updatedAt: now
        ))
        next.updatedAt = now
        await persistSportWorkspace(next)
    }

    func toggleWorkoutCompleted(id: String) async {
        var next = sportWorkspace
        guard let index = next.workouts.firstIndex(where: { $0.id == id }) else { return }
        next.workouts[index].completed.toggle()
        let now = RootineDate.isoTimestamp()
        next.workouts[index].updatedAt = now
        next.updatedAt = now
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
        let now = RootineDate.isoTimestamp()
        next.workouts[index].updatedAt = now
        next.updatedAt = now
        await persistSportWorkspace(next)
    }

    func restoreWorkout(_ workout: SportWorkout) async {
        var next = sportWorkspace
        guard !next.workouts.contains(where: { $0.id == workout.id }) else { return }
        let now = RootineDate.isoTimestamp()
        var restored = workout
        restored.updatedAt = now
        next.workouts.append(restored)
        next.updatedAt = now
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
        let normalizedDueDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty, AffairDate.isValid(normalizedDueDate) else { return }
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
                dueDate: normalizedDueDate,
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
        let normalizedDueDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty, AffairDate.isValid(normalizedDueDate) else { return }
        var next = affairsWorkspace
        guard let index = next.matters.firstIndex(where: { $0.id == id }) else { return }
        next.matters[index].title = trimmedTitle
        next.matters[index].category = AffairMatterCategory.canonical(category)
        next.matters[index].priority = priority == "high" ? "high" : "normal"
        next.matters[index].dueDate = normalizedDueDate
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

    func addAffairOneTimePayment(
        title: String,
        category: String,
        amount: Double,
        dueDate: String,
        note: String = "",
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairDate.isValid(normalizedDate, allowingEmpty: false) else { return }
        let fingerprint = "affair-one-time|\(trimmedTitle)|\(normalizedDate)|\(AffairMoney.normalized(amount))"
        guard creationGate.claim(fingerprint) else { return }
        defer { creationGate.release(fingerprint) }
        let id = RootineLocalIdentifier.string(namespace: "affair-one-time", operationID: operationID)
        guard !affairsWorkspace.oneTimePayments.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.oneTimePayments.insert(AffairOneTimePayment(
            id: id,
            title: trimmedTitle,
            category: category.trimmingCharacters(in: .whitespacesAndNewlines),
            amount: AffairMoney.normalized(amount),
            dueDate: normalizedDate,
            paid: false,
            paidAt: "",
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairOneTimePayment(
        id: String,
        title: String,
        category: String,
        amount: Double,
        dueDate: String,
        note: String = ""
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairDate.isValid(normalizedDate, allowingEmpty: false) else { return }
        var next = affairsWorkspace
        guard let index = next.oneTimePayments.firstIndex(where: { $0.id == id }) else { return }
        var payment = next.oneTimePayments[index]
        payment.title = trimmedTitle
        payment.category = category.trimmingCharacters(in: .whitespacesAndNewlines)
        payment.amount = AffairMoney.normalized(amount)
        payment.dueDate = normalizedDate
        payment.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        next.oneTimePayments[index] = payment
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

    func addAffairPayment(
        name: String,
        category: String,
        amount: Double,
        cadence: String,
        nextDueDate: String,
        automatic: Bool = false,
        note: String = "",
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = nextDueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairsWorkspaceRules.cadences.contains(cadence),
              AffairDate.isValid(normalizedDate, allowingEmpty: false) else { return }
        let fingerprint = "affair-payment|\(trimmedName)|\(normalizedDate)|\(cadence)"
        guard creationGate.claim(fingerprint) else { return }
        defer { creationGate.release(fingerprint) }
        let id = RootineLocalIdentifier.string(namespace: "affair-payment", operationID: operationID)
        guard !affairsWorkspace.payments.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.payments.insert(AffairRecurringPayment(
            id: id,
            name: trimmedName,
            category: category.trimmingCharacters(in: .whitespacesAndNewlines),
            amount: AffairMoney.normalized(amount),
            cadence: cadence,
            nextDueDate: normalizedDate,
            automatic: automatic,
            active: true,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairPayment(
        id: String,
        name: String,
        category: String,
        amount: Double,
        cadence: String,
        nextDueDate: String,
        automatic: Bool,
        note: String = ""
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = nextDueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairsWorkspaceRules.cadences.contains(cadence),
              AffairDate.isValid(normalizedDate, allowingEmpty: false) else { return }
        var next = affairsWorkspace
        guard let index = next.payments.firstIndex(where: { $0.id == id }) else { return }
        var payment = next.payments[index]
        payment.name = trimmedName
        payment.category = category.trimmingCharacters(in: .whitespacesAndNewlines)
        payment.amount = AffairMoney.normalized(amount)
        payment.cadence = cadence
        payment.nextDueDate = normalizedDate
        payment.automatic = automatic
        payment.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        next.payments[index] = payment
        await persistAffairsWorkspace(next)
    }

    func setAffairPaymentActive(id: String, active: Bool) async {
        var next = affairsWorkspace
        guard let index = next.payments.firstIndex(where: { $0.id == id }) else { return }
        next.payments[index].active = active
        await persistAffairsWorkspace(next)
    }

    func advanceAffairPayment(id: String, reference: Date = Date()) async {
        var next = affairsWorkspace
        guard let index = next.payments.firstIndex(where: { $0.id == id }) else { return }
        let payment = next.payments[index]
        let advanced = AffairDate.advanceToFuture(payment.nextDueDate, cadence: payment.cadence, reference: reference)
        guard advanced != payment.nextDueDate else { return }
        next.payments[index].nextDueDate = advanced
        await persistAffairsWorkspace(next)
    }

    func deleteAffairPayment(id: String) async {
        var next = affairsWorkspace
        next.payments.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func addAffairSubscription(
        name: String,
        category: String,
        amount: Double,
        cadence: String,
        nextBillingDate: String,
        renewal: String,
        commitmentEndDate: String = "",
        note: String = "",
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = nextBillingDate.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCommitment = commitmentEndDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairsWorkspaceRules.cadences.contains(cadence),
              ["automatic", "manual"].contains(renewal),
              AffairDate.isValid(normalizedDate, allowingEmpty: false),
              AffairDate.isValid(normalizedCommitment) else { return }
        let id = RootineLocalIdentifier.string(namespace: "affair-subscription", operationID: operationID)
        guard !affairsWorkspace.subscriptions.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.subscriptions.insert(AffairSubscription(
            id: id,
            name: trimmedName,
            category: category.trimmingCharacters(in: .whitespacesAndNewlines),
            amount: AffairMoney.normalized(amount),
            cadence: cadence,
            nextBillingDate: normalizedDate,
            renewal: renewal,
            commitmentEndDate: normalizedCommitment,
            active: true,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairSubscription(
        id: String,
        name: String,
        category: String,
        amount: Double,
        cadence: String,
        nextBillingDate: String,
        renewal: String,
        commitmentEndDate: String = "",
        note: String = ""
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = nextBillingDate.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCommitment = commitmentEndDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairMoney.decimal(amount) != nil,
              AffairsWorkspaceRules.cadences.contains(cadence),
              ["automatic", "manual"].contains(renewal),
              AffairDate.isValid(normalizedDate, allowingEmpty: false), AffairDate.isValid(normalizedCommitment) else { return }
        var next = affairsWorkspace
        guard let index = next.subscriptions.firstIndex(where: { $0.id == id }) else { return }
        var subscription = next.subscriptions[index]
        subscription.name = trimmedName
        subscription.category = category.trimmingCharacters(in: .whitespacesAndNewlines)
        subscription.amount = AffairMoney.normalized(amount)
        subscription.cadence = cadence
        subscription.nextBillingDate = normalizedDate
        subscription.renewal = renewal
        subscription.commitmentEndDate = normalizedCommitment
        subscription.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        next.subscriptions[index] = subscription
        await persistAffairsWorkspace(next)
    }

    func setAffairSubscriptionActive(id: String, active: Bool) async {
        var next = affairsWorkspace
        guard let index = next.subscriptions.firstIndex(where: { $0.id == id }) else { return }
        next.subscriptions[index].active = active
        await persistAffairsWorkspace(next)
    }

    func advanceAffairSubscription(id: String, reference: Date = Date()) async {
        var next = affairsWorkspace
        guard let index = next.subscriptions.firstIndex(where: { $0.id == id }) else { return }
        let subscription = next.subscriptions[index]
        let advanced = AffairDate.advanceToFuture(subscription.nextBillingDate, cadence: subscription.cadence, reference: reference)
        guard advanced != subscription.nextBillingDate else { return }
        next.subscriptions[index].nextBillingDate = advanced
        await persistAffairsWorkspace(next)
    }

    func deleteAffairSubscription(id: String) async {
        var next = affairsWorkspace
        next.subscriptions.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func addAffairDocument(
        name: String,
        category: String,
        holder: String,
        expiresAt: String,
        reminderDays: Int,
        note: String = "",
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = expiresAt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairsWorkspaceRules.documentCategories.contains(category),
              AffairDate.isValid(normalizedDate), (0...730).contains(reminderDays) else { return }
        let id = RootineLocalIdentifier.string(namespace: "affair-document", operationID: operationID)
        guard !affairsWorkspace.documents.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.documents.insert(AffairDocument(
            id: id,
            name: trimmedName,
            category: category,
            holder: holder.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Ja" : holder.trimmingCharacters(in: .whitespacesAndNewlines),
            expiresAt: normalizedDate,
            reminderDays: reminderDays,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairDocument(
        id: String,
        name: String,
        category: String,
        holder: String,
        expiresAt: String,
        reminderDays: Int,
        note: String = ""
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = expiresAt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, AffairsWorkspaceRules.documentCategories.contains(category),
              AffairDate.isValid(normalizedDate), (0...730).contains(reminderDays) else { return }
        var next = affairsWorkspace
        guard let index = next.documents.firstIndex(where: { $0.id == id }) else { return }
        next.documents[index].name = trimmedName
        next.documents[index].category = category
        next.documents[index].holder = holder.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Ja" : holder.trimmingCharacters(in: .whitespacesAndNewlines)
        next.documents[index].expiresAt = normalizedDate
        next.documents[index].reminderDays = reminderDays
        next.documents[index].note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        await persistAffairsWorkspace(next)
    }

    func deleteAffairDocument(id: String) async {
        var next = affairsWorkspace
        next.documents.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func addAffairVehicle(
        name: String,
        registration: String,
        mileage: Double,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, mileage.isFinite, mileage >= 0 else { return }
        let id = RootineLocalIdentifier.string(namespace: "affair-vehicle", operationID: operationID)
        guard !affairsWorkspace.vehicles.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.vehicles.insert(AffairVehicle(
            id: id,
            name: trimmedName,
            registration: registration.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(with: Locale(identifier: "pl-PL")),
            mileage: AffairMoney.normalized(mileage)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairVehicle(id: String, name: String, registration: String, mileage: Double) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, mileage.isFinite, mileage >= 0 else { return }
        var next = affairsWorkspace
        guard let index = next.vehicles.firstIndex(where: { $0.id == id }) else { return }
        next.vehicles[index].name = trimmedName
        next.vehicles[index].registration = registration.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(with: Locale(identifier: "pl-PL"))
        next.vehicles[index].mileage = AffairMoney.normalized(mileage)
        await persistAffairsWorkspace(next)
    }

    func updateAffairVehicleMileage(id: String, mileage: Double) async {
        guard mileage.isFinite, mileage >= 0 else { return }
        var next = affairsWorkspace
        guard let index = next.vehicles.firstIndex(where: { $0.id == id }), mileage >= next.vehicles[index].mileage else { return }
        next.vehicles[index].mileage = AffairMoney.normalized(mileage)
        await persistAffairsWorkspace(next)
    }

    func deleteAffairVehicle(id: String) async {
        var next = affairsWorkspace
        next.vehicles.removeAll { $0.id == id }
        next.vehicleItems.removeAll { $0.vehicleId == id }
        await persistAffairsWorkspace(next)
    }

    func addAffairVehicleItem(
        vehicleID: String,
        title: String,
        type: String,
        dueDate: String = "",
        dueMileage: Double? = nil,
        note: String = "",
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard affairsWorkspace.vehicles.contains(where: { $0.id == vehicleID }), !trimmedTitle.isEmpty,
              AffairsWorkspaceRules.vehicleItemTypes.contains(type), AffairDate.isValid(normalizedDate),
              (dueMileage == nil || (dueMileage!.isFinite && dueMileage! >= 0)), !normalizedDate.isEmpty || dueMileage != nil else { return }
        let id = RootineLocalIdentifier.string(namespace: "affair-vehicle-item", operationID: operationID)
        guard !affairsWorkspace.vehicleItems.contains(where: { $0.id == id }) else { return }
        var next = affairsWorkspace
        next.vehicleItems.insert(AffairVehicleItem(
            id: id,
            vehicleId: vehicleID,
            title: trimmedTitle,
            type: type,
            dueDate: normalizedDate,
            dueMileage: dueMileage.map { AffairMoney.normalized($0) },
            done: false,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
        ), at: 0)
        await persistAffairsWorkspace(next)
    }

    func updateAffairVehicleItem(
        id: String,
        vehicleID: String,
        title: String,
        type: String,
        dueDate: String = "",
        dueMileage: Double? = nil,
        note: String = ""
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDate = dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard affairsWorkspace.vehicles.contains(where: { $0.id == vehicleID }), !trimmedTitle.isEmpty,
              AffairsWorkspaceRules.vehicleItemTypes.contains(type), AffairDate.isValid(normalizedDate),
              (dueMileage == nil || (dueMileage!.isFinite && dueMileage! >= 0)), !normalizedDate.isEmpty || dueMileage != nil else { return }
        var next = affairsWorkspace
        guard let index = next.vehicleItems.firstIndex(where: { $0.id == id }) else { return }
        next.vehicleItems[index].vehicleId = vehicleID
        next.vehicleItems[index].title = trimmedTitle
        next.vehicleItems[index].type = type
        next.vehicleItems[index].dueDate = normalizedDate
        next.vehicleItems[index].dueMileage = dueMileage.map { AffairMoney.normalized($0) }
        next.vehicleItems[index].note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        await persistAffairsWorkspace(next)
    }

    func toggleAffairVehicleItem(id: String) async {
        var next = affairsWorkspace
        guard let index = next.vehicleItems.firstIndex(where: { $0.id == id }) else { return }
        next.vehicleItems[index].done.toggle()
        await persistAffairsWorkspace(next)
    }

    func deleteAffairVehicleItem(id: String) async {
        var next = affairsWorkspace
        next.vehicleItems.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func upsertAffairBudgetMonth(_ month: AffairBudgetMonth) async {
        guard AffairDate.monthIsValid(month.month) else { return }
        var next = affairsWorkspace
        let normalizedLines = month.lines.map { line in
            AffairBudgetLine(id: line.id, label: line.label.trimmingCharacters(in: .whitespacesAndNewlines), kind: AffairsWorkspaceRules.budgetKinds.contains(line.kind) ? line.kind : "flexible", planned: AffairMoney.normalized(max(0, line.planned)), actual: AffairMoney.normalized(max(0, line.actual)))
        }
        let normalized = AffairBudgetMonth(month: month.month, lines: normalizedLines)
        if let index = next.budgets.firstIndex(where: { $0.month == month.month }) { next.budgets[index] = normalized }
        else { next.budgets.append(normalized) }
        await persistAffairsWorkspace(next)
    }

    func upsertAffairBudgetLine(month: String, line: AffairBudgetLine) async {
        guard AffairDate.monthIsValid(month), !line.id.isEmpty else { return }
        var next = affairsWorkspace
        let normalized = AffairBudgetLine(id: line.id, label: line.label.trimmingCharacters(in: .whitespacesAndNewlines), kind: AffairsWorkspaceRules.budgetKinds.contains(line.kind) ? line.kind : "flexible", planned: AffairMoney.normalized(max(0, line.planned)), actual: AffairMoney.normalized(max(0, line.actual)))
        if let monthIndex = next.budgets.firstIndex(where: { $0.month == month }) {
            if let lineIndex = next.budgets[monthIndex].lines.firstIndex(where: { $0.id == line.id }) { next.budgets[monthIndex].lines[lineIndex] = normalized }
            else { next.budgets[monthIndex].lines.append(normalized) }
        } else { next.budgets.append(AffairBudgetMonth(month: month, lines: [normalized])) }
        await persistAffairsWorkspace(next)
    }

    func deleteAffairBudgetLine(month: String, id: String) async {
        var next = affairsWorkspace
        guard let monthIndex = next.budgets.firstIndex(where: { $0.month == month }) else { return }
        next.budgets[monthIndex].lines.removeAll { $0.id == id }
        await persistAffairsWorkspace(next)
    }

    func setAffairAttentionState(_ state: AffairAttentionState) async {
        guard !state.key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var next = affairsWorkspace
        var states = next.attentionStates ?? []
        if let index = states.firstIndex(where: { $0.key == state.key }) { states[index] = state }
        else { states.append(state) }
        next.attentionStates = Array(states.suffix(500))
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
        let stableMealID = meal.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !stableMealID.isEmpty, !meal.ingredients.isEmpty else { return }
        // The editor keeps one operation ID for its whole lifetime. A second
        // tap/retry therefore updates the same row, while the gate prevents
        // two overlapping saves from racing through persistence.
        let creationFingerprint = "custom-meal|\(stableMealID)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }

        var next = nutritionWorkspace
        var value = meal
        value.id = stableMealID
        value.name = trimmedName
        value.ingredients = value.ingredients.enumerated().map { index, ingredient in
            var normalized = ingredient
            let ingredientID = ingredient.id.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.id = ingredientID.isEmpty
                ? RootineLocalIdentifier.string(namespace: "custom-meal-ingredient", operationID: "\(stableMealID):\(index)")
                : ingredientID
            normalized.name = ingredient.name.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.amount = max(0, ingredient.amount)
            let trimmedUnit = ingredient.unit.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.unit = trimmedUnit.isEmpty ? "g" : trimmedUnit
            return normalized
        }
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
            let multiplier = NutritionPortion.multiplier(amount: ingredient.amount, unit: ingredient.unit)
            return NutritionValues(
                calories: partial.calories + ingredient.per100g.calories * multiplier,
                protein: partial.protein + ingredient.per100g.protein * multiplier,
                carbs: partial.carbs + ingredient.per100g.carbs * multiplier,
                fat: partial.fat + ingredient.per100g.fat * multiplier
            )
        }
        let portion = meal.totalWeightG.map { String(format: "%.0f g", $0) }
            ?? meal.servings.map { String(format: "%.0f porcji", $0) }
            ?? "1 porcja"
        await addNutritionEntry(
            dateKey: dateKey,
            meal: mealKind,
            name: meal.name,
            portion: portion,
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
        let parsedPortion = NutritionPortion.parse(portion, fallbackAmount: amount, fallbackUnit: unit)
        // The human-readable portion is authoritative whenever it contains a
        // number/unit. Legacy callers may still provide fallback amount data,
        // but must not overwrite a newly typed "120 g" with an old catalog
        // default such as 60 g.
        let resolvedAmount = (parsedPortion.amount ?? amount).map { max(0, $0) }
        let resolvedUnit = (parsedPortion.unit ?? unit)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPortion = portion.trimmingCharacters(in: .whitespacesAndNewlines)
        let entry = NutritionEntry(
            id: recordID,
            name: trimmedName,
            portion: normalizedPortion.isEmpty ? "1 porcja" : normalizedPortion,
            amount: resolvedAmount,
            unit: resolvedUnit?.isEmpty == true ? nil : resolvedUnit,
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
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return nil }
        let lookupFingerprint = "nutrition-barcode-lookup|\(normalized)"
        guard creationGate.claim(lookupFingerprint) else { return nil }
        defer { creationGate.release(lookupFingerprint) }
        await enqueueNutritionBarcode(normalized)
        if let resolved = nutritionWorkspace.pendingBarcodeLookups?
            .first(where: { $0.id == NutritionBarcode.requestID(for: normalized) })?
            .resolvedProduct {
            return resolved
        }
        guard let token = session?.accessToken, !token.isEmpty else {
            await recordNutritionBarcodeFailure(normalized)
            foundationMessage = "Kod zapisany lokalnie — spróbujemy ponownie po połączeniu. Możesz też wpisać produkt ręcznie."
            return nil
        }
        do {
            let product = try await api.product(barcode: normalized, accessToken: token)
            await storeNutritionBarcodeResult(normalized, product: product)
            return product
        } catch {
            await recordNutritionBarcodeFailure(normalized)
            foundationMessage = "Kod zapisany lokalnie — ponowimy próbę po połączeniu. Możesz też wpisać produkt ręcznie."
            return nil
        }
    }

    /// Retries only the durable queue. Calling this after scene activation (or
    /// when connectivity returns) is safe because every request is
    /// de-duplicated by its normalized barcode.
    func retryPendingNutritionBarcodes() async {
        let normalized = await normalizeNutritionBarcodeQueueIfNeeded()
        guard session?.accessToken != nil else { return }
        let pending = normalized.filter { $0.resolvedProduct == nil }
        for request in pending {
            _ = await lookupNutritionProduct(barcode: request.barcode)
        }
    }

    private func enqueueNutritionBarcode(_ barcode: String) async {
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return }
        var next = nutritionWorkspace
        let originalPending = next.pendingBarcodeLookups ?? []
        var pending = normalizedNutritionBarcodeRequests(originalPending)
        let id = NutritionBarcode.requestID(for: normalized)
        if !pending.contains(where: { $0.id == id }) {
            pending.append(NutritionBarcodeRequest(
                id: id,
                barcode: normalized,
                createdAt: RootineDate.isoTimestamp()
            ))
        }
        guard pending != originalPending || !originalPending.contains(where: { $0.id == id }) else { return }
        next.pendingBarcodeLookups = pending
        await persistNutritionWorkspace(next)
    }

    private func recordNutritionBarcodeFailure(_ barcode: String) async {
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return }
        var next = nutritionWorkspace
        var pending = normalizedNutritionBarcodeRequests(next.pendingBarcodeLookups ?? [])
        let id = NutritionBarcode.requestID(for: normalized)
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        guard pending[index].resolvedProduct == nil else { return }
        pending[index].attemptCount += 1
        pending[index].lastAttemptAt = RootineDate.isoTimestamp()
        next.pendingBarcodeLookups = pending
        await persistNutritionWorkspace(next)
    }

    private func storeNutritionBarcodeResult(_ barcode: String, product: NutritionProduct) async {
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return }
        let id = NutritionBarcode.requestID(for: normalized)
        var next = nutritionWorkspace
        var pending = normalizedNutritionBarcodeRequests(next.pendingBarcodeLookups ?? [])
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[index].resolvedProduct = product
        pending[index].lastAttemptAt = RootineDate.isoTimestamp()
        next.pendingBarcodeLookups = pending
        await persistNutritionWorkspace(next)
    }

    /// Removes a resolved barcode only after the user has used its product in
    /// the add-entry form. Failed lookups remain pending for a future retry.
    @discardableResult
    func consumeNutritionBarcode(barcode: String) async -> NutritionProduct? {
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return nil }
        let id = NutritionBarcode.requestID(for: normalized)
        var next = nutritionWorkspace
        var pending = normalizedNutritionBarcodeRequests(next.pendingBarcodeLookups ?? [])
        guard let index = pending.firstIndex(where: { $0.id == id }),
              let product = pending[index].resolvedProduct else { return nil }
        pending.remove(at: index)
        next.pendingBarcodeLookups = pending
        await persistNutritionWorkspace(next)
        return product
    }

    /// Legacy v6 payloads may contain formatted barcodes or duplicate requests
    /// created by an older one-shot scanner. Canonicalize them before every
    /// queue operation so lookup, retry and consume all address the same
    /// durable record and never discard a resolved product.
    private func normalizedNutritionBarcodeRequests(
        _ requests: [NutritionBarcodeRequest]
    ) -> [NutritionBarcodeRequest] {
        var result: [NutritionBarcodeRequest] = []
        var indexes: [String: Int] = [:]

        for request in requests {
            let barcode = NutritionBarcode.normalized(request.barcode)
            guard !barcode.isEmpty else { continue }
            var normalized = request
            normalized.id = NutritionBarcode.requestID(for: barcode)
            normalized.barcode = barcode
            normalized.attemptCount = max(0, request.attemptCount)

            guard let existingIndex = indexes[barcode] else {
                indexes[barcode] = result.count
                result.append(normalized)
                continue
            }

            var merged = result[existingIndex]
            let previousAttemptAt = merged.lastAttemptAt
            merged.createdAt = earlierTimestamp(merged.createdAt, normalized.createdAt)
            merged.lastAttemptAt = laterTimestamp(merged.lastAttemptAt, normalized.lastAttemptAt)
            merged.attemptCount = max(merged.attemptCount, normalized.attemptCount)
            if let resolvedProduct = normalized.resolvedProduct,
               shouldReplaceResolvedProduct(
                   existing: merged.resolvedProduct,
                   existingAttemptAt: previousAttemptAt,
                   incomingAttemptAt: normalized.lastAttemptAt
               )
            {
                merged.resolvedProduct = resolvedProduct
            }
            result[existingIndex] = merged
        }
        return result
    }

    private func shouldReplaceResolvedProduct(
        existing: NutritionProduct?,
        existingAttemptAt: String?,
        incomingAttemptAt: String?
    ) -> Bool {
        guard existing != nil else { return true }
        switch (existingAttemptAt, incomingAttemptAt) {
        case (nil, nil): return false
        case (nil, _?): return true
        case (_?, nil): return false
        case (let old?, let new?): return new >= old
        }
    }

    private func normalizeNutritionBarcodeQueueIfNeeded() async -> [NutritionBarcodeRequest] {
        let original = nutritionWorkspace.pendingBarcodeLookups ?? []
        let normalized = normalizedNutritionBarcodeRequests(original)
        guard normalized != original else { return normalized }
        var next = nutritionWorkspace
        next.pendingBarcodeLookups = normalized
        await persistNutritionWorkspace(next)
        return normalized
    }

    private func earlierTimestamp(_ left: String, _ right: String) -> String {
        if left.isEmpty { return right }
        if right.isEmpty { return left }
        return left <= right ? left : right
    }

    private func laterTimestamp(_ left: String?, _ right: String?) -> String? {
        switch (left, right) {
        case (nil, nil): return nil
        case (let value?, nil): return value
        case (nil, let value?): return value
        case (let left?, let right?): return left >= right ? left : right
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
        let parsedPortion = NutritionPortion.parse(portion, fallbackAmount: amount, fallbackUnit: unit)
        let resolvedAmount = (parsedPortion.amount ?? amount).map { max(0, $0) }
        let resolvedUnit = (parsedPortion.unit ?? unit)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPortion = portion.trimmingCharacters(in: .whitespacesAndNewlines)
        let updated = NutritionEntry(
            id: id,
            name: trimmedName,
            portion: normalizedPortion.isEmpty ? "1 porcja" : normalizedPortion,
            amount: resolvedAmount,
            unit: resolvedUnit?.isEmpty == true ? nil : resolvedUnit,
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

    /// MainActor isolation alone does not serialize two async methods across
    /// their suspension points. A file-backed import therefore takes this
    /// small persistence gate: an already-running UI write completes first;
    /// writes that begin while the import is active are discarded before they
    /// can persist a stale pre-import projection.
    private func beginWorkspacePersistence() async -> Bool {
        // Check and claim synchronously before the first suspension. This
        // closes the small window where an import could otherwise set its lock
        // between the check and the active-write count increment.
        guard !archiveImportInProgress else {
            _ = await waitForArchiveImportToFinish()
            foundationMessage = "Import danych zakończył się — ponów ostatnią akcję"
            return false
        }
        activeWorkspacePersists += 1
        return true
    }

    private func endWorkspacePersistence() {
        activeWorkspacePersists = max(0, activeWorkspacePersists - 1)
        guard activeWorkspacePersists == 0 else { return }
        let waiters = workspacePersistenceWaiters
        workspacePersistenceWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func waitForWorkspacePersistenceToFinish() async {
        guard activeWorkspacePersists > 0 else { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            workspacePersistenceWaiters.append(continuation)
        }
    }

    private func waitForMutationFlushToFinish() async {
        guard activeMutationFlushes > 0 else { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            mutationFlushWaiters.append(continuation)
        }
    }

    private func endMutationFlush() {
        activeMutationFlushes = max(0, activeMutationFlushes - 1)
        guard activeMutationFlushes == 0 else { return }
        let waiters = mutationFlushWaiters
        mutationFlushWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func waitForArchiveImportToFinish() async -> Bool {
        guard archiveImportInProgress else { return false }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            archiveImportWaiters.append(continuation)
        }
        return true
    }

    private func finishArchiveImport() {
        archiveImportInProgress = false
        if signOutAfterArchiveImport {
            signOutAfterArchiveImport = false
            signOutFoundationSession()
        }
        let waiters = archiveImportWaiters
        archiveImportWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func waitForReconciliationToFinish() async {
        guard isReconciling else { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            reconciliationWaiters.append(continuation)
        }
    }

    private func finishReconciliation() {
        isReconciling = false
        let waiters = reconciliationWaiters
        reconciliationWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func persistTaskWorkspace(_ value: TaskWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        taskWorkspace = next
        // Schedule from the just-published local aggregate before attempting
        // the network queue. This keeps reminders working while offline and
        // ensures an edit/completion/delete invalidates its old occurrence.
        await reconcileLocalNotifications()
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
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
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
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
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
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        sportWorkspace = next
        await persistCanonicalWorkspace(next, key: .sport, merge: RootineCanonicalWorkspaceMapping.mergedSportPayload)
    }

    private func persistGoalsWorkspace(_ value: GoalsWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        goalsWorkspace = next
        await persistCanonicalWorkspace(next, key: .goals, merge: RootineCanonicalWorkspaceMapping.mergedGoalsPayload)
    }

    private func persistWorkWorkspace(_ value: WorkWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        workWorkspace = next
        await persistCanonicalWorkspace(next, key: .work, merge: RootineCanonicalWorkspaceMapping.mergedWorkPayload)
    }

    private func persistTravelWorkspace(_ value: TravelWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        travelWorkspace = next
        await persistCanonicalWorkspace(next, key: .travel, merge: RootineCanonicalWorkspaceMapping.mergedTravelPayload)
    }

    private func persistHealthWorkspace(_ value: HealthWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value
        next.updatedAt = RootineDate.isoTimestamp()
        healthWorkspace = next
        await persistCanonicalWorkspace(next, key: .health, merge: RootineCanonicalWorkspaceMapping.mergedHealthPayload)
    }

    private func persistAffairsWorkspace(_ value: AffairsWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        let next = AffairsWorkspaceRules.normalized(value)
        affairsWorkspace = next
        await persistWorkspace(next, key: .affairs)
    }

    private func persistWorkspace<T: Codable & Sendable>(_ value: T, key: RootineStorageKey) async {
        guard let store else {
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return
        }
        do {
            try await store.save(value, key: key)
            if let syncEngine {
                try await syncEngine.enqueue(value, key: key)
                await markLocalOnly()
                await flushPendingMutations()
            } else {
                workspaceSyncStatus = .localOnly(pending: 0)
            }
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

    private func validateRemoteWorkspaceVersion(_ payload: JSONValue, key: RootineStorageKey) throws {
        guard key == .tasks || key == .nutrition || key == .notes || key == .affairs else { return }
        guard case .object(let object) = payload,
              case .number(let rawVersion) = object["version"],
              rawVersion.isFinite,
              rawVersion.rounded() == rawVersion,
              let found = Int(exactly: rawVersion) else {
            throw RootineWorkspaceArchiveError.invalidArchive
        }
        let supported = key.supportedLocalVersion!
        // Affairs v1 is normalized to v2 after decoding. Other direct
        // workspaces have no implicit migration path and must match exactly.
        guard found == supported || (key == .affairs && found == 1) else {
            throw RootineWorkspaceArchiveError.unsupportedWorkspaceVersion(
                key: key.rawValue,
                found: found,
                supported: supported
            )
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
        guard !archiveImportInProgress else {
            // Import owns the queue transaction. A refresh tap or a retry
            // banner must not flush the pre-import queue between its snapshot
            // and commit; the importer performs one explicit flush after the
            // commit has published the new state.
            return
        }
        activeMutationFlushes += 1
        defer { endMutationFlush() }
        await flushPendingMutations(allowingImport: false)
    }

    /// v3 is wired in shadow mode. Existing aggregate snapshots continue to
    /// reconcile and remain the read path until B08; this entry point lets a
    /// future coordinator flush normalized commands without changing that
    /// behavior today.
    func flushPendingNormalizedCommands() async {
        guard let syncEngine else {
            workspaceSyncStatus = .unavailable
            return
        }
        let pending = (try? await syncEngine.pendingCommandCount()) ?? 0
        guard let accessToken = session?.accessToken else {
            workspaceSyncStatus = .localOnly(pending: pending)
            return
        }
        workspaceSyncStatus = .syncing(pending: pending)
        do {
            switch try await syncEngine.flushNormalized(accessToken: accessToken) {
            case .idle, .applied:
                workspaceSyncStatus = .synced
            case .conflict(let keys):
                workspaceSyncStatus = .conflict(storageKeys: keys)
            case .retryScheduled:
                workspaceSyncStatus = .localOnly(pending: pending)
            case .unauthorized:
                workspaceSyncStatus = .unauthorized
            case .cursorExpired:
                workspaceSyncStatus = .error
            case .error:
                workspaceSyncStatus = .error
            }
        } catch RootineSyncRemoteError.unauthorized {
            workspaceSyncStatus = .unauthorized
        } catch RootineSyncRemoteError.schemaMismatch {
            workspaceSyncStatus = .schemaMismatch
        } catch RootineSyncEngineError.normalizedSyncUnavailable {
            workspaceSyncStatus = .unavailable
        } catch {
            workspaceSyncStatus = .error
        }
    }

    private func flushPendingMutations(allowingImport: Bool) async {
        guard allowingImport || !archiveImportInProgress else { return }
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

    /// Reconciliation is deliberately fire-and-report: notification
    /// permission, an unavailable simulator service, or an OS request error
    /// must never fail a local workspace write or the sync queue. B08 can
    /// update `notificationPreferences` from the profile before calling this
    /// same boundary; B09 can later fill the device ID in the context.
    private func reconcileLocalNotifications() async {
        guard let scheduler = localNotificationScheduler else { return }
        _ = await scheduler.reconcile(
            workspace: taskWorkspace,
            preferences: notificationPreferences,
            now: Date()
        )
    }

    private func configureRuntime(userID: String) {
        stopRealtimeRuntime()
        canonicalShadows.removeAll()
        lastDeviceRegistrationFingerprint = nil
        deviceRegistration = nil
        let previousScheduler = localNotificationScheduler
        // Preferences are account-scoped. Never carry an opt-in or lock-screen
        // detail setting across an account switch before B08 has supplied the
        // new profile payload.
        notificationPreferences = RootineNotificationPreferencesStore.load(userID: userID)
            ?? RootineNotificationPreferences()
        let userStore = WorkspaceFileStore(userID: userID)
        store = userStore
        localNotificationScheduler = RootineLocalNotificationScheduler(
            context: RootineNotificationAccountContext(userID: userID)
        )
        // Login/account switching must not strand the previous account's
        // pending requests. The old actor retains its own hashed ownership
        // prefix, so this cancellation cannot touch the new account.
        Task { await previousScheduler?.cancelAll() }
        normalizedReadEnabled = readFeatureFlags.normalizedReadEnabled(
            accountID: userID,
            environment: configuration.environment
        )
        normalizedReadFallbackReason = nil
        guard let normalizedRemote = try? RootineSyncRemoteClient(configuration: configuration) else {
            syncEngine = WorkspaceSyncEngine(store: userStore, remote: api)
            return
        }
        let deviceID = syncDeviceIdentifier(for: userID)
        syncEngine = WorkspaceSyncEngine(
            store: userStore,
            remote: api,
            normalizedRemote: normalizedRemote,
            deviceID: deviceID,
            accountID: userID
        )

        syncCoordinator = RootineSyncCoordinator(
            operations: RootineSyncOperations(
                pull: { @MainActor [weak self] in
                    guard let self, let accessToken = self.session?.accessToken else { return }
                    await self.loadAndReconcile(accessToken: accessToken, flushAfterReconcile: false)
                },
                push: { @MainActor [weak self] in
                    await self?.flushPendingMutations()
                },
                pendingPushCount: { @MainActor [weak self] in
                    guard let self else { return 0 }
                    return (try? await self.syncEngine?.pendingMutationCount()) ?? 0
                }
            ),
            onStatus: { @MainActor [weak self] status in
                self?.syncCoordinatorStatus = status
            }
        )

        guard let activeSession = session else { return }
        realtimeClient = RootineRealtimeClient(
            configuration: configuration,
            session: activeSession,
            onEvent: { [weak self] event in
                Task { @MainActor [weak self] in
                    self?.handleRealtimeEvent(event)
                }
            },
            onStatus: { [weak self] status in
                Task { @MainActor [weak self] in
                    self?.handleRealtimeStatus(status)
                }
            }
        )
    }

    private func syncDeviceIdentifier(for userID: String) -> String {
        let key = "rootine.sync.device-id.\(userID)"
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let identifier = RootineSyncIdentifiers.deviceID()
        UserDefaults.standard.set(identifier, forKey: key)
        return identifier
    }

    /// A process can terminate after an import has swapped one of the local
    /// files but before the transaction is committed. Recover only complete
    /// snapshots; WorkspaceFileStore skips a transaction still owned by its
    /// live actor so this check is safe even when startup and UI work overlap.
    private func recoverOrphanedTransactions() async {
        guard let store else { return }
        do {
            let count = try await store.recoverOrphanedBatchTransactions()
            guard count > 0 else { return }
            let transactionLabel = count == 1 ? "transakcję" : "transakcji"
            foundationMessage = "Przywrócono \(count) \(transactionLabel) po przerwanym imporcie"
        } catch {
            // Recovery is best effort. Never replace the active workspace with
            // a guessed partial snapshot when the transaction itself is bad.
            foundationMessage = "Nie udało się automatycznie odzyskać przerwanego importu"
        }
    }

    /// Compatibility polling remains available while the realtime lifecycle
    /// is being rolled out. It also provides a fallback on networks where a
    /// WebSocket cannot be established.
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

    /// Starts Realtime and its lifecycle coordinator only after the initial
    /// authoritative bootstrap has completed. Polling remains owned by the
    /// coordinator and is automatically stopped in the background/sign-out.
    private func startRealtimeRuntime() {
        guard configuration.isAuthComplete,
              session != nil,
              let syncCoordinator,
              let realtimeClient else { return }
        startNetworkMonitor()
        scheduleBackgroundRefresh()
        Task {
            await syncCoordinator.start()
            await realtimeClient.start()
        }
    }

    private func stopRealtimeRuntime() {
        refreshTask?.cancel()
        refreshTask = nil
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.backgroundRefreshTaskIdentifier)
        networkMonitor?.cancel()
        networkMonitor = nil
        networkMonitorQueue = nil
        if let realtimeClient {
            Task { await realtimeClient.stop() }
        }
        if let syncCoordinator {
            Task { await syncCoordinator.stop() }
        }
        realtimeClient = nil
        syncCoordinator = nil
        realtimeStatus = .stopped
        syncCoordinatorStatus = .stopped
    }

    private func scheduleBackgroundRefresh() {
        guard session != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.backgroundRefreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func startNetworkMonitor() {
        guard networkMonitor == nil else { return }
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "app.rootine.sync.network-monitor")
        monitor.pathUpdateHandler = { [weak self] path in
            let isReachable = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.handleNetworkPath(isReachable: isReachable)
            }
        }
        monitor.start(queue: queue)
        networkMonitor = monitor
        networkMonitorQueue = queue
    }

    private func handleNetworkPath(isReachable: Bool) {
        guard session != nil, let syncCoordinator else { return }
        Task { await syncCoordinator.networkPathChanged(isReachable: isReachable) }
    }

    private func handleRealtimeEvent(_ event: RootineRealtimeEvent) {
        guard let session,
              case .syncAvailable(let signal) = event,
              signal.userID == session.user.id,
              let syncCoordinator else { return }
        // An echo is intentionally just another availability hint. The pull
        // is authoritative and never enqueues a second write from the event.
        Task { await syncCoordinator.requestPull(reason: .realtime) }
    }

    private func handleRealtimeStatus(_ status: RootineRealtimeStatus) {
        realtimeStatus = status
        guard case .connected = status,
              session != nil,
              let syncCoordinator else { return }
        // Includes the first connection and every reconnect: pull from the
        // last durable cursor rather than trusting a websocket payload.
        Task { await syncCoordinator.requestPull(reason: .realtimeReconnect) }
    }

    func scenePhaseDidChange(_ phase: RootineScenePhase) {
        guard session != nil, let syncCoordinator else { return }
        Task { await syncCoordinator.scenePhaseChanged(phase) }
    }

    func registerBackgroundRefreshTask() {
        guard !didRegisterBackgroundTask else { return }
        didRegisterBackgroundTask = true
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.backgroundRefreshTaskIdentifier,
            using: nil
        ) { [weak self] task in
            guard let task = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor [weak self] in
                await self?.performBackgroundRefresh(task)
            }
        }
    }

    func performBackgroundRefresh(_ task: BGTask? = nil) async {
        guard session != nil, let syncCoordinator else {
            task?.setTaskCompleted(success: false)
            return
        }
        let work = Task { await syncCoordinator.syncNow(reason: .backgroundTask) }
        task?.expirationHandler = { work.cancel() }
        let success = await work.value
        task?.setTaskCompleted(success: success)
    }

    private static let backgroundRefreshTaskIdentifier = "app.rootine.sync.refresh"

    private func normalizedEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func accept(_ newSession: SupabaseSession, passwordRecovery: Bool = false) async throws {
        try keychain.save(newSession)
        session = newSession
        isPasswordRecovery = passwordRecovery
        configureRuntime(userID: newSession.user.id)
        guard !passwordRecovery else { return }
        await recoverOrphanedTransactions()
        await loadAndReconcile(accessToken: newSession.accessToken)
        await flushPendingMutations()
        startRealtimeRuntime()
        startRealtimeRefreshLoop()
        scheduleDeviceRegistration()
        await refreshRecoveryFiles()
    }

    /// Registers the current installation after authentication. Reading the
    /// notification permission is intentionally observational: B09 does not
    /// present a permission prompt, and denial is represented as metadata
    /// rather than a sync failure.
    func registerDeviceForCurrentSession() async {
        guard let accessToken = session?.accessToken else { return }
        await registerDevice(accessToken: accessToken)
    }

    private func scheduleDeviceRegistration() {
        deviceRegistrationTask?.cancel()
        guard session?.accessToken != nil else { return }
        deviceRegistrationTask = Task { [weak self] in
            guard let self else { return }
            await self.registerDeviceForCurrentSession()
        }
    }

    private func registerDevice(accessToken: String) async {
        guard configuration.isAuthComplete,
              session?.accessToken == accessToken,
              let userID = session?.user.id else { return }

        let permission = await RootineNotificationPermissionState.current()
        notificationPermissionState = permission
        let pushToken = RootinePushRegistry.shared.tokenString()
        if permission.canRegisterWithAPNs, pushToken == nil {
            // APNs registration does not show the permission prompt. The
            // permission flow remains owned by a later feature; this only
            // asks UIKit for a token when authorization already exists.
            UIApplication.shared.registerForRemoteNotifications()
        }

        let deviceID = deviceIdentity.loadOrCreate()
        let appVersion = configuration.appVersion.isEmpty ? "0.0.0" : configuration.appVersion
        let fingerprint = [
            userID,
            deviceID,
            appVersion,
            configuration.apnsEnvironment.rawValue,
            permission.rawValue,
            pushToken ?? ""
        ].joined(separator: "|")
        guard fingerprint != lastDeviceRegistrationFingerprint else { return }

        do {
            let registration = try await api.registerDevice(
                deviceID: deviceID,
                appVersion: appVersion,
                apnsEnvironment: configuration.apnsEnvironment,
                pushToken: pushToken,
                permissionState: permission,
                accessToken: accessToken
            )
            guard session?.accessToken == accessToken else { return }
            deviceRegistration = registration
            lastDeviceRegistrationFingerprint = fingerprint
        } catch {
            // Device registration is auxiliary to bootstrap and workspace
            // sync. Keep the token out of logs and do not turn a missing
            // mobile-sync/B03 deployment into a sync error.
        }
    }

    private func loadLocalCopies() async {
        guard let store else { return }
        await recoverOrphanedTransactions()
        // Load canonical shadows before compact projections. Work sanitation
        // can enqueue a merged payload; without this ordering a cold start
        // would briefly project a local-only shadow and overwrite web fields.
        await loadCanonicalShadows(from: store)
        taskWorkspace = (try? await store.load(TaskWorkspace.self, key: .tasks)) ?? .empty
        nutritionWorkspace = (try? await store.load(NutritionWorkspace.self, key: .nutrition)) ?? .empty
        notesWorkspace = (try? await store.load(NotesWorkspace.self, key: .notes)) ?? .empty
        sportWorkspace = (try? await store.load(SportWorkspace.self, key: .sport)) ?? .empty
        goalsWorkspace = (try? await store.load(GoalsWorkspace.self, key: .goals)) ?? .empty
        let localWork = (try? await store.load(WorkWorkspace.self, key: .work)) ?? .empty
        workWorkspace = await sanitizedWorkWorkspace(localWork, store: store)
        travelWorkspace = (try? await store.load(TravelWorkspace.self, key: .travel)) ?? .empty
        healthWorkspace = (try? await store.load(HealthWorkspace.self, key: .health)) ?? .empty
        let localAffairs = (try? await store.load(AffairsWorkspace.self, key: .affairs)) ?? .empty
        affairsWorkspace = await sanitizedAffairsWorkspace(localAffairs, store: store, syncEngine: syncEngine, allowSync: false)
        recoveryFiles = (try? await store.recoveryFiles()) ?? []
        await reconcileLocalNotifications()
    }

    private func loadCanonicalShadows(from store: WorkspaceFileStore) async {
        canonicalShadows.removeAll()
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
        allowSync: Bool = false
    ) async -> WorkWorkspace {
        var sanitized = rootineSanitizedWorkWorkspace(workspace)
        let hasInvalidActive = workspace.activeFocusStartedAt.map { RootineDate.date(from: $0) == nil } ?? false
        if sanitized != workspace {
            if let data = try? JSONEncoder().encode(workspace) {
                let label = hasInvalidActive
                    ? "work-focus-corrupt"
                    : "work-sanitized"
                _ = try? await store.writeRecoveryCopy(data, label: label, kind: .diagnostic)
            }
            sanitized.updatedAt = RootineDate.isoTimestamp()
            try? await store.save(sanitized, key: .work)
        }
        // Sanitation is a local repair. Do not enqueue its compact projection
        // while startup is still waiting for remote snapshots: that queue item
        // could win over a newer server record. Reconciliation will enqueue a
        // local winner only after comparing revisions, while keeping this
        // in-memory merge available to the current process.
        let mapped: JSONValue?
        if let shadow = canonicalShadows[.work] {
            mapped = try? RootineCanonicalWorkspaceMapping.mergedWorkPayload(for: sanitized, onto: shadow)
        } else {
            mapped = try? RootineCanonicalWorkspaceMapping.payload(for: sanitized)
        }
        if let mapped {
            canonicalShadows[.work] = mapped
            if allowSync,
               sanitized != workspace,
               !archiveImportInProgress,
               let syncEngine {
                // Once reconciliation has compared the remote revision, a
                // repaired active marker is a real canonical migration. Queue
                // it now so a malformed remote value cannot return on the
                // next launch. The pre-reconcile path deliberately leaves
                // this off to avoid shadowing a newer server snapshot.
                _ = try? await syncEngine.enqueue(
                    payload: mapped,
                    storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: .work)
                )
            }
        }
        if sanitized != workspace {
            foundationMessage = hasInvalidActive
                ? "Uszkodzona sesja skupienia została zachowana w Recovery i wyczyszczona"
                : "Nieprawidłowe dane Pracy zachowano w Recovery i bezpiecznie wyczyszczono"
        }
        return sanitized
    }

    private func normalizedAffairsWorkspace(_ workspace: AffairsWorkspace) -> AffairsWorkspace {
        AffairsWorkspaceRules.normalized(workspace)
    }

    private func sanitizedAffairsWorkspace(
        _ workspace: AffairsWorkspace,
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine? = nil,
        allowSync: Bool = false
    ) async -> AffairsWorkspace {
        let normalized = normalizedAffairsWorkspace(workspace)
        guard normalized != workspace else { return workspace }
        try? await store.save(normalized, key: .affairs)
        if allowSync,
           !archiveImportInProgress,
           let syncEngine,
           let payload = try? jsonPayload(normalized, encoder: JSONEncoder()) {
            _ = try? await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.affairs.rawValue)
        }
        foundationMessage = "Znaleziono starszą kategorię sprawy i bezpiecznie ją zmigrowano"
        return normalized
    }

    private func loadAndReconcile(accessToken: String, flushAfterReconcile: Bool = true) async {
        if normalizedReadEnabled {
            await loadNormalizedAndReconcile(accessToken: accessToken)
            return
        }
        await loadLegacyAndReconcile(accessToken: accessToken, flushAfterReconcile: flushAfterReconcile)
    }

    private func loadNormalizedAndReconcile(accessToken: String) async {
        guard let store, let syncEngine else { return }
        guard !archiveImportInProgress, !isReconciling else { return }
        isReconciling = true
        defer { finishReconciliation() }
        normalizedReadFallbackReason = nil

        do {
            let localTasks = try await store.load(TaskWorkspace.self, key: .tasks)
            let localNutrition = try await store.load(NutritionWorkspace.self, key: .nutrition)
            let localNotes = try await store.load(NotesWorkspace.self, key: .notes)
            let localSport = try await store.load(SportWorkspace.self, key: .sport)
            let localGoals = try await store.load(GoalsWorkspace.self, key: .goals)
            let localWorkRaw = try await store.load(WorkWorkspace.self, key: .work)
            let localWork = localWorkRaw.map(rootineSanitizedWorkWorkspace)
            let localTravel = try await store.load(TravelWorkspace.self, key: .travel)
            let localHealth = try await store.load(HealthWorkspace.self, key: .health)
            let localAffairsRaw = try await store.load(AffairsWorkspace.self, key: .affairs)
            let localAffairs = localAffairsRaw.map(normalizedAffairsWorkspace)
            let state = (try await store.load(RootineNormalizedReadState.self, key: .normalizedReadState)) ?? RootineNormalizedReadState()
            guard state.contractVersion == RootineRelationalWorkspaceAdapter.supportedContractVersion else {
                throw RootineNormalizedReadError.schemaMismatch(expected: RootineRelationalWorkspaceAdapter.supportedContractVersion, actual: state.contractVersion)
            }

            let current = RootineRelationalMaterialization(documents: state.documents, revisions: [:])
            let fetched = try await fetchNormalizedMaterialization(cursor: state.cursor, base: current, accessToken: accessToken)
            let decoded = try decodeNormalizedWorkspaces(fetched)
            let pending = try await store.pendingMutations()
            let decisions = [
                try await normalizedDecision(key: .tasks, local: localTasks, remote: decoded.tasks, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .nutrition, local: localNutrition, remote: decoded.nutrition, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .notes, local: localNotes, remote: decoded.notes, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .sport, local: localSport, remote: decoded.sport, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .goals, local: localGoals, remote: decoded.goals, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .work, local: localWork, remote: decoded.work, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .travel, local: localTravel, remote: decoded.travel, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .health, local: localHealth, remote: decoded.health, materialization: fetched, pending: pending, store: store),
                try await normalizedDecision(key: .affairs, local: localAffairs, remote: decoded.affairs, materialization: fetched, pending: pending, store: store)
            ]
            let conflictKeys = decisions.compactMap { $0.conflict ? $0.key.rawValue : nil }

            // Decode every domain before touching disk. The transaction below
            // then makes aggregate files, relational state and cursor a
            // single publish point; a failed materializer never advances the
            // cursor or leaves a mixed set of workspaces.
            for key in [RootineStorageKey.sport, .goals, .work, .travel, .health] {
                if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: key)] {
                    canonicalShadows[key] = payload
                }
            }
            let transaction = try await store.beginBatchTransaction()
            do {
                try await persistNormalizedDecision(decisions[0], key: .tasks, store: store)
                try await persistNormalizedDecision(decisions[1], key: .nutrition, store: store)
                try await persistNormalizedDecision(decisions[2], key: .notes, store: store)
                try await persistNormalizedDecision(decisions[3], key: .sport, store: store)
                try await persistNormalizedDecision(decisions[4], key: .goals, store: store)
                try await persistNormalizedDecision(decisions[5], key: .work, store: store)
                try await persistNormalizedDecision(decisions[6], key: .travel, store: store)
                try await persistNormalizedDecision(decisions[7], key: .health, store: store)
                try await persistNormalizedDecision(decisions[8], key: .affairs, store: store)
                let nextState = RootineNormalizedReadState(
                    contractVersion: RootineRelationalWorkspaceAdapter.supportedContractVersion,
                    cursor: fetchedCursor,
                    documents: fetched.documents
                )
                try await store.save(nextState, key: .normalizedReadState)
                try await store.commitBatchTransaction(transaction)
            } catch {
                try? await store.rollbackBatchTransaction(transaction)
                throw error
            }

            taskWorkspace = decisions[0].value as? TaskWorkspace ?? .empty
            nutritionWorkspace = decisions[1].value as? NutritionWorkspace ?? .empty
            notesWorkspace = decisions[2].value as? NotesWorkspace ?? .empty
            sportWorkspace = decisions[3].value as? SportWorkspace ?? .empty
            goalsWorkspace = decisions[4].value as? GoalsWorkspace ?? .empty
            workWorkspace = decisions[5].value as? WorkWorkspace ?? .empty
            travelWorkspace = decisions[6].value as? TravelWorkspace ?? .empty
            healthWorkspace = decisions[7].value as? HealthWorkspace ?? .empty
            affairsWorkspace = decisions[8].value as? AffairsWorkspace ?? .empty
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .sport)] { canonicalShadows[.sport] = payload }
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .goals)] { canonicalShadows[.goals] = payload }
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .work)] { canonicalShadows[.work] = payload }
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .travel)] { canonicalShadows[.travel] = payload }
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .health)] { canonicalShadows[.health] = payload }
            if conflictKeys.isEmpty {
                workspaceSyncStatus = .synced
                foundationMessage = "Relacyjny stan został bezpiecznie uzgodniony"
                realtimeLastRefresh = Date()
            } else {
                workspaceSyncStatus = .conflict(storageKeys: conflictKeys)
                foundationMessage = "Relacyjny konflikt wymaga decyzji dla: \(conflictKeys.count)"
            }
            _ = syncEngine
        } catch let error as RootineNormalizedReadError {
            await fallbackToLegacyRead(error: error, accessToken: accessToken)
        } catch let error as RootineAPIError {
            await fallbackToLegacyRead(error: .contractMismatch(error.localizedDescription), accessToken: accessToken)
        } catch {
            await fallbackToLegacyRead(error: .materializationFailed("nieznany błąd"), accessToken: accessToken)
        }
    }

    private var fetchedCursor: Int64? = nil

    private func fetchNormalizedMaterialization(
        cursor: Int64?,
        base: RootineRelationalMaterialization,
        accessToken: String
    ) async throws -> RootineRelationalMaterialization {
        if cursor == nil {
            let response = try await normalizedReadClient.bootstrap(accessToken: accessToken)
            let result = try RootineRelationalWorkspaceAdapter.materialize(bootstrap: response)
            fetchedCursor = response.serverCursor
            return result
        }
        var result = base
        var nextCursor = cursor
        var hasMore = true
        while hasMore {
            let response: RootineRelationalPullResponse
            do {
                response = try await normalizedReadClient.pullChanges(cursor: nextCursor, limit: 500, accessToken: accessToken)
            } catch RootineNormalizedReadError.cursorExpired {
                let bootstrap = try await normalizedReadClient.bootstrap(accessToken: accessToken)
                result = try RootineRelationalWorkspaceAdapter.materialize(bootstrap: bootstrap)
                nextCursor = bootstrap.serverCursor
                fetchedCursor = nextCursor
                return result
            }
            guard RootineRelationalWorkspaceAdapter.supportedTransportContractVersions.contains(response.contractVersion) else {
                throw RootineNormalizedReadError.schemaMismatch(expected: RootineRelationalWorkspaceAdapter.supportedContractVersion, actual: response.contractVersion)
            }
            result = try RootineRelationalWorkspaceAdapter.materialize(changes: response.changes, onto: result)
            guard response.nextCursor >= (nextCursor ?? 0) else { throw RootineNormalizedReadError.contractMismatch("cursor cofa się") }
            nextCursor = response.nextCursor
            hasMore = response.hasMore
        }
        fetchedCursor = nextCursor
        return result
    }

    private func fallbackToLegacyRead(error: RootineNormalizedReadError, accessToken: String) async {
        normalizedReadFallbackReason = error.errorDescription
        foundationMessage = "Relacyjny odczyt niedostępny — używam legacy Recovery"
        if case .schemaMismatch = error { workspaceSyncStatus = .schemaMismatch }
        // The normalized path owns the reconciliation guard while it is
        // running. Hand ownership to legacy without waking waiters yet: the
        // outer normalized defer publishes completion only after legacy has
        // finished, so a refresh cannot race the fallback.
        if isReconciling { isReconciling = false }
        await loadLegacyAndReconcile(accessToken: accessToken)
    }

    private struct DecodedNormalizedWorkspaces {
        let tasks: TaskWorkspace?
        let nutrition: NutritionWorkspace?
        let notes: NotesWorkspace?
        let sport: SportWorkspace?
        let goals: GoalsWorkspace?
        let work: WorkWorkspace?
        let travel: TravelWorkspace?
        let health: HealthWorkspace?
        let affairs: AffairsWorkspace?
    }

    private struct NormalizedDecision {
        let key: RootineStorageKey
        let value: Any
        let shouldPersist: Bool
        let conflict: Bool
        let revision: Int64?
    }

    private func decodeNormalizedWorkspaces(_ materialization: RootineRelationalMaterialization) throws -> DecodedNormalizedWorkspaces {
        func direct<T: Decodable>(_ type: T.Type, key: RootineStorageKey) throws -> T? {
            guard materialization.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: key)] != nil else { return nil }
            return try RootineRelationalWorkspaceAdapter.document(type, key: key, from: materialization)
        }
        func canonical<T>(_ key: RootineStorageKey, decode: (JSONValue) throws -> T) throws -> T? {
            guard let payload = materialization.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: key)] else { return nil }
            return try decode(payload)
        }
        return DecodedNormalizedWorkspaces(
            tasks: try direct(TaskWorkspace.self, key: .tasks),
            nutrition: try direct(NutritionWorkspace.self, key: .nutrition),
            notes: try direct(NotesWorkspace.self, key: .notes),
            sport: try canonical(.sport, decode: RootineCanonicalWorkspaceMapping.sportWorkspace(from:)),
            goals: try canonical(.goals, decode: RootineCanonicalWorkspaceMapping.goalsWorkspace(from:)),
            work: try canonical(.work, decode: RootineCanonicalWorkspaceMapping.workWorkspace(from:)),
            travel: try canonical(.travel, decode: RootineCanonicalWorkspaceMapping.travelWorkspace(from:)),
            health: try canonical(.health, decode: RootineCanonicalWorkspaceMapping.healthWorkspace(from:)),
            affairs: try direct(AffairsWorkspace.self, key: .affairs).map(AffairsWorkspaceRules.normalized)
        )
    }

    private func normalizedDecision<T: Codable & Equatable & Sendable>(
        key: RootineStorageKey,
        local: T?,
        remote: T?,
        materialization: RootineRelationalMaterialization,
        pending: [PendingWorkspaceMutation],
        store: WorkspaceFileStore
    ) async throws -> NormalizedDecision {
        let value: T
        if let remote { value = remote }
        else if let local { value = local }
        else { value = try emptyWorkspace(for: key) }
        guard let remote else {
            return NormalizedDecision(key: key, value: value, shouldPersist: false, conflict: false, revision: nil)
        }
        let canonicalKey = RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: key)
        let remoteRevision = materialization.revisions[canonicalKey] ?? 0
        guard let local else {
            return NormalizedDecision(key: key, value: remote, shouldPersist: true, conflict: false, revision: remoteRevision)
        }
        let localRevision = try await store.revision(for: canonicalKey)
        let hasPending = pending.contains { $0.storageKey == canonicalKey || $0.storageKey == key.rawValue }
        if local == remote {
            return NormalizedDecision(key: key, value: local, shouldPersist: false, conflict: false, revision: max(localRevision, remoteRevision))
        }
        if !hasPending && remoteRevision > localRevision {
            return NormalizedDecision(key: key, value: remote, shouldPersist: true, conflict: false, revision: remoteRevision)
        }
        if hasPending && remoteRevision > localRevision {
            return NormalizedDecision(key: key, value: local, shouldPersist: false, conflict: true, revision: nil)
        }
        return NormalizedDecision(key: key, value: local, shouldPersist: false, conflict: false, revision: nil)
    }

    private func emptyWorkspace<T>(for key: RootineStorageKey) throws -> T {
        switch key {
        case .tasks: return TaskWorkspace.empty as! T
        case .nutrition: return NutritionWorkspace.empty as! T
        case .notes: return NotesWorkspace.empty as! T
        case .sport: return SportWorkspace.empty as! T
        case .goals: return GoalsWorkspace.empty as! T
        case .work: return WorkWorkspace.empty as! T
        case .travel: return TravelWorkspace.empty as! T
        case .health: return HealthWorkspace.empty as! T
        case .affairs: return AffairsWorkspace.empty as! T
        default: throw RootineNormalizedReadError.materializationFailed("nieznany workspace")
        }
    }

    private func persistNormalizedDecision(_ decision: NormalizedDecision, key: RootineStorageKey, store: WorkspaceFileStore) async throws {
        if decision.shouldPersist {
            switch key {
            case .tasks: try await store.save(decision.value as! TaskWorkspace, key: key)
            case .nutrition: try await store.save(decision.value as! NutritionWorkspace, key: key)
            case .notes: try await store.save(decision.value as! NotesWorkspace, key: key)
            case .sport:
                try await store.save(decision.value as! SportWorkspace, key: key)
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .sportCanonicalShadow) }
            case .goals:
                try await store.save(decision.value as! GoalsWorkspace, key: key)
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .goalsCanonicalShadow) }
            case .work:
                try await store.save(decision.value as! WorkWorkspace, key: key)
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .workCanonicalShadow) }
            case .travel:
                try await store.save(decision.value as! TravelWorkspace, key: key)
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .travelCanonicalShadow) }
            case .health:
                try await store.save(decision.value as! HealthWorkspace, key: key)
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .healthCanonicalShadow) }
            case .affairs: try await store.save(decision.value as! AffairsWorkspace, key: key)
            default: break
            }
        }
        if let revision = decision.revision {
            let canonicalKey = RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: key)
            let currentRevision = try await store.revision(for: canonicalKey)
            try await store.setRevision(max(currentRevision, revision), for: canonicalKey)
        }
    }

    private func loadLegacyAndReconcile(accessToken: String, flushAfterReconcile: Bool = true) async {
        guard let store, let syncEngine else { return }
        guard !archiveImportInProgress else { return }
        guard !isReconciling else { return }
        isReconciling = true
        defer { finishReconciliation() }
        do {
            // This path is also used immediately after login, before the
            // offline loader has run. Hydrate shadows first so Work and other
            // compact projections cannot overwrite web-only fields at cold
            // start.
            await loadCanonicalShadows(from: store)
            let localTasks = try await store.load(TaskWorkspace.self, key: .tasks)
            let localNutrition = try await store.load(NutritionWorkspace.self, key: .nutrition)
            let localNotes = try await store.load(NotesWorkspace.self, key: .notes)
            let localSport = try await store.load(SportWorkspace.self, key: .sport)
            let localGoals = try await store.load(GoalsWorkspace.self, key: .goals)
            let localWorkRaw = try await store.load(WorkWorkspace.self, key: .work)
            let localWork: WorkWorkspace?
            if let localWorkRaw {
                localWork = await sanitizedWorkWorkspace(localWorkRaw, store: store)
            } else {
                localWork = nil
            }
            let localTravel = try await store.load(TravelWorkspace.self, key: .travel)
            let localHealth = try await store.load(HealthWorkspace.self, key: .health)
            let localAffairsRaw = (try await store.load(AffairsWorkspace.self, key: .affairs)) ?? .empty
            let localAffairs = await sanitizedAffairsWorkspace(localAffairsRaw, store: store, syncEngine: syncEngine, allowSync: false)
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
            workWorkspace = await sanitizedWorkWorkspace(workResult.value, store: store, allowSync: true)
            travelWorkspace = travelResult.value
            healthWorkspace = healthResult.value
            affairsWorkspace = await sanitizedAffairsWorkspace(affairsResult.value, store: store, syncEngine: syncEngine, allowSync: true)
            await reconcileLocalNotifications()
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
                if flushAfterReconcile {
                    await flushPendingMutations()
                }
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

        try validateRemoteWorkspaceVersion(remoteRow.payload, key: key)
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
