import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var selectedDate = Date()

    private var selectedDateKey: String {
        RootineDate.localDate(selectedDate)
    }

    private var tasks: [WorkspaceTask] {
        let today = RootineDate.localDate()
        return environment.taskWorkspace.tasks
            .filter { task in
                guard task.deleted != true else { return false }
                return task.calendarDate == selectedDateKey
                    || (selectedDateKey == today && task.calendarDate == nil && task.view == "dzis")
            }
            .sorted { lhs, rhs in
                switch (lhs.done, rhs.done) {
                case (false, true): return true
                case (true, false): return false
                default:
                    switch (lhs.time, rhs.time) {
                    case let (left?, right?) where left != right: return left < right
                    case (_?, nil): return true
                    case (nil, _?): return false
                    default: return lhs.id < rhs.id
                    }
                }
            }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                DatePicker("Wybierz dzień", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .accessibilityLabel("Wybierz dzień")
                    .tint(RootineTheme.ColorToken.action)
                    .padding(.horizontal, RootineTheme.Spacing.small)
                    .rootineSurface()

                HStack {
                    Label("\(tasks.count) zadań", systemImage: "checklist")
                    Spacer()
                    Text(selectedDateKey == RootineDate.localDate() ? "Dzisiaj" : shortCalendarDate(selectedDate))
                        .foregroundStyle(RootineTheme.ColorToken.action)
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

                if tasks.isEmpty {
                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                        Image(systemName: "calendar.badge.plus")
                            .font(.title2)
                            .foregroundStyle(RootineTheme.ColorToken.action)
                        Text("Brak zadań na ten dzień")
                            .font(.headline)
                            .foregroundStyle(RootineTheme.ColorToken.primaryText)
                        Text("Dodaj zadanie przyciskiem +, aby zaplanować ten dzień.")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .rootineSurface()
                } else {
                    CalendarTaskCard(tasks: tasks) { task in
                        Task { await environment.toggleTaskCompletion(id: task.id, on: selectedDate) }
                    }
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
            .animation(.spring(response: 0.38, dampingFraction: 0.84), value: tasks)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }
}

private struct CalendarTaskCard: View {
    let tasks: [WorkspaceTask]
    let onToggle: (WorkspaceTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Label("Plan dnia", systemImage: "calendar")
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
                .padding(.bottom, RootineTheme.Spacing.small)

            ForEach(tasks) { task in
                HStack(spacing: RootineTheme.Spacing.small) {
                    Button { onToggle(task) } label: {
                        Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(task.done ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.action)
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                        Text(task.text)
                            .font(.body.weight(.medium))
                            .foregroundStyle(task.done ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            .strikethrough(task.done)
                            .lineLimit(3)
                        if let time = task.time {
                            Label(time, systemImage: "clock")
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                    }
                    Spacer(minLength: 0)
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

private func shortCalendarDate(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date)
}
