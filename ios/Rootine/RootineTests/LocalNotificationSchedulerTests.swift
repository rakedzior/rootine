import Foundation
import UserNotifications
import XCTest
@testable import Rootine

final class LocalNotificationSchedulerTests: XCTestCase {
    func testOccurrenceAndDedupeIDsAreStableAndMatchServerOrder() {
        let occurrence = RootineNotificationOccurrence(
            entity: .task,
            entityID: "42",
            localDate: "2026-09-02",
            localTime: "08:45",
            scheduledAt: Date(timeIntervalSince1970: 10),
            userID: "user-1"
        )

        XCTAssertEqual(occurrence.occurrenceID, "task:42:2026-09-02")
        XCTAssertEqual(occurrence.dedupeKey, "user-1/task/task:42:2026-09-02/reminder")
        XCTAssertEqual(
            occurrence.requestIdentifier(for: "user-1"),
            RootineNotificationOccurrence.requestIdentifier(userID: "user-1", dedupeKey: occurrence.dedupeKey)
        )
        XCTAssertNotEqual(occurrence.requestIdentifier(for: "user-1"), occurrence.requestIdentifier(for: "user-2"))
    }

    func testPreferencesPersistAcrossSchedulerRestartWithoutSQLite() {
        let suiteName = "RootineNotificationSchedulerTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let preferences = RootineNotificationPreferences(
            enabled: true,
            timezoneIdentifier: "Europe/Warsaw",
            taskRemindersEnabled: true,
            habitRemindersEnabled: false,
            showTaskDetails: true,
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00"
        )

        RootineNotificationPreferencesStore.save(preferences, userID: "user-1", defaults: defaults)

        XCTAssertEqual(
            RootineNotificationPreferencesStore.load(userID: "user-1", defaults: defaults),
            preferences
        )
        XCTAssertNil(RootineNotificationPreferencesStore.load(userID: "user-2", defaults: defaults))
    }

    func testProfilePreferencesAreAccountScopedAndNormalizeUnknownValues() {
        let suiteName = "RootineProfilePreferencesTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let preferences = RootineProfilePreferences(
            version: 1,
            timezoneIdentifier: "not/a/timezone",
            localeIdentifier: "fr-FR",
            currencyCode: "CAD",
            usesMetricUnits: false,
            privacyMode: true
        )

        RootineProfilePreferencesStore.save(preferences, userID: "user-1", defaults: defaults)

        let loaded = RootineProfilePreferencesStore.load(userID: "user-1", defaults: defaults)
        XCTAssertEqual(loaded?.version, RootineProfilePreferences.currentVersion)
        XCTAssertEqual(loaded?.timezoneIdentifier, TimeZone.current.identifier)
        XCTAssertTrue(["pl-PL", "en-US"].contains(loaded?.localeIdentifier ?? ""))
        XCTAssertTrue(["PLN", "EUR", "USD", "GBP"].contains(loaded?.currencyCode ?? ""))
        XCTAssertEqual(loaded?.usesMetricUnits, false)
        XCTAssertEqual(loaded?.privacyMode, true)
        XCTAssertNil(RootineProfilePreferencesStore.load(userID: "user-2", defaults: defaults))

        RootineProfilePreferencesStore.remove(userID: "user-1", defaults: defaults)
        XCTAssertNil(RootineProfilePreferencesStore.load(userID: "user-1", defaults: defaults))
    }

    func testPlannerUsesProfileTimezoneAcrossUTCDateBoundary() {
        let timeZone = try! XCTUnwrap(TimeZone(identifier: "Europe/Warsaw"))
        let now = date("2026-03-01", time: "23:30", timeZone: TimeZone(secondsFromGMT: 0)!)
        let workspace = TaskWorkspace(
            version: 2,
            updatedAt: RootineDate.isoTimestamp(now),
            tasks: [WorkspaceTask(id: 1, text: "Jutro", done: false, time: "01:00", view: "wszystkie", calendarDate: "2026-03-02")],
            habits: [],
            lists: [],
            tags: []
        )

        let plan = RootineLocalNotificationPlanner.plan(
            workspace: workspace,
            context: RootineNotificationAccountContext(userID: "user"),
            preferences: RootineNotificationPreferences(timezoneIdentifier: timeZone.identifier),
            now: now,
            horizonDays: 2,
            maxPendingRequests: 64
        )

        XCTAssertEqual(plan.occurrences.first?.localDate, "2026-03-02")
        XCTAssertEqual(plan.occurrences.first?.localTime, "01:00")
    }

    func testPlannerResolvesSpringDSTGapToNextValidLocalTime() {
        let timeZone = try! XCTUnwrap(TimeZone(identifier: "America/New_York"))
        let now = date("2026-03-08", time: "00:00", timeZone: timeZone)
        let workspace = TaskWorkspace(
            version: 2,
            updatedAt: RootineDate.isoTimestamp(now),
            tasks: [WorkspaceTask(id: 1, text: "DST", done: false, time: "02:30", view: "dzis", calendarDate: "2026-03-08")],
            habits: [],
            lists: [],
            tags: []
        )

        let plan = RootineLocalNotificationPlanner.plan(
            workspace: workspace,
            context: RootineNotificationAccountContext(userID: "user"),
            preferences: RootineNotificationPreferences(timezoneIdentifier: timeZone.identifier),
            now: now,
            horizonDays: 1,
            maxPendingRequests: 64
        )

        XCTAssertEqual(plan.occurrences.count, 1)
        XCTAssertEqual(plan.occurrences[0].localDate, "2026-03-08")
        XCTAssertEqual(plan.occurrences[0].localTime, "03:30")
        XCTAssertEqual(
            RootineLocalNotificationPlanner.triggerComponents(for: plan.occurrences[0].scheduledAt, timeZone: timeZone).hour,
            3
        )
    }

    func testCompletedPausedAndDeletedRecordsDoNotProduceOccurrences() {
        let today = "2026-09-02"
        let workspace = TaskWorkspace(
            version: 2,
            updatedAt: "2026-09-02T07:00:00Z",
            tasks: [
                WorkspaceTask(id: 1, text: "done", done: true, time: "09:00", view: "dzis", calendarDate: today),
                WorkspaceTask(id: 2, text: "deleted", done: false, time: "10:00", view: "dzis", deleted: true, calendarDate: today)
            ],
            habits: [
                WorkspaceHabit(
                    id: 3,
                    name: "paused",
                    streak: 0,
                    done: false,
                    schedule: WorkspaceHabitSchedule(type: "daily", startDate: today),
                    time: "11:00",
                    pausePeriods: [WorkspaceHabitPause(startDate: today)]
                )
            ],
            lists: [],
            tags: []
        )
        let now = date(today, time: "07:00", timeZone: TimeZone(secondsFromGMT: 0)!)
        let plan = RootineLocalNotificationPlanner.plan(
            workspace: workspace,
            context: RootineNotificationAccountContext(userID: "user"),
            preferences: RootineNotificationPreferences(timezoneIdentifier: "UTC"),
            now: now,
            horizonDays: 1,
            maxPendingRequests: 64
        )

        XCTAssertTrue(plan.occurrences.isEmpty)
    }

    func testPlannerCapsPendingRequestsAndReportsTruncation() {
        let today = "2026-09-02"
        let tasks = (1...80).map { id in
            WorkspaceTask(id: id, text: "Task (id)", done: false, time: "09:00", view: "dzis", calendarDate: today)
        }
        let workspace = TaskWorkspace(version: 2, updatedAt: "2026-09-02T07:00:00Z", tasks: tasks, habits: [], lists: [], tags: [])
        let plan = RootineLocalNotificationPlanner.plan(
            workspace: workspace,
            context: RootineNotificationAccountContext(userID: "user"),
            preferences: RootineNotificationPreferences(timezoneIdentifier: "UTC"),
            now: date(today, time: "07:00", timeZone: TimeZone(secondsFromGMT: 0)!),
            horizonDays: 1,
            maxPendingRequests: 64
        )

        XCTAssertEqual(plan.occurrences.count, 64)
        XCTAssertEqual(plan.totalCandidateCount, 80)
        XCTAssertEqual(plan.truncatedCount, 16)
    }

    func testReconcileIsIdempotentAndReschedulesEditedOccurrence() async {
        let center = MockNotificationCenter(status: .authorized)
        let scheduler = RootineLocalNotificationScheduler(
            context: RootineNotificationAccountContext(userID: "user"),
            center: center
        )
        let now = date("2026-09-02", time: "07:00", timeZone: TimeZone(secondsFromGMT: 0)!)
        let first = workspace(taskTime: "09:00")

        let initial = await scheduler.reconcile(
            workspace: first,
            preferences: RootineNotificationPreferences(enabled: true, timezoneIdentifier: "UTC"),
            now: now
        )
        XCTAssertEqual(initial.scheduledCount, 1)
        let initialRequestCount = await center.requests().count
        XCTAssertEqual(initialRequestCount, 1)

        let unchanged = await scheduler.reconcile(
            workspace: first,
            preferences: RootineNotificationPreferences(enabled: true, timezoneIdentifier: "UTC"),
            now: now
        )
        XCTAssertEqual(unchanged.scheduledCount, 0)
        XCTAssertEqual(unchanged.cancelledCount, 0)

        let edited = await scheduler.reconcile(
            workspace: workspace(taskTime: "10:00"),
            preferences: RootineNotificationPreferences(enabled: true, timezoneIdentifier: "UTC"),
            now: now
        )
        XCTAssertEqual(edited.scheduledCount, 1)
        XCTAssertEqual(edited.cancelledCount, 1)
        let editedRequestCount = await center.requests().count
        let removeCallCount = await center.removeCalls()
        XCTAssertEqual(editedRequestCount, 1)
        XCTAssertEqual(removeCallCount, 1)
    }

    func testDeniedPermissionDoesNotAddAndCancelAllOnlyOwnsLocalRequests() async {
        let center = MockNotificationCenter(status: .denied)
        let scheduler = RootineLocalNotificationScheduler(
            context: RootineNotificationAccountContext(userID: "user"),
            center: center
        )
        let result = await scheduler.reconcile(
            workspace: workspace(taskTime: "09:00"),
            preferences: RootineNotificationPreferences(enabled: true, timezoneIdentifier: "UTC"),
            now: date("2026-09-02", time: "07:00", timeZone: TimeZone(secondsFromGMT: 0)!)
        )

        XCTAssertEqual(result.authorization, .denied)
        XCTAssertEqual(result.scheduledCount, 0)
        let addCallCount = await center.addCalls()
        XCTAssertEqual(addCallCount, 0)
    }

    private func workspace(taskTime: String) -> TaskWorkspace {
        TaskWorkspace(
            version: 2,
            updatedAt: "2026-09-02T07:00:00Z",
            tasks: [WorkspaceTask(id: 1, text: "Task", done: false, time: taskTime, view: "dzis", calendarDate: "2026-09-02")],
            habits: [],
            lists: [],
            tags: []
        )
    }

    private func date(_ date: String, time: String, timeZone: TimeZone) -> Date {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        let timeParts = time.split(separator: ":").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(
            timeZone: timeZone,
            year: parts[0], month: parts[1], day: parts[2],
            hour: timeParts[0], minute: timeParts[1]
        ))!
    }
}

private actor MockNotificationCenter: RootineNotificationCenter {
    private let status: RootineNotificationAuthorization
    private var storedRequests: [String: UNNotificationRequest] = [:]
    private var addCount = 0
    private var removeCount = 0

    init(status: RootineNotificationAuthorization) {
        self.status = status
    }

    func authorizationStatus() async -> RootineNotificationAuthorization { status }

    func requestAuthorization() async throws -> Bool {
        status.canSchedule
    }

    func pendingNotificationRequests() async -> [UNNotificationRequest] {
        return Array(storedRequests.values)
    }

    func add(_ request: sending UNNotificationRequest) async throws {
        storedRequests[request.identifier] = request
        addCount += 1
    }

    func removePendingNotificationRequests(withIdentifiers identifiers: [String]) async {
        identifiers.forEach { storedRequests.removeValue(forKey: $0) }
        removeCount += 1
    }

    func requests() async -> [UNNotificationRequest] {
        await pendingNotificationRequests()
    }

    func addCalls() async -> Int {
        return addCount
    }

    func removeCalls() async -> Int {
        return removeCount
    }
}
