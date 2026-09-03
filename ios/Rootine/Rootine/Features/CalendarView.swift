import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selectedDate = Date()
    @State private var selectedTask: WorkspaceTask?
    @State private var isShowingAddTask = false

    private var selectedDateKey: String { RootineDate.localDate(selectedDate) }
    private var isCompactHeight: Bool { verticalSizeClass == .compact }

    private var tasks: [RootineCalendarOccurrence] {
        let today = RootineDate.localDate()
        let projected = rootineTaskOccurrences(
            environment.taskWorkspace.tasks,
            from: selectedDateKey,
            through: selectedDateKey
        )
        let projectedIDs = Set(projected.map(\.sourceTaskID))
        let undatedToday = selectedDateKey == today
            ? environment.taskWorkspace.tasks
                .filter { $0.deleted != true && $0.calendarDate == nil && $0.view == "dzis" && !projectedIDs.contains($0.id) }
                .map { RootineCalendarOccurrence(key: "task:\($0.id)@\(selectedDateKey)", task: $0, calendarDate: selectedDateKey, isVirtual: false) }
            : []
        return (projected + undatedToday).sorted(by: calendarTaskSort)
    }

    private var weekDates: [Date] {
        let calendar = Calendar.current
        let start = calendar.dateInterval(of: .weekOfYear, for: selectedDate)?.start ?? selectedDate
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    var body: some View {
        VStack(spacing: 0) {
            CalendarDateNavigation(
                selectedDate: $selectedDate,
                isCompactHeight: isCompactHeight,
                onPrevious: movePreviousDay,
                onNext: moveNextDay,
                onToday: { selectedDate = Date() }
            )

            if !isCompactHeight {
                DatePicker("Wybierz miesiąc i dzień", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .tint(RootineTheme.ColorToken.action)
                    .padding(.horizontal, RootineTheme.Spacing.small)
                    .padding(.bottom, RootineTheme.Spacing.small)
                    .accessibilityLabel("Wybierz miesiąc i dzień")
            }

            CalendarWeekStrip(selectedDate: $selectedDate, dates: weekDates)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    if environment.isLaunching {
                        ProgressView("Wczytuję kalendarz…")
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

                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                            Text(selectedDateKey == RootineDate.localDate() ? "Dzisiaj" : calendarLongDate(selectedDate))
                                .font(.title3.weight(.bold))
                                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                            Text(tasks.isEmpty ? "Spokojny dzień" : "\(tasks.count) \(polishTaskCount(tasks.count)) w agendzie")
                                .font(.subheadline)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        Spacer()
                        Button {
                            isShowingAddTask = true
                        } label: {
                            Image(systemName: "plus")
                                .frame(width: 44, height: 44)
                                .background(RootineTheme.ColorToken.action.opacity(0.12))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(RootineTheme.ColorToken.action)
                        .accessibilityLabel("Dodaj zadanie")
                    }

                    if tasks.isEmpty {
                        RootineEmptyState(
                            title: "Brak zadań na ten dzień",
                            message: "Dodaj następny krok albo wybierz inny dzień w kalendarzu.",
                            systemImage: "calendar.badge.plus",
                            actionTitle: "Dodaj zadanie",
                            action: { isShowingAddTask = true }
                        )
                        .rootineSurface()
                    } else {
                        CalendarTaskCard(
                            tasks: tasks,
                            onToggle: toggle,
                            onSelect: { selectedTask = $0.task }
                        )
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.top, RootineTheme.Spacing.small)
                .padding(.bottom, RootineTheme.Spacing.xLarge)
                .animation(reduceMotion ? nil : .snappy(duration: 0.24), value: tasks)
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
        .sheet(item: $selectedTask) { task in
            TaskDetailSheet(task: task, completionDate: selectedDate)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func toggle(_ occurrence: RootineCalendarOccurrence) {
        Task { await environment.toggleTaskCompletion(id: occurrence.sourceTaskID, on: selectedDate) }
    }

    private func movePreviousDay() {
        withOptionalAnimation { selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? selectedDate }
    }

    private func moveNextDay() {
        withOptionalAnimation { selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? selectedDate }
    }

    private func withOptionalAnimation(_ update: () -> Void) {
        if reduceMotion { update() } else { withAnimation(.snappy(duration: 0.24), update) }
    }
}

private struct CalendarDateNavigation: View {
    @Binding var selectedDate: Date
    let isCompactHeight: Bool
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onToday: () -> Void

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Poprzedni dzień")

            VStack(spacing: 2) {
                Text(calendarMonthTitle(selectedDate))
                    .font(.headline)
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                if isCompactHeight {
                    Text(calendarLongDate(selectedDate))
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            .frame(maxWidth: .infinity)

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Następny dzień")

            Button("Dziś", action: onToday)
                .font(.subheadline.weight(.semibold))
                .frame(minWidth: 44, minHeight: 44)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityLabel("Przejdź do dzisiaj")
        }
        .padding(.horizontal, RootineTheme.Spacing.medium)
        .padding(.vertical, RootineTheme.Spacing.xSmall)
        .background(RootineTheme.ColorToken.surface)
    }
}

private struct CalendarWeekStrip: View {
    @Binding var selectedDate: Date
    let dates: [Date]
    private let calendar = Calendar.current
    private let weekdayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pl_PL")
        formatter.dateFormat = "EEEEE"
        return formatter
    }()

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.xSmall) {
            ForEach(dates, id: \.self) { date in
                let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
                Button {
                    selectedDate = date
                } label: {
                    VStack(spacing: RootineTheme.Spacing.xSmall) {
                        Text(weekdayFormatter.string(from: date).uppercased())
                            .font(.caption2.weight(.semibold))
                        Text(calendar.component(.day, from: date), format: .number)
                            .font(.subheadline.weight(.bold).monospacedDigit())
                    }
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .foregroundStyle(isSelected ? Color.white : RootineTheme.ColorToken.primaryText)
                    .background(isSelected ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.surface)
                    .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(calendarLongDate(date))
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.horizontal, RootineTheme.Spacing.medium)
        .padding(.vertical, RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.canvas)
    }
}

private struct CalendarTaskCard: View {
    let tasks: [RootineCalendarOccurrence]
    let onToggle: (RootineCalendarOccurrence) -> Void
    let onSelect: (RootineCalendarOccurrence) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Label("Agenda dnia", systemImage: "list.bullet.rectangle")
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .padding(.bottom, RootineTheme.Spacing.small)

            ForEach(tasks) { occurrence in
                HStack(spacing: RootineTheme.Spacing.small) {
                    Button { onToggle(occurrence) } label: {
                        Image(systemName: occurrence.isDone ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(occurrence.isDone ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(occurrence.isDone ? "Oznacz \(occurrence.title) jako niewykonane" : "Oznacz \(occurrence.title) jako wykonane")

                    Button { onSelect(occurrence) } label: {
                        HStack(spacing: RootineTheme.Spacing.small) {
                            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                                Text(occurrence.title)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(occurrence.isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                                    .strikethrough(occurrence.isDone)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                                if let time = occurrence.time {
                                    Label(time, systemImage: "clock")
                                        .font(.caption)
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                } else {
                                    Text("Cały dzień")
                                        .font(.caption)
                                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
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
                    .accessibilityLabel("Szczegóły zadania: \(occurrence.title)")
                    .accessibilityHint("Otwiera edycję i zmianę terminu")
                }
                if occurrence.id != tasks.last?.id { Divider().overlay(RootineTheme.ColorToken.separator) }
            }
        }
        .rootineSurface()
    }
}

private func calendarMonthTitle(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "LLLL yyyy"
    return formatter.string(from: date).capitalized
}

private func calendarLongDate(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "EEEE, d MMMM"
    return formatter.string(from: date).capitalized
}

private func polishTaskCount(_ count: Int) -> String {
    switch count {
    case 1: return "zadanie"
    case 2...4: return "zadania"
    default: return "zadań"
    }
}

private func calendarTaskSort(_ lhs: RootineCalendarOccurrence, _ rhs: RootineCalendarOccurrence) -> Bool {
    switch (lhs.isDone, rhs.isDone) {
    case (false, true): return true
    case (true, false): return false
    default:
        switch (lhs.time, rhs.time) {
        case let (left?, right?) where left != right: return left < right
        case (_?, nil): return true
        case (nil, _?): return false
        default: return lhs.sourceTaskID < rhs.sourceTaskID
        }
    }
}
