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
}
