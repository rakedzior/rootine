import SwiftUI
import UniformTypeIdentifiers

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

private struct TodaySnapshot {
    let date: Date
    let dateKey: String
    let tasks: [WorkspaceTask]
    let overdueTasks: [WorkspaceTask]
    let planTasks: [WorkspaceTask]
    let habits: [WorkspaceHabit]
    let nutritionDay: NutritionDay?
    let notes: [NoteRecord]
    let now: TodayFocusItem?
    let next: [TodayFocusItem]
    let aggregation: TodayAggregation

    var completedTasks: Int { planTasks.filter { rootineTaskIsDoneOnDate($0, dateKey: dateKey) }.count }
    var completedHabits: Int { habits.filter { isHabitDone($0, dateKey: dateKey) }.count }
    var nutritionCompleted: Bool { nutritionDay?.closedAt != nil }
    var nutritionEntries: [NutritionEntry] {
        guard let nutritionDay else { return [] }
        return nutritionDay.entries.breakfast
            + nutritionDay.entries.lunch
            + nutritionDay.entries.snack
            + nutritionDay.entries.dinner
    }
    var nutritionCalories: Double { nutritionEntries.reduce(0) { $0 + $1.calories } }
    var nutritionProtein: Double { nutritionEntries.reduce(0) { $0 + $1.protein } }
    var nutritionCarbs: Double { nutritionEntries.reduce(0) { $0 + $1.carbs } }
    var nutritionFat: Double { nutritionEntries.reduce(0) { $0 + $1.fat } }
    var activeNotes: [NoteRecord] { notes.filter { !$0.archived } }
    var notesUpdatedToday: Int { activeNotes.filter { $0.updatedAt.hasPrefix(dateKey) }.count }
    var totalItems: Int { planTasks.count + habits.count + (nutritionDay == nil ? 0 : 1) }
    var completedItems: Int { completedTasks + completedHabits + (nutritionCompleted ? 1 : 0) }
    var remainingItems: Int { max(0, totalItems - completedItems) }
    var progress: Double { totalItems == 0 ? 0 : Double(completedItems) / Double(totalItems) }
    var priorityTotal: Int {
        planTasks.filter { $0.priority != nil }.count + habits.filter { $0.priority != nil }.count
    }
    var priorityCompleted: Int {
        planTasks.filter { $0.priority != nil && rootineTaskIsDoneOnDate($0, dateKey: dateKey) }.count
            + habits.filter { $0.priority != nil && isHabitDone($0, dateKey: dateKey) }.count
    }

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
        planTasks = TodayTimelineTasks.collect(
            today: aggregation.todayTasks, overdue: aggregation.overdueTasks,
            all: taskWorkspace.tasks, date: date, calendar: calendar
        )
        habits = aggregation.todayHabits
        nutritionDay = aggregation.nutritionDay
        notes = aggregation.notes
        now = Self.focusItem(from: aggregation.now)
        next = aggregation.next.compactMap { Self.focusItem(from: $0) }
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

    var taskUndo: RootineTaskUndo? = nil
    var wasCompleted: Bool = false

    var message: String { "Oznaczono „\(title)” jako \(wasCompleted ? "niewykonane" : "wykonane")" }
}

private func isHabitDone(_ habit: WorkspaceHabit, dateKey: String = RootineDate.localDate()) -> Bool {
    rootineHabitIsDoneOnDate(habit, dateKey: dateKey)
}

struct TodayView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isShowingAddTask = false
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
                goals: environment.nutritionWorkspace.goals,
                isLaunching: environment.isLaunching,
                syncStatus: environment.workspaceSyncStatus,
                onAddTask: { isShowingAddTask = true },
                onSelectTask: { selectedTask = $0 },
                onSelectHabit: { selectedHabit = $0 },
                onToggleTask: { task in
                    undoAction = nil
                    Task {
                        await environment.toggleTaskCompletion(id: task.id, on: context.date) { change in
                            undoAction = TodayUndoAction(
                                kind: .task, recordID: task.id, title: change.snapshot.text, date: context.date,
                                taskUndo: change,
                                wasCompleted: rootineTaskIsDoneOnDate(change.snapshot, dateKey: snapshot.dateKey)
                            )
                        }
                    }
                },
                onToggleHabit: { habit in
                    undoAction = TodayUndoAction(kind: .habit, recordID: habit.id, title: habit.name, date: context.date,
                                                wasCompleted: isHabitDone(habit, dateKey: snapshot.dateKey))
                    Task { await environment.toggleHabitCompletion(id: habit.id, on: context.date) }
                },
                undoAction: undoAction,
                onUndo: undo,
                onRefresh: { await environment.flushPendingMutations() },
                onRetry: { await environment.flushPendingMutations() }
            )
            .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: snapshot.completedItems)
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isShowingAddTask) {
            TaskComposerSheet(date: Date())
        }
        .sheet(item: $selectedTask) { task in
            TaskDetailSheet(task: task)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedHabit) { habit in
            HabitOverviewSheet(habitID: habit.id)
                .presentationDragIndicator(.visible)
        }
    }

    private func undo() {
        guard let action = undoAction else { return }
        undoAction = nil
        Task {
            switch action.kind {
            case .task:
                if let change = action.taskUndo {
                    _ = await environment.restoreTaskSnapshot(change.snapshot, ifCurrentMatches: change.expectedCurrent)
                }
            case .habit:
                await environment.toggleHabitCompletion(id: action.recordID, on: action.date)
            }
        }
    }
}

private struct TodayContentView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var summaryNavigation: TodaySummaryNavigation?
    let snapshot: TodaySnapshot
    let goals: NutritionGoals
    let isLaunching: Bool
    let syncStatus: WorkspaceSyncStatus
    let onAddTask: () -> Void
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let undoAction: TodayUndoAction?
    let onUndo: () -> Void
    let onRefresh: () async -> Void
    let onRetry: () async -> Void

    var body: some View {
        ScrollViewReader { scrollProxy in
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
                }

                TodaySummaryCard(snapshot: snapshot) { group in
                    summaryNavigation = TodaySummaryNavigation(group: group)
                }
                TodayTimelineCard(
                    snapshot: snapshot,
                    navigation: summaryNavigation,
                    onNavigate: { id in
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) {
                            scrollProxy.scrollTo(id, anchor: .top)
                        }
                    },
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit
                )
                TodayHabitsCard(snapshot: snapshot, onSelect: onSelectHabit, onToggle: onToggleHabit)
                TodayBalanceCard(snapshot: snapshot)
                TodayAreasSection(
                    snapshot: snapshot,
                    goals: goals,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit,
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit
                )

                if let undoAction {
                    RootineUndoBanner(message: undoAction.message, onUndo: onUndo)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.small)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .refreshable { await onRefresh() }
        .overlay(alignment: .top) {
            if case .localOnly = syncStatus {
                RootineOfflineBanner()
                    .background(RootineTheme.ColorToken.surface,
                                in: RoundedRectangle(cornerRadius: RootineTheme.Radius.control))
                    .padding(.horizontal, RootineTheme.Spacing.medium)
                    .allowsHitTesting(false)
            }
        }
        }
    }
}

private struct TodaySummaryNavigation: Equatable {
    let id = UUID()
    let group: TodaySummaryGroup
}

private struct TodaySummaryCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let snapshot: TodaySnapshot
    let onSelect: (TodaySummaryGroup) -> Void

    private var summary: TodayPlanSummary {
        TodayPlanSummary(tasks: snapshot.planTasks, date: snapshot.date)
    }

    private var progress: Double {
        let total = summary.overdueIDs.count + summary.todayIDs.count + summary.completedIDs.count
        return total == 0 ? 0 : Double(summary.completedIDs.count) / Double(total)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            Text(todayTitle(snapshot.date))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            VStack(spacing: RootineTheme.Spacing.small) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Postęp zadań")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Spacer()
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                }
                ProgressView(value: progress)
                    .tint(RootineTheme.ColorToken.action)
                    .accessibilityLabel("Postęp zadań w planie dnia")
                    .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0))))
            }
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
                : AnyLayout(HStackLayout(alignment: .top, spacing: RootineTheme.Spacing.small))
            layout {
                counter(.overdue, title: "Zaległe", color: RootineTheme.ColorToken.warning)
                counter(.today, title: "Na dziś", color: RootineTheme.ColorToken.action)
                counter(.completed, title: "Wykonane", color: RootineTheme.ColorToken.success)
            }
            if summary.remainingPriorities > 0 {
                Label("Priorytety do wykonania: \(summary.remainingPriorities)", systemImage: "flag")
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
        }
        .rootineSurface()
        .accessibilityElement(children: .contain)
    }

    private func counter(_ group: TodaySummaryGroup, title: String, color: Color) -> some View {
        let count = summary.ids(for: group).count
        return Button { onSelect(group) } label: {
            HStack(spacing: RootineTheme.Spacing.xSmall) {
                Circle()
                    .fill(color)
                    .frame(width: 5, height: 5)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(count)")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(count == 0)
        .accessibilityLabel(group == .completed ? "Wykonane dziś" : title)
        .accessibilityValue("\(count)")
        .accessibilityHint(count == 0 ? "Brak zadań w tej grupie" : "Przewija do zadań w planie dnia")
        .accessibilityIdentifier("today-summary-\(group.rawValue)")
    }
}

private struct TodayNowCard: View {
    let item: TodayFocusItem?
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void
    let dateKey: String

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Teraz", systemImage: "play.circle.fill", tint: RootineTheme.ColorToken.action)
            if let item {
                TodayFocusRow(
                    item: item,
                    dateKey: dateKey,
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit
                )
            } else {
                Label("Brak zaplanowanego elementu w tej chwili", systemImage: "sparkles")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityIdentifier("today-now")
    }
}

private struct TodayNextCard: View {
    let items: [TodayFocusItem]
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let dateKey: String

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Następne", systemImage: "arrow.right.circle")
            if items.isEmpty {
                Text("Brak kolejnych zadań z godziną. Możesz działać we własnym rytmie.")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else {
                VStack(spacing: 0) {
                    ForEach(items) { item in
                        TodayFocusRow(
                            item: item,
                            dateKey: dateKey,
                            onSelectTask: onSelectTask,
                            onSelectHabit: onSelectHabit,
                            onToggleTask: { _ in },
                            onToggleHabit: { _ in },
                            showsToggle: false
                        )
                        if item.id != items.last?.id {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("today-next")
    }
}

private struct TodayOverdueCard: View {
    let tasks: [WorkspaceTask]
    let onSelect: (WorkspaceTask) -> Void
    let onToggle: (WorkspaceTask) -> Void
    let dateKey: String

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Zaległości", systemImage: "clock.badge.exclamationmark", tint: tasks.isEmpty ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.warning)
            if tasks.isEmpty {
                Label("Brak zaległych zadań", systemImage: "checkmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.success)
            } else {
                ForEach(tasks.prefix(3)) { task in
                    TodayTaskRow(task: task, dateKey: dateKey, onSelect: { onSelect(task) }, onToggle: { onToggle(task) })
                    if task.id != tasks.prefix(3).last?.id {
                        Divider().overlay(RootineTheme.ColorToken.separator)
                    }
                }
                if tasks.count > 3 {
                    Text("+\(tasks.count - 3) więcej w Zadaniach")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
        }
        .accessibilityIdentifier("today-overdue")
    }
}

private struct TodayTimelineCard: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var showOverdue = true
    @State private var showCompleted = true
    @State private var isRescheduling = false
    @AppStorage("today.timeline.manualOrder.v1") private var savedOrders = "{}"
    @State private var taskToReschedule: WorkspaceTask?
    @State private var suggestedTime: String?
    @State private var activeSwipe: Int?
    let snapshot: TodaySnapshot
    let navigation: TodaySummaryNavigation?
    let onNavigate: (String) -> Void
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void

    private var entries: [TodayFocusItem] {
        let tasks = snapshot.planTasks.map {
            TodayFocusItem(id: "task-\($0.id)", title: $0.text, time: $0.time,
                           kind: .task, task: $0, habit: nil)
        }
        return tasks.sorted {
            // Completion never participates in sorting: checking a row cannot move it.
            let leftDay = min($0.task?.calendarDate ?? snapshot.dateKey, snapshot.dateKey)
            let rightDay = min($1.task?.calendarDate ?? snapshot.dateKey, snapshot.dateKey)
            if leftDay != rightDay { return leftDay < rightDay }
            let leftTime = $0.time.flatMap { $0.isEmpty ? nil : $0 } ?? "99:99"
            let rightTime = $1.time.flatMap { $0.isEmpty ? nil : $0 } ?? "99:99"
            if leftTime != rightTime { return leftTime < rightTime }
            if leftTime == "99:99" {
                let left = manualOrder.firstIndex(of: $0.id) ?? Int.max
                let right = manualOrder.firstIndex(of: $1.id) ?? Int.max
                if left != right { return left < right }
            }
            return $0.id < $1.id
        }
    }

    private var accountKey: String { environment.session?.user.id ?? "preview" }
    private var orders: [String: [String]] {
        (try? JSONDecoder().decode([String: [String]].self, from: Data(savedOrders.utf8))) ?? [:]
    }
    private var manualOrder: [String] { orders[accountKey] ?? [] }

    private func reschedule(_ task: WorkspaceTask, near time: String? = nil) {
        activeSwipe = nil
        suggestedTime = time
        taskToReschedule = task
    }

    private func receiveDrop(_ values: [String], onto target: TodayFocusItem) -> Bool {
        guard let value = values.first, value.hasPrefix("rootine-today-task:"),
              let id = Int(value.dropFirst("rootine-today-task:".count)),
              let source = entries.first(where: { $0.task?.id == id }),
              let task = source.task, let targetTask = target.task,
              let action = TodayTaskMovement.dropAction(source: task, target: targetTask, todayKey: snapshot.dateKey)
        else { return false }
        activeSwipe = nil
        let sourceDay = task.calendarDate ?? snapshot.dateKey
        if action == .reorder {
            let ids = entries.filter {
                $0.time?.isEmpty != false && ($0.task?.calendarDate ?? snapshot.dateKey) == sourceDay
            }.map(\.id)
            var updated = orders
            // Keep ordering of other day groups; discard identifiers no longer present.
            let allIDs = Set(entries.map(\.id))
            updated[accountKey] = manualOrder.filter { allIDs.contains($0) && !ids.contains($0) }
                + TodayTaskMovement.reordered(ids, source: source.id, target: target.id)
            if let data = try? JSONEncoder().encode(updated), let string = String(data: data, encoding: .utf8) {
                savedOrders = string
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } else {
            reschedule(task, near: target.time)
        }
        return true
    }

    private var visibleEntries: [TodayFocusItem] {
        entries.filter { item in
            if isCompleted(item) { return showCompleted }
            let isOverdue = item.task?.calendarDate.map { $0 < snapshot.dateKey } ?? false
            return showOverdue || !isOverdue
        }
    }

    private func isCompleted(_ item: TodayFocusItem) -> Bool {
        if let task = item.task { return rootineTaskIsDoneOnDate(task, dateKey: snapshot.dateKey) }
        if let habit = item.habit { return isHabitDone(habit, dateKey: snapshot.dateKey) }
        return false
    }

    @ViewBuilder private var actions: some View {
        Button(isRescheduling ? "Przekładam…" : "Przełóż zaległe") {
            isRescheduling = true
            let ids = Set(snapshot.overdueTasks.map(\.id))
            Task {
                defer { isRescheduling = false }
                await environment.rescheduleOverdueTasksToToday(ids: ids)
            }
        }
        .disabled(snapshot.overdueTasks.isEmpty || isRescheduling)
        .accessibilityHint("Przenosi nieukończone zaległe zadania na dziś, zachowując godziny")
        .accessibilityIdentifier("today-reschedule-overdue")

        Button(showOverdue ? "Ukryj zaległe" : "Pokaż zaległe") {
            showOverdue.toggle()
        }
        .accessibilityIdentifier("today-toggle-overdue")
        .accessibilityValue(showOverdue ? "Zaległe widoczne" : "Zaległe ukryte")

        Button(showCompleted ? "Ukryj zakończone" : "Pokaż zakończone") {
            showCompleted.toggle()
        }
        .accessibilityIdentifier("today-toggle-completed")
        .accessibilityValue(showCompleted ? "Zakończone widoczne" : "Zakończone ukryte")
    }

    var body: some View {
        TodayCard {
            HStack {
                Text("Plan dnia").font(.headline)
                Spacer()
                Menu {
                    actions
                } label: {
                    Image(systemName: "gearshape")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityLabel("Ustawienia planu dnia")
                .accessibilityIdentifier("today-plan-settings")
            }
            if visibleEntries.isEmpty {
                Text(entries.isEmpty ? "Twój plan jest pusty. Dodaj pierwsze zadanie." : "Brak widocznych zadań. Zmień widoczność w ustawieniach planu dnia.")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .padding(.vertical, RootineTheme.Spacing.small)
            } else {
                VStack(spacing: 0) {
                    ForEach(visibleEntries) { item in
                        timelineRow(item)
                            .id(item.id)
                            .dropDestination(for: String.self) { values, _ in
                                receiveDrop(values, onto: item)
                            }
                    }
                }
                .background(alignment: .topLeading) {
                    GeometryReader { geometry in
                        Path { path in
                            path.move(to: CGPoint(x: 22, y: 30))
                            path.addLine(to: CGPoint(x: 22, y: max(30, geometry.size.height - 30)))
                        }
                        .stroke(RootineTheme.ColorToken.secondaryText.opacity(0.35),
                                style: StrokeStyle(lineWidth: 1, dash: [3, 5]))
                    }
                    .accessibilityHidden(true)
                }
            }
        }
        .sheet(item: $taskToReschedule) { task in
            TodayRescheduleSheet(task: task, suggestedTime: suggestedTime)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task(id: navigation?.id) {
            guard let navigation else { return }
            let ids = TodayPlanSummary(tasks: snapshot.planTasks, date: snapshot.date).ids(for: navigation.group)
            guard let target = entries.first(where: { item in item.task.map { ids.contains($0.id) } ?? false }) else { return }
            if navigation.group == .overdue { showOverdue = true }
            if navigation.group == .completed { showCompleted = true }
            activeSwipe = nil
            await Task.yield()
            guard !Task.isCancelled else { return }
            onNavigate(target.id)
        }
    }

    @ViewBuilder private func timelineRow(_ item: TodayFocusItem) -> some View {
        let row = TodayTimelineItemRow(
            item: item, dateKey: snapshot.dateKey,
            onSelectTask: onSelectTask, onSelectHabit: onSelectHabit,
            onToggleTask: onToggleTask, onToggleHabit: onToggleHabit
        )
        if let task = item.task {
            TodayTaskGestureRow(task: task, isDone: isCompleted(item), activeSwipe: $activeSwipe,
                                onToggle: { onToggleTask(task) },
                                onEdit: { onSelectTask(task) },
                                onReschedule: { reschedule(task) }) { row }
        } else {
            row
        }
    }
}

private struct TodayTaskGestureRow<Content: View>: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let task: WorkspaceTask
    let isDone: Bool
    @Binding var activeSwipe: Int?
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onReschedule: () -> Void
    @ViewBuilder let content: () -> Content
    @State private var confirmDelete = false

    var body: some View {
        VStack(spacing: 0) {
            content()
                .contentShape(Rectangle())
                .gesture(TodayHorizontalSwipe(direction: .right) {
                    activeSwipe = nil
                    onToggle()
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                })
                .gesture(TodayHorizontalSwipe(direction: .left) {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { activeSwipe = task.id }
                })
                .contextMenu {
                    Button("Edytuj", systemImage: "pencil", action: onEdit)
                    Button("Przełóż", systemImage: "calendar", action: onReschedule)
                    Menu("Zmień priorytet", systemImage: "flag") {
                        priorityButton("Wysoki", priority: .high)
                        priorityButton("Średni", priority: .medium)
                        priorityButton("Niski", priority: .low)
                        priorityButton("Brak", priority: nil)
                    }
                    Button("Usuń", systemImage: "trash", role: .destructive) { confirmDelete = true }
                }
                .draggable("rootine-today-task:\(task.id)") {
                    Label(task.text, systemImage: "line.3.horizontal")
                        .padding()
                        .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityAction(named: isDone ? "Cofnij ukończenie" : "Oznacz jako wykonane", onToggle)
                .accessibilityAction(named: "Przełóż", onReschedule)
                .accessibilityAction(named: "Usuń") { confirmDelete = true }
            if activeSwipe == task.id {
                HStack {
                    Spacer(minLength: 44)
                    Button("Przełóż", systemImage: "calendar", action: onReschedule)
                        .tint(RootineTheme.ColorToken.action)
                    Button("Usuń", systemImage: "trash", role: .destructive) { confirmDelete = true }
                        .tint(RootineTheme.ColorToken.destructive)
                    Button { activeSwipe = nil } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Zamknij akcje zadania")
                }
                .buttonStyle(.bordered)
                .font(.subheadline)
                .frame(minHeight: 44)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
        .confirmationDialog("Usunąć zadanie?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Przenieś do kosza", role: .destructive) {
                activeSwipe = nil
                Task { await environment.deleteTask(id: task.id) }
            }
            Button("Anuluj", role: .cancel) {}
        } message: { Text("Zadanie „\(task.text)” będzie można przywrócić z kosza.") }
    }

    private func priorityButton(_ title: String, priority: TaskPriority?) -> some View {
        Button {
            Task { await environment.updateTaskPriority(id: task.id, priority: priority) }
        } label: {
            if task.priority == priority { Label(title, systemImage: "checkmark") }
            else { Text(title) }
        }
    }
}

/// A quick horizontal swipe does not claim the pan used by scrolling or native drag-and-drop.
private struct TodayHorizontalSwipe: UIGestureRecognizerRepresentable {
    let direction: UISwipeGestureRecognizer.Direction
    let action: () -> Void

    func makeUIGestureRecognizer(context: Context) -> UISwipeGestureRecognizer {
        let recognizer = UISwipeGestureRecognizer()
        recognizer.direction = direction
        recognizer.delegate = context.coordinator
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UISwipeGestureRecognizer, context: Context) {
        if recognizer.state == .ended { action() }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            true
        }
    }
}

private struct TodayRescheduleSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let task: WorkspaceTask
    @State private var date: Date
    @State private var hasTime: Bool
    @State private var time: Date
    @State private var isSaving = false
    @State private var error: String?

    init(task: WorkspaceTask, suggestedTime: String?) {
        self.task = task
        let clock = suggestedTime ?? task.time
        _date = State(initialValue: Date())
        _hasTime = State(initialValue: clock != nil)
        let parts = clock?.split(separator: ":").compactMap { Int($0) } ?? []
        _time = State(initialValue: Calendar.current.date(bySettingHour: parts.first ?? 9,
            minute: parts.last ?? 0, second: 0, of: Date()) ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(task.text) }
                Section("Nowy termin") {
                    DatePicker("Dzień", selection: $date, displayedComponents: .date)
                    Toggle("O określonej godzinie", isOn: $hasTime)
                    if hasTime { DatePicker("Godzina", selection: $time, displayedComponents: .hourAndMinute) }
                }
                if let error { Text(error).foregroundStyle(RootineTheme.ColorToken.destructive) }
            }
            .navigationTitle("Przełóż zadanie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() }.disabled(isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Zapisuję…" : "Zapisz") {
                        isSaving = true
                        let parts = Calendar.current.dateComponents([.hour, .minute], from: time)
                        let clock = hasTime ? String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0) : nil
                        Task {
                            let saved = await environment.rescheduleTask(id: task.id, dateKey: RootineDate.localDate(date), time: clock)
                            isSaving = false
                            if saved { dismiss() }
                            else { error = "Nie udało się zmienić terminu. Sprawdź, czy zadanie nadal istnieje i wybierz poprawny termin." }
                        }
                    }.disabled(isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }
}

private struct TodayTimelineItemRow: View {
    let item: TodayFocusItem
    let dateKey: String
    let onSelectTask: (WorkspaceTask) -> Void
    let onSelectHabit: (WorkspaceHabit) -> Void
    let onToggleTask: (WorkspaceTask) -> Void
    let onToggleHabit: (WorkspaceHabit) -> Void

    private var isOverdue: Bool { item.task?.calendarDate.map { $0 < dateKey } ?? false }
    private var color: Color {
        isDone ? RootineTheme.ColorToken.success
            : isOverdue ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.action
    }
    private var context: String {
        let time = item.time.flatMap { $0.isEmpty ? nil : $0 }
        if isOverdue {
            let due = item.task?.calendarDate.flatMap { RootineDate.dateOnly(from: $0) }
            let day = due?.formatted(.dateTime.day().month().locale(Locale(identifier: "pl_PL"))) ?? ""
            return ["Zaległe", day, time].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        }
        return time ?? "Bez godziny"
    }

    var body: some View {
        HStack(alignment: .top, spacing: RootineTheme.Spacing.small) {
            Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(color)
                    .background(Circle().fill(RootineTheme.ColorToken.surface))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            .onTapGesture(perform: toggle)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { toggle() }
            .accessibilityLabel(isDone ? "Oznacz \(item.title) jako niewykonane" : "Oznacz \(item.title) jako wykonane")
            .accessibilityValue(isDone ? "Ukończone" : isOverdue ? "Zaległe" : "Do wykonania")
            .accessibilityIdentifier("today-toggle-\(item.id)")

                HStack(alignment: .center, spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(context)
                            .font(.caption.monospacedDigit().weight(.medium))
                            .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : color)
                        Text(item.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(isDone)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.vertical, RootineTheme.Spacing.xSmall)
                .padding(.horizontal, RootineTheme.Spacing.small)
                .background(isDone ? Color.clear : color.opacity(0.05),
                            in: RoundedRectangle(cornerRadius: RootineTheme.Radius.control))
                .contentShape(Rectangle())
            .onTapGesture(perform: open)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { open() }
            .accessibilityLabel("\(item.title), \(context)\(isDone ? ", ukończone" : "")")
            .accessibilityHint("Otwiera szczegóły zobowiązania")
            .accessibilityIdentifier("today-open-\(item.id)")
        }
        .padding(.vertical, RootineTheme.Spacing.small)
    }

    private var isDone: Bool {
        switch item.kind {
        case .task: return item.task.map { rootineTaskIsDoneOnDate($0, dateKey: dateKey) } ?? false
        case .habit: return item.habit.map { isHabitDone($0, dateKey: dateKey) } ?? false
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
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
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
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły: \(task.text)")
        }
    }
}

private struct TodayHabitsCard: View {
    let snapshot: TodaySnapshot
    let onSelect: (WorkspaceHabit) -> Void
    let onToggle: (WorkspaceHabit) -> Void
    @State private var showAdd = false
    @State private var showManager = false

    private var habits: [WorkspaceHabit] {
        snapshot.habits.sorted {
            let left = $0.time?.isEmpty == false ? $0.time! : "99:99"
            let right = $1.time?.isEmpty == false ? $1.time! : "99:99"
            return left == right ? $0.id < $1.id : left < right
        }
    }

    var body: some View {
        TodayCard {
            HStack(spacing: 8) {
                Text("Nawyki").font(.headline)
                Text("\(snapshot.completedHabits) z \(habits.count)")
                    .font(.subheadline).monospacedDigit()
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .accessibilityLabel("Wykonano \(snapshot.completedHabits) z \(habits.count) nawyków")
                Spacer()
                Button { showAdd = true } label: {
                    Image(systemName: "plus").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Dodaj nawyk")
                Menu {
                    Button("Zarządzaj nawykami", systemImage: "slider.horizontal.3") { showManager = true }
                } label: {
                    Image(systemName: "ellipsis").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Opcje nawyków")
            }
            if habits.isEmpty {
                Text("Na dziś nie masz zaplanowanych nawyków.")
                    .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Button("Zarządzaj nawykami") { showManager = true }
                    .frame(minHeight: 44)
            } else {
                ForEach(habits) { habit in
                    TodayHabitRow(habit: habit, dateKey: snapshot.dateKey,
                                  onSelect: { onSelect(habit) }, onToggle: { onToggle(habit) })
                    if habit.id != habits.last?.id { Divider() }
                }
            }
        }
        .sheet(isPresented: $showAdd) { AddHabitSheet() }
        .sheet(isPresented: $showManager) { HabitManagerSheet() }
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
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
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
    let value = formatter.string(from: date)
    return value.prefix(1).uppercased() + value.dropFirst()
}

private func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

private func todayItemWord(_ count: Int) -> String {
    let value = abs(count)
    if value == 1 { return "element" }
    let mod10 = value % 10
    let mod100 = value % 100
    return mod10 >= 5 || (12...14).contains(mod100) ? "elementów" : "elementy"
}

private func number(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}
