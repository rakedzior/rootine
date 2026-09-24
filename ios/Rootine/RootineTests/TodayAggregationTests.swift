import Foundation
import XCTest
@testable import Rootine

final class RemainingSpacesModelTests: XCTestCase {
    @MainActor
    func testChecklistOnlyNoteSavesAndCanBeMovedOutOfFolderWithoutRestoringArchive() async throws {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil, supabasePublishableKey: "", backendURL: nil,
            authCallbackScheme: "", termsURL: nil, privacyURL: nil))
        await environment.createNoteList(name: "Plany", operationID: "notes-folder")
        let folderID = try XCTUnwrap(environment.notesWorkspace.lists.first?.id)
        let now = RootineDate.isoTimestamp()
        var note = NoteRecord(id: "checklist-only", title: "", body: "", kind: "checklist",
            items: [NoteChecklistItem(id: "one", text: "Dokumenty", checked: true)],
            tags: ["podróż"], listId: folderID, color: .blue, pinned: false,
            archived: true, createdAt: now, updatedAt: now)
        await environment.upsertNote(note)
        XCTAssertEqual(environment.notesWorkspace.notes.first?.items, note.items)
        note.listId = ""
        await environment.upsertNote(note)
        let saved = try XCTUnwrap(environment.notesWorkspace.notes.first)
        XCTAssertEqual(saved.listId, "")
        XCTAssertTrue(saved.archived)
        XCTAssertEqual(saved.tags, ["podróż"])
        XCTAssertEqual(environment.notesWorkspace.lists.count, 1)

        var empty = note
        empty.id = "empty"
        empty.items = [NoteChecklistItem(id: "blank", text: "  ", checked: false)]
        await environment.upsertNote(empty)
        XCTAssertEqual(environment.notesWorkspace.notes.count, 1)
    }

    @MainActor
    func testParentWorkTaskCannotLeaveItsChildInAnotherProject() async throws {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil, supabasePublishableKey: "", backendURL: nil,
            authCallbackScheme: "", termsURL: nil, privacyURL: nil))
        await environment.addWorkProject(name: "Pierwszy", operationID: "first")
        await environment.addWorkProject(name: "Drugi", operationID: "second")
        let first = try XCTUnwrap(environment.workWorkspace.projects.first(where: { $0.name == "Pierwszy" }))
        let second = try XCTUnwrap(environment.workWorkspace.projects.first(where: { $0.name == "Drugi" }))
        await environment.addWorkItem(title: "Plan", projectID: first.id, operationID: "parent")
        let parentID = try XCTUnwrap(environment.workWorkspace.tasks.first?.id)
        await environment.addWorkItem(title: "Część planu", projectID: first.id, parentID: parentID, operationID: "child")
        let original = environment.workWorkspace.tasks
        await environment.updateWorkItem(id: parentID, title: "Plan", projectID: second.id)
        XCTAssertEqual(environment.workWorkspace.tasks, original)
        await environment.updateWorkItem(id: parentID, title: "Zmieniony plan", projectID: first.id)
        XCTAssertEqual(environment.workWorkspace.tasks.first(where: { $0.id == parentID })?.title, "Zmieniony plan")
        XCTAssertEqual(environment.workWorkspace.tasks.first(where: { $0.parentId == parentID })?.projectId, first.id)
    }
}

final class TravelInteractionTests: XCTestCase {
    @MainActor
    func testPackingAndItineraryActionsPreserveOtherTripData() async throws {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil, supabasePublishableKey: "", backendURL: nil,
            authCallbackScheme: "", termsURL: nil, privacyURL: nil))
        await environment.addTrip(destination: "Kraków", dateRange: "2026-09-23 – 2026-09-25", nights: 2)
        let tripID = try XCTUnwrap(environment.travelWorkspace.trips.first?.id)
        await environment.addTravelPackingItem(tripID: tripID, label: "Dokumenty", quantity: 2)
        let packingID = try XCTUnwrap(environment.travelWorkspace.trips.first?.packingItems.first?.id)
        await environment.toggleTravelPackingItem(tripID: tripID, itemID: packingID)
        XCTAssertEqual(environment.travelWorkspace.trips.first?.packingItems.first?.packed, true)
        XCTAssertEqual(environment.travelWorkspace.trips.first?.packingItems.first?.quantity, 2)

        let first = TravelItineraryItem(id: "a", day: "2026-09-23", title: "Spacer", detail: "Rynek")
        let second = TravelItineraryItem(id: "b", day: "2026-09-23", title: "Obiad", detail: "Rezerwacja")
        await environment.upsertTravelItineraryItem(tripID: tripID, item: first)
        await environment.upsertTravelItineraryItem(tripID: tripID, item: second)
        await environment.moveTravelItineraryItem(tripID: tripID, itemID: "b", beforeID: "a")
        XCTAssertEqual(environment.travelWorkspace.trips.first?.itinerary.map(\.id), ["b", "a"])
        await environment.moveTravelItineraryItem(tripID: tripID, itemID: "b", beforeID: "missing")
        XCTAssertEqual(environment.travelWorkspace.trips.first?.itinerary.map(\.id), ["b", "a"])
        var edited = second
        edited.title = "Kolacja"
        await environment.upsertTravelItineraryItem(tripID: tripID, item: edited)
        XCTAssertEqual(environment.travelWorkspace.trips.first?.itinerary.first?.detail, "Rezerwacja")
        await environment.deleteTravelItineraryItem(tripID: tripID, itemID: "a")
        await environment.deleteTravelPackingItem(tripID: tripID, itemID: packingID)
        let trip = try XCTUnwrap(environment.travelWorkspace.trips.first)
        XCTAssertEqual(trip.itinerary.map(\.title), ["Kolacja"])
        XCTAssertTrue(trip.packingItems.isEmpty)
        XCTAssertEqual(trip.destination, "Kraków")
        XCTAssertEqual(trip.nights, 2)
        XCTAssertTrue(rootineValidateTravelWorkspace(environment.travelWorkspace).isEmpty)
    }
}

final class HabitSectionTests: XCTestCase {
    func testPauseExcludesLegacyHabitFromTodayWithoutErasingHistory() {
        let habit = WorkspaceHabit(id: 1, name: "Spacer", streak: 1, done: false,
            completedDates: ["2026-09-22"], pausePeriods: [WorkspaceHabitPause(startDate: "2026-09-23")])
        XCTAssertFalse(rootineHabitIsScheduledOnDate(habit, dateKey: "2026-09-23"))
        XCTAssertTrue(rootineHabitIsDoneOnDate(habit, dateKey: "2026-09-22"))
        XCTAssertEqual(rootineHabitDayState(habit, dateKey: "2026-09-23"), .paused)
    }

    func testResumedHabitKeepsHistoryAndSkipsPauseInStreak() {
        let habit = WorkspaceHabit(id: 2, name: "Spacer", streak: 0, done: false,
            completedDates: ["2026-09-20", "2026-09-23"],
            schedule: WorkspaceHabitSchedule(type: "daily", startDate: "2026-09-20"),
            pausePeriods: [WorkspaceHabitPause(startDate: "2026-09-21", endDate: "2026-09-22")])
        XCTAssertTrue(rootineHabitIsScheduledOnDate(habit, dateKey: "2026-09-23"))
        XCTAssertEqual(rootineHabitCurrentStreak(habit, referenceDate: "2026-09-23"), 2)
    }
}

final class CalendarLayoutTests: XCTestCase {
    func testScheduleDraftValidatesTimeAndClearsAllSchedulingFields() throws {
        var draft = CalendarScheduleDraft(date: try XCTUnwrap(RootineDate.localDateValue("2026-09-24")))
        draft.allDay = false
        draft.startMinutes = 17 * 60
        draft.endMinutes = 18 * 60
        draft.reminder = 15
        draft.recurrence = "weekly"
        XCTAssertTrue(draft.isValid)
        XCTAssertEqual(draft.schedule?.startTime, "17:00")
        XCTAssertEqual(draft.schedule?.endTime, "18:00")
        XCTAssertTrue(rootineValidTaskSchedule(try XCTUnwrap(draft.schedule), taskDate: "2026-09-24"))
        draft.endMinutes = 16 * 60
        XCTAssertFalse(draft.isValid)
        draft.clear()
        XCTAssertTrue(draft.isValid)
        XCTAssertNil(draft.schedule)
        XCTAssertEqual(draft.reminder, -1)
        XCTAssertTrue(draft.recurrence.isEmpty)
    }

    func testMonthContainsWholeWeeksAndLeapDay() throws {
        let date = try XCTUnwrap(RootineDate.localDateValue("2028-02-15"))
        let days = CalendarLayout.monthDays(date)
        XCTAssertEqual(days.count % 7, 0)
        XCTAssertEqual(CalendarLayout.calendar.component(.weekday, from: try XCTUnwrap(days.first)), 2)
        XCTAssertEqual(CalendarLayout.calendar.component(.weekday, from: try XCTUnwrap(days.last)), 1)
        XCTAssertTrue(days.map { RootineDate.localDate($0) }.contains("2028-02-29"))
        XCTAssertEqual(Set(days.map { RootineDate.localDate($0) }).count, days.count)
    }

    func testWeekCrossesYearBoundaryAndThreeDaysAreConsecutive() throws {
        let date = try XCTUnwrap(RootineDate.localDateValue("2027-01-01"))
        let week = CalendarLayout.visibleDays(.week, date: date).map { RootineDate.localDate($0) }
        XCTAssertEqual(week.first, "2026-12-28")
        XCTAssertEqual(week.last, "2027-01-03")
        XCTAssertEqual(CalendarLayout.visibleDays(.threeDays, date: date).map { RootineDate.localDate($0) }, ["2027-01-01", "2027-01-02", "2027-01-03"])
    }

    func testOverlappingEventsHaveSeparateLanesAndLaterEventsUseFullWidth() {
        let tasks = [(1, "09:00", "10:00"), (2, "09:30", "10:30"), (3, "11:00", "12:00")].map { id, start, end in
            RootineCalendarOccurrence(key: "\(id)", task: WorkspaceTask(id: id, text: "Event", done: false, time: start, endTime: end, view: "dzis"), calendarDate: "2026-09-23", isVirtual: false)
        }
        let layout = CalendarEventPlacement.layout(tasks)
        XCTAssertEqual(layout.map(\.lane), [0, 1, 0])
        XCTAssertEqual(layout.map(\.lanes), [2, 2, 1])
    }

    func testFiltersUseOccurrenceCompletionRatherThanGlobalFlag() {
        let task = WorkspaceTask(id: 1, text: "Review", done: true, view: "dzis", priority: .high, calendarDate: "2026-09-23",
            schedule: WorkspaceTaskSchedule(allDay: true, startTime: "", recurrence: "daily", timezone: "Europe/Warsaw"))
        let occurrences = rootineTaskOccurrences([task], from: "2026-09-23", through: "2026-09-24")
        var filter = CalendarTaskFilter()
        filter.showCompleted = false
        XCTAssertEqual(occurrences.filter(filter.includes).map(\.calendarDate), ["2026-09-24"])
        filter.priority = "low"
        XCTAssertTrue(occurrences.filter(filter.includes).isEmpty)
    }
}

final class TodayAggregationTests: XCTestCase {
    func testPlanSummarySeparatesRemainingTasksAndLocalDayCompletions() {
        let tasks = [
            WorkspaceTask(id: 1, text: "Zaległe", done: false, view: "dzis", priority: .high, calendarDate: "2026-09-01"),
            WorkspaceTask(id: 2, text: "Dziś", done: false, view: "dzis", calendarDate: "2026-09-02"),
            WorkspaceTask(id: 3, text: "Bez godziny", done: false, view: "dzis", priority: .medium),
            WorkspaceTask(id: 4, text: "Zaległe wykonane dziś", done: true, completedAt: "2026-09-01T22:30:00Z", view: "dzis", priority: .high, calendarDate: "2026-09-01"),
            WorkspaceTask(id: 5, text: "Wykonane wczoraj", done: true, completedAt: "2026-09-01T18:00:00Z", view: "dzis", calendarDate: "2026-09-02"),
            WorkspaceTask(id: 6, text: "Usunięte", done: false, view: "dzis", deleted: true, calendarDate: "2026-09-02"),
            WorkspaceTask(id: 7, text: "Cykliczne", done: false, completedAt: "2026-08-26T10:00:00Z", view: "dzis", calendarDate: "2026-08-26",
                schedule: WorkspaceTaskSchedule(allDay: true, startTime: "", recurrence: "weekly", completedDates: ["2026-09-02"], timezone: "Europe/Warsaw"))
        ]
        let summary = TodayPlanSummary(tasks: tasks + [tasks[0]], date: referenceDate, calendar: calendar)
        XCTAssertEqual(summary.overdueIDs, [1])
        XCTAssertEqual(summary.todayIDs, [2, 3])
        XCTAssertEqual(summary.completedIDs, [4, 7])
        XCTAssertEqual(summary.remainingPriorities, 2)
    }

    func testManualOrderMovesInBothDirectionsAndIgnoresForeignIDs() {
        let ids = ["task-1", "task-2", "task-3"]
        XCTAssertEqual(TodayTaskMovement.reordered(ids, source: "task-1", target: "task-3"), ["task-2", "task-3", "task-1"])
        XCTAssertEqual(TodayTaskMovement.reordered(ids, source: "task-3", target: "task-1"), ["task-3", "task-1", "task-2"])
        XCTAssertEqual(TodayTaskMovement.reordered(ids, source: "foreign", target: "task-1"), ids)
    }

    func testNativeTodayDropReordersUntimedTasksOnlyWithinTheirDay() {
        let source = WorkspaceTask(id: 1, text: "Pierwsze", done: false, view: "dzis", calendarDate: "2026-09-02")
        let target = WorkspaceTask(id: 2, text: "Drugie", done: true, time: "", view: "dzis", calendarDate: "2026-09-02")
        XCTAssertEqual(TodayTaskMovement.dropAction(source: source, target: target, todayKey: "2026-09-02"), .reorder)
        var undated = target
        undated.calendarDate = nil
        XCTAssertEqual(TodayTaskMovement.dropAction(source: source, target: undated, todayKey: "2026-09-02"), .reorder)
        var otherDay = target
        otherDay.calendarDate = "2026-09-01"
        XCTAssertEqual(TodayTaskMovement.dropAction(source: source, target: otherDay, todayKey: "2026-09-02"), .reschedule)
    }

    func testNativeTodayDropOfEitherTimedRowRequiresScheduleConfirmation() {
        let untimed = WorkspaceTask(id: 1, text: "Bez godziny", done: false, view: "dzis", calendarDate: "2026-09-02")
        let timed = WorkspaceTask(id: 2, text: "Z godziną", done: false, time: "09:00", view: "dzis", calendarDate: "2026-09-02")
        XCTAssertEqual(TodayTaskMovement.dropAction(source: timed, target: untimed, todayKey: "2026-09-02"), .reschedule)
        XCTAssertEqual(TodayTaskMovement.dropAction(source: untimed, target: timed, todayKey: "2026-09-02"), .reschedule)
    }

    func testNativeTodayDropRejectsSelfDeletedAndWorkRecords() {
        let source = WorkspaceTask(id: 1, text: "Zadanie", done: false, view: "dzis", calendarDate: "2026-09-02")
        XCTAssertNil(TodayTaskMovement.dropAction(source: source, target: source, todayKey: "2026-09-02"))
        var unavailable = WorkspaceTask(id: 2, text: "Usunięte", done: false, view: "dzis", deleted: true, calendarDate: "2026-09-02")
        XCTAssertNil(TodayTaskMovement.dropAction(source: source, target: unavailable, todayKey: "2026-09-02"))
        unavailable.deleted = false
        unavailable.source = CommitmentTaskSource(kind: "work", entity: "task", context: "Projekt", href: "/work")
        XCTAssertNil(TodayTaskMovement.dropAction(source: unavailable, target: source, todayKey: "2026-09-02"))
    }

    func testMovingTimedTaskAcrossMidnightKeepsDurationAndMetadata() throws {
        let task = WorkspaceTask(id: 901, text: "Test", done: true, completedAt: "2026-09-02T10:00:00Z",
            time: "09:00", endTime: "11:00", view: "dzis", priority: .high, calendarDate: "2026-09-02",
            schedule: WorkspaceTaskSchedule(allDay: false, startTime: "09:00", endTime: "11:00",
                reminderMinutes: 15, recurrence: "weekly", timezone: "Europe/Warsaw"))
        let moved = try XCTUnwrap(TodayTaskMovement.rescheduled(task, dateKey: "2026-09-03", time: "23:30"))
        XCTAssertEqual(moved.time, "23:30")
        XCTAssertEqual(moved.endTime, "01:30")
        XCTAssertEqual(moved.schedule?.endDate, "2026-09-04")
        XCTAssertEqual(moved.schedule?.reminderMinutes, 15)
        XCTAssertEqual(moved.schedule?.recurrence, "weekly")
        XCTAssertEqual(moved.priority, .high)
        XCTAssertEqual(moved.completedAt, task.completedAt)
        XCTAssertTrue(moved.done)
    }

    func testMovingAllDayTaskKeepsDaySpanAndRejectsInvalidDate() throws {
        let task = WorkspaceTask(id: 902, text: "Test", done: false, view: "dzis", calendarDate: "2026-09-01",
            schedule: WorkspaceTaskSchedule(allDay: true, startTime: "", endDate: "2026-09-03", timezone: "Europe/Warsaw"))
        let moved = try XCTUnwrap(TodayTaskMovement.rescheduled(task, dateKey: "2026-09-10", time: nil))
        XCTAssertEqual(moved.schedule?.endDate, "2026-09-12")
        XCTAssertTrue(moved.schedule?.allDay == true)
        XCTAssertNil(moved.time)
        XCTAssertNil(TodayTaskMovement.rescheduled(task, dateKey: "invalid", time: nil))
        XCTAssertNil(TodayTaskMovement.rescheduled(task, dateKey: "2026-09-10", time: "26:00"))
    }

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

        let tasks = [overdueTask, openTask, completedTask, openTask, workTask]
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

    func testOverdueTasksAreSortedFromOldestToMostRecent() {
        let tasks = [
            WorkspaceTask(id: 31, text: "Wczoraj", done: false, time: "08:00", view: "wszystkie", calendarDate: "2026-09-01"),
            WorkspaceTask(id: 32, text: "Najstarsze", done: false, time: "18:00", view: "wszystkie", calendarDate: "2026-08-28"),
            WorkspaceTask(id: 33, text: "Przedwczoraj", done: false, time: "09:00", view: "wszystkie", calendarDate: "2026-08-30")
        ]
        let aggregate = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a",
            referenceDate: referenceDate,
            calendar: calendar,
            taskWorkspace: TaskWorkspace(
                version: 2,
                updatedAt: "2026-09-02T10:00:00.000Z",
                tasks: tasks,
                habits: [],
                lists: [],
                tags: []
            )
        ))

        XCTAssertEqual(aggregate.overdueTasks.map(\.id), [32, 33, 31])
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
        let retainedFirstAccount = await cache.value(accountID: "account-a", dateKey: first.boundary.dateKey)
        let secondValue = await cache.value(accountID: "account-b", dateKey: second.boundary.dateKey)
        XCTAssertNotNil(retainedFirstAccount, "Each account has its own capacity")
        XCTAssertNotNil(secondValue)

        let laterFirstAccount = TodayAggregationService.aggregate(TodayAggregationInput(
            accountID: "account-a", referenceDate: referenceDate.addingTimeInterval(86_400), calendar: calendar
        ))
        await cache.insert(laterFirstAccount)
        let evictedValue = await cache.value(accountID: "account-a", dateKey: first.boundary.dateKey)
        let latestValue = await cache.value(accountID: "account-a", dateKey: laterFirstAccount.boundary.dateKey)
        let retainedSecondAccount = await cache.value(accountID: "account-b", dateKey: second.boundary.dateKey)
        XCTAssertNil(evictedValue)
        XCTAssertNotNil(latestValue)
        XCTAssertNotNil(retainedSecondAccount, "Eviction must not affect another account")
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

    func testCompletedOverdueTaskStaysInPlanAfterRebuildingSnapshot() {
        let date = RootineDate.date(from: "2026-09-02T10:00:00Z")!
        let open = WorkspaceTask(id: 901, text: "Zaległe", done: false, view: "wszystkie", calendarDate: "2026-09-01")
        var done = open
        done.done = true
        done.completedAt = "2026-09-02T09:30:00Z"
        XCTAssertEqual(TodayTimelineTasks.collect(today: [], overdue: [open], all: [open], date: date, calendar: calendar).map(\.id), [901])
        XCTAssertEqual(TodayTimelineTasks.collect(today: [], overdue: [], all: [done], date: date, calendar: calendar).map(\.id), [901])
        let tomorrow = RootineDate.date(from: "2026-09-03T10:00:00Z")!
        XCTAssertTrue(TodayTimelineTasks.collect(today: [], overdue: [], all: [done], date: tomorrow, calendar: calendar).isEmpty)
    }

    func testPlanCompletionUsesLocalDayAndExcludesDeletedTasks() {
        var localCalendar = Calendar(identifier: .gregorian)
        localCalendar.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        let date = RootineDate.date(from: "2026-09-02T00:30:00Z")!
        var task = WorkspaceTask(id: 902, text: "Po północy", done: true, completedAt: "2026-09-01T22:30:00Z", view: "wszystkie", calendarDate: "2026-09-01")
        XCTAssertEqual(TodayTimelineTasks.collect(today: [], overdue: [], all: [task], date: date, calendar: localCalendar).count, 1)
        task.deleted = true
        XCTAssertTrue(TodayTimelineTasks.collect(today: [], overdue: [], all: [task], date: date, calendar: localCalendar).isEmpty)
    }

    func testTodayPlanKeepsCompletedTimedAndUntimedTasksWithoutDuplicates() {
        let date = RootineDate.date(from: "2026-09-02T10:00:00Z")!
        let timed = WorkspaceTask(id: 903, text: "Z godziną", done: true, time: "09:00", view: "dzis", calendarDate: "2026-09-02")
        let untimed = WorkspaceTask(id: 904, text: "Bez godziny", done: true, view: "dzis", calendarDate: "2026-09-02")
        let plan = TodayTimelineTasks.collect(today: [timed, untimed], overdue: [timed], all: [timed, untimed], date: date, calendar: calendar)
        XCTAssertEqual(plan.map(\.id), [903, 904])
    }

    @MainActor
    func testRescheduleOverduePreservesTimeAndLeavesCompletedAndFutureTasksAlone() async {
        let environment = AppEnvironment()
        let date = RootineDate.date(from: "2026-09-02T10:00:00Z")!
        var workspace = TaskWorkspace.empty
        workspace.tasks = [
            WorkspaceTask(id: 910, text: "Przełóż", done: false, time: "15:00", view: "wszystkie", priority: .high, calendarDate: "2026-09-01"),
            WorkspaceTask(id: 911, text: "Gotowe", done: true, view: "wszystkie", calendarDate: "2026-09-01"),
            WorkspaceTask(id: 912, text: "Jutro", done: false, view: "wszystkie", calendarDate: "2026-09-03"),
            WorkspaceTask(id: 913, text: "Niewybrane", done: false, view: "wszystkie", calendarDate: "2026-09-01")
        ]
        environment.setTaskWorkspaceForTests(workspace)
        await environment.rescheduleOverdueTasksToToday(ids: [910, 911, 912], on: date)
        let tasks = environment.taskWorkspace.tasks
        XCTAssertEqual(tasks.first { $0.id == 910 }?.calendarDate, "2026-09-02")
        XCTAssertEqual(tasks.first { $0.id == 910 }?.time, "15:00")
        XCTAssertEqual(tasks.first { $0.id == 910 }?.priority, .high)
        XCTAssertEqual(tasks.first { $0.id == 910 }?.view, "dzis")
        XCTAssertEqual(tasks.first { $0.id == 911 }?.calendarDate, "2026-09-01")
        XCTAssertEqual(tasks.first { $0.id == 912 }?.calendarDate, "2026-09-03")
        XCTAssertEqual(tasks.first { $0.id == 913 }?.calendarDate, "2026-09-01")
    }

    @MainActor
    func testRescheduleOverduePreservesAllDayDuration() async {
        let environment = AppEnvironment()
        var workspace = TaskWorkspace.empty
        let schedule = WorkspaceTaskSchedule(allDay: true, startTime: "", endDate: "2026-09-02", timezone: "Europe/Warsaw")
        workspace.tasks = [WorkspaceTask(id: 914, text: "Dwa dni", done: false, view: "wszystkie", calendarDate: "2026-09-01", schedule: schedule)]
        environment.setTaskWorkspaceForTests(workspace)
        await environment.rescheduleOverdueTasksToToday(ids: [914], on: RootineDate.date(from: "2026-09-03T10:00:00Z")!)
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.calendarDate, "2026-09-03")
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.schedule?.endDate, "2026-09-04")
        XCTAssertEqual(environment.taskWorkspace.tasks.first?.schedule?.allDay, true)
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

    func testBulkRescheduleKeepsMultiDayDurationAndReminderSettings() throws {
        let schedule = WorkspaceTaskSchedule(allDay: true, startTime: "", endDate: "2026-09-02",
                                             reminderMinutes: 15, timezone: "Europe/Warsaw")
        let task = WorkspaceTask(id: 22, text: "Dwa dni", done: false, view: "wszystkie",
                                 calendarDate: "2026-09-01", schedule: schedule)
        let plan = TodayBulkReschedulePlanner.plan(tasks: [task], todayKey: "2026-09-03")
        let updated = try XCTUnwrap(plan.changes.first?.updated)
        XCTAssertEqual(updated.calendarDate, "2026-09-03")
        XCTAssertEqual(updated.schedule?.endDate, "2026-09-04")
        XCTAssertEqual(updated.schedule?.reminderMinutes, 15)
        XCTAssertEqual(updated.schedule?.timezone, "Europe/Warsaw")
        XCTAssertEqual(updated.schedule?.allDay, true)
        XCTAssertEqual(TodayBulkReschedulePlanner.undo(changes: plan.changes, in: [updated]).tasks, [task])
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
