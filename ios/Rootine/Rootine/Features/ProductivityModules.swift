import SwiftUI

struct NotesModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var editorTarget: NoteEditorTarget?
    @State private var listEditorTarget: NoteListEditorTarget?
    @State private var searchText = ""
    @State private var showingArchive = false
    @State private var selectedListID: String?
    @State private var selectedTag: String?
    @State private var pinnedOnly = false
    @State private var sort: RootineNotesSort = .updated
    @State private var noteToDelete: NoteRecord?
    @State private var deletedNote: NoteRecord?
    @State private var listToDelete: NoteList?

    private var notes: [NoteRecord] {
        rootineNotes(environment.notesWorkspace, matching: RootineNotesQuery(
            search: searchText,
            listID: selectedListID,
            tag: selectedTag,
            showingArchive: showingArchive,
            pinnedOnly: pinnedOnly,
            sort: sort
        ))
    }

    private var recentNotes: [NoteRecord] {
        guard !pinnedOnly else { return notes }
        // Keep the first pinned note in the feature card while leaving any
        // additional pinned notes in the ordinary list.
        guard let featuredID = notes.first(where: \.pinned)?.id else { return notes }
        return notes.filter { $0.id != featuredID }
    }

    private var hasPinnedNote: Bool {
        notes.contains(where: \.pinned)
    }

    private var availableTags: [String] {
        Array(Set(environment.notesWorkspace.notes.flatMap(\.tags))).sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(RootineTheme.ColorToken.secondaryText)
                TextField("Szukaj notatek lub tagów", text: $searchText, prompt: Text("Szukaj notatek lub tagów").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    .textInputAutocapitalization(.never)
                    .accessibilityIdentifier("notes.search")
                if !searchText.isEmpty {
                    Button { searchText = "" } label: { Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44) }
                        .accessibilityLabel("Wyczyść wyszukiwanie")
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))

            folderBar

            HStack {
                Text(showingArchive ? "Archiwum" : "Moje notatki").font(.headline)
                Text("\(notes.count)").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Spacer()
                Menu {
                    Toggle("Tylko przypięte", isOn: $pinnedOnly)
                    Picker("Sortowanie", selection: $sort) {
                        Text("Ostatnio zmienione").tag(RootineNotesSort.updated)
                        Text("Utworzone ostatnio").tag(RootineNotesSort.created)
                        Text("Alfabetycznie").tag(RootineNotesSort.title)
                    }
                    if !availableTags.isEmpty {
                        Menu("Tagi") {
                            Button("Wszystkie tagi") { selectedTag = nil }
                            ForEach(availableTags, id: \.self) { tag in
                                Button("#\(tag)") { selectedTag = tag }
                            }
                        }
                    }
                    Divider()
                    Button(showingArchive ? "Pokaż aktywne" : "Pokaż archiwum") { showingArchive.toggle() }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Filtry i sortowanie notatek")
                .accessibilityValue(filterSummary)
            }

            if let selectedTag {
                Button { self.selectedTag = nil } label: {
                    Label("#\(selectedTag)", systemImage: "xmark.circle.fill").font(.subheadline)
                }
                .frame(minHeight: 44)
                .accessibilityLabel("Usuń filtr tagu \(selectedTag)")
            }

            if notes.isEmpty {
                ModuleEmptyCard(
                    title: showingArchive ? "Archiwum jest puste" : searchText.isEmpty ? "Miejsce na Twoje pomysły" : "Brak pasujących notatek",
                    detail: showingArchive ? "Odłożone notatki pozostają tutaj dostępne." : searchText.isEmpty ? "Zapisz myśl, plan lub listę. Foldery pomogą je uporządkować." : "Zmień wyszukiwanie lub wybrane filtry.",
                    systemImage: "note.text", tint: MoreModule.notes.tint
                )
            } else {
                let pinned = notes.filter(\.pinned)
                let unpinned = notes.filter { !$0.pinned }
                if !pinned.isEmpty { noteGroup(pinned, title: "Przypięte", icon: "pin") }
                if !unpinned.isEmpty { noteGroup(unpinned, title: pinned.isEmpty ? nil : "Pozostałe", icon: "note.text") }
            }
        }
        .rootineScreenChrome(title: "Notatki", addLabel: "Dodaj notatkę") {
            editorTarget = NoteEditorTarget(note: nil)
        }
        .sheet(item: $editorTarget) { target in
            NoteEditorSheet(note: target.note, lists: environment.notesWorkspace.lists) { note in
                Task { await environment.upsertNote(note) }
            } onDelete: { note in
                requestDelete(note)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $listEditorTarget) { target in
            NoteListEditorSheet(list: target.list) { name in
                Task {
                    if let list = target.list {
                        await environment.renameNoteList(id: list.id, name: name)
                    } else {
                        await environment.createNoteList(name: name)
                    }
                }
            }
            .presentationDetents([.medium])
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
        .confirmationDialog(
            "Usunąć folder?",
            isPresented: Binding(
                get: { listToDelete != nil },
                set: { isPresented in
                    if !isPresented { listToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let listToDelete {
                Button("Usuń folder", role: .destructive) {
                    if selectedListID == listToDelete.id { selectedListID = nil }
                    Task { await environment.deleteNoteList(id: listToDelete.id) }
                    self.listToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text("Notatki pozostaną zachowane jako bez folderu.")
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

    private var filterSummary: String {
        var values = [showingArchive ? "archiwum" : "aktywne"]
        if pinnedOnly { values.append("przypięte") }
        if selectedListID != nil { values.append("folder") }
        if selectedTag != nil { values.append("tag") }
        return values.joined(separator: ", ")
    }

    private func noteGroup(_ values: [NoteRecord], title: String?, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title { Label(title, systemImage: icon).font(.subheadline.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.secondaryText) }
            ForEach(values) { note in
                NoteListRow(note: note)
                    .padding(.horizontal, 14)
                    .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))
                    .contentShape(RoundedRectangle(cornerRadius: 14))
                    .onTapGesture { editorTarget = NoteEditorTarget(note: note) }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { editorTarget = NoteEditorTarget(note: note) }
                    .accessibilityIdentifier("notes.row.\(note.id)")
                    .contextMenu {
                        Button { editorTarget = NoteEditorTarget(note: note) } label: { Label("Edytuj", systemImage: "pencil") }
                        noteActions(for: note)
                        Menu("Przenieś do folderu") {
                            Button("Bez folderu") { moveNote(note, to: "") }
                            ForEach(environment.notesWorkspace.lists) { list in
                                Button(list.name) { moveNote(note, to: list.id) }
                            }
                        }
                        Button(role: .destructive) { requestDelete(note) } label: { Label("Usuń", systemImage: "trash") }
                    }
                    .rootineSwipeActions(
                        leadingLabel: note.pinned ? "Odepnij" : "Przypnij", leadingIcon: note.pinned ? "pin.slash" : "pin",
                        onLeading: { Task { await environment.toggleNotePinned(id: note.id) } },
                        trailingLabel: showingArchive ? "Przywróć" : "Archiwizuj", trailingIcon: showingArchive ? "arrow.uturn.backward" : "archivebox",
                        onTrailing: { if showingArchive { restore(note) } else { Task { await environment.archiveNote(id: note.id) } } }
                    )
                    .draggable("note:\(note.id)")
            }
        }
    }

    private func moveNote(_ note: NoteRecord, to listID: String) {
        var moved = note
        moved.listId = listID
        Task { await environment.upsertNote(moved) }
    }

    private var folderBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: RootineTheme.Spacing.xSmall) {
                folderButton(title: "Wszystkie", systemImage: "tray.full", id: nil)
                if environment.notesWorkspace.notes.contains(where: { $0.listId.isEmpty }) {
                    folderButton(title: "Bez folderu", systemImage: "tray", id: "")
                }
                ForEach(environment.notesWorkspace.lists) { list in
                    HStack(spacing: 0) {
                        folderButton(title: list.name, systemImage: "folder", id: list.id)
                        Menu {
                            Button {
                                listEditorTarget = NoteListEditorTarget(list: list)
                            } label: {
                                Label("Zmień nazwę", systemImage: "pencil")
                            }
                            Button(role: .destructive) {
                                listToDelete = list
                            } label: {
                                Label("Usuń folder", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.caption.weight(.bold))
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Zarządzaj folderem \(list.name)")
                    }
                    .background(selectedListID == list.id ? MoreModule.notes.tint.opacity(0.18) : RootineTheme.ColorToken.elevated)
                    .clipShape(Capsule())
                }
                Button {
                    listEditorTarget = NoteListEditorTarget(list: nil)
                } label: {
                    Label("Nowy folder", systemImage: "folder.badge.plus")
                        .font(.caption.weight(.semibold))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(MoreModule.notes.tint)
                .accessibilityLabel("Utwórz folder notatek")
            }
            .padding(.horizontal, RootineTheme.Spacing.xSmall)
        }
    }

    private func folderButton(title: String, systemImage: String, id: String?) -> some View {
        Button {
            selectedListID = id
        } label: {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(selectedListID == id ? MoreModule.notes.tint : RootineTheme.ColorToken.primaryText)
                .frame(minHeight: 44)
                .padding(.horizontal, RootineTheme.Spacing.small)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Folder \(title)")
        .accessibilityAddTraits(selectedListID == id ? .isSelected : [])
        .dropDestination(for: String.self) { items, _ in
            guard let id, let value = items.first, value.hasPrefix("note:"),
                  let note = environment.notesWorkspace.notes.first(where: { $0.id == String(value.dropFirst(5)) }) else { return false }
            moveNote(note, to: id)
            return true
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
    let lists: [NoteList]
    let onSave: (NoteRecord) -> Void
    let onDelete: (NoteRecord) -> Void
    @State private var title: String
    @State private var bodyText: String
    @State private var tags: String
    @State private var pinned: Bool
    @State private var kind: String
    @State private var items: [NoteChecklistItem]
    @State private var listID: String
    @State private var color: NoteColor

    init(note: NoteRecord?, lists: [NoteList], onSave: @escaping (NoteRecord) -> Void, onDelete: @escaping (NoteRecord) -> Void) {
        self.note = note
        self.lists = lists
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: note?.title ?? "")
        _bodyText = State(initialValue: note?.body ?? "")
        _tags = State(initialValue: note?.tags.joined(separator: ", ") ?? "")
        _pinned = State(initialValue: note?.pinned ?? false)
        // Preserve a future/web kind until the user explicitly changes it;
        // the native picker still offers the two currently supported modes.
        _kind = State(initialValue: note?.kind ?? "text")
        _items = State(initialValue: note?.items ?? [])
        _listID = State(initialValue: note?.listId ?? "")
        _color = State(initialValue: note?.color ?? .blue)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Treść") {
                    TextField("Tytuł", text: $title, prompt: Text("Tytuł").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 120)
                    TextField("Tagi (opcjonalnie)", text: $tags, prompt: Text("Tagi (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    Picker("Typ", selection: $kind) {
                        Text("Tekst").tag("text")
                        Text("Lista kontrolna").tag("checklist")
                    }
                    Picker("Folder", selection: $listID) {
                        Text("Bez folderu").tag("")
                        ForEach(lists) { list in
                            Text(list.name).tag(list.id)
                        }
                    }
                    Picker("Kolor", selection: $color) {
                        ForEach(NoteColor.allCases, id: \.self) { value in
                            Text(value.localizedName).tag(value)
                        }
                    }
                    Toggle("Przypnij na górze", isOn: $pinned)
                }
                if kind == "checklist" {
                    Section("Lista kontrolna") {
                        ForEach(items) { item in
                            HStack(spacing: RootineTheme.Spacing.xSmall) {
                                Button {
                                    toggleItem(item.id)
                                } label: {
                                    Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(item.checked ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(item.checked ? "Oznacz jako nieukończone" : "Oznacz jako ukończone")
                                TextField("Element listy", text: itemBinding(item.id), prompt: Text("Element listy").foregroundColor(RootineTheme.ColorToken.secondaryText))
                                Button(role: .destructive) {
                                    items.removeAll { $0.id == item.id }
                                } label: {
                                    Image(systemName: "minus.circle")
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Usuń element listy")
                            }
                        }
                        Button {
                            items.append(NoteChecklistItem(id: UUID().uuidString, text: "", checked: false))
                        } label: {
                            Label("Dodaj element", systemImage: "plus.circle")
                        }
                    }
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
                            kind: kind,
                            items: kind == "checklist" ? items.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } : [],
                            tags: tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                            listId: listID,
                            color: color,
                            pinned: pinned,
                            archived: note?.archived ?? false,
                            createdAt: note?.createdAt ?? now,
                            updatedAt: now
                        )
                        onSave(saved)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        && bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        && (kind != "checklist" || items.allSatisfy { $0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }))
                }
            }
        }
    }

    private func toggleItem(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].checked.toggle()
    }

    private func itemBinding(_ id: String) -> Binding<String> {
        Binding(
            get: { items.first(where: { $0.id == id })?.text ?? "" },
            set: { value in
                guard let index = items.firstIndex(where: { $0.id == id }) else { return }
                items[index].text = value
            }
        )
    }
}

private struct NoteListEditorTarget: Identifiable {
    let id: String
    let list: NoteList?

    init(list: NoteList?) {
        self.list = list
        id = list?.id ?? "new-note-list-\(UUID().uuidString)"
    }
}

private struct NoteListEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let list: NoteList?
    let onSave: (String) -> Void
    @State private var name: String

    init(list: NoteList?, onSave: @escaping (String) -> Void) {
        self.list = list
        self.onSave = onSave
        _name = State(initialValue: list?.name ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nazwa folderu", text: $name, prompt: Text("Nazwa folderu").foregroundColor(RootineTheme.ColorToken.secondaryText))
            }
            .navigationTitle(list == nil ? "Nowy folder" : "Zmień nazwę folderu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(name)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
            if note.kind == "checklist", !note.items.isEmpty {
                Text("\(note.items.filter(\.checked).count)/\(note.items.count) ukończonych")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.success)
            }
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
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                    .lineLimit(2)
                Text(note.body.isEmpty ? (note.kind == "checklist" ? "Lista kontrolna" : "Bez dodatkowej treści") : note.body)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .lineLimit(2)
                if note.kind == "checklist", !note.items.isEmpty {
                    Text("\(note.items.filter(\.checked).count)/\(note.items.count) ukończonych")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.success)
                }
                if !note.tags.isEmpty {
                    Text(note.tags.prefix(3).map { "#\($0)" }.joined(separator: "  "))
                        .font(.caption2).foregroundStyle(MoreModule.notes.tint).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: note.pinned ? "pin.fill" : "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .padding(.vertical, RootineTheme.Spacing.small)
        .frame(minHeight: 80)
        .accessibilityElement(children: .combine)
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

private extension NoteColor {
    var localizedName: String {
        switch self {
        case .graphite: return "Grafitowy"
        case .blue: return "Niebieski"
        case .green: return "Zielony"
        case .amber: return "Bursztynowy"
        case .violet: return "Fioletowy"
        case .coral: return "Koralowy"
        }
    }
}

// MARK: Sport

struct SportModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingWorkoutEditor = false
    @State private var selectedWorkout: SportWorkout?
    @State private var editingWorkout: SportWorkout?
    @State private var pendingWorkoutEdit: SportWorkout?
    @State private var workoutToDelete: SportWorkout?
    @State private var deletedWorkout: SportWorkout?
    @State private var showingHistory = false
    @State private var selectedDay: String?
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

    private var weekTotalMinutes: Int { weekWorkouts.filter(\.completed).reduce(0) { $0 + $1.minutes } }
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
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Ten tydzień").font(.headline)
                    Spacer()
                    Text("\(weekTotalMinutes) min ruchu").font(.subheadline.weight(.semibold)).monospacedDigit()
                }
                HStack(spacing: 4) {
                    ForEach(0..<7, id: \.self) { offset in
                        let date = Calendar.current.date(byAdding: .day, value: offset, to: weekRange.0) ?? Date()
                        let key = RootineDate.localDate(date)
                        let dayWorkouts = weekWorkouts.filter { $0.date == key }
                        Button { selectedDay = selectedDay == key ? nil : key } label: {
                            VStack(spacing: 9) {
                                Text(weekdays[offset]).font(.caption2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                Text("\(Calendar.current.component(.day, from: date))").font(.subheadline.weight(.semibold))
                                Image(systemName: dayWorkouts.contains(where: \.completed) ? "checkmark.circle.fill" : dayWorkouts.isEmpty ? "circle" : "circle.inset.filled")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(dayWorkouts.contains(where: \.completed) ? RootineTheme.ColorToken.success : dayWorkouts.isEmpty ? RootineTheme.ColorToken.separator : MoreModule.sport.tint)
                            }
                            .frame(maxWidth: .infinity, minHeight: 88)
                            .background(selectedDay == key ? MoreModule.sport.tint.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Calendar.current.isDateInToday(date) ? MoreModule.sport.tint.opacity(0.5) : .clear, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(date.formatted(.dateTime.day().month().locale(Locale(identifier: "pl_PL"))))
                        .accessibilityValue("\(dayWorkouts.count) treningów")
                        .accessibilityIdentifier("sport.day.\(offset)")
                        .dropDestination(for: String.self) { items, _ in
                            guard let value = items.first, value.hasPrefix("workout:"),
                                  let workout = workouts.first(where: { $0.id == String(value.dropFirst(8)) }) else { return false }
                            reschedule(workout, date: key)
                            return true
                        }
                    }
                }
                HStack {
                    Label("\(weekCompletedWorkouts) ukończone", systemImage: "checkmark.circle")
                    Spacer()
                    Text("\(weekWorkouts.filter { !$0.completed }.count) w planie")
                }
                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            .rootineSurface()

            Picker("Treningi", selection: $showingHistory) {
                Text("Plan").tag(false)
                Text("Historia").tag(true)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("sport.mode")

            if let selectedDay {
                HStack {
                    Text(productivityDate(selectedDay)).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button("Cały plan") { self.selectedDay = nil }.font(.subheadline).frame(minHeight: 44)
                }
            }

            let visible = workouts.filter { $0.completed == showingHistory && (selectedDay == nil || $0.date == selectedDay) }
                .sorted { showingHistory ? $0.date > $1.date : $0.date < $1.date }
            if visible.isEmpty {
                ModuleEmptyCard(title: showingHistory ? "Każdy trening się liczy" : "Zaplanuj chwilę na ruch", detail: showingHistory ? "Ukończone aktywności pojawią się w historii." : "Dodaj trening plusem u góry. Gotowy plan możesz przenieść na inny dzień tygodnia.", systemImage: "figure.run", tint: MoreModule.sport.tint)
            } else {
                ForEach(visible) { workout in
                    SportWorkoutRow(workout: workout,
                        onSelect: { selectedWorkout = workout },
                        onToggle: { Task { await environment.toggleWorkoutCompleted(id: workout.id) } },
                        onEdit: { editingWorkout = workout },
                        onDelete: { requestDelete(workout) })
                        .padding(14)
                        .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))
                        .draggable("workout:\(workout.id)")
                        .accessibilityIdentifier("sport.workout.\(workout.id)")
                }
            }
        }
        .rootineScreenChrome(title: "Sport", addLabel: "Zaplanuj trening") { isShowingWorkoutEditor = true }
        .sheet(isPresented: $isShowingWorkoutEditor) {
            WorkoutEditorSheet { title, kind, minutes, date in
                Task { await environment.addWorkout(title: title, date: date, minutes: minutes, kind: kind) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedWorkout, onDismiss: {
            if let pendingWorkoutEdit { editingWorkout = pendingWorkoutEdit; self.pendingWorkoutEdit = nil }
        }) { workout in
            WorkoutDetailSheet(
                workout: workout,
                onEdit: { pendingWorkoutEdit = workout },
                onDelete: {
                    selectedWorkout = nil
                    delete(workout)
                }
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

    private func reschedule(_ workout: SportWorkout, date: String) {
        Task { await environment.updateWorkout(id: workout.id, title: workout.title, date: date, minutes: workout.minutes, kind: workout.kind) }
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
                Image(systemName: sportSymbol(workout.kind))
                    .font(.title3)
                    .foregroundStyle(MoreModule.sport.tint)
            }
            .frame(width: 40, height: 40)

            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(workout.kind) · \(workout.minutes) min")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(productivityDate(workout.date)).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
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
            Button(action: onToggle) { Label(workout.completed ? "Cofnij ukończenie" : "Ukończ trening", systemImage: workout.completed ? "arrow.uturn.backward" : "checkmark") }
            Button(action: onEdit) { Label("Edytuj trening", systemImage: "pencil") }
            Button(role: .destructive, action: onDelete) { Label("Usuń trening", systemImage: "trash") }
        }
        .rootineSwipeActions(leadingLabel: workout.completed ? "Cofnij" : "Ukończ", leadingIcon: workout.completed ? "arrow.uturn.backward" : "checkmark", onLeading: onToggle,
                             trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: onEdit)
    }
}

private func sportSymbol(_ kind: String) -> String {
    let value = kind.lowercased()
    if value.contains("bieg") { return "figure.run" }
    if value.contains("rower") { return "figure.outdoor.cycle" }
    if value.contains("spacer") { return "figure.walk" }
    if value.contains("jog") || value.contains("yog") { return "figure.yoga" }
    if value.contains("pływ") { return "figure.pool.swim" }
    return "figure.strengthtraining.traditional"
}

private func productivityDate(_ key: String) -> String {
    guard let date = rootineDate(from: key) else { return key }
    if Calendar.current.isDateInToday(date) { return "Dzisiaj" }
    if Calendar.current.isDateInTomorrow(date) { return "Jutro" }
    if Calendar.current.isDateInYesterday(date) { return "Wczoraj" }
    return date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "pl_PL")))
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
                    LabeledContent("Nazwa") {
                        TextField("Nazwa", text: $title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Nazwa")
                            .frame(minHeight: 44)
                    }
                    LabeledContent("Rodzaj") {
                        TextField("Rodzaj", text: $kind, prompt: Text("Rodzaj").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Rodzaj")
                            .frame(minHeight: 44)
                    }
                    LabeledContent("Minuty") {
                        TextField("Minuty", text: $minutes, prompt: Text("Minuty").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Minuty")
                            .frame(minHeight: 44)
                    }
                    DatePicker("Data", selection: Binding(get: { rootineDate(from: date) ?? Date() }, set: { date = RootineDate.localDate($0) }), displayedComponents: .date)
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
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (Int(minutes) ?? 0) <= 0)
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

struct GoalsModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingGoalEditor = false
    @State private var selectedGoal: GoalRecord?
    @State private var editingGoal: GoalRecord?
    @State private var pendingGoalEdit: GoalRecord?
    @State private var progressGoal: GoalRecord?
    @State private var goalToDelete: GoalRecord?
    @State private var deletedGoal: GoalRecord?
    @State private var showingArchive = false
    @State private var categoryFilter: String?

    private var goals: [GoalRecord] {
        environment.goalsWorkspace.goals
            .filter { showingArchive ? $0.status == .archived : $0.status != .archived }
            .filter { categoryFilter == nil || $0.categoryId == categoryFilter }
            .sorted { lhs, rhs in
                if lhs.status != rhs.status { return lhs.status == .active }
                if lhs.dueDate != rhs.dueDate { return lhs.dueDate < rhs.dueDate }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
    }
    private var averageProgress: Double {
        guard !goals.isEmpty else { return 0 }
        return goals.reduce(0) { $0 + $1.progress } / Double(goals.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 0) {
                goalCount("W realizacji", count: environment.goalsWorkspace.goals.filter { $0.status == .active }.count, icon: "target")
                Divider().frame(height: 34)
                goalCount("Ukończone", count: environment.goalsWorkspace.goals.filter { $0.status == .completed }.count, icon: "checkmark.circle")
                Divider().frame(height: 34)
                goalCount("Wstrzymane", count: environment.goalsWorkspace.goals.filter { $0.status == .paused }.count, icon: "pause.circle")
            }
            .rootineSurface()

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button { categoryFilter = nil } label: { Text("Wszystkie").font(.subheadline.weight(.medium)).padding(.horizontal, 14).frame(minHeight: 44) }
                        .background(categoryFilter == nil ? MoreModule.goals.tint.opacity(0.18) : RootineTheme.ColorToken.surface, in: Capsule())
                    ForEach(environment.goalsWorkspace.categories) { category in
                        Button { categoryFilter = categoryFilter == category.id ? nil : category.id } label: {
                            Text(category.label).font(.subheadline.weight(.medium)).padding(.horizontal, 14).frame(minHeight: 44)
                        }
                        .background(categoryFilter == category.id ? MoreModule.goals.tint.opacity(0.18) : RootineTheme.ColorToken.surface, in: Capsule())
                        .dropDestination(for: String.self) { items, _ in
                            guard let value = items.first, value.hasPrefix("goal:"),
                                  let goal = environment.goalsWorkspace.goals.first(where: { $0.id == String(value.dropFirst(5)) }) else { return false }
                            Task { await environment.updateGoalCategory(id: goal.id, categoryId: category.id) }
                            return true
                        }
                        .accessibilityIdentifier("goals.category.\(category.id)")
                    }
                }
                .buttonStyle(.plain)
            }

            HStack {
                Text(showingArchive ? "Archiwum" : "Twoje cele").font(.headline)
                Spacer()
                Button { showingArchive.toggle() } label: {
                    Label(showingArchive ? "Wróć do celów" : "Archiwum", systemImage: showingArchive ? "target" : "archivebox")
                        .font(.caption.weight(.semibold)).frame(minHeight: 44)
                }
            }
            if goals.isEmpty {
                ModuleEmptyCard(title: showingArchive ? "Archiwum jest puste" : "Od pomysłu do działania", detail: showingArchive ? "Zarchiwizowane cele zachowują swój postęp i historię." : "Ustal cel, termin i sposób mierzenia postępu. Każdy krok zapiszesz w jednym miejscu.", systemImage: "target", tint: MoreModule.goals.tint)
            } else {
                ForEach(goals) { goal in
                    GoalRow(goal: goal, onSelect: { selectedGoal = goal }, onAdvance: { progressGoal = goal })
                        .padding(16)
                        .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 16))
                        .contextMenu {
                            Button { editingGoal = goal } label: { Label("Edytuj cel", systemImage: "pencil") }
                            if goal.status != .archived && goal.status != .completed {
                                Button { progressGoal = goal } label: { Label("Zapisz postęp", systemImage: "plus.circle") }
                                Button { Task { await environment.setGoalStatus(id: goal.id, status: goal.status == .paused ? .active : .paused) } } label: {
                                    Label(goal.status == .paused ? "Wznów cel" : "Wstrzymaj cel", systemImage: goal.status == .paused ? "play" : "pause")
                                }
                                Button { Task { await environment.setGoalStatus(id: goal.id, status: .completed) } } label: { Label("Oznacz jako ukończony", systemImage: "checkmark") }
                            }
                            Button { archiveOrRestore(goal) } label: { Label(goal.status == .archived ? "Przywróć" : "Archiwizuj", systemImage: goal.status == .archived ? "arrow.uturn.backward" : "archivebox") }
                            Button(role: .destructive) { requestDelete(goal) } label: { Label("Usuń", systemImage: "trash") }
                        }
                        .rootineSwipeActions(
                            leadingLabel: goal.status == .archived ? "Przywróć" : "Postęp", leadingIcon: goal.status == .archived ? "arrow.uturn.backward" : "plus.circle",
                            onLeading: { if goal.status == .archived { archiveOrRestore(goal) } else { progressGoal = goal } },
                            trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editingGoal = goal }
                        )
                        .draggable("goal:\(goal.id)")
                        .accessibilityIdentifier("goals.row.\(goal.id)")
                }
            }
        }
        .rootineScreenChrome(title: "Cele", addLabel: "Dodaj cel") { isShowingGoalEditor = true }
        .sheet(item: $progressGoal) { goal in
            GoalProgressSheet(goal: goal)
        }
        .sheet(isPresented: $isShowingGoalEditor) {
            GoalEditorSheet(categories: environment.goalsWorkspace.categories) { draft in
                Task { _ = await environment.createGoal(
                    title: draft.title,
                    description: draft.detail,
                    categoryId: draft.categoryId,
                    iconKey: draft.icon,
                    status: draft.status,
                    priority: draft.priority,
                    startDate: draft.startDate,
                    dueDate: draft.dueDate,
                    progressMode: draft.progressMode,
                    targetValue: draft.target,
                    unit: draft.unit,
                    note: draft.note
                ) }
            }
        }
        .sheet(item: $selectedGoal, onDismiss: {
            if let pendingGoalEdit { editingGoal = pendingGoalEdit; self.pendingGoalEdit = nil }
        }) { goal in
            GoalDetailSheet(
                goal: goal,
                onEdit: { pendingGoalEdit = goal },
                onDelete: {
                    selectedGoal = nil
                    delete(goal)
                }
            )
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $editingGoal) { goal in
            GoalEditorSheet(existing: goal, categories: environment.goalsWorkspace.categories) { draft in
                Task { await environment.updateGoal(
                    id: goal.id,
                    title: draft.title,
                    description: draft.detail,
                    categoryId: draft.categoryId,
                    status: draft.status,
                    priority: draft.priority,
                    startDate: draft.startDate,
                    dueDate: draft.dueDate,
                    progressMode: draft.progressMode,
                    targetValue: draft.target,
                    unit: draft.unit,
                    note: draft.note
                ) }
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

    private func goalCount(_ label: String, count: Int, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("\(count)", systemImage: icon).font(.subheadline.weight(.semibold)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .combine)
    }

    private func archiveOrRestore(_ goal: GoalRecord) {
        Task {
            if goal.status == .archived { await environment.restoreArchivedGoal(id: goal.id) }
            else { await environment.archiveGoal(id: goal.id) }
        }
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
                        Text("\(goal.progressPercent)%")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(MoreModule.goals.tint)
                    }
                    Text(goal.detail.isEmpty ? "Postęp celu" : goal.detail)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text("\(goalStatusLabel(goal.status)) · do \(productivityDate(goal.dueDate))")
                        .font(.caption2)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    ProgressView(value: min(1, max(0, goal.progress)))
                        .tint(MoreModule.goals.tint)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Szczegóły celu: \(goal.title)")
            if goal.status != .archived && goal.status != .completed {
                Button(action: onAdvance) {
                    Image(systemName: "plus.circle")
                        .font(.title3)
                        .foregroundStyle(MoreModule.goals.tint)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Zapisz postęp celu \(goal.title)")
            }
        }
        .padding(.vertical, RootineTheme.Spacing.small)
        .contentShape(Rectangle())
    }
}

private func goalStatusLabel(_ status: GoalStatus) -> String {
    switch status {
    case .planned: return "Zaplanowany"
    case .active: return "W realizacji"
    case .paused: return "Wstrzymany"
    case .completed: return "Ukończony"
    case .archived: return "Archiwum"
    }
}

private struct GoalProgressSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let goal: GoalRecord
    @State private var amount = "1"
    @State private var note = ""
    @State private var date = Date()

    private var amountLabel: String {
        goal.progressMode == .manual ? "Aktualny postęp (%)" : goal.unit.isEmpty ? "Wykonana ilość" : "Wykonana ilość (\(goal.unit))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(goal.title) {
                    if goal.progressMode == .milestones {
                        if let milestone = goal.milestones.first(where: { !$0.done }) {
                            Label(milestone.title, systemImage: "circle")
                            Text("Zapisanie postępu oznaczy ten etap jako ukończony.").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Label("Wszystkie etapy ukończone", systemImage: "checkmark.circle")
                        }
                    } else {
                        TextField(amountLabel, text: $amount, prompt: Text(amountLabel).foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .keyboardType(.decimalPad)
                        DatePicker("Data", selection: $date, in: ...Date(), displayedComponents: .date)
                        TextField("Notatka (opcjonalnie)", text: $note, prompt: Text("Notatka (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
                    }
                }
            }
            .navigationTitle("Zapisz postęp")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard canSave else { return }
                        Task {
                            if goal.progressMode == .milestones { await environment.advanceGoal(id: goal.id) }
                            else if let numericAmount { await environment.addGoalProgress(id: goal.id, date: RootineDate.localDate(date), value: numericAmount, kind: goal.progressMode == .manual ? .absolute : .delta, note: note) }
                            dismiss()
                        }
                    }
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var numericAmount: Double? {
        guard let value = Double(amount.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")), value.isFinite else { return nil }
        return value
    }

    private var canSave: Bool {
        if goal.progressMode == .milestones { return goal.milestones.contains(where: { !$0.done }) }
        guard let numericAmount else { return false }
        return goal.progressMode == .manual ? (0...100).contains(numericAmount) : numericAmount > 0
    }
}

private struct GoalEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: GoalRecord?
    let categories: [GoalCategory]
    let onSave: (GoalEditorDraft) -> Void
    @State private var title: String
    @State private var detail: String
    @State private var target: String
    @State private var icon: String
    @State private var categoryId: String
    @State private var status: GoalStatus
    @State private var priority: GoalPriority
    @State private var startDate: String
    @State private var dueDate: String
    @State private var progressMode: GoalProgressMode
    @State private var unit: String
    @State private var note: String

    init(existing: GoalRecord? = nil, categories: [GoalCategory] = [], onSave: @escaping (GoalEditorDraft) -> Void) {
        self.existing = existing
        self.categories = categories.isEmpty ? [GoalCategory(id: "personal", label: "Osobiste", color: "#8793A1", iconKey: "circle")] : categories
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _detail = State(initialValue: existing?.detail ?? "")
        let targetText = String(existing?.target ?? 10)
        let compactTargetText = targetText.hasSuffix(".0") ? String(targetText.dropLast(2)) : targetText
        _target = State(initialValue: compactTargetText.replacingOccurrences(of: ".", with: Locale.current.decimalSeparator ?? "."))
        _icon = State(initialValue: existing?.icon ?? "target")
        _categoryId = State(initialValue: existing?.categoryId ?? "personal")
        _status = State(initialValue: existing?.status ?? .active)
        _priority = State(initialValue: existing?.priority ?? .medium)
        _startDate = State(initialValue: existing?.startDate ?? RootineDate.localDate())
        _dueDate = State(initialValue: existing?.dueDate ?? RootineDate.localDate(Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()))
        _progressMode = State(initialValue: existing?.progressMode ?? .numeric)
        _unit = State(initialValue: existing?.unit ?? "kroków")
        _note = State(initialValue: existing?.note ?? existing?.detail ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cel") {
                    LabeledContent("Nazwa") {
                        TextField("Nazwa", text: $title, prompt: Text("Nazwa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Nazwa")
                            .frame(minHeight: 44)
                    }
                    TextField("Opis (opcjonalnie)", text: $detail, prompt: Text("Opis (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical).lineLimit(2...4)
                    Picker("Kategoria", selection: $categoryId) {
                        ForEach(categories) { category in
                            Text(category.label).tag(category.id)
                        }
                    }
                    if existing == nil {
                        Picker("Symbol", selection: $icon) {
                            Label("Cel", systemImage: "target").tag("target")
                            Label("Nauka", systemImage: "book").tag("book")
                            Label("Zdrowie", systemImage: "heart").tag("heart")
                            Label("Sport", systemImage: "figure.run").tag("figure.run")
                            Label("Oszczędności", systemImage: "banknote").tag("banknote")
                            Label("Podróże", systemImage: "airplane").tag("airplane")
                        }
                    }
                }
                Section("Postęp") {
                    Picker("Sposób mierzenia", selection: $progressMode) {
                        Text("Wartość i jednostka").tag(GoalProgressMode.numeric)
                        Text("Ukończone etapy").tag(GoalProgressMode.milestones)
                        Text("Regularność").tag(GoalProgressMode.regularity)
                        Text("Procent ustalany ręcznie").tag(GoalProgressMode.manual)
                    }
                    if progressMode == .numeric || progressMode == .regularity {
                        LabeledContent("Wartość docelowa") {
                            TextField("Wartość docelowa", text: $target, prompt: Text("Wartość docelowa").foregroundColor(RootineTheme.ColorToken.secondaryText))
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .accessibilityLabel("Wartość docelowa")
                                .frame(minHeight: 44)
                        }
                        LabeledContent("Jednostka") {
                            TextField("np. km, książki", text: $unit, prompt: Text("np. km, książki").foregroundColor(RootineTheme.ColorToken.secondaryText))
                                .multilineTextAlignment(.trailing)
                                .accessibilityLabel("Jednostka, np. km, książki")
                                .frame(minHeight: 44)
                        }
                    }
                    if progressMode == .milestones {
                        Text("Etapy dodasz w szczegółach zapisanego celu.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Plan") {
                    DatePicker("Początek", selection: Binding(get: { rootineDate(from: startDate) ?? Date() }, set: {
                        startDate = RootineDate.localDate($0)
                        if dueDate < startDate { dueDate = startDate }
                    }), displayedComponents: .date)
                    DatePicker("Termin", selection: Binding(get: { rootineDate(from: dueDate) ?? Date() }, set: { dueDate = RootineDate.localDate($0) }), in: (rootineDate(from: startDate) ?? Date())..., displayedComponents: .date)
                    Picker("Status", selection: $status) {
                        ForEach(GoalStatus.allCases, id: \.self) { value in Text(goalStatusLabel(value)).tag(value) }
                    }
                    Picker("Priorytet", selection: $priority) {
                        Text("Niski").tag(GoalPriority.low)
                        Text("Średni").tag(GoalPriority.medium)
                        Text("Wysoki").tag(GoalPriority.high)
                    }
                }
                Section("Dodatkowe informacje") {
                    TextField("Notatka", text: $note, prompt: Text("Notatka").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj cel" : "Edytuj cel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(GoalEditorDraft(
                            title: title,
                            detail: detail,
                            target: Double(target.replacingOccurrences(of: ",", with: ".")) ?? 10,
                            icon: icon,
                            categoryId: categoryId,
                            status: status,
                            priority: priority,
                            startDate: startDate,
                            dueDate: dueDate,
                            progressMode: progressMode,
                            unit: unit,
                            note: note
                        ))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ((progressMode == .numeric || progressMode == .regularity) && (Double(target.replacingOccurrences(of: ",", with: ".")) ?? 0) <= 0))
                }
            }
        }
    }
}

private struct GoalEditorDraft {
    let title: String
    let detail: String
    let target: Double
    let icon: String
    let categoryId: String
    let status: GoalStatus
    let priority: GoalPriority
    let startDate: String
    let dueDate: String
    let progressMode: GoalProgressMode
    let unit: String
    let note: String
}

private struct GoalDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var environment: AppEnvironment
    let goal: GoalRecord
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirmation = false
    @State private var isAddingMilestone = false
    @State private var isShowingProgress = false

    private var currentGoal: GoalRecord { environment.goalsWorkspace.goals.first(where: { $0.id == goal.id }) ?? goal }

    var body: some View {
        NavigationStack {
            ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                Label(currentGoal.title, systemImage: currentGoal.icon)
                    .font(.title2.weight(.bold))
                Text(currentGoal.detail.isEmpty ? "Bez dodatkowego opisu" : currentGoal.detail)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                ProgressView(value: currentGoal.progress)
                    .tint(MoreModule.goals.tint)
                    .accessibilityLabel("Postęp celu")
                    .accessibilityValue("\(currentGoal.progressPercent) procent")
                Text(currentGoal.progressMode == .manual ? "\(currentGoal.progressPercent)%" : "\(Int(currentGoal.current.rounded())) z \(Int(currentGoal.target.rounded())) \(currentGoal.unit)")
                    .font(.subheadline.weight(.semibold))
                HStack {
                    Label("Termin", systemImage: "calendar")
                    Spacer()
                    Text(productivityDate(currentGoal.dueDate))
                }
                .font(.subheadline)
                HStack {
                    Label("Status", systemImage: "circle.fill")
                    Spacer()
                    Text(goalStatusLabel(currentGoal.status))
                }
                if currentGoal.progressMode == .milestones || !currentGoal.milestones.isEmpty {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                        HStack {
                            ModuleSectionTitle(title: "Etapy", systemImage: "checklist")
                            Spacer()
                            Button { isAddingMilestone = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.accessibilityLabel("Dodaj etap celu")
                        }
                        ForEach(currentGoal.milestones) { milestone in
                            Button {
                                Task { await environment.updateGoalMilestone(id: currentGoal.id, milestoneID: milestone.id, done: !milestone.done) }
                            } label: {
                                HStack {
                                    Image(systemName: milestone.done ? "checkmark.circle.fill" : "circle")
                                    VStack(alignment: .leading) {
                                        Text(milestone.title)
                                        Text(milestone.dueDate).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                            .frame(minHeight: 44)
                            .draggable("milestone:\(milestone.id)")
                            .dropDestination(for: String.self) { items, _ in
                                guard let value = items.first, value.hasPrefix("milestone:"), currentGoal.milestones.contains(where: { $0.id == String(value.dropFirst(10)) }) else { return false }
                                Task { await environment.reorderGoalMilestones(id: currentGoal.id, sourceID: String(value.dropFirst(10)), targetID: milestone.id) }
                                return true
                            }
                        }
                    }
                }
                if !currentGoal.linkedTaskIds.isEmpty {
                    Label("Powiązane zadania: \(currentGoal.linkedTaskIds.map(String.init).joined(separator: ", "))", systemImage: "link")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                if !currentGoal.history.isEmpty {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        ModuleSectionTitle(title: "Historia", systemImage: "clock.arrow.circlepath")
                        ForEach(currentGoal.history.suffix(5)) { entry in
                            Text("\(entry.label) · \(entry.createdAt.prefix(10))")
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                    }
                }
                if currentGoal.status != .archived && currentGoal.status != .completed {
                    RootinePrimaryButton("Zapisz postęp", systemImage: "plus.circle") { isShowingProgress = true }
                }
                RootineSecondaryButton("Edytuj cel", systemImage: "pencil") {
                    onEdit()
                    dismiss()
                }
                if currentGoal.status == .archived {
                    RootineSecondaryButton("Przywróć cel", systemImage: "arrow.uturn.backward") {
                        Task { await environment.restoreArchivedGoal(id: currentGoal.id) }
                        dismiss()
                    }
                } else {
                    RootineSecondaryButton("Archiwizuj cel", systemImage: "archivebox") {
                        Task { await environment.archiveGoal(id: currentGoal.id) }
                        dismiss()
                    }
                }
                Button("Usuń cel", role: .destructive) { showDeleteConfirmation = true }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                Spacer()
            }
            .padding(RootineTheme.Spacing.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .background(RootineTheme.ColorToken.canvas)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .navigationTitle("Szczegóły celu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Gotowe") { dismiss() } }
            }
            .sheet(isPresented: $isShowingProgress) { GoalProgressSheet(goal: currentGoal) }
            .sheet(isPresented: $isAddingMilestone) { GoalMilestoneEditorSheet(goalID: currentGoal.id, dueDate: currentGoal.dueDate) }
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

private struct GoalMilestoneEditorSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let goalID: String
    @State private var title = ""
    @State private var date: Date

    init(goalID: String, dueDate: String) {
        self.goalID = goalID
        _date = State(initialValue: rootineDate(from: dueDate) ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nazwa etapu", text: $title, prompt: Text("Nazwa etapu").foregroundColor(RootineTheme.ColorToken.secondaryText))
                DatePicker("Termin", selection: $date, displayedComponents: .date)
            }
            .navigationTitle("Dodaj etap")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") { Task { await environment.addGoalMilestone(id: goalID, title: title, dueDate: RootineDate.localDate(date)); dismiss() } }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: Work

struct WorkModuleContent: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingProjectEditor = false
    @State private var isShowingWorkItemEditor = false
    @State private var editingWorkItem: WorkItem?
    @State private var workItemToDelete: WorkItem?
    @State private var isShowingPriorityEditor = false
    @State private var editingPriority: WorkspaceTask?
    @State private var priorityToDelete: WorkspaceTask?
    @State private var deletedPriority: WorkspaceTask?
    @State private var selectedProjectID: String?
    @State private var selectedStatus: WorkItemStatus?
    @State private var editingProject: WorkProject?
    @State private var projectToDelete: WorkProject?
    @State private var showingPriorities = false

    private var workTasks: [WorkspaceTask] {
        environment.taskWorkspace.tasks.filter { $0.deleted != true && $0.source?.kind == "work" }
    }

    private var workProjects: [WorkProject] {
        environment.workWorkspace.projects.filter { $0.status != .archived }
    }

    private var workItems: [WorkItem] {
        environment.workWorkspace.tasks.sorted { lhs, rhs in
            if lhs.completed != rhs.completed { return !lhs.completed }
            if lhs.priority != rhs.priority { return workPriorityRank(lhs.priority) > workPriorityRank(rhs.priority) }
            return lhs.id < rhs.id
        }
    }

    private func workPriorityRank(_ priority: WorkItemPriority) -> Int {
        switch priority {
        case .urgent: return 4
        case .high: return 3
        case .medium: return 2
        case .low: return 1
        case .none: return 0
        }
    }

    private func workItemMeta(_ item: WorkItem) -> String {
        let projectName = item.projectId.flatMap { projectID in
            workProjects.first(where: { $0.id == projectID })?.name
        }
        let priority = item.priority == .none ? nil : productivityPriority(item.priority)
        return [projectName, priority].compactMap { $0 }.joined(separator: " · ").isEmpty
            ? "Bez projektu"
            : [projectName, priority].compactMap { $0 }.joined(separator: " · ")
    }

    private var isFocusRunning: Bool { focusStartDate != nil }

    private var isFocusPaused: Bool {
        !isFocusRunning && environment.workWorkspace.pausedFocusSessionID != nil
    }

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
        VStack(alignment: .leading, spacing: 22) {
            focusCard
            projectStrip

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Zadania").font(.headline)
                    Text("\(visibleWorkItems.count)").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Spacer()
                    if selectedProjectID != nil {
                        Button("Wszystkie projekty") { selectedProjectID = nil }.font(.caption).frame(minHeight: 44)
                    }
                }
                statusStrip
                if visibleWorkItems.isEmpty {
                    ModuleEmptyCard(title: "Przestrzeń na dobrą pracę", detail: "Dodaj zadanie plusem u góry. Przeciągaj zadania na projekt lub status, aby uporządkować pracę.", systemImage: "checklist", tint: MoreModule.work.tint)
                } else {
                    ForEach(visibleWorkItems) { item in workItemRow(item) }
                }
            }

            DisclosureGroup(isExpanded: $showingPriorities) {
                VStack(spacing: 0) {
                    ForEach(workTasks) { task in
                        HStack(spacing: 10) {
                            Button { Task { await environment.toggleTaskCompletion(id: task.id) } } label: {
                                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(task.done ? RootineTheme.ColorToken.success : MoreModule.work.tint)
                                    .frame(width: 44, height: 44)
                            }
                            .accessibilityLabel(task.done ? "Cofnij ukończenie priorytetu" : "Ukończ priorytet")
                            Button { editingPriority = task } label: {
                                Text(task.text).font(.subheadline).strikethrough(task.done).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button { editingPriority = task } label: { Label("Edytuj", systemImage: "pencil") }
                            Button { Task { await environment.toggleTaskCompletion(id: task.id) } } label: { Label(task.done ? "Cofnij ukończenie" : "Ukończ", systemImage: "checkmark") }
                            Button(role: .destructive) { requestDelete(task) } label: { Label("Usuń", systemImage: "trash") }
                        }
                        .rootineSwipeActions(leadingLabel: task.done ? "Cofnij" : "Ukończ", leadingIcon: "checkmark", onLeading: { Task { await environment.toggleTaskCompletion(id: task.id) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editingPriority = task })
                    }
                    Button { isShowingPriorityEditor = true } label: {
                        Label("Dodaj priorytet", systemImage: "plus").font(.subheadline).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }
                .padding(.top, 8)
            } label: {
                HStack {
                    Label("Priorytety dnia", systemImage: "flag").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(workTasks.filter { !$0.done }.count)").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(minHeight: 44)
            }
            .rootineSurface()

            if !environment.workWorkspace.focusSessions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Historia skupienia").font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("\(rootineFocusTotalMinutes(environment.workWorkspace.focusSessions)) min łącznie").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    ForEach(rootineFocusHistory(environment.workWorkspace.focusSessions, limit: 3)) { session in
                        HStack {
                            Image(systemName: "timer").foregroundStyle(MoreModule.work.tint)
                            Text(productivityDate(String(session.startedAt.prefix(10)))).font(.subheadline)
                            Spacer()
                            Text("\(session.minutes) min").font(.subheadline).monospacedDigit()
                        }
                    }
                }
                .rootineSurface()
            }
        }
        .rootineScreenChrome(title: "Praca", addLabel: "Dodaj zadanie pracy") { isShowingWorkItemEditor = true }
        .task { await environment.recoverFocusSession() }
        .sheet(isPresented: $isShowingProjectEditor) {
            WorkProjectEditorSheet { name, description in
                Task { await environment.addWorkProject(name: name, description: description) }
            }
        }
        .sheet(item: $editingProject) { project in
            WorkProjectEditorSheet(existing: project) { name, description in
                Task { await environment.updateWorkProject(id: project.id, name: name, companyID: project.companyId, description: description, status: project.status, startDate: project.startDate, endDate: project.endDate, note: project.note) }
            }
        }
        .confirmationDialog("Usunąć projekt i jego zadania?", isPresented: Binding(get: { projectToDelete != nil }, set: { if !$0 { projectToDelete = nil } }), titleVisibility: .visible) {
            Button("Usuń projekt", role: .destructive) {
                if let projectToDelete {
                    if selectedProjectID == projectToDelete.id { selectedProjectID = nil }
                    Task { await environment.deleteWorkProject(id: projectToDelete.id) }
                }
                projectToDelete = nil
            }
            Button("Anuluj", role: .cancel) {}
        } message: { Text("Usunięte zostaną także zadania i historia skupienia należące do tego projektu.") }
        .sheet(isPresented: $isShowingWorkItemEditor) {
            WorkItemEditorSheet(projects: workProjects, defaultProjectID: selectedProjectID) { title, projectID, priority, status in
                Task { await environment.addWorkItem(title: title, projectID: projectID, priority: priority, status: status) }
            }
        }
        .sheet(item: $editingWorkItem) { item in
            WorkItemEditorSheet(existing: item, projects: workProjects, allowsProjectChange: !workItems.contains(where: { $0.parentId == item.id })) { title, projectID, priority, status in
                Task { await environment.updateWorkItem(id: item.id, title: title, priority: priority, status: status, projectID: projectID, companyID: projectID == item.projectId ? item.companyId : nil, parentID: projectID == item.projectId ? item.parentId : nil, dueDate: item.dueDate, dueTime: item.dueTime, note: item.note) }
            }
        }
        .confirmationDialog(
            "Usunąć zadanie pracy?",
            isPresented: Binding(get: { workItemToDelete != nil }, set: { if !$0 { workItemToDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Usuń zadanie", role: .destructive) {
                if let workItemToDelete {
                    Task { await environment.deleteWorkItem(id: workItemToDelete.id) }
                }
                workItemToDelete = nil
            }
            Button("Anuluj", role: .cancel) {}
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

    private var visibleWorkItems: [WorkItem] {
        workItems.filter { (selectedProjectID == nil || $0.projectId == selectedProjectID) && (selectedStatus == nil || $0.status == selectedStatus) }
    }

    private var projectStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Projekty").font(.headline)
                Spacer()
                Button { isShowingProjectEditor = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }
                    .accessibilityLabel("Dodaj projekt")
            }
            if workProjects.isEmpty {
                Text("Połącz zadania w projekt, gdy pracujesz nad większym tematem.").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(workProjects) { project in
                            let total = workItems.filter { $0.projectId == project.id }.count
                            let completed = workItems.filter { $0.projectId == project.id && $0.completed }.count
                            Button { selectedProjectID = selectedProjectID == project.id ? nil : project.id } label: {
                                VStack(alignment: .leading, spacing: 9) {
                                    HStack {
                                        Image(systemName: "folder").foregroundStyle(MoreModule.work.tint)
                                        Spacer()
                                        if selectedProjectID == project.id { Image(systemName: "checkmark").font(.caption.weight(.semibold)) }
                                    }
                                    Text(project.name).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                                    Text("\(completed) z \(total) zadań").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    ProgressView(value: total == 0 ? 0 : Double(completed) / Double(total)).tint(MoreModule.work.tint)
                                }
                                .padding(14).frame(width: 172, alignment: .leading)
                                .background(selectedProjectID == project.id ? MoreModule.work.tint.opacity(0.15) : RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("work.project.\(project.id)")
                            .contextMenu {
                                Button { editingProject = project } label: { Label("Edytuj projekt", systemImage: "pencil") }
                                Button(role: .destructive) { projectToDelete = project } label: { Label("Usuń projekt", systemImage: "trash") }
                            }
                            .dropDestination(for: String.self) { items, _ in
                                guard let item = droppedWorkItem(items), !workItems.contains(where: { $0.parentId == item.id }) else { return false }
                                moveWorkItem(item, projectID: project.id, status: item.status)
                                return true
                            }
                        }
                    }
                }
            }
        }
    }

    private var statusStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { selectedStatus = nil } label: {
                    Text("Wszystkie").font(.caption.weight(.semibold)).padding(.horizontal, 13).frame(minHeight: 44)
                }
                .background(selectedStatus == nil ? MoreModule.work.tint.opacity(0.18) : RootineTheme.ColorToken.surface, in: Capsule())
                ForEach(WorkItemStatus.allCases, id: \.self) { status in
                    Button { selectedStatus = selectedStatus == status ? nil : status } label: {
                        Text(productivityStatus(status)).font(.caption.weight(.semibold)).padding(.horizontal, 13).frame(minHeight: 44)
                    }
                    .background(selectedStatus == status ? MoreModule.work.tint.opacity(0.18) : RootineTheme.ColorToken.surface, in: Capsule())
                    .dropDestination(for: String.self) { items, _ in
                        guard let item = droppedWorkItem(items) else { return false }
                        moveWorkItem(item, projectID: item.projectId, status: status)
                        return true
                    }
                    .accessibilityIdentifier("work.status.\(status.rawValue)")
                }
            }
            .buttonStyle(.plain)
        }
    }

    private func workItemRow(_ item: WorkItem) -> some View {
        HStack(spacing: 10) {
            Button { Task { await environment.toggleWorkItemCompletion(id: item.id) } } label: {
                Image(systemName: item.completed ? "checkmark.circle.fill" : "circle")
                    .font(.title3).foregroundStyle(item.completed ? RootineTheme.ColorToken.success : MoreModule.work.tint)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(item.completed ? "Cofnij ukończenie zadania" : "Ukończ zadanie")
            Button { editingWorkItem = item } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.title).font(.subheadline.weight(.semibold)).strikethrough(item.completed).lineLimit(3)
                    Text(workItemMeta(item)).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text(productivityStatus(item.status)).font(.caption2).foregroundStyle(item.status == .blocked ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        .padding(.vertical, 12).padding(.trailing, 14).padding(.leading, 4)
        .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))
        .opacity(item.completed ? 0.65 : 1)
        .contextMenu {
            Button { editingWorkItem = item } label: { Label("Edytuj", systemImage: "pencil") }
            Button { Task { await environment.toggleWorkItemCompletion(id: item.id) } } label: { Label(item.completed ? "Cofnij ukończenie" : "Ukończ", systemImage: "checkmark") }
            if !isFocusRunning && !isFocusPaused && !item.completed {
                Button { Task { await environment.startFocusSession(projectID: item.projectId, taskID: item.id) } } label: { Label("Skup się na zadaniu", systemImage: "timer") }
            }
            Menu("Zmień status") {
                ForEach(WorkItemStatus.allCases, id: \.self) { status in
                    Button(productivityStatus(status)) { moveWorkItem(item, projectID: item.projectId, status: status) }
                }
            }
            if !workItems.contains(where: { $0.parentId == item.id }) {
                Menu("Przenieś do projektu") {
                    Button("Bez projektu") { moveWorkItem(item, projectID: nil, status: item.status) }
                    ForEach(workProjects) { project in Button(project.name) { moveWorkItem(item, projectID: project.id, status: item.status) } }
                }
            }
            Button(role: .destructive) { workItemToDelete = item } label: { Label("Usuń", systemImage: "trash") }
        }
        .rootineSwipeActions(leadingLabel: item.completed ? "Cofnij" : "Ukończ", leadingIcon: "checkmark", onLeading: { Task { await environment.toggleWorkItemCompletion(id: item.id) } }, trailingLabel: "Edytuj", trailingIcon: "pencil", onTrailing: { editingWorkItem = item })
        .draggable("work-item:\(item.id)")
        .accessibilityIdentifier("work.item.\(item.id)")
    }

    private var focusCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Skupienie", systemImage: "timer").font(.subheadline.weight(.semibold))
                    if isFocusRunning {
                        TimelineView(.periodic(from: .now, by: 1)) { timeline in
                            Text(elapsedText(at: timeline.date)).font(.title2.weight(.semibold)).monospacedDigit()
                        }
                    } else {
                        Text(isFocusPaused ? "Sesja wstrzymana" : "Czas na jeden konkretny krok").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    if let id = environment.workWorkspace.activeFocusTaskID, let task = workItems.first(where: { $0.id == id }) {
                        Text(task.title).font(.caption).lineLimit(2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                Spacer(minLength: 0)
                if !hasCorruptFocusSession {
                    Button {
                        Task {
                            if isFocusRunning { await environment.pauseFocusSession() }
                            else if isFocusPaused { await environment.resumeFocusSession() }
                            else { await environment.startFocusSession(projectID: selectedProjectID) }
                        }
                    } label: { Image(systemName: isFocusRunning ? "pause.fill" : "play.fill").font(.headline).frame(width: 48, height: 48) }
                    .buttonStyle(.borderedProminent).tint(MoreModule.work.tint).clipShape(Circle())
                    .accessibilityLabel(isFocusRunning ? "Wstrzymaj skupienie" : isFocusPaused ? "Wznów skupienie" : "Rozpocznij skupienie")
                    .accessibilityIdentifier("work.focus.toggle")
                }
            }
            if hasCorruptFocusSession {
                Text("Nie udało się odczytać czasu sesji.").font(.caption).foregroundStyle(RootineTheme.ColorToken.warning)
                Button("Wyczyść uszkodzoną sesję", role: .destructive) { Task { await environment.resetFocusSession() } }.frame(minHeight: 44)
            } else if isFocusRunning || isFocusPaused {
                Button("Zakończ sesję") { Task { await environment.stopFocusSession() } }.font(.caption.weight(.semibold)).frame(minHeight: 44)
            }
        }
        .rootineSurface()
    }

    private func droppedWorkItem(_ items: [String]) -> WorkItem? {
        guard let value = items.first, value.hasPrefix("work-item:") else { return nil }
        return workItems.first { $0.id == String(value.dropFirst(10)) }
    }

    private func moveWorkItem(_ item: WorkItem, projectID: String?, status: WorkItemStatus) {
        Task {
            await environment.updateWorkItem(id: item.id, title: item.title, priority: item.priority, status: status,
                projectID: projectID, companyID: projectID == item.projectId ? item.companyId : nil,
                parentID: projectID == item.projectId ? item.parentId : nil, dueDate: item.dueDate, dueTime: item.dueTime, note: item.note)
        }
    }

    private func requestDelete(_ task: WorkspaceTask) {
        priorityToDelete = task
    }
}

private struct WorkProjectEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: WorkProject?
    let onSave: (String, String) -> Void
    @State private var name: String
    @State private var description: String

    init(existing: WorkProject? = nil, onSave: @escaping (String, String) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _name = State(initialValue: existing?.name ?? "")
        _description = State(initialValue: existing?.description ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Projekt") {
                    TextField("Nazwa projektu", text: $name, prompt: Text("Nazwa projektu").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Opis (opcjonalnie)", text: $description, prompt: Text("Opis (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(existing == nil ? "Dodaj projekt" : "Edytuj projekt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(name, description)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct WorkItemEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: WorkItem?
    let projects: [WorkProject]
    let allowsProjectChange: Bool
    let onSave: (String, String?, WorkItemPriority, WorkItemStatus) -> Void
    @State private var title: String
    @State private var projectID: String
    @State private var priority: WorkItemPriority
    @State private var status: WorkItemStatus

    init(existing: WorkItem? = nil, projects: [WorkProject], defaultProjectID: String? = nil, allowsProjectChange: Bool = true, onSave: @escaping (String, String?, WorkItemPriority, WorkItemStatus) -> Void) {
        self.existing = existing
        self.projects = projects
        self.allowsProjectChange = allowsProjectChange
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _projectID = State(initialValue: existing?.projectId ?? defaultProjectID ?? "")
        _priority = State(initialValue: existing?.priority ?? .none)
        _status = State(initialValue: existing?.status ?? .todo)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Zadanie") {
                    TextField("Co trzeba zrobić?", text: $title, prompt: Text("Co trzeba zrobić?").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
                        .lineLimit(2...4)
                    Picker("Projekt", selection: $projectID) {
                        Text("Bez projektu").tag("")
                        ForEach(projects) { project in
                            Text(project.name).tag(project.id)
                        }
                    }
                    .disabled(!allowsProjectChange)
                    if !allowsProjectChange {
                        Text("Zadanie z podzadaniami pozostaje w swoim projekcie.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Picker("Priorytet", selection: $priority) {
                        ForEach(WorkItemPriority.allCases, id: \.self) { value in
                            Text(workItemPriorityLabel(value)).tag(value)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(WorkItemStatus.allCases, id: \.self) { value in
                            Text(workItemStatusLabel(value)).tag(value)
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "Dodaj zadanie" : "Edytuj zadanie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        onSave(title, projectID.isEmpty ? nil : projectID, priority, status)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func workItemPriorityLabel(_ value: WorkItemPriority) -> String {
        switch value {
        case .none: return "Brak"
        case .low: return "Niski"
        case .medium: return "Średni"
        case .high: return "Wysoki"
        case .urgent: return "Pilny"
        }
    }

    private func workItemStatusLabel(_ value: WorkItemStatus) -> String {
        switch value {
        case .todo: return "Do zrobienia"
        case .inProgress: return "W toku"
        case .blocked: return "Zablokowane"
        case .waiting: return "Oczekuje"
        case .completed: return "Ukończone"
        case .cancelled: return "Anulowane"
        }
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
                    TextField("Co jest najważniejsze?", text: $title, prompt: Text("Co jest najważniejsze?").foregroundColor(RootineTheme.ColorToken.secondaryText), axis: .vertical)
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

private func productivityPriority(_ value: WorkItemPriority) -> String {
    switch value {
    case .none: return "Bez priorytetu"
    case .low: return "Niski priorytet"
    case .medium: return "Średni priorytet"
    case .high: return "Wysoki priorytet"
    case .urgent: return "Pilne"
    }
}

private func productivityStatus(_ value: WorkItemStatus) -> String {
    switch value {
    case .todo: return "Do zrobienia"
    case .inProgress: return "W toku"
    case .blocked: return "Zablokowane"
    case .waiting: return "Oczekuje"
    case .completed: return "Ukończone"
    case .cancelled: return "Anulowane"
    }
}
