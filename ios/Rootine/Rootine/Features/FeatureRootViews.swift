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

            Text("Natywne ekrany Rootine są gotowe do ręcznego przeglądu.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.success)
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
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                ModuleSyncStatusBanner()
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
                case .affairs:
                    AffairsModuleContent()
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

private struct ModuleSyncStatusBanner: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            if case .conflict = environment.workspaceSyncStatus {
                RootineErrorState(
                    title: "Konflikt synchronizacji",
                    message: "Zmiany w tym module są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                    onRetry: { Task { await environment.flushPendingMutations() } }
                )
            } else if case .localOnly(let pending) = environment.workspaceSyncStatus {
                RootineOfflineBanner(message: offlineMessage(pending: pending))
            }
        }
    }

    private func offlineMessage(pending: Int) -> String {
        switch pending {
        case 1: return "Tryb offline · 1 zmiana czeka na synchronizację"
        case 2...4: return "Tryb offline · \(pending) zmiany czekają na synchronizację"
        case 5...: return "Tryb offline · \(pending) zmian czeka na synchronizację"
        default: return "Tryb offline · zmiany zapisują się na tym iPhonie"
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
        .frame(minHeight: 48)
        .accessibilityHint("Otwiera formularz dodawania")
    }
}

// MARK: Notes

private struct NotesModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var editorTarget: NoteEditorTarget?
    @State private var searchText = ""
    @State private var showingArchive = false
    @State private var noteToDelete: NoteRecord?
    @State private var deletedNote: NoteRecord?

    private var notes: [NoteRecord] {
        environment.notesWorkspace.notes
            .filter { showingArchive ? $0.archived : !$0.archived }
            .filter { note in
                let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !query.isEmpty else { return true }
                return note.title.localizedCaseInsensitiveContains(query)
                    || note.body.localizedCaseInsensitiveContains(query)
                    || note.tags.contains(where: { $0.localizedCaseInsensitiveContains(query) })
            }
            .sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned }
                return lhs.updatedAt > rhs.updatedAt
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            HStack(spacing: RootineTheme.Spacing.small) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                TextField("Szukaj notatek lub tagów", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel("Szukaj notatek lub tagów")
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Wyczyść wyszukiwanie")
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.small)
            .background(RootineTheme.ColorToken.elevated)
            .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))

            HStack {
                Label(showingArchive ? "Archiwum" : "Aktywne", systemImage: showingArchive ? "archivebox.fill" : "note.text")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button(showingArchive ? "Pokaż aktywne" : "Pokaż archiwum") {
                    showingArchive.toggle()
                }
                .buttonStyle(.bordered)
                .frame(minHeight: 44)
                .accessibilityHint("Przełącza listę aktywnych i zarchiwizowanych notatek")
            }

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
                        ForEach(Array(notes.enumerated()), id: \.element.id) { index, note in
                            Button { editorTarget = NoteEditorTarget(note: note) } label: {
                                NoteListRow(note: note)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                noteActions(for: note)
                                Button(role: .destructive) {
                                    requestDelete(note)
                                } label: {
                                    Label("Usuń", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    requestDelete(note)
                                } label: {
                                    Label("Usuń", systemImage: "trash")
                                }
                                if showingArchive {
                                    Button {
                                        restore(note)
                                    } label: {
                                        Label("Przywróć", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(RootineTheme.ColorToken.success)
                                } else {
                                    Button {
                                        Task { await environment.archiveNote(id: note.id) }
                                    } label: {
                                        Label("Archiwizuj", systemImage: "archivebox")
                                    }
                                    .tint(MoreModule.notes.tint)
                                }
                            }
                            if index < notes.count - 1 {
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
                requestDelete(note)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć notatkę?",
            isPresented: Binding(
                get: { noteToDelete != nil },
                set: { isPresented in
                    if !isPresented { noteToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let noteToDelete {
                Button("Usuń notatkę", role: .destructive) {
                    delete(noteToDelete)
                    self.noteToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedNote {
                RootineUndoBanner(message: "Usunięto notatkę") {
                    let note = deletedNote
                    self.deletedNote = nil
                    Task { await environment.upsertNote(note) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    @ViewBuilder
    private func noteActions(for note: NoteRecord) -> some View {
        Button {
            Task { await environment.toggleNotePinned(id: note.id) }
        } label: {
            Label(note.pinned ? "Odepnij" : "Przypnij", systemImage: note.pinned ? "pin.slash" : "pin")
        }
        if showingArchive {
            Button { restore(note) } label: {
                Label("Przywróć", systemImage: "arrow.uturn.backward")
            }
        } else {
            Button {
                Task { await environment.archiveNote(id: note.id) }
            } label: {
                Label("Archiwizuj", systemImage: "archivebox")
            }
        }
    }

    private func restore(_ note: NoteRecord) {
        var restored = note
        restored.archived = false
        Task { await environment.upsertNote(restored) }
    }

    private func delete(_ note: NoteRecord) {
        deletedNote = note
        Task { await environment.deleteNote(id: note.id) }
    }

    private func requestDelete(_ note: NoteRecord) {
        noteToDelete = note
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
        .frame(minHeight: 72, alignment: .leading)
        .rootineSurface()
        .accessibilityElement(children: .combine)
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
        .frame(minHeight: 52)
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
    @State private var selectedWorkout: SportWorkout?
    @State private var editingWorkout: SportWorkout?
    @State private var workoutToDelete: SportWorkout?
    @State private var deletedWorkout: SportWorkout?
    private let weekdays = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]

    private var workouts: [SportWorkout] {
        environment.sportWorkspace.workouts.sorted { $0.date > $1.date }
    }

    private var weekRange: (Date, Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let mondayOffset = (calendar.component(.weekday, from: today) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -mondayOffset, to: today) ?? today
        let sunday = calendar.date(byAdding: .day, value: 7, to: monday) ?? today
        return (monday, sunday)
    }

    private var weekWorkouts: [SportWorkout] {
        let (monday, sunday) = weekRange
        return workouts.filter { workout in
            guard let date = rootineDate(from: workout.date) else { return false }
            return date >= monday && date < sunday
        }
    }

    private var weekTotalMinutes: Int { weekWorkouts.reduce(0) { $0 + $1.minutes } }
    private var weekCompletedWorkouts: Int { weekWorkouts.filter(\.completed).count }
    private var weekAverageMinutes: Int {
        guard !weekWorkouts.isEmpty else { return 0 }
        return Int((Double(weekTotalMinutes) / Double(weekWorkouts.count)).rounded())
    }

    private var upcomingWorkouts: [SportWorkout] {
        let today = RootineDate.localDate()
        return workouts
            .filter { !$0.completed && $0.date >= today }
            .sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }

    private var chartMinutes: [Int] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        // Calendar.weekday is Sunday-first; convert it to a Monday-first offset
        // so the chart labels and bars always line up in Polish locales.
        let mondayOffset = (calendar.component(.weekday, from: today) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -mondayOffset, to: today) ?? today
        return (0..<7).map { offset in
            let date = calendar.date(byAdding: .day, value: offset, to: monday) ?? monday
            let key = RootineDate.localDate(date)
            return min(120, weekWorkouts.filter { $0.date == key }.reduce(0) { $0 + $1.minutes })
        }
    }

    private var chartScale: CGFloat {
        CGFloat(max(60, chartMinutes.max() ?? 0))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack {
                    ModuleSectionTitle(title: "Ten tydzień", systemImage: "chart.bar.fill")
                    Spacer()
                    Text("\(weekTotalMinutes) min")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(MoreModule.sport.tint)
                }

                HStack(alignment: .bottom, spacing: RootineTheme.Spacing.small) {
                    ForEach(weekdays.indices, id: \.self) { index in
                        VStack(spacing: RootineTheme.Spacing.xSmall) {
                            GeometryReader { proxy in
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(chartMinutes[index] == 0 ? RootineTheme.ColorToken.elevated : MoreModule.sport.tint)
                                    .frame(height: max(10, proxy.size.height * CGFloat(chartMinutes[index]) / chartScale))
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
                SportMetric(value: "\(weekTotalMinutes)", label: "min aktywności", systemImage: "timer")
                SportMetric(value: "\(weekCompletedWorkouts)", label: "ukończone", systemImage: "checkmark.circle")
                SportMetric(value: weekWorkouts.isEmpty ? "—" : "\(weekAverageMinutes) min", label: "średnio / trening", systemImage: "chart.bar.xaxis")
            }

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                ModuleSectionTitle(title: "Następny trening", systemImage: "calendar.badge.clock")
                if upcomingWorkouts.isEmpty {
                    ModuleEmptyCard(title: "Zaplanuj kolejny trening", detail: "Dodaj aktywność i obserwuj regularność.", systemImage: "figure.run", tint: MoreModule.sport.tint)
                } else {
                    ForEach(upcomingWorkouts) { workout in
                        SportWorkoutRow(
                            workout: workout,
                            onSelect: { selectedWorkout = workout },
                            onToggle: { Task { await environment.toggleWorkoutCompleted(id: workout.id) } },
                            onEdit: { editingWorkout = workout },
                            onDelete: { requestDelete(workout) }
                        )
                        if workout.id != upcomingWorkouts.last?.id {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
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
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedWorkout) { workout in
            WorkoutDetailSheet(
                workout: workout,
                onEdit: { editingWorkout = workout },
                onDelete: { requestDelete(workout) }
            )
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingWorkout) { workout in
            WorkoutEditorSheet(existing: workout) { title, kind, minutes, date in
                Task { await environment.updateWorkout(id: workout.id, title: title, date: date, minutes: minutes, kind: kind) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć trening?",
            isPresented: Binding(
                get: { workoutToDelete != nil },
                set: { isPresented in
                    if !isPresented { workoutToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let workoutToDelete {
                Button("Usuń trening", role: .destructive) {
                    delete(workoutToDelete)
                    self.workoutToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedWorkout {
                RootineUndoBanner(message: "Usunięto trening \(deletedWorkout.title)") {
                    let workout = deletedWorkout
                    self.deletedWorkout = nil
                    Task { await environment.restoreWorkout(workout) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    private func delete(_ workout: SportWorkout) {
        deletedWorkout = workout
        Task { await environment.deleteWorkout(id: workout.id) }
    }

    private func requestDelete(_ workout: SportWorkout) {
        workoutToDelete = workout
    }
}

private struct SportWorkoutRow: View {
    let workout: SportWorkout
    let onSelect: () -> Void
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            ZStack {
                Circle().fill(MoreModule.sport.tint.opacity(0.18))
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                    .foregroundStyle(MoreModule.sport.tint)
            }
            .frame(width: 52, height: 52)

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.title)
                        .font(.headline)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(workout.kind) · \(workout.minutes) min · \(workout.date)")
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły treningu: \(workout.title)")
            .accessibilityHint("Otwiera szczegóły, edycję i usuwanie")

            Button(action: onToggle) {
                Image(systemName: workout.completed ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(workout.completed ? RootineTheme.ColorToken.success : MoreModule.sport.tint)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(workout.completed ? "Oznacz jako zaplanowany" : "Oznacz jako ukończony")
        }
        .contextMenu {
            Button(action: onEdit) { Label("Edytuj trening", systemImage: "pencil") }
            Button(role: .destructive, action: onDelete) { Label("Usuń trening", systemImage: "trash") }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) { Label("Usuń", systemImage: "trash") }
            Button(action: onEdit) { Label("Edytuj", systemImage: "pencil") }.tint(MoreModule.sport.tint)
        }
    }
}

private func rootineDate(from key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          String(format: "%04d-%02d-%02d", parts[0], parts[1], parts[2]) == key else { return nil }
    let calendar = Calendar.current
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
    guard let date = calendar.date(from: components) else { return nil }
    let normalized = calendar.dateComponents([.year, .month, .day], from: date)
    guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
    return date
}

private struct WorkoutEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: SportWorkout?
    let onSave: (String, String, Int, String) -> Void
    @State private var title: String
    @State private var kind: String
    @State private var minutes: String
    @State private var date: String

    init(existing: SportWorkout? = nil, onSave: @escaping (String, String, Int, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _kind = State(initialValue: existing?.kind ?? "Trening")
        _minutes = State(initialValue: String(existing?.minutes ?? 30))
        _date = State(initialValue: existing?.date ?? RootineDate.localDate())
    }

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
            .navigationTitle(existing == nil ? "Zaplanuj trening" : "Edytuj trening")
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
    }
}

private struct WorkoutDetailSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let workout: SportWorkout
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                Label(workout.title, systemImage: "figure.run")
                    .font(.title2.weight(.bold))
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    detailRow("Rodzaj", value: workout.kind)
                    detailRow("Data", value: workout.date)
                    detailRow("Czas", value: "\(workout.minutes) min")
                    detailRow("Status", value: workout.completed ? "Ukończony" : "Zaplanowany")
                }
                RootinePrimaryButton(
                    workout.completed ? "Oznacz jako zaplanowany" : "Oznacz jako ukończony",
                    systemImage: workout.completed ? "arrow.uturn.backward" : "checkmark"
                ) {
                    Task {
                        await environment.toggleWorkoutCompleted(id: workout.id)
                        dismiss()
                    }
                }
                RootineSecondaryButton("Edytuj trening", systemImage: "pencil") {
                    onEdit()
                    dismiss()
                }
                Button("Usuń trening", role: .destructive) { showDeleteConfirmation = true }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .padding(RootineTheme.Spacing.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RootineTheme.ColorToken.canvas)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .navigationTitle("Szczegóły treningu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
            }
            .confirmationDialog("Usunąć trening?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń trening", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }

    private func detailRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
        }
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
        .frame(minHeight: 72, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: Goals

private struct GoalsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingGoalEditor = false
    @State private var selectedGoal: GoalRecord?
    @State private var editingGoal: GoalRecord?
    @State private var goalToDelete: GoalRecord?
    @State private var deletedGoal: GoalRecord?

    private var goals: [GoalRecord] { environment.goalsWorkspace.goals }
    private var averageProgress: Double {
        guard !goals.isEmpty else { return 0 }
        return goals.reduce(0) { $0 + $1.progress } / Double(goals.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(goals.isEmpty ? "Ustal pierwszy cel" : "Dobry kierunek")
                            .font(.title3.weight(.semibold))
                        Text(goals.isEmpty ? "Mały cel pomaga utrzymać kierunek." : "Jeszcze jeden krok dziennie i utrzymasz tempo.")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    Spacer(minLength: RootineTheme.Spacing.small)
                    Text("\(Int(averageProgress * 100))%")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(MoreModule.goals.tint)
                }
                ProgressView(value: averageProgress)
                    .tint(MoreModule.goals.tint)
                    .accessibilityLabel("Średni postęp celów")
                    .accessibilityValue("\(Int(averageProgress * 100)) procent")
            }
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                ModuleSectionTitle(title: "Aktywne cele", systemImage: "target")
                if goals.isEmpty {
                    ModuleEmptyCard(title: "Zacznij od jednego celu", detail: "Wybierz mały, konkretny krok na dziś.", systemImage: "target", tint: MoreModule.goals.tint)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(goals.enumerated()), id: \.element.id) { index, goal in
                            GoalRow(goal: goal, onSelect: { selectedGoal = goal }) {
                                Task { await environment.advanceGoal(id: goal.id) }
                            }
                            .contextMenu {
                                Button { Task { await environment.advanceGoal(id: goal.id) } } label: {
                                    Label("Dodaj krok", systemImage: "plus.circle")
                                }
                                Button(role: .destructive) { requestDelete(goal) } label: {
                                    Label("Usuń cel", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    requestDelete(goal)
                                } label: {
                                    Label("Usuń", systemImage: "trash")
                                }
                                Button { editingGoal = goal } label: {
                                    Label("Edytuj", systemImage: "pencil")
                                }
                                .tint(MoreModule.goals.tint)
                            }
                            if index < goals.count - 1 {
                                Divider().overlay(RootineTheme.ColorToken.separator)
                            }
                        }
                    }
                    .rootineSurface()
                }
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
        .sheet(item: $selectedGoal) { goal in
            GoalDetailSheet(
                goal: goal,
                onEdit: { editingGoal = goal },
                onDelete: { requestDelete(goal) }
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingGoal) { goal in
            GoalEditorSheet(existing: goal) { title, detail, target, icon in
                Task { await environment.updateGoal(id: goal.id, title: title, detail: detail, target: target, icon: icon) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć cel?",
            isPresented: Binding(
                get: { goalToDelete != nil },
                set: { isPresented in
                    if !isPresented { goalToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let goalToDelete {
                Button("Usuń cel", role: .destructive) {
                    delete(goalToDelete)
                    self.goalToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedGoal {
                RootineUndoBanner(message: "Usunięto cel \(deletedGoal.title)") {
                    let goal = deletedGoal
                    self.deletedGoal = nil
                    Task { await environment.restoreGoal(goal) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    private func delete(_ goal: GoalRecord) {
        deletedGoal = goal
        Task { await environment.deleteGoal(id: goal.id) }
    }

    private func requestDelete(_ goal: GoalRecord) {
        goalToDelete = goal
    }
}

private struct GoalRow: View {
    let goal: GoalRecord
    let onSelect: () -> Void
    let onAdvance: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: goal.icon)
                .foregroundStyle(MoreModule.goals.tint)
                .frame(width: 26)
            Button(action: onSelect) {
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
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły celu: \(goal.title)")
            Button(action: onAdvance) {
                Image(systemName: "plus.circle.fill")
                    .foregroundStyle(MoreModule.goals.tint)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dodaj krok do celu \(goal.title)")
        }
        .padding(.vertical, RootineTheme.Spacing.small)
        .contentShape(Rectangle())
    }
}

private struct GoalEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: GoalRecord?
    let onSave: (String, String, Double, String) -> Void
    @State private var title: String
    @State private var detail: String
    @State private var target: String
    @State private var icon: String

    init(existing: GoalRecord? = nil, onSave: @escaping (String, String, Double, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _detail = State(initialValue: existing?.detail ?? "")
        _target = State(initialValue: String(existing?.target ?? 10))
        _icon = State(initialValue: existing?.icon ?? "target")
    }

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
            .navigationTitle(existing == nil ? "Dodaj cel" : "Edytuj cel")
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
    }
}

private struct GoalDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let goal: GoalRecord
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                Label(goal.title, systemImage: goal.icon)
                    .font(.title2.weight(.bold))
                Text(goal.detail.isEmpty ? "Bez dodatkowego opisu" : goal.detail)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                ProgressView(value: goal.progress)
                    .tint(MoreModule.goals.tint)
                    .accessibilityLabel("Postęp celu")
                    .accessibilityValue("\(Int(goal.progress * 100)) procent")
                Text("\(Int(goal.current.rounded())) z \(Int(goal.target.rounded())) kroków")
                    .font(.subheadline.weight(.semibold))
                RootineSecondaryButton("Edytuj cel", systemImage: "pencil") {
                    onEdit()
                    dismiss()
                }
                Button("Usuń cel", role: .destructive) { showDeleteConfirmation = true }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                Spacer()
            }
            .padding(RootineTheme.Spacing.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RootineTheme.ColorToken.canvas)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .navigationTitle("Szczegóły celu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } }
            }
            .confirmationDialog("Usunąć cel?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń cel", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }
}

// MARK: Work

private struct WorkModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingPriorityEditor = false
    @State private var editingPriority: WorkspaceTask?
    @State private var priorityToDelete: WorkspaceTask?
    @State private var deletedPriority: WorkspaceTask?

    private var workTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true && $0.source?.kind == "work" }
    }

    private var isFocusRunning: Bool { focusStartDate != nil }

    private var focusStartDate: Date? {
        guard let startedAt = environment.workWorkspace.activeFocusStartedAt else { return nil }
        return RootineDate.date(from: startedAt)
    }

    private var hasCorruptFocusSession: Bool {
        environment.workWorkspace.activeFocusStartedAt != nil && focusStartDate == nil
    }

    private func elapsedText(at date: Date) -> String {
        guard let start = focusStartDate else { return "—" }
        let elapsed = max(0, Int(date.timeIntervalSince(start)))
        return String(format: "%02d:%02d", elapsed / 60, elapsed % 60)
    }

    private func focusProgress(at date: Date) -> Double {
        guard let start = focusStartDate else { return 0 }
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
                if hasCorruptFocusSession {
                    Label("Sesja wymaga odzyskania", systemImage: "exclamationmark.triangle")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.warning)
                    Text("Nie udało się odczytać czasu rozpoczęcia. Wyczyść uszkodzony zapis, aby uruchomić nową sesję.")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Button("Wyczyść uszkodzoną sesję", role: .destructive) {
                        Task { await environment.resetFocusSession() }
                    }
                    .frame(minHeight: 44)
                } else if isFocusRunning {
                    TimelineView(.periodic(from: .now, by: 1)) { timeline in
                        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                            HStack(alignment: .lastTextBaseline) {
                                Text(elapsedText(at: timeline.date))
                                    .font(.largeTitle.weight(.bold))
                                    .monospacedDigit()
                                Text("min")
                                    .font(.subheadline)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }
                            ProgressView(value: focusProgress(at: timeline.date))
                                .tint(MoreModule.work.tint)
                        }
                    }
                } else {
                    HStack(alignment: .lastTextBaseline) {
                        Label("Brak aktywnej sesji", systemImage: "timer")
                            .font(.title3.weight(.semibold))
                        Text("Uruchom blok skupienia")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                if !hasCorruptFocusSession {
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
                    .frame(minHeight: 48)
                    .accessibilityHint(isFocusRunning ? "Kończy bieżącą sesję skupienia" : "Uruchamia 25 minut skupienia")
                }
            }
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    ModuleSectionTitle(title: "Priorytety", systemImage: "checklist")
                    Spacer()
                    Text("\(workTasks.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                if workTasks.isEmpty {
                    ModuleEmptyCard(title: "Dodaj pierwszy priorytet", detail: "Zapisane priorytety pojawią się tutaj — bez przykładowych danych.", systemImage: "checklist", tint: MoreModule.work.tint)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(workTasks.enumerated()), id: \.element.id) { index, task in
                            Button { editingPriority = task } label: {
                                HStack(spacing: RootineTheme.Spacing.small) {
                                    Image(systemName: task.done ? "checkmark.circle.fill" : index == 0 ? "circle.inset.filled" : "circle")
                                        .foregroundStyle(task.done ? RootineTheme.ColorToken.success : index == 0 ? MoreModule.work.tint : RootineTheme.ColorToken.secondaryText)
                                    Text(task.text)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                        .lineLimit(2)
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                }
                                .padding(.vertical, RootineTheme.Spacing.small)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Edytuj priorytet: \(task.text)")
                            .contextMenu {
                                Button { editingPriority = task } label: { Label("Edytuj", systemImage: "pencil") }
                                Button(role: .destructive) { requestDelete(task) } label: { Label("Usuń", systemImage: "trash") }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) { requestDelete(task) } label: { Label("Usuń", systemImage: "trash") }
                            }
                            if index < workTasks.count - 1 {
                                Divider().overlay(RootineTheme.ColorToken.separator)
                            }
                        }
                    }
                    .rootineSurface()
                }
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
        .sheet(item: $editingPriority) { task in
            WorkPriorityEditorSheet(existing: task, onSave: { title in
                Task { await environment.updateWorkPriority(id: task.id, text: title) }
            }, onDelete: {
                requestDelete(task)
            })
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć priorytet?",
            isPresented: Binding(
                get: { priorityToDelete != nil },
                set: { isPresented in
                    if !isPresented { priorityToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let priorityToDelete {
                Button("Usuń priorytet", role: .destructive) {
                    delete(priorityToDelete)
                    self.priorityToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedPriority {
                RootineUndoBanner(message: "Usunięto priorytet") {
                    let task = deletedPriority
                    self.deletedPriority = nil
                    Task { await environment.restoreWorkPriority(task) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    private func delete(_ task: WorkspaceTask) {
        deletedPriority = task
        Task { await environment.deleteTask(id: task.id) }
    }

    private func requestDelete(_ task: WorkspaceTask) {
        priorityToDelete = task
    }
}

private struct WorkPriorityEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: WorkspaceTask?
    let onSave: (String) -> Void
    let onDelete: (() -> Void)?
    @State private var title: String

    init(existing: WorkspaceTask? = nil, onSave: @escaping (String) -> Void, onDelete: (() -> Void)? = nil) {
        self.existing = existing
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: existing?.text ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Priorytet") {
                    TextField("Co jest najważniejsze?", text: $title, axis: .vertical)
                        .lineLimit(2...4)
                }
                if existing != nil, let onDelete {
                    Section {
                        Button("Usuń priorytet", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "Dodaj priorytet" : "Edytuj priorytet")
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
    }
}

// MARK: Travel

private struct TravelModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingTripEditor = false
    @State private var selectedTrip: TravelRecord?
    @State private var editingTrip: TravelRecord?
    @State private var deletedTrip: TravelRecord?
    @State private var tripToDelete: TravelRecord?

    private var trips: [TravelRecord] { environment.travelWorkspace.trips }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            if trips.isEmpty {
                ModuleEmptyCard(title: "Zaplanuj podróż", detail: "Zapisz miejsce i termin, żeby mieć je zawsze pod ręką.", systemImage: "airplane", tint: MoreModule.travel.tint)
            } else {
                ForEach(trips) { trip in
                    TravelTripCard(
                        trip: trip,
                        onDelete: { tripToDelete = trip },
                        onEdit: { editingTrip = trip },
                        onSelect: { selectedTrip = trip }
                    )
                }
            }

            ModuleActionButton(title: trips.isEmpty ? "Dodaj podróż" : "Dodaj kolejną podróż", systemImage: "plus", tint: MoreModule.travel.tint) {
                isShowingTripEditor = true
            }
        }
        .sheet(isPresented: $isShowingTripEditor) {
            TripEditorSheet { destination, dateRange, nights in
                Task { await environment.addTrip(destination: destination, dateRange: dateRange, nights: nights) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingTrip) { trip in
            TripEditorSheet(existing: trip) { destination, dateRange, nights in
                Task { await environment.updateTrip(id: trip.id, destination: destination, dateRange: dateRange, nights: nights) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedTrip) { trip in
            TravelDetailSheet(
                trip: trip,
                onEdit: { editingTrip = trip },
                onDelete: {
                    selectedTrip = nil
                    delete(trip)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć podróż?",
            isPresented: Binding(
                get: { tripToDelete != nil },
                set: { isPresented in
                    if !isPresented { tripToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let tripToDelete {
                Button("Usuń podróż", role: .destructive) {
                    delete(tripToDelete)
                    self.tripToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedTrip {
                RootineUndoBanner(message: "Usunięto podróż do \(deletedTrip.destination)") {
                    let trip = deletedTrip
                    self.deletedTrip = nil
                    Task { await environment.restoreTrip(trip) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    private func delete(_ trip: TravelRecord) {
        deletedTrip = trip
        Task { await environment.deleteTrip(id: trip.id) }
    }
}

private struct TravelTripCard: View {
    let trip: TravelRecord
    let onDelete: () -> Void
    let onEdit: () -> Void
    let onSelect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text(trip.destination)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text("\(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange) · \(trip.nights) nocy")
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Spacer(minLength: RootineTheme.Spacing.small)
                Image(systemName: "water.waves.and.moon")
                    .font(.title)
                    .foregroundStyle(MoreModule.travel.tint)
                    .accessibilityHidden(true)
            }
            HStack(spacing: RootineTheme.Spacing.small) {
                TravelChip(title: "Plan", systemImage: "checklist")
                TravelChip(title: "\(trip.itinerary.count) punktów", systemImage: "map")
                Spacer()
                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Usuń podróż \(trip.destination)")
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(MoreModule.travel.tint)
                .accessibilityLabel("Edytuj podróż \(trip.destination)")
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

            Button(action: onSelect) {
                Label("Otwórz szczegóły", systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(MoreModule.travel.tint)
            .accessibilityHint("Pokazuje pełny plan podróży i dostępne akcje")
        }
        .rootineSurface()
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("Usuń podróż", systemImage: "trash")
            }
        }
    }
}

private struct TravelDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let trip: TravelRecord
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Label(trip.destination, systemImage: "airplane")
                            .font(.title2.weight(.bold))
                        Text(trip.dateRange.isEmpty ? "Termin do ustalenia" : trip.dateRange)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }

                    HStack(spacing: RootineTheme.Spacing.small) {
                        TravelChip(title: "\(trip.nights) nocy", systemImage: "moon.stars")
                        TravelChip(title: "\(trip.itinerary.count) punktów", systemImage: "map")
                    }

                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                        ModuleSectionTitle(title: "Plan podróży", systemImage: "map")
                        if trip.itinerary.isEmpty {
                            ModuleEmptyCard(
                                title: "Plan pojawi się tutaj",
                                detail: "Podróż jest zapisana. Dodaj punkty planu, gdy będziesz gotowy.",
                                systemImage: "map",
                                tint: MoreModule.travel.tint
                            )
                        } else {
                            ForEach(Array(trip.itinerary.enumerated()), id: \.element.id) { index, item in
                                TravelTimelineRow(
                                    day: item.day,
                                    title: item.title,
                                    detail: item.detail,
                                    isLast: index == trip.itinerary.count - 1
                                )
                            }
                        }
                    }

                    RootineSecondaryButton("Edytuj podróż", systemImage: "pencil") {
                        onEdit()
                        dismiss()
                    }
                    Button("Usuń podróż", role: .destructive) { showDeleteConfirmation = true }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .padding(RootineTheme.Spacing.large)
            }
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły podróży")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
            }
            .confirmationDialog("Usunąć podróż?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń podróż", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }
}

private struct TripEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: TravelRecord?
    let onSave: (String, String, Int) -> Void
    @State private var destination: String
    @State private var dateRange: String
    @State private var nights: String

    init(existing: TravelRecord? = nil, onSave: @escaping (String, String, Int) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _destination = State(initialValue: existing?.destination ?? "")
        _dateRange = State(initialValue: existing?.dateRange ?? "")
        _nights = State(initialValue: String(existing?.nights ?? 3))
    }

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
            .navigationTitle(existing == nil ? "Dodaj podróż" : "Edytuj podróż")
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
    @State private var selectedReminder: HealthReminder?
    @State private var editingReminder: HealthReminder?
    @State private var reminderToDelete: HealthReminder?
    @State private var deletedReminder: HealthReminder?
    @State private var editingCheckIn: HealthCheckIn?
    @State private var checkInToDelete: HealthCheckIn?
    @State private var deletedCheckIn: HealthCheckIn?

    private var water: Double {
        let key = RootineDate.localDate()
        return environment.nutritionWorkspace.days[key]?.waterMl ?? 0
    }

    private var todayEnergy: Int? {
        environment.healthWorkspace.checkIns[RootineDate.localDate()]?.energy
    }

    private var todayEnergyLabel: String {
        guard let energy = todayEnergy else { return "Nieuzupełnione" }
        return "\(energy)/4"
    }

    private var todayCheckIn: HealthCheckIn? {
        environment.healthWorkspace.checkIns[RootineDate.localDate()]
    }

    private var checkInHistory: [HealthCheckIn] {
        environment.healthWorkspace.checkInHistory(limit: 7)
    }

    private var healthMetrics: HealthMetrics {
        environment.healthWorkspace.metrics(historyDays: 7)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            HStack(spacing: RootineTheme.Spacing.small) {
                HealthMetric(value: todayEnergyLabel, label: "energia", systemImage: "bolt.fill", tint: MoreModule.health.tint)
                HealthMetric(value: "\(Int(water)) ml", label: "wody", systemImage: "drop.fill", tint: RootineTheme.ColorToken.action)
                HealthMetric(value: "\(environment.healthWorkspace.reminders.count)", label: "przypomnienia", systemImage: "bell.badge.fill", tint: RootineTheme.ColorToken.warning)
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
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .padding(.vertical, RootineTheme.Spacing.small)
                                .background(todayEnergy == index + 1 ? MoreModule.health.tint : RootineTheme.ColorToken.elevated)
                                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Energia: \(index + 1) z 4")
                        .accessibilityValue(todayEnergy == index + 1 ? "Wybrano" : "Niewybrano")
                        .accessibilityAddTraits(todayEnergy == index + 1 ? [.isSelected] : [])
                    }
                }
                if let note = todayCheckIn?.note, !note.isEmpty {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                RootineSecondaryButton("Edytuj notatkę check-inu", systemImage: "pencil") {
                    let key = RootineDate.localDate()
                    editingCheckIn = todayCheckIn
                        ?? HealthCheckIn(date: key, energy: todayEnergy ?? 3, note: nil, updatedAt: RootineDate.isoTimestamp())
                }
            }
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                HStack {
                    ModuleSectionTitle(title: "Historia check-inów", systemImage: "clock.arrow.circlepath")
                    Spacer()
                    if let average = healthMetrics.averageEnergy {
                        Text("Średnia 7 dni: \(average, specifier: "%.1f")/4")
                            .font(.caption)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                if checkInHistory.isEmpty {
                    ModuleEmptyCard(
                        title: "Brak historii energii",
                        detail: "Uzupełnij pierwszy check-in, aby zobaczyć rytm z ostatnich dni.",
                        systemImage: "waveform.path.ecg",
                        tint: MoreModule.health.tint
                    )
                } else {
                    ForEach(checkInHistory) { checkIn in
                        Button {
                            editingCheckIn = checkIn
                        } label: {
                            HStack(spacing: RootineTheme.Spacing.small) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(checkIn.date)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                    Text(checkIn.note?.isEmpty == false ? checkIn.note! : "Bez notatki")
                                        .font(.caption)
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                        .lineLimit(1)
                                }
                                Spacer()
                                Text("\(checkIn.energy)/4")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(MoreModule.health.tint)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button(role: .destructive) {
                                checkInToDelete = checkIn
                            } label: {
                                Label("Usuń check-in", systemImage: "trash")
                            }
                        }
                        if checkIn.id != checkInHistory.last?.id {
                            Divider().overlay(RootineTheme.ColorToken.separator)
                        }
                    }
                }
            }
            .rootineSurface()

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                ModuleSectionTitle(title: "Małe przypomnienia", systemImage: "bell.badge")
                if environment.healthWorkspace.reminders.isEmpty {
                    ModuleEmptyCard(title: "Ustaw jedno przypomnienie", detail: "Krótki sygnał pomaga wrócić do dobrego rytmu.", systemImage: "bell.badge", tint: MoreModule.health.tint)
                } else {
                    ForEach(Array(environment.healthWorkspace.reminders.enumerated()), id: \.element.id) { index, reminder in
                        HealthReminderRow(
                            title: reminder.title,
                            detail: reminder.detail,
                            tint: index == 0 ? MoreModule.health.tint : RootineTheme.ColorToken.action,
                            isCompleted: reminder.completedDates.contains(RootineDate.localDate()),
                            onToggle: { Task { await environment.toggleHealthReminder(id: reminder.id) } },
                            onSelect: { selectedReminder = reminder }
                        )
                        .frame(minHeight: 52)
                        .contextMenu {
                            Button { selectedReminder = reminder } label: {
                                Label("Szczegóły przypomnienia", systemImage: "info.circle")
                            }
                            Button { editingReminder = reminder } label: {
                                Label("Edytuj przypomnienie", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                requestDelete(reminder)
                            } label: {
                                Label("Usuń przypomnienie", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                requestDelete(reminder)
                            } label: {
                                Label("Usuń", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                            Button { editingReminder = reminder } label: {
                                Label("Edytuj", systemImage: "pencil")
                            }
                            .tint(MoreModule.health.tint)
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
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingReminder) { reminder in
            HealthReminderEditorSheet(existing: reminder) { title, detail in
                Task { await environment.updateHealthReminder(id: reminder.id, title: title, detail: detail) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingCheckIn) { checkIn in
            HealthCheckInEditorSheet(existing: checkIn) { energy, note in
                Task { await environment.updateHealthCheckIn(date: checkIn.date, energy: energy, note: note) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedReminder) { reminder in
            HealthReminderDetailSheet(
                reminder: reminder,
                isCompleted: reminder.completedDates.contains(RootineDate.localDate()),
                onToggle: {
                    Task { await environment.toggleHealthReminder(id: reminder.id) }
                },
                onEdit: {
                    selectedReminder = nil
                    editingReminder = reminder
                },
                onDelete: {
                    selectedReminder = nil
                    requestDelete(reminder)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć przypomnienie?",
            isPresented: Binding(
                get: { reminderToDelete != nil },
                set: { isPresented in
                    if !isPresented { reminderToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let reminderToDelete {
                Button("Usuń przypomnienie", role: .destructive) {
                    delete(reminderToDelete)
                    self.reminderToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .confirmationDialog(
            "Usunąć check-in?",
            isPresented: Binding(
                get: { checkInToDelete != nil },
                set: { isPresented in
                    if !isPresented { checkInToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let checkInToDelete {
                Button("Usuń check-in", role: .destructive) {
                    delete(checkInToDelete)
                    self.checkInToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: RootineTheme.Spacing.xSmall) {
                if let deletedReminder {
                    RootineUndoBanner(message: "Usunięto przypomnienie") {
                        let reminder = deletedReminder
                        self.deletedReminder = nil
                        Task { await environment.restoreHealthReminder(reminder) }
                    }
                }
                if let deletedCheckIn {
                    RootineUndoBanner(message: "Usunięto check-in") {
                        let checkIn = deletedCheckIn
                        self.deletedCheckIn = nil
                        Task { await environment.restoreHealthCheckIn(checkIn) }
                    }
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.small)
        }
    }

    private func requestDelete(_ reminder: HealthReminder) {
        reminderToDelete = reminder
    }

    private func delete(_ reminder: HealthReminder) {
        deletedReminder = reminder
        Task { await environment.deleteHealthReminder(id: reminder.id) }
    }

    private func delete(_ checkIn: HealthCheckIn) {
        deletedCheckIn = checkIn
        Task { await environment.deleteHealthCheckIn(date: checkIn.date) }
    }
}

private struct HealthReminderDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let reminder: HealthReminder
    let isCompleted: Bool
    let onToggle: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    Label(reminder.title, systemImage: isCompleted ? "checkmark.circle.fill" : "bell.badge")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(reminder.detail.isEmpty ? "Bez dodatkowej informacji" : reminder.detail)
                        .font(.body)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    HStack(spacing: RootineTheme.Spacing.small) {
                        Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(isCompleted ? RootineTheme.ColorToken.success : MoreModule.health.tint)
                        Text(isCompleted ? "Ukończone dzisiaj" : "Do zrobienia dzisiaj")
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityElement(children: .combine)

                    RootinePrimaryButton(
                        isCompleted ? "Oznacz jako nieukończone" : "Oznacz jako ukończone",
                        systemImage: isCompleted ? "arrow.uturn.backward" : "checkmark"
                    ) {
                        onToggle()
                        dismiss()
                    }
                    RootineSecondaryButton("Edytuj przypomnienie", systemImage: "pencil") {
                        onEdit()
                        dismiss()
                    }
                    Button("Usuń przypomnienie", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .padding(RootineTheme.Spacing.large)
            }
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Szczegóły przypomnienia")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
            }
            .confirmationDialog("Usunąć przypomnienie?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Usuń przypomnienie", role: .destructive) {
                    onDelete()
                    dismiss()
                }
                Button("Anuluj", role: .cancel) {}
            }
        }
    }
}

private struct HealthReminderEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: HealthReminder?
    let onSave: (String, String) -> Void
    @State private var title: String
    @State private var detail: String

    init(existing: HealthReminder? = nil, onSave: @escaping (String, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _detail = State(initialValue: existing?.detail ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Przypomnienie") {
                    TextField("Treść", text: $title)
                    TextField("Kiedy? (opcjonalnie)", text: $detail)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj przypomnienie" : "Edytuj przypomnienie")
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
    }
}

private struct HealthCheckInEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: HealthCheckIn
    let onSave: (Int, String?) -> Void
    @State private var energy: Int
    @State private var note: String

    init(existing: HealthCheckIn, onSave: @escaping (Int, String?) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _energy = State(initialValue: existing.energy)
        _note = State(initialValue: existing.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Energia") {
                    Picker("Poziom energii", selection: $energy) {
                        ForEach(1...4, id: \.self) { value in
                            Text("\(value) z 4").tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Notatka") {
                    TextField("Opcjonalnie", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle("Edytuj check-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(energy, note)
                        dismiss()
                    }
                }
            }
        }
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
        .frame(minHeight: 72, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

private struct HealthReminderRow: View {
    let title: String
    let detail: String
    let tint: Color
    let isCompleted: Bool
    let onToggle: () -> Void
    let onSelect: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Circle()
                    .fill(tint.opacity(0.18))
                    .frame(width: 36, height: 36)
                    .overlay {
                        Image(systemName: isCompleted ? "checkmark" : "bell")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isCompleted ? "Oznacz przypomnienie jako nieukończone" : "Oznacz przypomnienie jako ukończone")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .strikethrough(isCompleted)
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text(detail.isEmpty ? "Bez dodatkowej informacji" : detail)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły przypomnienia: \(title)")

            Button(action: onSelect) {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Otwórz szczegóły przypomnienia: \(title)")
        }
        .padding(.vertical, RootineTheme.Spacing.xSmall)
        .frame(minHeight: 52)
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
        .frame(minHeight: 72, alignment: .leading)
        .rootineSurface()
        .accessibilityElement(children: .combine)
    }
}

// MARK: Pozostałe / Sprawy

private struct AffairsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var view: AffairsModuleView = .overview
    @State private var showingMatterEditor = false
    @State private var selectedMatter: AffairMatter?
    @State private var matterToDelete: AffairMatter?
    @State private var deletedMatter: AffairMatter?

    private var activeMatters: [AffairMatter] {
        environment.affairsWorkspace.matters
            .filter { $0.status != "done" }
            .sorted { lhs, rhs in
                if lhs.priority != rhs.priority { return lhs.priority == "high" }
                return lhs.dueDate < rhs.dueDate
            }
    }

    private var upcomingPayments: [AffairRecurringPayment] {
        environment.affairsWorkspace.payments
            .filter(\.active)
            .sorted { $0.nextDueDate < $1.nextDueDate }
    }

    private var openDocuments: [AffairDocument] {
        environment.affairsWorkspace.documents.sorted { $0.expiresAt < $1.expiresAt }
    }

    private var vehicleItems: [AffairVehicleItem] {
        environment.affairsWorkspace.vehicleItems
            .filter { !$0.done }
            .sorted { $0.dueDate < $1.dueDate }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            HStack(spacing: RootineTheme.Spacing.small) {
                AffairsMetric(value: activeMatters.count, label: "otwarte sprawy", tint: MoreModule.affairs.tint)
                AffairsMetric(value: upcomingPayments.count, label: "płatności", tint: RootineTheme.ColorToken.warning)
                AffairsMetric(value: openDocuments.count, label: "dokumenty", tint: RootineTheme.ColorToken.action)
            }

            Picker("Widok spraw", selection: $view) {
                ForEach(AffairsModuleView.allCases) { option in
                    Text(option.title).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Widok modułu Pozostałe")

            switch view {
            case .overview:
                overview
            case .matters:
                matters
            case .finances:
                finances
            case .documents:
                documents
            case .vehicles:
                vehicles
            }
        }
        .sheet(isPresented: $showingMatterEditor) {
            AffairEditorSheet(matter: nil) { draft in
                Task { await environment.addAffairMatter(title: draft.title, category: draft.category, priority: draft.priority, dueDate: draft.dueDate, note: draft.note) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedMatter) { matter in
            AffairEditorSheet(matter: matter) { draft in
                Task { await environment.updateAffairMatter(id: matter.id, title: draft.title, category: draft.category, priority: draft.priority, dueDate: draft.dueDate, note: draft.note) }
            } onDelete: {
                matterToDelete = matter
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć sprawę?",
            isPresented: Binding(
                get: { matterToDelete != nil },
                set: { if !$0 { matterToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let matterToDelete {
                Button("Usuń sprawę", role: .destructive) {
                    deletedMatter = matterToDelete
                    Task { await environment.deleteAffairMatter(id: matterToDelete.id) }
                    self.matterToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let deletedMatter {
                RootineUndoBanner(message: "Usunięto sprawę") {
                    let matter = deletedMatter
                    self.deletedMatter = nil
                    Task { await environment.restoreAffairMatter(matter) }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
            }
        }
    }

    @ViewBuilder
    private var overview: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Najbliższe sprawy", image: "checklist")
            if activeMatters.isEmpty {
                ModuleEmptyCard(title: "Brak otwartych spraw", detail: "Dodaj zobowiązanie, które chcesz mieć pod ręką.", systemImage: "checkmark.circle", tint: MoreModule.affairs.tint)
            } else {
                ForEach(activeMatters.prefix(3)) { matter in
                    affairRow(matter)
                }
            }
            ModuleActionButton(title: "Dodaj sprawę", systemImage: "plus", tint: MoreModule.affairs.tint) {
                showingMatterEditor = true
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var matters: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Sprawy i terminy", image: "calendar.badge.exclamationmark")
            if environment.affairsWorkspace.matters.isEmpty {
                ModuleEmptyCard(title: "Twoja lista jest pusta", detail: "Dodaj pierwszą sprawę — bez danych demonstracyjnych.", systemImage: "checklist.checked", tint: MoreModule.affairs.tint)
            } else {
                ForEach(environment.affairsWorkspace.matters.sorted { $0.dueDate < $1.dueDate }) { matter in
                    affairRow(matter)
                }
            }
            ModuleActionButton(title: "Dodaj sprawę", systemImage: "plus", tint: MoreModule.affairs.tint) {
                showingMatterEditor = true
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var finances: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Finanse", image: "creditcard")
            if upcomingPayments.isEmpty && environment.affairsWorkspace.oneTimePayments.isEmpty {
                ModuleEmptyCard(title: "Brak płatności", detail: "Płatności pojawią się tutaj po zapisaniu ich w module Pozostałe.", systemImage: "creditcard", tint: RootineTheme.ColorToken.warning)
            } else {
                ForEach(upcomingPayments) { payment in
                    AffairsPaymentRow(payment: payment)
                }
                ForEach(environment.affairsWorkspace.oneTimePayments.sorted { $0.dueDate < $1.dueDate }) { payment in
                    HStack(spacing: RootineTheme.Spacing.small) {
                        Button { Task { await environment.toggleOneTimePayment(id: payment.id) } } label: {
                            Image(systemName: payment.paid ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(payment.paid ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.warning)
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(payment.title).font(.subheadline.weight(.medium)).strikethrough(payment.paid)
                            Text("Termin \(payment.dueDate) · \(affairCurrency(payment.amount))")
                                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        Spacer()
                    }
                    .frame(minHeight: 52)
                }
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var documents: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Dokumenty", image: "doc.text")
            if openDocuments.isEmpty {
                ModuleEmptyCard(title: "Brak dokumentów", detail: "Dodaj dokument z terminem ważności w pełnym module spraw.", systemImage: "doc.badge.plus", tint: RootineTheme.ColorToken.action)
            } else {
                ForEach(openDocuments) { document in
                    AffairsInfoRow(title: document.name, detail: "\(document.holder) · ważny do \(document.expiresAt)", image: "doc.text", tint: RootineTheme.ColorToken.action)
                }
            }
        }
        .rootineSurface()
    }

    @ViewBuilder
    private var vehicles: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            sectionHeader("Pojazdy", image: "car")
            if vehicleItems.isEmpty {
                ModuleEmptyCard(title: "Brak terminów pojazdów", detail: "Przeglądy i ubezpieczenia pojawią się tutaj.", systemImage: "car", tint: MoreModule.affairs.tint)
            } else {
                ForEach(vehicleItems) { item in
                    AffairsInfoRow(title: item.title, detail: "Termin \(item.dueDate)", image: "car", tint: MoreModule.affairs.tint)
                }
            }
        }
        .rootineSurface()
    }

    private func sectionHeader(_ title: String, image: String) -> some View {
        ModuleSectionTitle(title: title, systemImage: image)
    }

    private func affairRow(_ matter: AffairMatter) -> some View {
        AffairMatterRow(matter: matter, onSelect: { selectedMatter = matter }, onToggle: { Task { await environment.toggleAffairMatter(id: matter.id) } }, onDelete: { matterToDelete = matter })
    }
}

private enum AffairsModuleView: String, CaseIterable, Identifiable {
    case overview
    case matters
    case finances
    case documents
    case vehicles

    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Przegląd"
        case .matters: return "Sprawy"
        case .finances: return "Finanse"
        case .documents: return "Dokumenty"
        case .vehicles: return "Pojazdy"
        }
    }
}

private struct AffairsMetric: View {
    let value: Int
    let label: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.title3.weight(.bold)).foregroundStyle(tint).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

private struct AffairMatterRow: View {
    let matter: AffairMatter
    let onSelect: () -> Void
    let onToggle: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) {
                Image(systemName: matter.status == "done" ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(matter.status == "done" ? RootineTheme.ColorToken.success : MoreModule.affairs.tint)
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(matter.status == "done" ? "Oznacz jako otwarte" : "Oznacz jako wykonane")

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: RootineTheme.Spacing.xSmall) {
                        Text(matter.title).font(.subheadline.weight(.medium)).strikethrough(matter.status == "done")
                        if matter.priority == "high" { Text("WAŻNE").font(.caption2.weight(.bold)).foregroundStyle(RootineTheme.ColorToken.warning) }
                    }
                    Text("\(matter.category) · \(matter.dueDate)")
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły sprawy: \(matter.title)")

            Button(action: onDelete) {
                Image(systemName: "trash")
                    .foregroundStyle(RootineTheme.ColorToken.destructive)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Usuń sprawę: \(matter.title)")
        }
        .frame(minHeight: 52)
    }
}

private struct AffairsPaymentRow: View {
    let payment: AffairRecurringPayment

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: payment.automatic ? "arrow.triangle.2.circlepath" : "creditcard")
                .foregroundStyle(RootineTheme.ColorToken.warning)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(payment.name).font(.subheadline.weight(.medium))
                Text("Następna płatność: \(payment.nextDueDate) · \(affairCurrency(payment.amount))")
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}

private struct AffairsInfoRow: View {
    let title: String
    let detail: String
    let image: String
    let tint: Color

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Image(systemName: image).foregroundStyle(tint).frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(detail).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
        }
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }
}

private func affairCurrency(_ amount: Double) -> String {
    "\(String(format: "%.2f", amount)) zł"
}

private struct AffairEditorDraft {
    var title: String
    var category: String
    var priority: String
    var dueDate: String
    var note: String
}

private struct AffairEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let matter: AffairMatter?
    let onSave: (AffairEditorDraft) -> Void
    let onDelete: (() -> Void)?
    @State private var title: String
    @State private var category: String
    @State private var priority: String
    @State private var dueDate: String
    @State private var note: String

    init(matter: AffairMatter?, onSave: @escaping (AffairEditorDraft) -> Void, onDelete: (() -> Void)? = nil) {
        self.matter = matter
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: matter?.title ?? "")
        _category = State(initialValue: AffairMatterCategory.canonical(matter?.category ?? "dom"))
        _priority = State(initialValue: matter?.priority ?? "normal")
        _dueDate = State(initialValue: matter?.dueDate ?? RootineDate.localDate())
        _note = State(initialValue: matter?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Sprawa") {
                    TextField("Nazwa", text: $title)
                    Picker("Kategoria", selection: $category) {
                        ForEach(AffairMatterCategory.allCases, id: \.rawValue) { category in
                            Text(category.label).tag(category.rawValue)
                        }
                    }
                    Picker("Priorytet", selection: $priority) {
                        Text("Normalny").tag("normal")
                        Text("Ważny").tag("high")
                    }
                    TextField("Termin (RRRR-MM-DD)", text: $dueDate)
                        .keyboardType(.numbersAndPunctuation)
                }
                Section("Notatka") {
                    TextEditor(text: $note).frame(minHeight: 96)
                }
                if let onDelete, matter != nil {
                    Section {
                        Button("Usuń sprawę", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(matter == nil ? "Nowa sprawa" : "Edytuj sprawę")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(AffairEditorDraft(title: title, category: category, priority: priority, dueDate: dueDate, note: note))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
