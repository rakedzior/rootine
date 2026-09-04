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

enum TodayBulkRescheduleSyncState: Equatable, Sendable {
    case synced
    case queuedOffline
    case conflict
}

struct TodayBulkRescheduleReport: Equatable, Sendable {
    let changes: [TodayBulkRescheduleChange]
    let skippedRecurring: [WorkspaceTask]
    let syncState: TodayBulkRescheduleSyncState
}

enum TodayBulkRescheduleResult: Equatable, Sendable {
    case moved(TodayBulkRescheduleReport)
    case noChanges(skippedRecurring: [WorkspaceTask])
    case duplicate
    case failed(String)
}

enum TodayBulkRescheduleUndoResult: Equatable, Sendable {
    case restored(count: Int, skippedCount: Int, syncState: TodayBulkRescheduleSyncState)
    case nothingToUndo
    case failed(String)
}

private enum RootineTaskPersistenceOutcome: Equatable, Sendable {
    case synced
    case queuedOffline
    case conflict
    case failed(String)
}

private func normalizedGoalStartDate(_ value: String) -> String {
    rootineGoalIsLocalDate(value) ? value : RootineDate.localDate()
}

private func normalizedGoalDueDate(startDate: String, dueDate: String) -> String {
    let start = normalizedGoalStartDate(startDate)
    guard rootineGoalIsLocalDate(dueDate) else { return start }
    return dueDate < start ? start : dueDate
}

private func normalizedMilestones(_ milestones: [GoalMilestone]) -> [GoalMilestone] {
    milestones.enumerated().map { index, item in
        var result = item
        result.title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
        result.weight = max(0.01, item.weight)
        result.order = item.order ?? index
        return result
    }.filter { !$0.title.isEmpty }
}

private func rootineGoalIsLocalDate(_ value: String) -> Bool {
    let parts = value.split(separator: "-")
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
          let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return false }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else { return false }
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return components.year == year && components.month == month && components.day == day
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
    @Published private(set) var accountState: RootineAccountState?
    @Published private(set) var foundationMessage = "Szkielet techniczny gotowy"
    @Published private(set) var workspaceSyncStatus = WorkspaceSyncStatus.unavailable
    @Published private(set) var realtimeLastRefresh: Date?
    @Published private(set) var realtimeStatus: RootineRealtimeStatus = .stopped
    @Published private(set) var syncCoordinatorStatus: RootineSyncCoordinatorStatus = .stopped
    @Published private(set) var recoveryFiles: [WorkspaceRecoveryFile] = []
    @Published private(set) var deviceRegistration: RootineDeviceRegistration?
    @Published private(set) var notificationPermissionState: RootineNotificationPermissionState = .notDetermined
    @Published private(set) var profilePreferences = RootineProfilePreferences.current
    @Published private(set) var notificationPreferences = RootineNotificationPreferences()
    @Published private(set) var normalizedReadEnabled = false
    @Published private(set) var normalizedReadFallbackReason: String?

    let configuration: RootineConfiguration
    private let api: RootineAPIClient
    private let authClient: any RootineAuthClient
    private let normalizedReadClient: any RootineRelationalReadClient
    private let readFeatureFlags: any RootineReadFeatureFlagStore
    private let nowProvider: () -> Date
    private let keychain: any RootineSessionStoring
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
    private var canonicalShadows: [RootineStorageKey: JSONValue] = [:]
    private var nutritionProductCache: [String: NutritionProduct] = [:]
    private var normalizedRecordRevisions: [String: Int64] = [:]
    private var creationGate = WorkspaceCreationGate()
    /// A UI confirmation can generate more than one async callback. Keep the
    /// operation gate on the main actor so one tap can never publish two
    /// bulk snapshots while the first write is suspended.
    private var activeTodayBulkRescheduleOperations = Set<String>()
    private var realtimeClient: RootineRealtimeClient?
    private var syncCoordinator: RootineSyncCoordinator?
    private var realtimeRuntimeUserID: String?
    private var currentScenePhase: RootineScenePhase = .active
    private var lastKnownNetworkReachable = true
    private var realtimeRuntimeGeneration = 0
    private var networkMonitor: NWPathMonitor?
    private var networkMonitorQueue: DispatchQueue?
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
    private var authGeneration = 0
    private var pendingGoogleIdentityLink = false

    init(
        configuration: RootineConfiguration = .fromBundle(),
        keychain: any RootineSessionStoring = KeychainSessionStore(),
        normalizedReadClient: (any RootineRelationalReadClient)? = nil,
        readFeatureFlags: (any RootineReadFeatureFlagStore)? = nil,
        authClient: (any RootineAuthClient)? = nil,
        nowProvider: @escaping () -> Date = Date.init
    ) {
        self.configuration = configuration
        self.keychain = keychain
        let configuredAPI = RootineAPIClient(configuration: configuration)
        self.api = configuredAPI
        self.authClient = authClient ?? configuredAPI
        self.deviceIdentity = RootineDeviceIdentityStore()
        self.normalizedReadClient = normalizedReadClient ?? configuredAPI
        self.readFeatureFlags = readFeatureFlags ?? UserDefaultsRootineReadFeatureFlagStore()
        self.nowProvider = nowProvider
        let storedSession = keychain.load()
        session = storedSession
        if let storedSession {
            accountState = RootineAccountState(user: storedSession.user)
            configureRuntime(userID: storedSession.user.id)
        }
    }

    func establishEmailSession(email: String, password: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard AuthInputValidator.isValidEmail(email) else { throw RootineAPIError.invalidEmail }
        guard !password.isEmpty else { throw RootineAPIError.invalidCredentials }
        isWorking = true
        defer { isWorking = false }
        let signedIn = try await authClient.signIn(
            email: normalizedEmail(email),
            password: password
        )
        try await accept(signedIn)
    }

    func register(email: String, password: String) async throws -> Bool {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard AuthInputValidator.isValidEmail(email) else { throw RootineAPIError.invalidEmail }
        guard AuthInputValidator.passwordError(password) == nil else { throw RootineAPIError.weakPassword }
        isWorking = true
        defer { isWorking = false }
        switch try await authClient.signUp(email: normalizedEmail(email), password: password) {
        case .session(let newSession):
            try await accept(newSession)
            return false
        case .needsEmailConfirmation:
            return true
        }
    }

    func resendConfirmation(email: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard AuthInputValidator.isValidEmail(email) else { throw RootineAPIError.invalidEmail }
        try await authClient.resendConfirmation(email: normalizedEmail(email))
    }

    func requestPasswordReset(email: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard AuthInputValidator.isValidEmail(email) else { throw RootineAPIError.invalidEmail }
        isWorking = true
        defer { isWorking = false }
        try await authClient.requestPasswordReset(email: normalizedEmail(email))
    }

    func googleAuthorizationURL() throws -> URL {
        try authClient.googleAuthorizationURL()
    }

    func establishGoogleSession(callbackURL: URL) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        isWorking = true
        defer { isWorking = false }
        let result = try await authClient.session(from: callbackURL)
        try await accept(result.session, passwordRecovery: result.isPasswordRecovery)
    }

    func establishAppleSession(idToken: String, nonce: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        try AuthProtocolValidator.validateAppleIdentityToken(
            idToken,
            rawNonce: nonce,
            expectedAudience: configuration.appleClientID
        )
        isWorking = true
        defer { isWorking = false }
        let signedIn = try await authClient.signInWithApple(idToken: idToken, nonce: nonce)
        try await accept(signedIn)
    }

    func handleAuthCallback(_ url: URL) async throws {
        guard url.scheme?.caseInsensitiveCompare(configuration.authCallbackScheme) == .orderedSame,
              url.host?.caseInsensitiveCompare("auth-callback") == .orderedSame else { return }
        if pendingGoogleIdentityLink {
            try await establishGoogleIdentityLink(callbackURL: url)
        } else {
            try await establishGoogleSession(callbackURL: url)
        }
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

    func googleIdentityAuthorizationURLForLinking() async throws -> URL {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard let accessToken = session?.accessToken else { throw RootineAPIError.unauthorized }
        let generation = authGeneration
        pendingGoogleIdentityLink = true
        do {
            let url = try await authClient.googleIdentityAuthorizationURL(accessToken: accessToken)
            guard generation == authGeneration, session?.accessToken == accessToken else {
                pendingGoogleIdentityLink = false
                throw RootineAPIError.cancelled
            }
            return url
        } catch {
            pendingGoogleIdentityLink = false
            throw error
        }
    }

    func establishGoogleIdentityLink(callbackURL: URL) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard let currentSession = session else { throw RootineAPIError.unauthorized }
        let generation = authGeneration
        isWorking = true
        defer {
            isWorking = false
            pendingGoogleIdentityLink = false
        }
        let result = try await authClient.session(from: callbackURL)
        guard generation == authGeneration,
              result.session.user.id == currentSession.user.id,
              session?.accessToken == currentSession.accessToken else {
            throw RootineAPIError.accountMismatch
        }
        try await acceptLinkedIdentitySession(result.session)
    }

    func cancelPendingIdentityLink() {
        pendingGoogleIdentityLink = false
    }

    func establishAppleIdentityLink(idToken: String, nonce: String) async throws {
        guard configuration.isAuthComplete else { throw RootineAPIError.missingConfiguration }
        guard let currentSession = session else { throw RootineAPIError.unauthorized }
        try AuthProtocolValidator.validateAppleIdentityToken(
            idToken,
            rawNonce: nonce,
            expectedAudience: configuration.appleClientID
        )
        isWorking = true
        defer { isWorking = false }
        let linkedSession = try await authClient.linkAppleIdentity(
            idToken: idToken,
            nonce: nonce,
            accessToken: currentSession.accessToken
        )
        guard linkedSession.user.id == currentSession.user.id else {
            throw RootineAPIError.accountMismatch
        }
        try await acceptLinkedIdentitySession(linkedSession)
    }

    func refreshAccountState() async throws {
        guard let currentSession = session else { throw RootineAPIError.unauthorized }
        let generation = authGeneration
        let originalIdentities = currentSession.user.identities
        let identities = try await authClient.identities(accessToken: currentSession.accessToken)
        guard generation == authGeneration,
              session?.user.id == currentSession.user.id,
              session?.accessToken == currentSession.accessToken,
              session?.user.identities == originalIdentities else {
            throw RootineAPIError.cancelled
        }
        var user = currentSession.user
        user.identities = identities
        let updated = SupabaseSession(
            accessToken: currentSession.accessToken,
            refreshToken: currentSession.refreshToken,
            expiresIn: currentSession.expiresIn,
            expiresAt: currentSession.expiresAt,
            tokenType: currentSession.tokenType,
            user: user
        )
        try keychain.save(updated)
        session = updated
        accountState = RootineAccountState(user: user)
    }

    func unlinkIdentity(_ identityID: String) async throws {
        guard let currentSession = session,
              let identities = currentSession.user.identities else {
            throw RootineAPIError.unauthorized
        }
        let generation = authGeneration
        guard identities.contains(where: { $0.identityID == identityID }) else {
            throw RootineAPIError.identityNotFound
        }
        guard identities.count > 1 else { throw RootineAPIError.lastIdentityNotDeletable }
        try await authClient.unlinkIdentity(identityID: identityID, accessToken: currentSession.accessToken)
        guard generation == authGeneration,
              session?.user.id == currentSession.user.id,
              session?.accessToken == currentSession.accessToken,
              session?.user.identities == identities else {
            throw RootineAPIError.cancelled
        }
        var user = currentSession.user
        user.identities = identities.filter { $0.identityID != identityID }
        let updated = SupabaseSession(
            accessToken: currentSession.accessToken,
            refreshToken: currentSession.refreshToken,
            expiresIn: currentSession.expiresIn,
            expiresAt: currentSession.expiresAt,
            tokenType: currentSession.tokenType,
            user: user
        )
        try keychain.save(updated)
        session = updated
        accountState = RootineAccountState(user: user)
    }

    func completePasswordRecovery(password: String) async throws {
        guard let accessToken = session?.accessToken else { throw RootineAPIError.unauthorized }
        guard AuthInputValidator.passwordError(password) == nil else { throw RootineAPIError.weakPassword }
        let generation = authGeneration
        isWorking = true
        defer { isWorking = false }
        try await authClient.updatePassword(password, accessToken: accessToken)
        guard generation == authGeneration, session?.accessToken == accessToken else {
            throw RootineAPIError.cancelled
        }
        isPasswordRecovery = false
        await loadAndReconcile(accessToken: accessToken)
    }

    func updateAccountPassword(_ password: String) async throws {
        guard let accessToken = session?.accessToken else { throw RootineAPIError.unauthorized }
        guard AuthInputValidator.passwordError(password) == nil else {
            throw RootineAPIError.weakPassword
        }
        try await authClient.updatePassword(password, accessToken: accessToken)
        foundationMessage = "Hasło zostało zmienione"
    }

    func cancelPasswordRecovery() {
        signOutFoundationSession()
        isPasswordRecovery = false
    }

    func start() async {
        let generation = authGeneration
        defer { isLaunching = false }
        guard var activeSession = session else {
            accountState = nil
            workspaceSyncStatus = .unavailable
            foundationMessage = configuration.isAuthComplete
                ? "Zaloguj się, aby połączyć dane Rootine"
                : "Uzupełnij konfigurację logowania w Secrets.xcconfig"
            return
        }

        if activeSession.shouldRefresh && configuration.isAuthComplete {
            do {
                activeSession = try await authClient.refreshSession(refreshToken: activeSession.refreshToken)
                guard generation == authGeneration else { return }
                try keychain.save(activeSession)
                session = activeSession
                accountState = RootineAccountState(user: activeSession.user)
                configureRuntime(userID: activeSession.user.id)
            } catch RootineAPIError.unauthorized {
                guard generation == authGeneration else { return }
                signOutFoundationSession()
                return
            } catch {
                guard generation == authGeneration, session?.user.id == activeSession.user.id else { return }
                await recoverOrphanedTransactions()
                await loadLocalCopies()
                await markLocalOnly()
                foundationMessage = "Offline — używam danych zapisanych na tym iPhonie"
            }
        }
        guard generation == authGeneration, session?.user.id == activeSession.user.id else { return }
        await recoverOrphanedTransactions()
        guard generation == authGeneration, session?.user.id == activeSession.user.id else { return }
        await refreshProfileSettings()
        await loadAndReconcile(accessToken: activeSession.accessToken)
        guard generation == authGeneration, session?.user.id == activeSession.user.id else { return }
        await flushPendingMutations()
        startRealtimeRuntime()
        scheduleDeviceRegistration()
        await refreshRecoveryFiles()
    }

#if DEBUG
    func setTaskWorkspaceForTests(_ workspace: TaskWorkspace) {
        taskWorkspace = workspace
    }

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
                        entity: "preview/task",
                        context: "work",
                        href: "/praca",
                        originTaskId: nil,
                        managed: "native"
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
        authGeneration &+= 1
        pendingGoogleIdentityLink = false
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
        stopRealtimeRuntime()
        keychain.clear()
        session = nil
        accountState = nil
        isPasswordRecovery = false
        authCallbackError = nil
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
        profilePreferences = .current
        notificationPreferences = RootineNotificationPreferences()
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

    /// Exports only bounded, redacted operational diagnostics. Workspace
    /// contents, tokens, account identifiers and notification payloads are
    /// intentionally excluded; a support workflow can attach this next to a
    /// user-provided issue description.
    func exportDiagnostics() -> Data {
        RootineObservability.shared.exportDiagnostics()
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
        guard rootineValidateTravelWorkspace(archive.travel).isEmpty else {
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
        let userID = session?.user.id
        guard await beginWorkspacePersistence() else {
            try await clearLocalDataAndSignOut()
            return
        }
        defer { endWorkspacePersistence() }
        if let store {
            try await store.clearAllLocalData()
        }
        if let userID {
            RootineProfilePreferencesStore.remove(userID: userID)
            RootineNotificationPreferencesStore.remove(userID: userID)
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
        await refreshProfileSettings()
        await refreshRecoveryFiles()
    }

    /// Profile sync (B08) can feed notification preferences without coupling
    /// the local scheduler to a transport or persistence implementation.
    func updateNotificationPreferences(_ preferences: RootineNotificationPreferences) async {
        notificationPreferences = preferences
        if let userID = session?.user.id {
            RootineNotificationPreferencesStore.save(preferences, userID: userID)
        }
        if let accessToken = session?.accessToken, configuration.isAuthComplete {
            do {
                let saved = try await api.saveNotificationPreferences(preferences, accessToken: accessToken)
                guard session?.accessToken == accessToken else { return }
                // Lock-screen detail is deliberately local-only: the server
                // contract stores schedule metadata, never notification
                // content or its privacy opt-in.
                var merged = saved
                merged.showTaskDetails = preferences.showTaskDetails
                notificationPreferences = merged
                if let userID = session?.user.id {
                    RootineNotificationPreferencesStore.save(merged, userID: userID)
                }
            } catch {
                // Local-first behavior is intentional. A missing notification
                // migration or a temporary network error must not make the
                // rest of the account settings unusable.
                foundationMessage = "Powiadomienia zapisano lokalnie — synchronizacja serwera czeka"
            }
        }
        await reconcileLocalNotifications()
    }

    /// Hydrates only safe notification metadata. A missing optional migration
    /// leaves the account's previously stored local defaults untouched.
    func refreshProfileSettings() async {
        guard let accessToken = session?.accessToken, configuration.isAuthComplete else { return }
        do {
            guard let remote = try await api.loadNotificationPreferences(accessToken: accessToken),
                  session?.accessToken == accessToken else { return }
            var merged = remote
            merged.showTaskDetails = notificationPreferences.showTaskDetails
            notificationPreferences = merged
            if let userID = session?.user.id {
                RootineNotificationPreferencesStore.save(merged, userID: userID)
            }
            var profile = profilePreferences
            profile.timezoneIdentifier = remote.timezoneIdentifier
            profilePreferences = profile.normalized
            if let userID = session?.user.id {
                RootineProfilePreferencesStore.save(profilePreferences, userID: userID)
            }
            await reconcileLocalNotifications()
        } catch {
            // Profile preferences are a progressive enhancement. Keep local
            // values when the optional server table is unavailable/offline.
        }
    }

    /// Persists presentation choices under the current account. Locale,
    /// currency and units are deliberately not sent to the workspace API:
    /// they affect rendering only and never mutate domain records.
    func updateProfilePreferences(_ preferences: RootineProfilePreferences) async {
        let normalized = preferences.normalized
        profilePreferences = normalized
        if let userID = session?.user.id {
            RootineProfilePreferencesStore.save(normalized, userID: userID)
        }
        var notifications = notificationPreferences
        notifications.timezoneIdentifier = normalized.timezoneIdentifier
        await updateNotificationPreferences(notifications)
        foundationMessage = "Preferencje profilu zapisane"
    }

    /// Updates the display name without exposing or persisting an auth token.
    func updateProfileDisplayName(_ displayName: String) async throws {
        let normalized = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...120).contains(normalized.count),
              !normalized.contains(where: { $0.isNewline }),
              !normalized.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw RootineProfileSettingsError.invalidDisplayName
        }
        guard let currentSession = session else { throw RootineAPIError.unauthorized }
        let updatedUser = try await api.updateDisplayName(
            normalized,
            existingMetadata: currentSession.user.userMetadata,
            accessToken: currentSession.accessToken
        )
        guard session?.accessToken == currentSession.accessToken else { return }
        var mergedUser = updatedUser
        if mergedUser.email == nil { mergedUser.email = currentSession.user.email }
        if mergedUser.userMetadata == nil { mergedUser.userMetadata = currentSession.user.userMetadata }
        if mergedUser.appMetadata == nil { mergedUser.appMetadata = currentSession.user.appMetadata }
        if mergedUser.identities == nil { mergedUser.identities = currentSession.user.identities }
        var updatedSession = currentSession
        updatedSession.user = mergedUser
        try keychain.save(updatedSession)
        session = updatedSession
        foundationMessage = "Profil został zaktualizowany"
    }

    /// Requests the OS prompt only when the scheduler is available. The
    /// resulting authorization state is published for the settings screen;
    /// an OS denial remains a normal state and never fails sync.
    func requestNotificationPermissionFromSettings() async {
        let current = await RootineNotificationPermissionState.current()
        if current == .denied {
            notificationPermissionState = current
            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                await UIApplication.shared.open(settingsURL)
            }
            return
        }
        let state = await requestNotificationAuthorization()
        switch state {
        case .authorized: notificationPermissionState = .authorized
        case .provisional: notificationPermissionState = .provisional
        case .ephemeral: notificationPermissionState = .ephemeral
        case .denied: notificationPermissionState = .denied
        case .notDetermined: notificationPermissionState = .notDetermined
        case .unavailable, .error: notificationPermissionState = .unknown
        }
        await registerDeviceForCurrentSession()
    }

    var currentDeviceIdentifier: String? {
        guard session != nil else { return nil }
        let identifier = deviceIdentity.loadOrCreate()
        guard identifier.count > 8 else { return identifier }
        return "\(identifier.prefix(6))…\(identifier.suffix(4))"
    }

    func revokeCurrentDevice() async {
        guard let accessToken = session?.accessToken else { return }
        let deviceID = deviceIdentity.loadOrCreate()
        deviceRegistrationTask?.cancel()
        deviceRegistrationTask = nil
        do {
            _ = try await api.revokeDevice(deviceID: deviceID, accessToken: accessToken)
            guard session?.accessToken == accessToken else { return }
            deviceRegistration = nil
            lastDeviceRegistrationFingerprint = nil
            foundationMessage = "To urządzenie wyrejestrowano z powiadomień"
        } catch {
            foundationMessage = "Nie udało się wyrejestrować urządzenia"
        }
    }

    /// Deletes the authenticated account through the server-owned Edge
    /// Function, then clears the account's local files and Keychain session.
    /// Local cleanup runs only after the server confirms deletion.
    func deleteAccountAndSignOut() async throws {
        guard let currentSession = session else { throw RootineAPIError.unauthorized }
        isWorking = true
        defer { isWorking = false }
        try await api.deleteAccount(accessToken: currentSession.accessToken)
        do {
            try await clearLocalDataAndSignOut()
        } catch {
            // The remote account is already gone. Never leave a dead session
            // active merely because local cleanup hit an I/O failure.
            try? await store?.clearAllLocalData()
            signOutFoundationSession()
            RootineProfilePreferencesStore.remove(userID: currentSession.user.id)
            RootineNotificationPreferencesStore.remove(userID: currentSession.user.id)
            throw error
        }
        RootineProfilePreferencesStore.remove(userID: currentSession.user.id)
        RootineNotificationPreferencesStore.remove(userID: currentSession.user.id)
        foundationMessage = "Konto i dane lokalne zostały usunięte"
    }

    /// Permission UX remains outside B10. This method is intentionally safe to
    /// call from login/foreground flows: a denial or OS error is a value, not
    /// a thrown error that could interrupt sync.
    func requestNotificationAuthorization() async -> RootineNotificationAuthorization {
        guard let scheduler = localNotificationScheduler else { return .unavailable }
        let authorization = await scheduler.requestAuthorization()
        // Reconcile both local scheduling and APNs registration after the
        // system prompt settles so a grant or denial cannot leave stale state.
        await reconcileLocalNotifications()
        if authorization.canSchedule {
            scheduleDeviceRegistration()
        }
        return authorization
    }

    func refreshNotificationPermissionState() async {
        notificationPermissionState = await RootineNotificationPermissionState.current()
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
        let done = !rootineTaskIsDoneOnDate(next.tasks[index], dateKey: dateKey)
        // Recurring records use the explicit per-date map; a schedule object
        // without recurrence remains a one-off task and keeps its legacy
        // global completion flag.
        next.tasks[index] = rootineTaskSettingCompletion(
            next.tasks[index],
            dateKey: dateKey,
            done: done,
            completedAt: RootineDate.isoTimestamp()
        )
        await persistTaskWorkspace(next)
    }

    /// Moves every currently actionable, non-recurring overdue task in one
    /// workspace write. Recurring rows are deliberately excluded because
    /// `calendarDate` is their series anchor; the caller receives those rows
    /// so the UI can explain the partial result instead of silently changing
    /// the schedule. Re-running after success is naturally idempotent because
    /// moved rows no longer satisfy the overdue predicate, while the in-flight
    /// gate protects the suspension window around the single write.
    func rescheduleOverdueTasksToToday(
        todayKey: String = RootineDate.localDate(),
        operationID: String = UUID().uuidString
    ) async -> TodayBulkRescheduleResult {
        let normalizedOperationID = operationID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedOperationID.isEmpty else {
            return .failed("Nie można przełożyć zaległości bez identyfikatora operacji.")
        }
        guard activeTodayBulkRescheduleOperations.insert(normalizedOperationID).inserted else {
            return .duplicate
        }
        defer { activeTodayBulkRescheduleOperations.remove(normalizedOperationID) }

        guard RootineDate.isLocalDateKey(todayKey) else {
            return .failed("Nieprawidłowa data dzisiejszego dnia.")
        }

        let plan = TodayBulkReschedulePlanner.plan(tasks: taskWorkspace.tasks, todayKey: todayKey)
        guard !plan.changes.isEmpty else {
            return .noChanges(skippedRecurring: plan.skippedRecurring)
        }

        var next = taskWorkspace
        let updatesByID = Dictionary(uniqueKeysWithValues: plan.changes.map { ($0.original.id, $0.updated) })
        next.tasks = next.tasks.map { updatesByID[$0.id] ?? $0 }
        switch await persistTaskWorkspaceOutcome(next) {
        case .synced:
            return .moved(TodayBulkRescheduleReport(
                changes: plan.changes,
                skippedRecurring: plan.skippedRecurring,
                syncState: .synced
            ))
        case .queuedOffline:
            return .moved(TodayBulkRescheduleReport(
                changes: plan.changes,
                skippedRecurring: plan.skippedRecurring,
                syncState: .queuedOffline
            ))
        case .conflict:
            return .moved(TodayBulkRescheduleReport(
                changes: plan.changes,
                skippedRecurring: plan.skippedRecurring,
                syncState: .conflict
            ))
        case .failed(let message):
            return .failed(message)
        }
    }

    /// Conditional bulk Undo. A task edited after the move must not be
    /// overwritten by an old banner, so only rows still equal to their exact
    /// post-move projection are restored.
    func undoTodayBulkReschedule(
        changes: [TodayBulkRescheduleChange],
        operationID: String = UUID().uuidString
    ) async -> TodayBulkRescheduleUndoResult {
        let normalizedOperationID = operationID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedOperationID.isEmpty else {
            return .failed("Nie można cofnąć przełożenia bez identyfikatora operacji.")
        }
        guard activeTodayBulkRescheduleOperations.insert(normalizedOperationID).inserted else {
            return .nothingToUndo
        }
        defer { activeTodayBulkRescheduleOperations.remove(normalizedOperationID) }

        let plan = TodayBulkReschedulePlanner.undo(changes: changes, in: taskWorkspace.tasks)
        guard !plan.restoredIDs.isEmpty else { return .nothingToUndo }
        var next = taskWorkspace
        next.tasks = plan.tasks

        switch await persistTaskWorkspaceOutcome(next) {
        case .synced:
            return .restored(count: plan.restoredIDs.count, skippedCount: plan.skippedIDs.count, syncState: .synced)
        case .queuedOffline:
            return .restored(count: plan.restoredIDs.count, skippedCount: plan.skippedIDs.count, syncState: .queuedOffline)
        case .conflict:
            return .restored(count: plan.restoredIDs.count, skippedCount: plan.skippedIDs.count, syncState: .conflict)
        case .failed(let message):
            return .failed(message)
        }
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
        priority: TaskPriority?,
        notes: String?,
        list: String?,
        tags: [String]?
    ) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let normalizedTime, !normalizedTime.isEmpty, !RootineDate.isClockTime(normalizedTime) { return }
        if let calendarDate, !RootineDate.isLocalDateKey(calendarDate) { return }
        let normalizedNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTags = tags?.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let existingTask = next.tasks[index]
        let existingTags = Set(existingTask.tags ?? [])
        // Keep legacy/orphaned references round-trippable when an editor
        // saves an otherwise valid task. New assignments still must point to
        // the current taxonomy.
        guard list == nil
                || list == existingTask.list
                || next.lists.contains(where: { $0.id == list }) else { return }
        guard (normalizedTags ?? []).allSatisfy({ tagID in
            existingTags.contains(tagID) || next.tags.contains(where: { $0.id == tagID })
        }) else { return }
        next.tasks[index].text = trimmedText
        next.tasks[index].time = normalizedTime?.isEmpty == true ? nil : normalizedTime
        if normalizedTime?.isEmpty != false { next.tasks[index].endTime = nil }
        next.tasks[index].calendarDate = calendarDate
        next.tasks[index].view = rootineTaskViewForCalendarDate(calendarDate)
        next.tasks[index].priority = priority
        next.tasks[index].notes = normalizedNotes?.isEmpty == true ? nil : normalizedNotes
        next.tasks[index].list = list
        next.tasks[index].tags = normalizedTags
        if calendarDate == nil {
            next.tasks[index].schedule = nil
        } else {
            let updatedSchedule = rootineTaskSchedule(
                for: calendarDate,
                time: normalizedTime,
                endTime: next.tasks[index].endTime ?? next.tasks[index].schedule?.endTime,
                existing: next.tasks[index].schedule
            )
            guard let updatedSchedule,
                  rootineValidTaskSchedule(updatedSchedule, taskDate: calendarDate) else { return }
            next.tasks[index].schedule = updatedSchedule
        }
        await persistTaskWorkspace(next)
    }

    func updateTaskSchedule(id: Int, schedule: WorkspaceTaskSchedule?) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        guard let dateKey = next.tasks[index].calendarDate else {
            guard schedule == nil else { return }
            next.tasks[index].schedule = nil
            await persistTaskWorkspace(next)
            return
        }
        if let schedule {
            guard rootineValidTaskSchedule(schedule, taskDate: dateKey) else { return }
            next.tasks[index].schedule = schedule
            next.tasks[index].time = schedule.allDay ? nil : schedule.startTime
            next.tasks[index].endTime = schedule.allDay ? nil : schedule.endTime
        } else {
            next.tasks[index].schedule = rootineTaskSchedule(
                for: dateKey,
                time: next.tasks[index].time,
                endTime: next.tasks[index].endTime
            )
        }
        await persistTaskWorkspace(next)
    }

    func deleteTask(id: Int) async {
        var next = taskWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id && $0.deleted != true }) else { return }
        next.tasks[index].deleted = true
        await persistTaskWorkspace(next)
    }

    /// The canonical task contract has no separate archive field. Archive is
    /// therefore the recoverable `deleted` tombstone used by web and iOS.
    func archiveTask(id: Int) async {
        await deleteTask(id: id)
    }

    /// Permanent deletion is intentionally separate from the normal delete so
    /// a UI can require an explicit Trash confirmation before losing a row.
    func purgeTask(id: Int) async {
        var next = taskWorkspace
        guard next.tasks.contains(where: { $0.id == id && $0.deleted == true }) else { return }
        next.tasks.removeAll { $0.id == id }
        await persistTaskWorkspace(next)
    }

    func emptyTaskTrash() async {
        var next = taskWorkspace
        guard next.tasks.contains(where: { $0.deleted == true }) else { return }
        next.tasks.removeAll { $0.deleted == true }
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
        if let normalizedTime, !normalizedTime.isEmpty, !RootineDate.isClockTime(normalizedTime) { return }
        let normalizedSchedule = schedule ?? WorkspaceHabitSchedule(type: "daily", startDate: RootineDate.localDate())
        guard rootineValidHabitSchedule(normalizedSchedule) else { return }
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
        if let normalizedTime, !normalizedTime.isEmpty, !RootineDate.isClockTime(normalizedTime) { return }
        if let schedule, !rootineValidHabitSchedule(schedule) { return }
        next.habits[index].name = trimmedName
        next.habits[index].time = normalizedTime?.isEmpty == true ? nil : normalizedTime
        next.habits[index].priority = priority
        if let schedule { next.habits[index].schedule = schedule }
        let today = RootineDate.localDate()
        next.habits[index] = rootineNormalizedHabit(next.habits[index], referenceDate: today)
        await persistTaskWorkspace(next)
    }

    func pauseHabit(id: Int, startDate: String = RootineDate.localDate(), endDate: String? = nil) async {
        guard RootineDate.isValidLocalDate(startDate),
              endDate == nil || (RootineDate.isValidLocalDate(endDate!) && endDate! >= startDate) else { return }
        var next = taskWorkspace
        guard let index = next.habits.firstIndex(where: { $0.id == id }) else { return }
        let period = WorkspaceHabitPause(startDate: startDate, endDate: endDate)
        guard !(next.habits[index].pausePeriods ?? []).contains(where: { $0.startDate == startDate && $0.endDate == endDate }) else { return }
        next.habits[index].pausePeriods = (next.habits[index].pausePeriods ?? []) + [period]
        next.habits[index] = rootineNormalizedHabit(next.habits[index])
        await persistTaskWorkspace(next)
    }

    func resumeHabit(id: Int, on date: String = RootineDate.localDate()) async {
        guard RootineDate.isValidLocalDate(date) else { return }
        var next = taskWorkspace
        guard let index = next.habits.firstIndex(where: { $0.id == id }) else { return }
        var periods: [WorkspaceHabitPause] = []
        var changed = false
        for period in next.habits[index].pausePeriods ?? [] {
            guard period.startDate <= date, period.endDate == nil || period.endDate! >= date else {
                periods.append(period)
                continue
            }
            changed = true
            if period.startDate < date {
                let previous = RootineDate.shiftLocalDate(date, by: -1)
                periods.append(WorkspaceHabitPause(startDate: period.startDate, endDate: previous))
            }
        }
        guard changed else { return }
        next.habits[index].pausePeriods = periods
        next.habits[index] = rootineNormalizedHabit(next.habits[index])
        await persistTaskWorkspace(next)
    }

    func deleteHabit(id: Int) async {
        var next = taskWorkspace
        next.habits.removeAll { $0.id == id }
        await persistTaskWorkspace(next)
    }

    func addTodayTask(
        text: String,
        time: String?,
        priority: TaskPriority? = nil,
        operationID: String = UUID().uuidString
    ) async {
        await addTask(
            text: text,
            time: time,
            calendarDate: RootineDate.localDate(),
            view: "dzis",
            priority: priority,
            operationID: operationID
        )
    }

    func addTask(
        text: String,
        time: String?,
        calendarDate: String?,
        view: String = "dzis",
        priority: TaskPriority? = nil,
        operationID: String = UUID().uuidString,
        schedule: WorkspaceTaskSchedule? = nil,
        list: String? = nil,
        tags: [String]? = nil,
        notes: String? = nil,
        subtasks: [WorkspaceTaskSubtask]? = nil,
        comments: [WorkspaceTaskComment]? = nil
    ) async {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        let normalizedView = view.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedView.isEmpty else { return }
        let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalizedTime?.isEmpty != false || RootineDate.isClockTime(normalizedTime!) else { return }
        if let calendarDate, !RootineDate.isLocalDateKey(calendarDate) { return }
        let creationFingerprint = "task|\(trimmedText)|\(time ?? "")|\(calendarDate ?? "")|\(view)|\(priority?.rawValue ?? "")"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = taskWorkspace
        let nextID = RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        guard !next.tasks.contains(where: { $0.id == nextID }) else { return }
        let normalizedSchedule: WorkspaceTaskSchedule?
        if let schedule {
            guard rootineValidTaskSchedule(schedule, taskDate: calendarDate) else { return }
            normalizedSchedule = schedule
        } else {
            normalizedSchedule = rootineTaskSchedule(for: calendarDate, time: normalizedTime)
        }
        if let normalizedSchedule, !rootineValidTaskSchedule(normalizedSchedule, taskDate: calendarDate) { return }
        let persistedTime = normalizedSchedule?.allDay == true
            ? nil
            : normalizedSchedule?.startTime ?? (normalizedTime?.isEmpty == true ? nil : normalizedTime)
        let persistedEndTime = normalizedSchedule?.allDay == true ? nil : normalizedSchedule?.endTime
        let normalizedTags = tags?.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let normalizedNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard list == nil || next.lists.contains(where: { $0.id == list }),
              (normalizedTags ?? []).allSatisfy({ tagID in next.tags.contains(where: { tag in tag.id == tagID }) }) else { return }
        next.tasks.append(WorkspaceTask(
            id: nextID,
            text: trimmedText,
            done: false,
            time: persistedTime,
            endTime: persistedEndTime,
            tags: normalizedTags,
            list: list,
            view: normalizedView,
            priority: priority,
            notes: normalizedNotes?.isEmpty == true ? nil : normalizedNotes,
            calendarDate: calendarDate,
            subtasks: subtasks,
            comments: comments,
            schedule: normalizedSchedule
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
            source: CommitmentTaskSource(kind: "work", entity: "ios/\(nextID)", context: "work", href: "/praca", originTaskId: nil, managed: "native")
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

    func createNoteList(name: String, operationID: String = UUID().uuidString) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        var next = notesWorkspace
        guard !next.lists.contains(where: { $0.name.localizedCaseInsensitiveCompare(trimmedName) == .orderedSame }) else { return }
        let now = RootineDate.isoTimestamp()
        next.lists.append(NoteList(
            id: RootineLocalIdentifier.string(namespace: "note-list", operationID: operationID),
            name: trimmedName,
            createdAt: now
        ))
        next.updatedAt = now
        await persistNotesWorkspace(next)
    }

    func renameNoteList(id: String, name: String) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        var next = notesWorkspace
        guard let index = next.lists.firstIndex(where: { $0.id == id }),
              !next.lists.enumerated().contains(where: { $0.offset != index && $0.element.name.localizedCaseInsensitiveCompare(trimmedName) == .orderedSame }) else { return }
        next.lists[index].name = trimmedName
        next.updatedAt = RootineDate.isoTimestamp()
        await persistNotesWorkspace(next)
    }

    func deleteNoteList(id: String) async {
        var next = notesWorkspace
        guard next.lists.contains(where: { $0.id == id }) else { return }
        next.lists.removeAll { $0.id == id }
        // Deleting a folder never deletes its notes. An empty list ID is the
        // canonical unfiled state; the editor will offer the remaining lists.
        let now = RootineDate.isoTimestamp()
        for index in next.notes.indices where next.notes[index].listId == id {
            next.notes[index].listId = ""
            next.notes[index].updatedAt = now
        }
        next.updatedAt = now
        await persistNotesWorkspace(next)
    }

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

    @discardableResult
    func addGoal(
        title: String,
        detail: String,
        target: Double,
        icon: String,
        operationID: String = UUID().uuidString
    ) async -> String? {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return nil }
        let creationFingerprint = "goal|\(trimmedTitle)|\(detail)|\(target)|\(icon)"
        guard creationGate.claim(creationFingerprint) else { return nil }
        defer { creationGate.release(creationFingerprint) }
        var next = goalsWorkspace
        let now = RootineDate.isoTimestamp()
        let recordID = RootineLocalIdentifier.string(namespace: "goal", operationID: operationID)
        guard !next.goals.contains(where: { $0.id == recordID }) else { return recordID }
        next.goals.append(GoalRecord(
            id: recordID,
            title: trimmedTitle,
            detail: detail.trimmingCharacters(in: .whitespacesAndNewlines),
            current: 0,
            target: max(1, target),
            icon: icon.isEmpty ? "target" : icon,
            createdAt: now,
            updatedAt: now,
            categoryId: "personal",
            iconKey: icon.isEmpty ? "target" : icon,
            status: .active,
            startDate: RootineDate.localDate(),
            dueDate: RootineDate.localDate(),
            progressMode: .numeric,
            targetValue: max(1, target),
            unit: "kroków",
            history: [GoalHistoryEntry(id: "history-\(recordID)-created", type: .updated, label: "Cel utworzony", createdAt: now)],
            note: detail.trimmingCharacters(in: .whitespacesAndNewlines)
        ))
        next.updatedAt = now
        await persistGoalsWorkspace(next)
        return recordID
    }

    /// Full canonical goal creation entry point. The compact More-module
    /// form above remains as a backwards-compatible convenience.
    @discardableResult
    func createGoal(
        title: String,
        description: String = "",
        categoryId: String = "personal",
        iconKey: String = "target",
        customIcon: String? = nil,
        color: String = "#7FA6C9",
        status: GoalStatus = .active,
        health: GoalHealth = .ontrack,
        priority: GoalPriority = .medium,
        startDate: String = RootineDate.localDate(),
        dueDate: String = RootineDate.localDate(),
        progressMode: GoalProgressMode = .numeric,
        regularityMode: GoalRegularityMode? = nil,
        frequencyTarget: Double? = nil,
        frequencyPeriod: GoalRegularityPeriod? = nil,
        initialValue: Double = 0,
        targetValue: Double = 1,
        unit: String = "kroków",
        manualProgress: Double = 0,
        milestones: [GoalMilestone] = [],
        progressEntries: [GoalProgressEntry] = [],
        linkedTaskIds: [Int] = [],
        note: String = "",
        operationID: String = UUID().uuidString
    ) async -> String? {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return nil }
        let now = RootineDate.isoTimestamp()
        let recordID = RootineLocalIdentifier.string(namespace: "goal", operationID: operationID)
        guard !goalsWorkspace.goals.contains(where: { $0.id == recordID }) else { return recordID }
        let normalizedCategory = goalsWorkspace.categories.contains(where: { $0.id == categoryId }) ? categoryId : "personal"
        let normalizedMode = progressMode
        var goal = GoalRecord(
            id: recordID,
            title: trimmedTitle,
            detail: description.trimmingCharacters(in: .whitespacesAndNewlines),
            current: 0,
            target: max(1, targetValue),
            icon: iconKey.isEmpty ? "target" : iconKey,
            createdAt: now,
            updatedAt: now,
            categoryId: normalizedCategory,
            iconKey: iconKey.isEmpty ? "target" : iconKey,
            customIcon: customIcon,
            color: color,
            status: status,
            health: health,
            priority: priority,
            startDate: normalizedGoalStartDate(startDate),
            dueDate: normalizedGoalDueDate(startDate: startDate, dueDate: dueDate),
            progressMode: normalizedMode,
            regularityMode: regularityMode,
            frequencyTarget: frequencyTarget,
            frequencyPeriod: frequencyPeriod,
            initialValue: initialValue,
            targetValue: max(0, targetValue),
            unit: unit,
            manualProgress: min(100, max(0, manualProgress)),
            milestones: normalizedMilestones(milestones),
            progressEntries: progressEntries,
            linkedTaskIds: linkedTaskIds,
            history: [GoalHistoryEntry(id: "history-\(recordID)-created", type: .updated, label: "Cel utworzony", createdAt: now)],
            note: note
        )
        goal.current = rootineGoalCurrentValue(goal)
        var next = goalsWorkspace
        next.goals.append(goal)
        await persistGoalsWorkspace(next)
        return recordID
    }

    func advanceGoal(id: String, by amount: Double = 1) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        if next.goals[index].progressMode == .milestones {
            guard let milestoneIndex = next.goals[index].milestones.firstIndex(where: { !$0.done }) else { return }
            next.goals[index].milestones[milestoneIndex].done = true
            next.goals[index].milestones[milestoneIndex].completedAt = now
        } else {
            next.goals[index].progressEntries.append(GoalProgressEntry(
                id: RootineLocalIdentifier.string(namespace: "goal-progress", operationID: now + id),
                date: RootineDate.localDate(),
                value: amount,
                kind: .delta,
                note: "Postęp z aplikacji iOS",
                createdAt: now
            ))
        }
        next.goals[index].current = rootineGoalCurrentValue(next.goals[index])
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-\(now)", type: .progress, label: "Zaktualizowano postęp", detail: "\(amount)", createdAt: now))
        next.updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func addGoalProgress(id: String, date: String, value: Double, kind: GoalProgressEntry.Kind = .delta, note: String = "", operationID: String = UUID().uuidString) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        let entry = GoalProgressEntry(id: RootineLocalIdentifier.string(namespace: "goal-progress", operationID: operationID), date: date, value: value, kind: kind, note: note, createdAt: now)
        guard !next.goals[index].progressEntries.contains(where: { $0.id == entry.id }) else { return }
        next.goals[index].progressEntries.append(entry)
        next.goals[index].current = rootineGoalCurrentValue(next.goals[index])
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(entry.id)", type: .progress, label: "Zaktualizowano postęp", detail: note.isEmpty ? nil : note, createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func updateGoalProgress(id: String, progressID: String, date: String? = nil, value: Double? = nil, kind: GoalProgressEntry.Kind? = nil, note: String? = nil) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }),
              let entryIndex = next.goals[goalIndex].progressEntries.firstIndex(where: { $0.id == progressID }) else { return }
        var entry = next.goals[goalIndex].progressEntries[entryIndex]
        if let date { entry.date = date }
        if let value { entry.value = value }
        if let kind { entry.kind = kind }
        if let note { entry.note = note }
        next.goals[goalIndex].progressEntries[entryIndex] = entry
        let now = RootineDate.isoTimestamp()
        next.goals[goalIndex].current = rootineGoalCurrentValue(next.goals[goalIndex])
        next.goals[goalIndex].updatedAt = now
        next.goals[goalIndex].history.append(GoalHistoryEntry(id: "history-\(progressID)-\(now)", type: .updated, label: "Zaktualizowano wpis postępu", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func deleteGoalProgress(id: String, progressID: String) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }) else { return }
        next.goals[goalIndex].progressEntries.removeAll { $0.id == progressID }
        let now = RootineDate.isoTimestamp()
        next.goals[goalIndex].current = rootineGoalCurrentValue(next.goals[goalIndex])
        next.goals[goalIndex].updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func deleteGoal(id: String) async {
        var next = goalsWorkspace
        next.goals.removeAll { $0.id == id }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func archiveGoal(id: String) async {
        await setGoalStatus(id: id, status: .archived)
    }

    func restoreArchivedGoal(id: String) async {
        await setGoalStatus(id: id, status: .active)
    }

    func setGoalStatus(id: String, status: GoalStatus) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        guard next.goals[index].status != status else { return }
        let old = next.goals[index].status.rawValue
        next.goals[index].status = status
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-status-\(now)", type: status == .paused ? .paused : status == .active && old == GoalStatus.paused.rawValue ? .resumed : .statusChanged, label: "Zmieniono status", detail: "\(old) → \(status.rawValue)", createdAt: now))
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
        next.goals[index].targetValue = max(1, target)
        next.goals[index].current = min(rootineGoalCurrentValue(next.goals[index]), next.goals[index].target)
        next.goals[index].icon = icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "target" : icon
        next.goals[index].iconKey = next.goals[index].icon
        let now = RootineDate.isoTimestamp()
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-updated-\(now)", type: .updated, label: "Zaktualizowano cel", createdAt: now))
        next.updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func updateGoalTarget(id: String, targetValue: Double, unit: String? = nil) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        next.goals[index].targetValue = max(0, targetValue)
        next.goals[index].target = max(1, targetValue)
        if let unit { next.goals[index].unit = unit }
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-target-\(now)", type: .updated, label: "Zmieniono wartość docelową", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func updateGoal(
        id: String,
        title: String,
        description: String,
        categoryId: String,
        status: GoalStatus,
        priority: GoalPriority,
        startDate: String,
        dueDate: String,
        progressMode: GoalProgressMode,
        targetValue: Double,
        unit: String,
        note: String
    ) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        guard next.categories.contains(where: { $0.id == categoryId }) else { return }
        next.goals[index].title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.goals[index].title.isEmpty else { return }
        next.goals[index].detail = description.trimmingCharacters(in: .whitespacesAndNewlines)
        next.goals[index].categoryId = categoryId
        next.goals[index].status = status
        next.goals[index].priority = priority
        next.goals[index].startDate = normalizedGoalStartDate(startDate)
        next.goals[index].dueDate = normalizedGoalDueDate(startDate: startDate, dueDate: dueDate)
        next.goals[index].progressMode = progressMode
        next.goals[index].target = max(1, targetValue)
        next.goals[index].targetValue = max(0, targetValue)
        next.goals[index].unit = unit
        next.goals[index].note = note
        next.goals[index].current = rootineGoalCurrentValue(next.goals[index])
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-full-update-\(now)", type: .updated, label: "Zaktualizowano cel", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func updateGoalDeadline(id: String, startDate: String? = nil, dueDate: String) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        let oldDate = next.goals[index].dueDate
        let start = startDate ?? next.goals[index].startDate
        next.goals[index].startDate = normalizedGoalStartDate(start)
        next.goals[index].dueDate = normalizedGoalDueDate(startDate: start, dueDate: dueDate)
        next.goals[index].updatedAt = now
        next.goals[index].history.append(GoalHistoryEntry(id: "history-\(id)-deadline-\(now)", type: .deadlineChanged, label: "Zmieniono termin", detail: "\(oldDate) → \(next.goals[index].dueDate)", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func updateGoalCategory(id: String, categoryId: String) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }),
              next.categories.contains(where: { $0.id == categoryId }) else { return }
        let now = RootineDate.isoTimestamp()
        next.goals[goalIndex].categoryId = categoryId
        next.goals[goalIndex].updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func addGoalMilestone(id: String, title: String, dueDate: String, note: String = "", weight: Double = 1, linkedTaskIds: [Int] = [], operationID: String = UUID().uuidString) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }), !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let milestoneID = RootineLocalIdentifier.string(namespace: "goal-milestone", operationID: operationID)
        guard !next.goals[goalIndex].milestones.contains(where: { $0.id == milestoneID }) else { return }
        let now = RootineDate.isoTimestamp()
        next.goals[goalIndex].milestones.append(GoalMilestone(id: milestoneID, title: title.trimmingCharacters(in: .whitespacesAndNewlines), note: note, dueDate: dueDate, weight: max(0.01, weight), order: next.goals[goalIndex].milestones.count, linkedTaskIds: linkedTaskIds))
        next.goals[goalIndex].updatedAt = now
        next.goals[goalIndex].history.append(GoalHistoryEntry(id: "history-\(milestoneID)", type: .stageAdded, label: "Dodano etap", detail: title, createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func updateGoalMilestone(
        id: String,
        milestoneID: String,
        title: String? = nil,
        dueDate: String? = nil,
        note: String? = nil,
        weight: Double? = nil,
        done: Bool? = nil,
        order: Int? = nil,
        isNext: Bool? = nil,
        linkedTaskIds: [Int]? = nil
    ) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }), let milestoneIndex = next.goals[goalIndex].milestones.firstIndex(where: { $0.id == milestoneID }) else { return }
        let now = RootineDate.isoTimestamp()
        var milestone = next.goals[goalIndex].milestones[milestoneIndex]
        if let title { milestone.title = title.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let dueDate { milestone.dueDate = dueDate }
        if let note { milestone.note = note }
        if let weight { milestone.weight = max(0.01, weight) }
        if let done {
            milestone.done = done
            milestone.completedAt = done ? now : nil
        }
        if let order { milestone.order = max(0, order) }
        if let isNext {
            milestone.isNext = isNext
            if isNext {
                for index in next.goals[goalIndex].milestones.indices {
                    next.goals[goalIndex].milestones[index].isNext = index == milestoneIndex
                }
            }
        }
        if let linkedTaskIds { milestone.linkedTaskIds = linkedTaskIds }
        next.goals[goalIndex].milestones[milestoneIndex] = milestone
        next.goals[goalIndex].current = rootineGoalCurrentValue(next.goals[goalIndex])
        next.goals[goalIndex].updatedAt = now
        next.goals[goalIndex].history.append(GoalHistoryEntry(id: "history-\(milestoneID)-\(now)", type: done == true ? .stageCompleted : .updated, label: done == true ? "Ukończono etap" : "Zaktualizowano etap", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func setGoalMilestoneDone(id: String, milestoneID: String, done: Bool) async {
        await updateGoalMilestone(id: id, milestoneID: milestoneID, done: done)
    }

    func reorderGoalMilestones(id: String, sourceID: String, targetID: String) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }), sourceID != targetID else { return }
        var ordered = next.goals[goalIndex].milestones.sorted { lhs, rhs in
            let leftOrder = lhs.order ?? 0
            let rightOrder = rhs.order ?? 0
            if leftOrder != rightOrder { return leftOrder < rightOrder }
            return lhs.id < rhs.id
        }
        guard let sourceIndex = ordered.firstIndex(where: { $0.id == sourceID }),
              let targetIndex = ordered.firstIndex(where: { $0.id == targetID }) else { return }
        let source = ordered.remove(at: sourceIndex)
        ordered.insert(source, at: min(targetIndex, ordered.count))
        let now = RootineDate.isoTimestamp()
        next.goals[goalIndex].milestones = ordered.enumerated().map { index, milestone in
            var result = milestone
            result.order = index
            return result
        }
        next.goals[goalIndex].updatedAt = now
        next.goals[goalIndex].history.append(GoalHistoryEntry(id: "history-\(id)-reorder-\(now)", type: .updated, label: "Zmieniono kolejność etapów", createdAt: now))
        await persistGoalsWorkspace(next)
    }

    func reorderMilestones(id: String, sourceID: String, targetID: String) async {
        await reorderGoalMilestones(id: id, sourceID: sourceID, targetID: targetID)
    }

    func addGoalHistory(id: String, type: GoalHistoryEntry.EntryType = .updated, label: String, detail: String? = nil, operationID: String = UUID().uuidString) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp()
        let entry = GoalHistoryEntry(id: RootineLocalIdentifier.string(namespace: "goal-history", operationID: operationID), type: type, label: label, detail: detail, createdAt: now)
        guard !next.goals[goalIndex].history.contains(where: { $0.id == entry.id }) else { return }
        next.goals[goalIndex].history.append(entry)
        next.goals[goalIndex].updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func deleteGoalHistory(id: String, historyID: String) async {
        var next = goalsWorkspace
        guard let goalIndex = next.goals.firstIndex(where: { $0.id == id }) else { return }
        next.goals[goalIndex].history.removeAll { $0.id == historyID }
        next.goals[goalIndex].updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func deleteGoalMilestone(id: String, milestoneID: String) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        next.goals[index].milestones.removeAll { $0.id == milestoneID }
        let now = RootineDate.isoTimestamp()
        next.goals[index].updatedAt = now
        await persistGoalsWorkspace(next)
    }

    func linkGoalTask(id: String, taskID: Int) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }), !next.goals[index].linkedTaskIds.contains(taskID) else { return }
        next.goals[index].linkedTaskIds.append(taskID)
        next.goals[index].updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    func unlinkGoalTask(id: String, taskID: Int) async {
        var next = goalsWorkspace
        guard let index = next.goals.firstIndex(where: { $0.id == id }) else { return }
        next.goals[index].linkedTaskIds.removeAll { $0 == taskID }
        next.goals[index].updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    @discardableResult
    func addGoalCategory(label: String, color: String = "#7FA6C9", iconKey: String = "circle", operationID: String = UUID().uuidString) async -> String? {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let id = RootineLocalIdentifier.string(namespace: "goal-category", operationID: operationID)
        guard !goalsWorkspace.categories.contains(where: { $0.id == id }) else { return id }
        var next = goalsWorkspace
        next.categories.append(GoalCategory(id: id, label: trimmed, color: color, iconKey: iconKey))
        await persistGoalsWorkspace(next)
        return id
    }

    func updateGoalCategory(id: String, label: String, color: String, iconKey: String) async {
        var next = goalsWorkspace
        guard let index = next.categories.firstIndex(where: { $0.id == id }) else { return }
        next.categories[index] = GoalCategory(id: id, label: label.trimmingCharacters(in: .whitespacesAndNewlines), color: color, iconKey: iconKey)
        await persistGoalsWorkspace(next)
    }

    func deleteGoalCategory(id: String) async {
        guard id != "personal" else { return }
        var next = goalsWorkspace
        next.categories.removeAll { $0.id == id }
        next.goals = next.goals.map { goal in
            guard goal.categoryId == id else { return goal }
            var updated = goal
            updated.categoryId = "personal"
            return updated
        }
        await persistGoalsWorkspace(next)
    }

    func restoreGoal(_ goal: GoalRecord) async {
        var next = goalsWorkspace
        guard !next.goals.contains(where: { $0.id == goal.id }) else { return }
        next.goals.append(goal)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistGoalsWorkspace(next)
    }

    // MARK: Work projects and items

    func addWorkCompany(
        name: String,
        description: String = "",
        website: String? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        let id = RootineLocalIdentifier.string(namespace: "work-company", operationID: operationID)
        guard creationGate.claim("work-company|\(id)") else { return }
        defer { creationGate.release("work-company|\(id)") }
        var next = workWorkspace
        guard !next.companies.contains(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp(nowProvider())
        next.companies.append(WorkCompany(
            id: id,
            name: trimmedName,
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            color: "",
            website: website?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty,
            archived: false,
            createdAt: now,
            updatedAt: now
        ))
        await persistWorkWorkspace(next)
    }

    func updateWorkCompany(id: String, name: String, description: String = "", website: String? = nil) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        var next = workWorkspace
        guard let index = next.companies.firstIndex(where: { $0.id == id }) else { return }
        next.companies[index].name = trimmedName
        next.companies[index].description = description.trimmingCharacters(in: .whitespacesAndNewlines)
        next.companies[index].website = website?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        next.companies[index].updatedAt = RootineDate.isoTimestamp(nowProvider())
        await persistWorkWorkspace(next)
    }

    func deleteWorkCompany(id: String) async {
        var next = workWorkspace
        guard next.companies.contains(where: { $0.id == id }) else { return }
        let projectIDs = Set(next.projects.filter { $0.companyId == id }.map(\.id))
        let taskIDs = Set(next.tasks.filter { ($0.companyId == id) || ($0.projectId.map(projectIDs.contains) == true) }.map(\.id))
        next.companies.removeAll { $0.id == id }
        next.projects.removeAll { projectIDs.contains($0.id) }
        next.tasks.removeAll { taskIDs.contains($0.id) }
        next.focusSessions.removeAll { session in
            session.projectId.map(projectIDs.contains) == true || session.taskId.map(taskIDs.contains) == true
        }
        await persistWorkWorkspace(next)
    }

    func addWorkProject(
        name: String,
        companyID: String? = nil,
        description: String = "",
        startDate: String? = nil,
        endDate: String? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        let normalizedCompany = companyID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        guard normalizedCompany == nil || workWorkspace.companies.contains(where: { $0.id == normalizedCompany }) else { return }
        guard validWorkDateRange(startDate: startDate, endDate: endDate) else { return }
        let id = RootineLocalIdentifier.string(namespace: "work-project", operationID: operationID)
        guard creationGate.claim("work-project|\(id)") else { return }
        defer { creationGate.release("work-project|\(id)") }
        var next = workWorkspace
        guard !next.projects.contains(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp(nowProvider())
        next.projects.append(WorkProject(
            id: id,
            companyId: normalizedCompany,
            name: trimmedName,
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            status: .active,
            startDate: startDate?.rootineTrimmedNonEmpty,
            endDate: endDate?.rootineTrimmedNonEmpty,
            note: nil,
            createdAt: now,
            updatedAt: now
        ))
        await persistWorkWorkspace(next)
    }

    func updateWorkProject(
        id: String,
        name: String,
        companyID: String? = nil,
        description: String = "",
        status: WorkProjectStatus = .active,
        startDate: String? = nil,
        endDate: String? = nil,
        note: String? = nil
    ) async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCompany = companyID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        guard !trimmedName.isEmpty,
              validWorkDateRange(startDate: startDate, endDate: endDate),
              normalizedCompany == nil || workWorkspace.companies.contains(where: { $0.id == normalizedCompany }) else { return }
        var next = workWorkspace
        guard let index = next.projects.firstIndex(where: { $0.id == id }) else { return }
        next.projects[index].name = trimmedName
        next.projects[index].companyId = normalizedCompany
        next.projects[index].description = description.trimmingCharacters(in: .whitespacesAndNewlines)
        next.projects[index].status = status
        next.projects[index].startDate = startDate?.rootineTrimmedNonEmpty
        next.projects[index].endDate = endDate?.rootineTrimmedNonEmpty
        next.projects[index].note = note?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        next.projects[index].updatedAt = RootineDate.isoTimestamp(nowProvider())
        await persistWorkWorkspace(next)
    }

    func deleteWorkProject(id: String) async {
        var next = workWorkspace
        guard next.projects.contains(where: { $0.id == id }) else { return }
        let taskIDs = Set(next.tasks.filter { $0.projectId == id }.map(\.id))
        next.projects.removeAll { $0.id == id }
        next.tasks.removeAll { taskIDs.contains($0.id) }
        next.focusSessions.removeAll { $0.projectId == id || ( $0.taskId.map(taskIDs.contains) == true) }
        await persistWorkWorkspace(next)
    }

    func addWorkItem(
        title: String,
        projectID: String? = nil,
        companyID: String? = nil,
        parentID: String? = nil,
        priority: WorkItemPriority = .none,
        status: WorkItemStatus = .todo,
        dueDate: String? = nil,
        dueTime: String? = nil,
        note: String? = nil,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty,
              validWorkDate(dueDate), validWorkTime(dueTime) else { return }
        let normalizedProject = projectID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        let normalizedCompany = companyID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        guard normalizedProject == nil || workWorkspace.projects.contains(where: { $0.id == normalizedProject }) else { return }
        guard normalizedCompany == nil || workWorkspace.companies.contains(where: { $0.id == normalizedCompany }) else { return }
        guard validWorkParent(parentID, projectID: normalizedProject, workspace: workWorkspace) else { return }
        let id = RootineLocalIdentifier.string(namespace: "work-task", operationID: operationID)
        guard creationGate.claim("work-task|\(id)") else { return }
        defer { creationGate.release("work-task|\(id)") }
        var next = workWorkspace
        guard !next.tasks.contains(where: { $0.id == id }) else { return }
        let now = RootineDate.isoTimestamp(nowProvider())
        let resolvedStatus = status == .completed ? .completed : status
        next.tasks.append(WorkItem(
            id: id,
            companyId: normalizedCompany ?? normalizedProject.flatMap { projectID in next.projects.first(where: { $0.id == projectID })?.companyId },
            projectId: normalizedProject,
            parentId: parentID?.rootineTrimmedNonEmpty,
            title: trimmedTitle,
            completed: resolvedStatus == .completed,
            status: resolvedStatus,
            priority: priority,
            startDate: nil,
            dueDate: dueDate?.rootineTrimmedNonEmpty,
            dueTime: dueTime?.rootineTrimmedNonEmpty,
            note: note?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty,
            createdAt: now,
            updatedAt: now
        ))
        await persistWorkWorkspace(next)
    }

    func updateWorkItem(
        id: String,
        title: String,
        priority: WorkItemPriority? = nil,
        status: WorkItemStatus? = nil,
        projectID: String? = nil,
        companyID: String? = nil,
        parentID: String? = nil,
        dueDate: String? = nil,
        dueTime: String? = nil,
        note: String? = nil
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProject = projectID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        let normalizedCompany = companyID?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        guard !trimmedTitle.isEmpty,
              validWorkDate(dueDate), validWorkTime(dueTime) else { return }
        var next = workWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id }),
              normalizedProject == nil || next.projects.contains(where: { $0.id == normalizedProject }),
              normalizedCompany == nil || next.companies.contains(where: { $0.id == normalizedCompany }),
              validWorkParent(parentID, projectID: normalizedProject, workspace: next, childID: id) else { return }
        next.tasks[index].title = trimmedTitle
        next.tasks[index].projectId = normalizedProject
        next.tasks[index].companyId = normalizedCompany ?? normalizedProject.flatMap { projectID in next.projects.first(where: { $0.id == projectID })?.companyId }
        next.tasks[index].parentId = normalizedProject == nil ? nil : parentID?.rootineTrimmedNonEmpty
        if let priority { next.tasks[index].priority = priority }
        if let status {
            next.tasks[index].status = status
            next.tasks[index].completed = status == .completed
        }
        next.tasks[index].dueDate = dueDate?.rootineTrimmedNonEmpty
        next.tasks[index].dueTime = dueTime?.rootineTrimmedNonEmpty
        next.tasks[index].note = note?.trimmingCharacters(in: .whitespacesAndNewlines).rootineTrimmedNonEmpty
        next.tasks[index].updatedAt = RootineDate.isoTimestamp(nowProvider())
        await persistWorkWorkspace(next)
    }

    func toggleWorkItemCompletion(id: String) async {
        var next = workWorkspace
        guard let index = next.tasks.firstIndex(where: { $0.id == id }) else { return }
        let completed = !next.tasks[index].completed
        next.tasks[index].completed = completed
        next.tasks[index].status = completed ? .completed : .todo
        next.tasks[index].updatedAt = RootineDate.isoTimestamp(nowProvider())
        await persistWorkWorkspace(next)
    }

    func deleteWorkItem(id: String) async {
        var next = workWorkspace
        var branch: Set<String> = [id]
        var didAddDescendant = true
        while didAddDescendant {
            didAddDescendant = false
            for task in next.tasks where task.parentId.map(branch.contains) == true {
                if branch.insert(task.id).inserted { didAddDescendant = true }
            }
        }
        guard !branch.isEmpty else { return }
        next.tasks.removeAll { branch.contains($0.id) }
        next.focusSessions.removeAll { session in session.taskId.map(branch.contains) == true }
        await persistWorkWorkspace(next)
    }

    private func validWorkDate(_ value: String?) -> Bool {
        guard let value = value?.rootineTrimmedNonEmpty else { return true }
        return workDate(from: value) != nil
    }

    private func validWorkDateRange(startDate: String?, endDate: String?) -> Bool {
        guard validWorkDate(startDate), validWorkDate(endDate) else { return false }
        guard let start = startDate?.rootineTrimmedNonEmpty,
              let end = endDate?.rootineTrimmedNonEmpty else { return true }
        return start <= end
    }

    private func validWorkTime(_ value: String?) -> Bool {
        guard let value = value?.rootineTrimmedNonEmpty else { return true }
        return value.range(of: "^([01]\\d|2[0-3]):[0-5]\\d$", options: .regularExpression) != nil
    }

    private func workDate(from value: String) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        let calendar = Calendar(identifier: .gregorian)
        guard parts.count == 3,
              String(format: "%04d-%02d-%02d", parts[0], parts[1], parts[2]) == value,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              calendar.component(.year, from: date) == parts[0],
              calendar.component(.month, from: date) == parts[1],
              calendar.component(.day, from: date) == parts[2] else { return nil }
        return date
    }

    private func validWorkParent(_ parentID: String?, projectID: String?, workspace: WorkWorkspace, childID: String? = nil) -> Bool {
        guard let parentID = parentID?.rootineTrimmedNonEmpty else { return true }
        guard childID?.rootineNormalizedIdentifier != parentID.rootineNormalizedIdentifier else { return false }
        guard let parent = workspace.tasks.first(where: { $0.id == parentID }), parent.projectId == projectID else { return false }
        var seen = Set<String>(); var current: WorkItem? = parent
        while let item = current, let nextID = item.parentId {
            guard seen.insert(item.id).inserted, nextID != parentID else { return false }
            current = workspace.tasks.first(where: { $0.id == nextID })
        }
        return true
    }

    // MARK: Focus timer

    func startFocusSession(projectID: String? = nil, taskID: String? = nil, now: Date? = nil) async {
        guard workWorkspace.activeFocusStartedAt == nil else { return }
        let normalizedProject = projectID?.rootineTrimmedNonEmpty
        let normalizedTask = taskID?.rootineTrimmedNonEmpty
        let task = normalizedTask.flatMap { taskID in
            workWorkspace.tasks.first(where: { $0.id == taskID })
        }
        let resolvedProject = normalizedProject ?? task?.projectId
        guard resolvedProject == nil || workWorkspace.projects.contains(where: { $0.id == resolvedProject }),
              normalizedTask == nil || task != nil,
              normalizedTask == nil || task?.projectId == resolvedProject else { return }
        var next = workWorkspace
        let startedAt = now ?? nowProvider()
        next.activeFocusStartedAt = RootineDate.isoTimestamp(startedAt)
        next.activeFocusProjectID = resolvedProject
        next.activeFocusTaskID = normalizedTask
        next.pausedFocusSessionID = nil
        next.updatedAt = RootineDate.isoTimestamp(startedAt)
        await persistWorkWorkspace(next)
    }

    func stopFocusSession(now: Date? = nil) async {
        guard let startedAt = workWorkspace.activeFocusStartedAt,
              let startDate = RootineDate.date(from: startedAt) else {
            if workWorkspace.pausedFocusSessionID != nil {
                var next = workWorkspace
                next.pausedFocusSessionID = nil
                next.updatedAt = RootineDate.isoTimestamp(now ?? nowProvider())
                await persistWorkWorkspace(next)
                return
            }
            await resetFocusSession(message: "Uszkodzona sesja skupienia została przeniesiona do stanu odzyskiwania")
            return
        }
        await finishFocusSegment(startDate: startDate, startedAt: startedAt, now: now, paused: false)
    }

    /// Pausing closes the current elapsed segment but keeps a durable marker
    /// pointing at it. A later resume starts a new segment, so a crash or
    /// device hand-off cannot double-count the interval before the pause.
    func pauseFocusSession(now: Date? = nil) async {
        guard let startedAt = workWorkspace.activeFocusStartedAt,
              let startDate = RootineDate.date(from: startedAt) else { return }
        await finishFocusSegment(startDate: startDate, startedAt: startedAt, now: now, paused: true)
    }

    func resumeFocusSession(now: Date? = nil) async {
        guard workWorkspace.activeFocusStartedAt == nil,
              workWorkspace.pausedFocusSessionID != nil else { return }
        var next = workWorkspace
        let startedAt = now ?? nowProvider()
        next.activeFocusStartedAt = RootineDate.isoTimestamp(startedAt)
        if let pausedID = next.pausedFocusSessionID,
           let paused = next.focusSessions.first(where: { $0.id == pausedID }) {
            next.activeFocusProjectID = paused.projectId
            next.activeFocusTaskID = paused.taskId
        }
        next.pausedFocusSessionID = nil
        next.updatedAt = RootineDate.isoTimestamp(startedAt)
        await persistWorkWorkspace(next)
    }

    private func finishFocusSegment(startDate: Date, startedAt: String, now: Date?, paused: Bool) async {
        var next = workWorkspace
        let nowDate = max(now ?? nowProvider(), startDate)
        let minutes = max(1, Int(nowDate.timeIntervalSince(startDate) / 60))
        let sessionID = RootineLocalIdentifier.string(namespace: "focus", operationID: startedAt)
        next.focusSessions.removeAll { $0.id == sessionID }
        next.focusSessions.insert(WorkFocusSession(
            id: sessionID,
            startedAt: startedAt,
            endedAt: RootineDate.isoTimestamp(nowDate),
            minutes: minutes,
            projectId: next.activeFocusProjectID,
            taskId: next.activeFocusTaskID
        ), at: 0)
        next.activeFocusStartedAt = nil
        next.activeFocusProjectID = nil
        next.activeFocusTaskID = nil
        next.pausedFocusSessionID = paused ? sessionID : nil
        next.updatedAt = RootineDate.isoTimestamp(nowDate)
        await persistWorkWorkspace(next)
    }

    /// Foreground recovery validates the persisted marker without stopping a
    /// session merely because the process was suspended in the background.
    func recoverFocusSession(now: Date? = nil) async {
        guard let startedAt = workWorkspace.activeFocusStartedAt else { return }
        guard let startDate = RootineDate.date(from: startedAt) else {
            await resetFocusSession(message: "Uszkodzona sesja skupienia została przeniesiona do stanu odzyskiwania")
            return
        }
        if startDate > (now ?? nowProvider()) {
            await resetFocusSession(message: "Sesja skupienia miała nieprawidłowy czas rozpoczęcia i została wyczyszczona")
        }
    }

    /// Clears an invalid or abandoned focus timestamp without fabricating a
    /// completed session. This is intentionally separate from `stop` so the
    /// UI can offer a safe recovery action when decoding fails.
    func resetFocusSession(message: String = "Sesja skupienia wyczyszczona") async {
        guard workWorkspace.activeFocusStartedAt != nil else { return }
        var next = workWorkspace
        next.activeFocusStartedAt = nil
        next.activeFocusProjectID = nil
        next.activeFocusTaskID = nil
        next.pausedFocusSessionID = nil
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
        next.trips[index].name = trimmedDestination
        next.trips[index].dateRange = dateRange.trimmingCharacters(in: .whitespacesAndNewlines)
        let pieces = next.trips[index].dateRange
            .components(separatedBy: "–")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if pieces.count == 2,
           RootineDate.isLocalDateKey(pieces[0]),
           RootineDate.isLocalDateKey(pieces[1]) {
            next.trips[index].startDate = pieces[0]
            next.trips[index].endDate = pieces[1]
        }
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

    private func updateTravelTrip(id: String, mutate: (inout TravelRecord) -> Void) async {
        var next = travelWorkspace
        guard let index = next.trips.firstIndex(where: { $0.id == id }) else { return }
        mutate(&next.trips[index])
        next.trips[index].updatedAt = RootineDate.isoTimestamp()
        next.updatedAt = RootineDate.isoTimestamp()
        await persistTravelWorkspace(next)
    }

    func setTravelStatus(_ status: String, tripID: String) async {
        let allowed = ["idea", "planning", "ready", "completed"]
        guard allowed.contains(status) else { return }
        await updateTravelTrip(id: tripID) { $0.status = status }
    }

    func addTravelPackingItem(
        tripID: String,
        label: String,
        quantity: Int = 1,
        packed: Bool = false,
        operationID: String = UUID().uuidString
    ) async {
        let cleanLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanLabel.isEmpty, quantity > 0 else { return }
        let itemID = RootineLocalIdentifier.string(namespace: "travel-packing", operationID: "\(tripID):\(operationID)")
        await updateTravelTrip(id: tripID) { trip in
            guard !trip.packingItems.contains(where: { $0.id == itemID }) else { return }
            trip.packingItems.append(TravelPackingItem(id: itemID, label: cleanLabel, quantity: quantity, packed: packed))
        }
    }

    func setHealthEnergy(_ energy: Int, date: Date = Date()) async {
        guard (1...4).contains(energy) else { return }
        let key = RootineDate.localDate(date)
        await updateHealthCheckIn(
            date: key,
            energy: energy,
            note: healthWorkspace.checkIns[key]?.note
        )
    }

    /// Creates or replaces a check-in for a specific local day. The explicit
    /// date overload is used by history editing and keeps offline mutations
    /// deterministic instead of relying on a wall-clock timestamp.
    func updateHealthCheckIn(date: String, energy: Int, note: String?) async {
        let key = date.trimmingCharacters(in: .whitespacesAndNewlines)
        guard rootineHealthLocalDateIsValid(key), (1...4).contains(energy) else { return }
        var next = healthWorkspace
        let now = RootineDate.isoTimestamp()
        let normalizedNote = note.map {
            String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        }.flatMap { $0.isEmpty ? nil : $0 }
        next.checkIns[key] = HealthCheckIn(date: key, energy: energy, note: normalizedNote, updatedAt: now)
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
            next.reminders[index].completedDates = Array(Set(next.reminders[index].completedDates)).sorted()
        }
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func addHealthReminder(
        title: String,
        detail: String,
        operationID: String = UUID().uuidString
    ) async {
        let trimmedTitle = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard !trimmedTitle.isEmpty else { return }
        let trimmedDetail = String(detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        let normalizedOperationID = operationID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedOperationID.isEmpty else { return }
        let creationFingerprint = "health-reminder|\(trimmedTitle)|\(trimmedDetail)|\(normalizedOperationID)"
        guard creationGate.claim(creationFingerprint) else { return }
        defer { creationGate.release(creationFingerprint) }
        var next = healthWorkspace
        let recordID = RootineLocalIdentifier.string(namespace: "health-reminder", operationID: normalizedOperationID)
        guard !next.reminders.contains(where: { $0.id == recordID }) else { return }
        next.reminders.append(HealthReminder(id: recordID, title: trimmedTitle, detail: trimmedDetail, completedDates: []))
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
        let trimmedTitle = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        guard !trimmedTitle.isEmpty else { return }
        next.reminders[index].title = trimmedTitle
        next.reminders[index].detail = String(detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func restoreHealthReminder(_ reminder: HealthReminder) async {
        var next = healthWorkspace
        let restored = rootineSanitizedHealthWorkspace(
            HealthWorkspace(version: 1, updatedAt: next.updatedAt, checkIns: [:], reminders: [reminder])
        ).reminders.first
        guard let restored, !next.reminders.contains(where: { $0.id == restored.id }) else { return }
        next.reminders.append(restored)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func deleteHealthCheckIn(date: String) async {
        let key = date.trimmingCharacters(in: .whitespacesAndNewlines)
        guard rootineHealthLocalDateIsValid(key), healthWorkspace.checkIns[key] != nil else { return }
        var next = healthWorkspace
        next.checkIns.removeValue(forKey: key)
        next.updatedAt = RootineDate.isoTimestamp()
        await persistHealthWorkspace(next)
    }

    func restoreHealthCheckIn(_ checkIn: HealthCheckIn) async {
        guard rootineHealthCheckInIsValid(checkIn) else { return }
        var next = healthWorkspace
        guard next.checkIns[checkIn.date] == nil else { return }
        next.checkIns[checkIn.date] = checkIn
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
        guard !normalized.isEmpty else {
            RootineObservability.shared.recordQR(outcome: .failure, format: "barcode", error: "invalid barcode")
            return nil
        }
        let lookupFingerprint = "nutrition-barcode-lookup|\(normalized)"
        guard creationGate.claim(lookupFingerprint) else { return nil }
        defer { creationGate.release(lookupFingerprint) }
        await enqueueNutritionBarcode(normalized)
        if let resolved = nutritionWorkspace.pendingBarcodeLookups?
            .first(where: { $0.id == NutritionBarcode.requestID(for: normalized) })?
            .resolvedProduct {
            return resolved
        }
        if let cached = nutritionProductCache[normalized] {
            // Reattach a cache hit to an existing pending request so the UI
            // can offer the same durable "Dodaj" action after a relaunch.
            await storeNutritionBarcodeResult(normalized, product: cached)
            return cached
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
        } catch RootineAPIError.server(status: 404) {
            // A definitive miss is not retriable. Keep the manual entry path
            // useful and avoid retrying an unknown product forever.
            await discardNutritionBarcode(normalized)
            foundationMessage = "Nie znaleziono produktu dla tego kodu. Możesz uzupełnić dane ręcznie."
            return nil
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
        nutritionProductCache[normalized] = product
        await persistNutritionProductCache()
    }

    private func discardNutritionBarcode(_ barcode: String) async {
        let normalized = NutritionBarcode.normalized(barcode)
        guard !normalized.isEmpty else { return }
        var next = nutritionWorkspace
        var pending = normalizedNutritionBarcodeRequests(next.pendingBarcodeLookups ?? [])
        pending.removeAll { $0.id == NutritionBarcode.requestID(for: normalized) }
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
        var next = rootineNormalizedTaskWorkspace(value)
        next.updatedAt = RootineDate.isoTimestamp()
        guard (try? RootineTaskDomain.validate(next)) != nil else {
            foundationMessage = "Nieprawidłowe dane zadania — zapis odrzucony"
            return
        }
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

    /// Bulk Today actions need an explicit persistence outcome so a failed
    /// local write or queue preparation cannot be presented as a successful
    /// move. The legacy task editor keeps its local-first behavior above.
    @discardableResult
    private func persistTaskWorkspaceOutcome(_ value: TaskWorkspace) async -> RootineTaskPersistenceOutcome {
        guard await beginWorkspacePersistence() else {
            return .failed("Nie można zapisać zmian podczas importu danych.")
        }
        defer { endWorkspacePersistence() }

        var next = rootineNormalizedTaskWorkspace(value)
        next.updatedAt = RootineDate.isoTimestamp()
        guard (try? RootineTaskDomain.validate(next)) != nil else {
            foundationMessage = "Nieprawidłowe dane zadania — zapis odrzucony"
            return .failed("Nieprawidłowe dane zadania — zapis odrzucony")
        }

        // Persist before publishing. If the filesystem or queue rejects the
        // write, the caller receives an error and the old workspace remains
        // authoritative.
        guard let store else {
            taskWorkspace = next
            workspaceSyncStatus = .localOnly(pending: 0)
            await reconcileLocalNotifications()
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return .queuedOffline
        }

        let receipt: WorkspaceWriteReceipt
        do {
            receipt = try await store.saveWithReceipt(next, key: .tasks)
        } catch {
            foundationMessage = "Nie udało się zapisać zmian lokalnie"
            return .failed("Nie udało się zapisać zmian lokalnie.")
        }

        guard let syncEngine else {
            taskWorkspace = next
            workspaceSyncStatus = .localOnly(pending: 0)
            await reconcileLocalNotifications()
            foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
            return .queuedOffline
        }

        do {
            try await syncEngine.enqueue(next, key: .tasks)
        } catch {
            // A receipt lets us remove an unqueueable local snapshot, so the
            // UI never reports a move that cannot be retried safely.
            let didRollback = (try? await store.undo(receipt)) == true
            if !didRollback {
                // A concurrent writer may have superseded the receipt. Keep
                // the local projection and report it as pending rather than
                // claiming that the operation was discarded while leaving a
                // moved snapshot on disk.
                taskWorkspace = next
                let pending = (try? await syncEngine.pendingMutationCount()) ?? 0
                workspaceSyncStatus = .localOnly(pending: pending)
                await reconcileLocalNotifications()
                foundationMessage = "Zapisano lokalnie — synchronizacja czeka na ponowienie"
                return .queuedOffline
            }
            foundationMessage = "Nie udało się przygotować synchronizacji — zmian nie zastosowano"
            return .failed("Nie udało się przygotować synchronizacji — zmian nie zastosowano.")
        }

        taskWorkspace = next
        // Schedule from the just-published local aggregate before attempting
        // the network flush. This keeps reminders working while offline and
        // ensures an edit/completion/delete invalidates its old occurrence.
        await reconcileLocalNotifications()
        await markLocalOnly()
        await flushPendingMutations()
        switch workspaceSyncStatus {
        case .synced:
            return .synced
        case .conflict:
            return .conflict
        case .unavailable, .localOnly, .syncing, .schemaMismatch, .unauthorized, .error:
            // Local-first writes remain valid when the remote is unavailable,
            // but callers must present that state as pending rather than as a
            // successful server-side move.
            return .queuedOffline
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

    private func persistNutritionProductCache() async {
        guard let store else { return }
        // Stable ordering makes the file deterministic and keeps the cache
        // bounded without introducing a second timestamp contract.
        let products = nutritionProductCache
            .sorted { $0.key < $1.key }
            .suffix(128)
            .map(\.value)
        try? await store.save(NutritionProductCache(products: products), key: .nutritionProductCache)
    }

    private func persistNotesWorkspace(_ value: NotesWorkspace) async {
        let previous = notesWorkspace
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
            let mapped = try (canonicalShadows[.notes].map {
                try RootineCanonicalWorkspaceMapping.mergedNotesPayload(for: next, onto: $0)
            } ?? RootineCanonicalWorkspaceMapping.payload(for: next))
            try await store.save(next, key: .notes)
            canonicalShadows[.notes] = mapped
            try await store.save(mapped, key: .notesCanonicalShadow)
            if normalizedReadEnabled {
                let canUseNormalized = try await enqueueNormalizedNoteMutations(from: previous, to: next, payload: mapped, syncEngine: syncEngine)
                if canUseNormalized {
                    await flushPendingNormalizedCommands()
                } else {
                    // A full relational bootstrap may provide a document but
                    // no per-row revisions. CAS cannot safely update an
                    // existing note in that state, so retain aggregate
                    // compatibility until a pull supplies record revisions.
                    try await syncEngine.enqueue(payload: mapped, storageKey: RootineStorageKey.notes.rawValue)
                    await flushPendingMutations()
                }
            } else {
                try await syncEngine.enqueue(payload: mapped, storageKey: RootineStorageKey.notes.rawValue)
                await flushPendingMutations()
            }
        } catch {
            foundationMessage = "Zapisano lokalnie — synchronizacja spróbuje ponownie"
        }
    }

    private func enqueueNormalizedNoteMutations(
        from previous: NotesWorkspace,
        to next: NotesWorkspace,
        payload: JSONValue,
        syncEngine: WorkspaceSyncEngine
    ) async throws -> Bool {
        let key = RootineStorageKey.notes.rawValue
        let previousNotes = Dictionary(uniqueKeysWithValues: previous.notes.map { ($0.id, $0) })
        let nextNotes = Dictionary(uniqueKeysWithValues: next.notes.map { ($0.id, $0) })
        let previousLists = Dictionary(uniqueKeysWithValues: previous.lists.map { ($0.id, $0) })
        let nextLists = Dictionary(uniqueKeysWithValues: next.lists.map { ($0.id, $0) })

        func record(_ collection: String, id: String) -> JSONValue? {
            guard case .object(let root) = payload,
                  case .array(let values) = root[collection] else { return nil }
            return values.first { value in
                guard case .object(let object) = value,
                      case .string(let candidate) = object["id"] else { return false }
                return candidate == id
            }
        }

        func revision(for entity: String, id: String) -> Int64? {
            normalizedRecordRevisions["\(key)\u{1F}\(entity)\u{1F}\(id)"]
        }

        // Existing rows require a real per-record revision under B03's CAS.
        // New rows can safely use zero; aggregate compatibility handles a
        // bootstrap that only exposed a document/cursor revision.
        for id in Set(previousLists.keys).union(nextLists.keys) where previousLists[id] != nextLists[id] {
            if previousLists[id] != nil && revision(for: "notelist", id: id) == nil { return false }
        }
        for id in Set(previousNotes.keys).union(nextNotes.keys) where previousNotes[id] != nextNotes[id] {
            if previousNotes[id] != nil && revision(for: "note", id: id) == nil { return false }
        }

        func baseRevision(for entity: String, id: String) -> Int64 {
            revision(for: entity, id: id) ?? 0
        }

        for id in Set(previousLists.keys).union(nextLists.keys).sorted() {
            if let current = nextLists[id], current != previousLists[id], let value = record("lists", id: id) {
                _ = try await syncEngine.enqueueNormalizedCommand(
                    entity: "note_list",
                    entityID: id,
                    baseRevision: baseRevision(for: "notelist", id: id),
                    payload: value
                )
            } else if nextLists[id] == nil, previousLists[id] != nil {
                _ = try await syncEngine.enqueueNormalizedCommand(
                    entity: "note_list",
                    entityID: id,
                    kind: .delete,
                    baseRevision: baseRevision(for: "notelist", id: id),
                    payload: .null
                )
            }
        }

        for id in Set(previousNotes.keys).union(nextNotes.keys).sorted() {
            if let current = nextNotes[id], current != previousNotes[id], let value = record("notes", id: id) {
                _ = try await syncEngine.enqueueNormalizedCommand(
                    entity: "note",
                    entityID: id,
                    baseRevision: baseRevision(for: "note", id: id),
                    payload: value
                )
            } else if nextNotes[id] == nil, previousNotes[id] != nil {
                // `payload: .null` is intentional: the sync-v3 wire contract
                // omits payload for deletes, while PendingSyncCommand keeps a
                // JSONValue slot for one stable Codable shape.
                _ = try await syncEngine.enqueueNormalizedCommand(
                    entity: "note",
                    entityID: id,
                    kind: .delete,
                    baseRevision: baseRevision(for: "note", id: id),
                    payload: .null
                )
            }
        }

        return true
    }

    private func persistSportWorkspace(_ value: SportWorkspace) async {
        guard await beginWorkspacePersistence() else { return }
        defer { endWorkspacePersistence() }
        var next = value.normalizedForPersistence()
        next.updatedAt = RootineDate.isoTimestamp()
        guard (try? next.validate()) != nil else {
            foundationMessage = "Nieprawidłowe dane aktywności"
            return
        }
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
        guard rootineValidateTravelWorkspace(next).isEmpty else {
            foundationMessage = "Nie zapisano podróży — dane wymagają korekty"
            return
        }
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
        // Local-first is also valid before authentication is fully restored
        // (for example after an offline launch). Persist the compact native
        // snapshot and canonical shadow whenever a store exists; enqueue only
        // when a sync engine is available.
        guard let store else {
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
            guard let syncEngine else {
                foundationMessage = "Zapisano lokalnie — synchronizacja czeka na sesję"
                return
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
        // Affairs and Tasks v1 snapshots are normalized to v2 after decoding.
        // Other direct workspaces have no implicit migration path and must
        // match exactly.
        guard found == supported || ((key == .affairs || key == .tasks) && found == 1) else {
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
        normalizedRecordRevisions.removeAll()
        lastDeviceRegistrationFingerprint = nil
        deviceRegistration = nil
        let previousScheduler = localNotificationScheduler
        // Preferences are account-scoped. Never carry an opt-in or lock-screen
        // detail setting across an account switch before B08 has supplied the
        // new profile payload.
        profilePreferences = RootineProfilePreferencesStore.load(userID: userID)
            ?? .current
        notificationPreferences = RootineNotificationPreferencesStore.load(userID: userID)
            ?? RootineNotificationPreferences(timezoneIdentifier: profilePreferences.timezoneIdentifier)
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
        // The lifecycle coordinator is useful even when sync-v3 is not
        // configured yet: it keeps the local-first legacy transport and the
        // Realtime wake-up/fallback path under the same cancellation gates.
        let normalizedRemote = try? RootineSyncRemoteClient(configuration: configuration)
        let deviceID = syncDeviceIdentifier(for: userID)
        if let normalizedRemote {
            syncEngine = WorkspaceSyncEngine(
                store: userStore,
                remote: api,
                normalizedRemote: normalizedRemote,
                deviceID: deviceID,
                accountID: userID
            )
        } else {
            syncEngine = WorkspaceSyncEngine(store: userStore, remote: api)
        }

        realtimeRuntimeUserID = userID
        let runtimeGeneration = realtimeRuntimeGeneration

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
                    self?.handleRealtimeEvent(event, userID: userID, generation: runtimeGeneration)
                }
            },
            onStatus: { [weak self] status in
                Task { @MainActor [weak self] in
                    self?.handleRealtimeStatus(status, userID: userID, generation: runtimeGeneration)
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

    /// Starts Realtime and its lifecycle coordinator only after the initial
    /// authoritative bootstrap has completed. Coordinator polling is the
    /// bounded fallback when Realtime cannot connect and is automatically
    /// stopped in the background/sign-out.
    private func startRealtimeRuntime() {
        guard configuration.isAuthComplete,
              session != nil,
              let syncCoordinator,
              let realtimeClient else { return }
        startNetworkMonitor()
        scheduleBackgroundRefresh()
        let generation = realtimeRuntimeGeneration
        Task {
            guard self.realtimeRuntimeGeneration == generation,
                  self.session != nil else { return }
            await syncCoordinator.start()
            // The initial flush happens before the runtime is started. If the
            // app was launched while offline, that flush can fail while the
            // path monitor's first callback still reports the default
            // reachable state. Kick both directions once here so a restored
            // connection does not leave the durable local queue stranded
            // until an unrelated lifecycle event occurs.
            await syncCoordinator.requestSync(reason: .foreground)
            if self.currentScenePhase == .background {
                await syncCoordinator.scenePhaseChanged(.background)
            }
            if !self.lastKnownNetworkReachable {
                await syncCoordinator.networkPathChanged(isReachable: false)
            }
            guard self.realtimeRuntimeGeneration == generation,
                  self.currentScenePhase != .background,
                  self.lastKnownNetworkReachable else { return }
            await realtimeClient.start()
        }
    }

    private func stopRealtimeRuntime() {
        realtimeRuntimeGeneration += 1
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.backgroundRefreshTaskIdentifier)
        networkMonitor?.cancel()
        networkMonitor = nil
        networkMonitorQueue = nil
        realtimeRuntimeUserID = nil
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

    private func pauseRealtimeClient() {
        guard let realtimeClient else { return }
        Task { await realtimeClient.stop() }
    }

    private func resumeRealtimeClientIfAllowed() {
        guard currentScenePhase != .background,
              lastKnownNetworkReachable,
              let realtimeClient else { return }
        Task { await realtimeClient.start() }
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
        let changed = lastKnownNetworkReachable != isReachable
        lastKnownNetworkReachable = isReachable
        guard session != nil, let syncCoordinator else { return }
        if !isReachable {
            pauseRealtimeClient()
        } else if changed {
            resumeRealtimeClientIfAllowed()
        }
        Task { await syncCoordinator.networkPathChanged(isReachable: isReachable) }
    }

    private func handleRealtimeEvent(_ event: RootineRealtimeEvent, userID: String, generation: Int) {
        guard let session,
              realtimeRuntimeUserID == userID,
              realtimeRuntimeGeneration == generation,
              currentScenePhase != .background,
              lastKnownNetworkReachable,
              case .syncAvailable(let signal) = event,
              signal.userID == session.user.id,
              let syncCoordinator else { return }
        // An echo is intentionally just another availability hint. The pull
        // is authoritative and never enqueues a second write from the event.
        Task { await syncCoordinator.requestPull(reason: .realtime) }
    }

    private func handleRealtimeStatus(_ status: RootineRealtimeStatus, userID: String, generation: Int) {
        guard realtimeRuntimeUserID == userID,
              realtimeRuntimeGeneration == generation,
              session?.user.id == userID else { return }
        realtimeStatus = status
        guard case .connected = status,
              currentScenePhase != .background,
              lastKnownNetworkReachable,
              session != nil,
              let syncCoordinator else { return }
        // Includes the first connection and every reconnect: pull from the
        // last durable cursor rather than trusting a websocket payload.
        Task { await syncCoordinator.requestPull(reason: .realtimeReconnect) }
    }

    func scenePhaseDidChange(_ phase: RootineScenePhase) {
        currentScenePhase = phase
        switch phase {
        case .background:
            pauseRealtimeClient()
        case .active:
            resumeRealtimeClientIfAllowed()
        case .inactive:
            break
        }
        guard session != nil, let syncCoordinator else { return }
        if phase == .active {
            // Permission may change while the app is suspended in Settings.
            scheduleDeviceRegistration()
        }
        Task { await syncCoordinator.scenePhaseChanged(phase) }
    }

    /// Pending writes are durable before this boundary. Closing the runtime
    /// prevents stale callbacks from touching a future account/session.
    func applicationWillTerminate() {
        currentScenePhase = .background
        stopRealtimeRuntime()
    }

    func performBackgroundRefresh(_ task: BGTask? = nil) async {
        guard session != nil, let syncCoordinator else {
            task?.setTaskCompleted(success: false)
            return
        }
        let work = Task { await syncCoordinator.syncNow(reason: .backgroundTask) }
        task?.expirationHandler = {
            work.cancel()
            Task { await syncCoordinator.cancelBackgroundWork() }
        }
        let success = await work.value
        task?.setTaskCompleted(success: success)
        // BGTaskScheduler requests are one-shot. Re-arm the safety net after
        // every execution, including an expired/failed run.
        scheduleBackgroundRefresh()
    }

    private static let backgroundRefreshTaskIdentifier = "app.rootine.sync.refresh"

    private func normalizedEmail(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func accept(_ newSession: SupabaseSession, passwordRecovery: Bool = false) async throws {
        let requestGeneration = authGeneration
        guard newSession.isValid else { throw RootineAPIError.invalidResponse }
        guard requestGeneration == authGeneration else { throw RootineAPIError.cancelled }
        authGeneration &+= 1
        let generation = authGeneration
        try keychain.save(newSession)
        session = newSession
        accountState = RootineAccountState(user: newSession.user)
        isPasswordRecovery = passwordRecovery
        configureRuntime(userID: newSession.user.id)
        guard !passwordRecovery else { return }
        guard generation == authGeneration else { throw RootineAPIError.cancelled }
        await recoverOrphanedTransactions()
        guard generation == authGeneration else { throw RootineAPIError.cancelled }
        await refreshProfileSettings()
        await loadAndReconcile(accessToken: newSession.accessToken)
        guard generation == authGeneration else { throw RootineAPIError.cancelled }
        await flushPendingMutations()
        startRealtimeRuntime()
        scheduleDeviceRegistration()
        await refreshRecoveryFiles()
    }

    private func acceptLinkedIdentitySession(_ newSession: SupabaseSession) async throws {
        let requestGeneration = authGeneration
        guard let currentUserID = session?.user.id,
              currentUserID == newSession.user.id,
              requestGeneration == authGeneration,
              newSession.isValid else {
            throw RootineAPIError.accountMismatch
        }
        authGeneration &+= 1
        try keychain.save(newSession)
        session = newSession
        accountState = RootineAccountState(user: newSession.user)
        configureRuntime(userID: newSession.user.id)
        startRealtimeRuntime()
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
        let apnsEnvironment = permission.canRegisterWithAPNs ? configuration.apnsEnvironment : nil
        let registeredPushToken = permission.canRegisterWithAPNs ? pushToken : nil
        let fingerprint = [
            userID,
            deviceID,
            appVersion,
            apnsEnvironment?.rawValue ?? "",
            permission.rawValue,
            registeredPushToken ?? ""
        ].joined(separator: "|")
        guard fingerprint != lastDeviceRegistrationFingerprint else { return }

        do {
            let registration = try await api.registerDevice(
                deviceID: deviceID,
                appVersion: appVersion,
                apnsEnvironment: apnsEnvironment,
                pushToken: registeredPushToken,
                permissionState: permission,
                accessToken: accessToken
            )
            guard session?.accessToken == accessToken else { return }
            deviceRegistration = registration
            lastDeviceRegistrationFingerprint = fingerprint
            RootineObservability.shared.recordDeviceHealth(
                outcome: .success,
                permission: permission.rawValue,
                environment: configuration.apnsEnvironment.rawValue
            )
        } catch {
            // Device registration is auxiliary to bootstrap and workspace
            // sync. Keep the token out of logs and do not turn a missing
            // mobile-sync/B03 deployment into a sync error.
            RootineObservability.shared.recordDeviceHealth(
                outcome: .failure,
                permission: permission.rawValue,
                environment: configuration.apnsEnvironment.rawValue,
                error: String(describing: error)
            )
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
        await loadNutritionProductCache(from: store)
        notesWorkspace = (try? await store.load(NotesWorkspace.self, key: .notes)) ?? .empty
        sportWorkspace = (try? await store.load(SportWorkspace.self, key: .sport)) ?? .empty
        goalsWorkspace = (try? await store.load(GoalsWorkspace.self, key: .goals)) ?? .empty
        let localWork = (try? await store.load(WorkWorkspace.self, key: .work)) ?? .empty
        workWorkspace = await sanitizedWorkWorkspace(localWork, store: store)
        travelWorkspace = (try? await store.load(TravelWorkspace.self, key: .travel)) ?? .empty
        let localHealth = (try? await store.load(HealthWorkspace.self, key: .health)) ?? .empty
        healthWorkspace = await sanitizedHealthWorkspace(localHealth, store: store)
        let localAffairs = (try? await store.load(AffairsWorkspace.self, key: .affairs)) ?? .empty
        affairsWorkspace = await sanitizedAffairsWorkspace(localAffairs, store: store, syncEngine: syncEngine, allowSync: false)
        recoveryFiles = (try? await store.recoveryFiles()) ?? []
        await reconcileLocalNotifications()
    }

    private func loadNutritionProductCache(from store: WorkspaceFileStore) async {
        let cachedProducts = (try? await store.load(NutritionProductCache.self, key: .nutritionProductCache)) ?? .empty
        nutritionProductCache = cachedProducts.products.reduce(into: [String: NutritionProduct]()) { result, product in
            let code = NutritionBarcode.normalized(product.barcode)
            if !code.isEmpty { result[code] = product }
        }
    }

    private func loadCanonicalShadows(from store: WorkspaceFileStore) async {
        canonicalShadows.removeAll()
        for key in [RootineStorageKey.sport, .goals, .work, .travel, .health, .notes] {
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

    /// Health values are user-entered and can arrive from legacy snapshots or
    /// relational rows. Repair only structural issues at the local boundary;
    /// impossible energy values are discarded rather than silently rewritten.
    /// As with Work, a repair is kept in Recovery and is not queued until
    /// reconciliation has compared the server revision.
    private func sanitizedHealthWorkspace(
        _ workspace: HealthWorkspace,
        store: WorkspaceFileStore,
        syncEngine: WorkspaceSyncEngine? = nil,
        allowSync: Bool = false
    ) async -> HealthWorkspace {
        let sanitized = rootineSanitizedHealthWorkspace(workspace)
        guard sanitized != workspace else { return workspace }
        if let data = try? JSONEncoder().encode(workspace) {
            _ = try? await store.writeRecoveryCopy(data, label: "health-sanitized", kind: .diagnostic)
        }
        var persisted = sanitized
        persisted.updatedAt = RootineDate.isoTimestamp()
        try? await store.save(persisted, key: .health)

        let mapped: JSONValue?
        if let shadow = canonicalShadows[.health] {
            mapped = try? RootineCanonicalWorkspaceMapping.mergedHealthPayload(for: persisted, onto: shadow)
        } else {
            mapped = try? RootineCanonicalWorkspaceMapping.payload(for: persisted)
        }
        if let mapped {
            canonicalShadows[.health] = mapped
            if allowSync,
               !archiveImportInProgress,
               let syncEngine {
                _ = try? await syncEngine.enqueue(
                    payload: mapped,
                    storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: .health)
                )
            }
        }
        foundationMessage = "Nieprawidłowe dane zdrowia zachowano w Recovery i bezpiecznie wyczyszczono"
        return persisted
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
            await loadNutritionProductCache(from: store)
            let localNotes = try await store.load(NotesWorkspace.self, key: .notes)
            let localSport = try await store.load(SportWorkspace.self, key: .sport)
            let localGoals = try await store.load(GoalsWorkspace.self, key: .goals)
            let localWorkRaw = try await store.load(WorkWorkspace.self, key: .work)
            let localWork = localWorkRaw.map(rootineSanitizedWorkWorkspace)
            let localTravel = try await store.load(TravelWorkspace.self, key: .travel)
            let localHealthRaw = try await store.load(HealthWorkspace.self, key: .health)
            let localHealth = localHealthRaw.map(rootineSanitizedHealthWorkspace)
            let localAffairsRaw = try await store.load(AffairsWorkspace.self, key: .affairs)
            let localAffairs = localAffairsRaw.map(normalizedAffairsWorkspace)
            let state = (try await store.load(RootineNormalizedReadState.self, key: .normalizedReadState)) ?? RootineNormalizedReadState()
            guard state.contractVersion == RootineRelationalWorkspaceAdapter.supportedContractVersion else {
                throw RootineNormalizedReadError.schemaMismatch(expected: RootineRelationalWorkspaceAdapter.supportedContractVersion, actual: state.contractVersion)
            }
            normalizedRecordRevisions = state.recordRevisions

            let current = RootineRelationalMaterialization(
                documents: state.documents,
                revisions: [:],
                recordRevisions: normalizedRecordRevisions
            )
            let fetched = try await fetchNormalizedMaterialization(cursor: state.cursor, base: current, accessToken: accessToken)
            normalizedRecordRevisions = fetched.recordRevisions
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
            for key in [RootineStorageKey.sport, .goals, .work, .travel, .health, .notes] {
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
                documents: fetched.documents,
                recordRevisions: fetched.recordRevisions
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
            if let payload = fetched.documents[RootineRelationalWorkspaceAdapter.canonicalStorageKey(for: .notes)] { canonicalShadows[.notes] = payload }
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
            let bootstrap = try await fetchNormalizedBootstrap(accessToken: accessToken)
            fetchedCursor = bootstrap.cursor
            return bootstrap.materialization
        }
        var result = base
        var nextCursor = cursor
        var hasMore = true
        while hasMore {
            let response: RootineRelationalPullResponse
            do {
                response = try await normalizedReadClient.pullChanges(cursor: nextCursor, limit: 500, accessToken: accessToken)
            } catch RootineNormalizedReadError.cursorExpired {
                let bootstrap = try await fetchNormalizedBootstrap(accessToken: accessToken)
                result = bootstrap.materialization
                nextCursor = bootstrap.cursor
                fetchedCursor = bootstrap.cursor
                return result
            }
            guard RootineRelationalWorkspaceAdapter.supportedTransportContractVersions.contains(response.contractVersion) else {
                throw RootineNormalizedReadError.schemaMismatch(expected: RootineRelationalWorkspaceAdapter.supportedContractVersion, actual: response.contractVersion)
            }
            result = try RootineRelationalWorkspaceAdapter.materialize(changes: response.changes, onto: result)
            let currentCursor = nextCursor ?? 0
            guard response.nextCursor >= currentCursor else { throw RootineNormalizedReadError.contractMismatch("cursor cofa się") }
            guard !response.hasMore || response.nextCursor > currentCursor else {
                throw RootineNormalizedReadError.contractMismatch("pull pagination nie robi postępu")
            }
            nextCursor = response.nextCursor
            hasMore = response.hasMore
        }
        fetchedCursor = nextCursor
        return result
    }

    private func fetchNormalizedBootstrap(
        accessToken: String
    ) async throws -> (materialization: RootineRelationalMaterialization, cursor: Int64) {
        let response = try await normalizedReadClient.bootstrap(accessToken: accessToken)
        var result = try RootineRelationalWorkspaceAdapter.materialize(bootstrap: response)
        guard response.hasMore else {
            return (result, max(response.serverCursor, response.nextCursor ?? response.serverCursor))
        }

        // sync-v3 bootstrap has no request cursor. Continue after its bounded
        // first page before persisting any cursor, otherwise newer records are
        // skipped on large accounts. Starting at next_cursor also works after
        // cursor expiry, where pulling from zero is intentionally rejected.
        guard let bootstrapCursor = response.nextCursor else {
            throw RootineNormalizedReadError.contractMismatch("bootstrap bez next_cursor")
        }
        guard bootstrapCursor < response.serverCursor else {
            throw RootineNormalizedReadError.contractMismatch("bootstrap next_cursor wykracza poza server_cursor")
        }
        var pullCursor = bootstrapCursor
        var hasMore = true
        while hasMore {
            let page = try await normalizedReadClient.pullChanges(
                cursor: pullCursor,
                limit: 500,
                accessToken: accessToken
            )
            guard page.nextCursor > pullCursor || !page.hasMore else {
                throw RootineNormalizedReadError.contractMismatch("bootstrap pagination nie robi postępu")
            }
            result = try RootineRelationalWorkspaceAdapter.materialize(changes: page.changes, onto: result)
            pullCursor = page.nextCursor
            hasMore = page.hasMore
        }
        return (result, pullCursor)
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
            case .notes:
                if decision.shouldPersist {
                    try await store.save(decision.value as! NotesWorkspace, key: key)
                }
                if let payload = canonicalShadows[key] { try await store.save(payload, key: .notesCanonicalShadow) }
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
            await loadNutritionProductCache(from: store)
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
            let localHealthRaw = try await store.load(HealthWorkspace.self, key: .health)
            let localHealth: HealthWorkspace?
            if let localHealthRaw {
                localHealth = await sanitizedHealthWorkspace(localHealthRaw, store: store, syncEngine: syncEngine, allowSync: false)
            } else {
                localHealth = nil
            }
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
            let notesResult = try await reconcileCanonical(localNotes, fallback: .empty, key: .notes, remote: remote, store: store, syncEngine: syncEngine, encode: RootineCanonicalWorkspaceMapping.payload, merge: RootineCanonicalWorkspaceMapping.mergedNotesPayload, decode: RootineCanonicalWorkspaceMapping.notesWorkspace(from:))
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
            healthWorkspace = await sanitizedHealthWorkspace(healthResult.value, store: store, syncEngine: syncEngine, allowSync: true)
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
