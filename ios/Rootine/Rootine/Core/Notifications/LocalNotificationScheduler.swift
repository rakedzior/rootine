import Foundation
import UserNotifications

// UNNotificationRequest is an immutable request value once constructed, but
// the iOS SDK has not annotated it Sendable yet. The async center boundary
// transfers that immutable value to Apple's notification daemon; marking the
// SDK type unchecked here keeps Swift 6 strict-concurrency diagnostics at the
// boundary instead of forcing the scheduler to abandon an actor.
extension UNNotificationRequest: @unchecked @retroactive Sendable {}

/// The two entity types currently supported by the local notification
/// pipeline. Keeping this enum separate from the workspace models gives B11 a
/// stable value to use when it creates a push job.
enum RootineNotificationEntity: String, Codable, CaseIterable, Sendable {
    case task
    case habit
}

/// Preferences are supplied by the profile/sync layer. B10 deliberately does
/// not read a database or make a network request; B08 can map its profile
/// payload to this value and B09 can provide the device context.
struct RootineNotificationPreferences: Codable, Equatable, Sendable {
    var enabled: Bool
    var timezoneIdentifier: String
    var taskRemindersEnabled: Bool
    var habitRemindersEnabled: Bool
    /// Details are opt-in because task and habit names can be sensitive on a
    /// lock screen. The default body is intentionally generic.
    var showTaskDetails: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?

    init(
        enabled: Bool = false,
        timezoneIdentifier: String = TimeZone.current.identifier,
        taskRemindersEnabled: Bool = true,
        habitRemindersEnabled: Bool = true,
        showTaskDetails: Bool = false,
        quietHoursStart: String? = nil,
        quietHoursEnd: String? = nil
    ) {
        self.enabled = enabled
        self.timezoneIdentifier = timezoneIdentifier
        self.taskRemindersEnabled = taskRemindersEnabled
        self.habitRemindersEnabled = habitRemindersEnabled
        self.showTaskDetails = showTaskDetails
        self.quietHoursStart = quietHoursStart
        self.quietHoursEnd = quietHoursEnd
    }

    /// Old profile payloads may omit newly introduced preference fields. The
    /// defaults keep such a payload safe and usable instead of disabling sync
    /// or crashing the launch path.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        timezoneIdentifier = try container.decodeIfPresent(String.self, forKey: .timezoneIdentifier)
            ?? TimeZone.current.identifier
        taskRemindersEnabled = try container.decodeIfPresent(Bool.self, forKey: .taskRemindersEnabled) ?? true
        habitRemindersEnabled = try container.decodeIfPresent(Bool.self, forKey: .habitRemindersEnabled) ?? true
        showTaskDetails = try container.decodeIfPresent(Bool.self, forKey: .showTaskDetails) ?? false
        quietHoursStart = try container.decodeIfPresent(String.self, forKey: .quietHoursStart)
        quietHoursEnd = try container.decodeIfPresent(String.self, forKey: .quietHoursEnd)
    }

    private enum CodingKeys: String, CodingKey {
        case enabled
        case timezoneIdentifier
        case taskRemindersEnabled
        case habitRemindersEnabled
        case showTaskDetails
        case quietHoursStart
        case quietHoursEnd
    }

    var timeZone: TimeZone {
        TimeZone(identifier: timezoneIdentifier) ?? .current
    }
}

/// UserDefaults is the small durable preference boundary for B10. It avoids
/// introducing a second database while preserving an account's opt-in and
/// timezone across process restarts; B08 may overwrite it after a profile
/// pull. The key contains a stable hash rather than the account identifier.
enum RootineNotificationPreferencesStore {
    private static let keyPrefix = "rootine.notification.preferences."

    static func load(
        userID: String,
        defaults: UserDefaults = .standard
    ) -> RootineNotificationPreferences? {
        let key = key(for: userID)
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(RootineNotificationPreferences.self, from: data)
    }

    static func save(
        _ preferences: RootineNotificationPreferences,
        userID: String,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(preferences) else { return }
        defaults.set(data, forKey: key(for: userID))
    }

    static func remove(userID: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key(for: userID))
    }

    private static func key(for userID: String) -> String {
        keyPrefix + RootineLocalIdentifier.string(
            namespace: "notification-preferences",
            operationID: userID
        )
    }
}

/// Account-scoped display preferences. These values intentionally live next
/// to notification preferences instead of in the workspace archive: changing
/// locale or units must never create a domain mutation, and a later account
/// must not inherit the previous account's presentation choices.
struct RootineProfilePreferences: Codable, Equatable, Sendable {
    static let currentVersion = 1

    var version: Int
    var timezoneIdentifier: String
    var localeIdentifier: String
    var currencyCode: String
    var usesMetricUnits: Bool
    var privacyMode: Bool

    init(
        version: Int = RootineProfilePreferences.currentVersion,
        timezoneIdentifier: String = TimeZone.current.identifier,
        localeIdentifier: String = RootineProfilePreferences.defaultLocaleIdentifier,
        currencyCode: String = RootineProfilePreferences.defaultCurrencyCode,
        usesMetricUnits: Bool = true,
        privacyMode: Bool = false
    ) {
        self.version = version
        self.timezoneIdentifier = timezoneIdentifier
        self.localeIdentifier = localeIdentifier
        self.currencyCode = currencyCode
        self.usesMetricUnits = usesMetricUnits
        self.privacyMode = privacyMode
    }

    static var defaultLocaleIdentifier: String {
        Locale.current.language.languageCode?.identifier == "pl" ? "pl-PL" : "en-US"
    }

    static var defaultCurrencyCode: String {
        Locale(identifier: defaultLocaleIdentifier).currency?.identifier ?? "PLN"
    }

    static var current: RootineProfilePreferences {
        RootineProfilePreferences()
    }

    /// Reject unknown values at the storage boundary. A malformed account
    /// preference should fall back to a usable, local-safe profile rather than
    /// affecting workspace decoding or synchronization.
    var normalized: RootineProfilePreferences {
        var copy = self
        copy.version = Self.currentVersion
        if TimeZone(identifier: copy.timezoneIdentifier) == nil {
            copy.timezoneIdentifier = TimeZone.current.identifier
        }
        if !["pl-PL", "en-US"].contains(copy.localeIdentifier) {
            copy.localeIdentifier = Self.defaultLocaleIdentifier
        }
        if !["PLN", "EUR", "USD", "GBP"].contains(copy.currencyCode) {
            copy.currencyCode = Self.defaultCurrencyCode
        }
        return copy
    }
}

enum RootineProfileSettingsError: LocalizedError, Equatable, Sendable {
    case invalidDisplayName

    var errorDescription: String? {
        switch self {
        case .invalidDisplayName:
            return "Nazwa profilu musi mieć od 1 do 120 znaków i nie może zawierać znaków sterujących."
        }
    }
}

enum RootineProfilePreferencesStore {
    private static let keyPrefix = "rootine.profile.preferences."

    static func load(
        userID: String,
        defaults: UserDefaults = .standard
    ) -> RootineProfilePreferences? {
        guard let data = defaults.data(forKey: key(for: userID)),
              let preferences = try? JSONDecoder().decode(RootineProfilePreferences.self, from: data),
              preferences.version == RootineProfilePreferences.currentVersion else {
            return nil
        }
        return preferences.normalized
    }

    static func save(
        _ preferences: RootineProfilePreferences,
        userID: String,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(preferences.normalized) else { return }
        defaults.set(data, forKey: key(for: userID))
    }

    static func remove(userID: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key(for: userID))
    }

    private static func key(for userID: String) -> String {
        keyPrefix + RootineLocalIdentifier.string(
            namespace: "profile-preferences",
            operationID: userID
        )
    }
}

/// Stable handoff boundary for the profile and device workstreams. The
/// device ID is intentionally not part of a dedupe key (B11's contract is per
/// user/entity/occurrence/type), but it is available for future diagnostics
/// and APNs registration without changing the scheduler API.
struct RootineNotificationAccountContext: Equatable, Sendable {
    let userID: String
    let deviceID: String?
    let profileTimeZoneIdentifier: String?

    init(userID: String, deviceID: String? = nil, profileTimeZoneIdentifier: String? = nil) {
        self.userID = userID
        self.deviceID = deviceID
        self.profileTimeZoneIdentifier = profileTimeZoneIdentifier
    }
}

enum RootineNotificationAuthorization: String, Codable, Sendable {
    case authorized
    case provisional
    case ephemeral
    case denied
    case notDetermined
    case unavailable
    case error

    init(status: UNAuthorizationStatus) {
        switch status {
        case .authorized: self = .authorized
        case .provisional: self = .provisional
        case .ephemeral: self = .ephemeral
        case .denied: self = .denied
        case .notDetermined: self = .notDetermined
        @unknown default: self = .unavailable
        }
    }

    var canSchedule: Bool {
        switch self {
        case .authorized, .provisional, .ephemeral: return true
        case .denied, .notDetermined, .unavailable, .error: return false
        }
    }
}

/// A rule identifies the source entity and notification type independently of
/// a concrete calendar occurrence. Its value is stable across launches and is
/// deliberately independent of timezone/DST so changing profile settings
/// reschedules the same rule's future occurrences.
struct RootineNotificationRule: Codable, Equatable, Hashable, Sendable {
    let entity: RootineNotificationEntity
    let entityID: String
    let notificationType: String
    let localTime: String
    let reminderMinutes: Int
    let active: Bool

    init(
        entity: RootineNotificationEntity,
        entityID: String,
        localTime: String,
        reminderMinutes: Int = 0,
        active: Bool = true,
        notificationType: String = "reminder"
    ) {
        self.entity = entity
        self.entityID = entityID
        self.notificationType = notificationType
        self.localTime = localTime
        self.reminderMinutes = max(0, reminderMinutes)
        self.active = active
    }

    var ruleID: String {
        [entity.rawValue, entityID, notificationType].joined(separator: ":")
    }
}

/// The metadata is also the local half of B11's dedupe contract. Request IDs
/// are hashed so a user's UUID or task text never appears in an OS-level
/// identifier; the raw dedupe key is kept in userInfo for deterministic
/// reconciliation and is not logged.
struct RootineNotificationOccurrence: Codable, Equatable, Hashable, Sendable {
    let entity: RootineNotificationEntity
    let entityID: String
    let localDate: String
    let localTime: String
    let scheduledAt: Date
    let notificationType: String
    let occurrenceID: String
    let dedupeKey: String
    let displayText: String?

    init(
        entity: RootineNotificationEntity,
        entityID: String,
        localDate: String,
        localTime: String,
        scheduledAt: Date,
        userID: String,
        notificationType: String = "reminder",
        displayText: String? = nil
    ) {
        self.entity = entity
        self.entityID = entityID
        self.localDate = localDate
        self.localTime = localTime
        self.scheduledAt = scheduledAt
        self.notificationType = notificationType
        self.displayText = displayText
        occurrenceID = Self.makeOccurrenceID(entity: entity, entityID: entityID, localDate: localDate)
        dedupeKey = Self.makeDedupeKey(
            userID: userID,
            entity: entity,
            occurrenceID: occurrenceID,
            notificationType: notificationType
        )
    }

    static func makeOccurrenceID(
        entity: RootineNotificationEntity,
        entityID: String,
        localDate: String
    ) -> String {
        [entity.rawValue, entityID, localDate].joined(separator: ":")
    }

    static func makeDedupeKey(
        userID: String,
        entity: RootineNotificationEntity,
        occurrenceID: String,
        notificationType: String = "reminder"
    ) -> String {
        // This order mirrors the server job contract: user_id + entity +
        // occurrence + notification_type. Do not replace it with a Date or a
        // device ID; that would make local and push deliveries diverge.
        [userID, entity.rawValue, occurrenceID, notificationType].joined(separator: "/")
    }

    static func requestIdentifier(userID: String, dedupeKey: String) -> String {
        let userHash = RootineLocalIdentifier.string(namespace: "notification-user", operationID: userID)
        let occurrenceHash = RootineLocalIdentifier.string(namespace: "notification", operationID: dedupeKey)
        return "rootine.local." + userHash + "." + occurrenceHash
    }

    func requestIdentifier(for userID: String) -> String {
        Self.requestIdentifier(userID: userID, dedupeKey: dedupeKey)
    }

    var userInfo: [AnyHashable: Any] {
        [
            "rootine_schema_version": 1,
            "rootine_entity": entity.rawValue,
            "rootine_entity_id": entityID,
            "rootine_local_date": localDate,
            "rootine_local_time": localTime,
            "rootine_occurrence_id": occurrenceID,
            "rootine_dedupe_key": dedupeKey,
            "rootine_notification_type": notificationType
        ]
    }
}

struct RootineNotificationPlan: Equatable, Sendable {
    let occurrences: [RootineNotificationOccurrence]
    let totalCandidateCount: Int
    let maxPendingRequests: Int

    var truncatedCount: Int {
        max(0, totalCandidateCount - occurrences.count)
    }
}

struct RootineNotificationReconcileResult: Equatable, Sendable {
    let authorization: RootineNotificationAuthorization
    let desiredCount: Int
    let scheduledCount: Int
    let cancelledCount: Int
    let truncatedCount: Int
    let failedCount: Int

    var isSuccessful: Bool {
        failedCount == 0 && authorization.canSchedule
    }
}

/// A small async boundary around UNUserNotificationCenter makes all planner
/// and reconciliation behavior deterministic in XCTest and keeps the actor
/// independent of Apple's concrete singleton.
protocol RootineNotificationCenter: Sendable {
    func authorizationStatus() async -> RootineNotificationAuthorization
    func requestAuthorization() async throws -> Bool
    func pendingNotificationRequests() async -> [UNNotificationRequest]
    func add(_ request: sending UNNotificationRequest) async throws
    func removePendingNotificationRequests(withIdentifiers identifiers: [String]) async
}

final class SystemRootineNotificationCenter: RootineNotificationCenter, @unchecked Sendable {
    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func authorizationStatus() async -> RootineNotificationAuthorization {
        let settings = await center.notificationSettings()
        return RootineNotificationAuthorization(status: settings.authorizationStatus)
    }

    func requestAuthorization() async throws -> Bool {
        try await center.requestAuthorization(options: [.alert, .sound, .badge])
    }

    func pendingNotificationRequests() async -> [UNNotificationRequest] {
        await center.pendingNotificationRequests()
    }

    func add(_ request: sending UNNotificationRequest) async throws {
        try await center.add(request)
    }

    func removePendingNotificationRequests(withIdentifiers identifiers: [String]) async {
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}

/// Explicit name for the concrete Apple service used by production code. The
/// longer system-prefixed name remains useful when reading dependency setup,
/// while this alias gives B09/B11 a concise integration point.
typealias UNUserNotificationCenterService = SystemRootineNotificationCenter

protocol RootineNotificationScheduling: Sendable {
    func requestAuthorization() async -> RootineNotificationAuthorization
    func reconcile(
        workspace: TaskWorkspace,
        preferences: RootineNotificationPreferences,
        now: Date
    ) async -> RootineNotificationReconcileResult
    func cancelAll() async -> Int
}

/// Actor that owns the idempotent local request lifecycle. It never throws to
/// the caller: a notification API failure is reported in the result and does
/// not prevent a workspace mutation or the sync queue from completing.
actor RootineLocalNotificationScheduler: RootineNotificationScheduling {
    static let defaultMaxPendingRequests = 64

    private let context: RootineNotificationAccountContext
    private let center: any RootineNotificationCenter
    private let maxPendingRequests: Int

    init(
        context: RootineNotificationAccountContext,
        center: any RootineNotificationCenter = SystemRootineNotificationCenter(),
        maxPendingRequests: Int = RootineLocalNotificationScheduler.defaultMaxPendingRequests
    ) {
        self.context = context
        self.center = center
        self.maxPendingRequests = max(1, maxPendingRequests)
    }

    func requestAuthorization() async -> RootineNotificationAuthorization {
        let current = await center.authorizationStatus()
        guard current == .notDetermined else { return current }
        do {
            let granted = try await center.requestAuthorization()
            return granted ? .authorized : .denied
        } catch {
            return .error
        }
    }

    func reconcile(
        workspace: TaskWorkspace,
        preferences: RootineNotificationPreferences,
        now: Date = Date()
    ) async -> RootineNotificationReconcileResult {
        let authorization = await center.authorizationStatus()
        let pending = await center.pendingNotificationRequests()
        let owned = pending.filter { $0.identifier.hasPrefix(ownedPrefix) }

        guard preferences.enabled else {
            let cancelled = await remove(owned.map(\.identifier))
            return RootineNotificationReconcileResult(
                authorization: authorization,
                desiredCount: 0,
                scheduledCount: 0,
                cancelledCount: cancelled,
                truncatedCount: 0,
                failedCount: 0
            )
        }

        guard authorization.canSchedule else {
            // A denied/not-determined permission should not leave old local
            // alerts alive after the user has disabled the scheduler.
            let cancelled = await remove(owned.map(\.identifier))
            return RootineNotificationReconcileResult(
                authorization: authorization,
                desiredCount: 0,
                scheduledCount: 0,
                cancelledCount: cancelled,
                truncatedCount: 0,
                failedCount: 0
            )
        }

        var effectivePreferences = preferences
        if let profileTimeZoneIdentifier = context.profileTimeZoneIdentifier,
           !profileTimeZoneIdentifier.isEmpty {
            effectivePreferences.timezoneIdentifier = profileTimeZoneIdentifier
        }
        let plan = RootineLocalNotificationPlanner.plan(
            workspace: workspace,
            context: context,
            preferences: effectivePreferences,
            now: now,
            maxPendingRequests: maxPendingRequests
        )
        let desiredRequests = plan.occurrences.map { makeRequest(for: $0, preferences: effectivePreferences) }
        let desiredByID = Dictionary(uniqueKeysWithValues: desiredRequests.map { ($0.identifier, $0) })
        let existingByID = Dictionary(uniqueKeysWithValues: owned.map { ($0.identifier, $0) })

        var identifiersToRemove: [String] = []
        var requestsToAdd: [UNNotificationRequest] = []
        for existing in owned {
            guard let desired = desiredByID[existing.identifier] else {
                identifiersToRemove.append(existing.identifier)
                continue
            }
            if !Self.requestMatches(existing, desired: desired) {
                identifiersToRemove.append(existing.identifier)
                requestsToAdd.append(desired)
            }
        }
        for desired in desiredRequests where existingByID[desired.identifier] == nil {
            requestsToAdd.append(desired)
        }

        let cancelled = await remove(identifiersToRemove)
        var scheduled = 0
        var failed = 0
        for request in requestsToAdd {
            do {
                try await center.add(request)
                scheduled += 1
            } catch {
                failed += 1
            }
        }
        return RootineNotificationReconcileResult(
            authorization: authorization,
            desiredCount: desiredRequests.count,
            scheduledCount: scheduled,
            cancelledCount: cancelled,
            truncatedCount: plan.truncatedCount,
            failedCount: failed
        )
    }

    func cancelAll() async -> Int {
        let pending = await center.pendingNotificationRequests()
        return await remove(pending.filter { $0.identifier.hasPrefix(ownedPrefix) }.map(\.identifier))
    }

    private var ownedPrefix: String {
        let userHash = RootineLocalIdentifier.string(namespace: "notification-user", operationID: context.userID)
        return "rootine.local." + userHash + "."
    }

    private func remove(_ identifiers: [String]) async -> Int {
        guard !identifiers.isEmpty else { return 0 }
        await center.removePendingNotificationRequests(withIdentifiers: identifiers)
        return identifiers.count
    }

    private func makeRequest(
        for occurrence: RootineNotificationOccurrence,
        preferences: RootineNotificationPreferences
    ) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = "Rootine"
        if preferences.showTaskDetails {
            // Details are copied into the notification only after an explicit
            // preference opt-in. They never enter the dedupe key or request
            // identifier.
            content.body = occurrence.displayText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? occurrence.displayText!
                : occurrence.entity == .task ? "Przypomnienie o zadaniu" : "Przypomnienie o nawyku"
        } else {
            content.body = occurrence.entity == .task ? "Masz zaplanowane zadanie." : "Czas na zaplanowany nawyk."
        }
        content.sound = .default
        content.threadIdentifier = "rootine." + occurrence.entity.rawValue
        content.userInfo = occurrence.userInfo

        let components = RootineLocalNotificationPlanner.triggerComponents(
            for: occurrence.scheduledAt,
            timeZone: preferences.timeZone
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(
            identifier: occurrence.requestIdentifier(for: context.userID),
            content: content,
            trigger: trigger
        )
    }

    private static func requestMatches(_ existing: UNNotificationRequest, desired: UNNotificationRequest) -> Bool {
        guard existing.identifier == desired.identifier,
              existing.content.title == desired.content.title,
              existing.content.body == desired.content.body,
              existing.content.userInfo["rootine_occurrence_id"] as? String
                == desired.content.userInfo["rootine_occurrence_id"] as? String,
              existing.content.userInfo["rootine_local_date"] as? String
                == desired.content.userInfo["rootine_local_date"] as? String,
              existing.content.userInfo["rootine_local_time"] as? String
                == desired.content.userInfo["rootine_local_time"] as? String,
              let existingTrigger = existing.trigger as? UNCalendarNotificationTrigger,
              let desiredTrigger = desired.trigger as? UNCalendarNotificationTrigger else {
            return false
        }
        let existingComponents = existingTrigger.dateComponents
        let desiredComponents = desiredTrigger.dateComponents
        return existingComponents.calendar == desiredComponents.calendar
            && existingComponents.timeZone == desiredComponents.timeZone
            && existingComponents.year == desiredComponents.year
            && existingComponents.month == desiredComponents.month
            && existingComponents.day == desiredComponents.day
            && existingComponents.hour == desiredComponents.hour
            && existingComponents.minute == desiredComponents.minute
    }
}

/// Pure occurrence generation. All date arithmetic is performed in the
/// profile timezone and uses local YYYY-MM-DD keys; UTC is only used by
/// UNCalendarNotificationTrigger after the local components are resolved.
enum RootineLocalNotificationPlanner {
    static let defaultHorizonDays = 30

    static func plan(
        workspace: TaskWorkspace,
        context: RootineNotificationAccountContext,
        preferences: RootineNotificationPreferences,
        now: Date,
        horizonDays: Int = defaultHorizonDays,
        maxPendingRequests: Int = RootineLocalNotificationScheduler.defaultMaxPendingRequests
    ) -> RootineNotificationPlan {
        let calendar = calendar(for: preferences.timeZone)
        let dayCount = max(1, horizonDays)
        let firstDay = calendar.startOfDay(for: now)
        var candidates: [RootineNotificationOccurrence] = []
        candidates.reserveCapacity(workspace.tasks.count + workspace.habits.count)

        if preferences.taskRemindersEnabled {
            for task in workspace.tasks {
                candidates.append(contentsOf: taskOccurrences(
                    task,
                    userID: context.userID,
                    now: now,
                    firstDay: firstDay,
                    dayCount: dayCount,
                    calendar: calendar,
                    preferences: preferences
                ))
            }
        }
        if preferences.habitRemindersEnabled {
            for habit in workspace.habits {
                candidates.append(contentsOf: habitOccurrences(
                    habit,
                    userID: context.userID,
                    now: now,
                    firstDay: firstDay,
                    dayCount: dayCount,
                    calendar: calendar,
                    preferences: preferences
                ))
            }
        }

        var seen = Set<String>()
        let unique = candidates.filter { seen.insert($0.dedupeKey).inserted }
            .sorted {
                if $0.scheduledAt != $1.scheduledAt { return $0.scheduledAt < $1.scheduledAt }
                return $0.dedupeKey < $1.dedupeKey
            }
        let limit = max(1, maxPendingRequests)
        return RootineNotificationPlan(
            occurrences: Array(unique.prefix(limit)),
            totalCandidateCount: unique.count,
            maxPendingRequests: limit
        )
    }

    static func triggerComponents(for date: Date, timeZone: TimeZone) -> DateComponents {
        var calendar = calendar(for: timeZone)
        calendar.timeZone = timeZone
        var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        components.timeZone = timeZone
        return components
    }

    private static func taskOccurrences(
        _ task: WorkspaceTask,
        userID: String,
        now: Date,
        firstDay: Date,
        dayCount: Int,
        calendar: Calendar,
        preferences: RootineNotificationPreferences
    ) -> [RootineNotificationOccurrence] {
        guard task.deleted != true else { return [] }
        let schedule = task.schedule
        guard !(schedule?.allDay ?? false) else { return [] }
        guard let time = validTime(schedule?.startTime ?? task.time) else { return [] }
        guard let baseDateKey = normalizedDateKey(task.calendarDate ?? task.date, calendar: calendar) else { return [] }
        guard let baseDate = date(from: baseDateKey, calendar: calendar) else { return [] }
        let recurrence = normalizedRecurrence(schedule?.recurrence)
        let endDateKey = schedule?.endDate.flatMap { normalizedDateKey($0, calendar: calendar) }
        let reminderMinutes = max(0, schedule?.reminderMinutes ?? 0)
        let eventComponents = DateComponents(hour: time.hour, minute: time.minute)
        var result: [RootineNotificationOccurrence] = []

        for offset in 0..<dayCount {
            guard let day = calendar.date(byAdding: .day, value: offset, to: firstDay) else { continue }
            let dateKey = RootineDate.localDate(day, calendar: calendar)
            guard dateKey >= baseDateKey,
                  endDateKey == nil || dateKey <= endDateKey!,
                  taskMatchesRecurrence(
                    recurrence,
                    date: day,
                    dateKey: dateKey,
                    baseDate: baseDate,
                    calendar: calendar
                  ) else { continue }
            if rootineTaskIsDoneOnDate(task, dateKey: dateKey) { continue }
            guard let eventDate = calendar.date(
                bySettingHour: eventComponents.hour!,
                minute: eventComponents.minute!,
                second: 0,
                of: day
            ) else { continue }
            let scheduledAt = calendar.date(byAdding: .minute, value: -reminderMinutes, to: eventDate) ?? eventDate
            guard scheduledAt > now,
                  !isQuietHour(scheduledAt, preferences: preferences, calendar: calendar) else { continue }
            result.append(RootineNotificationOccurrence(
                entity: .task,
                entityID: String(task.id),
                localDate: dateKey,
                localTime: formatTime(scheduledAt, calendar: calendar),
                scheduledAt: scheduledAt,
                userID: userID,
                displayText: task.text
            ))
        }
        return result
    }

    private static func habitOccurrences(
        _ habit: WorkspaceHabit,
        userID: String,
        now: Date,
        firstDay: Date,
        dayCount: Int,
        calendar: Calendar,
        preferences: RootineNotificationPreferences
    ) -> [RootineNotificationOccurrence] {
        guard let time = validTime(habit.time ?? habit.timeOfDay) else { return [] }
        let schedule = habit.schedule
        let startDateKey = schedule.flatMap { normalizedDateKey($0.startDate, calendar: calendar) }
            ?? RootineDate.localDate(firstDay, calendar: calendar)
        guard date(from: startDateKey, calendar: calendar) != nil else { return [] }
        let endDateKey = schedule?.endDate.flatMap { normalizedDateKey($0, calendar: calendar) }
        let reminderMinutes = max(0, habit.reminderMinutes ?? 0)
        var result: [RootineNotificationOccurrence] = []

        for offset in 0..<dayCount {
            guard let day = calendar.date(byAdding: .day, value: offset, to: firstDay) else { continue }
            let dateKey = RootineDate.localDate(day, calendar: calendar)
            guard dateKey >= startDateKey,
                  endDateKey == nil || dateKey <= endDateKey!,
                  rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar),
                  let eventDate = calendar.date(
                    bySettingHour: time.hour,
                    minute: time.minute,
                    second: 0,
                    of: day
                  ) else { continue }
            // `WorkspaceHabit.done` is a legacy global flag whose implicit
            // date must be interpreted in the profile timezone, not the
            // device's current timezone. An explicit completedDates array
            // remains authoritative when present.
            let completedInProfileDay = habit.completedDates?.contains(dateKey) == true
                || (habit.completedDates == nil && habit.done
                    && dateKey == RootineDate.localDate(now, calendar: calendar))
            if completedInProfileDay { continue }
            let scheduledAt = calendar.date(byAdding: .minute, value: -reminderMinutes, to: eventDate) ?? eventDate
            guard scheduledAt > now,
                  !isQuietHour(scheduledAt, preferences: preferences, calendar: calendar) else { continue }
            result.append(RootineNotificationOccurrence(
                entity: .habit,
                entityID: String(habit.id),
                localDate: dateKey,
                localTime: formatTime(scheduledAt, calendar: calendar),
                scheduledAt: scheduledAt,
                userID: userID,
                displayText: habit.name
            ))
        }
        return result
    }

    private enum TaskRecurrence: Equatable {
        case oneOff
        case daily
        case weekdays
        case weekly(interval: Int)
        case monthly
    }

    private static func normalizedRecurrence(_ value: String?) -> TaskRecurrence {
        let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: "_", with: "-")
            .replacingOccurrences(of: " ", with: "-")
        guard let raw, !raw.isEmpty else { return .oneOff }
        if raw.contains("freq=daily") || raw == "daily" || raw == "every-day" || raw == "everyday" {
            return .daily
        }
        if raw.contains("freq=weekly") || raw == "weekly" || raw == "every-week" {
            return .weekly(interval: recurrenceInterval(in: raw) ?? 1)
        }
        if raw.contains("freq=monthly") || raw == "monthly" || raw == "every-month" {
            return .monthly
        }
        if raw == "weekdays" || raw == "working-days" || raw == "monday-friday" {
            return .weekdays
        }
        if raw == "biweekly" || raw == "every-2-weeks" || raw == "every-two-weeks" {
            return .weekly(interval: 2)
        }
        if raw == "none" || raw == "once" || raw == "one-off" || raw == "one-time" {
            return .oneOff
        }
        return .oneOff
    }

    private static func recurrenceInterval(in raw: String) -> Int? {
        let intervals: [Int] = raw.split(separator: ";").compactMap { component -> Int? in
            let parts = component.split(separator: "=", maxSplits: 1)
            guard parts.count == 2, parts[0] == "interval" else { return nil }
            guard let interval = Int(parts[1]), interval > 0 else { return nil }
            return interval
        }
        return intervals.first
    }

    private static func taskMatchesRecurrence(
        _ recurrence: TaskRecurrence,
        date: Date,
        dateKey: String,
        baseDate: Date,
        calendar: Calendar
    ) -> Bool {
        switch recurrence {
        case .oneOff:
            return dateKey == RootineDate.localDate(baseDate, calendar: calendar)
        case .daily:
            return true
        case .weekdays:
            let weekday = calendar.component(.weekday, from: date)
            return weekday != 1 && weekday != 7
        case .weekly(let interval):
            let startWeek = calendar.dateInterval(of: .weekOfYear, for: baseDate)?.start ?? baseDate
            let currentWeek = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
            let weeks = calendar.dateComponents([.weekOfYear], from: startWeek, to: currentWeek).weekOfYear ?? 0
            return calendar.component(.weekday, from: date) == calendar.component(.weekday, from: baseDate)
                && weeks >= 0
                && weeks % max(1, interval) == 0
        case .monthly:
            return calendar.component(.day, from: date) == calendar.component(.day, from: baseDate)
        }
    }

    private static func normalizedDateKey(_ value: String?, calendar: Calendar) -> String? {
        guard let value else { return nil }
        let key = String(value.prefix(10))
        guard key.count == 10, let parsed = date(from: key, calendar: calendar), RootineDate.localDate(parsed, calendar: calendar) == key else {
            return nil
        }
        return key
    }

    private static func date(from key: String, calendar: Calendar) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private struct LocalTime {
        let hour: Int
        let minute: Int
    }

    private static func validTime(_ value: String?) -> LocalTime? {
        guard let value else { return nil }
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return LocalTime(hour: parts[0], minute: parts[1])
    }

    private static func formatTime(_ date: Date, calendar: Calendar) -> String {
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        return String(format: "%02d:%02d", hour, minute)
    }

    private static func calendar(for timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.firstWeekday = 2
        calendar.minimumDaysInFirstWeek = 4
        return calendar
    }

    private static func isQuietHour(
        _ date: Date,
        preferences: RootineNotificationPreferences,
        calendar: Calendar
    ) -> Bool {
        guard let start = validTime(preferences.quietHoursStart),
              let end = validTime(preferences.quietHoursEnd) else { return false }
        let current = calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
        let startMinute = start.hour * 60 + start.minute
        let endMinute = end.hour * 60 + end.minute
        if startMinute == endMinute { return false }
        if startMinute < endMinute {
            return current >= startMinute && current < endMinute
        }
        // Quiet hours crossing midnight are represented as [start, 24h) or
        // [00:00, end), which avoids a UTC date boundary assumption.
        return current >= startMinute || current < endMinute
    }
}
