import Foundation
import XCTest
@testable import Rootine

final class TodayAggregationTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "pl_PL")
        calendar.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        return calendar
    }

    private var referenceDate: Date {
        ISO8601DateFormatter().date(from: "2026-09-02T10:30:00Z")!
    }

    func testAggregationUsesLocalDayAndIncludesEveryDomainOnce() {
        let day = "2026-09-02"
        let yesterday = "2026-09-01"
        let timestamp = "2026-09-02T10:00:00.000Z"
        var recurringSchedule = WorkspaceTaskSchedule(
            allDay: false,
            startTime: "08:00",
            completedDates: [day],
            timezone: "Europe/Warsaw"
        )
        recurringSchedule.completedAtByDate = [day: timestamp]

        let openTask = WorkspaceTask(
            id: 1, text: "Otwarty task", done: false, time: "11:00", view: "dzis",
            priority: .high, calendarDate: day
        )
        let completedTask = WorkspaceTask(
            id: 2, text: "Powtarzalny task", done: true, time: "09:00", view: "dzis",
            priority: .medium, calendarDate: day, schedule: recurringSchedule
        )
        let overdueTask = WorkspaceTask(
            id: 3, text: "Zaległy task", done: false, view: "wszystkie", calendarDate: yesterday
        )
        let habit = WorkspaceHabit(
            id: 4, name: "Spacer", streak: 2, done: true, completedDates: [day],
            schedule: WorkspaceHabitSchedule(type: "daily", startDate: day), priority: .low
        )
        let entry = NutritionEntry(
            id: "meal-1", name: "Owsianka", portion: "1 miska", calories: 400,
            protein: 20, carbs: 50, fat: 10, createdAt: timestamp
        )
        let note = NoteRecord(
            id: "note-1", title: "Plan", body: "Treść", kind: "text", items: [], tags: [],
            listId: "list", color: .blue, pinned: false, archived: false,
            createdAt: timestamp, updatedAt: timestamp
        )
        let workout = SportWorkout(
            id: "workout-1", title: "Bieg", date: day, minutes: 30,
            kind: "Bieg", completed: true, createdAt: timestamp
        )
        let goal = GoalRecord(
            id: "goal-1", title: "Forma", detail: "", current: 1, target: 2,
            icon: "target", createdAt: timestamp, updatedAt: timestamp
        )
        let workTask = WorkspaceTask(
            id: 5, text: "Raport", done: false, time: "12:00", view: "wszystkie",
            calendarDate: day,
            source: CommitmentTaskSource(kind: "work", entity: "task", context: "work", href: "/work")
        )
        let trip = TravelRecord(
            id: "trip-1", destination: "Gdańsk", dateRange: "2–4 września", nights: 2,
            itinerary: [], createdAt: timestamp, updatedAt: timestamp
        )
        let reminder = HealthReminder(id: "reminder-1", title: "Spacer", detail: "", completedDates: [])
        let affair = AffairMatter(
            id: "affair-1", title: "Ubezpieczenie", category: "dom", priority: "high",
            status: "open", dueDate: day, note: "", createdAt: timestamp
        )

        let tasks = [overdueTask, openTask, completedTask, openTask]
        var nutrition = NutritionWorkspace.empty
        nutrition.days[day] = NutritionDay(
            date: day, waterMl: 500, source: "user", entries: NutritionMealEntries(
                breakfast: [entry], lunch: [entry], snack: [], dinner: []
            )
        )
        var taskWorkspace = TaskWorkspace.empty
        taskWorkspace.tasks = tasks
        taskWorkspace.habits = [habit]
        taskWorkspace.updatedAt = timestamp
        let aggregate = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a",
            referenceDate: referenceDate,
            calendar: calendar,
            taskWorkspace: taskWorkspace,
            nutritionWorkspace: nutrition,
            notesWorkspace: NotesWorkspace(version: 1, updatedAt: timestamp, lists: [], notes: [note]),
            sportWorkspace: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout]),
            goalsWorkspace: GoalsWorkspace(version: 1, updatedAt: timestamp, goals: [goal]),
            workWorkspace: WorkWorkspace(version: 1, updatedAt: timestamp, activeFocusStartedAt: nil, focusSessions: []),
            travelWorkspace: TravelWorkspace(version: 1, updatedAt: timestamp, trips: [trip]),
            healthWorkspace: HealthWorkspace(version: 1, updatedAt: timestamp, checkIns: [:], reminders: [reminder]),
            affairsWorkspace: AffairsWorkspace(version: 2, matters: [affair], oneTimePayments: [], payments: [], subscriptions: [], documents: [], vehicles: [], vehicleItems: [], budgets: []),
            statuses: [.sport: .stale(message: "offline")]
        ))

        XCTAssertEqual(aggregate.boundary.dateKey, day)
        XCTAssertEqual(aggregate.todayTasks.map(\.id), [2, 1])
        XCTAssertEqual(aggregate.overdueTasks.map(\.id), [3])
        XCTAssertEqual(aggregate.todayHabits.map(\.id), [4])
        XCTAssertEqual(aggregate.summaries[.nutrition]?.metric, "400 kcal")
        XCTAssertEqual(aggregate.summaries[.nutrition]?.total, 1)
        XCTAssertEqual(aggregate.summaries[.sport]?.completed, 1)
        XCTAssertEqual(aggregate.summaries[.work]?.total, 1)
        XCTAssertEqual(aggregate.summaries[.health]?.total, 1)
        XCTAssertEqual(aggregate.summaries[.affairs]?.total, 1)
        XCTAssertEqual(aggregate.summaries[.sport]?.status.state, .stale)
        XCTAssertEqual(aggregate.summaries.count, TodayDomain.allCases.count)
        XCTAssertEqual(Set(aggregate.queue.map(\.id)).count, aggregate.queue.count)
        XCTAssertEqual(aggregate.priorityTotal, 4)
    }

    func testTimestampAndDateKeysRespectExplicitTimezoneAcrossMidnight() {
        let date = ISO8601DateFormatter().date(from: "2026-09-01T22:30:00Z")!
        let day = "2026-09-02"
        let note = NoteRecord(
            id: "note", title: "Późna zmiana", body: "", kind: "text", items: [], tags: [],
            listId: "", color: .graphite, pinned: false, archived: false,
            createdAt: "2026-09-01T22:00:00Z", updatedAt: "2026-09-01T22:30:00Z"
        )
        let aggregate = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a",
            referenceDate: date,
            calendar: calendar,
            notesWorkspace: NotesWorkspace(version: 1, updatedAt: note.updatedAt, lists: [], notes: [note])
        ))

        XCTAssertEqual(aggregate.boundary.dateKey, day)
        XCTAssertEqual(aggregate.summaries[.notes]?.metric, "1 zmienionych dzisiaj")
    }

    func testDegradedDomainStatesArePartialAndDoNotEraseHealthyData() {
        let task = WorkspaceTask(id: 1, text: "Task", done: false, view: "dzis", calendarDate: "2026-09-02")
        var workspace = TaskWorkspace.empty
        workspace.tasks = [task]
        let aggregate = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a",
            referenceDate: referenceDate,
            calendar: calendar,
            taskWorkspace: workspace,
            statuses: [
                .nutrition: .failed("Nutrition niedostępne"),
                .sport: .unavailable("Sport niedostępny")
            ]
        ))

        XCTAssertEqual(aggregate.summaries[.tasks]?.status.state, .fresh)
        XCTAssertEqual(aggregate.summaries[.nutrition]?.status.state, .failed)
        XCTAssertEqual(aggregate.summaries[.sport]?.status.state, .unavailable)
        XCTAssertEqual(aggregate.totalDailyItems, 1)
        XCTAssertEqual(aggregate.degradedDomains, [.nutrition, .sport])
    }

    func testCacheIsAccountScopedAndBounded() async {
        let cache = TodayAggregationCache(maxEntriesPerAccount: 1)
        let first = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a", referenceDate: referenceDate, calendar: calendar
        ))
        let second = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-b", referenceDate: referenceDate.addingTimeInterval(86_400), calendar: calendar
        ))
        await cache.insert(first)
        let firstValue = await cache.value(accountID: "account-a", dateKey: first.boundary.dateKey)
        let crossAccountValue = await cache.value(accountID: "account-b", dateKey: first.boundary.dateKey)
        XCTAssertNotNil(firstValue)
        XCTAssertNil(crossAccountValue)
        await cache.insert(second)
        let evictedValue = await cache.value(accountID: "account-a", dateKey: first.boundary.dateKey)
        let secondValue = await cache.value(accountID: "account-b", dateKey: second.boundary.dateKey)
        XCTAssertNil(evictedValue)
        XCTAssertNotNil(secondValue)
    }

    @MainActor
    func testTodayQuickActionUsesValidatedIdempotentWritePath() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        await environment.applyTodayQuickAction(
            .task(title: "Zadanie z Today", time: "10:00", priority: .high),
            operationID: "today-action"
        )
        await environment.applyTodayQuickAction(
            .task(title: "Zadanie z Today", time: "10:00", priority: .high),
            operationID: "today-action"
        )

        XCTAssertEqual(environment.taskWorkspace.tasks.count, 1)
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.calendarDate, RootineDate.localDate())
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.priority, .high)
    }

    func testBulkRescheduleEmptyPlanIsAnExplicitNoOp() {
        let plan = TodayBulkReschedulePlanner.plan(tasks: [], todayKey: "2026-09-02")

        XCTAssertTrue(plan.changes.isEmpty)
        XCTAssertTrue(plan.skippedRecurring.isEmpty)
        XCTAssertTrue(plan.isEmpty)
    }

    func testBulkRescheduleMovesManyOneOffsPreservesFieldsAndSkipsRecurrence() {
        let today = "2026-09-02"
        let yesterday = "2026-09-01"
        let schedule = WorkspaceTaskSchedule(
            allDay: true,
            startTime: "",
            reminderMinutes: 15,
            recurrence: "daily",
            completedDates: ["2026-08-31"],
            timezone: "Europe/Warsaw"
        )
        let first = WorkspaceTask(
            id: 10,
            text: "Ważne zaległe",
            done: false,
            time: "09:15",
            endTime: "10:00",
            tags: ["tag-a"],
            list: "list-a",
            view: "wszystkie",
            priority: .high,
            notes: "Nie zgubić notatki",
            calendarDate: yesterday
        )
        let second = WorkspaceTask(
            id: 11,
            text: "Drugie zaległe",
            done: false,
            time: "14:30",
            view: "7dni",
            priority: .low,
            calendarDate: yesterday
        )
        let recurring = WorkspaceTask(
            id: 12,
            text: "Codzienny przegląd",
            done: false,
            view: "wszystkie",
            calendarDate: yesterday,
            schedule: schedule
        )
        let completed = WorkspaceTask(
            id: 13,
            text: "Już zrobione",
            done: true,
            view: "wszystkie",
            calendarDate: yesterday
        )

        let plan = TodayBulkReschedulePlanner.plan(
            tasks: [first, second, recurring, completed],
            todayKey: today
        )

        XCTAssertEqual(plan.changes.map { $0.original.id }, [10, 11])
        XCTAssertEqual(plan.skippedRecurring.map(\.id), [12])
        XCTAssertEqual(plan.changes[0].updated.calendarDate, today)
        XCTAssertEqual(plan.changes[0].updated.view, "dzis")
        XCTAssertEqual(plan.changes[0].updated.time, first.time)
        XCTAssertEqual(plan.changes[0].updated.endTime, first.endTime)
        XCTAssertEqual(plan.changes[0].updated.priority, first.priority)
        XCTAssertEqual(plan.changes[0].updated.notes, first.notes)
        XCTAssertEqual(plan.changes[0].updated.list, first.list)
        XCTAssertEqual(plan.changes[0].updated.tags, first.tags)
        XCTAssertEqual(plan.skippedRecurring[0].calendarDate, yesterday)
        XCTAssertEqual(plan.skippedRecurring[0].schedule, recurring.schedule)
    }

    func testBulkRescheduleUndoIsConditionalAndSupportsPartialRecovery() {
        let today = "2026-09-02"
        let yesterday = "2026-09-01"
        let first = WorkspaceTask(id: 20, text: "Edytowane później", done: false, view: "wszystkie", calendarDate: yesterday)
        let second = WorkspaceTask(id: 21, text: "Bez zmian", done: false, view: "wszystkie", calendarDate: yesterday)
        let plan = TodayBulkReschedulePlanner.plan(tasks: [first, second], todayKey: today)
        var current = plan.changes.map(\.updated)
        current[0].text = "Nowszy tekst"

        let undo = TodayBulkReschedulePlanner.undo(changes: plan.changes, in: current)

        XCTAssertEqual(undo.restoredIDs, [21])
        XCTAssertEqual(undo.skippedIDs, [20])
        XCTAssertEqual(undo.tasks.first(where: { $0.id == 20 })?.text, "Nowszy tekst")
        XCTAssertEqual(undo.tasks.first(where: { $0.id == 21 }), second)
    }

    @MainActor
    func testBulkRescheduleReportsOfflineAndIsIdempotent() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))
        let yesterday = RootineDate.shiftLocalDate(RootineDate.localDate(), by: -1)
        environment.setTaskWorkspaceForTests(TaskWorkspace(
            version: 2,
            updatedAt: RootineDate.isoTimestamp(),
            tasks: [WorkspaceTask(id: 30, text: "Offline zaległe", done: false, view: "wszystkie", calendarDate: yesterday)],
            habits: [],
            lists: [],
            tags: []
        ))

        let first = await environment.rescheduleOverdueTasksToToday(
            todayKey: RootineDate.localDate(),
            operationID: "bulk-offline"
        )
        let second = await environment.rescheduleOverdueTasksToToday(
            todayKey: RootineDate.localDate(),
            operationID: "bulk-offline-retry"
        )

        guard case .moved(let report) = first else {
            return XCTFail("Pierwsza operacja powinna przenieść zaległe zadanie")
        }
        XCTAssertEqual(report.syncState, .queuedOffline)
        XCTAssertEqual(report.changes.map { $0.original.id }, [30])
        guard case .noChanges(_) = second else {
            return XCTFail("Powtórzenie nie powinno utworzyć drugiego ruchu")
        }
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.calendarDate, RootineDate.localDate())
    }

    func testLargeAccountAggregationIsMeasured() {
        var workspace = TaskWorkspace.empty
        workspace.tasks = (0..<2_000).map { index in
            WorkspaceTask(
                id: index,
                text: "Task \(index)",
                done: index.isMultiple(of: 3),
                time: String(format: "%02d:%02d", (index % 24), index % 60),
                view: "dzis",
                calendarDate: "2026-09-02"
            )
        }
        measure {
            _ = TodayAggregationService.aggregate(TodayAggregationInput(
                accountID: "large-account",
                referenceDate: referenceDate,
                calendar: calendar,
                taskWorkspace: workspace
            ))
        }
    }

    func testSwipeBelowThresholdDoesNotTriggerAnAction() {
        XCTAssertNil(TodaySwipeMotion.action(for: CGSize(width: 71.99, height: 0)))
    }

    func testSwipeAtThresholdCompletesExactlyOnceInThePositiveDirection() {
        XCTAssertEqual(TodaySwipeMotion.action(for: CGSize(width: 72, height: 0)), .complete)
    }

    func testSwipeAboveThresholdOpensRescheduleInTheNegativeDirection() {
        XCTAssertEqual(TodaySwipeMotion.action(for: CGSize(width: -72.01, height: 0)), .reschedule)
    }

    func testVerticalTranslationNeverTriggersSwipeAction() {
        XCTAssertNil(TodaySwipeMotion.action(for: CGSize(width: 72, height: 72)))
        XCTAssertEqual(TodaySwipeMotion.clampedOffset(for: CGSize(width: 400, height: 0)), 140)
        XCTAssertEqual(TodaySwipeMotion.clampedOffset(for: CGSize(width: -400, height: 0)), -140)
    }

    func testLongPressArbitrationArmsOnlyAtTheContractDuration() {
        XCTAssertFalse(TodayLongPressArbitration.isArmed(after: 0.54))
        XCTAssertTrue(TodayLongPressArbitration.isArmed(after: 0.55))
        XCTAssertTrue(TodayLongPressArbitration.isArmed(after: 0.56))
    }

    func testLongPressArbitrationKeepsVerticalScrollSeparateFromHorizontalCancel() {
        XCTAssertTrue(TodayLongPressArbitration.isDominantVertical(CGSize(width: 4, height: 24)))
        XCTAssertFalse(TodayLongPressArbitration.isDominantVertical(CGSize(width: 24, height: 4)))
        XCTAssertTrue(TodayLongPressArbitration.shouldPassThroughToScroll(for: CGSize(width: 4, height: 24)))
        XCTAssertFalse(TodayLongPressArbitration.shouldPassThroughToScroll(for: CGSize(width: 24, height: 4)))
        XCTAssertTrue(TodayLongPressArbitration.shouldCancelVerticalDrag(for: CGSize(width: 24, height: 4)))
        XCTAssertFalse(TodayLongPressArbitration.shouldCancelVerticalDrag(for: CGSize(width: 4, height: 24)))
        XCTAssertFalse(TodayLongPressArbitration.shouldCancelVerticalDrag(for: CGSize(width: 20, height: 20)))
    }

    func testCancelledLongPressCannotBecomeASecondSwipeAction() {
        let verticalDrag = CGSize(width: 24, height: 4)

        XCTAssertTrue(TodayLongPressArbitration.shouldCancelVerticalDrag(for: verticalDrag))
        XCTAssertNil(TodayLongPressArbitration.swipeAction(
            after: .complete,
            isLongPressCancelled: true
        ))
        XCTAssertEqual(TodayLongPressArbitration.swipeAction(
            after: .complete,
            isLongPressCancelled: false
        ), .complete)
    }

    func testTodayDropResolverMapsEveryRenderedSectionAndSeparator() {
        let frames: [TodayTaskSection: CGRect] = [
            .overdue: CGRect(x: 0, y: 40, width: 320, height: 72),
            .today: CGRect(x: 0, y: 132, width: 320, height: 144),
            .completed: CGRect(x: 0, y: 300, width: 320, height: 64),
        ]

        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 60, in: frames), .overdue)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 180, in: frames), .today)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 320, in: frames), .completed)
        // The midpoint of each actual separator gap determines which side
        // owns the drop, so a one-pixel movement cannot use a fake date.
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 120, in: frames), .overdue)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 125, in: frames), .today)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 286, in: frames), .today)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 292, in: frames), .completed)
        XCTAssertEqual(TodayTaskSectionDropResolver.section(atY: 210, in: frames), .today)
    }

    func testTodayDropResolverCancelsOutsideRenderedRange() {
        let frames: [TodayTaskSection: CGRect] = [
            .overdue: CGRect(x: 0, y: 40, width: 320, height: 72),
            .today: CGRect(x: 0, y: 132, width: 320, height: 144),
            .completed: CGRect(x: 0, y: 300, width: 320, height: 64),
        ]

        XCTAssertNil(TodayTaskSectionDropResolver.section(atY: 39, in: frames))
        XCTAssertNil(TodayTaskSectionDropResolver.section(atY: 365, in: frames))
        XCTAssertNil(TodayTaskSectionDropResolver.section(atY: -80, in: frames))
    }

    func testTodayDropIndicatorUsesTopMiddleAndBottomRowBounds() {
        let sectionFrame = CGRect(x: 0, y: 40, width: 320, height: 300)
        let rows = [
            CGRect(x: 0, y: 80, width: 320, height: 76),
            CGRect(x: 0, y: 176, width: 320, height: 44),
            CGRect(x: 0, y: 244, width: 320, height: 64),
        ]

        XCTAssertEqual(TodayTaskDropIndicatorResolver.insertionY(atY: 90, in: sectionFrame, rowFrames: rows), 80)
        XCTAssertEqual(TodayTaskDropIndicatorResolver.insertionY(atY: 200, in: sectionFrame, rowFrames: rows), 220)
        XCTAssertEqual(TodayTaskDropIndicatorResolver.insertionY(atY: 330, in: sectionFrame, rowFrames: rows), 308)
    }

    func testTodayDropIndicatorCentersEmptySectionAndCancelsOutsideIt() {
        let sectionFrame = CGRect(x: 0, y: 200, width: 320, height: 44)

        XCTAssertEqual(TodayTaskDropIndicatorResolver.insertionY(atY: 220, in: sectionFrame, rowFrames: []), 222)
        XCTAssertNil(TodayTaskDropIndicatorResolver.insertionY(atY: 199, in: sectionFrame, rowFrames: []))
        XCTAssertNil(TodayTaskDropIndicatorResolver.insertionY(atY: 245, in: sectionFrame, rowFrames: []))
    }

    func testRecurringOccurrenceCompletionKeepsSeriesAnchor() {
        let anchor = "2026-09-01"
        let recurring = WorkspaceTask(
            id: 42,
            text: "Powtarzalne zadanie",
            done: false,
            time: "09:00",
            view: "dzis",
            calendarDate: anchor,
            schedule: WorkspaceTaskSchedule(
                allDay: false,
                startTime: "09:00",
                recurrence: "daily",
                timezone: "Europe/Warsaw"
            )
        )

        let occurrence = rootineTaskSettingCompletion(
            recurring,
            dateKey: "2026-09-02",
            done: true,
            completedAt: "2026-09-02T08:00:00.000Z"
        )

        XCTAssertEqual(occurrence.calendarDate, anchor)
        XCTAssertEqual(occurrence.schedule?.recurrence, "daily")
        XCTAssertEqual(occurrence.schedule?.completedDates, ["2026-09-02"])
        XCTAssertFalse(occurrence.done)
    }
}
