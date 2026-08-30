import SwiftUI

private struct TodayQueueItem: Identifiable {
    let id: String
    let time: String
    let title: String
    let kind: String
}

private struct TodaySnapshot {
    let date: Date
    let dateKey: String
    let tasks: [WorkspaceTask]
    let overdueTasks: [WorkspaceTask]
    let habits: [WorkspaceHabit]
    let nutritionDay: NutritionDay?
    let notes: [NoteRecord]
    let queue: [TodayQueueItem]

    var completedTasks: Int { tasks.filter(\.done).count }
    var completedHabits: Int { habits.filter { isHabitDone($0) }.count }
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
    var notesUpdatedToday: Int {
        activeNotes.filter { $0.updatedAt.hasPrefix(dateKey) }.count
    }
    var totalItems: Int { tasks.count + habits.count + (nutritionDay == nil ? 0 : 1) }
    var completedItems: Int { completedTasks + completedHabits + (nutritionCompleted ? 1 : 0) }
    var remainingItems: Int { max(0, totalItems - completedItems) }
    var progress: Double { totalItems == 0 ? 0 : Double(completedItems) / Double(totalItems) }
    var priorityTotal: Int {
        tasks.filter { $0.priority != nil }.count + habits.filter { $0.priority != nil }.count
    }
    var priorityCompleted: Int {
        tasks.filter { $0.priority != nil && $0.done }.count
            + habits.filter { $0.priority != nil && isHabitDone($0) }.count
    }

    init(taskWorkspace: TaskWorkspace, nutritionWorkspace: NutritionWorkspace, notesWorkspace: NotesWorkspace, date: Date) {
        self.date = date
        dateKey = RootineDate.localDate(date)
        let calendar = Calendar.current
        let currentDateKey = RootineDate.localDate(date)
        tasks = taskWorkspace.tasks.filter { task in
            guard task.deleted != true, task.source?.kind != "work" else { return false }
            return task.calendarDate == currentDateKey || (task.calendarDate == nil && task.view == "dzis")
        }
        overdueTasks = taskWorkspace.tasks.filter { task in
            task.deleted != true
                && task.source?.kind != "work"
                && !task.done
                && (task.calendarDate ?? "") < currentDateKey
                && task.calendarDate != nil
        }
        habits = taskWorkspace.habits.filter { isHabitScheduled($0, dateKey: currentDateKey, calendar: calendar) }
        nutritionDay = nutritionWorkspace.days[currentDateKey]
        notes = notesWorkspace.notes
        queue = Self.makeQueue(tasks: tasks, habits: habits)
    }

    private static func makeQueue(tasks: [WorkspaceTask], habits: [WorkspaceHabit]) -> [TodayQueueItem] {
        let taskItems = tasks.compactMap { task -> TodayQueueItem? in
            guard !task.done, let time = task.time else { return nil }
            return TodayQueueItem(id: "task-\(task.id)", time: time, title: task.text, kind: "Zadanie")
        }
        let habitItems = habits.compactMap { habit -> TodayQueueItem? in
            guard !isHabitDone(habit), let time = habit.time else { return nil }
            return TodayQueueItem(id: "habit-\(habit.id)", time: time, title: habit.name, kind: "Nawyk")
        }
        return (taskItems + habitItems).sorted { $0.time < $1.time }.prefix(3).map { $0 }
    }
}

private func isHabitDone(_ habit: WorkspaceHabit, dateKey: String = RootineDate.localDate()) -> Bool {
    rootineHabitIsDoneOnDate(habit, dateKey: dateKey)
}

private func isHabitScheduled(
    _ habit: WorkspaceHabit,
    dateKey: String,
    calendar: Calendar = .current
) -> Bool {
    rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar)
}

struct TodayView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            TodayContentView(
                snapshot: TodaySnapshot(
                    taskWorkspace: environment.taskWorkspace,
                    nutritionWorkspace: environment.nutritionWorkspace,
                    notesWorkspace: environment.notesWorkspace,
                    date: context.date
                ),
                goals: environment.nutritionWorkspace.goals,
                onToggleTask: { id in await environment.toggleTaskCompletion(id: id, on: context.date) },
                onToggleHabit: { id in await environment.toggleHabitCompletion(id: id, on: context.date) }
            )
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }
}

private struct TodayContentView: View {
    let snapshot: TodaySnapshot
    let goals: NutritionGoals
    let onToggleTask: (Int) async -> Void
    let onToggleHabit: (Int) async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                TodayProgressCard(snapshot: snapshot)
                TodayQueueCard(items: snapshot.queue)
                TodayOverdueCard(overdueCount: snapshot.overdueTasks.count)
                TodayAreasSection(
                    snapshot: snapshot,
                    goals: goals,
                    onToggleTask: onToggleTask,
                    onToggleHabit: onToggleHabit
                )
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.small)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
            .animation(.spring(response: 0.38, dampingFraction: 0.84), value: snapshot.completedItems)
        }
        .scrollIndicators(.hidden)
    }
}

private struct TodayProgressCard: View {
    let snapshot: TodaySnapshot

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Postęp dnia", systemImage: "chart.bar.xaxis")
            HStack(alignment: .lastTextBaseline, spacing: RootineTheme.Spacing.small) {
                Text("\(snapshot.completedItems)")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text("z \(snapshot.totalItems) wykonano")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            ProgressView(value: snapshot.progress)
                .tint(RootineTheme.ColorToken.action)
                .accessibilityLabel("Postęp planu dnia")
                .accessibilityValue("\(Int(snapshot.progress * 100)) procent")
            HStack {
                Label("\(snapshot.priorityCompleted) z \(snapshot.priorityTotal) priorytetów", systemImage: "checkmark.circle.fill")
                Spacer()
                Text("\(snapshot.remainingItems) pozostało")
            }
            .font(.caption)
            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
    }
}

private struct TodayQueueCard: View {
    let items: [TodayQueueItem]

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Następne w kolejce", systemImage: "calendar")
            if items.isEmpty {
                Text("Brak zadań z wyznaczoną godziną na dziś.")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else {
                VStack(spacing: 0) {
                    ForEach(items) { item in
                        HStack(spacing: RootineTheme.Spacing.medium) {
                            Text(item.time)
                                .font(.system(.body, design: .monospaced).weight(.semibold))
                                .foregroundStyle(RootineTheme.ColorToken.action)
                                .frame(width: 72, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                    .lineLimit(2)
                                Text(item.kind)
                                    .font(.caption)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, RootineTheme.Spacing.small)
                        if item.id != items.last?.id {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
            }
        }
    }
}

private struct TodayOverdueCard: View {
    let overdueCount: Int

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Zaległości", systemImage: "clock.badge.exclamationmark")
            HStack(spacing: RootineTheme.Spacing.large) {
                ZStack {
                    Circle()
                        .stroke(RootineTheme.ColorToken.separator, lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: overdueCount > 0 ? 0.72 : 0)
                        .stroke(overdueCount > 0 ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.success, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(overdueCount)")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                }
                .frame(width: 72, height: 72)
                .accessibilityLabel("Liczba zaległości")
                .accessibilityValue("\(overdueCount)")

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text(overdueCount > 0 ? "Zaległe elementy" : "Brak zaległości")
                        .font(.headline)
                        .foregroundStyle(overdueCount > 0 ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.success)
                    Text(overdueCount > 0 ? "Warto zacząć od najstarszego zadania." : "Świetna robota! Wszystko jest na bieżąco.")
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
        }
    }
}

private struct TodayAreasSection: View {
    let snapshot: TodaySnapshot
    let goals: NutritionGoals
    let onToggleTask: (Int) async -> Void
    let onToggleHabit: (Int) async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            Text("Obszary dnia")
                .font(.title3.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            TodayTasksCard(snapshot: snapshot, onToggleTask: onToggleTask, onToggleHabit: onToggleHabit)
            TodayNutritionCard(snapshot: snapshot, goals: goals)
            TodayNotesCard(snapshot: snapshot)
        }
    }
}

private struct TodayTasksCard: View {
    let snapshot: TodaySnapshot
    let onToggleTask: (Int) async -> Void
    let onToggleHabit: (Int) async -> Void

    var body: some View {
        TodayCard {
            TodayCardHeader(title: "Zadania i nawyki", systemImage: "checklist")
            if snapshot.tasks.isEmpty && snapshot.habits.isEmpty {
                Text("Brak zaplanowanych elementów na dziś.")
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else {
                ForEach(snapshot.tasks) { task in
                    TodayCheckRow(title: task.text, detail: task.time, isDone: task.done) {
                        await onToggleTask(task.id)
                    }
                }
                ForEach(snapshot.habits) { habit in
                    TodayCheckRow(title: habit.name, detail: habit.time ?? "Nawyk", isDone: isHabitDone(habit, dateKey: snapshot.dateKey)) {
                        await onToggleHabit(habit.id)
                    }
                }
            }
        }
    }
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
                .tint(snapshot.nutritionCalories > goals.calories * 1.1 ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.action)
            HStack {
                nutritionMetric("Białko", value: snapshot.nutritionProtein, goal: goals.protein, unit: "g")
                nutritionMetric("Węgle", value: snapshot.nutritionCarbs, goal: goals.carbs, unit: "g")
                nutritionMetric("Tłuszcze", value: snapshot.nutritionFat, goal: goals.fat, unit: "g")
            }
            .font(.caption)
            nutritionMetric("Woda", value: snapshot.nutritionDay?.waterMl ?? 0, goal: goals.waterMl, unit: " ml")
                .font(.caption)
        }
    }

    private func nutritionMetric(_ label: String, value: Double, goal: Double, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Text("\(number(value)) / \(number(goal))\(unit)")
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
        }
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
            Text(snapshot.notesUpdatedToday > 0
                ? "\(snapshot.notesUpdatedToday) zmienionych dzisiaj"
                : "Brak zmian dzisiaj")
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
    }
}

private struct TodayCheckRow: View {
    let title: String
    let detail: String?
    let isDone: Bool
    let action: () async -> Void

    var body: some View {
        Button {
            Task { await action() }
        } label: {
            HStack(spacing: RootineTheme.Spacing.small) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                        .strikethrough(isDone)
                        .lineLimit(2)
                    if let detail, !detail.isEmpty {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .padding(.vertical, RootineTheme.Spacing.xSmall)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(isDone ? "Wykonane" : "Do wykonania")
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

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
    }
}

private func number(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "0"
}
