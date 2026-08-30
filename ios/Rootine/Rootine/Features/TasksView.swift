import SwiftUI

private enum TasksFilter: String, CaseIterable, Identifiable {
    case today
    case upcoming
    case all
    case undated
    case completed
    case habits
    case trash

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Dziś"
        case .upcoming: return "Nadchodzące"
        case .all: return "Wszystkie"
        case .undated: return "Bez terminu"
        case .completed: return "Ukończone"
        case .habits: return "Nawyki"
        case .trash: return "Kosz"
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "sun.max.fill"
        case .upcoming: return "calendar"
        case .all: return "tray.full"
        case .undated: return "circle.dashed"
        case .completed: return "checkmark.circle"
        case .habits: return "flame"
        case .trash: return "trash"
        }
    }
}

struct TasksView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var filter: TasksFilter = .today
    @State private var isShowingAddTask = false
    @State private var isShowingAddHabit = false
    @State private var selectedTask: WorkspaceTask?
    @State private var selectedHabit: WorkspaceHabit?

    private var activeTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true }
    }

    private var deletedTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted == true }.sorted(by: taskSort)
    }

    private var filteredTasks: [WorkspaceTask] {
        let today = RootineDate.localDate()
        switch filter {
        case .today:
            return activeTasks.filter { task in
                task.calendarDate == today
                    || (task.calendarDate == nil && task.view == "dzis")
                    || (task.calendarDate != nil && task.calendarDate! < today && !task.done)
            }
        case .upcoming:
            return activeTasks.filter { ($0.calendarDate ?? "") > today }
        case .all:
            return activeTasks
        case .undated:
            return activeTasks.filter { $0.calendarDate == nil && !$0.done }
        case .completed:
            return activeTasks.filter(\.done)
        case .habits:
            return []
        case .trash:
            return deletedTasks
        }
    }

    private var pendingTasks: [WorkspaceTask] {
        filteredTasks.filter { !$0.done }.sorted(by: taskSort)
    }

    private var completedTasks: [WorkspaceTask] {
        filteredTasks.filter(\.done).sorted(by: taskSort)
    }

    private var overdueTasks: [WorkspaceTask] {
        let today = RootineDate.localDate()
        return pendingTasks.filter { ($0.calendarDate ?? "") < today && $0.calendarDate != nil }
    }

    private var datedPendingTasks: [WorkspaceTask] {
        pendingTasks.filter { !overdueTasks.contains($0) }
    }

    private var visibleHabits: [WorkspaceHabit] {
        let habits = filter == .habits
            ? environment.taskWorkspace.habits
            : environment.taskWorkspace.habits.filter {
                isHabitScheduled($0, dateKey: RootineDate.localDate())
            }
        return habits.sorted { lhs, rhs in
            let lhsScheduled = isHabitScheduled(lhs, dateKey: RootineDate.localDate())
            let rhsScheduled = isHabitScheduled(rhs, dateKey: RootineDate.localDate())
            if lhsScheduled != rhsScheduled { return lhsScheduled && !rhsScheduled }
            return lhs.id < rhs.id
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            TasksFilterStrip(filter: $filter, counts: counts)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    if filter == .trash {
                        if deletedTasks.isEmpty {
                            TasksEmptyState(filter: filter) { isShowingAddTask = false }
                        } else {
                            TasksTrashCard(tasks: deletedTasks) { id in
                                Task { await environment.restoreTask(id: id) }
                            }
                        }
                    } else {
                    if filter == .today && !overdueTasks.isEmpty {
                        TasksSectionCard(
                            title: "Po terminie",
                            systemImage: "clock.badge.exclamationmark",
                            tint: RootineTheme.ColorToken.warning,
                            tasks: overdueTasks,
                            lists: environment.taskWorkspace.lists,
                            onToggle: toggle,
                            onSelect: { selectedTask = $0 }
                        )
                    }

                    if filter != .habits && !datedPendingTasks.isEmpty {
                        TasksSectionCard(
                            title: sectionTitle,
                            systemImage: filter == .completed ? "checkmark.circle" : "list.bullet",
                            tasks: datedPendingTasks,
                            lists: environment.taskWorkspace.lists,
                            onToggle: toggle,
                            onSelect: { selectedTask = $0 }
                        )
                    }

                    if filter == .completed {
                        if !completedTasks.isEmpty {
                            TasksSectionCard(
                                title: "Ukończone",
                                systemImage: "checkmark.circle.fill",
                                tint: RootineTheme.ColorToken.success,
                                tasks: completedTasks,
                                lists: environment.taskWorkspace.lists,
                                onToggle: toggle,
                                onSelect: { selectedTask = $0 }
                            )
                        }
                    } else if !completedTasks.isEmpty {
                        TasksSectionCard(
                            title: "Ukończone",
                            systemImage: "checkmark.circle.fill",
                            tint: RootineTheme.ColorToken.success,
                            tasks: completedTasks,
                            lists: environment.taskWorkspace.lists,
                            onToggle: toggle,
                            onSelect: { selectedTask = $0 }
                        )
                    }

                    if filter == .today || filter == .habits {
                        if !visibleHabits.isEmpty {
                            TasksHabitsCard(
                                habits: visibleHabits,
                                showsSchedule: filter == .habits,
                                onToggle: toggleHabit,
                                onSelect: { selectedHabit = $0 }
                            )
                        }
                    }

                    if pendingTasks.isEmpty && completedTasks.isEmpty && (filter != .today && filter != .habits || visibleHabits.isEmpty) {
                        TasksEmptyState(filter: filter) {
                            if filter == .habits { isShowingAddHabit = true }
                            else { isShowingAddTask = true }
                        }
                    }
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.top, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.xLarge)
                .animation(.spring(response: 0.38, dampingFraction: 0.84), value: filter.rawValue)
            }
            .scrollIndicators(.hidden)
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .sheet(isPresented: $isShowingAddTask) {
            AddTaskSheet()
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $isShowingAddHabit) {
            AddHabitSheet()
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $selectedTask) { task in
            TaskDetailSheet(task: task)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $selectedHabit) { habit in
            HabitDetailSheet(habit: habit)
                .presentationDetents([.medium])
        }
    }

    private var counts: [TasksFilter: Int] {
        let today = RootineDate.localDate()
        return [
            .today: activeTasks.filter {
                !$0.done && ($0.calendarDate == today || ($0.calendarDate == nil && $0.view == "dzis") || (($0.calendarDate ?? "") < today && $0.calendarDate != nil))
            }.count,
            .upcoming: activeTasks.filter { !$0.done && ($0.calendarDate ?? "") > today }.count,
            .all: activeTasks.filter { !$0.done }.count,
            .undated: activeTasks.filter { !$0.done && $0.calendarDate == nil }.count,
            .completed: activeTasks.filter(\.done).count,
            .habits: environment.taskWorkspace.habits.count,
            .trash: deletedTasks.count
        ]
    }

    private var sectionTitle: String {
        switch filter {
        case .today: return "Dziś"
        case .upcoming: return "Nadchodzące"
        case .all: return "Do zrobienia"
        case .undated: return "Bez terminu"
        case .completed: return "Zadania"
        case .habits: return "Nawyki"
        case .trash: return "Kosz"
        }
    }

    private func taskSort(_ lhs: WorkspaceTask, _ rhs: WorkspaceTask) -> Bool {
        let lhsDate = lhs.calendarDate ?? "9999-99-99"
        let rhsDate = rhs.calendarDate ?? "9999-99-99"
        if lhsDate != rhsDate { return lhsDate < rhsDate }
        switch (lhs.time, rhs.time) {
        case let (left?, right?) where left != right: return left < right
        case (_?, nil): return true
        case (nil, _?): return false
        default: return lhs.id < rhs.id
        }
    }

    private func toggle(_ task: WorkspaceTask) {
        Task { await environment.toggleTaskCompletion(id: task.id) }
    }

    private func toggleHabit(_ habit: WorkspaceHabit) {
        Task { await environment.toggleHabitCompletion(id: habit.id) }
    }
}

private struct TasksFilterStrip: View {
    @Binding var filter: TasksFilter
    let counts: [TasksFilter: Int]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: RootineTheme.Spacing.small) {
                ForEach(TasksFilter.allCases) { option in
                    Button { filter = option } label: {
                        HStack(spacing: RootineTheme.Spacing.xSmall) {
                            Image(systemName: option.systemImage)
                                .font(.caption.weight(.semibold))
                            Text(option.label)
                                .font(.subheadline.weight(.medium))
                            if let count = counts[option], count > 0 {
                                Text(String(count))
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(filter == option ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.secondaryText)
                            }
                        }
                        .foregroundStyle(filter == option ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                        .padding(.horizontal, RootineTheme.Spacing.medium)
                        .padding(.vertical, RootineTheme.Spacing.small)
                        .background(filter == option ? RootineTheme.ColorToken.elevated : RootineTheme.ColorToken.surface)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(RootineTheme.ColorToken.separator, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.vertical, RootineTheme.Spacing.small)
        }
        .background(RootineTheme.ColorToken.canvas)
    }
}

private struct TasksSectionCard: View {
    let title: String
    let systemImage: String
    var tint: Color = RootineTheme.ColorToken.primaryText
    let tasks: [WorkspaceTask]
    let lists: [WorkspaceTaxonomy]
    let onToggle: (WorkspaceTask) -> Void
    let onSelect: (WorkspaceTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(tint)
                .padding(.bottom, RootineTheme.Spacing.small)

            ForEach(tasks) { task in
                TasksRow(task: task, listName: listName(for: task), onToggle: { onToggle(task) }, onSelect: { onSelect(task) })
                if task.id != tasks.last?.id {
                    Divider().overlay(RootineTheme.ColorToken.separator)
                }
            }
        }
        .rootineSurface()
    }

    private func listName(for task: WorkspaceTask) -> String? {
        guard let list = task.list else { return nil }
        return lists.first(where: { $0.id == list })?.label
    }
}

private struct TasksRow: View {
    let task: WorkspaceTask
    let listName: String?
    let onToggle: () -> Void
    let onSelect: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.done ? RootineTheme.ColorToken.success : priorityColor)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.done ? "Oznacz jako niewykonane" : "Oznacz jako wykonane")

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(task.text)
                    .font(.body.weight(.medium))
                    .foregroundStyle(task.done ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                    .strikethrough(task.done)
                    .lineLimit(3)

                HStack(spacing: RootineTheme.Spacing.small) {
                    if let time = task.time {
                        Label(time, systemImage: "clock")
                    }
                    if let date = task.calendarDate, date != RootineDate.localDate() {
                        Label(shortDate(date), systemImage: "calendar")
                    }
                    if let listName {
                        Label(listName, systemImage: "folder")
                    }
                    if let priority = task.priority {
                        Text(priorityLabel(priority))
                            .foregroundStyle(priorityColor)
                    }
                }
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, RootineTheme.Spacing.small)
        .contentShape(Rectangle())
        .onTapGesture(perform: onSelect)
    }

    private var priorityColor: Color {
        switch task.priority {
        case .high: return RootineTheme.ColorToken.destructive
        case .medium: return RootineTheme.ColorToken.warning
        case .low: return RootineTheme.ColorToken.action
        case .none: return RootineTheme.ColorToken.secondaryText
        }
    }

    private func priorityLabel(_ priority: TaskPriority) -> String {
        switch priority {
        case .high: return "Wysoki"
        case .medium: return "Średni"
        case .low: return "Niski"
        }
    }
}

private struct TasksHabitsCard: View {
    let habits: [WorkspaceHabit]
    let showsSchedule: Bool
    let onToggle: (WorkspaceHabit) -> Void
    let onSelect: (WorkspaceHabit) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label("Nawyki", systemImage: "flame.fill")
                    .font(.headline)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Spacer()
                Text("\(habits.filter { isHabitDone($0) }.count)/\(habits.count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            .padding(.bottom, RootineTheme.Spacing.small)

            ForEach(habits) { habit in
                HStack(spacing: RootineTheme.Spacing.small) {
                    Button { onToggle(habit) } label: {
                        Image(systemName: isHabitDone(habit) ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(isHabitDone(habit) ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isHabitScheduled(habit, dateKey: RootineDate.localDate()))
                    .accessibilityLabel(isHabitDone(habit) ? "Oznacz nawyk jako niewykonany" : "Oznacz nawyk jako wykonany")

                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(habit.name)
                            .font(.body.weight(.medium))
                            .foregroundStyle(isHabitDone(habit) ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(isHabitDone(habit))
                        HStack(spacing: RootineTheme.Spacing.small) {
                            if let time = habit.time {
                                Label(time, systemImage: "clock")
                            }
                            let streak = rootineHabitCurrentStreak(habit)
                            if streak > 0 {
                                Label("Seria \(streak)", systemImage: "flame")
                            } else if !isHabitScheduled(habit, dateKey: RootineDate.localDate()) {
                                Text(habitScheduleStatus(habit))
                            } else {
                                Text("Nowy rytm")
                            }
                            if showsSchedule {
                                Text(habitScheduleLabel(habit.schedule))
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, RootineTheme.Spacing.small)
                .contentShape(Rectangle())
                .onTapGesture { onSelect(habit) }

                if habit.id != habits.last?.id {
                    Divider().overlay(RootineTheme.ColorToken.separator)
                }
            }
        }
        .rootineSurface()
    }
}

private struct TasksTrashCard: View {
    let tasks: [WorkspaceTask]
    let onRestore: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Label("Kosz", systemImage: "trash")
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.destructive)
                .padding(.bottom, RootineTheme.Spacing.small)

            ForEach(tasks) { task in
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(task.text)
                            .font(.body.weight(.medium))
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            .lineLimit(2)
                        if let date = task.calendarDate {
                            Text("Termin: \(shortDate(date))")
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                    }
                    Spacer(minLength: 0)
                    Button("Przywróć") { onRestore(task.id) }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.action)
                }
                .padding(.vertical, RootineTheme.Spacing.small)
                if task.id != tasks.last?.id {
                    Divider().overlay(RootineTheme.ColorToken.separator)
                }
            }
        }
        .rootineSurface()
    }
}

private struct TasksEmptyState: View {
    let filter: TasksFilter
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            Image(systemName: filter == .completed ? "checkmark.circle" : filter == .habits ? "flame" : "sparkles")
                .font(.title2)
                .foregroundStyle(RootineTheme.ColorToken.action)
            Text(emptyTitle)
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            Text(emptyDescription)
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            if filter != .completed && filter != .trash {
                Button(filter == .habits ? "Dodaj nawyk" : "Dodaj zadanie", action: onAdd)
                    .buttonStyle(.borderedProminent)
                    .tint(RootineTheme.ColorToken.action)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .rootineSurface()
    }

    private var emptyTitle: String {
        switch filter {
        case .completed: return "Nie ma jeszcze ukończonych zadań"
        case .habits: return "Brak nawyków"
        case .trash: return "Kosz jest pusty"
        default: return "Brak zadań w tym widoku"
        }
    }

    private var emptyDescription: String {
        switch filter {
        case .completed: return "Wykonane zadania pojawią się tutaj."
        case .habits: return "Dodaj pierwszy nawyk i wybierz jego rytm."
        case .trash: return "Usunięte zadania można przywrócić z tego miejsca."
        default: return "Dodaj pierwszy konkretny krok, żeby zacząć."
        }
    }
}

struct AddTaskSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var time = ""
    @State private var dateChoice = "today"
    @State private var priorityChoice = "none"

    var body: some View {
        NavigationStack {
            Form {
                Section("Nowe zadanie") {
                    TextField("Co chcesz zrobić?", text: $text, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Godzina (opcjonalnie, np. 09:00)", text: $time)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section("Termin") {
                    Picker("Dzień", selection: $dateChoice) {
                        Text("Dziś").tag("today")
                        Text("Jutro").tag("tomorrow")
                        Text("Bez terminu").tag("none")
                    }
                    .pickerStyle(.segmented)
                }

                Section("Priorytet") {
                    Picker("Priorytet", selection: $priorityChoice) {
                        Text("Brak").tag("none")
                        Text("Wysoki").tag("high")
                        Text("Średni").tag("medium")
                        Text("Niski").tag("low")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Dodaj zadanie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dodaj") {
                        Task {
                            await environment.addTask(
                                text: text,
                                time: time,
                                calendarDate: selectedDate,
                                view: dateChoice == "tomorrow" ? "jutro" : dateChoice == "none" ? "bezterminu" : "dzis",
                                priority: TaskPriority(rawValue: priorityChoice)
                            )
                            dismiss()
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var selectedDate: String? {
        switch dateChoice {
        case "tomorrow":
            return RootineDate.localDate(Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        case "none":
            return nil
        default:
            return RootineDate.localDate()
        }
    }
}

private struct TaskDetailSheet: View {
    let task: WorkspaceTask
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var time: String
    @State private var date: String
    @State private var priority: String
    @State private var showDeleteConfirmation = false

    init(task: WorkspaceTask) {
        self.task = task
        _title = State(initialValue: task.text)
        _time = State(initialValue: task.time ?? "")
        _date = State(initialValue: task.calendarDate ?? "")
        _priority = State(initialValue: task.priority?.rawValue ?? "none")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Zadanie") {
                    TextField("Nazwa zadania", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Data (RRRR-MM-DD)", text: $date)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Godzina (opcjonalnie)", text: $time)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section("Priorytet") {
                    Picker("Priorytet", selection: $priority) {
                        Text("Brak").tag("none")
                        Text("Wysoki").tag("high")
                        Text("Średni").tag("medium")
                        Text("Niski").tag("low")
                    }
                }

                Section {
                    Button(task.done ? "Oznacz jako niewykonane" : "Oznacz jako wykonane") {
                        Task { await environment.toggleTaskCompletion(id: task.id); dismiss() }
                    }
                    Button("Usuń zadanie", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły zadania")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        Task {
                            await environment.updateTask(
                                id: task.id,
                                text: title,
                                time: time,
                                calendarDate: normalizedDate,
                                priority: TaskPriority(rawValue: priority)
                            )
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !isValidDateKey(normalizedDate))
                }
            }
            .confirmationDialog("Usunąć zadanie?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń zadanie", role: .destructive) {
                    Task { await environment.deleteTask(id: task.id); dismiss() }
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
        .preferredColorScheme(.dark)
    }

    private var normalizedDate: String? {
        let value = date.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

private enum HabitFrequency: String, CaseIterable, Identifiable {
    case daily
    case weekly
    case interval

    var id: String { rawValue }

    var label: String {
        switch self {
        case .daily: return "Codziennie"
        case .weekly: return "Wybrane dni tygodnia"
        case .interval: return "Co kilka dni"
        }
    }
}

private struct HabitScheduleSection: View {
    @Binding var frequency: HabitFrequency
    @Binding var weekdays: Set<Int>
    @Binding var interval: Int

    private let weekdayLabels = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]

    var body: some View {
        Section("Częstotliwość") {
            Picker("Powtarzaj", selection: $frequency) {
                ForEach(HabitFrequency.allCases) { option in
                    Text(option.label).tag(option)
                }
            }

            if frequency == .weekly {
                HStack(spacing: RootineTheme.Spacing.xSmall) {
                    ForEach(1...7, id: \.self) { day in
                        Button {
                            if weekdays.contains(day) {
                                if weekdays.count > 1 { weekdays.remove(day) }
                            } else {
                                weekdays.insert(day)
                            }
                        } label: {
                            Text(weekdayLabels[day - 1])
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, RootineTheme.Spacing.small)
                                .foregroundStyle(weekdays.contains(day) ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                                .background(weekdays.contains(day) ? RootineTheme.ColorToken.action.opacity(0.22) : RootineTheme.ColorToken.surface)
                                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
            }

            if frequency == .interval {
                Stepper(value: $interval, in: 2...30) {
                    HStack {
                        Text("Powtarzaj co")
                        Spacer()
                        Text("\(interval) dni")
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
            }
        }
    }
}

struct AddHabitSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var time = ""
    @State private var priority = "none"
    @State private var frequency: HabitFrequency = .daily
    @State private var weekdays: Set<Int> = Set(1...7)
    @State private var interval = 2

    var body: some View {
        NavigationStack {
            Form {
                Section("Nowy nawyk") {
                    TextField("Nazwa nawyku", text: $name)
                    TextField("Godzina (opcjonalnie)", text: $time)
                        .keyboardType(.numbersAndPunctuation)
                }
                HabitScheduleSection(frequency: $frequency, weekdays: $weekdays, interval: $interval)
                Section("Priorytet") {
                    Picker("Priorytet", selection: $priority) {
                        Text("Brak").tag("none")
                        Text("Wysoki").tag("high")
                        Text("Średni").tag("medium")
                        Text("Niski").tag("low")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Dodaj nawyk")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dodaj") {
                        Task {
                            await environment.addHabit(
                                name: name,
                                time: time,
                                priority: TaskPriority(rawValue: priority),
                                schedule: schedule
                            )
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var schedule: WorkspaceHabitSchedule {
        switch frequency {
        case .daily:
            return WorkspaceHabitSchedule(type: "daily", startDate: RootineDate.localDate())
        case .weekly:
            return WorkspaceHabitSchedule(
                type: "weekly",
                weekdays: weekdays.sorted(),
                interval: 1,
                startDate: RootineDate.localDate()
            )
        case .interval:
            return WorkspaceHabitSchedule(type: "interval", interval: max(2, interval), startDate: RootineDate.localDate())
        }
    }
}

private struct HabitDetailSheet: View {
    let habit: WorkspaceHabit
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var time: String
    @State private var priority: String
    @State private var frequency: HabitFrequency
    @State private var weekdays: Set<Int>
    @State private var interval: Int
    @State private var showDeleteConfirmation = false

    init(habit: WorkspaceHabit) {
        self.habit = habit
        _name = State(initialValue: habit.name)
        _time = State(initialValue: habit.time ?? "")
        _priority = State(initialValue: habit.priority?.rawValue ?? "none")
        let schedule = habit.schedule
        _frequency = State(initialValue: HabitFrequency(rawValue: schedule?.type ?? "daily") ?? .daily)
        _weekdays = State(initialValue: Set(schedule?.weekdays ?? Array(1...7)))
        _interval = State(initialValue: max(2, schedule?.interval ?? 2))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Nawyk") {
                    TextField("Nazwa nawyku", text: $name)
                    TextField("Godzina (opcjonalnie)", text: $time)
                        .keyboardType(.numbersAndPunctuation)
                }
                HabitScheduleSection(frequency: $frequency, weekdays: $weekdays, interval: $interval)
                Section("Priorytet") {
                    Picker("Priorytet", selection: $priority) {
                        Text("Brak").tag("none")
                        Text("Wysoki").tag("high")
                        Text("Średni").tag("medium")
                        Text("Niski").tag("low")
                    }
                }
                Section {
                    Button(isHabitDone(habit) ? "Oznacz jako niewykonany" : "Oznacz jako wykonany") {
                        Task { await environment.toggleHabitCompletion(id: habit.id); dismiss() }
                    }
                    Button("Usuń nawyk", role: .destructive) { showDeleteConfirmation = true }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły nawyku")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        Task {
                            await environment.updateHabit(
                                id: habit.id,
                                name: name,
                                time: time,
                                priority: TaskPriority(rawValue: priority),
                                schedule: schedule
                            )
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .confirmationDialog("Usunąć nawyk?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń nawyk", role: .destructive) {
                    Task { await environment.deleteHabit(id: habit.id); dismiss() }
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
        .preferredColorScheme(.dark)
    }

    private var schedule: WorkspaceHabitSchedule {
        let startDate = habit.schedule?.startDate ?? RootineDate.localDate()
        switch frequency {
        case .daily:
            return WorkspaceHabitSchedule(type: "daily", startDate: startDate, endDate: habit.schedule?.endDate)
        case .weekly:
            return WorkspaceHabitSchedule(
                type: "weekly",
                weekdays: weekdays.sorted(),
                interval: 1,
                startDate: startDate,
                endDate: habit.schedule?.endDate
            )
        case .interval:
            return WorkspaceHabitSchedule(
                type: "interval",
                interval: max(2, interval),
                startDate: startDate,
                endDate: habit.schedule?.endDate
            )
        }
    }
}

private func isHabitDone(_ habit: WorkspaceHabit, dateKey: String = RootineDate.localDate()) -> Bool {
    rootineHabitIsDoneOnDate(habit, dateKey: dateKey)
}

private func isHabitScheduled(_ habit: WorkspaceHabit, dateKey: String, calendar: Calendar = .current) -> Bool {
    rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar)
}

private func isValidDateKey(_ value: String?) -> Bool {
    guard let value, !value.isEmpty else { return true }
    let parts = value.split(separator: "-").compactMap { Int($0) }
    return parts.count == 3 && parts[0] >= 2000 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31
}

private func shortDate(_ key: String) -> String {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
        return key
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
}

private func habitScheduleLabel(_ schedule: WorkspaceHabitSchedule?) -> String {
    guard let schedule else { return "Codziennie" }
    switch schedule.type {
    case "weekly":
        let labels = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]
        let days = (schedule.weekdays ?? Array(1...7)).sorted().compactMap { day -> String? in
            guard labels.indices.contains(day - 1) else { return nil }
            return labels[day - 1]
        }
        let prefix = schedule.interval.map { $0 > 1 ? "Co \($0) tyg." : "Tyg." } ?? "Tyg."
        return days.isEmpty ? prefix : "\(prefix): \(days.joined(separator: ", "))"
    case "interval":
        let interval = max(1, schedule.interval ?? 1)
        return interval == 1 ? "Codziennie" : "Co \(interval) dni"
    default:
        return "Codziennie"
    }
}

private func habitScheduleStatus(_ habit: WorkspaceHabit) -> String {
    let today = RootineDate.localDate()
    if rootineHabitIsPausedOnDate(habit, dateKey: today) { return "Wstrzymany" }
    if let schedule = habit.schedule {
        if today < schedule.startDate { return "Start \(shortDate(schedule.startDate))" }
        if let endDate = schedule.endDate, today > endDate { return "Zakończony" }
    }
    return "Dziś wolne · \(habitScheduleLabel(habit.schedule))"
}
