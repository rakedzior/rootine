import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selectedDate = Date()
    @State private var undoMessage: String?
    @State private var selectedTask: WorkspaceTask?
    @State private var isShowingAddTask = false
    @State private var isShowingDatePicker = false
    @State private var showsCompleted = false
    @State private var undoAction: RootineTaskUndo?

    private var selectedDateKey: String { RootineDate.localDate(selectedDate) }
    private var occurrences: [RootineCalendarOccurrence] {
        let projected = rootineTaskOccurrences(environment.taskWorkspace.tasks, from: selectedDateKey, through: selectedDateKey)
        let projectedIDs = Set(projected.map(\.sourceTaskID))
        let undatedToday = selectedDateKey == RootineDate.localDate()
            ? environment.taskWorkspace.tasks.filter { $0.deleted != true && $0.calendarDate == nil && $0.view == "dzis" && !projectedIDs.contains($0.id) }
                .map { RootineCalendarOccurrence(key: "task:\($0.id)@\(selectedDateKey)", task: $0, calendarDate: selectedDateKey, isVirtual: false) }
            : []
        return (projected + undatedToday).sorted(by: calendarTaskSort)
    }
    private var allDay: [RootineCalendarOccurrence] { occurrences.filter { !$0.isDone && $0.time == nil } }
    private var timed: [RootineCalendarOccurrence] { occurrences.filter { !$0.isDone && $0.time != nil } }
    private var completed: [RootineCalendarOccurrence] { occurrences.filter(\.isDone) }
    private var weekDates: [Date] {
        let start = Calendar.current.dateInterval(of: .weekOfYear, for: selectedDate)?.start ?? selectedDate
        return (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
    }

    var body: some View {
        VStack(spacing: 0) {
            CalendarDateNavigation(
                selectedDate: selectedDate,
                onPrevious: { moveDay(-1) }, onNext: { moveDay(1) },
                onToday: { select(Date()) }, onSelectMonth: { isShowingDatePicker = true }
            )
            CalendarWeekStrip(selectedDate: $selectedDate, dates: weekDates)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                    syncState
                    CalendarDaySummary(date: selectedDate, activeCount: allDay.count + timed.count) { isShowingAddTask = true }
                    if occurrences.isEmpty {
                        RootineEmptyState(title: "Brak planów", message: "Ten dzień jest wolny. Dodaj zadanie, gdy pojawi się następny krok.", systemImage: "calendar.badge.plus", actionTitle: "Dodaj zadanie") { isShowingAddTask = true }
                            .rootineSurface()
                    } else {
                        if !allDay.isEmpty { CalendarAgendaSection(title: "Cały dzień", image: "sun.max", occurrences: allDay, onToggle: toggle, onSelect: open) }
                        if !timed.isEmpty { CalendarAgendaSection(title: "Godzinowe", image: "clock", occurrences: timed, onToggle: toggle, onSelect: open) }
                        if !completed.isEmpty { CalendarCompletedSection(occurrences: completed, expanded: $showsCompleted, onToggle: toggle, onSelect: open) }
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.top, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.xLarge)
                .animation(reduceMotion ? nil : .snappy(duration: 0.22), value: selectedDateKey)
            }
            .scrollIndicators(.hidden)
            .refreshable { await environment.flushPendingMutations() }
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .alert("Nie można cofnąć", isPresented: Binding(
            get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let undoAction {
                RootineUndoBanner(message: "Zmieniono wykonanie zadania", usesAdaptiveLayout: true) {
                    self.undoAction = nil
                    Task {
                        if !(await environment.restoreTaskSnapshot(undoAction.snapshot, ifCurrentMatches: undoAction.expectedCurrent)) {
                            undoMessage = "Dane zadania zmieniły się od tej akcji. Nowsze zmiany zostały zachowane."
                        }
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.vertical, RootineTheme.Spacing.small)
                .background(RootineTheme.ColorToken.canvas)
            }
        }
        .sheet(isPresented: $isShowingDatePicker) {
            CalendarDatePickerSheet(selectedDate: $selectedDate)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isShowingAddTask) {
            AddTaskSheet(initialDate: selectedDate)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedTask) { TaskDetailSheet(task: $0, completionDate: selectedDate).presentationDetents([.medium, .large]).presentationDragIndicator(.visible) }
        .onAppear { environment.setCalendarQuickAddDate(selectedDate) }
        .onChange(of: selectedDate) { _, value in environment.setCalendarQuickAddDate(value) }
        .onChange(of: environment.taskWorkspace) { _, workspace in
            guard let undoAction,
                  let current = workspace.tasks.first(where: { $0.id == undoAction.snapshot.id })
            else {
                self.undoAction = nil
                return
            }
            if current != undoAction.expectedCurrent { self.undoAction = nil }
        }
    }

    @ViewBuilder private var syncState: some View {
        if environment.isLaunching { ProgressView("Wczytuję kalendarz…").frame(maxWidth: .infinity).padding(.vertical, RootineTheme.Spacing.large) }
        if case .conflict = environment.workspaceSyncStatus {
            RootineErrorState(title: "Konflikt synchronizacji", message: "Zmiany są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.") { Task { await environment.flushPendingMutations() } }
        } else if case .localOnly = environment.workspaceSyncStatus { RootineOfflineBanner() }
    }
    private func open(_ occurrence: RootineCalendarOccurrence) { selectedTask = occurrence.task }
    private func toggle(_ occurrence: RootineCalendarOccurrence) {
        let date = selectedDate
        Task {
            await environment.toggleTaskCompletion(id: occurrence.sourceTaskID, on: date) { mutation in
                undoAction = mutation
            }
        }
    }
    private func moveDay(_ offset: Int) { select(Calendar.current.date(byAdding: .day, value: offset, to: selectedDate) ?? selectedDate) }
    private func select(_ date: Date) {
        showsCompleted = false
        if reduceMotion { selectedDate = date } else { withAnimation(.snappy(duration: 0.22)) { selectedDate = date } }
    }
}

private struct CalendarDateNavigation: View {
    let selectedDate: Date
    let onPrevious: () -> Void; let onNext: () -> Void; let onToday: () -> Void; let onSelectMonth: () -> Void
    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onPrevious) { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityIdentifier("calendar.previousDay").accessibilityLabel("Poprzedni dzień")
            Button(action: onSelectMonth) {
                VStack(spacing: 1) { Text(calendarMonthTitle(selectedDate)).font(.headline); Text(calendarShortDate(selectedDate)).font(.caption.monospacedDigit()) }
                    .foregroundStyle(RootineTheme.ColorToken.primaryText).multilineTextAlignment(.center).frame(maxWidth: .infinity, minHeight: 44)
            }.buttonStyle(.plain).accessibilityLabel("Wybierz miesiąc i dzień").accessibilityValue(calendarLongDate(selectedDate))
            Button(action: onNext) { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityIdentifier("calendar.nextDay").accessibilityLabel("Następny dzień")
            Button("Dziś", action: onToday).font(.subheadline.weight(.semibold)).frame(minWidth: 44, minHeight: 44).foregroundStyle(RootineTheme.ColorToken.action).accessibilityIdentifier("calendar.today").accessibilityLabel("Przejdź do dzisiaj")
        }.padding(.horizontal, RootineTheme.Spacing.medium).padding(.vertical, RootineTheme.Spacing.xSmall).background(RootineTheme.ColorToken.surface)
    }
}

private struct CalendarDatePickerSheet: View {
    @Binding var selectedDate: Date
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            DatePicker("Wybierz miesiąc i dzień", selection: $selectedDate, displayedComponents: .date).datePickerStyle(.graphical).labelsHidden().tint(RootineTheme.ColorToken.action).padding(RootineTheme.Spacing.medium)
                .navigationTitle("Wybierz datę").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gotowe") { dismiss() } } }
        }.preferredColorScheme(.dark)
    }
}

private struct CalendarWeekStrip: View {
    @Binding var selectedDate: Date; let dates: [Date]
    private let calendar = Calendar.current
    private let formatter: DateFormatter = { let value = DateFormatter(); value.locale = Locale(identifier: "pl_PL"); value.dateFormat = "EEEEE"; return value }()
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: RootineTheme.Spacing.xSmall) {
                    ForEach(dates, id: \.self) { date in
                        let selected = calendar.isDate(date, inSameDayAs: selectedDate)
                        Button { selectedDate = date } label: {
                            VStack(spacing: 2) { Text(formatter.string(from: date).uppercased()).font(.caption2.weight(.semibold)); Text(calendar.component(.day, from: date), format: .number).font(.subheadline.weight(.bold).monospacedDigit()) }
                                .frame(minWidth: 44, minHeight: 56).foregroundStyle(selected ? Color.white : RootineTheme.ColorToken.primaryText).background(selected ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.surface).clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                        }.buttonStyle(.plain).accessibilityLabel(calendarLongDate(date)).accessibilityAddTraits(selected ? .isSelected : [])
                        .id(RootineDate.localDate(date))
                    }
                }
            }
            .scrollIndicators(.hidden)
            .onChange(of: RootineDate.localDate(selectedDate), initial: true) { _, day in
                guard dates.contains(where: { RootineDate.localDate($0) == day }) else { return }
                // The row IDs use the same local day key, never a Date with
                // a different time of day. Scrolling adds no animation.
                proxy.scrollTo(day, anchor: .center)
            }
        }
        .padding(.horizontal, RootineTheme.Spacing.medium)
        .padding(.vertical, RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.canvas)
    }
}

private struct CalendarDaySummary: View {
    let date: Date; let activeCount: Int; let onAdd: () -> Void
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: RootineTheme.Spacing.medium) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(calendarLongDate(date)).font(.title3.weight(.bold)).foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(activeCount == 0 ? "Spokojny dzień" : "\(activeCount) \(polishTaskCount(activeCount)) do zrobienia").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer(minLength: RootineTheme.Spacing.small)
            Button(action: onAdd) { Image(systemName: "plus").frame(width: 44, height: 44).background(RootineTheme.ColorToken.action.opacity(0.12)).clipShape(Circle()) }.buttonStyle(.plain).foregroundStyle(RootineTheme.ColorToken.action).accessibilityIdentifier("calendar.addTask").accessibilityLabel("Dodaj zadanie")
        }
    }
}

private struct CalendarAgendaSection: View {
    let title: String; let image: String; let occurrences: [RootineCalendarOccurrence]; let onToggle: (RootineCalendarOccurrence) -> Void; let onSelect: (RootineCalendarOccurrence) -> Void
    var body: some View { VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) { Label(title, systemImage: image).font(.caption.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.secondaryText); CalendarAgendaRows(occurrences: occurrences, onToggle: onToggle, onSelect: onSelect) } }
}

private struct CalendarCompletedSection: View {
    let occurrences: [RootineCalendarOccurrence]; @Binding var expanded: Bool; let onToggle: (RootineCalendarOccurrence) -> Void; let onSelect: (RootineCalendarOccurrence) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            Button { expanded.toggle() } label: { HStack { Label("Ukończone (\(occurrences.count))", systemImage: "checkmark.circle"); Spacer(); Image(systemName: expanded ? "chevron.up" : "chevron.down") }.font(.caption.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.secondaryText).frame(minHeight: 44) }
                .buttonStyle(.plain).accessibilityLabel(expanded ? "Zwiń ukończone zadania" : "Rozwiń ukończone zadania")
            if expanded { CalendarAgendaRows(occurrences: occurrences, onToggle: onToggle, onSelect: onSelect) }
        }
    }
}

private struct CalendarAgendaRows: View {
    let occurrences: [RootineCalendarOccurrence]; let onToggle: (RootineCalendarOccurrence) -> Void; let onSelect: (RootineCalendarOccurrence) -> Void
    var body: some View {
        VStack(spacing: 0) { ForEach(occurrences) { occurrence in CalendarAgendaRow(occurrence: occurrence, onToggle: { onToggle(occurrence) }, onSelect: { onSelect(occurrence) }); if occurrence.id != occurrences.last?.id { Divider().overlay(RootineTheme.ColorToken.separator) } } }.rootineSurface()
    }
}

private struct CalendarAgendaRow: View {
    let occurrence: RootineCalendarOccurrence; let onToggle: () -> Void; let onSelect: () -> Void
    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onToggle) { Image(systemName: occurrence.isDone ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(occurrence.isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action).frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel(occurrence.isDone ? "Oznacz \(occurrence.title) jako niewykonane" : "Oznacz \(occurrence.title) jako wykonane")
            Button(action: onSelect) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) { Text(occurrence.title).font(.body.weight(.medium)).foregroundStyle(occurrence.isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText).strikethrough(occurrence.isDone).multilineTextAlignment(.leading); Label(occurrence.time ?? "Cały dzień", systemImage: occurrence.time == nil ? "sun.max" : "clock").font(.caption.monospacedDigit()).foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                    Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }.frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("calendar.task.\(occurrence.sourceTaskID)").accessibilityLabel("Szczegóły zadania: \(occurrence.title), ID \(occurrence.sourceTaskID)").accessibilityHint("Otwiera edycję i zmianę terminu")
        }
        .contentShape(Rectangle())
        .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { value in if value.translation.width > 72 && abs(value.translation.width) > abs(value.translation.height) { onToggle() } })
        .accessibilityAction(named: occurrence.isDone ? "Oznacz jako niewykonane" : "Oznacz jako wykonane") { onToggle() }
    }
}

private func calendarMonthTitle(_ date: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "pl_PL"); f.dateFormat = "LLLL yyyy"; return f.string(from: date).capitalized }
private func calendarShortDate(_ date: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "pl_PL"); f.dateFormat = "d MMM"; return f.string(from: date) }
private func calendarLongDate(_ date: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "pl_PL"); f.dateFormat = "EEEE, d MMMM"; return f.string(from: date).capitalized }
private func polishTaskCount(_ count: Int) -> String { switch count { case 1: return "zadanie"; case 2...4: return "zadania"; default: return "zadań" } }
private func calendarTaskSort(_ lhs: RootineCalendarOccurrence, _ rhs: RootineCalendarOccurrence) -> Bool {
    switch (lhs.isDone, rhs.isDone) { case (false, true): return true; case (true, false): return false; default: switch (lhs.time, rhs.time) { case let (left?, right?) where left != right: return left < right; case (_?, nil): return true; case (nil, _?): return false; default: return lhs.sourceTaskID < rhs.sourceTaskID } }
}
