import SwiftUI

private enum TasksFilter: String, CaseIterable, Identifiable {
    case all
    case completed
    case undated
    case trash

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "Lista"
        case .completed: return "Ukończone"
        case .undated: return "Bez terminu"
        case .trash: return "Kosz"
        }
    }

    var systemImage: String {
        switch self {
        case .all: return "list.bullet"
        case .completed: return "checkmark.circle"
        case .undated: return "circle.dashed"
        case .trash: return "trash"
        }
    }
}

private struct TasksRow: View {
    let task: WorkspaceTask
    let listName: String?
    let onToggle: () -> Void
    let onSelect: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var isDone: Bool { rootineTaskIsDoneOnDate(task) }

    var body: some View {
        HStack(
            alignment: dynamicTypeSize.isAccessibilitySize ? .top : .center,
            spacing: RootineTheme.Spacing.small
        ) {
            Button(action: onToggle) {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
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

                        metadata
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("tasks.task.\(task.id)")
            .accessibilityLabel("Szczegóły zadania: \(task.text)")
            .accessibilityHint("Otwiera edycję zadania")
        }
    }

    private var metadata: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    metadataItems
                }
            } else {
                HStack(spacing: RootineTheme.Spacing.small) {
                    metadataItems
                }
            }
        }
        .font(.caption)
        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
    }

    @ViewBuilder
    private var metadataItems: some View {
        if let time = task.time {
            HStack(spacing: RootineTheme.Spacing.xSmall) {
                Image(systemName: "clock")
                Text(time)
            }
                .fixedSize(horizontal: true, vertical: false)
        }
        if let date = task.calendarDate, date != RootineDate.localDate() {
            HStack(spacing: RootineTheme.Spacing.xSmall) {
                Image(systemName: "calendar")
                Text(shortDate(date))
            }
                .fixedSize(horizontal: true, vertical: false)
        }
        if let listName {
            HStack(spacing: RootineTheme.Spacing.xSmall) {
                Image(systemName: "folder")
                Text(listName)
            }
                .lineLimit(1)
        }
        if let priority {
            Text(priorityLabel(priority))
                .foregroundStyle(priorityColor)
                .fixedSize(horizontal: true, vertical: false)
        }
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

struct AddTaskSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    private let initialDate: Date?
    @State private var text = ""
    @State private var time = ""
    @State private var dateChoice: String
    @State private var selectedCalendarDate: Date
    @State private var priorityChoice = "none"

    init(initialDate: Date? = nil) {
        self.initialDate = initialDate
        _dateChoice = State(initialValue: initialDate == nil ? "today" : "selected")
        _selectedCalendarDate = State(initialValue: initialDate ?? Date())
    }

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
                        Text("Wybrany dzień").tag("selected")
                        Text("Bez terminu").tag("none")
                    }
                    // Four meaningful choices no longer fit a segmented
                    // control at accessibility text sizes; the menu keeps
                    // every choice reachable without horizontal clipping.
                    .pickerStyle(.menu)
                    if dateChoice == "selected" {
                        DatePicker("Data", selection: $selectedCalendarDate, displayedComponents: .date)
                    }
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
        case "selected": return RootineDate.localDate(selectedCalendarDate)
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
    @State private var notes: String
    @State private var dueDate: Date
    @State private var hasDate: Bool
    @State private var timeDate: Date
    @State private var hasTime: Bool
    @State private var priority: TaskPriority?
    @State private var selectedList: String?
    @State private var selectedTags: Set<String>
    @State private var pendingSave: Task<Void, Never>?
    @State private var isFinishing = false
    @State private var showDeleteConfirmation = false
    @State private var showDatePicker = false
    @State private var showTimePicker = false

    init(task: WorkspaceTask, completionDate: Date? = nil) {
        self.task = task
        self.completionDate = completionDate
        _title = State(initialValue: task.text)
        _notes = State(initialValue: task.notes ?? "")
        _dueDate = State(initialValue: task.calendarDate.flatMap(dateFromKey) ?? Date())
        _hasDate = State(initialValue: task.calendarDate != nil)
        _timeDate = State(initialValue: taskTimeDate(task.time) ?? Date())
        _hasTime = State(initialValue: task.time != nil)
        _priority = State(initialValue: task.priority)
        _selectedList = State(initialValue: task.list)
        _selectedTags = State(initialValue: Set(task.tags ?? []))
    }

    var body: some View {
        VStack(spacing: 0) {
            taskDetailHeader

            ScrollView {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    TextField("Nazwa zadania", text: $title, axis: .vertical)
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .lineLimit(1...3)
                        .textInputAutocapitalization(.sentences)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .accessibilityLabel("Nazwa zadania")

                    ZStack(alignment: .topLeading) {
                        if notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text("Treść zadania (opcjonalnie)")
                                .font(.body)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                .padding(.top, RootineTheme.Spacing.medium)
                                .padding(.horizontal, RootineTheme.Spacing.small)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $notes)
                            .font(.body)
                            .foregroundStyle(RootineTheme.ColorToken.primaryText)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 168)
                            .padding(.horizontal, RootineTheme.Spacing.small)
                            .accessibilityLabel("Treść zadania")
                    }
                    .background(RootineTheme.ColorToken.surface)
                    .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous)
                            .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.top, RootineTheme.Spacing.large)
                .padding(.bottom, RootineTheme.Spacing.medium)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(RootineTheme.ColorToken.canvas)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                taskDetailActionBar
            }
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .confirmationDialog("Usunąć zadanie?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Usuń zadanie", role: .destructive) {
                Task { await environment.deleteTask(id: task.id); dismiss() }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .sheet(isPresented: $showDatePicker) {
            NavigationStack {
                VStack(spacing: RootineTheme.Spacing.large) {
                    DatePicker("Data", selection: $dueDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .labelsHidden()
                        .tint(RootineTheme.ColorToken.action)
                    Button("Usuń datę", role: .destructive) {
                        hasDate = false
                        showDatePicker = false
                    }
                    .frame(minHeight: 44)
                }
                .padding(RootineTheme.Spacing.medium)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
                .navigationTitle("Data")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Gotowe") { showDatePicker = false }
                    }
                }
            }
            .preferredColorScheme(.dark)
            .presentationDetents([.medium])
            .presentationBackground(RootineTheme.ColorToken.canvas)
        }
        .sheet(isPresented: $showTimePicker) {
            NavigationStack {
                VStack(spacing: RootineTheme.Spacing.large) {
                    DatePicker("Godzina", selection: $timeDate, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .tint(RootineTheme.ColorToken.action)
                    Button("Usuń godzinę", role: .destructive) {
                        hasTime = false
                        showTimePicker = false
                    }
                    .frame(minHeight: 44)
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
                .navigationTitle("Godzina")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Gotowe") { showTimePicker = false }
                    }
                }
            }
            .preferredColorScheme(.dark)
            .presentationDetents([.medium])
            .presentationBackground(RootineTheme.ColorToken.canvas)
        }
        .onChange(of: title) { _, _ in scheduleSave() }
        .onChange(of: notes) { _, _ in scheduleSave() }
        .onChange(of: dueDate) { _, _ in scheduleSave() }
        .onChange(of: hasDate) { _, _ in scheduleSave() }
        .onChange(of: timeDate) { _, _ in scheduleSave() }
        .onChange(of: hasTime) { _, _ in scheduleSave() }
        .onChange(of: priority) { _, _ in scheduleSave() }
        .onChange(of: selectedList) { _, _ in scheduleSave() }
        .onChange(of: selectedTags) { _, _ in scheduleSave() }
        .onDisappear {
            pendingSave?.cancel()
            // Interactive sheet dismissal cannot be awaited. Capture the
            // latest draft once; normal dismissal goes through finishEditing
            // and awaits the final save before closing.
            guard !isFinishing else { return }
            saveImmediately()
        }
    }

    private var isCompletedOnContextDate: Bool {
        rootineTaskIsDoneOnDate(task, dateKey: RootineDate.localDate(completionDate ?? Date()))
    }

    private var taskDetailHeader: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button {
                if !hasDate {
                    dueDate = dateFromKey(RootineDate.localDate()) ?? Date()
                    hasDate = true
                }
                showDatePicker = true
            } label: {
                    HStack(spacing: RootineTheme.Spacing.xSmall) {
                    Image(systemName: "calendar")
                        .foregroundStyle(RootineTheme.ColorToken.action)
                    Text(hasDate ? editorDateLabel(dueDate) : "Bez daty")
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Data")
            .accessibilityValue(hasDate ? editorDateLabel(dueDate) : "Bez daty")

            Button {
                if !hasTime {
                    timeDate = Date()
                    hasTime = true
                }
                showTimePicker = true
            } label: {
                HStack(spacing: RootineTheme.Spacing.xSmall) {
                    Image(systemName: "clock")
                        .foregroundStyle(RootineTheme.ColorToken.action)
                    Text(hasTime ? taskClockString(timeDate) : "Bez godziny")
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Godzina")
            .accessibilityValue(hasTime ? taskClockString(timeDate) : "Bez godziny")

            Spacer(minLength: RootineTheme.Spacing.small)

            Button("Gotowe") { finishEditing() }
                .font(.headline.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .disabled(isFinishing || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityHint("Zapisuje zmiany i zamyka ekran edycji")
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .padding(.horizontal, RootineTheme.Spacing.medium)
        .padding(.vertical, RootineTheme.Spacing.xSmall)
        .background(RootineTheme.ColorToken.surface)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(RootineTheme.ColorToken.separator)
                .frame(height: 1)
        }
    }

    private var taskDetailActionBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(RootineTheme.ColorToken.separator)
                .frame(height: 1)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    TaskDetailActionButton(
                        systemImage: "flag.fill",
                        title: "Priorytet",
                        value: priorityLabel,
                        tint: priorityTint,
                        isSelected: priority != nil
                    ) {
                        Button {
                            priority = nil
                        } label: {
                            Label("Brak", systemImage: priority == nil ? "checkmark" : "minus")
                        }
                        ForEach(TaskPriority.allCases, id: \.rawValue) { option in
                            Button {
                                priority = option
                            } label: {
                                Label(editorPriorityLabel(option), systemImage: priority == option ? "checkmark" : "flag")
                            }
                        }
                    }

                    TaskDetailActionButton(
                        systemImage: "folder",
                        title: "Lista",
                        value: selectedList.flatMap { listName(for: $0) } ?? "Bez listy",
                        tint: RootineTheme.ColorToken.action,
                        isSelected: selectedList != nil
                    ) {
                        Button {
                            selectedList = nil
                        } label: {
                            Label("Bez listy", systemImage: selectedList == nil ? "checkmark" : "folder")
                        }
                        ForEach(environment.taskWorkspace.lists, id: \.id) { list in
                            Button {
                                selectedList = list.id
                            } label: {
                                Label(list.label, systemImage: selectedList == list.id ? "checkmark" : "folder")
                            }
                        }
                    }

                    TaskDetailActionButton(
                        systemImage: "tag",
                        title: "Tagi",
                        value: selectedTags.isEmpty ? "Brak" : "\(selectedTags.count)",
                        tint: RootineTheme.ColorToken.warning,
                        isSelected: !selectedTags.isEmpty
                    ) {
                        if environment.taskWorkspace.tags.isEmpty {
                            Text("Brak dostępnych tagów")
                        } else {
                            ForEach(environment.taskWorkspace.tags, id: \.id) { tag in
                                Button {
                                    if selectedTags.contains(tag.id) {
                                        selectedTags.remove(tag.id)
                                    } else {
                                        selectedTags.insert(tag.id)
                                    }
                                } label: {
                                    Label(tag.label, systemImage: selectedTags.contains(tag.id) ? "checkmark" : "tag")
                                }
                            }
                            if !selectedTags.isEmpty {
                                Divider()
                                Button("Wyczyść tagi", role: .destructive) {
                                    selectedTags.removeAll()
                                }
                            }
                        }
                    }

                    Button {
                        toggleCompletion()
                    } label: {
                        TaskDetailActionLabel(
                            systemImage: isCompletedOnContextDate ? "checkmark.circle.fill" : "circle",
                            title: "Ukończone",
                            tint: RootineTheme.ColorToken.success,
                            isSelected: isCompletedOnContextDate
                        )
                    }
                    .buttonStyle(.plain)
                    .frame(minWidth: 76, maxWidth: 76, minHeight: 80)
                    .accessibilityLabel("Ukończone")
                    .accessibilityValue(isCompletedOnContextDate ? "Tak" : "Nie")

                    Button {
                        showDeleteConfirmation = true
                    } label: {
                        TaskDetailActionLabel(
                            systemImage: "trash",
                            title: "Usuń",
                            tint: RootineTheme.ColorToken.destructive,
                            isSelected: false
                        )
                    }
                    .buttonStyle(.plain)
                    .frame(minWidth: 76, maxWidth: 76, minHeight: 80)
                    .accessibilityLabel("Usuń")
                    .accessibilityHint("Otwiera potwierdzenie usunięcia zadania")
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.vertical, RootineTheme.Spacing.small)
            }
        }
        .background(RootineTheme.ColorToken.surface)
    }

    private var priorityLabel: String {
        guard let priority else { return "Brak" }
        return editorPriorityLabel(priority)
    }

    private var priorityTint: Color {
        switch priority {
        case .high: return RootineTheme.ColorToken.destructive
        case .medium: return RootineTheme.ColorToken.warning
        case .low: return RootineTheme.ColorToken.action
        case .none: return RootineTheme.ColorToken.secondaryText
        }
    }

    private func listName(for id: String) -> String? {
        environment.taskWorkspace.lists.first(where: { $0.id == id })?.label
    }

    private func toggleCompletion() {
        pendingSave?.cancel()
        isFinishing = true
        let draft = makeDraft()
        Task {
            await saveDraft(draft)
            if let completionDate {
                let dateKey = RootineDate.localDate(completionDate)
                if let date = RootineDate.localDateValue(dateKey) {
                    await environment.toggleTaskCompletion(id: task.id, on: date)
                }
            } else {
                await environment.toggleTaskCompletion(id: task.id)
            }
            dismiss()
        }
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        pendingSave = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            let draft = makeDraft()
            await saveDraft(draft)
        }
    }

    private func saveImmediately() {
        let draft = makeDraft()
        Task { await saveDraft(draft) }
    }

    private func finishEditing() {
        pendingSave?.cancel()
        isFinishing = true
        let draft = makeDraft()
        Task {
            await saveDraft(draft)
            dismiss()
        }
    }

    private func makeDraft() -> TaskEditorDraft? {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return nil }
        return TaskEditorDraft(
            text: trimmedTitle,
            time: hasTime ? taskClockString(timeDate) : nil,
            calendarDate: hasDate ? RootineDate.localDate(dueDate) : nil,
            priority: priority,
            notes: notes,
            list: selectedList,
            tags: selectedTags.isEmpty ? nil : Array(selectedTags).sorted()
        )
    }

    private func saveDraft(_ draft: TaskEditorDraft?) async {
        guard let draft else { return }
        await environment.updateTask(
            id: task.id,
            text: draft.text,
            time: draft.time,
            calendarDate: draft.calendarDate,
            priority: draft.priority,
            notes: draft.notes,
            list: draft.list,
            tags: draft.tags
        )
    }
}

private struct TaskEditorDraft: Sendable {
    let text: String
    let time: String?
    let calendarDate: String?
    let priority: TaskPriority?
    let notes: String
    let list: String?
    let tags: [String]?
}

private struct TaskDetailActionButton<Content: View>: View {
    let systemImage: String
    let title: String
    let value: String
    let tint: Color
    let isSelected: Bool
    @ViewBuilder let menu: Content

    init(
        systemImage: String,
        title: String,
        value: String,
        tint: Color,
        isSelected: Bool = false,
        @ViewBuilder menu: () -> Content
    ) {
        self.systemImage = systemImage
        self.title = title
        self.value = value
        self.tint = tint
        self.isSelected = isSelected
        self.menu = menu()
    }

    var body: some View {
        Menu {
            menu
        } label: {
            TaskDetailActionLabel(
                systemImage: systemImage,
                title: title,
                tint: tint,
                isSelected: isSelected
            )
        }
        .buttonStyle(.plain)
        .frame(minWidth: 76, maxWidth: 76, minHeight: 80)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }
}

private struct TaskDetailActionLabel: View {
    let systemImage: String
    let title: String
    let tint: Color
    let isSelected: Bool

    var body: some View {
        VStack(spacing: RootineTheme.Spacing.xSmall) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(isSelected ? tint.opacity(0.24) : RootineTheme.ColorToken.elevated)
                .clipShape(Circle())
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .multilineTextAlignment(.center)
        }
        .frame(minWidth: 76, maxWidth: 76, minHeight: 80)
        .contentShape(Rectangle())
    }
}

private func editorPriorityLabel(_ priority: TaskPriority) -> String {
    switch priority {
    case .high: return "Wysoki"
    case .medium: return "Średni"
    case .low: return "Niski"
    }
}

private func taskTimeDate(_ value: String?) -> Date? {
    guard let value, RootineDate.isClockTime(value) else { return nil }
    let parts = value.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    let calendar = Calendar.current
    return calendar.date(from: DateComponents(hour: parts[0], minute: parts[1]))
}

private func taskClockString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

private func editorDateLabel(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
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
                Section("Przerwa") {
                    if rootineHabitIsPausedOnDate(habit, dateKey: RootineDate.localDate()) {
                        Button("Wznów dzisiaj") {
                            Task { await environment.resumeHabit(id: habit.id); dismiss() }
                        }
                    } else {
                        Button("Wstrzymaj od dzisiaj") {
                            Task { await environment.pauseHabit(id: habit.id); dismiss() }
                        }
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

private enum TaskLibraryMode: String, CaseIterable, Identifiable {
    case tasks
    case habits

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tasks: return "Zadania"
        case .habits: return "Nawyki"
        }
    }
}

private enum TaskLibrarySectionID: Hashable {
    case overdue
    case nextSevenDays
    case later
    case undated
    case completed
    case habitsToday
    case habitsActive
    case habitsPaused
}

private enum TaskLibraryUndoKind {
    case toggleTask(Int)
    case restoreTask(Int)
    case deleteTask(Int)
    case restoreTaskSnapshot(WorkspaceTask)
    case toggleHabit(Int)
    case resumeHabit(Int)
    case pauseHabit(Int)
}

private struct TaskLibraryUndoAction: Identifiable {
    let id = UUID()
    let message: String
    let kind: TaskLibraryUndoKind
}

struct TasksView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var mode: TaskLibraryMode = .tasks
    @State private var filter: TasksFilter = .all
    @State private var searchText = ""
    @State private var collapsedSections: Set<TaskLibrarySectionID> = [.habitsPaused]
    @State private var isShowingFilters = false
    @State private var isShowingAddTask = false
    @State private var isShowingAddHabit = false
    @State private var selectedTask: WorkspaceTask?
    @State private var selectedHabit: WorkspaceHabit?
    @State private var taskToReschedule: WorkspaceTask?
    @State private var taskToMove: WorkspaceTask?
    @State private var taskToDelete: WorkspaceTask?
    @State private var taskToPurge: WorkspaceTask?
    @State private var isConfirmingEmptyTrash = false
    @State private var undoAction: TaskLibraryUndoAction?

    private var today: String { RootineDate.localDate() }
    private var sevenDaysFromToday: String { RootineDate.shiftLocalDate(today, by: 7) }

    private var activeTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true }
    }

    private var deletedTasks: [WorkspaceTask] {
        searchedTasks(environment.taskWorkspace.tasks.filter { $0.deleted == true })
    }

    private var openTaskCount: Int {
        activeTasks.filter { !isDone($0) }.count
    }

    private var overdueTaskCount: Int {
        activeTasks.filter { task in
            guard !isDone(task), let date = effectiveDate(for: task) else { return false }
            return date < today
        }.count
    }

    private var undatedTaskCount: Int {
        activeTasks.filter { !isDone($0) && $0.calendarDate == nil }.count
    }

    private var filterCounts: [TasksFilter: Int] {
        [
            .all: openTaskCount,
            .completed: activeTasks.filter(isDone).count,
            .undated: undatedTaskCount,
            .trash: environment.taskWorkspace.tasks.filter { $0.deleted == true }.count
        ]
    }

    private var openTasksForSections: [WorkspaceTask] {
        let base: [WorkspaceTask]
        switch filter {
        case .all:
            base = activeTasks.filter { !isDone($0) }
        case .undated:
            base = activeTasks.filter { !isDone($0) && $0.calendarDate == nil }
        case .completed, .trash:
            base = []
        }
        return searchedTasks(base)
    }

    private var completedTasks: [WorkspaceTask] {
        guard filter == .completed else { return [] }
        return searchedTasks(activeTasks.filter(isDone))
    }

    private var overdueTasks: [WorkspaceTask] {
        openTasksForSections.filter { task in
            guard let date = effectiveDate(for: task) else { return false }
            return date < today
        }
    }

    private var nextSevenDaysTasks: [WorkspaceTask] {
        openTasksForSections.filter { task in
            guard let date = effectiveDate(for: task) else { return false }
            return date >= today && date <= sevenDaysFromToday
        }
    }

    private var laterTasks: [WorkspaceTask] {
        openTasksForSections.filter { task in
            guard let date = effectiveDate(for: task) else { return false }
            return date > sevenDaysFromToday
        }
    }

    private var undatedTasks: [WorkspaceTask] {
        openTasksForSections.filter { $0.calendarDate == nil }
    }

    private var visibleHabits: [WorkspaceHabit] {
        let query = foldedSearchQuery
        return environment.taskWorkspace.habits
            .filter { habit in
                query.isEmpty || habit.name
                    .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
                    .contains(query)
            }
            .sorted { lhs, rhs in
                let lhsDone = isHabitDone(lhs)
                let rhsDone = isHabitDone(rhs)
                if lhsDone != rhsDone { return !lhsDone }
                if lhs.time != rhs.time { return (lhs.time ?? "99:99") < (rhs.time ?? "99:99") }
                return lhs.id < rhs.id
            }
    }

    private var habitsToday: [WorkspaceHabit] {
        visibleHabits.filter { isHabitScheduled($0, dateKey: today) }
    }

    private var pausedHabits: [WorkspaceHabit] {
        visibleHabits.filter { rootineHabitIsPausedOnDate($0, dateKey: today) }
    }

    private var activeHabits: [WorkspaceHabit] {
        visibleHabits.filter { habit in
            !rootineHabitIsPausedOnDate(habit, dateKey: today)
                && !habitsToday.contains(where: { $0.id == habit.id })
        }
    }

    var body: some View {
        List {
            syncStateRows

            TaskLibraryControls(
                mode: $mode,
                searchText: $searchText,
                filterLabel: filter.label,
                isDefaultFilter: filter == .all,
                showsFilter: mode == .tasks,
                onFilter: { isShowingFilters = true }
            )
            .listRowInsets(EdgeInsets(
                top: RootineTheme.Spacing.small,
                leading: RootineTheme.Spacing.medium,
                bottom: RootineTheme.Spacing.small,
                trailing: RootineTheme.Spacing.medium
            ))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            if mode == .tasks {
                taskSections
            } else {
                habitSections
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(RootineTheme.ColorToken.canvas)
        .contentMargins(.bottom, RootineTheme.Spacing.large, for: .scrollContent)
        .refreshable { await environment.flushPendingMutations() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let undoAction {
                RootineUndoBanner(message: undoAction.message, usesAdaptiveLayout: true, onUndo: undo)
                    .padding(.horizontal, RootineTheme.Spacing.medium)
                    .padding(.bottom, RootineTheme.Spacing.small)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: mode)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: collapsedSections)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: undoAction?.id)
        .sheet(isPresented: $isShowingFilters) {
            TaskLibraryFilterSheet(filter: $filter, counts: filterCounts)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
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
                .presentationBackground(RootineTheme.ColorToken.canvas)
        }
        .sheet(item: $selectedHabit) { habit in
            HabitDetailSheet(habit: habit)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $taskToMove) { task in
            TaskLibraryListPicker(
                task: task,
                lists: environment.taskWorkspace.lists,
                onSelect: { listID in moveTask(task, to: listID) }
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Przełóż zadanie",
            isPresented: Binding(
                get: { taskToReschedule != nil },
                set: { if !$0 { taskToReschedule = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Dzisiaj") { rescheduleSelectedTask(to: today) }
            Button("Jutro") { rescheduleSelectedTask(to: RootineDate.shiftLocalDate(today, by: 1)) }
            Button("Za tydzień") { rescheduleSelectedTask(to: RootineDate.shiftLocalDate(today, by: 7)) }
            Button("Bez terminu") { rescheduleSelectedTask(to: nil) }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(taskToReschedule.map { "Wybierz nowy termin dla „\($0.text)”." } ?? "")
        }
        .confirmationDialog(
            "Przenieść zadanie do kosza?",
            isPresented: Binding(
                get: { taskToDelete != nil },
                set: { if !$0 { taskToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Przenieś do kosza", role: .destructive) {
                if let taskToDelete { deleteTask(taskToDelete) }
                self.taskToDelete = nil
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(taskToDelete.map { "Zadanie „\($0.text)” będzie można przywrócić z kosza." } ?? "")
        }
        .confirmationDialog(
            "Usunąć zadanie na stałe?",
            isPresented: Binding(
                get: { taskToPurge != nil },
                set: { if !$0 { taskToPurge = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Usuń na stałe", role: .destructive) {
                if let taskToPurge {
                    Task { await environment.purgeTask(id: taskToPurge.id) }
                }
                self.taskToPurge = nil
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(taskToPurge.map { "Nie będzie można przywrócić „\($0.text)”." } ?? "")
        }
        .confirmationDialog(
            "Opróżnić kosz?",
            isPresented: $isConfirmingEmptyTrash,
            titleVisibility: .visible
        ) {
            Button("Opróżnij kosz", role: .destructive) {
                Task { await environment.emptyTaskTrash() }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text("Usunięte zadania znikną bez możliwości przywrócenia.")
        }
        .task(id: undoAction?.id) {
            guard undoAction != nil else { return }
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                undoAction = nil
            }
        }
    }

    @ViewBuilder
    private var syncStateRows: some View {
        if environment.isLaunching {
            ProgressView("Wczytuję zadania…")
                .frame(maxWidth: .infinity, minHeight: 88)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }

        if case .conflict = environment.workspaceSyncStatus {
            RootineErrorState(
                title: "Konflikt synchronizacji",
                message: "Zmiany są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                onRetry: { Task { await environment.flushPendingMutations() } }
            )
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        } else if case .localOnly = environment.workspaceSyncStatus {
            RootineOfflineBanner()
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
    }

    @ViewBuilder
    private var taskSections: some View {
        if filter == .trash {
            trashSection
        } else {
            taskSection(
                id: .overdue,
                title: "Po terminie",
                systemImage: "clock.badge.exclamationmark",
                tint: RootineTheme.ColorToken.warning,
                tasks: overdueTasks
            )
            taskSection(
                id: .nextSevenDays,
                title: "Najbliższe 7 dni",
                systemImage: "calendar",
                tasks: nextSevenDaysTasks
            )
            taskSection(
                id: .later,
                title: "Później",
                systemImage: "calendar.badge.clock",
                tasks: laterTasks
            )
            taskSection(
                id: .undated,
                title: "Bez terminu",
                systemImage: "circle.dashed",
                tasks: undatedTasks
            )
            taskSection(
                id: .completed,
                title: "Ukończone",
                systemImage: "checkmark.circle.fill",
                tint: RootineTheme.ColorToken.success,
                tasks: completedTasks,
                isCollapsible: filter != .completed
            )

            if overdueTasks.isEmpty,
               nextSevenDaysTasks.isEmpty,
               laterTasks.isEmpty,
               undatedTasks.isEmpty,
               completedTasks.isEmpty {
                emptyStateRow(
                    title: searchText.isEmpty ? emptyTaskTitle : "Brak wyników",
                    message: searchText.isEmpty ? emptyTaskMessage : "Spróbuj krótszej frazy albo zmień filtr.",
                    systemImage: searchText.isEmpty ? "sparkles" : "magnifyingglass",
                    actionTitle: filter == .completed ? nil : "Dodaj zadanie",
                    action: filter == .completed ? nil : { isShowingAddTask = true }
                )
            }
        }
    }

    @ViewBuilder
    private var habitSections: some View {
        habitSection(id: .habitsToday, title: "Na dziś", systemImage: "sun.max.fill", habits: habitsToday)
        habitSection(id: .habitsActive, title: "Aktywne", systemImage: "repeat", habits: activeHabits)
        habitSection(id: .habitsPaused, title: "Wstrzymane", systemImage: "pause.circle", habits: pausedHabits)

        if habitsToday.isEmpty, activeHabits.isEmpty, pausedHabits.isEmpty {
            emptyStateRow(
                title: searchText.isEmpty ? "Brak nawyków" : "Brak wyników",
                message: searchText.isEmpty
                    ? "Dodaj pierwszy nawyk i wybierz jego spokojny rytm."
                    : "Spróbuj krótszej frazy.",
                systemImage: searchText.isEmpty ? "flame" : "magnifyingglass",
                actionTitle: searchText.isEmpty ? "Dodaj nawyk" : nil,
                action: searchText.isEmpty ? { isShowingAddHabit = true } : nil
            )
        }
    }

    @ViewBuilder
    private var trashSection: some View {
        if deletedTasks.isEmpty {
            emptyStateRow(
                title: "Kosz jest pusty",
                message: "Usunięte zadania będzie można przywrócić z tego miejsca.",
                systemImage: "trash",
                actionTitle: nil,
                action: nil
            )
        } else {
            Section {
                ForEach(deletedTasks) { task in
                    TaskLibraryTrashRow(task: task)
                        .taskLibraryRowStyle()
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                restoreTask(task)
                            } label: {
                                Label("Przywróć", systemImage: "arrow.uturn.backward")
                            }
                            .tint(RootineTheme.ColorToken.action)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                taskToPurge = task
                            } label: {
                                Label("Usuń", systemImage: "trash.slash")
                            }
                        }
                        .contextMenu {
                            Button {
                                restoreTask(task)
                            } label: {
                                Label("Przywróć", systemImage: "arrow.uturn.backward")
                            }
                            Button(role: .destructive) {
                                taskToPurge = task
                            } label: {
                                Label("Usuń na stałe", systemImage: "trash.slash")
                            }
                        }
                        .accessibilityAction(named: "Przywróć") { restoreTask(task) }
                        .accessibilityAction(named: "Usuń na stałe") { taskToPurge = task }
                }

                Button("Opróżnij kosz", role: .destructive) {
                    isConfirmingEmptyTrash = true
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            } header: {
                TaskLibrarySectionHeader(
                    title: "Kosz",
                    systemImage: "trash",
                    count: deletedTasks.count,
                    tint: RootineTheme.ColorToken.destructive,
                    isExpanded: true,
                    onToggle: nil
                )
            }
        }
    }

    @ViewBuilder
    private func taskSection(
        id: TaskLibrarySectionID,
        title: String,
        systemImage: String,
        tint: Color = RootineTheme.ColorToken.primaryText,
        tasks: [WorkspaceTask],
        isCollapsible: Bool = true
    ) -> some View {
        if !tasks.isEmpty {
            let isExpanded = !isCollapsible || !collapsedSections.contains(id)
            Section {
                if isExpanded {
                    ForEach(tasks) { task in taskRow(task) }
                }
            } header: {
                TaskLibrarySectionHeader(
                    title: title,
                    systemImage: systemImage,
                    count: tasks.count,
                    tint: tint,
                    isExpanded: isExpanded,
                    onToggle: isCollapsible ? { toggleSection(id) } : nil
                )
            }
        }
    }

    @ViewBuilder
    private func habitSection(
        id: TaskLibrarySectionID,
        title: String,
        systemImage: String,
        habits: [WorkspaceHabit]
    ) -> some View {
        if !habits.isEmpty {
            let isExpanded = !collapsedSections.contains(id)
            Section {
                if isExpanded {
                    ForEach(habits) { habit in habitRow(habit) }
                }
            } header: {
                TaskLibrarySectionHeader(
                    title: title,
                    systemImage: systemImage,
                    count: habits.count,
                    tint: RootineTheme.ColorToken.primaryText,
                    isExpanded: isExpanded,
                    onToggle: { toggleSection(id) }
                )
            }
        }
    }

    private func taskRow(_ task: WorkspaceTask) -> some View {
        TasksRow(
            task: task,
            listName: listName(for: task),
            onToggle: { toggleTask(task) },
            onSelect: { selectedTask = task }
        )
        .taskLibraryRowStyle()
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                toggleTask(task)
            } label: {
                Label(isDone(task) ? "Otwórz" : "Ukończ", systemImage: isDone(task) ? "arrow.uturn.backward" : "checkmark")
            }
            .tint(isDone(task) ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.success)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                selectedTask = task
            } label: {
                Label("Edytuj", systemImage: "pencil")
            }
            .tint(RootineTheme.ColorToken.action)

            Button {
                taskToMove = task
            } label: {
                Label("Lista", systemImage: "folder")
            }
            .tint(RootineTheme.ColorToken.secondaryText)

            Button {
                taskToReschedule = task
            } label: {
                Label("Przełóż", systemImage: "calendar")
            }
            .tint(RootineTheme.ColorToken.warning)
        }
        .contextMenu {
            Button {
                toggleTask(task)
            } label: {
                Label(
                    isDone(task) ? "Oznacz jako otwarte" : "Oznacz jako ukończone",
                    systemImage: isDone(task) ? "arrow.uturn.backward" : "checkmark.circle"
                )
            }
            Button {
                taskToReschedule = task
            } label: {
                Label("Przełóż", systemImage: "calendar")
            }
            Button {
                taskToMove = task
            } label: {
                Label("Przenieś do listy", systemImage: "folder")
            }
            Button {
                selectedTask = task
            } label: {
                Label("Edytuj", systemImage: "pencil")
            }
            Divider()
            Button(role: .destructive) {
                taskToDelete = task
            } label: {
                Label("Przenieś do kosza", systemImage: "trash")
            }
        }
        .accessibilityAction(named: isDone(task) ? "Oznacz jako otwarte" : "Oznacz jako ukończone") {
            toggleTask(task)
        }
        .accessibilityAction(named: "Przełóż") { taskToReschedule = task }
        .accessibilityAction(named: "Przenieś do listy") { taskToMove = task }
        .accessibilityAction(named: "Edytuj") { selectedTask = task }
        .accessibilityAction(named: "Przenieś do kosza") { taskToDelete = task }
    }

    private func habitRow(_ habit: WorkspaceHabit) -> some View {
        let canComplete = isHabitScheduled(habit, dateKey: today)
        let isPaused = rootineHabitIsPausedOnDate(habit, dateKey: today)

        return TaskLibraryHabitRow(
            habit: habit,
            canComplete: canComplete,
            isPaused: isPaused,
            onToggle: { toggleHabit(habit) },
            onSelect: { selectedHabit = habit }
        )
        .taskLibraryRowStyle()
        .swipeActions(edge: .leading, allowsFullSwipe: canComplete) {
            if canComplete {
                Button {
                    toggleHabit(habit)
                } label: {
                    Label(
                        isHabitDone(habit) ? "Cofnij" : "Wykonaj",
                        systemImage: isHabitDone(habit) ? "arrow.uturn.backward" : "checkmark"
                    )
                }
                .tint(isHabitDone(habit) ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.success)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                selectedHabit = habit
            } label: {
                Label("Edytuj", systemImage: "pencil")
            }
            .tint(RootineTheme.ColorToken.action)

            Button {
                setHabitPaused(habit, paused: !isPaused)
            } label: {
                Label(isPaused ? "Wznów" : "Wstrzymaj", systemImage: isPaused ? "play" : "pause")
            }
            .tint(RootineTheme.ColorToken.warning)
        }
        .contextMenu {
            if canComplete {
                Button {
                    toggleHabit(habit)
                } label: {
                    Label(
                        isHabitDone(habit) ? "Oznacz jako niewykonany" : "Oznacz jako wykonany",
                        systemImage: isHabitDone(habit) ? "arrow.uturn.backward" : "checkmark.circle"
                    )
                }
            }
            Button {
                setHabitPaused(habit, paused: !isPaused)
            } label: {
                Label(isPaused ? "Wznów" : "Wstrzymaj", systemImage: isPaused ? "play" : "pause")
            }
            Button {
                selectedHabit = habit
            } label: {
                Label("Edytuj", systemImage: "pencil")
            }
        }
        .accessibilityAction(named: isPaused ? "Wznów" : "Wstrzymaj") {
            setHabitPaused(habit, paused: !isPaused)
        }
        .accessibilityAction(named: "Edytuj") { selectedHabit = habit }
    }

    private func emptyStateRow(
        title: String,
        message: String,
        systemImage: String,
        actionTitle: String?,
        action: (() -> Void)?
    ) -> some View {
        RootineEmptyState(
            title: title,
            message: message,
            systemImage: systemImage,
            actionTitle: actionTitle,
            action: action
        )
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private var emptyTaskTitle: String {
        switch filter {
        case .completed: return "Nie ma jeszcze ukończonych zadań"
        case .undated: return "Wszystkie zadania mają termin"
        default: return "Wszystko uporządkowane"
        }
    }

    private var emptyTaskMessage: String {
        switch filter {
        case .completed: return "Wykonane zadania pojawią się tutaj."
        case .undated: return "Nowe zadanie bez daty pojawi się w tym widoku."
        default: return "Dodaj kolejny konkretny krok, kiedy będzie potrzebny."
        }
    }

    private var foldedSearchQuery: String {
        searchText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
    }

    private func searchedTasks(_ tasks: [WorkspaceTask]) -> [WorkspaceTask] {
        let query = foldedSearchQuery
        return tasks
            .filter { task in
                guard !query.isEmpty else { return true }
                let searchable = [
                    task.text,
                    task.notes ?? "",
                    task.tags?.joined(separator: " ") ?? "",
                    listName(for: task) ?? ""
                ].joined(separator: " ")
                return searchable
                    .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pl_PL"))
                    .contains(query)
            }
            .sorted(by: taskSort)
    }

    private func effectiveDate(for task: WorkspaceTask) -> String? {
        guard task.schedule?.validatedRecurrence != nil else { return task.calendarDate }
        let horizon = RootineDate.shiftLocalDate(today, by: 366)
        return rootineTaskOccurrences([task], from: today, through: horizon).first?.calendarDate
            ?? task.calendarDate
    }

    private func taskSort(_ lhs: WorkspaceTask, _ rhs: WorkspaceTask) -> Bool {
        let lhsDate = effectiveDate(for: lhs) ?? "9999-99-99"
        let rhsDate = effectiveDate(for: rhs) ?? "9999-99-99"
        if lhsDate != rhsDate { return lhsDate < rhsDate }
        switch (lhs.time, rhs.time) {
        case let (left?, right?) where left != right: return left < right
        case (_?, nil): return true
        case (nil, _?): return false
        default: return lhs.id < rhs.id
        }
    }

    private func listName(for task: WorkspaceTask) -> String? {
        guard let listID = task.list else { return nil }
        return environment.taskWorkspace.lists.first(where: { $0.id == listID })?.label
    }

    private func toggleSection(_ id: TaskLibrarySectionID) {
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
            if collapsedSections.contains(id) {
                collapsedSections.remove(id)
            } else {
                collapsedSections.insert(id)
            }
        }
    }

    private func isDone(_ task: WorkspaceTask) -> Bool {
        rootineTaskIsDoneOnDate(task, dateKey: today)
    }

    private func toggleTask(_ task: WorkspaceTask) {
        let wasDone = isDone(task)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showUndo(
            message: wasDone ? "Zadanie ponownie otwarte" : "Ukończono zadanie",
            kind: .toggleTask(task.id)
        )
        Task { await environment.toggleTaskCompletion(id: task.id) }
    }

    private func deleteTask(_ task: WorkspaceTask) {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        showUndo(message: "Przeniesiono zadanie do kosza", kind: .restoreTask(task.id))
        Task { await environment.deleteTask(id: task.id) }
    }

    private func restoreTask(_ task: WorkspaceTask) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showUndo(message: "Przywrócono zadanie", kind: .deleteTask(task.id))
        Task { await environment.restoreTask(id: task.id) }
    }

    private func rescheduleSelectedTask(to date: String?) {
        guard let task = taskToReschedule else { return }
        taskToReschedule = nil
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showUndo(message: rescheduleMessage(for: date), kind: .restoreTaskSnapshot(task))
        Task {
            await environment.updateTask(
                id: task.id,
                text: task.text,
                time: task.time,
                calendarDate: date,
                priority: task.priority,
                notes: task.notes,
                list: task.list,
                tags: task.tags
            )
        }
    }

    private func moveTask(_ task: WorkspaceTask, to listID: String?) {
        guard task.list != listID else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showUndo(message: "Przeniesiono zadanie do listy", kind: .restoreTaskSnapshot(task))
        Task {
            await environment.updateTask(
                id: task.id,
                text: task.text,
                time: task.time,
                calendarDate: task.calendarDate,
                priority: task.priority,
                notes: task.notes,
                list: listID,
                tags: task.tags
            )
        }
    }

    private func toggleHabit(_ habit: WorkspaceHabit) {
        guard isHabitScheduled(habit, dateKey: today) else { return }
        let wasDone = isHabitDone(habit)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        showUndo(
            message: wasDone ? "Cofnięto wykonanie nawyku" : "Oznaczono nawyk jako wykonany",
            kind: .toggleHabit(habit.id)
        )
        Task { await environment.toggleHabitCompletion(id: habit.id) }
    }

    private func setHabitPaused(_ habit: WorkspaceHabit, paused: Bool) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if paused {
            showUndo(message: "Wstrzymano nawyk", kind: .resumeHabit(habit.id))
            Task { await environment.pauseHabit(id: habit.id) }
        } else {
            showUndo(message: "Wznowiono nawyk", kind: .pauseHabit(habit.id))
            Task { await environment.resumeHabit(id: habit.id) }
        }
    }

    private func showUndo(message: String, kind: TaskLibraryUndoKind) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
            undoAction = TaskLibraryUndoAction(message: message, kind: kind)
        }
    }

    private func undo() {
        guard let action = undoAction else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
            undoAction = nil
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        Task {
            switch action.kind {
            case .toggleTask(let id):
                await environment.toggleTaskCompletion(id: id)
            case .restoreTask(let id):
                await environment.restoreTask(id: id)
            case .deleteTask(let id):
                await environment.deleteTask(id: id)
            case .restoreTaskSnapshot(let task):
                await environment.restoreTaskSnapshot(task)
            case .toggleHabit(let id):
                await environment.toggleHabitCompletion(id: id)
            case .resumeHabit(let id):
                await environment.resumeHabit(id: id)
            case .pauseHabit(let id):
                await environment.pauseHabit(id: id)
            }
        }
    }

    private func rescheduleMessage(for date: String?) -> String {
        guard let date else { return "Usunięto termin zadania" }
        if date == today { return "Przełożono zadanie na dzisiaj" }
        if date == RootineDate.shiftLocalDate(today, by: 1) { return "Przełożono zadanie na jutro" }
        return "Przełożono zadanie na \(shortDate(date))"
    }
}

private struct TaskLibraryControls: View {
    @Binding var mode: TaskLibraryMode
    @Binding var searchText: String
    let filterLabel: String
    let isDefaultFilter: Bool
    let showsFilter: Bool
    let onFilter: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TaskLibraryModeControl(mode: $mode, fillsWidth: true)

            HStack(spacing: RootineTheme.Spacing.small) {
                TaskLibrarySearchField(
                    text: $searchText,
                    placeholder: mode == .tasks ? "Szukaj zadań" : "Szukaj nawyków"
                )

                if showsFilter {
                    Button(action: onFilter) {
                        Image(systemName: "line.3.horizontal.decrease")
                            .font(.subheadline.weight(.semibold))
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                            .foregroundStyle(
                                isDefaultFilter
                                    ? RootineTheme.ColorToken.secondaryText
                                    : RootineTheme.ColorToken.action
                            )
                            .frame(width: 44, height: 44)
                            .background(
                                isDefaultFilter
                                    ? RootineTheme.ColorToken.surface
                                    : RootineTheme.ColorToken.action.opacity(0.14)
                            )
                            .clipShape(
                                RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                                    .stroke(
                                        isDefaultFilter
                                            ? RootineTheme.ColorToken.separator
                                            : RootineTheme.ColorToken.action.opacity(0.36),
                                        lineWidth: 1
                                    )
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Filtry zadań")
                    .accessibilityValue(filterLabel)
                    .accessibilityHint("Otwiera wybór filtra")
                }
            }

            if showsFilter && !isDefaultFilter {
                Label(filterLabel, systemImage: "line.3.horizontal.decrease")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.action)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 28)
                    .background(RootineTheme.ColorToken.action.opacity(0.12))
                    .clipShape(Capsule())
                    .accessibilityLabel("Aktywny filtr: \(filterLabel)")
            }
        }
    }
}

private struct TaskLibraryModeControl: View {
    @Binding var mode: TaskLibraryMode
    var fillsWidth = false

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.xSmall) {
            ForEach(TaskLibraryMode.allCases) { option in
                Button {
                    UISelectionFeedbackGenerator().selectionChanged()
                    mode = option
                } label: {
                    Text(option.label)
                        .font(.subheadline.weight(.semibold))
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(mode == option ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 13)
                        .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: 44)
                        .background(mode == option ? RootineTheme.ColorToken.elevated : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            if mode == option {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(RootineTheme.ColorToken.action.opacity(0.32), lineWidth: 1)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(mode == option ? .isSelected : [])
            }
        }
        .frame(maxWidth: fillsWidth ? .infinity : nil)
        .padding(RootineTheme.Spacing.xSmall)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Widok zadań")
    }
}

private struct TaskLibrarySearchField: View {
    @Binding var text: String
    let placeholder: String
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.sentences)
                .focused($isFocused)
                .submitLabel(.search)
                .accessibilityLabel(placeholder)

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
        .padding(.leading, 12)
        .padding(.trailing, text.isEmpty ? 12 : 0)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous)
                .stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
        }
    }
}

private struct TaskLibrarySectionHeader: View {
    let title: String
    let systemImage: String
    let count: Int
    let tint: Color
    let isExpanded: Bool
    let onToggle: (() -> Void)?

    var body: some View {
        Group {
            if let onToggle {
                Button(action: onToggle) { content }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(count)")
                    .accessibilityValue(isExpanded ? "Rozwinięta" : "Zwinięta")
            } else {
                content.accessibilityElement(children: .combine)
            }
        }
        .textCase(nil)
    }

    private var content: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            Text(String(count))
                .font(.caption2.monospacedDigit().weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .padding(.horizontal, 7)
                .frame(minHeight: 22)
                .background(RootineTheme.ColorToken.elevated)
                .clipShape(Capsule())

            Spacer(minLength: 0)

            if onToggle != nil {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .rotationEffect(.degrees(isExpanded ? 0 : -90))
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}

private struct TaskLibraryHabitRow: View {
    let habit: WorkspaceHabit
    let canComplete: Bool
    let isPaused: Bool
    let onToggle: () -> Void
    let onSelect: () -> Void

    private var isDone: Bool { isHabitDone(habit) }

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: isDone ? "checkmark.circle.fill" : isPaused ? "pause.circle" : "circle")
                    .font(.title3)
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(
                        isDone
                            ? RootineTheme.ColorToken.success
                            : isPaused ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.action
                    )
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(!canComplete)
            .accessibilityLabel(isDone ? "Oznacz \(habit.name) jako niewykonany" : "Oznacz \(habit.name) jako wykonany")
            .accessibilityHint(canComplete ? "" : "Ten nawyk nie jest zaplanowany na dzisiaj")

            Button(action: onSelect) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(habit.name)
                            .font(.body.weight(.medium))
                            .foregroundStyle(
                                isDone || isPaused
                                    ? RootineTheme.ColorToken.secondaryText
                                    : RootineTheme.ColorToken.primaryText
                            )
                            .strikethrough(isDone)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        HStack(spacing: RootineTheme.Spacing.small) {
                            if let time = habit.time { Label(time, systemImage: "clock") }
                            Text(isPaused ? "Wstrzymany" : habitScheduleLabel(habit.schedule))
                            if let completedCount = habit.completedDates?.count, completedCount > 0 {
                                Text("\(completedCount) ukończeń")
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .lineLimit(1)
                    }

                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły nawyku: \(habit.name)")
            .accessibilityHint("Otwiera rytm, historię i ustawienia przerwy")
        }
    }
}

private struct TaskLibraryTrashRow: View {
    let task: WorkspaceTask

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: "trash")
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .frame(width: 44, height: 44)

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
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Usunięte zadanie: \(task.text)")
        .accessibilityHint("Przesuń w prawo, aby przywrócić")
    }
}

private struct TaskLibraryFilterSheet: View {
    @Binding var filter: TasksFilter
    let counts: [TasksFilter: Int]
    @Environment(\.dismiss) private var dismiss

    private let options: [TasksFilter] = [.all, .completed, .undated, .trash]

    var body: some View {
        NavigationStack {
            List {
                Section("Pokaż zadania") {
                    ForEach(options) { option in
                        Button {
                            filter = option
                            dismiss()
                        } label: {
                            HStack(spacing: RootineTheme.Spacing.medium) {
                                Image(systemName: option.systemImage)
                                    .foregroundStyle(
                                        option == .trash
                                            ? RootineTheme.ColorToken.destructive
                                            : RootineTheme.ColorToken.action
                                    )
                                    .frame(width: 24)

                                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                                    Text(option.label)
                                        .font(.body.weight(.medium))
                                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                    Text(subtitle(for: option))
                                        .font(.caption)
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                        .multilineTextAlignment(.leading)
                                }

                                Spacer(minLength: 0)

                                Text(String(counts[option, default: 0]))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)

                                if filter == option {
                                    Image(systemName: "checkmark")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(RootineTheme.ColorToken.action)
                                }
                            }
                            .frame(minHeight: 52)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(option.label), \(counts[option, default: 0])")
                        .accessibilityValue(filter == option ? "Wybrany" : "")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Filtry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zamknij") { dismiss() }
                }
            }
        }
    }

    private func subtitle(for option: TasksFilter) -> String {
        switch option {
        case .all: return "Wszystkie zadania do zrobienia"
        case .completed: return "Wszystkie wykonane zadania"
        case .undated: return "Otwarte zadania bez przypisanej daty"
        case .trash: return "Usunięte zadania możliwe do odzyskania"
        }
    }
}

private struct TaskLibraryListPicker: View {
    let task: WorkspaceTask
    let lists: [WorkspaceTaxonomy]
    let onSelect: (String?) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Przenieś do listy") {
                    listButton(id: nil, label: "Bez listy", systemImage: "tray")

                    ForEach(lists, id: \.id) { list in
                        listButton(id: list.id, label: list.label, systemImage: "folder")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Lista")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
        }
    }

    private func listButton(id: String?, label: String, systemImage: String) -> some View {
        Button {
            onSelect(id)
            dismiss()
        } label: {
            HStack {
                Label(label, systemImage: systemImage)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Spacer()
                if task.list == id {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.action)
                }
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityValue(task.list == id ? "Wybrana" : "")
    }
}

private extension View {
    func taskLibraryRowStyle() -> some View {
        padding(.horizontal, RootineTheme.Spacing.small)
            .padding(.vertical, 6)
            .background(RootineTheme.ColorToken.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(RootineTheme.ColorToken.separator.opacity(0.9), lineWidth: 1)
            }
            .listRowInsets(EdgeInsets(
                top: RootineTheme.Spacing.xSmall,
                leading: RootineTheme.Spacing.medium,
                bottom: RootineTheme.Spacing.xSmall,
                trailing: RootineTheme.Spacing.medium
            ))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}
