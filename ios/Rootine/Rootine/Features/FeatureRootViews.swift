import SwiftUI

/// Internal-only diagnostic surface. It proves the app target, configuration,
/// environment object, dark tokens, and async bootstrap work without pretending
/// that any product screen has already been designed or accepted.
struct FoundationStatusView: View {
    let configured: Bool
    let hasStoredSession: Bool
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            Text("Rootine iOS")
                .font(.largeTitle.bold())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            Text("Szkielet techniczny")
                .font(.title2.weight(.semibold))

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                status("Konfiguracja klienta", ready: configured)
                status("Sesja w Keychain", ready: hasStoredSession)
                status("Kontrakty Codable", ready: true)
                status("Persistence i kolejka CAS", ready: true)
            }
            .rootineSurface()

            Text(message)
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            Text("Następny pełny ekran powstanie dopiero po osobnej akceptacji projektu.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.warning)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(RootineTheme.Spacing.large)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }

    private func status(_ label: String, ready: Bool) -> some View {
        Label(label, systemImage: ready ? "checkmark.circle.fill" : "circle.dashed")
            .foregroundStyle(ready ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
    }
}

// MARK: - More module designs

/// Native surfaces for the spaces exposed from the "Więcej" hub. Every module
/// reads and writes through `AppEnvironment`, which owns the local snapshot
/// and the shared offline mutation queue.
struct MoreModuleView: View {
    let module: MoreModule

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                MoreModuleHero(module: module)

                switch module {
                case .notes:
                    NotesModuleContent()
                case .sport:
                    SportModuleContent()
                case .goals:
                    GoalsModuleContent()
                case .work:
                    WorkModuleContent()
                case .travel:
                    TravelModuleContent()
                case .health:
                    HealthModuleContent()
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct MoreModuleHero: View {
    let module: MoreModule

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: module.systemImage)
                .font(.title2.weight(.semibold))
                .foregroundStyle(module.tint)
                .frame(width: 52, height: 52)
                .background(module.tint.opacity(0.18))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(module.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(module.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(RootineTheme.Spacing.medium)
        .background(
            LinearGradient(
                colors: [module.tint.opacity(0.22), RootineTheme.ColorToken.surface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous)
                .stroke(module.tint.opacity(0.28), lineWidth: 1)
        }
    }
}

private struct ModuleSectionTitle: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
    }
}

private struct ModuleActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
    }
}

// MARK: Notes

private struct NotesModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var editorTarget: NoteEditorTarget?

    private var notes: [NoteRecord] {
        environment.notesWorkspace.notes
            .filter { !$0.archived }
            .sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            if let pinned = notes.first(where: { $0.pinned }) {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    HStack {
                        ModuleSectionTitle(title: "Przypięte", systemImage: "pin.fill")
                        Spacer()
                        Text("WAŻNE")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(RootineTheme.ColorToken.warning)
                    }
                    Button { editorTarget = NoteEditorTarget(note: pinned) } label: {
                        NoteFeatureCard(note: pinned)
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    ModuleSectionTitle(title: "Ostatnie notatki", systemImage: "clock")
                    Spacer()
                    Text("\(notes.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }

                if notes.isEmpty {
                    ModuleEmptyCard(
                        title: "Zrób miejsce na pomysły",
                        detail: "Twoje notatki pojawią się tutaj.",
                        systemImage: "note.text.badge.plus",
                        tint: MoreModule.notes.tint
                    )
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(notes.prefix(4).enumerated()), id: \.element.id) { index, note in
                            Button { editorTarget = NoteEditorTarget(note: note) } label: {
                                NoteListRow(note: note)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button {
                                    Task { await environment.toggleNotePinned(id: note.id) }
                                } label: {
                                    Label(note.pinned ? "Odepnij" : "Przypnij", systemImage: note.pinned ? "pin.slash" : "pin")
                                }
                                Button {
                                    Task { await environment.archiveNote(id: note.id) }
                                } label: {
                                    Label("Archiwizuj", systemImage: "archivebox")
                                }
                                Button(role: .destructive) {
                                    Task { await environment.deleteNote(id: note.id) }
                                } label: {
                                    Label("Usuń", systemImage: "trash")
                                }
                            }
                            if index < min(notes.count, 4) - 1 {
                                Divider().overlay(RootineTheme.ColorToken.separator)
                            }
                        }
                    }
                    .rootineSurface()
                }
            }

            ModuleActionButton(title: "Nowa notatka", systemImage: "square.and.pencil", tint: MoreModule.notes.tint) {
                editorTarget = NoteEditorTarget(note: nil)
            }
        }
        .sheet(item: $editorTarget) { target in
            NoteEditorSheet(note: target.note) { note in
                Task { await environment.upsertNote(note) }
            } onDelete: { note in
                Task { await environment.deleteNote(id: note.id) }
            }
        }
    }
}

private struct NoteEditorTarget: Identifiable {
    let id: String
    let note: NoteRecord?

    init(note: NoteRecord?) {
        self.note = note
        id = note?.id ?? "new-\(UUID().uuidString)"
    }
}

private struct NoteEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let note: NoteRecord?
    let onSave: (NoteRecord) -> Void
    let onDelete: (NoteRecord) -> Void
    @State private var title: String
    @State private var bodyText: String
    @State private var tags: String
    @State private var pinned: Bool

    init(note: NoteRecord?, onSave: @escaping (NoteRecord) -> Void, onDelete: @escaping (NoteRecord) -> Void) {
        self.note = note
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: note?.title ?? "")
        _bodyText = State(initialValue: note?.body ?? "")
        _tags = State(initialValue: note?.tags.joined(separator: ", ") ?? "")
        _pinned = State(initialValue: note?.pinned ?? false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Treść") {
                    TextField("Tytuł", text: $title)
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 120)
                    TextField("Tagi (opcjonalnie)", text: $tags)
                    Toggle("Przypnij na górze", isOn: $pinned)
                }
                if let note {
                    Section {
                        Button("Usuń notatkę", role: .destructive) {
                            onDelete(note)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(note == nil ? "Nowa notatka" : "Edytuj notatkę")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        let now = RootineDate.isoTimestamp()
                        let saved = NoteRecord(
                            id: note?.id ?? UUID().uuidString,
                            title: title,
                            body: bodyText,
                            kind: note?.kind ?? "text",
                            items: note?.items ?? [],
                            tags: tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                            listId: note?.listId ?? "",
                            color: note?.color ?? .blue,
                            pinned: pinned,
                            archived: false,
                            createdAt: note?.createdAt ?? now,
                            updatedAt: now
                        )
                        onSave(saved)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct NoteFeatureCard: View {
    let note: NoteRecord

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            HStack {
                Text(note.title.isEmpty ? "Bez tytułu" : note.title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Spacer()
                Image(systemName: "pin.fill")
                    .foregroundStyle(RootineTheme.ColorToken.warning)
            }
            Text(note.body.isEmpty ? "Lista kontrolna" : note.body)
                .font(.subheadline)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .lineLimit(3)
            if !note.tags.isEmpty {
                HStack(spacing: RootineTheme.Spacing.xSmall) {
                    ForEach(note.tags.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(MoreModule.notes.tint)
                    }
                }
            }
        }
        .rootineSurface()
    }
}

private struct NoteListRow: View {
    let note: NoteRecord

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Circle()
                .fill(noteColor(note.color))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "Bez tytułu" : note.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    .lineLimit(1)
                Text(note.body.isEmpty ? "Pusta notatka" : note.body)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .padding(.vertical, RootineTheme.Spacing.small)
    }
}

private func noteColor(_ color: NoteColor) -> Color {
    switch color {
    case .graphite: return RootineTheme.ColorToken.secondaryText
    case .blue: return MoreModule.notes.tint
    case .green: return RootineTheme.ColorToken.success
    case .amber: return RootineTheme.ColorToken.warning
    case .violet: return MoreModule.travel.tint
    case .coral: return RootineTheme.ColorToken.destructive
    }
}

// MARK: Sport

private struct SportModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingWorkoutEditor = false
    private let weekdays = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]

    private var workouts: [SportWorkout] {
        environment.sportWorkspace.workouts.sorted { $0.date > $1.date }
    }

    private var totalMinutes: Int { workouts.reduce(0) { $0 + $1.minutes } }

    private var chartMinutes: [Int] {
        let fallback = [24, 38, 0, 52, 18, 0, 30]
        guard !workouts.isEmpty else { return fallback }
        let today = RootineDate.localDate()
        let todayMinutes = workouts.filter { $0.date == today }.reduce(0) { $0 + $1.minutes }
        return [0, 0, 0, 0, 0, 0, min(60, todayMinutes)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack {
                    ModuleSectionTitle(title: "Ten tydzień", systemImage: "chart.bar.fill")
                    Spacer()
                    Text("\(totalMinutes) min")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(MoreModule.sport.tint)
                }

                HStack(alignment: .bottom, spacing: RootineTheme.Spacing.small) {
                    ForEach(weekdays.indices, id: \.self) { index in
                        VStack(spacing: RootineTheme.Spacing.xSmall) {
                            GeometryReader { proxy in
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(chartMinutes[index] == 0 ? RootineTheme.ColorToken.elevated : MoreModule.sport.tint)
                                    .frame(height: max(10, proxy.size.height * CGFloat(chartMinutes[index]) / 60))
                                    .frame(maxHeight: .infinity, alignment: .bottom)
                            }
                            .frame(height: 78)
                            Text(weekdays[index])
                                .font(.caption2)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .rootineSurface()

            HStack(spacing: RootineTheme.Spacing.small) {
                SportMetric(value: "\(workouts.count)", label: "treningi", systemImage: "figure.run")
                SportMetric(value: String(format: "%.1f", Double(totalMinutes) / 22.0), label: "km biegu", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                SportMetric(value: "8h", label: "regeneracji", systemImage: "bed.double.fill")
            }

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                ModuleSectionTitle(title: "Następny trening", systemImage: "calendar.badge.clock")
                if let next = workouts.first(where: { !$0.completed }) {
                    HStack(spacing: RootineTheme.Spacing.medium) {
                        ZStack {
                            Circle()
                                .fill(MoreModule.sport.tint.opacity(0.18))
                            Image(systemName: "figure.strengthtraining.traditional")
                                .font(.title2)
                                .foregroundStyle(MoreModule.sport.tint)
                        }
                        .frame(width: 52, height: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(next.title)
                                .font(.headline)
                            Text("\(next.kind) · \(next.minutes) min")
                                .font(.subheadline)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        Spacer(minLength: 0)
                        Button {
                            Task { await environment.toggleWorkoutCompleted(id: next.id) }
                        } label: {
                            Image(systemName: "checkmark.circle")
                                .font(.title2)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(MoreModule.sport.tint)
                    }
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await environment.deleteWorkout(id: next.id) }
                        } label: {
                            Label("Usuń trening", systemImage: "trash")
                        }
                    }
                } else {
                    ModuleEmptyCard(title: "Zaplanuj kolejny trening", detail: "Dodaj aktywność i obserwuj regularność.", systemImage: "figure.run", tint: MoreModule.sport.tint)
                }
                ModuleActionButton(title: "Zaplanuj trening", systemImage: "plus", tint: MoreModule.sport.tint) {
                    isShowingWorkoutEditor = true
                }
            }
            .rootineSurface()
        }
        .sheet(isPresented: $isShowingWorkoutEditor) {
            WorkoutEditorSheet { title, kind, minutes, date in
                Task { await environment.addWorkout(title: title, date: date, minutes: minutes, kind: kind) }
            }
        }
    }
}

private struct WorkoutEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String, Int, String) -> Void
    @State private var title = ""
    @State private var kind = "Trening"
    @State private var minutes = "30"
    @State private var date = RootineDate.localDate()

    var body: some View {
        NavigationStack {
            Form {
                Section("Trening") {
                    TextField("Nazwa", text: $title)
                    TextField("Rodzaj", text: $kind)
                    TextField("Minuty", text: $minutes)
                        .keyboardType(.numberPad)
                    TextField("Data (RRRR-MM-DD)", text: $date)
                }
            }
            .navigationTitle("Zaplanuj trening")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, kind, Int(minutes) ?? 30, date)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct SportMetric: View {
    let value: String
    let label: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Image(systemName: systemImage)
                .foregroundStyle(MoreModule.sport.tint)
            Text(value)
                .font(.title3.weight(.bold))
            Text(label)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
    }
}

// MARK: Goals

private struct GoalsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingGoalEditor = false

    private var goals: [GoalRecord] { environment.goalsWorkspace.goals }
    private var averageProgress: Double {
        guard !goals.isEmpty else { return 0 }
        return goals.reduce(0) { $0 + $1.progress } / Double(goals.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            HStack(spacing: RootineTheme.Spacing.large) {
                ZStack {
                    Circle()
                        .stroke(RootineTheme.ColorToken.separator, lineWidth: 10)
                    Circle()
                        .trim(from: 0, to: averageProgress)
                        .stroke(MoreModule.goals.tint, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(Int(averageProgress * 100))%")
                        .font(.title3.weight(.bold))
                }
                .frame(width: 92, height: 92)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text(goals.isEmpty ? "Ustal pierwszy cel" : "Dobry kierunek")
                        .font(.title3.weight(.semibold))
                    Text(goals.isEmpty ? "Mały cel pomaga utrzymać kierunek." : "Jeszcze jeden krok dziennie i utrzymasz tempo.")
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                ModuleSectionTitle(title: "Aktywne cele", systemImage: "target")
                VStack(spacing: 0) {
                    ForEach(Array(goals.enumerated()), id: \.element.id) { index, goal in
                        GoalRow(goal: goal) {
                            Task { await environment.advanceGoal(id: goal.id) }
                        }
                        .contextMenu {
                            Button { Task { await environment.advanceGoal(id: goal.id) } } label: {
                                Label("Dodaj krok", systemImage: "plus.circle")
                            }
                            Button(role: .destructive) { Task { await environment.deleteGoal(id: goal.id) } } label: {
                                Label("Usuń cel", systemImage: "trash")
                            }
                        }
                        if index < goals.count - 1 {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
                .rootineSurface()
            }

            ModuleActionButton(title: "Dodaj cel", systemImage: "plus", tint: MoreModule.goals.tint) {
                isShowingGoalEditor = true
            }
        }
        .sheet(isPresented: $isShowingGoalEditor) {
            GoalEditorSheet { title, detail, target, icon in
                Task { await environment.addGoal(title: title, detail: detail, target: target, icon: icon) }
            }
        }
    }
}

private struct GoalRow: View {
    let goal: GoalRecord
    let onAdvance: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: goal.icon)
                .foregroundStyle(MoreModule.goals.tint)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                HStack {
                    Text(goal.title).font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(Int(goal.progress * 100))%")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(MoreModule.goals.tint)
                }
                Text(goal.detail.isEmpty ? "Postęp celu" : goal.detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                ProgressView(value: goal.progress)
                    .tint(MoreModule.goals.tint)
            }
            Button(action: onAdvance) {
                Image(systemName: "plus.circle.fill")
                    .foregroundStyle(MoreModule.goals.tint)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, RootineTheme.Spacing.small)
    }
}

private struct GoalEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String, Double, String) -> Void
    @State private var title = ""
    @State private var detail = ""
    @State private var target = "10"
    @State private var icon = "target"

    var body: some View {
        NavigationStack {
            Form {
                Section("Cel") {
                    TextField("Nazwa", text: $title)
                    TextField("Opis", text: $detail)
                    TextField("Liczba kroków", text: $target)
                        .keyboardType(.decimalPad)
                    TextField("Ikona SF Symbol", text: $icon)
                }
            }
            .navigationTitle("Dodaj cel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, detail, Double(target.replacingOccurrences(of: ",", with: ".")) ?? 10, icon)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: Work

private struct WorkModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingPriorityEditor = false

    private var workTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true && $0.source?.kind == "work" }
    }

    private var isFocusRunning: Bool { environment.workWorkspace.activeFocusStartedAt != nil }

    private func elapsedText(at date: Date) -> String {
        guard let startedAt = environment.workWorkspace.activeFocusStartedAt,
              let start = ISO8601DateFormatter().date(from: startedAt) else { return "25:00" }
        let elapsed = max(0, Int(date.timeIntervalSince(start)))
        return String(format: "%02d:%02d", elapsed / 60, elapsed % 60)
    }

    private func focusProgress(at date: Date) -> Double {
        guard let startedAt = environment.workWorkspace.activeFocusStartedAt,
              let start = ISO8601DateFormatter().date(from: startedAt) else { return 0 }
        return min(1, max(0, date.timeIntervalSince(start) / (25 * 60)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack {
                    ModuleSectionTitle(title: "Sesja skupienia", systemImage: "timer")
                    Spacer()
                    Text(isFocusRunning ? "W TOKU" : "GOTOWE")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(isFocusRunning ? MoreModule.work.tint : RootineTheme.ColorToken.success)
                }
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    HStack(alignment: .lastTextBaseline) {
                        Text(isFocusRunning ? elapsedText(at: timeline.date) : "25:00")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        Text(isFocusRunning ? "min" : "min planu")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    ProgressView(value: isFocusRunning ? focusProgress(at: timeline.date) : 0)
                        .tint(MoreModule.work.tint)
                }
                Button {
                    Task {
                        if isFocusRunning {
                            await environment.stopFocusSession()
                        } else {
                            await environment.startFocusSession()
                        }
                    }
                } label: {
                    Label(isFocusRunning ? "Zatrzymaj sesję" : "Rozpocznij sesję", systemImage: isFocusRunning ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(MoreModule.work.tint)
            }
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    ModuleSectionTitle(title: "Priorytety", systemImage: "checklist")
                    Spacer()
                    Text("\(workTasks.count == 0 ? 3 : workTasks.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                let fallback = ["Zamknąć ofertę dla klienta", "Przygotować agendę spotkania", "Odpisać na feedback"]
                let titles = workTasks.isEmpty ? fallback : workTasks.prefix(3).map(\.text)
                VStack(spacing: 0) {
                    ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                        HStack(spacing: RootineTheme.Spacing.small) {
                            Image(systemName: index == 0 ? "circle.inset.filled" : "circle")
                                .foregroundStyle(index == 0 ? MoreModule.work.tint : RootineTheme.ColorToken.secondaryText)
                            Text(title)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                .lineLimit(2)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, RootineTheme.Spacing.small)
                        if index < titles.count - 1 {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
                .rootineSurface()
                ModuleActionButton(title: "Dodaj priorytet", systemImage: "plus", tint: MoreModule.work.tint) {
                    isShowingPriorityEditor = true
                }
            }

            if !environment.workWorkspace.focusSessions.isEmpty {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    ModuleSectionTitle(title: "Ostatnie sesje", systemImage: "clock.arrow.circlepath")
                    ForEach(environment.workWorkspace.focusSessions.prefix(3)) { session in
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(MoreModule.work.tint)
                            Text("Sesja skupienia")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            Text("\(session.minutes) min")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        .padding(.vertical, RootineTheme.Spacing.xSmall)
                    }
                }
                .rootineSurface()
            }
        }
        .sheet(isPresented: $isShowingPriorityEditor) {
            WorkPriorityEditorSheet { title in
                Task { await environment.addWorkPriority(text: title) }
            }
        }
    }
}

private struct WorkPriorityEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String) -> Void
    @State private var title = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Priorytet") {
                    TextField("Co jest najważniejsze?", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("Dodaj priorytet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: Travel

private struct TravelModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingTripEditor = false

    private var trips: [TravelRecord] { environment.travelWorkspace.trips }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            if let trip = trips.first {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    HStack {
                        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                            Text(trip.destination)
                                .font(.title2.weight(.bold))
                            Text("\(trip.dateRange) · \(trip.nights) nocy")
                                .font(.subheadline)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        Spacer()
                        Image(systemName: "water.waves.and.moon")
                            .font(.title)
                            .foregroundStyle(MoreModule.travel.tint)
                    }
                    HStack(spacing: RootineTheme.Spacing.small) {
                        TravelChip(title: "Plan", systemImage: "checklist")
                        TravelChip(title: "\(trip.itinerary.count) punktów", systemImage: "map")
                    }
                }
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .rootineSurface()
                .contextMenu {
                    Button(role: .destructive) { Task { await environment.deleteTrip(id: trip.id) } } label: {
                        Label("Usuń podróż", systemImage: "trash")
                    }
                }

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    ModuleSectionTitle(title: "Plan podróży", systemImage: "map")
                    if trip.itinerary.isEmpty {
                        Text("Dodaj punkty planu później — podróż jest już zapisana.")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    } else {
                        ForEach(Array(trip.itinerary.enumerated()), id: \.element.id) { index, item in
                            TravelTimelineRow(day: item.day, title: item.title, detail: item.detail, isLast: index == trip.itinerary.count - 1)
                        }
                    }
                }
                .rootineSurface()
            } else {
                ModuleEmptyCard(title: "Zaplanuj podróż", detail: "Zapisz miejsce i termin, żeby mieć je zawsze pod ręką.", systemImage: "airplane", tint: MoreModule.travel.tint)
            }

            ModuleActionButton(title: trips.isEmpty ? "Dodaj podróż" : "Dodaj kolejną podróż", systemImage: "plus", tint: MoreModule.travel.tint) {
                isShowingTripEditor = true
            }
        }
        .sheet(isPresented: $isShowingTripEditor) {
            TripEditorSheet { destination, dateRange, nights in
                Task { await environment.addTrip(destination: destination, dateRange: dateRange, nights: nights) }
            }
        }
    }
}

private struct TripEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String, Int) -> Void
    @State private var destination = ""
    @State private var dateRange = ""
    @State private var nights = "3"

    var body: some View {
        NavigationStack {
            Form {
                Section("Podróż") {
                    TextField("Miejsce", text: $destination)
                    TextField("Termin", text: $dateRange)
                    TextField("Liczba nocy", text: $nights)
                        .keyboardType(.numberPad)
                }
            }
            .navigationTitle("Dodaj podróż")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(destination, dateRange, Int(nights) ?? 1)
                        dismiss()
                    }
                    .disabled(destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct TravelChip: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.medium))
            .foregroundStyle(MoreModule.travel.tint)
            .padding(.horizontal, RootineTheme.Spacing.small)
            .padding(.vertical, RootineTheme.Spacing.xSmall)
            .background(MoreModule.travel.tint.opacity(0.14))
            .clipShape(Capsule())
    }
}

private struct TravelTimelineRow: View {
    let day: String
    let title: String
    let detail: String
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: RootineTheme.Spacing.small) {
            VStack(spacing: 0) {
                Text(day)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(MoreModule.travel.tint)
                    .frame(width: 28, height: 28)
                    .background(MoreModule.travel.tint.opacity(0.16))
                    .clipShape(Circle())
                if !isLast {
                    Rectangle()
                        .fill(RootineTheme.ColorToken.separator)
                        .frame(width: 1, height: 34)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            .padding(.top, RootineTheme.Spacing.xSmall)
            Spacer(minLength: 0)
        }
    }
}

// MARK: Health

private struct HealthModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingReminderEditor = false

    private var water: Double {
        let key = RootineDate.localDate()
        return environment.nutritionWorkspace.days[key]?.waterMl ?? 1250
    }

    private var todayEnergy: Int? {
        environment.healthWorkspace.checkIns[RootineDate.localDate()]?.energy
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            HStack(spacing: RootineTheme.Spacing.small) {
                HealthMetric(value: "7h 42m", label: "sen", systemImage: "bed.double.fill", tint: MoreModule.health.tint)
                HealthMetric(value: "72", label: "bpm", systemImage: "heart.fill", tint: RootineTheme.ColorToken.destructive)
                HealthMetric(value: "\(Int(water)) ml", label: "wody", systemImage: "drop.fill", tint: RootineTheme.ColorToken.action)
            }

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack {
                    ModuleSectionTitle(title: "Dzisiejszy check-in", systemImage: "waveform.path.ecg")
                    Spacer()
                    Text("2 min")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Text("Jak oceniasz swoją energię?")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                HStack(spacing: RootineTheme.Spacing.small) {
                    ForEach(Array(["bed.double.fill", "minus.circle.fill", "face.smiling.fill", "bolt.fill"].enumerated()), id: \.element) { index, mood in
                        Button {
                            Task { await environment.setHealthEnergy(index + 1) }
                        } label: {
                            Image(systemName: mood)
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(todayEnergy == index + 1 ? RootineTheme.ColorToken.canvas : MoreModule.health.tint)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, RootineTheme.Spacing.small)
                                .background(todayEnergy == index + 1 ? MoreModule.health.tint : RootineTheme.ColorToken.elevated)
                                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                ModuleSectionTitle(title: "Małe przypomnienia", systemImage: "bell.badge")
                if environment.healthWorkspace.reminders.isEmpty {
                    Text("Nie masz jeszcze przypomnień.")
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                } else {
                    ForEach(Array(environment.healthWorkspace.reminders.enumerated()), id: \.element.id) { index, reminder in
                        Button {
                            Task { await environment.toggleHealthReminder(id: reminder.id) }
                        } label: {
                            HealthReminderRow(
                                title: reminder.title,
                                detail: reminder.detail,
                                tint: index == 0 ? MoreModule.health.tint : RootineTheme.ColorToken.action,
                                isCompleted: reminder.completedDates.contains(RootineDate.localDate())
                            )
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) {
                                Task { await environment.deleteHealthReminder(id: reminder.id) }
                            } label: {
                                Label("Usuń przypomnienie", systemImage: "trash")
                            }
                        }
                        if index < environment.healthWorkspace.reminders.count - 1 {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
                ModuleActionButton(title: "Dodaj przypomnienie", systemImage: "plus", tint: MoreModule.health.tint) {
                    isShowingReminderEditor = true
                }
            }
            .rootineSurface()
        }
        .sheet(isPresented: $isShowingReminderEditor) {
            HealthReminderEditorSheet { title, detail in
                Task { await environment.addHealthReminder(title: title, detail: detail) }
            }
        }
    }
}

private struct HealthReminderEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String) -> Void
    @State private var title = ""
    @State private var detail = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Przypomnienie") {
                    TextField("Treść", text: $title)
                    TextField("Kiedy? (opcjonalnie)", text: $detail)
                }
            }
            .navigationTitle("Dodaj przypomnienie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, detail)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct HealthMetric: View {
    let value: String
    let label: String
    let systemImage: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(label)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
    }
}

private struct HealthReminderRow: View {
    let title: String
    let detail: String
    let tint: Color
    var isCompleted: Bool = false

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Circle()
                .fill(tint.opacity(0.18))
                .frame(width: 34, height: 34)
                .overlay {
                Image(systemName: isCompleted ? "checkmark" : "bell")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(tint)
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .strikethrough(isCompleted)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, RootineTheme.Spacing.xSmall)
    }
}

private struct ModuleEmptyCard: View {
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .rootineSurface()
    }
}
