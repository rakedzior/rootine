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

    var completedTasks: Int { tasks.filter { rootineTaskIsDoneOnDate($0, dateKey: dateKey) }.count }
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
    var totalItems: Int { tasks.count + habits.count + (nutritionDay == nil ? 0 : 1) }
    var completedItems: Int { completedTasks + completedHabits + (nutritionCompleted ? 1 : 0) }
    var remainingItems: Int { max(0, totalItems - completedItems) }
    var progress: Double { totalItems == 0 ? 0 : Double(completedItems) / Double(totalItems) }
    var priorityTotal: Int {
        tasks.filter { $0.priority != nil }.count + habits.filter { $0.priority != nil }.count
    }
    var priorityCompleted: Int {
        tasks.filter { $0.priority != nil && rootineTaskIsDoneOnDate($0, dateKey: dateKey) }.count
            + habits.filter { $0.priority != nil && isHabitDone($0, dateKey: dateKey) }.count
    }

    init(taskWorkspace: TaskWorkspace, nutritionWorkspace: NutritionWorkspace, notesWorkspace: NotesWorkspace, date: Date) {
        self.date = date
        dateKey = RootineDate.localDate(date)
        let calendar = Calendar.current
        let todayKey = RootineDate.localDate(date)

        tasks = taskWorkspace.tasks
            .filter { task in
                guard task.deleted != true, task.source?.kind != "work" else { return false }
                return task.calendarDate == todayKey || (task.calendarDate == nil && task.view == "dzis")
            }
            .sorted(by: Self.taskSort)

        overdueTasks = taskWorkspace.tasks
            .filter { task in
                task.deleted != true
                    && task.source?.kind != "work"
                    && !rootineTaskIsDoneOnDate(task, dateKey: todayKey)
                    && task.calendarDate != nil
                    && task.calendarDate! < todayKey
            }
            .sorted(by: Self.taskSort)

        habits = taskWorkspace.habits
            .filter { rootineHabitIsScheduledOnDate($0, dateKey: todayKey, calendar: calendar) }
            .sorted { lhs, rhs in
                switch (lhs.time, rhs.time) {
                case let (left?, right?) where left != right: return left < right
                case (_?, nil): return true
                case (nil, _?): return false
                default: return lhs.id < rhs.id
                }
            }
        nutritionDay = nutritionWorkspace.days[todayKey]
        notes = notesWorkspace.notes

        let timedItems = Self.makeFocusItems(tasks: tasks, habits: habits)
        let currentMinutes = Self.minutesSinceMidnight(date)
        now = timedItems.last(where: { item in
            guard let time = item.time, let minutes = Self.parseMinutes(time) else { return false }
            return minutes <= currentMinutes && !Self.isDone(item, dateKey: todayKey)
        })
        next = timedItems
            .filter { item in
                guard let time = item.time, let minutes = Self.parseMinutes(time) else { return false }
                return minutes > currentMinutes && !Self.isDone(item, dateKey: todayKey)
            }
            .prefix(3)
            .map { $0 }
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

    var message: String { "Oznaczono „\(title)” jako wykonane" }
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
                taskWorkspace: environment.taskWorkspace,
                nutritionWorkspace: environment.nutritionWorkspace,
                notesWorkspace: environment.notesWorkspace,
                date: context.date
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
                    undoAction = TodayUndoAction(kind: .task, recordID: task.id, title: task.text, date: context.date)
                    Task { await environment.toggleTaskCompletion(id: task.id, on: context.date) }
                },
                onToggleHabit: { habit in
                    undoAction = TodayUndoAction(kind: .habit, recordID: habit.id, title: habit.name, date: context.date)
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
        .sheet(isPresented: $isShowingAddTask) {
            AddTaskSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
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
            case .habit:
                await environment.toggleHabitCompletion(id: action.recordID, on: action.date)
            }
        }
    }
}

private struct TodayContentView: View {
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

                TodaySummaryCard(snapshot: snapshot, onAddTask: onAddTask)
                TodayNowCard(
                    item: snapshot.now,
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit,
                    dateKey: snapshot.dateKey
                )
                TodayNextCard(
                    items: snapshot.next,
                    onSelectTask: onSelectTask,
                    onSelectHabit: onSelectHabit,
                    dateKey: snapshot.dateKey
                )
                TodayOverdueCard(
                    tasks: snapshot.overdueTasks,
                    onSelect: onSelectTask,
                    onToggle: onToggleTask,
                    dateKey: snapshot.dateKey
                )
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
    }
}

private struct TodaySummaryCard: View {
    let snapshot: TodaySnapshot
    let onAddTask: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(todayTitle(snapshot.date))
                    .font(.title2.weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(snapshot.totalItems == 0 ? "Zacznij od jednego małego kroku." : "Twój plan jest gotowy. Zobacz, co teraz.")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }

            HStack(alignment: .lastTextBaseline, spacing: RootineTheme.Spacing.small) {
                Text("\(snapshot.completedItems)")
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text("z \(snapshot.totalItems) wykonano")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Spacer(minLength: 0)
                Text("\(Int(snapshot.progress * 100))%")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(RootineTheme.ColorToken.action)
            }
            ProgressView(value: snapshot.progress)
                .tint(RootineTheme.ColorToken.action)
                .accessibilityLabel("Postęp dnia")
                .accessibilityValue("\(Int(snapshot.progress * 100)) procent")

            RootinePrimaryButton("Dodaj zadanie", systemImage: "plus", action: onAddTask)
                .accessibilityIdentifier("today-add-task")
        }
        .rootineSurface()
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
    return formatter.string(from: date).capitalized
}

private func number(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}
