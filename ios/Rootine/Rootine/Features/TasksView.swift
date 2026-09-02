import SwiftUI

private enum TasksFilter: String, CaseIterable, Identifiable {
    case all
    case open
    case completed
    case habits
    case today
    case upcoming
    case undated
    case trash

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "Wszystkie"
        case .open: return "Otwarte"
        case .completed: return "Ukończone"
        case .habits: return "Nawyki"
        case .today: return "Dziś"
        case .upcoming: return "Nadchodzące"
        case .undated: return "Bez terminu"
        case .trash: return "Kosz"
        }
    }

    var systemImage: String {
        switch self {
        case .all: return "tray.full"
        case .open: return "circle"
        case .completed: return "checkmark.circle"
        case .habits: return "flame"
        case .today: return "sun.max.fill"
        case .upcoming: return "calendar"
        case .undated: return "circle.dashed"
        case .trash: return "trash"
        }
    }
}

struct TasksView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var filter: TasksFilter = .open
    @State private var searchText = ""
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

    private var searchIsActive: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var filteredTasks: [WorkspaceTask] {
        let today = RootineDate.localDate()
        let base: [WorkspaceTask]
        switch filter {
        case .all:
            base = activeTasks
        case .open:
            base = activeTasks.filter { !isDone($0) }
        case .completed:
            base = activeTasks.filter { isDone($0) }
        case .habits:
            base = []
        case .today:
            base = activeTasks.filter { isVisibleToday($0, today: today) }
        case .upcoming:
            base = activeTasks.filter { ($0.calendarDate ?? "") > today }
        case .undated:
            base = activeTasks.filter { $0.calendarDate == nil && !isDone($0) }
        case .trash:
            base = deletedTasks
        }
        guard searchIsActive else { return base.sorted(by: taskSort) }
        let query = searchText.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
        return base.filter { task in
            let searchable = [task.text, task.notes ?? "", task.tags?.joined(separator: " ") ?? ""].joined(separator: " ")
            return searchable.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL")).contains(query)
        }.sorted(by: taskSort)
    }

    private var visibleHabits: [WorkspaceHabit] {
        guard filter == .habits else { return [] }
        let query = searchText.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
        return environment.taskWorkspace.habits
            .filter { query.isEmpty || $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL")).contains(query) }
            .sorted { lhs, rhs in
                let lhsDone = isHabitDone(lhs)
                let rhsDone = isHabitDone(rhs)
                if lhsDone != rhsDone { return !lhsDone }
                return lhs.id < rhs.id
            }
    }

    private var todayHabits: [WorkspaceHabit] {
        guard filter == .today else { return [] }
        let today = RootineDate.localDate()
        let query = searchText.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
        return environment.taskWorkspace.habits
            .filter { isHabitScheduled($0, dateKey: today) }
            .filter { query.isEmpty || $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL")).contains(query) }
            .sorted { lhs, rhs in
                let lhsDone = isHabitDone(lhs)
                let rhsDone = isHabitDone(rhs)
                if lhsDone != rhsDone { return !lhsDone }
                return lhs.id < rhs.id
            }
    }

    private var overdueTasks: [WorkspaceTask] {
        let today = RootineDate.localDate()
        return filteredTasks.filter { !isDone($0) && $0.calendarDate != nil && $0.calendarDate! < today }
    }

    private var pendingTasks: [WorkspaceTask] { filteredTasks.filter { !isDone($0) && !overdueTasks.contains($0) } }
    private var completedTasks: [WorkspaceTask] { filteredTasks.filter { isDone($0) } }

    var body: some View {
        VStack(spacing: 0) {
            TasksSearchField(text: $searchText)
            TasksFilterStrip(filter: $filter, counts: counts)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    if environment.isLaunching {
                        ProgressView("Wczytuję zadania…")
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, RootineTheme.Spacing.large)
                    }
                    if case .conflict = environment.workspaceSyncStatus {
                        RootineErrorState(
                            title: "Konflikt synchronizacji",
                            message: "Zmiany są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                            onRetry: { Task { await environment.flushPendingMutations() } }
                        )
                    } else if case .localOnly = environment.workspaceSyncStatus {
                        RootineOfflineBanner()
                    }

                    TasksQuickActions(
                        onAddTask: { isShowingAddTask = true },
                        onAddHabit: { isShowingAddHabit = true }
                    )

                    if filter == .trash {
                        if deletedTasks.isEmpty {
                            TasksEmptyState(filter: filter, onAdd: {})
                        } else {
                            TasksTrashCard(tasks: deletedTasks) { id in
                                Task { await environment.restoreTask(id: id) }
                            }
                        }
                    } else if filter == .habits {
                        if visibleHabits.isEmpty {
                            TasksEmptyState(filter: filter, onAdd: { isShowingAddHabit = true })
                        } else {
                            TasksHabitsCard(
                                habits: visibleHabits,
                                onToggle: toggleHabit,
                                onSelect: { selectedHabit = $0 }
                            )
                        }
                    } else {
                        if !overdueTasks.isEmpty {
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

                        if !pendingTasks.isEmpty {
                            TasksSectionCard(
                                title: sectionTitle,
                                systemImage: "list.bullet",
                                tasks: pendingTasks,
                                lists: environment.taskWorkspace.lists,
                                onToggle: toggle,
                                onSelect: { selectedTask = $0 }
                            )
                        }

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

                        if filter == .today && !todayHabits.isEmpty {
                            TasksHabitsCard(
                                title: "Nawyki dzisiaj",
                                habits: todayHabits,
                                onToggle: toggleHabit,
                                onSelect: { selectedHabit = $0 }
                            )
                        }

                        if pendingTasks.isEmpty && completedTasks.isEmpty && todayHabits.isEmpty {
                            TasksEmptyState(filter: filter, onAdd: { isShowingAddTask = true })
                        }
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.top, RootineTheme.Spacing.small)
                .padding(.bottom, RootineTheme.Spacing.xLarge)
            }
            .scrollIndicators(.hidden)
            .refreshable { await environment.flushPendingMutations() }
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .sheet(isPresented: $isShowingAddTask) {
            AddTaskSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isShowingAddHabit) {
            AddHabitSheet()
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

    private var counts: [TasksFilter: Int] {
        let today = RootineDate.localDate()
        let todayHabitCount = environment.taskWorkspace.habits.filter {
            isHabitScheduled($0, dateKey: today)
        }.count
        return [
            .all: activeTasks.count,
            .open: activeTasks.filter { !isDone($0) }.count,
            .completed: activeTasks.filter { isDone($0) }.count,
            .habits: environment.taskWorkspace.habits.count,
            // Dzisiaj renders tasks and scheduled habits together; keep the
            // filter badge aligned with that first-viewport list instead of
            // silently omitting habits from its count.
            .today: activeTasks.filter { isVisibleToday($0, today: today) }.count + todayHabitCount,
            .upcoming: activeTasks.filter { ($0.calendarDate ?? "") > today }.count,
            .undated: activeTasks.filter { $0.calendarDate == nil && !isDone($0) }.count,
            .trash: deletedTasks.count
        ]
    }

    private var sectionTitle: String {
        switch filter {
        case .all: return "Wszystkie zadania"
        case .open: return "Do zrobienia"
        case .completed: return "Ukończone"
        case .today: return "Dzisiaj"
        case .upcoming: return "Nadchodzące"
        case .undated: return "Bez terminu"
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

    private func isDone(_ task: WorkspaceTask, dateKey: String = RootineDate.localDate()) -> Bool {
        rootineTaskIsDoneOnDate(task, dateKey: dateKey)
    }

    private func isVisibleToday(_ task: WorkspaceTask, today: String) -> Bool {
        if task.calendarDate == today { return true }
        if task.calendarDate == nil && task.view == "dzis" { return true }
        if let calendarDate = task.calendarDate, calendarDate < today {
            return !isDone(task, dateKey: today)
        }
        return false
    }
}

private struct TasksSearchField: View {
    @Binding var text: String
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            TextField("Szukaj zadań i nawyków", text: $text)
                .textInputAutocapitalization(.sentences)
                .autocorrectionDisabled(false)
                .focused($isFocused)
                .submitLabel(.search)
                .accessibilityLabel("Szukaj zadań i nawyków")
            if !text.isEmpty {
                Button {
                    text = ""
                    isFocused = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Wyczyść wyszukiwanie")
            }
        }
        .padding(.horizontal, RootineTheme.Spacing.medium)
        .frame(minHeight: 52)
        .background(RootineTheme.ColorToken.surface)
        .overlay(alignment: .bottom) {
            Rectangle().fill(RootineTheme.ColorToken.separator).frame(height: 1)
        }
    }
}

private struct TasksQuickActions: View {
    let onAddTask: () -> Void
    let onAddHabit: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: RootineTheme.Spacing.small) {
                RootinePrimaryButton("Dodaj zadanie", systemImage: "plus", action: onAddTask)
                RootineSecondaryButton("Dodaj nawyk", systemImage: "flame", action: onAddHabit)
            }
            VStack(spacing: RootineTheme.Spacing.small) {
                RootinePrimaryButton("Dodaj zadanie", systemImage: "plus", action: onAddTask)
                RootineSecondaryButton("Dodaj nawyk", systemImage: "flame", action: onAddHabit)
            }
        }
    }
}

private struct TasksFilterStrip: View {
    @Binding var filter: TasksFilter
    let counts: [TasksFilter: Int]

    private var primary: [TasksFilter] { [.all, .open, .completed, .habits] }
    private var secondary: [TasksFilter] { [.today, .upcoming, .undated, .trash] }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: RootineTheme.Spacing.small) {
                ForEach(primary + secondary) { option in
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
                        .frame(minHeight: 44)
                        .background(filter == option ? RootineTheme.ColorToken.elevated : RootineTheme.ColorToken.surface)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(filter == option ? RootineTheme.ColorToken.action.opacity(0.5) : RootineTheme.ColorToken.separator, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Filtr: \(option.label)")
                    .accessibilityAddTraits(filter == option ? .isSelected : [])
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

    private var isDone: Bool { rootineTaskIsDoneOnDate(task) }

    var body: some View {
        HStack(alignment: .center, spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isDone ? RootineTheme.ColorToken.success : priorityColor)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isDone ? "Oznacz \(task.text) jako niewykonane" : "Oznacz \(task.text) jako wykonane")

            Button(action: onSelect) {
                HStack(alignment: .center, spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(task.text)
                            .font(.body.weight(.medium))
                            .foregroundStyle(isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(isDone)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)

                        ViewThatFits(in: .horizontal) {
                            metadata
                            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) { metadata }
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły zadania: \(task.text)")
            .accessibilityHint("Otwiera edycję zadania")
        }
    }

    private var metadata: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            if let time = task.time { Label(time, systemImage: "clock") }
            if let date = task.calendarDate, date != RootineDate.localDate() { Label(shortDate(date), systemImage: "calendar") }
            if let listName { Label(listName, systemImage: "folder") }
            if let priority { Text(priorityLabel(priority)).foregroundStyle(priorityColor) }
        }
        .font(.caption)
        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
    }

    private var priority: TaskPriority? { task.priority }

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
    let title: String
    let habits: [WorkspaceHabit]
    let onToggle: (WorkspaceHabit) -> Void
    let onSelect: (WorkspaceHabit) -> Void

    init(title: String = "Nawyki", habits: [WorkspaceHabit], onToggle: @escaping (WorkspaceHabit) -> Void, onSelect: @escaping (WorkspaceHabit) -> Void) {
        self.title = title
        self.habits = habits
        self.onToggle = onToggle
        self.onSelect = onSelect
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label(title, systemImage: "flame.fill")
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
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(!isHabitScheduled(habit, dateKey: RootineDate.localDate()))
                    .accessibilityLabel(isHabitDone(habit) ? "Oznacz \(habit.name) jako niewykonany" : "Oznacz \(habit.name) jako wykonany")

                    Button { onSelect(habit) } label: {
                        HStack(spacing: RootineTheme.Spacing.small) {
                            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                                Text(habit.name)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(isHabitDone(habit) ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                                    .strikethrough(isHabitDone(habit))
                                    .lineLimit(2)
                                HStack(spacing: RootineTheme.Spacing.small) {
                                    if let time = habit.time { Label(time, systemImage: "clock") }
                                    Text("Seria \(rootineHabitCurrentStreak(habit))")
                                    Text(habitScheduleLabel(habit.schedule))
                                }
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Szczegóły nawyku: \(habit.name)")
                }
                if habit.id != habits.last?.id { Divider().overlay(RootineTheme.ColorToken.separator) }
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
                        .frame(minWidth: 44, minHeight: 44)
                        .foregroundStyle(RootineTheme.ColorToken.action)
                        .accessibilityLabel("Przywróć zadanie: \(task.text)")
                }
                .frame(minHeight: 48)
                if task.id != tasks.last?.id { Divider().overlay(RootineTheme.ColorToken.separator) }
            }
        }
        .rootineSurface()
    }
}

private struct TasksEmptyState: View {
    let filter: TasksFilter
    let onAdd: () -> Void

    var body: some View {
        RootineEmptyState(
            title: emptyTitle,
            message: emptyDescription,
            systemImage: filter == .completed ? "checkmark.circle" : filter == .habits ? "flame" : filter == .trash ? "trash" : "sparkles",
            actionTitle: filter == .completed || filter == .trash ? nil : filter == .habits ? "Dodaj nawyk" : "Dodaj zadanie",
            action: filter == .completed || filter == .trash ? nil : onAdd
        )
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
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
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
    }

    private var selectedDate: String? {
        switch dateChoice {
        case "tomorrow": return RootineDate.localDate(Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        case "none": return nil
        default: return RootineDate.localDate()
        }
    }
}

struct TaskDetailSheet: View {
    let task: WorkspaceTask
    let completionDate: Date?
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var time: String
    @State private var dueDate: Date
    @State private var hasDate: Bool
    @State private var priority: String
    @State private var showDeleteConfirmation = false

    init(task: WorkspaceTask, completionDate: Date? = nil) {
        self.task = task
        self.completionDate = completionDate
        _title = State(initialValue: task.text)
        _time = State(initialValue: task.time ?? "")
        _dueDate = State(initialValue: dateFromKey(task.calendarDate) ?? Date())
        _hasDate = State(initialValue: task.calendarDate != nil)
        _priority = State(initialValue: task.priority?.rawValue ?? "none")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Zadanie") {
                    TextField("Nazwa zadania", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                    Toggle("Ma termin", isOn: $hasDate)
                    if hasDate {
                        DatePicker("Dzień", selection: $dueDate, displayedComponents: .date)
                            .datePickerStyle(.compact)
                    }
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
                    Button(isCompletedOnContextDate ? "Oznacz jako niewykonane" : "Oznacz jako wykonane") {
                        Task {
                            await environment.toggleTaskCompletion(id: task.id, on: completionDate ?? Date())
                            dismiss()
                        }
                    }
                    Button("Usuń zadanie", role: .destructive) { showDeleteConfirmation = true }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły zadania")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        Task {
                            await environment.updateTask(
                                id: task.id,
                                text: title,
                                time: time,
                                calendarDate: hasDate ? RootineDate.localDate(dueDate) : nil,
                                priority: TaskPriority(rawValue: priority)
                            )
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .confirmationDialog("Usunąć zadanie?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń zadanie", role: .destructive) {
                    Task { await environment.deleteTask(id: task.id); dismiss() }
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }

    private var isCompletedOnContextDate: Bool {
        rootineTaskIsDoneOnDate(task, dateKey: RootineDate.localDate(completionDate ?? Date()))
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
                ForEach(HabitFrequency.allCases) { option in Text(option.label).tag(option) }
            }
            if frequency == .weekly {
                HStack(spacing: RootineTheme.Spacing.xSmall) {
                    ForEach(1...7, id: \.self) { day in
                        Button {
                            if weekdays.contains(day) {
                                if weekdays.count > 1 { weekdays.remove(day) }
                            } else { weekdays.insert(day) }
                        } label: {
                            Text(weekdayLabels[day - 1])
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .foregroundStyle(weekdays.contains(day) ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                                .background(weekdays.contains(day) ? RootineTheme.ColorToken.action.opacity(0.22) : RootineTheme.ColorToken.surface)
                                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(weekdayLabels[day - 1])
                        .accessibilityAddTraits(weekdays.contains(day) ? .isSelected : [])
                    }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
            }
            if frequency == .interval {
                Stepper(value: $interval, in: 2...30) {
                    HStack { Text("Powtarzaj co"); Spacer(); Text("\(interval) dni").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
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
                    TextField("Godzina (opcjonalnie)", text: $time).keyboardType(.numbersAndPunctuation)
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
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dodaj") {
                        Task {
                            await environment.addHabit(name: name, time: time, priority: TaskPriority(rawValue: priority), schedule: schedule)
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var schedule: WorkspaceHabitSchedule {
        switch frequency {
        case .daily: return WorkspaceHabitSchedule(type: "daily", startDate: RootineDate.localDate())
        case .weekly: return WorkspaceHabitSchedule(type: "weekly", weekdays: weekdays.sorted(), interval: 1, startDate: RootineDate.localDate())
        case .interval: return WorkspaceHabitSchedule(type: "interval", interval: max(2, interval), startDate: RootineDate.localDate())
        }
    }
}

struct HabitDetailSheet: View {
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
        _frequency = State(initialValue: HabitFrequency(rawValue: habit.schedule?.type ?? "daily") ?? .daily)
        _weekdays = State(initialValue: Set(habit.schedule?.weekdays ?? Array(1...7)))
        _interval = State(initialValue: max(2, habit.schedule?.interval ?? 2))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Nawyk") {
                    TextField("Nazwa nawyku", text: $name)
                    TextField("Godzina (opcjonalnie)", text: $time).keyboardType(.numbersAndPunctuation)
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
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        Task {
                            await environment.updateHabit(id: habit.id, name: name, time: time, priority: TaskPriority(rawValue: priority), schedule: schedule)
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
    }

    private var schedule: WorkspaceHabitSchedule {
        let startDate = habit.schedule?.startDate ?? RootineDate.localDate()
        switch frequency {
        case .daily: return WorkspaceHabitSchedule(type: "daily", startDate: startDate, endDate: habit.schedule?.endDate)
        case .weekly: return WorkspaceHabitSchedule(type: "weekly", weekdays: weekdays.sorted(), interval: 1, startDate: startDate, endDate: habit.schedule?.endDate)
        case .interval: return WorkspaceHabitSchedule(type: "interval", interval: max(2, interval), startDate: startDate, endDate: habit.schedule?.endDate)
        }
    }
}

private func isHabitDone(_ habit: WorkspaceHabit, dateKey: String = RootineDate.localDate()) -> Bool {
    rootineHabitIsDoneOnDate(habit, dateKey: dateKey)
}

private func isHabitScheduled(_ habit: WorkspaceHabit, dateKey: String, calendar: Calendar = .current) -> Bool {
    rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar)
}

private func dateFromKey(_ key: String?) -> Date? {
    guard let key else { return nil }
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

private func shortDate(_ key: String) -> String {
    guard let date = dateFromKey(key) else { return key }
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
        let days = (schedule.weekdays ?? Array(1...7)).sorted().compactMap { labels.indices.contains($0 - 1) ? labels[$0 - 1] : nil }
        return days.isEmpty ? "Tygodniowo" : days.joined(separator: ", ")
    case "interval":
        let interval = max(1, schedule.interval ?? 1)
        return interval == 1 ? "Codziennie" : "Co \(interval) dni"
    default: return "Codziennie"
    }
}
