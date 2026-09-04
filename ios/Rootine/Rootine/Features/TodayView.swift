import SwiftUI

private struct TodayFocusItem: Identifiable {
    enum Kind {
        case task
        case habit
    }

    let id: String
    let title: String
    let time: String?
    let kind: Kind
    let task: WorkspaceTask?
    let habit: WorkspaceHabit?

    var kindLabel: String {
        switch kind {
        case .task: return "Zadanie"
        case .habit: return "Nawyk"
        }
    }
}

private enum TodayRescheduleOption {
    case date(String)
    case undated
    case clear
}

private enum TodayTaskSection: String, CaseIterable, Identifiable {
    case overdue
    case today
    case completed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overdue: return "Zaległe"
        case .today: return "Dzisiaj"
        case .completed: return "Ukończone"
        }
    }

    var systemImage: String {
        switch self {
        case .overdue: return "clock.badge.exclamationmark"
        case .today: return "sun.max.fill"
        case .completed: return "checkmark.circle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .overdue: return RootineTheme.ColorToken.warning
        case .today: return RootineTheme.ColorToken.action
        case .completed: return RootineTheme.ColorToken.success
        }
    }
}

private struct TodaySnapshot {
    let date: Date
    let dateKey: String
    let tasks: [WorkspaceTask]
    let overdueTasks: [WorkspaceTask]
    let habits: [WorkspaceHabit]
    let nutritionDay: NutritionDay?
    let notes: [NoteRecord]
    let now: TodayFocusItem?
    let next: [TodayFocusItem]
    let aggregation: TodayAggregation

    // These values are read by several cards while SwiftUI lays out and
    // re-lays out the scroll view. Keep the reductions at snapshot creation
    // time so a scroll pass never walks the same arrays again.
    private let completedTasksValue: Int
    private let completedHabitsValue: Int
    private let nutritionCaloriesValue: Double
    private let nutritionProteinValue: Double
    private let nutritionCarbsValue: Double
    private let nutritionFatValue: Double
    private let activeNotesValue: [NoteRecord]
    private let notesUpdatedTodayValue: Int
    private let totalItemsValue: Int
    private let completedItemsValue: Int
    private let priorityTotalValue: Int
    private let priorityCompletedValue: Int

    var completedTasks: Int { completedTasksValue }
    var completedHabits: Int { completedHabitsValue }
    var nutritionCompleted: Bool { nutritionDay?.closedAt != nil }
    var nutritionCalories: Double { nutritionCaloriesValue }
    var nutritionProtein: Double { nutritionProteinValue }
    var nutritionCarbs: Double { nutritionCarbsValue }
    var nutritionFat: Double { nutritionFatValue }
    var activeNotes: [NoteRecord] { activeNotesValue }
    var notesUpdatedToday: Int { notesUpdatedTodayValue }
    var totalItems: Int { totalItemsValue }
    var completedItems: Int { completedItemsValue }
    var remainingItems: Int { max(0, totalItems - completedItems) }
    var progress: Double { totalItems == 0 ? 0 : Double(completedItems) / Double(totalItems) }
    var priorityTotal: Int { priorityTotalValue }
    var priorityCompleted: Int { priorityCompletedValue }

    init(
        accountID: String,
        taskWorkspace: TaskWorkspace,
        nutritionWorkspace: NutritionWorkspace,
        notesWorkspace: NotesWorkspace,
        sportWorkspace: SportWorkspace,
        goalsWorkspace: GoalsWorkspace,
        workWorkspace: WorkWorkspace,
        travelWorkspace: TravelWorkspace,
        healthWorkspace: HealthWorkspace,
        affairsWorkspace: AffairsWorkspace,
        date: Date,
        syncStatus: WorkspaceSyncStatus,
        calendar: Calendar = .current
    ) {
        let input = TodayAggregationInput(
            accountID: accountID,
            referenceDate: date,
            calendar: calendar,
            taskWorkspace: taskWorkspace,
            nutritionWorkspace: nutritionWorkspace,
            notesWorkspace: notesWorkspace,
            sportWorkspace: sportWorkspace,
            goalsWorkspace: goalsWorkspace,
            workWorkspace: workWorkspace,
            travelWorkspace: travelWorkspace,
            healthWorkspace: healthWorkspace,
            affairsWorkspace: affairsWorkspace,
            statuses: Self.statuses(for: syncStatus)
        )
        let aggregation = TodayAggregationService.aggregate(input)
        self.aggregation = aggregation
        self.date = date
        dateKey = aggregation.boundary.dateKey
        tasks = aggregation.todayTasks
        overdueTasks = aggregation.overdueTasks
        habits = aggregation.todayHabits
        nutritionDay = aggregation.nutritionDay
        notes = aggregation.notes
        now = Self.focusItem(from: aggregation.now)
        next = aggregation.next.compactMap { Self.focusItem(from: $0) }

        completedTasksValue = aggregation.todayTasks.reduce(into: 0) { count, task in
            if rootineTaskIsDoneOnDate(task, dateKey: aggregation.boundary.dateKey) { count += 1 }
        }
        completedHabitsValue = aggregation.todayHabits.reduce(into: 0) { count, habit in
            if rootineHabitIsDoneOnDate(habit, dateKey: aggregation.boundary.dateKey) { count += 1 }
        }
        let nutritionEntries = aggregation.nutritionDay.map {
            $0.entries.breakfast + $0.entries.lunch + $0.entries.snack + $0.entries.dinner
        } ?? []
        nutritionCaloriesValue = nutritionEntries.reduce(0) { $0 + $1.calories }
        nutritionProteinValue = nutritionEntries.reduce(0) { $0 + $1.protein }
        nutritionCarbsValue = nutritionEntries.reduce(0) { $0 + $1.carbs }
        nutritionFatValue = nutritionEntries.reduce(0) { $0 + $1.fat }

        activeNotesValue = aggregation.notes.filter { !$0.archived }
        notesUpdatedTodayValue = activeNotesValue.filter { $0.updatedAt.hasPrefix(aggregation.boundary.dateKey) }.count
        totalItemsValue = aggregation.todayTasks.count + aggregation.todayHabits.count + (aggregation.nutritionDay == nil ? 0 : 1)
        completedItemsValue = completedTasksValue + completedHabitsValue + (aggregation.nutritionDay?.closedAt == nil ? 0 : 1)
        priorityTotalValue = aggregation.todayTasks.filter { $0.priority != nil }.count
            + aggregation.todayHabits.filter { $0.priority != nil }.count
        priorityCompletedValue = aggregation.todayTasks.filter {
            $0.priority != nil && rootineTaskIsDoneOnDate($0, dateKey: aggregation.boundary.dateKey)
        }.count + aggregation.todayHabits.filter {
            $0.priority != nil && rootineHabitIsDoneOnDate($0, dateKey: aggregation.boundary.dateKey)
        }.count
    }

    private static func focusItem(from item: TodayQueueItem?) -> TodayFocusItem? {
        guard let item else { return nil }
        switch item.kind {
        case .task, .workTask:
            guard let task = item.task else { return nil }
            return TodayFocusItem(id: item.id, title: item.title, time: item.time, kind: .task, task: task, habit: nil)
        case .habit:
            guard let habit = item.habit else { return nil }
            return TodayFocusItem(id: item.id, title: item.title, time: item.time, kind: .habit, task: nil, habit: habit)
        case .workout, .reminder, .affair:
            return nil
        }
    }

    private static func statuses(for syncStatus: WorkspaceSyncStatus) -> [TodayDomain: TodayDomainStatus] {
        switch syncStatus {
        case .synced:
            return [:]
        case .localOnly:
            return Dictionary(uniqueKeysWithValues: TodayDomain.allCases.map {
                ($0, TodayDomainStatus.stale())
            })
        case .syncing:
            return Dictionary(uniqueKeysWithValues: TodayDomain.allCases.map {
                ($0, TodayDomainStatus.stale(message: "Synchronizuję zmiany; dane lokalne są dostępne."))
            })
        case .conflict:
            return Dictionary(uniqueKeysWithValues: TodayDomain.allCases.map {
                ($0, TodayDomainStatus.stale(message: "Wykryto konflikt; zachowuję dane lokalne do czasu rozwiązania."))
            })
        case .schemaMismatch, .error:
            return Dictionary(uniqueKeysWithValues: TodayDomain.allCases.map {
                ($0, TodayDomainStatus.failed("Nie udało się odświeżyć tego obszaru."))
            })
        case .unauthorized, .unavailable:
            return Dictionary(uniqueKeysWithValues: TodayDomain.allCases.map {
                ($0, TodayDomainStatus.unavailable("Dane będą dostępne po połączeniu z kontem."))
            })
        }
    }

    private static func makeFocusItems(tasks: [WorkspaceTask], habits: [WorkspaceHabit]) -> [TodayFocusItem] {
        let taskItems = tasks.map {
            TodayFocusItem(id: "task-\($0.id)", title: $0.text, time: $0.time, kind: .task, task: $0, habit: nil)
        }
        let habitItems = habits.map {
            TodayFocusItem(id: "habit-\($0.id)", title: $0.name, time: $0.time, kind: .habit, task: nil, habit: $0)
        }
        return (taskItems + habitItems).sorted { lhs, rhs in
            switch (lhs.time, rhs.time) {
            case let (left?, right?) where left != right: return left < right
            case (_?, nil): return true
            case (nil, _?): return false
            default: return lhs.id < rhs.id
            }
        }
    }

    private static func taskForOccurrence(_ occurrence: RootineCalendarOccurrence) -> WorkspaceTask {
        var task = occurrence.task
        task.time = occurrence.time
        task.endTime = occurrence.endTime
        return task
    }

    private static func isDone(_ item: TodayFocusItem, dateKey: String) -> Bool {
        switch item.kind {
        case .task: return item.task.map { rootineTaskIsDoneOnDate($0, dateKey: dateKey) } ?? false
        case .habit: return item.habit.map { isHabitDone($0, dateKey: dateKey) } ?? false
        }
    }

    private static func taskSort(_ lhs: WorkspaceTask, _ rhs: WorkspaceTask) -> Bool {
        switch (lhs.time, rhs.time) {
        case let (left?, right?) where left != right: return left < right
        case (_?, nil): return true
        case (nil, _?): return false
        default: return lhs.id < rhs.id
        }
    }

    private static func parseMinutes(_ value: String) -> Int? {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return parts[0] * 60 + parts[1]
    }

    private static func minutesSinceMidnight(_ date: Date) -> Int {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }
}

private struct TodayUndoAction: Identifiable {
    enum Kind { case task, habit }

    let id = UUID()
    let kind: Kind
    let recordID: Int
    let title: String
    let date: Date
    let restoreCalendarDate: String?

    let message: String
}

private func isHabitDone(_ habit: WorkspaceHabit, dateKey: String = RootineDate.localDate()) -> Bool {
    rootineHabitIsDoneOnDate(habit, dateKey: dateKey)
}

struct TodayView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selectedTask: WorkspaceTask?
    @State private var selectedHabit: WorkspaceHabit?
    @State private var undoAction: TodayUndoAction?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let snapshot = TodaySnapshot(
                accountID: environment.session?.user.id ?? "preview",
                taskWorkspace: environment.taskWorkspace,
                nutritionWorkspace: environment.nutritionWorkspace,
                notesWorkspace: environment.notesWorkspace,
                sportWorkspace: environment.sportWorkspace,
                goalsWorkspace: environment.goalsWorkspace,
                workWorkspace: environment.workWorkspace,
                travelWorkspace: environment.travelWorkspace,
                healthWorkspace: environment.healthWorkspace,
                affairsWorkspace: environment.affairsWorkspace,
                date: context.date,
                syncStatus: environment.workspaceSyncStatus
            )

            TodayContentView(
                snapshot: snapshot,
                isLaunching: environment.isLaunching,
                syncStatus: environment.workspaceSyncStatus,
                onSelectTask: { selectedTask = $0 },
                onSelectHabit: { selectedHabit = $0 },
                onToggleTask: { task in
                    let todayKey = RootineDate.localDate(context.date)
                    let wasDone = rootineTaskIsDoneOnDate(task, dateKey: todayKey)
                    let restoreCalendarDate = task.schedule?.recurrence == nil
                        ? task.calendarDate.flatMap { dateKey in dateKey < todayKey ? dateKey : nil }
                        : nil
                    undoAction = wasDone
                        ? nil
                        : TodayUndoAction(
                            kind: .task,
                            recordID: task.id,
                            title: task.text,
                            date: context.date,
                            restoreCalendarDate: restoreCalendarDate,
                            message: "Oznaczono „\(task.text)” jako wykonane"
                        )
                    Task {
                        // A completed one-off overdue task belongs to today's
                        // completed timeline, so move its date before setting
                        // completion. Recurring tasks keep their series anchor
                        // and only record today's occurrence.
                        if !wasDone, restoreCalendarDate != nil {
                            await environment.updateTask(
                                id: task.id,
                                text: task.text,
                                time: task.time,
                                calendarDate: todayKey,
                                priority: task.priority,
                                notes: task.notes,
                                list: task.list,
                                tags: task.tags
                            )
                        }
                        await environment.toggleTaskCompletion(id: task.id, on: context.date)
                    }
                },
                onToggleHabit: { habit in
                    let wasDone = rootineHabitIsDoneOnDate(habit, dateKey: RootineDate.localDate(context.date))
                    undoAction = wasDone
                        ? nil
                        : TodayUndoAction(
                            kind: .habit,
                            recordID: habit.id,
                            title: habit.name,
                            date: context.date,
                            restoreCalendarDate: nil,
                            message: "Oznaczono „\(habit.name)” jako wykonane"
                        )
                    Task { await environment.toggleHabitCompletion(id: habit.id, on: context.date) }
                },
                onRescheduleTask: { task, option in
                    let targetDate: String?
                    let targetTime: String?
                    switch option {
                    case .date(let dateKey):
                        targetDate = dateKey
                        targetTime = task.time
                    case .undated:
                        targetDate = nil
                        targetTime = task.time
                    case .clear:
                        targetDate = nil
                        targetTime = nil
                    }
                    Task {
                        await environment.updateTask(
                            id: task.id,
                            text: task.text,
                            time: targetTime,
                            calendarDate: targetDate,
                            priority: task.priority,
                            notes: task.notes,
                            list: task.list,
                            tags: task.tags
                        )
                    }
                },
                onMoveTask: { task, section, targetDate in
                    let todayKey = RootineDate.localDate(context.date)
                    Task {
                        switch section {
                        case .completed:
                            let wasDone = rootineTaskIsDoneOnDate(task, dateKey: todayKey)
                            await environment.updateTask(
                                id: task.id,
                                text: task.text,
                                time: task.time,
                                calendarDate: todayKey,
                                priority: task.priority,
                                notes: task.notes,
                                list: task.list,
                                tags: task.tags
                            )
                            // Move the anchor before marking a recurring task
                            // complete so the completion stays on the anchor
                            // rather than becoming a stale today's map entry.
                            if !wasDone {
                                await environment.toggleTaskCompletion(id: task.id, on: context.date)
                            }
                        case .today:
                            if rootineTaskIsDoneOnDate(task, dateKey: todayKey) {
                                await environment.toggleTaskCompletion(id: task.id, on: context.date)
                            }
                            await environment.updateTask(
                                id: task.id,
                                text: task.text,
                                time: task.time,
                                calendarDate: todayKey,
                                priority: task.priority,
                                notes: task.notes,
                                list: task.list,
                                tags: task.tags
                            )
                        case .overdue:
                            guard let targetDate, targetDate < todayKey else { return }
                            // A recurring task's calendar date is its series
                            // anchor. Moving it into the overdue section would
                            // silently move every future occurrence as well.
                            guard task.schedule?.recurrence == nil else { return }
                            if rootineTaskIsDoneOnDate(task, dateKey: todayKey) {
                                await environment.toggleTaskCompletion(id: task.id, on: context.date)
                            }
                            await environment.updateTask(
                                id: task.id,
                                text: task.text,
                                time: task.time,
                                calendarDate: targetDate,
                                priority: task.priority,
                                notes: task.notes,
                                list: task.list,
                                tags: task.tags
                            )
                        }
                    }
                },
                undoAction: undoAction,
                onUndo: undo,
                onDismissUndo: { undoAction = nil },
                onRefresh: { await environment.flushPendingMutations() },
                onRetry: { await environment.flushPendingMutations() }
            )
            // Scrolling invalidates parts of the SwiftUI tree. The content
            // itself is value-driven, so skip a full LazyVStack rebuild when
            // the periodic clock produced the same aggregation.
            .equatable()
            .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: snapshot.completedItems)
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedTask) { task in
            TaskDetailSheet(task: task)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedHabit) { habit in
            HabitDetailSheet(habit: habit)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func undo() {
        guard let action = undoAction else { return }
        undoAction = nil
        Task {
            switch action.kind {
            case .task:
                await environment.toggleTaskCompletion(id: action.recordID, on: action.date)
                if let restoreCalendarDate = action.restoreCalendarDate,
                   let task = environment.taskWorkspace.tasks.first(where: { $0.id == action.recordID }) {
                    await environment.updateTask(
                        id: task.id,
                        text: task.text,
                        time: task.time,
                        calendarDate: restoreCalendarDate,
                        priority: task.priority,
                        notes: task.notes,
                        list: task.list,
                        tags: task.tags
                    )
                }
            case .habit:
                await environment.toggleHabitCompletion(id: action.recordID, on: action.date)
            }
        }
    }
}

@MainActor
private struct TodayContentView: View, Equatable {
    let snapshot: TodaySnapshot
    let isLaunching: Bool
    let syncStatus: WorkspaceSyncStatus
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onRescheduleTask: (WorkspaceTask, TodayRescheduleOption) -> Void
    let onMoveTask: (WorkspaceTask, TodayTaskSection, String?) -> Void
    let undoAction: TodayUndoAction?
    let onUndo: () -> Void
    let onDismissUndo: () -> Void
    let onRefresh: () async -> Void
    let onRetry: () async -> Void

    nonisolated static func == (lhs: TodayContentView, rhs: TodayContentView) -> Bool {
        lhs.snapshot.aggregation == rhs.snapshot.aggregation
            && lhs.isLaunching == rhs.isLaunching
            && lhs.syncStatus == rhs.syncStatus
            && lhs.undoAction?.id == rhs.undoAction?.id
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                if isLaunching {
                    ProgressView("Wczytuję Twój dzień…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, RootineTheme.Spacing.large)
                }

                if case .conflict = syncStatus {
                    RootineErrorState(
                        title: "Konflikt synchronizacji",
                        message: "Twoje zmiany są bezpieczne lokalnie. Odśwież, gdy połączenie będzie stabilne.",
                        retryTitle: "Spróbuj ponownie",
                        onRetry: { Task { await onRetry() } }
                    )
                } else if case .localOnly = syncStatus {
                    RootineOfflineBanner()
                }

                TodaySummaryCard(snapshot: snapshot)
                TodayTimelineCard(
                    snapshot: snapshot,
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit,
                    onRescheduleTask: onRescheduleTask,
                    onMoveTask: onMoveTask
                )
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.small)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .safeAreaPadding(.bottom, RootineTheme.Spacing.medium)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let undoAction {
                RootineUndoBanner(message: undoAction.message, onUndo: onUndo)
                    .padding(.horizontal, RootineTheme.Spacing.medium)
                    .padding(.bottom, RootineTheme.Spacing.small)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .refreshable { await onRefresh() }
        .task(id: undoAction?.id) {
            guard undoAction != nil else { return }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            onDismissUndo()
        }
    }
}

private struct TodaySummaryCard: View {
    let snapshot: TodaySnapshot

    private var remainingPriorities: Int {
        max(0, snapshot.priorityTotal - snapshot.priorityCompleted)
    }

    var body: some View {
        HStack(alignment: .center, spacing: RootineTheme.Spacing.medium) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                Text(todayTitle(snapshot.date))
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)

                HStack(alignment: .lastTextBaseline, spacing: RootineTheme.Spacing.small) {
                    Text("\(snapshot.completedItems) z \(snapshot.totalItems)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .monospacedDigit()
                    Text("wykonane")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }

                ProgressView(value: snapshot.progress)
                    .tint(RootineTheme.ColorToken.action)
                    .accessibilityLabel("Postęp dnia")
                    .accessibilityValue("\(Int(snapshot.progress * 100)) procent")
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Divider()
                .frame(height: 48)
                .overlay(RootineTheme.ColorToken.separator)

            HStack(alignment: .top, spacing: RootineTheme.Spacing.xSmall) {
                Image(systemName: "flag.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.success)
                    .frame(width: 24, height: 24, alignment: .leading)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text("\(snapshot.priorityTotal) \(priorityWord(snapshot.priorityTotal))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .monospacedDigit()

                    Text("\(remainingPriorities) pozostało")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .monospacedDigit()
                }
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Priorytety")
            .accessibilityValue("\(snapshot.priorityTotal) \(priorityWord(snapshot.priorityTotal)), \(remainingPriorities) pozostało")
        }
        .rootineSurface()
        .accessibilityElement(children: .contain)
    }
}

private struct TodayTimelineCard: View {
    let snapshot: TodaySnapshot
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onRescheduleTask: (WorkspaceTask, TodayRescheduleOption) -> Void
    let onMoveTask: (WorkspaceTask, TodayTaskSection, String?) -> Void
    @State private var overdueMoveTask: WorkspaceTask?
    @State private var moveNotice: String?

    private struct TimelineEntries {
        let overdue: [TodayFocusItem]
        let timed: [TodayFocusItem]
        let untimed: [TodayFocusItem]

        init(snapshot: TodaySnapshot) {
            overdue = snapshot.overdueTasks.map {
                TodayFocusItem(
                    id: "overdue-task-\($0.id)",
                    title: $0.text,
                    time: overdueAgeLabel(for: $0, relativeTo: snapshot.dateKey),
                    kind: .task,
                    task: $0,
                    habit: nil
                )
            }

            let tasks = snapshot.tasks.map {
                TodayFocusItem(
                    id: "task-\($0.id)", title: $0.text, time: $0.time,
                    kind: .task, task: $0, habit: nil
                )
            }
            let habits = snapshot.habits.map {
                TodayFocusItem(
                    id: "habit-\($0.id)", title: $0.name, time: $0.time,
                    kind: .habit, task: nil, habit: $0
                )
            }
            let active = (tasks + habits).filter { item in
                switch item.kind {
                case .task: return item.task.map { !rootineTaskIsDoneOnDate($0, dateKey: snapshot.dateKey) } ?? false
                case .habit: return item.habit.map { !isHabitDone($0, dateKey: snapshot.dateKey) } ?? false
                }
            }.sorted {
                switch ($0.time, $1.time) {
                case let (left?, right?): return left == right ? $0.id < $1.id : left < right
                case (_?, nil): return true
                case (nil, _?): return false
                default: return $0.id < $1.id
                }
            }
            timed = active.filter { $0.time != nil }
            untimed = active.filter { $0.time == nil }
        }

        var hasOpenEntries: Bool { !overdue.isEmpty || !timed.isEmpty || !untimed.isEmpty }
    }

    var body: some View {
        let timeline = TimelineEntries(snapshot: snapshot)
        let nextID = snapshot.next.first?.id ?? snapshot.now?.id

        TodayCard {
            HStack(alignment: .firstTextBaseline, spacing: RootineTheme.Spacing.small) {
                Text("Plan dnia")
                    .font(.headline)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Spacer(minLength: 0)
            }

            if !snapshot.tasks.isEmpty || !snapshot.overdueTasks.isEmpty {
                TodayTaskDropTargets { taskID, section in
                    moveTask(taskID: taskID, to: section)
                }
            }

            VStack(spacing: 0) {
                if !timeline.overdue.isEmpty {
                    TodayTimelineSectionLabel(
                        title: "Zaległości",
                        systemImage: "clock.badge.exclamationmark",
                        tint: RootineTheme.ColorToken.warning
                    )
                    ForEach(timeline.overdue) { item in
                        TodayTimelineItemRow(
                            item: item,
                            dateKey: snapshot.dateKey,
                            isNext: false,
                            isOverdue: true,
                            onSelectTask: onSelectTask,
                            onSelectHabit: onSelectHabit,
                            onToggleTask: onToggleTask,
                            onToggleHabit: onToggleHabit,
                            onRescheduleTask: onRescheduleTask,
                            onMoveTask: onMoveTask,
                            section: .overdue
                        )
                    }
                    if timeline.hasOpenEntries {
                        TodayTimelineDivider()
                    }
                }

                if !timeline.hasOpenEntries {
                    Label(
                        "Brak otwartych zobowiązań. Możesz spokojnie domknąć dzień.",
                        systemImage: "checkmark.circle"
                    )
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, RootineTheme.Spacing.small)
                } else {
                    ForEach(timeline.timed) { item in
                        TodayTimelineItemRow(
                            item: item,
                            dateKey: snapshot.dateKey,
                            isNext: item.id == nextID,
                            isOverdue: false,
                            onSelectTask: onSelectTask,
                            onSelectHabit: onSelectHabit,
                            onToggleTask: onToggleTask,
                            onToggleHabit: onToggleHabit,
                            onRescheduleTask: onRescheduleTask,
                            onMoveTask: onMoveTask,
                            section: .today
                        )
                    }
                    if !timeline.timed.isEmpty && !timeline.untimed.isEmpty {
                        TodayTimelineDivider()
                    }
                    ForEach(timeline.untimed) { item in
                        TodayTimelineItemRow(
                            item: item,
                            dateKey: snapshot.dateKey,
                            isNext: item.id == nextID,
                            isOverdue: false,
                            onSelectTask: onSelectTask,
                            onSelectHabit: onSelectHabit,
                            onToggleTask: onToggleTask,
                            onToggleHabit: onToggleHabit,
                            onRescheduleTask: onRescheduleTask,
                            onMoveTask: onMoveTask,
                            section: .today
                        )
                    }
                }

                if snapshot.completedItems > 0 {
                    TodayTimelineDivider()
                    TodayCompletedDisclosure(
                        snapshot: snapshot,
                        onSelectTask: onSelectTask,
                        onSelectHabit: onSelectHabit,
                        onToggleTask: onToggleTask,
                        onToggleHabit: onToggleHabit,
                        onRescheduleTask: onRescheduleTask,
                        onMoveTask: onMoveTask
                    )
                }
            }
        }
        .accessibilityIdentifier("today-timeline")
        .sheet(item: $overdueMoveTask) { task in
            TodayRescheduleDateSheet(
                initialDate: overdueDate(for: task),
                title: "Wybierz datę zaległości",
                maximumDate: RootineDate.localDateValue(RootineDate.shiftLocalDate(snapshot.dateKey, by: -1))
            ) { date in
                let dateKey = RootineDate.localDate(date)
                guard dateKey < snapshot.dateKey else { return }
                onMoveTask(task, .overdue, dateKey)
            }
        }
        .alert("Nie można przenieść zadania", isPresented: Binding(
            get: { moveNotice != nil },
            set: { if !$0 { moveNotice = nil } }
        )) {
            Button("OK", role: .cancel) { moveNotice = nil }
        } message: {
            Text(moveNotice ?? "")
        }
    }

    private func isDone(_ item: TodayFocusItem) -> Bool {
        switch item.kind {
        case .task: return item.task.map { rootineTaskIsDoneOnDate($0, dateKey: snapshot.dateKey) } ?? false
        case .habit: return item.habit.map { isHabitDone($0, dateKey: snapshot.dateKey) } ?? false
        }
    }

    private func moveTask(taskID: Int, to section: TodayTaskSection) {
        guard let task = snapshot.tasks.first(where: { $0.id == taskID })
                ?? snapshot.overdueTasks.first(where: { $0.id == taskID }) else { return }
        if section == .overdue {
            guard task.schedule?.recurrence == nil else {
                moveNotice = "Zadanie cykliczne zachowuje swój harmonogram. Przełóż konkretne wystąpienie z menu zadania."
                return
            }
            overdueMoveTask = task
        } else {
            onMoveTask(task, section, nil)
        }
    }

    private func overdueDate(for task: WorkspaceTask) -> Date {
        if let date = task.calendarDate.flatMap({ RootineDate.localDateValue($0) }), date < (RootineDate.localDateValue(snapshot.dateKey) ?? Date()) {
            return date
        }
        return RootineDate.localDateValue(RootineDate.shiftLocalDate(snapshot.dateKey, by: -1)) ?? Date()
    }
}

private struct TodayTaskDropTargets: View {
    let onDrop: (Int, TodayTaskSection) -> Void
    @State private var targetedSection: TodayTaskSection?

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Text("Przenieś do")
                .font(.caption.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            HStack(spacing: RootineTheme.Spacing.xSmall) {
                ForEach(TodayTaskSection.allCases) { section in
                    Label(section.title, systemImage: section.systemImage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(section.tint)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                                .fill(section.tint.opacity(targetedSection == section ? 0.24 : 0.10))
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                                .stroke(section.tint.opacity(targetedSection == section ? 0.8 : 0.3), lineWidth: targetedSection == section ? 2 : 1)
                        }
                        .contentShape(Rectangle())
                        .dropDestination(for: String.self) { items, _ in
                            guard let taskID = items.first.flatMap(Int.init) else { return false }
                            onDrop(taskID, section)
                            return true
                        } isTargeted: { isTargeted in
                            if isTargeted {
                                targetedSection = section
                            } else if targetedSection == section {
                                targetedSection = nil
                            }
                        }
                        .accessibilityLabel("Upuść w sekcji \(section.title)")
                }
            }
        }
        .padding(.vertical, RootineTheme.Spacing.xSmall)
    }
}

private struct TodayTimelineSectionLabel: View {
    let title: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(title.uppercased(), systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, RootineTheme.Spacing.small)
    }
}

private struct TodayTimelineDivider: View {
    var body: some View {
        Rectangle()
            .fill(RootineTheme.ColorToken.separator)
            .frame(height: 1)
            .padding(.leading, 88)
            .padding(.vertical, RootineTheme.Spacing.small)
    }
}

private struct TodayTimelineConnector: View {
    let color: Color

    var body: some View {
        Path { path in
            path.move(to: CGPoint(x: 0.5, y: 0))
            path.addLine(to: CGPoint(x: 0.5, y: 76))
        }
        .stroke(color, style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
        .frame(width: 1, height: 76)
        .accessibilityHidden(true)
    }
}

private struct TodayTimelineItemRow: View {
    let item: TodayFocusItem
    let dateKey: String
    let isNext: Bool
    let isOverdue: Bool
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onRescheduleTask: (WorkspaceTask, TodayRescheduleOption) -> Void
    let onMoveTask: (WorkspaceTask, TodayTaskSection, String?) -> Void
    let section: TodayTaskSection
    @State private var horizontalDrag: CGFloat = 0
    @State private var isRescheduleMenuPresented = false
    @State private var isDatePickerPresented = false
    @State private var rescheduleDate = Date()

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(item.time ?? "")
                .font(isOverdue ? .caption : .caption.monospacedDigit())
                .foregroundStyle(isOverdue ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .allowsTightening(true)
                .frame(width: 64, alignment: .leading)
                .padding(.top, RootineTheme.Spacing.medium)

            ZStack(alignment: .top) {
                TodayTimelineConnector(
                    color: isOverdue
                        ? RootineTheme.ColorToken.warning.opacity(0.55)
                        : (isNext ? RootineTheme.ColorToken.action.opacity(0.75) : RootineTheme.ColorToken.separator)
                )

                Button(action: toggle) {
                    ZStack {
                        Circle()
                            .fill(isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.surface)
                        Circle()
                            .stroke(nodeColor, lineWidth: isNext || isDone ? 2 : 1.5)
                        if isDone {
                            Image(systemName: "checkmark")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(RootineTheme.ColorToken.canvas)
                        }
                    }
                    .frame(width: isNext ? 17 : 14, height: isNext ? 17 : 14)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isDone ? "Oznacz \(item.title) jako niewykonane" : "Oznacz \(item.title) jako wykonane")
            }
            .frame(width: 44)
            .frame(minHeight: 76)

            ZStack(alignment: .leading) {
                swipeActionFeedback

                HStack(spacing: RootineTheme.Spacing.small) {
                    Button(action: open) {
                        HStack(spacing: RootineTheme.Spacing.small) {
                            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                                if isNext {
                                    HStack(spacing: RootineTheme.Spacing.xSmall) {
                                        Image(systemName: "sparkles")
                                        Text("NAJBLIŻSZE")
                                            .tracking(0.7)
                                    }
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(RootineTheme.ColorToken.action)
                                }
                                Text(item.title)
                                    .font(.body.weight(isNext ? .semibold : .medium))
                                    .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                                    .strikethrough(isDone)
                                    .lineLimit(2)
                                Text(item.kindLabel)
                                    .font(.caption)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: 60)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(TodayTaskTitleButtonStyle())
                    .accessibilityLabel("Szczegóły: \(item.title)")
                    .accessibilityHint(interactionHint)
                    .accessibilityAction(named: isDone ? "Cofnij wykonanie" : "Oznacz jako wykonane") { toggle() }
                    .modifier(TodayRescheduleAccessibilityModifier(task: item.task) { isRescheduleMenuPresented = true })
                }
                .padding(.leading, isNext ? RootineTheme.Spacing.small : 0)
                .padding(.vertical, RootineTheme.Spacing.small)
                .offset(x: horizontalDrag)
                .modifier(TodayTaskDragModifier(task: item.task))
            }
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        }
        .contentShape(Rectangle())
        // Keep horizontal swipe and native long-press drag mutually
        // exclusive. A simultaneous gesture could complete both actions.
        .gesture(swipeGesture)
        .confirmationDialog("Przełóż zadanie", isPresented: $isRescheduleMenuPresented, titleVisibility: .visible) {
            Button("Dziś") { reschedule(.date(dateKey)) }
            Button("Jutro") { reschedule(.date(RootineDate.shiftLocalDate(dateKey, by: 1))) }
            Button("Pojutrze") { reschedule(.date(RootineDate.shiftLocalDate(dateKey, by: 2))) }
            Button("Za tydzień") { reschedule(.date(RootineDate.shiftLocalDate(dateKey, by: 7))) }
            Button("Wybierz datę") { showDatePicker() }
            Button("Bez daty") { reschedule(.undated) }
            Button("Wyczyść", role: .destructive) { reschedule(.clear) }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(item.title)
        }
        .sheet(isPresented: $isDatePickerPresented) {
            TodayRescheduleDateSheet(initialDate: rescheduleDate) { date in
                reschedule(.date(RootineDate.localDate(date)))
            }
        }
    }

    private var isDone: Bool {
        switch item.kind {
        case .task: return item.task.map { rootineTaskIsDoneOnDate($0, dateKey: dateKey) } ?? false
        case .habit: return item.habit.map { isHabitDone($0, dateKey: dateKey) } ?? false
        }
    }

    private var nodeColor: Color {
        if isDone { return RootineTheme.ColorToken.success }
        if isOverdue { return RootineTheme.ColorToken.warning }
        return RootineTheme.ColorToken.action
    }

    private var swipeProgress: CGFloat {
        min(1, abs(horizontalDrag) / 72)
    }

    private var swipeActionFeedback: some View {
        HStack {
            if horizontalDrag >= 0 {
                swipeActionIcon(systemName: "checkmark.circle.fill", tint: RootineTheme.ColorToken.success)
                Spacer(minLength: 0)
            } else if item.task != nil {
                Spacer(minLength: 0)
                swipeActionIcon(systemName: "calendar.badge.clock", tint: RootineTheme.ColorToken.warning)
            }
        }
        .padding(.horizontal, RootineTheme.Spacing.small)
        .opacity(horizontalDrag == 0 ? 0 : min(1, 0.35 + swipeProgress))
        .animation(.easeOut(duration: 0.12), value: horizontalDrag >= 0)
    }

    private func swipeActionIcon(systemName: String, tint: Color) -> some View {
        Image(systemName: systemName)
            .font(.title3.weight(.semibold))
            .foregroundStyle(tint)
            .frame(width: 44, height: 44)
            .background(Circle().fill(tint.opacity(0.14)))
            .scaleEffect(0.85 + 0.15 * swipeProgress)
            .accessibilityHidden(true)
    }

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 20, coordinateSpace: .local)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                horizontalDrag = min(max(value.translation.width, -140), 140)
            }
            .onEnded { value in
                let isHorizontal = abs(value.translation.width) > abs(value.translation.height)
                let crossedThreshold = abs(value.translation.width) >= 72
                let direction = value.translation.width

                withAnimation(.snappy(duration: 0.2)) {
                    horizontalDrag = 0
                }

                guard isHorizontal, crossedThreshold else { return }
                if direction > 0 {
                    toggle()
                } else if item.task != nil {
                    isRescheduleMenuPresented = true
                }
            }
    }

    private func toggle() {
        if let task = item.task { onToggleTask(task) }
        if let habit = item.habit { onToggleHabit(habit) }
    }

    private func open() {
        if let task = item.task { onSelectTask(task) }
        if let habit = item.habit { onSelectHabit(habit) }
    }

    private func showDatePicker() {
        rescheduleDate = item.task.flatMap { task in
            task.calendarDate.flatMap { RootineDate.localDateValue($0) }
        } ?? RootineDate.localDateValue(dateKey) ?? Date()
        isDatePickerPresented = true
    }

    private func reschedule(_ option: TodayRescheduleOption) {
        guard let task = item.task else { return }
        onRescheduleTask(task, option)
    }

    private var interactionHint: String {
        let completionAction = isDone ? "cofnąć wykonanie" : "oznaczyć jako wykonane"
        let rescheduleAction = item.task == nil ? "" : " lub w lewo, aby przełożyć"
        let dragAction = item.task == nil ? "" : " Przytrzymaj i przeciągnij, aby przenieść między sekcjami."
        return "Otwiera edycję. Przesuń w prawo, aby \(completionAction)\(rescheduleAction).\(dragAction)"
    }
}

private struct TodayTaskDragModifier: ViewModifier {
    let task: WorkspaceTask?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let task {
            content
                .draggable(String(task.id)) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    Image(systemName: "line.3.horizontal")
                        .foregroundStyle(RootineTheme.ColorToken.action)
                    Text(task.text)
                        .font(.body.weight(.semibold))
                        .lineLimit(2)
                }
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.vertical, RootineTheme.Spacing.small)
                .background(RootineTheme.ColorToken.elevated)
                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
            }
        } else {
            content
        }
    }
}

private struct TodayTaskTitleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                    .fill(RootineTheme.ColorToken.primaryText.opacity(configuration.isPressed ? 0.07 : 0))
            }
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct TodayRescheduleAccessibilityModifier: ViewModifier {
    let task: WorkspaceTask?
    let action: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if task != nil {
            content.accessibilityAction(named: "Przełóż") { action() }
        } else {
            content
        }
    }
}

private struct TodayRescheduleDateSheet: View {
    let initialDate: Date
    let title: String
    let maximumDate: Date?
    let onSave: (Date) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDate: Date

    init(
        initialDate: Date,
        title: String = "Wybierz datę",
        maximumDate: Date? = nil,
        onSave: @escaping (Date) -> Void
    ) {
        self.initialDate = initialDate
        self.title = title
        self.maximumDate = maximumDate
        self.onSave = onSave
        _selectedDate = State(initialValue: initialDate)
    }

    var body: some View {
        NavigationStack {
            DatePicker(
                "Data",
                selection: $selectedDate,
                in: Date.distantPast...(maximumDate ?? Date.distantFuture),
                displayedComponents: .date
            )
                .datePickerStyle(.graphical)
                .labelsHidden()
                .padding(RootineTheme.Spacing.medium)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Anuluj") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Zapisz") {
                            onSave(selectedDate)
                            dismiss()
                        }
                    }
                }
        }
        .presentationDetents([.medium])
    }
}

private struct TodayCompletedDisclosure: View {
    let snapshot: TodaySnapshot
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onRescheduleTask: (WorkspaceTask, TodayRescheduleOption) -> Void
    let onMoveTask: (WorkspaceTask, TodayTaskSection, String?) -> Void
    @State private var isExpanded = false

    private var completedEntries: [TodayFocusItem] {
        let tasks = snapshot.tasks.filter { rootineTaskIsDoneOnDate($0, dateKey: snapshot.dateKey) }.map {
            TodayFocusItem(id: "task-\($0.id)", title: $0.text, time: $0.time, kind: .task, task: $0, habit: nil)
        }
        let habits = snapshot.habits.filter { isHabitDone($0, dateKey: snapshot.dateKey) }.map {
            TodayFocusItem(id: "habit-\($0.id)", title: $0.name, time: $0.time, kind: .habit, task: nil, habit: $0)
        }
        return (tasks + habits).sorted { ($0.time ?? "99:99") < ($1.time ?? "99:99") }
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: RootineTheme.Spacing.small) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(RootineTheme.ColorToken.success)
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(isExpanded ? "Ukryj ukończone" : "Pokaż ukończone")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        Text("\(snapshot.completedItems) \(todayItemWord(snapshot.completedItems))")
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityLabel(isExpanded ? "Ukryj ukończone elementy" : "Pokaż ukończone elementy")

            if isExpanded {
                VStack(spacing: 0) {
                    ForEach(completedEntries) { item in
                        TodayTimelineItemRow(
                            item: item,
                            dateKey: snapshot.dateKey,
                            isNext: false,
                            isOverdue: false,
                            onSelectTask: onSelectTask,
                            onSelectHabit: onSelectHabit,
                            onToggleTask: onToggleTask,
                            onToggleHabit: onToggleHabit,
                            onRescheduleTask: onRescheduleTask,
                            onMoveTask: onMoveTask,
                            section: .completed
                        )
                    }
                    if completedEntries.isEmpty {
                        Text("Ukończone elementy z innych obszarów dnia.")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, RootineTheme.Spacing.small)
                    }
                }
            }
        }
        .accessibilityIdentifier("today-completed")
    }
}

private struct TodayBalanceCard: View {
    let snapshot: TodaySnapshot

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Bilans", systemImage: "chart.bar.xaxis")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: RootineTheme.Spacing.medium) {
                    metric("Priorytety", value: "\(snapshot.priorityCompleted)/\(snapshot.priorityTotal)")
                    metric("Pozostało", value: "\(snapshot.remainingItems)")
                    metric("Notatki", value: "\(snapshot.activeNotes.count)")
                }
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    metric("Priorytety", value: "\(snapshot.priorityCompleted)/\(snapshot.priorityTotal)")
                    metric("Pozostało", value: "\(snapshot.remainingItems)")
                    metric("Notatki", value: "\(snapshot.activeNotes.count)")
                }
            }
        }
        .accessibilityIdentifier("today-balance")
    }

    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            Text(title)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TodayAreasSection: View {
    let snapshot: TodaySnapshot
    let goals: NutritionGoals
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            Text("Obszary dnia")
                .font(.title3.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            TodayTasksCard(
                snapshot: snapshot,
                onToggleTask: onToggleTask,
                onToggleHabit: onToggleHabit,
                onSelectTask: onSelectTask,
                onSelectHabit: onSelectHabit
            )
            TodayNutritionCard(snapshot: snapshot, goals: goals)
            TodayNotesCard(snapshot: snapshot)
        }
    }
}

private struct TodayTasksCard: View {
    let snapshot: TodaySnapshot
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Zadania i nawyki", systemImage: "checklist")
            if snapshot.tasks.isEmpty && snapshot.habits.isEmpty {
                RootineEmptyState(
                    title: "Dzień jest pusty",
                    message: "Dodaj pierwszy konkretny krok, żeby zacząć.",
                    systemImage: "checklist"
                )
            } else {
                ForEach(snapshot.tasks) { task in
                    TodayTaskRow(task: task, dateKey: snapshot.dateKey, onSelect: { onSelectTask(task) }, onToggle: { onToggleTask(task) })
                }
                ForEach(snapshot.habits) { habit in
                    TodayHabitRow(
                        habit: habit,
                        dateKey: snapshot.dateKey,
                        onSelect: { onSelectHabit(habit) },
                        onToggle: { onToggleHabit(habit) }
                    )
                }
            }
        }
    }
}

private struct TodayFocusRow: View {
    let item: TodayFocusItem
    let dateKey: String
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    var showsToggle = true

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            if showsToggle {
                Button {
                    if let task = item.task { onToggleTask(task) }
                    if let habit = item.habit { onToggleHabit(habit) }
                } label: {
                    Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isDone ? "Oznacz jako niewykonane" : "Oznacz jako wykonane")
            }

            Button {
                if let task = item.task { onSelectTask(task) }
                if let habit = item.habit { onSelectHabit(habit) }
            } label: {
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(item.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(RootineTheme.ColorToken.primaryText)
                            .lineLimit(2)
                        Text(item.kindLabel)
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Spacer(minLength: 0)
                    if let time = item.time {
                        Text(time)
                            .font(.subheadline.monospacedDigit().weight(.semibold))
                            .foregroundStyle(RootineTheme.ColorToken.action)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły: \(item.title)")
        }
    }

    private var isDone: Bool {
        switch item.kind {
        case .task: return item.task.map { rootineTaskIsDoneOnDate($0, dateKey: dateKey) } ?? false
        case .habit: return item.habit.map { isHabitDone($0, dateKey: dateKey) } ?? false
        }
    }
}

private struct TodayTaskRow: View {
    let task: WorkspaceTask
    let dateKey: String
    let onSelect: () -> Void
    let onToggle: () -> Void

    private var isDone: Bool { rootineTaskIsDoneOnDate(task, dateKey: dateKey) }

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isDone ? "Oznacz \(task.text) jako niewykonane" : "Oznacz \(task.text) jako wykonane")

            Button(action: onSelect) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(task.text)
                            .font(.body.weight(.medium))
                            .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(isDone)
                            .lineLimit(2)
                        if let time = task.time {
                            Label(time, systemImage: "clock")
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły: \(task.text)")
        }
    }
}

private struct TodayHabitRow: View {
    let habit: WorkspaceHabit
    let dateKey: String
    let onSelect: () -> Void
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(!rootineHabitIsScheduledOnDate(habit, dateKey: dateKey))
            .accessibilityLabel(isDone ? "Oznacz \(habit.name) jako niewykonany" : "Oznacz \(habit.name) jako wykonany")

            Button(action: onSelect) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(habit.name)
                            .font(.body.weight(.medium))
                            .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(isDone)
                            .lineLimit(2)
                        Text(habit.time.map { "Nawyk · \($0)" } ?? "Nawyk")
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły: \(habit.name)")
        }
    }

    private var isDone: Bool { isHabitDone(habit, dateKey: dateKey) }
}

private struct TodayNutritionCard: View {
    let snapshot: TodaySnapshot
    let goals: NutritionGoals

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Odżywianie", systemImage: "fork.knife")
            HStack(alignment: .firstTextBaseline) {
                Text("\(number(snapshot.nutritionCalories)) kcal")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Spacer()
                Text("cel \(number(goals.calories))")
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ProgressView(value: min(1, goals.calories > 0 ? snapshot.nutritionCalories / goals.calories : 0))
                .tint(RootineTheme.ColorToken.action)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    nutritionMetric("Białko", value: snapshot.nutritionProtein, goal: goals.protein, unit: "g")
                    nutritionMetric("Węgle", value: snapshot.nutritionCarbs, goal: goals.carbs, unit: "g")
                    nutritionMetric("Tłuszcze", value: snapshot.nutritionFat, goal: goals.fat, unit: "g")
                }
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    nutritionMetric("Białko", value: snapshot.nutritionProtein, goal: goals.protein, unit: "g")
                    nutritionMetric("Węgle", value: snapshot.nutritionCarbs, goal: goals.carbs, unit: "g")
                    nutritionMetric("Tłuszcze", value: snapshot.nutritionFat, goal: goals.fat, unit: "g")
                }
            }
            nutritionMetric("Woda", value: snapshot.nutritionDay?.waterMl ?? 0, goal: goals.waterMl, unit: " ml")
        }
    }

    private func nutritionMetric(_ label: String, value: Double, goal: Double, unit: String) -> some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Text(label).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Text("\(number(value)) / \(number(goal))\(unit)")
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TodayNotesCard: View {
    let snapshot: TodaySnapshot

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Notatki", systemImage: "note.text")
            HStack(alignment: .firstTextBaseline) {
                Text("\(snapshot.activeNotes.count)")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text("aktywnych notatek")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Spacer()
            }
            Text(snapshot.notesUpdatedToday > 0 ? "\(snapshot.notesUpdatedToday) zmienionych dzisiaj" : "Brak zmian dzisiaj")
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
    }
}

private struct TodayCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(RootineTheme.Spacing.medium)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous)
                .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
        }
    }
}

private struct TodayCardHeader: View {
    let title: String
    let systemImage: String
    var tint: Color = RootineTheme.ColorToken.primaryText

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(tint)
    }
}

private func todayTitle(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "EEEE, d MMMM"
    return formatter.string(from: date).capitalized
}

private func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

private func overdueAgeLabel(for task: WorkspaceTask, relativeTo dateKey: String) -> String {
    guard let sourceDate = task.calendarDate ?? task.date,
          let days = RootineDate.calendarDaysBetween(sourceDate, dateKey),
          days > 0 else {
        return "Zaległe"
    }

    return days == 1 ? "dzień temu" : "\(days) dni temu"
}

private func todayItemWord(_ count: Int) -> String {
    let value = abs(count)
    if value == 1 { return "element" }
    let mod10 = value % 10
    let mod100 = value % 100
    return mod10 >= 5 || (12...14).contains(mod100) ? "elementów" : "elementy"
}

private func priorityWord(_ count: Int) -> String {
    let value = abs(count)
    if value == 1 { return "priorytet" }
    let mod10 = value % 10
    let mod100 = value % 100
    return (2...4).contains(mod10) && !(12...14).contains(mod100) ? "priorytety" : "priorytetów"
}

private func number(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}
